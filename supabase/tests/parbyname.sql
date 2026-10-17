-- The rules for accountability by name (migration 0021), run against the real database inside one
-- transaction that is rolled back at the end:
--   python3 dev/sbq.py supabase/tests/parbyname.sql
-- Every row of the result should say ok: true. Four pretend accounts: Operations, a unit with two names
-- and a count of four, a unit with a count and no names, and a unit with neither.
begin;
create temp table t_r (ok boolean, what text);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'par-test-ops@example.invalid', '', now(), now(), now(), '{}', '{}', false, false),
       ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'par-test-named@example.invalid', '', now(), now(), now(), '{}', '{}', false, false),
       ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'par-test-counted@example.invalid', '', now(), now(), now(), '{}', '{}', false, false),
       ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'par-test-blank@example.invalid', '', now(), now(), now(), '{}', '{}', false, false);
create temp table t_ctx (incident uuid, code text, par uuid, okafor uuid,
  ops uuid default '00000000-0000-4000-8000-0000000000d1', named uuid default '00000000-0000-4000-8000-0000000000d2', counted uuid default '00000000-0000-4000-8000-0000000000d3', blank uuid default '00000000-0000-4000-8000-0000000000d4');
insert into t_ctx (incident) values (null);
grant all on t_r, t_ctx to authenticated;
insert into public.ic_profiles (user_id, full_name, phone) values
  ('00000000-0000-4000-8000-0000000000d2', 'Ana Ramirez', '512 555 0001'), ('00000000-0000-4000-8000-0000000000d3', 'Luis Moreno', '512 555 0002'), ('00000000-0000-4000-8000-0000000000d4', 'Pat Doe', '512 555 0003');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;
update t_ctx set incident = r.id, code = r.code from (select * from public.ic_create_incident('PAR by name test', null, null, null, null, 14)) r;
reset role;

-- a unit with two names and a count of four: two named, two unnamed, four in all
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d2","role":"authenticated"}', true);
set local role authenticated;
select public.ic_join((select code from t_ctx), 'unit', 'Unit N', null, 4, 'Cedar Fork FD', '[{"name":"Ramirez","qualifications":["emt"]},{"name":"Okafor","qualifications":["paramedic"]}]'::jsonb, 'engine');
insert into t_r select crew_count = 4 and unnamed_count = 2 and crew = 'Ramirez, Okafor', 'two names and a count of four: head count 4, two unnamed: ' || crew_count || ' / ' || unnamed_count from public.ic_members where incident_id = (select incident from t_ctx) and user_id = (select named from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Unit N, engine checked in as Ana Ramirez, 512 555 0001, identity not given with 4 people'), 'the check-in line counts all four';
update t_ctx set okafor = (select id from public.ic_people where incident_id = (select incident from t_ctx) and name = 'Okafor');
-- naming one of the unnamed later keeps the count
insert into public.ic_people (incident_id, user_id, name, qualifications) values ((select incident from t_ctx), (select named from t_ctx), 'Third', '{}');
insert into t_r select crew_count = 4 and unnamed_count = 1, 'naming one of the unnamed keeps the head count and takes one off the unnamed: ' || crew_count || ' / ' || unnamed_count from public.ic_members where incident_id = (select incident from t_ctx) and user_id = (select named from t_ctx);
-- the unit edits its own person; the edit is logged
update public.ic_people set role = 'Lt.', agency = 'Travis County Rescue', notes = 'Boat operator' where id = (select okafor from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Okafor (paramedic) updated on Unit N, Lt., Travis County Rescue, notes changed'), 'an edit to rank, agency and notes is logged';
reset role;

-- a unit with a count and no names: the number stands
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d3","role":"authenticated"}', true);
set local role authenticated;
select public.ic_join((select code from t_ctx), 'unit', 'Unit C', null, 3, 'Sheriff', null, 'other');
insert into t_r select crew_count = 3 and unnamed_count = 3 and crew is null, 'a count with no names stands: ' || crew_count from public.ic_members where incident_id = (select incident from t_ctx) and user_id = (select counted from t_ctx);
reset role;

-- a unit with neither: the head count is unknown (the apps say so and block the PAR until it is typed)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d4","role":"authenticated"}', true);
set local role authenticated;
select public.ic_join((select code from t_ctx), 'unit', 'Unit B', null, null, 'Volunteers', null, null);
insert into t_r select crew_count is null and unnamed_count is null, 'with no names and no count the head count is unknown' from public.ic_members where incident_id = (select incident from t_ctx) and user_id = (select blank from t_ctx);
reset role;

-- Operations starts a PAR
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;
with m as (insert into public.ic_messages (incident_id, from_user, to_users, to_label, kind, text) values ((select incident from t_ctx), (select ops from t_ctx), array[(select named from t_ctx), (select counted from t_ctx), (select blank from t_ctx)], 'everyone', 'par', 'PAR: is everyone accounted for?') returning id) update t_ctx set par = m.id from m;
reset role;

-- the named unit answers: Okafor is missing, three accounted for; the alert names him
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d2","role":"authenticated"}', true);
set local role authenticated;
insert into public.ic_message_acks (message_id, incident_id, user_id, reply, count, missing) values ((select par from t_ctx), (select incident from t_ctx), (select named from t_ctx), 'Missing someone', 3, jsonb_build_array(jsonb_build_object('id', (select okafor from t_ctx), 'name', 'Okafor')));
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Unit N: Missing someone: Okafor (3 accounted for)'), 'the PAR line names who is missing and how many are accounted for';
insert into public.ic_alerts (incident_id, user_id, note) values ((select incident from t_ctx), (select named from t_ctx), 'Missing: Okafor');
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'EMERGENCY, Unit N needs help in the field: Missing: Okafor'), 'the emergency alert names them';
reset role;

-- the counted unit answers all accounted for, as before
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d3","role":"authenticated"}', true);
set local role authenticated;
insert into public.ic_message_acks (message_id, incident_id, user_id, reply, count) values ((select par from t_ctx), (select incident from t_ctx), (select counted from t_ctx), 'All accounted for', 3);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Unit C: All accounted for (3)'), 'an answer with no names reads as before';
insert into t_r select missing = '[]'::jsonb, 'and carries an empty missing list' from public.ic_message_acks where message_id = (select par from t_ctx) and user_id = (select counted from t_ctx);
reset role;

select * from t_r order by ok, what;
rollback;
