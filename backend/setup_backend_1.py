import os
from pathlib import Path

BASE_DIR = Path("c:/Users/Lenovo/Desktop/project/finance-ai/backend")

dirs = ["models", "schemas", "routes", "services", "auth", "database", "core"]
for d in dirs:
    (BASE_DIR / d).mkdir(parents=True, exist_ok=True)
    with open(BASE_DIR / d / "__init__.py", "w") as f:
        f.write("")

# core/config.py
with open(BASE_DIR / "core" / "config.py", "w", encoding="utf-8") as f:
    f.write("""from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "FinMate AI"
    MONGODB_URL: str = "mongodb://localhost:27017" # Replace with MongoDB Atlas URL
    DATABASE_NAME: str = "finmate_ai"
    SECRET_KEY: str = "SUPER_SECRET_KEY_REPLACE_ME_IN_PRODUCTION"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    class Config:
        env_file = ".env"

settings = Settings()
""")

# database/mongodb.py
with open(BASE_DIR / "database" / "mongodb.py", "w", encoding="utf-8") as f:
    f.write("""import motor.motor_asyncio
from core.config import settings

class MongoDB:
    client: motor.motor_asyncio.AsyncIOMotorClient = None
    db = None

db = MongoDB()

def connect_to_mongo():
    db.client = motor.motor_asyncio.AsyncIOMotorClient(settings.MONGODB_URL)
    db.db = db.client[settings.DATABASE_NAME]

def close_mongo_connection():
    db.client.close()

def get_database():
    return db.db
""")

# database/indexes.py
with open(BASE_DIR / "database" / "indexes.py", "w", encoding="utf-8") as f:
    f.write("""from database.mongodb import get_database
import pymongo

async def create_indexes():
    db = get_database()
    
    # Users
    await db.users.create_index([("email", pymongo.ASCENDING)], unique=True)
    
    # Expenses
    await db.expenses.create_index([("user_id", pymongo.ASCENDING), ("expense_date", pymongo.DESCENDING)])
    
    # Transactions
    await db.transactions.create_index([("user_id", pymongo.ASCENDING), ("transaction_date", pymongo.DESCENDING)])
    
    # Incomes
    await db.incomes.create_index([("user_id", pymongo.ASCENDING), ("income_date", pymongo.DESCENDING)])
    
    # Budgets
    await db.budgets.create_index([("user_id", pymongo.ASCENDING), ("year", pymongo.ASCENDING), ("month", pymongo.ASCENDING)])
    
    # Investments
    await db.investments.create_index([("user_id", pymongo.ASCENDING)])
    
    # Fraud Alerts
    await db.fraud_alerts.create_index([("user_id", pymongo.ASCENDING), ("created_at", pymongo.DESCENDING)])
    
    # Notifications
    await db.notifications.create_index([("user_id", pymongo.ASCENDING), ("is_read", pymongo.ASCENDING)])
    
    # Chat History
    await db.chat_history.create_index([("user_id", pymongo.ASCENDING), ("created_at", pymongo.DESCENDING)])
    
    # Voice History
    await db.voice_history.create_index([("user_id", pymongo.ASCENDING), ("created_at", pymongo.DESCENDING)])
    
    # OCR Receipts
    await db.ocr_receipts.create_index([("user_id", pymongo.ASCENDING), ("created_at", pymongo.DESCENDING)])
    
    # Goals
    await db.goals.create_index([("user_id", pymongo.ASCENDING)])
    
    # Savings
    await db.savings.create_index([("user_id", pymongo.ASCENDING), ("saving_date", pymongo.DESCENDING)])
    
    # Monthly Summaries
    await db.monthly_summaries.create_index(
        [("user_id", pymongo.ASCENDING), ("year", pymongo.ASCENDING), ("month", pymongo.ASCENDING)],
        unique=True
    )
    
    # AI Predictions
    await db.ai_predictions.create_index([("user_id", pymongo.ASCENDING), ("created_at", pymongo.DESCENDING)])
    print("Indexes created successfully.")
""")

# auth/security.py
with open(BASE_DIR / "auth" / "security.py", "w", encoding="utf-8") as f:
    f.write("""from datetime import datetime, timedelta
from typing import Any, Union
from passlib.context import CryptContext
from jose import jwt
from core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(subject: Union[str, Any], expires_delta: timedelta = None) -> str:
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {"exp": expire, "sub": str(subject)}
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt
""")

# auth/dependencies.py
with open(BASE_DIR / "auth" / "dependencies.py", "w", encoding="utf-8") as f:
    f.write("""from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from pydantic import ValidationError
from bson import ObjectId
from core.config import settings
from database.mongodb import get_database

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

async def get_current_user(token: str = Depends(oauth2_scheme)):
    db = get_database()
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except (JWTError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user
""")

# schemas/pydantic_object_id.py (helper for ObjectId)
with open(BASE_DIR / "schemas" / "pydantic_object_id.py", "w", encoding="utf-8") as f:
    f.write("""from bson import ObjectId
from pydantic_core import core_schema
from typing import Any

class PyObjectId(str):
    @classmethod
    def __get_pydantic_core_schema__(
        cls, _source_type: Any, _handler: Any
    ) -> core_schema.CoreSchema:
        return core_schema.no_info_after_validator_function(
            cls.validate, 
            core_schema.str_schema()
        )

    @classmethod
    def validate(cls, v):
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid ObjectId")
        return str(ObjectId(v))
""")

# schemas/user.py
with open(BASE_DIR / "schemas" / "user.py", "w", encoding="utf-8") as f:
    f.write("""from pydantic import BaseModel, EmailStr, Field
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
""")

# schemas/expense.py
with open(BASE_DIR / "schemas" / "expense.py", "w", encoding="utf-8") as f:
    f.write("""from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date
from schemas.pydantic_object_id import PyObjectId

class ExpenseCreate(BaseModel):
    title: str
    amount: float
    category: str
    merchant_name: Optional[str] = None
    payment_method: Optional[str] = None
    source: Optional[str] = "manual"
    expense_date: Optional[date] = None
    notes: Optional[str] = None

class ExpenseUpdate(BaseModel):
    title: Optional[str] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    merchant_name: Optional[str] = None

class ExpenseResponse(ExpenseCreate):
    id: PyObjectId = Field(alias="_id")
    user_id: PyObjectId
    created_at: datetime
    updated_at: datetime
    
    class Config:
        populate_by_name = True
""")

# main.py
with open(BASE_DIR / "main.py", "w", encoding="utf-8") as f:
    f.write("""from fastapi import FastAPI
from contextlib import asynccontextmanager
from database.mongodb import connect_to_mongo, close_mongo_connection
from database.indexes import create_indexes
from routes import auth, expenses

@asynccontextmanager
async def lifespan(app: FastAPI):
    connect_to_mongo()
    await create_indexes()
    yield
    close_mongo_connection()

app = FastAPI(title="FinMate AI Backend", lifespan=lifespan)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(expenses.router, prefix="/expenses", tags=["expenses"])

@app.get("/")
def read_root():
    return {"message": "Welcome to FinMate AI API"}
""")
