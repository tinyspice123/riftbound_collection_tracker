import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import import_supabase_cards
from import_supabase_cards import quantity, rows_for_set, value


class SupabaseImportTests(unittest.TestCase):
    def test_quantity_matches_tracker_markers(self):
        self.assertEqual(quantity("3"), 3)
        self.assertEqual(quantity("x"), 1)
        self.assertEqual(quantity("no"), 0)

    def test_value_handles_missing_and_whitespace(self):
        self.assertEqual(value({'Price Estimate':' 1.25 '},'price'),'1.25')
        self.assertEqual(value({'Card':'Test'},'missing'),'')

    def test_rows_are_stable_and_use_riftbound_headers(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "demo.csv"
            path.write_text(
                "Group,Card,Number,Variant / Stamp,Source & Distribution,Status,Have,Image,Price Estimate\n"
                "Fury,,,,,,,,\n"
                ",Test Card,001/166,Regular,Booster,Released,2,https://example.com/card.webp,1.25\n",
                encoding="utf-8",
            )
            first = rows_for_set("demo", path)
            second = rows_for_set("demo", path)
        self.assertEqual(first, second)
        self.assertEqual(first[0]["group_name"], "Fury")
        self.assertEqual(first[0]["price"], "1.25")
        self.assertEqual(first[0]["quantity"], 2)
        self.assertEqual(len(first[0]["id"]), 32)

    def test_main_requires_credentials(self):
        with mock.patch.dict('os.environ',{},clear=True):
            with self.assertRaises(SystemExit):
                import_supabase_cards.main()

    def test_main_posts_import_payload(self):
        response=mock.MagicMock(status=201)
        response.__enter__.return_value=response
        with tempfile.TemporaryDirectory() as directory:
            backups=Path(directory)
            (backups/'origins.csv').write_text(
                'Group,Card,Number,Variant / Stamp,Have\nFury,,,,\n,Test,001/166,Regular,1\n',
                encoding='utf-8')
            with (
                mock.patch.object(import_supabase_cards,'BACKUPS',backups),
                mock.patch.object(import_supabase_cards,'urlopen',return_value=response) as opener,
                mock.patch.dict('os.environ',{
                    'SUPABASE_URL':'https://example.supabase.co/',
                    'SUPABASE_SECRET_KEY':'secret',
                },clear=True),
            ):
                self.assertEqual(import_supabase_cards.main(),0)
        request=opener.call_args.args[0]
        self.assertEqual(request.full_url,'https://example.supabase.co/rest/v1/riftbound_card_main?on_conflict=id')
        self.assertIn(b'"card_name": "Test"',request.data)

    def test_main_rejects_failed_import(self):
        response=mock.MagicMock(status=400)
        response.__enter__.return_value=response
        with tempfile.TemporaryDirectory() as directory:
            backups=Path(directory)
            (backups/'origins.csv').write_text('Group,Card,Have\nFury,,\n,Test,1\n',encoding='utf-8')
            with (
                mock.patch.object(import_supabase_cards,'BACKUPS',backups),
                mock.patch.object(import_supabase_cards,'urlopen',return_value=response),
                mock.patch.dict('os.environ',{
                    'SUPABASE_URL':'https://example.supabase.co',
                    'SUPABASE_SECRET_KEY':'secret',
                },clear=True),
            ):
                with self.assertRaises(RuntimeError):
                    import_supabase_cards.main()


if __name__ == "__main__":
    unittest.main()
