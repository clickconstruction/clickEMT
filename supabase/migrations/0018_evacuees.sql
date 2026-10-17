-- Shelter and evacuee records (v26). The app recorded houses and lost a person once they were moved.
-- Now one record per person or family (who, how many, needs, from where, where now) is made by a crew
-- from the house record, by the shelter desk at the door, or by Operations, and found by name from
-- either view. A shelter knows its beds and who is expected. A shelter desk is a kind of unit, working
-- at one facility. Nothing is deleted: a record moves, leaves, or is withdrawn (archived).

-- ---------------------------------------------------------------- a shelter desk is a kind of unit, at one facility

alter table public.ic_members drop constraint if exists ic_members_kind_check;
alter table public.ic_members add constraint ic_members_kind_check
  check (kind in ('', 'engine', 'boat', 'swift_water', 'high_water', 'ambulance', 'search', 'k9', 'drone', 'pump', 'shelter_desk', 'other'));

-- the words for a kind, as UNIT_KINDS in rules.js says them
create or replace function public.ic_kind_text(p_kind text) returns text language sql immutable as $$
  select case p_kind when 'engine' then 'engine' when 'boat' then 'boat crew' when 'swift_water' then 'swift-water team' when 'high_water' then 'high-water vehicle'
                     when 'ambulance' then 'ambulance' when 'search' then 'search team' when 'k9' then 'K9 team' when 'drone' then 'drone team' when 'pump' then 'pump crew'
                     when 'shelter_desk' then 'shelter desk' when 'other' then 'other' else '' end;
$$;

-- the facility a unit works at: a shelter desk's shelter
alter table public.ic_members add column if not exists facility_id uuid references public.ic_facilities(id) on delete set null;

create or replace function public.ic_member_facility() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.facility_id is not null and not exists (select 1 from public.ic_facilities f where f.id = new.facility_id and f.incident_id = new.incident_id) then
    raise exception 'that facility is not on this incident';
  end if;
  return new;
end $$;
drop trigger if exists ic_members_facility on public.ic_members;
create trigger ic_members_facility before insert or update of facility_id on public.ic_members for each row execute function public.ic_member_facility();

-- the desk of a facility: a shelter desk on the incident, not checked out, at that facility (or at none
-- chosen yet)
create or replace function public.ic_is_desk(p_incident uuid, p_facility uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_facility is not null and exists (
    select 1 from public.ic_members m
    where m.incident_id = p_incident and m.user_id = auth.uid() and m.kind = 'shelter_desk' and m.status <> 'checked_out'
      and (m.facility_id = p_facility or m.facility_id is null));
$$;
grant execute on function public.ic_is_desk(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------- a shelter's beds and who is expected

alter table public.ic_facilities add column if not exists beds integer check (beds is null or beds between 0 and 100000);
alter table public.ic_facilities add column if not exists expected text not null default '';   -- typed by Operations: "Bus 2 from Pecan Park, 12 people, 17:30"

create or replace function public.ic_facility_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare what text := public.ic_facility_kind_text(new.kind) || case when new.name <> '' then ': ' || new.name else '' end;
begin
  if tg_op = 'INSERT' then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', what || ' opened', 'ic_facilities', new.id::text);
    return new;
  end if;
  if new.closed_at is not null and old.closed_at is null then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', what || ' closed', 'ic_facilities', new.id::text);
  elsif new.closed_at is null and old.closed_at is not null then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', what || ' reopened', 'ic_facilities', new.id::text);
  elsif (new.name, new.kind, new.contact) is distinct from (old.name, old.kind, old.contact) then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', what || ' updated', 'ic_facilities', new.id::text);
  end if;
  if new.beds is distinct from old.beds then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', what || case when new.beds is null then ' beds not set' else ' has ' || new.beds || case when new.beds = 1 then ' bed' else ' beds' end end, 'ic_facilities', new.id::text);
  end if;
  if new.expected <> old.expected then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', what || ' expecting ' || coalesce(nullif(new.expected, ''), 'nobody now'), 'ic_facilities', new.id::text);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- one record per person or family

create table if not exists public.ic_evacuees (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.ic_incidents(id) on delete cascade,
  label text not null default '',                     -- a name, or "family of 4, Pecan Park" until the desk adds one
  count integer not null default 1 check (count between 1 and 999),
  needs text[] not null default '{}' check (needs <@ array['oxygen', 'insulin', 'wheelchair', 'infant', 'pets', 'other']::text[]),
  note text not null default '',                      -- the condition, in the crew's or the desk's words
  structure_id uuid references public.ic_structures(id) on delete set null,   -- the house a crew took them from
  from_text text not null default '',                 -- where from, as typed: an address or a division
  status text not null default 'here' check (status in ('on_the_way', 'here', 'moved', 'with_family', 'own_transport', 'unknown')),
  facility_id uuid references public.ic_facilities(id) on delete set null,      -- where now: at, on the way to, or moved to
  prev_facility_id uuid references public.ic_facilities(id) on delete set null, -- the place they were signed in at before they left it
  status_at timestamptz not null default now(),       -- since when the record says where they are
  logged_by uuid references auth.users(id),
  signed_in_by uuid references auth.users(id),
  signed_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists ic_evacuees_incident on public.ic_evacuees(incident_id);
create index if not exists ic_evacuees_facility on public.ic_evacuees(facility_id);

-- the words both views use (NEEDS and needsText in rules.js): "insulin and pets"
create or replace function public.ic_needs_text(p_needs text[]) returns text language plpgsql immutable as $$
declare a text[];
begin
  select coalesce(array_agg(w order by o), '{}') into a
    from unnest(array['oxygen', 'insulin', 'wheelchair', 'infant', 'pets', 'other'], array['oxygen', 'insulin', 'wheelchair', 'infant care', 'pets', 'other help']) with ordinality t(x, w, o)
    where x = any(coalesce(p_needs, '{}'));
  if cardinality(a) = 0 then return ''; end if;
  if cardinality(a) = 1 then return a[1]; end if;
  return array_to_string(a[1:cardinality(a) - 1], ', ') || ' and ' || a[cardinality(a)];
end $$;

-- who a record is, in a line (evacueeWho in rules.js): the label, with the count when the label does not say it
create or replace function public.ic_evacuee_who(p_label text, p_count integer) returns text language sql immutable as $$
  select case when coalesce(p_label, '') = '' then case when p_count > 1 then p_count || ' people with no name yet' else 'a person with no name yet' end
              when p_count > 1 and position(p_count::text in p_label) = 0 then p_label || ' (' || p_count || ')'
              else p_label end;
$$;

create or replace function public.ic_evacuee_before() returns trigger
language plpgsql security definer set search_path = public as $$
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
drop trigger if exists ic_evacuees_before on public.ic_evacuees;
create trigger ic_evacuees_before before insert or update on public.ic_evacuees for each row execute function public.ic_evacuee_before();

-- The log: arrivals, sign-ins and moves, each a line on the 214 (log kind 'shelter', filed under the field).
-- "High school gym: Gym shelter desk signed in Alvarez, family of 4, from 112 Pecan Ln, needs insulin and pets"
-- "Maria Alvarez, 78 moved from High school gym to Dell Seton Medical Center"
create or replace function public.ic_evacuee_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who text := public.ic_evacuee_who(new.label, new.count);
  unit text := public.ic_unit_label(new.incident_id, auth.uid());
  place text := (select coalesce(nullif(f.name, ''), public.ic_facility_kind_text(f.kind)) from public.ic_facilities f where f.id = new.facility_id);
  was text;        -- where the record said they were, or were going
  left_from text;  -- the place they were signed in at, when they leave it
  frm text := case when new.from_text <> '' then ' from ' || new.from_text else '' end;
  nd text := case when cardinality(new.needs) > 0 then ', needs ' || public.ic_needs_text(new.needs) else '' end;
  line text;
begin
  if public.ic_quiet() then return new; end if;
  if tg_op = 'INSERT' then
    line := case new.status
      when 'here' then place || ': ' || unit || ' signed in ' || who || case when frm <> '' then ',' || frm else '' end || nd
      when 'with_family' then unit || ': ' || who || frm || ' left with family' || nd
      when 'own_transport' then unit || ': ' || who || frm || ' left by own transport' || nd
      when 'unknown' then unit || ' logged ' || who || frm || ', whereabouts unknown' || nd
      else unit || ' sent ' || who || frm || ' to ' || place || nd end;
  else
    was := (select coalesce(nullif(f.name, ''), public.ic_facility_kind_text(f.kind)) from public.ic_facilities f where f.id = old.facility_id);
    left_from := case when old.status = 'here' then was end;
    if new.archived_at is not null and old.archived_at is null then line := 'Record of ' || who || ' withdrawn by ' || unit;
    elsif new.archived_at is null and old.archived_at is not null then line := 'Record of ' || who || ' put back by ' || unit;
    elsif new.archived_at is not null then line := null;
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
drop trigger if exists ic_evacuees_after on public.ic_evacuees;
create trigger ic_evacuees_after after insert or update on public.ic_evacuees for each row execute function public.ic_evacuee_after();

-- Members read and add; the one who logged it, the shelter's desk (where it is, or the shelter it left)
-- or Operations change it. No delete policy: a record is moved or withdrawn, never removed.
alter table public.ic_evacuees enable row level security;
drop policy if exists ic_evacuees_select on public.ic_evacuees;
create policy ic_evacuees_select on public.ic_evacuees for select to authenticated using (public.ic_is_member(incident_id));
drop policy if exists ic_evacuees_insert on public.ic_evacuees;
create policy ic_evacuees_insert on public.ic_evacuees for insert to authenticated with check (public.ic_is_member(incident_id));
drop policy if exists ic_evacuees_update on public.ic_evacuees;
create policy ic_evacuees_update on public.ic_evacuees for update to authenticated
  using (public.ic_is_member(incident_id) and (logged_by = auth.uid() or public.ic_is_ops(incident_id) or public.ic_is_desk(incident_id, facility_id) or public.ic_is_desk(incident_id, prev_facility_id)))
  with check (public.ic_is_member(incident_id));

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ic_evacuees') then
    alter publication supabase_realtime add table public.ic_evacuees;
  end if;
end $$;
