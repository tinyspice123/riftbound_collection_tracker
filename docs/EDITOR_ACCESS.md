# Manage editor access

Editor authorization uses a private Supabase table keyed by Auth user UUID.
No owner email address is stored in the repository or public browser bundle.
The allowlist is shared with the Pokémon tracker because both sites use the
same Supabase project. Existing Pokémon tracker editors already have access.

## Initial setup

1. Open **Authentication → Users**.
2. Select the Google account that should edit the collection.
3. Copy its **User UID**.
4. Insert that UUID in SQL Editor:

```sql
insert into private.collection_editors (user_id)
values ('PASTE-AUTH-USER-UUID-HERE')
on conflict (user_id) do nothing;
```

Sign out of the website and sign in again. The frontend calls
`is_collection_editor()` and displays quantity controls only when it returns
true. The same function is used by the database update policy, so hiding the
buttons is not the security boundary.

## Review editors

The private table is not exposed through the public REST API. Review it from
SQL Editor:

```sql
select user_id, created_at
from private.collection_editors
order by created_at;
```

## Remove editor access

```sql
delete from private.collection_editors
where user_id = 'AUTH-USER-UUID-HERE';
```

Revocation takes effect on the next permission check. The user may remain a
valid Supabase Auth user but will have view-only access.

## Quantity history

The consolidated Riftbound schema migration creates the audit table and trigger.
Supabase records every quantity change with its card name, collector
number, set ID, previous value, new value, user ID, and timestamp. The
authorized editor sees the latest 30 days for the open set in the tracker; it
is not public.

