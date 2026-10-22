from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime
from schemas.pydantic_object_id import PyObjectId

class AIPredictionCreate(BaseModel):
    prediction_type: str
    model_name: str
    input_data: Any
    prediction: Any
    confidence: float
    prediction_date: datetime

class AIPredictionResponse(AIPredictionCreate):
    id: PyObjectId = Field(alias="_id")
    user_id: PyObjectId
    created_at: datetime
    
    class Config:
        populate_by_name = True
