from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from schemas.pydantic_object_id import PyObjectId

class FraudAlertCreate(BaseModel):
    transaction_id: PyObjectId
    amount: float
    risk_score: float
    model: str
    alert_level: str
    reason: str
    is_reviewed: Optional[bool] = False

class FraudAlertResponse(FraudAlertCreate):
    id: PyObjectId = Field(alias="_id")
    user_id: PyObjectId
    created_at: datetime
    updated_at: datetime
    
    class Config:
        populate_by_name = True
