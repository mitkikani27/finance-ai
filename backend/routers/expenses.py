"""Module 2 — Expense Tracker + Module 4 — AI categorization hook."""
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from models import Session

import auth as authlib
import models
from database import get_db
from ml.expense_classifier import predict as ai_predict

router = APIRouter(prefix="/api/expenses", tags=["expenses"])


class ExpenseIn(BaseModel):
    category: str | None = None          # leave None → AI predicts
    description: str = ""
    amount: float
    date: str                            # YYYY-MM-DD
    payment_mode: str = "UPI"
    skip_fraud_check: bool = False
    original_amount: float | None = None
    original_currency: str | None = "INR"
    exchange_rate: float | None = 1.0


class ExpenseUpdate(BaseModel):
    category: str | None = None
    description: str | None = None
    amount: float | None = None
    date: str | None = None
    payment_mode: str | None = None
    original_amount: float | None = None
    original_currency: str | None = None
    exchange_rate: float | None = None


def _parse_date(s: str) -> date:
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "date must be YYYY-MM-DD")


@router.post("/predict-category")
def predict_category(body: dict, user: models.User = Depends(authlib.get_current_user)):
    """AI Module 4: merchant/description → category + confidence."""
    desc = (body.get("description") or "").strip()
    if not desc:
        raise HTTPException(400, "description is required")
    return ai_predict(desc)


@router.get("")
def list_expenses(
    month: str | None = Query(None),       # YYYY-MM
    category: str | None = Query(None),
    search: str | None = Query(None),
    limit: int = Query(200, le=1000),
    user: models.User = Depends(authlib.get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(models.Expense).filter(models.Expense.user_id == user.id)
    if month:
        y, m = int(month[:4]), int(month[5:7])
        q = q.filter(models.Expense.date >= date(y, m, 1))
        q = q.filter(models.Expense.date < date(y + (m == 12), (m % 12) + 1, 1))
    if category:
        q = q.filter(models.Expense.category == category)
    if search:
        q = q.filter(models.Expense.description.ilike(f"%{search}%"))
    rows = q.order_by(models.Expense.date.desc(), models.Expense.id.desc()).limit(limit).all()
    receipt_map = {r.expense_id: r.id for r in db.query(models.OCRReceipt)
                   .filter(models.OCRReceipt.user_id == user.id,
                           models.OCRReceipt.expense_id.isnot(None)).all()}
    return [{
        "id": r.id, "category": r.category, "description": r.description,
        "amount": r.amount, "date": r.date.isoformat(), "payment_mode": r.payment_mode,
        "ai_categorized": r.ai_categorized,
        "receipt_id": receipt_map.get(r.id),
        "original_amount": getattr(r, "original_amount", None),
        "original_currency": getattr(r, "original_currency", "INR") or "INR",
        "exchange_rate": getattr(r, "exchange_rate", 1.0) or 1.0,
    } for r in rows]


@router.post("")
def add_expense(body: ExpenseIn, user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    from ml.fraud_detector import check_transaction
    from routers.fraud import _create_alert

    exp_date = _parse_date(body.date)
    ai = None
    if not body.category:
        ai = ai_predict(body.description)
        category, ai_flag = ai["category"], True
    else:
        category, ai_flag = body.category, False

    if body.amount > 0:
        hist = db.query(models.Expense).filter(models.Expense.user_id == user.id).limit(60).all()
        history = [{"amount": h.amount, "date": h.date.isoformat(), "category": h.category} for h in hist]
        fraud = check_transaction(history, body.amount, body.description, category,
                                  datetime(exp_date.year, exp_date.month, exp_date.day, 12))
        if fraud["is_suspicious"] and not body.skip_fraud_check:
            _create_alert(db, user, fraud, description=body.description or category, amount=body.amount)

    exp = models.Expense(
        user_id=user.id, category=category, description=body.description.strip(),
        amount=body.amount, date=exp_date, payment_mode=body.payment_mode,
        ai_categorized=ai_flag,
        original_amount=body.original_amount,
        original_currency=body.original_currency or "INR",
        exchange_rate=body.exchange_rate or 1.0,
    )
    db.add(exp)
    db.commit()
    db.refresh(exp)
    return {
        "id": exp.id, "category": exp.category, "description": exp.description,
        "amount": exp.amount, "date": exp.date.isoformat(), "payment_mode": exp.payment_mode,
        "ai_categorized": exp.ai_categorized,
        "ai": ai,
        "original_amount": exp.original_amount,
        "original_currency": exp.original_currency,
        "exchange_rate": exp.exchange_rate,
    }


@router.put("/{expense_id}")
def update_expense(expense_id: int, body: ExpenseUpdate, user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    exp = db.get(models.Expense, expense_id)
    if not exp or exp.user_id != user.id:
        raise HTTPException(404, "Expense not found")
    if body.category is not None:
        exp.category = body.category
    if body.description is not None:
        exp.description = body.description
    if body.amount is not None:
        exp.amount = body.amount
    if body.date is not None:
        exp.date = _parse_date(body.date)
    if body.payment_mode is not None:
        exp.payment_mode = body.payment_mode
    if body.original_amount is not None:
        exp.original_amount = body.original_amount
    if body.original_currency is not None:
        exp.original_currency = body.original_currency
    if body.exchange_rate is not None:
        exp.exchange_rate = body.exchange_rate
    db.commit()
    return {"ok": True}


@router.delete("/{expense_id}")
def delete_expense(expense_id: int, user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    exp = db.get(models.Expense, expense_id)
    if not exp or exp.user_id != user.id:
        raise HTTPException(404, "Expense not found")
    db.delete(exp)
    db.commit()
    return {"ok": True}
