"""Module 10 — Receipt Scanner endpoints with Multi-Currency & Auto-INR Conversion."""
import io
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from PIL import Image
from pydantic import BaseModel
from models import Session

import auth as authlib
import models
from database import get_db
from ocr_service import extract_receipt
from ml.expense_classifier import predict as ai_predict
from currency_service import (
    convert_receipt_currency,
    get_all_supported_currencies,
    get_rate,
    CURRENCY_SYMBOLS
)

router = APIRouter(prefix="/api/ocr", tags=["ocr"])

UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


class ConvertCurrencyIn(BaseModel):
    amount: float
    currency: str = "USD"
    custom_rate: Optional[float] = None


class ConfirmReceiptIn(BaseModel):
    shop: str
    amount: float                  # Final INR Amount
    tax: float = 0.0               # Final INR Tax
    date: str
    category: str = "Shopping"
    payment_mode: str = "Card"
    description: str = ""
    original_amount: Optional[float] = None
    original_currency: Optional[str] = "INR"
    exchange_rate: Optional[float] = 1.0
    currency_symbol: Optional[str] = "₹"


def _save_image(receipt_id: int, data: bytes) -> bool:
    """Persist the receipt photo (normalized to JPEG). Returns success."""
    try:
        img = Image.open(io.BytesIO(data)).convert("RGB")
        if img.width > 1400:  # keep files small but readable
            img = img.resize((1400, int(img.height * 1400 / img.width)))
        img.save(UPLOAD_DIR / f"receipt_{receipt_id}.jpg", "JPEG", quality=82)
        return True
    except Exception:
        try:  # fallback: store raw bytes
            (UPLOAD_DIR / f"receipt_{receipt_id}.jpg").write_bytes(data)
            return True
        except Exception:
            return False


def _image_path(receipt_id: int) -> Path | None:
    p = UPLOAD_DIR / f"receipt_{receipt_id}.jpg"
    return p if p.is_file() else None


@router.get("/currencies")
def list_currencies(user: models.User = Depends(authlib.get_current_user)):
    """Return all supported currencies and current live exchange rates against INR."""
    return {
        "base": "INR",
        "currencies": get_all_supported_currencies(),
    }


@router.post("/convert")
def convert_currency_endpoint(body: ConvertCurrencyIn, user: models.User = Depends(authlib.get_current_user)):
    """Calculate conversion of foreign currency amount to Indian Rupee."""
    rate = body.custom_rate if (body.custom_rate and body.custom_rate > 0) else get_rate(body.currency)
    curr = body.currency.upper().strip()
    amt = float(body.amount or 0.0)
    converted_inr = round(amt * rate, 2)
    symbol = CURRENCY_SYMBOLS.get(curr, curr)
    return {
        "original_amount": amt,
        "original_currency": curr,
        "currency_symbol": symbol,
        "exchange_rate": rate,
        "converted_amount_inr": converted_inr,
        "is_foreign_currency": (curr != "INR"),
        "summary": f"{symbol}{amt:,.2f} {curr} = ₹{converted_inr:,.2f} INR (@ ₹{rate:,.2f}/{curr})"
    }


@router.post("/upload")
async def upload_receipt(file: UploadFile = File(...), user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(400, "Image too large (max 10 MB).")
    if not file.content_type.startswith("image/"):
        raise HTTPException(400, "Please upload an image (JPG/PNG).")

    result = extract_receipt(data)
    if "error" in result:
        raise HTTPException(503, result["error"])

    # AI Category: prioritize Gemini Vision category, else use expense classifier
    if not result.get("category"):
        ai = ai_predict(result.get("shop") or "receipt") if result.get("shop") else None
        result["category"] = ai["category"] if ai else "Shopping"
    result["ai_category"] = result["category"]

    rdate_obj = None
    if result.get("date"):
        try:
            rdate_obj = datetime.strptime(result["date"][:10], "%Y-%m-%d").date()
        except Exception:
            rdate_obj = datetime.now().date()

    rec = models.OCRReceipt(
        user_id=user.id,
        filename=file.filename or "",
        shop=result.get("shop", "Receipt"),
        amount=result.get("amount", 0.0), # INR
        tax=result.get("tax", 0.0),       # INR
        rdate=rdate_obj,
        raw_text=result.get("raw_text_preview", ""),
        original_amount=result.get("original_amount"),
        original_currency=result.get("original_currency", "INR"),
        exchange_rate=result.get("exchange_rate", 1.0),
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)

    result["id"] = rec.id
    result["image_saved"] = _save_image(rec.id, data)
    result["image_url"] = f"/api/ocr/image/{rec.id}" if result["image_saved"] else None
    return result


@router.post("/sample")
def scan_sample(user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    """Instant test scan using the bundled fast food receipt."""
    sample_file = UPLOAD_DIR / "receipt_3.jpg"
    if not sample_file.is_file():
        raise HTTPException(404, "Sample receipt not found on server")
    data = sample_file.read_bytes()
    result = extract_receipt(data)
    if "error" in result:
        raise HTTPException(503, result["error"])

    if not result.get("category"):
        ai = ai_predict(result.get("shop") or "receipt") if result.get("shop") else None
        result["category"] = ai["category"] if ai else "Food"
    result["ai_category"] = result["category"]

    rdate_obj = None
    if result.get("date"):
        try:
            rdate_obj = datetime.strptime(result["date"][:10], "%Y-%m-%d").date()
        except Exception:
            rdate_obj = datetime.now().date()

    rec = models.OCRReceipt(
        user_id=user.id,
        filename="sample_receipt.jpg",
        shop=result.get("shop", "Fast Food"),
        amount=result.get("amount", 0.0),
        tax=result.get("tax", 0.0),
        rdate=rdate_obj,
        raw_text=result.get("raw_text_preview", ""),
        original_amount=result.get("original_amount"),
        original_currency=result.get("original_currency", "INR"),
        exchange_rate=result.get("exchange_rate", 1.0),
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)

    result["id"] = rec.id
    result["image_saved"] = _save_image(rec.id, data)
    result["image_url"] = f"/api/ocr/image/{rec.id}" if result["image_saved"] else None
    return result


@router.post("/sample-usd")
def scan_sample_usd(user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    """Instant test scan of an international US Dollar ($) receipt to demo automatic INR conversion."""
    usd_amount = 48.50
    usd_tax = 4.25
    conv = convert_receipt_currency(usd_amount, usd_tax, "USD")

    today_str = datetime.now().strftime("%Y-%m-%d")
    rdate_obj = datetime.now().date()

    result = {
        "shop": "Starbucks Coffee (Seattle, USA)",
        "amount": conv["amount"],           # Converted to INR (e.g. ₹4,209.80)
        "tax": conv["tax"],                 # Converted to INR
        "original_amount": conv["original_amount"],
        "original_tax": conv["original_tax"],
        "original_currency": "USD",
        "currency_symbol": "$",
        "exchange_rate": conv["exchange_rate"],
        "is_foreign_currency": True,
        "conversion_summary": conv["conversion_summary"],
        "date": today_str,
        "category": "Food",
        "ai_category": "Food",
        "payment_mode": "Card",
        "items": [
            {"name": "Caffe Latte Venti", "qty": 2, "price": round(6.25 * conv["exchange_rate"], 2), "original_price": 6.25},
            {"name": "Caramel Macchiato", "qty": 2, "price": round(6.75 * conv["exchange_rate"], 2), "original_price": 6.75},
            {"name": "Blueberry Muffin", "qty": 3, "price": round(4.50 * conv["exchange_rate"], 2), "original_price": 4.50},
            {"name": "Avocado Toast", "qty": 2, "price": round(9.50 * conv["exchange_rate"], 2), "original_price": 9.50},
        ],
        "currency": "INR",
        "raw_text_preview": f"Starbucks Seattle USA - Total: $48.50 USD -> {conv['conversion_summary']}",
        "confidence": 0.99,
        "method": "ai_vision_multicurrency",
    }

    rec = models.OCRReceipt(
        user_id=user.id,
        filename="sample_usd_receipt.jpg",
        shop=result["shop"],
        amount=result["amount"],
        tax=result["tax"],
        rdate=rdate_obj,
        raw_text=result["raw_text_preview"],
        original_amount=result["original_amount"],
        original_currency=result["original_currency"],
        exchange_rate=result["exchange_rate"],
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)

    result["id"] = rec.id
    # Link sample image if available
    sample_file = UPLOAD_DIR / "receipt_3.jpg"
    if sample_file.is_file():
        _save_image(rec.id, sample_file.read_bytes())
        result["image_saved"] = True
        result["image_url"] = f"/api/ocr/image/{rec.id}"
    else:
        result["image_saved"] = False
        result["image_url"] = None

    return result


@router.get("/image/{receipt_id}")
def receipt_image(receipt_id: int, user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    """The saved receipt photo (works for <img src> too — cookie/_auth auth)."""
    rec = db.get(models.OCRReceipt, receipt_id)
    if not rec or rec.user_id != user.id:
        raise HTTPException(404, "Receipt not found")
    p = _image_path(receipt_id)
    if not p:
        raise HTTPException(404, "Image not stored for this receipt")
    return FileResponse(p, media_type="image/jpeg")


@router.get("/recent")
def recent_receipts(user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    """Last 10 scans with multi-currency details + whether they became an expense."""
    rows = db.query(models.OCRReceipt).filter(models.OCRReceipt.user_id == user.id) \
        .order_by(models.OCRReceipt.id.desc()).limit(10).all()
    out = []
    for r in rows:
        orig_curr = getattr(r, "original_currency", "INR") or "INR"
        orig_amt = getattr(r, "original_amount", None)
        rate = getattr(r, "exchange_rate", 1.0) or 1.0
        is_foreign = (orig_curr != "INR" and orig_amt is not None and orig_amt > 0)
        sym = CURRENCY_SYMBOLS.get(orig_curr, orig_curr)

        out.append({
            "id": r.id,
            "shop": r.shop,
            "amount": r.amount, # INR
            "date": r.rdate.isoformat() if r.rdate else None,
            "expense_id": r.expense_id,
            "has_image": _image_path(r.id) is not None,
            "original_amount": orig_amt,
            "original_currency": orig_curr,
            "currency_symbol": sym,
            "exchange_rate": rate,
            "is_foreign_currency": is_foreign,
        })
    return out


@router.delete("/{receipt_id}")
def delete_receipt(receipt_id: int, user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    """Remove a recent scan (image + OCR row). Linked expense is left intact."""
    rec = db.get(models.OCRReceipt, receipt_id)
    if not rec or rec.user_id != user.id:
        raise HTTPException(404, "Receipt not found")
    p = _image_path(receipt_id)
    if p:
        try:
            p.unlink()
        except OSError:
            pass
    db.delete(rec)
    db.commit()
    return {"ok": True}


@router.post("/confirm/{receipt_id}")
def confirm(receipt_id: int, body: ConfirmReceiptIn, user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    """After user edits fields in UI, create the real expense in Indian Rupees (INR) with currency audit trail."""
    rec = db.get(models.OCRReceipt, receipt_id)
    if not rec or rec.user_id != user.id:
        raise HTTPException(404, "Receipt not found")

    amount = float(body.amount or rec.amount or 0)
    if amount <= 0:
        raise HTTPException(400, "Amount is required")

    try:
        d = datetime.strptime(body.date[:10], "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "date must be YYYY-MM-DD")

    category = body.category or rec.shop or "Shopping"
    payment_mode = body.payment_mode or "Card"
    shop = body.shop or rec.shop or "Shop"

    orig_amt = body.original_amount if body.original_amount is not None else getattr(rec, "original_amount", None)
    orig_curr = (body.original_currency or getattr(rec, "original_currency", "INR") or "INR").upper().strip()
    rate = float(body.exchange_rate or getattr(rec, "exchange_rate", 1.0) or 1.0)
    symbol = body.currency_symbol or CURRENCY_SYMBOLS.get(orig_curr, orig_curr)

    desc = body.description.strip() if body.description else f"Receipt: {shop}"
    if orig_curr != "INR" and orig_amt and orig_amt > 0:
        desc = f"{shop} ({symbol}{orig_amt:,.2f} {orig_curr} @ ₹{rate:,.2f})"

    exp = models.Expense(
        user_id=user.id,
        category=category,
        description=desc,
        amount=amount, # INR
        date=d,
        payment_mode=payment_mode,
        ai_categorized=True,
        original_amount=orig_amt,
        original_currency=orig_curr,
        exchange_rate=rate,
    )
    db.add(exp)
    db.flush()

    rec.expense_id = exp.id
    rec.amount = amount
    rec.shop = shop
    rec.original_amount = orig_amt
    rec.original_currency = orig_curr
    rec.exchange_rate = rate

    # Add notification for transparency
    notif_body = f"₹{amount:,.2f} expense recorded under '{category}'."
    if orig_curr != "INR" and orig_amt and orig_amt > 0:
        notif_body = f"₹{amount:,.2f} expense recorded under '{category}' (auto-converted from {symbol}{orig_amt:,.2f} {orig_curr} at ₹{rate:,.2f}/unit)."

    notif = models.Notification(
        user_id=user.id,
        title="Receipt Expense Recorded 🧾",
        body=notif_body,
        ntype="success",
        read=False,
    )
    db.add(notif)
    db.commit()

    return {
        "expense_id": exp.id,
        "category": category,
        "amount": amount,
        "date": d.isoformat(),
        "month": d.strftime("%Y-%m"),
        "original_amount": orig_amt,
        "original_currency": orig_curr,
        "exchange_rate": rate,
    }
