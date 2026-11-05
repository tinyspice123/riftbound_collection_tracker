import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, Mock

spec = importlib.util.spec_from_file_location(
    "migrate", Path(__file__).resolve().parents[2] / "scripts/migrate_supabase.py")
migrate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migrate)


class MigrationTests(unittest.TestCase):
    def test_connection_uri_is_passed_explicitly(self):
        uri = "postgresql://postgres:password@example.com:5432/postgres?sslmode=require"
        with patch.dict(migrate.os.environ, {"SUPABASE_DATABASE_URL": uri}), patch.object(
                migrate.subprocess, "run", return_value=Mock(returncode=0)) as run:
            migrate.main()
        self.assertEqual(run.call_args.args[0][-2:], ["--dbname", uri])

    def test_rejects_api_urls_before_connecting(self):
        with patch.dict(migrate.os.environ, {"SUPABASE_DATABASE_URL": "https://example.supabase.co"}), patch.object(
                migrate.subprocess, "run") as run:
            with self.assertRaises(SystemExit):
                migrate.main()
        run.assert_not_called()

    def test_failure_does_not_expose_command_credentials(self):
        with patch.dict(migrate.os.environ, {"SUPABASE_DATABASE_URL": "postgresql://user:secret@example.com/postgres"}), patch.object(
                migrate.subprocess, "run", return_value=Mock(returncode=2)):
            with self.assertRaises(SystemExit) as error:
                migrate.main()
        self.assertNotIn("secret", str(error.exception))

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
        self.assertEqual({row["group_name"] for row in rows}, {"Base set"})
