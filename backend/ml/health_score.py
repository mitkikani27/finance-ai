"""Advanced feature — AI Financial Health Score (0–100).

Composite of four weighted signals:
  • Savings rate          (40%)
  • Debt-to-income (EMI)  (20%)
  • Emergency fund months (20%)
  • Budget adherence      (20%)
"""

def _clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


def compute(monthly_income, monthly_expense, emi_total, emergency_fund, avg_expense_3m, budget_stats,
            monthly_invested=0.0):
    """
    budget_stats: list of {category, limit, spent}
    monthly_invested: amount put into investments this month (NOT income−expense surplus)
    Returns {score, grade, components:[{name, score, max, note}], tips:[...]}
    """
    monthly_income = monthly_income or 0.0
    monthly_expense = monthly_expense or 0.0
    emi_total = emi_total or 0.0
    emergency_fund = emergency_fund or 0.0
    avg_expense_3m = avg_expense_3m or monthly_expense or 1.0
    monthly_invested = monthly_invested or 0.0

    tips, components = [], []

    # 1) Savings rate (40) — only money actually invested counts as savings
    if monthly_income > 0:
        sr = monthly_invested / monthly_income
    else:
        sr = 0.0 if monthly_invested <= 0 else 1.0
    sr_score = _clamp(sr / 0.3) * 40          # 30%+ of income invested = full marks
    components.append({
        "name": "Savings rate", "score": round(sr_score, 1), "max": 40,
        "note": f"{sr*100:.0f}% of income invested this month",
    })
    if monthly_income > 0 and monthly_expense > monthly_income:
        tips.append("You are spending more than you earn this month — pause non-essential categories.")
    elif sr < 0.2:
        need = max(0.0, (monthly_income * 0.2) - monthly_invested)
        tips.append(f"Try to invest at least 20% of income: park ₹{need:,.0f} more this month.")

    # 2) Debt-to-income (20)
    dti = emi_total / monthly_income if monthly_income else (1.0 if emi_total else 0.0)
    dti_score = (1 - _clamp(dti / 0.4)) * 20
    components.append({
        "name": "Debt-to-income", "score": round(dti_score, 1), "max": 20,
        "note": f"EMI = {dti*100:.0f}% of income",
    })
    if dti > 0.35:
        tips.append("EMIs are above 35% of income — consider prepaying the highest-interest loan.")

    # 3) Emergency fund (20)
    months = emergency_fund / avg_expense_3m if avg_expense_3m else 0
    ef_score = _clamp(months / 6) * 20
    components.append({
        "name": "Emergency fund", "score": round(ef_score, 1), "max": 20,
        "note": f"covers {months:.1f} months of expenses (target 6)",
    })
    if months < 6:
        tips.append(f"Emergency fund covers {months:.1f} of 6 target months — add ₹{max(0.0,(6-avg_expense_3m*months)/12*12):,.0f} total.")

    # 4) Budget adherence (20)
    if budget_stats:
        ratios = []
        for b in budget_stats:
            limit = b.get("limit") or 0
            if limit > 0:
                ratios.append(_clamp((b.get("spent", 0) - limit) / limit / 0.5))
        over = sum(ratios) / len(ratios)
        adh_score = (1 - over) * 20
        note = f"{sum(1 for b in budget_stats if (b.get('spent',0) or 0) > (b.get('limit') or 0))}/{len(budget_stats)} budgets over limit"
    else:
        adh_score, note = 0.0, "no budgets set yet"
    components.append({"name": "Budget adherence", "score": round(max(0.0, adh_score), 1), "max": 20, "note": note})
    if budget_stats:
        for b in budget_stats:
            if (b.get("limit") or 0) > 0 and (b.get("spent", 0) or 0) > b["limit"]:
                tips.append(f"Over budget on {b['category']}: ₹{(b.get('spent',0)-b['limit']):,.0f} over — review this category.")

    score = sum(c["score"] for c in components)
    if score >= 85:
        grade = "Excellent"
    elif score >= 70:
        grade = "Good"
    elif score >= 55:
        grade = "Fair"
    else:
        grade = "Needs Attention"
    if not tips:
        tips.append("Healthy finances — keep your saving streak and review quarterly.")

    return {"score": round(score, 1), "grade": grade, "components": components, "tips": tips[:5]}
