-- The check-in head count, put back (v57). Migration 0032 (v55, bands at check-in) rewrote ic_join from a body older
-- than 0021 (v29), and 0033 (v56, invitations) carried that body forward, so three things v29 built were lost on the
-- real database while the mock kept them: the unnamed (a crew of four that names two was counted as two, on the
-- base, in the check-in line and in every PAR), ic.join staying on through the roster (so the roster's own names
-- are not taken off the unnamed), and the clock stamps that keep the crew in the order typed. The rule tests
-- parbyname.sql and people.sql caught it; joincount.sql checks the three ways in (the code, a band on a person,
-- an invitation). This is 0033's ic_join with those three put back; nothing else changes. No unit checked in on the
-- real database while 0032 and 0033 stood (no check-in line in ic_events since), so no count was left short.
--
-- ic_join is redefined by every migration that touches the check-in: start the next one from this body.

-- ---------------------------------------------------------------- the unnamed, the roster under ic.join, the order typed
create or replace function public.ic_join(p_code text, p_role text, p_unit_name text, p_crew text default null, p_crew_count integer default null, p_agency text default null, p_people jsonb default null, p_kind text default null, p_invite text default null)
returns public.ic_incidents
language plpgsql security definer set search_path = public as $$
declare
  r public.ic_incidents;
  m public.ic_members;
  v public.ic_invites;
  person jsonb;
  nm text;
  quals text[];
  existing uuid;
  n integer;
  named integer := 0;
  unnamed integer;
  pr public.ic_profiles;
  k text := nullif(trim(coalesce(p_kind, '')), '');
  jc text := upper(trim(coalesce(p_code, '')));   -- the code as typed
  new_role text;
  band text;
  tg public.ic_tags;
  my_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if nullif(trim(coalesce(p_invite, '')), '') is not null then
    select * into v from public.ic_invites where token = trim(p_invite);
    if not found then raise exception 'That invitation is not on record; ask Operations for a new one'; end if;
    if v.withdrawn_at is not null then raise exception 'That invitation was withdrawn; ask Operations for a new one'; end if;
    if v.accepted_at is not null and v.accepted_by <> auth.uid() then raise exception 'That invitation was used already; ask Operations for a new one'; end if;
    if v.expires_at < now() and v.accepted_at is null then raise exception 'That invitation has expired; ask Operations to send it again'; end if;
    if my_email <> v.email then raise exception 'That invitation is for %; sign in with that address', v.email; end if;
    select * into r from public.ic_incidents i where i.id = v.incident_id and i.status = 'active';
    if not found then raise exception 'That incident is closed'; end if;
    new_role := v.role;
    if p_unit_name is null or trim(p_unit_name) = '' then p_unit_name := v.unit_name; end if;
  else
    if p_role not in ('ops', 'unit') then raise exception 'role must be ops or unit'; end if;
    select i.* into r from public.ic_incidents i join public.ic_ops_codes o on o.incident_id = i.id where o.code = jc and i.status = 'active';
    if found then
      new_role := 'ops';
    else
      select * into r from public.ic_incidents i where i.code = jc and i.status = 'active';
      if not found then raise exception 'No active incident has the code %', jc; end if;
      if p_role = 'ops' then raise exception 'That is the join code for field units. Operations joins with the Operations code, shown on the Operations home panel.'; end if;
      new_role := 'unit';
      if r.invite_only and not exists (select 1 from public.ic_members x where x.incident_id = r.id and x.user_id = auth.uid() and x.removed_at is null) then
        raise exception 'This incident is by invitation; ask Operations for one';
      end if;
    end if;
  end if;
  select * into m from public.ic_members where incident_id = r.id and user_id = auth.uid();
  if m.removed_at is not null then raise exception 'You were removed from % by Operations. Only Operations can put you back.', r.name; end if;
  if auth.uid() = r.created_by then new_role := 'ops'; end if;
  if new_role = 'unit' and not public.ic_profile_ready(auth.uid()) then raise exception 'Say who you are first: your name and your phone'; end if;
  perform set_config('ic.quiet', '1', true);   -- the check-in line below says it all; no "is a boat crew" line of its own
  perform set_config('ic.join', '1', true);    -- the role may change here, by the code
  insert into public.ic_members (incident_id, user_id, role, unit_name, crew, crew_count, agency, status, status_at, checked_out_at, kind)
  values (r.id, auth.uid(), new_role, case when new_role = 'ops' then coalesce(nullif(trim(p_unit_name), ''), 'Operations') else nullif(trim(p_unit_name), '') end, nullif(trim(p_crew), ''), p_crew_count, coalesce(trim(p_agency), ''), 'available', now(), null, coalesce(k, ''))
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
  if v.id is not null and v.accepted_at is null then
    update public.ic_invites set accepted_at = now(), accepted_by = auth.uid(), user_id = auth.uid() where id = v.id;   -- under ic.join; the trigger writes the line
  end if;
  -- ic.join stays on through the roster: these names were counted off already (ic_person_after takes one off the
  -- unnamed only for a person named later)
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
        insert into public.ic_people (incident_id, user_id, name, role, qualifications, notes, checked_in_at, created_at)
        values (r.id, auth.uid(), nm, coalesce(trim(person ->> 'role'), ''), quals, coalesce(person ->> 'notes', ''), clock_timestamp(), clock_timestamp())   -- stamped in the order typed, so the crew reads in that order
        returning id into existing;
      end if;
      band := upper(trim(coalesce(person ->> 'band', '')));
      if band <> '' then
        select * into tg from public.ic_tags t where t.incident_id = r.id and (t.code = band or (band ~ '^[0-9]{1,5}$' and t.number = band::integer));
        if not found then raise exception 'No band % on this incident', band; end if;
        if tg.voided_at is not null then raise exception '% was voided', public.ic_band_label(tg.number); end if;
        if tg.person_id = existing then
          null;
        elsif tg.person_id is not null or tg.evacuee_id is not null then
          raise exception '% is on % already', public.ic_band_label(tg.number), public.ic_tag_who(tg);
        else
          if exists (select 1 from public.ic_tags t where t.person_id = existing and t.voided_at is null) then raise exception '% has a band already; void it first', nm; end if;
          update public.ic_tags set person_id = existing where id = tg.id;
        end if;
        insert into public.ic_seen (incident_id, tag_id, kind) values (r.id, tg.id, 'check_in');
      end if;
    end loop;
  end if;
  perform set_config('ic.join', '', true);
  -- "How many with you?" is the whole crew: everyone on record for the unit comes off it, the rest are unnamed
  if p_crew_count is not null then
    select count(*) into named from public.ic_people p where p.incident_id = r.id and p.user_id = auth.uid() and p.archived_at is null and p.checked_out_at is null;
    unnamed := greatest(0, p_crew_count - named);
    update public.ic_members set unnamed_count = unnamed where incident_id = r.id and user_id = auth.uid();
  end if;
  select crew_count into n from public.ic_members where incident_id = r.id and user_id = auth.uid();
  select * into pr from public.ic_profiles where user_id = auth.uid();
  insert into public.ic_events (incident_id, user_id, kind, text)
  values (r.id, auth.uid(), 'ops', public.ic_unit_label(r.id, auth.uid()) || case when new_role = 'unit' and k is not null then ', ' || public.ic_kind_text(k) else '' end
          || case when new_role = 'ops' then case when v.id is not null then ' joined as Operations by invitation' else ' joined as Operations with the Operations code' end else ' checked in' || case when v.id is not null then ' by invitation' else '' end end
          || case when pr.full_name is not null and pr.full_name <> '' then ' as ' || pr.full_name || case when pr.phone <> '' then ', ' || pr.phone else '' end
                  || case when pr.photo_path is null and pr.licence_number = '' then ', identity not given'
                       else case pr.id_source when 'scan' then ', licence scanned' when 'photo' then ', licence photographed' when 'typed' then ', licence typed' else '' end end
                  || case when pr.verified_at is not null then ', verified' else '' end else '' end
          || case when n is not null and (p_people is not null or p_crew_count is not null) then ' with ' || n || case when n = 1 then ' person' else ' people' end else '' end);
  return r;
end $$;

grant execute on function public.ic_join(text, text, text, text, integer, text, jsonb, text, text) to authenticated;
