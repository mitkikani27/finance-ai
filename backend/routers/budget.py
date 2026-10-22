"""Module 5 — Budgets + AI budget prediction."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from models import Session

import auth as authlib
import finance_service as fs
import models
from database import get_db
from ml.budget_forecaster import predict_month

router = APIRouter(prefix="/api/budget", tags=["budget"])


class BudgetIn(BaseModel):
    category: str
    monthly_limit: float


@router.get("")
def get_budgets(user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    today = date.today()
    stats = fs.budget_stats(db, user.id, today.year, today.month)
    total_limit = sum(s["limit"] for s in stats)
    total_spent = sum(s["spent"] for s in stats)
    return {
        "budgets": [{**s, "pct": round(100 * s["spent"] / s["limit"], 1) if s["limit"] else 0,
                     "remaining": round(s["limit"] - s["spent"], 2)} for s in stats],
        "total_limit": round(total_limit, 2),
        "total_spent": round(total_spent, 2),
        "overall_pct": round(100 * total_spent / total_limit, 1) if total_limit else 0,
    }


@router.post("")
def add_budget(body: BudgetIn, user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    if body.monthly_limit <= 0:
        raise HTTPException(400, "monthly_limit must be positive")
    exists = db.query(models.Budget).filter(
        models.Budget.user_id == user.id, models.Budget.category == body.category).first()
    if exists:
        exists.monthly_limit = body.monthly_limit
    else:
        db.add(models.Budget(user_id=user.id, category=body.category, monthly_limit=body.monthly_limit))
    db.commit()
    return {"ok": True}


@router.delete("/{budget_id}")
def delete_budget(budget_id: int, user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    b = db.get(models.Budget, budget_id)
    if not b or b.user_id != user.id:
        raise HTTPException(404, "Budget not found")
    db.delete(b)
    db.commit()
    return {"ok": True}


@router.post("/predict")
def predict_next_month(user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    """AI prediction of next month's total + per-category expectations."""
    series = fs.monthly_rollup(db, user.id, 9)
    past_full = [s["expense"] for s in series if not s["partial"]]
    while past_full and past_full[0] == 0:   # trim months before tracking began
        past_full.pop(0)
    result = predict_month(past_full)

    # per-category forecast = last 3 full-month average (simple, explainable)
    by_cat = {}
    from dateutil.relativedelta import relativedelta
    today = date.today()
    for k in range(1, 4):
        ref = today - relativedelta(months=k)
        for c in fs.category_breakdown(db, user.id, ref.year, ref.month):
            by_cat[c["category"]] = by_cat.get(c["category"], 0) + c["amount"] / 3
    result["by_category"] = [
        {"category": c, "forecast": round(v, 2)} for c, v in sorted(by_cat.items(), key=lambda kv: -kv[1])
    ]
    result["data_points"] = len(past_full)
    return result
