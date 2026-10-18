-- The check-in head count through every way in (migration 0034), run against the real database inside one
-- transaction that is rolled back at the end:  python3 dev/sbq.py supabase/tests/joincount.sql
-- Every row of the result should say ok: true. 0032 and 0033 rewrote ic_join from a body older than 0021 and lost
-- the unnamed and the order typed; this checks the code, a band on a person's row and an invitation each keep them.
-- Pretend accounts stand in for Operations (j1), a crew joining by code with a band (j2), an invited unit (j3) and
-- a unit alone (j4).
begin;
create temp table t_r (ok boolean, what text);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
select ('00000000-0000-4000-8000-00000000003' || n)::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'jc-test-' || n || '@example.invalid', '', now(), now(), now(), '{}', '{}', false, false
from generate_series(1, 4) n;
create temp table t_ctx (incident uuid, code text, token text,
  ops uuid default '00000000-0000-4000-8000-000000000031', crew uuid default '00000000-0000-4000-8000-000000000032',
  guest uuid default '00000000-0000-4000-8000-000000000033', alone uuid default '00000000-0000-4000-8000-000000000034');
insert into t_ctx (incident) values (null);
grant all on t_r, t_ctx to authenticated;
insert into public.ic_profiles (user_id, full_name, phone) select ('00000000-0000-4000-8000-00000000003' || n)::uuid, 'Person ' || n, '512 555 03' || n from generate_series(1, 4) n;
create temp view t_log as select text from public.ic_events where incident_id = (select incident from t_ctx);
grant select on t_log to authenticated;
create temp view t_unit as select user_id, crew, crew_count, unnamed_count from public.ic_members where incident_id = (select incident from t_ctx);
grant select on t_unit to authenticated;
create or replace function pg_temp.as_user(p uuid, e text default null) returns text language sql as $$ select set_config('request.jwt.claims', '{"sub":"' || p || '","role":"authenticated"' || case when e is null then '' else ',"email":"' || e || '"' end || '}', true); $$;

-- ---- Operations opens the incident, prints two bands and invites a unit
select pg_temp.as_user((select ops from t_ctx));
set local role authenticated;
update t_ctx set incident = r.id, code = r.code from (select * from public.ic_create_incident('Join count rule test', null, 'Depot', null, null, 14)) r;
select count(*) from public.ic_print_bands((select incident from t_ctx), 2);
with v as (insert into public.ic_invites (incident_id, email, role, unit_name) values ((select incident from t_ctx), 'jc-test-3@example.invalid', 'unit', 'Unit 7') returning token) update t_ctx set token = v.token from v;
update public.ic_invites set sent_at = now() where token = (select token from t_ctx);
reset role;

-- ---- by code, with a band on the first name: four with me, two named, typed Hale first
select pg_temp.as_user((select crew from t_ctx));
set local role authenticated;
select public.ic_join((select code from t_ctx), 'unit', 'Unit 2', null, 4, 'Travis County Rescue', '[{"name":"Hale","qualifications":[],"band":"1"},{"name":"Dominguez","qualifications":["emt"]}]'::jsonb, 'boat');
insert into t_r select crew_count = 4 and unnamed_count = 2, 'by code with a band: four with me and two named is four, two unnamed: ' || coalesce(crew_count::text, 'null') || ' / ' || coalesce(unnamed_count::text, 'null') from t_unit where user_id = (select crew from t_ctx);
insert into t_r select crew = 'Hale, Dominguez', 'the crew reads in the order typed: ' || coalesce(crew, 'null') from t_unit where user_id = (select crew from t_ctx);
insert into t_r select exists (select 1 from t_log where text like 'Unit 2, boat crew checked in as Person 2, % with 4 people'), 'the check-in line counts all four';
insert into t_r select exists (select 1 from public.ic_tags t join public.ic_people p on p.id = t.person_id where t.incident_id = (select incident from t_ctx) and t.number = 1 and p.name = 'Hale'), 'the band went on Hale as before';
-- the same crew checks in again with one more name and the count still four: three named, one unnamed
select public.ic_join((select code from t_ctx), 'unit', 'Unit 2', null, 4, 'Travis County Rescue', '[{"name":"hale"},{"name":"Dominguez"},{"name":"Third"}]'::jsonb, 'boat');
insert into t_r select crew_count = 4 and unnamed_count = 1 and crew = 'Hale, Dominguez, Third', 'checked in again: a name typed in any case is the same person, the new name comes off the unnamed: ' || coalesce(crew, 'null') || ' / ' || coalesce(crew_count::text, 'null') || ' / ' || coalesce(unnamed_count::text, 'null') from t_unit where user_id = (select crew from t_ctx);
-- naming one of the unnamed later, from the phone's People, keeps the count and takes one off the unnamed
insert into public.ic_people (incident_id, user_id, name, qualifications) values ((select incident from t_ctx), (select crew from t_ctx), 'Fourth', '{}');
insert into t_r select crew_count = 4 and unnamed_count = 0, 'naming the last of the unnamed later keeps four: ' || coalesce(crew_count::text, 'null') || ' / ' || coalesce(unnamed_count::text, 'null') from t_unit where user_id = (select crew from t_ctx);
reset role;

-- ---- by invitation: three with me, one named
select pg_temp.as_user((select guest from t_ctx), 'jc-test-3@example.invalid');
set local role authenticated;
select public.ic_join(null, 'unit', null, null, 3, 'Cedar Fork FD', '[{"name":"Lee","qualifications":[]}]'::jsonb, 'engine', (select token from t_ctx));
insert into t_r select crew_count = 3 and unnamed_count = 2 and crew = 'Lee', 'by invitation: three with me and one named is three, two unnamed: ' || coalesce(crew_count::text, 'null') || ' / ' || coalesce(unnamed_count::text, 'null') from t_unit where user_id = (select guest from t_ctx);
insert into t_r select exists (select 1 from t_log where text like 'Unit 7, engine checked in by invitation as Person 3, % with 3 people'), 'the invitation''s check-in line counts all three';
reset role;

-- ---- a unit alone that leaves the box at one: one person, unnamed, never unknown (v51)
select pg_temp.as_user((select alone from t_ctx));
set local role authenticated;
select public.ic_join((select code from t_ctx), 'unit', 'Post 7', null, 1, 'Sheriff', '[]'::jsonb, null);
insert into t_r select crew_count = 1 and unnamed_count = 1 and crew is null, 'alone at one: one person, one unnamed: ' || coalesce(crew_count::text, 'null') || ' / ' || coalesce(unnamed_count::text, 'null') from t_unit where user_id = (select alone from t_ctx);
insert into t_r select exists (select 1 from t_log where text like 'Post 7 checked in as Person 4, % with 1 person'), 'the check-in line says one person';
reset role;

select * from t_r order by ok, what;
rollback;
