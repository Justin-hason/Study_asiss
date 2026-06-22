from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime, Float,
    ForeignKey, JSON, Table, UniqueConstraint
)
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime
import uuid


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(100), unique=True, nullable=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), default="user")
    tenant_id = Column(String, default="default")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Folder(Base):
    __tablename__ = "folders"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String, nullable=False)
    parent_id = Column(String, ForeignKey("folders.id"), nullable=True)
    name = Column(String(100), nullable=False)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    children = relationship("Folder", back_populates="parent")
    parent = relationship("Folder", remote_side=[id], back_populates="children")


class Document(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String, nullable=False)
    folder_id = Column(String, ForeignKey("folders.id"), nullable=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    name = Column(String(255), nullable=False)
    mime_type = Column(String(255))
    file_path = Column(String(500))
    size = Column(Integer, default=0)
    content_type = Column(String(100))
    status = Column(String(20), default="UPLOADED")
    current_version_id = Column(String, nullable=True)
    markdown_content = Column(Text, nullable=True)  # Markdown格式的文档内容
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")
    folder = relationship("Folder")
    versions = relationship("DocumentVersion", back_populates="document")
    tags = relationship("Tag", secondary="document_tags", back_populates="documents")


class DocumentVersion(Base):
    __tablename__ = "document_versions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    doc_id = Column(String, ForeignKey("documents.id"), nullable=False)
    version_number = Column(Integer, nullable=False)
    file_path = Column(String(500))
    file_size = Column(Integer)
    uploader_id = Column(String, ForeignKey("users.id"))
    change_note = Column(String(500))
    created_at = Column(DateTime, default=datetime.utcnow)

    document = relationship("Document", back_populates="versions")
    uploader = relationship("User")


class Chunk(Base):
    __tablename__ = "chunks"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    doc_id = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    position = Column(Integer, default=0)
    vector_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Tag(Base):
    __tablename__ = "tags"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String, nullable=False)
    name = Column(String(50), nullable=False)
    color = Column(String(7), default="#1890ff")
    created_at = Column(DateTime, default=datetime.utcnow)

    documents = relationship("Document", secondary="document_tags", back_populates="tags")


document_tags = Table(
    "document_tags",
    Base.metadata,
    Column("doc_id", String, ForeignKey("documents.id"), primary_key=True),
    Column("tag_id", String, ForeignKey("tags.id"), primary_key=True),
)


class Permission(Base):
    __tablename__ = "permissions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    doc_id = Column(String, ForeignKey("documents.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    permission_level = Column(String(20), default="READ")
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("doc_id", "user_id", name="uq_doc_user"),)


class ShareLink(Base):
    __tablename__ = "share_links"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    doc_id = Column(String, ForeignKey("documents.id"), nullable=False)
    token = Column(String(64), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=True)
    expires_at = Column(DateTime, nullable=True)
    permission = Column(String(20), default="READ")
    created_by = Column(String, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)

    document = relationship("Document")
    creator = relationship("User")


class LearnEvent(Base):
    __tablename__ = "learn_events"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    kp_id = Column(String, nullable=False)
    event_type = Column(String(50), nullable=False)
    event_metadata = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")


class Mastery(Base):
    __tablename__ = "mastery"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    kp_id = Column(String, nullable=False)
    score = Column(Float, default=0.0)
    last_review_time = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (UniqueConstraint("user_id", "kp_id", name="uq_user_kp"),)


class PushTask(Base):
    __tablename__ = "push_tasks"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    kp_id = Column(String, nullable=False)
    due_time = Column(DateTime, nullable=False)
    status = Column(String(20), default="PENDING")
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)


class QASession(Base):
    __tablename__ = "qa_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    session_id = Column(String, unique=True, nullable=False)
    title = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class QAMessage(Base):
    __tablename__ = "qa_messages"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, ForeignKey("qa_sessions.id"), nullable=False)
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)


class Outline(Base):
    __tablename__ = "outlines"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    doc_id = Column(String, ForeignKey("documents.id"), nullable=True)
    title = Column(String(200), nullable=False)
    content = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Note(Base):
    __tablename__ = "notes"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    outline_id = Column(String, ForeignKey("outlines.id"), nullable=True)
    doc_id = Column(String, ForeignKey("documents.id"), nullable=True)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ShareRequest(Base):
    """用户分享文档的审核请求"""
    __tablename__ = "share_requests"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    doc_id = Column(String, ForeignKey("documents.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    title = Column(String(255), nullable=True)  # 分享标题
    description = Column(Text, nullable=True)  # 分享描述
    status = Column(String(20), default="PENDING")  # PENDING/APPROVED/REJECTED
    reviewer_id = Column(String, ForeignKey("users.id"), nullable=True)  # 审核人
    review_comment = Column(Text, nullable=True)  # 审核意见
    reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    document = relationship("Document", foreign_keys=[doc_id])
    user = relationship("User", foreign_keys=[user_id])
    reviewer = relationship("User", foreign_keys=[reviewer_id])


class PublicDocument(Base):
    """已审核通过，供所有用户访问的公共文档"""
    __tablename__ = "public_documents"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    doc_id = Column(String, ForeignKey("documents.id"), nullable=False, unique=True)
    title = Column(String(255), nullable=False)  # 分享标题
    description = Column(Text, nullable=True)  # 文档描述
    extracted_knowledge = Column(Text, nullable=True)  # 提炼的知识内容
    uploader_id = Column(String, ForeignKey("users.id"), nullable=False)
    view_count = Column(Integer, default=0)  # 浏览次数
    download_count = Column(Integer, default=0)  # 下载次数
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    document = relationship("Document")
    uploader = relationship("User")


class KnowledgeExtraction(Base):
    """文档知识提炼记录"""
    __tablename__ = "knowledge_extractions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    doc_id = Column(String, ForeignKey("documents.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    summary = Column(Text, nullable=True)  # 文档摘要
    key_points = Column(JSON, nullable=True)  # 关键知识点
    entities = Column(JSON, nullable=True)  # 识别的实体
    categories = Column(JSON, nullable=True)  # 分类标签
    model_used = Column(String(50), nullable=True)  # 使用的模型
    status = Column(String(20), default="PROCESSING")  # PROCESSING/COMPLETED/FAILED
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    document = relationship("Document")
    user = relationship("User")


class KnowledgeReport(Base):
    """多文档融合生成的知识体系报告"""
    __tablename__ = "knowledge_reports"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String, nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    report_type = Column(String(50), default="KNOWLEDGE_SYSTEM")
    doc_ids = Column(JSON, nullable=False)
    doc_names = Column(JSON, nullable=False)
    content = Column(JSON, nullable=True)
    markdown_content = Column(Text, nullable=True)
    summary = Column(Text, nullable=True)
    model_used = Column(String(50), nullable=True)
    status = Column(String(20), default="PENDING")
    error_message = Column(Text, nullable=True)
    is_saved_to_kb = Column(Boolean, default=False)
    saved_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")


class KnowledgeReportShareRequest(Base):
    """知识体系报告分享审核请求"""
    __tablename__ = "knowledge_report_share_requests"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    report_id = Column(String, ForeignKey("knowledge_reports.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(20), default="PENDING")
    reviewer_id = Column(String, ForeignKey("users.id"), nullable=True)
    review_comment = Column(Text, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    report = relationship("KnowledgeReport")
    user = relationship("User", foreign_keys=[user_id])
    reviewer = relationship("User", foreign_keys=[reviewer_id])


class WrongQuestion(Base):
    """错题本"""
    __tablename__ = "wrong_questions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    question_text = Column(Text, nullable=False)
    original_answer = Column(Text, nullable=True)
    correct_answer = Column(Text, nullable=True)
    analysis = Column(Text, nullable=True)
    source_doc_id = Column(String, ForeignKey("documents.id"), nullable=True)
    source_page = Column(Integer, nullable=True)
    knowledge_points = Column(JSON, nullable=True)
    difficulty = Column(Integer, default=1)
    review_count = Column(Integer, default=0)
    last_review_time = Column(DateTime, nullable=True)
    status = Column(String(20), default="NEW")  # NEW/REVIEWING/MASTERED
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")
    source_document = relationship("Document")


class PublicKnowledgeReport(Base):
    """已审核通过的公共知识体系报告"""
    __tablename__ = "public_knowledge_reports"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    report_id = Column(String, ForeignKey("knowledge_reports.id"), nullable=False, unique=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    summary = Column(Text, nullable=True)
    markdown_content = Column(Text, nullable=True)
    content = Column(JSON, nullable=True)
    uploader_id = Column(String, ForeignKey("users.id"), nullable=False)
    view_count = Column(Integer, default=0)
    download_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    report = relationship("KnowledgeReport")
    uploader = relationship("User")


class PracticeSession(Base):
    """练习会话"""
    __tablename__ = "practice_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    title = Column(String(255), nullable=False)
    question_count = Column(Integer, default=0)
    correct_count = Column(Integer, default=0)
    status = Column(String(20), default="IN_PROGRESS")  # IN_PROGRESS/COMPLETED/ABANDONED
    source_type = Column(String(50), default="document")  # document/knowledge_point
    source_id = Column(String, nullable=True)  # 关联的文档ID或知识点ID
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")
    questions = relationship("PracticeQuestion", back_populates="session", cascade="all, delete-orphan")


class PracticeQuestion(Base):
    """练习题目"""
    __tablename__ = "practice_questions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, ForeignKey("practice_sessions.id"), nullable=False)
    question_text = Column(Text, nullable=False)
    question_type = Column(String(50), default="single_choice")  # single_choice/multiple_choice/fill_blank/judgment
    options = Column(JSON, nullable=True)  # 选项列表
    correct_answer = Column(Text, nullable=False)
    analysis = Column(Text, nullable=True)
    knowledge_point = Column(String(255), nullable=True)
    source_doc_id = Column(String, ForeignKey("documents.id"), nullable=True)
    difficulty = Column(Integer, default=1)  # 1-5
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("PracticeSession", back_populates="questions")
    source_document = relationship("Document")
    records = relationship("PracticeRecord", back_populates="question", cascade="all, delete-orphan")


class PracticeRecord(Base):
    """练习答题记录"""
    __tablename__ = "practice_records"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, ForeignKey("practice_sessions.id"), nullable=False)
    question_id = Column(String, ForeignKey("practice_questions.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    user_answer = Column(Text, nullable=True)
    is_correct = Column(Boolean, default=False)
    score = Column(Float, default=0.0)
    time_spent = Column(Integer, default=0)  # 答题耗时(秒)
    answered_at = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("PracticeSession")
    question = relationship("PracticeQuestion", back_populates="records")
    user = relationship("User")


class KnowledgePoint(Base):
    """知识点"""
    __tablename__ = "knowledge_points"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    parent_id = Column(String, ForeignKey("knowledge_points.id"), nullable=True)
    category = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    parent = relationship("KnowledgePoint", remote_side=[id], back_populates="children")
    children = relationship("KnowledgePoint", back_populates="parent")