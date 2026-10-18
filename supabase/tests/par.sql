-- One head count at a time, and a missing person who is found (migration 0023), run against the real
-- database inside one transaction that is rolled back at the end:  python3 dev/sbq.py supabase/tests/par.sql
-- Every row of the result should say ok: true. Three pretend accounts: Operations and two units.
begin;
create temp table t_r (ok boolean, what text);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'par-test-ops@example.invalid', '', now(), now(), now(), '{}', '{}', false, false),
       ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'par-test-a@example.invalid', '', now(), now(), now(), '{}', '{}', false, false),
       ('00000000-0000-4000-8000-0000000000f3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'par-test-b@example.invalid', '', now(), now(), now(), '{}', '{}', false, false);
create temp table t_ctx (incident uuid, code text, par1 uuid, par2 uuid, okafor uuid default gen_random_uuid(),
  ops uuid default '00000000-0000-4000-8000-0000000000f1', ua uuid default '00000000-0000-4000-8000-0000000000f2', ub uuid default '00000000-0000-4000-8000-0000000000f3');
insert into t_ctx (incident) values (null);
grant all on t_r, t_ctx to authenticated;
insert into public.ic_profiles (user_id, full_name, phone) values
  ('00000000-0000-4000-8000-0000000000f2', 'Ana Test', '512 555 0001'), ('00000000-0000-4000-8000-0000000000f3', 'Rosa Test', '512 555 0002');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;
update t_ctx set incident = r.id, code = r.code from (select * from public.ic_create_incident('PAR test', null, null, null, null, 14)) r;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f2","role":"authenticated"}', true);
set local role authenticated;
select public.ic_join((select code from t_ctx), 'unit', 'Unit A', null, 2, 'Fire', null, 'engine');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f3","role":"authenticated"}', true);
set local role authenticated;
select public.ic_join((select code from t_ctx), 'unit', 'Unit B', null, 2, 'Rescue', null, 'boat');
reset role;

-- the first PAR; Unit A answers, Unit B does not
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;
with m as (insert into public.ic_messages (incident_id, from_user, to_users, to_label, kind, text) values ((select incident from t_ctx), (select ops from t_ctx), array[(select ua from t_ctx), (select ub from t_ctx)], 'everyone', 'par', 'PAR: is everyone accounted for?') returning id) update t_ctx set par1 = m.id from m;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f2","role":"authenticated"}', true);
set local role authenticated;
insert into public.ic_message_acks (message_id, incident_id, user_id, reply, count) values ((select par1 from t_ctx), (select incident from t_ctx), (select ua from t_ctx), 'All accounted for', 2);
reset role;

-- the second PAR closes the first
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;
with m as (insert into public.ic_messages (incident_id, from_user, to_users, to_label, kind, text) values ((select incident from t_ctx), (select ops from t_ctx), array[(select ua from t_ctx), (select ub from t_ctx)], 'everyone', 'par', 'PAR: is everyone accounted for?') returning id) update t_ctx set par2 = m.id from m;
insert into t_r select superseded_by = (select par2 from t_ctx) and superseded_at is not null, 'a new PAR marks the one before it superseded' from public.ic_messages where id = (select par1 from t_ctx);
insert into t_r select superseded_by is null, 'the new PAR itself is open' from public.ic_messages where id = (select par2 from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Earlier PAR closed by the new one, still waiting on Unit B' and ref_id = (select par1 from t_ctx)::text), 'the log says who had still to answer when it closed';
insert into t_r select (select count(*) from public.ic_message_acks where message_id = (select par1 from t_ctx)) = 1, 'the old answers are kept';
reset role;

-- Unit B answers the new PAR: Okafor is missing; Unit A says someone is missing without a name
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f3","role":"authenticated"}', true);
set local role authenticated;
insert into public.ic_message_acks (message_id, incident_id, user_id, reply, count, missing) values ((select par2 from t_ctx), (select incident from t_ctx), (select ub from t_ctx), 'Missing someone', 1, jsonb_build_array(jsonb_build_object('id', (select okafor from t_ctx), 'name', 'Okafor')));
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f2","role":"authenticated"}', true);
set local role authenticated;
insert into public.ic_message_acks (message_id, incident_id, user_id, reply, count) values ((select par2 from t_ctx), (select incident from t_ctx), (select ua from t_ctx), 'Missing someone', 1);
-- another unit cannot mark Unit B's person found
do $$ begin
  perform public.ic_mark_found((select par2 from t_ctx), (select ub from t_ctx), (select okafor from t_ctx), null);
  insert into t_r values (false, 'another unit must not mark someone found');
exception when others then insert into t_r values (sqlerrm like 'Only the unit%', 'another unit cannot mark someone found: ' || sqlerrm); end $$;
reset role;

-- Unit B marks Okafor found; it is stamped and logged as notable
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f3","role":"authenticated"}', true);
set local role authenticated;
insert into t_r select (missing -> 0 ->> 'found_at') is not null and (missing -> 0 ->> 'found_by') = (select ub from t_ctx)::text and (missing -> 0 ->> 'name') = 'Okafor', 'the unit that reported them marks them found: the entry is stamped'
  from public.ic_mark_found((select par2 from t_ctx), (select ub from t_ctx), (select okafor from t_ctx), null);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Okafor found, reported by Unit B' and notable), 'and the log gets a notable line';
do $$ begin
  perform public.ic_mark_found((select par2 from t_ctx), (select ub from t_ctx), (select okafor from t_ctx), null);
  insert into t_r values (false, 'marking them found twice must fail');
exception when others then insert into t_r values (sqlerrm like 'Nobody by that name%', 'already found: ' || sqlerrm); end $$;
reset role;

-- Operations marks Unit A's nameless report found
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;
insert into t_r select jsonb_array_length(missing) = 1 and (missing -> 0 ->> 'found_at') is not null and (missing -> 0 ->> 'name') is null, 'a report with no name gets one nameless found entry'
  from public.ic_mark_found((select par2 from t_ctx), (select ua from t_ctx), null, null);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'The missing person found, reported by Operations' and notable), 'logged by Operations';
reset role;

select * from t_r order by ok, what;
rollback;
