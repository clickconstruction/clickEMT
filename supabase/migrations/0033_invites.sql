-- Invite by email (v56). Operations (or whoever opened the incident) invites a person to an incident with a role:
-- the Edge Function `invite` (supabase/functions/invite) writes the row here, makes the account or a sign-in link
-- through Supabase Auth, and sends one email with one link. The link lands the person in the field app (a unit)
-- or the base (Operations) with ?invite=<token>; signed in, the app calls ic_join with the token in place of the
-- code, so every rule that guards a join guards this too. An invitation expires after seven days, is sent again
-- or withdrawn (never deleted), and the 214 has each step. ic_incidents.invite_only turns the units' join code
-- off: the door then says the incident is by invitation. Invitations double as the roster: the ones an account
-- sent on earlier incidents can be sent to a new one in one press (ic_roster).

alter table public.ic_incidents add column if not exists invite_only boolean not null default false;

create table if not exists public.ic_invites (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.ic_incidents(id) on delete cascade,
  email text not null,
  role text not null default 'unit' check (role in ('unit', 'ops')),
  unit_name text not null default '',
  token text not null unique,                           -- in the link; a new one on every send
  invited_by uuid references auth.users(id),
  user_id uuid references auth.users(id),               -- the account the function made or found for the email
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  sends integer not null default 0,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  withdrawn_at timestamptz,
  withdrawn_by uuid references auth.users(id),
  last_error text not null default ''                   -- why the last send failed, for the Members tab
);
create index if not exists ic_invites_incident on public.ic_invites(incident_id);
create index if not exists ic_invites_email on public.ic_invites(lower(email));

-- the state of an invitation, in a word (inviteState in rules.js says the same)
create or replace function public.ic_invite_state(i public.ic_invites) returns text language sql immutable as $$
  select case when i.withdrawn_at is not null then 'withdrawn' when i.accepted_at is not null then 'accepted' when i.expires_at < now() then 'expired' when i.sent_at is null then 'unsent' else 'pending' end;
$$;

-- a random token for the link: 24 letters and digits from the join code's alphabet
create or replace function public.ic_invite_token() returns text language plpgsql as $$
declare alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; t text := '';
begin
  while length(t) < 24 loop t := t || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1); end loop;
  return t;
end $$;

create or replace function public.ic_invite_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.email := lower(trim(coalesce(new.email, '')));
  new.unit_name := trim(coalesce(new.unit_name, ''));
  if new.email = '' or new.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'an email address is needed'; end if;
  if tg_op = 'INSERT' then
    if not public.ic_is_ops(new.incident_id) and coalesce(current_setting('ic.system', true), '') <> '1' then raise exception 'Only Operations invites people'; end if;
    new.invited_by := coalesce(auth.uid(), new.invited_by);
    new.token := coalesce(nullif(new.token, ''), public.ic_invite_token());
    if exists (select 1 from public.ic_invites x where x.incident_id = new.incident_id and x.email = new.email and x.withdrawn_at is null and x.accepted_at is null) then
      raise exception '% is invited already; send it again from the list', new.email;
    end if;
  else
    if new.incident_id <> old.incident_id or new.email <> old.email then raise exception 'an invitation keeps its incident and its address'; end if;
    new.invited_by := old.invited_by; new.created_at := old.created_at;
    if new.withdrawn_at is not null and old.withdrawn_at is null then new.withdrawn_by := coalesce(auth.uid(), new.withdrawn_by); end if;
    if new.withdrawn_at is null and old.withdrawn_at is not null then raise exception 'a withdrawn invitation is not put back; send a new one'; end if;
    if new.accepted_at is not null and old.accepted_at is null and coalesce(current_setting('ic.join', true), '') <> '1' then raise exception 'an invitation is accepted by joining with it'; end if;
    if new.sent_at is distinct from old.sent_at and new.sent_at is not null then new.sends := old.sends + 1; new.expires_at := new.sent_at + interval '7 days'; end if;
  end if;
  return new;
end $$;
drop trigger if exists ic_invites_before on public.ic_invites;
create trigger ic_invites_before before insert or update on public.ic_invites for each row execute function public.ic_invite_before();

-- "Invitation sent to j.ortiz@cedarfork.gov as a unit by Operations", "… sent again", "… withdrawn by Operations",
-- "Ana Ramirez accepted the invitation from Operations", "… could not be sent: …"
create or replace function public.ic_invite_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare line text; unit text := public.ic_unit_label(new.incident_id, auth.uid());
  who text := 'Invitation to ' || new.email;
  what text := case when new.role = 'ops' then 'as Operations' else 'as a unit' || case when new.unit_name <> '' then ' (' || new.unit_name || ')' else '' end end;
begin
  if public.ic_quiet() then return new; end if;
  if tg_op = 'INSERT' then
    line := case when new.sent_at is not null then 'Invitation sent to ' || new.email || ' ' || what || ' by ' || unit else 'Invitation to ' || new.email || ' ' || what || ' made by ' || unit end;
  elsif new.withdrawn_at is not null and old.withdrawn_at is null then line := who || ' withdrawn by ' || unit;
  elsif new.accepted_at is not null and old.accepted_at is null then
    line := coalesce((select nullif(p.full_name, '') from public.ic_profiles p where p.user_id = new.accepted_by), new.email) || ' accepted the invitation from ' || public.ic_unit_label(new.incident_id, new.invited_by);
  elsif new.last_error <> '' and new.last_error is distinct from old.last_error then line := who || ' could not be sent: ' || new.last_error;
  elsif new.sent_at is distinct from old.sent_at and new.sent_at is not null then line := case when old.sent_at is null then 'Invitation sent to ' || new.email || ' ' || what || ' by ' || unit else who || ' sent again by ' || unit end;
  end if;
  if line is not null then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', line, 'ic_invites', new.id::text);
  end if;
  return new;
end $$;
drop trigger if exists ic_invites_after on public.ic_invites;
create trigger ic_invites_after after insert or update on public.ic_invites for each row execute function public.ic_invite_after();

-- the switch is logged with the incident's other changes
create or replace function public.ic_log_invite_only() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.invite_only is distinct from old.invite_only then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.id, auth.uid(), 'ops', case when new.invite_only then 'Invited members only: the join code is off' else 'The join code is on again' end);
  end if;
  return new;
end $$;
drop trigger if exists ic_incidents_invite_only on public.ic_incidents;
create trigger ic_incidents_invite_only after update of invite_only on public.ic_incidents for each row execute function public.ic_log_invite_only();

-- ---------------------------------------------------------------- what the link's landing may know without a session
-- The token is the secret: whoever has the link was sent it. Nothing else of the incident is given.
create or replace function public.ic_invite_peek(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('incident', i.name, 'role', v.role, 'unit', v.unit_name, 'email', v.email, 'state', public.ic_invite_state(v),
                            'by', coalesce(nullif((select p.full_name from public.ic_profiles p where p.user_id = v.invited_by), ''), public.ic_unit_label(v.incident_id, v.invited_by)),
                            'agency', i.lead_agency, 'expires_at', v.expires_at)
  from public.ic_invites v join public.ic_incidents i on i.id = v.incident_id where v.token = p_token;
$$;
grant execute on function public.ic_invite_peek(text) to authenticated, anon;

-- the roster: the addresses this account invited on its other incidents, not yet invited or in on this one
create or replace function public.ic_roster(p_incident uuid) returns table (email text, role text, unit_name text, incidents integer)
language sql stable security definer set search_path = public as $$
  select v.email, (array_agg(v.role order by v.created_at desc))[1], (array_agg(v.unit_name order by v.created_at desc))[1], count(distinct v.incident_id)::integer
  from public.ic_invites v
  where v.invited_by = auth.uid() and v.incident_id <> p_incident and v.withdrawn_at is null
    and public.ic_is_ops(p_incident)
    and not exists (select 1 from public.ic_invites x where x.incident_id = p_incident and x.email = v.email and x.withdrawn_at is null)
    and not exists (select 1 from public.ic_members m join auth.users u on u.id = m.user_id where m.incident_id = p_incident and m.removed_at is null and lower(u.email) = v.email)
  group by v.email order by max(v.created_at) desc;
$$;
grant execute on function public.ic_roster(uuid) to authenticated;

-- ---------------------------------------------------------------- joining with an invitation in place of the code
-- the old signature goes first, or the two would be ambiguous to a call without p_invite
drop function if exists public.ic_join(text, text, text, text, integer, text, jsonb, text);
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
  perform set_config('ic.join', '', true);
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
        values (r.id, auth.uid(), nm, coalesce(trim(person ->> 'role'), ''), quals, coalesce(person ->> 'notes', ''))
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

-- ---------------------------------------------------------------- who may do what
-- Operations of the incident read, make, resend and withdraw invitations; the function (service role) writes
-- the send stamps. The landing reads an invitation through ic_invite_peek alone.
alter table public.ic_invites enable row level security;
drop policy if exists ic_invites_select on public.ic_invites;
create policy ic_invites_select on public.ic_invites for select to authenticated using (public.ic_is_ops(incident_id));
drop policy if exists ic_invites_insert on public.ic_invites;
create policy ic_invites_insert on public.ic_invites for insert to authenticated with check (public.ic_is_ops(incident_id));
drop policy if exists ic_invites_update on public.ic_invites;
create policy ic_invites_update on public.ic_invites for update to authenticated using (public.ic_is_ops(incident_id)) with check (public.ic_is_ops(incident_id));

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ic_invites') then
    alter publication supabase_realtime add table public.ic_invites;
  end if;
end $$;
