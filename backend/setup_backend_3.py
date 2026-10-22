import os
from pathlib import Path

BASE_DIR = Path("c:/Users/Lenovo/Desktop/project/finance-ai/backend")

# schemas/income.py
with open(BASE_DIR / "schemas" / "income.py", "w", encoding="utf-8") as f:
    f.write("""from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date
from schemas.pydantic_object_id import PyObjectId

class IncomeCreate(BaseModel):
    title: str
    amount: float
    category: str
    source: str
    income_date: date
    recurring: Optional[bool] = False
    description: Optional[str] = None

class IncomeResponse(IncomeCreate):
    id: PyObjectId = Field(alias="_id")
    user_id: PyObjectId
    created_at: datetime
    updated_at: datetime
    
    class Config:
        populate_by_name = True
""")

# schemas/fraud_alert.py
with open(BASE_DIR / "schemas" / "fraud_alert.py", "w", encoding="utf-8") as f:
    f.write("""from pydantic import BaseModel, Field
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
""")

# schemas/category.py
with open(BASE_DIR / "schemas" / "category.py", "w", encoding="utf-8") as f:
    f.write("""from pydantic import BaseModel, Field
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
""")

# schemas/notification.py
with open(BASE_DIR / "schemas" / "notification.py", "w", encoding="utf-8") as f:
    f.write("""from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from schemas.pydantic_object_id import PyObjectId

class NotificationCreate(BaseModel):
    title: str
    message: str
    type: str
    scheduled_at: Optional[datetime] = None

class NotificationResponse(NotificationCreate):
    id: PyObjectId = Field(alias="_id")
    user_id: PyObjectId
    is_read: bool = False
    read_at: Optional[datetime] = None
    created_at: datetime
    
    class Config:
        populate_by_name = True
""")

# schemas/ocr_receipt.py
with open(BASE_DIR / "schemas" / "ocr_receipt.py", "w", encoding="utf-8") as f:
    f.write("""from pydantic import BaseModel, Field
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
""")

# schemas/voice_history.py
with open(BASE_DIR / "schemas" / "voice_history.py", "w", encoding="utf-8") as f:
    f.write("""from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from schemas.pydantic_object_id import PyObjectId

class VoiceHistoryCreate(BaseModel):
    audio_url: str
    transcript: str
    response: str
    speech_to_text_model: str
    text_to_speech_model: str
    duration: float

class VoiceHistoryResponse(VoiceHistoryCreate):
    id: PyObjectId = Field(alias="_id")
    user_id: PyObjectId
    created_at: datetime
    
    class Config:
        populate_by_name = True
""")

# schemas/chat_history.py
with open(BASE_DIR / "schemas" / "chat_history.py", "w", encoding="utf-8") as f:
    f.write("""from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from schemas.pydantic_object_id import PyObjectId

class ChatHistoryCreate(BaseModel):
    session_id: str
    user_message: str
    ai_response: str
    model: str
    tokens_used: int

class ChatHistoryResponse(ChatHistoryCreate):
    id: PyObjectId = Field(alias="_id")
    user_id: PyObjectId
    created_at: datetime
    
    class Config:
        populate_by_name = True
""")

# schemas/goal.py
with open(BASE_DIR / "schemas" / "goal.py", "w", encoding="utf-8") as f:
    f.write("""from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date
from schemas.pydantic_object_id import PyObjectId

class GoalCreate(BaseModel):
    name: str
    target_amount: float
    current_amount: Optional[float] = 0.0
    target_date: date
    status: str
    description: Optional[str] = None

class GoalResponse(GoalCreate):
    id: PyObjectId = Field(alias="_id")
    user_id: PyObjectId
    created_at: datetime
    updated_at: datetime
    
    class Config:
        populate_by_name = True
""")

# schemas/saving.py
with open(BASE_DIR / "schemas" / "saving.py", "w", encoding="utf-8") as f:
    f.write("""from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date
from schemas.pydantic_object_id import PyObjectId

class SavingCreate(BaseModel):
    goal_id: PyObjectId
    amount: float
    saving_date: date
    source: str
    notes: Optional[str] = None

class SavingResponse(SavingCreate):
    id: PyObjectId = Field(alias="_id")
    user_id: PyObjectId
    created_at: datetime
    
    class Config:
        populate_by_name = True
""")

# schemas/monthly_summary.py
with open(BASE_DIR / "schemas" / "monthly_summary.py", "w", encoding="utf-8") as f:
    f.write("""from pydantic import BaseModel, Field
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
""")

# schemas/ai_prediction.py
with open(BASE_DIR / "schemas" / "ai_prediction.py", "w", encoding="utf-8") as f:
    f.write("""from pydantic import BaseModel, Field
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
""")
