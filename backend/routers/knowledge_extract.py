"""知识提炼API"""
import os
import uuid
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User, Document, KnowledgeExtraction
from document_parser import parse_document_content, is_supported_document, get_file_type
from ai_service import ai_service

router = APIRouter(prefix="/knowledge", tags=["knowledge-extraction"])

MAX_UPLOAD_SIZE = 100 * 1024 * 1024
ALLOWED_EXTRACTION_MODELS = {"deepseek", "deepseek-chat", "deepseek-v4-pro"}


def _sanitize_filename(filename: str) -> str:
    safe_name = filename.replace("\\", "/").split("/")[-1].strip()
    if not safe_name or safe_name in {".", ".."} or any(ord(char) < 32 for char in safe_name):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid filename")
    return safe_name


def _fail_extraction(db: Session, document: Document, extraction: KnowledgeExtraction) -> None:
    extraction.status = "FAILED"
    document.status = "FAILED"
    db.commit()


def _process_document_extraction(
    document: Document,
    extraction: KnowledgeExtraction,
    db: Session,
    model: str = "deepseek",
) -> dict:
    if not document.file_path or not os.path.exists(document.file_path):
        _fail_extraction(db, document, extraction)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    extraction.status = "PROCESSING"
    document.status = "PROCESSING"
    db.commit()

    try:
        parsed = parse_document_content(document.file_path, document.mime_type)

        if "error" in parsed:
            _fail_extraction(db, document, extraction)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=parsed["error"])

        knowledge = ai_service.extract_knowledge(parsed.get("text", ""), model=model, provider="deepseek")

        extraction.summary = knowledge.get("summary", "")
        extraction.key_points = knowledge.get("key_points", [])
        extraction.entities = knowledge.get("entities", [])
        extraction.categories = knowledge.get("categories", [])
        extraction.model_used = model
        extraction.status = "COMPLETED"
        extraction.completed_at = datetime.utcnow()
        document.status = "PROCESSED"

        db.commit()
        db.refresh(extraction)
        db.refresh(document)

        return {
            "extraction_id": extraction.id,
            "doc_id": document.id,
            "status": "completed",
            "summary": extraction.summary,
            "key_points": extraction.key_points,
            "entities": extraction.entities,
            "categories": extraction.categories,
        }
    except HTTPException:
        raise
    except Exception as e:
        _fail_extraction(db, document, extraction)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/extract/upload", response_model=dict)
async def upload_for_extraction(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """上传文档进行知识提炼"""
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No file provided")

    safe_filename = _sanitize_filename(file.filename)

    if not is_supported_document(safe_filename):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file type. Supported: .pdf, .docx, .pptx"
        )

    file_type = get_file_type(safe_filename)

    upload_dir = os.path.join("uploads", current_user.tenant_id, "extractions")
    os.makedirs(upload_dir, exist_ok=True)

    file_id = str(uuid.uuid4())
    _, extension = os.path.splitext(safe_filename)
    file_path = os.path.join(upload_dir, f"{file_id}{extension}")

    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File too large")

    with open(file_path, "wb") as f:
        f.write(content)

    document = Document(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        name=safe_filename,
        mime_type=file_type,
        file_path=file_path,
        size=len(content),
        status="PROCESSING"
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    extraction = KnowledgeExtraction(
        doc_id=document.id,
        user_id=current_user.id,
        status="PROCESSING"
    )
    db.add(extraction)
    db.commit()
    db.refresh(extraction)

    result = _process_document_extraction(document, extraction, db)

    return {
        "doc_id": document.id,
        "extraction_id": extraction.id,
        "filename": safe_filename,
        "status": result["status"],
        "summary": result["summary"],
        "key_points": result["key_points"],
        "entities": result["entities"],
        "categories": result["categories"],
    }


@router.post("/extract/{doc_id}/process", response_model=dict)
def process_extraction(
    doc_id: str,
    model: Optional[str] = "deepseek",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """对已上传的文档进行知识提炼处理"""
    document = db.query(Document).filter(
        Document.id == doc_id,
        Document.tenant_id == current_user.tenant_id,
        Document.user_id == current_user.id,
    ).first()

    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    extraction = db.query(KnowledgeExtraction).filter(
        KnowledgeExtraction.doc_id == doc_id,
        KnowledgeExtraction.user_id == current_user.id,
    ).first()

    selected_model = model or "deepseek"
    if selected_model not in ALLOWED_EXTRACTION_MODELS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported model")

    if not extraction:
        extraction = KnowledgeExtraction(
            doc_id=doc_id,
            user_id=current_user.id,
            status="PROCESSING"
        )
        db.add(extraction)
        db.commit()
        db.refresh(extraction)

    return _process_document_extraction(document, extraction, db, selected_model)


@router.get("/extract/{doc_id}", response_model=dict)
def get_extraction(
    doc_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取文档的知识提炼结果"""
    extraction = db.query(KnowledgeExtraction).filter(
        KnowledgeExtraction.doc_id == doc_id,
        KnowledgeExtraction.user_id == current_user.id
    ).first()

    if not extraction:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Extraction not found")

    document = db.query(Document).filter(
        Document.id == doc_id,
        Document.user_id == current_user.id,
    ).first()

    return {
        "id": extraction.id,
        "doc_id": extraction.doc_id,
        "doc_name": document.name if document else None,
        "summary": extraction.summary,
        "key_points": extraction.key_points,
        "entities": extraction.entities,
        "categories": extraction.categories,
        "model_used": extraction.model_used,
        "status": extraction.status,
        "created_at": extraction.created_at.isoformat(),
        "completed_at": extraction.completed_at.isoformat() if extraction.completed_at else None
    }


@router.get("/extractions", response_model=dict)
def list_extractions(
    page: int = 1,
    page_size: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取用户的所有知识提炼记录"""
    query = db.query(KnowledgeExtraction).filter(KnowledgeExtraction.user_id == current_user.id)
    total = query.count()
    offset = (page - 1) * page_size

    extractions = query.order_by(KnowledgeExtraction.created_at.desc()).offset(offset).limit(page_size).all()

    result = []
    for ext in extractions:
        document = db.query(Document).filter(
            Document.id == ext.doc_id,
            Document.user_id == current_user.id,
        ).first()
        result.append({
            "id": ext.id,
            "doc_id": ext.doc_id,
            "doc_name": document.name if document else None,
            "summary": ext.summary,
            "status": ext.status,
            "created_at": ext.created_at.isoformat(),
            "completed_at": ext.completed_at.isoformat() if ext.completed_at else None
        })

    return {"items": result, "total": total, "page": page, "page_size": page_size}


@router.get("/private", response_model=dict)
def list_private_knowledge(
    keyword: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取用户的私有知识库"""
    query = db.query(KnowledgeExtraction).filter(
        KnowledgeExtraction.user_id == current_user.id,
        KnowledgeExtraction.status == "COMPLETED"
    )

    if keyword:
        query = query.filter(KnowledgeExtraction.summary.contains(keyword))

    total = query.count()
    offset = (page - 1) * page_size
    extractions = query.order_by(KnowledgeExtraction.created_at.desc()).offset(offset).limit(page_size).all()

    result = []
    for ext in extractions:
        document = db.query(Document).filter(
            Document.id == ext.doc_id,
            Document.user_id == current_user.id,
        ).first()
        result.append({
            "id": ext.id,
            "doc_id": ext.doc_id,
            "doc_name": document.name if document else None,
            "summary": ext.summary,
            "key_points": ext.key_points,
            "categories": ext.categories,
            "created_at": ext.created_at.isoformat()
        })

    return {"items": result, "total": total, "page": page, "page_size": page_size}
