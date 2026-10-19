-- Claim a band, submit licences, Operations confirms (v69). Todd, 18 October: "make it super easy for someone to scan a
-- badge and then identify themselves to that badge and submit licenses for approval and then licenses show up on their
-- account with either a pending status or confirmed status. That way people can know if they are verified or
-- unverified, but they can get the badge right away."
--
-- A band is a door: a signed-in person who scans an unissued band claims it (ic_claim_band), is on the incident at once
-- (a member riding with the unit they chose, ic_members.rides_with, or a unit of their own), is a person on that unit's
-- roster with their own account on the row (ic_people.claimed_by), has the band, and the check-in scan is on record.
-- Credentials (ic_credentials) belong to the account and follow the person across incidents: a kind from one fixed
-- list, a number, who issued it, when it expires, a photo in the private ic-ids bucket; pending until Operations of an
-- incident the owner is on confirms it or says why not (ic_decide_credential). Nothing is deleted: a rejected
-- credential keeps its reason, a withdrawn one is archived, and the 30-day clearing blanks the number and the photo
-- while keeping the fact ("EMT, confirmed by Operations 18 Oct").

-- ---------------------------------------------------------------- a person with an account on a roster
alter table public.ic_people add column if not exists claimed_by uuid references auth.users(id);   -- the person's own account, when they claimed a band
create unique index if not exists ic_people_claim on public.ic_people (incident_id, claimed_by) where claimed_by is not null and archived_at is null;
-- a member riding with a unit (claimed a band and chose it): on no list of units of its own, counted on the unit's roster
alter table public.ic_members add column if not exists rides_with uuid references auth.users(id);

-- ---------------------------------------------------------------- a band may be given to the person's own account
create or replace function public.ic_tag_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.ic_people; e public.ic_evacuees; who uuid := auth.uid();
begin
  if tg_op = 'UPDATE' then
    if new.incident_id <> old.incident_id or new.number <> old.number or new.code <> old.code then raise exception 'a band keeps its number and its code'; end if;
    new.created_by := old.created_by; new.created_at := old.created_at;
    if new.voided_at is null and old.voided_at is not null then raise exception 'a voided band stays voided; give a new one'; end if;
    if new.voided_at is not null and old.voided_at is null then
      if not (public.ic_is_ops(new.incident_id) or old.issued_by = who or coalesce(current_setting('ic.system', true), '') = '1') then raise exception 'Only Operations or whoever gave the band voids it'; end if;
      new.voided_by := coalesce(who, new.voided_by);
    end if;
    if (new.person_id, new.evacuee_id) is distinct from (old.person_id, old.evacuee_id) then
      if old.person_id is not null or old.evacuee_id is not null then raise exception '% is on someone already; void it and give a new one', public.ic_band_label(old.number); end if;
      if new.voided_at is not null then raise exception '% was voided', public.ic_band_label(old.number); end if;
      if new.person_id is not null and new.evacuee_id is not null then raise exception 'a band is on one person'; end if;
      if new.person_id is not null then
        select * into p from public.ic_people where id = new.person_id and incident_id = new.incident_id;
        if not found then raise exception 'that person is not on this incident'; end if;
        -- the unit the person rides with, Operations, or the person's own account (a claim, v69)
        if not (public.ic_is_ops(new.incident_id) or p.user_id = who or p.claimed_by = who) then raise exception 'Only the unit this person is on, or Operations, gives them a band'; end if;
        if exists (select 1 from public.ic_tags t where t.person_id = new.person_id and t.voided_at is null and t.id <> new.id) then raise exception '% has a band already; void it first', p.name; end if;
        new.kind := 'responder';
      else
        select * into e from public.ic_evacuees where id = new.evacuee_id and incident_id = new.incident_id;
        if not found then raise exception 'that record is not on this incident'; end if;
        if not (public.ic_is_ops(new.incident_id) or e.logged_by = who or public.ic_is_desk(new.incident_id, e.facility_id)) then raise exception 'Only the desk, the crew that made the record, or Operations gives them a band'; end if;
        if exists (select 1 from public.ic_tags t where t.evacuee_id = new.evacuee_id and t.voided_at is null and t.id <> new.id) then raise exception '% has a band already; void it first', public.ic_evacuee_who(e.label, e.count); end if;
        new.kind := 'evacuee';
      end if;
      new.issued_at := now(); new.issued_by := coalesce(who, new.issued_by);
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- what a band's link may know before the person is on the incident
-- A signed-in phone with a band it cannot read yet (ic_tags is members' only) asks this: the band's number, the incident's
-- name, whether the band is free, and the units to pick from. A band on someone says only that; nothing of the incident.
create or replace function public.ic_band_peek(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t public.ic_tags; i public.ic_incidents; is_member boolean;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into t from public.ic_tags where code = upper(trim(coalesce(p_code, '')));
  if not found then return jsonb_build_object('state', 'missing'); end if;
  select * into i from public.ic_incidents where id = t.incident_id;
  is_member := exists (select 1 from public.ic_members m where m.incident_id = t.incident_id and m.user_id = auth.uid() and m.removed_at is null);
  if t.voided_at is not null then return jsonb_build_object('state', 'voided', 'number', t.number, 'member', is_member); end if;
  if i.status <> 'active' then return jsonb_build_object('state', 'closed', 'number', t.number, 'member', is_member); end if;
  if t.person_id is not null or t.evacuee_id is not null then return jsonb_build_object('state', 'on_someone', 'number', t.number, 'member', is_member); end if;
  return jsonb_build_object('state', 'free', 'number', t.number, 'incident', i.name, 'incident_id', i.id, 'member', is_member,
    'units', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'unit_name', m.unit_name, 'kind', m.kind, 'agency', m.agency) order by m.unit_name)
                       from public.ic_members m where m.incident_id = t.incident_id and m.role = 'unit' and m.removed_at is null and m.status <> 'checked_out' and m.rides_with is null), '[]'::jsonb));
end $$;
grant execute on function public.ic_band_peek(text) to authenticated;

-- ---------------------------------------------------------------- the claim: the band is the door
-- The caller says who they are (the name and the phone go on the profile, as the Identify sheet does), picks the unit
-- they ride with or none, and the band is theirs: a member of the band's incident if not one (riding with the unit, or a
-- unit of their own named after them), a person on the unit's roster with their account on the row (the unit's unclaimed
-- row of the same name is taken over, not doubled), the band given, the check-in scan written, and one 214 line:
-- "Rosa Alvarez claimed Band 025 (Unit 2)". The person is on the incident now; approval of what they can do comes later.
create or replace function public.ic_claim_band(p_code text, p_name text, p_phone text, p_agency text default null, p_unit uuid default null)
returns public.ic_incidents
language plpgsql security definer set search_path = public as $$
declare
  t public.ic_tags;
  r public.ic_incidents;
  m public.ic_members;
  lead public.ic_members;
  owner uuid;
  nm text := trim(coalesce(p_name, ''));
  ph text := trim(coalesce(p_phone, ''));
  ag text := trim(coalesce(p_agency, ''));
  pid uuid;
  existing_band public.ic_tags;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if nm = '' or ph = '' then raise exception 'Say who you are first: your name and your phone'; end if;
  select * into t from public.ic_tags where code = upper(trim(coalesce(p_code, '')));
  if not found then raise exception 'That band is not on record; hand it back to the table'; end if;
  if t.voided_at is not null then raise exception '% was voided; ask for another', public.ic_band_label(t.number); end if;
  if t.person_id is not null or t.evacuee_id is not null then raise exception '% is on someone already', public.ic_band_label(t.number); end if;
  select * into r from public.ic_incidents where id = t.incident_id;
  if r.status <> 'active' then raise exception 'That incident is closed'; end if;
  select * into m from public.ic_members where incident_id = r.id and user_id = auth.uid();
  if m.removed_at is not null then raise exception 'You were removed from % by Operations. Only Operations can put you back.', r.name; end if;
  if p_unit is not null and p_unit <> auth.uid() then
    select * into lead from public.ic_members where incident_id = r.id and user_id = p_unit and role = 'unit' and removed_at is null and rides_with is null;
    if not found then raise exception 'That unit is not on this incident'; end if;
  end if;
  -- who you are: the profile, as the Identify sheet writes it
  insert into public.ic_profiles (user_id, full_name, phone) values (auth.uid(), nm, ph)
  on conflict (user_id) do update set full_name = excluded.full_name, phone = excluded.phone;
  -- the membership: riding with the unit chosen, or a unit of your own
  perform set_config('ic.quiet', '1', true);
  perform set_config('ic.join', '1', true);
  if m.user_id is null then
    insert into public.ic_members (incident_id, user_id, role, unit_name, agency, status, status_at, checked_out_at, rides_with)
    values (r.id, auth.uid(), 'unit', case when lead.user_id is not null then lead.unit_name else nm end, coalesce(nullif(ag, ''), lead.agency, ''), 'available', now(), null, lead.user_id);
  elsif m.role = 'unit' then
    update public.ic_members set rides_with = case when lead.user_id is not null then lead.user_id else rides_with end,
                                 unit_name = case when lead.user_id is not null then lead.unit_name else unit_name end,
                                 agency = case when ag <> '' then ag else agency end,
                                 status = case when status = 'checked_out' then 'available' else status end,
                                 status_at = case when status = 'checked_out' then now() else status_at end,
                                 checked_out_at = null
      where incident_id = r.id and user_id = auth.uid();
  end if;
  perform set_config('ic.join', '', true);
  select * into m from public.ic_members where incident_id = r.id and user_id = auth.uid();
  owner := coalesce(lead.user_id, auth.uid());
  -- the person on the roster: your own row if you have one, the unit's unclaimed row of your name, else a new one
  select p.id into pid from public.ic_people p where p.incident_id = r.id and p.claimed_by = auth.uid() and p.archived_at is null limit 1;
  if pid is not null then
    update public.ic_people set user_id = owner, checked_out_at = null, agency = case when ag <> '' then ag else agency end where id = pid;
  else
    select p.id into pid from public.ic_people p
      where p.incident_id = r.id and p.user_id = owner and p.claimed_by is null and p.archived_at is null
        and (lower(p.name) = lower(nm) or lower(p.name) = lower(regexp_replace(nm, '^.*\s', '')))
      order by p.checked_in_at desc limit 1;
    if pid is not null then
      update public.ic_people set claimed_by = auth.uid(), checked_out_at = null, agency = case when ag <> '' then ag else agency end where id = pid;
    else
      -- not under ic.join: the claimant is one of the people the lead counted but did not name, when there are any
      insert into public.ic_people (incident_id, user_id, name, agency, claimed_by) values (r.id, owner, nm, ag, auth.uid()) returning id into pid;
    end if;
  end if;
  -- the band, and the scan that is the check-in; the one line below says it all
  select * into existing_band from public.ic_tags x where x.person_id = pid and x.voided_at is null;
  if found then raise exception 'You have % already; ask Operations to void it first', public.ic_band_label(existing_band.number); end if;
  update public.ic_tags set person_id = pid where id = t.id;
  insert into public.ic_seen (incident_id, tag_id, kind) values (r.id, t.id, 'check_in');
  perform set_config('ic.quiet', '', true);
  insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
  values (r.id, auth.uid(), 'seen', nm || ' claimed ' || public.ic_band_label(t.number) || ' (' || case when lead.user_id is not null then public.ic_unit_label(r.id, lead.user_id) else 'not on a unit yet' end || ')', 'ic_tags', t.id::text);
  return r;
end $$;
grant execute on function public.ic_claim_band(text, text, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------- credentials belong to the account
create table if not exists public.ic_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('licence', 'emt', 'paramedic', 'swift_water', 'boat', 'rope', 'k9', 'hazmat', 'drone', 'other')),
  title text not null default '',                 -- what an 'other' is
  number text not null default '',
  issuer text not null default '',
  expires_at date,
  photo_path text,                                -- <user_id>/cred-<id>.jpg in ic-ids
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  reason text not null default '',                -- why not, kept
  confirmed_by uuid references auth.users(id),    -- who decided, and when: for either answer
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz                         -- withdrawn by the owner, never deleted
);
create index if not exists ic_credentials_user on public.ic_credentials(user_id);

-- the words for a kind (credentialText in rules.js says the same): "EMT", "swift water", "boat operator", "driver's licence", the title of an other
create or replace function public.ic_credential_kind_text(p_kind text, p_title text) returns text language sql immutable as $$
  select case p_kind when 'licence' then 'driver''s licence' when 'emt' then 'EMT' when 'paramedic' then 'paramedic' when 'swift_water' then 'swift water'
                     when 'boat' then 'boat operator' when 'rope' then 'rope' when 'k9' then 'K9' when 'hazmat' then 'hazmat' when 'drone' then 'drone'
                     else coalesce(nullif(trim(p_title), ''), 'a credential') end;
$$;

-- The owner submits pending only; a changed number, issuer, expiry, photo or title goes back to pending (what was confirmed
-- has changed, as a profile change clears Mark verified); the status moves only through ic_decide_credential; the clearing
-- by rule (ic.system) blanks the number and the photo without touching the decision.
create or replace function public.ic_credential_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare deciding boolean := coalesce(current_setting('ic.deciding', true), '') = '1';
        sys boolean := coalesce(current_setting('ic.system', true), '') = '1';
begin
  new.title := trim(coalesce(new.title, '')); new.number := upper(trim(coalesce(new.number, ''))); new.issuer := trim(coalesce(new.issuer, '')); new.reason := trim(coalesce(new.reason, ''));
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.user_id := coalesce(new.user_id, auth.uid());
    if new.kind = 'other' and new.title = '' then raise exception 'Say what the credential is'; end if;
    new.status := 'pending'; new.reason := ''; new.confirmed_by := null; new.confirmed_at := null; new.archived_at := null;
    return new;
  end if;
  if new.user_id <> old.user_id or new.kind <> old.kind or new.created_at <> old.created_at then raise exception 'a credential keeps its owner and its kind'; end if;
  if not (deciding or sys or old.user_id = auth.uid()) then raise exception 'Only the owner changes a credential; Operations confirms or declines it'; end if;
  if new.status <> old.status and not deciding then raise exception 'Only Operations of an incident the owner is on confirms a credential'; end if;
  if (new.confirmed_by, new.confirmed_at) is distinct from (old.confirmed_by, old.confirmed_at) and not deciding then raise exception 'Only Operations of an incident the owner is on confirms a credential'; end if;
  if new.reason <> old.reason and not deciding and not (new.number, new.issuer, new.expires_at, new.photo_path, new.title) is distinct from (old.number, old.issuer, old.expires_at, old.photo_path, old.title) then raise exception 'the reason is Operations'' word'; end if;
  if not deciding and not sys and (new.number, new.issuer, new.expires_at, new.photo_path, new.title) is distinct from (old.number, old.issuer, old.expires_at, old.photo_path, old.title) then
    new.status := 'pending'; new.reason := ''; new.confirmed_by := null; new.confirmed_at := null;   -- what was confirmed has changed
  end if;
  return new;
end $$;
drop trigger if exists ic_credentials_before on public.ic_credentials;
create trigger ic_credentials_before before insert or update on public.ic_credentials for each row execute function public.ic_credential_before();

-- The 214 of every active incident the owner is on: "Rosa Alvarez submitted EMT", "Rosa Alvarez's EMT confirmed by
-- Operations", "Rosa Alvarez's boat operator not accepted: expired", "Rosa Alvarez withdrew rope". Filed under the field
-- like a band's lines (kind seen).
create or replace function public.ic_credential_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare inc record; who text; what text := public.ic_credential_kind_text(new.kind, new.title); line text;
begin
  if public.ic_quiet() then return new; end if;
  if tg_op = 'INSERT' then line := '%s submitted ' || what;
  elsif new.archived_at is not null and old.archived_at is null then line := '%s withdrew ' || what;
  elsif new.archived_at is not null then return new;
  elsif new.status = 'confirmed' and old.status <> 'confirmed' then line := '%s''s ' || what || ' confirmed by Operations';
  elsif new.status = 'rejected' and old.status <> 'rejected' then line := '%s''s ' || what || ' not accepted' || case when new.reason <> '' then ': ' || new.reason else '' end;
  elsif new.status = 'pending' and old.status <> 'pending' then line := '%s''s ' || what || ' changed, pending again';
  else return new; end if;
  for inc in select m.incident_id from public.ic_members m join public.ic_incidents i on i.id = m.incident_id
             where m.user_id = new.user_id and m.removed_at is null and i.status = 'active' loop
    who := coalesce(nullif((select p.full_name from public.ic_profiles p where p.user_id = new.user_id), ''), public.ic_unit_label(inc.incident_id, new.user_id));
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (inc.incident_id, auth.uid(), 'seen', replace(line, '%s', who), 'ic_credentials', new.id::text);
  end loop;
  return new;
end $$;
drop trigger if exists ic_credentials_after on public.ic_credentials;
create trigger ic_credentials_after after insert or update on public.ic_credentials for each row execute function public.ic_credential_after();

-- Operations of an incident the owner is on confirms, or says why not. A rejected credential stays with its reason; the
-- person submits a new one. Reconsidering a decision is the same call again.
create or replace function public.ic_decide_credential(p_id uuid, p_incident uuid, p_ok boolean, p_reason text default null)
returns public.ic_credentials
language plpgsql security definer set search_path = public as $$
declare c public.ic_credentials; why text := trim(coalesce(p_reason, ''));
begin
  if not public.ic_is_ops(p_incident) then raise exception 'Only Operations confirms a credential'; end if;
  select * into c from public.ic_credentials where id = p_id;
  if not found then raise exception 'No such credential'; end if;
  if not exists (select 1 from public.ic_members m where m.incident_id = p_incident and m.user_id = c.user_id and m.removed_at is null) then raise exception 'That person is not on this incident'; end if;
  if c.archived_at is not null then raise exception 'That credential was withdrawn'; end if;
  if not p_ok and why = '' then raise exception 'Say why it is not accepted'; end if;
  perform set_config('ic.deciding', '1', true);
  update public.ic_credentials set status = case when p_ok then 'confirmed' else 'rejected' end, reason = case when p_ok then '' else why end, confirmed_by = auth.uid(), confirmed_at = now()
    where id = p_id returning * into c;
  perform set_config('ic.deciding', '', true);
  return c;
end $$;
grant execute on function public.ic_decide_credential(uuid, uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------- who may do what
-- Read by the owner and by Operations of an incident the owner is on (ic_sees_profile, as the identity); inserted by the
-- owner; updated by the owner (the trigger says what may change) and through ic_decide_credential; never deleted.
alter table public.ic_credentials enable row level security;
drop policy if exists ic_credentials_select on public.ic_credentials;
create policy ic_credentials_select on public.ic_credentials for select to authenticated using (user_id = auth.uid() or public.ic_sees_profile(user_id));
drop policy if exists ic_credentials_insert on public.ic_credentials;
create policy ic_credentials_insert on public.ic_credentials for insert to authenticated with check (user_id = auth.uid());
drop policy if exists ic_credentials_update on public.ic_credentials;
create policy ic_credentials_update on public.ic_credentials for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- no delete policy

-- ---------------------------------------------------------------- the clearing by rule blanks the number and the photo, keeps the fact
create or replace function public.ic_clear_personal(p_incident uuid) returns public.ic_incidents
language plpgsql security definer set search_path = public as $$
declare
  inc public.ic_incidents;
  u record;
  n_lic integer := 0;
  n_names integer := 0;
  n_bands integer := 0;
  n_cred integer := 0;
  k integer;
begin
  select * into inc from public.ic_incidents where id = p_incident;
  if not found then raise exception 'No such incident'; end if;
  if coalesce(current_setting('ic.system', true), '') <> '1' and not public.ic_is_ops(p_incident) then raise exception 'Only Operations clears personal records'; end if;
  if inc.status <> 'closed' then raise exception 'Close the incident first; its personal records clear 30 days later, or sooner from the picker'; end if;
  if inc.personal_cleared_at is not null then return inc; end if;
  perform set_config('ic.system', '1', true);
  for u in select distinct m.user_id from public.ic_members m where m.incident_id = p_incident
             and not exists (select 1 from public.ic_members o join public.ic_incidents i on i.id = o.incident_id
                             where o.user_id = m.user_id and o.removed_at is null and i.status = 'active') loop
    update public.ic_profiles p
      set licence_number = '', licence_state = '', licence_expires = null, date_of_birth = null, address = '', photo_path = null, id_source = ''
      where p.user_id = u.user_id and (p.licence_number <> '' or p.photo_path is not null or p.date_of_birth is not null or p.address <> '' or p.licence_expires is not null);
    if found then n_lic := n_lic + 1; end if;
    -- the credentials' numbers and photos go; the kind, the issuer, the expiry and the decision stay (v69)
    update public.ic_credentials c set number = '', photo_path = null where c.user_id = u.user_id and (c.number <> '' or c.photo_path is not null);
    get diagnostics k = row_count;
    n_cred := n_cred + k;
    insert into public.ic_id_purge (incident_id, user_id, path)
      select p_incident, u.user_id, o.name from storage.objects o where o.bucket_id = 'ic-ids' and (storage.foldername(o.name))[1] = u.user_id::text
      on conflict do nothing;
  end loop;
  perform set_config('ic.quiet', '1', true);
  update public.ic_evacuees e set label = case when e.count > 1 then 'family of ' || e.count else '' end, note = ''
    where e.incident_id = p_incident and (e.note <> '' or e.label <> case when e.count > 1 then 'family of ' || e.count else '' end);
  get diagnostics n_names = row_count;
  update public.ic_tags t set voided_at = now() where t.incident_id = p_incident and t.kind = 'evacuee' and t.voided_at is null;
  get diagnostics n_bands = row_count;
  perform set_config('ic.quiet', '', true);
  update public.ic_incidents set personal_cleared_at = now() where id = p_incident returning * into inc;
  insert into public.ic_events (incident_id, user_id, kind, text)
  values (p_incident, auth.uid(), 'ops', 'Personal records cleared by rule: ' || n_lic || case when n_lic = 1 then ' licence record' else ' licence records' end
          || ', ' || n_names || case when n_names = 1 then ' sheltered person''s name' else ' sheltered people''s names' end
          || case when n_bands > 0 then ', ' || n_bands || case when n_bands = 1 then ' band voided' else ' bands voided' end else '' end
          || case when n_cred > 0 then ', ' || n_cred || case when n_cred = 1 then ' credential blanked' else ' credentials blanked' end else '' end);
  return inc;
end $$;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ic_credentials') then
    alter publication supabase_realtime add table public.ic_credentials;
  end if;
end $$;
