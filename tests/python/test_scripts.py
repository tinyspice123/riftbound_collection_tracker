import csv
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import backup_supabase
from backup_supabase import parse_sets, parse_supabase_config, rows_to_csv
from download_card_images import compressed_url, filename_for, image_extension
from validate_data import validate_set


class BackupTests(unittest.TestCase):
    def test_parse_sets(self):
        self.assertEqual(parse_sets('const SETS = {\n  origins: {\n    name: "Origins",\n  },\n};'), [{'id':'origins'}])

    def test_parse_supabase_config(self):
        source='const SUPABASE_CONFIG = {url: "https://example.supabase.co", publishableKey: "public"};'
        self.assertEqual(parse_supabase_config(source), ('https://example.supabase.co','public'))

    def test_parse_supabase_config_rejects_missing_values(self):
        with self.assertRaises(ValueError):
            parse_supabase_config('const SUPABASE_CONFIG = {};')

    def test_csv_keeps_existing_riftbound_header_order(self):
        text=rows_to_csv([{'group_name':'Fury','card_name':'Test','collector_number':'001/166',
            'variant':'Regular','source':'Booster','status':'Released','quantity':2,
            'image_url':'https://example.com/a.webp','price':'1.25'}])
        self.assertTrue(text.startswith('Group,Card,Number,Variant / Stamp,Source & Distribution,Status,Have,Image,Price Estimate\n'))
        self.assertIn(',Test,001/166,Regular,Booster,Released,2,https://example.com/a.webp,1.25',text)

    def test_fetch_json_retries_temporary_failure(self):
        response=mock.MagicMock()
        response.__enter__.return_value.read.return_value=b'[{"id":"card"}]'
        opener=mock.Mock(side_effect=[OSError('temporary'),response])
        sleeper=mock.Mock()
        self.assertEqual(backup_supabase.fetch_json(
            'https://example.test/cards','key',opener,sleeper,attempts=2),[{'id':'card'}])
        sleeper.assert_called_once_with(2)

    def test_fetch_set_rejects_non_list_response(self):
        with mock.patch.object(backup_supabase,'fetch_json',return_value={'error':'bad'}):
            with self.assertRaises(ValueError):
                backup_supabase.fetch_set('https://example.test','key','origins')

    def test_fetch_set_paginates(self):
        first=[{'id':str(index)} for index in range(backup_supabase.PAGE_SIZE)]
        with mock.patch.object(backup_supabase,'fetch_json',side_effect=[first,[{'id':'last'}]]) as fetch:
            rows=backup_supabase.fetch_set('https://example.test','key','origins')
        self.assertEqual(len(rows),backup_supabase.PAGE_SIZE+1)
        self.assertIn('offset=1000',fetch.call_args_list[1].args[0])

    def test_backup_writes_successes_and_reports_empty_sets(self):
        row={'group_name':'Fury','card_name':'Test'}
        with tempfile.TemporaryDirectory() as directory:
            out=Path(directory)
            with mock.patch.object(backup_supabase,'fetch_set',side_effect=[[row],[]]):
                result=backup_supabase.backup(
                    [{'id':'origins'},{'id':'empty'}],'https://example.test','key',out)
            self.assertEqual(result,1)
            self.assertTrue((out/'origins.csv').exists())
            self.assertFalse((out/'empty.csv').exists())

    def test_backup_accepts_empty_registry(self):
        self.assertEqual(backup_supabase.backup([], 'https://example.test', 'key'),0)

    def test_main_reads_repository_configuration(self):
        with mock.patch.object(backup_supabase,'backup',return_value=0) as run:
            self.assertEqual(backup_supabase.main(),0)
        self.assertEqual(run.call_args.args[1],'https://ekyngjwtoxvkqfalxebm.supabase.co')


class ImageTests(unittest.TestCase):
    def test_compressed_url(self):
        url=compressed_url('https://example.com/card.png')
        self.assertIn('w=600',url)
        self.assertIn('fm=webp',url)

    def test_filename_is_stable(self):
        row={'Number':'001/166','Card':'Hero Name','Image':'https://example.com/a.png'}
        self.assertEqual(filename_for(row),'001-166-hero-name-494a3070.webp')
        self.assertEqual(filename_for(row, 'jpg'),'001-166-hero-name-494a3070.jpg')

    def test_detects_supported_image_formats(self):
        self.assertEqual(image_extension(b'RIFFxxxxWEBPmore'), 'webp')
        self.assertEqual(image_extension(b'\xff\xd8\xffmore'), 'jpg')
        self.assertEqual(image_extension(b'\x89PNG\r\n\x1a\nmore'), 'png')
        self.assertIsNone(image_extension(b'<html>not an image</html>'))


class DataValidationTests(unittest.TestCase):
    def make_set(self, root: Path, manifest_lines: list[str], image_names: tuple[str, ...] = ()):
        (root / 'backups').mkdir(parents=True)
        (root / 'public' / 'img' / 'origins').mkdir(parents=True)
        with (root / 'backups' / 'origins.csv').open('w', encoding='utf-8', newline='') as handle:
            writer=csv.writer(handle)
            writer.writerow(['Group','Card','Number','Variant / Stamp','Have','Image'])
            writer.writerow(['Fury','Test Card','001/166','Regular','1','https://example.com/card.webp'])
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

    def test_card_without_source_image_does_not_require_manifest_mapping(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            self.make_set(root,[],())
            csv_path=root/'backups'/'origins.csv'
            csv_path.write_text(
                'Group,Card,Number,Variant / Stamp,Have,Image\nFury,Test Card,001/166,Regular,0,\n',
                encoding='utf-8')
            self.assertEqual(validate_set('origins',root),[])

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
