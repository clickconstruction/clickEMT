-- People and tags, phase 1 (v55): a wristband with a QR code per person. A band is an id and nothing else
-- (ic_tags: a number printed on it and a code in the QR, no name), printed from the base in sheets and
-- given to a responder (ic_people) or a sheltered person (ic_evacuees) by scanning it. A scan is a "seen"
-- record (ic_seen): what the scan meant (checking in, entering or leaving a division, boarding a run, at
-- the shelter door, a head count), where the phone was, when, by whom. Last seen is a record, never
-- "is at". A band is voided, never deleted; a sheltered person's band is voided with their name when the
-- incident's personal records clear by rule. A PAR answer may say how many were scanned.

-- ---------------------------------------------------------------- the bands
create table if not exists public.ic_tags (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.ic_incidents(id) on delete cascade,
  number integer not null check (number between 1 and 99999),        -- printed on the band: "Band 013"
  code text not null unique,                                         -- in the QR: CED-013-K2PQ (the join code's first three letters, the number, four random)
  kind text not null default '' check (kind in ('', 'responder', 'evacuee')),   -- '' until it is on someone
  person_id uuid references public.ic_people(id) on delete set null,
  evacuee_id uuid references public.ic_evacuees(id) on delete set null,
  issued_at timestamptz,
  issued_by uuid references auth.users(id),
  voided_at timestamptz,
  voided_by uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (incident_id, number)
);
create index if not exists ic_tags_incident on public.ic_tags(incident_id);
create index if not exists ic_tags_person on public.ic_tags(person_id);
create index if not exists ic_tags_evacuee on public.ic_tags(evacuee_id);

-- ---------------------------------------------------------------- the scans
create table if not exists public.ic_seen (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.ic_incidents(id) on delete cascade,
  tag_id uuid not null references public.ic_tags(id),
  kind text not null check (kind in ('check_in', 'enter', 'leave', 'board', 'arrive', 'par')),
  at timestamptz not null default now(),
  lat double precision,
  lng double precision,
  zone_id uuid references public.ic_zones(id) on delete set null,
  facility_id uuid references public.ic_facilities(id) on delete set null,
  transport_id uuid references public.ic_transports(id) on delete set null,
  message_id uuid references public.ic_messages(id) on delete set null,   -- the PAR a scan answers
  seen_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists ic_seen_incident on public.ic_seen(incident_id, at desc);
create index if not exists ic_seen_tag on public.ic_seen(tag_id, at desc);

alter table public.ic_message_acks add column if not exists scanned integer check (scanned is null or scanned between 0 and 999);   -- how many of the unit's people were scanned on this PAR

-- ---------------------------------------------------------------- the words (bandLabel, seenWords in rules.js say the same)
create or replace function public.ic_band_label(p_number integer) returns text language sql immutable as $$
  select 'Band ' || lpad(p_number::text, 3, '0');
$$;
create or replace function public.ic_seen_words(p_kind text, p_zone uuid, p_facility uuid, p_transport uuid) returns text
language sql stable security definer set search_path = public as $$
  select case p_kind
    when 'check_in' then 'checking in'
    when 'enter' then 'entering ' || coalesce((select z.code from public.ic_zones z where z.id = p_zone), 'a division')
    when 'leave' then 'leaving ' || coalesce((select z.code from public.ic_zones z where z.id = p_zone), 'a division')
    when 'board' then 'boarding ' || coalesce((select public.ic_transport_label(t.kind, t.label) from public.ic_transports t where t.id = p_transport), 'a run')
    when 'arrive' then 'at ' || coalesce(public.ic_place_text(p_facility), 'the shelter door')
    when 'par' then 'on the PAR'
    else p_kind end;
$$;
-- who a band is on: "Okafor (Unit 1)", "Garza, family of 3", or null
create or replace function public.ic_tag_who(t public.ic_tags) returns text language sql stable security definer set search_path = public as $$
  select coalesce((select p.name || ' (' || public.ic_unit_label(p.incident_id, p.user_id) || ')' from public.ic_people p where p.id = t.person_id),
                  (select public.ic_evacuee_who(e.label, e.count) from public.ic_evacuees e where e.id = t.evacuee_id));
$$;

-- ---------------------------------------------------------------- printing: Operations makes a sheet of bands
create or replace function public.ic_print_bands(p_incident uuid, p_count integer default 24) returns setof public.ic_tags
language plpgsql security definer set search_path = public as $$
declare
  inc public.ic_incidents;
  prefix text;
  n integer;
  first integer;
  i integer;
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  rnd text;
  cnt integer := least(greatest(coalesce(p_count, 24), 1), 200);
begin
  if not public.ic_is_ops(p_incident) then raise exception 'Only Operations prints bands'; end if;
  select * into inc from public.ic_incidents where id = p_incident;
  prefix := upper(substr(inc.code, 1, 3));
  select coalesce(max(number), 0) into n from public.ic_tags where incident_id = p_incident;
  first := n + 1;
  for i in 1..cnt loop
    n := n + 1;
    loop
      rnd := '';
      while length(rnd) < 4 loop rnd := rnd || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1); end loop;
      exit when not exists (select 1 from public.ic_tags where code = prefix || '-' || lpad(n::text, 3, '0') || '-' || rnd);
    end loop;
    insert into public.ic_tags (incident_id, number, code, created_by) values (p_incident, n, prefix || '-' || lpad(n::text, 3, '0') || '-' || rnd, auth.uid());
  end loop;
  insert into public.ic_events (incident_id, user_id, kind, text)
  values (p_incident, auth.uid(), 'ops', cnt || case when cnt = 1 then ' band printed, ' else ' bands printed, ' end || lpad(first::text, 3, '0') || ' to ' || lpad(n::text, 3, '0'));
  return query select * from public.ic_tags where incident_id = p_incident and number between first and n order by number;
end $$;
grant execute on function public.ic_print_bands(uuid, integer) to authenticated;

-- ---------------------------------------------------------------- a band is given once, and voided, never reused
-- The person's own unit, the record's logger or the desk at its place, or Operations give a band; Operations or
-- whoever gave it void it. A band on someone stays on them: a lost one is voided and a new one given.
create or replace function public.ic_tag_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.ic_people; e public.ic_evacuees; who uuid := auth.uid();
begin
  if tg_op = 'UPDATE' then
    if new.incident_id <> old.incident_id or new.number <> old.number or new.code <> old.code then raise exception 'a band keeps its number and its code'; end if;
    new.created_by := old.created_by; new.created_at := old.created_at;
    if new.voided_at is null and old.voided_at is not null then raise exception 'a voided band stays voided; give a new one'; end if;
    if new.voided_at is not null and old.voided_at is null then
      if not (public.ic_is_ops(new.incident_id) or old.issued_by = who or coalesce(current_setting('ic.system', true), '') = '1') then raise exception 'Only Operations or whoever gave the band voids it'; end if;
      new.voided_by := coalesce(who, new.voided_by);
    end if;
    if (new.person_id, new.evacuee_id) is distinct from (old.person_id, old.evacuee_id) then
      if old.person_id is not null or old.evacuee_id is not null then raise exception '% is on someone already; void it and give a new one', public.ic_band_label(old.number); end if;
      if new.voided_at is not null then raise exception '% was voided', public.ic_band_label(old.number); end if;
      if new.person_id is not null and new.evacuee_id is not null then raise exception 'a band is on one person'; end if;
      if new.person_id is not null then
        select * into p from public.ic_people where id = new.person_id and incident_id = new.incident_id;
        if not found then raise exception 'that person is not on this incident'; end if;
        if not (public.ic_is_ops(new.incident_id) or p.user_id = who) then raise exception 'Only the unit this person is on, or Operations, gives them a band'; end if;
        if exists (select 1 from public.ic_tags t where t.person_id = new.person_id and t.voided_at is null and t.id <> new.id) then raise exception '% has a band already; void it first', p.name; end if;
        new.kind := 'responder';
      else
        select * into e from public.ic_evacuees where id = new.evacuee_id and incident_id = new.incident_id;
        if not found then raise exception 'that record is not on this incident'; end if;
        if not (public.ic_is_ops(new.incident_id) or e.logged_by = who or public.ic_is_desk(new.incident_id, e.facility_id)) then raise exception 'Only the desk, the crew that made the record, or Operations gives them a band'; end if;
        if exists (select 1 from public.ic_tags t where t.evacuee_id = new.evacuee_id and t.voided_at is null and t.id <> new.id) then raise exception '% has a band already; void it first', public.ic_evacuee_who(e.label, e.count); end if;
        new.kind := 'evacuee';
      end if;
      new.issued_at := now(); new.issued_by := coalesce(who, new.issued_by);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists ic_tags_before on public.ic_tags;
create trigger ic_tags_before before update on public.ic_tags for each row execute function public.ic_tag_before();

create or replace function public.ic_tag_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare line text; unit text := public.ic_unit_label(new.incident_id, auth.uid());
begin
  if public.ic_quiet() then return new; end if;
  if (new.person_id, new.evacuee_id) is distinct from (old.person_id, old.evacuee_id) and (new.person_id is not null or new.evacuee_id is not null) then
    line := public.ic_band_label(new.number) || ' given to ' || public.ic_tag_who(new) || ' by ' || unit;
  elsif new.voided_at is not null and old.voided_at is null then
    line := public.ic_band_label(new.number) || case when public.ic_tag_who(new) is not null then ' (' || public.ic_tag_who(new) || ')' else '' end || ' voided by ' || unit;
  end if;
  if line is not null then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'seen', line, 'ic_tags', new.id::text);
  end if;
  return new;
end $$;
drop trigger if exists ic_tags_after on public.ic_tags;
create trigger ic_tags_after after update on public.ic_tags for each row execute function public.ic_tag_after();

-- ---------------------------------------------------------------- a scan: the band is this incident's, on someone, not voided
create or replace function public.ic_seen_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare t public.ic_tags;
begin
  if tg_op = 'UPDATE' then raise exception 'a scan is never changed'; end if;
  select * into t from public.ic_tags where id = new.tag_id;
  if not found or t.incident_id <> new.incident_id then raise exception 'that band is from another incident'; end if;
  if t.voided_at is not null then raise exception '% was voided', public.ic_band_label(t.number); end if;
  if t.person_id is null and t.evacuee_id is null then raise exception '% is not on anyone yet', public.ic_band_label(t.number); end if;
  if new.zone_id is not null and not exists (select 1 from public.ic_zones z where z.id = new.zone_id and z.incident_id = new.incident_id) then raise exception 'that division is not on this incident'; end if;
  if new.facility_id is not null and not exists (select 1 from public.ic_facilities f where f.id = new.facility_id and f.incident_id = new.incident_id) then raise exception 'that facility is not on this incident'; end if;
  if new.transport_id is not null and not exists (select 1 from public.ic_transports x where x.id = new.transport_id and x.incident_id = new.incident_id) then raise exception 'that run is not on this incident'; end if;
  if new.message_id is not null and not exists (select 1 from public.ic_messages m where m.id = new.message_id and m.incident_id = new.incident_id and m.kind = 'par') then raise exception 'that is not a PAR of this incident'; end if;
  new.seen_by := coalesce(auth.uid(), new.seen_by);
  new.at := coalesce(new.at, now());
  return new;
end $$;
drop trigger if exists ic_seen_before on public.ic_seen;
create trigger ic_seen_before before insert or update on public.ic_seen for each row execute function public.ic_seen_before();

-- "Okafor (Unit 1) seen entering A-2, by Unit 1" (log kind 'seen', filed under the field)
create or replace function public.ic_seen_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare t public.ic_tags; who text;
begin
  if public.ic_quiet() then return new; end if;
  select * into t from public.ic_tags where id = new.tag_id;
  -- at check-in the unit is said once: "Okafor seen checking in with Unit 1"; elsewhere "Okafor (Unit 1) seen entering A-2, by Unit 1"
  who := case when new.kind = 'check_in' and t.person_id is not null then (select p.name from public.ic_people p where p.id = t.person_id) else coalesce(public.ic_tag_who(t), public.ic_band_label(t.number)) end;
  insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
  values (new.incident_id, auth.uid(), 'seen', who || ' seen ' || public.ic_seen_words(new.kind, new.zone_id, new.facility_id, new.transport_id)
          || case when new.kind = 'check_in' then ' with ' else ', by ' end || public.ic_unit_label(new.incident_id, auth.uid()), 'ic_seen', new.id::text);
  return new;
end $$;
drop trigger if exists ic_seen_after on public.ic_seen;
create trigger ic_seen_after after insert on public.ic_seen for each row execute function public.ic_seen_after();

-- ---------------------------------------------------------------- check-in by band: a person's row at check-in may carry the band's number or code
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
  pr public.ic_profiles;
  k text := nullif(trim(coalesce(p_kind, '')), '');
  jc text := upper(trim(coalesce(p_code, '')));   -- the code as typed
  new_role text;
  band text;
  tg public.ic_tags;
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
  perform set_config('ic.quiet', '1', true);   -- the check-in line below says it all; no "is a boat crew" line of its own
  perform set_config('ic.join', '1', true);    -- the role may change here, by the code
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
  perform set_config('ic.join', '', true);
  perform set_config('ic.quiet', '', true);
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
        insert into public.ic_people (incident_id, user_id, name, role, qualifications, notes)
        values (r.id, auth.uid(), nm, coalesce(trim(person ->> 'role'), ''), quals, coalesce(person ->> 'notes', ''))
        returning id into existing;
      end if;
      -- the band (v55): its number or its code; given to the person, and the scan is the check-in
      band := upper(trim(coalesce(person ->> 'band', '')));
      if band <> '' then
        select * into tg from public.ic_tags t where t.incident_id = r.id and (t.code = band or (band ~ '^[0-9]{1,5}$' and t.number = band::integer));
        if not found then raise exception 'No band % on this incident', band; end if;
        if tg.voided_at is not null then raise exception '% was voided', public.ic_band_label(tg.number); end if;
        if tg.person_id = existing then
          null;   -- their own band again
        elsif tg.person_id is not null or tg.evacuee_id is not null then
          raise exception '% is on % already', public.ic_band_label(tg.number), public.ic_tag_who(tg);
        else
          if exists (select 1 from public.ic_tags t where t.person_id = existing and t.voided_at is null) then raise exception '% has a band already; void it first', nm; end if;
          update public.ic_tags set person_id = existing where id = tg.id;
        end if;
        insert into public.ic_seen (incident_id, tag_id, kind) values (r.id, tg.id, 'check_in');
      end if;
    end loop;
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

-- ---------------------------------------------------------------- the PAR answer counts the scans: "Unit 3: All accounted for (2, 1 scanned)"
create or replace function public.ic_log_ack() returns trigger
language plpgsql security definer set search_path = public as $$
declare m public.ic_messages; names text := public.ic_missing_names(new.missing);
  sc text := case when new.scanned is not null then ', ' || new.scanned || ' scanned' else '' end;
begin
  select * into m from public.ic_messages where id = new.message_id;
  insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
  values (new.incident_id, new.user_id,
          case when m.kind = 'safety' then 'safety' when m.kind = 'par' then 'par' else 'msg' end,
          public.ic_unit_label(new.incident_id, new.user_id)
          || case when m.kind = 'par' then
                    case when names <> '' then ': Missing someone: ' || names || case when new.count is not null then ' (' || new.count || ' accounted for' || sc || ')' else '' end
                         else ': ' || coalesce(nullif(new.reply, ''), 'answered') || case when new.count is not null then ' (' || new.count || sc || ')' else '' end end
                  else ' acknowledged ' || public.ic_unit_label(new.incident_id, m.from_user) || case when nullif(new.reply, '') is null then '' else ': ' || new.reply end end,
          'ic_messages', new.message_id::text);
  return new;
end $$;

-- ---------------------------------------------------------------- the clearing by rule voids the sheltered people's bands with their names
create or replace function public.ic_clear_personal(p_incident uuid) returns public.ic_incidents
language plpgsql security definer set search_path = public as $$
declare
  inc public.ic_incidents;
  u record;
  n_lic integer := 0;
  n_names integer := 0;
  n_bands integer := 0;
begin
  select * into inc from public.ic_incidents where id = p_incident;
  if not found then raise exception 'No such incident'; end if;
  if coalesce(current_setting('ic.system', true), '') <> '1' and not public.ic_is_ops(p_incident) then raise exception 'Only Operations clears personal records'; end if;
  if inc.status <> 'closed' then raise exception 'Close the incident first; its personal records clear 30 days later, or sooner from the picker'; end if;
  if inc.personal_cleared_at is not null then return inc; end if;
  for u in select distinct m.user_id from public.ic_members m where m.incident_id = p_incident
             and not exists (select 1 from public.ic_members o join public.ic_incidents i on i.id = o.incident_id
                             where o.user_id = m.user_id and o.removed_at is null and i.status = 'active') loop
    update public.ic_profiles p
      set licence_number = '', licence_state = '', licence_expires = null, date_of_birth = null, address = '', photo_path = null, id_source = ''
      where p.user_id = u.user_id and (p.licence_number <> '' or p.photo_path is not null or p.date_of_birth is not null or p.address <> '' or p.licence_expires is not null);
    if found then n_lic := n_lic + 1; end if;
    insert into public.ic_id_purge (incident_id, user_id, path)
      select p_incident, u.user_id, o.name from storage.objects o where o.bucket_id = 'ic-ids' and (storage.foldername(o.name))[1] = u.user_id::text
      on conflict do nothing;
  end loop;
  perform set_config('ic.quiet', '1', true);
  perform set_config('ic.system', '1', true);
  update public.ic_evacuees e set label = case when e.count > 1 then 'family of ' || e.count else '' end, note = ''
    where e.incident_id = p_incident and (e.note <> '' or e.label <> case when e.count > 1 then 'family of ' || e.count else '' end);
  get diagnostics n_names = row_count;
  update public.ic_tags t set voided_at = now() where t.incident_id = p_incident and t.kind = 'evacuee' and t.voided_at is null;
  get diagnostics n_bands = row_count;
  perform set_config('ic.quiet', '', true);
  update public.ic_incidents set personal_cleared_at = now() where id = p_incident returning * into inc;
  insert into public.ic_events (incident_id, user_id, kind, text)
  values (p_incident, auth.uid(), 'ops', 'Personal records cleared by rule: ' || n_lic || case when n_lic = 1 then ' licence record' else ' licence records' end
          || ', ' || n_names || case when n_names = 1 then ' sheltered person''s name' else ' sheltered people''s names' end
          || case when n_bands > 0 then ', ' || n_bands || case when n_bands = 1 then ' band voided' else ' bands voided' end else '' end);
  return inc;
end $$;

-- ---------------------------------------------------------------- who may do what
-- Bands are read by members, made by ic_print_bands alone, given and voided by members (the trigger says who may).
-- A scan is written by members (what a phone queued before its removal still lands) and never changed.
alter table public.ic_tags enable row level security;
drop policy if exists ic_tags_select on public.ic_tags;
create policy ic_tags_select on public.ic_tags for select to authenticated using (public.ic_is_member(incident_id));
drop policy if exists ic_tags_update on public.ic_tags;
create policy ic_tags_update on public.ic_tags for update to authenticated using (public.ic_is_member(incident_id)) with check (public.ic_is_member(incident_id));
alter table public.ic_seen enable row level security;
drop policy if exists ic_seen_select on public.ic_seen;
create policy ic_seen_select on public.ic_seen for select to authenticated using (public.ic_is_member(incident_id));
drop policy if exists ic_seen_insert on public.ic_seen;
create policy ic_seen_insert on public.ic_seen for insert to authenticated with check (public.ic_may_write(incident_id, at));

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ic_tags') then
    alter publication supabase_realtime add table public.ic_tags;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ic_seen') then
    alter publication supabase_realtime add table public.ic_seen;
  end if;
end $$;
