from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import (
    KnowledgeReport,
    KnowledgeReportShareRequest,
    PublicKnowledgeReport,
    User,
)
from services.knowledge_report_service import (
    create_knowledge_report,
    save_report_to_knowledge_base,
    serialize_report,
)

router = APIRouter(prefix="/knowledge-reports", tags=["knowledge-reports"])


class GenerateKnowledgeReportRequest(BaseModel):
    doc_ids: List[str] = Field(min_length=1, max_length=3)
    title: Optional[str] = None
    description: Optional[str] = None
    model: str = "deepseek-v4-pro"


class ReportShareRequestBody(BaseModel):
    title: str
    description: Optional[str] = None


class ReviewRequestBody(BaseModel):
    comment: Optional[str] = None


class PublicReportDownloadBody(BaseModel):
    pass


def check_admin_or_auditor(current_user: User) -> None:
    if current_user.role not in ["admin", "auditor"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for review")


def get_owned_report(report_id: str, current_user: User, db: Session) -> KnowledgeReport:
    report = db.query(KnowledgeReport).filter(
        KnowledgeReport.id == report_id,
        KnowledgeReport.tenant_id == current_user.tenant_id,
        KnowledgeReport.user_id == current_user.id,
    ).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    return report


@router.post("/generate", response_model=dict)
def generate_report(
    req: GenerateKnowledgeReportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    report = create_knowledge_report(
        db=db,
        current_user=current_user,
        doc_ids=req.doc_ids,
        title=req.title,
        description=req.description,
        model=req.model,
    )
    return serialize_report(report)


class RegenerateReportRequest(BaseModel):
    report_id: str


@router.post("/regenerate", response_model=dict)
def regenerate_report(
    req: RegenerateReportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """重新生成报告"""
    from services.knowledge_report_service import regenerate_knowledge_report
    
    report = get_owned_report(req.report_id, current_user, db)
    new_report = regenerate_knowledge_report(
        db=db,
        current_user=current_user,
        original_report=report,
    )
    return serialize_report(new_report)


@router.get("/", response_model=dict)
def list_reports(
    saved_only: bool = False,
    keyword: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(KnowledgeReport).filter(
        KnowledgeReport.tenant_id == current_user.tenant_id,
        KnowledgeReport.user_id == current_user.id,
    )

    if saved_only:
        query = query.filter(KnowledgeReport.is_saved_to_kb.is_(True))
    if keyword:
        query = query.filter(KnowledgeReport.title.contains(keyword))

    total = query.count()
    offset = (page - 1) * page_size
    reports = query.order_by(KnowledgeReport.created_at.desc()).offset(offset).limit(page_size).all()

    return {
        "items": [serialize_report(report, include_content=False) for report in reports],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/share-requests", response_model=dict)
def list_my_share_requests(
    page: int = 1,
    page_size: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(KnowledgeReportShareRequest).filter(KnowledgeReportShareRequest.user_id == current_user.id)
    total = query.count()
    offset = (page - 1) * page_size
    requests = query.order_by(KnowledgeReportShareRequest.created_at.desc()).offset(offset).limit(page_size).all()

    items = []
    for request in requests:
        report = db.query(KnowledgeReport).filter(KnowledgeReport.id == request.report_id).first()
        items.append(
            {
                "id": request.id,
                "report_id": request.report_id,
                "report_title": report.title if report else request.title,
                "title": request.title,
                "description": request.description,
                "status": request.status,
                "review_comment": request.review_comment,
                "created_at": request.created_at.isoformat(),
                "reviewed_at": request.reviewed_at.isoformat() if request.reviewed_at else None,
            }
        )

    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/admin/pending", response_model=dict)
def list_pending_share_requests(
    page: int = 1,
    page_size: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_admin_or_auditor(current_user)
    query = db.query(KnowledgeReportShareRequest).join(
        KnowledgeReport,
        KnowledgeReport.id == KnowledgeReportShareRequest.report_id,
    ).filter(
        KnowledgeReportShareRequest.status == "PENDING",
        KnowledgeReport.tenant_id == current_user.tenant_id,
    )

    total = query.count()
    offset = (page - 1) * page_size
    requests = query.order_by(KnowledgeReportShareRequest.created_at.asc()).offset(offset).limit(page_size).all()

    items = []
    for request in requests:
        report = db.query(KnowledgeReport).filter(KnowledgeReport.id == request.report_id).first()
        user = db.query(User).filter(User.id == request.user_id).first()
        items.append(
            {
                "id": request.id,
                "report_id": request.report_id,
                "report_title": report.title if report else request.title,
                "doc_names": report.doc_names if report else [],
                "summary": report.summary if report else None,
                "description": request.description,
                "source": "知识报告分享申请",
                "requested_at": request.created_at.isoformat(),
                "requester": {
                    "id": user.id,
                    "username": user.username,
                    "email": user.email,
                }
                if user
                else None,
                "created_at": request.created_at.isoformat(),
            }
        )

    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/admin/requests/{request_id}/preview", response_model=dict)
def preview_pending_report_request(
    request_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_admin_or_auditor(current_user)

    share_request = db.query(KnowledgeReportShareRequest).join(
        KnowledgeReport,
        KnowledgeReport.id == KnowledgeReportShareRequest.report_id,
    ).filter(
        KnowledgeReportShareRequest.id == request_id,
        KnowledgeReport.tenant_id == current_user.tenant_id,
    ).first()
    if not share_request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")

    report = db.query(KnowledgeReport).filter(
        KnowledgeReport.id == share_request.report_id,
        KnowledgeReport.tenant_id == current_user.tenant_id,
    ).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    return {
        **serialize_report(report),
        "request_id": share_request.id,
        "requested_at": share_request.created_at.isoformat(),
        "source": "知识报告分享申请",
    }


@router.get("/public", response_model=dict)
def list_public_reports(
    keyword: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(PublicKnowledgeReport).join(
        KnowledgeReport,
        KnowledgeReport.id == PublicKnowledgeReport.report_id,
    )

    if keyword:
        query = query.filter(PublicKnowledgeReport.title.contains(keyword))

    total = query.count()
    offset = (page - 1) * page_size
    reports = query.order_by(PublicKnowledgeReport.created_at.desc()).offset(offset).limit(page_size).all()

    items = []
    for public_report in reports:
        uploader = db.query(User).filter(User.id == public_report.uploader_id).first()
        report = db.query(KnowledgeReport).filter(KnowledgeReport.id == public_report.report_id).first()
        items.append(
            {
                "id": public_report.id,
                "report_id": public_report.report_id,
                "title": public_report.title,
                "description": public_report.description,
                "summary": public_report.summary,
                "doc_names": report.doc_names if report else [],
                "uploader": {"id": uploader.id, "username": uploader.username} if uploader else None,
                "view_count": public_report.view_count,
                "download_count": public_report.download_count,
                "created_at": public_report.created_at.isoformat(),
            }
        )

    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/public/{public_report_id}", response_model=dict)
def get_public_report(
    public_report_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    public_report = db.query(PublicKnowledgeReport).join(
        KnowledgeReport,
        KnowledgeReport.id == PublicKnowledgeReport.report_id,
    ).filter(
        PublicKnowledgeReport.id == public_report_id,
    ).first()
    if not public_report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    public_report.view_count += 1
    db.commit()
    db.refresh(public_report)

    uploader = db.query(User).filter(User.id == public_report.uploader_id).first()
    report = db.query(KnowledgeReport).filter(KnowledgeReport.id == public_report.report_id).first()

    return {
        "id": public_report.id,
        "report_id": public_report.report_id,
        "title": public_report.title,
        "description": public_report.description,
        "summary": public_report.summary,
        "markdown_content": public_report.markdown_content,
        "content": public_report.content,
        "doc_names": report.doc_names if report else [],
        "uploader": {"id": uploader.id, "username": uploader.username} if uploader else None,
        "view_count": public_report.view_count,
        "download_count": public_report.download_count,
        "created_at": public_report.created_at.isoformat(),
    }


@router.post("/public/{public_report_id}/download", response_model=dict)
def record_public_report_download(
    public_report_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    public_report = db.query(PublicKnowledgeReport).join(
        KnowledgeReport,
        KnowledgeReport.id == PublicKnowledgeReport.report_id,
    ).filter(
        PublicKnowledgeReport.id == public_report_id,
        KnowledgeReport.tenant_id == current_user.tenant_id,
    ).first()
    if not public_report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    public_report.download_count += 1
    db.commit()

    return {"status": "ok", "download_count": public_report.download_count}


@router.get("/public/{public_report_id}/file")
def download_public_report(
    public_report_id: str,
    format: str = "markdown",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    public_report = db.query(PublicKnowledgeReport).join(
        KnowledgeReport,
        KnowledgeReport.id == PublicKnowledgeReport.report_id,
    ).filter(
        PublicKnowledgeReport.id == public_report_id,
    ).first()
    if not public_report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    # 增加下载计数
    public_report.download_count += 1
    db.commit()

    if format == "markdown":
        content = public_report.markdown_content or public_report.summary or ""
        media_type = "text/markdown; charset=utf-8"
        filename = f"{public_report.title or 'report'}.md"
    elif format == "json":
        import json
        content = json.dumps({
            "title": public_report.title,
            "description": public_report.description,
            "summary": public_report.summary,
            "markdown_content": public_report.markdown_content,
            "content": public_report.content,
        }, ensure_ascii=False, indent=2)
        media_type = "application/json; charset=utf-8"
        filename = f"{public_report.title or 'report'}.json"
    else:
        content = public_report.markdown_content or public_report.summary or ""
        media_type = "text/markdown; charset=utf-8"
        filename = f"{public_report.title or 'report'}.md"

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{report_id}/save", response_model=dict)
def save_report(
    report_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    report = get_owned_report(report_id, current_user, db)
    saved_report = save_report_to_knowledge_base(db, report)
    return serialize_report(saved_report)


@router.post("/{report_id}/share-request", response_model=dict)
def create_share_request(
    report_id: str,
    req: ReportShareRequestBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    report = get_owned_report(report_id, current_user, db)
    if report.status != "COMPLETED":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only completed reports can be shared")

    existing_request = db.query(KnowledgeReportShareRequest).filter(
        KnowledgeReportShareRequest.report_id == report_id,
        KnowledgeReportShareRequest.status == "PENDING",
    ).first()
    if existing_request:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already has pending request")

    share_request = KnowledgeReportShareRequest(
        report_id=report.id,
        user_id=current_user.id,
        title=req.title,
        description=req.description,
        status="PENDING",
    )
    db.add(share_request)
    db.commit()
    db.refresh(share_request)

    return {
        "id": share_request.id,
        "report_id": share_request.report_id,
        "title": share_request.title,
        "status": share_request.status,
        "created_at": share_request.created_at.isoformat(),
    }


@router.post("/admin/requests/{request_id}/approve", response_model=dict)
def approve_share_request(
    request_id: str,
    req: ReviewRequestBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_admin_or_auditor(current_user)

    share_request = db.query(KnowledgeReportShareRequest).filter(KnowledgeReportShareRequest.id == request_id).first()
    if not share_request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if share_request.status != "PENDING":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Request not pending")

    report = db.query(KnowledgeReport).filter(
        KnowledgeReport.id == share_request.report_id,
        KnowledgeReport.tenant_id == current_user.tenant_id,
    ).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    share_request.status = "APPROVED"
    share_request.reviewer_id = current_user.id
    share_request.review_comment = req.comment
    share_request.reviewed_at = datetime.utcnow()

    existing_public_report = db.query(PublicKnowledgeReport).filter(PublicKnowledgeReport.report_id == report.id).first()
    if not existing_public_report:
        public_report = PublicKnowledgeReport(
            report_id=report.id,
            title=share_request.title or report.title,
            description=share_request.description,
            summary=report.summary,
            markdown_content=report.markdown_content,
            content=report.content,
            uploader_id=share_request.user_id,
        )
        db.add(public_report)

    db.commit()
    return {"status": "ok", "message": "Request approved"}


@router.post("/admin/requests/{request_id}/reject", response_model=dict)
def reject_share_request(
    request_id: str,
    req: ReviewRequestBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_admin_or_auditor(current_user)

    share_request = db.query(KnowledgeReportShareRequest).filter(KnowledgeReportShareRequest.id == request_id).first()
    if not share_request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if share_request.status != "PENDING":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Request not pending")

    report = db.query(KnowledgeReport).filter(
        KnowledgeReport.id == share_request.report_id,
        KnowledgeReport.tenant_id == current_user.tenant_id,
    ).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    share_request.status = "REJECTED"
    share_request.reviewer_id = current_user.id
    share_request.review_comment = req.comment
    share_request.reviewed_at = datetime.utcnow()
    db.commit()

    return {"status": "ok", "message": "Request rejected"}


@router.get("/{report_id}", response_model=dict)
def get_report(
    report_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    report = get_owned_report(report_id, current_user, db)
    return serialize_report(report)


@router.delete("/{report_id}", response_model=dict)
def delete_report(
    report_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    report = get_owned_report(report_id, current_user, db)
    db.delete(report)
    db.commit()
    return {"status": "ok", "message": "Report deleted"}


@router.get("/{report_id}/download")
def download_report(
    report_id: str,
    format: str = "markdown",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    report = get_owned_report(report_id, current_user, db)

    if format == "markdown":
        content = report.markdown_content or report.summary or ""
        media_type = "text/markdown; charset=utf-8"
        filename = f"{report.title or 'report'}.md"
    elif format == "json":
        import json
        content = json.dumps(serialize_report(report), ensure_ascii=False, indent=2)
        media_type = "application/json; charset=utf-8"
        filename = f"{report.title or 'report'}.json"
    else:
        content = report.markdown_content or report.summary or ""
        media_type = "text/markdown; charset=utf-8"
        filename = f"{report.title or 'report'}.md"

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
