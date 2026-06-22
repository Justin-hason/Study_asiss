from sqlalchemy import create_engine, inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from config import DATABASE_URL

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def ensure_schema_compatibility() -> None:
    inspector = inspect(engine)
    dialect_name = engine.dialect.name

    with engine.begin() as connection:
        if inspector.has_table("documents"):
            document_columns = {column["name"]: column for column in inspector.get_columns("documents")}
            mime_type_column = document_columns.get("mime_type")
            mime_length = getattr(mime_type_column["type"], "length", None) if mime_type_column else None
            if dialect_name == "postgresql" and mime_type_column and mime_length and mime_length < 255:
                connection.execute(text("ALTER TABLE documents ALTER COLUMN mime_type TYPE VARCHAR(255)"))

            # 添加缺失的 markdown_content 列
            if "markdown_content" not in document_columns:
                if dialect_name == "postgresql":
                    connection.execute(text("ALTER TABLE documents ADD COLUMN markdown_content TEXT"))
                elif dialect_name == "sqlite":
                    connection.execute(text("ALTER TABLE documents ADD COLUMN markdown_content TEXT"))

        if inspector.has_table("share_requests"):
            share_request_columns = {column["name"] for column in inspector.get_columns("share_requests")}
            if "title" not in share_request_columns:
                if dialect_name == "postgresql":
                    connection.execute(text("ALTER TABLE share_requests ADD COLUMN title VARCHAR(255)"))
                elif dialect_name == "sqlite":
                    connection.execute(text("ALTER TABLE share_requests ADD COLUMN title VARCHAR(255)"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
