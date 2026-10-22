"""Shared analytics: monthly rollups used by dashboard, reports, AI insights."""
from datetime import date, datetime
from dateutil.relativedelta import relativedelta

import models

MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]


def month_key(d) -> str:
    if not d:
        return ""
    if isinstance(d, str):
        return d[:7]
    if isinstance(d, datetime):
        d = d.date()
    return f"{d.year:04d}-{d.month:02d}"


def last_n_months(n: int, today: date | None = None):
    today = today or date.today()
    out = []
    cur = date(today.year, today.month, 1)
    for _ in range(n):
        out.append((cur.year, cur.month))
        cur = cur - relativedelta(months=1)
    return list(reversed(out))


def monthly_rollup(db, user_id: int, n_months: int = 8) -> list[dict]:
    """Per-month income/expense/savings for the last n months (incl. current, partial)."""
    months = last_n_months(n_months)
    today = date.today()
    incomes = db.query(models.Income).filter(models.Income.user_id == user_id).all()
    expenses = db.query(models.Expense).filter(models.Expense.user_id == user_id).all()
    investments = db.query(models.Investment).filter(models.Investment.user_id == user_id).all()
    goals = db.query(models.Goal).filter(models.Goal.user_id == user_id).all()

    out = []
    for (y, m) in months:
        mk = f"{y:04d}-{m:02d}"
        inc = sum(i.amount for i in incomes if month_key(i.date) == mk)
        exp = sum(e.amount for e in expenses if month_key(e.date) == mk)
        inv = sum(i.amount for i in investments if month_key(i.start_date) == mk)
        
        is_partial = (y, m) == (today.year, today.month)
        out.append({
            "month": mk,
            "label": f"{MONTHS[m-1]} {str(y)[-2:]}",
            "income": round(inc, 2),
            "expense": round(exp, 2),
            "savings": round(inv, 2),
            "partial": is_partial,
        })
    return out


def category_breakdown(db, user_id: int, year: int, month: int) -> list[dict]:
    from_date = date(year, month, 1)
    to_date = from_date + relativedelta(months=1)
    rows = (
        db.query(models.Expense.category, models.Expense.amount)
        .filter(models.Expense.user_id == user_id,
                models.Expense.date >= from_date, models.Expense.date < to_date)
        .all()
    )
    agg: dict[str, float] = {}
    for cat, amt in rows:
        agg[cat] = agg.get(cat, 0) + amt
    total = sum(agg.values())
    return [
        {"category": c, "amount": round(v, 2),
         "pct": round(100 * v / total, 1) if total else 0.0}
        for c, v in sorted(agg.items(), key=lambda kv: -kv[1])
    ]


def totals(db, user_id: int):
    all_income = sum(r[0] for r in db.query(models.Income.amount).filter(models.Income.user_id == user_id).all())
    all_expense = sum(r[0] for r in db.query(models.Expense.amount).filter(models.Expense.user_id == user_id).all())
    invested = sum(r[0] for r in db.query(models.Investment.amount).filter(models.Investment.user_id == user_id).all())
    # cash_left = unspent income (NOT savings — savings only grows via investments)
    cash_left = all_income - all_expense - invested
    return {
        "total_income": round(all_income, 2),
        "total_expense": round(all_expense, 2),
        "net_balance": round(cash_left, 2),       # cash left / surplus
        "total_invested": round(invested, 2),     # true savings
        "savings": round(invested, 2),            # alias — income must never inflate this
    }


def current_month_category_spend(db, user_id: int) -> dict[str, float]:
    today = date.today()
    from_date = date(today.year, today.month, 1)
    rows = db.query(models.Expense.category, models.Expense.amount).filter(
        models.Expense.user_id == user_id, models.Expense.date >= from_date).all()
    agg: dict[str, float] = {}
    for cat, amt in rows:
        agg[cat] = agg.get(cat, 0) + amt
    return agg


def budget_stats(db, user_id: int, year: int, month: int):
    budgets = db.query(models.Budget).filter(models.Budget.user_id == user_id).all()
    spend = current_month_category_spend(db, user_id) if (year, month) == (date.today().year, date.today().month) else {}
    return [
        {"id": b.id, "category": b.category, "limit": b.monthly_limit, "spent": round(spend.get(b.category, 0), 2)}
        for b in budgets
    ]


def emi_total(db, user_id: int, year: int, month: int) -> float:
    from_date = date(year, month, 1)
    to_date = from_date + relativedelta(months=1)
    rows = db.query(models.Expense.amount).filter(
        models.Expense.user_id == user_id, models.Expense.category == "EMI",
        models.Expense.date >= from_date, models.Expense.date < to_date).all()
    return sum(r[0] for r in rows)


def emergency_fund(db, user_id: int) -> float:
    rows = db.query(models.Investment.amount).filter(
        models.Investment.user_id == user_id, models.Investment.inv_type == "Emergency Fund").all()
    return sum(r[0] for r in rows)
