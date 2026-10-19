-- Tell the base: one scale, a stuck flag, fewer words (v74). A message's or a request's urgency is one of three steps
-- on one bar, now / nightfall / tomorrow (the codes stay; the words are Now · Before dark · Tomorrow, ic_step_label
-- here and URGENCY_STEPS in rules.js), and "blocks further operations" is no longer a step: it is the `blocking` flag
-- under the scale on both sheets, read as "stuck" on the base and in the 214 (ic_urgency_words / urgencyWords).
-- Hazards keep their four values, their words (ic_urgency_label) and their chips until their own walk.

alter table public.ic_messages add column if not exists blocking boolean not null default false;
alter table public.ic_requests add column if not exists blocking boolean not null default false;

-- the rows that said it the old way say it the new way: a blocking message is a Now message with the flag
update public.ic_messages set urgency = 'now', blocking = true where urgency = 'blocking';
alter table public.ic_messages drop constraint if exists ic_messages_urgency_check;
alter table public.ic_messages add constraint ic_messages_urgency_check check (urgency in ('', 'now', 'nightfall', 'tomorrow'));
-- ic_requests already allows the three (0015); ic_hazards keeps its four (0025)

-- the step's words, as URGENCY_STEPS in rules.js says them, lower case for the 214
create or replace function public.ic_step_label(p text) returns text
language sql immutable as $$
  select case p when 'now' then 'now' when 'nightfall' then 'before dark' when 'tomorrow' then 'tomorrow' else '' end
$$;
-- the step and the flag together: 'now, stuck' / 'before dark' / 'stuck' / '' (urgencyWords in rules.js)
create or replace function public.ic_urgency_words(p text, p_blocking boolean) returns text
language sql immutable as $$
  select concat_ws(', ', nullif(public.ic_step_label(p), ''), case when coalesce(p_blocking, false) then 'stuck' end)
$$;

-- 0010's body, the bracket rebuilt from the step and the flag
create or replace function public.ic_log_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  w text := public.ic_urgency_words(new.urgency, new.blocking);
begin
  insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
  values (new.incident_id, new.from_user,
          case when new.kind = 'safety' then 'safety' when new.kind = 'par' then 'par' else 'msg' end,
          case when new.kind = 'safety' then 'SAFETY MESSAGE, ' when new.kind = 'par' then 'PAR, ' else '' end
          || public.ic_unit_label(new.incident_id, new.from_user) || ' to ' || coalesce(nullif(new.to_label, ''), 'everyone')
          || case when w <> '' then ' (' || w || ')' else '' end
          || ': ' || new.text
          || case when new.lat is not null and new.lng is not null then ' · location attached' else '' end,
          'ic_messages', new.id::text);
  return new;
end $$;

-- 0015's body, the words after the division from the step and the flag
create or replace function public.ic_request_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who text := public.ic_unit_label(new.incident_id, new.user_id);
  z text := (select code from public.ic_zones where id = new.zone_id);
  urg text := public.ic_urgency_words(new.urgency, new.blocking);
begin
  if tg_op = 'INSERT' then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, new.user_id, 'request', who || ' asked for ' || public.ic_request_line(new)
            || case when z is not null then ' for ' || z else '' end || case when urg <> '' then ', ' || urg else '' end
            || case when new.note <> '' then ': ' || new.note else '' end, 'ic_requests', new.id::text);
  elsif new.status is distinct from old.status then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'request', 'Request for ' || public.ic_request_line(new) || ' (' || who || ') '
            || case new.status when 'approved' then 'approved' when 'ordered' then 'ordered' when 'filled' then 'filled' when 'declined' then 'could not be filled' else 'asked again' end
            || case when new.answer <> '' then ': ' || new.answer else '' end, 'ic_requests', new.id::text);
  elsif new.answer is distinct from old.answer and new.answer <> '' then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'request', 'Request for ' || public.ic_request_line(new) || ' (' || who || '): ' || new.answer, 'ic_requests', new.id::text);
  end if;
  return new;
end $$;
