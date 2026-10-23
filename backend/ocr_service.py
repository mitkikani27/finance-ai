"""Module 10 — Receipt Scanner with AI Vision (Gemini + Tesseract OCR fallback).

Uses Google Gemini Multimodal Vision to extract shop name, items, date, gross amount,
tax/GST, payment mode, and expense category with high accuracy.
Falls back to robust Tesseract OCR if AI is unavailable.
"""
import io
import json
import os
import re
import shutil
from datetime import datetime
from pathlib import Path
from PIL import Image, ImageOps

# ── Tesseract fallback setup ──────────────────────────────────────────────────

def _find_tesseract() -> str | None:
    cmd = os.environ.get("TESSERACT_CMD", "").strip()
    if cmd and Path(cmd).exists():
        return cmd
    found = shutil.which("tesseract")
    if found:
        return found
    candidates = [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Tesseract-OCR" / "tesseract.exe",
        "/usr/bin/tesseract", "/usr/local/bin/tesseract",
        "/opt/homebrew/bin/tesseract",
    ]
    for c in candidates:
        try:
            if c and Path(c).exists():
                return str(c)
        except Exception:
            continue
    return None

TESSERACT_PATH = _find_tesseract()
OCR_AVAILABLE = TESSERACT_PATH is not None
if TESSERACT_PATH:
    try:
        import pytesseract
        pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH
    except ImportError:
        pass


def _to_gray(img: Image.Image) -> Image.Image:
    img = ImageOps.exif_transpose(img)
    if img.mode != "L":
        img = img.convert("L")
    if img.width < 600:
        img = img.resize((img.width * 2, img.height * 2))
    return img


# ── AI Vision Extraction (Gemini) ─────────────────────────────────────────────

def _extract_with_gemini(img: Image.Image) -> dict | None:
    """Use Gemini 3.5/Flash Vision to extract structured receipt data."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None
    try:
        from google import genai
        client = genai.Client(api_key=api_key)

        prompt = (
            "You are an expert AI Receipt and Invoice scanner.\n"
            "Analyze this receipt image and extract the exact details as valid JSON.\n"
            "Return ONLY a single valid JSON object with these exact keys:\n"
            "{\n"
            '  "shop": "Store / merchant / restaurant name",\n'
            '  "amount": 0.0, // grand total payable amount as a pure number (no currency symbols)\n'
            '  "tax": 0.0, // GST, CGST+SGST, VAT or sales tax as a pure number (0.0 if not found)\n'
            '  "date": "YYYY-MM-DD", // date of transaction (or today if not readable)\n'
            '  "category": "Food", // choose best from: Food, Groceries, Fuel, Rent, EMI, Medical, Transport, Entertainment, Shopping, Utilities, Education, Travel, Other\n'
            '  "payment_mode": "Card", // choose best from: UPI, Card, Cash, NetBanking, Other\n'
            '  "items": [ // list of items purchased\n'
            '     {"name": "Item Name", "qty": 1, "price": 10.0}\n'
            '  ],\n'
            '  "currency": "INR", // INR, USD, EUR, etc.\n'
            '  "raw_text_preview": "Short summary of the receipt items and details"\n'
            "}\n"
            "Rules:\n"
            "- Output ONLY valid raw JSON.\n"
            "- Do not include markdown code fence (```json ... ```).\n"
            "- amount and tax must be numbers, not strings."
        )

        models_to_try = ["gemini-3.5-flash", "gemini-3-flash-preview", "gemini-2.5-flash", "gemini-flash-latest"]
        resp_text = None
        for m in models_to_try:
            try:
                resp = client.models.generate_content(model=m, contents=[img, prompt])
                if resp and resp.text:
                    resp_text = resp.text
                    break
            except Exception:
                continue

        if not resp_text:
            return None

        # Clean JSON text
        clean = resp_text.strip()
        if clean.startswith("```"):
            clean = re.sub(r"^```(?:json)?\s*", "", clean)
            clean = re.sub(r"\s*```$", "", clean)

        data = json.loads(clean.strip())

        # Validate & clean amount
        amt = data.get("amount")
        if isinstance(amt, str):
            amt = float(re.sub(r"[^\d.]", "", amt) or 0)
        elif not isinstance(amt, (int, float)):
            amt = 0.0

        tax = data.get("tax")
        if isinstance(tax, str):
            tax = float(re.sub(r"[^\d.]", "", tax) or 0)
        elif not isinstance(tax, (int, float)):
            tax = 0.0

        # Validate date
        rdate = data.get("date")
        if rdate:
            try:
                datetime.strptime(rdate[:10], "%Y-%m-%d")
                rdate = rdate[:10]
            except Exception:
                rdate = datetime.now().strftime("%Y-%m-%d")
        else:
            rdate = datetime.now().strftime("%Y-%m-%d")

        category = data.get("category") or "Shopping"
        valid_cats = ["Food", "Groceries", "Fuel", "Rent", "EMI", "Medical", "Transport",
                      "Entertainment", "Shopping", "Utilities", "Education", "Travel", "Other"]
        if category not in valid_cats:
            category = "Shopping"

        return {
            "shop": data.get("shop") or "Receipt",
            "amount": round(float(amt), 2),
            "tax": round(float(tax), 2),
            "date": rdate,
            "category": category,
            "payment_mode": data.get("payment_mode") or "Card",
            "items": data.get("items") or [],
            "currency": data.get("currency") or "INR",
            "raw_text_preview": data.get("raw_text_preview") or f"{data.get('shop')} - ₹{amt}",
            "confidence": 0.98,
            "method": "ai_vision",
        }
    except Exception as e:
        print("Gemini Vision extraction error:", e)
        return None


# ── Tesseract Regex Fallback ──────────────────────────────────────────────────

AMOUNT_PATTERNS = [
    r"(?:=|\b)(?:TOTAL|GRAND\s*TOTAL|NET\s*(?:AMOUNT|PAYABLE)?|AMOUNT\s*DUE|BALANCE\s*DUE)\s*[:=]?\s*(?:Rs\.?|INR|₹|\$|USD)?\s*([\d,]+(?:\.\d{1,2})?)",
    r"(?:SUBTOTAL|SUB\s*TOTAL)\s*[:=]?\s*(?:Rs\.?|INR|₹|\$|USD)?\s*([\d,]+(?:\.\d{1,2})?)",
    r"[₹\$]\s*([\d,]+(?:\.\d{1,2})?)",
    r"\bRs\.?\s*([\d,]+(?:\.\d{1,2})?)",
    r"\bINR\s*([\d,]+(?:\.\d{1,2})?)",
]

DATE_PATTERNS = [
    r"(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
    r"(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{2,4})",
    r"(\d{4}[/-]\d{1,2}[/-]\d{1,2})",
]

TAX_PATTERNS = [
    r"(?:CGST|SGST|IGST|GST|TAX|VAT)\s*[\d.]*\s*%?\s*[:=]?\s*(?:Rs\.?|INR|₹|\$)?\s*([\d,]+(?:\.\d{1,2})?)",
]


def _clean_num(s: str) -> float:
    return float(s.replace(",", ""))


def _first(patterns, text):
    for p in patterns:
        m = re.search(p, text, re.IGNORECASE)
        if m:
            return m.group(1)
    return None


def _extract_with_tesseract(image_bytes: bytes) -> dict:
    if not OCR_AVAILABLE:
        return {
            "shop": "Receipt",
            "amount": 0.0,
            "tax": 0.0,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "category": "Shopping",
            "payment_mode": "Card",
            "items": [],
            "raw_text_preview": "OCR not configured.",
            "confidence": 0.5,
            "method": "manual",
        }
    try:
        import pytesseract
        img = _to_gray(Image.open(io.BytesIO(image_bytes)))
        raw = pytesseract.image_to_string(img, lang="eng", config="--psm 6")
    except Exception as e:
        raw = ""

    text = re.sub(r"\s+", " ", raw)
    lines = [ln.strip(" .,|") for ln in raw.splitlines() if ln.strip(" .,|")]

    # Shop name from top lines
    shop = "Receipt"
    for ln in lines[:6]:
        if re.search(r"total|date|tax|cash|card|bill|invoice", ln, re.IGNORECASE):
            continue
        if len(ln) >= 3 and len(ln) <= 45:
            shop = ln
            break

    amount_raw = _first(AMOUNT_PATTERNS, text)
    tax_raw = _first(TAX_PATTERNS, text)
    date_raw = _first(DATE_PATTERNS, text)

    rdate = None
    if date_raw:
        for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%d-%m-%y", "%Y-%m-%d", "%Y/%m/%d"):
            try:
                rdate = datetime.strptime(date_raw[:10], fmt).date()
                break
            except ValueError:
                continue

    today_str = datetime.now().strftime("%Y-%m-%d")
    final_date = rdate.isoformat() if rdate else today_str

    amt = _clean_num(amount_raw) if amount_raw else 0.0
    tax = _clean_num(tax_raw) if tax_raw else 0.0

    return {
        "shop": shop,
        "amount": round(amt, 2),
        "tax": round(tax, 2),
        "date": final_date,
        "category": "Shopping",
        "payment_mode": "Card",
        "items": [],
        "currency": "INR",
        "raw_text_preview": text[:400] or "Scanned text",
        "confidence": 0.85 if amt > 0 else 0.5,
        "method": "tesseract_ocr",
    }


# ── Main Entrypoint ───────────────────────────────────────────────────────────

def extract_receipt(image_bytes: bytes) -> dict:
    """Extract receipt details using AI Vision first, falling back to Tesseract OCR."""
    try:
        pil_img = Image.open(io.BytesIO(image_bytes))
    except Exception as e:
        return {"error": f"Invalid image format: {e}"}

    # 1. Try Gemini Multimodal AI Vision
    ai_result = _extract_with_gemini(pil_img)
    if ai_result and (ai_result["amount"] > 0 or ai_result["shop"] != "Receipt"):
        return ai_result

    # 2. Fallback to Tesseract OCR
    tess_result = _extract_with_tesseract(image_bytes)
    return tess_result
