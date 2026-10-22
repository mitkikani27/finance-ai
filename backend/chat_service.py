"""Module 12 — AI Financial Chatbot + Module 9 — Voice Assistant brain.

A data-grounded NLU: every answer is computed from the user's *real* ledger,
so the bot never hallucinates numbers. If OPENAI_API_KEY is configured, the
computed context is sent to the LLM for a natural-language rewrite; offline it
uses precise template answers.

ACTION SUPPORT (NEW):
  - "2000 income add karo" → income automatically database mein add ho jayegi
  - "500 food mein kharch hua" → expense automatically add ho jayega
  - "Is month ki income dikhao" → real numbers show honge
  - GPT-style natural responses with OpenAI key
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
                      ("petrol", "Fuel"), ("diesel", "Fuel"), ("gas", "Fuel"),
                      ("movies", "Entertainment"), ("netflix", "Entertainment"),
                      ("uber", "Transport"), ("cab", "Transport"), ("bills", "Utilities"),
                      ("phone", "Utilities"), ("clothes", "Shopping"), ("amazon", "Shopping"),
                      ("pharmacy", "Medical"), ("hospital", "Medical"), ("medicine", "Medical"),
                      ("flight", "Travel"), ("train", "Travel"), ("trip", "Travel")]:
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
    this_m = next(s for s in series if s["month"] == f"{today.year:04d}-{today.month:02d}")
    last_m = series[-2] if len(series) >= 2 else None
    totals = fs.totals(db, user.id)
    cats = fs.category_breakdown(db, user.id, today.year, today.month)
    try:
        profile = json.loads(user.profile or "{}")
    except json.JSONDecodeError:
        profile = {}
    return {
        "today": today.isoformat(),
        "this_month": this_m, "last_month": last_m,
        "totals": totals, "categories": cats[:6],
        "profile": profile,
        "full_series": series,
    }


def _llm_rewrite(context: dict, question: str, template_answer: str) -> str | None:
    key = os.getenv("OPENAI_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not key:
        return None
    try:
        compact = {k: v for k, v in context.items() if k != "full_series"}
        compact["last_6_months"] = context["full_series"][-6:]
        prompt = (
            "You are FinMate, an Indian personal-finance assistant. Answer briefly (<=100 words), "
            "in a friendly conversational tone (mix of Hindi/English like a desi friend), "
            "using ONLY the given data. Keep rupee amounts as given.\n"
            f"DATA: {json.dumps(compact)}\nUSER QUESTION: {question}\nDRAFT ANSWER (ground truth): {template_answer}\n"
            "Rewrite the draft into a friendly, natural Hinglish answer. Do not add new numbers or hallucinate."
        )
        body = json.dumps({"model": "gpt-4o-mini", "max_tokens": 250,
                           "messages": [{"role": "user", "content": prompt}]}).encode()
        req = urllib.request.Request(
            "https://api.openai.com/v1/chat/completions", data=body,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode())
        return data["choices"][0]["message"]["content"].strip()
    except Exception:
        return None


# ── ACTION: Extract amount from natural language ──────────────────────────────

def _extract_amount(q: str) -> float | None:
    """Extract rupee amount from text like '2000', '₹2000', '2 hazar', '5k', '1.5 lakh'."""
    # hazar / thousand
    m = re.search(r"(\d+(?:\.\d+)?)\s*(hazar|hajar|thousand|k)\b", q)
    if m:
        return float(m.group(1)) * 1000
    # lakh
    m = re.search(r"(\d+(?:\.\d+)?)\s*(lakh|lac)\b", q)
    if m:
        return float(m.group(1)) * 100000
    # plain number with optional ₹/rs prefix
    m = re.search(r"(?:₹|rs\.?\s*|rupee[s]?\s*|inr\s*)?(\d[\d,]*(?:\.\d+)?)", q)
    if m:
        raw = m.group(1).replace(",", "")
        val = float(raw)
        if val > 0:
            return val
    return None


def _extract_income_source(q: str) -> str:
    """Guess income source from keywords in user message."""
    if re.search(r"salary|salari|tankhwa|tankhah", q): return "Salary"
    if re.search(r"freelance|freelancing", q): return "Freelance"
    if re.search(r"business|vyapar|dukan", q): return "Business"
    if re.search(r"rent|kiraya", q): return "Rent"
    if re.search(r"bonus", q): return "Bonus"
    if re.search(r"interest|byaj", q): return "Interest"
    if re.search(r"dividend", q): return "Dividend"
    return "Other"


def _add_income_action(db, user: models.User, q: str, question: str) -> str | None:
    """If user wants to add income, add it to DB and return confirmation."""
    # Intent detection
    add_pat = (
        r"(income.*add|add.*income|income.*jod|jod.*income|income.*daal|daal.*income|"
        r"income.*me\s+add|income.*mein\s+add|income.*receive|income.*mila|"
        r"mila.*income|salary.*add|add.*salary|income.*record|income.*note|"
        r"income.*save|income\s+hua|income\s+aaya|income\s+aayi|2000.*income|"
        r"\d+.*income.*add|\d+.*add.*income|income.*\d+)"
    )
    # Also match "X amount add karo/karo income mein"
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
        f"✅ Ho gaya! {inr(amount)} income ({source}) aaj ki date ({today_obj.isoformat()}) "
        f"ke liye successfully add kar di gayi. 🎉\n\n"
        f"Income page par jaake confirm kar sakte ho!"
    )


def _extract_expense_category(q: str) -> str:
    """Guess expense category from keywords."""
    mapping = [
        (r"food|khana|khane|restaurant|eat|meal|lunch|dinner|breakfast|snack|zomato|swiggy", "Food"),
        (r"grocery|groceries|sabzi|sabji|kirana|vegetables", "Groceries"),
        (r"fuel|petrol|diesel|gas", "Fuel"),
        (r"rent|kiraya|ghar ka|house", "Rent"),
        (r"emi|loan|karz", "EMI"),
        (r"medical|doctor|medicine|hospital|pharmacy|dawai", "Medical"),
        (r"transport|cab|uber|ola|auto|bus|train|metro", "Transport"),
        (r"entertainment|movie|cinema|netflix|prime|hotstar|gaming|game", "Entertainment"),
        (r"shopping|clothes|kapde|amazon|flipkart", "Shopping"),
        (r"utility|utilities|bill|electricity|phone|mobile|internet|wifi|bijli", "Utilities"),
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
    """If user wants to add expense, add it to DB and return confirmation."""
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
    # Try AI classifier for better categorization
    try:
        from ml.expense_classifier import predict as ai_predict
        ai_cat = ai_predict(question)
        if ai_cat and ai_cat.get("category") and ai_cat["category"] not in ("General", "Other"):
            category = ai_cat["category"]
    except Exception:
        pass
    today_obj = date.today()
    # Quick fraud check
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
        "\n\n⚠️ Note: Yeh transaction thoda unusual lag raha hai — Fraud page par check karo."
        if fraud.get("is_suspicious") else ""
    )
    return (
        f"✅ Ho gaya! {inr(amount)} expense ({category}) aaj ki date ({today_obj.isoformat()}) "
        f"ke liye add kar diya gaya. 💸\n\n"
        f"Expenses page par jaake confirm kar sakte ho!{fraud_note}"
    )


# ── Smart investment advisor ──────────────────────────────────────────────────

def smart_advice(db, user: models.User, question: str) -> str:
    """Mini financial advisor: answers ANY investment question using real data."""
    from statistics import mean
    ctx = build_context(db, user)
    prof = ctx.get("profile", {}) or {}
    totals = ctx.get("totals", {})
    full = [s for s in ctx["full_series"] if not s.get("partial") and s["income"] > 0][-6:]
    this_m = ctx["this_month"]

    if full:
        avg_exp = mean(s["expense"] for s in full)
        avg_surplus = mean(s["income"] - s["expense"] for s in full)
    else:
        avg_exp = this_m["expense"]
        avg_surplus = this_m["income"] - this_m["expense"]
    avg_surplus = max(0.0, avg_surplus)

    name = (user.full_name or "Dost").split()[0]
    age = int(prof.get("age", 25) or 25)
    risk = (prof.get("risk_profile") or "balanced").lower()
    occ = prof.get("occupation", "employee")

    L = []
    L.append(f"🤖 {name}, aapke real data se analysis (age {age}, {occ}, risk: {risk}):")
    L.append("")
    rate = round(100 * this_m["savings"] / this_m["income"]) if this_m["income"] else 0
    snap = (f"📊 **Snapshot** — is month: income {inr(this_m['income'])}, "
            f"kharcha {inr(this_m['expense'])} (savings rate {rate}%). "
            f"6-month average surplus: ~{inr(avg_surplus)}/month.")
    if rate < 0:
        snap += " ⚠️ Is month kharcha income se zyada hai!"
    L.append(snap)

    # emergency fund
    ef_target = avg_exp * 6
    ef_now = float(totals.get("net_balance", 0) or 0)
    if ef_now < ef_target:
        L.append(f"🛡 **Pehle emergency fund** — target {inr(ef_target)} (6 mahine ka kharcha). "
                 f"Abhi balance ~{inr(ef_now)}. Surplus ka pehla hissa yahan jao "
                 f"(~{inr(min(avg_surplus * 0.3, ef_target - ef_now) if avg_surplus else 0)}/month).")

    # allocation by risk
    alloc_map = {
        "conservative": [("RD/FD (safe)", 0.40), ("Debt/PPF SIP", 0.30), ("Gold (SGB/digital)", 0.15), ("Index fund SIP", 0.15)],
        "aggressive": [("Index fund SIP (Nifty 50)", 0.45), ("Direct stocks/Equity SIP", 0.30), ("Gold", 0.10), ("FD/RD buffer", 0.15)],
        "balanced": [("Index fund SIP", 0.40), ("FD/RD (safe)", 0.25), ("Gold", 0.15), ("Flexi-cap SIP", 0.20)],
    }
    alloc = alloc_map.get(risk, alloc_map["balanced"])

    if avg_surplus > 500:
        L.append(f"💡 **Aaj se invest karne layak: ~{inr(avg_surplus)}/month** ({risk} profile ke hisab se):")
        for label, share in alloc:
            amt = avg_surplus * share
            if amt >= 100:
                L.append(f"   • {label}: ~{inr(amt)} ({int(share * 100)}%)")
        inv_total = float(totals.get("total_invested", 0) or 0)
        if inv_total:
            L.append(f"💼 Aapke paas already {inr(inv_total)} investments hain — continue karo.")
    else:
        L.append(f"💡 Abhi investable surplus kam hai ({inr(avg_surplus)}/month). "
                 f"Pehle kharcha review karo, phir SIP shuru karo. ₹500 se bhi SIP chalu hota hai!")

    # live market
    try:
        import market as market_svc
        o = market_svc.overview()
        best = o["sectors"][0] if o["sectors"] else None
        idx = o["indices"][0] if o["indices"] else None
        L.append(f"📈 **Live market**: {o['mood']}"
                 + (f" — {idx['name']} {idx['value']:,.0f} ({idx['chg']:+.2f}%)" if idx else "")
                 + (f" · aaj strongest sector: {best['sector']} ({best['chg']:+.2f}%)" if best else "")
                 + ". Market ke din me SIP/STP better hota hai.")
    except Exception:
        L.append("📈 (Live market data abhi available nahi — investments page par suggestions hain)")

    horizon = "10-15+ saal" if age < 30 else "7-10 saal" if age < 45 else "3-5 saal"
    L.append(f"🎯 Aapki age me horizon {horizon} ka hai — compounding ka pura fayda uthao.")
    L.append("")
    L.append("⚠️ Educational analysis — SEBI-registered adviser se consult karein.")

    answer_text = "\n".join(L)
    polished = _llm_rewrite(ctx, question, answer_text)
    return polished or answer_text


# ── Main chat answer function ─────────────────────────────────────────────────

def answer(db, user: models.User, question: str) -> str:
    import market as market_svc
    q = question.lower().strip()

    # ── ACTION: Add income (highest priority) ────────────────────────────────
    income_action = _add_income_action(db, user, q, question)
    if income_action:
        return income_action

    # ── ACTION: Add expense ──────────────────────────────────────────────────
    expense_action = _add_expense_action(db, user, q, question)
    if expense_action:
        return expense_action

    # ── Read-only queries below ──────────────────────────────────────────────
    ctx = build_context(db, user)
    this_m, last_m = ctx["this_month"], ctx["last_month"]
    totals, cats = ctx["totals"], ctx["categories"]

    # greetings
    if re.fullmatch(r"(hi|hello|hey|namaste|namaskar|good (morning|afternoon|evening))[\s!.]*", q):
        name = (user.full_name or "Dost").split()[0]
        reply = (
            f"Namaste {name}! 👋 Main hoon FinMate, aapka AI financial assistant.\n\n"
            f"Mujhse seedha ye sab kaho:\n"
            f"• '2000 income add karo' — automatically add ho jayega ✅\n"
            f"• '500 food mein kharcha hua' — expense record ho jayega ✅\n"
            f"• 'Is month ki income dikhao' — real numbers bataunga 📊\n"
            f"• 'Next month forecast karo', 'Health score batao', 'Budget status'\n\n"
            f"Kya poochna chahte ho? 😊"
        )
        return reply

    # live market
    if re.search(r"stock|share|market|nifty|sensex|sector|trending|performing|kaisa|kaisi", q) or market_svc.match_symbol(q):
        try:
            sym = market_svc.match_symbol(q)
            if sym and not re.search(r"nifty|sensex|market aaj|sector", q):
                d = market_svc.stock_detail(sym.replace(".NS", ""))
                verdict_hi = {"Strong": "मजबूत ✅", "Neutral": "संतुलित ⚖️", "Weak": "कमजोर ⚠️"}[d["verdict"]]
                return (f"📊 {d['name']} ({d['symbol']}) — ₹{d['price']} aaj "
                        f"({d['day_chg']:+.2f}%)\n"
                        f"Sector: {d['sector']} · 1 mahine: {d['mom1m']:+.1f}% · "
                        f"50DMA se: {d['trend_vs_ma50']:+.1f}%\n"
                        f"AI score: {d['score']}/100 → {verdict_hi}\n"
                        + "\n".join(f"• {r}" for r in d["reasons"])
                        + "\n⚠️ Educational analysis — investment advice nahi.")
            ins = market_svc.insights()
            idx = " | ".join(f"{i['name']} {i['chg']:+.2f}%" for i in ins["indices"])
            picks = "; ".join(f"{p['name']} ₹{p['price']} ({p['day_chg']:+.1f}%, score {p['score']}/100)"
                              for p in ins["top_picks"])
            best = ins.get("best_sector") or {}
            return (f"📈 {ins['summary']}\n\n"
                    f"Indices: {idx}\n"
                    f"Strongest sector today: {best.get('sector', '-')} ({best.get('chg', 0):+.2f}%)\n"
                    f"AI top momentum picks: {picks}\n\n"
                    f"⚠️ Educational analysis only — not investment advice. Market page kholo.")
        except Exception:
            return "📈 Live market data abhi fetch nahi ho paya (internet check karein) — thodi der me dobara poochho."

    # fraud
    if re.search(r"fraud|suspicious|anomal|hack|stolen", q):
        alerts = db.query(models.FraudAlert).filter(
            models.FraudAlert.user_id == user.id,
            models.FraudAlert.status == "new"
        ).all()
        if alerts:
            a = alerts[0]
            return (f"⚠️ {len(alerts)} suspicious transaction(s) flagged! Latest: {inr(a.amount)} — "
                    f"{a.reason.split('.')[0]} — Risk {int(a.risk_score * 100)}%. "
                    "Fraud page par jaake review karo.")
        return "✅ Koi naya suspicious transaction nahi mila. Isolation Forest model constantly watch kar raha hai."

    # forecast
    if re.search(r"predict|forecast|next month|expected|agli month|agle mahine", q):
        past = [s["expense"] for s in ctx["full_series"] if not s["partial"]]
        while past and past[0] == 0:
            past.pop(0)
        res = predict_month(past)
        acc = f" Backtest accuracy: {100 - res['mape']:.0f}% (MAPE {res['mape']}%)." if res.get("mape") else ""
        tmpl = (f"Holt's trend model ke hisab se aapke last {len(past)} months ka data dekhte hue: "
                f"next month ka expected expense {inr(res['forecast'])} hai "
                f"(range {inr(res['lower'])}–{inr(res['upper'])}), "
                f"{res['trend_pct']:+}% vs last month.{acc}")
        polished = _llm_rewrite(ctx, question, tmpl)
        return polished or tmpl

    # saving tips
    if re.search(r"save (money|more)|reduce|cut |tips|advice|how can i|kaise bachau|kaise bachaun|paise bachao", q):
        from ml.advisor import saving_recommendations
        profile = ctx["profile"].get("occupation", "employee")
        spend = {c["category"]: c["amount"] for c in fs.category_breakdown(db, user.id, date.today().year, date.today().month)}
        recs = saving_recommendations(profile, spend)
        lines = [recs["summary"]]
        for r in recs["recommendations"][:3]:
            lines.append(r["text"])
        tmpl = " ".join(lines)
        polished = _llm_rewrite(ctx, question, tmpl)
        return polished or tmpl

    # savings / balance
    if re.search(r"\bsav|savings|balance|left|remaining|bachat|bachaya|kitna bacha", q):
        saved = this_m["savings"]
        if this_m["income"] and saved >= 0:
            tmpl = (f"Is mahine abhi tak {inr(this_m['income'])} income aayi aur "
                    f"{inr(this_m['expense'])} kharch hua — {inr(saved)} bacha. "
                    f"Savings rate {saved / this_m['income'] * 100:.0f}%. "
                    f"YTD total savings: {inr(totals['net_balance'])}.")
        elif this_m["income"] and saved < 0:
            tmpl = (f"Is mahine kharcha ({inr(this_m['expense'])}) income ({inr(this_m['income'])}) se "
                    f"{inr(abs(saved))} zyada ho gaya. Fraud page check karo aur 'paise kaise bachao' pucho.")
        else:
            tmpl = f"Net position: {inr(totals['net_balance'])}."
        polished = _llm_rewrite(ctx, question, tmpl)
        return polished or tmpl

    # health score
    if re.search(r"health|score|rate my|how (am i|are you) doing|financial (health|condition)", q):
        from ml.health_score import compute
        emi = fs.emi_total(db, user.id, date.today().year, date.today().month)
        h = compute(this_m["income"], this_m["expense"], emi,
                    fs.emergency_fund(db, user.id), this_m["expense"],
                    fs.budget_stats(db, user.id, date.today().year, date.today().month))
        tmpl = (f"Aapka Financial Health Score {h['score']}/100 hai — {h['grade']}. "
                + " | ".join(f"{c['name']}: {c['score']}/{c['max']}" for c in h["components"])
                + f" Top tip: {h['tips'][0]}")
        polished = _llm_rewrite(ctx, question, tmpl)
        return polished or tmpl

    # budget
    if re.search(r"budget", q):
        stats = fs.budget_stats(db, user.id, date.today().year, date.today().month)
        if not stats:
            return "Budget page par jaake category budgets set karo — main phir track karunga! 📋"
        over = [b for b in stats if b["spent"] > b["limit"]]
        ok = [b for b in stats if b["spent"] <= b["limit"]]
        msg = f"Is mahine: {len(ok)} budget(s) on track, {len(over)} over."
        for b in over:
            msg += f" {b['category']} {inr(b['spent'] - b['limit'])} over ({inr(b['spent'])}/{inr(b['limit'])})."
        for b in ok[:3]:
            msg += f" {b['category']} {inr(b['limit'] - b['spent'])} left."
        polished = _llm_rewrite(ctx, question, msg)
        return polished or msg

    # mutual funds
    if re.search(r"mutual fund|best fund|top fund|fund kaisa|konsa fund|fund return|etf|niftybees|gold bees|index fund", q):
        try:
            f_data = market_svc.funds()
            top = f_data["funds"][:5]
            lines = ["💰 **Live fund performance** (NSE ETFs, sorted by 1-year return):"]
            for i, x in enumerate(top, 1):
                lines.append(f"{i}. **{x['name']}** — 1Y {x['r1y']:+.1f}% · 6M {x['r6m']:+.1f}% · "
                             f"1M {x['r1m']:+.1f}% → {x['verdict']}")
            lines.append(f"🏆 Aaj ka best: **{f_data['funds'][0]['name']}** ({f_data['funds'][0]['category']}) — "
                         f"1Y {f_data['funds'][0]['r1y']:+.1f}%")
            lines.append("💡 SIP me index ETF sabse safe start hai. ⚠️ Past returns future guarantee nahi.")
            return "\n".join(lines)
        except Exception:
            return "💰 Live fund data abhi fetch nahi hua — Market page → Funds tab kholo."

    # investment advisor
    if re.search(r"invest|nivesh|nives|sip\b|mutual|fixed deposit|\bfd\b|portfolio|wealth|what should|should i|kya karu|recommend|suggest", q):
        return smart_advice(db, user, question)

    # spend queries
    if re.search(r"spend|spent|expense|expenditure|how much|kharch|kharcha|kitna kharch|kitna lag", q):
        period = _period_match(q)
        cat = _category_from(q)
        amt = _spend_for_period(db, user.id, period, cat)
        period_txt = {"this": "is mahine", "last": "pichhle mahine", "year": "is saal", "week": "last 7 dinon mein"}[period]
        if cat:
            tmpl = f"Aapne {cat} par {period_txt} {inr(amt)} kharch kiya."
        else:
            tmpl = f"Aapne {period_txt} total {inr(amt)} kharch kiya."
        top = cats[0] if cats and not cat else None
        if top:
            tmpl += f" Sabse bada kharcha: {top['category']} {inr(top['amount'])} ({top['pct']}%)."
        polished = _llm_rewrite(ctx, question, tmpl)
        return polished or tmpl

    # income query (show income)
    if re.search(r"income|salary|earn|kamai|kamaya|kama\b|is month ki income|income dikhao|income kitni", q):
        tmpl = (f"Is mahine aapki income {inr(this_m['income'])} hai"
                + (f"; pichhle mahine {inr(last_m['income'])} thi." if last_m else ".")
                + f" Total lifetime tracked income: {inr(totals['total_income'])}.")
        polished = _llm_rewrite(ctx, question, tmpl)
        return polished or tmpl

    # top category
    if re.search(r"top|highest|most|sabse zyada|sabse bada", q):
        if cats:
            t = cats[0]
            tmpl = (f"Is mahine aapka top expense category {t['category']} hai — "
                    f"{inr(t['amount'])} ({t['pct']}% of spend).")
            if len(cats) > 1:
                tmpl += f" Second hai {cats[1]['category']} — {inr(cats[1]['amount'])}."
            polished = _llm_rewrite(ctx, question, tmpl)
            return polished or tmpl
        return "Is mahine abhi tak koi expenses record nahi ki gayi."

    # fallback: smart executive summary
    top = cats[0] if cats else None
    surplus = this_m["income"] - this_m["expense"]
    tmpl = (f"📊 Is mahine {inr(this_m['expense'])} kharch hua vs {inr(this_m['income'])} income "
            f"→ surplus {inr(surplus)}. "
            + (f"Sabse bada kharcha: {top['category']} {inr(top['amount'])}. " if top else ""))
    tips = ("\n\nYe puchh sakte ho:\n"
            "• 'Is month kitna kharch hua?'\n"
            "• '5000 income add karo'\n"
            "• '1000 food mein kharcha hua'\n"
            "• 'Next month ka forecast karo'\n"
            "• 'Meri savings kaisi hai?'\n"
            "• 'Health score batao'")
    polished = _llm_rewrite(ctx, question, tmpl)
    return (polished or tmpl) + tips


def period_txt2():
    return "this month"
