-- Incident map: the tables both views share. Everything is scoped to an incident, and a user sees
-- an incident only as one of its members (ic_members). The prefix ic_ keeps these apart from the
-- charity app's tables in the same database. Rules that both views must obey live here, as
-- triggers and functions, not in the apps: the activity log (ic_events) is written by triggers.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables

create table if not exists public.ic_incidents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,                 -- the join code field phones type in
  period text,                               -- operational period label, e.g. "OP 3 · 07:00–19:00"
  base_name text,                            -- the base or forward operating base
  center_lat double precision,
  center_lng double precision,
  zoom integer not null default 14,
  boundary jsonb,                            -- GeoJSON Polygon, or null until Operations draws it
  status text not null default 'active' check (status in ('active', 'closed')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.ic_members (
  incident_id uuid not null references public.ic_incidents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('ops', 'unit')),
  unit_name text,                            -- "Unit 3"
  crew text,                                 -- "Ramirez, Okafor"
  joined_at timestamptz not null default now(),
  primary key (incident_id, user_id)
);

create table if not exists public.ic_zones (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.ic_incidents(id) on delete cascade,
  code text not null,                        -- "B-2": division letter, zone number
  name text not null default '',
  priority integer not null default 2 check (priority between 1 and 3),
  status text not null default 'open' check (status in ('open', 'active', 'cleared')),
  hazard boolean not null default false,
  assigned_to uuid references auth.users(id),
  structures integer not null default 0,
  cleared integer not null default 0,
  cleared_at timestamptz,
  marking jsonb,                             -- the search marking the team painted: team, out, hazards, victims
  polygon jsonb not null,                    -- GeoJSON Polygon
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (incident_id, code)
);

create table if not exists public.ic_positions (   -- one row per unit: where it is now
  incident_id uuid not null references public.ic_incidents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  heading double precision,
  accuracy double precision,
  at timestamptz not null default now(),
  primary key (incident_id, user_id)
);

create table if not exists public.ic_photos (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.ic_incidents(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  zone_id uuid references public.ic_zones(id) on delete set null,
  lat double precision,
  lng double precision,
  heading double precision,                  -- compass heading the camera faced, degrees from north
  note text not null default '',
  storage_path text not null,                -- object in the ic-photos bucket: <incident>/<user>/<photo>.jpg
  taken_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.ic_hazards (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.ic_incidents(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  zone_id uuid references public.ic_zones(id) on delete set null,
  kind text not null,
  note text not null default '',
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.ic_alerts (      -- "need help now"
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.ic_incidents(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  zone_id uuid references public.ic_zones(id) on delete set null,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id),
  stood_down_at timestamptz
);

create table if not exists public.ic_events (      -- the activity log (ICS 214), written by triggers
  id bigint generated always as identity primary key,
  incident_id uuid not null references public.ic_incidents(id) on delete cascade,
  user_id uuid,
  kind text not null,                        -- photo | clear | hazard | ops | help | note
  text text not null,
  ref_table text,
  ref_id text,
  at timestamptz not null default now()
);

create index if not exists ic_zones_incident on public.ic_zones(incident_id);
create index if not exists ic_photos_incident on public.ic_photos(incident_id, taken_at desc);
create index if not exists ic_hazards_incident on public.ic_hazards(incident_id);
create index if not exists ic_alerts_incident on public.ic_alerts(incident_id, created_at desc);
create index if not exists ic_events_incident on public.ic_events(incident_id, at desc);

-- ---------------------------------------------------------------- membership helpers

create or replace function public.ic_is_member(p_incident uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ic_members m where m.incident_id = p_incident and m.user_id = auth.uid());
$$;

create or replace function public.ic_is_ops(p_incident uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ic_members m where m.incident_id = p_incident and m.user_id = auth.uid() and m.role = 'ops');
$$;

create or replace function public.ic_unit_label(p_incident uuid, p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select case when m.role = 'ops' then 'Operations' else coalesce(m.unit_name, 'A unit') end
                   from public.ic_members m where m.incident_id = p_incident and m.user_id = p_user), 'Someone');
$$;

-- ---------------------------------------------------------------- create and join

create or replace function public.ic_create_incident(p_name text, p_period text, p_base_name text,
                                                      p_lat double precision, p_lng double precision, p_zoom integer default 14)
returns public.ic_incidents
language plpgsql security definer set search_path = public as $$
declare
  r public.ic_incidents;
  c text;
  alpha constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   -- no 0/O or 1/I
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'the incident needs a name'; end if;
  loop
    select string_agg(substr(alpha, 1 + floor(random() * length(alpha))::int, 1), '') into c from generate_series(1, 6);
    exit when not exists (select 1 from public.ic_incidents i where i.code = c);
  end loop;
  insert into public.ic_incidents (name, code, period, base_name, center_lat, center_lng, zoom, created_by)
  values (trim(p_name), c, nullif(trim(p_period), ''), nullif(trim(p_base_name), ''), p_lat, p_lng, coalesce(p_zoom, 14), auth.uid())
  returning * into r;
  insert into public.ic_members (incident_id, user_id, role, unit_name) values (r.id, auth.uid(), 'ops', 'Operations');
  insert into public.ic_events (incident_id, user_id, kind, text) values (r.id, auth.uid(), 'ops', 'Incident opened: ' || r.name);
  return r;
end $$;

create or replace function public.ic_join(p_code text, p_role text, p_unit_name text, p_crew text default null)
returns public.ic_incidents
language plpgsql security definer set search_path = public as $$
declare
  r public.ic_incidents;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_role not in ('ops', 'unit') then raise exception 'role must be ops or unit'; end if;
  select * into r from public.ic_incidents i where i.code = upper(trim(p_code)) and i.status = 'active';
  if not found then raise exception 'No active incident has the code %', upper(trim(p_code)); end if;
  insert into public.ic_members (incident_id, user_id, role, unit_name, crew)
  values (r.id, auth.uid(), p_role, nullif(trim(p_unit_name), ''), nullif(trim(p_crew), ''))
  on conflict (incident_id, user_id) do update
    set role = excluded.role, unit_name = coalesce(excluded.unit_name, ic_members.unit_name), crew = coalesce(excluded.crew, ic_members.crew);
  insert into public.ic_events (incident_id, user_id, kind, text)
  values (r.id, auth.uid(), 'ops', public.ic_unit_label(r.id, auth.uid()) || ' checked in');
  return r;
end $$;

grant execute on function public.ic_create_incident(text, text, text, double precision, double precision, integer) to authenticated;
grant execute on function public.ic_join(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------- the log, written by triggers

create or replace function public.ic_log_zone() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who text := public.ic_unit_label(new.incident_id, auth.uid());
begin
  if tg_op = 'INSERT' then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', 'Zone ' || new.code || ' drawn, priority ' || new.priority, 'ic_zones', new.id::text);
    return new;
  end if;
  if new.status = 'cleared' and old.status <> 'cleared' then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'clear',
            new.code || ' marked clear (' || new.structures || ' of ' || new.structures || ')'
            || case when coalesce((new.marking ->> 'victims')::int, 0) > 0 then ', ' || (new.marking ->> 'victims') || ' found needing help' else '' end,
            'ic_zones', new.id::text);
  elsif new.cleared <> old.cleared and new.status <> 'cleared' then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'clear', 'Structure cleared in ' || new.code || ' (' || new.cleared || ' of ' || new.structures || ')', 'ic_zones', new.id::text);
  elsif new.status = 'open' and old.status = 'cleared' then
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
    values (new.incident_id, auth.uid(), 'ops', 'Zone ' || old.code || ' is now ' || new.code || case when new.name <> '' then ' · ' || new.name else '' end, 'ic_zones', new.id::text);
  end if;
  return new;
end $$;

drop trigger if exists ic_zones_log on public.ic_zones;
create trigger ic_zones_log after insert or update on public.ic_zones for each row execute function public.ic_log_zone();

create or replace function public.ic_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists ic_zones_touch on public.ic_zones;
create trigger ic_zones_touch before update on public.ic_zones for each row execute function public.ic_touch();

create or replace function public.ic_zone_code(p_zone uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select z.code from public.ic_zones z where z.id = p_zone), 'the field');
$$;

create or replace function public.ic_compass(p_heading double precision) returns text language sql immutable as $$
  select case when p_heading is null then '' else
    (array['N','NE','E','SE','S','SW','W','NW'])[1 + (round(p_heading / 45)::int % 8)] || ' ' || lpad(round(p_heading)::int::text, 3, '0') || '°' end;
$$;

create or replace function public.ic_log_photo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
  values (new.incident_id, new.user_id, 'photo',
          public.ic_unit_label(new.incident_id, new.user_id) || ' sent a photo from ' || public.ic_zone_code(new.zone_id)
          || case when new.heading is null then '' else ', facing ' || public.ic_compass(new.heading) end
          || case when new.note <> '' then ': ' || new.note else '' end,
          'ic_photos', new.id::text);
  return new;
end $$;
drop trigger if exists ic_photos_log on public.ic_photos;
create trigger ic_photos_log after insert on public.ic_photos for each row execute function public.ic_log_photo();

create or replace function public.ic_log_hazard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, new.user_id, 'hazard',
            'Hazard in ' || public.ic_zone_code(new.zone_id) || ': ' || lower(new.kind) || case when new.note <> '' then ' (' || new.note || ')' else '' end
            || ', reported by ' || public.ic_unit_label(new.incident_id, new.user_id),
            'ic_hazards', new.id::text);
    if new.zone_id is not null then update public.ic_zones set hazard = true where id = new.zone_id and not hazard; end if;
  elsif new.resolved_at is not null and old.resolved_at is null then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'hazard', 'Hazard resolved in ' || public.ic_zone_code(new.zone_id) || ': ' || lower(new.kind), 'ic_hazards', new.id::text);
  end if;
  return new;
end $$;
drop trigger if exists ic_hazards_log on public.ic_hazards;
create trigger ic_hazards_log after insert or update on public.ic_hazards for each row execute function public.ic_log_hazard();

create or replace function public.ic_log_alert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, new.user_id, 'help', 'EMERGENCY, ' || public.ic_unit_label(new.incident_id, new.user_id) || ' needs help in ' || public.ic_zone_code(new.zone_id), 'ic_alerts', new.id::text);
  elsif new.stood_down_at is not null and old.stood_down_at is null then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, new.user_id, 'help', public.ic_unit_label(new.incident_id, new.user_id) || ' stood down, all OK', 'ic_alerts', new.id::text);
  elsif new.acknowledged_at is not null and old.acknowledged_at is null then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, new.acknowledged_by, 'help', 'Operations acknowledged the emergency from ' || public.ic_unit_label(new.incident_id, new.user_id), 'ic_alerts', new.id::text);
  end if;
  return new;
end $$;
drop trigger if exists ic_alerts_log on public.ic_alerts;
create trigger ic_alerts_log after insert or update on public.ic_alerts for each row execute function public.ic_log_alert();

create or replace function public.ic_log_incident() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.boundary is distinct from old.boundary then
    insert into public.ic_events (incident_id, user_id, kind, text) values (new.id, auth.uid(), 'ops', 'Incident boundary redrawn');
  end if;
  if new.status = 'closed' and old.status <> 'closed' then
    insert into public.ic_events (incident_id, user_id, kind, text) values (new.id, auth.uid(), 'ops', 'Incident closed');
  end if;
  return new;
end $$;
drop trigger if exists ic_incidents_log on public.ic_incidents;
create trigger ic_incidents_log after update on public.ic_incidents for each row execute function public.ic_log_incident();

-- ---------------------------------------------------------------- row level security

alter table public.ic_incidents enable row level security;
alter table public.ic_members   enable row level security;
alter table public.ic_zones     enable row level security;
alter table public.ic_positions enable row level security;
alter table public.ic_photos    enable row level security;
alter table public.ic_hazards   enable row level security;
alter table public.ic_alerts    enable row level security;
alter table public.ic_events    enable row level security;

drop policy if exists ic_incidents_select on public.ic_incidents;
create policy ic_incidents_select on public.ic_incidents for select to authenticated using (public.ic_is_member(id));
drop policy if exists ic_incidents_update on public.ic_incidents;
create policy ic_incidents_update on public.ic_incidents for update to authenticated using (public.ic_is_ops(id)) with check (public.ic_is_ops(id));

drop policy if exists ic_members_select on public.ic_members;
create policy ic_members_select on public.ic_members for select to authenticated using (public.ic_is_member(incident_id));
drop policy if exists ic_members_update_own on public.ic_members;
create policy ic_members_update_own on public.ic_members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists ic_zones_select on public.ic_zones;
create policy ic_zones_select on public.ic_zones for select to authenticated using (public.ic_is_member(incident_id));
drop policy if exists ic_zones_insert on public.ic_zones;
create policy ic_zones_insert on public.ic_zones for insert to authenticated with check (public.ic_is_ops(incident_id));
drop policy if exists ic_zones_update on public.ic_zones;
create policy ic_zones_update on public.ic_zones for update to authenticated using (public.ic_is_member(incident_id)) with check (public.ic_is_member(incident_id));

drop policy if exists ic_positions_select on public.ic_positions;
create policy ic_positions_select on public.ic_positions for select to authenticated using (public.ic_is_member(incident_id));
drop policy if exists ic_positions_write on public.ic_positions;
create policy ic_positions_write on public.ic_positions for insert to authenticated with check (user_id = auth.uid() and public.ic_is_member(incident_id));
drop policy if exists ic_positions_update on public.ic_positions;
create policy ic_positions_update on public.ic_positions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists ic_photos_select on public.ic_photos;
create policy ic_photos_select on public.ic_photos for select to authenticated using (public.ic_is_member(incident_id));
drop policy if exists ic_photos_insert on public.ic_photos;
create policy ic_photos_insert on public.ic_photos for insert to authenticated with check (user_id = auth.uid() and public.ic_is_member(incident_id));

drop policy if exists ic_hazards_select on public.ic_hazards;
create policy ic_hazards_select on public.ic_hazards for select to authenticated using (public.ic_is_member(incident_id));
drop policy if exists ic_hazards_insert on public.ic_hazards;
create policy ic_hazards_insert on public.ic_hazards for insert to authenticated with check (user_id = auth.uid() and public.ic_is_member(incident_id));
drop policy if exists ic_hazards_update on public.ic_hazards;
create policy ic_hazards_update on public.ic_hazards for update to authenticated using (public.ic_is_member(incident_id)) with check (public.ic_is_member(incident_id));

drop policy if exists ic_alerts_select on public.ic_alerts;
create policy ic_alerts_select on public.ic_alerts for select to authenticated using (public.ic_is_member(incident_id));
drop policy if exists ic_alerts_insert on public.ic_alerts;
create policy ic_alerts_insert on public.ic_alerts for insert to authenticated with check (user_id = auth.uid() and public.ic_is_member(incident_id));
drop policy if exists ic_alerts_update on public.ic_alerts;
create policy ic_alerts_update on public.ic_alerts for update to authenticated using (user_id = auth.uid() or public.ic_is_ops(incident_id)) with check (user_id = auth.uid() or public.ic_is_ops(incident_id));

drop policy if exists ic_events_select on public.ic_events;
create policy ic_events_select on public.ic_events for select to authenticated using (public.ic_is_member(incident_id));
drop policy if exists ic_events_insert on public.ic_events;
create policy ic_events_insert on public.ic_events for insert to authenticated with check (user_id = auth.uid() and kind = 'note' and public.ic_is_member(incident_id));

-- ---------------------------------------------------------------- photos bucket

insert into storage.buckets (id, name, public) values ('ic-photos', 'ic-photos', false) on conflict (id) do nothing;

create or replace function public.ic_folder_incident(p_name text) returns uuid language sql immutable as $$
  select case when (storage.foldername(p_name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then (storage.foldername(p_name))[1]::uuid end;
$$;

drop policy if exists ic_photos_bucket_read on storage.objects;
create policy ic_photos_bucket_read on storage.objects for select to authenticated
  using (bucket_id = 'ic-photos' and public.ic_is_member(public.ic_folder_incident(name)));
drop policy if exists ic_photos_bucket_write on storage.objects;
create policy ic_photos_bucket_write on storage.objects for insert to authenticated
  with check (bucket_id = 'ic-photos' and public.ic_is_member(public.ic_folder_incident(name)));

-- ---------------------------------------------------------------- live updates

do $$
declare t text;
begin
  foreach t in array array['ic_incidents', 'ic_members', 'ic_zones', 'ic_positions', 'ic_photos', 'ic_hazards', 'ic_alerts', 'ic_events'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
