-- Match the other sets' base checklist grouping without changing ownership.
update public.riftbound_card_main
set group_name = 'Base set'
where set_id = 'radiance' and group_name is distinct from 'Base set';
