"""Module 8 — Fraud / Anomaly Detection.

Primary model: scikit-learn IsolationForest trained on the user's own
transaction history (amount log-scale, time-of-day, day-of-week, weekend flag,
category code). For new users (< 12 transactions) a robust z-score heuristic
on amount keeps the feature usable.

Each check returns a 0..1 risk score plus human-readable reasons, so the UI
can explain *why* a transaction looks suspicious.
"""
import math
from datetime import datetime
from statistics import median, stdev

import numpy as np
from sklearn.ensemble import IsolationForest

from ml.expense_classifier import CATEGORIES

CAT_CODE = {c: i for i, c in enumerate(CATEGORIES)}


def _features(amount, when, category):
    hour = when.hour if when else 12
    dow = when.isoweekday() if when else 3          # Mon..Sun
    weekend = 1 if dow >= 6 else 0
    cat = CAT_CODE.get(category, len(CATEGORIES) - 1)
    return [math.log1p(max(0.0, amount)), float(hour), float(dow), float(weekend), float(cat)]


def explain(amount, when, category, history):
    reasons = []
    amts = [h["amount"] for h in history if h.get("amount")]
    if amts:
        med = median(amts) or 1.0
        ratio = amount / med
        if ratio > 5:
            reasons.append(f"Amount is {ratio:.0f}× your typical transaction (median {med:,.0f} INR).")
        elif ratio > 2.5:
            reasons.append(f"Amount is {ratio:.1f}× higher than your typical transaction.")
    if when and when.hour in (0, 1, 2, 3, 4, 5):
        reasons.append(f"Transaction at {when.strftime('%I:%M %p')} — unusual time for your profile.")
    hist_cats = {h.get("category") for h in history[-12:]}
    if category and category != "Other" and category not in hist_cats and len(history) > 6:
        reasons.append(f"'{category}' is an unusual category in your recent pattern.")
    desc = (history and "") or ""
    if not reasons:
        reasons.append("Pattern sits near your historical behaviour; monitor only.")
    return reasons


def check_transaction(history, amount, description="", category="Other", when=None):
    """
    history: list of dicts {amount, date(YYYY-MM-DD), category} — the user's past transactions.
    Returns {risk_score, is_suspicious, reasons, model}.
    """
    when = when or datetime.now()
    new_feat = _features(amount, when, category)

    if len(history) >= 12:
        X = np.array([_features(h["amount"], h.get("_when") or datetime.strptime(str(h["date"])[:10], "%Y-%m-%d"), h.get("category", "Other")) for h in history])
        model = IsolationForest(n_estimators=150, contamination=0.05, random_state=42).fit(X)
        score = float(model.score_samples(np.array([new_feat]))[0])
        decision = int(model.predict(np.array([new_feat]))[0])          # -1 = anomaly
        # score > offset_ → normal. Map the gap to a 0..1 risk score.
        gap = score - float(model.offset_)
        risk = max(0.0, min(1.0, 0.5 - gap * 2.0))
        model_name = "IsolationForest"
        is_susp = decision == -1 or risk > 0.65
    else:
        amts = [h["amount"] for h in history if h.get("amount")]
        model_name = "z-score heuristic"
        if len(amts) >= 3:
            mu = sum(amts) / len(amts)
            sd = stdev(amts) or 1.0
            z = abs(math.log1p(amount) - math.log1p(mu)) / max(1e-6, (stdev([math.log1p(a) for a in amts]) or 1.0))
            risk = max(0.0, min(1.0, (z - 1.0) / 3.0))
        else:
            med = median(amts) if amts else amount
            risk = 0.85 if amount > 5 * max(med, 1.0) else 0.15
        is_susp = risk > 0.6

    reasons = explain(amount, when, category, history)
    return {
        "risk_score": round(risk, 3),
        "is_suspicious": bool(is_susp),
        "reasons": reasons,
        "model": model_name,
    }
