#!/usr/bin/env python3
"""Export riftbound_card_main to per-set CSV snapshots under backups/."""
from __future__ import annotations

import csv
import io
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REQUEST_TIMEOUT = 45
MAX_ATTEMPTS = 3
PAGE_SIZE = 1000
FIELDS = (
    "group_name,card_name,collector_number,variant,source,"
    "status,price,quantity,image_url,sort_order"
)
CSV_HEADER = [
    "Group", "Card", "Number", "Variant / Stamp", "Source & Distribution",
    "Status", "Have", "Image", "Price Estimate",
]


def parse_sets(source: str) -> list[dict[str, str]]:
    """Return active top-level set ids from the simple SETS registry."""
    return [{"id": match.group(1)} for match in re.finditer(
        r"^\s{2}([a-z0-9-]+):\s*\{", source, re.MULTILINE)]


def parse_supabase_config(source: str) -> tuple[str, str]:
    """Read the public project URL/key used by the static browser client."""
    url = re.search(r'url:\s*["\']([^"\']+)', source)
    key = re.search(r'publishableKey:\s*["\']([^"\']+)', source)
    if not url or not key:
        raise ValueError("supabase-config.js is missing url or publishableKey")
    return url.group(1).rstrip("/"), key.group(1)


def fetch_json(url, key, opener=urllib.request.urlopen, sleeper=time.sleep,
               attempts=MAX_ATTEMPTS):
    request = urllib.request.Request(url, headers={
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "User-Agent": "riftbound-tracker-backup",
    })
    for attempt in range(1, attempts + 1):
        try:
            with opener(request, timeout=REQUEST_TIMEOUT) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code not in {408, 425, 429} and exc.code < 500:
                raise
            error = exc
        except (OSError, json.JSONDecodeError) as exc:
            error = exc
        if attempt == attempts:
            raise error
        delay = 2 ** attempt
        print(f"    temporary export failure ({error}); retrying in {delay}s")
        sleeper(delay)
    raise RuntimeError("unreachable")


def fetch_set(base_url, key, set_id, opener=urllib.request.urlopen,
              sleeper=time.sleep):
    rows = []
    offset = 0
    while True:
        query = urllib.parse.urlencode({
            "select": FIELDS,
            "set_id": f"eq.{set_id}",
            "order": "sort_order.asc",
            "limit": PAGE_SIZE,
            "offset": offset,
        })
        page = fetch_json(f"{base_url}/rest/v1/riftbound_card_main?{query}", key,
                          opener, sleeper)
        if not isinstance(page, list):
            raise ValueError("Supabase returned a non-list response")
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            return rows
        offset += PAGE_SIZE


def rows_to_csv(rows) -> str:
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(CSV_HEADER)
    previous_group = None
    for row in rows:
        group = str(row.get("group_name") or "Ungrouped")
        if group != previous_group:
            writer.writerow([group] + [""] * (len(CSV_HEADER) - 1))
            previous_group = group
        writer.writerow([
            "", row.get("card_name", ""), row.get("collector_number", ""),
            row.get("variant", ""), row.get("source", ""),
            row.get("status", ""), row.get("quantity", 0),
            row.get("image_url", ""), row.get("price", ""),
        ])
    return output.getvalue()


def backup(entries, base_url, key, out=Path("backups"),
           opener=urllib.request.urlopen, sleeper=time.sleep):
    set_ids = [entry["id"] for entry in entries]
    if not set_ids:
        print("No sets found in sets.js")
        return 0
    out.mkdir(exist_ok=True)
    saved, failed = 0, []
    for set_id in set_ids:
        try:
            rows = fetch_set(base_url, key, set_id, opener, sleeper)
            if not rows:
                raise ValueError("database contains no cards for this set")
            (out / f"{set_id}.csv").write_text(
                rows_to_csv(rows), encoding="utf-8", newline="\n")
            print(f"  {set_id}: {len(rows)} cards")
            saved += 1
        except Exception as exc:
            print(f"  {set_id}: FAILED - {exc}")
            failed.append(set_id)
    print(f"\n{saved}/{len(set_ids)} sets exported to {out}/")
    if failed:
        print("Failed:", ", ".join(failed))
        return 1
    return 0


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    entries = parse_sets((root / "public" / "sets.js").read_text(encoding="utf-8"))
    base_url, key = parse_supabase_config(
        (root / "public" / "supabase-config.js").read_text(encoding="utf-8"))
    return backup(entries, base_url, key, root / "backups")


if __name__ == "__main__":
    sys.exit(main())
