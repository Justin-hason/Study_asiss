import os
import tempfile
import unittest

from document_parser import get_file_type, is_supported_document, parse_document_content


class DocumentParserTestCase(unittest.TestCase):
    def test_markdown_and_text_files_are_supported(self):
        self.assertTrue(is_supported_document('notes.md'))
        self.assertTrue(is_supported_document('summary.txt'))
        self.assertEqual(get_file_type('notes.md'), 'text/markdown')
        self.assertEqual(get_file_type('summary.txt'), 'text/plain')

    def test_office_file_types_use_short_db_safe_mime_values(self):
        self.assertEqual(get_file_type('lesson.docx'), 'application/msword')
        self.assertEqual(get_file_type('slides.pptx'), 'application/vnd.ms-powerpoint')

    def test_parse_text_reads_plain_text_content(self):
        with tempfile.NamedTemporaryFile('w', suffix='.txt', delete=False, encoding='utf-8') as handle:
            handle.write('line 1\n\nline 2')
            file_path = handle.name

        try:
            parsed = parse_document_content(file_path, 'text/plain')
            self.assertEqual(parsed['type'], 'text')
            self.assertEqual(parsed['text'], 'line 1\n\nline 2')
            self.assertEqual(parsed['lines'], 2)
        finally:
            os.remove(file_path)


if __name__ == '__main__':
    unittest.main()
