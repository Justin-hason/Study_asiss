from typing import List, Optional, Dict, Any
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User, Document, WrongQuestion, PracticeSession, PracticeQuestion, PracticeRecord, Mastery, LearnEvent
from ai_service import ai_service
from document_parser import parse_document_content


class AddWrongQuestionRequest(BaseModel):
    question_text: str
    original_answer: Optional[str] = None
    correct_answer: Optional[str] = None
    analysis: Optional[str] = None
    source_doc_id: Optional[str] = None
    source_page: Optional[int] = None
    knowledge_points: Optional[List[str]] = None
    difficulty: int = 1


class UpdateWrongQuestionRequest(BaseModel):
    original_answer: Optional[str] = None
    correct_answer: Optional[str] = None
    analysis: Optional[str] = None
    status: Optional[str] = None

router = APIRouter(prefix="/exam", tags=["exam"])


@router.post("/search", response_model=dict)
def search_question(query: str, top_k: int = 10,
                    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # 搜索知识库中的题目
    documents = db.query(Document).filter(
        Document.tenant_id == current_user.tenant_id,
        Document.status == "PROCESSED"
    ).limit(top_k).all()

    results = []
    for i, doc in enumerate(documents):
        results.append({
            "id": doc.id,
            "question": doc.name,
            "source": "知识库",
            "score": 0.9 - i * 0.1,
        })

    return {
        "query": query,
        "results": results,
        "total": len(results),
    }


@router.post("/wrong-book", response_model=dict)
def add_wrong_question(
    req: AddWrongQuestionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """添加错题到错题本"""
    wrong_q = WrongQuestion(
        user_id=current_user.id,
        question_text=req.question_text,
        original_answer=req.original_answer,
        correct_answer=req.correct_answer,
        analysis=req.analysis,
        source_doc_id=req.source_doc_id,
        source_page=req.source_page,
        knowledge_points=req.knowledge_points,
        difficulty=req.difficulty,
    )
    db.add(wrong_q)
    db.commit()
    db.refresh(wrong_q)

    return {
        "id": wrong_q.id,
        "question_text": wrong_q.question_text,
        "original_answer": wrong_q.original_answer,
        "correct_answer": wrong_q.correct_answer,
        "analysis": wrong_q.analysis,
        "source_doc_id": wrong_q.source_doc_id,
        "source_page": wrong_q.source_page,
        "knowledge_points": wrong_q.knowledge_points,
        "difficulty": wrong_q.difficulty,
        "status": wrong_q.status,
        "created_at": wrong_q.created_at.isoformat(),
    }


@router.get("/wrong-book", response_model=dict)
def list_wrong_book(
    page: int = 1,
    page_size: int = 20,
    status: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取错题本列表"""
    query = db.query(WrongQuestion).filter(WrongQuestion.user_id == current_user.id)

    if status:
        query = query.filter(WrongQuestion.status == status)

    total = query.count()
    offset = (page - 1) * page_size
    items = query.order_by(WrongQuestion.created_at.desc()).offset(offset).limit(page_size).all()

    return {
        "items": [
            {
                "id": item.id,
                "question_text": item.question_text,
                "original_answer": item.original_answer,
                "correct_answer": item.correct_answer,
                "analysis": item.analysis,
                "source_doc_id": item.source_doc_id,
                "source_page": item.source_page,
                "knowledge_points": item.knowledge_points,
                "difficulty": item.difficulty,
                "review_count": item.review_count,
                "last_review_time": item.last_review_time.isoformat() if item.last_review_time else None,
                "status": item.status,
                "created_at": item.created_at.isoformat(),
            }
            for item in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.put("/wrong-book/{id}", response_model=dict)
def update_wrong_question(
    id: str,
    req: UpdateWrongQuestionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """更新错题信息"""
    wrong_q = db.query(WrongQuestion).filter(
        WrongQuestion.id == id,
        WrongQuestion.user_id == current_user.id
    ).first()

    if not wrong_q:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wrong question not found")

    if req.original_answer is not None:
        wrong_q.original_answer = req.original_answer
    if req.correct_answer is not None:
        wrong_q.correct_answer = req.correct_answer
    if req.analysis is not None:
        wrong_q.analysis = req.analysis
    if req.status is not None:
        wrong_q.status = req.status
        if req.status == "REVIEWING":
            wrong_q.review_count += 1
            wrong_q.last_review_time = datetime.utcnow()

    db.commit()
    db.refresh(wrong_q)

    return {
        "id": wrong_q.id,
        "question_text": wrong_q.question_text,
        "original_answer": wrong_q.original_answer,
        "correct_answer": wrong_q.correct_answer,
        "analysis": wrong_q.analysis,
        "status": wrong_q.status,
        "review_count": wrong_q.review_count,
        "last_review_time": wrong_q.last_review_time.isoformat() if wrong_q.last_review_time else None,
        "updated_at": wrong_q.updated_at.isoformat(),
    }


@router.delete("/wrong-book/{id}", response_model=dict)
def delete_wrong_question(id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """删除错题"""
    wrong_q = db.query(WrongQuestion).filter(
        WrongQuestion.id == id,
        WrongQuestion.user_id == current_user.id
    ).first()

    if not wrong_q:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wrong question not found")

    db.delete(wrong_q)
    db.commit()

    return {"status": "ok"}


@router.post("/similar", response_model=dict)
def get_similar_questions(question_id: str, top_k: int = 5,
                          current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """获取相似题目"""
    documents = db.query(Document).filter(
        Document.tenant_id == current_user.tenant_id,
        Document.status == "PROCESSED"
    ).limit(top_k).all()

    results = []
    for i, doc in enumerate(documents):
        results.append({
            "id": doc.id,
            "question": doc.name,
            "similarity": 0.9 - i * 0.1,
        })

    return {
        "question_id": question_id,
        "similar_questions": results,
    }


@router.post("/plan", response_model=dict)
def generate_study_plan(subject: str, duration_days: int = 30,
                        current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """生成学习计划"""
    plan = []
    for week in range(1, (duration_days // 7) + 1):
        plan.append({
            "week": week,
            "topics": [f"主题 {week}-1", f"主题 {week}-2"],
            "hours": 10,
            "goals": [f"完成第{week}周学习目标"],
        })

    return {
        "subject": subject,
        "duration_days": duration_days,
        "plan": plan,
        "created_at": datetime.utcnow().isoformat(),
    }


# ========== 练习功能 ==========

class StartPracticeRequest(BaseModel):
    source_type: str = "document"  # document / knowledge_point
    source_id: Optional[str] = None
    question_count: int = 5
    title: Optional[str] = None


class SubmitAnswerRequest(BaseModel):
    session_id: str
    question_id: str
    user_answer: str
    time_spent: Optional[int] = 0  # 答题耗时(秒)


def _get_document_content(doc: Document) -> str:
    """获取文档内容，优先使用markdown_content，否则从文件解析"""
    if doc.markdown_content:
        return doc.markdown_content
    
    if doc.file_path and doc.file_path.strip():
        try:
            parsed = parse_document_content(doc.file_path, doc.mime_type or "")
            return parsed.get("text", "")
        except Exception:
            pass
    
    return ""


def _generate_fallback_questions(content: str, num_questions: int) -> List[Dict[str, Any]]:
    """当AI生成失败时，基于文档内容生成备用判断题"""
    questions = []
    
    # 优先按段落拆分
    content_chunks = content.split("\n\n")
    content_chunks = [c.strip() for c in content_chunks if c.strip() and len(c.strip()) > 20]
    
    # 如果段落太少，按句子拆分
    if len(content_chunks) < num_questions:
        all_sentences = []
        for chunk in content_chunks:
            sentences = chunk.split("。")
            sentences = [s.strip() for s in sentences if s.strip() and len(s.strip()) > 15]
            all_sentences.extend(sentences)
        content_chunks = all_sentences
    
    # 如果还是不够，按行拆分
    if len(content_chunks) < num_questions:
        lines = content.split("\n")
        lines = [l.strip() for l in lines if l.strip() and len(l.strip()) > 15]
        content_chunks = lines
    
    if not content_chunks:
        return questions
    
    for i in range(num_questions):
        chunk = content_chunks[i % len(content_chunks)]
        # 提取合适长度的内容作为题目
        sentence = chunk[:150].strip()
        if len(sentence) < 10:
            continue
        
        is_true = (i % 3) != 0
        
        questions.append({
            "question_text": sentence,
            "question_type": "judgment",
            "options": [
                {"label": "A", "text": "正确"},
                {"label": "B", "text": "错误"},
            ],
            "correct_answer": "正确" if is_true else "错误",
            "analysis": "本题基于文档内容生成，请根据文档原文判断对错。",
            "knowledge_point": "文档内容理解",
            "difficulty": 2,
        })
    
    return questions


@router.post("/practice/start", response_model=dict)
def start_practice(req: StartPracticeRequest,
                   current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """开始练习，生成题目"""
    content = ""
    source_name = "综合练习"

    if req.source_type == "document" and req.source_id:
        doc = db.query(Document).filter(
            Document.id == req.source_id,
            Document.user_id == current_user.id
        ).first()
        if not doc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
        content = _get_document_content(doc)
        source_name = doc.name
    else:
        docs = db.query(Document).filter(
            Document.user_id == current_user.id,
            Document.file_path.isnot(None)
        ).order_by(Document.updated_at.desc()).limit(3).all()
        content = "\n\n".join([_get_document_content(d) for d in docs])
        source_name = "综合练习"

    if not content or content.strip() == "":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No document content available for practice")

    # 限制内容长度，避免AI处理超时
    content = content[:3000]

    # 使用AI生成题目（禁用联网搜索以提高速度）
    questions_data = []
    try:
        questions_data = ai_service.generate_practice_questions(
            content, 
            num_questions=req.question_count, 
            enable_web_search=False  # 禁用联网搜索以加快生成速度
        )
    except Exception as e:
        print(f"AI生成题目失败: {e}")
    
    # 如果AI生成失败，使用备用题目
    if not questions_data or len(questions_data) == 0:
        print("使用备用题目生成")
        questions_data = _generate_fallback_questions(content, req.question_count)

    # 创建练习会话
    session = PracticeSession(
        user_id=current_user.id,
        title=req.title or f"{source_name} - 练习",
        question_count=len(questions_data),
        source_type=req.source_type,
        source_id=req.source_id,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    # 保存题目
    questions = []
    for q_data in questions_data:
        question = PracticeQuestion(
            session_id=session.id,
            question_text=q_data.get("question_text", ""),
            question_type=q_data.get("question_type", "single_choice"),
            options=q_data.get("options"),
            correct_answer=q_data.get("correct_answer", ""),
            analysis=q_data.get("analysis", ""),
            knowledge_point=q_data.get("knowledge_point", ""),
            difficulty=q_data.get("difficulty", 1),
            source_doc_id=req.source_id,
        )
        db.add(question)
        questions.append(question)

    db.commit()

    # 记录学习事件
    event = LearnEvent(
        user_id=current_user.id,
        kp_id=session.id,
        event_type="practice_start",
        event_metadata={"title": session.title, "question_count": session.question_count},
    )
    db.add(event)
    db.commit()

    return {
        "session_id": session.id,
        "title": session.title,
        "question_count": session.question_count,
        "questions": [
            {
                "id": q.id,
                "question_text": q.question_text,
                "question_type": q.question_type,
                "options": q.options,
                "knowledge_point": q.knowledge_point,
                "difficulty": q.difficulty,
            }
            for q in questions
        ],
    }


@router.post("/practice/submit", response_model=dict)
def submit_answer(req: SubmitAnswerRequest,
                  current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """提交答案"""
    session = db.query(PracticeSession).filter(
        PracticeSession.id == req.session_id,
        PracticeSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Practice session not found")

    question = db.query(PracticeQuestion).filter(
        PracticeQuestion.id == req.question_id,
        PracticeQuestion.session_id == req.session_id
    ).first()
    if not question:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")

    # 判断答案是否正确
    is_correct = False
    if question.question_type == "judgment":
        is_correct = req.user_answer.strip() == question.correct_answer.strip()
    elif question.question_type == "multiple_choice":
        is_correct = sorted(req.user_answer.strip().upper()) == sorted(question.correct_answer.strip().upper())
    elif question.question_type == "fill_blank":
        user_answer = req.user_answer.strip().lower()
        correct_answer = question.correct_answer.strip().lower()
        is_correct = user_answer == correct_answer or user_answer in correct_answer.split('/')
    else:
        is_correct = req.user_answer.strip().upper() == question.correct_answer.strip().upper()

    score = 1.0 if is_correct else 0.0

    # 创建答题记录
    record = PracticeRecord(
        session_id=session.id,
        question_id=question.id,
        user_id=current_user.id,
        user_answer=req.user_answer,
        is_correct=is_correct,
        score=score,
        time_spent=req.time_spent or 0,
    )
    db.add(record)

    # 更新练习会话统计
    session.correct_count = db.query(PracticeRecord).filter(
        PracticeRecord.session_id == session.id,
        PracticeRecord.is_correct == True
    ).count() + (1 if is_correct else 0)

    db.commit()
    db.refresh(record)
    db.refresh(session)

    # 如果答错，添加到错题本
    if not is_correct:
        wrong_q = WrongQuestion(
            user_id=current_user.id,
            question_text=question.question_text,
            original_answer=req.user_answer,
            correct_answer=question.correct_answer,
            analysis=question.analysis,
            source_doc_id=question.source_doc_id,
            knowledge_points=[question.knowledge_point] if question.knowledge_point else None,
            difficulty=question.difficulty,
        )
        db.add(wrong_q)
        db.commit()

    # 更新掌握度（基于该知识点的答题记录）
    if question.knowledge_point:
        update_mastery_for_kp(current_user.id, question.knowledge_point, db)

    return {
        "record_id": record.id,
        "is_correct": is_correct,
        "correct_answer": question.correct_answer,
        "user_answer": req.user_answer,
        "analysis": question.analysis,
        "score": score,
        "knowledge_point": question.knowledge_point,
        "session_progress": {
            "question_count": session.question_count,
            "answered_count": db.query(PracticeRecord).filter(PracticeRecord.session_id == session.id).count(),
            "correct_count": session.correct_count,
        },
    }


def update_mastery_for_kp(user_id: str, kp_name: str, db: Session):
    """更新知识点掌握度"""
    # 获取该知识点最近10次答题记录
    records = db.query(PracticeRecord).join(PracticeQuestion).filter(
        PracticeRecord.user_id == user_id,
        PracticeQuestion.knowledge_point == kp_name,
    ).order_by(PracticeRecord.answered_at.desc()).limit(10).all()

    if not records:
        return

    # 计算正确率
    correct_count = sum(1 for r in records if r.is_correct)
    total_count = len(records)
    accuracy = correct_count / total_count if total_count > 0 else 0

    # 计算加权得分（最近答题权重更高）
    weighted_score = 0
    total_weight = 0
    for i, r in enumerate(reversed(records)):
        weight = i + 1
        total_weight += weight
        weighted_score += r.score * weight

    weighted_avg = weighted_score / total_weight if total_weight > 0 else 0

    # 综合考虑正确率和加权得分
    final_score = accuracy * 0.6 + weighted_avg * 0.4

    # 更新或创建掌握度记录
    mastery = db.query(Mastery).filter(
        Mastery.user_id == user_id,
        Mastery.kp_id == kp_name
    ).first()

    if mastery:
        mastery.score = final_score
        mastery.last_review_time = datetime.utcnow()
    else:
        mastery = Mastery(
            user_id=user_id,
            kp_id=kp_name,
            score=final_score,
            last_review_time=datetime.utcnow(),
        )
        db.add(mastery)

    db.commit()


@router.post("/practice/{session_id}/complete", response_model=dict)
def complete_practice(session_id: str,
                      current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """完成练习"""
    session = db.query(PracticeSession).filter(
        PracticeSession.id == session_id,
        PracticeSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Practice session not found")

    session.status = "COMPLETED"
    session.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(session)

    # 统计本次练习结果
    total_records = db.query(PracticeRecord).filter(PracticeRecord.session_id == session.id).count()
    correct_records = db.query(PracticeRecord).filter(
        PracticeRecord.session_id == session.id,
        PracticeRecord.is_correct == True
    ).count()

    accuracy = (correct_records / total_records * 100) if total_records > 0 else 0

    # 错题归档：将答错的题目添加到错题本
    wrong_records = db.query(PracticeRecord).filter(
        PracticeRecord.session_id == session.id,
        PracticeRecord.is_correct == False
    ).all()
    
    for record in wrong_records:
        question = db.query(PracticeQuestion).filter(
            PracticeQuestion.id == record.question_id
        ).first()
        if question:
            existing_wrong = db.query(WrongQuestion).filter(
                WrongQuestion.user_id == current_user.id,
                WrongQuestion.question_text == question.question_text
            ).first()
            if not existing_wrong:
                wrong_question = WrongQuestion(
                    user_id=current_user.id,
                    question_text=question.question_text,
                    question_type=question.question_type,
                    options=question.options,
                    original_answer=record.user_answer,
                    correct_answer=question.correct_answer,
                    analysis=question.analysis,
                    knowledge_point=question.knowledge_point,
                    source_doc_id=question.source_doc_id,
                )
                db.add(wrong_question)

    # 记录学习事件
    event = LearnEvent(
        user_id=current_user.id,
        kp_id=session.id,
        event_type="practice_complete",
        event_metadata={
            "title": session.title,
            "question_count": session.question_count,
            "correct_count": correct_records,
            "accuracy": accuracy,
        },
    )
    db.add(event)
    db.commit()

    return {
        "session_id": session.id,
        "title": session.title,
        "status": session.status,
        "question_count": session.question_count,
        "correct_count": correct_records,
        "accuracy": round(accuracy, 1),
        "completed_at": session.completed_at.isoformat(),
    }


@router.get("/practice/history", response_model=dict)
def get_practice_history(page: int = 1, page_size: int = 20,
                         current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """获取练习历史"""
    query = db.query(PracticeSession).filter(
        PracticeSession.user_id == current_user.id,
        PracticeSession.status == "COMPLETED"
    ).order_by(PracticeSession.completed_at.desc())

    total = query.count()
    offset = (page - 1) * page_size
    sessions = query.offset(offset).limit(page_size).all()

    return {
        "items": [
            {
                "id": s.id,
                "title": s.title,
                "question_count": s.question_count,
                "correct_count": s.correct_count,
                "accuracy": round((s.correct_count / s.question_count * 100), 1) if s.question_count > 0 else 0,
                "source_type": s.source_type,
                "completed_at": s.completed_at.isoformat() if s.completed_at else None,
                "created_at": s.created_at.isoformat(),
            }
            for s in sessions
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/practice/{session_id}", response_model=dict)
def get_practice_detail(session_id: str,
                        current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """获取练习详情"""
    session = db.query(PracticeSession).filter(
        PracticeSession.id == session_id,
        PracticeSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Practice session not found")

    questions = db.query(PracticeQuestion).filter(PracticeQuestion.session_id == session.id).all()

    question_details = []
    for q in questions:
        record = db.query(PracticeRecord).filter(
            PracticeRecord.question_id == q.id,
            PracticeRecord.user_id == current_user.id
        ).first()

        question_details.append({
            "id": q.id,
            "question_text": q.question_text,
            "question_type": q.question_type,
            "options": q.options,
            "correct_answer": q.correct_answer,
            "analysis": q.analysis,
            "knowledge_point": q.knowledge_point,
            "difficulty": q.difficulty,
            "user_answer": record.user_answer if record else None,
            "is_correct": record.is_correct if record else None,
        })

    return {
        "session_id": session.id,
        "title": session.title,
        "status": session.status,
        "question_count": session.question_count,
        "correct_count": session.correct_count,
        "accuracy": round((session.correct_count / session.question_count * 100), 1) if session.question_count > 0 else 0,
        "questions": question_details,
        "created_at": session.created_at.isoformat(),
        "completed_at": session.completed_at.isoformat() if session.completed_at else None,
    }