"""Import checked-in collection snapshots into riftbound_card_main."""
from __future__ import annotations

import csv
import hashlib
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
BACKUPS = ROOT / "backups"
REINDEX_OFFSET = 1_000_000


def value(row: dict[str, str], needle: str) -> str:
    key = next((key for key in row if needle in key.lower()), None)
    return (row.get(key, "") if key else "").strip()


def quantity(raw: str) -> int:
    text = raw.strip().lower()
    if text.isdigit():
        return int(text)
    return 0 if text in {"", "false", "no", "n", "-", "–", "0"} else 1


def standard_print_is_always_foil(source: str) -> bool:
    """Riftbound base Rare and Epic printings are foil by default."""
    return source.strip().casefold().startswith(("rare", "epic"))


def rows_for_set(set_id: str, path: Path) -> list[dict[str, object]]:
    cards: list[dict[str, object]] = []
    group = "Ungrouped"
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            card = value(row, "card")
            incoming_group = value(row, "group")
            if incoming_group and not card:
                group = incoming_group
                continue
            if not card:
                continue
            number, variant = value(row, "number"), value(row, "variant")
            identity = "\0".join((set_id, card, number, variant)).encode()
            cards.append({
                "id": hashlib.sha256(identity).hexdigest()[:32],
                "set_id": set_id,
                "sort_order": len(cards),
                "group_name": group,
                "card_name": card,
                "collector_number": number,
                "variant": variant,
                "source": value(row, "source"),
                "price": value(row, "price"),
                "status": value(row, "status"),
                "image_url": value(row, "image"),
                "quantity": quantity(value(row, "have")),
            })
            # Standard foils share a collector number and image with their
            # regular printing, but are separate entries in a collection.
            # Do not copy the owned quantity: an existing Regular copy is not
            # evidence that its Foil counterpart is owned.
            if variant.casefold() == "regular" and not standard_print_is_always_foil(value(row, "source")):
                foil_identity = "\0".join((set_id, card, number, "Foil")).encode()
                cards.append({
                    "id": hashlib.sha256(foil_identity).hexdigest()[:32],
                    "set_id": set_id,
                    "sort_order": len(cards),
                    "group_name": group,
                    "card_name": card,
                    "collector_number": number,
                    "variant": "Foil",
                    "source": value(row, "source"),
                    "price": "",
                    "status": value(row, "status"),
                    "image_url": value(row, "image"),
                    "quantity": 0,
                })
    return cards


def upsert_cards(base: str, secret: str, cards: list[dict[str, object]]) -> None:
    for start in range(0, len(cards), 250):
        payload = json.dumps(cards[start:start + 250]).encode()
        request = Request(base + "/rest/v1/riftbound_card_main?on_conflict=id", data=payload,
            method="POST", headers={"apikey": secret, "Authorization": f"Bearer {secret}",
            "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates"})
        with urlopen(request, timeout=60) as response:
            if response.status not in (200, 201):
                raise RuntimeError(f"Import failed with HTTP {response.status}")


def main() -> int:
    base = os.environ.get("SUPABASE_URL", "").rstrip("/")
    secret = os.environ.get("SUPABASE_SECRET_KEY", "")
    if not base or not secret:
        raise SystemExit("Set SUPABASE_URL and SUPABASE_SECRET_KEY first")
    cards = []
    for path in sorted(BACKUPS.glob("*.csv")):
        set_cards = rows_for_set(path.stem, path)
        staged = [{**card, "sort_order": int(card["sort_order"]) + REINDEX_OFFSET}
                  for card in set_cards]
        upsert_cards(base, secret, staged)
        upsert_cards(base, secret, set_cards)
        cards.extend(set_cards)
    print(f"Imported {len(cards)} cards")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
