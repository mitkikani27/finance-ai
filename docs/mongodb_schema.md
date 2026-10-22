# FinMate AI - MongoDB Collections and Sample Documents

This document outlines the MongoDB Compass-ready database schema for **FinMate AI**.

**Important Rule:** All user data collections are strictly isolated by `user_id`. The backend fetches the `_id` of the authenticated user (from the JWT) and applies it to every query.

## 1. users
**Indexes:** `{ email: 1 } (Unique)`

```json
{
  "_id": { "$oid": "651a2b3c4d5e6f7a8b9c0d1e" },
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password_hash": "$2b$12$Nq...hashed...password",
  "phone": "+1234567890",
  "google_id": null,
  "profile_image": "https://example.com/jane.jpg",
  "is_email_verified": true,
  "is_active": true,
  "role": "user",
  "created_at": { "$date": "2026-09-25T10:00:00Z" },
  "updated_at": { "$date": "2026-09-25T10:00:00Z" }
}
```

## 2. expenses
**Indexes:** `{ user_id: 1, expense_date: -1 }`

```json
{
  "_id": { "$oid": "651a2c3d4e5f6a7b8c9d0e1f" },
  "user_id": { "$oid": "651a2b3c4d5e6f7a8b9c0d1e" },
  "category_id": { "$oid": "651a2b3c4d5e6f7a8b9c0abc" },
  "title": "Swiggy",
  "description": "Lunch order",
  "amount": 450.0,
  "category": "Food",
  "merchant_name": "Swiggy",
  "expense_date": { "$date": "2026-09-25T12:30:00Z" },
  "payment_method": "UPI",
  "source": "manual",
  "ai_category": "Food & Dining",
  "ai_confidence": 0.98,
  "receipt_id": null,
  "notes": "Office lunch",
  "created_at": { "$date": "2026-09-25T12:35:00Z" },
  "updated_at": { "$date": "2026-09-25T12:35:00Z" }
}
```

## 3. transactions
**Indexes:** `{ user_id: 1, transaction_date: -1 }`

```json
{
  "_id": { "$oid": "651a2d3e4f5a6b7c8d9e0f1a" },
  "user_id": { "$oid": "651a2b3c4d5e6f7a8b9c0d1e" },
  "expense_id": { "$oid": "651a2c3d4e5f6a7b8c9d0e1f" },
  "income_id": null,
  "type": "debit",
  "amount": 450.0,
  "merchant_name": "Swiggy",
  "transaction_date": { "$date": "2026-09-25T12:30:00Z" },
  "payment_method": "UPI",
  "reference_number": "UPIRef123456",
  "source": "manual",
  "status": "completed",
  "description": "Swiggy order payment",
  "created_at": { "$date": "2026-09-25T12:35:00Z" }
}
```

## 4. incomes
**Indexes:** `{ user_id: 1, income_date: -1 }`

```json
{
  "_id": { "$oid": "651a2e3f4a5b6c7d8e9f0a1b" },
  "user_id": { "$oid": "651a2b3c4d5e6f7a8b9c0d1e" },
  "title": "Monthly Salary",
  "amount": 85000.0,
  "category": "Salary",
  "source": "Company XYZ",
  "income_date": { "$date": "2026-09-01T09:00:00Z" },
  "recurring": true,
  "description": "September Salary",
  "created_at": { "$date": "2026-09-01T09:05:00Z" },
  "updated_at": { "$date": "2026-09-01T09:05:00Z" }
}
```

## 5. budgets
**Indexes:** `{ user_id: 1, year: 1, month: 1 }`

```json
{
  "_id": { "$oid": "651a2f3a4b5c6d7e8f9a0b1c" },
  "user_id": { "$oid": "651a2b3c4d5e6f7a8b9c0d1e" },
  "name": "Food Budget",
  "category": "Food",
  "amount": 5000.0,
  "spent_amount": 450.0,
  "remaining_amount": 4550.0,
  "start_date": { "$date": "2026-09-01T00:00:00Z" },
  "end_date": { "$date": "2026-09-30T23:59:59Z" },
  "month": 9,
  "year": 2026,
  "predicted_amount": 5200.0,
  "status": "active",
  "created_at": { "$date": "2026-08-30T10:00:00Z" },
  "updated_at": { "$date": "2026-09-25T12:35:00Z" }
}
```

## 6. investments
**Indexes:** `{ user_id: 1 }`

```json
{
  "_id": { "$oid": "651a3a3b4c5d6e7f8a9b0c1d" },
  "user_id": { "$oid": "651a2b3c4d5e6f7a8b9c0d1e" },
  "type": "Mutual Fund",
  "name": "Index Fund XYZ",
  "invested_amount": 10000.0,
  "current_value": 10500.0,
  "expected_return": 12.0,
  "risk_level": "moderate",
  "start_date": { "$date": "2026-01-15T00:00:00Z" },
  "maturity_date": null,
  "notes": "SIP 10k per month",
  "created_at": { "$date": "2026-01-15T10:00:00Z" },
  "updated_at": { "$date": "2026-09-25T10:00:00Z" }
}
```

## 7. fraud_alerts
**Indexes:** `{ user_id: 1, created_at: -1 }`

```json
{
  "_id": { "$oid": "651a3b3c4d5e6f7a8b9c0d1e" },
  "user_id": { "$oid": "651a2b3c4d5e6f7a8b9c0d1e" },
  "transaction_id": { "$oid": "651a2d3e4f5a6b7c8d9e0f1a" },
  "amount": 45000.0,
  "risk_score": 0.89,
  "model": "Isolation Forest v1.2",
  "alert_level": "high",
  "reason": "Unusual amount at unexpected time",
  "is_reviewed": false,
  "created_at": { "$date": "2026-09-25T23:30:00Z" },
  "updated_at": { "$date": "2026-09-25T23:30:00Z" }
}
```

## 8. categories
```json
{
  "_id": { "$oid": "651a2b3c4d5e6f7a8b9c0abc" },
  "user_id": { "$oid": "651a2b3c4d5e6f7a8b9c0d1e" }, 
  "name": "Food",
  "type": "expense",
  "icon": "🍔",
  "color": "#FF5733",
  "is_default": true,
  "created_at": { "$date": "2026-01-01T00:00:00Z" }
}
```

## 9. notifications
**Indexes:** `{ user_id: 1, is_read: 1 }`

```json
{
  "_id": { "$oid": "651a4c5d6e7f8a9b0c1d2e3f" },
  "user_id": { "$oid": "651a2b3c4d5e6f7a8b9c0d1e" },
  "title": "Budget Alert",
  "message": "You have spent 90% of your Food budget.",
  "type": "budget_warning",
  "is_read": false,
  "scheduled_at": { "$date": "2026-09-25T12:35:00Z" },
  "read_at": null,
  "created_at": { "$date": "2026-09-25T12:35:00Z" }
}
```

## 10. ocr_receipts
**Indexes:** `{ user_id: 1, created_at: -1 }`
```json
{
  "_id": { "$oid": "651a5c6d7e8f9a0b1c2d3e4f" },
  "user_id": { "$oid": "651a2b3c4d5e6f7a8b9c0d1e" },
  "expense_id": { "$oid": "651a2c3d4e5f6a7b8c9d0e1f" },
  "file_url": "s3://bucket/receipts/12345.jpg",
  "shop_name": "Reliance Smart",
  "receipt_date": { "$date": "2026-09-24T18:00:00Z" },
  "subtotal": 1200.0,
  "tax": 60.0,
  "total_amount": 1260.0,
  "extracted_text": "RELIANCE SMART... TOTAL 1260.00",
  "ocr_engine": "Tesseract/AWS Textract",
  "confidence": 0.95,
  "created_at": { "$date": "2026-09-24T18:05:00Z" }
}
```

## 11. voice_history
**Indexes:** `{ user_id: 1, created_at: -1 }`
```json
{
  "_id": { "$oid": "651a6d7e8f9a0b1c2d3e4f5a" },
  "user_id": { "$oid": "651a2b3c4d5e6f7a8b9c0d1e" },
  "audio_url": "s3://bucket/voice/v_123.wav",
  "transcript": "Add 450 rupees for swiggy",
  "response": "Added 450 for Food to your expenses.",
  "speech_to_text_model": "Whisper-1",
  "text_to_speech_model": "ElevenLabs",
  "duration": 3.5,
  "created_at": { "$date": "2026-09-25T12:29:00Z" }
}
```

## 12. chat_history
**Indexes:** `{ user_id: 1, created_at: -1 }`
```json
{
  "_id": { "$oid": "651a7e8f9a0b1c2d3e4f5a6b" },
  "user_id": { "$oid": "651a2b3c4d5e6f7a8b9c0d1e" },
  "session_id": "sess_09876",
  "user_message": "How much have I spent on food this month?",
  "ai_response": "You have spent 450 on food this month out of your 5000 budget.",
  "model": "gpt-4-turbo",
  "tokens_used": 120,
  "created_at": { "$date": "2026-09-25T12:40:00Z" }
}
```

## 13. goals
**Indexes:** `{ user_id: 1 }`
```json
{
  "_id": { "$oid": "651a8f9a0b1c2d3e4f5a6b7c" },
  "user_id": { "$oid": "651a2b3c4d5e6f7a8b9c0d1e" },
  "name": "Buy a Car",
  "target_amount": 500000.0,
  "current_amount": 150000.0,
  "target_date": { "$date": "2028-01-01T00:00:00Z" },
  "status": "in_progress",
  "description": "Saving for a new hatchback",
  "created_at": { "$date": "2026-01-01T10:00:00Z" },
  "updated_at": { "$date": "2026-09-01T10:00:00Z" }
}
```

## 14. savings
**Indexes:** `{ user_id: 1, saving_date: -1 }`
```json
{
  "_id": { "$oid": "651a9a0b1c2d3e4f5a6b7c8d" },
  "user_id": { "$oid": "651a2b3c4d5e6f7a8b9c0d1e" },
  "goal_id": { "$oid": "651a8f9a0b1c2d3e4f5a6b7c" },
  "amount": 10000.0,
  "saving_date": { "$date": "2026-09-01T00:00:00Z" },
  "source": "salary_transfer",
  "notes": "September auto-savings",
  "created_at": { "$date": "2026-09-01T00:05:00Z" }
}
```

## 15. monthly_summaries
**Indexes:** `{ user_id: 1, year: 1, month: 1 } (Unique compound index)`
```json
{
  "_id": { "$oid": "651aa0b1c2d3e4f5a6b7c8d9" },
  "user_id": { "$oid": "651a2b3c4d5e6f7a8b9c0d1e" },
  "month": 9,
  "year": 2026,
  "total_income": 85000.0,
  "total_expense": 450.0,
  "total_savings": 10000.0,
  "total_investment": 10000.0,
  "predicted_expense": 45000.0,
  "financial_health_score": 85,
  "top_category": "Food",
  "category_breakdown": {
    "Food": 450.0,
    "Transport": 0.0
  },
  "ai_insights": [
    "Your savings rate is excellent this month.",
    "Consider moving 5000 more into your investments."
  ],
  "created_at": { "$date": "2026-09-25T13:00:00Z" },
  "updated_at": { "$date": "2026-09-25T13:00:00Z" }
}
```

## 16. ai_predictions
**Indexes:** `{ user_id: 1, created_at: -1 }`
```json
{
  "_id": { "$oid": "651ab1c2d3e4f5a6b7c8d9e0" },
  "user_id": { "$oid": "651a2b3c4d5e6f7a8b9c0d1e" },
  "prediction_type": "expense_category",
  "model_name": "finmate-cat-v2",
  "input_data": { 
    "title": "Swiggy", 
    "amount": 450 
  },
  "prediction": "Food",
  "confidence": 0.98,
  "prediction_date": { "$date": "2026-09-25T12:35:00Z" },
  "created_at": { "$date": "2026-09-25T12:35:00Z" }
}
```
