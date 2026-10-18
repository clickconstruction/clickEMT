-- The volunteer kind (migration 0024), run against the real database inside one transaction that is rolled
-- back at the end:  python3 dev/sbq.py supabase/tests/newcomer.sql
-- Every row of the result should say ok: true.
begin;
create temp table t_r (ok boolean, what text);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'newcomer-test-ops@example.invalid', '', now(), now(), now(), '{}', '{}', false, false),
       ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'newcomer-test-vol@example.invalid', '', now(), now(), now(), '{}', '{}', false, false);
create temp table t_ctx (incident uuid, code text, vol uuid default '00000000-0000-4000-8000-0000000000a2');
insert into t_ctx (incident) values (null);
grant all on t_r, t_ctx to authenticated;
insert into public.ic_profiles (user_id, full_name, phone) values ('00000000-0000-4000-8000-0000000000a2', 'Kim Tran', '512 555 0190');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
update t_ctx set incident = r.id, code = r.code from (select * from public.ic_create_incident('Newcomer test', null, null, null, null, 14)) r;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
select public.ic_join((select code from t_ctx), 'unit', 'Volunteer 4', null, 1, 'Cedar Fork volunteers', null, 'volunteer');
insert into t_r select kind = 'volunteer' and crew_count = 1, 'a volunteer checks in with the volunteer kind and a count of one' from public.ic_members where incident_id = (select incident from t_ctx) and user_id = (select vol from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Volunteer 4, volunteer checked in as Kim Tran, 512 555 0190, identity not given with 1 person'), 'the check-in line says volunteer';
insert into t_r select public.ic_kind_text('volunteer') = 'volunteer', 'the kind reads as a word';
reset role;
select * from t_r order by ok, what;
rollback;
