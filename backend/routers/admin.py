import os
from pathlib import Path
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from auth import get_current_user, get_password_hash
from database import get_db
from document_preview import build_document_preview_response
from models import User, Document, Mastery, LearnEvent

router = APIRouter(prefix="/admin", tags=["admin"])
UPLOAD_BASE_DIR = Path("uploads").resolve()

SENSITIVE_WORDS = ["赌博", "色情", "暴力", "毒品", "诈骗", "反动", "恐怖", "分裂"]
VALID_USER_ROLES = {"user", "admin", "auditor"}


class CreateUserRequest(BaseModel):
    username: str
    email: str
    password: str
    role: str = "user"


class UpdateUserRoleRequest(BaseModel):
    role: str


class ReviewDocumentRequest(BaseModel):
    action: str
    reason: Optional[str] = None


class UpdateConfigRequest(BaseModel):
    key: str
    value: str
    description: Optional[str] = None


class AddSensitiveWordRequest(BaseModel):
    word: str


def check_admin(current_user: User):
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")


def check_admin_or_auditor(current_user: User):
    if current_user.role not in {"admin", "auditor"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")


def _safe_header_filename(filename: str) -> str:
    return os.path.basename(filename).replace('"', '').replace("\r", '').replace("\n", "")


def _validate_document_path(file_path: str) -> Path:
    resolved_path = Path(file_path).resolve()
    if UPLOAD_BASE_DIR not in resolved_path.parents:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return resolved_path


def build_preview_response(document: Document):
    return build_document_preview_response(document)


@router.get("/stats/system", response_model=dict)
def get_system_stats(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    check_admin(current_user)

    total_users = db.query(User).count()
    total_docs = db.query(Document).count()
    total_events = db.query(LearnEvent).count()

    avg_mastery = db.query(func.avg(Mastery.score)).scalar()
    avg_mastery = avg_mastery if avg_mastery else 0.0

    active_users_7d = db.query(LearnEvent.user_id).distinct().count()

    return {
        "services": {
            "auth": "ok",
            "knowledge": "ok",
            "search": "ok",
            "generate": "ok",
            "learn": "ok",
            "pipeline": "ok",
        },
        "total_documents": total_docs,
        "pending_reviews": 0,
        "active_users": active_users_7d,
        "total_queries": total_events,
        "index_size": "0 MB",
        "storage_used": "0 MB",
        "uptime_seconds": 0,
    }


@router.get("/health", response_model=dict)
def get_health(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    check_admin(current_user)
    try:
        from sqlalchemy import text
        db.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception:
        db_status = "error"

    return {
        "status": "ok" if db_status == "ok" else "degraded",
        "services": {
            "auth": "ok",
            "knowledge": "ok",
            "search": "ok",
            "generate": "ok",
            "learn": "ok",
            "pipeline": "ok",
            "database": db_status,
        },
    }


@router.get("/users", response_model=dict)
def list_users(page: int = 1, page_size: int = 20,
               current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    check_admin(current_user)

    offset = (page - 1) * page_size
    users = db.query(User).offset(offset).limit(page_size).all()
    total = db.query(User).count()

    return {
        "items": [
            {
                "id": u.id,
                "username": u.username,
                "email": u.email,
                "role": u.role,
                "tenant_id": u.tenant_id,
                "created_at": u.created_at.isoformat(),
            }
            for u in users
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/users", response_model=dict)
def create_user(req: CreateUserRequest,
                current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    check_admin(current_user)

    if db.query(User).filter(User.username == req.username).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already exists")

    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already exists")

    if req.role not in VALID_USER_ROLES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role")

    user = User(
        username=req.username,
        email=req.email,
        password_hash=get_password_hash(req.password),
        role=req.role,
        tenant_id="default",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "status": "ok",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
        },
    }


@router.put("/users/{user_id}/role", response_model=dict)
def update_user_role(user_id: str, req: UpdateUserRoleRequest,
                     current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    check_admin(current_user)

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot change own role")

    if req.role not in VALID_USER_ROLES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role")

    user.role = req.role
    db.commit()
    db.refresh(user)

    return {"status": "ok", "role": user.role}


@router.delete("/users/{user_id}", response_model=dict)
def delete_user(user_id: str,
                current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    check_admin(current_user)

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete self")

    if user.role == "admin":
        admin_count = db.query(User).filter(User.role == "admin").count()
        if admin_count <= 1:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete the last admin")

    db.delete(user)
    db.commit()

    return {"status": "ok", "message": "User deleted"}


@router.get("/documents/pending", response_model=dict)
def list_pending_documents(page: int = 1, page_size: int = 20,
                           current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    check_admin_or_auditor(current_user)

    base_query = db.query(Document).filter(
        Document.status == "PENDING",
        Document.tenant_id == current_user.tenant_id,
    )
    offset = (page - 1) * page_size
    documents = base_query.offset(offset).limit(page_size).all()
    total = base_query.count()

    return {
        "items": [
            {
                "id": d.id,
                "tenant_id": d.tenant_id,
                "name": d.name,
                "file_type": d.mime_type,
                "file_size": d.size,
                "uploader_id": d.user_id,
                "uploader_name": d.user.username if d.user else None,
                "status": d.status,
                "source": "文档上传",
                "requested_at": d.created_at.isoformat(),
                "preview_available": bool(d.file_path and os.path.exists(d.file_path)),
                "created_at": d.created_at.isoformat(),
                "updated_at": d.updated_at.isoformat(),
            }
            for d in documents
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/documents/{doc_id}/preview")
def preview_document(doc_id: str,
                     current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    check_admin_or_auditor(current_user)

    document = db.query(Document).filter(
        Document.id == doc_id,
        Document.tenant_id == current_user.tenant_id,
    ).first()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    return build_preview_response(document)


@router.post("/documents/{doc_id}/review", response_model=dict)
def review_document(doc_id: str, req: ReviewDocumentRequest,
                    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    check_admin_or_auditor(current_user)

    document = db.query(Document).filter(
        Document.id == doc_id,
        Document.tenant_id == current_user.tenant_id,
    ).first()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    if req.action == "approve":
        document.status = "PROCESSED"
    elif req.action == "reject":
        document.status = "REJECTED"
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid action")

    db.commit()

    return {"status": "ok"}


@router.get("/documents/{doc_id}/sensitive-check", response_model=dict)
def check_sensitive(doc_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    check_admin_or_auditor(current_user)

    document = db.query(Document).filter(
        Document.id == doc_id,
        Document.tenant_id == current_user.tenant_id,
    ).first()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    found_words = []
    content = document.name or ""
    for word in SENSITIVE_WORDS:
        if word in content:
            found_words.append(word)

    return {
        "content": content,
        "found": len(found_words) > 0,
        "words": found_words if found_words else None,
    }


@router.get("/config", response_model=List[dict])
def list_configs(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    check_admin(current_user)

    return [
        {
            "id": "1",
            "key": "DEFAULT_MODEL",
            "value": "gpt-4o",
            "description": "Default AI model",
            "updated_by": "system",
            "updated_at": datetime.utcnow().isoformat(),
        },
        {
            "id": "2",
            "key": "CHUNK_SIZE",
            "value": "512",
            "description": "Document chunk size",
            "updated_by": "system",
            "updated_at": datetime.utcnow().isoformat(),
        },
        {
            "id": "3",
            "key": "MAX_UPLOAD_SIZE",
            "value": "100",
            "description": "Max upload size in MB",
            "updated_by": "system",
            "updated_at": datetime.utcnow().isoformat(),
        },
    ]


@router.get("/config/{key}", response_model=dict)
def get_config(key: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    check_admin(current_user)

    configs = {
        "DEFAULT_MODEL": {"value": "gpt-4o", "description": "Default AI model"},
        "CHUNK_SIZE": {"value": "512", "description": "Document chunk size"},
        "MAX_UPLOAD_SIZE": {"value": "100", "description": "Max upload size in MB"},
    }

    if key not in configs:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Config not found")

    return {
        "id": key,
        "key": key,
        "value": configs[key]["value"],
        "description": configs[key]["description"],
        "updated_by": "system",
        "updated_at": datetime.utcnow().isoformat(),
    }


@router.put("/config", response_model=dict)
def update_config(req: UpdateConfigRequest,
                  current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    check_admin(current_user)

    return {
        "id": req.key,
        "key": req.key,
        "value": req.value,
        "description": req.description or "",
        "updated_by": current_user.username,
        "updated_at": datetime.utcnow().isoformat(),
    }


@router.post("/search/rebuild-index", response_model=dict)
def rebuild_index(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    check_admin(current_user)

    return {"status": "ok", "message": "Index rebuild started"}


@router.get("/sensitive-words", response_model=dict)
def list_sensitive_words(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    check_admin(current_user)

    return {"words": SENSITIVE_WORDS}


@router.post("/sensitive-words", response_model=dict)
def add_sensitive_word(req: AddSensitiveWordRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    check_admin(current_user)

    if req.word not in SENSITIVE_WORDS:
        SENSITIVE_WORDS.append(req.word)

    return {"status": "ok"}


@router.delete("/sensitive-words/{word}", response_model=dict)
def delete_sensitive_word(word: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    check_admin(current_user)

    if word in SENSITIVE_WORDS:
        SENSITIVE_WORDS.remove(word)

    return {"status": "ok"}


@router.get("/index-jobs", response_model=dict)
def list_index_jobs(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    check_admin(current_user)

    return {
        "status": "ok",
        "jobs": [
            {"id": "1", "status": "completed", "documents_processed": 0},
        ],
    }