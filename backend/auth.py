"""Authentication: JWT tokens + bcrypt password hashing."""
import os
import json
import jwt
import bcrypt
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from models import Session

import models
from database import get_db

ALGORITHM = "HS256"
SECRET_KEY = os.getenv("FINMATE_SECRET", "finmate-dev-secret-change-in-production")
TOKEN_TTL_DAYS = 30

bearer = HTTPBearer(auto_error=False)


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_token(user_id: int, email: str) -> str:
    payload = {
        "sub": str(user_id),
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=TOKEN_TTL_DAYS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    request: Request,
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> models.User:
    # Token sources, in order: Authorization header → cookie → _auth query param.
    # Header is standard; cookie + query fallbacks keep auth working through
    # preview proxies that strip headers / sandboxed iframes that block cookies.
    candidates = [c for c in (creds.credentials if creds else None,
                              request.cookies.get("finmate_token"),
                              request.query_params.get("_auth")) if c]
    if not candidates:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = None
    for token in candidates:
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            user = db.get(models.User, int(payload["sub"]))
            if user is not None:
                return user
        except (jwt.PyJWTError, KeyError, ValueError):
            continue
    raise HTTPException(status_code=401, detail="Invalid or expired token")


def user_public(user: models.User) -> dict:
    try:
        profile = json.loads(user.profile or "{}")
    except json.JSONDecodeError:
        profile = {}
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "phone": user.phone or "",
        "profile": profile,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }
