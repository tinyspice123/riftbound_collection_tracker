import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "release_version", Path(__file__).resolve().parents[2] / "scripts/release_version.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class VersionTests(unittest.TestCase):
    def test_initial_release(self):
        self.assertEqual(release.next_version(None, "feat: add Radiance"), "v1.0.0")

    def test_patch_default(self):
        self.assertEqual(release.next_version("v1.2.3", "Fix connection\n\nfix(db): pooler"), "v1.2.4")

    def test_feature_bumps_minor(self):
        self.assertEqual(release.next_version("v1.2.3", "fix: bug\nfeat(sets): add set"), "v1.3.0")

    def test_breaking_change_takes_precedence(self):
        for message in ["feat!: new schema", "fix(db)!: schema", "feat: new\n\nBREAKING CHANGE: incompatible", "fix: new\n\nBREAKING-CHANGE: incompatible"]:
            with self.subTest(message=message):
                self.assertEqual(release.next_version("v1.2.3", message), "v2.0.0")

    def test_body_mentions_do_not_trigger_feature_bump(self):
        self.assertEqual(release.next_version("v1.2.3", "docs: describe feat: syntax"), "v1.2.4")
