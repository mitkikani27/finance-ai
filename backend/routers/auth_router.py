"""Module 1 — User Login: email/password + OTP (demo) + Google (demo) + JWT."""
import json
import secrets
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from models import Session

import auth as authlib
import models
from database import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])

_otp_store: dict[str, dict] = {}   # phone -> {code, exp} (in-memory for demo)


class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    phone: str = ""


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class OTPRequest(BaseModel):
    phone: str


class OTPVerify(BaseModel):
    phone: str
    otp: str


class ProfileIn(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    profile: dict | None = None


class PasswordIn(BaseModel):
    old_password: str
    new_password: str


@router.post("/register")
def register(body: RegisterIn, db: Session = Depends(get_db)):
    if len(body.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters.")
    if db.query(models.User).filter(models.User.email == body.email.lower()).first():
        raise HTTPException(409, "An account with this email already exists.")
    user = models.User(
        email=body.email.lower(), full_name=body.full_name.strip(),
        phone=body.phone or "", password_hash=authlib.hash_password(body.password),
        profile=json.dumps({
            "age": 25, "occupation": "employee", "city": "Ahmedabad",
            "risk_profile": "balanced", "income_type": "salary", "language": "en",
        }),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"token": authlib.create_token(user.id, user.email), "user": authlib.user_public(user)}


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    email = body.email.lower().strip()
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        if len(body.password) < 6:
            raise HTTPException(400, "Password kam se kam 6 characters ka hona chahiye.")
        user = models.User(
            email=email,
            full_name=email.split("@")[0].replace(".", " ").title(),
            phone="",
            password_hash=authlib.hash_password(body.password),
            profile=json.dumps({
                "age": 25, "occupation": "employee", "city": "Ahmedabad",
                "risk_profile": "balanced", "income_type": "salary", "language": "en",
            }),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return {"token": authlib.create_token(user.id, user.email), "user": authlib.user_public(user)}
    
    # If account was created via Google without a password, seamlessly set password and log in
    if not user.password_hash:
        user.password_hash = authlib.hash_password(body.password)
        db.commit()
        db.refresh(user)
        return {"token": authlib.create_token(user.id, user.email), "user": authlib.user_public(user)}

    if not authlib.verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Galat password. Please check karke dobara try karein.")
    return {"token": authlib.create_token(user.id, user.email), "user": authlib.user_public(user)}


@router.post("/login/google")
def login_google(body: dict = None, db: Session = Depends(get_db)):
    """Google authentication."""
    email = (body or {}).get("email", "").strip().lower() if body else ""
    if not email:
        email = "aarav.google@finmate.in"
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        name = email.split("@")[0].replace(".", " ").title()
        user = models.User(
            email=email, full_name=name, password_hash=None,
            profile=json.dumps({"age": 25, "occupation": "employee", "city": "Ahmedabad",
                                "risk_profile": "balanced", "income_type": "salary", "language": "en"}),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return {"token": authlib.create_token(user.id, user.email), "user": authlib.user_public(user)}


@router.post("/login/otp/request")
def otp_request(body: OTPRequest):
    phone = re.sub(r"\D", "", body.phone)[-10:]
    if len(phone) < 10:
        raise HTTPException(400, "Enter a valid 10-digit mobile number.")
    code = f"{secrets.randbelow(900000) + 100000}"
    _otp_store[phone] = {"code": code, "exp": datetime.now(timezone.utc)}
    # Demo mode: the OTP is returned so the flow can be tested without SMS gateway.
    return {"ok": True, "phone": phone, "demo_otp": code,
            "message": "OTP sent (demo mode shows it here — connect an SMS gateway like MSG91/TextLocal in production)."}


@router.post("/login/otp/verify")
def otp_verify(body: OTPVerify, db: Session = Depends(get_db)):
    phone = re.sub(r"\D", "", body.phone)[-10:]
    stored = _otp_store.get(phone)
    if not stored or stored["code"] != body.otp.strip():
        raise HTTPException(401, "Invalid or expired OTP.")
    _otp_store.pop(phone, None)
    user = db.query(models.User).filter(models.User.phone == phone).first()
    if not user:
        # auto-provision on first OTP login
        user = models.User(email=f"{phone}@otp.finmate.in", full_name=f"User {phone[-4:]}",
                           phone=phone, password_hash=None,
                           profile=json.dumps({"occupation": "employee", "risk_profile": "balanced", "language": "en"}))
        db.add(user)
        db.commit()
        db.refresh(user)
    return {"token": authlib.create_token(user.id, user.email), "user": authlib.user_public(user)}


@router.get("/me")
def me(user: models.User = Depends(authlib.get_current_user)):
    return authlib.user_public(user)


@router.put("/me")
def update_me(body: ProfileIn, user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    if body.full_name is not None:
        user.full_name = body.full_name.strip()
    if body.phone is not None:
        user.phone = body.phone
    if body.profile is not None:
        user.profile = json.dumps(body.profile)
    db.commit()
    db.refresh(user)
    return authlib.user_public(user)


@router.put("/me/password")
def change_password(body: PasswordIn, user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    if user.password_hash and not authlib.verify_password(body.old_password, user.password_hash):
        raise HTTPException(401, "Current password is incorrect.")
    if len(body.new_password) < 6:
        raise HTTPException(400, "New password must be at least 6 characters.")
    user.password_hash = authlib.hash_password(body.new_password)
    db.commit()
    return {"ok": True}
