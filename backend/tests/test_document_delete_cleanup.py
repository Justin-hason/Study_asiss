import os
import tempfile
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from models import Document, KnowledgeExtraction, ShareRequest, User
from routers.documents import _delete_document_dependencies


class DocumentDeleteCleanupTestCase(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite:///:memory:')
        TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        Base.metadata.create_all(bind=self.engine)
        self.db = TestingSessionLocal()

        self.user = User(username='deleter', email='deleter@example.com', password_hash='hashed', tenant_id='tenant-a')
        self.db.add(self.user)
        self.db.commit()
        self.db.refresh(self.user)

        with tempfile.NamedTemporaryFile('w', suffix='.txt', delete=False, encoding='utf-8') as handle:
            handle.write('delete me')
            self.file_path = handle.name

        self.document = Document(
            tenant_id=self.user.tenant_id,
            user_id=self.user.id,
            name='delete-me.txt',
            file_path=self.file_path,
            mime_type='text/plain',
            size=9,
            status='PENDING',
        )
        self.db.add(self.document)
        self.db.commit()
        self.db.refresh(self.document)

        self.db.add(ShareRequest(doc_id=self.document.id, user_id=self.user.id, status='PENDING'))
        self.db.add(KnowledgeExtraction(doc_id=self.document.id, user_id=self.user.id, status='COMPLETED'))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()
        if os.path.exists(self.file_path):
            os.remove(self.file_path)

    def test_delete_document_dependencies_allows_document_deletion(self):
        cleanup = _delete_document_dependencies(self.db, self.document.id)
        self.db.delete(self.document)
        self.db.commit()

        remaining_document = self.db.query(Document).filter(Document.id == self.document.id).first()
        remaining_request = self.db.query(ShareRequest).filter(ShareRequest.doc_id == self.document.id).first()
        remaining_extraction = self.db.query(KnowledgeExtraction).filter(KnowledgeExtraction.doc_id == self.document.id).first()

        self.assertEqual(cleanup['share_requests'], 1)
        self.assertEqual(cleanup['knowledge_extractions'], 1)
        self.assertIsNone(remaining_document)
        self.assertIsNone(remaining_request)
        self.assertIsNone(remaining_extraction)


if __name__ == '__main__':
    unittest.main()
