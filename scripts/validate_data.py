"""Validate backed-up sheets, local image manifests, and image files."""

from __future__ import annotations

import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SETS = ("origins", "spiritforged", "unleashed", "vendetta")


def validate_set(set_id: str, root: Path = ROOT) -> list[str]:
    errors: list[str] = []
    csv_path = root / "backups" / f"{set_id}.csv"
    manifest_path = root / "public" / "img" / set_id / "manifest.txt"
    if not csv_path.exists() or not manifest_path.exists():
        return [f"{set_id}: backup or manifest missing"]
    with csv_path.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    expected = {(row["Card"], row["Number"], row["Variant / Stamp"])
                for row in rows if row.get("Card") and row.get("Image")}
    manifest: dict[tuple[str, str, str], str] = {}
    for line in manifest_path.read_text(encoding="utf-8").splitlines():
        parts = line.split("|", 3)
        if len(parts) != 4:
            errors.append(f"{set_id}: malformed manifest line")
            continue
        manifest[tuple(parts[:3])] = parts[3]
    missing = expected - set(manifest)
    stale = set(manifest) - expected
    if missing: errors.append(f"{set_id}: {len(missing)} manifest mappings missing")
    if stale: errors.append(f"{set_id}: {len(stale)} stale manifest mappings")
    for filename in manifest.values():
        image = manifest_path.parent / filename
        if not image.exists() or image.stat().st_size < 1000:
            errors.append(f"{set_id}: missing/invalid image {filename}")
    return errors


def main() -> int:
    errors = [error for set_id in SETS for error in validate_set(set_id)]
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print("Validated all Riftbound backups and local image manifests")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
