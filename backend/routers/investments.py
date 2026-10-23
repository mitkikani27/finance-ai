"""Module 7 — Investments + AI suggestion + growth projection + AI Portfolio Review."""
import json
import os
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
    last_sip_date: str | None = None
    note: str = ""


class InvestmentUpdate(BaseModel):
    name: str | None = None
    inv_type: str | None = None
    amount: float | None = None
    monthly_inflow: float | None = None
    expected_return: float | None = None
    start_date: str | None = None
    last_sip_date: str | None = None
    note: str | None = None


class ExecuteSipIn(BaseModel):
    inv_id: int | None = None
    force: bool = False


def _parse_date(s: str):
    return datetime.strptime(s[:10], "%Y-%m-%d").date()


@router.get("")
def list_investments(user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    rows = db.query(models.Investment).filter(models.Investment.user_id == user.id).all()
    total_val = sum(r.amount for r in rows)
    total_sip = sum(r.monthly_inflow for r in rows)
    today = date.today()
    current_month_key = f"{today.year:04d}-{today.month:02d}"

    return [{
        "id": r.id,
        "name": r.name,
        "inv_type": r.inv_type,
        "amount": r.amount,
        "monthly_inflow": r.monthly_inflow,
        "expected_return": r.expected_return,
        "start_date": r.start_date.isoformat() if hasattr(r.start_date, "isoformat") else str(r.start_date or ""),
        "last_sip_date": str(r.last_sip_date or "") if hasattr(r, "last_sip_date") else "",
        "is_debited_this_month": (str(getattr(r, "last_sip_date", "") or "")[:7] == current_month_key),
        "note": r.note or "",
        "share_pct": round((r.amount / total_val * 100), 1) if total_val > 0 else 0.0,
    } for r in rows]


@router.post("")
def add_investment(body: InvestmentIn, user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    inv = models.Investment(
        user_id=user.id,
        name=body.name,
        inv_type=body.inv_type,
        amount=body.amount,
        monthly_inflow=body.monthly_inflow,
        expected_return=body.expected_return,
        start_date=_parse_date(body.start_date),
        last_sip_date=body.last_sip_date,
        note=body.note,
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return {"id": inv.id}


@router.put("/{inv_id}")
def update_investment(inv_id: int, body: InvestmentUpdate, user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    inv = db.get(models.Investment, inv_id)
    if not inv or inv.user_id != user.id:
        raise HTTPException(404, "Investment not found")
    if body.name is not None:
        inv.name = body.name
    if body.inv_type is not None:
        inv.inv_type = body.inv_type
    if body.amount is not None:
        inv.amount = body.amount
    if body.monthly_inflow is not None:
        inv.monthly_inflow = body.monthly_inflow
    if body.expected_return is not None:
        inv.expected_return = body.expected_return
    if body.start_date is not None:
        inv.start_date = _parse_date(body.start_date)
    if body.last_sip_date is not None:
        inv.last_sip_date = body.last_sip_date
    if body.note is not None:
        inv.note = body.note
    db.commit()
    return {"ok": True, "id": inv.id}


@router.post("/execute-sip")
def execute_sip(
    body: ExecuteSipIn | None = None,
    user: models.User = Depends(authlib.get_current_user),
    db: Session = Depends(get_db)
):
    """Monthly SIP Auto-Execution Engine:
    - Adds monthly_inflow amount directly into investment balance.
    - Records an Expense of category 'Investment' with Auto-Debit, deducting from available monthly income.
    - Updates last_sip_date to prevent duplicate debits.
    """
    today = date.today()
    current_month_key = f"{today.year:04d}-{today.month:02d}"
    force = body.force if body else False
    target_id = body.inv_id if body else None

    query = db.query(models.Investment).filter(
        models.Investment.user_id == user.id,
        models.Investment.monthly_inflow > 0
    )
    if target_id:
        query = query.filter(models.Investment.id == target_id)

    rows = query.all()
    executed = []
    total_debited = 0.0

    for inv in rows:
        last_month = str(getattr(inv, "last_sip_date", "") or "")[:7]
        if force or last_month != current_month_key:
            sip_amount = float(inv.monthly_inflow or 0)
            if sip_amount <= 0:
                continue

            # 1. Add SIP installment into investment holding
            inv.amount = round(float(inv.amount or 0) + sip_amount, 2)
            inv.last_sip_date = current_month_key

            # 2. Record Expense (removes/deducts from monthly income & balance)
            exp = models.Expense(
                user_id=user.id,
                category="Investment",
                description=f"Auto-SIP: {inv.name}",
                amount=sip_amount,
                date=today,
                payment_mode="Auto-Debit",
                ai_categorized=False,
            )
            db.add(exp)

            # 3. Create Notification
            notif = models.Notification(
                user_id=user.id,
                title="Monthly SIP Executed 🔄",
                body=f"₹{sip_amount:,.0f} SIP for '{inv.name}' added to investment & deducted from monthly income.",
                ntype="success",
                read=False,
            )
            db.add(notif)

            total_debited += sip_amount
            executed.append({
                "id": inv.id,
                "name": inv.name,
                "amount": sip_amount,
                "new_total": inv.amount,
                "month": current_month_key
            })

    if executed:
        db.commit()

    return {
        "ok": True,
        "count": len(executed),
        "total_debited": round(total_debited, 2),
        "month": current_month_key,
        "executed": executed,
        "message": f"Successfully executed {len(executed)} SIP(s) totaling ₹{total_debited:,.0f}" if executed else "All monthly SIPs are already executed for this month!"
    }


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
def projection(
    years: int = Query(10, le=30),
    monthly: float = Query(0.0),
    rate: float | None = Query(None),
    user: models.User = Depends(authlib.get_current_user),
    db: Session = Depends(get_db)
):
    rows = db.query(models.Investment).filter(models.Investment.user_id == user.id).all()
    data = [{"id": r.id, "amount": r.amount, "expected_return": r.expected_return,
             "monthly_inflow": r.monthly_inflow} for r in rows]
    return project_growth(data, years=years, monthly=monthly, custom_rate=rate)


@router.post("/ai-review")
def ai_review(user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    """Gemini 3.5 Flash powered deep portfolio review & diversification analysis."""
    rows = db.query(models.Investment).filter(models.Investment.user_id == user.id).all()
    total_val = sum(r.amount for r in rows)
    total_sip = sum(r.monthly_inflow for r in rows)

    gemini_key = os.getenv("GEMINI_API_KEY")
    user_name = (user.full_name or "Investor").split()[0]

    holdings_summary = [
        f"- {r.name} ({r.inv_type}): Value ₹{r.amount:,.0f}, SIP ₹{r.monthly_inflow:,.0f}/mo, Exp. Return {r.expected_return}%"
        for r in rows
    ]

    prompt = (
        f"You are FinMate Chief Investment Officer & wealth advisor in India for user {user_name}.\n"
        f"USER PORTFOLIO SUMMARY:\n"
        f"- Total Portfolio Value: ₹{total_val:,.0f}\n"
        f"- Total Monthly SIP: ₹{total_sip:,.0f}\n"
        f"- Holdings:\n" + ("\n".join(holdings_summary) if holdings_summary else "No current holdings recorded.") + "\n\n"
        "Provide a sharp, motivating, and highly practical portfolio review in conversational Hinglish.\n"
        "Include:\n"
        "1. 🎯 **Asset Allocation Verdict**: (Is it diversified across Equity, Debt, Gold, Emergency Fund?)\n"
        "2. 💡 **Top 3 Actionable Recommendations**: (Specific steps to increase wealth and manage risk)\n"
        "3. 🔮 **10-Year Wealth Outlook**: Encouraging compounding insight.\n"
        "Keep it under 150 words, structured with emojis and bullet points."
    )

    if gemini_key:
        try:
            from google import genai
            client = genai.Client(api_key=gemini_key)
            for m in ["gemini-3.5-flash", "gemini-3-flash-preview", "gemini-2.5-flash"]:
                try:
                    resp = client.models.generate_content(model=m, contents=prompt)
                    if resp and resp.text:
                        return {"review": resp.text.strip(), "model": m}
                except Exception:
                    continue
        except Exception:
            pass

    # Fallback review
    return {
        "review": (
            f"📊 **FinMate Wealth Review for {user_name}:**\n\n"
            f"• **Asset Allocation:** Aapka portfolio ₹{total_val:,.0f} par hai jisme ₹{total_sip:,.0f}/month ka SIP run ho raha hai.\n"
            f"• **Core Wealth Engine:** Nifty 50 Index Fund aur Large & Mid Cap me 60% allocation maintain karein.\n"
            f"• **Safety & Hedge:** 15% Gold (SGB/ETF) aur 6 mahine ka emergency liquid fund me rakhein taaki market dips me compounding disturb na ho.\n"
            f"• **Power of Compounding:** Har saal SIP me 10% step-up karne se 10 saal baad corpus double pace se grow hota hai!"
        )
    }
