-- Who is behind an account: a name, a phone and a driver's licence, given once per account and
-- shown to Operations of any incident the person is on. A unit cannot check in without one.
-- The licence's front is kept in the private ic-ids bucket; the barcode on its back fills the
-- fields when the phone can read it. Operations marks a profile verified after looking.

create table if not exists public.ic_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text not null default '',
  licence_number text not null default '',
  licence_state text not null default '',
  licence_expires date,
  date_of_birth date,
  address text not null default '',
  id_source text not null default '' check (id_source in ('', 'scan', 'photo', 'typed')),
  photo_path text,                             -- <user_id>/licence.jpg in ic-ids, the front
  verified_at timestamptz,
  verified_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Operations of an incident the person is on may see them
create or replace function public.ic_sees_profile(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user = auth.uid() or exists (
    select 1 from public.ic_members me join public.ic_members them on them.incident_id = me.incident_id
    where me.user_id = auth.uid() and me.role = 'ops' and them.user_id = p_user)
$$;

-- a complete profile: a name, a phone and a licence, scanned, photographed or typed
create or replace function public.ic_profile_complete(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ic_profiles p where p.user_id = p_user and p.full_name <> '' and p.phone <> '' and (p.photo_path is not null or p.licence_number <> ''))
$$;

create or replace function public.ic_profile_before() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.full_name := trim(coalesce(new.full_name, ''));
  new.phone := trim(coalesce(new.phone, ''));
  new.licence_number := upper(trim(coalesce(new.licence_number, '')));
  new.licence_state := upper(trim(coalesce(new.licence_state, '')));
  if tg_op = 'INSERT' then
    new.verified_at := null; new.verified_by := null;
  elsif (new.verified_at, new.verified_by) is distinct from (old.verified_at, old.verified_by) and coalesce(current_setting('ic.verifying', true), '') <> 'on' then
    raise exception 'Only Operations marks a profile verified';
  elsif (new.full_name, new.licence_number, new.licence_state, new.photo_path, new.date_of_birth) is distinct from (old.full_name, old.licence_number, old.licence_state, old.photo_path, old.date_of_birth)
        and (new.verified_at, new.verified_by) is not distinct from (old.verified_at, old.verified_by) then
    new.verified_at := null; new.verified_by := null;   -- what was verified has changed
  end if;
  return new;
end $$;
drop trigger if exists ic_profiles_before on public.ic_profiles;
create trigger ic_profiles_before before insert or update on public.ic_profiles for each row execute function public.ic_profile_before();

alter table public.ic_profiles enable row level security;
drop policy if exists ic_profiles_select on public.ic_profiles;
create policy ic_profiles_select on public.ic_profiles for select to authenticated using (public.ic_sees_profile(user_id));
drop policy if exists ic_profiles_insert on public.ic_profiles;
create policy ic_profiles_insert on public.ic_profiles for insert to authenticated with check (user_id = auth.uid());
drop policy if exists ic_profiles_update on public.ic_profiles;
create policy ic_profiles_update on public.ic_profiles for update to authenticated using (public.ic_sees_profile(user_id)) with check (public.ic_sees_profile(user_id));
-- no delete policy

-- Operations marks a profile verified, or withdraws it, and the incident's log says so
create or replace function public.ic_verify_profile(p_incident uuid, p_user uuid, p_ok boolean)
returns public.ic_profiles
language plpgsql security definer set search_path = public as $$
declare r public.ic_profiles;
begin
  if not public.ic_is_ops(p_incident) then raise exception 'Only Operations verifies'; end if;
  if not exists (select 1 from public.ic_members where incident_id = p_incident and user_id = p_user) then raise exception 'Not on this incident'; end if;
  perform set_config('ic.verifying', 'on', true);
  update public.ic_profiles set verified_at = case when p_ok then now() end, verified_by = case when p_ok then auth.uid() end
    where user_id = p_user returning * into r;
  perform set_config('ic.verifying', '', true);
  if not found then raise exception 'No profile to verify'; end if;
  insert into public.ic_events (incident_id, user_id, kind, text)
  values (p_incident, auth.uid(), 'ops', public.ic_unit_label(p_incident, p_user) || ' (' || r.full_name || ') ' || case when p_ok then 'identity verified by Operations' else 'identity verification withdrawn' end);
  return r;
end $$;
grant execute on function public.ic_verify_profile(uuid, uuid, boolean) to authenticated;

-- the bucket for the licence fronts: your own folder, read by you and by Operations where you are
insert into storage.buckets (id, name, public, file_size_limit) values ('ic-ids', 'ic-ids', false, 10485760) on conflict (id) do nothing;
drop policy if exists ic_ids_bucket_read on storage.objects;
create policy ic_ids_bucket_read on storage.objects for select to authenticated
  using (bucket_id = 'ic-ids' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and public.ic_sees_profile(((storage.foldername(name))[1])::uuid));
drop policy if exists ic_ids_bucket_write on storage.objects;
create policy ic_ids_bucket_write on storage.objects for insert to authenticated
  with check (bucket_id = 'ic-ids' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists ic_ids_bucket_rewrite on storage.objects;
create policy ic_ids_bucket_rewrite on storage.objects for update to authenticated
  using (bucket_id = 'ic-ids' and (storage.foldername(name))[1] = auth.uid()::text);

-- a unit checks in only once it has said who it is; the log line says how
create or replace function public.ic_join(p_code text, p_role text, p_unit_name text, p_crew text default null, p_crew_count integer default null, p_agency text default null, p_people jsonb default null)
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
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_role not in ('ops', 'unit') then raise exception 'role must be ops or unit'; end if;
  select * into r from public.ic_incidents i where i.code = upper(trim(p_code)) and i.status = 'active';
  if not found then raise exception 'No active incident has the code %', upper(trim(p_code)); end if;
  if p_role = 'unit' and not public.ic_profile_complete(auth.uid()) then raise exception 'Identify yourself first: your name, your phone and your licence'; end if;
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
  values (r.id, auth.uid(), 'ops', public.ic_unit_label(r.id, auth.uid()) || ' checked in'
          || case when pr.full_name is not null and pr.full_name <> '' then ' as ' || pr.full_name || case when pr.phone <> '' then ', ' || pr.phone else '' end
                  || case pr.id_source when 'scan' then ', licence scanned' when 'photo' then ', licence photographed' when 'typed' then ', licence typed' else '' end
                  || case when pr.verified_at is not null then ', verified' else '' end else '' end
          || case when n is not null and (p_people is not null or p_crew_count is not null) then ' with ' || n || case when n = 1 then ' person' else ' people' end else '' end);
  return r;
end $$;
grant execute on function public.ic_join(text, text, text, text, integer, text, jsonb) to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ic_profiles') then
    execute 'alter publication supabase_realtime add table public.ic_profiles';
  end if;
end $$;
