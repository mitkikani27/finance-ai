"""Module 12 — AI Chatbot endpoints."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from models import Session

import auth as authlib
import chat_service
import models
from database import get_db

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatIn(BaseModel):
    message: str
    save_history: bool = True


@router.post("")
def chat(body: ChatIn, user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    msg = body.message.strip()
    if not msg:
        return {"reply": "I'm here — ask me anything about your money."}
    reply = chat_service.answer(db, user, msg)
    if body.save_history:
        db.add(models.ChatHistory(user_id=user.id, role="user", content=msg))
        db.add(models.ChatHistory(user_id=user.id, role="assistant", content=reply))
        db.commit()
    return {"reply": reply}


@router.get("/history")
def history(user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    rows = db.query(models.ChatHistory).filter(models.ChatHistory.user_id == user.id) \
        .order_by(models.ChatHistory.created_at.desc(), models.ChatHistory.id.desc()).limit(50).all()
    return [{"role": r.role, "content": r.content} for r in reversed(rows)]
