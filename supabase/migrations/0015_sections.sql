-- Planning, Logistics and Finance get their seats and their work: the three section chiefs on
-- the period, resource requests (ICS 213RR) worked to filled or declined, and a check-out list a
-- unit ticks when it leaves, with what it left undone riding along to the base.

-- ---------------------------------------------------------------- the command and general staff

alter table public.ic_periods add column if not exists planning_chief text not null default '';
alter table public.ic_periods add column if not exists logistics_chief text not null default '';
alter table public.ic_periods add column if not exists finance_chief text not null default '';

create or replace function public.ic_log_period() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.closed_at is null and (new.ic_name, new.ops_chief, new.safety_officer, new.ends_at, new.unified, new.planning_chief, new.logistics_chief, new.finance_chief)
     is distinct from (old.ic_name, old.ops_chief, old.safety_officer, old.ends_at, old.unified, old.planning_chief, old.logistics_chief, old.finance_chief) then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.incident_id, auth.uid(), 'ops', 'Operational period ' || new.number || ' updated'
            || case when new.ic_name <> old.ic_name then ', Incident Commander ' || coalesce(nullif(new.ic_name, ''), 'not set') else '' end
            || case when new.ops_chief <> old.ops_chief then ', Operations ' || coalesce(nullif(new.ops_chief, ''), 'not set') else '' end
            || case when new.planning_chief <> old.planning_chief then ', Planning ' || coalesce(nullif(new.planning_chief, ''), 'not set') else '' end
            || case when new.logistics_chief <> old.logistics_chief then ', Logistics ' || coalesce(nullif(new.logistics_chief, ''), 'not set') else '' end
            || case when new.finance_chief <> old.finance_chief then ', Finance ' || coalesce(nullif(new.finance_chief, ''), 'not set') else '' end
            || case when new.safety_officer <> old.safety_officer then ', Safety ' || coalesce(nullif(new.safety_officer, ''), 'not set') else '' end
            || case when new.unified <> old.unified then ', unified command ' || coalesce(nullif(new.unified, ''), 'cleared') else '' end);
  end if;
  if tg_op = 'UPDATE' and new.sitrep is distinct from old.sitrep then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.incident_id, auth.uid(), 'ops', 'Situation report updated for operational period ' || new.number);
  end if;
  return new;
end $$;

-- the next period starts with every seat carried over, unless the form says otherwise
drop function if exists public.ic_start_period(uuid, timestamptz, text, text, text, text, boolean);
create or replace function public.ic_start_period(p_incident uuid, p_ends_at timestamptz default null, p_ic text default '', p_ops text default '', p_safety text default '', p_notes text default '', p_carry boolean default true,
                                                   p_planning text default '', p_logistics text default '', p_finance text default '', p_unified text default '')
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
  insert into public.ic_periods (incident_id, number, starts_at, ends_at, ic_name, ops_chief, safety_officer, notes, planning_chief, logistics_chief, finance_chief, unified)
  values (p_incident, coalesce(cur.number, (select coalesce(max(number), 0) from public.ic_periods where incident_id = p_incident)) + 1, now(), p_ends_at,
          coalesce(trim(p_ic), ''), coalesce(trim(p_ops), ''), coalesce(trim(p_safety), ''), coalesce(trim(p_notes), ''),
          coalesce(trim(p_planning), ''), coalesce(trim(p_logistics), ''), coalesce(trim(p_finance), ''), coalesce(trim(p_unified), ''))
  returning * into np;
  if cur.id is not null then
    update public.ic_periods set closed_at = now() where id = cur.id;
    if p_carry then
      perform set_config('ic.quiet', '1', true);
      for o in select * from public.ic_objectives where period_id = cur.id and done_at is null order by number loop
        n := n + 1;
        insert into public.ic_objectives (incident_id, period_id, number, text) values (p_incident, np.id, n, o.text) returning id into newid;
        update public.ic_zones set objective_id = newid where objective_id = o.id;
      end loop;
      perform set_config('ic.quiet', '', true);
    end if;
  end if;
  update public.ic_incidents set current_period_id = np.id, period = 'OP ' || np.number where id = p_incident;
  insert into public.ic_events (incident_id, user_id, kind, text)
  values (p_incident, auth.uid(), 'ops', 'Operational period ' || np.number || ' started'
          || case when np.ic_name <> '' then ', Incident Commander ' || np.ic_name else '' end
          || case when n > 0 then ', ' || n || ' objective' || case when n = 1 then '' else 's' end || ' carried over' else '' end);
  return np;
end $$;
grant execute on function public.ic_start_period(uuid, timestamptz, text, text, text, text, boolean, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------- resource requests, ICS 213RR

create table if not exists public.ic_requests (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.ic_incidents(id) on delete cascade,
  user_id uuid not null references auth.users(id),          -- who asked
  zone_id uuid references public.ic_zones(id) on delete set null,
  kind text not null default 'other' check (kind in ('people', 'water', 'medical', 'fuel', 'equipment', 'supplies', 'other')),
  what text not null,
  quantity integer not null default 1 check (quantity >= 1 and quantity <= 9999),
  urgency text not null default '' check (urgency in ('', 'now', 'nightfall', 'tomorrow')),
  note text not null default '',
  lat double precision,
  lng double precision,
  status text not null default 'asked' check (status in ('asked', 'approved', 'ordered', 'filled', 'declined')),
  answer text not null default '',                          -- who is coming and when, or why not
  status_by uuid references auth.users(id),
  status_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists ic_requests_incident on public.ic_requests(incident_id, created_at desc);

create or replace function public.ic_request_line(r public.ic_requests) returns text language sql immutable as $$
  select case when r.quantity > 1 then r.quantity || ' ' else '' end || r.what
$$;

create or replace function public.ic_request_before() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.what := trim(coalesce(new.what, ''));
  if new.what = '' then raise exception 'say what is needed'; end if;
  if tg_op = 'INSERT' then
    new.user_id := coalesce(new.user_id, auth.uid());
    new.status := 'asked'; new.answer := ''; new.status_by := null; new.status_at := null;
  elsif new.status is distinct from old.status or new.answer is distinct from old.answer then
    new.status_by := auth.uid(); new.status_at := now();
  end if;
  return new;
end $$;
drop trigger if exists ic_requests_before on public.ic_requests;
create trigger ic_requests_before before insert or update on public.ic_requests for each row execute function public.ic_request_before();

create or replace function public.ic_request_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who text := public.ic_unit_label(new.incident_id, new.user_id);
  z text := (select code from public.ic_zones where id = new.zone_id);
  urg text := public.ic_urgency_label(new.urgency);
begin
  if tg_op = 'INSERT' then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, new.user_id, 'request', who || ' asked for ' || public.ic_request_line(new)
            || case when z is not null then ' for ' || z else '' end || case when urg <> '' then ', ' || urg else '' end
            || case when new.note <> '' then ': ' || new.note else '' end, 'ic_requests', new.id::text);
  elsif new.status is distinct from old.status then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'request', 'Request for ' || public.ic_request_line(new) || ' (' || who || ') '
            || case new.status when 'approved' then 'approved' when 'ordered' then 'ordered' when 'filled' then 'filled' when 'declined' then 'could not be filled' else 'asked again' end
            || case when new.answer <> '' then ': ' || new.answer else '' end, 'ic_requests', new.id::text);
  elsif new.answer is distinct from old.answer and new.answer <> '' then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'request', 'Request for ' || public.ic_request_line(new) || ' (' || who || '): ' || new.answer, 'ic_requests', new.id::text);
  end if;
  return new;
end $$;
drop trigger if exists ic_requests_after on public.ic_requests;
create trigger ic_requests_after after insert or update on public.ic_requests for each row execute function public.ic_request_after();

alter table public.ic_requests enable row level security;
drop policy if exists ic_requests_select on public.ic_requests;
create policy ic_requests_select on public.ic_requests for select to authenticated using (public.ic_is_member(incident_id));
drop policy if exists ic_requests_insert on public.ic_requests;
create policy ic_requests_insert on public.ic_requests for insert to authenticated with check (public.ic_is_member(incident_id) and user_id = auth.uid());
-- Operations works a request; the unit that asked may only withdraw it (archive) while it is still asked
drop policy if exists ic_requests_update on public.ic_requests;
create policy ic_requests_update on public.ic_requests for update to authenticated
  using (public.ic_is_ops(incident_id) or (user_id = auth.uid() and status = 'asked'))
  with check (public.ic_is_ops(incident_id) or (user_id = auth.uid() and status = 'asked'));
-- no delete policy

-- ---------------------------------------------------------------- the check-out list

alter table public.ic_members add column if not exists demob jsonb;   -- {ticks: {people: true, ...}, open: ['radio and equipment not yet returned'], note: ''}

create or replace function public.ic_check_out(p_incident uuid, p_demob jsonb default null)
returns public.ic_members
language plpgsql security definer set search_path = public as $$
declare r public.ic_members;
begin
  update public.ic_members set demob = p_demob, status = 'checked_out', status_note = ''
    where incident_id = p_incident and user_id = auth.uid() returning * into r;
  if not found then raise exception 'Not on this incident'; end if;
  return r;
end $$;
grant execute on function public.ic_check_out(uuid, jsonb) to authenticated;

-- the check-out line carries what was left undone and the note for the next crew
create or replace function public.ic_member_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who text := public.ic_unit_label(new.incident_id, new.user_id);
  loose text := '';
begin
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

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ic_requests') then
    execute 'alter publication supabase_realtime add table public.ic_requests';
  end if;
end $$;
