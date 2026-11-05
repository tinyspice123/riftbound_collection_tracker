"""Apply Riftbound SQL atomically with a ledger independent of Pokemon's CLI."""
from pathlib import Path
import hashlib
import os
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def migration_sql(directory: Path) -> str:
    statements = [r"""\set ON_ERROR_STOP on
begin;
select pg_advisory_xact_lock(746928150);
create schema if not exists riftbound_migrations;
revoke all on schema riftbound_migrations from public, anon, authenticated;
create table if not exists riftbound_migrations.applied (
  name text primary key, checksum text not null, applied_at timestamptz not null default now()
);
revoke all on riftbound_migrations.applied from public, anon, authenticated;
"""]
    for path in sorted(directory.glob("*.sql")):
        source = path.read_text(encoding="utf-8")
        checksum = hashlib.sha256(source.encode()).hexdigest()
        name = path.name.replace("'", "''")
        statements.append(fr"""do $check$ begin
if exists (select 1 from riftbound_migrations.applied
where name = '{name}' and checksum <> '{checksum}') then
  raise exception 'Applied Riftbound migration changed: {name}';
end if;
end $check$;
select not exists (select 1 from riftbound_migrations.applied where name = '{name}') as pending \gset
\if :pending
{source}
insert into riftbound_migrations.applied(name, checksum) values ('{name}', '{checksum}');
\endif
""")
    return "\n".join(statements) + "\ncommit;\n"


def main() -> None:
    # libpq reads PGDATABASE from the environment; credentials never enter argv.
    database = os.environ.get("SUPABASE_DATABASE_URL")
    if not database:
        raise SystemExit("Set SUPABASE_DATABASE_URL to the Postgres connection URI")
    subprocess.run(["psql", "-X", "--no-password"],
                   input=migration_sql(ROOT / "supabase" / "migrations"),
                   text=True, check=True, env={**os.environ, "PGDATABASE": database})


if __name__ == "__main__":
    main()
