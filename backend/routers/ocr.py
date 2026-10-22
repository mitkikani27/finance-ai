"""Module 10 — Receipt Scanner endpoints (scan → verify → save → see image)."""
import io
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from PIL import Image
from models import Session

import auth as authlib
import models
from database import get_db
from ocr_service import extract_receipt
from ml.expense_classifier import predict as ai_predict

router = APIRouter(prefix="/api/ocr", tags=["ocr"])

UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


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
        user_id=user.id, filename=file.filename or "", shop=result.get("shop", "Receipt"),
        amount=result.get("amount", 0.0), tax=result.get("tax", 0.0),
        rdate=rdate_obj,
        raw_text=result.get("raw_text_preview", ""),
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    result["id"] = rec.id
    result["image_saved"] = _save_image(rec.id, data)
    result["image_url"] = f"/api/ocr/image/{rec.id}" if result["image_saved"] else None
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
    """Last 10 scans with their saved image + whether they became an expense."""
    rows = db.query(models.OCRReceipt).filter(models.OCRReceipt.user_id == user.id) \
        .order_by(models.OCRReceipt.id.desc()).limit(10).all()
    return [{
        "id": r.id,
        "shop": r.shop,
        "amount": r.amount,
        "date": r.rdate.isoformat() if r.rdate else None,
        "expense_id": r.expense_id,
        "has_image": _image_path(r.id) is not None,
    } for r in rows]


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
def confirm(receipt_id: int, body: dict, user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    """After user edits fields in UI, create the real expense."""
    rec = db.get(models.OCRReceipt, receipt_id)
    if not rec or rec.user_id != user.id:
        raise HTTPException(404, "Receipt not found")
    amount = float(body.get("amount") or rec.amount or 0)
    if amount <= 0:
        raise HTTPException(400, "Amount is required")
    try:
        d = datetime.strptime((body.get("date") or (rec.rdate.isoformat() if rec.rdate else None) or
                               datetime.now().strftime("%Y-%m-%d"))[:10], "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "date must be YYYY-MM-DD")
    category = body.get("category") or rec.shop or "Shopping"
    payment_mode = body.get("payment_mode") or "Card"
    shop = body.get("shop") or rec.shop or "Shop"
    desc = body.get("description") or f"Receipt: {shop}"

    exp = models.Expense(user_id=user.id, category=category, description=desc,
                         amount=amount, date=d, payment_mode=payment_mode, ai_categorized=True)
    db.add(exp)
    db.flush()
    rec.expense_id = exp.id
    rec.amount, rec.shop = amount, shop
    db.commit()
    return {"expense_id": exp.id, "category": category, "amount": amount,
            "date": d.isoformat(), "month": d.strftime("%Y-%m")}
