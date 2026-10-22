from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date
from schemas.pydantic_object_id import PyObjectId

class TransactionCreate(BaseModel):
    expense_id: Optional[PyObjectId] = None
    income_id: Optional[PyObjectId] = None
    type: str # 'debit' or 'credit'
    amount: float
    merchant_name: Optional[str] = None
    transaction_date: date
    payment_method: Optional[str] = None
    reference_number: Optional[str] = None
    source: Optional[str] = "manual"
    status: Optional[str] = "completed"
    description: Optional[str] = None

class TransactionResponse(TransactionCreate):
    id: PyObjectId = Field(alias="_id")
    user_id: PyObjectId
    created_at: datetime
    
    class Config:
        populate_by_name = True
