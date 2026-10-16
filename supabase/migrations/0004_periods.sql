-- Operational periods and objectives (ICS 202). An incident runs in numbered periods, each with
-- its command names and objectives; a zone can say which objective it serves. Starting the next
-- period closes the current one and carries its open objectives forward, moving the zones with
-- them. Objectives and period changes are logged by trigger.

create table if not exists public.ic_periods (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.ic_incidents(id) on delete cascade,
  number integer not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,                        -- planned end
  closed_at timestamptz,                      -- set when the next period starts
  ic_name text not null default '',           -- Incident Commander
  ops_chief text not null default '',         -- Operations Section Chief
  safety_officer text not null default '',
  notes text not null default '',             -- the period's safety message and notes (ICS 208, light)
  created_at timestamptz not null default now(),
  unique (incident_id, number)
);

create table if not exists public.ic_objectives (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.ic_incidents(id) on delete cascade,
  period_id uuid not null references public.ic_periods(id) on delete cascade,
  number integer not null,
  text text not null,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.ic_incidents add column if not exists current_period_id uuid references public.ic_periods(id) on delete set null;
alter table public.ic_zones add column if not exists objective_id uuid references public.ic_objectives(id) on delete set null;
create index if not exists ic_objectives_period on public.ic_objectives(period_id, number);

-- ---------------------------------------------------------------- the log

-- Carry-over inserts objectives silently: the period's own log line says how many came over.
create or replace function public.ic_quiet() returns boolean language sql stable as $$
  select coalesce(current_setting('ic.quiet', true), '') = '1';
$$;

create or replace function public.ic_log_objective() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.ic_quiet() then return new; end if;
  if tg_op = 'INSERT' then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', 'Objective ' || new.number || ' set: ' || new.text, 'ic_objectives', new.id::text);
  elsif new.done_at is not null and old.done_at is null then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', 'Objective ' || new.number || ' done: ' || new.text, 'ic_objectives', new.id::text);
  elsif new.done_at is null and old.done_at is not null then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', 'Objective ' || new.number || ' reopened', 'ic_objectives', new.id::text);
  elsif new.text <> old.text then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', 'Objective ' || new.number || ' is now: ' || new.text, 'ic_objectives', new.id::text);
  end if;
  return new;
end $$;
drop trigger if exists ic_objectives_log on public.ic_objectives;
create trigger ic_objectives_log after insert or update on public.ic_objectives for each row execute function public.ic_log_objective();

create or replace function public.ic_log_period() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.closed_at is null and (new.ic_name, new.ops_chief, new.safety_officer, new.ends_at) is distinct from (old.ic_name, old.ops_chief, old.safety_officer, old.ends_at) then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.incident_id, auth.uid(), 'ops', 'Operational period ' || new.number || ' updated'
            || case when new.ic_name <> old.ic_name then ', Incident Commander ' || coalesce(nullif(new.ic_name, ''), 'not set') else '' end
            || case when new.ops_chief <> old.ops_chief then ', Operations ' || coalesce(nullif(new.ops_chief, ''), 'not set') else '' end
            || case when new.safety_officer <> old.safety_officer then ', Safety ' || coalesce(nullif(new.safety_officer, ''), 'not set') else '' end);
  end if;
  return new;
end $$;
drop trigger if exists ic_periods_log on public.ic_periods;
create trigger ic_periods_log after update on public.ic_periods for each row execute function public.ic_log_period();

-- ---------------------------------------------------------------- starting a period

create or replace function public.ic_start_period(p_incident uuid, p_ends_at timestamptz default null, p_ic text default '', p_ops text default '', p_safety text default '', p_notes text default '', p_carry boolean default true)
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
  insert into public.ic_periods (incident_id, number, starts_at, ends_at, ic_name, ops_chief, safety_officer, notes)
  values (p_incident, coalesce(cur.number, (select coalesce(max(number), 0) from public.ic_periods where incident_id = p_incident)) + 1, now(), p_ends_at,
          coalesce(trim(p_ic), ''), coalesce(trim(p_ops), ''), coalesce(trim(p_safety), ''), coalesce(trim(p_notes), ''))
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
grant execute on function public.ic_start_period(uuid, timestamptz, text, text, text, text, boolean) to authenticated;

-- a new incident opens in operational period 1
create or replace function public.ic_create_incident(p_name text, p_period text, p_base_name text,
                                                      p_lat double precision, p_lng double precision, p_zoom integer default 14)
returns public.ic_incidents
language plpgsql security definer set search_path = public as $$
declare
  r public.ic_incidents;
  p public.ic_periods;
  c text;
  alpha constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'the incident needs a name'; end if;
  loop
    select string_agg(substr(alpha, 1 + floor(random() * length(alpha))::int, 1), '') into c from generate_series(1, 6);
    exit when not exists (select 1 from public.ic_incidents i where i.code = c);
  end loop;
  insert into public.ic_incidents (name, code, period, base_name, center_lat, center_lng, zoom, created_by)
  values (trim(p_name), c, coalesce(nullif(trim(p_period), ''), 'OP 1'), nullif(trim(p_base_name), ''), p_lat, p_lng, coalesce(p_zoom, 14), auth.uid())
  returning * into r;
  insert into public.ic_members (incident_id, user_id, role, unit_name) values (r.id, auth.uid(), 'ops', 'Operations');
  insert into public.ic_periods (incident_id, number) values (r.id, 1) returning * into p;
  update public.ic_incidents set current_period_id = p.id where id = r.id returning * into r;
  insert into public.ic_events (incident_id, user_id, kind, text) values (r.id, auth.uid(), 'ops', 'Incident opened: ' || r.name || ', operational period 1');
  return r;
end $$;

-- ---------------------------------------------------------------- row level security

alter table public.ic_periods enable row level security;
alter table public.ic_objectives enable row level security;

drop policy if exists ic_periods_select on public.ic_periods;
create policy ic_periods_select on public.ic_periods for select to authenticated using (public.ic_is_member(incident_id));
drop policy if exists ic_periods_update on public.ic_periods;
create policy ic_periods_update on public.ic_periods for update to authenticated using (public.ic_is_ops(incident_id)) with check (public.ic_is_ops(incident_id));

drop policy if exists ic_objectives_select on public.ic_objectives;
create policy ic_objectives_select on public.ic_objectives for select to authenticated using (public.ic_is_member(incident_id));
drop policy if exists ic_objectives_insert on public.ic_objectives;
create policy ic_objectives_insert on public.ic_objectives for insert to authenticated with check (public.ic_is_ops(incident_id));
drop policy if exists ic_objectives_update on public.ic_objectives;
create policy ic_objectives_update on public.ic_objectives for update to authenticated using (public.ic_is_ops(incident_id)) with check (public.ic_is_ops(incident_id));

-- ---------------------------------------------------------------- live updates

do $$
declare t text;
begin
  foreach t in array array['ic_periods', 'ic_objectives'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
