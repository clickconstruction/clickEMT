-- The rules for people (migration 0013), run against the real database inside one transaction that
-- is rolled back at the end, so nothing is left behind:
--   python3 dev/sbq.py supabase/tests/people.sql
-- Every row of the result should say ok: true. Two pretend accounts stand in for Operations and a
-- unit (gone with the rollback); the policies are exercised as the authenticated role with the
-- account's id in request.jwt.claims, the way PostgREST runs a request.
begin;
create temp table t_r (ok boolean, what text);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'people-test-ops@example.invalid', '', now(), now(), now(), '{}', '{}', false, false),
       ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'people-test-unit@example.invalid', '', now(), now(), now(), '{}', '{}', false, false);
create temp table t_ctx (incident uuid, code text, ops uuid default '00000000-0000-4000-8000-0000000000a1', unit uuid default '00000000-0000-4000-8000-0000000000a2');
insert into t_ctx (incident) values (null);
grant all on t_r, t_ctx to authenticated;   -- the checks are written while acting as that role
-- the unit says who it is (a name and a phone are enough to check in since v25; without them ic_join refuses)
insert into public.ic_profiles (user_id, full_name, phone) values ('00000000-0000-4000-8000-0000000000a2', 'People Test', '512 555 0000');

-- as Operations: open the incident
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
update t_ctx set incident = r.id, code = r.code from (select * from public.ic_create_incident('People rule test', null, null, null, null, 14)) r;
reset role;

-- as the unit: check in with two people by name
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
select public.ic_join((select code from t_ctx), 'unit', 'Unit T', null, null, 'Test Rescue',
  '[{"name":" Hale ","role":"Lt.","qualifications":["emt","swift_water"]},{"name":"Dominguez","qualifications":["paramedic"]},{"name":"   "}]'::jsonb);
insert into t_r select count(*) = 2, 'two people on record, the blank name skipped: ' || count(*) from public.ic_people where incident_id = (select incident from t_ctx);
insert into t_r select name = 'Hale' and agency = 'Test Rescue' and role = 'Lt.' and public.ic_qual_text(qualifications) = 'swift water, EMT', 'the name is trimmed, the agency is the unit''s, the qualifications read in the list''s order: ' || name || ' / ' || agency || ' / ' || public.ic_qual_text(qualifications)
  from public.ic_people where lower(name) = 'hale';
insert into t_r select crew = 'Hale, Dominguez' and crew_count = 2, 'the unit''s crew and head count are its people: ' || coalesce(crew, 'null') || ' / ' || coalesce(crew_count::text, 'null')
  from public.ic_members where incident_id = (select incident from t_ctx) and user_id = (select unit from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Hale (swift water, EMT) checked in with Unit T' and kind = 'status' and ref_table = 'ic_people'), 'the log says Hale checked in with the unit, with the qualifications';
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Unit T checked in as People Test, 512 555 0000, identity not given with 2 people'), 'the unit''s own line counts its people';

-- a hand change to the head count is overruled while the unit has people
update public.ic_members set crew_count = 7, crew = 'Whoever' where incident_id = (select incident from t_ctx) and user_id = (select unit from t_ctx);
insert into t_r select crew = 'Hale, Dominguez' and crew_count = 2, 'a hand change to the crew or head count is overruled: ' || crew || ' / ' || crew_count
  from public.ic_members where incident_id = (select incident from t_ctx) and user_id = (select unit from t_ctx);

-- the unit cannot put a person on another member, nor use a qualification off the list
do $$ begin
  insert into public.ic_people (incident_id, user_id, name) values ((select incident from t_ctx), (select ops from t_ctx), 'Intruder');
  insert into t_r values (false, 'a unit added a person to another unit');
exception when others then insert into t_r values (sqlstate = '42501', 'a unit cannot add a person to another unit: ' || sqlstate); end $$;
do $$ begin
  insert into public.ic_people (incident_id, user_id, name, qualifications) values ((select incident from t_ctx), (select unit from t_ctx), 'Ninja', array['ninja']);
  insert into t_r values (false, 'a qualification off the list was accepted');
exception when others then insert into t_r values (sqlstate = '23514', 'qualifications come from the list: ' || sqlstate); end $$;
do $$ begin
  insert into public.ic_people (incident_id, user_id, name) values ((select incident from t_ctx), (select unit from t_ctx), '  ');
  insert into t_r values (false, 'a person with no name was accepted');
exception when others then insert into t_r values (sqlerrm like '%needs a name%', 'a person needs a name: ' || sqlerrm); end $$;

-- Hale checks out a minute before the unit does
update public.ic_people set checked_out_at = now() - interval '1 minute' where incident_id = (select incident from t_ctx) and name = 'Hale';
insert into t_r select crew = 'Dominguez' and crew_count = 1, 'one person checked out leaves one on the unit: ' || crew || ' / ' || crew_count
  from public.ic_members where incident_id = (select incident from t_ctx) and user_id = (select unit from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Hale checked out from Unit T'), 'the log says Hale checked out';

-- the unit checks out: Dominguez goes with it, quietly
update public.ic_members set status = 'checked_out' where incident_id = (select incident from t_ctx) and user_id = (select unit from t_ctx);
insert into t_r select bool_and(checked_out_at is not null), 'the unit''s check-out takes its people with it' from public.ic_people where incident_id = (select incident from t_ctx);
insert into t_r select not exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Dominguez checked out from Unit T'), 'without a line per person';
insert into t_r select crew_count = 0, 'the head count of a checked-out unit is 0: ' || crew_count from public.ic_members where incident_id = (select incident from t_ctx) and user_id = (select unit from t_ctx);

-- the unit checks in again with no list: Dominguez, who left with it, is back; Hale, who left earlier, is not
select public.ic_join((select code from t_ctx), 'unit', 'Unit T', null, null, null, null);
insert into t_r select crew = 'Dominguez' and crew_count = 1, 'checking the unit back in brings back the people who left with it, not the one who left before: ' || coalesce(crew, 'null') || ' / ' || crew_count
  from public.ic_members where incident_id = (select incident from t_ctx) and user_id = (select unit from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Unit T checked in as People Test, 512 555 0000, identity not given'), 'the unit''s line names no count when no list and no count were given';

-- Hale is checked back in by name on the next check-in
select public.ic_join((select code from t_ctx), 'unit', 'Unit T', null, null, null, '[{"name":"hale","qualifications":["rope"]}]'::jsonb);
insert into t_r select crew = 'Hale, Dominguez' and crew_count = 2, 'a name on the list is matched regardless of case and checked back in: ' || crew
  from public.ic_members where incident_id = (select incident from t_ctx) and user_id = (select unit from t_ctx);
insert into t_r select public.ic_qual_text(qualifications) = 'rope' and role = 'Lt.', 'the list updates the qualifications and keeps the role when none is given' from public.ic_people where incident_id = (select incident from t_ctx) and name = 'Hale';
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Hale (rope) checked back in with Unit T'), 'the log says Hale checked back in';
insert into t_r select count(*) = 2, 'no duplicate rows were made: ' || count(*) from public.ic_people where incident_id = (select incident from t_ctx);

-- a unit cannot move a person to another unit, and nothing is deleted
do $$ begin
  update public.ic_people set user_id = (select ops from t_ctx) where incident_id = (select incident from t_ctx) and name = 'Dominguez';
  insert into t_r values (not exists (select 1 from public.ic_people where incident_id = (select incident from t_ctx) and name = 'Dominguez' and user_id = (select ops from t_ctx)), 'a unit cannot move a person to another unit (the row is out of its reach)');
exception when others then insert into t_r values (sqlstate = '42501', 'a unit cannot move a person to another unit: ' || sqlstate); end $$;
delete from public.ic_people where incident_id = (select incident from t_ctx);
insert into t_r select count(*) = 2, 'nothing is deleted: ' || count(*) from public.ic_people where incident_id = (select incident from t_ctx);
reset role;

-- as Operations: move Dominguez to Operations, remove Hale
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
update public.ic_people set user_id = (select ops from t_ctx) where incident_id = (select incident from t_ctx) and name = 'Dominguez';
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Dominguez moved from Unit T to Operations'), 'Operations moves a person and the log says from where to where';
insert into t_r select crew = 'Hale' and crew_count = 1, 'the unit it left is recounted: ' || crew || ' / ' || crew_count from public.ic_members where incident_id = (select incident from t_ctx) and user_id = (select unit from t_ctx);
insert into t_r select crew = 'Dominguez' and crew_count = 1, 'and so is the one it joined: ' || crew || ' / ' || crew_count from public.ic_members where incident_id = (select incident from t_ctx) and user_id = (select ops from t_ctx);
update public.ic_people set archived_at = now() where incident_id = (select incident from t_ctx) and name = 'Hale';
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Hale removed from Unit T'), 'removing a person archives it and the log says so';
insert into t_r select crew is null and crew_count is null, 'an archived person is not counted, and with nobody left the count is unknown again: ' || coalesce(crew, 'null') || ' / ' || coalesce(crew_count::text, 'null') from public.ic_members where incident_id = (select incident from t_ctx) and user_id = (select unit from t_ctx);
do $$ begin
  update public.ic_people set buddy_id = id where incident_id = (select incident from t_ctx) and name = 'Dominguez';
  insert into t_r values (false, 'a person was made their own buddy');
exception when others then insert into t_r values (sqlerrm like '%buddy%', 'a person is not their own buddy: ' || sqlerrm); end $$;
reset role;

select * from t_r order by ok, what;
rollback;
