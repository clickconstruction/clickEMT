-- The 214's water words as 45m (migration 0039): ic_duration_text says what durationText in js/shared/rules.js says,
-- and the water line of ic_member_after goes through it. Run against the real database inside one transaction that
-- is rolled back at the end:  python3 dev/sbq.py supabase/tests/waterwords.sql
-- Every row of the result should say ok: true. Two pretend accounts: the one who opens the incident (Operations)
-- and a boat crew.
begin;
create temp table t_r (ok boolean, what text);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('00000000-0000-4000-8000-0000000000a7', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'waterwords-test-ops@example.invalid', '', now(), now(), now(), '{}', '{}', false, false),
       ('00000000-0000-4000-8000-0000000000a8', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'waterwords-test-boat@example.invalid', '', now(), now(), now(), '{}', '{}', false, false);
create temp table t_ctx (incident uuid, code text, ops uuid default '00000000-0000-4000-8000-0000000000a7', boat uuid default '00000000-0000-4000-8000-0000000000a8');
insert into t_ctx (incident) values (null);
grant all on t_r, t_ctx to authenticated;
insert into public.ic_profiles (user_id, full_name, phone) values ('00000000-0000-4000-8000-0000000000a8', 'Rosa Alvarez', '512 555 0020');

-- the words, as durationText in rules.js says them
insert into t_r select public.ic_duration_text(0) = '0m' and public.ic_duration_text(12) = '12m' and public.ic_duration_text(45) = '45m' and public.ic_duration_text(59) = '59m', 'under an hour the minutes alone: 0m, 12m, 45m, 59m';
insert into t_r select public.ic_duration_text(60) = '1h' and public.ic_duration_text(120) = '2h' and public.ic_duration_text(720) = '12h', 'whole hours as the hours alone: 1h, 2h, 12h';
insert into t_r select public.ic_duration_text(65) = '1h 5m' and public.ic_duration_text(140) = '2h 20m' and public.ic_duration_text(248) = '4h 8m', 'the hours and the minutes left over: 1h 5m, 2h 20m, 4h 8m';
insert into t_r select public.ic_duration_text(null) = '0m' and public.ic_duration_text(-5) = '0m', 'nothing, or a clock ahead, reads 0m';

-- as Operations: the incident
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a7","role":"authenticated"}', true);
set local role authenticated;
update t_ctx set incident = r.id, code = r.code from (select * from public.ic_create_incident('Water words test', null, null, null, null, 14)) r;
reset role;

-- as the boat crew: in and out of the water under an hour, over an hour, on the hour; the old words gone
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a8","role":"authenticated"}', true);
set local role authenticated;
select public.ic_join((select code from t_ctx), 'unit', 'Boat 1', null, 2, 'Travis County Rescue', null, 'boat');
update public.ic_members set in_water_since = now() - interval '45 minutes' where incident_id = (select incident from t_ctx) and user_id = (select boat from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Boat 1 in the water'), 'going in the water is one line, as before';
update public.ic_members set in_water_since = null where incident_id = (select incident from t_ctx) and user_id = (select boat from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Boat 1 out of the water after 45m'), 'out after 45 minutes reads 45m';
update public.ic_members set in_water_since = now() - interval '65 minutes' where incident_id = (select incident from t_ctx) and user_id = (select boat from t_ctx);
update public.ic_members set in_water_since = null where incident_id = (select incident from t_ctx) and user_id = (select boat from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Boat 1 out of the water after 1h 5m'), 'out after 65 minutes reads 1h 5m';
update public.ic_members set in_water_since = now() - interval '2 hours' where incident_id = (select incident from t_ctx) and user_id = (select boat from t_ctx);
update public.ic_members set in_water_since = null where incident_id = (select incident from t_ctx) and user_id = (select boat from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Boat 1 out of the water after 2h'), 'out after two hours reads 2h, no minutes';
insert into t_r select count(*) = 3, 'one line per time out, three so far: ' || count(*) from public.ic_events where incident_id = (select incident from t_ctx) and text like 'Boat 1 out of the water after %';
insert into t_r select not exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text like '% out of the water after % min'), 'the old words are written nowhere';
-- a check-out still ends the clock and says how long, and the rest of 0020's trigger still speaks
update public.ic_members set in_water_since = now() - interval '12 minutes' where incident_id = (select incident from t_ctx) and user_id = (select boat from t_ctx);
select public.ic_check_out((select incident from t_ctx), null);
insert into t_r select in_water_since is null and status = 'checked_out', 'checking out ends the clock' from public.ic_members where incident_id = (select incident from t_ctx) and user_id = (select boat from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Boat 1 out of the water after 12m'), 'and says how long it ran, the new way';
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text like 'Boat 1 checked out%'), 'the check-out line of 0020 still comes: the newest body was kept';
reset role;

select * from t_r order by ok, what;
rollback;
