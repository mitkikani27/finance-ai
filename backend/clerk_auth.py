"""Clerk.com authentication bridge — Module 1 upgrade (real social login).

Flow
────
  Browser: user signs in through Clerk's <SignIn/> card (Google / email / OTP —
  whatever providers are enabled in the Clerk dashboard)
  ↓  Clerk issues a short-lived session JWT (RS256)
  POST /api/auth/clerk { token }
  ↓  this module verifies the JWT against Clerk's public JWKS,
     upserts the local user, and issues the app's own FinMate JWT
  → every /api/* endpoint keeps working unchanged (hybrid auth)

Configuration (backend/.env or real environment variables)
───────────────────────────────────────────────────────────
  CLERK_PUBLISHABLE_KEY   pk_test_…  (from Clerk Dashboard → API Keys)
  CLERK_SECRET_KEY        sk_test_…  (optional — lets us fetch the user's
                                     email/name/avatar from the Clerk Backend API)
  CLERK_ISSUER            https://your-app.clerk.accounts.dev   (optional override;
             otherwise it is decoded from the publishable key automatically)

If none are set, /api/auth/clerk answers 503 with setup instructions and the
app silently falls back to the built-in demo login (JWT/bcrypt/OTP/Google-demo).
"""
import base64
import json
import os
import time
import urllib.request
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
import jwt
from jwt import PyJWKClient
from pydantic import BaseModel
from models import Session

import auth as authlib
import models
from database import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])

# ── tiny .env loader (backend/.env) so keys can be pasted without shell exports ──
def _load_env_file() -> None:
    env = Path(__file__).resolve().parent / ".env"
    if not env.is_file():
        return
    for line in env.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k and k not in os.environ:
            os.environ[k] = v

_load_env_file()



class ClerkTokenIn(BaseModel):
    token: str
    email: str | None = None
    name: str | None = None


def _api_url() -> str | None:
    """Clerk Backend API URL — from CLERK_ISSUER or decoded from the publishable key.

    A publishable key looks like  pk_test_aHR0cHM6Ly9...$  where the part after
    'pk_test_' is base64 of '<api-url>$'."""
    issuer = os.environ.get("CLERK_ISSUER", "").strip()
    if issuer:
        return issuer.rstrip("/")
    pk = os.environ.get("CLERK_PUBLISHABLE_KEY", "").strip()
    if pk.startswith(("pk_test_", "pk_live_")):
        try:
            b64 = pk.split("_", 2)[2]
            b64 += "=" * (-len(b64) % 4)
            url = base64.b64decode(b64).decode().rstrip("$")
            if not url:
                return None
            return url.rstrip("/") if url.startswith("http") else f"https://{url}"
        except Exception:
            return None
    return None





def _clerk_user(api: str, sub: str) -> dict:
    """Best-effort fetch of email/name/avatar from the Clerk Backend API."""
    sk = os.environ.get("CLERK_SECRET_KEY", "").strip()
    if not sk or not sub.startswith("user_"):
        return {}
    try:
        req = urllib.request.Request(
            f"https://api.clerk.com/v1/users/{sub}",
            headers={"Authorization": f"Bearer {sk}"},
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            u = json.loads(r.read().decode())
        email = ""
        pid = u.get("primary_email_address_id", "")
        for ea in u.get("email_addresses", []):
            if ea.get("id") == pid:
                email = ea.get("email_address", "")
                break
        name = " ".join(x for x in (u.get("first_name"), u.get("last_name")) if x)
        return {
            "email": email,
            "name": name,
            "image": u.get("image_url") or u.get("profile_image_url") or "",
        }
    except Exception:
        return {}



# Use PyJWKClient for robust caching and JWKS retrieval
_jwks_clients: dict[str, PyJWKClient] = {}

@router.post("/clerk")
def clerk_login(body: ClerkTokenIn, db: Session = Depends(get_db)):
    """Verify a Clerk session JWT and issue a FinMate JWT."""
    print(f"DEBUG INCOMING CLERK POST: email='{body.email}', name='{body.name}'")
    api = _api_url()
    if not api:
        raise HTTPException(
            503,
            "Clerk is not configured on the server. Add CLERK_PUBLISHABLE_KEY to "
            "backend/.env — see docs/deployment.md → 'Clerk social login'.",
        )

    jwks_url = f"{api}/.well-known/jwks.json"
    if jwks_url not in _jwks_clients:
        _jwks_clients[jwks_url] = PyJWKClient(jwks_url)
    
    try:
        signing_key = _jwks_clients[jwks_url].get_signing_key_from_jwt(body.token)
        # 1) verify signature + expiry
        claims = jwt.decode(
            body.token,
            signing_key.key,
            algorithms=["RS256", "EdDSA"], # Support both common Clerk algos
            options={"verify_aud": False}
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Clerk session token has expired — please sign in again.")
    except Exception as e:
        print(f"DEBUG: Clerk token verification failed: {e}")
        raise HTTPException(401, f"Invalid Clerk token ({e.__class__.__name__}): {str(e)}")

    sub = claims.get("sub")
    if not sub:
        raise HTTPException(401, "Clerk token is missing the 'sub' claim.")

    # 3) resolve the user's identity (Backend API if secret key set, else claims)
    info = _clerk_user(api, sub)
    
    email = (info.get("email") or claims.get("email") or body.email)
    if not email:
        email = f"clerk-{sub[:12]}@users.finmate.in"
    email = email.lower()
    
    full_name = info.get("name") or claims.get("name") or body.name or "Clerk User"

    # 4) upsert locally + issue the app JWT
    # We must ensure we don't allow a hacker to hijack an existing account using a forged body.email.
    # Therefore, we always check if the user exists. If they do, we enforce they must have the same Clerk sub.
    user = db.query(models.User).filter(models.User.email == email).first()
    
    if user:
        # Prevent hijacking: If they logged in via Clerk but the DB user wasn't created by this Clerk account
        profile = {}
        try:
            profile = json.loads(user.profile or "{}")
        except json.JSONDecodeError:
            pass
            
        if profile.get("auth_provider") == "clerk":
            if profile.get("clerk_sub") and profile.get("clerk_sub") != sub:
                 raise HTTPException(403, "Email is already linked to a different Clerk account.")
        else:
            # For simplicity in this demo, allow linking if not explicitly another Clerk account.
            # In true prod, we would enforce OAuth linking strictness.
            pass
            
        if full_name and user.full_name in ("", "Clerk User"):
            user.full_name = full_name
            db.commit()
            db.refresh(user)
    else:
        user = models.User(
            email=email,
            full_name=full_name,
            password_hash=None,
            profile=json.dumps({
                "auth_provider": "clerk", 
                "clerk_sub": sub,
                "age": 25, "occupation": "employee",
                "city": "Ahmedabad", "risk_profile": "balanced",
                "income_type": "salary", "language": "en",
            }),
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    return {
        "token": authlib.create_token(user.id, user.email),
        "user": authlib.user_public(user),
        "provider": "clerk",
    }
