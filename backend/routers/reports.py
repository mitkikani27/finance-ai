"""Reports: monthly summary + CSV export (professional finish)."""
import csv
import io
from datetime import date

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from models import Session

import auth as authlib
import finance_service as fs
import models
from database import get_db

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _month_range(month: str):
    y, m = int(month[:4]), int(month[5:7])
    return date(y, m, 1), date(y, m, 1) + relativedelta(months=1)


@router.get("/monthly")
def monthly(month: str | None = Query(None), user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    if not month:
        t = date.today()
        month = f"{t.year:04d}-{t.month:02d}"
    start, end = _month_range(month)
    incomes = db.query(models.Income).filter(models.Income.user_id == user.id,
                                             models.Income.date >= start, models.Income.date < end).all()
    expenses = db.query(models.Expense).filter(models.Expense.user_id == user.id,
                                               models.Expense.date >= start, models.Expense.date < end).all()
    # Savings = amount invested this month only (income add must NOT inflate savings)
    invested = sum(r[0] for r in db.query(models.Investment.amount).filter(
        models.Investment.user_id == user.id,
        models.Investment.start_date >= start, models.Investment.start_date < end).all())
    cats = fs.category_breakdown(db, user.id, start.year, start.month)
    total_i = sum(i.amount for i in incomes)
    total_e = sum(e.amount for e in expenses)
    return {
        "month": month,
        "income": {"total": round(total_i, 2), "items": [
            {"id": i.id, "source": i.source, "amount": i.amount, "date": i.date.isoformat()} for i in incomes]},
        "expense": {"total": round(total_e, 2),
                    "by_category": cats,
                    "items": [{"id": e.id, "category": e.category, "description": e.description,
                               "amount": e.amount, "date": e.date.isoformat()} for e in expenses]},
        "savings": round(invested, 2),
        "savings_rate": round(100 * invested / total_i, 1) if total_i else 0.0,
    }


@router.get("/export")
def export_csv(
    months: int = Query(6, le=24),
    user: models.User = Depends(authlib.get_current_user),
    db: Session = Depends(get_db),
):
    """CSV export: every income & expense line for the last N months."""
    today = date.today()
    cutoff = today - relativedelta(months=months)
    incomes = db.query(models.Income).filter(models.Income.user_id == user.id, models.Income.date >= cutoff).all()
    expenses = db.query(models.Expense).filter(models.Expense.user_id == user.id, models.Expense.date >= cutoff).all()

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["date", "type", "category_or_source", "description", "amount_inr", "payment_mode"])
    for e in sorted(expenses, key=lambda r: r.date):
        w.writerow([e.date.isoformat(), "expense", e.category, e.description, f"{e.amount:.2f}", e.payment_mode])
    for i in sorted(incomes, key=lambda r: r.date):
        w.writerow([i.date.isoformat(), "income", i.source, i.note, f"{i.amount:.2f}", ""])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=finmate-report-{today.isoformat()}.csv"},
    )
