"""Currency Conversion Service for FinMate AI.

Provides real-time and resilient fallback exchange rates to Indian Rupee (INR ₹)
for international receipts, invoices, and multi-currency expense tracking.
"""
import json
import logging
import re
import threading
import time
import urllib.request
from typing import Dict, Any, Tuple

logger = logging.getLogger("finmate.currency")

# Benchmark Exchange Rates to INR (1 Unit of Foreign Currency = X INR)
# Updated mid-market benchmark rates
DEFAULT_RATES_TO_INR: Dict[str, float] = {
    "INR": 1.0,
    "USD": 86.80,    # US Dollar
    "EUR": 93.40,    # Euro
    "GBP": 111.50,   # British Pound
    "AED": 23.63,    # UAE Dirham
    "CAD": 62.10,    # Canadian Dollar
    "AUD": 56.40,    # Australian Dollar
    "SGD": 64.90,    # Singapore Dollar
    "SAR": 23.14,    # Saudi Riyal
    "JPY": 0.57,     # Japanese Yen
    "THB": 2.54,     # Thai Baht
    "QAR": 23.84,    # Qatari Riyal
    "KWD": 282.40,   # Kuwaiti Dinar
    "CHF": 97.20,    # Swiss Franc
    "MYR": 19.50,    # Malaysian Ringgit
    "NZD": 51.20,    # New Zealand Dollar
}

CURRENCY_SYMBOLS: Dict[str, str] = {
    "INR": "₹",
    "USD": "$",
    "EUR": "€",
    "GBP": "£",
    "AED": "AED",
    "CAD": "C$",
    "AUD": "A$",
    "SGD": "S$",
    "SAR": "﷼",
    "JPY": "¥",
    "THB": "฿",
    "QAR": "QR",
    "KWD": "KD",
    "CHF": "CHF",
    "MYR": "RM",
    "NZD": "NZ$",
}

CURRENCY_NAMES: Dict[str, str] = {
    "INR": "Indian Rupee (₹)",
    "USD": "US Dollar ($)",
    "EUR": "Euro (€)",
    "GBP": "British Pound (£)",
    "AED": "UAE Dirham (AED)",
    "CAD": "Canadian Dollar (C$)",
    "AUD": "Australian Dollar (A$)",
    "SGD": "Singapore Dollar (S$)",
    "SAR": "Saudi Riyal (SAR)",
    "JPY": "Japanese Yen (¥)",
    "THB": "Thai Baht (฿)",
    "QAR": "Qatari Riyal (QAR)",
    "KWD": "Kuwaiti Dinar (KWD)",
    "CHF": "Swiss Franc (CHF)",
}

# Live memory cache for exchange rates
_rates_cache = dict(DEFAULT_RATES_TO_INR)
_rates_last_updated = 0.0
_cache_lock = threading.Lock()


def fetch_live_rates() -> Dict[str, float]:
    """Fetch live mid-market exchange rates against INR with instant timeout."""
    global _rates_cache, _rates_last_updated
    now = time.time()
    # Cache for 2 hours
    if _rates_last_updated > 0 and (now - _rates_last_updated < 7200):
        return _rates_cache

    try:
        req = urllib.request.Request(
            "https://open.er-api.com/v6/latest/USD",
            headers={"User-Agent": "FinMateAI/1.0"}
        )
        with urllib.request.urlopen(req, timeout=2.5) as resp:
            data = json.loads(resp.read().decode())
            usd_rates = data.get("rates", {})
            inr_per_usd = usd_rates.get("INR")
            if inr_per_usd and inr_per_usd > 50:
                with _cache_lock:
                    _rates_cache["USD"] = round(float(inr_per_usd), 2)
                    for curr in DEFAULT_RATES_TO_INR:
                        if curr == "INR":
                            _rates_cache["INR"] = 1.0
                        elif curr == "USD":
                            continue
                        elif curr in usd_rates and usd_rates[curr] > 0:
                            # 1 unit of CURR = (1 / usd_rates[curr]) USD = (inr_per_usd / usd_rates[curr]) INR
                            rate_inr = inr_per_usd / usd_rates[curr]
                            _rates_cache[curr] = round(float(rate_inr), 2)
                    _rates_last_updated = now
                logger.info("✅ Live exchange rates updated successfully: 1 USD = ₹%.2f INR", _rates_cache["USD"])
    except Exception as e:
        logger.debug("Using benchmark exchange rates (Live API fetch skipped: %s)", e)

    return _rates_cache


# Initial non-blocking background fetch
def _async_init_rates():
    threading.Thread(target=fetch_live_rates, daemon=True).start()

_async_init_rates()


def get_rate(currency: str) -> float:
    """Get conversion rate of 1 unit of foreign currency to INR."""
    curr = (currency or "INR").upper().strip()
    return _rates_cache.get(curr, DEFAULT_RATES_TO_INR.get(curr, 1.0))


def detect_currency(text: str) -> Tuple[str, str]:
    """Detect currency code and symbol from text or receipt raw string."""
    t = (text or "").upper()
    if "$" in text or "USD" in t or "DOLLAR" in t:
        return "USD", "$"
    if "€" in text or "EUR" in t or "EURO" in t:
        return "EUR", "€"
    if "£" in text or "GBP" in t or "POUND" in t:
        return "GBP", "£"
    if "AED" in t or "DIRHAM" in t:
        return "AED", "AED"
    if "C$" in text or "CAD" in t:
        return "CAD", "C$"
    if "A$" in text or "AUD" in t:
        return "AUD", "A$"
    if "S$" in text or "SGD" in t:
        return "SGD", "S$"
    if "SAR" in t or "RIYAL" in t:
        return "SAR", "SAR"
    if "¥" in text or "JPY" in t or "YEN" in t:
        return "JPY", "¥"
    # Default to INR
    return "INR", "₹"


def convert_receipt_currency(amount: float, tax: float, currency: str) -> Dict[str, Any]:
    """Convert receipt amount and tax to INR, preserving original currency details."""
    curr = (currency or "INR").upper().strip()
    rate = get_rate(curr)
    symbol = CURRENCY_SYMBOLS.get(curr, curr)
    is_foreign = (curr != "INR")

    amt = float(amount or 0.0)
    tx = float(tax or 0.0)

    converted_amount = round(amt * rate, 2)
    converted_tax = round(tx * rate, 2)

    return {
        "original_amount": amt,
        "original_tax": tx,
        "original_currency": curr,
        "currency_symbol": symbol,
        "exchange_rate": rate,
        "is_foreign_currency": is_foreign,
        "converted_amount_inr": converted_amount,
        "converted_tax_inr": converted_tax,
        "amount": converted_amount,   # Default for Indian expense ledger (INR)
        "tax": converted_tax,         # Default tax in INR
        "conversion_summary": (
            f"{symbol}{amt:,.2f} {curr} -> ₹{converted_amount:,.2f} INR (Rate: 1 {curr} = ₹{rate:,.2f})"
            if is_foreign else f"₹{converted_amount:,.2f} INR"
        )
    }


def get_all_supported_currencies() -> list[dict]:
    """List of all supported currencies with names, symbols, and current INR rate."""
    rates = fetch_live_rates()
    out = []
    for code, name in CURRENCY_NAMES.items():
        out.append({
            "code": code,
            "name": name,
            "symbol": CURRENCY_SYMBOLS.get(code, code),
            "rate_to_inr": rates.get(code, DEFAULT_RATES_TO_INR.get(code, 1.0)),
        })
    return out
