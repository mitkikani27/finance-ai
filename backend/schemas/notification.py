from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from schemas.pydantic_object_id import PyObjectId

class NotificationCreate(BaseModel):
    title: str
    message: str
    type: str
    scheduled_at: Optional[datetime] = None

class NotificationResponse(NotificationCreate):
    id: PyObjectId = Field(alias="_id")
    user_id: PyObjectId
    is_read: bool = False
    read_at: Optional[datetime] = None
    created_at: datetime
    
    class Config:
        populate_by_name = True
