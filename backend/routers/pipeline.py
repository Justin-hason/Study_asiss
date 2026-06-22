from typing import Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User, Document, Chunk

router = APIRouter(prefix="/pipeline", tags=["pipeline"])


@router.post("/upload", response_model=dict)
async def upload_document(
    file: UploadFile = File(...),
    folder_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    content = await file.read()
    file_size = len(content)

    doc = Document(
        user_id=current_user.id,
        tenant_id=current_user.tenant_id,
        folder_id=folder_id,
        name=file.filename,
        size=file_size,
        status="PENDING",
        content_type=file.content_type,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    return {
        "id": doc.id,
        "name": doc.name,
        "status": doc.status,
        "size": doc.size,
    }


@router.get("/tasks/{doc_id}", response_model=dict)
def get_task_status(doc_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    return {
        "id": doc.id,
        "name": doc.name,
        "status": doc.status,
        "progress": 100 if doc.status == "PROCESSED" else 0,
        "error": None,
    }


@router.post("/retry/{doc_id}", response_model=dict)
def retry_task(doc_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    doc.status = "PENDING"
    db.commit()

    return {"status": "ok", "message": "Task requeued"}


@router.delete("/tasks/{doc_id}", response_model=dict)
def delete_task(doc_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    db.query(Chunk).filter(Chunk.doc_id == doc_id).delete()
    db.delete(doc)
    db.commit()

    return {"status": "ok"}


@router.get("/chunks/{doc_id}", response_model=List[dict])
def get_chunks(doc_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    chunks = db.query(Chunk).filter(Chunk.doc_id == doc_id).order_by(Chunk.position).all()

    return [
        {
            "id": c.id,
            "content": c.content,
            "position": c.position,
        }
        for c in chunks
    ]