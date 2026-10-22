from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date
from schemas.pydantic_object_id import PyObjectId

class OCRReceiptCreate(BaseModel):
    expense_id: PyObjectId
    file_url: str
    shop_name: Optional[str] = None
    receipt_date: Optional[date] = None
    subtotal: Optional[float] = None
    tax: Optional[float] = None
    total_amount: Optional[float] = None
    extracted_text: Optional[str] = None
    ocr_engine: Optional[str] = None
    confidence: Optional[float] = None

class OCRReceiptResponse(OCRReceiptCreate):
    id: PyObjectId = Field(alias="_id")
    user_id: PyObjectId
    created_at: datetime
    
    class Config:
        populate_by_name = True
