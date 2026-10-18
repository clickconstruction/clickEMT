-- Grace's decisions (migration 0028), run against the real database inside one transaction that is rolled back at
-- the end:  python3 dev/sbq.py supabase/tests/decisions.sql
-- Every row of the result should say ok: true.
begin;
create temp table t_r (ok boolean, what text);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('00000000-0000-4000-8000-0000000000e9', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dec-test-ops@example.invalid', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.ic_profiles (user_id, full_name, phone) values ('00000000-0000-4000-8000-0000000000e9', 'Marcus Test', '512 555 0101');
create temp table t_ctx (incident uuid, zone uuid);
insert into t_ctx (incident) values (null);
grant all on t_r, t_ctx to authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e9","role":"authenticated"}', true);
set local role authenticated;
update t_ctx set incident = r.id from (select * from public.ic_create_incident('Decisions test', null, null, null, null, 14)) r;
with z as (insert into public.ic_zones (incident_id, code, name, priority, polygon, structures) values ((select incident from t_ctx), 'A-1', 'Riverside', 1, '{"type":"Polygon","coordinates":[[[-97.75,30.25],[-97.74,30.25],[-97.74,30.26],[-97.75,30.26],[-97.75,30.25]]]}'::jsonb, 4) returning id) update t_ctx set zone = z.id from z;
insert into public.ic_structures (incident_id, zone_id, label, status, notes, revisit_at) values ((select incident from t_ctx), (select zone from t_ctx), '12 Riverside Dr', 'not_searched', 'on oxygen', now() + interval '2 hours');
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'A-1: 12 Riverside Dr · revisit requested (on oxygen)'), 'a revisit time on a house record is logged';
update public.ic_incidents set settings = settings || '{"eoc_email":"eoc@county.gov"}'::jsonb where id = (select incident from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Marcus Test set the EOC email address to eoc@county.gov'), 'setting the EOC address is logged';
update public.ic_incidents set settings = settings - 'eoc_email' where id = (select incident from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Marcus Test cleared the EOC email address'), 'clearing it is logged';
reset role;
select * from t_r order by ok, what;
rollback;
