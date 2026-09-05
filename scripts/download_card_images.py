"""Download compressed local card scans and build tracker manifests.

Source rows come from backups/<set>.csv. Most gallery CDNs support on-the-fly
WebP delivery; sources that do not are retained in their valid raster format.
"""

from __future__ import annotations

import csv
import hashlib
import re
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKUPS = ROOT / "backups"
IMAGE_ROOT = ROOT / "public" / "img"
SETS = ("origins", "spiritforged", "unleashed", "vendetta")
MAX_ATTEMPTS = 3


def filename_for(row: dict[str, str], extension: str = "webp") -> str:
    stem = re.sub(r"[^a-z0-9]+", "-", f"{row['Number']}-{row['Card']}".lower()).strip("-")
    digest = hashlib.sha256(row["Image"].encode()).hexdigest()[:8]
    return f"{stem[:80]}-{digest}.{extension}"


def compressed_url(source: str) -> str:
    parsed = urllib.parse.urlsplit(source)
    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    query.extend((("w", "600"), ("fm", "webp"), ("q", "82")))
    return urllib.parse.urlunsplit(parsed._replace(query=urllib.parse.urlencode(query)))


def image_extension(data: bytes) -> str | None:
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "webp"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    return None


def valid_image_file(path: Path) -> bool:
    if not path.exists() or path.stat().st_size <= 1000:
        return False
    with path.open("rb") as handle:
        return image_extension(handle.read(12)) is not None


def download(job: tuple[str, Path], opener=urllib.request.urlopen,
             sleeper=time.sleep, attempts: int = MAX_ATTEMPTS) -> Path:
    url, destination = job
    for extension in ("webp", "jpg", "png"):
        existing = destination.with_suffix(f".{extension}")
        if valid_image_file(existing):
            return existing
    request = urllib.request.Request(url, headers={"User-Agent": "RiftboundCollectionTracker/1.0"})
    for attempt in range(1, attempts + 1):
        try:
            with opener(request, timeout=45) as response:
                data = response.read()
            break
        except OSError:
            if attempt == attempts:
                raise
            sleeper(2 ** attempt)
    extension = image_extension(data)
    if len(data) < 1000 or extension is None:
        raise ValueError(f"invalid image response for {url}")
    destination = destination.with_suffix(f".{extension}")
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

    jobs: list[tuple[tuple[str, str, str], str, Path]] = []
    for row in rows:
        if not row.get("Card") or not row.get("Image"):
            continue
        key = (row["Card"], row["Number"], row["Variant / Stamp"])
        stem = Path(filename_for(row)).with_suffix("")
        jobs.append((key, compressed_url(row["Image"]), target / stem))

    failures: list[str] = []
    filenames: dict[tuple[str, str, str], str] = {}
    with ThreadPoolExecutor(max_workers=12) as pool:
        futures = {pool.submit(download, (url, destination)): (key, url)
                   for key, url, destination in jobs}
        for index, future in enumerate(as_completed(futures), 1):
            try:
                filenames[futures[future][0]] = future.result().name
            except Exception as exc:  # report every failed URL before exiting
                failures.append(f"{futures[future][1]}: {exc}")
            if index % 50 == 0 or index == len(jobs):
                print(f"{set_id}: {index}/{len(jobs)}", flush=True)

    if failures:
        raise RuntimeError("\n".join(failures))
    manifest = ["|".join((*key, filenames[key])) for key, _, _ in jobs]
    (target / "manifest.txt").write_text("\n".join(manifest) + "\n", encoding="utf-8")
    return len(rows), sum((target / filenames[key]).stat().st_size
                          for key, _, _ in jobs)


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
