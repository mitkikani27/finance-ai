"""Module 10 — Receipt Scanner (Tesseract OCR, English + Hindi).

Extracts shop name, date, gross amount and GST from a receipt image and
returns structured fields for one-click expense entry.
"""
import io
import os
import re
import shutil
from datetime import datetime
from pathlib import Path

import pytesseract
from PIL import Image, ImageOps


def _find_tesseract() -> str | None:
    """Locate the Tesseract binary across platforms.

    Order: TESSERACT_CMD env → PATH → common Windows install locations.
    (Windows installers do NOT add Tesseract to PATH by default, so without
    this detection pytesseract always fails on a fresh laptop.)
    """
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
    pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH

INSTALL_HINT = (
    "Tesseract OCR nahi mila is computer par. "
    "1) https://github.com/UB-Mannheim/tesseract/wiki se 'tesseract-ocr-w64-setup.exe' "
    "download karke install karo. "
    "2) Agar install hai par phir bhi ye error aaye, to backend/.env me ye line dalo: "
    "TESSERACT_CMD=C:\\Program Files\\Tesseract-OCR\\tesseract.exe"
)


def _to_gray(img: Image.Image) -> Image.Image:
    img = ImageOps.exif_transpose(img)
    if img.mode != "L":
        img = img.convert("L")
    if img.width < 600:  # upscale small receipts
        img = img.resize((img.width * 2, img.height * 2))
    return img


AMOUNT_PATTERNS = [
    r"\bTOTAL\s*[:=]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)",   # TOTAL / TOTAL: Rs 379.25
    r"(?:GRAND\s*TOTAL|NET\s*(?:AMOUNT|PAYABLE)|AMOUNT\s*DUE|BALANCE\s*DUE)\s*[:=]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)",
    r"[₹]\s?([\d,]+(?:\.\d{1,2})?)",
    r"\bRs\.?\s?([\d,]+(?:\.\d{1,2})?)",
    r"\bINR\s?([\d,]+(?:\.\d{1,2})?)",
]
DATE_PATTERNS = [
    r"(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
    r"(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{2,4})",
]
TAX_PATTERNS = [
    r"(?:CGST|SGST|IGST|GST)\s*[\d.]*\s*%?\s*[:=]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)",
    r"\bTAX\s*[:=]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)",
]


def _clean_num(s: str) -> float:
    return float(s.replace(",", ""))


def _first(patterns, text):
    for p in patterns:
        m = re.search(p, text, re.IGNORECASE)
        if m:
            return m.group(1)
    return None


def extract_receipt(image_bytes: bytes) -> dict:
    if not OCR_AVAILABLE:
        return {"error": INSTALL_HINT}
    try:
        img = _to_gray(Image.open(io.BytesIO(image_bytes)))
        # PSM 6 = single uniform block: keeps every receipt line (incl. date lines)
        raw = pytesseract.image_to_string(img, lang="eng", config="--psm 6")
    except Exception as e:
        msg = str(e)
        if "TesseractNotFound" in msg or "not installed" in msg or "not in your PATH" in msg:
            return {"error": INSTALL_HINT}
        return {"error": f"OCR failed: {msg[:200]}"}

    text = re.sub(r"\s+", " ", raw)
    lines = [ln.strip(" .,|") for ln in raw.splitlines() if ln.strip(" .,|")]

    # shop name: first alphabetic line, short, not a date/amount
    shop = ""
    for ln in lines[:6]:
        if re.fullmatch(r"[A-Za-z][A-Za-z0-9 '&.()\-]{2,39}", ln):
            shop = ln
            break

    amount_raw = _first(AMOUNT_PATTERNS, text)
    tax_raw = _first(TAX_PATTERNS, text)
    date_raw = _first(DATE_PATTERNS, text)
    rdate = None
    if date_raw:
        for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%d/%m/%y", "%Y-%m-%d"):
            try:
                rdate = datetime.strptime(date_raw[:10], fmt).date()
                break
            except ValueError:
                continue
        if rdate is None:
            m = re.match(r"(\d{1,2})\s+([a-z]+)", date_raw, re.IGNORECASE)
            if m:
                months = {m2.lower()[:3]: i + 1 for i, m2 in enumerate(
                    ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"])}
                mo = months.get(m.group(2)[:3].lower())
                if mo:
                    try:
                        rdate = datetime(int(date_raw[-4:]), mo, int(m.group(1))).date()
                    except ValueError:
                        pass

    # sanity: OCR misreads dates often — ignore absurd ones (future >7d or older than 3y)
    today = datetime.now().date()
    if rdate is not None and (rdate > today.fromordinal(today.toordinal() + 7) or rdate < today.replace(year=today.year - 3)):
        rdate = None

    result = {
        "shop": shop,
        "amount": _clean_num(amount_raw) if amount_raw else 0.0,
        "tax": _clean_num(tax_raw) if tax_raw else 0.0,
        "date": rdate.isoformat() if rdate else None,
        "raw_text_preview": text[:400],
        "confidence": min(0.98, 0.5 + 0.05 * len(lines)),
    }
    return result
