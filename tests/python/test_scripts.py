import csv
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from backup_sheets import configured_tabs, validate
from download_card_images import compressed_url, filename_for
from validate_data import validate_set


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
        self.assertEqual(filename_for(row),'001-166-hero-name-494a3070.webp')


class DataValidationTests(unittest.TestCase):
    def make_set(self, root: Path, manifest_lines: list[str], image_names: tuple[str, ...] = ()):
        (root / 'backups').mkdir(parents=True)
        (root / 'public' / 'img' / 'origins').mkdir(parents=True)
        with (root / 'backups' / 'origins.csv').open('w', encoding='utf-8', newline='') as handle:
            writer=csv.writer(handle)
            writer.writerow(['Group','Card','Number','Variant / Stamp','Have'])
            writer.writerow(['Fury','Test Card','001/166','Regular','1'])
        (root / 'public' / 'img' / 'origins' / 'manifest.txt').write_text(
            '\n'.join(manifest_lines)+'\n', encoding='utf-8')
        for name in image_names:
            (root / 'public' / 'img' / 'origins' / name).write_bytes(b'x'*1001)

    def test_valid_set(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            self.make_set(root,['Test Card|001/166|Regular|test.webp'],('test.webp',))
            self.assertEqual(validate_set('origins',root),[])

    def test_missing_inputs(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertIn('backup or manifest missing',validate_set('origins',Path(directory))[0])

    def test_reports_manifest_drift_and_invalid_image(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            self.make_set(root,[
                'malformed',
                'Stale Card|999/166|Regular|missing.webp',
            ])
            errors='\n'.join(validate_set('origins',root))
            self.assertIn('malformed manifest line',errors)
            self.assertIn('manifest mappings missing',errors)
            self.assertIn('stale manifest mappings',errors)
            self.assertIn('missing/invalid image',errors)


if __name__ == '__main__':
    unittest.main()
