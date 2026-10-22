from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from typing import Optional
from schemas.pydantic_object_id import PyObjectId

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone: Optional[str] = None

class UserResponse(BaseModel):
    id: PyObjectId = Field(alias="_id")
    name: str
    email: EmailStr
    phone: Optional[str]
    is_active: bool
    role: str
    created_at: datetime
    
    class Config:
        populate_by_name = True
