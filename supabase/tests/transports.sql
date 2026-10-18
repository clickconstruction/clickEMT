-- The rules of the transport board (migration 0031), run against the real database inside one transaction that is
-- rolled back at the end, so nothing is left behind:  python3 dev/sbq.py supabase/tests/transports.sql
-- Every row of the result should say ok: true. Pretend accounts stand in for Operations (e1), a crew (e2), the
-- shelter desk at the gym (e3), another unit (e4) and a unit that drives (e5).
begin;
create temp table t_r (ok boolean, what text);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
select ('00000000-0000-4000-8000-0000000000e' || n)::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tr-test-' || n || '@example.invalid', '', now(), now(), now(), '{}', '{}', false, false
from generate_series(1, 5) n;
create temp table t_ctx (incident uuid, code text, gym uuid, hospital uuid, zone uuid, bus uuid, van uuid, boat uuid, garza uuid, tam uuid, lee uuid,
  ops uuid default '00000000-0000-4000-8000-0000000000e1', crew uuid default '00000000-0000-4000-8000-0000000000e2', desk uuid default '00000000-0000-4000-8000-0000000000e3',
  other uuid default '00000000-0000-4000-8000-0000000000e4', driver uuid default '00000000-0000-4000-8000-0000000000e5');
insert into t_ctx (incident) values (null);
grant all on t_r, t_ctx to authenticated;
insert into public.ic_profiles (user_id, full_name, phone) select ('00000000-0000-4000-8000-0000000000e' || n)::uuid, 'Person ' || n, '512 555 02' || n from generate_series(2, 5) n;
create temp view t_log as select text from public.ic_events where incident_id = (select incident from t_ctx);
grant select on t_log to authenticated;
create or replace function pg_temp.as_user(p uuid) returns text language sql as $$ select set_config('request.jwt.claims', '{"sub":"' || p || '","role":"authenticated"}', true); $$;

-- ---- Operations opens the incident, a shelter, a hospital and a division, and plans Bus 2
select pg_temp.as_user((select ops from t_ctx));
set local role authenticated;
update t_ctx set incident = r.id, code = r.code from (select * from public.ic_create_incident('Transport rule test', null, 'Depot', null, null, 14)) r;
with f as (insert into public.ic_facilities (incident_id, kind, name, lat, lng) values ((select incident from t_ctx), 'shelter', 'High school gym', 30.256, -97.742) returning id) update t_ctx set gym = (select id from f);
with f as (insert into public.ic_facilities (incident_id, kind, name, lat, lng) values ((select incident from t_ctx), 'hospital', 'Dell Seton', 30.278, -97.733) returning id) update t_ctx set hospital = (select id from f);
with z as (insert into public.ic_zones (incident_id, code, name, priority, polygon, structures) values ((select incident from t_ctx), 'A-2', 'Pecan Park', 1, '{"type":"Polygon","coordinates":[[[-97.75,30.25],[-97.74,30.25],[-97.74,30.26],[-97.75,30.26],[-97.75,30.25]]]}'::jsonb, 4) returning id) update t_ctx set zone = z.id from z;
with t as (insert into public.ic_transports (incident_id, kind, label, from_text, to_facility_id, capacity, driver_text) values ((select incident from t_ctx), 'bus', 'Bus 2', 'Pecan Park pickup', (select gym from t_ctx), 40, 'Travis ISD, 512 555 0177') returning id) update t_ctx set bus = t.id from t;
insert into t_r select status = 'planned' and status_at is not null and created_by = (select ops from t_ctx) and left_at is null and arrived_at is null, 'a new run is planned, stamped, by its maker' from public.ic_transports where id = (select bus from t_ctx);
insert into t_r select exists (select 1 from t_log where text = 'Bus 2 planned by Operations: Pecan Park pickup to High school gym, 40 seats, driver Travis ISD, 512 555 0177'), 'the 214 has the plan with the seats and the driver';
do $$ begin
  insert into public.ic_transports (incident_id, kind, label, to_facility_id) values ((select incident from t_ctx), 'van', 'Van 9', gen_random_uuid());
  insert into t_r values (false, 'a run to a facility not on the incident was accepted');
exception when others then insert into t_r values (sqlerrm like 'say where to:%', 'a run needs a destination on this incident: ' || sqlerrm); end $$;
do $$ begin
  update public.ic_transports set status = 'done' where id = (select bus from t_ctx);
  insert into t_r values (false, 'a planned run was marked done');
exception when others then insert into t_r values (sqlerrm = 'a run arrives before it is done', 'done waits for arrived: ' || sqlerrm); end $$;
reset role;

-- ---- a crew puts a family on the bus from the house: the record is on the way to the bus's destination from that moment
select pg_temp.as_user((select crew from t_ctx));
set local role authenticated;
select public.ic_join((select code from t_ctx), 'unit', 'Unit 2', null, 2, 'Travis County Rescue', '[]'::jsonb, 'boat');
with e as (insert into public.ic_evacuees (incident_id, label, count, needs, from_text, status, facility_id, transport_id) values ((select incident from t_ctx), 'Garza, family of 3', 3, '{infant}', '120 Pecan Ln', 'unknown', null, (select bus from t_ctx)) returning id) update t_ctx set garza = e.id from e;
insert into t_r select status = 'on_the_way' and facility_id = (select gym from t_ctx) and transport_id = (select bus from t_ctx), 'put on a run to a shelter, a record is on the way there whatever was typed' from public.ic_evacuees where id = (select garza from t_ctx);
insert into t_r select exists (select 1 from t_log where text = 'Unit 2 sent Garza, family of 3 from 120 Pecan Ln to High school gym on Bus 2, needs infant care'), 'the 214 names the run the crew put them on';
reset role;

-- ---- Operations puts a record already on file on the bus, and another unit may not touch the run
select pg_temp.as_user((select ops from t_ctx));
set local role authenticated;
with e as (insert into public.ic_evacuees (incident_id, label, count, needs, status, facility_id) values ((select incident from t_ctx), 'Nguyen, Tam', 1, '{oxygen}', 'moved', (select hospital from t_ctx)) returning id) update t_ctx set tam = e.id from e;
update public.ic_evacuees set transport_id = (select bus from t_ctx) where id = (select tam from t_ctx);
insert into t_r select status = 'on_the_way' and facility_id = (select gym from t_ctx), 'put on the bus later, a record moves to its destination' from public.ic_evacuees where id = (select tam from t_ctx);
insert into t_r select exists (select 1 from t_log where text = 'Operations put Nguyen, Tam on Bus 2 to High school gym'), 'the 214 says who put them on it';
reset role;
select pg_temp.as_user((select other from t_ctx));
set local role authenticated;
select public.ic_join((select code from t_ctx), 'unit', 'Unit 4', null, 1, 'Travis County Rescue', '[]'::jsonb, 'engine');
update public.ic_transports set status = 'loading' where id = (select bus from t_ctx);
insert into t_r select status = 'planned', 'a unit that neither made nor drives the run cannot move it' from public.ic_transports where id = (select bus from t_ctx);
insert into t_r select exists (select 1 from public.ic_transports where id = (select bus from t_ctx)), 'but it can see the run';
reset role;

-- ---- the steps: loading, leaving, and a false press undone
select pg_temp.as_user((select ops from t_ctx));
set local role authenticated;
update public.ic_transports set status = 'loading' where id = (select bus from t_ctx);
insert into t_r select exists (select 1 from t_log where text = 'Bus 2 loading at Pecan Park pickup for High school gym'), 'loading is a line';
update public.ic_transports set status = 'en_route' where id = (select bus from t_ctx);
insert into t_r select left_at is not null and arrived_at is null, 'leaving stamps left_at' from public.ic_transports where id = (select bus from t_ctx);
insert into t_r select exists (select 1 from t_log where text = 'Bus 2 left Pecan Park pickup for High school gym with 4 people in 2 records'), 'the 214 counts who left on it';
update public.ic_transports set status = 'loading' where id = (select bus from t_ctx);
insert into t_r select left_at is null, 'back to loading clears the departure (a false press)' from public.ic_transports where id = (select bus from t_ctx);
update public.ic_transports set status = 'en_route' where id = (select bus from t_ctx);
reset role;

-- ---- the desk at the gym marks the bus arrived and signs the records in; one who leaves is off the run
select pg_temp.as_user((select desk from t_ctx));
set local role authenticated;
select public.ic_join((select code from t_ctx), 'unit', 'Gym desk', null, 1, 'Red Cross', '[]'::jsonb, 'shelter_desk');
update public.ic_members set facility_id = (select gym from t_ctx) where incident_id = (select incident from t_ctx) and user_id = (select desk from t_ctx);
update public.ic_transports set status = 'arrived' where id = (select bus from t_ctx);
insert into t_r select status = 'arrived' and arrived_at is not null, 'the desk at the destination may mark the run arrived' from public.ic_transports where id = (select bus from t_ctx);
insert into t_r select exists (select 1 from t_log where text = 'Bus 2 arrived at High school gym with 4 people in 2 records'), 'the arrival is a line with who was on it';
update public.ic_evacuees set status = 'here', facility_id = (select gym from t_ctx) where transport_id = (select bus from t_ctx);
insert into t_r select count(*) = 2, 'signed in at the destination, the records stay on the run for the history' from public.ic_evacuees where transport_id = (select bus from t_ctx) and status = 'here';
insert into t_r select exists (select 1 from t_log where text = 'High school gym: Gym desk signed in Garza, family of 3, from 120 Pecan Ln, needs infant care'), 'the sign-in line reads as before';
update public.ic_evacuees set status = 'with_family' where id = (select tam from t_ctx);
insert into t_r select transport_id is null and status = 'with_family', 'a record that leaves the destination is off the run' from public.ic_evacuees where id = (select tam from t_ctx);
reset role;

-- ---- done is final, and a done run takes nobody
select pg_temp.as_user((select ops from t_ctx));
set local role authenticated;
update public.ic_transports set status = 'done' where id = (select bus from t_ctx);
insert into t_r select exists (select 1 from t_log where text = 'Bus 2 done at High school gym, 3 people in 1 record'), 'done is a line with who rode it';
do $$ begin
  update public.ic_transports set status = 'en_route' where id = (select bus from t_ctx);
  insert into t_r values (false, 'a done run was moved');
exception when others then insert into t_r values (sqlerrm = 'a run that is done stays done', 'a done run stays done: ' || sqlerrm); end $$;
do $$ begin
  update public.ic_evacuees set transport_id = (select bus from t_ctx) where id = (select tam from t_ctx);
  insert into t_r values (false, 'a record was put on a done run');
exception when others then insert into t_r values (sqlerrm = 'that run is done', 'a done run takes nobody: ' || sqlerrm); end $$;

-- ---- a run whose destination changes takes its records with it, quietly; a withdrawn run takes nobody
with t as (insert into public.ic_transports (incident_id, kind, label, from_zone_id, to_facility_id) values ((select incident from t_ctx), 'van', 'Van 1', (select zone from t_ctx), (select gym from t_ctx)) returning id) update t_ctx set van = t.id from t;
insert into t_r select exists (select 1 from t_log where text = 'Van 1 planned by Operations: A-2 Pecan Park to High school gym'), 'a run from a division names it';
with e as (insert into public.ic_evacuees (incident_id, label, count, status, facility_id, transport_id) values ((select incident from t_ctx), 'Mrs. Lee, 90', 1, 'on_the_way', (select gym from t_ctx), (select van from t_ctx)) returning id) update t_ctx set lee = e.id from e;
update public.ic_transports set to_facility_id = (select hospital from t_ctx) where id = (select van from t_ctx);
insert into t_r select status = 'moved' and facility_id = (select hospital from t_ctx) and transport_id = (select van from t_ctx), 'a new destination moves the records on the run' from public.ic_evacuees where id = (select lee from t_ctx);
insert into t_r select exists (select 1 from t_log where text = 'Van 1 now going to Dell Seton with 1 person in 1 record'), 'one line for the new destination';
insert into t_r select not exists (select 1 from t_log where text like 'Mrs. Lee, 90 moved%'), 'and no line per record';
update public.ic_transports set archived_at = now() where id = (select van from t_ctx);
insert into t_r select exists (select 1 from t_log where text = 'Van 1 withdrawn by Operations'), 'a withdrawn run is a line';
do $$ begin
  update public.ic_evacuees set transport_id = (select van from t_ctx) where id = (select garza from t_ctx);
  insert into t_r values (false, 'a record was put on a withdrawn run');
exception when others then insert into t_r values (sqlerrm = 'that run was withdrawn', 'a withdrawn run takes nobody: ' || sqlerrm); end $$;
update public.ic_transports set capacity = 12 where id = (select bus from t_ctx);
insert into t_r select exists (select 1 from t_log where text = 'Bus 2 updated'), 'any other change is one "updated" line';
reset role;

-- ---- a unit that drives a run moves it; the run names its driver
select pg_temp.as_user((select driver from t_ctx));
set local role authenticated;
select public.ic_join((select code from t_ctx), 'unit', 'Unit 5', null, 2, 'Travis County EMS', '[]'::jsonb, 'ambulance');
reset role;
select pg_temp.as_user((select ops from t_ctx));
set local role authenticated;
with t as (insert into public.ic_transports (incident_id, kind, label, from_text, to_facility_id, capacity, driver_user_id) values ((select incident from t_ctx), 'boat', 'Boat run 3', 'Mill Street bridge', (select gym from t_ctx), 6, (select driver from t_ctx)) returning id) update t_ctx set boat = t.id from t;
insert into t_r select exists (select 1 from t_log where text = 'Boat run 3 planned by Operations: Mill Street bridge to High school gym, 6 seats, driver Unit 5'), 'a driver who is a unit is named by the unit';
do $$ begin
  update public.ic_transports set driver_user_id = gen_random_uuid() where id = (select boat from t_ctx);
  insert into t_r values (false, 'a stranger was made driver');
exception when others then insert into t_r values (sqlerrm = 'the driver is not on this incident', 'the driver is a member: ' || sqlerrm); end $$;
reset role;
select pg_temp.as_user((select driver from t_ctx));
set local role authenticated;
update public.ic_transports set status = 'loading' where id = (select boat from t_ctx);
insert into t_r select status = 'loading', 'the driver moves the run' from public.ic_transports where id = (select boat from t_ctx);
reset role;
select pg_temp.as_user((select other from t_ctx));
set local role authenticated;
update public.ic_transports set status = 'en_route' where id = (select boat from t_ctx);
insert into t_r select status = 'loading', 'another unit still cannot' from public.ic_transports where id = (select boat from t_ctx);
reset role;
select * from t_r order by ok, what;
rollback;
