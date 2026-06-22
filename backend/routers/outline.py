from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User, Outline

router = APIRouter(prefix="/outline", tags=["outline"])


@router.post("/generate", response_model=dict)
def generate_outline(doc_id: Optional[str] = None, title: str = "文档大纲",
                     current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    mock_outline = {
        "title": title,
        "sections": [
            {
                "title": "第一章：引言",
                "level": 1,
                "children": [
                    {"title": "1.1 研究背景", "level": 2},
                    {"title": "1.2 研究目的", "level": 2},
                    {"title": "1.3 研究方法", "level": 2},
                ],
            },
            {
                "title": "第二章：核心概念",
                "level": 1,
                "children": [
                    {"title": "2.1 基础定义", "level": 2},
                    {"title": "2.2 相关理论", "level": 2},
                ],
            },
            {
                "title": "第三章：结论",
                "level": 1,
                "children": [
                    {"title": "3.1 主要发现", "level": 2},
                    {"title": "3.2 未来展望", "level": 2},
                ],
            },
        ],
    }

    outline = Outline(
        user_id=current_user.id,
        doc_id=doc_id,
        title=title,
        content=mock_outline,
    )
    db.add(outline)
    db.commit()
    db.refresh(outline)

    return {
        "id": outline.id,
        "title": outline.title,
        "content": outline.content,
        "created_at": outline.created_at.isoformat(),
    }


@router.get("/{outline_id}", response_model=dict)
def get_outline(outline_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    outline = db.query(Outline).filter(Outline.id == outline_id, Outline.user_id == current_user.id).first()
    if not outline:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Outline not found")

    return {
        "id": outline.id,
        "title": outline.title,
        "content": outline.content,
        "created_at": outline.created_at.isoformat(),
        "updated_at": outline.updated_at.isoformat(),
    }


@router.put("/{outline_id}", response_model=dict)
def update_outline(outline_id: str, title: Optional[str] = None, content: Optional[dict] = None,
                   current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    outline = db.query(Outline).filter(Outline.id == outline_id, Outline.user_id == current_user.id).first()
    if not outline:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Outline not found")

    if title:
        outline.title = title
    if content:
        outline.content = content

    db.commit()
    db.refresh(outline)

    return {
        "id": outline.id,
        "title": outline.title,
        "content": outline.content,
        "updated_at": outline.updated_at.isoformat(),
    }


@router.post("/{outline_id}/export", response_model=dict)
def export_outline(outline_id: str, format: str = "markdown",
                   current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    outline = db.query(Outline).filter(Outline.id == outline_id, Outline.user_id == current_user.id).first()
    if not outline:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Outline not found")

    def build_markdown(sections, level=1):
        markdown = ""
        for section in sections:
            markdown += "#" * level + " " + section["title"] + "\n\n"
            if "children" in section:
                markdown += build_markdown(section["children"], level + 1)
        return markdown

    markdown_content = build_markdown(outline.content.get("sections", []))

    return {
        "format": format,
        "content": markdown_content,
        "filename": f"{outline.title}.md",
    }