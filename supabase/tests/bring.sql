-- What to bring (migration 0027), run against the real database inside one transaction that is rolled back at the
-- end:  python3 dev/sbq.py supabase/tests/bring.sql
-- Every row of the result should say ok: true.
begin;
create temp table t_r (ok boolean, what text);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('00000000-0000-4000-8000-0000000000d9', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bring-test-ops@example.invalid', '', now(), now(), now(), '{}', '{}', false, false);
create temp table t_ctx (incident uuid);
insert into t_ctx (incident) values (null);
grant all on t_r, t_ctx to authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d9","role":"authenticated"}', true);
set local role authenticated;
update t_ctx set incident = r.id from (select * from public.ic_create_incident('Bring test', null, null, null, null, 14)) r;
insert into t_r select bring = '', 'a new period has nothing to bring yet' from public.ic_periods where incident_id = (select incident from t_ctx) and number = 1;
update public.ic_periods set bring = 'PFDs, dry bags, a radio each' where incident_id = (select incident from t_ctx) and number = 1;
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Operational period 1 updated, bring: PFDs, dry bags, a radio each'), 'what to bring is logged like the seats';
insert into t_r select bring = 'PFDs, dry bags, a radio each' and number = 2, 'the next period takes what the form carries: ' || bring
  from public.ic_start_period((select incident from t_ctx), null, 'Dana Ruiz', '', '', '', true, '', '', '', '', '', '', null, '', 'PFDs, dry bags, a radio each');
reset role;
select * from t_r order by ok, what;
rollback;
