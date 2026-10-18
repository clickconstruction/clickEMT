-- Assigned before In progress (migration 0026), run against the real database inside one transaction that is
-- rolled back at the end:  python3 dev/sbq.py supabase/tests/accept.sql
-- Every row of the result should say ok: true.
begin;
create temp table t_r (ok boolean, what text);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'accept-test-ops@example.invalid', '', now(), now(), now(), '{}', '{}', false, false),
       ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'accept-test-unit@example.invalid', '', now(), now(), now(), '{}', '{}', false, false),
       ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'accept-test-other@example.invalid', '', now(), now(), now(), '{}', '{}', false, false);
create temp table t_ctx (incident uuid, code text, zone uuid, ops uuid default '00000000-0000-4000-8000-0000000000c1', unit uuid default '00000000-0000-4000-8000-0000000000c2', other uuid default '00000000-0000-4000-8000-0000000000c3');
insert into t_ctx (incident) values (null);
grant all on t_r, t_ctx to authenticated;
insert into public.ic_profiles (user_id, full_name, phone) values ('00000000-0000-4000-8000-0000000000c2', 'Ray Reyes', '830 555 0177'), ('00000000-0000-4000-8000-0000000000c3', 'Pat Doe', '512 555 0180');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
update t_ctx set incident = r.id, code = r.code from (select * from public.ic_create_incident('Accept test', null, null, null, null, 14)) r;
with z as (insert into public.ic_zones (incident_id, code, name, priority, polygon, structures) values ((select incident from t_ctx), 'B-2', 'Bee Creek', 2, '{"type":"Polygon","coordinates":[[[-97.75,30.25],[-97.74,30.25],[-97.74,30.26],[-97.75,30.26],[-97.75,30.25]]]}'::jsonb, 9) returning id) update t_ctx set zone = z.id from z;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c2","role":"authenticated"}', true);
set local role authenticated;
select public.ic_join((select code from t_ctx), 'unit', 'Brush 12', null, 2, 'Bandera County FD', null, 'engine');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
set local role authenticated;
select public.ic_join((select code from t_ctx), 'unit', 'Unit X', null, 1, 'Volunteers', null, 'volunteer');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
update public.ic_zones set assigned_to = (select unit from t_ctx), status = 'active' where id = (select zone from t_ctx);
insert into t_r select accepted_zone_id is null and status = 'assigned', 'assigned by Operations: the unit is assigned and has not yet accepted' from public.ic_members where incident_id = (select incident from t_ctx) and user_id = (select unit from t_ctx);
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
set local role authenticated;
update public.ic_members set accepted_zone_id = (select zone from t_ctx) where incident_id = (select incident from t_ctx) and user_id = (select unit from t_ctx);
insert into t_r select accepted_zone_id is null, 'another unit cannot accept for it (the update touches no row)' from public.ic_members where incident_id = (select incident from t_ctx) and user_id = (select unit from t_ctx);
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c2","role":"authenticated"}', true);
set local role authenticated;
update public.ic_members set accepted_zone_id = (select zone from t_ctx) where incident_id = (select incident from t_ctx) and user_id = (select unit from t_ctx);
insert into t_r select accepted_zone_id = (select zone from t_ctx), 'the unit accepts from its own row' from public.ic_members where incident_id = (select incident from t_ctx) and user_id = (select unit from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Brush 12 accepted the assignment to B-2' and ref_id = (select zone from t_ctx)::text), 'and the 214 says so';
reset role;
select * from t_r order by ok, what;
rollback;
