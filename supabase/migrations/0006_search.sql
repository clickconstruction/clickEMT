-- Primary and secondary search, and one record per structure. A zone's status gains the search
-- pass: open, active, primary (primary search complete), cleared (secondary complete). Structures
-- are records the field makes as it goes: who lives there and what state it is in. Once a zone
-- has structure records, its counts follow them.

alter table public.ic_zones drop constraint if exists ic_zones_status_check;
alter table public.ic_zones add constraint ic_zones_status_check check (status in ('open', 'active', 'primary', 'cleared'));
alter table public.ic_zones add column if not exists primary_done_at timestamptz;
alter table public.ic_zones add column if not exists secondary_done_at timestamptz;

create table if not exists public.ic_structures (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.ic_incidents(id) on delete cascade,
  zone_id uuid references public.ic_zones(id) on delete set null,
  label text not null default '',                    -- address or what it is
  lat double precision,
  lng double precision,
  status text not null default 'searched' check (status in ('not_searched', 'in_progress', 'searched')),
  pass text not null default 'primary' check (pass in ('primary', 'secondary')),
  occupants text not null default 'unknown' check (occupants in ('unknown', 'none', 'evacuated', 'sheltering', 'refused')),
  people_needing_help integer not null default 0 check (people_needing_help between 0 and 999),
  water_cm integer,                                   -- depth of water at the structure
  damage text not null default 'unknown' check (damage in ('unknown', 'affected', 'minor', 'major', 'destroyed')),
  hazards text not null default '',                   -- codes painted on the marking: ELEC GAS STRUC H2O
  marking jsonb,
  notes text not null default '',
  searched_by uuid references auth.users(id),
  searched_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ic_structures_zone on public.ic_structures(zone_id);
create index if not exists ic_structures_incident on public.ic_structures(incident_id);

-- ---------------------------------------------------------------- zone stamps for the passes

create or replace function public.ic_zone_stamps() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'primary' then new.primary_done_at := now(); new.cleared_at := now(); end if;
    if new.status = 'cleared' then new.secondary_done_at := now(); new.cleared_at := now(); if new.primary_done_at is null then new.primary_done_at := now(); end if; end if;
    if new.status in ('open', 'active') then new.cleared_at := null; end if;
  end if;
  return new;
end $$;
drop trigger if exists ic_zones_stamps on public.ic_zones;
create trigger ic_zones_stamps before update on public.ic_zones for each row execute function public.ic_zone_stamps();

-- ---------------------------------------------------------------- the log for zones, with the passes

create or replace function public.ic_log_zone() returns trigger
language plpgsql security definer set search_path = public as $$
declare victims text := case when coalesce((new.marking ->> 'victims')::int, 0) > 0 then ', ' || (new.marking ->> 'victims') || ' found needing help' else '' end;
begin
  if tg_op = 'INSERT' then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', 'Division ' || new.code || ' drawn, priority ' || new.priority, 'ic_zones', new.id::text);
    return new;
  end if;
  if new.status = 'primary' and old.status <> 'primary' then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'clear', new.code || ' primary search complete (' || new.cleared || ' of ' || new.structures || ')' || victims, 'ic_zones', new.id::text);
  elsif new.status = 'cleared' and old.status <> 'cleared' then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'clear',
            case when old.status = 'primary' then new.code || ' secondary search complete, zone clear (' else new.code || ' marked clear (' end || new.cleared || ' of ' || new.structures || ')' || victims,
            'ic_zones', new.id::text);
  elsif new.cleared <> old.cleared and new.status not in ('primary', 'cleared') then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'clear', 'Structure cleared in ' || new.code || ' (' || new.cleared || ' of ' || new.structures || ')', 'ic_zones', new.id::text);
  elsif new.status in ('open', 'active') and old.status in ('primary', 'cleared') then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', new.code || ' reopened', 'ic_zones', new.id::text);
  end if;
  if new.priority <> old.priority then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', new.code || ' priority set to ' || new.priority, 'ic_zones', new.id::text);
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops',
            case when new.assigned_to is null then new.code || ' released from ' || public.ic_unit_label(new.incident_id, old.assigned_to)
                 else new.code || ' assigned to ' || public.ic_unit_label(new.incident_id, new.assigned_to) end,
            'ic_zones', new.id::text);
  end if;
  if (new.code, new.name) is distinct from (old.code, old.name) then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', 'Division ' || old.code || ' is now ' || new.code || case when new.name <> '' then ' · ' || new.name else '' end, 'ic_zones', new.id::text);
  end if;
  if (new.work_assignment, new.instructions, new.channel, new.supervisor) is distinct from (old.work_assignment, old.instructions, old.channel, old.supervisor) then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', new.code || ' assignment updated'
            || case when new.channel <> old.channel then ', channel ' || coalesce(nullif(new.channel, ''), 'cleared') else '' end
            || case when new.supervisor <> old.supervisor then ', supervisor ' || coalesce(nullif(new.supervisor, ''), 'cleared') else '' end,
            'ic_zones', new.id::text);
  end if;
  return new;
end $$;

-- a finished pass frees the unit, the same as a clear did
create or replace function public.ic_zone_sets_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null then
    update public.ic_members set status = 'assigned'
      where incident_id = new.incident_id and user_id = new.assigned_to and status = 'available';
  end if;
  if old.assigned_to is not null and (new.assigned_to is distinct from old.assigned_to or (new.status in ('primary', 'cleared') and old.status not in ('primary', 'cleared'))) then
    if not exists (select 1 from public.ic_zones z where z.incident_id = new.incident_id and z.assigned_to = old.assigned_to and z.status = 'active' and z.id <> new.id)
       and not (new.assigned_to = old.assigned_to and new.status = 'active') then
      update public.ic_members set status = 'available'
        where incident_id = new.incident_id and user_id = old.assigned_to and status = 'assigned';
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- structures: counts and the log

create or replace function public.ic_structure_before() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.status = 'searched' and (tg_op = 'INSERT' or old.status <> 'searched' or new.searched_at is null) then
    new.searched_at := coalesce(new.searched_at, now());
    new.searched_by := coalesce(new.searched_by, auth.uid());
  end if;
  if tg_op = 'INSERT' then new.created_by := coalesce(new.created_by, auth.uid()); end if;
  return new;
end $$;
drop trigger if exists ic_structures_before on public.ic_structures;
create trigger ic_structures_before before insert or update on public.ic_structures for each row execute function public.ic_structure_before();

create or replace function public.ic_water_text(p_cm integer) returns text language sql immutable as $$
  select case when p_cm is null then '' when p_cm <= 0 then 'dry' when p_cm < 35 then 'water ankle deep' when p_cm < 75 then 'water knee deep' when p_cm < 150 then 'water waist deep' else 'water over head' end;
$$;

create or replace function public.ic_structure_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n_all integer; n_done integer; z public.ic_zones; what text;
begin
  if new.zone_id is not null then
    select count(*), count(*) filter (where status = 'searched') into n_all, n_done from public.ic_structures where zone_id = new.zone_id;
    update public.ic_zones set cleared = n_done, structures = greatest(structures, n_all) where id = new.zone_id and (cleared <> n_done or structures < n_all);
    select * into z from public.ic_zones where id = new.zone_id;
  end if;
  if new.status = 'searched' and (tg_op = 'INSERT' or old.status <> 'searched')
     and (new.people_needing_help > 0 or new.occupants in ('sheltering', 'refused') or new.damage in ('major', 'destroyed') or new.hazards <> '') then
    what := concat_ws(' · ',
      case when new.people_needing_help > 0 then new.people_needing_help || ' need help' end,
      case new.occupants when 'sheltering' then 'sheltering in place' when 'refused' then 'refused to leave' end,
      nullif(public.ic_water_text(new.water_cm), ''),
      case when new.damage in ('major', 'destroyed') then new.damage || ' damage' end,
      case when new.hazards <> '' then 'hazards ' || new.hazards end);
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'clear', coalesce(z.code, 'Outside the divisions') || ': ' || coalesce(nullif(new.label, ''), 'a structure') || ' · ' || what, 'ic_structures', new.id::text);
  end if;
  return new;
end $$;
drop trigger if exists ic_structures_after on public.ic_structures;
create trigger ic_structures_after after insert or update on public.ic_structures for each row execute function public.ic_structure_after();

-- ---------------------------------------------------------------- row level security and live updates

alter table public.ic_structures enable row level security;
drop policy if exists ic_structures_select on public.ic_structures;
create policy ic_structures_select on public.ic_structures for select to authenticated using (public.ic_is_member(incident_id));
drop policy if exists ic_structures_insert on public.ic_structures;
create policy ic_structures_insert on public.ic_structures for insert to authenticated with check (public.ic_is_member(incident_id));
drop policy if exists ic_structures_update on public.ic_structures;
create policy ic_structures_update on public.ic_structures for update to authenticated using (public.ic_is_member(incident_id)) with check (public.ic_is_member(incident_id));

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ic_structures') then
    alter publication supabase_realtime add table public.ic_structures;
  end if;
end $$;
