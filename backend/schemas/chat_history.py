from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from schemas.pydantic_object_id import PyObjectId

class ChatHistoryCreate(BaseModel):
    session_id: str
    user_message: str
    ai_response: str
    model: str
    tokens_used: int

class ChatHistoryResponse(ChatHistoryCreate):
    id: PyObjectId = Field(alias="_id")
    user_id: PyObjectId
    created_at: datetime
    
    class Config:
        populate_by_name = True
