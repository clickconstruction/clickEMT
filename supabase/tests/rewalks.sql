-- Small items from the re-walks (migration 0030), run against the real database inside one transaction that is
-- rolled back at the end:  python3 dev/sbq.py supabase/tests/rewalks.sql
-- Every row of the result should say ok: true.
begin;
create temp table t_r (ok boolean, what text);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rw-test-ops@example.invalid', '', now(), now(), now(), '{}', '{}', false, false),
       ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rw-test-unit@example.invalid', '', now(), now(), now(), '{}', '{}', false, false);
create temp table t_ctx (incident uuid, code text, fac uuid, zone uuid, person uuid, par uuid, ops uuid default '00000000-0000-4000-8000-0000000000a1', unit uuid default '00000000-0000-4000-8000-0000000000a2');
insert into t_ctx (incident) values (null);
grant all on t_r, t_ctx to authenticated;
insert into public.ic_profiles (user_id, full_name, phone) values ('00000000-0000-4000-8000-0000000000a2', 'Rosa Alvarez', '512 555 0144');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
update t_ctx set incident = r.id, code = r.code from (select * from public.ic_create_incident('Re-walks test', null, null, null, null, 14)) r;
-- 1 a street address on a facility, logged like the name
with f as (insert into public.ic_facilities (incident_id, kind, name, lat, lng) values ((select incident from t_ctx), 'staging', 'East lot', 30.2556, -97.74) returning id) update t_ctx set fac = f.id from f;
insert into t_r select address = '', 'a new facility has no address yet' from public.ic_facilities where id = (select fac from t_ctx);
update public.ic_facilities set address = '1200 Mill St, east lot' where id = (select fac from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Staging area: East lot updated' and ref_id = (select fac from t_ctx)::text), 'an address change is logged as an update';
-- 2 a revisit already past today means tomorrow: the clock words may start with "tomorrow "
with z as (insert into public.ic_zones (incident_id, code, name, priority, polygon, structures) values ((select incident from t_ctx), 'A-2', 'Pecan', 1, '{"type":"Polygon","coordinates":[[[-97.75,30.25],[-97.74,30.25],[-97.74,30.26],[-97.75,30.26],[-97.75,30.25]]]}'::jsonb, 4) returning id) update t_ctx set zone = z.id from z;
insert into public.ic_structures (incident_id, zone_id, label, status, notes, revisit_at, revisit_hhmm) values ((select incident from t_ctx), (select zone from t_ctx), '118 Pecan Ln', 'searched', 'gas off', now() + interval '8 hours', 'tomorrow 06:00');
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'A-2: 118 Pecan Ln · revisit tomorrow at 06:00 (gas off)'), 'a revisit for tomorrow says so in the 214';
insert into public.ic_structures (incident_id, zone_id, label, status, revisit_at, revisit_hhmm) values ((select incident from t_ctx), (select zone from t_ctx), '120 Pecan Ln', 'searched', now() + interval '2 hours', '16:00');
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'A-2: 120 Pecan Ln · revisit at 16:00'), 'a revisit today reads as before';
do $$ begin
  insert into public.ic_structures (incident_id, label, status, revisit_at, revisit_hhmm) values ((select incident from t_ctx), 'x', 'searched', now(), 'tomorrow 4pm');
  insert into t_r values (false, 'a clock time that is not hh:mm was accepted');
exception when others then insert into t_r values (sqlerrm like '%revisit_hhmm%', 'the words are hh:mm, with tomorrow first or not: ' || sqlerrm); end $$;
reset role;
-- 3 the current stretch: a unit's person checked out and back in keeps the check-in and gains the stint stamp
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
select public.ic_join((select code from t_ctx), 'unit', 'Unit 2', null, 2, 'Travis County Rescue', '[{"name":"Nguyen","role":"Capt.","qualifications":["boat"]},{"name":"Patel","role":"","qualifications":["emt"]}]'::jsonb, 'boat');
update t_ctx set person = (select id from public.ic_people where incident_id = (select incident from t_ctx) and name = 'Nguyen');
update public.ic_people set checked_in_at = now() - interval '5 hours' where id = (select person from t_ctx);
insert into t_r select stint_at is null, 'a person on their first stretch has no stint stamp' from public.ic_people where id = (select person from t_ctx);
update public.ic_people set checked_out_at = now() where id = (select person from t_ctx);
update public.ic_people set checked_out_at = null where id = (select person from t_ctx);
insert into t_r select stint_at is not null and stint_at > now() - interval '1 minute' and checked_in_at <= now() - interval '5 hours' and checked_out_at is null, 'checked back in: the stint stamp is now, the check-in stays' from public.ic_people where id = (select person from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Nguyen (boat) checked back in with Unit 2'), 'and the 214 says so, as before';
reset role;
-- 4 they're all found: Operations marks every missing entry of one answer with one call and one line
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
with m as (insert into public.ic_messages (incident_id, from_user, to_users, to_label, kind, text) values ((select incident from t_ctx), (select ops from t_ctx), array[(select unit from t_ctx)], 'everyone', 'par', 'PAR: is everyone accounted for?') returning id) update t_ctx set par = m.id from m;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
insert into public.ic_message_acks (message_id, incident_id, user_id, reply, count, missing) values ((select par from t_ctx), (select incident from t_ctx), (select unit from t_ctx), 'Missing someone', 0, '[{"id":null,"name":"Nguyen"},{"id":null,"name":"Patel"}]'::jsonb);
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
select public.ic_mark_found((select par from t_ctx), (select unit from t_ctx));
insert into t_r select (select count(*) from jsonb_array_elements(a.missing) x where x ->> 'found_at' is not null) = 2, 'both entries are stamped found' from public.ic_message_acks a where a.message_id = (select par from t_ctx) and a.user_id = (select unit from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Nguyen, Patel found, reported by Operations' and notable), 'one notable line names them both';
reset role;
select * from t_r order by ok, what;
rollback;
