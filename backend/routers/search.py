import re
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from document_parser import parse_document_content
from document_rules import can_generate_report
from models import Document, KnowledgeReport, PublicDocument, PublicKnowledgeReport, User

router = APIRouter(prefix="/search", tags=["search"])


def _tokenize_query(query: str) -> List[str]:
    return [token for token in re.split(r"\s+", query.lower()) if token]


def _build_excerpt(text: str, query_tokens: List[str], max_length: int = 220) -> str:
    if not text:
        return ""

    lowered_text = text.lower()
    match_index = min(
        (lowered_text.find(token) for token in query_tokens if token and lowered_text.find(token) >= 0),
        default=0,
    )
    start = max(0, match_index - 40)
    end = min(len(text), start + max_length)
    excerpt = text[start:end].strip()
    return excerpt or text[:max_length].strip()


def _extract_page(parsed: Dict, excerpt: str) -> int:
    if parsed.get("type") == "pdf":
        for page in parsed.get("content", []):
            if excerpt and excerpt[:40] in page.get("text", ""):
                return page.get("page", 1)
    if parsed.get("type") == "ppt":
        for slide in parsed.get("content", []):
            if excerpt and excerpt[:40] in slide.get("content", ""):
                return slide.get("slide_number", 1)
    return 1


def _search_documents(query: str, top_k: int, top_n: int, current_user: User, db: Session) -> List[Dict]:
    query_tokens = _tokenize_query(query)
    results = []

    # 1. 搜索用户私人文档
    documents = db.query(Document).filter(
        Document.tenant_id == current_user.tenant_id,
        Document.user_id == current_user.id,
    ).limit(top_k).all()

    for document in documents:
        if not can_generate_report(document):
            continue

        parsed = parse_document_content(document.file_path, document.mime_type or document.content_type or "")
        if "error" in parsed:
            continue

        text = (parsed.get("text") or "").strip()
        if not text:
            continue

        lowered_text = text.lower()
        token_hits = sum(lowered_text.count(token) for token in query_tokens)
        if query_tokens and token_hits == 0:
            continue

        excerpt = _build_excerpt(text, query_tokens)
        page = _extract_page(parsed, excerpt)
        score = token_hits / max(len(query_tokens), 1)
        results.append(
            {
                "id": document.id,
                "doc_id": document.id,
                "title": document.name,
                "content": excerpt,
                "source": document.name,
                "source_type": "private_document",
                "page": page,
                "score": round(score, 4),
            }
        )

    # 2. 搜索用户知识库（已保存的报告）
    saved_reports = db.query(KnowledgeReport).filter(
        KnowledgeReport.tenant_id == current_user.tenant_id,
        KnowledgeReport.user_id == current_user.id,
        KnowledgeReport.is_saved_to_kb.is_(True),
        KnowledgeReport.status == "COMPLETED",
    ).limit(top_k // 2).all()

    for report in saved_reports:
        content_to_search = (report.markdown_content or report.summary or "")
        if not content_to_search:
            continue

        lowered_content = content_to_search.lower()
        token_hits = sum(lowered_content.count(token) for token in query_tokens)
        if query_tokens and token_hits == 0:
            continue

        excerpt = _build_excerpt(content_to_search, query_tokens, max_length=300)
        score = token_hits / max(len(query_tokens), 1)
        results.append(
            {
                "id": report.id,
                "doc_id": report.id,
                "title": f"[知识库] {report.title}",
                "content": excerpt,
                "source": report.title,
                "source_type": "knowledge_base",
                "page": 1,
                "score": round(score * 0.9, 4),  # 略低权重
            }
        )

    # 3. 搜索公开文档
    public_docs = db.query(PublicDocument).join(
        Document,
        Document.id == PublicDocument.doc_id,
    ).filter(
        PublicDocument.description.isnot(None),
    ).limit(top_k // 2).all()

    for pub_doc in public_docs:
        content_to_search = (pub_doc.description or "") + " " + (pub_doc.extracted_knowledge or "")
        if not content_to_search.strip():
            continue

        lowered_content = content_to_search.lower()
        token_hits = sum(lowered_content.count(token) for token in query_tokens)
        if query_tokens and token_hits == 0:
            continue

        excerpt = _build_excerpt(content_to_search, query_tokens, max_length=300)
        score = token_hits / max(len(query_tokens), 1)
        results.append(
            {
                "id": pub_doc.id,
                "doc_id": pub_doc.doc_id,
                "title": f"[公开文档] {pub_doc.title}",
                "content": excerpt,
                "source": pub_doc.title,
                "source_type": "public_document",
                "page": 1,
                "score": round(score * 0.8, 4),  # 公开文档权重更低
            }
        )

    # 4. 搜索公共知识报告
    public_reports = db.query(PublicKnowledgeReport).join(
        KnowledgeReport,
        KnowledgeReport.id == PublicKnowledgeReport.report_id,
    ).filter(
        PublicKnowledgeReport.title.isnot(None),
    ).limit(top_k // 2).all()

    for pub_report in public_reports:
        content_to_search = (pub_report.description or "") + " " + (pub_report.summary or "")
        if not content_to_search.strip():
            continue

        lowered_content = content_to_search.lower()
        token_hits = sum(lowered_content.count(token) for token in query_tokens)
        if query_tokens and token_hits == 0:
            continue

        excerpt = _build_excerpt(content_to_search, query_tokens, max_length=300)
        score = token_hits / max(len(query_tokens), 1)
        results.append(
            {
                "id": pub_report.id,
                "doc_id": pub_report.report_id,
                "title": f"[公共报告] {pub_report.title}",
                "content": excerpt,
                "source": pub_report.title,
                "source_type": "public_report",
                "page": 1,
                "score": round(score * 0.8, 4),
            }
        )

    results.sort(key=lambda item: item["score"], reverse=True)
    return results[:top_n]


@router.post("/", response_model=dict)
def search(query: str, top_k: int = 10, top_n: int = 5,
           current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    results = _search_documents(query, top_k, top_n, current_user, db)
    return {
        "query": query,
        "results": results,
        "total": len(results),
    }


@router.post("/qa", response_model=dict)
def search_qa(query: str, top_k: int = 10, top_n: int = 5,
              current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    results = _search_documents(query, top_k, top_n, current_user, db)
    contexts = [
        {
            "source": result["source"],
            "page": result["page"],
            "content": result["content"],
            "score": result["score"],
        }
        for result in results
    ]
    return {
        "query": query,
        "contexts": contexts,
        "total": len(contexts),
    }
