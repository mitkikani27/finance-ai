from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date
from schemas.pydantic_object_id import PyObjectId

class ExpenseCreate(BaseModel):
    title: str
    amount: float
    category: str
    merchant_name: Optional[str] = None
    payment_method: Optional[str] = None
    source: Optional[str] = "manual"
    expense_date: Optional[date] = None
    notes: Optional[str] = None

class ExpenseUpdate(BaseModel):
    title: Optional[str] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    merchant_name: Optional[str] = None

class ExpenseResponse(ExpenseCreate):
    id: PyObjectId = Field(alias="_id")
    user_id: PyObjectId
    created_at: datetime
    updated_at: datetime
    
    class Config:
        populate_by_name = True
