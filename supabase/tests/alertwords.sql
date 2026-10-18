-- What's wrong, what you need on an emergency alert (migration 0036), run against the real database inside one
-- transaction that is rolled back at the end:  python3 dev/sbq.py supabase/tests/alertwords.sql
-- Every row of the result should say ok: true.
begin;
create temp table t_r (ok boolean, what text);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'aw-test-ops@example.invalid', '', now(), now(), now(), '{}', '{}', false, false),
       ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'aw-test-unit@example.invalid', '', now(), now(), now(), '{}', '{}', false, false),
       ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'aw-test-other@example.invalid', '', now(), now(), now(), '{}', '{}', false, false);
create temp table t_ctx (incident uuid, code text, al uuid, ops uuid default '00000000-0000-4000-8000-0000000000d1', unit uuid default '00000000-0000-4000-8000-0000000000d2', other uuid default '00000000-0000-4000-8000-0000000000d3');
insert into t_ctx (incident) values (null);
grant all on t_r, t_ctx to authenticated;
insert into public.ic_profiles (user_id, full_name, phone) values ('00000000-0000-4000-8000-0000000000d2', 'Luis Moreno', '512 555 0160'), ('00000000-0000-4000-8000-0000000000d3', 'Ana Ramirez', '512 555 0111');

-- the words, as rules.js says them
insert into t_r select public.ic_alert_text(array['injured', 'trapped'], array['medic', 'boat'], '') = 'trapped, injured · needs boat, medic', 'the words read in the lists'' order, never the tap''s';
insert into t_r select public.ic_alert_text('{}', '{}', 'Missing: Okafor') = 'Missing: Okafor' and public.ic_alert_text(array['trapped'], '{}', 'Missing: Okafor') = 'trapped: Missing: Okafor' and public.ic_alert_text('{}', '{}', '') = '' and public.ic_alert_text(null, array['hands'], null) = 'needs more hands', 'the PAR''s note reads after the chips, alone when there are none';
insert into t_r select public.ic_alert_list(array['injured'], array['rope', 'boat']) = 'injured, boat, rope', 'the takes-back list is every label, comma-joined';

-- Operations opens the incident; SO 14 and Unit 1 check in
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;
update t_ctx set incident = r.id, code = r.code from (select * from public.ic_create_incident('Alert words test', null, null, null, null, 14)) r;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d3","role":"authenticated"}', true);
set local role authenticated;
select public.ic_join((select code from t_ctx), 'unit', 'Unit 1', null, 1, 'Fire', null, 'other');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d2","role":"authenticated"}', true);
set local role authenticated;
select public.ic_join((select code from t_ctx), 'unit', 'SO 14', null, 1, 'Sheriff', null, 'other');

-- a bare press writes today's line, word for word
with a as (insert into public.ic_alerts (incident_id, user_id) values ((select incident from t_ctx), (select unit from t_ctx)) returning id) update t_ctx set al = a.id from a;
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and ref_id = (select al::text from t_ctx) and text = 'EMERGENCY, SO 14 needs help in the field'), 'a bare press writes today''s line, word for word';
insert into t_r select (wrong = '{}' and needs = '{}' and note = ''), 'a bare alert carries no words' from public.ic_alerts where id = (select al from t_ctx);

-- a chip after the send
update public.ic_alerts set needs = array['medic'] where id = (select al from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where ref_id = (select al::text from t_ctx) and kind = 'help' and text = 'SO 14 adds: needs medic'), 'a chip tapped after the send writes its own line';
update public.ic_alerts set wrong = array['trapped', 'in_water'], needs = array['medic', 'rope'] where id = (select al from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where ref_id = (select al::text from t_ctx) and text = 'SO 14 adds: in the water, trapped · needs rope'), 'several at once read in the lists'' order, only what is new';
update public.ic_alerts set wrong = array['in_water'] where id = (select al from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where ref_id = (select al::text from t_ctx) and text = 'SO 14 takes back: trapped'), 'a chip taken back writes its own line';
insert into t_r select (select count(*) from public.ic_events where ref_id = (select al::text from t_ctx) and text like 'SO 14 adds:%') = 2 and (select count(*) from public.ic_events where ref_id = (select al::text from t_ctx) and text like 'SO 14 takes back:%') = 1, 'one tap, one line: no line says both';
do $$ begin
  update public.ic_alerts set wrong = array['lost'] where id = (select al from t_ctx);
  insert into t_r values (false, 'a code outside the list must be refused');
exception when others then insert into t_r values (sqlerrm like '%ic_alerts_wrong_check%', 'a code outside the list is refused: ' || sqlerrm); end $$;
reset role;

-- another unit: the policy lets it change nothing
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d3","role":"authenticated"}', true);
set local role authenticated;
with u as (update public.ic_alerts set needs = array['boat'] where id = (select al from t_ctx) returning 1) insert into t_r select count(*) = 0, 'another unit cannot change the chips' from u;
reset role;

-- Operations acknowledges as before, and cannot change the chips
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;
update public.ic_alerts set acknowledged_at = now(), acknowledged_by = (select ops from t_ctx) where id = (select al from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where ref_id = (select al::text from t_ctx) and text = 'Operations acknowledged the emergency from SO 14'), 'Operations acknowledges as before';
do $$ begin
  update public.ic_alerts set needs = array['boat'] where id = (select al from t_ctx);
  insert into t_r values (false, 'Operations changing the chips must be refused');
exception when others then insert into t_r values (sqlerrm like '%Only the unit%', 'Operations cannot change the chips: ' || sqlerrm); end $$;
reset role;

-- the unit stands down; nothing changes after that; chips chosen before a send, and the PAR's note, read as they should
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d2","role":"authenticated"}', true);
set local role authenticated;
update public.ic_alerts set stood_down_at = now() where id = (select al from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where ref_id = (select al::text from t_ctx) and text = 'SO 14 stood down, all OK'), 'standing down logs as before';
do $$ begin
  update public.ic_alerts set needs = array['boat'] where id = (select al from t_ctx);
  insert into t_r values (false, 'a change after stand-down must be refused');
exception when others then insert into t_r values (sqlerrm like '%stood down%', 'a change after stand-down is refused: ' || sqlerrm); end $$;
insert into public.ic_alerts (incident_id, user_id, wrong, needs) values ((select incident from t_ctx), (select unit from t_ctx), array['injured', 'trapped'], array['boat']);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'EMERGENCY, SO 14 needs help in the field: trapped, injured · needs boat'), 'chips chosen before the send ride on the first line';
insert into public.ic_alerts (incident_id, user_id, note) values ((select incident from t_ctx), (select unit from t_ctx), 'Missing: Okafor');
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'EMERGENCY, SO 14 needs help in the field: Missing: Okafor'), 'the PAR''s alert reads as before';
insert into t_r select (select count(*) from public.ic_alerts where incident_id = (select incident from t_ctx)) = 3, 'nothing is deleted: the three alerts stay';
reset role;
select * from t_r order by ok, what;
rollback;
