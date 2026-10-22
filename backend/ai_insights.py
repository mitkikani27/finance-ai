"""AI Insights — generated, data-grounded observations for the dashboard."""
import finance_service as fs
import models
from ml.budget_forecaster import predict_month
from ml.health_score import compute
from datetime import date


def generate(db, user_id: int) -> list[dict]:
    today = date.today()
    series = fs.monthly_rollup(db, user_id, 6)
    this_m = next(s for s in series if s["month"] == f"{today.year:04d}-{today.month:02d}")
    prev = [s for s in series if s["month"] != this_m["month"]]
    last = prev[-1] if prev else None
    insights = []

    # MoM spend change
    if last and last["expense"] > 0:
        chg = (this_m["expense"] - last["expense"]) / last["expense"]
        if chg > 0.10:
            insights.append({
                "icon": "📈", "tone": "warning",
                "text": f"Spending is up {chg*100:.0f}% vs {last['label']} — worth a review before month-end.",
            })
        elif chg < -0.10:
            insights.append({
                "icon": "📉", "tone": "success",
                "text": f"Spending is down {abs(chg)*100:.0f}% vs {last['label']}. Nice control.",
            })

    # Forecast
    past = [s["expense"] for s in series if not s["partial"]]
    if len(past) >= 3:
        fc = predict_month(past)
        if this_m["expense"] > fc["upper"]:
            insights.append({
                "icon": "⚠️", "tone": "warning",
                "text": f"You're already at {this_m['expense']:,.0f} INR — above the AI-predicted range "
                        f"({fc['lower']:,.0f}–{fc['upper']:,.0f}) for this month.",
            })
        else:
            insights.append({
                "icon": "🔮", "tone": "info",
                "text": f"AI forecast for next month: {fc['forecast']:,.0f} INR "
                        f"({fc['trend_pct']:+}% vs last month, {fc['confidence']} confidence).",
            })

    # Top category
    cats = fs.category_breakdown(db, user_id, today.year, today.month)
    if cats and cats[0]["pct"] >= 35:
        insights.append({
            "icon": "🧭", "tone": "info",
            "text": f"{cats[0]['category']} is {cats[0]['pct']}% of your month's spend "
                    f"({cats[0]['amount']:,.0f} INR) — your biggest lever.",
        })

    # Budget overruns
    stats = fs.budget_stats(db, user_id, today.year, today.month)
    over = [b for b in stats if b["spent"] > b["limit"]]
    for b in over[:2]:
        insights.append({
            "icon": "🚨", "tone": "warning",
            "text": f"Over budget on {b['category']}: {b['spent']:,.0f}/{b['limit']:,.0f} INR "
                    f"(+{100*(b['spent']/b['limit']-1):.0f}%).",
        })

    # Fraud
    alerts = db.query(models.FraudAlert).filter(
        models.FraudAlert.user_id == user_id, models.FraudAlert.status == "new").count()
    if alerts:
        insights.append({"icon": "🛡️", "tone": "fraud",
                         "text": f"{alerts} suspicious transaction(s) awaiting review on the Fraud page."})

    # Health score
    emi = fs.emi_total(db, user_id, today.year, today.month)
    h = compute(this_m["income"], this_m["expense"], emi,
                fs.emergency_fund(db, user_id), this_m["expense"], stats)
    insights.append({
        "icon": "❤️", "tone": "success" if h["score"] >= 70 else "info",
        "text": f"Financial Health Score: {h['score']}/100 ({h['grade']}). {h['tips'][0]}",
    })

    # Savings rate
    if this_m["income"] > 0:
        sr = this_m["savings"] / this_m["income"]
        if sr >= 0.2:
            insights.append({"icon": "🏆", "tone": "success",
                             "text": f"Savings rate {sr*100:.0f}% this month — above the 20% goal. Keep it up!"})

    return insights[:6]
