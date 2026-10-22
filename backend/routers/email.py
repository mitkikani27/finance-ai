"""Send monthly-report and budget-alert emails (JWT required)."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from models import Session

import ai_insights
import auth as authlib
import email_service
import email_templates
import finance_service as fs
import models
from database import get_db
from routers.reports import _month_range

router = APIRouter(prefix="/api/email", tags=["email"])


@router.post("/monthly-report")
def send_monthly_report(
    month: str | None = Query(None),
    user: models.User = Depends(authlib.get_current_user),
    db: Session = Depends(get_db),
):
    if not month:
        t = date.today()
        month = f"{t.year:04d}-{t.month:02d}"
    start, end = _month_range(month)
    incomes = db.query(models.Income).filter(
        models.Income.user_id == user.id, models.Income.date >= start, models.Income.date < end).all()
    expenses = db.query(models.Expense).filter(
        models.Expense.user_id == user.id, models.Expense.date >= start, models.Expense.date < end).all()
    cats = fs.category_breakdown(db, user.id, start.year, start.month)
    total_i = sum(i.amount for i in incomes)
    total_e = sum(e.amount for e in expenses)
    by_category = {c["category"]: c["amount"] for c in cats}

    insights = []
    for item in ai_insights.generate(db, user.id):
        text = item.get("text") if isinstance(item, dict) else str(item)
        if text:
            insights.append(text)
    if not insights:
        insights = [
            "Keep tracking income and expenses every week.",
            "Setting up automatic investments could grow savings faster.",
        ]

    label = date(start.year, start.month, 1).strftime("%B %Y")
    html = email_templates.monthly_report_html(
        user_name=user.full_name,
        month=label,
        stats={"totalIncome": total_i, "totalExpenses": total_e, "byCategory": by_category},
        insights=insights,
    )
    try:
        result = email_service.send_email(
            user.email, f"Your Monthly Financial Report — {label}", html)
    except Exception as e:
        raise HTTPException(502, f"Email send failed: {e}")
    return {**result, "to": user.email, "type": "monthly-report", "month": month}


@router.post("/budget-alert")
def send_budget_alert(
    user: models.User = Depends(authlib.get_current_user),
    db: Session = Depends(get_db),
):
    today = date.today()
    stats = fs.budget_stats(db, user.id, today.year, today.month)
    total_limit = sum(s["limit"] for s in stats)
    total_spent = sum(s["spent"] for s in stats)
    if total_limit <= 0:
        raise HTTPException(400, "Set at least one budget before sending an alert.")
    pct = 100 * total_spent / total_limit
    html = email_templates.budget_alert_html(
        user_name=user.full_name,
        percentage_used=pct,
        budget_amount=total_limit,
        total_expenses=total_spent,
    )
    try:
        result = email_service.send_email(user.email, "Budget Alert — FinMate AI", html)
    except Exception as e:
        raise HTTPException(502, f"Email send failed: {e}")
    return {
        **result,
        "to": user.email,
        "type": "budget-alert",
        "percentageUsed": round(pct, 1),
        "budgetAmount": round(total_limit, 2),
        "totalExpenses": round(total_spent, 2),
    }
