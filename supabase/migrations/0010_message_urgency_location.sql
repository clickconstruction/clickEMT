-- A message from the field says how urgent it is, in the four words Operations acts on, and can
-- carry the spot it is about: the unit's position when it was sent, nudged to the exact point.

alter table public.ic_messages add column if not exists urgency text not null default '';
alter table public.ic_messages drop constraint if exists ic_messages_urgency_check;
alter table public.ic_messages add constraint ic_messages_urgency_check check (urgency in ('', 'now', 'nightfall', 'tomorrow', 'blocking'));
alter table public.ic_messages add column if not exists lat double precision;
alter table public.ic_messages add column if not exists lng double precision;

-- the same words as URGENCY in js/shared/rules.js, lower case for the log line
create or replace function public.ic_urgency_label(p text) returns text
language sql immutable as $$
  select case p when 'now' then 'act on now' when 'nightfall' then 'before nightfall' when 'tomorrow' then 'can wait until tomorrow' when 'blocking' then 'blocks further operations' else '' end
$$;

create or replace function public.ic_log_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
  values (new.incident_id, new.from_user,
          case when new.kind = 'safety' then 'safety' when new.kind = 'par' then 'par' else 'msg' end,
          case when new.kind = 'safety' then 'SAFETY MESSAGE, ' when new.kind = 'par' then 'PAR, ' else '' end
          || public.ic_unit_label(new.incident_id, new.from_user) || ' to ' || coalesce(nullif(new.to_label, ''), 'everyone')
          || case when new.urgency <> '' then ' (' || public.ic_urgency_label(new.urgency) || ')' else '' end
          || ': ' || new.text
          || case when new.lat is not null and new.lng is not null then ' · location attached' else '' end,
          'ic_messages', new.id::text);
  return new;
end $$;
