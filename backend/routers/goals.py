"""Savings goals + notifications."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from models import Session

import auth as authlib
import models
from database import get_db

router = APIRouter(prefix="/api/goals", tags=["goals"])


class GoalIn(BaseModel):
    name: str
    target_amount: float
    saved_amount: float = 0
    deadline: str | None = None


@router.get("")
def list_goals(user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    rows = db.query(models.Goal).filter(models.Goal.user_id == user.id).all()
    return [{
        "id": r.id, "name": r.name, "target_amount": r.target_amount, "saved_amount": r.saved_amount,
        "deadline": r.deadline.isoformat() if r.deadline else None,
        "pct": round(100 * r.saved_amount / r.target_amount, 1) if r.target_amount else 0,
    } for r in rows]


@router.post("")
def add_goal(body: GoalIn, user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    g = models.Goal(user_id=user.id, name=body.name, target_amount=body.target_amount,
                    saved_amount=body.saved_amount,
                    deadline=datetime.strptime(body.deadline[:10], "%Y-%m-%d").date() if body.deadline else None)
    db.add(g)
    db.commit()
    db.refresh(g)
    return {"id": g.id}


@router.post("/{goal_id}/add-money")
def add_money(goal_id: int, body: dict, user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    g = db.get(models.Goal, goal_id)
    if not g or g.user_id != user.id:
        raise HTTPException(404, "Goal not found")
    g.saved_amount = min(g.target_amount, g.saved_amount + float(body.get("amount", 0)))
    db.commit()
    return {"saved_amount": g.saved_amount, "pct": round(100 * g.saved_amount / g.target_amount, 1)}


@router.delete("/{goal_id}")
def delete_goal(goal_id: int, user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    g = db.get(models.Goal, goal_id)
    if not g or g.user_id != user.id:
        raise HTTPException(404, "Goal not found")
    db.delete(g)
    db.commit()
    return {"ok": True}


@router.get("/notifications")
def notifications(user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    rows = db.query(models.Notification).filter(models.Notification.user_id == user.id) \
        .order_by(models.Notification.created_at.desc()).limit(20).all()
    return [{"id": r.id, "title": r.title, "body": r.body, "type": r.ntype, "read": r.read,
             "created_at": r.created_at.isoformat() if r.created_at else None} for r in rows]


@router.delete("/notifications/{notif_id}")
def delete_notification(notif_id: int, user: models.User = Depends(authlib.get_current_user), db: Session = Depends(get_db)):
    n = db.get(models.Notification, notif_id)
    if not n or n.user_id != user.id:
        raise HTTPException(404, "Notification not found")
    db.delete(n)
    db.commit()
    return {"ok": True}

