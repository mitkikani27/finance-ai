from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from schemas.pydantic_object_id import PyObjectId

class CategoryCreate(BaseModel):
    name: str
    type: str # 'expense' or 'income'
    icon: Optional[str] = None
    color: Optional[str] = None
    is_default: Optional[bool] = False

class CategoryResponse(CategoryCreate):
    id: PyObjectId = Field(alias="_id")
    user_id: PyObjectId
    created_at: datetime
    
    class Config:
        populate_by_name = True
