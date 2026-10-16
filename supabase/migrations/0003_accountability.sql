-- Accountability: a unit's resource status as ICS names it (assigned, available, out of service,
-- checked out), the people on it, its agency, and check-out. Assignment sets the status: a zone
-- assigned to a unit makes it assigned, releasing or clearing its last active zone makes it
-- available, and a unit that checks out gives its zones back. Every status change is logged.
-- The PAR (Personnel Accountability Report) is a message of kind 'par' answered with a head count.

alter table public.ic_members add column if not exists status text not null default 'available'
  check (status in ('assigned', 'available', 'out_of_service', 'checked_out'));
alter table public.ic_members add column if not exists status_note text not null default '';
alter table public.ic_members add column if not exists status_at timestamptz not null default now();
alter table public.ic_members add column if not exists crew_count integer check (crew_count is null or crew_count between 0 and 99);
alter table public.ic_members add column if not exists agency text not null default '';
alter table public.ic_members add column if not exists checked_out_at timestamptz;

-- units already assigned a zone are assigned
update public.ic_members m set status = 'assigned'
  where m.role = 'unit' and m.status = 'available'
    and exists (select 1 from public.ic_zones z where z.incident_id = m.incident_id and z.assigned_to = m.user_id and z.status = 'active');

-- ---------------------------------------------------------------- check-in carries the crew and the agency

drop function if exists public.ic_join(text, text, text, text);
create or replace function public.ic_join(p_code text, p_role text, p_unit_name text, p_crew text default null, p_crew_count integer default null, p_agency text default null)
returns public.ic_incidents
language plpgsql security definer set search_path = public as $$
declare
  r public.ic_incidents;
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
  insert into public.ic_events (incident_id, user_id, kind, text)
  values (r.id, auth.uid(), 'ops', public.ic_unit_label(r.id, auth.uid()) || ' checked in'
          || case when p_crew_count is not null then ' with ' || p_crew_count || case when p_crew_count = 1 then ' person' else ' people' end else '' end);
  return r;
end $$;
grant execute on function public.ic_join(text, text, text, text, integer, text) to authenticated;

-- ---------------------------------------------------------------- status changes: stamps, the log, giving zones back

create or replace function public.ic_member_before() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    new.status_at := now();
    if new.status = 'checked_out' then new.checked_out_at := now(); else new.checked_out_at := null; end if;
    if new.status <> 'out_of_service' then new.status_note := ''; end if;
  end if;
  return new;
end $$;
drop trigger if exists ic_members_before on public.ic_members;
create trigger ic_members_before before update on public.ic_members for each row execute function public.ic_member_before();

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
    end if;
  end if;
  return new;
end $$;
drop trigger if exists ic_members_after on public.ic_members;
create trigger ic_members_after after update on public.ic_members for each row execute function public.ic_member_after();

-- a zone's assignment or clearing sets its unit's status
create or replace function public.ic_zone_sets_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null then
    update public.ic_members set status = 'assigned'
      where incident_id = new.incident_id and user_id = new.assigned_to and status in ('available', 'assigned') and status <> 'assigned';
  end if;
  if old.assigned_to is not null and (new.assigned_to is distinct from old.assigned_to or (new.status = 'cleared' and old.status <> 'cleared')) then
    if not exists (select 1 from public.ic_zones z where z.incident_id = new.incident_id and z.assigned_to = old.assigned_to and z.status = 'active' and z.id <> new.id)
       and not (new.assigned_to = old.assigned_to and new.status = 'active') then
      update public.ic_members set status = 'available'
        where incident_id = new.incident_id and user_id = old.assigned_to and status = 'assigned';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists ic_zones_status on public.ic_zones;
create trigger ic_zones_status after update on public.ic_zones for each row execute function public.ic_zone_sets_status();

-- ---------------------------------------------------------------- Operations may set a unit's status

drop policy if exists ic_members_update_ops on public.ic_members;
create policy ic_members_update_ops on public.ic_members for update to authenticated using (public.ic_is_ops(incident_id)) with check (public.ic_is_ops(incident_id));
