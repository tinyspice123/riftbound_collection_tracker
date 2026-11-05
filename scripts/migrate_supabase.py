"""Apply Riftbound SQL atomically with a ledger independent of Pokemon's CLI."""
from pathlib import Path
import hashlib
import os
import subprocess
from urllib.parse import urlsplit

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
    database = os.environ.get("SUPABASE_DATABASE_URL", "").strip()
    parsed = urlsplit(database)
    if parsed.scheme not in {"postgres", "postgresql"} or not parsed.hostname:
        raise SystemExit("SUPABASE_DATABASE_URL must be a full postgres:// or postgresql:// connection URI from Supabase Connect")
    # psql must receive a connection string as dbname explicitly. PGDATABASE
    # alone can be treated as a literal database name and fall back to sockets.
    result = subprocess.run(["psql", "-X", "--no-password", "--dbname", database],
                   input=migration_sql(ROOT / "supabase" / "migrations"),
                   text=True, check=False, env={**os.environ, "PGCONNECT_TIMEOUT": "20"})
    if result.returncode:
        # Avoid CalledProcessError printing the credential-bearing command.
        raise SystemExit("Supabase migration failed; see psql output above")


if __name__ == "__main__":
    main()
