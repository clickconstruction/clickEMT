-- Facilities and the communications plan (ICS 205 and 206, light). Facilities are the places an
-- incident runs from and sends people to: the command post, staging areas, the base, shelters,
-- points of distribution, hospitals, helispots. The communications plan is a list on the
-- incident: which channel for what. Opening, closing and changing them is logged.

create table if not exists public.ic_facilities (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.ic_incidents(id) on delete cascade,
  kind text not null check (kind in ('icp', 'staging', 'base', 'shelter', 'pod', 'hospital', 'helispot', 'other')),
  name text not null default '',
  lat double precision not null,
  lng double precision not null,
  notes text not null default '',
  contact text not null default '',           -- who to call, a channel or a phone number
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists ic_facilities_incident on public.ic_facilities(incident_id);

alter table public.ic_incidents add column if not exists channels jsonb not null default '[]'::jsonb;

create or replace function public.ic_facility_kind_text(p_kind text) returns text language sql immutable as $$
  select case p_kind when 'icp' then 'Command post' when 'staging' then 'Staging area' when 'base' then 'Base' when 'shelter' then 'Shelter'
                     when 'pod' then 'Point of distribution' when 'hospital' then 'Hospital' when 'helispot' then 'Helispot' else 'Facility' end;
$$;

create or replace function public.ic_facility_before() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then new.created_by := coalesce(new.created_by, auth.uid()); end if;
  return new;
end $$;
drop trigger if exists ic_facilities_before on public.ic_facilities;
create trigger ic_facilities_before before insert or update on public.ic_facilities for each row execute function public.ic_facility_before();

create or replace function public.ic_facility_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare what text := public.ic_facility_kind_text(new.kind) || case when new.name <> '' then ': ' || new.name else '' end;
begin
  if tg_op = 'INSERT' then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', what || ' opened', 'ic_facilities', new.id::text);
  elsif new.closed_at is not null and old.closed_at is null then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', what || ' closed', 'ic_facilities', new.id::text);
  elsif new.closed_at is null and old.closed_at is not null then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', what || ' reopened', 'ic_facilities', new.id::text);
  elsif (new.name, new.kind, new.contact) is distinct from (old.name, old.kind, old.contact) then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', what || ' updated', 'ic_facilities', new.id::text);
  end if;
  return new;
end $$;
drop trigger if exists ic_facilities_after on public.ic_facilities;
create trigger ic_facilities_after after insert or update on public.ic_facilities for each row execute function public.ic_facility_after();

-- the communications plan is logged with the incident's other changes
create or replace function public.ic_log_incident() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.boundary is distinct from old.boundary then
    insert into public.ic_events (incident_id, user_id, kind, text) values (new.id, auth.uid(), 'ops', 'Incident boundary redrawn');
  end if;
  if new.channels is distinct from old.channels then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.id, auth.uid(), 'ops', 'Communications plan updated: ' || coalesce((select string_agg(coalesce(c ->> 'use', '') || ' ' || coalesce(c ->> 'channel', ''), ', ') from jsonb_array_elements(new.channels) c), 'no channels'));
  end if;
  if new.status = 'closed' and old.status <> 'closed' then
    insert into public.ic_events (incident_id, user_id, kind, text) values (new.id, auth.uid(), 'ops', 'Incident closed');
  end if;
  return new;
end $$;

alter table public.ic_facilities enable row level security;
drop policy if exists ic_facilities_select on public.ic_facilities;
create policy ic_facilities_select on public.ic_facilities for select to authenticated using (public.ic_is_member(incident_id));
drop policy if exists ic_facilities_insert on public.ic_facilities;
create policy ic_facilities_insert on public.ic_facilities for insert to authenticated with check (public.ic_is_ops(incident_id));
drop policy if exists ic_facilities_update on public.ic_facilities;
create policy ic_facilities_update on public.ic_facilities for update to authenticated using (public.ic_is_ops(incident_id)) with check (public.ic_is_ops(incident_id));

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ic_facilities') then
    alter publication supabase_realtime add table public.ic_facilities;
  end if;
end $$;
