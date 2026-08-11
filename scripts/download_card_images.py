"""Download compressed local card scans and build tracker manifests.

Source rows come from backups/<set>.csv. The official gallery CDN supports
on-the-fly WebP delivery, keeping the GitHub Pages artifact reasonably small.
"""

from __future__ import annotations

import csv
import hashlib
import re
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKUPS = ROOT / "backups"
IMAGE_ROOT = ROOT / "public" / "img"
SETS = ("origins", "spiritforged", "unleashed", "vendetta")


def filename_for(row: dict[str, str]) -> str:
    stem = re.sub(r"[^a-z0-9]+", "-", f"{row['Number']}-{row['Card']}".lower()).strip("-")
    digest = hashlib.sha256(row["Image"].encode()).hexdigest()[:8]
    return f"{stem[:80]}-{digest}.webp"


def compressed_url(source: str) -> str:
    parsed = urllib.parse.urlsplit(source)
    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    query.extend((("w", "600"), ("fm", "webp"), ("q", "82")))
    return urllib.parse.urlunsplit(parsed._replace(query=urllib.parse.urlencode(query)))


def download(job: tuple[str, Path]) -> Path:
    url, destination = job
    if destination.exists() and destination.stat().st_size > 1000:
        return destination
    request = urllib.request.Request(url, headers={"User-Agent": "RiftboundCollectionTracker/1.0"})
    with urllib.request.urlopen(request, timeout=45) as response:
        data = response.read()
    if len(data) < 1000 or not (data.startswith(b"RIFF") and data[8:12] == b"WEBP"):
        raise ValueError(f"invalid WebP response for {url}")
    temporary = destination.with_suffix(".tmp")
    temporary.write_bytes(data)
    temporary.replace(destination)
    return destination


def process_set(set_id: str) -> tuple[int, int]:
    source = BACKUPS / f"{set_id}.csv"
    target = IMAGE_ROOT / set_id
    target.mkdir(parents=True, exist_ok=True)
    with source.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))

    jobs: list[tuple[str, Path]] = []
    manifest: list[str] = []
    for row in rows:
        filename = filename_for(row)
        jobs.append((compressed_url(row["Image"]), target / filename))
        manifest.append("|".join((row["Card"], row["Number"], row["Variant / Stamp"], filename)))

    failures: list[str] = []
    with ThreadPoolExecutor(max_workers=12) as pool:
        futures = {pool.submit(download, job): job[0] for job in jobs}
        for index, future in enumerate(as_completed(futures), 1):
            try:
                future.result()
            except Exception as exc:  # report every failed URL before exiting
                failures.append(f"{futures[future]}: {exc}")
            if index % 50 == 0 or index == len(jobs):
                print(f"{set_id}: {index}/{len(jobs)}", flush=True)

    if failures:
        raise RuntimeError("\n".join(failures))
    (target / "manifest.txt").write_text("\n".join(manifest) + "\n", encoding="utf-8")
    return len(rows), sum(path.stat().st_size for _, path in jobs)


def main() -> int:
    selected = tuple(sys.argv[1:]) or SETS
    if any(item not in SETS for item in selected):
        print(f"Choose from: {', '.join(SETS)}", file=sys.stderr)
        return 2
    total_cards = total_bytes = 0
    for set_id in selected:
        count, size = process_set(set_id)
        total_cards += count
        total_bytes += size
    print(f"Downloaded {total_cards} cards ({total_bytes / 1024 / 1024:.1f} MiB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
