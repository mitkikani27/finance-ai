from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date
from schemas.pydantic_object_id import PyObjectId

class InvestmentCreate(BaseModel):
    type: str
    name: str
    invested_amount: float
    current_value: Optional[float] = None
    expected_return: Optional[float] = None
    risk_level: Optional[str] = None
    start_date: date
    maturity_date: Optional[date] = None
    notes: Optional[str] = None

class InvestmentResponse(InvestmentCreate):
    id: PyObjectId = Field(alias="_id")
    user_id: PyObjectId
    created_at: datetime
    updated_at: datetime
    
    class Config:
        populate_by_name = True
