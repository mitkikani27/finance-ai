"""Module 9 — Voice Assistant endpoint.

The browser performs speech-to-text (Web Speech API) and speech output
(speechSynthesis); this endpoint is the 'brain': natural-language query →
data-grounded spoken answer. Swap-in: Whisper STT + ElevenLabs TTS (see docs).
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from models import Session

import auth as authlib
import chat_service
import models
from database import get_db

router = APIRouter(prefix="/api/voice", tags=["voice"])


class VoiceIn(BaseModel):
    text: str


@router.post("/query")
def voice_query(body: VoiceIn, user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    text = body.text.strip()
    if not text:
        return {"reply": "I didn't catch that — please try again.", "speak": "I didn't catch that, please try again."}
    reply = chat_service.answer(db, user, text)
    speak = reply.replace("⚠️", "Warning: ").replace("📈", "").replace("📉", "") \
                .replace("🔮", "").replace("❤️", "").replace("🏆", "").replace("🧭", "").replace("🚨", "").replace("🛡️", "")
    return {"reply": reply, "speak": speak}
