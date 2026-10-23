"""Modules 6 & 7 — Smart Saving Recommendations + Investment Suggestions.

Rule-based financial advisor (educational, NOT SEBI-registered advice).
Combines the user's actual numbers with a profile-appropriate benchmark
model to produce concrete, actionable recommendations.
"""

# benchmark average monthly spends by life-stage (INR, typical Indian metros)
BENCHMARKS = {
    "student":  {"Food": 4500, "Groceries": 2500, "Transport": 1200, "Entertainment": 1000, "Shopping": 2000, "Utilities": 600, "Fuel": 800},
    "employee": {"Food": 8000, "Groceries": 4000, "Transport": 2000, "Entertainment": 1500, "Shopping": 2500, "Utilities": 1500, "Fuel": 3000},
    "family":   {"Food": 12000, "Groceries": 8000, "Transport": 3500, "Entertainment": 2000, "Shopping": 4000, "Utilities": 2500, "Fuel": 5000},
    "business": {"Food": 9000, "Groceries": 5000, "Transport": 3000, "Entertainment": 2000, "Shopping": 3000, "Utilities": 2000, "Fuel": 4000},
}

ALLOCATION = {
    "conservative": [
        ("Emergency Fund (liquid)", 0.35, 7.0, "6-month safety net — top priority"),
        ("Fixed Deposit ladder", 0.30, 7.5, "capital safety, predictable returns"),
        ("Debt / Corporate Bond Fund", 0.20, 7.0, "stable income, low volatility"),
        ("Gold (SGB / ETF)", 0.10, 9.0, "inflation hedge"),
        ("Index Fund (Nifty 50)", 0.05, 12.0, "start equity exposure gently"),
    ],
    "balanced": [
        ("Index Fund SIP (Nifty 50)", 0.40, 12.0, "core long-term wealth engine"),
        ("Large & Mid Cap Fund SIP", 0.25, 13.5, "growth with managed risk"),
        ("Emergency Fund (liquid)", 0.15, 7.0, "6-month safety net"),
        ("Gold (SGB / ETF)", 0.10, 9.0, "inflation hedge"),
        ("PPF / ELSS (tax saving)", 0.10, 11.0, "long lock-in, tax efficiency"),
    ],
    "aggressive": [
        ("Index Fund SIP (Nifty 50)", 0.35, 12.0, "core wealth engine"),
        ("Mid & Small Cap SIP", 0.30, 15.0, "higher growth, higher volatility"),
        ("International Index Fund", 0.10, 11.0, "currency & market diversification"),
        ("Emergency Fund (liquid)", 0.10, 7.0, "safety net"),
        ("Gold (SGB / ETF)", 0.05, 9.0, "inflation hedge"),
        ("ELSS (tax saving)", 0.10, 12.0, "3-year lock-in, Section 80C"),
    ],
}

DISCLAIMER = ("Educational recommendation only — not personalised investment advice from a SEBI-registered adviser. "
              "Returns shown are historical assumptions; past performance does not guarantee future results.")


def saving_recommendations(profile_type, category_spend: dict):
    """Compare this month's category spend vs benchmarks → cut suggestions."""
    bench = BENCHMARKS.get(profile_type, BENCHMARKS["employee"])
    recs = []
    total_savings = 0.0
    for cat, limit in bench.items():
        spent = float(category_spend.get(cat, 0) or 0)
        if spent > limit:
            excess = spent - limit
            cut = round(excess * 0.4)          # suggest cutting 40% of excess
            total_savings += cut
            recs.append({
                "category": cat, "spent": round(spent), "benchmark": limit,
                "excess": round(excess), "suggested_cut": cut,
                "text": f"{cat}: you spent ₹{spent:,.0f} vs the typical ₹{limit:,.0f}. Cutting 40% of the excess saves ₹{cut:,.0f}/month.",
            })
    recs.sort(key=lambda r: -r["suggested_cut"])
    return {
        "profile": profile_type,
        "recommendations": recs[:6],
        "monthly_saving_potential": round(total_savings),
        "summary": (
            f"Aap realistically har mahine ₹{total_savings:,.0f} bacha sakte hain agar aap {profile_type} benchmark follow karein."
            if recs else "Kya baat hai! Aapka kharcha bilkul control me hai aur aapke profile ke benchmarks ke andar hi hai. Aise hi discipline banaye rakhein — bas ab apni bachat ko achhi jagah invest karna na bhoolein! 🎯"
        ),
    }


def portfolio_metrics(investments):
    """Amount-weighted return + 10y projection from the user's real holdings."""
    total = sum((inv.get("amount") or 0) for inv in investments)
    monthly_sip = sum((inv.get("monthly_inflow") or 0) for inv in investments)
    if total <= 0 and monthly_sip <= 0:
        return {
            "weighted_return_pct": 0.0,
            "projected_10y": 0.0,
            "monthly_sip": 0.0,
            "total_invested": 0.0,
            "weighted_return_source": "your portfolio",
        }
    # Prefer amount-weighted; if only SIPs exist, use equal weight on returns
    if total > 0:
        wr = sum((inv.get("amount") or 0) * (inv.get("expected_return") or 12.0)
                 for inv in investments) / total
    else:
        wr = sum((inv.get("expected_return") or 12.0) for inv in investments) / max(1, len(investments))
    proj = project_growth(investments, years=10)
    return {
        "weighted_return_pct": round(wr, 1),
        "projected_10y": round(proj["points"][-1]["value"]),
        "monthly_sip": round(monthly_sip),
        "total_invested": round(total, 2),
        "weighted_return_source": "your portfolio",
    }


def investment_suggestions(income, expense, emi, emergency_fund, risk="balanced", age=30,
                           portfolio=None):
    """Profile-based allocation of the investable surplus.

    `expense` is the month's TOTAL spend (EMI included), so EMI must NOT be
    subtracted again here — double-counting shrank the surplus for everyone.
    `emi` stays in the signature for display/back-compat.

    When the user already has investments, weighted return + 10y projection
    come from the portfolio (so KPIs are never blank after investing).
    """
    # surplus = income − spend (EMI already inside expense); keep emi for UI label
    investable = max(0.0, income - expense)
    avg_expense = expense or 1.0
    ef_target = 6 * avg_expense
    ef_gap = max(0.0, ef_target - emergency_fund)
    profile = (risk if risk in ALLOCATION else "balanced")
    portfolio = portfolio or []

    base = {
        "investable": round(investable),
        "income": round(income or 0),
        "expense": round(expense or 0),
        "emi": round(emi or 0),
        "emergency_fund_target": round(ef_target),
        "emergency_fund_gap": round(ef_gap),
        "risk_profile": profile,
        "weighted_return_pct": 0.0,
        "projected_10y": 0.0,
        "monthly_sip": 0.0,
        "weighted_return_source": "suggestion",
        "disclaimer": DISCLAIMER,
    }

    # Prefer live portfolio numbers whenever the user has holdings
    if any((inv.get("amount") or 0) or (inv.get("monthly_inflow") or 0) for inv in portfolio):
        base.update(portfolio_metrics(portfolio))

    if investable <= 0:
        base["steps"] = [
            "Income does not cover expenses + EMI yet.",
            "Focus on Module 6 suggestions to free up surplus before investing.",
        ]
        return base

    # 1) fill emergency fund gap first (capped at 40% of investable)
    ef_alloc = min(ef_gap / 12, investable * 0.4) if ef_gap > 0 else 0.0
    core = investable - ef_alloc

    allocation = []
    for name, share, ret, why in ALLOCATION[profile]:
        if name.startswith("Emergency Fund"):
            continue  # handled above
        amount = round(core * share)
        if amount <= 0:
            continue
        allocation.append({"name": name, "amount": amount, "expected_return_pct": ret, "rationale": why})

    if ef_alloc > 0:
        allocation.insert(0, {
            "name": "Emergency Fund (liquid)", "amount": round(ef_alloc),
            "expected_return_pct": 7.0,
            "rationale": f"fills the gap to 6 months of expenses (target ₹{ef_target:,.0f}, current ₹{emergency_fund:,.0f})",
        })

    # Suggested SIP projection only when we don't already have portfolio metrics
    if base.get("weighted_return_source") != "your portfolio":
        weighted_ret = sum(a["amount"] * a["expected_return_pct"] for a in allocation) / max(1.0, sum(a["amount"] for a in allocation))
        monthly = sum(a["amount"] for a in allocation)
        i = weighted_ret / 100 / 12
        n = 12 * 10
        projected_10y = monthly * (((1 + i) ** n - 1) / i) if i > 0 else monthly * n
        base["weighted_return_pct"] = round(weighted_ret, 1)
        base["projected_10y"] = round(projected_10y)
        base["monthly_sip"] = monthly
        base["weighted_return_source"] = "suggestion"

    base["allocation"] = allocation
    base["steps"] = [
        "Set up auto-debit SIPs on the 2nd of each month (before rent habits form).",
        "Keep the emergency fund in a liquid fund / instant-access savings.",
        "Review allocation every 6 months; step up SIPs by 10% with salary hikes.",
    ]
    return base


def project_growth(investments, years=10, monthly=0.0, custom_rate=None):
    """Month-by-month projected portfolio value, invested principal, and returns gain.

    `monthly` = optional what-if extra SIP added on top of the instruments'
    own monthly inflows.
    `custom_rate` = optional user-selected annual return rate (%) to override default.
    """
    total_value = 0.0
    weighted = 0.0
    flows = 0.0
    for inv in investments:
        amt = inv.get("amount") or 0
        r = (inv.get("expected_return") or 12.0) / 100 / 12
        total_value += amt
        weighted += amt * r
        flows += inv.get("monthly_inflow") or 0

    if custom_rate is not None and float(custom_rate) > 0:
        rate = (float(custom_rate) / 100) / 12
        effective_annual_rate = round(float(custom_rate), 1)
    else:
        rate = (weighted / total_value) if total_value > 0 else 0.12 / 12
        effective_annual_rate = round(rate * 12 * 100, 1)

    points = [{
        "month": 0,
        "value": round(total_value),
        "invested": round(total_value),
        "gain": 0
    }]
    value = total_value
    for m in range(1, years * 12 + 1):
        value = value * (1 + rate) + flows + monthly
        invested = total_value + (flows + monthly) * m
        gain = max(0.0, value - invested)
        points.append({
            "month": m,
            "value": round(value),
            "invested": round(invested),
            "gain": round(gain)
        })

    # Return sampled points (every 6 months + last month)
    sampled = points[::6]
    if not sampled or sampled[-1]["month"] != points[-1]["month"]:
        sampled.append(points[-1])

    final_invested = round(total_value + (flows + monthly) * 12 * years)
    final_value = round(value)
    final_gain = max(0, final_value - final_invested)
    return {
        "current_value": round(total_value),
        "annual_rate": effective_annual_rate,
        "total_invested": final_invested,
        "total_gain": final_gain,
        "final_value": final_value,
        "return_multiplier": round(final_value / max(1, final_invested), 2),
        "points": sampled
    }
