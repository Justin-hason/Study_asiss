import os
from pathlib import Path

from fastapi import HTTPException, status
from fastapi.responses import FileResponse, PlainTextResponse, Response

from document_parser import parse_document_content
from models import Document

UPLOAD_BASE_DIR = Path("uploads").resolve()
OFFICE_EXTENSIONS = {".doc", ".docx", ".ppt", ".pptx"}
TEXT_EXTENSIONS = {".txt", ".md"}


def _safe_header_filename(filename: str) -> str:
    return os.path.basename(filename).replace('"', '').replace("\r", '').replace("\n", "")


def _validate_document_path(file_path: str) -> Path:
    resolved_path = Path(file_path).resolve()
    if UPLOAD_BASE_DIR not in resolved_path.parents:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return resolved_path


def build_document_preview_response(document: Document) -> Response:
    if not document.file_path or not os.path.exists(document.file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    validated_path = _validate_document_path(document.file_path)
    extension = validated_path.suffix.lower()

    if extension in OFFICE_EXTENSIONS | TEXT_EXTENSIONS:
        parsed = parse_document_content(str(validated_path), document.mime_type or document.content_type or "")
        if "error" in parsed:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=parsed["error"])
        text = (parsed.get("text") or "").strip()
        if not text:
            text = "该文档没有可预览的文本内容。"
        return PlainTextResponse(text, media_type="text/plain; charset=utf-8")

    return FileResponse(
        str(validated_path),
        media_type=document.mime_type or "application/octet-stream",
    )
