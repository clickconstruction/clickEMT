-- Time in the water, incident settings and the public set (v28). A boat crew had no way to show how
-- long it had been in the water and the Safety Officer could not see who was past the rotation; the
-- administrator had nowhere to put the Google Maps key; the Public Information Officer could not write
-- a public caption or record that a photo was checked.
--
-- A unit's water clock is one stamp (ic_members.in_water_since), set and cleared by the unit or
-- Operations, ended by a check-out, each a line with the minutes. The rotation is on the period
-- (ic_periods.rotation_minutes, default 45, carried into the next period, 0 off), printed on the 204
-- and 208. The incident's settings are one JSON column (ic_incidents.settings): the Google Maps browser
-- key, how many days personal records are kept after the close (v27's clock reads it), the default
-- rotation; they are copied into the next incident the same account opens, and the log says a key was
-- set, never the key. A photo gains a public caption and a check (public_checked_by / _at) by Operations.

-- ---------------------------------------------------------------- time in the water

alter table public.ic_members add column if not exists in_water_since timestamptz;
alter table public.ic_periods add column if not exists rotation_minutes integer not null default 45 check (rotation_minutes between 0 and 600);

-- ---------------------------------------------------------------- incident settings

alter table public.ic_incidents add column if not exists settings jsonb not null default '{}'::jsonb;

-- the name the log calls Operations by: the account's profile name, else "Operations"
create or replace function public.ic_actor_name(p_incident uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(p.full_name, '') from public.ic_profiles p where p.user_id = auth.uid()), public.ic_unit_label(p_incident, auth.uid()));
$$;

-- a new incident takes the settings of the last one the same account opened
create or replace function public.ic_incident_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.settings is null or new.settings = '{}'::jsonb then
    new.settings := coalesce((select i.settings from public.ic_incidents i where i.created_by = new.created_by and i.settings <> '{}'::jsonb order by i.created_at desc limit 1), '{}'::jsonb);
  end if;
  return new;
end $$;
drop trigger if exists ic_incidents_before_insert on public.ic_incidents;
create trigger ic_incidents_before_insert before insert on public.ic_incidents for each row execute function public.ic_incident_before_insert();

-- closing starts the clock, for as many days as the settings say (30 unless set); reopening stops it
create or replace function public.ic_incident_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare days integer := greatest(1, coalesce(nullif(new.settings ->> 'retention_days', '')::int, 30));
begin
  if new.status = 'closed' and old.status <> 'closed' and new.clear_personal_at is null and new.personal_cleared_at is null then
    new.clear_personal_at := now() + make_interval(days => days);
  elsif new.status = 'active' and old.status = 'closed' and new.personal_cleared_at is null then
    new.clear_personal_at := null;
  end if;
  return new;
end $$;

create or replace function public.ic_log_incident() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text := public.ic_actor_name(new.id);
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
  -- the settings: what changed, never the key itself
  if coalesce(new.settings ->> 'maps_key', '') is distinct from coalesce(old.settings ->> 'maps_key', '') then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.id, auth.uid(), 'ops', who || case when coalesce(new.settings ->> 'maps_key', '') = '' then ' cleared the Google Maps key' else ' set the Google Maps key' end);
  end if;
  if coalesce(new.settings ->> 'retention_days', '') is distinct from coalesce(old.settings ->> 'retention_days', '') then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.id, auth.uid(), 'ops', who || ' set personal records to clear ' || coalesce(nullif(new.settings ->> 'retention_days', ''), '30') || ' days after the close');
  end if;
  if coalesce(new.settings ->> 'rotation_minutes', '') is distinct from coalesce(old.settings ->> 'rotation_minutes', '') then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.id, auth.uid(), 'ops', who || ' set the default rotation to ' || coalesce(nullif(new.settings ->> 'rotation_minutes', ''), '45') || ' minutes in the water');
  end if;
  return new;
end $$;

-- period 1 of a new incident takes the settings' default rotation
create or replace function public.ic_period_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare d integer;
begin
  select nullif(i.settings ->> 'rotation_minutes', '')::int into d from public.ic_incidents i where i.id = new.incident_id;
  if new.number = 1 and d is not null and d between 0 and 600 then new.rotation_minutes := d; end if;
  return new;
end $$;
drop trigger if exists ic_periods_before_insert on public.ic_periods;
create trigger ic_periods_before_insert before insert on public.ic_periods for each row execute function public.ic_period_before_insert();

-- a changed rotation is one line of its own (ic_log_period, 0016, keeps its list of seats)
create or replace function public.ic_log_period_rotation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.rotation_minutes is distinct from old.rotation_minutes and not public.ic_quiet() then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.incident_id, auth.uid(), 'ops', 'Operational period ' || new.number || case when new.rotation_minutes = 0 then ': rotation in the water turned off' else ': rotation in the water every ' || new.rotation_minutes || ' minutes' end);
  end if;
  return new;
end $$;
drop trigger if exists ic_periods_rotation_log on public.ic_periods;
create trigger ic_periods_rotation_log after update of rotation_minutes on public.ic_periods for each row execute function public.ic_log_period_rotation();

-- the next period carries the rotation unless the form says otherwise
drop function if exists public.ic_start_period(uuid, timestamptz, text, text, text, text, boolean, text, text, text, text, text, text);
create or replace function public.ic_start_period(p_incident uuid, p_ends_at timestamptz default null, p_ic text default '', p_ops text default '', p_safety text default '', p_notes text default '', p_carry boolean default true,
                                                   p_planning text default '', p_logistics text default '', p_finance text default '', p_unified text default '', p_pio text default '', p_liaison text default '', p_rotation integer default null)
returns public.ic_periods
language plpgsql security definer set search_path = public as $$
declare
  cur public.ic_periods;
  np public.ic_periods;
  o record;
  n integer := 0;
  newid uuid;
  rot integer;
begin
  if not public.ic_is_ops(p_incident) then raise exception 'Only Operations starts a period'; end if;
  select * into cur from public.ic_periods where incident_id = p_incident and closed_at is null order by number desc limit 1;
  rot := coalesce(p_rotation, cur.rotation_minutes, (select nullif(i.settings ->> 'rotation_minutes', '')::int from public.ic_incidents i where i.id = p_incident), 45);
  if rot < 0 or rot > 600 then raise exception 'The rotation is 0 (off) to 600 minutes'; end if;
  insert into public.ic_periods (incident_id, number, starts_at, ends_at, ic_name, ops_chief, safety_officer, notes, planning_chief, logistics_chief, finance_chief, unified, pio, liaison, rotation_minutes)
  values (p_incident, coalesce(cur.number, (select coalesce(max(number), 0) from public.ic_periods where incident_id = p_incident)) + 1, now(), p_ends_at,
          coalesce(trim(p_ic), ''), coalesce(trim(p_ops), ''), coalesce(trim(p_safety), ''), coalesce(trim(p_notes), ''),
          coalesce(trim(p_planning), ''), coalesce(trim(p_logistics), ''), coalesce(trim(p_finance), ''), coalesce(trim(p_unified), ''), coalesce(trim(p_pio), ''), coalesce(trim(p_liaison), ''), rot)
  returning * into np;
  if cur.id is not null then
    update public.ic_periods set closed_at = now() where id = cur.id;
    perform set_config('ic.quiet', '1', true);
    insert into public.ic_period_agencies (incident_id, period_id, agency, name, phone)
      select incident_id, np.id, agency, name, phone from public.ic_period_agencies where period_id = cur.id and archived_at is null;
    if p_carry then
      for o in select * from public.ic_objectives where period_id = cur.id and done_at is null order by number loop
        n := n + 1;
        insert into public.ic_objectives (incident_id, period_id, number, text) values (p_incident, np.id, n, o.text) returning id into newid;
        update public.ic_zones set objective_id = newid where objective_id = o.id;
      end loop;
    end if;
    perform set_config('ic.quiet', '', true);
  end if;
  update public.ic_incidents set current_period_id = np.id, period = 'OP ' || np.number where id = p_incident;
  insert into public.ic_events (incident_id, user_id, kind, text)
  values (p_incident, auth.uid(), 'ops', 'Operational period ' || np.number || ' started'
          || case when np.ic_name <> '' then ', Incident Commander ' || np.ic_name else '' end
          || case when n > 0 then ', ' || n || ' objective' || case when n = 1 then '' else 's' end || ' carried over' else '' end);
  return np;
end $$;
grant execute on function public.ic_start_period(uuid, timestamptz, text, text, text, text, boolean, text, text, text, text, text, text, integer) to authenticated;

-- ---------------------------------------------------------------- the water clock on the member

-- Before: a check-out or a removal ends the clock. Then roles, removal and the stamps as in 0019.
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
  if new.in_water_since is not null and new.in_water_since > now() + interval '5 minutes' then new.in_water_since := now(); end if;   -- a phone clock ahead
  select count(*), count(*) filter (where p.checked_out_at is null), string_agg(p.name, ', ' order by p.checked_in_at, p.created_at) filter (where p.checked_out_at is null)
    into total, n, names
    from public.ic_people p where p.incident_id = new.incident_id and p.user_id = new.user_id and p.archived_at is null;
  if total > 0 then new.crew := names; new.crew_count := n; end if;
  return new;
end $$;

-- After: in and out of the water are one line each, with the minutes; then removal, restore, role, kind
-- and status as in 0019.
create or replace function public.ic_member_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who text := public.ic_unit_label(new.incident_id, new.user_id);
  nm text := (select nullif(p.full_name, '') from public.ic_profiles p where p.user_id = new.user_id);
  loose text := '';
  mins integer;
begin
  if new.in_water_since is distinct from old.in_water_since then
    if new.in_water_since is not null and old.in_water_since is null then
      insert into public.ic_events (incident_id, user_id, kind, text) values (new.incident_id, auth.uid(), 'status', who || ' in the water');
    elsif new.in_water_since is null and old.in_water_since is not null then
      mins := greatest(0, round(extract(epoch from (now() - old.in_water_since)) / 60))::int;
      insert into public.ic_events (incident_id, user_id, kind, text) values (new.incident_id, auth.uid(), 'status', who || ' out of the water after ' || mins || ' min');
    end if;
  end if;
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

-- ---------------------------------------------------------------- the public set

alter table public.ic_photos add column if not exists public_caption text not null default '';   -- the words the public sees; never coordinates, never the unit's own note
alter table public.ic_photos add column if not exists public_checked_by uuid references auth.users(id);   -- Operations (or the PIO at the base) looked: no face, no plate, no house number
alter table public.ic_photos add column if not exists public_checked_at timestamptz;

create or replace function public.ic_photo_public_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.public_caption := trim(coalesce(new.public_caption, ''));
  if new.public_checked_at is not null and old.public_checked_at is null then new.public_checked_by := coalesce(auth.uid(), new.public_checked_by);
  elsif new.public_checked_at is null then new.public_checked_by := null; end if;
  if not new.public_ok and old.public_ok then new.public_checked_at := null; new.public_checked_by := null; end if;   -- withdrawn: the check goes with it
  return new;
end $$;
drop trigger if exists ic_photos_public_before on public.ic_photos;
create trigger ic_photos_public_before before update on public.ic_photos for each row execute function public.ic_photo_public_before();

create or replace function public.ic_log_photo_public() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text := 'Photo from ' || public.ic_unit_label(new.incident_id, new.user_id);
begin
  if new.public_ok is distinct from old.public_ok then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', who || case when new.public_ok then ' cleared for public information' else ' withdrawn from public information' end, 'ic_photos', new.id::text);
  end if;
  if new.public_caption is distinct from old.public_caption then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', who || case when new.public_caption = '' then ': public caption cleared' else ', public caption: ' || new.public_caption end, 'ic_photos', new.id::text);
  end if;
  if (new.public_checked_at is null) is distinct from (old.public_checked_at is null) then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', who || case when new.public_checked_at is not null then ' checked for public release: no face, no plate, no house number' else ': public release check withdrawn' end, 'ic_photos', new.id::text);
  end if;
  return new;
end $$;
