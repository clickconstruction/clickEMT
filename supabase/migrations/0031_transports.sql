-- A transport board (v54). "Who is on the next bus" was a line Operations typed on the shelter's card. Now a run is a
-- row: a vehicle (bus, van, ambulance, boat run, high-water vehicle) from a pickup point (a facility, a division, or a
-- few words) to a facility, with a capacity, when it leaves and when it is expected, who drives (a member, or a name
-- and a phone), and a status that walks planned → loading → en route → arrived → done. The people on it are evacuee
-- records (ic_evacuees.transport_id): a crew or Operations puts a record on a run and the record is on the way to the
-- run's destination from that moment; the desk at the destination sees the whole run under Arriving and signs it in
-- as one. The 214 has each run's start and arrival with who was on it, and who put each record on. Nothing is
-- deleted: a run is withdrawn (archived) and put back.

-- ---------------------------------------------------------------- the runs
create table if not exists public.ic_transports (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.ic_incidents(id) on delete cascade,
  kind text not null default 'bus' check (kind in ('bus', 'van', 'ambulance', 'boat', 'high_water', 'other')),
  label text not null default '',                       -- "Bus 2"; the kind's word when empty
  from_facility_id uuid references public.ic_facilities(id) on delete set null,   -- the pickup: a facility,
  from_zone_id uuid references public.ic_zones(id) on delete set null,            -- a division,
  from_text text not null default '',                                              -- or a few words
  to_facility_id uuid not null references public.ic_facilities(id),               -- a shelter, a hospital or another facility
  capacity integer check (capacity is null or capacity between 1 and 999),
  leaves_at timestamptz,                                -- planned departure
  expected_at timestamptz,                              -- planned arrival
  status text not null default 'planned' check (status in ('planned', 'loading', 'en_route', 'arrived', 'done')),
  status_at timestamptz not null default now(),
  left_at timestamptz,                                  -- when it went en route
  arrived_at timestamptz,                               -- when it arrived
  driver_user_id uuid references auth.users(id) on delete set null,   -- a member driving or in charge
  driver_text text not null default '',                               -- or a name and a phone
  notes text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists ic_transports_incident on public.ic_transports(incident_id);

alter table public.ic_evacuees add column if not exists transport_id uuid references public.ic_transports(id) on delete set null;
create index if not exists ic_evacuees_transport on public.ic_evacuees(transport_id);

-- ---------------------------------------------------------------- the words (TRANSPORT_KINDS, transportLabel, transportFrom in rules.js say the same)
create or replace function public.ic_transport_kind_text(p_kind text) returns text language sql immutable as $$
  select case p_kind when 'bus' then 'Bus' when 'van' then 'Van' when 'ambulance' then 'Ambulance' when 'boat' then 'Boat run' when 'high_water' then 'High-water vehicle' else 'Transport' end;
$$;
create or replace function public.ic_transport_label(p_kind text, p_label text) returns text language sql immutable as $$
  select coalesce(nullif(trim(coalesce(p_label, '')), ''), public.ic_transport_kind_text(p_kind));
$$;
create or replace function public.ic_place_text(p_facility uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(f.name, ''), public.ic_facility_kind_text(f.kind)) from public.ic_facilities f where f.id = p_facility;
$$;
-- the pickup: the facility, else the division, else the words, else "the pickup"
create or replace function public.ic_transport_from(t public.ic_transports) returns text language sql stable security definer set search_path = public as $$
  select coalesce(public.ic_place_text(t.from_facility_id),
                  (select z.code || case when z.name <> '' then ' ' || z.name else '' end from public.ic_zones z where z.id = t.from_zone_id),
                  nullif(t.from_text, ''), 'the pickup');
$$;
-- who is on it: "12 people in 4 records", or "nobody on it"
create or replace function public.ic_transport_aboard(p_transport uuid) returns text language sql stable security definer set search_path = public as $$
  select case when count(*) = 0 then 'nobody on it'
              else sum(e.count) || case when sum(e.count) = 1 then ' person' else ' people' end || ' in ' || count(*) || case when count(*) = 1 then ' record' else ' records' end end
  from public.ic_evacuees e where e.transport_id = p_transport and e.archived_at is null;
$$;

-- ---------------------------------------------------------------- the rules of a run
create or replace function public.ic_transport_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.label := trim(coalesce(new.label, '')); new.from_text := trim(coalesce(new.from_text, ''));
  new.driver_text := trim(coalesce(new.driver_text, '')); new.notes := trim(coalesce(new.notes, ''));
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    if new.incident_id <> old.incident_id then raise exception 'a run stays on the incident it was made on'; end if;
    new.created_by := old.created_by; new.created_at := old.created_at;
    if old.status = 'done' and new.status <> 'done' then raise exception 'a run that is done stays done'; end if;
  else
    new.created_by := coalesce(auth.uid(), new.created_by);
  end if;
  if not exists (select 1 from public.ic_facilities f where f.id = new.to_facility_id and f.incident_id = new.incident_id) then
    raise exception 'say where to: a shelter, a hospital or another facility on this incident';
  end if;
  if new.from_facility_id is not null and not exists (select 1 from public.ic_facilities f where f.id = new.from_facility_id and f.incident_id = new.incident_id) then
    raise exception 'that facility is not on this incident';
  end if;
  if new.from_zone_id is not null and not exists (select 1 from public.ic_zones z where z.id = new.from_zone_id and z.incident_id = new.incident_id) then
    raise exception 'that division is not on this incident';
  end if;
  if new.driver_user_id is not null and not exists (select 1 from public.ic_members m where m.incident_id = new.incident_id and m.user_id = new.driver_user_id and m.removed_at is null) then
    raise exception 'the driver is not on this incident';
  end if;
  if new.status = 'done' and (tg_op = 'INSERT' or old.status not in ('arrived', 'done')) then raise exception 'a run arrives before it is done'; end if;
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    new.status_at := now();
    if new.status in ('planned', 'loading') then new.left_at := null; new.arrived_at := null; end if;   -- a false press undone
    if new.status = 'en_route' then new.left_at := coalesce(new.left_at, now()); new.arrived_at := null; end if;
    if new.status = 'arrived' then new.left_at := coalesce(new.left_at, now()); new.arrived_at := coalesce(new.arrived_at, now()); end if;
  end if;
  return new;
end $$;
drop trigger if exists ic_transports_before on public.ic_transports;
create trigger ic_transports_before before insert or update on public.ic_transports for each row execute function public.ic_transport_before();

-- The 214 (log kind 'transport', filed under the field): planned, loading, left, arrived, done, withdrawn, put back,
-- a new destination, updated. When the destination changes, the records on the run not yet signed in follow it quietly.
create or replace function public.ic_transport_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  run text := public.ic_transport_label(new.kind, new.label);
  unit text := public.ic_unit_label(new.incident_id, auth.uid());
  frm text := public.ic_transport_from(new);
  dest text := public.ic_place_text(new.to_facility_id);
  line text;
begin
  if tg_op = 'UPDATE' and new.to_facility_id is distinct from old.to_facility_id then
    perform set_config('ic.quiet', '1', true);
    update public.ic_evacuees e set facility_id = new.to_facility_id,
      status = case when (select f.kind from public.ic_facilities f where f.id = new.to_facility_id) = 'shelter' then 'on_the_way' else 'moved' end
      where e.transport_id = new.id and e.archived_at is null and e.status in ('on_the_way', 'moved');
    perform set_config('ic.quiet', '', true);
  end if;
  if public.ic_quiet() then return new; end if;
  if tg_op = 'INSERT' then
    line := run || ' planned by ' || unit || ': ' || frm || ' to ' || dest
      || case when new.capacity is not null then ', ' || new.capacity || ' seats' else '' end
      || case when new.driver_user_id is not null then ', driver ' || public.ic_unit_label(new.incident_id, new.driver_user_id) when new.driver_text <> '' then ', driver ' || new.driver_text else '' end;
  elsif new.archived_at is not null and old.archived_at is null then line := run || ' withdrawn by ' || unit;
  elsif new.archived_at is null and old.archived_at is not null then line := run || ' put back by ' || unit;
  elsif new.archived_at is not null then line := null;
  elsif new.status <> old.status then
    line := case new.status
      when 'loading' then run || ' loading at ' || frm || ' for ' || dest
      when 'en_route' then run || ' left ' || frm || ' for ' || dest || ' with ' || public.ic_transport_aboard(new.id)
      when 'arrived' then run || ' arrived at ' || dest || ' with ' || public.ic_transport_aboard(new.id)
      when 'done' then run || ' done at ' || dest || ', ' || public.ic_transport_aboard(new.id)
      else run || ' back to planned' end;
  elsif new.to_facility_id is distinct from old.to_facility_id then line := run || ' now going to ' || dest || ' with ' || public.ic_transport_aboard(new.id);
  elsif (new.kind, new.label, new.from_facility_id, new.from_zone_id, new.from_text, new.capacity, new.leaves_at, new.expected_at, new.driver_user_id, new.driver_text, new.notes)
        is distinct from (old.kind, old.label, old.from_facility_id, old.from_zone_id, old.from_text, old.capacity, old.leaves_at, old.expected_at, old.driver_user_id, old.driver_text, old.notes) then
    line := run || ' updated';
  end if;
  if line is not null then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'transport', line, 'ic_transports', new.id::text);
  end if;
  return new;
end $$;
drop trigger if exists ic_transports_after on public.ic_transports;
create trigger ic_transports_after after insert or update on public.ic_transports for each row execute function public.ic_transport_after();

-- ---------------------------------------------------------------- a record on a run follows the run
-- Put on a run, a record is on the way to the run's destination (a shelter) or moved there (a hospital or another
-- facility) from that moment, unless it is already signed in there. A record that leaves the run's destination for
-- somewhere else is off the run. A withdrawn or done run takes nobody.
create or replace function public.ic_evacuee_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare t public.ic_transports;
begin
  new.label := trim(coalesce(new.label, ''));
  new.from_text := trim(coalesce(new.from_text, ''));
  new.note := trim(coalesce(new.note, ''));
  new.needs := coalesce(array(select distinct x from unnest(coalesce(new.needs, '{}')) x order by x), '{}');
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    if new.incident_id <> old.incident_id then raise exception 'a record stays on the incident it was made on'; end if;
    new.logged_by := old.logged_by; new.created_at := old.created_at;
  else
    new.logged_by := coalesce(auth.uid(), new.logged_by);
  end if;
  -- where now: at, on the way to or moved to a facility of this incident; having left, nowhere on record
  if new.status in ('with_family', 'own_transport', 'unknown') then new.facility_id := null; end if;
  if new.transport_id is not null then
    select * into t from public.ic_transports x where x.id = new.transport_id and x.incident_id = new.incident_id;
    if not found then raise exception 'that run is not on this incident'; end if;
    if tg_op = 'INSERT' or new.transport_id is distinct from old.transport_id then
      if t.archived_at is not null then raise exception 'that run was withdrawn'; end if;
      if t.status = 'done' then raise exception 'that run is done'; end if;
      if not (new.status = 'here' and new.facility_id = t.to_facility_id) then
        new.facility_id := t.to_facility_id;
        new.status := case when (select f.kind from public.ic_facilities f where f.id = t.to_facility_id) = 'shelter' then 'on_the_way' else 'moved' end;
      end if;
    elsif (new.status, new.facility_id) is distinct from (old.status, old.facility_id) and new.facility_id is distinct from t.to_facility_id then
      new.transport_id := null;   -- gone somewhere else: off the run
    end if;
  end if;
  if new.status in ('here', 'on_the_way', 'moved') and new.facility_id is null then raise exception 'say where: a shelter or a hospital'; end if;
  if new.facility_id is not null and not exists (select 1 from public.ic_facilities f where f.id = new.facility_id and f.incident_id = new.incident_id) then
    raise exception 'that facility is not on this incident';
  end if;
  if new.structure_id is not null and not exists (select 1 from public.ic_structures s where s.id = new.structure_id and s.incident_id = new.incident_id) then
    raise exception 'that structure is not on this incident';
  end if;
  if tg_op = 'INSERT' or (new.status, new.facility_id) is distinct from (old.status, old.facility_id) then
    new.status_at := now();
    if new.status = 'here' then new.signed_in_by := auth.uid(); new.signed_in_at := now(); end if;
    if tg_op = 'UPDATE' and old.status = 'here' then new.prev_facility_id := old.facility_id; end if;
  end if;
  return new;
end $$;

-- The log gains the run: "Unit 3 sent Garza, family of 3 from 120 Pecan Ln to High school gym on Bus 2, needs infant care",
-- "Operations put Garza, family of 3 on Bus 2 to High school gym", "Garza, family of 3 taken off Bus 2 by Operations".
create or replace function public.ic_evacuee_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who text := public.ic_evacuee_who(new.label, new.count);
  unit text := public.ic_unit_label(new.incident_id, auth.uid());
  place text := public.ic_place_text(new.facility_id);
  run text := (select public.ic_transport_label(x.kind, x.label) from public.ic_transports x where x.id = new.transport_id);
  was text;        -- where the record said they were, or were going
  left_from text;  -- the place they were signed in at, when they leave it
  frm text := case when new.from_text <> '' then ' from ' || new.from_text else '' end;
  nd text := case when cardinality(new.needs) > 0 then ', needs ' || public.ic_needs_text(new.needs) else '' end;
  on_run text := case when run is not null and new.status in ('on_the_way', 'moved') then ' on ' || run else '' end;
  line text;
begin
  if public.ic_quiet() then return new; end if;
  if tg_op = 'INSERT' then
    line := case new.status
      when 'here' then place || ': ' || unit || ' signed in ' || who || case when frm <> '' then ',' || frm else '' end || nd
      when 'with_family' then unit || ': ' || who || frm || ' left with family' || nd
      when 'own_transport' then unit || ': ' || who || frm || ' left by own transport' || nd
      when 'unknown' then unit || ' logged ' || who || frm || ', whereabouts unknown' || nd
      else unit || ' sent ' || who || frm || ' to ' || place || on_run || nd end;
  else
    was := public.ic_place_text(old.facility_id);
    left_from := case when old.status = 'here' then was end;
    if new.archived_at is not null and old.archived_at is null then line := 'Record of ' || who || ' withdrawn by ' || unit;
    elsif new.archived_at is null and old.archived_at is not null then line := 'Record of ' || who || ' put back by ' || unit;
    elsif new.archived_at is not null then line := null;
    elsif new.transport_id is distinct from old.transport_id and new.transport_id is not null then
      line := unit || ' put ' || who || frm || ' on ' || run || ' to ' || place;
    elsif new.transport_id is distinct from old.transport_id and (new.status, new.facility_id) is not distinct from (old.status, old.facility_id) then
      line := who || ' taken off ' || (select public.ic_transport_label(x.kind, x.label) from public.ic_transports x where x.id = old.transport_id) || ' by ' || unit;
    elsif (new.status, new.facility_id) is distinct from (old.status, old.facility_id) then
      line := case new.status
        when 'here' then place || ': ' || unit || ' signed in ' || who || case when frm <> '' then ',' || frm else '' end || nd
        when 'with_family' then who || case when left_from is not null then ' left ' || left_from || ' with family' else ' went with family' end
        when 'own_transport' then who || case when left_from is not null then ' left ' || left_from || ' by own transport' else ' went by own transport' end
        when 'unknown' then who || ': whereabouts unknown' || case when left_from is not null then ', last at ' || left_from when was is not null then ', last going to ' || was else '' end
        else who || ' moved' || case when left_from is not null and old.facility_id is distinct from new.facility_id then ' from ' || left_from else '' end || ' to ' || place end;
    elsif new.label <> old.label then line := public.ic_evacuee_who(old.label, old.count) || ' now on record as ' || who;
    elsif new.needs <> old.needs then line := who || ' needs ' || coalesce(nullif(public.ic_needs_text(new.needs), ''), 'nothing listed');
    end if;
  end if;
  if line is not null then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'shelter', line, 'ic_evacuees', new.id::text);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- who may do what
-- Members read and add (a crew at a pickup can make the run it is loading); Operations, the one who made it, the
-- driver, or the desk at its destination change it. No delete policy: a run is withdrawn, never removed.
alter table public.ic_transports enable row level security;
drop policy if exists ic_transports_select on public.ic_transports;
create policy ic_transports_select on public.ic_transports for select to authenticated using (public.ic_is_member(incident_id));
drop policy if exists ic_transports_insert on public.ic_transports;
create policy ic_transports_insert on public.ic_transports for insert to authenticated with check (public.ic_may_write(incident_id, created_at));
drop policy if exists ic_transports_update on public.ic_transports;
create policy ic_transports_update on public.ic_transports for update to authenticated
  using (public.ic_is_member(incident_id) and (public.ic_is_ops(incident_id) or created_by = auth.uid() or driver_user_id = auth.uid() or public.ic_is_desk(incident_id, to_facility_id)))
  with check (public.ic_is_member(incident_id));

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ic_transports') then
    alter publication supabase_realtime add table public.ic_transports;
  end if;
end $$;
