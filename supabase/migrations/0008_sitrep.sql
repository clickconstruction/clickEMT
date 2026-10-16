-- The situation report (ICS 209): the counts come from the data, the words come from Operations
-- and live on the period: what happened, what is needed, what the next period looks like.

alter table public.ic_periods add column if not exists sitrep jsonb not null default '{}'::jsonb;

create or replace function public.ic_log_period() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.closed_at is null and (new.ic_name, new.ops_chief, new.safety_officer, new.ends_at) is distinct from (old.ic_name, old.ops_chief, old.safety_officer, old.ends_at) then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.incident_id, auth.uid(), 'ops', 'Operational period ' || new.number || ' updated'
            || case when new.ic_name <> old.ic_name then ', Incident Commander ' || coalesce(nullif(new.ic_name, ''), 'not set') else '' end
            || case when new.ops_chief <> old.ops_chief then ', Operations ' || coalesce(nullif(new.ops_chief, ''), 'not set') else '' end
            || case when new.safety_officer <> old.safety_officer then ', Safety ' || coalesce(nullif(new.safety_officer, ''), 'not set') else '' end);
  end if;
  if tg_op = 'UPDATE' and new.sitrep is distinct from old.sitrep then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.incident_id, auth.uid(), 'ops', 'Situation report updated for operational period ' || new.number);
  end if;
  return new;
end $$;
