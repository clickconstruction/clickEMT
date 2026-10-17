-- Accountability by name (v29). A PAR answered with a number alone, even when the unit's people were on
-- record by name, so a missing person was reported as "someone"; a unit that checked in without names had
-- no head count at all, so its PAR started at 1; a person's rank, agency, qualifications and notes could
-- not be corrected once added.
--
-- A PAR answer names who is missing (ic_message_acks.missing, [{id, name}]) with the count still
-- accounted for; the emergency alert a missing report raises names them too (ic_alerts.note). The head
-- count is never unknown: the people named at check-in plus the unnamed ones with them
-- (ic_members.unnamed_count), and with no names the number typed stands. Edits to a person's agency and
-- notes are logged like the other changes.

-- ---------------------------------------------------------------- the PAR names who is missing

alter table public.ic_message_acks add column if not exists missing jsonb not null default '[]'::jsonb;   -- [{id, name}] of the unit's people reported missing on a PAR
alter table public.ic_alerts add column if not exists note text not null default '';                   -- "Missing: Okafor" on an alert a PAR raised

-- the names in a missing list, "Okafor, Patel"
create or replace function public.ic_missing_names(p jsonb) returns text language sql immutable as $$
  select coalesce((select string_agg(coalesce(x ->> 'name', 'someone'), ', ') from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) x), '');
$$;

create or replace function public.ic_log_ack() returns trigger
language plpgsql security definer set search_path = public as $$
declare m public.ic_messages; names text := public.ic_missing_names(new.missing);
begin
  select * into m from public.ic_messages where id = new.message_id;
  insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
  values (new.incident_id, new.user_id,
          case when m.kind = 'safety' then 'safety' when m.kind = 'par' then 'par' else 'msg' end,
          public.ic_unit_label(new.incident_id, new.user_id)
          || case when m.kind = 'par' then
                    case when names <> '' then ': Missing someone: ' || names || case when new.count is not null then ' (' || new.count || ' accounted for)' else '' end
                         else ': ' || coalesce(nullif(new.reply, ''), 'answered') || case when new.count is not null then ' (' || new.count || ')' else '' end end
                  else ' acknowledged ' || public.ic_unit_label(new.incident_id, m.from_user) || case when nullif(new.reply, '') is null then '' else ': ' || new.reply end end,
          'ic_messages', new.message_id::text);
  return new;
end $$;

create or replace function public.ic_log_alert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, new.user_id, 'help', 'EMERGENCY, ' || public.ic_unit_label(new.incident_id, new.user_id) || ' needs help in ' || public.ic_zone_code(new.zone_id)
            || case when coalesce(new.note, '') <> '' then ': ' || new.note else '' end, 'ic_alerts', new.id::text);
  elsif new.stood_down_at is not null and old.stood_down_at is null then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, new.user_id, 'help', public.ic_unit_label(new.incident_id, new.user_id) || ' stood down, all OK', 'ic_alerts', new.id::text);
  elsif new.acknowledged_at is not null and old.acknowledged_at is null then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, new.acknowledged_by, 'help', 'Operations acknowledged the emergency from ' || public.ic_unit_label(new.incident_id, new.user_id), 'ic_alerts', new.id::text);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- the head count is never unknown

alter table public.ic_members add column if not exists unnamed_count integer check (unnamed_count is null or unnamed_count between 0 and 99);   -- people with the unit beyond the ones named

-- Before: the head count is the named people checked in plus the unnamed ones; with nothing on record
-- and no unnamed count the number typed stands. Then the clock, the roles and the stamps as in 0020.
create or replace function public.ic_member_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare total integer; n integer; names text;
begin
  if tg_op = 'UPDATE' then
    if (new.role is distinct from old.role or new.removed_at is distinct from old.removed_at)
       and coalesce(current_setting('ic.join', true), '') <> '1' and coalesce(current_setting('ic.system', true), '') <> '1'
       and not public.ic_is_ops(new.incident_id) then
      raise exception 'Only Operations changes a member''s role or removes one';
    end if;
    if new.removed_at is not null and old.removed_at is null then
      new.removed_by := coalesce(auth.uid(), new.removed_by);
      new.status := 'checked_out';
    elsif new.removed_at is null and old.removed_at is not null then
      new.removed_by := null;
      new.status := 'available';
    end if;
  end if;
  if new.role <> 'ops' and new.user_id = (select i.created_by from public.ic_incidents i where i.id = new.incident_id) then
    raise exception 'The person who opened the incident is always Operations';
  end if;
  if new.removed_at is not null and new.user_id = (select i.created_by from public.ic_incidents i where i.id = new.incident_id) then
    raise exception 'The person who opened the incident cannot be removed from it';
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.status_at := now();
    if new.status = 'checked_out' then new.checked_out_at := now(); new.in_water_since := null; else new.checked_out_at := null; end if;
    if new.status <> 'out_of_service' then new.status_note := ''; end if;
  end if;
  if new.in_water_since is not null and new.in_water_since > now() + interval '5 minutes' then new.in_water_since := now(); end if;
  select count(*), count(*) filter (where p.checked_out_at is null), string_agg(p.name, ', ' order by p.checked_in_at, p.created_at) filter (where p.checked_out_at is null)
    into total, n, names
    from public.ic_people p where p.incident_id = new.incident_id and p.user_id = new.user_id and p.archived_at is null;
  if total > 0 then new.crew := names; end if;
  if total > 0 or new.unnamed_count is not null then new.crew_count := coalesce(n, 0) + coalesce(new.unnamed_count, 0); end if;
  return new;
end $$;

-- Check-in: "How many with you?" is the whole count; the names come off it and the rest are the unnamed.
-- With no count, the names alone (as before); with no names, the number stands.
create or replace function public.ic_join(p_code text, p_role text, p_unit_name text, p_crew text default null, p_crew_count integer default null, p_agency text default null, p_people jsonb default null, p_kind text default null)
returns public.ic_incidents
language plpgsql security definer set search_path = public as $$
declare
  r public.ic_incidents;
  m public.ic_members;
  person jsonb;
  nm text;
  quals text[];
  existing uuid;
  n integer;
  named integer := 0;
  unnamed integer;
  pr public.ic_profiles;
  k text := nullif(trim(coalesce(p_kind, '')), '');
  jc text := upper(trim(coalesce(p_code, '')));
  new_role text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_role not in ('ops', 'unit') then raise exception 'role must be ops or unit'; end if;
  select i.* into r from public.ic_incidents i join public.ic_ops_codes o on o.incident_id = i.id where o.code = jc and i.status = 'active';
  if found then
    new_role := 'ops';
  else
    select * into r from public.ic_incidents i where i.code = jc and i.status = 'active';
    if not found then raise exception 'No active incident has the code %', jc; end if;
    if p_role = 'ops' then raise exception 'That is the join code for field units. Operations joins with the Operations code, shown on the Operations home panel.'; end if;
    new_role := 'unit';
  end if;
  select * into m from public.ic_members where incident_id = r.id and user_id = auth.uid();
  if m.removed_at is not null then raise exception 'You were removed from % by Operations. Only Operations can put you back.', r.name; end if;
  if auth.uid() = r.created_by then new_role := 'ops'; end if;
  if new_role = 'unit' and not public.ic_profile_ready(auth.uid()) then raise exception 'Say who you are first: your name and your phone'; end if;
  perform set_config('ic.quiet', '1', true);
  perform set_config('ic.join', '1', true);
  insert into public.ic_members (incident_id, user_id, role, unit_name, crew, crew_count, agency, status, status_at, checked_out_at, kind)
  values (r.id, auth.uid(), new_role, case when new_role = 'ops' then coalesce(nullif(trim(p_unit_name), ''), 'Operations') else nullif(trim(p_unit_name), '') end, nullif(trim(p_crew), ''), p_crew_count, coalesce(trim(p_agency), ''), 'available', now(), null, coalesce(k, ''))
  on conflict (incident_id, user_id) do update
    set role = excluded.role,
        unit_name = coalesce(excluded.unit_name, ic_members.unit_name),
        crew = coalesce(excluded.crew, ic_members.crew),
        crew_count = coalesce(excluded.crew_count, ic_members.crew_count),
        agency = case when excluded.agency <> '' then excluded.agency else ic_members.agency end,
        kind = case when excluded.kind <> '' then excluded.kind else ic_members.kind end,
        status = case when ic_members.status = 'checked_out' then 'available' else ic_members.status end,
        status_at = case when ic_members.status = 'checked_out' then now() else ic_members.status_at end,
        checked_out_at = null;
  perform set_config('ic.quiet', '', true);   -- ic.join stays on through the roster: these names were counted off already
  if p_people is not null and jsonb_typeof(p_people) = 'array' then
    for person in select * from jsonb_array_elements(p_people) loop
      nm := trim(coalesce(person ->> 'name', ''));
      if nm = '' then continue; end if;
      quals := coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(person -> 'qualifications') = 'array' then person -> 'qualifications' else '[]'::jsonb end)), '{}'::text[]);
      select p.id into existing from public.ic_people p
        where p.incident_id = r.id and p.user_id = auth.uid() and p.archived_at is null and lower(p.name) = lower(nm)
        order by p.checked_in_at desc limit 1;
      if existing is not null then
        update public.ic_people set checked_out_at = null, role = coalesce(nullif(trim(person ->> 'role'), ''), role), qualifications = quals,
                                    notes = coalesce(nullif(person ->> 'notes', ''), notes)
          where id = existing;
      else
        insert into public.ic_people (incident_id, user_id, name, role, qualifications, notes, checked_in_at, created_at)
        values (r.id, auth.uid(), nm, coalesce(trim(person ->> 'role'), ''), quals, coalesce(person ->> 'notes', ''), clock_timestamp(), clock_timestamp());   -- stamped in the order typed, so the crew reads in that order
      end if;
    end loop;
  end if;
  perform set_config('ic.join', '', true);
  -- "How many with you?" is the whole crew: everyone on record for the unit comes off it, the rest are unnamed
  if p_crew_count is not null then
    select count(*) into named from public.ic_people p where p.incident_id = r.id and p.user_id = auth.uid() and p.archived_at is null and p.checked_out_at is null;
    unnamed := greatest(0, p_crew_count - named);
    update public.ic_members set unnamed_count = unnamed where incident_id = r.id and user_id = auth.uid();
  end if;
  select crew_count into n from public.ic_members where incident_id = r.id and user_id = auth.uid();
  select * into pr from public.ic_profiles where user_id = auth.uid();
  insert into public.ic_events (incident_id, user_id, kind, text)
  values (r.id, auth.uid(), 'ops', public.ic_unit_label(r.id, auth.uid()) || case when new_role = 'unit' and k is not null then ', ' || public.ic_kind_text(k) else '' end
          || case when new_role = 'ops' then ' joined as Operations with the Operations code' else ' checked in' end
          || case when pr.full_name is not null and pr.full_name <> '' then ' as ' || pr.full_name || case when pr.phone <> '' then ', ' || pr.phone else '' end
                  || case when pr.photo_path is null and pr.licence_number = '' then ', identity not given'
                       else case pr.id_source when 'scan' then ', licence scanned' when 'photo' then ', licence photographed' when 'typed' then ', licence typed' else '' end end
                  || case when pr.verified_at is not null then ', verified' else '' end else '' end
          || case when n is not null and (p_people is not null or p_crew_count is not null) then ' with ' || n || case when n = 1 then ' person' else ' people' end else '' end);
  return r;
end $$;
grant execute on function public.ic_join(text, text, text, text, integer, text, jsonb, text) to authenticated;

-- ---------------------------------------------------------------- a person's edits are logged

create or replace function public.ic_person_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  unit text := public.ic_unit_label(new.incident_id, new.user_id);
  quals text := case when cardinality(new.qualifications) > 0 then ' (' || public.ic_qual_text(new.qualifications) || ')' else '' end;
  line text := null;
begin
  if tg_op = 'INSERT' then
    if new.archived_at is null then
      line := new.name || quals || ' checked in with ' || unit;
      -- naming one of the people counted but not yet named: the head count stays, the unnamed are one fewer
      if coalesce(current_setting('ic.join', true), '') <> '1' then
        update public.ic_members set unnamed_count = unnamed_count - 1 where incident_id = new.incident_id and user_id = new.user_id and coalesce(unnamed_count, 0) > 0;
      end if;
    end if;
  elsif new.archived_at is not null and old.archived_at is null then line := new.name || ' removed from ' || unit;
  elsif new.archived_at is null and old.archived_at is not null then line := new.name || quals || ' put back on ' || unit;
  elsif new.archived_at is not null then line := null;   -- changes to an archived person are not news
  elsif new.user_id <> old.user_id then line := new.name || ' moved from ' || public.ic_unit_label(new.incident_id, old.user_id) || ' to ' || unit;
  elsif new.checked_out_at is not null and old.checked_out_at is null then line := new.name || ' checked out from ' || unit;
  elsif new.checked_out_at is null and old.checked_out_at is not null then line := new.name || quals || ' checked back in with ' || unit;
  elsif (new.name, new.role, new.qualifications, new.agency, new.notes) is distinct from (old.name, old.role, old.qualifications, old.agency, old.notes) then
    line := new.name || quals || ' updated on ' || unit
            || case when new.name <> old.name then ' (was ' || old.name || ')' else '' end
            || case when new.role <> old.role then ', ' || coalesce(nullif(new.role, ''), 'no rank or role') else '' end
            || case when new.agency <> old.agency then ', ' || coalesce(nullif(new.agency, ''), 'the unit''s agency') else '' end
            || case when new.notes <> old.notes then ', notes changed' else '' end;
  end if;
  if line is not null and not public.ic_quiet() then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'status', line, 'ic_people', new.id::text);
  end if;
  perform public.ic_sync_crew(new.incident_id, new.user_id);
  if tg_op = 'UPDATE' and new.user_id <> old.user_id then perform public.ic_sync_crew(new.incident_id, old.user_id); end if;
  return new;
end $$;
