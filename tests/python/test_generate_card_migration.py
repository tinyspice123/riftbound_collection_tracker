import csv
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"
sys.path.insert(0, str(SCRIPTS))
spec = importlib.util.spec_from_file_location("generate", SCRIPTS / "generate_card_migration.py")
generate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generate)


class GeneratorTests(unittest.TestCase):
    def test_insert_only_preserves_quantities_and_escapes_names(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "set.csv"
            with source.open("w", newline="") as handle:
                writer = csv.writer(handle)
                writer.writerow(["Group", "Card", "Number", "Variant / Stamp", "Have", "Source & Distribution"])
                writer.writerow(["", "Hunter's Call", "001/001", "Regular", "99", "Common"])
            sql = generate.render("test", source)
        self.assertIn("Hunter''s Call", sql)
        self.assertIn("'Foil'", sql)
        self.assertIn("coalesce(max(sort_order), -1) + 1, 0", sql)
        self.assertEqual(sql.count("on conflict (id) do nothing"), 2)
        self.assertNotIn("99", sql)
        self.assertNotIn("do update", sql)

    def test_rejects_empty_catalogue(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "set.csv"
            source.write_text("Card,Number,Have\n")
            with self.assertRaises(ValueError):
                generate.render("test", source)
