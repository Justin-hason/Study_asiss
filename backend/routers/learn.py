from typing import List, Optional
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User, Mastery, PushTask, LearnEvent

router = APIRouter(prefix="/learn", tags=["learn"])


@router.get("/mastery", response_model=List[dict])
def get_mastery(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    masteries = db.query(Mastery).filter(Mastery.user_id == current_user.id).all()

    return [
        {
            "kp_id": m.kp_id,
            "score": m.score,
            "last_review_time": m.last_review_time.isoformat() if m.last_review_time else None,
            "updated_at": m.updated_at.isoformat(),
        }
        for m in masteries
    ]


@router.get("/push-tasks/today", response_model=List[dict])
def get_today_push_tasks(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)

    tasks = db.query(PushTask).filter(
        PushTask.user_id == current_user.id,
        PushTask.due_time >= today_start,
        PushTask.due_time < today_end,
        PushTask.status == "PENDING",
    ).all()

    return [
        {
            "id": t.id,
            "kp_id": t.kp_id,
            "due_time": t.due_time.isoformat(),
            "status": t.status,
        }
        for t in tasks
    ]


@router.put("/mastery/{kp_id}/mark", response_model=dict)
def mark_mastery(kp_id: str, score: Optional[float] = None,
                 current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    mastery = db.query(Mastery).filter(Mastery.user_id == current_user.id, Mastery.kp_id == kp_id).first()

    if mastery:
        if score is not None:
            mastery.score = score
        else:
            mastery.score = min(1.0, mastery.score + 0.1)
        mastery.last_review_time = datetime.utcnow()
    else:
        mastery = Mastery(
            user_id=current_user.id,
            kp_id=kp_id,
            score=score if score is not None else 0.5,
            last_review_time=datetime.utcnow(),
        )
        db.add(mastery)

    db.commit()
    db.refresh(mastery)

    return {
        "kp_id": mastery.kp_id,
        "score": mastery.score,
        "last_review_time": mastery.last_review_time.isoformat(),
    }


@router.post("/events", response_model=dict)
def post_event(kp_id: str, event_type: str, metadata: Optional[dict] = None,
               current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    event = LearnEvent(
        user_id=current_user.id,
        kp_id=kp_id,
        event_type=event_type,
        event_metadata=metadata,
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    return {"status": "ok"}