import sys
sys.path.insert(0, '.')

from database import engine, Base, SessionLocal
from models import User
from auth import get_password_hash

Base.metadata.create_all(bind=engine)
db = SessionLocal()

try:
    # 清空现有用户数据（先清理关联表）
    from models import Document, KnowledgeExtraction, KnowledgeReport, ShareRequest, PublicDocument, QASession, QAMessage, KnowledgeReportShareRequest, PublicKnowledgeReport

    tables_to_clear = [
        (QAMessage, "消息"),
        (QASession, "问答会话"),
        (KnowledgeReportShareRequest, "报告分享请求"),
        (PublicKnowledgeReport, "公共报告"),
        (KnowledgeReport, "知识报告"),
        (ShareRequest, "分享请求"),
        (PublicDocument, "公共文档"),
        (KnowledgeExtraction, "知识提炼"),
        (Document, "文档"),
    ]

    for table, name in tables_to_clear:
        count = db.query(table).count()
        if count > 0:
            db.query(table).delete()
            db.commit()
            print(f"已清空 {count} 条{name}数据")

    existing_count = db.query(User).count()
    if existing_count > 0:
        db.query(User).delete()
        db.commit()
        print(f"已清空 {existing_count} 个现有用户")

    # 创建管理员
    admin = User(
        username="admin",
        email="admin@example.com",
        password_hash=get_password_hash("admin123"),
        role="admin",
        tenant_id="default",
    )
    db.add(admin)
    db.commit()
    print("超级管理员创建成功 (admin / admin123)")

    # 创建普通用户
    for i in range(1, 11):
        username = f"user{i}"
        user = User(
            username=username,
            email=f"{username}@example.com",
            password_hash=get_password_hash(f"password{i}"),
            role="user",
            tenant_id="default",
        )
        db.add(user)
        print(f"普通用户 {username} 创建成功 (密码: password{i})")
    db.commit()

    total_users = db.query(User).count()
    admin_count = db.query(User).filter(User.role == "admin").count()
    user_count = db.query(User).filter(User.role == "user").count()
    print(f"\n初始化完成！共 {total_users} 个用户 (管理员: {admin_count}, 普通用户: {user_count})")

finally:
    db.close()
