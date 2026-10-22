"""Module 11 — Dashboard aggregation endpoint."""
from datetime import date

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends
from models import Session

import auth as authlib
import ai_insights
import finance_service as fs
import models
from database import get_db
from ml.advisor import project_growth
from ml.health_score import compute

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("")
def dashboard(user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    today = date.today()
    series = fs.monthly_rollup(db, user.id, 8)
    this_m = next(s for s in series if s["month"] == f"{today.year:04d}-{today.month:02d}")
    totals = fs.totals(db, user.id)
    cats = fs.category_breakdown(db, user.id, today.year, today.month)
    budgets = fs.budget_stats(db, user.id, today.year, today.month)
    emi = fs.emi_total(db, user.id, today.year, today.month)
    ef = fs.emergency_fund(db, user.id)
    health = compute(this_m["income"], this_m["expense"], emi, ef, this_m["expense"], budgets,
                     monthly_invested=this_m["savings"])

    inv_rows = db.query(models.Investment).filter(models.Investment.user_id == user.id).all()
    projection = project_growth(
        [{"id": r.id, "amount": r.amount, "expected_return": r.expected_return,
          "monthly_inflow": r.monthly_inflow} for r in inv_rows], years=10)

    recent = db.query(models.Expense).filter(models.Expense.user_id == user.id) \
        .order_by(models.Expense.date.desc(), models.Expense.id.desc()).limit(8).all()

    fraud_new = db.query(models.FraudAlert).filter(
        models.FraudAlert.user_id == user.id, models.FraudAlert.status == "new").count()

    # upcoming bills: recurring categories (EMI, Rent) last month → next due on 1st/5th
    upcoming = []
    last_month = today - relativedelta(months=1)
    for label, cat, due_day in [("Rent", "Rent", 1), ("EMI(s)", "EMI", 5)]:
        amt = sum(r[0] for r in db.query(models.Expense.amount).filter(
            models.Expense.user_id == user.id, models.Expense.category == cat,
            models.Expense.date >= last_month - relativedelta(months=1),
            models.Expense.date <= last_month).all())
        if amt > 0:
            base = date(today.year, today.month, min(due_day, 28))
            if base < today:
                base = base + relativedelta(months=1)
            upcoming.append({"name": label, "due": base.isoformat(), "approx": round(amt, 2)})

    return {
        "month": this_m,
        "totals": totals,
        "categories": cats,
        "monthly_series": series,
        "budgets": [{**b, "pct": round(100 * b["spent"] / b["limit"], 1) if b["limit"] else 0} for b in budgets],
        "health": health,
        "investment_projection": projection,
        "recent_expenses": [{
            "id": r.id, "category": r.category, "description": r.description,
            "amount": r.amount, "date": r.date.isoformat(),
        } for r in recent],
        "fraud_new": fraud_new,
        "upcoming_bills": upcoming,
        "ai_insights": ai_insights.generate(db, user.id),
    }

@router.get("/trends")
def trends(period: str = "month", user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    """Income/expense trend with user-selectable granularity:
    D = last 14 days daily · W = last 8 weeks weekly · M = last 8 months · Y = calendar years."""
    from collections import defaultdict
    from datetime import timedelta

    today = date.today()
    period = period.lower()

    def bucketize(rows_e, rows_i, rows_inv, key_fn, labels):
        exp = defaultdict(float); inc = defaultdict(float); inv = defaultdict(float)
        for r in rows_e: exp[key_fn(r.date)] += float(r.amount)
        for r in rows_i: inc[key_fn(r.date)] += float(r.amount)
        for r in rows_inv: inv[key_fn(r.start_date)] += float(r.amount)
        return [{"label": lab, "income": round(inc.get(k, 0), 2),
                 "expense": round(exp.get(k, 0), 2),
                 "savings": round(inv.get(k, 0), 2)}
                for k, lab in labels]

    if period in ("d", "day", "daily"):
        start = today - timedelta(days=13)
        e = db.query(models.Expense).filter(models.Expense.user_id == user.id, models.Expense.date >= start).all()
        i = db.query(models.Income).filter(models.Income.user_id == user.id, models.Income.date >= start).all()
        invs = db.query(models.Investment).filter(models.Investment.user_id == user.id, models.Investment.start_date >= start).all()
        days = [(start + timedelta(days=n)) for n in range(14)]
        series = bucketize(e, i, invs, lambda d: d.isoformat(),
                           [(d.isoformat(), d.strftime("%d %b")) for d in days])
        return {"period": "day", "series": series}

    if period in ("w", "week", "weekly"):
        start = today - timedelta(weeks=8)
        e = db.query(models.Expense).filter(models.Expense.user_id == user.id, models.Expense.date >= start).all()
        i = db.query(models.Income).filter(models.Income.user_id == user.id, models.Income.date >= start).all()
        invs = db.query(models.Investment).filter(models.Investment.user_id == user.id, models.Investment.start_date >= start).all()
        def wk(d): return (d - timedelta(days=d.weekday())).isoformat()
        weeks, seen = [], set()
        for n in range(7, -1, -1):
            wd = today - timedelta(weeks=n)
            k = wk(wd)
            if k not in seen:
                seen.add(k); weeks.append((k, "Wk " + k[5:10]))
        series = bucketize(e, i, invs, wk, weeks)
        return {"period": "week", "series": series}

    if period in ("y", "year", "yearly"):
        e = db.query(models.Expense).filter(models.Expense.user_id == user.id).all()
        i = db.query(models.Income).filter(models.Income.user_id == user.id).all()
        invs = db.query(models.Investment).filter(models.Investment.user_id == user.id).all()
        years = sorted({r.date.year for r in e} | {r.date.year for r in i} | {r.start_date.year for r in invs}) or [today.year]
        series = bucketize(e, i, invs, lambda d: str(d.year), [(str(y), str(y)) for y in years])
        return {"period": "year", "series": series}

    series = fs.monthly_rollup(db, user.id, 8)
    return {"period": "month", "series": series}
