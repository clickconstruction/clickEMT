-- The rules of the band as a door and of credentials (migration 0037), run against the real database inside one
-- transaction that is rolled back at the end:  python3 dev/sbq.py supabase/tests/credentials.sql
-- Every row of the result should say ok: true. Pretend accounts stand in for Operations (f1), the lead of Unit 2 (f2),
-- Rosa, who arrives late and is handed a band (f3), another unit on the incident (f4) and a walk-up with no unit (f5).
begin;
create temp table t_r (ok boolean, what text);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
select ('00000000-0000-4000-8000-0000000000e' || n)::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cred-test-' || n || '@example.invalid', '', now(), now(), now(), '{}', '{}', false, false
from generate_series(1, 5) n;
create temp table t_ctx (incident uuid, code text, person uuid, cred uuid, cred2 uuid, b1 text, b2 text, b3 text,   -- the three bands' codes, read as Operations: a phone not yet on the incident cannot read ic_tags
  ops uuid default '00000000-0000-4000-8000-0000000000e1', lead uuid default '00000000-0000-4000-8000-0000000000e2', rosa uuid default '00000000-0000-4000-8000-0000000000e3',
  other uuid default '00000000-0000-4000-8000-0000000000e4', walkup uuid default '00000000-0000-4000-8000-0000000000e5');
insert into t_ctx (incident) values (null);
grant all on t_r, t_ctx to authenticated;
insert into public.ic_profiles (user_id, full_name, phone) values ('00000000-0000-4000-8000-0000000000e2', 'Minh Nguyen', '512 555 0122'), ('00000000-0000-4000-8000-0000000000e4', 'Person 4', '512 555 0144');
create temp view t_log as select text, kind from public.ic_events where incident_id = (select incident from t_ctx);
grant select on t_log to authenticated;
create or replace function pg_temp.as_user(p uuid) returns text language sql as $$ select set_config('request.jwt.claims', '{"sub":"' || p || '","role":"authenticated"}', true); $$;
create or replace function pg_temp.tag(n integer) returns public.ic_tags language sql as $$ select t from public.ic_tags t where t.incident_id = (select incident from t_ctx) and t.number = n; $$;
grant execute on function pg_temp.tag(integer) to authenticated;

-- ---- Operations opens the incident and prints three bands; the lead checks Unit 2 in with two names and a third counted
select pg_temp.as_user((select ops from t_ctx));
set local role authenticated;
update t_ctx set incident = r.id, code = r.code from (select * from public.ic_create_incident('Credentials rule test', null, 'Depot', null, null, 14)) r;
select count(*) from public.ic_print_bands((select incident from t_ctx), 3);
update t_ctx set b1 = (pg_temp.tag(1)).code, b2 = (pg_temp.tag(2)).code, b3 = (pg_temp.tag(3)).code;
reset role;
select pg_temp.as_user((select lead from t_ctx));
set local role authenticated;
select public.ic_join((select code from t_ctx), 'unit', 'Unit 2', null, 3, 'Travis County Rescue', '[{"name":"Nguyen","role":"Capt.","qualifications":["boat"]},{"name":"Alvarez","qualifications":["swift_water"]}]'::jsonb, 'boat');
insert into t_r select crew_count = 3 and unnamed_count = 1, 'Unit 2 is three, one not yet named: ' || crew_count || ', ' || unnamed_count from public.ic_members where incident_id = (select incident from t_ctx) and user_id = (select lead from t_ctx);
reset role;
select pg_temp.as_user((select other from t_ctx));
set local role authenticated;
select public.ic_join((select code from t_ctx), 'unit', 'Unit 4', null, 1, 'Cedar Fork Fire Department', '[]'::jsonb, 'engine');
reset role;

-- ---- Rosa, not on the incident, scans band 1: the peek says what it is and the units to pick from; nothing else
select pg_temp.as_user((select rosa from t_ctx));
set local role authenticated;
insert into t_r select count(*) = 0, 'before the claim she reads nothing of the incident' from public.ic_incidents where id = (select incident from t_ctx);
insert into t_r select j ->> 'state' = 'free' and (j ->> 'number')::integer = 1 and j ->> 'incident' = 'Credentials rule test' and (j ->> 'member')::boolean = false
    and (select array_agg(u ->> 'unit_name' order by u ->> 'unit_name') from jsonb_array_elements(j -> 'units') u) = array['Unit 2', 'Unit 4'],
  'the peek: band 001 is free, the incident''s name, the two units: ' || j::text from public.ic_band_peek((select b1 from t_ctx)) j;
insert into t_r select j ->> 'state' = 'missing', 'a code no band has: ' || j::text from public.ic_band_peek('XYZ-001-ABCD') j;
do $$ begin
  perform public.ic_claim_band((select b1 from t_ctx), 'Rosa Alvarez', '', 'Travis County Rescue', (select lead from t_ctx));
  insert into t_r values (false, 'a claim with no phone went through');
exception when others then insert into t_r values (sqlerrm = 'Say who you are first: your name and your phone', 'a name and a phone first: ' || sqlerrm); end $$;
-- the claim: on the incident at once, riding with Unit 2, the lead's "Alvarez" row taken over, the band hers, the scan on record, one line
insert into t_r select name = 'Credentials rule test', 'the claim returns the incident, now open to her: ' || name from public.ic_claim_band((select b1 from t_ctx), 'Rosa Alvarez', '512 555 0177', 'Travis County Rescue', (select lead from t_ctx));
insert into t_r select full_name = 'Rosa Alvarez' and phone = '512 555 0177', 'her name and phone are on the profile, as the Identify sheet writes them' from public.ic_profiles where user_id = (select rosa from t_ctx);
insert into t_r select role = 'unit' and unit_name = 'Unit 2' and rides_with = (select lead from t_ctx) and status = 'available' and agency = 'Travis County Rescue', 'she is a member riding with Unit 2: ' || role || ', ' || unit_name || ', ' || status from public.ic_members where incident_id = (select incident from t_ctx) and user_id = (select rosa from t_ctx);
update t_ctx set person = (select id from public.ic_people where incident_id = (select incident from t_ctx) and claimed_by = (select rosa from t_ctx));
insert into t_r select count(*) = 1 and bool_and(name = 'Alvarez' and user_id = (select lead from t_ctx) and 'swift_water' = any(qualifications)), 'the lead''s "Alvarez" row is hers now, not doubled: ' || count(*) || ' row' from public.ic_people where incident_id = (select incident from t_ctx) and lower(name) like '%alvarez%';
insert into t_r select crew_count = 3 and unnamed_count = 1, 'Unit 2 is still three, one unnamed: ' || crew_count || ', ' || unnamed_count from public.ic_members where incident_id = (select incident from t_ctx) and user_id = (select lead from t_ctx);
insert into t_r select person_id = (select person from t_ctx) and kind = 'responder' and issued_by = (select rosa from t_ctx), 'band 001 is on her, given by her own account' from public.ic_tags where id = (pg_temp.tag(1)).id;
insert into t_r select exists (select 1 from public.ic_seen s where s.tag_id = (pg_temp.tag(1)).id and s.kind = 'check_in' and s.seen_by = (select rosa from t_ctx)), 'the check-in scan is on record';
insert into t_r select exists (select 1 from t_log where text = 'Rosa Alvarez claimed Band 001 (Unit 2)' and kind = 'seen'), 'one line: Rosa Alvarez claimed Band 001 (Unit 2)';
insert into t_r select not exists (select 1 from t_log where text like 'Band 001 given%' or text like '%seen checking in with%' or text like '%Alvarez checked in%'), 'and no line for the band, the scan or the roster underneath';
insert into t_r select count(*) = 1, 'now she reads the incident' from public.ic_incidents where id = (select incident from t_ctx);
insert into t_r select (j ->> 'member')::boolean, 'the peek knows she is on it now' from public.ic_band_peek((select b2 from t_ctx)) j;
do $$ begin
  perform public.ic_claim_band((select b1 from t_ctx), 'Rosa Alvarez', '512 555 0177', null, null);
  insert into t_r values (false, 'a band on someone was claimed');
exception when others then insert into t_r values (sqlerrm = 'Band 001 is on someone already', 'a band on someone is refused: ' || sqlerrm); end $$;
do $$ begin
  perform public.ic_claim_band((select b2 from t_ctx), 'Rosa Alvarez', '512 555 0177', null, (select lead from t_ctx));
  insert into t_r values (false, 'a second band went on her');
exception when others then insert into t_r values (sqlerrm = 'You have Band 001 already; ask Operations to void it first', 'one live band per person: ' || sqlerrm); end $$;
reset role;

-- ---- a voided band is refused; a walk-up with no unit claims one and is a unit of their own
select pg_temp.as_user((select ops from t_ctx));
set local role authenticated;
update public.ic_tags set voided_at = now() where id = (pg_temp.tag(2)).id;
reset role;
select pg_temp.as_user((select walkup from t_ctx));
set local role authenticated;
insert into t_r select j ->> 'state' = 'voided' and (j ->> 'number')::integer = 2 and j -> 'units' is null, 'the peek of a voided band says so and nothing else: ' || j::text from public.ic_band_peek((select b2 from t_ctx)) j;
do $$ begin
  perform public.ic_claim_band((select b2 from t_ctx), 'Sam Lee', '512 555 0198', null, null);
  insert into t_r values (false, 'a voided band was claimed');
exception when others then insert into t_r values (sqlerrm = 'Band 002 was voided; ask for another', 'a voided band is refused: ' || sqlerrm); end $$;
do $$ begin
  perform public.ic_claim_band((select b3 from t_ctx), 'Sam Lee', '512 555 0198', null, (select walkup from t_ctx));
  insert into t_r values (true, 'claiming with no unit, or oneself as the unit, is a unit of one''s own');
exception when others then insert into t_r values (false, 'the walk-up could not claim: ' || sqlerrm); end $$;
insert into t_r select role = 'unit' and unit_name = 'Sam Lee' and rides_with is null, 'the walk-up is a unit named after them: ' || unit_name from public.ic_members where incident_id = (select incident from t_ctx) and user_id = (select walkup from t_ctx);
insert into t_r select count(*) = 1 and bool_and(user_id = (select walkup from t_ctx) and claimed_by = (select walkup from t_ctx)), 'and a person on their own roster' from public.ic_people where incident_id = (select incident from t_ctx) and name = 'Sam Lee';
insert into t_r select exists (select 1 from t_log where text = 'Sam Lee claimed Band 003 (not on a unit yet)'), 'the line says not on a unit yet';
reset role;

-- ---- credentials: Rosa submits an EMT; pending only, the line written; another unit sees nothing; Operations confirms
select pg_temp.as_user((select rosa from t_ctx));
set local role authenticated;
with c as (insert into public.ic_credentials (user_id, kind, number, issuer, expires_at, status) values ((select rosa from t_ctx), 'emt', 'emt-204471', 'Texas DSHS', '2028-01-31', 'confirmed') returning id) update t_ctx set cred = c.id from c;
insert into t_r select status = 'pending' and reason = '' and confirmed_by is null and number = 'EMT-204471', 'the owner submits pending only, whatever the row said: ' || status from public.ic_credentials where id = (select cred from t_ctx);
insert into t_r select exists (select 1 from t_log where text = 'Rosa Alvarez submitted EMT' and kind = 'seen'), 'the 214 says she submitted it';
do $$ begin
  insert into public.ic_credentials (user_id, kind) values ((select rosa from t_ctx), 'other');
  insert into t_r values (false, 'an other with no title was accepted');
exception when others then insert into t_r values (sqlerrm = 'Say what the credential is', 'an other needs its title: ' || sqlerrm); end $$;
do $$ begin
  update public.ic_credentials set status = 'confirmed' where id = (select cred from t_ctx);
  insert into t_r values (false, 'the owner confirmed their own');
exception when others then insert into t_r values (sqlerrm = 'Only Operations of an incident the owner is on confirms a credential', 'the owner cannot confirm: ' || sqlerrm); end $$;
do $$ begin
  insert into public.ic_credentials (user_id, kind) values ((select lead from t_ctx), 'rope');
  insert into t_r values (false, 'a credential was written for someone else');
exception when others then insert into t_r values (sqlstate = '42501', 'only for oneself: ' || sqlerrm); end $$;
reset role;
select pg_temp.as_user((select other from t_ctx));
set local role authenticated;
insert into t_r select count(*) = 0, 'another unit on the incident reads nothing of it' from public.ic_credentials where user_id = (select rosa from t_ctx);
update public.ic_credentials set issuer = 'nobody' where id = (select cred from t_ctx);
do $$ begin
  perform public.ic_decide_credential((select cred from t_ctx), (select incident from t_ctx), true, null);
  insert into t_r values (false, 'a unit confirmed a credential');
exception when others then insert into t_r values (sqlerrm = 'Only Operations confirms a credential', 'a unit cannot confirm: ' || sqlerrm); end $$;
reset role;
select pg_temp.as_user((select ops from t_ctx));
set local role authenticated;
insert into t_r select count(*) = 1 and bool_and(issuer = 'Texas DSHS'), 'Operations of her incident reads it, untouched by the other unit' from public.ic_credentials where user_id = (select rosa from t_ctx);
do $$ begin
  perform public.ic_decide_credential((select cred from t_ctx), (select incident from t_ctx), false, '');
  insert into t_r values (false, 'a refusal with no reason went through');
exception when others then insert into t_r values (sqlerrm = 'Say why it is not accepted', 'not accepted needs a reason: ' || sqlerrm); end $$;
insert into t_r select status = 'confirmed' and confirmed_by = (select ops from t_ctx) and confirmed_at is not null and reason = '', 'Operations confirms: ' || status from public.ic_decide_credential((select cred from t_ctx), (select incident from t_ctx), true, null);
insert into t_r select exists (select 1 from t_log where text = 'Rosa Alvarez''s EMT confirmed by Operations'), 'and the 214 says so';
update public.ic_credentials set status = 'rejected' where id = (select cred from t_ctx);   -- no update policy for Operations: nothing changes
insert into t_r select status = 'confirmed', 'a plain update by Operations changes nothing; the decision goes through the function' from public.ic_credentials where id = (select cred from t_ctx);
reset role;

-- ---- a changed number goes back to pending; a refusal keeps its reason; withdrawn is archived, never deleted
select pg_temp.as_user((select rosa from t_ctx));
set local role authenticated;
update public.ic_credentials set number = 'EMT-204472' where id = (select cred from t_ctx);
insert into t_r select status = 'pending' and confirmed_by is null and confirmed_at is null, 'a changed number is pending again: ' || status from public.ic_credentials where id = (select cred from t_ctx);
insert into t_r select exists (select 1 from t_log where text = 'Rosa Alvarez''s EMT changed, pending again'), 'and the line says so';
reset role;
select pg_temp.as_user((select ops from t_ctx));
set local role authenticated;
insert into t_r select status = 'rejected' and reason = 'expired' and confirmed_by = (select ops from t_ctx), 'not accepted, with the reason: ' || reason from public.ic_decide_credential((select cred from t_ctx), (select incident from t_ctx), false, 'expired');
insert into t_r select exists (select 1 from t_log where text = 'Rosa Alvarez''s EMT not accepted: expired'), 'the 214 says why';
reset role;
select pg_temp.as_user((select rosa from t_ctx));
set local role authenticated;
do $$ begin
  update public.ic_credentials set reason = '' where id = (select cred from t_ctx);
  insert into t_r values (false, 'the owner blanked the reason');
exception when others then insert into t_r values (sqlerrm = 'the reason is Operations'' word', 'the reason stays: ' || sqlerrm); end $$;
update public.ic_credentials set archived_at = now() where id = (select cred from t_ctx);
insert into t_r select archived_at is not null and status = 'rejected' and reason = 'expired', 'withdrawn: archived with its decision kept' from public.ic_credentials where id = (select cred from t_ctx);
insert into t_r select exists (select 1 from t_log where text = 'Rosa Alvarez withdrew EMT'), 'and logged';
delete from public.ic_credentials where id = (select cred from t_ctx);   -- no delete policy: nothing goes
insert into t_r select exists (select 1 from public.ic_credentials where id = (select cred from t_ctx)), 'nothing is deleted';
with c as (insert into public.ic_credentials (user_id, kind, issuer, expires_at, photo_path) values ((select rosa from t_ctx), 'boat', 'Texas Parks and Wildlife', '2027-11-30', (select rosa from t_ctx) || '/cred-boat.jpg') returning id) update t_ctx set cred2 = c.id from c;
reset role;
select pg_temp.as_user((select ops from t_ctx));
set local role authenticated;
do $$ begin
  perform public.ic_decide_credential((select cred from t_ctx), (select incident from t_ctx), true, null);
  insert into t_r values (false, 'a withdrawn credential was decided');
exception when others then insert into t_r values (sqlerrm = 'That credential was withdrawn', 'a withdrawn one is not decided: ' || sqlerrm); end $$;
select public.ic_decide_credential((select cred2 from t_ctx), (select incident from t_ctx), true, null);
insert into t_r select exists (select 1 from t_log where text = 'Rosa Alvarez''s boat operator confirmed by Operations'), 'the boat operator card confirmed';
reset role;

-- ---- the clearing by rule blanks the number and the photo, keeps the fact
insert into storage.objects (bucket_id, name) values ('ic-ids', (select rosa from t_ctx) || '/cred-boat.jpg');
select pg_temp.as_user((select ops from t_ctx));
set local role authenticated;
update public.ic_incidents set status = 'closed' where id = (select incident from t_ctx);
select public.ic_clear_personal((select incident from t_ctx));
insert into t_r select number = '' and photo_path is null and status = 'confirmed' and issuer = 'Texas Parks and Wildlife' and expires_at = '2027-11-30' and confirmed_by = (select ops from t_ctx) and confirmed_at is not null, 'the boat operator card: number and photo gone, the fact kept (confirmed by Operations, the issuer, the expiry)' from public.ic_credentials where id = (select cred2 from t_ctx);
insert into t_r select number = '' and status = 'rejected' and reason = 'expired', 'the withdrawn EMT: number gone, the refusal and its reason kept' from public.ic_credentials where id = (select cred from t_ctx);
insert into t_r select exists (select 1 from public.ic_id_purge q where q.incident_id = (select incident from t_ctx) and q.path = (select rosa from t_ctx) || '/cred-boat.jpg' and q.done_at is null), 'the photo is queued for the base to remove';
insert into t_r select exists (select 1 from t_log where text like 'Personal records cleared by rule: %, 2 credentials blanked'), 'and the line counts them';
reset role;

select * from t_r;
rollback;
