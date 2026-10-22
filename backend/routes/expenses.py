from fastapi import APIRouter, Depends, HTTPException
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
