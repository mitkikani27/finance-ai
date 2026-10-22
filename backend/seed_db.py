import asyncio
import pymongo
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, date

# Connect to Local MongoDB
# NOTE: If you are using MongoDB Atlas, replace 'mongodb://localhost:27017' with your Atlas Connection URL.
client = AsyncIOMotorClient("mongodb://localhost:27017")
db = client["finmate_ai"]

async def seed_data():
    print("Database seeding started...")
    
    # 1. users
    user_doc = {
        "name": "Jane Doe",
        "email": "jane.doe@example.com",
        "password_hash": "hashed_password",
        "phone": "+1234567890",
        "google_id": None,
        "profile_image": None,
        "is_email_verified": True,
        "is_active": True,
        "role": "user",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    user_insert = await db.users.insert_one(user_doc)
    user_id = user_insert.inserted_id
    
    # 2. categories (default)
    cat_doc = {
        "user_id": user_id,
        "name": "Food",
        "type": "expense",
        "icon": "🍔",
        "color": "#FF0000",
        "is_default": True,
        "created_at": datetime.utcnow()
    }
    cat_insert = await db.categories.insert_one(cat_doc)
    cat_id = cat_insert.inserted_id

    # 3. expenses
    exp_doc = {
        "user_id": user_id,
        "category_id": cat_id,
        "title": "Pizza Dinner",
        "amount": 550.0,
        "category": "Food",
        "merchant_name": "Domino's",
        "expense_date": datetime.utcnow(),
        "payment_method": "UPI",
        "source": "manual",
        "ai_category": "Food & Dining",
        "ai_confidence": 0.95,
        "receipt_id": None,
        "notes": "Late night pizza",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    exp_insert = await db.expenses.insert_one(exp_doc)
    exp_id = exp_insert.inserted_id

    # 4. transactions
    trans_doc = {
        "user_id": user_id,
        "expense_id": exp_id,
        "income_id": None,
        "type": "debit",
        "amount": 550.0,
        "merchant_name": "Domino's",
        "transaction_date": datetime.utcnow(),
        "payment_method": "UPI",
        "reference_number": "TXN987654321",
        "source": "manual",
        "status": "completed",
        "description": "Paid for pizza",
        "created_at": datetime.utcnow()
    }
    await db.transactions.insert_one(trans_doc)

    # 5. incomes
    inc_doc = {
        "user_id": user_id,
        "title": "Monthly Salary",
        "amount": 80000.0,
        "category": "Salary",
        "source": "Tech Corp",
        "income_date": datetime.utcnow(),
        "recurring": True,
        "description": "Salary for September",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    inc_insert = await db.incomes.insert_one(inc_doc)
    inc_id = inc_insert.inserted_id

    # 6. budgets
    budg_doc = {
        "user_id": user_id,
        "name": "September Food Budget",
        "category": "Food",
        "amount": 6000.0,
        "spent_amount": 550.0,
        "remaining_amount": 5450.0,
        "start_date": datetime.utcnow(),
        "end_date": datetime.utcnow(),
        "month": 9,
        "year": 2026,
        "predicted_amount": 5800.0,
        "status": "active",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    await db.budgets.insert_one(budg_doc)

    # 7. investments
    inv_doc = {
        "user_id": user_id,
        "type": "Stocks",
        "name": "Tech ETF",
        "invested_amount": 10000.0,
        "current_value": 11500.0,
        "expected_return": 15.0,
        "risk_level": "high",
        "start_date": datetime.utcnow(),
        "maturity_date": None,
        "notes": "Monthly SIP",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    await db.investments.insert_one(inv_doc)

    # 8. fraud_alerts
    fraud_doc = {
        "user_id": user_id,
        "transaction_id": inc_id, # Linking just for example
        "amount": 99999.0,
        "risk_score": 0.88,
        "model": "IsolationForest",
        "alert_level": "high",
        "reason": "Unusual high transaction",
        "is_reviewed": False,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    await db.fraud_alerts.insert_one(fraud_doc)

    # 9. notifications
    notif_doc = {
        "user_id": user_id,
        "title": "Welcome to FinMate",
        "message": "Your account has been set up.",
        "type": "system",
        "is_read": False,
        "scheduled_at": datetime.utcnow(),
        "read_at": None,
        "created_at": datetime.utcnow()
    }
    await db.notifications.insert_one(notif_doc)

    # 10. ocr_receipts
    ocr_doc = {
        "user_id": user_id,
        "expense_id": exp_id,
        "file_url": "https://s3.aws.com/receipt-123.jpg",
        "shop_name": "Domino's",
        "receipt_date": datetime.utcnow(),
        "subtotal": 500.0,
        "tax": 50.0,
        "total_amount": 550.0,
        "extracted_text": "DOMINO'S PIZZA ... TOTAL 550",
        "ocr_engine": "Tesseract",
        "confidence": 0.95,
        "created_at": datetime.utcnow()
    }
    await db.ocr_receipts.insert_one(ocr_doc)

    # 11. voice_history
    voice_doc = {
        "user_id": user_id,
        "audio_url": "https://s3.aws.com/voice-123.wav",
        "transcript": "Add a new expense of 550 for pizza",
        "response": "Expense of 550 added successfully under Food.",
        "speech_to_text_model": "Whisper-v3",
        "text_to_speech_model": "ElevenLabs",
        "duration": 5.2,
        "created_at": datetime.utcnow()
    }
    await db.voice_history.insert_one(voice_doc)

    # 12. chat_history
    chat_doc = {
        "user_id": user_id,
        "session_id": "session_999",
        "user_message": "How much did I spend this week?",
        "ai_response": "You spent 550 so far this week.",
        "model": "gpt-4-turbo",
        "tokens_used": 150,
        "created_at": datetime.utcnow()
    }
    await db.chat_history.insert_one(chat_doc)

    # 13. goals
    goal_doc = {
        "user_id": user_id,
        "name": "Buy a Laptop",
        "target_amount": 100000.0,
        "current_amount": 30000.0,
        "target_date": datetime.utcnow(),
        "status": "active",
        "description": "Saving for MacBook",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    goal_insert = await db.goals.insert_one(goal_doc)
    goal_id = goal_insert.inserted_id

    # 14. savings
    save_doc = {
        "user_id": user_id,
        "goal_id": goal_id,
        "amount": 5000.0,
        "saving_date": datetime.utcnow(),
        "source": "Salary transfer",
        "notes": "Added manually",
        "created_at": datetime.utcnow()
    }
    await db.savings.insert_one(save_doc)

    # 15. monthly_summaries
    mon_doc = {
        "user_id": user_id,
        "month": 9,
        "year": 2026,
        "total_income": 80000.0,
        "total_expense": 550.0,
        "total_savings": 5000.0,
        "total_investment": 10000.0,
        "predicted_expense": 25000.0,
        "financial_health_score": 85.0,
        "top_category": "Food",
        "category_breakdown": {"Food": 550.0},
        "ai_insights": ["You are doing great on savings!"],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    await db.monthly_summaries.insert_one(mon_doc)

    # 16. ai_predictions
    pred_doc = {
        "user_id": user_id,
        "prediction_type": "expense_category",
        "model_name": "finmate-cat-v1",
        "input_data": {"title": "Pizza", "amount": 550},
        "prediction": "Food",
        "confidence": 0.98,
        "prediction_date": datetime.utcnow(),
        "created_at": datetime.utcnow()
    }
    await db.ai_predictions.insert_one(pred_doc)

    # Create Indexes
    await db.users.create_index([("email", pymongo.ASCENDING)], unique=True)
    await db.expenses.create_index([("user_id", pymongo.ASCENDING), ("expense_date", pymongo.DESCENDING)])
    await db.monthly_summaries.create_index(
        [("user_id", pymongo.ASCENDING), ("year", pymongo.ASCENDING), ("month", pymongo.ASCENDING)],
        unique=True
    )
    
    print("Database seeding and index creation completed successfully!")

if __name__ == "__main__":
    asyncio.run(seed_data())
