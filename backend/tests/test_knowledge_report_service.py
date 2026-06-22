import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from models import Document, KnowledgeReport, User
from services.knowledge_report_service import create_knowledge_report, save_report_to_knowledge_base


class KnowledgeReportServiceTestCase(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite:///:memory:')
        TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        Base.metadata.create_all(bind=self.engine)
        self.db = TestingSessionLocal()

        self.user = User(username='tester', email='tester@example.com', password_hash='hashed', tenant_id='tenant-a')
        self.db.add(self.user)
        self.db.commit()
        self.db.refresh(self.user)

        self.temp_files = []

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()
        for file_path in self.temp_files:
            if os.path.exists(file_path):
                os.remove(file_path)

    def _create_document(self, name: str, status: str = 'PENDING') -> Document:
        with tempfile.NamedTemporaryFile('w', suffix=os.path.splitext(name)[1], delete=False, encoding='utf-8') as handle:
            handle.write(f'{name} content for report generation')
            file_path = handle.name

        self.temp_files.append(file_path)
        document = Document(
            tenant_id=self.user.tenant_id,
            user_id=self.user.id,
            name=name,
            file_path=file_path,
            mime_type='text/plain',
            size=128,
            status=status,
        )
        self.db.add(document)
        self.db.commit()
        self.db.refresh(document)
        return document

    def test_create_knowledge_report_rejects_more_than_three_documents(self):
        documents = [self._create_document(f'doc-{index}.txt') for index in range(4)]

        with self.assertRaises(HTTPException) as context:
            create_knowledge_report(
                db=self.db,
                current_user=self.user,
                doc_ids=[document.id for document in documents],
                title='Too many docs',
            )

        self.assertEqual(context.exception.status_code, 400)
        self.assertIn('maximum of 3 documents', context.exception.detail)

    @patch('services.knowledge_report_service.ai_service.generate_knowledge_report')
    @patch('services.knowledge_report_service.parse_document_content')
    def test_create_knowledge_report_persists_completed_report(self, mock_parse_document_content, mock_generate_knowledge_report):
        document_one = self._create_document('network.md')
        document_two = self._create_document('os.txt')

        mock_parse_document_content.side_effect = [
            {'text': 'TCP connects hosts.'},
            {'text': 'Processes and scheduling.'},
        ]
        mock_generate_knowledge_report.return_value = {
            'title': '计算机基础知识体系报告',
            'summary': '融合网络与操作系统核心知识',
            'overview': '总体概览',
            'knowledge_system': [{'topic': '网络', 'description': 'TCP/IP', 'subtopics': ['TCP', 'IP']}],
            'document_roles': [{'doc_name': document_one.name, 'role': '网络基础'}, {'doc_name': document_two.name, 'role': '系统基础'}],
            'common_concepts': ['可靠传输'],
            'differences': ['侧重点不同'],
            'learning_path': ['先网络后系统'],
            'key_points': ['三次握手'],
            'source_map': [{'section': '网络', 'sources': [document_one.name]}],
            'markdown_content': '# 报告\n\n内容',
        }

        report = create_knowledge_report(
            db=self.db,
            current_user=self.user,
            doc_ids=[document_one.id, document_two.id],
            title='自定义报告',
        )

        self.assertEqual(report.status, 'COMPLETED')
        self.assertEqual(report.doc_names, [document_one.name, document_two.name])
        self.assertEqual(report.summary, '融合网络与操作系统核心知识')
        self.assertEqual(report.content['knowledge_system'][0]['topic'], '网络')
        self.assertEqual(report.markdown_content, '# 报告\n\n内容')

    @patch('services.knowledge_report_service.ai_service.generate_knowledge_report')
    @patch('services.knowledge_report_service.parse_document_content')
    def test_create_knowledge_report_falls_back_when_ai_authentication_fails(self, mock_parse_document_content, mock_generate_knowledge_report):
        document_one = self._create_document('network.md')
        document_two = self._create_document('os.txt')

        mock_parse_document_content.side_effect = [
            {'text': 'TCP connects hosts.\n可靠传输\n三次握手'},
            {'text': 'Processes and scheduling.\n并发\n线程'},
        ]
        mock_generate_knowledge_report.return_value = {
            'error': 'Authentication Fails (governor)'
        }

        report = create_knowledge_report(
            db=self.db,
            current_user=self.user,
            doc_ids=[document_one.id, document_two.id],
            title='兜底报告',
        )

        self.assertEqual(report.status, 'COMPLETED')
        self.assertEqual(report.title, '兜底报告')
        self.assertTrue(report.markdown_content)
        self.assertIn('network.md', report.markdown_content)

    def test_save_report_to_knowledge_base_requires_completed_status(self):
        report = KnowledgeReport(
            tenant_id=self.user.tenant_id,
            user_id=self.user.id,
            title='处理中报告',
            doc_ids=['doc-1'],
            doc_names=['doc-1'],
            status='PROCESSING',
        )
        self.db.add(report)
        self.db.commit()
        self.db.refresh(report)

        with self.assertRaises(HTTPException) as context:
            save_report_to_knowledge_base(self.db, report)

        self.assertEqual(context.exception.status_code, 400)
        self.assertIn('Only completed reports can be saved', context.exception.detail)


if __name__ == '__main__':
    unittest.main()
