-- The Deputy seat (migration 0022), run against the real database inside one transaction that is
-- rolled back at the end:  python3 dev/sbq.py supabase/tests/deputy.sql
-- Every row of the result should say ok: true.
begin;
create temp table t_r (ok boolean, what text);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'deputy-test-ops@example.invalid', '', now(), now(), now(), '{}', '{}', false, false);
create temp table t_ctx (incident uuid, ops uuid default '00000000-0000-4000-8000-0000000000e1');
insert into t_ctx (incident) values (null);
grant all on t_r, t_ctx to authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;
update t_ctx set incident = r.id from (select * from public.ic_create_incident('Deputy test', null, null, null, null, 14)) r;
insert into t_r select deputy = '', 'a new period has an empty Deputy seat' from public.ic_periods where incident_id = (select incident from t_ctx) and number = 1;
update public.ic_periods set ic_name = 'Dana Ruiz', deputy = 'Chief Al Barnes' where incident_id = (select incident from t_ctx) and number = 1;
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Operational period 1 updated, Incident Commander Dana Ruiz, Deputy Chief Al Barnes'), 'naming the deputy is logged with the other seats';
update public.ic_periods set deputy = '' where incident_id = (select incident from t_ctx) and number = 1;
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Operational period 1 updated, Deputy not set'), 'clearing it says not set';
insert into t_r select deputy = 'Chief Al Barnes' and number = 2, 'the next period takes the deputy the form carries: ' || deputy
  from public.ic_start_period((select incident from t_ctx), null, 'Dana Ruiz', '', '', '', true, '', '', '', '', '', '', null, 'Chief Al Barnes');
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Operational period 2 started, Incident Commander Dana Ruiz, Deputy Chief Al Barnes'), 'and the start line names the deputy';
reset role;
select * from t_r order by ok, what;
rollback;
