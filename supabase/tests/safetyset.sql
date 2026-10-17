-- The rules for the water clock, the incident settings and the public set (migration 0020), run
-- against the real database inside one transaction that is rolled back at the end:
--   python3 dev/sbq.py supabase/tests/safetyset.sql
-- Every row of the result should say ok: true. Two pretend accounts: the one who opens the incidents
-- (Operations) and a boat crew.
begin;
create temp table t_r (ok boolean, what text);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'safetyset-test-ops@example.invalid', '', now(), now(), now(), '{}', '{}', false, false),
       ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'safetyset-test-boat@example.invalid', '', now(), now(), now(), '{}', '{}', false, false);
create temp table t_ctx (inc1 uuid, code1 text, inc2 uuid, code2 text, photo uuid,
  ops uuid default '00000000-0000-4000-8000-0000000000c1', boat uuid default '00000000-0000-4000-8000-0000000000c2');
insert into t_ctx (inc1) values (null);
grant all on t_r, t_ctx to authenticated;
insert into public.ic_profiles (user_id, full_name, phone) values ('00000000-0000-4000-8000-0000000000c1', 'Sam Bell', '512 555 0010'), ('00000000-0000-4000-8000-0000000000c2', 'Rosa Alvarez', '512 555 0020');

-- as Operations: the first incident, its settings
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
update t_ctx set inc1 = r.id, code1 = r.code from (select * from public.ic_create_incident('Safety set test', null, null, null, null, 14)) r;
update public.ic_incidents set settings = '{"maps_key":"AIza-test-key-123","retention_days":60,"rotation_minutes":30}'::jsonb where id = (select inc1 from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select inc1 from t_ctx) and text = 'Sam Bell set the Google Maps key'), 'setting the key is logged by name';
insert into t_r select not exists (select 1 from public.ic_events where text like '%AIza-test-key-123%'), 'and the key itself is in no log line';
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select inc1 from t_ctx) and text = 'Sam Bell set personal records to clear 60 days after the close'), 'the retention days are logged';
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select inc1 from t_ctx) and text = 'Sam Bell set the default rotation to 30 minutes in the water'), 'the default rotation is logged';
-- the next incident the same account opens takes the settings, and its first period the rotation
update t_ctx set inc2 = r.id, code2 = r.code from (select * from public.ic_create_incident('Safety set test, the next one', null, null, null, null, 14)) r;
insert into t_r select settings ->> 'maps_key' = 'AIza-test-key-123' and settings ->> 'retention_days' = '60', 'the next incident the same account opens carries the settings: ' || settings::text from public.ic_incidents where id = (select inc2 from t_ctx);
insert into t_r select rotation_minutes = 30, 'its first period takes the default rotation: ' || rotation_minutes from public.ic_periods where incident_id = (select inc2 from t_ctx) and number = 1;
-- the clock after a close follows the retention days
update public.ic_incidents set status = 'closed' where id = (select inc1 from t_ctx);
insert into t_r select clear_personal_at between now() + interval '59 days' and now() + interval '61 days', 'closing an incident set to 60 days puts the date 60 days out' from public.ic_incidents where id = (select inc1 from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select inc1 from t_ctx) and text = 'Incident closed · personal records clear by rule in 60 days'), 'and the close line says 60 days';
-- the rotation on the period: changed, logged, carried, turned off
update public.ic_periods set rotation_minutes = 20 where incident_id = (select inc2 from t_ctx) and number = 1;
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select inc2 from t_ctx) and text = 'Operational period 1: rotation in the water every 20 minutes'), 'a changed rotation is one line';
insert into t_r select rotation_minutes = 20, 'the next period carries the rotation: ' || rotation_minutes from public.ic_start_period((select inc2 from t_ctx), null, 'IC Two', '', '', '', true, '', '', '', '', '', '', null);
insert into t_r select rotation_minutes = 0, 'or takes the one the form gives, 0 for off: ' || rotation_minutes from public.ic_start_period((select inc2 from t_ctx), null, 'IC Two', '', '', '', true, '', '', '', '', '', '', 0);
do $$ begin
  perform public.ic_start_period((select inc2 from t_ctx), null, 'IC Two', '', '', '', true, '', '', '', '', '', '', 900);
  insert into t_r values (false, 'a rotation of 900 minutes was accepted');
exception when others then insert into t_r values (sqlerrm like 'The rotation is 0 (off) to 600 minutes%', 'the rotation is 0 to 600 minutes: ' || sqlerrm); end $$;
reset role;

-- as the boat crew: in and out of the water, by the minute
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c2","role":"authenticated"}', true);
set local role authenticated;
select public.ic_join((select code2 from t_ctx), 'unit', 'Boat 1', null, 2, 'Travis County Rescue', null, 'boat');
update public.ic_members set in_water_since = now() - interval '38 minutes' where incident_id = (select inc2 from t_ctx) and user_id = (select boat from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select inc2 from t_ctx) and text = 'Boat 1 in the water'), 'going in the water is one line';
update public.ic_members set in_water_since = null where incident_id = (select inc2 from t_ctx) and user_id = (select boat from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select inc2 from t_ctx) and text = 'Boat 1 out of the water after 38 min'), 'coming out says how long';
update public.ic_members set in_water_since = now() + interval '2 hours' where incident_id = (select inc2 from t_ctx) and user_id = (select boat from t_ctx);
insert into t_r select in_water_since <= now(), 'a phone clock ahead is pulled back to now' from public.ic_members where incident_id = (select inc2 from t_ctx) and user_id = (select boat from t_ctx);
update public.ic_members set in_water_since = now() - interval '12 minutes' where incident_id = (select inc2 from t_ctx) and user_id = (select boat from t_ctx);
select public.ic_check_out((select inc2 from t_ctx), null);
insert into t_r select in_water_since is null and status = 'checked_out', 'checking out ends the clock' from public.ic_members where incident_id = (select inc2 from t_ctx) and user_id = (select boat from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select inc2 from t_ctx) and text = 'Boat 1 out of the water after 12 min'), 'and says how long it ran';
-- a photo the crew sent
select public.ic_join((select code2 from t_ctx), 'unit', 'Boat 1', null, 2, 'Travis County Rescue', null, 'boat');
with p as (insert into public.ic_photos (incident_id, user_id, note, storage_path, lat, lng) values ((select inc2 from t_ctx), (select boat from t_ctx), 'Waterline on the bridge', (select inc2 from t_ctx) || '/x/p.jpg', 30.26, -97.74) returning id) update t_ctx set photo = p.id from p;
update public.ic_photos set public_caption = 'Not mine to write' where id = (select photo from t_ctx);
insert into t_r select public_caption = '', 'a unit cannot write the public caption' from public.ic_photos where id = (select photo from t_ctx);
reset role;

-- as Operations: clear, caption and check the photo
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
update public.ic_photos set public_ok = true where id = (select photo from t_ctx);
update public.ic_photos set public_caption = '  Floodwater at the Mill Street bridge on Saturday morning  ' where id = (select photo from t_ctx);
insert into t_r select public_caption = 'Floodwater at the Mill Street bridge on Saturday morning', 'the caption is trimmed: "' || public_caption || '"' from public.ic_photos where id = (select photo from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select inc2 from t_ctx) and text = 'Photo from Boat 1, public caption: Floodwater at the Mill Street bridge on Saturday morning'), 'the caption is logged';
update public.ic_photos set public_checked_at = now() where id = (select photo from t_ctx);
insert into t_r select public_checked_by = (select ops from t_ctx), 'the check is stamped with who looked' from public.ic_photos where id = (select photo from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select inc2 from t_ctx) and text = 'Photo from Boat 1 checked for public release: no face, no plate, no house number'), 'and logged';
update public.ic_photos set public_ok = false where id = (select photo from t_ctx);
insert into t_r select public_checked_at is null and public_checked_by is null, 'withdrawing a photo from the public takes the check with it' from public.ic_photos where id = (select photo from t_ctx);
reset role;

select * from t_r order by ok, what;
rollback;
