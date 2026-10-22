"""Module 8 — Fraud Detection endpoints."""
from datetime import datetime, date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from models import Session

import auth as authlib
import models
from database import get_db
from ml.fraud_detector import check_transaction

router = APIRouter(prefix="/api/fraud", tags=["fraud"])


class CheckIn(BaseModel):
    amount: float
    description: str = ""
    category: str = "Other"
    date: str | None = None   # YYYY-MM-DD (optional, defaults to today 12:00)


class ResolveIn(BaseModel):
    status: str   # genuine / fraud


def _create_alert(db: Session, user: models.User, fraud: dict, description: str, amount: float, expense_id: int | None = None):
    alert = models.FraudAlert(
        user_id=user.id, expense_id=expense_id, description=description,
        amount=amount, risk_score=fraud["risk_score"],
        reason="; ".join(fraud["reasons"]), status="new",
    )
    db.add(alert)
    db.add(models.Notification(user_id=user.id, title="Suspicious transaction detected",
                               body=f"{description} — {amount:,.2f} INR (risk {int(fraud['risk_score']*100)}%).",
                               ntype="fraud"))
    db.commit()
    return alert


@router.post("/check")
def check(body: CheckIn, user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    """Run a (hypothetical or real) transaction through the anomaly model."""
    if body.date:
        try:
            when = datetime.strptime(body.date[:10], "%Y-%m-%d").replace(hour=12)
        except ValueError:
            raise HTTPException(400, "date must be YYYY-MM-DD")
    else:
        when = datetime.now()

    hist = db.query(models.Expense).filter(models.Expense.user_id == user.id).limit(120).all()
    history = [{"amount": h.amount, "date": h.date.isoformat(), "category": h.category} for h in hist]
    result = check_transaction(history, body.amount, body.description, body.category, when)
    result["history_size"] = len(history)

    if result["is_suspicious"]:
        alert = _create_alert(db, user, result, description=body.description or "New transaction", amount=body.amount)
        result["alert_id"] = alert.id
    return result


@router.get("/alerts")
def alerts(user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    rows = db.query(models.FraudAlert).filter(models.FraudAlert.user_id == user.id) \
        .order_by(models.FraudAlert.created_at.desc()).all()
    return [{
        "id": a.id, "description": a.description, "amount": a.amount,
        "risk_score": a.risk_score, "reason": a.reason, "status": a.status,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    } for a in rows]


@router.post("/alerts/{alert_id}/resolve")
def resolve(alert_id: int, body: ResolveIn, user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    if body.status not in ("genuine", "fraud"):
        raise HTTPException(400, "status must be 'genuine' or 'fraud'")
    a = db.get(models.FraudAlert, alert_id)
    if not a or a.user_id != user.id:
        raise HTTPException(404, "Alert not found")
    a.status = body.status
    db.commit()
    return {"ok": True}


@router.delete("/alerts/{alert_id}")
def delete_alert(alert_id: int, user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    a = db.get(models.FraudAlert, alert_id)
    if not a or a.user_id != user.id:
        raise HTTPException(404, "Alert not found")
    db.delete(a)
    db.commit()
    return {"ok": True}

