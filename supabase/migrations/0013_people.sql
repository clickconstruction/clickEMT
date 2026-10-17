-- People: a record per responder, riding with a unit (the member whose phone it is), with a rank or
-- role, an agency, qualifications from a fixed list, a buddy, check-in and check-out times and notes.
-- A person is archived, never deleted. Once a unit has people on record, its crew text and head
-- count are theirs (ic_member_before): the names of the people checked in, and how many. A unit's
-- own check-out takes its people with it quietly, and its check-in brings back the ones who left
-- with it. Every person's check-in, check-out, move and removal is a status line in the log.

create table if not exists public.ic_people (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.ic_incidents(id) on delete cascade,
  user_id uuid not null references auth.users(id),      -- the unit this person rides with
  name text not null check (name <> ''),
  role text not null default '',                        -- rank or role: "Lt.", "Paramedic", "Boat operator"
  agency text not null default '',                      -- the unit's agency unless said otherwise
  qualifications text[] not null default '{}'::text[]
    check (qualifications <@ array['swift_water', 'boat', 'rope', 'emt', 'paramedic', 'k9', 'hazmat', 'drone']::text[]),
  buddy_id uuid references public.ic_people(id),
  checked_in_at timestamptz not null default now(),
  checked_out_at timestamptz,
  notes text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists ic_people_incident on public.ic_people(incident_id, user_id);

-- "swift water, EMT": the qualifications as words, in the list's order (rules.js qualsText says the same)
create or replace function public.ic_qual_text(p text[]) returns text language sql immutable as $$
  select coalesce(string_agg(case q when 'swift_water' then 'swift water' when 'emt' then 'EMT' when 'k9' then 'K9' else q end, ', '
                             order by array_position(array['swift_water', 'boat', 'rope', 'emt', 'paramedic', 'k9', 'hazmat', 'drone'], q)), '')
  from unnest(p) as t(q);
$$;

-- ---------------------------------------------------------------- the person's own rules

create or replace function public.ic_person_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.name := trim(new.name);
  if new.name = '' then raise exception 'a person needs a name'; end if;
  new.role := coalesce(trim(new.role), '');
  new.notes := coalesce(new.notes, '');
  new.updated_at := now();
  if tg_op = 'INSERT' then new.created_by := coalesce(new.created_by, auth.uid()); end if;
  if tg_op = 'UPDATE' and new.incident_id <> old.incident_id then raise exception 'a person stays on the incident they checked in to'; end if;
  if not exists (select 1 from public.ic_members m where m.incident_id = new.incident_id and m.user_id = new.user_id) then
    raise exception 'that unit is not on this incident';
  end if;
  if new.buddy_id is not null and (new.buddy_id = new.id or not exists (select 1 from public.ic_people b where b.id = new.buddy_id and b.incident_id = new.incident_id)) then
    raise exception 'a buddy is another person on the same incident';
  end if;
  if coalesce(new.agency, '') = '' then
    select coalesce(m.agency, '') into new.agency from public.ic_members m where m.incident_id = new.incident_id and m.user_id = new.user_id;
  end if;
  return new;
end $$;
drop trigger if exists ic_people_before on public.ic_people;
create trigger ic_people_before before insert or update on public.ic_people for each row execute function public.ic_person_before();

-- The unit's crew and head count follow its people: a no-op update lets ic_member_before recompute
-- them. With nobody left on record (everyone archived) the unit's count is unknown again, not stale.
create or replace function public.ic_sync_crew(p_incident uuid, p_user uuid) returns void
language sql security definer set search_path = public as $$
  update public.ic_members m set crew = null, crew_count = null
    where m.incident_id = p_incident and m.user_id = p_user
      and not exists (select 1 from public.ic_people p where p.incident_id = p_incident and p.user_id = p_user and p.archived_at is null);
  update public.ic_members set crew_count = crew_count where incident_id = p_incident and user_id = p_user;
$$;

create or replace function public.ic_person_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  unit text := public.ic_unit_label(new.incident_id, new.user_id);
  quals text := case when cardinality(new.qualifications) > 0 then ' (' || public.ic_qual_text(new.qualifications) || ')' else '' end;
  line text := null;
begin
  if tg_op = 'INSERT' then
    if new.archived_at is null then line := new.name || quals || ' checked in with ' || unit; end if;
  elsif new.archived_at is not null and old.archived_at is null then line := new.name || ' removed from ' || unit;
  elsif new.archived_at is null and old.archived_at is not null then line := new.name || quals || ' put back on ' || unit;
  elsif new.archived_at is not null then line := null;   -- changes to an archived person are not news
  elsif new.user_id <> old.user_id then line := new.name || ' moved from ' || public.ic_unit_label(new.incident_id, old.user_id) || ' to ' || unit;
  elsif new.checked_out_at is not null and old.checked_out_at is null then line := new.name || ' checked out from ' || unit;
  elsif new.checked_out_at is null and old.checked_out_at is not null then line := new.name || quals || ' checked back in with ' || unit;
  elsif (new.name, new.role, new.qualifications) is distinct from (old.name, old.role, old.qualifications) then line := new.name || quals || ' updated on ' || unit;
  end if;
  if line is not null and not public.ic_quiet() then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'status', line, 'ic_people', new.id::text);
  end if;
  perform public.ic_sync_crew(new.incident_id, new.user_id);
  if tg_op = 'UPDATE' and new.user_id <> old.user_id then perform public.ic_sync_crew(new.incident_id, old.user_id); end if;
  return new;
end $$;
drop trigger if exists ic_people_after on public.ic_people;
create trigger ic_people_after after insert or update on public.ic_people for each row execute function public.ic_person_after();

-- ---------------------------------------------------------------- the unit follows its people

-- Once a unit has people on record (not archived), its crew is their names and its head count is how
-- many of them are checked in; a hand change to either is overruled. The status stamps are as before.
create or replace function public.ic_member_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare total integer; n integer; names text;
begin
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
drop trigger if exists ic_members_before on public.ic_members;
create trigger ic_members_before before insert or update on public.ic_members for each row execute function public.ic_member_before();

-- A unit that checks out takes its people with it, quietly (the unit's line says it); a unit that
-- comes back brings back the people who left with it. Zones go back as before.
create or replace function public.ic_member_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text := public.ic_unit_label(new.incident_id, new.user_id);
begin
  if new.status is distinct from old.status then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.incident_id, auth.uid(), 'status',
            case new.status
              when 'available' then who || ' is available' || case when old.status = 'out_of_service' then ', back in service' else '' end
              when 'out_of_service' then who || ' is out of service' || case when new.status_note <> '' then ': ' || new.status_note else '' end
              when 'checked_out' then who || ' checked out'
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
drop trigger if exists ic_members_after on public.ic_members;
create trigger ic_members_after after update on public.ic_members for each row execute function public.ic_member_after();

-- ---------------------------------------------------------------- check-in carries the people

-- p_people is a JSON list of {name, role, qualifications, notes}. A name already on the unit (not
-- archived) is checked back in and updated; a new one is added. With no list, the unit's crew text
-- and head count are taken as typed, as before.
drop function if exists public.ic_join(text, text, text, text, integer, text);
create or replace function public.ic_join(p_code text, p_role text, p_unit_name text, p_crew text default null, p_crew_count integer default null, p_agency text default null, p_people jsonb default null)
returns public.ic_incidents
language plpgsql security definer set search_path = public as $$
declare
  r public.ic_incidents;
  person jsonb;
  nm text;
  quals text[];
  existing uuid;
  n integer;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_role not in ('ops', 'unit') then raise exception 'role must be ops or unit'; end if;
  select * into r from public.ic_incidents i where i.code = upper(trim(p_code)) and i.status = 'active';
  if not found then raise exception 'No active incident has the code %', upper(trim(p_code)); end if;
  insert into public.ic_members (incident_id, user_id, role, unit_name, crew, crew_count, agency, status, status_at, checked_out_at)
  values (r.id, auth.uid(), p_role, nullif(trim(p_unit_name), ''), nullif(trim(p_crew), ''), p_crew_count, coalesce(trim(p_agency), ''), 'available', now(), null)
  on conflict (incident_id, user_id) do update
    set role = excluded.role,
        unit_name = coalesce(excluded.unit_name, ic_members.unit_name),
        crew = coalesce(excluded.crew, ic_members.crew),
        crew_count = coalesce(excluded.crew_count, ic_members.crew_count),
        agency = case when excluded.agency <> '' then excluded.agency else ic_members.agency end,
        status = case when ic_members.status = 'checked_out' then 'available' else ic_members.status end,
        status_at = case when ic_members.status = 'checked_out' then now() else ic_members.status_at end,
        checked_out_at = null;
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
  insert into public.ic_events (incident_id, user_id, kind, text)
  values (r.id, auth.uid(), 'ops', public.ic_unit_label(r.id, auth.uid()) || ' checked in'
          || case when n is not null and (p_people is not null or p_crew_count is not null) then ' with ' || n || case when n = 1 then ' person' else ' people' end else '' end);
  return r;
end $$;
grant execute on function public.ic_join(text, text, text, text, integer, text, jsonb) to authenticated;

-- ---------------------------------------------------------------- who may do what

alter table public.ic_people enable row level security;
drop policy if exists ic_people_select on public.ic_people;
create policy ic_people_select on public.ic_people for select to authenticated using (public.ic_is_member(incident_id));
-- a unit adds and keeps its own people; Operations anyone's (moving a person to another unit is Operations' alone)
drop policy if exists ic_people_insert on public.ic_people;
create policy ic_people_insert on public.ic_people for insert to authenticated
  with check (public.ic_is_member(incident_id) and (user_id = auth.uid() or public.ic_is_ops(incident_id)));
drop policy if exists ic_people_update on public.ic_people;
create policy ic_people_update on public.ic_people for update to authenticated
  using (user_id = auth.uid() or public.ic_is_ops(incident_id)) with check (user_id = auth.uid() or public.ic_is_ops(incident_id));
-- no delete policy: a person is archived

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ic_people') then
    execute 'alter publication supabase_realtime add table public.ic_people';
  end if;
end $$;
