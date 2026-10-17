-- The rules of shelter and evacuee records (migration 0018), run against the real database inside one
-- transaction that is rolled back at the end, so nothing is left behind:
--   python3 -I dev/sbq.py supabase/tests/evacuees.sql
-- Every row of the result should say ok: true. Pretend accounts stand in for Operations (d1), a boat
-- crew (d2), the shelter desk at the gym (d3), the desk at a second shelter (d4), another unit (d5) and
-- someone not on the incident (d6).
begin;
create temp table t_r (ok boolean, what text);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
select ('00000000-0000-4000-8000-0000000000d' || n)::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'evac-test-' || n || '@example.invalid', '', now(), now(), now(), '{}', '{}', false, false
from generate_series(1, 6) n;
create temp table t_ctx (incident uuid, code text, gym uuid, church uuid, hospital uuid, house uuid, family uuid, maria uuid, tam uuid);
insert into t_ctx (incident) values (null);
grant all on t_r, t_ctx to authenticated;
insert into public.ic_profiles (user_id, full_name, phone)
select ('00000000-0000-4000-8000-0000000000d' || n)::uuid, 'Person ' || n, '512 555 01' || n from generate_series(2, 6) n;
create temp view t_log as select text from public.ic_events where incident_id = (select incident from t_ctx);
grant select on t_log to authenticated;

-- ---- Operations opens the incident, places two shelters and a hospital, gives the gym its beds and who is expected
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;
update t_ctx set incident = r.id, code = r.code from (select * from public.ic_create_incident('Evacuee rule test', null, 'Depot', null, null, 14)) r;
with f as (insert into public.ic_facilities (incident_id, kind, name, lat, lng) values ((select incident from t_ctx), 'shelter', 'High school gym', 30.256, -97.742) returning id) update t_ctx set gym = (select id from f);
with f as (insert into public.ic_facilities (incident_id, kind, name, lat, lng) values ((select incident from t_ctx), 'shelter', 'Church hall', 30.260, -97.736) returning id) update t_ctx set church = (select id from f);
with f as (insert into public.ic_facilities (incident_id, kind, name, lat, lng) values ((select incident from t_ctx), 'hospital', 'Dell Seton', 30.278, -97.733) returning id) update t_ctx set hospital = (select id from f);
update public.ic_facilities set beds = 60, expected = 'Bus 2 from Pecan Park, 12 people, 17:30' where id = (select gym from t_ctx);
insert into t_r select exists (select 1 from t_log where text = 'Shelter: High school gym has 60 beds'), 'the beds are logged';
insert into t_r select exists (select 1 from t_log where text = 'Shelter: High school gym expecting Bus 2 from Pecan Park, 12 people, 17:30'), 'who is expected is logged';
insert into t_r select not exists (select 1 from t_log where text = 'Shelter: High school gym updated'), 'beds and expected alone are not an "updated" line';

-- ---- the units check in: a boat crew, a shelter desk at each shelter, an engine
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d2","role":"authenticated"}', true);
set local role authenticated;
select public.ic_join((select code from t_ctx), 'unit', 'Boat 4', null, null, 'Travis County Rescue', null, 'boat');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d3","role":"authenticated"}', true);
set local role authenticated;
select public.ic_join((select code from t_ctx), 'unit', 'Gym desk', null, null, 'Red Cross', null, 'shelter_desk');
insert into t_r select exists (select 1 from t_log where text = 'Gym desk, shelter desk checked in as Person 3, 512 555 013, identity not given'), 'a shelter desk is a kind of unit, said in the check-in line';
update public.ic_members set facility_id = (select gym from t_ctx) where incident_id = (select incident from t_ctx) and user_id = auth.uid();
insert into t_r select public.ic_is_desk((select incident from t_ctx), (select gym from t_ctx)) and not public.ic_is_desk((select incident from t_ctx), (select church from t_ctx)), 'the desk is the gym''s desk, not the church''s';
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d4","role":"authenticated"}', true);
set local role authenticated;
select public.ic_join((select code from t_ctx), 'unit', 'Church desk', null, null, 'Red Cross', null, 'shelter_desk');
update public.ic_members set facility_id = (select church from t_ctx) where incident_id = (select incident from t_ctx) and user_id = auth.uid();
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d5","role":"authenticated"}', true);
set local role authenticated;
select public.ic_join((select code from t_ctx), 'unit', 'Engine 9', null, null, 'Cedar Fork Fire Department', null, 'engine');

-- ---- the boat crew's house record gains two rows: a family on its way to the gym, a woman to hospital
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d2","role":"authenticated"}', true);
set local role authenticated;
with s as (insert into public.ic_structures (incident_id, label, occupants, people_needing_help) values ((select incident from t_ctx), '112 Pecan Ln', 'evacuated', 5) returning id) update t_ctx set house = (select id from s);
with e as (insert into public.ic_evacuees (incident_id, label, count, needs, note, structure_id, from_text, status, facility_id)
           values ((select incident from t_ctx), ' family of 4 ', 4, '{pets}', 'wet, cold, a dog', (select house from t_ctx), '112 Pecan Ln', 'on_the_way', (select gym from t_ctx)) returning id)
  update t_ctx set family = (select id from e);
with e as (insert into public.ic_evacuees (incident_id, label, needs, note, structure_id, from_text, status, facility_id)
           values ((select incident from t_ctx), 'Maria Alvarez, 78', '{oxygen}', 'on oxygen, stable', (select house from t_ctx), '112 Pecan Ln', 'moved', (select hospital from t_ctx)) returning id)
  update t_ctx set maria = (select id from e);
insert into t_r select exists (select 1 from t_log where text = 'Boat 4 sent family of 4 from 112 Pecan Ln to High school gym, needs pets'), 'a crew row on its way to a shelter is logged';
insert into t_r select exists (select 1 from t_log where text = 'Boat 4 sent Maria Alvarez, 78 from 112 Pecan Ln to Dell Seton, needs oxygen'), 'a crew row to hospital is logged';
insert into t_r select label = 'family of 4' and logged_by = auth.uid() and signed_in_at is null, 'the label is trimmed, the logger is the crew, nobody has signed them in yet'
  from public.ic_evacuees where id = (select family from t_ctx);

-- ---- another unit, and the other shelter's desk, cannot change the gym's record
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d5","role":"authenticated"}', true);
set local role authenticated;
update public.ic_evacuees set status = 'here' where id = (select family from t_ctx);
insert into t_r select (select status from public.ic_evacuees where id = (select family from t_ctx)) = 'on_the_way', 'another unit cannot sign the family in';
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d4","role":"authenticated"}', true);
set local role authenticated;
update public.ic_evacuees set status = 'here' where id = (select family from t_ctx);
insert into t_r select (select status from public.ic_evacuees where id = (select family from t_ctx)) = 'on_the_way', 'the church''s desk cannot sign in the gym''s arrival';

-- ---- the gym's desk: They're here, then the name; a walk-up signed in; a move to hospital
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d3","role":"authenticated"}', true);
set local role authenticated;
update public.ic_evacuees set status = 'here' where id = (select family from t_ctx);
insert into t_r select status = 'here' and signed_in_by = auth.uid() and signed_in_at is not null and logged_by = '00000000-0000-4000-8000-0000000000d2', 'They''re here: the desk signs the crew''s record in, the crew stays its logger'
  from public.ic_evacuees where id = (select family from t_ctx);
insert into t_r select exists (select 1 from t_log where text = 'High school gym: Gym desk signed in family of 4, from 112 Pecan Ln, needs pets'), 'the sign-in is logged at the shelter: ' || coalesce((select string_agg(text, ' | ') from t_log where text like '%signed in%'), 'no line');
update public.ic_evacuees set label = 'Alvarez, family of 4', needs = '{pets,insulin}' where id = (select family from t_ctx);
insert into t_r select exists (select 1 from t_log where text = 'family of 4 now on record as Alvarez, family of 4'), 'the name the desk adds is logged';
insert into t_r select needs = '{insulin,pets}', 'needs are kept once each, in order: ' || needs::text from public.ic_evacuees where id = (select family from t_ctx);
with e as (insert into public.ic_evacuees (incident_id, label, needs, from_text, status, facility_id) values ((select incident from t_ctx), 'Nguyen, Tam', '{oxygen}', '118 Pecan Ln', 'here', (select gym from t_ctx)) returning id)
  update t_ctx set tam = (select id from e);
insert into t_r select exists (select 1 from t_log where text = 'High school gym: Gym desk signed in Nguyen, Tam, from 118 Pecan Ln, needs oxygen'), 'a walk-up signed in by the desk is logged';
update public.ic_evacuees set status = 'moved', facility_id = (select hospital from t_ctx) where id = (select tam from t_ctx);
insert into t_r select exists (select 1 from t_log where text = 'Nguyen, Tam moved from High school gym to Dell Seton'), 'a move is logged from where to where';
insert into t_r select prev_facility_id = (select gym from t_ctx) and status_at >= signed_in_at, 'the record remembers the shelter it left, and since when it is where it is'
  from public.ic_evacuees where id = (select tam from t_ctx);
update public.ic_evacuees set note = 'went by ambulance' where id = (select tam from t_ctx);
insert into t_r select note = 'went by ambulance', 'the desk can still correct a record that left its shelter' from public.ic_evacuees where id = (select tam from t_ctx);
do $$ begin
  insert into public.ic_evacuees (incident_id, label, status) values ((select incident from t_ctx), 'Nobody knows where', 'here');
  insert into t_r values (false, 'a record "here" with no place was accepted');
exception when others then insert into t_r values (sqlerrm = 'say where: a shelter or a hospital', 'a record says where: ' || sqlerrm); end $$;
do $$ begin
  insert into public.ic_evacuees (incident_id, label, needs, status, facility_id) values ((select incident from t_ctx), 'Cake', '{cake}', 'here', (select gym from t_ctx));
  insert into t_r values (false, 'a need off the list was accepted');
exception when others then insert into t_r values (sqlstate = '23514', 'needs come from the list: ' || sqlstate); end $$;
delete from public.ic_evacuees where id = (select tam from t_ctx);
insert into t_r select exists (select 1 from public.ic_evacuees where id = (select tam from t_ctx)), 'nothing is deleted: there is no delete policy';
update public.ic_evacuees set archived_at = now() where id = (select tam from t_ctx);
insert into t_r select exists (select 1 from t_log where text = 'Record of Nguyen, Tam withdrawn by Gym desk'), 'a record is withdrawn, never removed, and that is logged';
update public.ic_evacuees set archived_at = null where id = (select tam from t_ctx);

-- ---- Operations: the family leaves with relatives; the woman's record moves on
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;
update public.ic_evacuees set status = 'with_family', facility_id = (select church from t_ctx) where id = (select family from t_ctx);
insert into t_r select status = 'with_family' and facility_id is null and prev_facility_id = (select gym from t_ctx), 'leaving with family clears where now and keeps where they were'
  from public.ic_evacuees where id = (select family from t_ctx);
insert into t_r select exists (select 1 from t_log where text = 'Alvarez, family of 4 left High school gym with family'), 'and it is logged';
update public.ic_evacuees set status = 'on_the_way', facility_id = (select church from t_ctx) where id = (select maria from t_ctx);
insert into t_r select exists (select 1 from t_log where text = 'Maria Alvarez, 78 moved to Church hall'), 'a record on its way elsewhere says where to: ' || coalesce((select string_agg(text, ' | ') from t_log where text like 'Maria%'), 'no line');

-- ---- someone not on the incident cannot see or add a record
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d6","role":"authenticated"}', true);
set local role authenticated;
insert into t_r select not exists (select 1 from public.ic_evacuees where incident_id = (select incident from t_ctx)), 'someone not on the incident sees no record';
do $$ begin
  insert into public.ic_evacuees (incident_id, label, status, facility_id) values ((select incident from t_ctx), 'Intruder', 'here', (select gym from t_ctx));
  insert into t_r values (false, 'someone not on the incident added a record');
exception when others then insert into t_r values (sqlstate = '42501', 'someone not on the incident cannot add one: ' || sqlstate); end $$;
reset role;

insert into t_r select public.ic_kind_text('shelter_desk') = 'shelter desk' and public.ic_needs_text('{pets,oxygen,infant}') = 'oxygen, infant care and pets' and public.ic_evacuee_who('Okonkwo family', 5) = 'Okonkwo family (5)' and public.ic_evacuee_who('', 3) = '3 people with no name yet', 'the words: a kind, the needs, who';

select * from t_r order by ok, what;
rollback;
