import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location(
    "migrate", Path(__file__).resolve().parents[2] / "scripts/migrate_supabase.py")
migrate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migrate)


class MigrationTests(unittest.TestCase):
    def test_atomic_ordered_and_isolated_history(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "002_second.sql").write_text("select 2;")
            (root / "001_first.sql").write_text("select 1;")
            sql = migrate.migration_sql(root)
        self.assertLess(sql.index("select 1;"), sql.index("select 2;"))
        self.assertIn("pg_advisory_xact_lock", sql)
        self.assertIn("Applied Riftbound migration changed", sql)
        self.assertIn("\\if :pending", sql)
        self.assertIn("riftbound_migrations.applied", sql)
        self.assertNotIn("supabase_migrations", sql)
        self.assertTrue(sql.endswith("commit;\n"))

    def test_radiance_import_has_unique_ids_and_zero_quantities(self):
        import sys
        sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
        from import_supabase_cards import rows_for_set
        rows = rows_for_set("radiance", migrate.ROOT / "backups/radiance.csv")
        self.assertEqual(len(rows), 313)
        self.assertEqual(len({row["id"] for row in rows}), len(rows))
        self.assertTrue(all(row["quantity"] == 0 for row in rows))
