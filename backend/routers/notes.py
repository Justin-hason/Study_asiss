from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User, Note

router = APIRouter(prefix="/notes", tags=["notes"])


@router.get("/", response_model=List[dict])
def list_notes(doc_id: Optional[str] = None, outline_id: Optional[str] = None,
               current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(Note).filter(Note.user_id == current_user.id)
    if doc_id:
        query = query.filter(Note.doc_id == doc_id)
    if outline_id:
        query = query.filter(Note.outline_id == outline_id)

    notes = query.order_by(Note.created_at.desc()).all()

    return [
        {
            "id": note.id,
            "content": note.content,
            "doc_id": note.doc_id,
            "outline_id": note.outline_id,
            "created_at": note.created_at.isoformat(),
            "updated_at": note.updated_at.isoformat(),
        }
        for note in notes
    ]


@router.post("/", response_model=dict)
def create_note(content: str, doc_id: Optional[str] = None, outline_id: Optional[str] = None,
                current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    note = Note(
        user_id=current_user.id,
        doc_id=doc_id,
        outline_id=outline_id,
        content=content,
    )
    db.add(note)
    db.commit()
    db.refresh(note)

    return {
        "id": note.id,
        "content": note.content,
        "doc_id": note.doc_id,
        "outline_id": note.outline_id,
        "created_at": note.created_at.isoformat(),
    }


@router.put("/{note_id}", response_model=dict)
def update_note(note_id: str, content: str,
                current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    note = db.query(Note).filter(Note.id == note_id, Note.user_id == current_user.id).first()
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")

    note.content = content
    db.commit()
    db.refresh(note)

    return {
        "id": note.id,
        "content": note.content,
        "updated_at": note.updated_at.isoformat(),
    }


@router.delete("/{note_id}", response_model=dict)
def delete_note(note_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    note = db.query(Note).filter(Note.id == note_id, Note.user_id == current_user.id).first()
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")

    db.delete(note)
    db.commit()

    return {"status": "ok"}