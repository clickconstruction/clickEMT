-- A hazard that says how urgent it is (migration 0025), run against the real database inside one transaction
-- that is rolled back at the end:  python3 dev/sbq.py supabase/tests/hazards.sql
-- Every row of the result should say ok: true.
begin;
create temp table t_r (ok boolean, what text);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'haz-test-ops@example.invalid', '', now(), now(), now(), '{}', '{}', false, false),
       ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'haz-test-unit@example.invalid', '', now(), now(), now(), '{}', '{}', false, false);
create temp table t_ctx (incident uuid, code text, haz uuid, ops uuid default '00000000-0000-4000-8000-0000000000b1', unit uuid default '00000000-0000-4000-8000-0000000000b2');
insert into t_ctx (incident) values (null);
grant all on t_r, t_ctx to authenticated;
insert into public.ic_profiles (user_id, full_name, phone) values ('00000000-0000-4000-8000-0000000000b2', 'Luis Moreno', '512 555 0160');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
update t_ctx set incident = r.id, code = r.code from (select * from public.ic_create_incident('Hazard test', null, null, null, null, 14)) r;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
select public.ic_join((select code from t_ctx), 'unit', 'SO 14', null, 1, 'Sheriff', null, 'other');
with h as (insert into public.ic_hazards (incident_id, user_id, kind, note, urgency) values ((select incident from t_ctx), (select unit from t_ctx), 'Person or car in the water', 'one inside', 'now') returning id) update t_ctx set haz = h.id from h;
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text like 'Hazard in % (act on now): person or car in the water (one inside), reported by SO 14'), 'an urgent hazard is logged with its urgency word';
do $$ begin
  insert into public.ic_hazards (incident_id, user_id, kind, urgency) values ((select incident from t_ctx), (select unit from t_ctx), 'Gas smell', 'asap');
  insert into t_r values (false, 'a made-up urgency word must be refused');
exception when others then insert into t_r values (sqlerrm like '%urgency%', 'a made-up urgency word is refused: ' || sqlerrm); end $$;
insert into public.ic_hazards (incident_id, user_id, kind) values ((select incident from t_ctx), (select unit from t_ctx), 'Loose animal');
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text like 'Hazard in %: loose animal, reported by SO 14'), 'a hazard with no urgency logs as before';
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
update public.ic_hazards set acked_at = now(), acked_by = (select ops from t_ctx) where id = (select haz from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text like 'Hazard acknowledged by Operations: person or car in the water in %'), 'Operations acknowledging it is logged';
insert into t_r select acked_at is not null and acked_by = (select ops from t_ctx) and resolved_at is null, 'acknowledged is not resolved' from public.ic_hazards where id = (select haz from t_ctx);
reset role;
select * from t_r order by ok, what;
rollback;
