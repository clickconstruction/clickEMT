-- The Division assignment (ICS 204): what a division is to do in words, its special instructions,
-- its radio channel and its supervisor. The log calls a zone a Division, as ICS does.

alter table public.ic_zones add column if not exists work_assignment text not null default '';
alter table public.ic_zones add column if not exists instructions text not null default '';
alter table public.ic_zones add column if not exists channel text not null default '';
alter table public.ic_zones add column if not exists supervisor text not null default '';

create or replace function public.ic_log_zone() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', 'Division ' || new.code || ' drawn, priority ' || new.priority, 'ic_zones', new.id::text);
    return new;
  end if;
  if new.status = 'cleared' and old.status <> 'cleared' then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'clear',
            new.code || ' marked clear (' || new.structures || ' of ' || new.structures || ')'
            || case when coalesce((new.marking ->> 'victims')::int, 0) > 0 then ', ' || (new.marking ->> 'victims') || ' found needing help' else '' end,
            'ic_zones', new.id::text);
  elsif new.cleared <> old.cleared and new.status <> 'cleared' then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'clear', 'Structure cleared in ' || new.code || ' (' || new.cleared || ' of ' || new.structures || ')', 'ic_zones', new.id::text);
  elsif new.status = 'open' and old.status = 'cleared' then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', new.code || ' reopened', 'ic_zones', new.id::text);
  end if;
  if new.priority <> old.priority then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', new.code || ' priority set to ' || new.priority, 'ic_zones', new.id::text);
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops',
            case when new.assigned_to is null then new.code || ' released from ' || public.ic_unit_label(new.incident_id, old.assigned_to)
                 else new.code || ' assigned to ' || public.ic_unit_label(new.incident_id, new.assigned_to) end,
            'ic_zones', new.id::text);
  end if;
  if (new.code, new.name) is distinct from (old.code, old.name) then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', 'Division ' || old.code || ' is now ' || new.code || case when new.name <> '' then ' · ' || new.name else '' end, 'ic_zones', new.id::text);
  end if;
  if (new.work_assignment, new.instructions, new.channel, new.supervisor) is distinct from (old.work_assignment, old.instructions, old.channel, old.supervisor) then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', new.code || ' assignment updated'
            || case when new.channel <> old.channel then ', channel ' || coalesce(nullif(new.channel, ''), 'cleared') else '' end
            || case when new.supervisor <> old.supervisor then ', supervisor ' || coalesce(nullif(new.supervisor, ''), 'cleared') else '' end,
            'ic_zones', new.id::text);
  end if;
  return new;
end $$;
