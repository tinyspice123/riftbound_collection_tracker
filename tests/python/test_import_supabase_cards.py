import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from import_supabase_cards import quantity, rows_for_set


class SupabaseImportTests(unittest.TestCase):
    def test_quantity_matches_tracker_markers(self):
        self.assertEqual(quantity("3"), 3)
        self.assertEqual(quantity("x"), 1)
        self.assertEqual(quantity("no"), 0)

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


if __name__ == "__main__":
    unittest.main()
