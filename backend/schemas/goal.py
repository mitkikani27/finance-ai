from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date
from schemas.pydantic_object_id import PyObjectId

class GoalCreate(BaseModel):
    name: str
    target_amount: float
    current_amount: Optional[float] = 0.0
    target_date: date
    status: str
    description: Optional[str] = None

class GoalResponse(GoalCreate):
    id: PyObjectId = Field(alias="_id")
    user_id: PyObjectId
    created_at: datetime
    updated_at: datetime
    
    class Config:
        populate_by_name = True
