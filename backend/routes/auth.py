from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from database.mongodb import get_database
from auth.security import get_password_hash, verify_password, create_access_token
from schemas.user import UserCreate, UserResponse
from datetime import datetime

router = APIRouter()

@router.post("/register", response_model=UserResponse)
async def register(user_in: UserCreate):
    db = get_database()
    user_exists = await db.users.find_one({"email": user_in.email})
    if user_exists:
        raise HTTPException(status_code=400, detail="Email already registered")
        
    user_dict = user_in.model_dump()
    user_dict["password_hash"] = get_password_hash(user_dict.pop("password"))
    user_dict["is_email_verified"] = False
    user_dict["is_active"] = True
    user_dict["role"] = "user"
    user_dict["created_at"] = datetime.utcnow()
    user_dict["updated_at"] = datetime.utcnow()
    
    result = await db.users.insert_one(user_dict)
    user_dict["_id"] = str(result.inserted_id)
    return user_dict

@router.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    db = get_database()
    user = await db.users.find_one({"email": form_data.username})
    if not user or not verify_password(form_data.password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
        
    access_token = create_access_token(subject=str(user["_id"]))
    return {"access_token": access_token, "token_type": "bearer"}

from pydantic import BaseModel
import time

class ClerkTokenIn(BaseModel):
    token: str

import os
import urllib.request
import json
import base64
from joserfc import jwt as jose_jwt
from joserfc.jwk import KeySet

@router.post("/clerk")
async def clerk_login(body: ClerkTokenIn):
    try:
        # Get Clerk API URL
        pk = os.environ.get("CLERK_PUBLISHABLE_KEY", "pk_test_c2hhcnAtc2NvcnBpb24tMjA3LmNsZXJrLmFjY291bnRzLmRldiQ")
        b64 = pk.split("_", 2)[2]
        b64 += "=" * (-len(b64) % 4)
        url = base64.b64decode(b64).decode().rstrip("$")
        api = url.rstrip("/") if url.startswith("http") else f"https://{url}"
        
        # Get JWKS
        req = urllib.request.Request(f"{api}/.well-known/jwks.json")
        with urllib.request.urlopen(req, timeout=10) as r:
            keyset = KeySet.import_key_set(json.loads(r.read().decode()))
            
        token = jose_jwt.decode(body.token, keyset, algorithms=["RS256"])
    except Exception as e:
        raise HTTPException(401, f"Invalid Clerk token ({e.__class__.__name__})")

    claims = token.claims if hasattr(token, "claims") else token
    if int(claims.get("exp", 0)) < time.time():
        raise HTTPException(401, "Clerk token expired")
        
    sub = claims.get("sub")
    email = claims.get("email") or f"clerk-{sub[:12]}@users.finmate.in"
    
    db = get_database()
    user = await db.users.find_one({"email": email.lower()})
    
    if not user:
        user_dict = {
            "email": email.lower(),
            "full_name": claims.get("name") or "Clerk User",
            "password_hash": "",
            "is_email_verified": True,
            "is_active": True,
            "role": "user",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        result = await db.users.insert_one(user_dict)
        user_id = str(result.inserted_id)
        user = user_dict
        user["_id"] = user_id
    else:
        user_id = str(user["_id"])
        
    access_token = create_access_token(subject=user_id)
    user["_id"] = user_id
    user.pop("password_hash", None)
    return {"token": access_token, "user": user}

from auth.dependencies import get_current_user

@router.get("/me")
async def read_users_me(current_user: dict = Depends(get_current_user)):
    user = current_user.copy()
    user["id"] = str(user["_id"])
    user["_id"] = str(user["_id"])
    user.pop("password_hash", None)
    if "full_name" in user and "name" not in user:
        user["name"] = user["full_name"]
    return user
