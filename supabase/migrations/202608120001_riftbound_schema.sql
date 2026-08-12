create table if not exists public.riftbound_card_main (
  id text primary key,
  set_id text not null,
  sort_order integer not null,
  group_name text not null default 'Ungrouped',
  card_name text not null default '',
  collector_number text not null default '',
  variant text not null default '',
  source text not null default '',
  price text not null default '',
  status text not null default '',
  image_url text not null default '',
  quantity integer not null default 0 check (quantity >= 0),
  unique (set_id, sort_order)
);

create index if not exists riftbound_card_main_set_id_idx
  on public.riftbound_card_main (set_id, sort_order);

alter table public.riftbound_card_main enable row level security;
drop policy if exists "Riftbound cards are publicly readable" on public.riftbound_card_main;
create policy "Riftbound cards are publicly readable"
  on public.riftbound_card_main for select to anon, authenticated using (true);
drop policy if exists "Editors update Riftbound quantities" on public.riftbound_card_main;
create policy "Editors update Riftbound quantities"
  on public.riftbound_card_main for update to authenticated
  using ((select public.is_collection_editor()))
  with check ((select public.is_collection_editor()));

revoke all on public.riftbound_card_main from anon, authenticated;
grant select on public.riftbound_card_main to anon, authenticated;
grant update on public.riftbound_card_main to authenticated;

create table if not exists public.riftbound_card_quantity_history (
  id bigint generated always as identity primary key,
  card_id text not null references public.riftbound_card_main(id) on delete cascade,
  set_id text not null,
  card_name text not null default '',
  collector_number text not null default '',
  previous_quantity integer not null,
  new_quantity integer not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists riftbound_card_quantity_history_set_changed_at_idx
  on public.riftbound_card_quantity_history (set_id, changed_at desc);

alter table public.riftbound_card_quantity_history enable row level security;
revoke all on public.riftbound_card_quantity_history from public, anon, authenticated;
grant select on public.riftbound_card_quantity_history to authenticated;
drop policy if exists "Editors read Riftbound quantity history" on public.riftbound_card_quantity_history;
create policy "Editors read Riftbound quantity history"
  on public.riftbound_card_quantity_history for select to authenticated
  using ((select public.is_collection_editor()));

create or replace function public.record_riftbound_quantity_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.quantity is distinct from old.quantity then
    insert into public.riftbound_card_quantity_history
      (card_id, set_id, card_name, collector_number, previous_quantity, new_quantity, changed_by)
    values
      (new.id, new.set_id, new.card_name, new.collector_number,
       old.quantity, new.quantity, auth.uid());
  end if;
  return new;
end;
$$;

revoke all on function public.record_riftbound_quantity_change() from public;
drop trigger if exists record_riftbound_quantity_history on public.riftbound_card_main;
create trigger record_riftbound_quantity_history
  after update of quantity on public.riftbound_card_main
  for each row execute function public.record_riftbound_quantity_change();
