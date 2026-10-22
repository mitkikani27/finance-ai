from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from schemas.pydantic_object_id import PyObjectId

class BudgetCreate(BaseModel):
    name: str
    category: str
    amount: float
    start_date: datetime
    end_date: datetime
    month: int
    year: int

class BudgetResponse(BudgetCreate):
    id: PyObjectId = Field(alias="_id")
    user_id: PyObjectId
    spent_amount: float
    remaining_amount: float
    predicted_amount: Optional[float] = None
    status: str
    created_at: datetime
    updated_at: datetime
    
    class Config:
        populate_by_name = True
