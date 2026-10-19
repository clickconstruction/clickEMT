-- Tell the base: one scale, a stuck flag (migration 0038), run against the real database inside one transaction that
-- is rolled back at the end:  python3 dev/sbq.py supabase/tests/tellbase.sql
-- Every row of the result should say ok: true.
begin;
create temp table t_r (ok boolean, what text);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tb-test-ops@example.invalid', '', now(), now(), now(), '{}', '{}', false, false),
       ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tb-test-unit@example.invalid', '', now(), now(), now(), '{}', '{}', false, false);
create temp table t_ctx (incident uuid, code text, m uuid, r uuid, ops uuid default '00000000-0000-4000-8000-0000000000e1', unit uuid default '00000000-0000-4000-8000-0000000000e2');
insert into t_ctx (incident) values (null);
grant all on t_r, t_ctx to authenticated;
insert into public.ic_profiles (user_id, full_name, phone) values ('00000000-0000-4000-8000-0000000000e2', 'Luis Moreno', '512 555 0160');

-- the words, as rules.js says them
insert into t_r select public.ic_step_label('now') = 'now' and public.ic_step_label('nightfall') = 'before dark' and public.ic_step_label('tomorrow') = 'tomorrow' and public.ic_step_label('') = '', 'the three steps read Now, Before dark, Tomorrow';
insert into t_r select public.ic_step_label('blocking') = '', 'blocking is no longer a step';
insert into t_r select public.ic_urgency_words('now', true) = 'now, stuck' and public.ic_urgency_words('nightfall', false) = 'before dark' and public.ic_urgency_words('', true) = 'stuck' and public.ic_urgency_words('', false) = '' and public.ic_urgency_words(null, null) = '', 'the step and the flag read together: now, stuck';
insert into t_r select public.ic_urgency_label('blocking') = 'blocks further operations' and public.ic_urgency_label('now') = 'act on now', 'hazards keep their four words';
insert into t_r select not exists (select 1 from public.ic_messages where urgency = 'blocking'), 'no message says blocking the old way any more';

-- Operations opens the incident; SO 14 checks in
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;
update t_ctx set incident = r.id, code = r.code from (select * from public.ic_create_incident('Tell the base test', null, null, null, null, 14)) r;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);
set local role authenticated;
select public.ic_join((select code from t_ctx), 'unit', 'SO 14', null, 1, 'Sheriff', null, 'other');

-- a message: the step and the flag in the bracket, the spot after the words
with m as (insert into public.ic_messages (incident_id, from_user, to_users, to_label, kind, text, urgency, blocking, lat, lng)
  values ((select incident from t_ctx), (select unit from t_ctx), array[(select ops from t_ctx)], 'Operations', 'message', 'Road blocked at the bridge', 'now', true, 30.2676, -97.7388) returning id)
update t_ctx set m = m.id from m;
insert into t_r select exists (select 1 from public.ic_events where ref_id = (select m::text from t_ctx) and kind = 'msg' and text = 'SO 14 to Operations (now, stuck): Road blocked at the bridge · location attached'), 'a stuck message reads (now, stuck) in the 214';
with m as (insert into public.ic_messages (incident_id, from_user, to_users, to_label, kind, text, urgency, blocking)
  values ((select incident from t_ctx), (select unit from t_ctx), array[(select ops from t_ctx)], 'Operations', 'message', 'Pump is out', '', true) returning id)
update t_ctx set m = m.id from m;
insert into t_r select exists (select 1 from public.ic_events where ref_id = (select m::text from t_ctx) and text = 'SO 14 to Operations (stuck): Pump is out'), 'the flag alone reads (stuck)';
with m as (insert into public.ic_messages (incident_id, from_user, to_users, to_label, kind, text, urgency)
  values ((select incident from t_ctx), (select unit from t_ctx), array[(select ops from t_ctx)], 'Operations', 'message', 'Done here, what next?', 'nightfall') returning id)
update t_ctx set m = m.id from m;
insert into t_r select exists (select 1 from public.ic_events where ref_id = (select m::text from t_ctx) and text = 'SO 14 to Operations (before dark): Done here, what next?'), 'a step alone reads as before, with the new word';
insert into t_r select (select blocking from public.ic_messages where id = (select m from t_ctx)) = false, 'a message sent without the flag is not stuck';
with m as (insert into public.ic_messages (incident_id, from_user, to_users, to_label, kind, text)
  values ((select incident from t_ctx), (select unit from t_ctx), array[(select ops from t_ctx)], 'Operations', 'message', 'Water rising here') returning id)
update t_ctx set m = m.id from m;
insert into t_r select exists (select 1 from public.ic_events where ref_id = (select m::text from t_ctx) and text = 'SO 14 to Operations: Water rising here'), 'nothing chosen writes today''s line, word for word';
do $$ begin
  insert into public.ic_messages (incident_id, from_user, to_users, to_label, kind, text, urgency)
  values ((select incident from t_ctx), (select unit from t_ctx), array[(select ops from t_ctx)], 'Operations', 'message', 'x', 'blocking');
  insert into t_r values (false, 'the old fourth word must be refused');
exception when others then insert into t_r values (sqlerrm like '%ic_messages_urgency_check%', 'the old fourth word is refused on a message: ' || sqlerrm); end $$;

-- a request: the words after the division
with r as (insert into public.ic_requests (incident_id, user_id, kind, what, quantity, urgency, blocking, note)
  values ((select incident from t_ctx), (select unit from t_ctx), 'equipment', 'pumps', 2, 'now', true, 'to drain the cul-de-sac') returning id)
update t_ctx set r = r.id from r;
insert into t_r select exists (select 1 from public.ic_events where ref_id = (select r::text from t_ctx) and kind = 'request' and text = 'SO 14 asked for 2 pumps, now, stuck: to drain the cul-de-sac'), 'a stuck request reads ", now, stuck" in the 214';
with r as (insert into public.ic_requests (incident_id, user_id, kind, what, quantity, urgency, note)
  values ((select incident from t_ctx), (select unit from t_ctx), 'equipment', 'portable lights', 4, 'nightfall', 'No street lights') returning id)
update t_ctx set r = r.id from r;
insert into t_r select exists (select 1 from public.ic_events where ref_id = (select r::text from t_ctx) and text = 'SO 14 asked for 4 portable lights, before dark: No street lights'), 'a request''s step reads with the new word';
insert into t_r select (select blocking from public.ic_requests where id = (select r from t_ctx)) = false, 'a request asked without the flag is not stuck';
with r as (insert into public.ic_requests (incident_id, user_id, kind, what, quantity)
  values ((select incident from t_ctx), (select unit from t_ctx), 'fuel', 'diesel, 20 gallons', 1) returning id)
update t_ctx set r = r.id from r;
insert into t_r select exists (select 1 from public.ic_events where ref_id = (select r::text from t_ctx) and text = 'SO 14 asked for diesel, 20 gallons'), 'nothing chosen on a request is no rush: no words';
do $$ begin
  insert into public.ic_requests (incident_id, user_id, kind, what, quantity, urgency)
  values ((select incident from t_ctx), (select unit from t_ctx), 'fuel', 'x', 1, 'blocking');
  insert into t_r values (false, 'blocking must be refused as a request''s step');
exception when others then insert into t_r values (sqlerrm like '%ic_requests_urgency_check%', 'blocking is refused as a request''s step: ' || sqlerrm); end $$;
reset role;

-- Operations works the stuck request as before
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;
update public.ic_requests set status = 'approved', answer = 'County yard, 30 min' where what = 'pumps' and incident_id = (select incident from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Request for 2 pumps (SO 14) approved: County yard, 30 min'), 'Operations works a stuck request as before';
reset role;
select * from t_r order by ok, what;
rollback;
