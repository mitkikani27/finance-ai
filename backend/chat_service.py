"""Module 12 — AI Financial Chatbot + Module 9 — Voice Assistant brain.

Powered by Google Gemini 2.5/3.5 Flash LLM with ledger ground-truth verification.
Supports:
- Direct Actions: "2000 income add karo", "500 food me kharch hua"
- Real Ledger Queries: "is month kitna kharch hua", "meri income dikhao", "budget status"
- Open-Ended Financial Advice: "SIP kaise shuru karein", "best mutual funds", "tax saving tips", "investment advice"
- GPT-style natural Hinglish/English conversational answers
"""
import json
import os
import re
import urllib.request
from datetime import date, datetime
from dateutil.relativedelta import relativedelta

import finance_service as fs
import models
from ml.budget_forecaster import predict_month
from ml.fraud_detector import check_transaction

# ── helpers ──────────────────────────────────────────────────────────────────

def inr(x: float) -> str:
    return f"₹{x:,.0f}"


def _months_series(db, user_id):
    return fs.monthly_rollup(db, user_id, 12)


def _period_match(q: str):
    if re.search(r"last month|previous month|pichhle mahine|pichle mahine|pichhla mahina|gate mahine", q):
        return "last"
    if re.search(r"this month|current month|monthly|month|is mahine|is mahina|mahine|mahina", q):
        return "this"
    if re.search(r"this year|year|annual|saal|varsh", q):
        return "year"
    if re.search(r"week|hafta|hafte", q):
        return "week"
    return "this"


def _category_from(q: str):
    for cat in ["Food", "Groceries", "Fuel", "Rent", "EMI", "Medical", "Transport",
                "Entertainment", "Shopping", "Utilities", "Education", "Travel",
                "Investment", "Insurance"]:
        if re.search(rf"\b{cat.lower()}\b", q):
            return cat
    for word, cat in [("eat", "Food"), ("dining", "Food"), ("meal", "Food"), ("food", "Food"),
                      ("khana", "Food"), ("petrol", "Fuel"), ("diesel", "Fuel"), ("gas", "Fuel"),
                      ("movies", "Entertainment"), ("netflix", "Entertainment"),
                      ("uber", "Transport"), ("cab", "Transport"), ("bills", "Utilities"),
                      ("phone", "Utilities"), ("clothes", "Shopping"), ("amazon", "Shopping"),
                      ("pharmacy", "Medical"), ("hospital", "Medical"), ("medicine", "Medical"),
                      ("dawai", "Medical"), ("flight", "Travel"), ("train", "Travel"), ("trip", "Travel")]:
        if word in q:
            return cat
    return None


def _spend_for_period(db, user_id, period, category=None):
    today = date.today()
    rows = db.query(models.Expense).filter(models.Expense.user_id == user_id).all()

    def month_of(d):
        return (d.year, d.month)

    total = 0.0
    if period == "this":
        total = sum(r.amount for r in rows if month_of(r.date) == (today.year, today.month)
                    and (category is None or r.category == category))
    elif period == "last":
        lm = today - relativedelta(months=1)
        total = sum(r.amount for r in rows if month_of(r.date) == (lm.year, lm.month)
                    and (category is None or r.category == category))
    elif period == "year":
        total = sum(r.amount for r in rows if r.date.year == today.year
                    and (category is None or r.category == category))
    elif period == "week":
        from datetime import timedelta
        cutoff = (today - timedelta(days=7)).date()
        total = sum(r.amount for r in rows if r.date >= cutoff
                    and (category is None or r.category == category))
    return total


def build_context(db, user: models.User) -> dict:
    today = date.today()
    series = _months_series(db, user.id)
    cur_key = f"{today.year:04d}-{today.month:02d}"
    this_m = next((s for s in series if s["month"] == cur_key), {"month": cur_key, "label": "This Month", "income": 0.0, "expense": 0.0, "savings": 0.0})
    last_m = series[-2] if len(series) >= 2 else None
    totals = fs.totals(db, user.id)
    cats = fs.category_breakdown(db, user.id, today.year, today.month)
    try:
        profile = json.loads(user.profile or "{}")
    except json.JSONDecodeError:
        profile = {}
    return {
        "today": today.isoformat(),
        "user_name": (user.full_name or "Dost").split()[0],
        "this_month": this_m, "last_month": last_m,
        "totals": totals, "categories": cats[:6],
        "profile": profile,
        "full_series": series,
    }


# ── Robust LLM Call (Gemini primary, OpenAI fallback) ─────────────────────────

def _call_llm(prompt: str) -> str | None:
    """Call Gemini API with multi-model fallback, then OpenAI fallback."""
    # 1. Try Gemini
    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        try:
            from google import genai
            client = genai.Client(api_key=gemini_key)
            models_to_try = ["gemini-2.5-flash", "gemini-3.5-flash", "gemini-flash-latest", "gemini-3.5-flash-lite"]
            for m in models_to_try:
                try:
                    resp = client.models.generate_content(model=m, contents=prompt)
                    if resp and resp.text:
                        return resp.text.strip()
                except Exception:
                    continue
        except Exception:
            pass

    # 2. Try OpenAI
    openai_key = os.getenv("OPENAI_API_KEY")
    if openai_key:
        try:
            body = json.dumps({
                "model": "gpt-4o-mini",
                "max_tokens": 400,
                "messages": [{"role": "user", "content": prompt}]
            }).encode()
            req = urllib.request.Request(
                "https://api.openai.com/v1/chat/completions", data=body,
                headers={"Authorization": f"Bearer {openai_key}", "Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=12) as resp:
                data = json.loads(resp.read().decode())
            return data["choices"][0]["message"]["content"].strip()
        except Exception:
            pass

    return None


def _smart_llm_answer(context: dict, question: str, ground_truth: str | None = None) -> str | None:
    """Ask LLM with user ledger context and ground truth facts."""
    compact = {k: v for k, v in context.items() if k != "full_series"}
    compact["recent_6_months"] = context.get("full_series", [])[-6:]

    user_name = context.get("user_name", "Dost")
    this_m = context.get("this_month", {})

    prompt = (
        f"You are FinMate, a brilliant and friendly AI financial assistant in India for user {user_name}.\n"
        "You talk warmly in conversational Hinglish (blend of Hindi and English like a smart desi friend) or English as appropriate.\n\n"
        f"USER REAL LEDGER CONTEXT:\n{json.dumps(compact, indent=2)}\n\n"
        f"USER QUESTION: {question}\n"
    )

    if ground_truth:
        prompt += f"GROUND TRUTH FACTS FROM LEDGER (MUST USE THESE EXACT NUMBERS, NEVER CONTRADICT):\n{ground_truth}\n\n"

    prompt += (
        "INSTRUCTIONS:\n"
        "- Give a direct, helpful, natural answer like ChatGPT.\n"
        "- If reporting user numbers (income, expenses, balance, savings), strictly use the ledger numbers above.\n"
        "- If providing financial or investment advice (SIP, stocks, gold, savings tips), be practical, educational, and structured with bullet points.\n"
        "- Keep the answer concise (under 120 words), polite, and encouraging."
    )

    return _call_llm(prompt)


# ── ACTION: Extract amount & sources ──────────────────────────────────────────

def _extract_amount(q: str) -> float | None:
    m = re.search(r"(\d+(?:\.\d+)?)\s*(hazar|hajar|thousand|k)\b", q)
    if m:
        return float(m.group(1)) * 1000
    m = re.search(r"(\d+(?:\.\d+)?)\s*(lakh|lac)\b", q)
    if m:
        return float(m.group(1)) * 100000
    m = re.search(r"(?:₹|rs\.?\s*|rupee[s]?\s*|inr\s*)?(\d[\d,]*(?:\.\d+)?)", q)
    if m:
        raw = m.group(1).replace(",", "")
        val = float(raw)
        if val > 0:
            return val
    return None


def _extract_income_source(q: str) -> str:
    if re.search(r"salary|salari|tankhwa|tankhah", q): return "Salary"
    if re.search(r"freelance|freelancing", q): return "Freelance"
    if re.search(r"business|vyapar|dukan", q): return "Business"
    if re.search(r"rent|kiraya", q): return "Rent"
    if re.search(r"bonus", q): return "Bonus"
    if re.search(r"interest|byaj", q): return "Interest"
    if re.search(r"dividend", q): return "Dividend"
    return "Other"


def _add_income_action(db, user: models.User, q: str, question: str) -> str | None:
    add_pat = (
        r"(income.*add|add.*income|income.*jod|jod.*income|income.*daal|daal.*income|"
        r"income.*me\s+add|income.*mein\s+add|income.*receive|income.*mila|"
        r"mila.*income|salary.*add|add.*salary|income.*record|income.*note|"
        r"income.*save|income\s+hua|income\s+aaya|income\s+aayi|2000.*income|"
        r"\d+.*income.*add|\d+.*add.*income|income.*\d+)"
    )
    also_pat = r"(\d[\d,.]*)\s*(hazar|hajar|k|lakh|lac)?\s*(rupay|rupaye|rs|₹)?\s*(income|kamai|salary)\s*(add|jod|daal|me add|mein add|record)"
    if not re.search(add_pat, q) and not re.search(also_pat, q):
        return None
    amount = _extract_amount(q)
    if not amount or amount <= 0:
        return None
    source = _extract_income_source(q)
    today_obj = date.today()
    rec = models.Income(
        user_id=user.id,
        source=source,
        amount=amount,
        date=today_obj,
        note=f"Added via AI chat: {question[:80]}"
    )
    db.add(rec)
    db.commit()
    return (
        f"✅ **Ho gaya!** {inr(amount)} income ({source}) aaj ki date ({today_obj.isoformat()}) "
        f"ke liye add kar di gayi hai! 🎉\n\n"
        f"Aapki is mahine ki total income update ho gayi hai. Income page par verify kar sakte ho."
    )


def _extract_expense_category(q: str) -> str:
    mapping = [
        (r"food|khana|khane|restaurant|eat|meal|lunch|dinner|breakfast|snack|zomato|swiggy|pizza|burger", "Food"),
        (r"grocery|groceries|sabzi|sabji|kirana|vegetables|milk|doodh", "Groceries"),
        (r"fuel|petrol|diesel|gas|cng", "Fuel"),
        (r"rent|kiraya|ghar ka|house", "Rent"),
        (r"emi|loan|karz", "EMI"),
        (r"medical|doctor|medicine|hospital|pharmacy|dawai", "Medical"),
        (r"transport|cab|uber|ola|auto|bus|train|metro", "Transport"),
        (r"entertainment|movie|cinema|netflix|prime|hotstar|gaming|game", "Entertainment"),
        (r"shopping|clothes|kapde|amazon|flipkart", "Shopping"),
        (r"utility|utilities|bill|electricity|phone|mobile|internet|wifi|bijli|paani", "Utilities"),
        (r"education|school|college|tuition|fees|book|course", "Education"),
        (r"investment|sip|mutual fund|stocks|invest", "Investment"),
        (r"insurance|bima", "Insurance"),
        (r"travel|trip|flight|hotel", "Travel"),
    ]
    for pattern, cat in mapping:
        if re.search(pattern, q):
            return cat
    return "General"


def _add_expense_action(db, user: models.User, q: str, question: str) -> str | None:
    add_pat = (
        r"(expense.*add|add.*expense|expense.*jod|expense.*daal|"
        r"expense.*me\s+add|expense.*mein\s+add|kharcha.*add|add.*kharcha|"
        r"kharcha.*hua|kharch.*hua|kharcha.*lagaya|lagaya.*kharcha|"
        r"paid|pay\s+kiya|diya|purchase\s+kiya|kharida|"
        r"note.*expense|expense.*note|save.*expense|"
        r"\d+.*expense.*add|\d+.*add.*expense|bill.*add|add.*bill)"
    )
    also_pat = r"(\d[\d,.]*)\s*(hazar|hajar|k|lakh|lac)?\s*(rupay|rupaye|rs|₹)?\s*(ka\s+)?(kharcha|expense|bill|spend)\s*(hua|lagaya|add|jod|daal|record|note)?"
    if not re.search(add_pat, q) and not re.search(also_pat, q):
        return None
    amount = _extract_amount(q)
    if not amount or amount <= 0:
        return None
    category = _extract_expense_category(q)
    try:
        from ml.expense_classifier import predict as ai_predict
        ai_cat = ai_predict(question)
        if ai_cat and ai_cat.get("category") and ai_cat["category"] not in ("General", "Other"):
            category = ai_cat["category"]
    except Exception:
        pass
    today_obj = date.today()

    try:
        hist = db.query(models.Expense).filter(models.Expense.user_id == user.id).limit(60).all()
        history = [{"amount": h.amount, "date": h.date.isoformat(), "category": h.category} for h in hist]
        fraud = check_transaction(history, amount, question[:80], category,
                                  datetime(today_obj.year, today_obj.month, today_obj.day, 12))
    except Exception:
        fraud = {"is_suspicious": False}

    exp = models.Expense(
        user_id=user.id,
        category=category,
        description=question[:120],
        amount=amount,
        date=today_obj,
        payment_mode="UPI",
        ai_categorized=True,
    )
    db.add(exp)
    if fraud.get("is_suspicious"):
        try:
            from routers.fraud import _create_alert
            _create_alert(db, user, fraud, description=question[:80], amount=amount)
        except Exception:
            pass
    db.commit()

    fraud_note = (
        "\n\n⚠️ Note: Yeh amount thoda unusual lag raha hai — Fraud alerts page par review kar sakte ho."
        if fraud.get("is_suspicious") else ""
    )
    return (
        f"✅ **Done!** {inr(amount)} ka expense ({category}) aaj ({today_obj.isoformat()}) "
        f"ke liye successfully add kar diya gaya. 💸\n\n"
        f"Expenses page par jaake check kar sakte ho!{fraud_note}"
    )


# ── Smart Financial Advisor ───────────────────────────────────────────────────

def smart_advice(db, user: models.User, question: str) -> str:
    ctx = build_context(db, user)
    totals = ctx.get("totals", {})
    this_m = ctx["this_month"]
    surplus = max(0.0, this_m["income"] - this_m["expense"])

    ground_truth = (
        f"Snapshot: Income {inr(this_m['income'])}, Expense {inr(this_m['expense'])}, "
        f"Surplus: {inr(surplus)}/month. Net balance: {inr(totals.get('net_balance', 0))}. "
        f"Invested so far: {inr(totals.get('total_invested', 0))}."
    )

    llm_resp = _smart_llm_answer(ctx, question, ground_truth)
    if llm_resp:
        return llm_resp

    # Fallback template if offline
    name = ctx.get("user_name", "Dost")
    return (
        f"🤖 **{name}, aapke data ke hisaab se financial snapshot:**\n\n"
        f"• **Is mahine ki income:** {inr(this_m['income'])}\n"
        f"• **Kharcha:** {inr(this_m['expense'])}\n"
        f"• **Monthly Surplus:** ~{inr(surplus)}\n\n"
        f"💡 **Recommendation:**\n"
        f"1. Pehle 6 mahine ka emergency fund banayein ({inr(this_m['expense'] * 6)} target).\n"
        f"2. Nifty 50 Index Fund me {inr(max(500, surplus * 0.4))} ki monthly SIP shuru karein.\n"
        f"3. 15% Gold (SGB/Gold ETF) aur baaki safe FD/liquid fund me rakhein.\n\n"
        f"⚠️ Educational analysis — Investments page par poora portfolio plan dekhein."
    )


# ── Main Entrypoint ───────────────────────────────────────────────────────────

def answer(db, user: models.User, question: str) -> str:
    import market as market_svc
    q = question.lower().strip()

    # 1. Action Check: Add Income
    income_action = _add_income_action(db, user, q, question)
    if income_action:
        return income_action

    # 2. Action Check: Add Expense
    expense_action = _add_expense_action(db, user, q, question)
    if expense_action:
        return expense_action

    # 3. Context Builder
    ctx = build_context(db, user)
    this_m, last_m = ctx["this_month"], ctx["last_month"]
    totals, cats = ctx["totals"], ctx["categories"]
    name = ctx.get("user_name", "Dost")

    # 4. Greetings
    if re.fullmatch(r"(hi|hello|hey|namaste|namaskar|good (morning|afternoon|evening))[\s!.]*", q):
        return (
            f"Namaste {name}! 👋 Main hoon FinMate, aapka personal AI financial assistant.\n\n"
            f"Aap mujhse seedha ye sab bol ya puchh sakte ho:\n"
            f"• 💰 **'2000 income add karo'** — automatically income book ho jayegi\n"
            f"• 💸 **'500 food me kharch hua'** — expense categorize hoke add ho jayega\n"
            f"• 📊 **'Is month ki income dikhao'** — real earnings & balance\n"
            f"• 🔮 **'Next month ka forecast karo'** — AI trend prediction\n"
            f"• 📈 **'Kahan invest karu?'** ya **'Reliance ka stock kaisa hai?'**\n\n"
            f"Bataiye, aaj aapki kya madad kar sakta hoon? 😊"
        )

    # 5. Live Market Queries (stocks, indices)
    if re.search(r"stock|share|market|nifty|sensex|sector|trending", q) or market_svc.match_symbol(q):
        try:
            sym = market_svc.match_symbol(q)
            if sym and not re.search(r"nifty|sensex|market aaj", q):
                d = market_svc.stock_detail(sym.replace(".NS", ""))
                verdict_hi = {"Strong": "मजबूत ✅", "Neutral": "संतुलित ⚖️", "Weak": "कमजोर ⚠️"}[d["verdict"]]
                return (f"📊 **{d['name']} ({d['symbol']})** — ₹{d['price']} aaj ({d['day_chg']:+.2f}%)\n\n"
                        f"• Sector: {d['sector']}\n"
                        f"• 1-Month Return: {d['mom1m']:+.1f}%\n"
                        f"• 50DMA Trend: {d['trend_vs_ma50']:+.1f}%\n"
                        f"• AI Momentum Score: {d['score']}/100 → **{verdict_hi}**\n\n"
                        + "\n".join(f"• {r}" for r in d["reasons"])
                        + "\n\n⚠️ Educational insight — Market page par live charts dekhein.")
            ins = market_svc.insights()
            idx = " | ".join(f"{i['name']} {i['chg']:+.2f}%" for i in ins["indices"])
            picks = "; ".join(f"{p['name']} ₹{p['price']} ({p['day_chg']:+.1f}%)" for p in ins["top_picks"])
            best = ins.get("best_sector") or {}
            ground = (f"Market Summary: {ins['summary']}. Indices: {idx}. "
                      f"Strongest Sector: {best.get('sector', '-')} ({best.get('chg', 0):+.2f}%). Top picks: {picks}.")
            llm_ans = _smart_llm_answer(ctx, question, ground)
            return llm_ans or f"📈 **Live Market Update:**\n\n{ins['summary']}\n\n• **Indices:** {idx}\n• **Best Sector:** {best.get('sector', '-')}\n• **Picks:** {picks}"
        except Exception:
            return "📈 Live market data abhi fetch nahi ho paya. Thodi der me dobara try karein."

    # 6. Specific Ledger Ground-Truth Lookups
    ground_truth = None

    if re.search(r"income|salary|earn|kamai|kamaya|kama\b|is month ki income|income dikhao|income kitni", q):
        ground_truth = (
            f"Current month income: {inr(this_m['income'])}. "
            f"Last month income: {inr(last_m['income']) if last_m else 'N/A'}. "
            f"Total lifetime tracked income: {inr(totals['total_income'])}."
        )

    elif re.search(r"spend|spent|expense|expenditure|how much|kharch|kharcha|kitna kharch|kitna lag", q):
        period = _period_match(q)
        cat = _category_from(q)
        amt = _spend_for_period(db, user.id, period, cat)
        period_txt = {"this": "this month", "last": "last month", "year": "this year", "week": "last 7 days"}[period]
        top = cats[0] if cats and not cat else None
        top_str = f"Biggest category: {top['category']} at {inr(top['amount'])} ({top['pct']}%)." if top else ""
        ground_truth = f"User spent {inr(amt)} {'on ' + cat if cat else ''} {period_txt}. {top_str}"

    elif re.search(r"\bsav|savings|balance|left|remaining|bachat|bachaya|kitna bacha", q):
        saved = this_m["savings"]
        ground_truth = (
            f"This month income: {inr(this_m['income'])}, expenses: {inr(this_m['expense'])}, "
            f"net saved: {inr(saved)} (savings rate {saved / this_m['income'] * 100:.0f}% if income > 0). "
            f"Total net balance across all time: {inr(totals['net_balance'])}."
        )

    elif re.search(r"predict|forecast|next month|expected|agli month|agle mahine", q):
        past = [s["expense"] for s in ctx["full_series"] if not s["partial"]]
        while past and past[0] == 0:
            past.pop(0)
        res = predict_month(past)
        ground_truth = (
            f"Based on Holt's trend model over {len(past)} past months: "
            f"Expected next month expense is {inr(res['forecast'])} (range {inr(res['lower'])} to {inr(res['upper'])}), "
            f"trend {res['trend_pct']:+}% vs last month. Model accuracy: {100 - res.get('mape', 10):.0f}%."
        )

    elif re.search(r"health|score|rate my|financial (health|condition)", q):
        from ml.health_score import compute
        emi = fs.emi_total(db, user.id, date.today().year, date.today().month)
        h = compute(this_m["income"], this_m["expense"], emi,
                    fs.emergency_fund(db, user.id), this_m["expense"],
                    fs.budget_stats(db, user.id, date.today().year, date.today().month))
        ground_truth = (
            f"Financial Health Score is {h['score']}/100 (Grade {h['grade']}). "
            f"Components: " + ", ".join(f"{c['name']}: {c['score']}/{c['max']}" for c in h["components"]) +
            f". Key tip: {h['tips'][0]}"
        )

    elif re.search(r"budget", q):
        stats = fs.budget_stats(db, user.id, date.today().year, date.today().month)
        if not stats:
            ground_truth = "User has not set category budgets yet on the Budget page."
        else:
            over = [b for b in stats if b["spent"] > b["limit"]]
            ok = [b for b in stats if b["spent"] <= b["limit"]]
            ground_truth = (
                f"{len(ok)} budgets on track, {len(over)} exceeded. "
                + " ".join(f"{b['category']}: spent {inr(b['spent'])} of {inr(b['limit'])} limit." for b in stats[:4])
            )

    elif re.search(r"fraud|suspicious|anomal", q):
        alerts = db.query(models.FraudAlert).filter(
            models.FraudAlert.user_id == user.id,
            models.FraudAlert.status == "new"
        ).all()
        if alerts:
            ground_truth = f"Flagged {len(alerts)} suspicious transactions. Latest: {inr(alerts[0].amount)} ({alerts[0].reason})."
        else:
            ground_truth = "No suspicious transactions detected. Isolation Forest model is monitoring."

    # 7. Ask LLM (Gemini / OpenAI) with Ground Truth + Ledger Context
    llm_resp = _smart_llm_answer(ctx, question, ground_truth)
    if llm_resp:
        return llm_resp

    # 8. Local Ground-Truth Fallback if LLM is offline
    if ground_truth:
        return f"📊 **{ground_truth}**"

    # 9. General Investment Advice Fallback
    if re.search(r"invest|nivesh|sip|mutual|portfolio|wealth|stock|share", q):
        return smart_advice(db, user, question)

    # 10. Default Friendly Ledger Summary
    surplus = this_m["income"] - this_m["expense"]
    top = cats[0] if cats else None
    return (
        f"📊 **Financial Snapshot for {name} ({this_m['label']}):**\n\n"
        f"• **Income:** {inr(this_m['income'])}\n"
        f"• **Expenses:** {inr(this_m['expense'])}\n"
        f"• **Net Savings / Surplus:** {inr(surplus)}\n"
        + (f"• **Top Expense Category:** {top['category']} ({inr(top['amount'])})\n\n" if top else "\n")
        + f"Mujhse poochhiye: *'5000 income add karo'*, *'kahan invest karu'*, ya *'health score batao'*! 😊"
    )
