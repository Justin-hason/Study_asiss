from typing import List, Optional
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status, Body
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import Folder, Tag, Document, DocumentVersion, Permission, ShareLink, User


class CreateFolderRequest(BaseModel):
    name: str
    parent_id: Optional[str] = None


class MoveFolderRequest(BaseModel):
    parent_id: Optional[str] = None
    sort_order: Optional[int] = None


class CreateTagRequest(BaseModel):
    name: str
    color: str = "#1890ff"


class SetPermissionsRequest(BaseModel):
    level: str
    user_ids: List[str]


class CreateShareLinkRequest(BaseModel):
    expires_in_hours: Optional[int] = None
    password: Optional[str] = None
    permission: str = "READ"

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


def get_owned_document_or_404(doc_id: str, current_user: User, db: Session) -> Document:
    document = db.query(Document).filter(
        Document.id == doc_id,
        Document.tenant_id == current_user.tenant_id,
        Document.user_id == current_user.id,
    ).first()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return document


@router.get("/folders/tree", response_model=List[dict])
def get_folder_tree(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    folders = db.query(Folder).filter(Folder.tenant_id == current_user.tenant_id).all()

    folder_map = {f.id: {"id": f.id, "tenant_id": f.tenant_id, "parent_id": f.parent_id,
                         "name": f.name, "sort_order": f.sort_order,
                         "created_at": f.created_at.isoformat(),
                         "updated_at": f.updated_at.isoformat(), "children": []}
                  for f in folders}

    root_folders = []
    for folder in folders:
        if folder.parent_id:
            if folder.parent_id in folder_map:
                folder_map[folder.parent_id]["children"].append(folder_map[folder.id])
        else:
            root_folders.append(folder_map[folder.id])

    return root_folders


@router.post("/folders", response_model=dict)
def create_folder(req: CreateFolderRequest,
                  current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if req.parent_id:
        parent = db.query(Folder).filter(Folder.id == req.parent_id, Folder.tenant_id == current_user.tenant_id).first()
        if not parent:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent folder not found")

    folder = Folder(
        tenant_id=current_user.tenant_id,
        parent_id=req.parent_id,
        name=req.name,
        sort_order=0,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)

    return {
        "id": folder.id,
        "tenant_id": folder.tenant_id,
        "parent_id": folder.parent_id,
        "name": folder.name,
        "sort_order": folder.sort_order,
        "created_at": folder.created_at.isoformat(),
        "updated_at": folder.updated_at.isoformat(),
    }


@router.put("/folders/{folder_id}/move", response_model=dict)
def move_folder(folder_id: str, req: MoveFolderRequest,
                current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    folder = db.query(Folder).filter(Folder.id == folder_id, Folder.tenant_id == current_user.tenant_id).first()
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")

    if req.parent_id:
        parent = db.query(Folder).filter(Folder.id == req.parent_id, Folder.tenant_id == current_user.tenant_id).first()
        if not parent:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent folder not found")

    folder.parent_id = req.parent_id
    if req.sort_order is not None:
        folder.sort_order = req.sort_order

    db.commit()
    db.refresh(folder)

    return {"status": "ok"}


@router.delete("/folders/{folder_id}", response_model=dict)
def delete_folder(folder_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    folder = db.query(Folder).filter(Folder.id == folder_id, Folder.tenant_id == current_user.tenant_id).first()
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")

    children = db.query(Folder).filter(Folder.parent_id == folder_id).all()
    if children:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Folder is not empty")

    documents = db.query(Document).filter(Document.folder_id == folder_id).all()
    if documents:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Folder contains documents")

    db.delete(folder)
    db.commit()

    return {"status": "ok"}


@router.get("/tags", response_model=List[dict])
def list_tags(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tags = db.query(Tag).filter(Tag.tenant_id == current_user.tenant_id).all()
    return [
        {
            "id": tag.id,
            "tenant_id": tag.tenant_id,
            "name": tag.name,
            "color": tag.color,
            "created_at": tag.created_at.isoformat(),
        }
        for tag in tags
    ]


@router.post("/tags", response_model=dict)
def create_tag(req: CreateTagRequest,
               current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    existing_tag = db.query(Tag).filter(Tag.name == req.name, Tag.tenant_id == current_user.tenant_id).first()
    if existing_tag:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tag already exists")

    tag = Tag(
        tenant_id=current_user.tenant_id,
        name=req.name,
        color=req.color,
    )
    db.add(tag)
    db.commit()
    db.refresh(tag)

    return {
        "id": tag.id,
        "tenant_id": tag.tenant_id,
        "name": tag.name,
        "color": tag.color,
        "created_at": tag.created_at.isoformat(),
    }


@router.post("/documents/{doc_id}/tags/{tag_id}", response_model=dict)
def add_document_tag(doc_id: str, tag_id: str,
                     current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    document = get_owned_document_or_404(doc_id, current_user, db)

    tag = db.query(Tag).filter(Tag.id == tag_id, Tag.tenant_id == current_user.tenant_id).first()
    if not tag:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found")

    if tag in document.tags:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tag already added")

    document.tags.append(tag)
    db.commit()

    return {"status": "ok"}


@router.delete("/documents/{doc_id}/tags/{tag_id}", response_model=dict)
def remove_document_tag(doc_id: str, tag_id: str,
                        current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    document = get_owned_document_or_404(doc_id, current_user, db)

    tag = db.query(Tag).filter(Tag.id == tag_id, Tag.tenant_id == current_user.tenant_id).first()
    if not tag:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found")

    if tag not in document.tags:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tag not found on document")

    document.tags.remove(tag)
    db.commit()

    return {"status": "ok"}


@router.put("/documents/{doc_id}/permissions", response_model=dict)
def set_permissions(doc_id: str, req: SetPermissionsRequest,
                    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    document = get_owned_document_or_404(doc_id, current_user, db)

    if document.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    db.query(Permission).filter(Permission.doc_id == doc_id).delete()

    for user_id in req.user_ids:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            permission = Permission(
                doc_id=doc_id,
                user_id=user_id,
                permission_level=req.level,
            )
            db.add(permission)

    db.commit()

    return {"status": "ok"}


@router.post("/documents/{doc_id}/share", response_model=dict)
def create_share_link(doc_id: str, req: CreateShareLinkRequest,
                      current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    document = get_owned_document_or_404(doc_id, current_user, db)

    import uuid
    token = str(uuid.uuid4()).replace("-", "")

    expires_at = None
    if req.expires_in_hours:
        expires_at = datetime.utcnow() + timedelta(hours=req.expires_in_hours)

    password_hash = None
    if req.password:
        from auth import get_password_hash
        password_hash = get_password_hash(req.password)

    share_link = ShareLink(
        doc_id=doc_id,
        token=token,
        password_hash=password_hash,
        expires_at=expires_at,
        permission=req.permission,
        created_by=current_user.id,
    )
    db.add(share_link)
    db.commit()
    db.refresh(share_link)

    return {
        "token": share_link.token,
        "expires_at": share_link.expires_at.isoformat() if share_link.expires_at else None,
        "permission": share_link.permission,
    }


@router.get("/documents/{doc_id}/versions", response_model=List[dict])
def list_versions(doc_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    document = get_owned_document_or_404(doc_id, current_user, db)

    versions = db.query(DocumentVersion).filter(DocumentVersion.doc_id == doc_id).order_by(DocumentVersion.version_number.desc()).all()

    return [
        {
            "id": v.id,
            "version_number": v.version_number,
            "file_size": v.file_size,
            "change_note": v.change_note,
            "created_at": v.created_at.isoformat(),
            "is_current": v.id == document.current_version_id,
        }
        for v in versions
    ]


@router.post("/documents/{doc_id}/versions/{version_id}/restore", response_model=dict)
def restore_version(doc_id: str, version_id: str,
                    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    document = get_owned_document_or_404(doc_id, current_user, db)

    version = db.query(DocumentVersion).filter(DocumentVersion.id == version_id, DocumentVersion.doc_id == doc_id).first()
    if not version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")

    document.current_version_id = version.id
    db.commit()

    return {"status": "ok"}


@router.post("/share/{token}", response_model=dict)
def verify_share_link(token: str, password: Optional[str] = None, db: Session = Depends(get_db)):
    share_link = db.query(ShareLink).filter(ShareLink.token == token).first()
    if not share_link:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid share link")

    if share_link.expires_at and share_link.expires_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Share link expired")

    if share_link.password_hash:
        if not password:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Password required")
        from auth import verify_password
        if not verify_password(password, share_link.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password")

    document = db.query(Document).filter(Document.id == share_link.doc_id).first()

    return {
        "doc_id": document.id,
        "name": document.name,
        "permission": share_link.permission,
    }