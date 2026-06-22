from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from auth import get_current_user
from database import get_db
from models import User, Mastery, LearnEvent, Document, PracticeSession, PracticeRecord, PracticeQuestion

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/dashboard", response_model=dict)
def get_dashboard(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    total_docs = db.query(Document).filter(Document.user_id == current_user.id).count()

    # 学习次数 = 练习次数 + 学习事件次数
    practice_count = db.query(PracticeSession).filter(
        PracticeSession.user_id == current_user.id,
        PracticeSession.status == "COMPLETED"
    ).count()
    event_count = db.query(LearnEvent).filter(LearnEvent.user_id == current_user.id).count()
    total_learn_events = practice_count + event_count

    # 平均掌握度（基于练习正确率）
    avg_mastery = db.query(func.avg(Mastery.score)).filter(Mastery.user_id == current_user.id).scalar()
    avg_mastery = (avg_mastery * 100) if avg_mastery else 0.0

    # 本周练习统计
    last_7_days = datetime.utcnow() - timedelta(days=7)
    weekly_practice = db.query(PracticeSession).filter(
        PracticeSession.user_id == current_user.id,
        PracticeSession.status == "COMPLETED",
        PracticeSession.completed_at >= last_7_days,
    ).count()
    weekly_events = db.query(LearnEvent).filter(
        LearnEvent.user_id == current_user.id,
        LearnEvent.created_at >= last_7_days,
    ).count()
    weekly_total = weekly_practice + weekly_events

    # 本周活跃天数
    weekly_active_days = db.query(func.count(func.distinct(func.date(LearnEvent.created_at)))).filter(
        LearnEvent.user_id == current_user.id,
        LearnEvent.created_at >= last_7_days,
    ).scalar() or 0

    # 总练习次数和正确率
    total_practice_sessions = db.query(PracticeSession).filter(
        PracticeSession.user_id == current_user.id,
        PracticeSession.status == "COMPLETED"
    ).count()

    total_accuracy = 0.0
    if total_practice_sessions > 0:
        total_questions = db.query(func.sum(PracticeSession.question_count)).filter(
            PracticeSession.user_id == current_user.id,
            PracticeSession.status == "COMPLETED"
        ).scalar() or 0
        total_correct = db.query(func.sum(PracticeSession.correct_count)).filter(
            PracticeSession.user_id == current_user.id,
            PracticeSession.status == "COMPLETED"
        ).scalar() or 0
        if total_questions > 0:
            total_accuracy = (total_correct / total_questions) * 100

    return {
        "total_documents": total_docs,
        "total_learn_events": total_learn_events,
        "total_practice_sessions": total_practice_sessions,
        "average_mastery": round(avg_mastery, 1),
        "weekly_active_days": weekly_active_days,
        "weekly_events": weekly_total,
        "weekly_practice": weekly_practice,
        "total_accuracy": round(total_accuracy, 1),
    }


@router.get("/knowledge-map", response_model=dict)
def get_knowledge_map(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    masteries = db.query(Mastery).filter(Mastery.user_id == current_user.id).all()

    nodes = []
    for m in masteries:
        color = "#52c41a" if m.score >= 0.8 else "#faad14" if m.score >= 0.5 else "#f5222d"
        nodes.append({
            "kp_id": m.kp_id,
            "name": f"知识点 {m.kp_id[:8]}",
            "score": round(m.score, 2),
            "color": color,
        })

    return {"nodes": nodes}


@router.get("/trends", response_model=dict)
def get_trends(days: int = 7, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    trends = []
    for i in range(days):
        date = datetime.utcnow() - timedelta(days=days - i - 1)
        date_start = date.replace(hour=0, minute=0, second=0, microsecond=0)
        date_end = date_start + timedelta(days=1)

        count = db.query(LearnEvent).filter(
            LearnEvent.user_id == current_user.id,
            LearnEvent.created_at >= date_start,
            LearnEvent.created_at < date_end,
        ).count()

        trends.append({
            "date": date.strftime("%Y-%m-%d"),
            "events": count,
        })

    return {"trends": trends}


@router.get("/behavior-log", response_model=dict)
def get_behavior_log(page: int = 1, page_size: int = 20,
                     current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    offset = (page - 1) * page_size

    events = db.query(LearnEvent).filter(LearnEvent.user_id == current_user.id)\
        .order_by(LearnEvent.created_at.desc())\
        .offset(offset).limit(page_size).all()

    total = db.query(LearnEvent).filter(LearnEvent.user_id == current_user.id).count()

    return {
        "events": [
            {
                "id": e.id,
                "kp_id": e.kp_id,
                "event_type": e.event_type,
            "metadata": e.event_metadata,
                "created_at": e.created_at.isoformat(),
            }
            for e in events
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }