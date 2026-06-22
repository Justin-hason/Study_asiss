import asyncio
import io
import os
import shutil
import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from starlette.datastructures import UploadFile

from database import Base
from models import Document, User
from routers.documents import _resolve_mime_type, complete_upload, init_upload, upload_chunk


class DocumentUploadFlowTestCase(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite:///:memory:')
        TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        Base.metadata.create_all(bind=self.engine)
        self.db = TestingSessionLocal()

        self.user = User(username='upload-user', email='upload-user@example.com', password_hash='hashed', tenant_id='tenant-upload')
        self.db.add(self.user)
        self.db.commit()
        self.db.refresh(self.user)
        self.upload_root = os.path.join(os.getcwd(), 'uploads', self.user.tenant_id)
        if os.path.exists(self.upload_root):
            shutil.rmtree(self.upload_root)

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()
        if os.path.exists(self.upload_root):
            shutil.rmtree(self.upload_root)

    def test_upload_flow_completes_and_persists_document(self):
        init_result = init_upload('lecture-notes.txt', total_size=11, current_user=self.user, db=self.db)

        async def send_chunk():
            upload_file = UploadFile(filename='lecture-notes.txt', file=io.BytesIO(b'hello world'))
            return await upload_chunk(init_result['upload_id'], 0, upload_file, current_user=self.user, db=self.db)

        asyncio.run(send_chunk())
        complete_result = complete_upload(init_result['upload_id'], init_result['doc_id'], current_user=self.user, db=self.db)

        persisted_document = self.db.query(Document).filter(Document.id == init_result['doc_id']).first()
        self.assertEqual(complete_result['status'], 'PENDING')
        self.assertTrue(complete_result['preview_available'])
        self.assertIsNotNone(persisted_document)
        self.assertTrue(os.path.exists(persisted_document.file_path))
        self.assertEqual(persisted_document.size, 11)
        self.assertEqual(persisted_document.status, 'PENDING')

    def test_init_upload_rejects_unsupported_file_type(self):
        with self.assertRaises(HTTPException) as context:
            init_upload('malware.exe', total_size=10, current_user=self.user, db=self.db)

        self.assertEqual(context.exception.status_code, 400)
        self.assertIn('Unsupported file type', context.exception.detail)

    def test_resolve_mime_type_uses_short_values_for_office_files(self):
        self.assertEqual(_resolve_mime_type('report.docx'), 'application/msword')
        self.assertEqual(_resolve_mime_type('slides.pptx'), 'application/vnd.ms-powerpoint')


if __name__ == '__main__':
    unittest.main()
