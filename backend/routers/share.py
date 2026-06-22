import os
from pathlib import Path
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from document_preview import build_document_preview_response
from models import User, Document, ShareRequest, PublicDocument, KnowledgeExtraction

router = APIRouter(prefix="/share", tags=["share"])
UPLOAD_BASE_DIR = Path("uploads").resolve()


class ShareRequestBody(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)


class ReviewRequestBody(BaseModel):
    comment: Optional[str] = None


def check_admin_or_auditor(current_user: User):
    """检查是否为管理员或审核员"""
    if current_user.role not in ["admin", "auditor"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for review")


def _safe_header_filename(filename: str) -> str:
    return os.path.basename(filename).replace('"', '').replace("\r", '').replace("\n", "")


def _validate_document_path(file_path: str) -> Path:
    resolved_path = Path(file_path).resolve()
    if UPLOAD_BASE_DIR not in resolved_path.parents:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return resolved_path


def _build_preview_response(document: Document):
    return build_document_preview_response(document)


# ============ 用户接口 ============

@router.post("/documents/{doc_id}/request", response_model=dict)
def request_share(doc_id: str, req: ShareRequestBody,
                  current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """用户请求分享文档"""
    document = db.query(Document).filter(
        Document.id == doc_id,
        Document.tenant_id == current_user.tenant_id
    ).first()
    
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    
    if document.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owner can request share")
    
    existing = db.query(ShareRequest).filter(
        ShareRequest.doc_id == doc_id,
        ShareRequest.status == "PENDING"
    ).first()
    
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already has pending request")
    
    share_request = ShareRequest(
        doc_id=doc_id,
        user_id=current_user.id,
        title=req.title,
        description=req.description,
        status="PENDING"
    )
    db.add(share_request)
    db.commit()
    db.refresh(share_request)
    
    return {
        "id": share_request.id,
        "doc_id": share_request.doc_id,
        "status": share_request.status,
        "created_at": share_request.created_at.isoformat()
    }


@router.get("/my-requests", response_model=dict)
def get_my_requests(page: int = 1, page_size: int = 20,
                    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """获取我发起的分享请求"""
    query = db.query(ShareRequest).filter(ShareRequest.user_id == current_user.id)
    total = query.count()
    offset = (page - 1) * page_size
    requests = query.order_by(ShareRequest.created_at.desc()).offset(offset).limit(page_size).all()
    
    result = []
    for req in requests:
        doc = db.query(Document).filter(
            Document.id == req.doc_id,
            Document.tenant_id == current_user.tenant_id,
        ).first()
        result.append({
            "id": req.id,
            "doc_id": req.doc_id,
            "doc_name": doc.name if doc else "Unknown",
            "title": req.title or (doc.name if doc else "Unknown"),
            "description": req.description,
            "status": req.status,
            "review_comment": req.review_comment,
            "created_at": req.created_at.isoformat(),
            "reviewed_at": req.reviewed_at.isoformat() if req.reviewed_at else None
        })
    
    return {"items": result, "total": total, "page": page, "page_size": page_size}


@router.delete("/requests/{request_id}", response_model=dict)
def cancel_request(request_id: str,
                   current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """取消分享请求"""
    share_request = db.query(ShareRequest).filter(ShareRequest.id == request_id).first()
    
    if not share_request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    
    if share_request.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your request")
    
    if share_request.status != "PENDING":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot cancel non-pending request")
    
    db.delete(share_request)
    db.commit()
    
    return {"status": "ok"}


# ============ 管理员/审核员接口 ============

@router.get("/admin/pending", response_model=dict)
def get_pending_requests(page: int = 1, page_size: int = 20,
                        current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """获取待审核的分享请求（管理员/审核员）"""
    check_admin_or_auditor(current_user)
    
    query = db.query(ShareRequest).join(Document, Document.id == ShareRequest.doc_id).filter(
        ShareRequest.status == "PENDING",
        Document.tenant_id == current_user.tenant_id,
    )
    total = query.count()
    offset = (page - 1) * page_size
    requests = query.order_by(ShareRequest.created_at.asc()).offset(offset).limit(page_size).all()
    
    result = []
    for req in requests:
        doc = db.query(Document).filter(
            Document.id == req.doc_id,
            Document.tenant_id == current_user.tenant_id,
        ).first()
        user = db.query(User).filter(User.id == req.user_id).first()
        result.append({
            "id": req.id,
            "doc_id": req.doc_id,
            "doc_name": doc.name if doc else "Unknown",
            "title": req.title or (doc.name if doc else "Unknown"),
            "doc_size": doc.size if doc else 0,
            "doc_type": doc.mime_type if doc else None,
            "description": req.description,
            "source": "分享申请",
            "requested_at": req.created_at.isoformat(),
            "preview_available": bool(doc and doc.file_path and os.path.exists(doc.file_path)),
            "requester": {
                "id": user.id,
                "username": user.username,
                "email": user.email
            } if user else None,
            "created_at": req.created_at.isoformat()
        })
    
    return {"items": result, "total": total, "page": page, "page_size": page_size}


@router.post("/admin/requests/{request_id}/approve", response_model=dict)
def approve_request(request_id: str, req: ReviewRequestBody,
                    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """审核通过分享请求"""
    check_admin_or_auditor(current_user)
    
    share_request = db.query(ShareRequest).filter(ShareRequest.id == request_id).first()
    if not share_request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    
    if share_request.status != "PENDING":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Request not pending")
    
    document = db.query(Document).filter(
        Document.id == share_request.doc_id,
        Document.tenant_id == current_user.tenant_id,
    ).first()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    
    share_request.status = "APPROVED"
    share_request.reviewer_id = current_user.id
    share_request.review_comment = req.comment
    share_request.reviewed_at = datetime.utcnow()
    
    extraction = db.query(KnowledgeExtraction).filter(
        KnowledgeExtraction.doc_id == document.id,
        KnowledgeExtraction.status == "COMPLETED"
    ).order_by(KnowledgeExtraction.completed_at.desc()).first()
    extracted_knowledge = extraction.summary if extraction else None

    existing_public = db.query(PublicDocument).filter(PublicDocument.doc_id == document.id).first()
    if not existing_public:
        public_doc = PublicDocument(
            doc_id=document.id,
            title=document.name,
            description=share_request.description,
            extracted_knowledge=extracted_knowledge,
            uploader_id=share_request.user_id
        )
        db.add(public_doc)
    
    db.commit()
    
    return {"status": "ok", "message": "Request approved"}


@router.post("/admin/requests/{request_id}/reject", response_model=dict)
def reject_request(request_id: str, req: ReviewRequestBody,
                  current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """审核拒绝分享请求"""
    check_admin_or_auditor(current_user)
    
    share_request = db.query(ShareRequest).filter(ShareRequest.id == request_id).first()
    if not share_request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    
    if share_request.status != "PENDING":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Request not pending")

    document = db.query(Document).filter(
        Document.id == share_request.doc_id,
        Document.tenant_id == current_user.tenant_id,
    ).first()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    share_request.status = "REJECTED"
    share_request.reviewer_id = current_user.id
    share_request.review_comment = req.comment
    share_request.reviewed_at = datetime.utcnow()
    
    db.commit()
    
    return {"status": "ok", "message": "Request rejected"}


# ============ 公共文档接口 ============

@router.get("/public", response_model=dict)
def list_public_documents(keyword: Optional[str] = None, page: int = 1, page_size: int = 20,
                         current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """获取已审核通过的公共文档（所有用户可访问）"""
    query = db.query(PublicDocument).join(Document, Document.id == PublicDocument.doc_id)
    
    if keyword:
        query = query.filter(PublicDocument.title.contains(keyword))
    
    total = query.count()
    offset = (page - 1) * page_size
    documents = query.order_by(PublicDocument.created_at.desc()).offset(offset).limit(page_size).all()
    
    result = []
    for doc in documents:
        document = db.query(Document).filter(Document.id == doc.doc_id).first()
        uploader = db.query(User).filter(User.id == doc.uploader_id).first()
        result.append({
            "id": doc.id,
            "doc_id": doc.doc_id,
            "title": doc.title,
            "description": doc.description,
            "extracted_knowledge": doc.extracted_knowledge,
            "file_type": document.mime_type if document else None,
            "file_size": document.size if document else 0,
            "preview_available": bool(document and document.file_path and os.path.exists(document.file_path)),
            "uploader": {
                "id": uploader.id,
                "username": uploader.username
            } if uploader else None,
            "view_count": doc.view_count,
            "download_count": doc.download_count,
            "created_at": doc.created_at.isoformat()
        })
    
    return {"items": result, "total": total, "page": page, "page_size": page_size}


@router.get("/public/{public_doc_id}", response_model=dict)
def get_public_document(public_doc_id: str,
                       current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """获取公共文档详情"""
    public_doc = db.query(PublicDocument).join(Document, Document.id == PublicDocument.doc_id).filter(
        PublicDocument.id == public_doc_id,
    ).first()
    if not public_doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    
    public_doc.view_count += 1
    db.commit()
    
    document = db.query(Document).filter(Document.id == public_doc.doc_id).first()
    uploader = db.query(User).filter(User.id == public_doc.uploader_id).first()
    
    return {
        "id": public_doc.id,
        "doc_id": public_doc.doc_id,
        "title": public_doc.title,
        "description": public_doc.description,
        "extracted_knowledge": public_doc.extracted_knowledge,
        "file_type": document.mime_type if document else None,
        "file_size": document.size if document else 0,
        "preview_available": bool(document and document.file_path and os.path.exists(document.file_path)),
        "uploader": {
            "id": uploader.id,
            "username": uploader.username
        } if uploader else None,
        "view_count": public_doc.view_count,
        "download_count": public_doc.download_count,
        "created_at": public_doc.created_at.isoformat()
    }


@router.get("/public/{public_doc_id}/preview")
def preview_public_document(public_doc_id: str,
                            current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """在线预览公共文档"""
    public_doc = db.query(PublicDocument).join(Document, Document.id == PublicDocument.doc_id).filter(
        PublicDocument.id == public_doc_id,
    ).first()
    if not public_doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    document = db.query(Document).filter(Document.id == public_doc.doc_id).first()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    return _build_preview_response(document)


@router.post("/public/{public_doc_id}/download", response_model=dict)
def download_public_document(public_doc_id: str,
                           current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """记录公共文档下载"""
    public_doc = db.query(PublicDocument).join(Document, Document.id == PublicDocument.doc_id).filter(
        PublicDocument.id == public_doc_id,
    ).first()
    if not public_doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    
    public_doc.download_count += 1
    db.commit()
    
    return {"status": "ok", "download_count": public_doc.download_count}


@router.delete("/admin/public/{public_doc_id}", response_model=dict)
def remove_public_document(public_doc_id: str,
                         current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """管理员移除公共文档"""
    check_admin_or_auditor(current_user)

    public_doc = db.query(PublicDocument).join(Document, Document.id == PublicDocument.doc_id).filter(
        PublicDocument.id == public_doc_id,
        Document.tenant_id == current_user.tenant_id,
    ).first()
    if not public_doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    
    db.delete(public_doc)
    db.commit()
    
    return {"status": "ok"}
