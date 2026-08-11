import csv
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from backup_sheets import configured_tabs, validate
from download_card_images import compressed_url, filename_for


class BackupTests(unittest.TestCase):
    def test_configured_tabs(self):
        source='const SHEET_BASE_URL = "https://example.com/pub";\n  origins: {\n    sheetGid: "123",\n  },'
        self.assertEqual(configured_tabs(source), [('origins','https://example.com/pub?gid=123&single=true&output=csv')])

    def test_validate_rejects_empty_card_list(self):
        with self.assertRaises(ValueError):
            validate('Card,Number,Have\n,,\n','origins')


class ImageTests(unittest.TestCase):
    def test_compressed_url(self):
        url=compressed_url('https://example.com/card.png')
        self.assertIn('w=600',url)
        self.assertIn('fm=webp',url)

    def test_filename_is_stable(self):
        row={'Number':'001/166','Card':'Hero Name','Image':'https://example.com/a.png'}
        self.assertEqual(filename_for(row),filename_for(row))
        self.assertTrue(filename_for(row).endswith('.webp'))


if __name__ == '__main__':
    unittest.main()
