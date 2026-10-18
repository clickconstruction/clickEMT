-- The rules of bands and scans (migration 0032), run against the real database inside one transaction that is
-- rolled back at the end:  python3 dev/sbq.py supabase/tests/tags.sql
-- Every row of the result should say ok: true. Pretend accounts stand in for Operations (f1), a crew (f2), another
-- crew (f3) and the shelter desk at the gym (f4).
begin;
create temp table t_r (ok boolean, what text);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
select ('00000000-0000-4000-8000-0000000000f' || n)::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tag-test-' || n || '@example.invalid', '', now(), now(), now(), '{}', '{}', false, false
from generate_series(1, 4) n;
create temp table t_ctx (incident uuid, code text, gym uuid, zone uuid, okafor uuid, patel uuid, lee uuid, par uuid, other_inc uuid, other_tag uuid,
  ops uuid default '00000000-0000-4000-8000-0000000000f1', crew uuid default '00000000-0000-4000-8000-0000000000f2', crew2 uuid default '00000000-0000-4000-8000-0000000000f3', desk uuid default '00000000-0000-4000-8000-0000000000f4');
insert into t_ctx (incident) values (null);
grant all on t_r, t_ctx to authenticated;
insert into public.ic_profiles (user_id, full_name, phone) select ('00000000-0000-4000-8000-0000000000f' || n)::uuid, 'Person ' || n, '512 555 03' || n from generate_series(2, 4) n;
create temp view t_log as select text from public.ic_events where incident_id = (select incident from t_ctx);
grant select on t_log to authenticated;
create or replace function pg_temp.as_user(p uuid) returns text language sql as $$ select set_config('request.jwt.claims', '{"sub":"' || p || '","role":"authenticated"}', true); $$;
create or replace function pg_temp.tag(n integer) returns uuid language sql as $$ select id from public.ic_tags where incident_id = (select incident from t_ctx) and number = n; $$;
grant execute on function pg_temp.tag(integer) to authenticated;

-- ---- Operations opens the incident, places the gym and a division, prints three bands
select pg_temp.as_user((select ops from t_ctx));
set local role authenticated;
update t_ctx set incident = r.id, code = r.code from (select * from public.ic_create_incident('Bands rule test', null, 'Depot', null, null, 14)) r;
with f as (insert into public.ic_facilities (incident_id, kind, name, lat, lng) values ((select incident from t_ctx), 'shelter', 'High school gym', 30.256, -97.742) returning id) update t_ctx set gym = (select id from f);
with z as (insert into public.ic_zones (incident_id, code, name, priority, polygon, structures) values ((select incident from t_ctx), 'A-2', 'Pecan Park', 1, '{"type":"Polygon","coordinates":[[[-97.75,30.25],[-97.74,30.25],[-97.74,30.26],[-97.75,30.26],[-97.75,30.25]]]}'::jsonb, 4) returning id) update t_ctx set zone = z.id from z;
insert into t_r select count(*) = 3 and min(number) = 1 and max(number) = 3 and bool_and(code ~ ('^' || upper(substr((select code from t_ctx), 1, 3)) || '-00[123]-[A-Z2-9]{4}$')) and bool_and(kind = '' and person_id is null and voided_at is null), 'three bands printed, numbered from 1, coded with the join code''s first letters, on nobody yet' from public.ic_print_bands((select incident from t_ctx), 3);
insert into t_r select exists (select 1 from t_log where text = '3 bands printed, 001 to 003'), 'the printing is a line';
insert into t_r select count(*) = 3, 'the sheet is on record' from public.ic_tags where incident_id = (select incident from t_ctx);
reset role;

-- ---- a crew checks in with a band number on a person's row: the band is given, the scan is the check-in
select pg_temp.as_user((select crew from t_ctx));
set local role authenticated;
do $$ begin
  perform public.ic_print_bands((select incident from t_ctx), 2);
  insert into t_r values (false, 'a unit printed bands');
exception when others then insert into t_r values (sqlerrm = 'Only Operations prints bands', 'only Operations prints: ' || sqlerrm); end $$;
select public.ic_join((select code from t_ctx), 'unit', 'Unit 2', null, 2, 'Travis County Rescue', '[{"name":"Okafor","role":"","qualifications":["paramedic"],"band":"1"},{"name":"Patel","role":"","qualifications":[]}]'::jsonb, 'boat');
update t_ctx set okafor = (select id from public.ic_people where incident_id = (select incident from t_ctx) and name = 'Okafor'), patel = (select id from public.ic_people where incident_id = (select incident from t_ctx) and name = 'Patel');
insert into t_r select person_id = (select okafor from t_ctx) and kind = 'responder' and issued_by = (select crew from t_ctx) and issued_at is not null, 'band 1 is on Okafor, given by his unit at check-in' from public.ic_tags where id = pg_temp.tag(1);
insert into t_r select exists (select 1 from public.ic_seen s where s.tag_id = pg_temp.tag(1) and s.kind = 'check_in' and s.seen_by = (select crew from t_ctx)), 'the check-in scan is on record';
insert into t_r select exists (select 1 from t_log where text = 'Band 001 given to Okafor (Unit 2) by Unit 2') and exists (select 1 from t_log where text = 'Okafor seen checking in with Unit 2'), 'both lines are in the 214';
do $$ begin
  perform public.ic_join((select code from t_ctx), 'unit', 'Unit 2', null, 2, 'Travis County Rescue', '[{"name":"Patel","band":"1"}]'::jsonb, 'boat');
  insert into t_r values (false, 'a band on someone was given again');
exception when others then insert into t_r values (sqlerrm = 'Band 001 is on Okafor (Unit 2) already', 'a band on someone is refused at check-in: ' || sqlerrm); end $$;
do $$ begin
  perform public.ic_join((select code from t_ctx), 'unit', 'Unit 2', null, 2, 'Travis County Rescue', '[{"name":"Patel","band":"9"}]'::jsonb, 'boat');
  insert into t_r values (false, 'a band that does not exist was accepted');
exception when others then insert into t_r values (sqlerrm = 'No band 9 on this incident', 'an unknown band is refused: ' || sqlerrm); end $$;
-- the unit gives Patel band 2 by scanning it; a scan of an unissued band is refused first
do $$ begin
  insert into public.ic_seen (incident_id, tag_id, kind, zone_id) values ((select incident from t_ctx), pg_temp.tag(2), 'enter', (select zone from t_ctx));
  insert into t_r values (false, 'a scan of a band on nobody was accepted');
exception when others then insert into t_r values (sqlerrm = 'Band 002 is not on anyone yet', 'a band on nobody cannot be seen: ' || sqlerrm); end $$;
update public.ic_tags set person_id = (select patel from t_ctx) where id = pg_temp.tag(2);
insert into t_r select person_id = (select patel from t_ctx) and kind = 'responder', 'the unit gives its person a band' from public.ic_tags where id = pg_temp.tag(2);
insert into t_r select exists (select 1 from t_log where text = 'Band 002 given to Patel (Unit 2) by Unit 2'), 'and the 214 says so';
do $$ begin
  update public.ic_tags set person_id = (select okafor from t_ctx) where id = pg_temp.tag(3);
  insert into t_r values (false, 'a second band went on Okafor');
exception when others then insert into t_r values (sqlerrm = 'Okafor has a band already; void it first', 'one live band per person: ' || sqlerrm); end $$;
insert into public.ic_seen (incident_id, tag_id, kind, zone_id, lat, lng) values ((select incident from t_ctx), pg_temp.tag(2), 'enter', (select zone from t_ctx), 30.255, -97.745);
insert into t_r select exists (select 1 from t_log where text = 'Patel (Unit 2) seen entering A-2, by Unit 2'), 'a scan in the division is a line';
update public.ic_seen set kind = 'leave' where tag_id = pg_temp.tag(2);   -- no update policy: nothing changes, and the trigger refuses any definer path
insert into t_r select bool_and(kind = 'enter'), 'a scan is never changed' from public.ic_seen where tag_id = pg_temp.tag(2);
reset role;

-- ---- another unit may not give or void this unit's bands; the desk gives a sheltered person a band
select pg_temp.as_user((select crew2 from t_ctx));
set local role authenticated;
select public.ic_join((select code from t_ctx), 'unit', 'Unit 4', null, 1, 'Travis County Rescue', '[]'::jsonb, 'engine');
do $$ begin
  update public.ic_tags set voided_at = now() where id = pg_temp.tag(2);
  insert into t_r values (false, 'another unit voided a band');
exception when others then insert into t_r values (sqlerrm = 'Only Operations or whoever gave the band voids it', 'another unit cannot void it: ' || sqlerrm); end $$;
reset role;
select pg_temp.as_user((select desk from t_ctx));
set local role authenticated;
select public.ic_join((select code from t_ctx), 'unit', 'Gym desk', null, 1, 'Red Cross', '[]'::jsonb, 'shelter_desk');
update public.ic_members set facility_id = (select gym from t_ctx) where incident_id = (select incident from t_ctx) and user_id = (select desk from t_ctx);
with e as (insert into public.ic_evacuees (incident_id, label, count, status, facility_id) values ((select incident from t_ctx), 'Lopez, Ana', 1, 'here', (select gym from t_ctx)) returning id) update t_ctx set lee = e.id from e;
update public.ic_tags set evacuee_id = (select lee from t_ctx) where id = pg_temp.tag(3);
insert into t_r select evacuee_id = (select lee from t_ctx) and kind = 'evacuee' and issued_by = (select desk from t_ctx), 'the desk gives a sheltered person a band' from public.ic_tags where id = pg_temp.tag(3);
insert into public.ic_seen (incident_id, tag_id, kind, facility_id) values ((select incident from t_ctx), pg_temp.tag(3), 'arrive', (select gym from t_ctx));
insert into t_r select exists (select 1 from t_log where text = 'Lopez, Ana seen at High school gym, by Gym desk'), 'a scan at the shelter door is a line';
reset role;

-- ---- a band from another incident, a voided band, and the PAR answer that counts the scans
select pg_temp.as_user((select ops from t_ctx));
set local role authenticated;
update t_ctx set other_inc = r.id from (select * from public.ic_create_incident('Other incident', null, null, null, null, 14)) r;
update t_ctx set other_tag = (select id from public.ic_print_bands((select other_inc from t_ctx), 1) limit 1);
do $$ begin
  insert into public.ic_seen (incident_id, tag_id, kind) values ((select incident from t_ctx), (select other_tag from t_ctx), 'check_in');
  insert into t_r values (false, 'a band from another incident was seen');
exception when others then insert into t_r values (sqlerrm = 'that band is from another incident', 'a band from another incident is refused: ' || sqlerrm); end $$;
update public.ic_tags set voided_at = now() where id = pg_temp.tag(1);
insert into t_r select voided_at is not null and voided_by = (select ops from t_ctx) and person_id = (select okafor from t_ctx), 'Operations voids a band; it stays on record with who had it' from public.ic_tags where id = pg_temp.tag(1);
insert into t_r select exists (select 1 from t_log where text = 'Band 001 (Okafor (Unit 2)) voided by Operations'), 'the void is a line';
do $$ begin
  insert into public.ic_seen (incident_id, tag_id, kind) values ((select incident from t_ctx), pg_temp.tag(1), 'enter');
  insert into t_r values (false, 'a voided band was seen');
exception when others then insert into t_r values (sqlerrm = 'Band 001 was voided', 'a voided band is refused: ' || sqlerrm); end $$;
do $$ begin
  update public.ic_tags set voided_at = null where id = pg_temp.tag(1);
  insert into t_r values (false, 'a voided band came back');
exception when others then insert into t_r values (sqlerrm = 'a voided band stays voided; give a new one', 'a voided band stays voided: ' || sqlerrm); end $$;
with m as (insert into public.ic_messages (incident_id, from_user, to_users, to_label, kind, text) values ((select incident from t_ctx), (select ops from t_ctx), array[(select crew from t_ctx)], 'everyone', 'par', 'PAR: is everyone accounted for?') returning id) update t_ctx set par = m.id from m;
reset role;
select pg_temp.as_user((select crew from t_ctx));
set local role authenticated;
insert into public.ic_seen (incident_id, tag_id, kind, message_id) values ((select incident from t_ctx), pg_temp.tag(2), 'par', (select par from t_ctx));
insert into t_r select exists (select 1 from t_log where text = 'Patel (Unit 2) seen on the PAR, by Unit 2'), 'a scan on the PAR is a line';
insert into public.ic_message_acks (message_id, incident_id, user_id, reply, count, scanned) values ((select par from t_ctx), (select incident from t_ctx), (select crew from t_ctx), 'All accounted for', 2, 1);
insert into t_r select exists (select 1 from t_log where text = 'Unit 2: All accounted for (2, 1 scanned)'), 'the PAR answer counts the scans';
reset role;

-- ---- the clearing by rule voids the sheltered person's band with her name, not the responders'
select pg_temp.as_user((select ops from t_ctx));
set local role authenticated;
update public.ic_incidents set status = 'closed' where id = (select incident from t_ctx);
select public.ic_clear_personal((select incident from t_ctx));
insert into t_r select (select voided_at is not null from public.ic_tags where id = pg_temp.tag(3)) and (select voided_at is null from public.ic_tags where id = pg_temp.tag(2)), 'cleared: Lopez''s band is voided, Patel''s is not';
insert into t_r select exists (select 1 from t_log where text like 'Personal records cleared by rule: %, 1 band voided'), 'and the line counts it';
insert into t_r select not exists (select 1 from t_log where text like 'Band 003%voided by%'), 'quietly, no line per band';
reset role;
select * from t_r order by ok, what;
rollback;
