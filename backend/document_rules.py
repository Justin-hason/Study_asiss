import os
from typing import Optional

from document_parser import is_supported_document
from models import Document

REPORT_BLOCKED_STATUSES = {"UPLOADING", "PROCESSING", "FAILED", "REJECTED"}


def get_report_block_reason(document: Document) -> Optional[str]:
    if not document.file_path:
        return "missing_file"
    if not os.path.exists(document.file_path):
        return "missing_file"
    if not is_supported_document(document.name):
        return "unsupported_type"
    if document.status in REPORT_BLOCKED_STATUSES:
        return f"status_{document.status.lower()}"
    return None


def can_generate_report(document: Document) -> bool:
    return get_report_block_reason(document) is None
