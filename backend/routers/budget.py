"""Module 5 — Budgets + AI budget prediction & smart recommendations."""
import calendar
import json
import os
from datetime import date
from dateutil.relativedelta import relativedelta

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


class BudgetUpdate(BaseModel):
    monthly_limit: float


class PresetIn(BaseModel):
    rule: str = "50-30-20"  # 50-30-20 | conservative | past-average
    custom_income: float | None = None


@router.get("")
def get_budgets(user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    today = date.today()
    days_in_month = calendar.monthrange(today.year, today.month)[1]
    days_passed = today.day
    days_left = max(1, days_in_month - days_passed + 1)

    # Calculate this month's income & total expenses
    month_str = f"{today.year:04d}-{today.month:02d}"
    incomes = db.query(models.Income).filter(models.Income.user_id == user.id).all()
    this_month_income = sum(i.amount for i in incomes if fs.month_key(i.date) == month_str)

    stats = fs.budget_stats(db, user.id, today.year, today.month)
    total_limit = sum(s["limit"] for s in stats)
    total_spent = sum(s["spent"] for s in stats)
    total_remaining = total_limit - total_spent

    budgets_list = []
    over_count = 0
    warning_count = 0
    safe_count = 0

    for s in stats:
        limit = s["limit"]
        spent = s["spent"]
        pct = round((100 * spent / limit), 1) if limit > 0 else 0.0
        remaining = round(limit - spent, 2)
        daily_budget = round(limit / days_in_month, 2) if days_in_month else 0.0
        daily_spent_avg = round(spent / max(1, days_passed), 2)
        daily_safe_remaining = round(max(0.0, remaining) / days_left, 2) if days_left > 0 else 0.0

        if spent > limit:
            status = "over"
            over_count += 1
        elif pct >= 80.0:
            status = "warning"
            warning_count += 1
        else:
            status = "safe"
            safe_count += 1

        budgets_list.append({
            "id": s["id"],
            "category": s["category"],
            "limit": round(limit, 2),
            "spent": round(spent, 2),
            "remaining": remaining,
            "pct": pct,
            "daily_budget": daily_budget,
            "daily_spent_avg": daily_spent_avg,
            "daily_safe_remaining": daily_safe_remaining,
            "status": status,
            "over_amount": round(spent - limit, 2) if spent > limit else 0.0,
        })

    # Sort: over budget first, then warning, then highest spent
    budgets_list.sort(key=lambda b: (-b["pct"], -b["spent"]))

    overall_pct = round(100 * total_spent / total_limit, 1) if total_limit else 0.0
    daily_safe_spend = round(max(0.0, total_remaining) / days_left, 2) if days_left > 0 else 0.0
    daily_actual_avg = round(total_spent / max(1, days_passed), 2)

    return {
        "budgets": budgets_list,
        "summary": {
            "total_limit": round(total_limit, 2),
            "total_spent": round(total_spent, 2),
            "total_remaining": round(total_remaining, 2),
            "overall_pct": overall_pct,
            "days_in_month": days_in_month,
            "days_passed": days_passed,
            "days_left": days_left,
            "daily_safe_spend": daily_safe_spend,
            "daily_actual_avg": daily_actual_avg,
            "income_this_month": round(this_month_income, 2),
            "over_count": over_count,
            "warning_count": warning_count,
            "safe_count": safe_count,
            "total_count": len(budgets_list),
            "month_label": today.strftime("%B %Y"),
        },
        # legacy fields for backwards compatibility
        "total_limit": round(total_limit, 2),
        "total_spent": round(total_spent, 2),
        "overall_pct": overall_pct,
    }


@router.post("")
def add_or_update_budget(body: BudgetIn, user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    if body.monthly_limit <= 0:
        raise HTTPException(400, "Monthly limit must be greater than 0")
    exists = db.query(models.Budget).filter(
        models.Budget.user_id == user.id, models.Budget.category == body.category
    ).first()
    if exists:
        exists.monthly_limit = round(body.monthly_limit, 2)
    else:
        db.add(models.Budget(user_id=user.id, category=body.category, monthly_limit=round(body.monthly_limit, 2)))
    db.commit()
    return {"ok": True, "category": body.category, "monthly_limit": body.monthly_limit}


@router.put("/{budget_id}")
def update_budget(budget_id: int, body: BudgetUpdate, user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    b = db.get(models.Budget, budget_id)
    if not b or b.user_id != user.id:
        raise HTTPException(404, "Budget not found")
    if body.monthly_limit <= 0:
        raise HTTPException(400, "Monthly limit must be greater than 0")
    b.monthly_limit = round(body.monthly_limit, 2)
    db.commit()
    return {"ok": True, "id": b.id, "monthly_limit": b.monthly_limit}


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
    while past_full and past_full[0] == 0:
        past_full.pop(0)
    result = predict_month(past_full)

    # Per-category forecast = last 3 full-month average
    by_cat = {}
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


@router.post("/apply-preset")
def apply_preset(body: PresetIn, user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    """Apply standard rule-based budget templates (e.g. 50/30/20)."""
    today = date.today()
    incomes = db.query(models.Income).filter(models.Income.user_id == user.id).all()
    month_str = f"{today.year:04d}-{today.month:02d}"
    inc = body.custom_income or sum(i.amount for i in incomes if fs.month_key(i.date) == month_str)

    if not inc or inc <= 0:
        # Fallback to average income or default baseline
        all_inc = [i.amount for i in incomes]
        inc = sum(all_inc) / max(1, len(all_inc)) if all_inc else 50000.0

    allocations = {}
    if body.rule == "50-30-20":
        # Needs: 50%
        needs = inc * 0.50
        allocations["Rent"] = round(needs * 0.40, -2)       # ~20% of income
        allocations["Groceries"] = round(needs * 0.25, -2)  # ~12.5% of income
        allocations["Utilities"] = round(needs * 0.12, -2)  # ~6% of income
        allocations["Medical"] = round(needs * 0.10, -2)    # ~5% of income
        allocations["Transport"] = round(needs * 0.13, -2)  # ~6.5% of income

        # Wants: 30%
        wants = inc * 0.30
        allocations["Food"] = round(wants * 0.40, -2)          # ~12% of income
        allocations["Shopping"] = round(wants * 0.25, -2)      # ~7.5% of income
        allocations["Entertainment"] = round(wants * 0.20, -2) # ~6% of income
        allocations["Fuel"] = round(wants * 0.15, -2)         # ~4.5% of income
    elif body.rule == "conservative":
        allocations["Food"] = round(inc * 0.10, -2)
        allocations["Groceries"] = round(inc * 0.10, -2)
        allocations["Rent"] = round(inc * 0.20, -2)
        allocations["Utilities"] = round(inc * 0.05, -2)
        allocations["Transport"] = round(inc * 0.05, -2)
        allocations["Shopping"] = round(inc * 0.05, -2)
        allocations["Entertainment"] = round(inc * 0.04, -2)
        allocations["Medical"] = round(inc * 0.05, -2)
    else:
        # Past 3 months average + 10% headroom
        today_date = date.today()
        avg_spend = {}
        for k in range(1, 4):
            ref = today_date - relativedelta(months=k)
            for c in fs.category_breakdown(db, user.id, ref.year, ref.month):
                avg_spend[c["category"]] = avg_spend.get(c["category"], 0) + c["amount"] / 3
        for cat, val in avg_spend.items():
            allocations[cat] = round(max(500.0, val * 1.10), -2)

    # Save to database
    applied = []
    for cat, limit in allocations.items():
        if limit <= 0:
            continue
        existing = db.query(models.Budget).filter(
            models.Budget.user_id == user.id, models.Budget.category == cat
        ).first()
        if existing:
            existing.monthly_limit = limit
        else:
            db.add(models.Budget(user_id=user.id, category=cat, monthly_limit=limit))
        applied.append({"category": cat, "limit": limit})

    db.commit()
    return {"ok": True, "rule": body.rule, "income_base": inc, "applied": applied}


@router.get("/ai-advice")
def budget_ai_advice(user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    """Get rich AI advice specifically tailored to user's budget situation."""
    today = date.today()
    stats = fs.budget_stats(db, user.id, today.year, today.month)
    total_limit = sum(s["limit"] for s in stats)
    total_spent = sum(s["spent"] for s in stats)
    over = [s for s in stats if s["spent"] > s["limit"]]
    warning = [s for s in stats if s["limit"] > 0 and s["spent"] >= s["limit"] * 0.8 and s["spent"] <= s["limit"]]

    gemini_key = os.getenv("GEMINI_API_KEY")
    if not gemini_key:
        return {"advice": "Spend wisely and review high-expense categories before month-end."}

    user_name = (user.full_name or "Dost").split()[0]
    prompt = (
        f"You are FinMate AI Budget Coach for user {user_name}.\n"
        f"User's current month budget overview:\n"
        f"- Total budget limit: ₹{total_limit:,.0f}\n"
        f"- Total spent so far: ₹{total_spent:,.0f}\n"
        f"- Over-budget categories: {', '.join([f'{s['category']} (spent ₹{s['spent']:,.0f} of ₹{s['limit']:,.0f})' for s in over]) or 'None'}\n"
        f"- High-spend categories near limit: {', '.join([f'{s['category']} (₹{s['spent']:,.0f}/₹{s['limit']:,.0f})' for s in warning]) or 'None'}\n\n"
        "Provide 3 concise, highly practical, motivating budget optimization tips in friendly Hinglish.\n"
        "Use bullet points with emojis, reference their exact categories, and give actionable solutions (e.g. meal prep, shopping freeze, rebalancing)."
    )

    try:
        from google import genai
        client = genai.Client(api_key=gemini_key)
        for m in ["gemini-3.5-flash", "gemini-3-flash-preview", "gemini-2.5-flash"]:
            try:
                resp = client.models.generate_content(model=m, contents=prompt)
                if resp and resp.text:
                    return {"advice": resp.text.strip(), "model": m}
            except Exception:
                continue
    except Exception:
        pass

    return {
        "advice": (
            f"💡 **FinMate AI Budget Tips for {user_name}:**\n\n"
            f"1. **Over-budget Alert:** Jiss category me limit cross ho chuki hai, usme agle hafte 'Zero-Spend' challenge lene ka try karein.\n"
            f"2. **Safe Daily Limit:** Baaki bache dino ke hisaab se apna daily spend limit me rakhein.\n"
            f"3. **50/30/20 Balance:** Essential kharche pehle clear karein aur discretionary shopping par 10 din ka hold lagayein."
        )
    }
