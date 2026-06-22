import os
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from ai_service import ai_service
from document_parser import parse_document_content
from document_rules import get_report_block_reason
from models import Document, KnowledgeReport, User

MAX_REPORT_DOCUMENTS = 3
MAX_CONTEXT_LENGTH = 6000
MAX_SUMMARIZE_LENGTH = 12000


def _build_fallback_report(document_contexts: List[Dict[str, str]], title: Optional[str] = None) -> Dict[str, Any]:
    resolved_title = title.strip() if title and title.strip() else f"{' / '.join(context['name'] for context in document_contexts[:3])} 知识体系报告"
    document_roles = [
        {"doc_name": context["name"], "role": "来源资料"}
        for context in document_contexts
    ]
    knowledge_system = []
    key_points = []
    source_map = []
    learning_path = []
    all_concepts = []

    for context in document_contexts:
        # 提取段落作为概念
        paragraphs = [p.strip() for p in context["content"].split("\n\n") if p.strip() and len(p.strip()) > 30]
        concepts = paragraphs[:3] if paragraphs else [context["content"][:200].strip()]
        concept_name = context["name"].replace(".docx", "").replace("-", " ").strip()
        
        knowledge_system.append({
            "topic": concept_name,
            "definition": "基于文档内容提取的概念",
            "explanation": context["content"][:800] if context["content"] else "无内容",
            "applications": ["待补充"],
            "related_terms": []
        })
        all_concepts.append(concept_name)
        source_map.append({"section": context["name"], "sources": [context["name"]]})
        learning_path.append(concept_name)
        key_points.extend([p[:100].strip() for p in paragraphs[:2]] if paragraphs else [])

    if not key_points:
        key_points = [context["content"][:80] for context in document_contexts if context["content"]][:5]

    overview = f"本报告基于{len(document_contexts)}份文档，系统梳理了核心知识点，构建了基础知识体系。"
    
    # 生成markdown内容，严格按照格式
    md_lines = [
        f"# {resolved_title}",
        "",
        "## 摘要",
        overview,
        "",
        "## 专业领域总体概括",
        overview,
        "",
        "## 专业名词详解",
    ]
    
    for ks in knowledge_system:
        md_lines.extend([
            "",
            f"### {ks['topic']}",
            "",
            "#### 定义",
            ks.get("definition", "基于文档内容提取"),
            "",
            "#### 详细解释",
            ks.get("explanation", "暂无详细解释"),
            "",
            "#### 应用场景",
        ])
        for app in ks.get("applications", []):
            md_lines.append(f"- {app}")
        md_lines.extend([
            "",
            "#### 关联概念",
        ])
        for rt in ks.get("related_terms", []):
            md_lines.append(f"- {rt}")
    
    md_lines.extend([
        "",
        "## 来源文档",
    ])
    for context in document_contexts:
        md_lines.append(f"- {context['name']}：{context.get('summary', '来源资料')[:100]}")
    
    md_lines.extend([
        "",
        "## 核心专业名词列表",
    ])
    for concept in all_concepts:
        md_lines.append(f"- {concept}")
    
    md_lines.extend([
        "",
        "## 专业名词间的关系描述",
        "各知识点之间存在相互关联，共同构成完整的知识体系。",
        "",
        "## 学习路径",
    ])
    for i, lp in enumerate(learning_path, 1):
        md_lines.append(f"{i}. {lp}")
    
    md_lines.extend([
        "",
        "## 参考文献",
        "- 待补充（请重新生成报告以获取完整参考文献）",
    ])

    return {
        "title": resolved_title,
        "summary": overview,
        "overview": overview,
        "knowledge_system": knowledge_system,
        "document_roles": document_roles,
        "common_concepts": [],
        "differences": ["当前为本地降级生成结果，建议结合原文进一步校对。"],
        "learning_path": learning_path,
        "key_points": key_points[:8],
        "source_map": source_map,
        "markdown_content": "\n".join(md_lines),
    }


def _normalize_doc_ids(doc_ids: List[str]) -> List[str]:
    normalized_doc_ids = [doc_id.strip() for doc_id in doc_ids if doc_id and doc_id.strip()]
    unique_doc_ids = list(dict.fromkeys(normalized_doc_ids))
    if len(unique_doc_ids) != len(normalized_doc_ids):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Duplicate documents are not allowed")
    return unique_doc_ids


def validate_report_documents(db: Session, current_user: User, doc_ids: List[str]) -> List[Document]:
    normalized_doc_ids = _normalize_doc_ids(doc_ids)
    if not normalized_doc_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please select at least one document")
    if len(normalized_doc_ids) > MAX_REPORT_DOCUMENTS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A maximum of 3 documents can be selected")

    documents = db.query(Document).filter(
        Document.tenant_id == current_user.tenant_id,
        Document.user_id == current_user.id,
        Document.id.in_(normalized_doc_ids),
    ).all()

    if len(documents) != len(normalized_doc_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or more documents were not found")

    document_map = {document.id: document for document in documents}
    ordered_documents = [document_map[doc_id] for doc_id in normalized_doc_ids]

    for document in ordered_documents:
        block_reason = get_report_block_reason(document)
        if block_reason:
            if block_reason == "missing_file":
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Document file '{document.name}' was not found",
                )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Document '{document.name}' is not ready for report generation",
            )

    return ordered_documents


def _build_document_context(document: Document, model: str) -> Dict[str, str]:
    parsed = parse_document_content(document.file_path, document.mime_type or document.content_type or "")
    if "error" in parsed:
        raise ValueError(parsed["error"])

    text = (parsed.get("text") or "").strip()
    if not text:
        raise ValueError(f"Document '{document.name}' has no readable content")

    summary = ""
    content = text[:MAX_CONTEXT_LENGTH]
    if len(text) > MAX_CONTEXT_LENGTH:
        summary = ai_service.summarize(text[:MAX_SUMMARIZE_LENGTH], model=model, provider="deepseek")
        if summary.startswith("Error:"):
            summary = ""
        content = text[: MAX_CONTEXT_LENGTH // 2]

    return {
        "id": document.id,
        "name": document.name,
        "summary": summary,
        "content": content,
    }


def serialize_report(report: KnowledgeReport, include_content: bool = True) -> Dict[str, Any]:
    payload = {
        "id": report.id,
        "title": report.title,
        "description": report.description,
        "report_type": report.report_type,
        "doc_ids": report.doc_ids or [],
        "doc_names": report.doc_names or [],
        "summary": report.summary,
        "markdown_content": report.markdown_content,
        "model_used": report.model_used,
        "status": report.status,
        "error_message": report.error_message,
        "is_saved_to_kb": report.is_saved_to_kb,
        "saved_at": report.saved_at.isoformat() if report.saved_at else None,
        "completed_at": report.completed_at.isoformat() if report.completed_at else None,
        "created_at": report.created_at.isoformat(),
        "updated_at": report.updated_at.isoformat(),
    }
    if include_content:
        payload["content"] = report.content
    return payload


def create_knowledge_report(
    db: Session,
    current_user: User,
    doc_ids: List[str],
    title: Optional[str] = None,
    description: Optional[str] = None,
    model: str = "deepseek-v4-pro",
) -> KnowledgeReport:
    documents = validate_report_documents(db, current_user, doc_ids)
    report_title = title.strip() if title and title.strip() else "知识体系报告"

    report = KnowledgeReport(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        title=report_title,
        description=description,
        doc_ids=[document.id for document in documents],
        doc_names=[document.name for document in documents],
        status="PENDING",
        model_used=model,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    report.status = "PROCESSING"
    report.error_message = None
    db.commit()

    try:
        document_contexts = [_build_document_context(document, model) for document in documents]
        generated_report = ai_service.generate_knowledge_report(
            document_contexts,
            title=title,
            model=model,
            provider="deepseek",
        )
        if generated_report.get("error"):
            generated_report = _build_fallback_report(document_contexts, title)

        report.title = generated_report.get("title") or report_title
        report.summary = generated_report.get("summary") or generated_report.get("overview") or ""
        report.markdown_content = generated_report.get("markdown_content") or report.summary or ""
        report.content = {
            "overview": generated_report.get("overview", ""),
            "knowledge_system": generated_report.get("knowledge_system", []),
            "document_roles": generated_report.get("document_roles", []),
            "key_concepts": generated_report.get("key_concepts", []),
            "concept_relationships": generated_report.get("concept_relationships", []),
            "learning_path": generated_report.get("learning_path", []),
            "references": generated_report.get("references", []),
        }
        report.status = "COMPLETED"
        report.completed_at = datetime.utcnow()
        report.error_message = None
        db.commit()
        db.refresh(report)
        return report
    except Exception as exc:
        report.status = "FAILED"
        report.error_message = str(exc)
        db.commit()
        db.refresh(report)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


def regenerate_knowledge_report(
    db: Session,
    current_user: User,
    original_report: KnowledgeReport,
) -> KnowledgeReport:
    """重新生成报告，使用原始报告的文档ID"""
    doc_ids = original_report.doc_ids or []
    if not doc_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Original report has no documents")

    documents = validate_report_documents(db, current_user, doc_ids)
    model = original_report.model_used or "deepseek-v4-pro"

    # 创建新报告
    new_report = KnowledgeReport(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        title=original_report.title,
        description=original_report.description,
        doc_ids=[document.id for document in documents],
        doc_names=[document.name for document in documents],
        status="PENDING",
        model_used=model,
    )
    db.add(new_report)
    db.commit()
    db.refresh(new_report)

    new_report.status = "PROCESSING"
    new_report.error_message = None
    db.commit()

    try:
        document_contexts = [_build_document_context(document, model) for document in documents]
        generated_report = ai_service.generate_knowledge_report(
            document_contexts,
            title=original_report.title,
            model=model,
            provider="deepseek",
        )
        if generated_report.get("error"):
            generated_report = _build_fallback_report(document_contexts, original_report.title)

        new_report.title = generated_report.get("title") or original_report.title
        new_report.summary = generated_report.get("summary") or generated_report.get("overview") or ""
        new_report.markdown_content = generated_report.get("markdown_content") or new_report.summary or ""
        new_report.content = {
            "overview": generated_report.get("overview", ""),
            "knowledge_system": generated_report.get("knowledge_system", []),
            "document_roles": generated_report.get("document_roles", []),
            "key_concepts": generated_report.get("key_concepts", []),
            "concept_relationships": generated_report.get("concept_relationships", []),
            "learning_path": generated_report.get("learning_path", []),
            "references": generated_report.get("references", []),
        }
        new_report.status = "COMPLETED"
        new_report.completed_at = datetime.utcnow()
        new_report.error_message = None
        db.commit()
        db.refresh(new_report)
        return new_report
    except Exception as exc:
        new_report.status = "FAILED"
        new_report.error_message = str(exc)
        db.commit()
        db.refresh(new_report)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


def save_report_to_knowledge_base(db: Session, report: KnowledgeReport) -> KnowledgeReport:
    if report.status != "COMPLETED":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only completed reports can be saved")

    report.is_saved_to_kb = True
    report.saved_at = datetime.utcnow()
    db.commit()
    db.refresh(report)
    return report
