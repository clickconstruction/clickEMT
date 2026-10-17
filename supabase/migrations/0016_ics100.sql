-- What ICS-100 asks for that the app did not have: the Public Information Officer and the Liaison
-- Officer on the period with the agency representatives the Liaison keeps, who held command when
-- (ic_commands) and a transfer of command that tells everyone, a branch word on a division for the
-- 207, a unit's kind (engine, boat crew, swift-water team ...), and two more facility kinds.

-- ---------------------------------------------------------------- command staff: the PIO and the Liaison Officer

alter table public.ic_periods add column if not exists pio text not null default '';
alter table public.ic_periods add column if not exists liaison text not null default '';

-- the period's log line names every seat that changed; a transfer of command writes its own line (ic.quiet)
create or replace function public.ic_log_period() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.ic_quiet() then return new; end if;
  if tg_op = 'UPDATE' and new.closed_at is null and (new.ic_name, new.ops_chief, new.safety_officer, new.ends_at, new.unified, new.planning_chief, new.logistics_chief, new.finance_chief, new.pio, new.liaison)
     is distinct from (old.ic_name, old.ops_chief, old.safety_officer, old.ends_at, old.unified, old.planning_chief, old.logistics_chief, old.finance_chief, old.pio, old.liaison) then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.incident_id, auth.uid(), 'ops', 'Operational period ' || new.number || ' updated'
            || case when new.ic_name <> old.ic_name then ', Incident Commander ' || coalesce(nullif(new.ic_name, ''), 'not set') else '' end
            || case when new.ops_chief <> old.ops_chief then ', Operations ' || coalesce(nullif(new.ops_chief, ''), 'not set') else '' end
            || case when new.planning_chief <> old.planning_chief then ', Planning ' || coalesce(nullif(new.planning_chief, ''), 'not set') else '' end
            || case when new.logistics_chief <> old.logistics_chief then ', Logistics ' || coalesce(nullif(new.logistics_chief, ''), 'not set') else '' end
            || case when new.finance_chief <> old.finance_chief then ', Finance ' || coalesce(nullif(new.finance_chief, ''), 'not set') else '' end
            || case when new.safety_officer <> old.safety_officer then ', Safety ' || coalesce(nullif(new.safety_officer, ''), 'not set') else '' end
            || case when new.pio <> old.pio then ', PIO ' || coalesce(nullif(new.pio, ''), 'not set') else '' end
            || case when new.liaison <> old.liaison then ', Liaison ' || coalesce(nullif(new.liaison, ''), 'not set') else '' end
            || case when new.unified <> old.unified then ', unified command ' || coalesce(nullif(new.unified, ''), 'cleared') else '' end);
  end if;
  if tg_op = 'UPDATE' and new.sitrep is distinct from old.sitrep then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.incident_id, auth.uid(), 'ops', 'Situation report updated for operational period ' || new.number);
  end if;
  return new;
end $$;

-- the agency representatives the Liaison Officer keeps: one row per agency on scene, with a name and a phone, per period
create table if not exists public.ic_period_agencies (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.ic_incidents(id) on delete cascade,
  period_id uuid not null references public.ic_periods(id) on delete cascade,
  agency text not null,
  name text not null default '',
  phone text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (period_id, agency)
);
create index if not exists ic_period_agencies_incident on public.ic_period_agencies(incident_id, period_id);

create or replace function public.ic_period_agency_before() returns trigger language plpgsql as $$
begin
  new.agency := trim(coalesce(new.agency, ''));
  if new.agency = '' then raise exception 'name the agency'; end if;
  new.name := trim(coalesce(new.name, '')); new.phone := trim(coalesce(new.phone, ''));
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists ic_period_agencies_before on public.ic_period_agencies;
create trigger ic_period_agencies_before before insert or update on public.ic_period_agencies for each row execute function public.ic_period_agency_before();

create or replace function public.ic_period_agency_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.ic_quiet() then return new; end if;
  if tg_op = 'INSERT' or (new.name, new.phone) is distinct from (old.name, old.phone) then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.incident_id, auth.uid(), 'ops', new.agency || ' representative: ' || coalesce(nullif(new.name, ''), 'not set') || case when new.phone <> '' then ', ' || new.phone else '' end);
  end if;
  return new;
end $$;
drop trigger if exists ic_period_agencies_after on public.ic_period_agencies;
create trigger ic_period_agencies_after after insert or update on public.ic_period_agencies for each row execute function public.ic_period_agency_after();

alter table public.ic_period_agencies enable row level security;
drop policy if exists ic_period_agencies_select on public.ic_period_agencies;
create policy ic_period_agencies_select on public.ic_period_agencies for select to authenticated using (public.ic_is_member(incident_id));
drop policy if exists ic_period_agencies_insert on public.ic_period_agencies;
create policy ic_period_agencies_insert on public.ic_period_agencies for insert to authenticated with check (public.ic_is_ops(incident_id));
drop policy if exists ic_period_agencies_update on public.ic_period_agencies;
create policy ic_period_agencies_update on public.ic_period_agencies for update to authenticated using (public.ic_is_ops(incident_id)) with check (public.ic_is_ops(incident_id));
-- no delete policy

-- ---------------------------------------------------------------- who held command when, and the transfer of command

create table if not exists public.ic_commands (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.ic_incidents(id) on delete cascade,
  period_id uuid references public.ic_periods(id) on delete set null,   -- the period it started in
  ic_name text not null,
  from_name text not null default '',          -- who handed over, '' when command was first established
  ops_chief text not null default '',          -- the Operations Section Chief at the time
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  transferred_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists ic_commands_incident on public.ic_commands(incident_id, started_at desc);

alter table public.ic_commands enable row level security;
drop policy if exists ic_commands_select on public.ic_commands;
create policy ic_commands_select on public.ic_commands for select to authenticated using (public.ic_is_member(incident_id));
-- rows are written by ic_transfer_command and the period trigger alone; no insert, update or delete policy

-- The Incident Commander named on the period is who holds command. The first name establishes
-- command; a changed name on a plain save is a correction ("just change the name"), not a handover:
-- the open row is corrected in place. A handover goes through ic_transfer_command.
create or replace function public.ic_period_command() returns trigger
language plpgsql security definer set search_path = public as $$
declare cur public.ic_commands;
begin
  if public.ic_quiet() then return new; end if;
  if new.closed_at is not null or new.ic_name = '' then return new; end if;
  if tg_op = 'UPDATE' and new.ic_name = old.ic_name then return new; end if;
  select * into cur from public.ic_commands where incident_id = new.incident_id and ended_at is null order by started_at desc limit 1;
  if cur.id is null then
    insert into public.ic_commands (incident_id, period_id, ic_name, ops_chief, started_at, transferred_by) values (new.incident_id, new.id, new.ic_name, new.ops_chief, now(), auth.uid());
  elsif cur.ic_name <> new.ic_name then
    update public.ic_commands set ic_name = new.ic_name where id = cur.id;
  end if;
  return new;
end $$;
drop trigger if exists ic_periods_command on public.ic_periods;
create trigger ic_periods_command after insert or update on public.ic_periods for each row execute function public.ic_period_command();

-- the words of the message, the same in the app's preview (transferText in rules.js)
create or replace function public.ic_transfer_text(p_to text, p_ops text, p_at text) returns text language sql immutable as $$
  select 'Command transferred to ' || p_to || case when coalesce(p_at, '') <> '' then ' at ' || p_at else '' end || '.'
         || case when coalesce(p_ops, '') <> '' then ' Operations Section Chief is ' || p_ops || '.' else '' end
         || ' Your assignment, your division and your channel do not change.';
$$;

-- Transfer of command: the outgoing holder's row is closed, the incoming one opened, the period's
-- seat changed quietly, a notable line written, and (unless told not to) a safety-style message
-- sent to every unit on the incident, which each acknowledges. p_at is the local time as the
-- base's clock reads it, for the words of the message.
create or replace function public.ic_transfer_command(p_incident uuid, p_to text, p_notify boolean default true, p_at text default '', p_ops text default null)
returns public.ic_commands
language plpgsql security definer set search_path = public as $$
declare
  p public.ic_periods;
  cur public.ic_commands;
  nc public.ic_commands;
  frm text;
  who uuid[];
  ops text;
begin
  if not public.ic_is_ops(p_incident) then raise exception 'Only Operations transfers command'; end if;
  p_to := trim(coalesce(p_to, ''));
  if p_to = '' then raise exception 'name the incoming Incident Commander'; end if;
  select * into p from public.ic_periods where incident_id = p_incident and closed_at is null order by number desc limit 1;
  if p.id is null then raise exception 'Start an operational period first'; end if;
  select * into cur from public.ic_commands where incident_id = p_incident and ended_at is null order by started_at desc limit 1;
  frm := coalesce(nullif(cur.ic_name, ''), nullif(p.ic_name, ''), '');
  if frm = p_to then raise exception '% already holds command', p_to; end if;
  ops := coalesce(trim(p_ops), p.ops_chief);   -- the Operations Section Chief under the incoming IC, as the form says
  if cur.id is not null then update public.ic_commands set ended_at = now() where id = cur.id; end if;
  insert into public.ic_commands (incident_id, period_id, ic_name, from_name, ops_chief, started_at, transferred_by)
  values (p_incident, p.id, p_to, frm, ops, now(), auth.uid()) returning * into nc;
  perform set_config('ic.quiet', '1', true);
  update public.ic_periods set ic_name = p_to, ops_chief = ops where id = p.id;
  perform set_config('ic.quiet', '', true);
  insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id, notable)
  values (p_incident, auth.uid(), 'ops', 'Command transferred' || case when frm <> '' then ' from ' || frm else '' end || ' to ' || p_to
          || case when ops <> '' then ' · Operations Section Chief ' || ops else '' end, 'ic_commands', nc.id::text, true);
  if p_notify then
    select coalesce(array_agg(user_id), '{}') into who from public.ic_members where incident_id = p_incident and role = 'unit' and status <> 'checked_out';
    if coalesce(array_length(who, 1), 0) > 0 then
      insert into public.ic_messages (incident_id, from_user, to_users, to_label, kind, text)
      values (p_incident, auth.uid(), who, 'everyone', 'safety', public.ic_transfer_text(p_to, ops, p_at));
    end if;
  end if;
  return nc;
end $$;
grant execute on function public.ic_transfer_command(uuid, text, boolean, text, text) to authenticated;

-- ---------------------------------------------------------------- a branch on a division, for the 207, the 203 and the 204

alter table public.ic_zones add column if not exists branch text not null default '';

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
  if (new.work_assignment, new.instructions, new.channel, new.supervisor, new.branch) is distinct from (old.work_assignment, old.instructions, old.channel, old.supervisor, old.branch) then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', new.code || ' assignment updated'
            || case when new.channel <> old.channel then ', channel ' || coalesce(nullif(new.channel, ''), 'cleared') else '' end
            || case when new.supervisor <> old.supervisor then ', supervisor ' || coalesce(nullif(new.supervisor, ''), 'cleared') else '' end
            || case when new.branch <> old.branch then ', branch ' || coalesce(nullif(new.branch, ''), 'cleared') else '' end,
            'ic_zones', new.id::text);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- a unit's kind: the single resource ICS-100 talks about

alter table public.ic_members add column if not exists kind text not null default ''
  check (kind in ('', 'engine', 'boat', 'swift_water', 'high_water', 'ambulance', 'search', 'k9', 'drone', 'pump', 'other'));

-- the words for a kind, as UNIT_KINDS in rules.js says them
create or replace function public.ic_kind_text(p_kind text) returns text language sql immutable as $$
  select case p_kind when 'engine' then 'engine' when 'boat' then 'boat crew' when 'swift_water' then 'swift-water team' when 'high_water' then 'high-water vehicle'
                     when 'ambulance' then 'ambulance' when 'search' then 'search team' when 'k9' then 'K9 team' when 'drone' then 'drone team' when 'pump' then 'pump crew'
                     when 'other' then 'other' else '' end;
$$;

-- a changed kind is logged; the status lines and the check-out are as before
create or replace function public.ic_member_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who text := public.ic_unit_label(new.incident_id, new.user_id);
  loose text := '';
begin
  if new.kind is distinct from old.kind and not public.ic_quiet() then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.incident_id, auth.uid(), 'status', who || case when new.kind = '' then ': kind cleared' else ' is a ' || public.ic_kind_text(new.kind) end);
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

-- check-in takes the unit's kind (said in the line when given); a check-in with no kind keeps the one on record
drop function if exists public.ic_join(text, text, text, text, integer, text, jsonb);
create or replace function public.ic_join(p_code text, p_role text, p_unit_name text, p_crew text default null, p_crew_count integer default null, p_agency text default null, p_people jsonb default null, p_kind text default null)
returns public.ic_incidents
language plpgsql security definer set search_path = public as $$
declare
  r public.ic_incidents;
  person jsonb;
  nm text;
  quals text[];
  existing uuid;
  n integer;
  pr public.ic_profiles;
  k text := nullif(trim(coalesce(p_kind, '')), '');
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_role not in ('ops', 'unit') then raise exception 'role must be ops or unit'; end if;
  select * into r from public.ic_incidents i where i.code = upper(trim(p_code)) and i.status = 'active';
  if not found then raise exception 'No active incident has the code %', upper(trim(p_code)); end if;
  if p_role = 'unit' and not public.ic_profile_complete(auth.uid()) then raise exception 'Identify yourself first: your name, your phone and your licence'; end if;
  perform set_config('ic.quiet', '1', true);   -- the check-in line below says it all; no "is a boat crew" line of its own
  insert into public.ic_members (incident_id, user_id, role, unit_name, crew, crew_count, agency, status, status_at, checked_out_at, kind)
  values (r.id, auth.uid(), p_role, nullif(trim(p_unit_name), ''), nullif(trim(p_crew), ''), p_crew_count, coalesce(trim(p_agency), ''), 'available', now(), null, coalesce(k, ''))
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
  values (r.id, auth.uid(), 'ops', public.ic_unit_label(r.id, auth.uid()) || case when p_role = 'unit' and k is not null then ', ' || public.ic_kind_text(k) else '' end || ' checked in'
          || case when pr.full_name is not null and pr.full_name <> '' then ' as ' || pr.full_name || case when pr.phone <> '' then ', ' || pr.phone else '' end
                  || case pr.id_source when 'scan' then ', licence scanned' when 'photo' then ', licence photographed' when 'typed' then ', licence typed' else '' end
                  || case when pr.verified_at is not null then ', verified' else '' end else '' end
          || case when n is not null and (p_people is not null or p_crew_count is not null) then ' with ' || n || case when n = 1 then ' person' else ' people' end else '' end);
  return r;
end $$;
grant execute on function public.ic_join(text, text, text, text, integer, text, jsonb, text) to authenticated;

-- ---------------------------------------------------------------- the next period carries the new seats and the agency representatives

drop function if exists public.ic_start_period(uuid, timestamptz, text, text, text, text, boolean, text, text, text, text);
create or replace function public.ic_start_period(p_incident uuid, p_ends_at timestamptz default null, p_ic text default '', p_ops text default '', p_safety text default '', p_notes text default '', p_carry boolean default true,
                                                   p_planning text default '', p_logistics text default '', p_finance text default '', p_unified text default '', p_pio text default '', p_liaison text default '')
returns public.ic_periods
language plpgsql security definer set search_path = public as $$
declare
  cur public.ic_periods;
  np public.ic_periods;
  o record;
  n integer := 0;
  newid uuid;
begin
  if not public.ic_is_ops(p_incident) then raise exception 'Only Operations starts a period'; end if;
  select * into cur from public.ic_periods where incident_id = p_incident and closed_at is null order by number desc limit 1;
  insert into public.ic_periods (incident_id, number, starts_at, ends_at, ic_name, ops_chief, safety_officer, notes, planning_chief, logistics_chief, finance_chief, unified, pio, liaison)
  values (p_incident, coalesce(cur.number, (select coalesce(max(number), 0) from public.ic_periods where incident_id = p_incident)) + 1, now(), p_ends_at,
          coalesce(trim(p_ic), ''), coalesce(trim(p_ops), ''), coalesce(trim(p_safety), ''), coalesce(trim(p_notes), ''),
          coalesce(trim(p_planning), ''), coalesce(trim(p_logistics), ''), coalesce(trim(p_finance), ''), coalesce(trim(p_unified), ''), coalesce(trim(p_pio), ''), coalesce(trim(p_liaison), ''))
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
grant execute on function public.ic_start_period(uuid, timestamptz, text, text, text, text, boolean, text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------- two more facility kinds: Camp and Helibase

alter table public.ic_facilities drop constraint if exists ic_facilities_kind_check;
alter table public.ic_facilities add constraint ic_facilities_kind_check check (kind in ('icp', 'staging', 'base', 'camp', 'shelter', 'pod', 'hospital', 'helibase', 'helispot', 'other'));

create or replace function public.ic_facility_kind_text(p_kind text) returns text language sql immutable as $$
  select case p_kind when 'icp' then 'Command post' when 'staging' then 'Staging area' when 'base' then 'Base' when 'camp' then 'Camp' when 'shelter' then 'Shelter'
                     when 'pod' then 'Point of distribution' when 'hospital' then 'Hospital' when 'helibase' then 'Helibase' when 'helispot' then 'Helispot' else 'Facility' end;
$$;

-- ---------------------------------------------------------------- live updates

do $$
declare t text;
begin
  foreach t in array array['ic_period_agencies', 'ic_commands'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
