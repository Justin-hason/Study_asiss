import json
import mimetypes
import os
from pathlib import Path
import shutil
import uuid
from typing import Dict, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from document_parser import is_supported_document
from document_preview import build_document_preview_response
from document_rules import can_generate_report, get_report_block_reason
from models import (
    Chunk,
    Document,
    DocumentVersion,
    Note,
    Outline,
    Permission,
    PublicDocument,
    ShareLink,
    ShareRequest,
    KnowledgeExtraction,
    User,
    document_tags,
)

router = APIRouter(prefix="/documents", tags=["documents"])

CHUNK_SIZE = 2 * 1024 * 1024
MAX_CHUNK_SIZE = CHUNK_SIZE
MAX_UPLOAD_SIZE = 100 * 1024 * 1024
UPLOAD_BASE_DIR = Path("uploads").resolve()


class UpdateDocumentRequest(BaseModel):
    name: Optional[str] = None
    folder_id: Optional[str] = None


def _sanitize_filename(filename: str) -> str:
    safe_name = filename.replace("\\", "/").split("/")[-1].strip()
    if not safe_name or safe_name in {".", ".."} or any(ord(char) < 32 for char in safe_name):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid filename")
    return safe_name


def _metadata_path(chunk_dir: str) -> str:
    return os.path.join(chunk_dir, "upload.json")


def _safe_header_filename(filename: str) -> str:
    return os.path.basename(filename).replace('"', '').replace("\r", '').replace("\n", "")


def _validate_document_path(file_path: str) -> Path:
    resolved_path = Path(file_path).resolve()
    if UPLOAD_BASE_DIR not in resolved_path.parents:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return resolved_path


def _resolve_mime_type(filename: str) -> Optional[str]:
    extension = os.path.splitext(filename)[1].lower()
    extension_map = {
        ".docx": "application/msword",
        ".doc": "application/msword",
        ".pptx": "application/vnd.ms-powerpoint",
        ".ppt": "application/vnd.ms-powerpoint",
        ".pdf": "application/pdf",
        ".md": "text/markdown",
        ".txt": "text/plain",
    }
    if extension in extension_map:
        return extension_map[extension]

    guessed_type, _ = mimetypes.guess_type(filename)
    return guessed_type


def _can_generate_report(document: Document) -> bool:
    return can_generate_report(document)


def _can_preview_document(document: Document) -> bool:
    return bool(document.file_path and os.path.exists(document.file_path))


def _build_preview_response(document: Document):
    return build_document_preview_response(document)


def _serialize_document(document: Document, db: Session = None) -> dict:
    extraction_summary = None
    extraction_status = None
    if db:
        extraction = db.query(KnowledgeExtraction).filter(
            KnowledgeExtraction.doc_id == document.id,
            KnowledgeExtraction.status == "COMPLETED"
        ).first()
        if extraction:
            extraction_summary = extraction.summary
            extraction_status = extraction.status

    return {
        "id": document.id,
        "name": document.name,
        "mime_type": document.mime_type,
        "size": document.size,
        "status": document.status,
        "folder_id": document.folder_id,
        "created_at": document.created_at.isoformat(),
        "updated_at": document.updated_at.isoformat(),
        "can_generate_report": _can_generate_report(document),
        "report_block_reason": get_report_block_reason(document),
        "preview_available": _can_preview_document(document),
        "summary": extraction_summary,
        "extraction_status": extraction_status,
    }


def _delete_document_dependencies(db: Session, document_id: str) -> dict:
    outline_ids = [
        outline_id
        for (outline_id,) in db.query(Outline.id).filter(Outline.doc_id == document_id).all()
    ]

    removed_outline_notes = 0
    if outline_ids:
        removed_outline_notes = db.query(Note).filter(Note.outline_id.in_(outline_ids)).delete(synchronize_session=False)

    removed_direct_notes = db.query(Note).filter(Note.doc_id == document_id).delete(synchronize_session=False)
    removed_outlines = db.query(Outline).filter(Outline.doc_id == document_id).delete(synchronize_session=False)
    removed_extractions = db.query(KnowledgeExtraction).filter(KnowledgeExtraction.doc_id == document_id).delete(synchronize_session=False)
    removed_public_documents = db.query(PublicDocument).filter(PublicDocument.doc_id == document_id).delete(synchronize_session=False)
    removed_share_requests = db.query(ShareRequest).filter(ShareRequest.doc_id == document_id).delete(synchronize_session=False)
    removed_share_links = db.query(ShareLink).filter(ShareLink.doc_id == document_id).delete(synchronize_session=False)
    removed_permissions = db.query(Permission).filter(Permission.doc_id == document_id).delete(synchronize_session=False)
    removed_versions = db.query(DocumentVersion).filter(DocumentVersion.doc_id == document_id).delete(synchronize_session=False)
    removed_chunks = db.query(Chunk).filter(Chunk.doc_id == document_id).delete(synchronize_session=False)
    removed_tags = db.execute(document_tags.delete().where(document_tags.c.doc_id == document_id)).rowcount or 0

    return {
        "share_requests": removed_share_requests,
        "public_documents": removed_public_documents,
        "knowledge_extractions": removed_extractions,
        "document_versions": removed_versions,
        "notes": removed_direct_notes + removed_outline_notes,
        "outlines": removed_outlines,
        "chunks": removed_chunks,
        "share_links": removed_share_links,
        "permissions": removed_permissions,
        "tags": removed_tags,
    }


def _load_upload_session(upload_id: str, current_user: User) -> Dict[str, Union[str, int]]:
    chunk_dir = os.path.join("uploads", current_user.tenant_id, "chunks", upload_id)
    metadata_path = _metadata_path(chunk_dir)
    if not os.path.exists(metadata_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found")

    with open(metadata_path, "r", encoding="utf-8") as f:
        session = json.load(f)

    if session.get("user_id") != current_user.id or session.get("tenant_id") != current_user.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found")

    session["chunk_dir"] = chunk_dir
    return session


@router.get("/", response_model=dict)
def list_documents(
    folder_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Document).filter(
        Document.tenant_id == current_user.tenant_id,
        Document.user_id == current_user.id,
    )

    if folder_id:
        query = query.filter(Document.folder_id == folder_id)

    total = query.count()
    offset = (page - 1) * page_size
    documents = query.offset(offset).limit(page_size).all()

    return {
        "items": [_serialize_document(document, db) for document in documents],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/upload/init", response_model=dict)
def init_upload(
    filename: str,
    folder_id: Optional[str] = None,
    total_size: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    safe_filename = _sanitize_filename(filename)
    if total_size <= 0 or total_size > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid upload size")
    if not is_supported_document(safe_filename):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported file type")

    upload_id = str(uuid.uuid4())

    document = Document(
        tenant_id=current_user.tenant_id,
        folder_id=folder_id,
        user_id=current_user.id,
        name=safe_filename,
        size=total_size,
        status="UPLOADING",
    )

    chunk_dir = os.path.join("uploads", current_user.tenant_id, "chunks", upload_id)
    document_created = False
    try:
        db.add(document)
        db.commit()
        db.refresh(document)
        document_created = True

        os.makedirs(chunk_dir, exist_ok=True)
        session = {
            "doc_id": document.id,
            "user_id": current_user.id,
            "tenant_id": current_user.tenant_id,
            "chunk_dir": chunk_dir,
            "filename": safe_filename,
            "total_size": total_size,
        }
        with open(_metadata_path(chunk_dir), "w", encoding="utf-8") as f:
            json.dump(session, f)

        return {
            "upload_id": upload_id,
            "doc_id": document.id,
            "chunk_size": CHUNK_SIZE,
        }
    except Exception as exc:
        db.rollback()
        if os.path.exists(chunk_dir):
            shutil.rmtree(chunk_dir, ignore_errors=True)
        if document_created:
            try:
                db.delete(document)
                db.commit()
            except Exception:
                db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to initialize upload: {str(exc)}") from exc


@router.post("/upload/{upload_id}/chunks", response_model=dict)
async def upload_chunk(
    upload_id: str,
    chunk_index: int,
    chunk: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = _load_upload_session(upload_id, current_user)
    if chunk_index < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid chunk index")

    content = await chunk.read()
    if len(content) > MAX_CHUNK_SIZE:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Chunk too large")

    chunk_path = os.path.join(str(session["chunk_dir"]), f"{chunk_index:08d}.part")
    try:
        with open(chunk_path, "wb") as f:
            f.write(content)
    except OSError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to persist upload chunk: {str(exc)}") from exc

    return {
        "upload_id": upload_id,
        "chunk_index": chunk_index,
        "size": len(content),
        "status": "uploaded",
    }


@router.post("/upload/{upload_id}/complete", response_model=dict)
def complete_upload(
    upload_id: str,
    doc_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    document = db.query(Document).filter(
        Document.id == doc_id,
        Document.tenant_id == current_user.tenant_id,
        Document.user_id == current_user.id,
    ).first()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    session = _load_upload_session(upload_id, current_user)
    if session["doc_id"] != doc_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found")

    chunk_dir = str(session["chunk_dir"])
    chunk_files = sorted(name for name in os.listdir(chunk_dir) if name.endswith(".part"))
    if not chunk_files:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No chunks uploaded")

    document_dir = os.path.join("uploads", current_user.tenant_id, "documents")
    os.makedirs(document_dir, exist_ok=True)
    _, extension = os.path.splitext(str(session["filename"]))
    file_path = os.path.join(document_dir, f"{document.id}{extension}")

    total_size = 0
    try:
        with open(file_path, "wb") as output:
            for chunk_name in chunk_files:
                chunk_path = os.path.join(chunk_dir, chunk_name)
                total_size += os.path.getsize(chunk_path)
                if total_size > MAX_UPLOAD_SIZE:
                    raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File too large")
                with open(chunk_path, "rb") as source:
                    shutil.copyfileobj(source, output)

        document.file_path = file_path
        document.mime_type = _resolve_mime_type(str(session["filename"]))
        document.content_type = extension.lstrip(".").lower() or None
        document.size = total_size
        document.status = "PENDING"
        db.commit()
    except HTTPException:
        db.rollback()
        if os.path.exists(file_path):
            os.remove(file_path)
        raise
    except Exception as exc:
        db.rollback()
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to complete upload: {str(exc)}") from exc

    shutil.rmtree(chunk_dir, ignore_errors=True)

    return {
        "doc_id": document.id,
        "status": document.status,
        "can_generate_report": _can_generate_report(document),
        "preview_available": _can_preview_document(document),
    }


@router.get("/{doc_id}", response_model=dict)
def get_document(doc_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    document = db.query(Document).filter(
        Document.id == doc_id,
        Document.tenant_id == current_user.tenant_id,
        Document.user_id == current_user.id,
    ).first()

    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    return _serialize_document(document)


@router.get("/{doc_id}/preview")
def preview_document(doc_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    document = db.query(Document).filter(
        Document.id == doc_id,
        Document.tenant_id == current_user.tenant_id,
        Document.user_id == current_user.id,
    ).first()

    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    return _build_preview_response(document)


@router.delete("/{doc_id}", response_model=dict)
def delete_document(doc_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    document = db.query(Document).filter(
        Document.id == doc_id,
        Document.tenant_id == current_user.tenant_id,
        Document.user_id == current_user.id,
    ).first()

    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    document_file_path = document.file_path
    cleanup = _delete_document_dependencies(db, document.id)
    db.delete(document)

    file_removed = False
    try:
        if document_file_path and os.path.exists(document_file_path):
            validated_path = _validate_document_path(document_file_path)
            os.remove(validated_path)
            file_removed = True

        db.commit()
    except OSError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to remove file: {str(exc)}") from exc
    except Exception:
        db.rollback()
        raise

    return {
        "status": "ok",
        "cleanup": cleanup,
        "file_removed": file_removed,
    }


@router.put("/{doc_id}/metadata", response_model=dict)
def update_metadata(
    doc_id: str,
    req: UpdateDocumentRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    document = db.query(Document).filter(
        Document.id == doc_id,
        Document.tenant_id == current_user.tenant_id,
        Document.user_id == current_user.id,
    ).first()

    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    if req.name:
        document.name = req.name
    if req.folder_id is not None:
        document.folder_id = req.folder_id

    db.commit()
    db.refresh(document)

    return _serialize_document(document)


@router.get("/{doc_id}/download")
def download_document(
    doc_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """下载文档"""
    from fastapi.responses import FileResponse

    document = db.query(Document).filter(
        Document.id == doc_id,
        Document.tenant_id == current_user.tenant_id,
        Document.user_id == current_user.id,
    ).first()

    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    if not document.file_path or not os.path.exists(document.file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    return FileResponse(
        path=document.file_path,
        filename=document.name,
        media_type=document.mime_type or "application/octet-stream",
    )
