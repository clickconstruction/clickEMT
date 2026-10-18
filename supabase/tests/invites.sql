-- The rules of invitations (migration 0033), run against the real database inside one transaction that is rolled
-- back at the end:  python3 dev/sbq.py supabase/tests/invites.sql
-- Every row of the result should say ok: true. Pretend accounts stand in for Operations (a1), the invited person
-- (a2), someone else with the link (a3) and a unit joining by code (a4). The function that sends the email is not
-- here: it writes the same rows these statements write.
begin;
create temp table t_r (ok boolean, what text);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
select ('00000000-0000-4000-8000-00000000c0a' || n)::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inv-test-' || n || '@example.invalid', '', now(), now(), now(), '{}', '{}', false, false
from generate_series(1, 4) n;
create temp table t_ctx (incident uuid, code text, second uuid, inv uuid, token text, ops uuid default '00000000-0000-4000-8000-00000000c0a1', guest uuid default '00000000-0000-4000-8000-00000000c0a2', other uuid default '00000000-0000-4000-8000-00000000c0a3', unit uuid default '00000000-0000-4000-8000-00000000c0a4');
insert into t_ctx (incident) values (null);
grant all on t_r, t_ctx to authenticated, anon;
insert into public.ic_profiles (user_id, full_name, phone) select ('00000000-0000-4000-8000-00000000c0a' || n)::uuid, 'Person ' || n, '512 555 04' || n from generate_series(1, 4) n;
create temp view t_log as select text from public.ic_events where incident_id = (select incident from t_ctx);
grant select on t_log to authenticated;
create or replace function pg_temp.as_user(p uuid, e text) returns text language sql as $$ select set_config('request.jwt.claims', '{"sub":"' || p || '","role":"authenticated","email":"' || e || '"}', true); $$;

-- ---- Operations opens the incident and makes an invitation; a unit may not
select pg_temp.as_user((select ops from t_ctx), 'inv-test-1@example.invalid');
set local role authenticated;
update t_ctx set incident = r.id, code = r.code from (select * from public.ic_create_incident('Invite rule test', null, 'Depot', null, null, 14)) r;
with v as (insert into public.ic_invites (incident_id, email, role, unit_name) values ((select incident from t_ctx), ' Inv-Test-2@Example.invalid ', 'unit', 'Unit 4') returning id, token) update t_ctx set inv = v.id, token = v.token from v;
insert into t_r select email = 'inv-test-2@example.invalid' and length(token) = 24 and invited_by = (select ops from t_ctx) and sends = 0 and sent_at is null and public.ic_invite_state(v) = 'unsent', 'a new invitation: the address tidied, a token made, by Operations, not sent yet' from public.ic_invites v where id = (select inv from t_ctx);
insert into t_r select exists (select 1 from t_log where text = 'Invitation to inv-test-2@example.invalid as a unit (Unit 4) made by Operations'), 'making it is a line';
update public.ic_invites set sent_at = now() where id = (select inv from t_ctx);
insert into t_r select sends = 1 and expires_at > now() + interval '6 days' and public.ic_invite_state(v) = 'pending', 'sent: counted, the clock set to seven days' from public.ic_invites v where id = (select inv from t_ctx);
insert into t_r select exists (select 1 from t_log where text = 'Invitation sent to inv-test-2@example.invalid as a unit (Unit 4) by Operations'), 'the send is a line';
update public.ic_invites set sent_at = clock_timestamp() where id = (select inv from t_ctx);   -- a later moment: in one transaction now() is the same instant
insert into t_r select exists (select 1 from t_log where text = 'Invitation to inv-test-2@example.invalid sent again by Operations') and (select sends from public.ic_invites where id = (select inv from t_ctx)) = 2, 'sent again is a line, and counted';
do $$ begin
  insert into public.ic_invites (incident_id, email, role) values ((select incident from t_ctx), 'inv-test-2@example.invalid', 'ops');
  insert into t_r values (false, 'the same address was invited twice');
exception when others then insert into t_r values (sqlerrm = 'inv-test-2@example.invalid is invited already; send it again from the list', 'one open invitation per address: ' || sqlerrm); end $$;
do $$ begin
  insert into public.ic_invites (incident_id, email, role) values ((select incident from t_ctx), 'nobody', 'unit');
  insert into t_r values (false, 'a bad address was accepted');
exception when others then insert into t_r values (sqlerrm = 'an email address is needed', 'an address is needed: ' || sqlerrm); end $$;
do $$ begin
  update public.ic_invites set accepted_at = now() where id = (select inv from t_ctx);
  insert into t_r values (false, 'an invitation was accepted by hand');
exception when others then insert into t_r values (sqlerrm = 'an invitation is accepted by joining with it', 'an invitation is not accepted by hand: ' || sqlerrm); end $$;
reset role;
-- the landing reads the invitation by its token without a session
set local role anon;
insert into t_r select (j ->> 'incident') = 'Invite rule test' and (j ->> 'role') = 'unit' and (j ->> 'unit') = 'Unit 4' and (j ->> 'email') = 'inv-test-2@example.invalid' and (j ->> 'state') = 'pending' and (j ->> 'by') = 'Person 1', 'the landing reads the incident, the role, the unit, the address, the state and who asked' from public.ic_invite_peek((select token from t_ctx)) j;
insert into t_r select public.ic_invite_peek('nope') is null, 'an unknown token reads nothing';
reset role;
select pg_temp.as_user((select unit from t_ctx), 'inv-test-4@example.invalid');
set local role authenticated;
do $$ begin
  insert into public.ic_invites (incident_id, email, role) values ((select incident from t_ctx), 'x@example.invalid', 'unit');
  insert into t_r values (false, 'someone not on the incident invited a person');
exception when others then insert into t_r values (true, 'only Operations invites: ' || sqlerrm); end $$;
reset role;

-- ---- someone else with the link cannot use it; the invited person joins with no code and is Unit 4
select pg_temp.as_user((select other from t_ctx), 'inv-test-3@example.invalid');
set local role authenticated;
do $$ begin
  perform public.ic_join(null, 'unit', null, null, 1, 'Travis County Rescue', '[]'::jsonb, 'engine', (select token from t_ctx));
  insert into t_r values (false, 'another address used the invitation');
exception when others then insert into t_r values (sqlerrm = 'That invitation is for inv-test-2@example.invalid; sign in with that address', 'the invitation is for one address: ' || sqlerrm); end $$;
reset role;
select pg_temp.as_user((select guest from t_ctx), 'inv-test-2@example.invalid');
set local role authenticated;
do $$ begin
  perform public.ic_join(null, 'unit', null, null, 1, 'Travis County Rescue', '[]'::jsonb, 'engine', 'nope');
  insert into t_r values (false, 'an unknown token joined');
exception when others then insert into t_r values (sqlerrm = 'That invitation is not on record; ask Operations for a new one', 'an unknown token is refused: ' || sqlerrm); end $$;
select public.ic_join(null, 'unit', null, null, 1, 'Travis County Rescue', '[]'::jsonb, 'engine', (select token from t_ctx));
insert into t_r select role = 'unit' and unit_name = 'Unit 4' and agency = 'Travis County Rescue' and kind = 'engine', 'joined by invitation: a unit, named by the invitation' from public.ic_members where incident_id = (select incident from t_ctx) and user_id = (select guest from t_ctx);
insert into t_r select accepted_at is not null and accepted_by = (select guest from t_ctx) and public.ic_invite_state(v) = 'accepted', 'the invitation is accepted' from public.ic_invites v where id = (select inv from t_ctx);
insert into t_r select exists (select 1 from t_log where text = 'Person 2 accepted the invitation from Operations') and exists (select 1 from t_log where text like 'Unit 4, engine checked in by invitation as Person 2, 512 555 042%'), 'both lines are in the 214';
select public.ic_join(null, 'unit', null, null, 1, 'Travis County Rescue', '[]'::jsonb, 'engine', (select token from t_ctx));
insert into t_r select count(*) = 1, 'the same person joins again with the same link: one membership' from public.ic_members where incident_id = (select incident from t_ctx) and user_id = (select guest from t_ctx);
reset role;
select pg_temp.as_user((select other from t_ctx), 'inv-test-3@example.invalid');
set local role authenticated;
do $$ begin
  perform public.ic_join(null, 'unit', null, null, 1, 'x', '[]'::jsonb, 'engine', (select token from t_ctx));
  insert into t_r values (false, 'a used invitation joined someone else');
exception when others then insert into t_r values (sqlerrm = 'That invitation was used already; ask Operations for a new one', 'a used invitation is refused for anyone else: ' || sqlerrm); end $$;
reset role;

-- ---- withdrawn and expired invitations; Operations by invitation; the roster
select pg_temp.as_user((select ops from t_ctx), 'inv-test-1@example.invalid');
set local role authenticated;
insert into public.ic_invites (incident_id, email, role, token, sent_at) values ((select incident from t_ctx), 'inv-test-3@example.invalid', 'ops', 'WITHDRAWNTOKEN0000000001', now());
update public.ic_invites set withdrawn_at = now() where token = 'WITHDRAWNTOKEN0000000001';
insert into t_r select withdrawn_by = (select ops from t_ctx) and public.ic_invite_state(v) = 'withdrawn', 'withdrawn, by Operations' from public.ic_invites v where token = 'WITHDRAWNTOKEN0000000001';
insert into t_r select exists (select 1 from t_log where text = 'Invitation to inv-test-3@example.invalid withdrawn by Operations'), 'the withdrawal is a line';
do $$ begin
  update public.ic_invites set withdrawn_at = null where token = 'WITHDRAWNTOKEN0000000001';
  insert into t_r values (false, 'a withdrawn invitation came back');
exception when others then insert into t_r values (sqlerrm = 'a withdrawn invitation is not put back; send a new one', 'withdrawn stays withdrawn: ' || sqlerrm); end $$;
insert into public.ic_invites (incident_id, email, role, token, sent_at) values ((select incident from t_ctx), 'inv-test-3@example.invalid', 'ops', 'OPSTOKEN0000000000000002', now());
update public.ic_invites set expires_at = now() - interval '1 hour' where token = 'OPSTOKEN0000000000000002';
reset role;
select pg_temp.as_user((select other from t_ctx), 'inv-test-3@example.invalid');
set local role authenticated;
do $$ begin
  perform public.ic_join(null, 'unit', null, null, null, null, null, null, 'WITHDRAWNTOKEN0000000001');
  insert into t_r values (false, 'a withdrawn invitation joined');
exception when others then insert into t_r values (sqlerrm = 'That invitation was withdrawn; ask Operations for a new one', 'a withdrawn invitation is refused: ' || sqlerrm); end $$;
do $$ begin
  perform public.ic_join(null, 'unit', null, null, null, null, null, null, 'OPSTOKEN0000000000000002');
  insert into t_r values (false, 'an expired invitation joined');
exception when others then insert into t_r values (sqlerrm = 'That invitation has expired; ask Operations to send it again', 'an expired invitation is refused: ' || sqlerrm); end $$;
reset role;
select pg_temp.as_user((select ops from t_ctx), 'inv-test-1@example.invalid');
set local role authenticated;
update public.ic_invites set sent_at = clock_timestamp() where token = 'OPSTOKEN0000000000000002';   -- sent again: the clock restarts
reset role;
select pg_temp.as_user((select other from t_ctx), 'inv-test-3@example.invalid');
set local role authenticated;
select public.ic_join(null, 'unit', null, null, null, null, null, null, 'OPSTOKEN0000000000000002');
insert into t_r select role = 'ops' and unit_name = 'Operations', 'an invitation as Operations makes Operations, whatever role the phone asked' from public.ic_members where incident_id = (select incident from t_ctx) and user_id = (select other from t_ctx);
insert into t_r select exists (select 1 from t_log where text like 'Operations joined as Operations by invitation as Person 3%'), 'and the line says by invitation';
reset role;

-- ---- invited members only: the units' join code stops, members and the Operations code go on
select pg_temp.as_user((select ops from t_ctx), 'inv-test-1@example.invalid');
set local role authenticated;
update public.ic_incidents set invite_only = true where id = (select incident from t_ctx);
insert into t_r select exists (select 1 from t_log where text = 'Invited members only: the join code is off'), 'the switch is a line';
reset role;
select pg_temp.as_user((select unit from t_ctx), 'inv-test-4@example.invalid');
set local role authenticated;
do $$ begin
  perform public.ic_join((select code from t_ctx), 'unit', 'Unit 9', null, 1, 'x', '[]'::jsonb, 'engine');
  insert into t_r values (false, 'the code let a stranger in');
exception when others then insert into t_r values (sqlerrm = 'This incident is by invitation; ask Operations for one', 'the code is off for the uninvited: ' || sqlerrm); end $$;
reset role;
select pg_temp.as_user((select guest from t_ctx), 'inv-test-2@example.invalid');
set local role authenticated;
select public.ic_join((select code from t_ctx), 'unit', 'Unit 4', null, 1, 'Travis County Rescue', '[]'::jsonb, 'engine');
insert into t_r select status = 'available', 'a member still checks in by code' from public.ic_members where incident_id = (select incident from t_ctx) and user_id = (select guest from t_ctx);
reset role;
select pg_temp.as_user((select ops from t_ctx), 'inv-test-1@example.invalid');
set local role authenticated;
update public.ic_incidents set invite_only = false where id = (select incident from t_ctx);
insert into t_r select exists (select 1 from t_log where text = 'The join code is on again'), 'and on again is a line';
-- the roster: a second incident offers the addresses invited on the first, not yet in or invited there
update t_ctx set second = r.id from (select * from public.ic_create_incident('Second incident', null, null, null, null, 14)) r;
insert into t_r select count(*) = 2 and bool_and(incidents = 1), 'the roster lists the two addresses invited on the first incident' from public.ic_roster((select second from t_ctx));
insert into t_r select exists (select 1 from public.ic_roster((select second from t_ctx)) r where r.email = 'inv-test-2@example.invalid' and r.role = 'unit' and r.unit_name = 'Unit 4'), 'with the role and the unit they had';
insert into public.ic_invites (incident_id, email, role, unit_name) values ((select second from t_ctx), 'inv-test-2@example.invalid', 'unit', 'Unit 4');
insert into t_r select count(*) = 1, 'invited on the second, the address leaves the roster' from public.ic_roster((select second from t_ctx));
insert into t_r select count(*) = 0, 'the roster is nothing on the first incident itself (everyone there is in or invited)' from public.ic_roster((select incident from t_ctx));
reset role;
select * from t_r order by ok, what;
rollback;
