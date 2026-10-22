from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date
from schemas.pydantic_object_id import PyObjectId

class IncomeCreate(BaseModel):
    title: str
    amount: float
    category: str
    source: str
    income_date: date
    recurring: Optional[bool] = False
    description: Optional[str] = None

class IncomeResponse(IncomeCreate):
    id: PyObjectId = Field(alias="_id")
    user_id: PyObjectId
    created_at: datetime
    updated_at: datetime
    
    class Config:
        populate_by_name = True
