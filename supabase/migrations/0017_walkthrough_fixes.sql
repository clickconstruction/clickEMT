-- Walkthrough fixes (v25). Two rules change in the database so the app and any other client agree:
-- a unit checks in with a name and a phone alone (a volunteer handed a phone at the shelter door has
-- no licence to scan), marked "identity not given" in the check-in line for Operations to verify in
-- person; and a boat ramp is a facility kind, so a boat crew finds where to put in.

-- ---------------------------------------------------------------- a boat ramp is a facility

alter table public.ic_facilities drop constraint if exists ic_facilities_kind_check;
alter table public.ic_facilities add constraint ic_facilities_kind_check check (kind in ('icp', 'staging', 'base', 'camp', 'shelter', 'pod', 'hospital', 'ramp', 'helibase', 'helispot', 'other'));

create or replace function public.ic_facility_kind_text(p_kind text) returns text language sql immutable as $$
  select case p_kind when 'icp' then 'Command post' when 'staging' then 'Staging area' when 'base' then 'Base' when 'camp' then 'Camp' when 'shelter' then 'Shelter'
                     when 'pod' then 'Point of distribution' when 'hospital' then 'Hospital' when 'ramp' then 'Boat ramp' when 'helibase' then 'Helibase' when 'helispot' then 'Helispot' else 'Facility' end;
$$;

-- ---------------------------------------------------------------- check in with a name and a phone

-- ready to check in: a name and a phone. The licence (ic_profile_complete) is the identity; without
-- it the check-in line says "identity not given" and Operations verifies in person (ic_verify_profile).
create or replace function public.ic_profile_ready(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ic_profiles p where p.user_id = p_user and p.full_name <> '' and p.phone <> '')
$$;
grant execute on function public.ic_profile_ready(uuid) to authenticated;

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
  if p_role = 'unit' and not public.ic_profile_ready(auth.uid()) then raise exception 'Say who you are first: your name and your phone'; end if;
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
                  || case when pr.photo_path is null and pr.licence_number = '' then ', identity not given'
                       else case pr.id_source when 'scan' then ', licence scanned' when 'photo' then ', licence photographed' when 'typed' then ', licence typed' else '' end end
                  || case when pr.verified_at is not null then ', verified' else '' end else '' end
          || case when n is not null and (p_people is not null or p_crew_count is not null) then ' with ' || n || case when n = 1 then ' person' else ' people' end else '' end);
  return r;
end $$;
grant execute on function public.ic_join(text, text, text, text, integer, text, jsonb, text) to authenticated;
