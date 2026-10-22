from pydantic import BaseModel, Field
from typing import Optional, Dict
from datetime import datetime
from schemas.pydantic_object_id import PyObjectId

class MonthlySummaryCreate(BaseModel):
    month: int
    year: int
    total_income: float
    total_expense: float
    total_savings: float
    total_investment: float
    predicted_expense: Optional[float] = None
    financial_health_score: float
    top_category: str
    category_breakdown: Dict[str, float]
    ai_insights: list[str]

class MonthlySummaryResponse(MonthlySummaryCreate):
    id: PyObjectId = Field(alias="_id")
    user_id: PyObjectId
    created_at: datetime
    updated_at: datetime
    
    class Config:
        populate_by_name = True
