-- The rules the walkthrough fixes changed (migration 0017), run against the real database inside one
-- transaction that is rolled back at the end, so nothing is left behind:
--   python3 dev/sbq.py supabase/tests/walkfix.sql
-- Every row of the result should say ok: true. Three pretend accounts stand in for Operations, a
-- volunteer with a name and a phone but no licence, and an account that has said nothing yet.
begin;
create temp table t_r (ok boolean, what text);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'walkfix-test-ops@example.invalid', '', now(), now(), now(), '{}', '{}', false, false),
       ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'walkfix-test-desk@example.invalid', '', now(), now(), now(), '{}', '{}', false, false),
       ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'walkfix-test-nobody@example.invalid', '', now(), now(), now(), '{}', '{}', false, false);
create temp table t_ctx (incident uuid, code text, ops uuid default '00000000-0000-4000-8000-0000000000c1', desk uuid default '00000000-0000-4000-8000-0000000000c2');
insert into t_ctx (incident) values (null);
grant all on t_r, t_ctx to authenticated;
-- the shelter desk: a name and a phone, no licence; the third account has only a name
insert into public.ic_profiles (user_id, full_name, phone) values ('00000000-0000-4000-8000-0000000000c2', 'Pat Doe', '512 555 0199');
insert into public.ic_profiles (user_id, full_name, phone) values ('00000000-0000-4000-8000-0000000000c3', 'No Phone', '');

-- as Operations: open the incident, place a boat ramp
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
update t_ctx set incident = r.id, code = r.code from (select * from public.ic_create_incident('Walkthrough fixes rule test', null, 'Depot', null, null, 14)) r;
insert into public.ic_facilities (incident_id, kind, name, lat, lng) values ((select incident from t_ctx), 'ramp', 'Low-water crossing ramp', 30.26, -97.74);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Boat ramp: Low-water crossing ramp opened'), 'a boat ramp is a facility kind, logged by its name';
do $$ begin
  insert into public.ic_facilities (incident_id, kind, name, lat, lng) values ((select incident from t_ctx), 'marina', 'Not a kind', 30.26, -97.74);
  insert into t_r values (false, 'a facility kind off the list was accepted');
exception when others then insert into t_r values (sqlstate = '23514', 'the facility kind still comes from the list: ' || sqlstate); end $$;

-- the volunteer with no licence checks in
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c2","role":"authenticated"}', true);
set local role authenticated;
insert into t_r select not public.ic_profile_complete((select desk from t_ctx)) and public.ic_profile_ready((select desk from t_ctx)), 'a name and a phone is ready to check in, though not a complete identity';
select public.ic_join((select code from t_ctx), 'unit', 'Gym shelter desk', null, null, 'Red Cross', null, null);
insert into t_r select exists (select 1 from public.ic_members where incident_id = (select incident from t_ctx) and user_id = (select desk from t_ctx) and role = 'unit'), 'a unit with no licence checks in';
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Gym shelter desk checked in as Pat Doe, 512 555 0199, identity not given'), 'the check-in line says "identity not given": ' || coalesce((select text from public.ic_events where incident_id = (select incident from t_ctx) and text like 'Gym shelter desk checked in%' limit 1), 'no line');

-- an account with no phone is still refused
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  perform public.ic_join((select code from t_ctx), 'unit', 'Unit Z', null, null, null, null, null);
  insert into t_r values (false, 'an account with no phone checked in');
exception when others then insert into t_r values (sqlerrm = 'Say who you are first: your name and your phone', 'a name alone is refused: ' || sqlerrm); end $$;

-- Operations verifies the volunteer in person
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
select public.ic_verify_profile((select incident from t_ctx), (select desk from t_ctx), true);
insert into t_r select verified_at is not null and verified_by = (select ops from t_ctx), 'Operations marks a profile with no licence verified' from public.ic_profiles where user_id = (select desk from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Gym shelter desk (Pat Doe) identity verified by Operations'), 'and it is logged';

-- the volunteer adds a licence later: the verification is cleared and the next check-in says how
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c2","role":"authenticated"}', true);
set local role authenticated;
update public.ic_profiles set licence_number = 'd1234567', licence_state = 'tx', id_source = 'typed' where user_id = (select desk from t_ctx);
insert into t_r select verified_at is null and licence_number = 'D1234567', 'a licence added later clears the verification: ' || licence_number from public.ic_profiles where user_id = (select desk from t_ctx);
select public.ic_join((select code from t_ctx), 'unit', 'Gym shelter desk', null, null, null, null, null);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Gym shelter desk checked in as Pat Doe, 512 555 0199, licence typed'), 'the next check-in says how the licence was given';
reset role;

select * from t_r order by ok, what;
rollback;
