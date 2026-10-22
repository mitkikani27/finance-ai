from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from schemas.pydantic_object_id import PyObjectId

class VoiceHistoryCreate(BaseModel):
    audio_url: str
    transcript: str
    response: str
    speech_to_text_model: str
    text_to_speech_model: str
    duration: float

class VoiceHistoryResponse(VoiceHistoryCreate):
    id: PyObjectId = Field(alias="_id")
    user_id: PyObjectId
    created_at: datetime
    
    class Config:
        populate_by_name = True
