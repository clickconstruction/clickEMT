-- The incident's kind as a column of its own (v82). v77 kept the kind, the starter period 1 came from and the
-- objectives × removed in ic_incidents.settings (kind, starter, removed_objectives), because nobody on the Mac that
-- built it could apply a migration (punchlist section 36). This gives each its home:
--   ic_incidents.kind and ic_incidents.starter, checked against the codes of INCIDENT_KINDS in js/shared/rules.js
--   (dev/test-rules.mjs reads this file and fails when the two lists, or the words below, drift from rules.js);
--   ic_objectives.archived_at for an objective × removed: out of every list, carried into no period, never deleted;
--   ic_create_incident(…, p_kind, p_starter) writes the opening line with them, "Incident opened: Cedar Fork Flooding,
--   a flood, operational period 1 from the Flood starter", so the app's own "Opened as a flood" note goes;
--   ic_log_objective (0004's body, the newest) writes "Objective 5 removed: …" when a row is archived;
--   ic_start_period (0029's body, the newest) carries no archived objective, so "N objectives carried over" is right;
--   ic_log_incident (0028's body, the newest) says who changed the kind in Incident settings.
-- The three settings keys are moved into the columns and dropped, before the triggers below are redefined, so the move
-- writes no line. Apply before the client that reads the columns ships.

-- ---------------------------------------------------------------- the columns
alter table public.ic_incidents add column if not exists kind text not null default '';
alter table public.ic_incidents add column if not exists starter text not null default '';
alter table public.ic_objectives add column if not exists archived_at timestamptz;

-- the codes: the five kinds and their seventeen sub-kinds, as INCIDENT_KINDS in rules.js; a starter is a sub-kind's
alter table public.ic_incidents drop constraint if exists ic_incidents_kind_check;
alter table public.ic_incidents add constraint ic_incidents_kind_check check (kind in ('', 'natural', 'flood', 'wildfire', 'storm', 'winter', 'human', 'fire', 'hazmat', 'collapse', 'crash', 'utility', 'medical', 'mci', 'outbreak', 'sar', 'swift', 'wilderness', 'urban', 'planned', 'parade', 'festival', 'game'));
alter table public.ic_incidents drop constraint if exists ic_incidents_starter_check;
alter table public.ic_incidents add constraint ic_incidents_starter_check check (starter in ('', 'flood', 'wildfire', 'storm', 'winter', 'fire', 'hazmat', 'collapse', 'crash', 'utility', 'mci', 'outbreak', 'swift', 'wilderness', 'urban', 'parade', 'festival', 'game'));

-- ---------------------------------------------------------------- the words
-- the kind in a sentence, as incidentKindText in rules.js: "a flood", "an outbreak"; '' for none, or a code not in the list
create or replace function public.ic_incident_kind_text(p_kind text) returns text
language sql immutable as $$
  select case p_kind
    when 'natural' then 'a natural hazard'
    when 'flood' then 'a flood'
    when 'wildfire' then 'a wildfire'
    when 'storm' then 'a storm'
    when 'winter' then 'a winter storm'
    when 'human' then 'a human-caused incident'
    when 'fire' then 'a structure fire'
    when 'hazmat' then 'a hazmat incident'
    when 'collapse' then 'a collapse'
    when 'crash' then 'a crash'
    when 'utility' then 'a utility failure'
    when 'medical' then 'a medical or public health incident'
    when 'mci' then 'a mass casualty incident'
    when 'outbreak' then 'an outbreak'
    when 'sar' then 'a search and rescue'
    when 'swift' then 'a swift water rescue'
    when 'wilderness' then 'a wilderness search'
    when 'urban' then 'an urban search'
    when 'planned' then 'a planned event'
    when 'parade' then 'a parade'
    when 'festival' then 'a festival'
    when 'game' then 'a game'
    else '' end
$$;

-- the starter's name, as starterFor(code).from in rules.js: "Flood", "Mass casualty"; '' for none
create or replace function public.ic_starter_name(p_code text) returns text
language sql immutable as $$
  select case p_code
    when 'flood' then 'Flood'
    when 'wildfire' then 'Wildfire'
    when 'storm' then 'Storm'
    when 'winter' then 'Winter storm'
    when 'fire' then 'Structure fire'
    when 'hazmat' then 'Hazmat'
    when 'collapse' then 'Collapse'
    when 'crash' then 'Crash'
    when 'utility' then 'Utility failure'
    when 'mci' then 'Mass casualty'
    when 'outbreak' then 'Outbreak'
    when 'swift' then 'Swift water'
    when 'wilderness' then 'Wilderness'
    when 'urban' then 'Urban'
    when 'parade' then 'Parade'
    when 'festival' then 'Festival'
    when 'game' then 'Game'
    else '' end
$$;

-- ---------------------------------------------------------------- v77's settings keys move into the columns, once
-- (the triggers still have their old bodies here, which say nothing about these changes)
update public.ic_incidents set kind = settings ->> 'kind'
  where kind = '' and public.ic_incident_kind_text(coalesce(settings ->> 'kind', '')) <> '';
update public.ic_incidents set starter = settings ->> 'starter'
  where starter = '' and public.ic_starter_name(coalesce(settings ->> 'starter', '')) <> '';
update public.ic_objectives o set archived_at = now()
  from public.ic_incidents i
  where o.incident_id = i.id and o.archived_at is null
    and jsonb_typeof(i.settings -> 'removed_objectives') = 'array'
    and i.settings -> 'removed_objectives' @> to_jsonb(o.id::text);
update public.ic_incidents set settings = settings - 'kind' - 'starter' - 'removed_objectives'
  where settings ?| array['kind', 'starter', 'removed_objectives'];

-- ---------------------------------------------------------------- opening an incident with its kind
-- 0004's body with the two columns and the opening line. The six-argument function goes: with the two defaults
-- below a call by name would match both, and the rule tests' six-argument calls resolve to this one.
drop function if exists public.ic_create_incident(text, text, text, double precision, double precision, integer);
create or replace function public.ic_create_incident(p_name text, p_period text, p_base_name text,
                                                      p_lat double precision, p_lng double precision, p_zoom integer default 14,
                                                      p_kind text default '', p_starter text default '')
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
  insert into public.ic_incidents (name, code, period, base_name, center_lat, center_lng, zoom, created_by, kind, starter)
  values (trim(p_name), c, coalesce(nullif(trim(p_period), ''), 'OP 1'), nullif(trim(p_base_name), ''), p_lat, p_lng, coalesce(p_zoom, 14), auth.uid(),
          coalesce(trim(p_kind), ''), coalesce(trim(p_starter), ''))
  returning * into r;
  insert into public.ic_members (incident_id, user_id, role, unit_name) values (r.id, auth.uid(), 'ops', 'Operations');
  insert into public.ic_periods (incident_id, number) values (r.id, 1) returning * into p;
  update public.ic_incidents set current_period_id = p.id where id = r.id returning * into r;
  insert into public.ic_events (incident_id, user_id, kind, text)
  values (r.id, auth.uid(), 'ops', 'Incident opened: ' || r.name
          || case when r.kind <> '' then ', ' || public.ic_incident_kind_text(r.kind) else '' end
          || ', operational period 1'
          || case when r.starter <> '' then ' from the ' || public.ic_starter_name(r.starter) || ' starter' else '' end);
  return r;
end $$;
grant execute on function public.ic_create_incident(text, text, text, double precision, double precision, integer, text, text) to authenticated;

-- ---------------------------------------------------------------- × on an objective: archived, one line
-- 0004's body, the newest, with the archived branch
create or replace function public.ic_log_objective() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.ic_quiet() then return new; end if;
  if tg_op = 'INSERT' then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', 'Objective ' || new.number || ' set: ' || new.text, 'ic_objectives', new.id::text);
  elsif new.archived_at is not null and old.archived_at is null then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', 'Objective ' || new.number || ' removed: ' || new.text, 'ic_objectives', new.id::text);
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

-- ---------------------------------------------------------------- the carry-over leaves archived objectives behind
-- 0029's body, the newest, with one condition more in the carry loop
create or replace function public.ic_start_period(p_incident uuid, p_ends_at timestamptz default null, p_ic text default '', p_ops text default '', p_safety text default '', p_notes text default '', p_carry boolean default true,
                                                   p_planning text default '', p_logistics text default '', p_finance text default '', p_unified text default '', p_pio text default '', p_liaison text default '', p_rotation integer default null, p_deputy text default '', p_bring text default '', p_scene integer default null)
returns public.ic_periods
language plpgsql security definer set search_path = public as $$
declare
  cur public.ic_periods;
  np public.ic_periods;
  o record;
  n integer := 0;
  newid uuid;
  rot integer;
  sh integer;
begin
  if not public.ic_is_ops(p_incident) then raise exception 'Only Operations starts a period'; end if;
  select * into cur from public.ic_periods where incident_id = p_incident and closed_at is null order by number desc limit 1;
  rot := coalesce(p_rotation, cur.rotation_minutes, (select nullif(i.settings ->> 'rotation_minutes', '')::int from public.ic_incidents i where i.id = p_incident), 45);
  if rot < 0 or rot > 600 then raise exception 'The rotation is 0 (off) to 600 minutes'; end if;
  sh := coalesce(p_scene, cur.scene_hours, 12);
  if sh < 0 or sh > 72 then raise exception 'The hours on scene are 0 (off) to 72'; end if;
  insert into public.ic_periods (incident_id, number, starts_at, ends_at, ic_name, ops_chief, safety_officer, notes, planning_chief, logistics_chief, finance_chief, unified, pio, liaison, rotation_minutes, deputy, bring, scene_hours)
  values (p_incident, coalesce(cur.number, (select coalesce(max(number), 0) from public.ic_periods where incident_id = p_incident)) + 1, now(), p_ends_at,
          coalesce(trim(p_ic), ''), coalesce(trim(p_ops), ''), coalesce(trim(p_safety), ''), coalesce(trim(p_notes), ''),
          coalesce(trim(p_planning), ''), coalesce(trim(p_logistics), ''), coalesce(trim(p_finance), ''), coalesce(trim(p_unified), ''), coalesce(trim(p_pio), ''), coalesce(trim(p_liaison), ''), rot, coalesce(trim(p_deputy), ''), coalesce(trim(p_bring), ''), sh)
  returning * into np;
  if cur.id is not null then
    update public.ic_periods set closed_at = now() where id = cur.id;
    perform set_config('ic.quiet', '1', true);
    insert into public.ic_period_agencies (incident_id, period_id, agency, name, phone)
      select incident_id, np.id, agency, name, phone from public.ic_period_agencies where period_id = cur.id and archived_at is null;
    if p_carry then
      for o in select * from public.ic_objectives where period_id = cur.id and done_at is null and archived_at is null order by number loop
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
          || case when np.deputy <> '' then ', Deputy ' || np.deputy else '' end
          || case when n > 0 then ', ' || n || ' objective' || case when n = 1 then '' else 's' end || ' carried over' else '' end);
  return np;
end $$;
grant execute on function public.ic_start_period(uuid, timestamptz, text, text, text, text, boolean, text, text, text, text, text, text, integer, text, text, integer) to authenticated;

-- ---------------------------------------------------------------- a change of kind in Incident settings says so
-- 0028's body, the newest, with the kind
create or replace function public.ic_log_incident() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text := public.ic_actor_name(new.id);
begin
  if new.boundary is distinct from old.boundary then
    insert into public.ic_events (incident_id, user_id, kind, text) values (new.id, auth.uid(), 'ops', 'Incident boundary redrawn');
  end if;
  if new.channels is distinct from old.channels then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.id, auth.uid(), 'ops', 'Communications plan updated: ' || coalesce((select string_agg(coalesce(c ->> 'use', '') || ' ' || coalesce(c ->> 'channel', ''), ', ') from jsonb_array_elements(new.channels) c), 'no channels'));
  end if;
  if new.lead_agency is distinct from old.lead_agency then
    insert into public.ic_events (incident_id, user_id, kind, text) values (new.id, auth.uid(), 'ops', 'Lead agency: ' || coalesce(nullif(new.lead_agency, ''), 'not set'));
  end if;
  if new.kind is distinct from old.kind then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.id, auth.uid(), 'ops', who || case when new.kind = '' then ' cleared the kind' else ' set the kind to ' || public.ic_incident_kind_text(new.kind) end);
  end if;
  if new.status = 'closed' and old.status <> 'closed' then
    insert into public.ic_events (incident_id, user_id, kind, text) values (new.id, auth.uid(), 'ops', 'Incident closed'
      || case when new.clear_personal_at is not null then ' · personal records clear by rule in ' || greatest(1, round(extract(epoch from (new.clear_personal_at - now())) / 86400))::int || ' days' else '' end);
  elsif new.status = 'active' and old.status = 'closed' then
    insert into public.ic_events (incident_id, user_id, kind, text) values (new.id, auth.uid(), 'ops', 'Incident reopened');
  end if;
  -- the settings: what changed, never the key itself
  if coalesce(new.settings ->> 'maps_key', '') is distinct from coalesce(old.settings ->> 'maps_key', '') then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.id, auth.uid(), 'ops', who || case when coalesce(new.settings ->> 'maps_key', '') = '' then ' cleared the Google Maps key' else ' set the Google Maps key' end);
  end if;
  if coalesce(new.settings ->> 'retention_days', '') is distinct from coalesce(old.settings ->> 'retention_days', '') then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.id, auth.uid(), 'ops', who || ' set personal records to clear ' || coalesce(nullif(new.settings ->> 'retention_days', ''), '30') || ' days after the close');
  end if;
  if coalesce(new.settings ->> 'rotation_minutes', '') is distinct from coalesce(old.settings ->> 'rotation_minutes', '') then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.id, auth.uid(), 'ops', who || ' set the default rotation to ' || coalesce(nullif(new.settings ->> 'rotation_minutes', ''), '45') || ' minutes in the water');
  end if;
  if coalesce(new.settings ->> 'eoc_email', '') is distinct from coalesce(old.settings ->> 'eoc_email', '') then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.id, auth.uid(), 'ops', who || case when coalesce(new.settings ->> 'eoc_email', '') = '' then ' cleared the EOC email address' else ' set the EOC email address to ' || (new.settings ->> 'eoc_email') end);
  end if;
  return new;
end $$;
