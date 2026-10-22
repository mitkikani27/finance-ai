from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date
from schemas.pydantic_object_id import PyObjectId

class SavingCreate(BaseModel):
    goal_id: PyObjectId
    amount: float
    saving_date: date
    source: str
    notes: Optional[str] = None

class SavingResponse(SavingCreate):
    id: PyObjectId = Field(alias="_id")
    user_id: PyObjectId
    created_at: datetime
    
    class Config:
        populate_by_name = True
