-- On scene too long (migration 0029), run against the real database inside one transaction that is rolled back
-- at the end:  python3 dev/sbq.py supabase/tests/scene.sql
-- Every row of the result should say ok: true.
begin;
create temp table t_r (ok boolean, what text);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'scene-test-ops@example.invalid', '', now(), now(), now(), '{}', '{}', false, false);
create temp table t_ctx (incident uuid);
insert into t_ctx (incident) values (null);
grant all on t_r, t_ctx to authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;
update t_ctx set incident = r.id from (select * from public.ic_create_incident('Scene test', null, null, null, null, 14)) r;
insert into t_r select scene_hours = 12, 'a new period starts at 12 hours on scene: ' || scene_hours from public.ic_periods where incident_id = (select incident from t_ctx) and number = 1;
update public.ic_periods set scene_hours = 10 where incident_id = (select incident from t_ctx) and number = 1;
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Operational period 1: on scene too long past 10 hours'), 'a changed threshold is one line';
update public.ic_periods set scene_hours = 0 where incident_id = (select incident from t_ctx) and number = 1;
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Operational period 1: on scene too long turned off'), 'turning it off is said so';
update public.ic_periods set scene_hours = 10 where incident_id = (select incident from t_ctx) and number = 1;
insert into t_r select scene_hours = 10 and number = 2, 'the next period carries the threshold: ' || scene_hours from public.ic_start_period((select incident from t_ctx), null, 'IC One', '', '', '', true, '', '', '', '', '', '', null, '', '', null);
insert into t_r select scene_hours = 0 and number = 3, 'or takes the one the form gives, 0 for off: ' || scene_hours from public.ic_start_period((select incident from t_ctx), null, 'IC One', '', '', '', true, '', '', '', '', '', '', null, '', '', 0);
do $$ begin
  update public.ic_periods set scene_hours = 100 where incident_id = (select incident from t_ctx) and number = 3;
  insert into t_r values (false, '100 hours on scene was accepted');
exception when others then insert into t_r values (sqlerrm like '%scene_hours%', 'the threshold is 0 to 72 hours: ' || sqlerrm); end $$;
-- the revisit's clock time, handed by the phone, is the word in the 214 line
with z as (insert into public.ic_zones (incident_id, code, name, priority, polygon, structures) values ((select incident from t_ctx), 'A-2', 'Pecan', 1, '{"type":"Polygon","coordinates":[[[-97.75,30.25],[-97.74,30.25],[-97.74,30.26],[-97.75,30.26],[-97.75,30.25]]]}'::jsonb, 4) returning id) select 1 from z;
insert into public.ic_structures (incident_id, zone_id, label, status, notes, revisit_at, revisit_hhmm) values ((select incident from t_ctx), (select id from public.ic_zones where incident_id = (select incident from t_ctx) and code = 'A-2'), '118 Pecan Ln', 'searched', 'on oxygen', now() + interval '2 hours', '16:00');
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'A-2: 118 Pecan Ln · revisit at 16:00 (on oxygen)'), 'the revisit line carries the clock time the phone typed';
insert into public.ic_structures (incident_id, zone_id, label, status, revisit_at) values ((select incident from t_ctx), (select id from public.ic_zones where incident_id = (select incident from t_ctx) and code = 'A-2'), '120 Pecan Ln', 'searched', now() + interval '2 hours');
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'A-2: 120 Pecan Ln · revisit requested'), 'without the words it says revisit requested, as v46 did';
do $$ begin
  insert into public.ic_structures (incident_id, label, status, revisit_at, revisit_hhmm) values ((select incident from t_ctx), 'x', 'searched', now(), '4pm');
  insert into t_r values (false, 'a revisit time that is not hh:mm was accepted');
exception when others then insert into t_r values (sqlerrm like '%revisit_hhmm%', 'the clock time must be hh:mm: ' || sqlerrm); end $$;
reset role;
select * from t_r order by ok, what;
rollback;
