-- One head count at a time, and a missing person who is found (v38). A PAR asks "is everyone accounted
-- for now", so a new one closes the one before it: the old PAR is marked superseded (its answers stay),
-- the bar and the phone show one head count, and a line says who had still to answer when it closed.
-- A person reported missing on a PAR is marked found by the unit that reported them or by Operations
-- (ic_mark_found), which stamps the entry in the answer's missing list and writes a notable line; a
-- stand-down alone never clears a missing report.

alter table public.ic_messages add column if not exists superseded_by uuid references public.ic_messages(id) on delete set null;   -- the PAR that closed this one
alter table public.ic_messages add column if not exists superseded_at timestamptz;

-- who has still to answer a message, by unit label
create or replace function public.ic_waiting_names(p_message uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(string_agg(public.ic_unit_label(m.incident_id, u), ', '), '')
  from public.ic_messages m, unnest(m.to_users) u
  where m.id = p_message and not exists (select 1 from public.ic_message_acks a where a.message_id = m.id and a.user_id = u);
$$;

create or replace function public.ic_par_supersede() returns trigger
language plpgsql security definer set search_path = public as $$
declare o record; waiting text;
begin
  for o in select id from public.ic_messages where incident_id = new.incident_id and kind = 'par' and id <> new.id and superseded_by is null and created_at <= new.created_at loop
    waiting := public.ic_waiting_names(o.id);
    update public.ic_messages set superseded_by = new.id, superseded_at = now() where id = o.id;
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, new.from_user, 'par', 'Earlier PAR closed by the new one' || case when waiting <> '' then ', still waiting on ' || waiting else ', everyone had answered' end, 'ic_messages', o.id::text);
  end loop;
  return new;
end $$;
drop trigger if exists ic_messages_par on public.ic_messages;
create trigger ic_messages_par after insert on public.ic_messages for each row when (new.kind = 'par') execute function public.ic_par_supersede();

-- Found: the unit that reported someone missing, or Operations, says they are found. p_person picks the
-- entry by id, p_name by name, neither marks every entry still missing; an answer that named nobody gets
-- one nameless entry so the report closes the same way.
create or replace function public.ic_mark_found(p_message uuid, p_user uuid, p_person uuid default null, p_name text default null)
returns public.ic_message_acks
language plpgsql security definer set search_path = public as $$
declare a public.ic_message_acks; me uuid := auth.uid(); n jsonb := '[]'::jsonb; x jsonb; hit boolean := false; names text := '';
begin
  select * into a from public.ic_message_acks where message_id = p_message and user_id = p_user;
  if a.message_id is null then raise exception 'No such head count answer'; end if;
  if a.reply <> 'Missing someone' then raise exception 'That answer reported nobody missing'; end if;
  if not (p_user = me or public.ic_is_ops(a.incident_id)) then raise exception 'Only the unit that reported them or Operations marks someone found'; end if;
  if jsonb_typeof(a.missing) <> 'array' or jsonb_array_length(a.missing) = 0 then
    n := jsonb_build_array(jsonb_build_object('id', null, 'name', null, 'found_at', now(), 'found_by', me)); hit := true; names := 'The missing person';
  else
    for x in select value from jsonb_array_elements(a.missing) loop
      if (x ->> 'found_at') is null and ((p_person is null and p_name is null) or (p_person is not null and x ->> 'id' = p_person::text) or (p_name is not null and x ->> 'name' = p_name)) then
        x := x || jsonb_build_object('found_at', now(), 'found_by', me); hit := true;
        names := names || case when names = '' then '' else ', ' end || coalesce(nullif(x ->> 'name', ''), 'the missing person');
      end if;
      n := n || jsonb_build_array(x);
    end loop;
  end if;
  if not hit then raise exception 'Nobody by that name is reported missing on that answer'; end if;
  update public.ic_message_acks set missing = n where message_id = p_message and user_id = p_user returning * into a;
  insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id, notable)
  values (a.incident_id, me, 'par', names || ' found, reported by ' || public.ic_unit_label(a.incident_id, me), 'ic_messages', p_message::text, true);
  return a;
end $$;
grant execute on function public.ic_mark_found(uuid, uuid, uuid, text) to authenticated;
