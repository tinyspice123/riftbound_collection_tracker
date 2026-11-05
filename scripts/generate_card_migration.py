"""Generate an insert-only card migration from a checked-in set CSV."""
import argparse
from pathlib import Path
import re

from import_supabase_cards import rows_for_set

ROOT = Path(__file__).resolve().parents[1]


def literal(value: object) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def render(set_id: str, source: Path) -> str:
    cards = rows_for_set(set_id, source)
    if not cards or len({card["id"] for card in cards}) != len(cards):
        raise ValueError("CSV must contain cards with unique Card/Number/Variant identities")
    columns = ("id", "set_id", "group_name", "card_name", "collector_number",
               "variant", "source", "price", "status", "image_url")
    lines = ["-- Insert missing cards only; existing quantities and metadata remain unchanged."]
    for card in cards:
        values = ", ".join(literal(card[column]) for column in columns)
        lines.append(
            f"insert into public.riftbound_card_main ({', '.join(columns)}, sort_order, quantity)\n"
            f"select {values}, coalesce(max(sort_order), -1) + 1, 0\n"
            f"from public.riftbound_card_main where set_id = {literal(set_id)}\n"
            "on conflict (id) do nothing;")
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("set_id")
    parser.add_argument("output", type=Path, help="New timestamped SQL file under supabase/migrations")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z0-9-]+", args.set_id):
        parser.error("Use the lowercase set ID from sets.js")
    output = args.output.resolve()
    if output.parent != (ROOT / "supabase/migrations").resolve() or not re.fullmatch(r"\d+_[a-z0-9_]+\.sql", output.name):
        parser.error("Output must be supabase/migrations/<timestamp>_<description>.sql")
    sql = render(args.set_id, ROOT / "backups" / f"{args.set_id}.csv")
    with output.open("x", encoding="utf-8", newline="\n") as handle:
        handle.write(sql)
    print(f"Created {output.name}; review it before committing")


if __name__ == "__main__":
    main()
