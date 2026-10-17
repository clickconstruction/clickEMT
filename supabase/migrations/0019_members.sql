-- Members and roles, and personal records that clear by rule (v27). Anyone holding the printed join
-- card could join as Operations and run the incident; nobody could see or manage who is a member; and
-- licence numbers, dates of birth, home addresses, licence photos and evacuees' names were kept forever.
--
-- Now the join code makes a unit only. Each incident has an Operations code of its own (ic_ops_codes,
-- read by Operations alone, never printed); joining with it makes the member Operations, and New code
-- retires one that leaked. Operations changes a member's role and removes a member (archived, never
-- deleted: removed_at); the person who opened the incident is always Operations. A removed phone keeps
-- its own row in view so it learns it was removed, what it queued before the removal still lands
-- (ic_may_write), and nothing new does. When an incident closes, its personal records clear by rule
-- 30 days later (clear_personal_at): ic_clear_personal blanks the licence, the date of birth, the
-- address and the licence photo of every member who is in no open incident, and reduces the evacuee
-- records to "family of N" with their counts and needs. This is the one deletion in the app, for
-- personal data only, never for work product. pg_cron runs it nightly; the base runs it on open too.

-- ---------------------------------------------------------------- a member can be removed, and put back

alter table public.ic_members add column if not exists removed_at timestamptz;
alter table public.ic_members add column if not exists removed_by uuid references auth.users(id);

-- membership is the live rows: a removed member is on no incident
create or replace function public.ic_is_member(p_incident uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ic_members m where m.incident_id = p_incident and m.user_id = auth.uid() and m.removed_at is null);
$$;

create or replace function public.ic_is_ops(p_incident uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ic_members m where m.incident_id = p_incident and m.user_id = auth.uid() and m.role = 'ops' and m.removed_at is null);
$$;

-- a removed member still sees its own row (the phone shows "You were removed"); nothing else of the incident
drop policy if exists ic_members_select on public.ic_members;
create policy ic_members_select on public.ic_members for select to authenticated using (public.ic_is_member(incident_id) or user_id = auth.uid());

-- What the phone queued before it was removed still lands: a row stamped before the removal is
-- accepted from a removed member, a later one is refused. Each table's own time is the stamp.
create or replace function public.ic_may_write(p_incident uuid, p_at timestamptz) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ic_members m where m.incident_id = p_incident and m.user_id = auth.uid()
                 and (m.removed_at is null or (p_at is not null and p_at < m.removed_at)));
$$;

drop policy if exists ic_photos_insert on public.ic_photos;
create policy ic_photos_insert on public.ic_photos for insert to authenticated with check (user_id = auth.uid() and public.ic_may_write(incident_id, taken_at));
drop policy if exists ic_hazards_insert on public.ic_hazards;
create policy ic_hazards_insert on public.ic_hazards for insert to authenticated with check (user_id = auth.uid() and public.ic_may_write(incident_id, created_at));
drop policy if exists ic_alerts_insert on public.ic_alerts;
create policy ic_alerts_insert on public.ic_alerts for insert to authenticated with check (user_id = auth.uid() and public.ic_may_write(incident_id, created_at));
drop policy if exists ic_positions_write on public.ic_positions;
create policy ic_positions_write on public.ic_positions for insert to authenticated with check (user_id = auth.uid() and public.ic_may_write(incident_id, at));
drop policy if exists ic_events_insert on public.ic_events;
create policy ic_events_insert on public.ic_events for insert to authenticated with check (user_id = auth.uid() and kind = 'note' and public.ic_may_write(incident_id, at));
drop policy if exists ic_messages_insert on public.ic_messages;
create policy ic_messages_insert on public.ic_messages for insert to authenticated with check (from_user = auth.uid() and public.ic_may_write(incident_id, created_at));
drop policy if exists ic_message_acks_insert on public.ic_message_acks;
create policy ic_message_acks_insert on public.ic_message_acks for insert to authenticated with check (user_id = auth.uid() and public.ic_may_write(incident_id, acked_at));
drop policy if exists ic_structures_insert on public.ic_structures;
create policy ic_structures_insert on public.ic_structures for insert to authenticated with check (public.ic_may_write(incident_id, created_at));
drop policy if exists ic_evacuees_insert on public.ic_evacuees;
create policy ic_evacuees_insert on public.ic_evacuees for insert to authenticated with check (public.ic_may_write(incident_id, created_at));
drop policy if exists ic_people_insert on public.ic_people;
create policy ic_people_insert on public.ic_people for insert to authenticated
  with check (public.ic_may_write(incident_id, checked_in_at) and (user_id = auth.uid() or public.ic_is_ops(incident_id)));
drop policy if exists ic_requests_insert on public.ic_requests;
create policy ic_requests_insert on public.ic_requests for insert to authenticated with check (public.ic_may_write(incident_id, created_at) and user_id = auth.uid());

-- ---------------------------------------------------------------- the Operations code

-- read by Operations alone; written only through the functions below, never printed, never on the join card
create table if not exists public.ic_ops_codes (
  incident_id uuid primary key references public.ic_incidents(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
alter table public.ic_ops_codes enable row level security;
drop policy if exists ic_ops_codes_select on public.ic_ops_codes;
create policy ic_ops_codes_select on public.ic_ops_codes for select to authenticated using (public.ic_is_ops(incident_id));
-- no insert, update or delete policy

-- a code of p_len letters that no incident and no Operations code already uses (no 0/O or 1/I)
create or replace function public.ic_make_code(p_len integer) returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  alpha constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
begin
  loop
    select string_agg(substr(alpha, 1 + floor(random() * length(alpha))::int, 1), '') into c from generate_series(1, p_len);
    exit when not exists (select 1 from public.ic_incidents i where i.code = c) and not exists (select 1 from public.ic_ops_codes o where o.code = c);
  end loop;
  return c;
end $$;

create or replace function public.ic_set_ops_code(p_incident uuid, p_by uuid) returns text
language plpgsql volatile security definer set search_path = public as $$
declare c text;
begin
  insert into public.ic_ops_codes (incident_id, code, created_by) values (p_incident, public.ic_make_code(8), p_by)
  on conflict (incident_id) do update set code = excluded.code, created_at = now(), created_by = excluded.created_by
  returning code into c;
  return c;
end $$;

-- every incident gets one as it opens
create or replace function public.ic_incident_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.ic_set_ops_code(new.id, new.created_by);
  return new;
end $$;
drop trigger if exists ic_incidents_ops_code on public.ic_incidents;
create trigger ic_incidents_ops_code after insert on public.ic_incidents for each row execute function public.ic_incident_after_insert();
do $$
declare i record;
begin
  for i in select id, created_by from public.ic_incidents where not exists (select 1 from public.ic_ops_codes o where o.incident_id = ic_incidents.id) loop
    perform public.ic_set_ops_code(i.id, i.created_by);
  end loop;
end $$;

-- Operations retires a code that leaked; the log says so, never the code itself
create or replace function public.ic_new_ops_code(p_incident uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.ic_is_ops(p_incident) then raise exception 'Only Operations replaces the Operations code'; end if;
  c := public.ic_set_ops_code(p_incident, auth.uid());
  insert into public.ic_events (incident_id, user_id, kind, text) values (p_incident, auth.uid(), 'ops', 'Operations code replaced; the old one no longer joins');
  return c;
end $$;
grant execute on function public.ic_new_ops_code(uuid) to authenticated;

-- ---------------------------------------------------------------- the role follows the code

-- The join code makes a unit; the Operations code makes Operations. p_role is what the caller meant:
-- the base, meaning Operations, is told when it holds the units' code instead. A removed member is
-- not let back in by a code; only Operations puts them back. The person who opened the incident
-- stays Operations whatever code they use.
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
        values (r.id, auth.uid(), nm, coalesce(trim(person ->> 'role'), ''), quals, coalesce(person ->> 'notes', ''));
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
grant execute on function public.ic_join(text, text, text, text, integer, text, jsonb, text) to authenticated;

-- ---------------------------------------------------------------- roles and removal are Operations' alone, and logged

-- Before: only Operations (or ic_join, by the code) changes a role or removes; the person who opened
-- the incident is always Operations; a removal ends the hours (checked out) and a restore makes the
-- member available again. Then the stamps and the head count from the people, as before (0013).
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
    if new.status = 'checked_out' then new.checked_out_at := now(); else new.checked_out_at := null; end if;
    if new.status <> 'out_of_service' then new.status_note := ''; end if;
  end if;
  select count(*), count(*) filter (where p.checked_out_at is null), string_agg(p.name, ', ' order by p.checked_in_at, p.created_at) filter (where p.checked_out_at is null)
    into total, n, names
    from public.ic_people p where p.incident_id = new.incident_id and p.user_id = new.user_id and p.archived_at is null;
  if total > 0 then new.crew := names; new.crew_count := n; end if;
  return new;
end $$;

-- After: a removal is one line (the zones go back and the people go out quietly, as on a check-out),
-- a restore is one line, a role change is one line; otherwise the kind line (0016) and the status lines (0015) as before.
create or replace function public.ic_member_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who text := public.ic_unit_label(new.incident_id, new.user_id);
  nm text := (select nullif(p.full_name, '') from public.ic_profiles p where p.user_id = new.user_id);
  loose text := '';
begin
  if new.removed_at is not null and old.removed_at is null then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.incident_id, auth.uid(), 'status', who || case when nm is not null then ' (' || nm || ')' else '' end || ' removed from the incident by Operations');
    update public.ic_zones set assigned_to = null, status = 'open'
      where incident_id = new.incident_id and assigned_to = new.user_id and status = 'active';
    update public.ic_zones set assigned_to = null
      where incident_id = new.incident_id and assigned_to = new.user_id;
    perform set_config('ic.quiet', '1', true);
    update public.ic_people set checked_out_at = now()
      where incident_id = new.incident_id and user_id = new.user_id and archived_at is null and checked_out_at is null;
    perform set_config('ic.quiet', '', true);
    return new;
  elsif new.removed_at is null and old.removed_at is not null then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.incident_id, auth.uid(), 'status', who || case when nm is not null then ' (' || nm || ')' else '' end || ' put back on the incident by Operations');
    return new;
  end if;
  if new.kind is distinct from old.kind and not public.ic_quiet() then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.incident_id, auth.uid(), 'status', who || case when new.kind = '' then ': kind cleared' else ' is a ' || public.ic_kind_text(new.kind) end);
  end if;
  if new.role is distinct from old.role and not public.ic_quiet() then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.incident_id, auth.uid(), 'status',
            case when new.role = 'ops' then coalesce(old.unit_name, 'A unit') || case when nm is not null then ' (' || nm || ')' else '' end || ' is now Operations'
                 else coalesce(nm, 'A member of Operations') || ' is now a unit, ' || coalesce(new.unit_name, 'unnamed') end);
  end if;
  if new.status is distinct from old.status then
    if new.status = 'checked_out' and new.demob is not null then
      select coalesce(string_agg(x, ' · '), '') into loose from jsonb_array_elements_text(coalesce(new.demob -> 'open', '[]'::jsonb)) x;
    end if;
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.incident_id, auth.uid(), 'status',
            case new.status
              when 'available' then who || ' is available' || case when old.status = 'out_of_service' then ', back in service' else '' end
              when 'out_of_service' then who || ' is out of service' || case when new.status_note <> '' then ': ' || new.status_note else '' end
              when 'checked_out' then who || ' checked out'
                || case when loose <> '' then ' · not done: ' || loose else '' end
                || case when new.demob is not null and coalesce(new.demob ->> 'note', '') <> '' then ' · for the next crew: ' || (new.demob ->> 'note') else '' end
              else who || ' is assigned' end);
    if new.status = 'checked_out' then
      update public.ic_zones set assigned_to = null, status = 'open'
        where incident_id = new.incident_id and assigned_to = new.user_id and status = 'active';
      update public.ic_zones set assigned_to = null
        where incident_id = new.incident_id and assigned_to = new.user_id;
      perform set_config('ic.quiet', '1', true);
      update public.ic_people set checked_out_at = now()
        where incident_id = new.incident_id and user_id = new.user_id and archived_at is null and checked_out_at is null;
      perform set_config('ic.quiet', '', true);
    elsif old.status = 'checked_out' and old.checked_out_at is not null then
      perform set_config('ic.quiet', '1', true);
      update public.ic_people set checked_out_at = null
        where incident_id = new.incident_id and user_id = new.user_id and archived_at is null and checked_out_at is not null and checked_out_at >= old.checked_out_at;
      perform set_config('ic.quiet', '', true);
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- personal records clear by rule

alter table public.ic_incidents add column if not exists clear_personal_at timestamptz;     -- when the rule clears them: the close plus 30 days, or later if kept
alter table public.ic_incidents add column if not exists personal_cleared_at timestamptz;   -- when it ran

-- closing starts the clock; reopening stops it
create or replace function public.ic_incident_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'closed' and old.status <> 'closed' and new.clear_personal_at is null and new.personal_cleared_at is null then
    new.clear_personal_at := now() + interval '30 days';
  elsif new.status = 'active' and old.status = 'closed' and new.personal_cleared_at is null then
    new.clear_personal_at := null;
  end if;
  return new;
end $$;
drop trigger if exists ic_incidents_before on public.ic_incidents;
create trigger ic_incidents_before before update on public.ic_incidents for each row execute function public.ic_incident_before();

create or replace function public.ic_log_incident() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.boundary is distinct from old.boundary then
    insert into public.ic_events (incident_id, user_id, kind, text) values (new.id, auth.uid(), 'ops', 'Incident boundary redrawn');
  end if;
  if new.channels is distinct from old.channels then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.id, auth.uid(), 'ops', 'Communications plan updated: ' || coalesce((select string_agg(coalesce(c ->> 'use', '') || ' ' || coalesce(c ->> 'channel', ''), ', ') from jsonb_array_elements(new.channels) c), 'no channels'));
  end if;
  if new.lead_agency is distinct from old.lead_agency then
    insert into public.ic_events (incident_id, user_id, kind, text) values (new.id, auth.uid(), 'ops', 'Lead agency: ' || coalesce(nullif(new.lead_agency, ''), 'not set'));
  end if;
  if new.status = 'closed' and old.status <> 'closed' then
    insert into public.ic_events (incident_id, user_id, kind, text) values (new.id, auth.uid(), 'ops', 'Incident closed'
      || case when new.clear_personal_at is not null then ' · personal records clear by rule in ' || greatest(1, round(extract(epoch from (new.clear_personal_at - now())) / 86400))::int || ' days' else '' end);
  elsif new.status = 'active' and old.status = 'closed' then
    insert into public.ic_events (incident_id, user_id, kind, text) values (new.id, auth.uid(), 'ops', 'Incident reopened');
  end if;
  return new;
end $$;

-- The licence photos to remove: Supabase lets only its Storage API delete a file, so the clearing
-- queues each path here and the base removes them (storage.remove, then done_at) the next time
-- Operations of that incident opens it; a queued path is the one file Operations may delete.
create table if not exists public.ic_id_purge (
  id bigint generated always as identity primary key,
  incident_id uuid not null references public.ic_incidents(id) on delete cascade,
  user_id uuid not null,
  path text not null,
  queued_at timestamptz not null default now(),
  done_at timestamptz,
  unique (incident_id, path)
);
alter table public.ic_id_purge enable row level security;
drop policy if exists ic_id_purge_select on public.ic_id_purge;
create policy ic_id_purge_select on public.ic_id_purge for select to authenticated using (public.ic_is_ops(incident_id));
drop policy if exists ic_id_purge_update on public.ic_id_purge;
create policy ic_id_purge_update on public.ic_id_purge for update to authenticated using (public.ic_is_ops(incident_id)) with check (public.ic_is_ops(incident_id));
drop policy if exists ic_ids_bucket_purge on storage.objects;
create policy ic_ids_bucket_purge on storage.objects for delete to authenticated
  using (bucket_id = 'ic-ids' and exists (select 1 from public.ic_id_purge q where q.path = storage.objects.name and q.done_at is null and public.ic_is_ops(q.incident_id)));

-- The one deletion in the app: personal data, never work product. For every member of the incident who
-- is in no open incident, the licence number, state and expiry, the date of birth, the address and the
-- licence photo (its file queued for the base to remove) go; the name and the phone stay, the 211 and the 214 need them.
-- The evacuee records keep their counts and needs and become "family of N" or nameless. One line in the log.
create or replace function public.ic_clear_personal(p_incident uuid) returns public.ic_incidents
language plpgsql security definer set search_path = public as $$
declare
  inc public.ic_incidents;
  u record;
  n_lic integer := 0;
  n_names integer := 0;
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
  update public.ic_evacuees e set label = case when e.count > 1 then 'family of ' || e.count else '' end, note = ''
    where e.incident_id = p_incident and (e.note <> '' or e.label <> case when e.count > 1 then 'family of ' || e.count else '' end);
  get diagnostics n_names = row_count;
  perform set_config('ic.quiet', '', true);
  update public.ic_incidents set personal_cleared_at = now() where id = p_incident returning * into inc;
  insert into public.ic_events (incident_id, user_id, kind, text)
  values (p_incident, auth.uid(), 'ops', 'Personal records cleared by rule: ' || n_lic || case when n_lic = 1 then ' licence record' else ' licence records' end
          || ', ' || n_names || case when n_names = 1 then ' sheltered person''s name' else ' sheltered people''s names' end);
  return inc;
end $$;
grant execute on function public.ic_clear_personal(uuid) to authenticated;

-- Keep 30 more days: the date moves on, and the log says so
create or replace function public.ic_keep_personal(p_incident uuid, p_days integer default 30) returns public.ic_incidents
language plpgsql security definer set search_path = public as $$
declare inc public.ic_incidents;
begin
  if not public.ic_is_ops(p_incident) then raise exception 'Only Operations keeps personal records longer'; end if;
  select * into inc from public.ic_incidents where id = p_incident;
  if not found then raise exception 'No such incident'; end if;
  if inc.personal_cleared_at is not null then raise exception 'The personal records are already cleared'; end if;
  if inc.status <> 'closed' then raise exception 'The clock starts when the incident closes'; end if;
  update public.ic_incidents set clear_personal_at = greatest(coalesce(clear_personal_at, now()), now()) + make_interval(days => greatest(1, coalesce(p_days, 30)))
    where id = p_incident returning * into inc;
  insert into public.ic_events (incident_id, user_id, kind, text) values (p_incident, auth.uid(), 'ops', 'Personal records kept ' || greatest(1, coalesce(p_days, 30)) || ' more days');
  return inc;
end $$;
grant execute on function public.ic_keep_personal(uuid, integer) to authenticated;

-- Every closed incident whose date has come, cleared: nightly by pg_cron, and by the base on open.
create or replace function public.ic_clear_personal_due() returns integer
language plpgsql security definer set search_path = public as $$
declare i record; n integer := 0;
begin
  perform set_config('ic.system', '1', true);
  for i in select id from public.ic_incidents where status = 'closed' and personal_cleared_at is null and clear_personal_at is not null and clear_personal_at <= now() loop
    perform public.ic_clear_personal(i.id);
    n := n + 1;
  end loop;
  perform set_config('ic.system', '', true);
  return n;
end $$;
grant execute on function public.ic_clear_personal_due() to authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'ic-clear-personal';
    perform cron.schedule('ic-clear-personal', '15 9 * * *', 'select public.ic_clear_personal_due()');
  end if;
end $$;

-- ---------------------------------------------------------------- live updates

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ic_ops_codes') then
    execute 'alter publication supabase_realtime add table public.ic_ops_codes';
  end if;
end $$;
