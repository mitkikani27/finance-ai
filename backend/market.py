"""Module 13 — Live Market Data + AI Stock Insights (educational).

Real-time NSE data via Yahoo Finance (yfinance — free, no API key).
An explainable momentum AI scores every stock; the chatbot and the
Market page reuse this service for "aaj kya chal raha hai" answers.

⚠️ Educational use only — not investment advice (see disclaimer below).
"""
import json
import math
import time
from pathlib import Path

import numpy as np
import pandas as pd

try:
    import yfinance as yf
except Exception:  # yfinance optional — app must boot without it
    yf = None

CACHE_PATH = Path(__file__).resolve().parent / ".market_cache.json"
CACHE_TTL = 600          # 10 minutes — market data doesn't need per-second refresh
UNIVERSE_REFRESH = 21600 # full universe snapshot re-downloaded every 6 h

# ── Stock universe: 40 popular NSE stocks across 9 sectors ─────────────────
UNIVERSE = {
    "RELIANCE.NS":  ("Reliance Industries", "Energy"),
    "ONGC.NS":      ("ONGC", "Energy"),
    "NTPC.NS":      ("NTPC", "Energy"),
    "POWERGRID.NS": ("Power Grid", "Energy"),
    "TATAPOWER.NS": ("Tata Power", "Energy"),
    "TCS.NS":       ("TCS", "IT"),
    "INFY.NS":      ("Infosys", "IT"),
    "WIPRO.NS":     ("Wipro", "IT"),
    "HCLTECH.NS":   ("HCL Technologies", "IT"),
    "TECHM.NS":     ("Tech Mahindra", "IT"),
    "HDFCBANK.NS":  ("HDFC Bank", "Banking & Finance"),
    "ICICIBANK.NS": ("ICICI Bank", "Banking & Finance"),
    "SBIN.NS":      ("State Bank of India", "Banking & Finance"),
    "KOTAKBANK.NS": ("Kotak Mahindra Bank", "Banking & Finance"),
    "AXISBANK.NS":  ("Axis Bank", "Banking & Finance"),
    "PNB.NS":       ("Punjab National Bank", "Banking & Finance"),
    "BAJFINANCE.NS":("Bajaj Finance", "Banking & Finance"),
    "M&M.NS":       ("Mahindra & Mahindra", "Auto"),
    "HEROMOTOCO.NS":("Hero MotoCorp", "Auto"),
    "TVSMOTOR.NS":  ("TVS Motor", "Auto"),
    "MARUTI.NS":    ("Maruti Suzuki", "Auto"),
    "BAJAJ-AUTO.NS":("Bajaj Auto", "Auto"),
    "EICHERMOT.NS": ("Eicher Motors", "Auto"),
    "ASHOKLEY.NS":  ("Ashok Leyland", "Auto"),
    "HINDUNILVR.NS":("Hindustan Unilever", "FMCG"),
    "ITC.NS":       ("ITC", "FMCG"),
    "NESTLEIND.NS": ("Nestlé India", "FMCG"),
    "BRITANNIA.NS": ("Britannia", "FMCG"),
    "DABUR.NS":     ("Dabur", "FMCG"),
    "SUNPHARMA.NS": ("Sun Pharma", "Pharma"),
    "DRREDDY.NS":   ("Dr. Reddy's Labs", "Pharma"),
    "CIPLA.NS":     ("Cipla", "Pharma"),
    "DIVISLAB.NS":  ("Divi's Labs", "Pharma"),
    "AUROPHARMA.NS":("Aurobindo Pharma", "Pharma"),
    "TATASTEEL.NS": ("Tata Steel", "Metals"),
    "JSWSTEEL.NS":  ("JSW Steel", "Metals"),
    "HINDALCO.NS":  ("Hindalco", "Metals"),
    "VEDL.NS":      ("Vedanta", "Metals"),
    "BHARTIARTL.NS":("Bharti Airtel", "Telecom"),
    "LT.NS":        ("Larsen & Toubro", "Infrastructure"),
    "ADANIENT.NS":  ("Adani Enterprises", "Infrastructure"),
}


# short names people actually type → universe symbol
ALIASES = {
    "reliance": "RELIANCE.NS", "ongc": "ONGC.NS", "ntpc": "NTPC.NS",
    "powergrid": "POWERGRID.NS", "tata power": "TATAPOWER.NS",
    "tcs": "TCS.NS", "infosys": "INFY.NS", "infy": "INFY.NS", "wipro": "WIPRO.NS",
    "hcl": "HCLTECH.NS", "tech mahindra": "TECHM.NS",
    "hdfc bank": "HDFCBANK.NS", "hdfc": "HDFCBANK.NS", "icici": "ICICIBANK.NS",
    "icici bank": "ICICIBANK.NS", "sbi": "SBIN.NS", "kotak": "KOTAKBANK.NS",
    "axis bank": "AXISBANK.NS", "axis": "AXISBANK.NS", "pnb": "PNB.NS",
    "bajaj finance": "BAJFINANCE.NS",
    "mahindra": "M&M.NS", "maruti": "MARUTI.NS", "eicher": "EICHERMOT.NS",
    "ashok leyland": "ASHOKLEY.NS", "hero": "HEROMOTOCO.NS", "tvs": "TVSMOTOR.NS",
    "hul": "HINDUNILVR.NS", "hindustan unilever": "HINDUNILVR.NS", "itc": "ITC.NS",
    "nestle": "NESTLEIND.NS", "britannia": "BRITANNIA.NS", "dabur": "DABUR.NS",
    "sun pharma": "SUNPHARMA.NS", "dr reddy": "DRREDDY.NS", "cipla": "CIPLA.NS",
    "divi": "DIVISLAB.NS", "aurobindo": "AUROPHARMA.NS",
    "tata steel": "TATASTEEL.NS", "jsw": "JSWSTEEL.NS", "hindalco": "HINDALCO.NS",
    "vedanta": "VEDL.NS", "airtel": "BHARTIARTL.NS", "bharti": "BHARTIARTL.NS",
    "l&t": "LT.NS", "larsen": "LT.NS", "adani": "ADANIENT.NS",
}


def match_symbol(question: str) -> str | None:
    """If the question mentions a tracked stock, return its universe symbol."""
    q = f" {question.lower()} "
    hits = [(q.find(a), a) for a in ALIASES if a in q]
    if not hits:
        return None
    hits.sort()
    return ALIASES[hits[0][1]]


# ── Mutual funds / ETFs (real NSE-listed index funds, live Yahoo data) ──────
FUNDS = {
    "NIFTYBEES.NS":   ("Nippon Nifty 50 ETF",       "Index – Large Cap"),
    "JUNIORBEES.NS":  ("Nifty Next 50 ETF",         "Index – Large Cap"),
    "MID150BEES.NS":  ("Nifty Midcap 150 ETF",      "Index – Mid Cap"),
    "BANKBEES.NS":    ("Nifty Bank ETF",            "Sector – Banking"),
    "ITBEES.NS":      ("Nifty IT ETF",              "Sector – IT"),
    "PSUBNKBEES.NS":  ("PSU Bank ETF",              "Sector – PSU Bank"),
    "GOLDBEES.NS":    ("Gold ETF",                  "Commodity – Gold"),
    "SILVERBEES.NS":  ("Silver ETF",                "Commodity – Silver"),
    "LIQUIDBEES.NS":  ("Liquid ETF",                "Debt – Money Market"),
    "MON100.NS":      ("Nasdaq 100 ETF (USA)",      "International – US Tech"),
    "MAFANG.NS":      ("NYSE FANG+ ETF (USA)",      "International – US Tech"),
}

INDICES = [("^NSEI", "NIFTY 50"), ("^BSESN", "SENSEX"), ("^NSEBANK", "BANK NIFTY")]

DISCLAIMER = ("Educational information only — NOT investment advice. Markets carry risk; "
              "kisi bhi decision se pehle SEBI-registered investment adviser se consult karein.")


# ── download + cache (indices near-real-time 60s · stocks 10 min) ───────────
def _cache_fresh() -> dict | None:
    try:
        data = json.loads(CACHE_PATH.read_text())
        if time.time() - data.get("ts", 0) < CACHE_TTL:
            return data
    except Exception:
        pass
    return None


def _cache_save(data: dict) -> None:
    try:
        CACHE_PATH.write_text(json.dumps(data))
    except Exception:
        pass


def _indices_snapshot() -> list[dict]:
    """Indices refreshed every 60s. Value/Δ from daily candles; intraday sparkline
    from 1-minute candles (falls back to daily closes on market holidays)."""
    cache = _cache_fresh() or {}
    if cache.get("indices") and time.time() - cache.get("indices_ts", 0) < 60:
        return cache["indices"]

    out: dict[str, dict] = {}
    for sym, name in INDICES:
        entry = None
        try:
            daily = _history(sym, "5d")["Close"].dropna()
            if len(daily) >= 2:
                last, prev = float(daily.iloc[-1]), float(daily.iloc[-2])
                spark = [round(float(x), 2) for x in daily.tail(10).tolist()]
                try:  # intraday 1-minute candles (market hours only)
                    intra = yf.Ticker(sym).history(period="1d", interval="1m")["Close"].dropna()
                    if len(intra) >= 2:
                        spark = [round(float(x), 2) for x in intra.tail(75).tolist()]
                        last = float(intra.iloc[-1])
                except Exception:
                    pass
                entry = {"name": name, "value": round(last, 2),
                         "chg": round((last / prev - 1) * 100, 2), "intraday": spark}
        except Exception:
            entry = None
        if entry:
            out[sym] = entry

    if out:
        cache["indices"], cache["indices_ts"] = list(out.values()), time.time()
        _cache_save(cache)
        return cache["indices"]
    return cache.get("indices", [])


def _history(symbol: str, period: str = "6mo") -> pd.DataFrame:
    return yf.Ticker(symbol).history(period=period, auto_adjust=False)


def _metrics(hist: pd.DataFrame) -> dict | None:
    """Explainable momentum/trend metrics + AI score for one stock."""
    if hist is None or len(hist) < 30:
        return None
    close = hist["Close"].dropna()
    if len(close) < 30:
        return None
    last = float(close.iloc[-1])
    prev = float(close.iloc[-2])
    day_chg = (last / prev - 1) * 100

    def ret(days: int) -> float | None:
        if len(close) <= days:
            return None
        return (last / float(close.iloc[-1 - days]) - 1) * 100

    mom5d, mom1m, mom3m = ret(5), ret(22), ret(66)
    ma50 = float(close.tail(50).mean())
    trend = (last / ma50 - 1) * 100

    daily = close.pct_change().dropna().tail(20)
    vol20 = float(daily.std()) * 100  # daily volatility %

    vol = hist.get("Volume")
    vol_ratio = None
    if vol is not None and len(vol) > 21:
        avg20 = float(vol.tail(21).head(20).mean())
        if avg20 > 0:
            vol_ratio = float(vol.iloc[-2]) / avg20

    # ── AI score (0–100): momentum + trend + volume, volatility penalty ──
    raw = (35 * math.tanh((mom5d or 0) / 3.0)
           + 30 * math.tanh((mom1m or 0) / 10.0)
           + 25 * math.tanh(trend / 8.0)
           + 10 * math.tanh(((vol_ratio or 1) - 1) * 2.0)
           - 15 * math.tanh(vol20 / 2.0))
    score = round(max(0.0, min(100.0, (raw + 60) / 120 * 100)), 1)

    reasons = []
    if (mom5d or 0) > 2:   reasons.append(f"Pichle 5 din me +{mom5d:.1f}% ka strong move")
    if (mom1m or 0) > 5:   reasons.append(f"1 mahine me +{mom1m:.1f}% momentum")
    if trend > 3:          reasons.append(f"50-day average se {trend:+.1f}% upar — uptrend")
    elif trend < -3:       reasons.append(f"50-day average se {trend:.1f}% neeche — downtrend")
    if vol_ratio and vol_ratio > 1.5: reasons.append(f"Volume normal se {vol_ratio:.1f}x — buyers active")
    if vol20 > 2.5:        reasons.append(f"High volatility ({vol20:.1f}%) — risk zyada")
    if not reasons:
        reasons.append("Sideways/neutral chal raha hai — koi strong signal nahi")

    verdict = "Strong" if score >= 65 else ("Neutral" if score >= 45 else "Weak")
    return {"price": round(last, 2), "day_chg": round(day_chg, 2),
            "mom5d": round(mom5d, 2) if mom5d is not None else None,
            "mom1m": round(mom1m, 2) if mom1m is not None else None,
            "trend_vs_ma50": round(trend, 2), "vol20": round(vol20, 2),
            "score": score, "verdict": verdict, "reasons": reasons}


def _snapshot(force: bool = False) -> dict:
    """Download the whole universe + indices once, cache to disk."""
    if not force:
        c = _cache_fresh()
        if c:
            return c
    if yf is None:
        raise RuntimeError("yfinance not installed")

    data: dict = {"ts": time.time(), "indices": _indices_snapshot(), "stocks": {}}

    for sym, (name, sector) in UNIVERSE.items():
        try:
            m = _metrics(_history(sym))
            if m:
                m.update({"name": name, "sector": sector})
                data["stocks"][sym] = m
        except Exception:
            continue

    if not data["stocks"]:
        raise RuntimeError("Live market data unavailable (internet required)")
    _cache_save(data)
    return data


# ── public service functions ────────────────────────────────────────────────
def overview() -> dict:
    d = _snapshot()
    stocks = d["stocks"]
    adv = sum(1 for s in stocks.values() if s["day_chg"] > 0)
    dec = sum(1 for s in stocks.values() if s["day_chg"] < 0)
    mood = "Bullish 🐂" if adv >= len(stocks) * 0.6 else ("Bearish 🐻" if dec >= len(stocks) * 0.6 else "Mixed ⚖️")

    sectors: dict[str, list[float]] = {}
    for s in stocks.values():
        sectors.setdefault(s["sector"], []).append(s["day_chg"])
    sector_perf = sorted(
        [{"sector": k, "chg": round(float(np.mean(v)), 2), "count": len(v)}
         for k, v in sectors.items()],
        key=lambda x: x["chg"], reverse=True)

    return {"indices": d["indices"], "mood": mood,
            "advancers": adv, "decliners": dec, "sectors": sector_perf,
            "updated_at": time.strftime("%d %b %Y, %H:%M", time.localtime(d["ts"])),
            "disclaimer": DISCLAIMER}


def trending() -> dict:
    d = _snapshot()
    rows = [{"symbol": sym.replace(".NS", ""), **v} for sym, v in d["stocks"].items()]
    rows.sort(key=lambda x: x["day_chg"], reverse=True)
    return {"gainers": rows[:5], "losers": list(reversed(rows[-5:])),
            "all": rows, "disclaimer": DISCLAIMER}


def insights() -> dict:
    """AI assistant answer: aaj kya perform kar raha hai, kis sector me dum hai."""
    o, t = overview(), trending()
    picks = sorted(t["all"], key=lambda x: x["score"], reverse=True)[:3]
    return {"mood": o["mood"], "advancers": o["advancers"], "decliners": o["decliners"],
            "indices": o["indices"],
            "best_sector": o["sectors"][0] if o["sectors"] else None,
            "worst_sector": o["sectors"][-1] if o["sectors"] else None,
            "sector_performance": o["sectors"],
            "top_picks": picks,
            "summary": _summary_text(o, picks),
            "updated_at": o["updated_at"], "disclaimer": DISCLAIMER}


def _summary_text(o: dict, picks: list) -> str:
    best = o["sectors"][0]["sector"] if o["sectors"] else "-"
    top = picks[0] if picks else None
    s = (f"Aaj market {o['mood']} hai — {o['advancers']} stocks upar, "
         f"{o['decliners']} neeche. Sabse strong sector: {best}. ")
    if top:
        s += (f"AI ka top momentum pick: {top['name']} (₹{top['price']}, "
              f"day {top['day_chg']:+.1f}%, score {top['score']}/100). ")
    s += "Yaad rahe: ye sirf educational analysis hai — investment advice nahi."
    return s



def funds() -> dict:
    """Best-performing fund/ETF list: real prices, 1M/6M/1Y returns, verdicts."""
    d = _snapshot()
    out = []
    for sym, (name, category) in FUNDS.items():
        try:
            h = _history(sym, "1y")["Close"].dropna()
            if len(h) < 40:
                continue
            last = float(h.iloc[-1])

            def ret(days: int) -> float | None:
                if len(h) <= days:
                    return None
                return (last / float(h.iloc[-1 - days]) - 1) * 100

            r1m, r6m = ret(21), ret(126)
            # 1y daily data ≈ 250 rows — a 252-day lookback never exists, use earliest row
            r1y = (last / float(h.iloc[0]) - 1) * 100
            if r1y is None:
                continue
            verdict = ("Great 🔥" if r1y > 20 else "Good ✅" if r1y > 8
                       else "Flat ➖" if r1y > 0 else "Negative ⚠️")
            prev = float(h.iloc[-2])
            out.append({"symbol": sym.replace(".NS", ""), "name": name, "category": category,
                        "price": round(last, 2), "day_chg": round((last / prev - 1) * 100, 2),
                        "r1m": round(r1m, 1), "r6m": round(r6m, 1), "r1y": round(r1y, 1),
                        "verdict": verdict})
        except Exception:
            continue
    if not out:
        raise RuntimeError("fund data unavailable")
    out.sort(key=lambda x: x["r1y"], reverse=True)
    return {"funds": out, "disclaimer": "Past returns are not a guarantee of future performance. "
                                        "Educational data — direct mutual funds par brokerage/expense ratio check karein."}


def stock_detail(symbol: str) -> dict:
    sym = symbol.upper()
    full = sym if sym.endswith(".NS") else f"{sym}.NS"
    if full not in UNIVERSE:
        raise LookupError(sym)
    d = _snapshot()
    s = d["stocks"].get(full)
    if not s:
        raise LookupError(sym)
    hist = _history(full, "1mo")
    spark = [round(float(x), 2) for x in hist["Close"].dropna().tail(30).tolist()]
    name, sector = UNIVERSE[full]
    return {"symbol": sym, "name": name, "sector": sector, **s,
            "sparkline": spark, "disclaimer": DISCLAIMER}
