"""Income module."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from models import Session

import auth as authlib
import models
from database import get_db

router = APIRouter(prefix="/api/income", tags=["income"])


class IncomeIn(BaseModel):
    source: str = "Salary"
    amount: float
    date: str
    note: str = ""


@router.get("")
def list_income(month: str | None = Query(None), user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    q = db.query(models.Income).filter(models.Income.user_id == user.id)
    if month:
        y, m = int(month[:4]), int(month[5:7])
        from datetime import date
        q = q.filter(models.Income.date >= date(y, m, 1))
        q = q.filter(models.Income.date < date(y + (m == 12), (m % 12) + 1, 1))
    rows = q.order_by(models.Income.date.desc()).all()
    return [{"id": r.id, "source": r.source, "amount": r.amount,
             "date": r.date.isoformat(), "note": r.note} for r in rows]


@router.post("")
def add_income(body: IncomeIn, user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    try:
        d = datetime.strptime(body.date[:10], "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "date must be YYYY-MM-DD")
    rec = models.Income(user_id=user.id, source=body.source, amount=body.amount, date=d, note=body.note)
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return {"id": rec.id, "source": rec.source, "amount": rec.amount, "date": rec.date.isoformat(), "note": rec.note}


@router.delete("/{income_id}")
def delete_income(income_id: int, user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    rec = db.get(models.Income, income_id)
    if not rec or rec.user_id != user.id:
        raise HTTPException(404, "Income not found")
    db.delete(rec)
    db.commit()
    return {"ok": True}
