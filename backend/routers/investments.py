"""Module 7 — Investments + AI suggestion + growth projection."""
import json
from datetime import date, datetime

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from models import Session

import auth as authlib
import finance_service as fs
import models
from database import get_db
from ml.advisor import investment_suggestions, project_growth

router = APIRouter(prefix="/api/investments", tags=["investments"])


class InvestmentIn(BaseModel):
    name: str
    inv_type: str = "Mutual Fund"
    amount: float
    monthly_inflow: float = 0
    expected_return: float = 12.0
    start_date: str
    note: str = ""


def _parse_date(s: str):
    return datetime.strptime(s[:10], "%Y-%m-%d").date()


@router.get("")
def list_investments(user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    rows = db.query(models.Investment).filter(models.Investment.user_id == user.id).all()
    return [{
        "id": r.id, "name": r.name, "inv_type": r.inv_type, "amount": r.amount,
        "monthly_inflow": r.monthly_inflow, "expected_return": r.expected_return,
        "start_date": r.start_date.isoformat(), "note": r.note,
    } for r in rows]


@router.post("")
def add_investment(body: InvestmentIn, user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    inv = models.Investment(user_id=user.id, name=body.name, inv_type=body.inv_type,
                            amount=body.amount, monthly_inflow=body.monthly_inflow,
                            expected_return=body.expected_return, start_date=_parse_date(body.start_date),
                            note=body.note)
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return {"id": inv.id}


@router.delete("/{inv_id}")
def delete_investment(inv_id: int, user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    inv = db.get(models.Investment, inv_id)
    if not inv or inv.user_id != user.id:
        raise HTTPException(404, "Investment not found")
    db.delete(inv)
    db.commit()
    return {"ok": True}


@router.get("/suggest")
def suggest(user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    """Module 7 — AI investment suggestion from real numbers."""
    today = date.today()
    # Prefer current (partial) month so freshly added income/spend shows up immediately
    series = fs.monthly_rollup(db, user.id, 3)
    this_key = f"{today.year:04d}-{today.month:02d}"
    ref = next((s for s in series if s["month"] == this_key), None) or series[-1]
    income, expense = ref["income"], ref["expense"]
    emi = fs.emi_total(db, user.id, today.year, today.month) or \
        (sum(r[0] for r in db.query(models.Expense.amount).filter(
            models.Expense.user_id == user.id, models.Expense.category == "EMI",
            models.Expense.date >= today - relativedelta(months=3)).all()) / 3)
    inv_rows = db.query(models.Investment).filter(models.Investment.user_id == user.id).all()
    portfolio = [{"amount": r.amount, "expected_return": r.expected_return,
                  "monthly_inflow": r.monthly_inflow} for r in inv_rows]
    try:
        profile = json.loads(user.profile or "{}")
    except json.JSONDecodeError:
        profile = {}
    return investment_suggestions(
        income=income, expense=expense, emi=emi,
        emergency_fund=fs.emergency_fund(db, user.id),
        risk=profile.get("risk_profile", "balanced"),
        age=int(profile.get("age", 30) or 30),
        portfolio=portfolio,
    )


@router.get("/projection")
def projection(years: int = Query(10, le=30), user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    rows = db.query(models.Investment).filter(models.Investment.user_id == user.id).all()
    data = [{"id": r.id, "amount": r.amount, "expected_return": r.expected_return,
             "monthly_inflow": r.monthly_inflow} for r in rows]
    return project_growth(data, years=years)
