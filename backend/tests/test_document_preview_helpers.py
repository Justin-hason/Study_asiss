import os
import tempfile
import unittest

from fastapi import HTTPException
from starlette.responses import FileResponse, PlainTextResponse

from models import Document
from routers.admin import build_preview_response as build_admin_preview_response
from routers.documents import _build_preview_response as build_document_preview_response
from routers.share import _build_preview_response as build_share_preview_response


class DocumentPreviewHelpersTestCase(unittest.TestCase):
    def test_preview_helpers_return_text_preview_for_text_documents(self):
        uploads_dir = os.path.join(os.getcwd(), 'uploads')
        os.makedirs(uploads_dir, exist_ok=True)
        with tempfile.NamedTemporaryFile('w', suffix='.txt', dir=uploads_dir, delete=False, encoding='utf-8') as handle:
            handle.write('preview content')
            file_path = handle.name

        document = Document(name='preview.txt', file_path=file_path, mime_type='text/plain')

        try:
            for helper in (build_document_preview_response, build_share_preview_response, build_admin_preview_response):
                response = helper(document)
                self.assertIsInstance(response, PlainTextResponse)
                self.assertEqual(response.media_type, 'text/plain; charset=utf-8')
        finally:
            os.remove(file_path)

    def test_preview_helpers_return_file_response_for_pdf_documents(self):
        uploads_dir = os.path.join(os.getcwd(), 'uploads')
        os.makedirs(uploads_dir, exist_ok=True)
        with tempfile.NamedTemporaryFile('wb', suffix='.pdf', dir=uploads_dir, delete=False) as handle:
            handle.write(b'%PDF-1.4\n%mock pdf')
            file_path = handle.name

        document = Document(name='preview.pdf', file_path=file_path, mime_type='application/pdf')

        try:
            for helper in (build_document_preview_response, build_share_preview_response, build_admin_preview_response):
                response = helper(document)
                self.assertIsInstance(response, FileResponse)
                self.assertEqual(response.media_type, 'application/pdf')
        finally:
            os.remove(file_path)

    def test_preview_helpers_raise_not_found_for_missing_file(self):
        document = Document(name='missing.txt', file_path='missing-file.txt', mime_type='text/plain')

        for helper in (build_document_preview_response, build_share_preview_response, build_admin_preview_response):
            with self.assertRaises(HTTPException) as context:
                helper(document)
            self.assertEqual(context.exception.status_code, 404)


if __name__ == '__main__':
    unittest.main()
