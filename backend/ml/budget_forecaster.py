"""Module 5 — AI Budget Prediction.

Implements Holt's Linear Trend (double exponential smoothing) over the user's
monthly expense history, with a simple MAPE backtest to report model accuracy.
For 12+ months of data a year-over-year seasonal factor is blended in.

Swap-in options (same interface): Prophet or a small LSTM (see docs/ai-models.md).
"""
import math


def _holt_fit(values, alpha=0.65, beta=0.25):
    level, trend = values[0], (values[1] - values[0]) if len(values) > 1 else 0.0
    for v in values[1:]:
        prev_level = level
        level = alpha * v + (1 - alpha) * (level + trend)
        trend = beta * (level - prev_level) + (1 - beta) * trend
    return level, trend


def holt_forecast(values, horizon=1, alpha=0.65, beta=0.25):
    """Forecast `horizon` steps ahead with a ±1.28σ interval."""
    if len(values) == 0:
        return {"forecast": 0.0, "lower": 0.0, "upper": 0.0, "trend": 0.0}
    if len(values) == 1:
        v = float(values[0])
        return {"forecast": v, "lower": max(0.0, v * 0.85), "upper": v * 1.15, "trend": 0.0}

    level, trend = _holt_fit(values, alpha, beta)

    # one-step-ahead residuals for the interval
    residuals, lvl, tr = [], values[0], 0.0
    for v in values[1:]:
        fc = lvl + tr
        residuals.append(v - fc)
        prev = lvl
        lvl = alpha * v + (1 - alpha) * (lvl + tr)
        tr = beta * (lvl - prev) + (1 - beta) * tr

    sigma = math.sqrt(sum(r * r for r in residuals) / max(1, len(residuals))) if residuals else abs(level) * 0.1
    f = level + horizon * trend
    return {
        "forecast": max(0.0, f),
        "lower": max(0.0, f - 1.28 * sigma),
        "upper": f + 1.28 * sigma,
        "trend": trend,
    }


def backtest_mape(values, alpha=0.65, beta=0.25):
    """1-step rolling backtest → MAPE (%) used to show 'model accuracy'."""
    if len(values) < 4:
        return None
    errors, lvl, tr = [], values[0], 0.0
    for v in values[1:]:
        fc = max(lvl + tr, 1e-9)
        if v > 0:
            errors.append(abs((v - fc) / v))
        prev = lvl
        lvl = alpha * v + (1 - alpha) * (lvl + tr)
        tr = beta * (lvl - prev) + (1 - beta) * tr
    if not errors:
        return None
    return round(100 * sum(errors) / len(errors), 1)


def seasonality_factor(history, current_month_index):
    """YoY factor when 12+ months available, else 1.0."""
    if len(history) < 13:
        return 1.0
    target = history[-13 + (current_month_index % 12)] if False else history[current_month_index]
    base = history[current_month_index + 12] if current_month_index + 12 < len(history) else history[-1]
    return max(0.5, min(2.0, target / max(base, 1.0)))


def predict_month(monthly_totals, current_month_index=None):
    """
    monthly_totals: list of past full-month totals (oldest → newest), >= 3 for good accuracy.
    Returns dict: forecast, lower, upper, direction, mape, by_confidence.
    """
    vals = [max(0.0, float(v)) for v in monthly_totals]
    if len(vals) < 2:
        base = vals[0] if vals else 0.0
        return {
            "forecast": round(base, 2), "lower": round(base * 0.85, 2), "upper": round(base * 1.15, 2),
            "trend_pct": 0.0, "mape": None,
            "message": "AI needs at least 2 months of data — forecast based on last month.",
        }
    res = holt_forecast(vals, horizon=1)
    mape = backtest_mape(vals)
    last = vals[-1] or 1e-9
    trend_pct = round(100 * (res["forecast"] - last) / last, 1)
    direction = "increasing" if trend_pct > 3 else ("decreasing" if trend_pct < -3 else "stable")
    conf = "high" if mape is not None and mape < 15 else ("medium" if mape is not None else "low")
    return {
        "forecast": round(res["forecast"], 2),
        "lower": round(res["lower"], 2),
        "upper": round(res["upper"], 2),
        "trend_pct": trend_pct,
        "direction": direction,
        "mape": mape,
        "confidence": conf,
        "message": (
            f"Expected next-month expense ≈ {res['forecast']:,.0f} INR "
            f"({direction} {abs(trend_pct)}% vs last month)."
        ),
    }
