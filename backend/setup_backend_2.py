import os
from pathlib import Path

BASE_DIR = Path("c:/Users/Lenovo/Desktop/project/finance-ai/backend")

# schemas/transaction.py
with open(BASE_DIR / "schemas" / "transaction.py", "w", encoding="utf-8") as f:
    f.write("""from pydantic import BaseModel, Field
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
""")

# schemas/budget.py
with open(BASE_DIR / "schemas" / "budget.py", "w", encoding="utf-8") as f:
    f.write("""from pydantic import BaseModel, Field
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
""")

# schemas/investment.py
with open(BASE_DIR / "schemas" / "investment.py", "w", encoding="utf-8") as f:
    f.write("""from pydantic import BaseModel, Field
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
""")

# routes/auth.py
with open(BASE_DIR / "routes" / "auth.py", "w", encoding="utf-8") as f:
    f.write("""from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from database.mongodb import get_database
from auth.security import get_password_hash, verify_password, create_access_token
from schemas.user import UserCreate, UserResponse
from datetime import datetime

router = APIRouter()

@router.post("/register", response_model=UserResponse)
async def register(user_in: UserCreate):
    db = get_database()
    user_exists = await db.users.find_one({"email": user_in.email})
    if user_exists:
        raise HTTPException(status_code=400, detail="Email already registered")
        
    user_dict = user_in.model_dump()
    user_dict["password_hash"] = get_password_hash(user_dict.pop("password"))
    user_dict["is_email_verified"] = False
    user_dict["is_active"] = True
    user_dict["role"] = "user"
    user_dict["created_at"] = datetime.utcnow()
    user_dict["updated_at"] = datetime.utcnow()
    
    result = await db.users.insert_one(user_dict)
    user_dict["_id"] = str(result.inserted_id)
    return user_dict

@router.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    db = get_database()
    user = await db.users.find_one({"email": form_data.username})
    if not user or not verify_password(form_data.password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
        
    access_token = create_access_token(subject=str(user["_id"]))
    return {"access_token": access_token, "token_type": "bearer"}
""")

# routes/expenses.py
with open(BASE_DIR / "routes" / "expenses.py", "w", encoding="utf-8") as f:
    f.write("""from fastapi import APIRouter, Depends, HTTPException
from typing import List
from bson import ObjectId
from datetime import datetime
from database.mongodb import get_database
from auth.dependencies import get_current_user
from schemas.expense import ExpenseCreate, ExpenseUpdate, ExpenseResponse

router = APIRouter()

@router.post("/", response_model=ExpenseResponse)
async def create_expense(expense: ExpenseCreate, current_user = Depends(get_current_user)):
    db = get_database()
    expense_dict = expense.model_dump()
    expense_dict["user_id"] = current_user["_id"] # Stored as ObjectId
    expense_dict["created_at"] = datetime.utcnow()
    expense_dict["updated_at"] = datetime.utcnow()
    
    # If date is not provided, use now
    if expense_dict["expense_date"] is None:
        expense_dict["expense_date"] = datetime.utcnow().date().isoformat()
    elif hasattr(expense_dict["expense_date"], "isoformat"):
        expense_dict["expense_date"] = expense_dict["expense_date"].isoformat()
        
    result = await db.expenses.insert_one(expense_dict)
    expense_dict["_id"] = str(result.inserted_id)
    expense_dict["user_id"] = str(expense_dict["user_id"])
    return expense_dict

@router.get("/", response_model=List[ExpenseResponse])
async def list_expenses(current_user = Depends(get_current_user)):
    db = get_database()
    # ALWAYS use user_id filter
    expenses_cursor = db.expenses.find({"user_id": current_user["_id"]}).sort("expense_date", -1)
    expenses = await expenses_cursor.to_list(length=100)
    
    for expense in expenses:
        expense["_id"] = str(expense["_id"])
        expense["user_id"] = str(expense["user_id"])
    return expenses

@router.get("/{expense_id}", response_model=ExpenseResponse)
async def get_expense(expense_id: str, current_user = Depends(get_current_user)):
    db = get_database()
    expense = await db.expenses.find_one({
        "_id": ObjectId(expense_id),
        "user_id": current_user["_id"]
    })
    
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found or unauthorized")
        
    expense["_id"] = str(expense["_id"])
    expense["user_id"] = str(expense["user_id"])
    return expense

@router.put("/{expense_id}", response_model=ExpenseResponse)
async def update_expense(expense_id: str, update_data: ExpenseUpdate, current_user = Depends(get_current_user)):
    db = get_database()
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    update_dict["updated_at"] = datetime.utcnow()
    
    result = await db.expenses.find_one_and_update(
        {"_id": ObjectId(expense_id), "user_id": current_user["_id"]},
        {"$set": update_dict},
        return_document=True
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Expense not found or unauthorized")
        
    result["_id"] = str(result["_id"])
    result["user_id"] = str(result["user_id"])
    return result

@router.delete("/{expense_id}")
async def delete_expense(expense_id: str, current_user = Depends(get_current_user)):
    db = get_database()
    result = await db.expenses.delete_one({
        "_id": ObjectId(expense_id),
        "user_id": current_user["_id"]
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found or unauthorized")
        
    return {"message": "Expense deleted successfully"}
""")
