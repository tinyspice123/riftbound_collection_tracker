"""Back up every configured published sheet tab and refresh site fallbacks."""

from __future__ import annotations

import csv
import io
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SETS_JS = ROOT / "public" / "sets.js"
BACKUPS = ROOT / "backups"
FALLBACKS = ROOT / "public" / "data"

BASE_RE = re.compile(r'const\s+SHEET_BASE_URL\s*=\s*"([^"]+)"')
ENTRY_RE = re.compile(
    r'^\s{2}([a-z0-9-]+):\s*\{(?P<body>.*?)(?=^\s{2}\},)', re.MULTILINE | re.DOTALL
)
GID_RE = re.compile(r'sheetGid:\s*"(\d+)"')


def configured_tabs(source: str) -> list[tuple[str, str]]:
    base_match = BASE_RE.search(source)
    if not base_match:
        raise ValueError("SHEET_BASE_URL is missing")
    base = base_match.group(1)
    tabs: list[tuple[str, str]] = []
    for match in ENTRY_RE.finditer(source):
        gid = GID_RE.search(match.group("body"))
        if gid:
            tabs.append((match.group(1), f"{base}?gid={gid.group(1)}&single=true&output=csv"))
    if not tabs:
        raise ValueError("no configured sheet tabs found")
    return tabs


def fetch(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "RiftboundCollectionTracker/1.0"})
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return response.read().decode("utf-8-sig")
        except (urllib.error.URLError, TimeoutError) as exc:
            last_error = exc
            time.sleep(2**attempt)
    raise RuntimeError(f"sheet download failed after 3 attempts: {last_error}")


def validate(text: str, set_id: str) -> int:
    if text.lstrip().startswith("<"):
        raise ValueError(f"{set_id}: received HTML instead of CSV")
    rows = list(csv.reader(io.StringIO(text)))
    if not rows:
        raise ValueError(f"{set_id}: empty CSV")
    headers = {value.strip().lower() for value in rows[0]}
    for required in ("card", "number", "have"):
        if required not in headers:
            raise ValueError(f"{set_id}: missing required {required!r} column")
    card_index = next(index for index, value in enumerate(rows[0]) if value.strip().lower() == "card")
    count = sum(1 for row in rows[1:] if len(row) > card_index and row[card_index].strip())
    if count == 0:
        raise ValueError(f"{set_id}: no card rows; refusing to replace a valid backup")
    return count


def write_if_changed(path: Path, text: str) -> bool:
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    if not normalized.endswith("\n"):
        normalized += "\n"
    if path.exists() and path.read_text(encoding="utf-8-sig") == normalized:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(normalized, encoding="utf-8", newline="")
    temporary.replace(path)
    return True


def main() -> int:
    changed = 0
    source = SETS_JS.read_text(encoding="utf-8")
    for set_id, url in configured_tabs(source):
        text = fetch(url)
        count = validate(text, set_id)
        backup_changed = write_if_changed(BACKUPS / f"{set_id}.csv", text)
        fallback_changed = write_if_changed(FALLBACKS / f"{set_id}.csv", text)
        changed += int(backup_changed or fallback_changed)
        print(f"{set_id}: {count} cards ({'updated' if backup_changed or fallback_changed else 'unchanged'})")
    print(f"Backup complete: {changed} set(s) changed")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
