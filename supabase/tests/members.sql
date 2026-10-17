-- The rules for members, roles and the clearing of personal records (migration 0019), run against the
-- real database inside one transaction that is rolled back at the end, so nothing is left behind:
--   python3 dev/sbq.py supabase/tests/members.sql
-- Every row of the result should say ok: true. Three pretend accounts: the one who opens the incident
-- (Operations), a unit, and a relief chief who joins with the Operations code. The policies are
-- exercised as the authenticated role with the account's id in request.jwt.claims, as PostgREST does.
begin;
create temp table t_r (ok boolean, what text);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'members-test-ops@example.invalid', '', now(), now(), now(), '{}', '{}', false, false),
       ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'members-test-unit@example.invalid', '', now(), now(), now(), '{}', '{}', false, false),
       ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'members-test-relief@example.invalid', '', now(), now(), now(), '{}', '{}', false, false);
create temp table t_ctx (incident uuid, code text, ops_code text, inc2 uuid, code2 text, facility uuid,
  ops uuid default '00000000-0000-4000-8000-0000000000b1', unit uuid default '00000000-0000-4000-8000-0000000000b2', relief uuid default '00000000-0000-4000-8000-0000000000b3');
insert into t_ctx (incident) values (null);
grant all on t_r, t_ctx to authenticated;
-- who they are: the unit has a licence on file, the relief chief a licence, a date of birth, an address and a photo
insert into public.ic_profiles (user_id, full_name, phone, licence_number, licence_state, date_of_birth, address, id_source)
values ('00000000-0000-4000-8000-0000000000b2', 'People Test', '512 555 0000', 'U7654321', 'TX', '1988-02-02', '9 Elm St, Cedar Fork', 'typed');
insert into public.ic_profiles (user_id, full_name, phone, licence_number, licence_state, licence_expires, date_of_birth, address, id_source, photo_path)
values ('00000000-0000-4000-8000-0000000000b3', 'Relief Chief', '512 555 0001', 'R1234567', 'TX', '2031-01-01', '1979-05-05', '4 Oak St, Cedar Fork', 'scan', '00000000-0000-4000-8000-0000000000b3/licence.jpg');
insert into storage.objects (bucket_id, name) values ('ic-ids', '00000000-0000-4000-8000-0000000000b3/licence.jpg');

-- as the one who opens it: two incidents, a shelter on the first
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
update t_ctx set incident = r.id, code = r.code from (select * from public.ic_create_incident('Members rule test', null, null, null, null, 14)) r;
update t_ctx set inc2 = r.id, code2 = r.code from (select * from public.ic_create_incident('Members rule test, the other one', null, null, null, null, 14)) r;
insert into t_r select count(*) = 1 and length(max(code)) = 8 and max(code) <> (select code from t_ctx), 'the incident gets an Operations code of its own, eight letters, not the join code: ' || coalesce(max(code), 'none')
  from public.ic_ops_codes where incident_id = (select incident from t_ctx);
update t_ctx set ops_code = (select code from public.ic_ops_codes where incident_id = (select incident from t_ctx));
with f as (insert into public.ic_facilities (incident_id, kind, name, lat, lng) values ((select incident from t_ctx), 'shelter', 'Test gym', 30.25, -97.74) returning id) update t_ctx set facility = f.id from f;
reset role;

-- as the unit: the join code makes a unit; the Operations code is out of reach
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
select public.ic_join((select code from t_ctx), 'unit', 'Unit T', null, null, 'Test Rescue', '[{"name":"Hale","qualifications":["emt"]}]'::jsonb);
select public.ic_join((select code2 from t_ctx), 'unit', 'Unit T', null, null, 'Test Rescue', null);
insert into t_r select role = 'unit', 'the join code checks a unit in as a unit: ' || role from public.ic_members where incident_id = (select incident from t_ctx) and user_id = (select unit from t_ctx);
insert into t_r select count(*) = 0, 'a unit cannot read the Operations code: ' || count(*) || ' rows' from public.ic_ops_codes where incident_id = (select incident from t_ctx);
do $$ begin
  perform public.ic_join((select code from t_ctx), 'ops', 'Operations', null, null, null, null);
  insert into t_r values (false, 'the join code made Operations');
exception when others then insert into t_r values (sqlerrm like '%join code for field units%', 'the base, holding the units'' code, is told which code it needs: ' || sqlerrm); end $$;
do $$ begin
  update public.ic_members set role = 'ops' where incident_id = (select incident from t_ctx) and user_id = (select unit from t_ctx);
  insert into t_r values (false, 'a unit made itself Operations');
exception when others then insert into t_r values (sqlerrm like '%Only Operations%', 'a unit cannot make itself Operations: ' || sqlerrm); end $$;
reset role;

-- as the relief chief: the Operations code makes Operations, from a phone or the base alike
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b3","role":"authenticated"}', true);
set local role authenticated;
select public.ic_join((select ops_code from t_ctx), 'unit', 'Whatever', null, null, null, null);
insert into t_r select role = 'ops' and unit_name = 'Whatever', 'the Operations code makes the member Operations: ' || role from public.ic_members where incident_id = (select incident from t_ctx) and user_id = (select relief from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text like 'Operations joined as Operations with the Operations code as Relief Chief, 512 555 0001, licence scanned%'), 'the log says who joined as Operations, and how';
insert into t_r select count(*) = 1, 'now Operations, they read the code' from public.ic_ops_codes where incident_id = (select incident from t_ctx);
reset role;

-- as the opener: New code retires the old one; roles change and are logged; the opener stays Operations
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
insert into t_r select public.ic_new_ops_code((select incident from t_ctx)) <> (select ops_code from t_ctx), 'New code gives a different code';
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Operations code replaced; the old one no longer joins')
  and not exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text like '%' || (select ops_code from t_ctx) || '%'), 'the log says the code was replaced, and never says a code';
update public.ic_members set role = 'unit', unit_name = 'Unit 9' where incident_id = (select incident from t_ctx) and user_id = (select relief from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Relief Chief is now a unit, Unit 9'), 'Make a unit is logged by name';
update public.ic_members set role = 'ops' where incident_id = (select incident from t_ctx) and user_id = (select relief from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Unit 9 (Relief Chief) is now Operations'), 'Make Operations is logged by unit and name';
do $$ begin
  update public.ic_members set role = 'unit' where incident_id = (select incident from t_ctx) and user_id = (select ops from t_ctx);
  insert into t_r values (false, 'the opener was demoted');
exception when others then insert into t_r values (sqlerrm like '%always Operations%', 'the person who opened the incident cannot be demoted: ' || sqlerrm); end $$;
do $$ begin
  update public.ic_members set removed_at = now() where incident_id = (select incident from t_ctx) and user_id = (select ops from t_ctx);
  insert into t_r values (false, 'the opener was removed');
exception when others then insert into t_r values (sqlerrm like '%cannot be removed%', 'nor removed: ' || sqlerrm); end $$;
reset role;

-- the old Operations code no longer joins
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b3","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  perform public.ic_join((select ops_code from t_ctx), 'unit', 'Whatever', null, null, null, null);
  insert into t_r values (false, 'the retired Operations code still joined');
exception when others then insert into t_r values (sqlerrm like 'No active incident has the code%', 'the retired Operations code no longer joins: ' || sqlerrm); end $$;
reset role;

-- removal: the unit holds a division and has a person on record
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
insert into public.ic_zones (incident_id, code, name, priority, polygon, assigned_to, status) values ((select incident from t_ctx), 'A-1', 'Test', 1, '{"type":"Polygon","coordinates":[[[-97.74,30.25],[-97.73,30.25],[-97.73,30.26],[-97.74,30.26],[-97.74,30.25]]]}'::jsonb, (select unit from t_ctx), 'active');
update public.ic_members set removed_at = now() where incident_id = (select incident from t_ctx) and user_id = (select unit from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Unit T (People Test) removed from the incident by Operations'), 'a removal is one line in the log, by unit and name';
insert into t_r select not exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Unit T checked out'), 'and not a check-out line';
insert into t_r select status = 'checked_out' and removed_by = (select ops from t_ctx) and checked_out_at is not null, 'the removed member is checked out, stamped by whom: ' || status from public.ic_members where incident_id = (select incident from t_ctx) and user_id = (select unit from t_ctx);
insert into t_r select assigned_to is null and status = 'open', 'its division goes back to not started: ' || status from public.ic_zones where incident_id = (select incident from t_ctx) and code = 'A-1';
insert into t_r select bool_and(checked_out_at is not null), 'its people are checked out' from public.ic_people where incident_id = (select incident from t_ctx) and user_id = (select unit from t_ctx);
reset role;

-- as the removed unit: it sees its own row and nothing else; what it queued before the removal lands, nothing after
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
insert into t_r select count(*) = 1 and bool_and(removed_at is not null), 'the removed phone still reads its own row, with removed_at: ' || count(*) from public.ic_members where incident_id = (select incident from t_ctx);
insert into t_r select count(*) = 0, 'and no longer the incident: ' || count(*) || ' rows' from public.ic_incidents where id = (select incident from t_ctx);
insert into t_r select count(*) = 0, 'nor its zones: ' || count(*) || ' rows' from public.ic_zones where incident_id = (select incident from t_ctx);
do $$ begin
  insert into public.ic_hazards (incident_id, user_id, kind, note, created_at) values ((select incident from t_ctx), (select unit from t_ctx), 'Gas smell', 'queued before the removal', now() - interval '1 minute');
  insert into t_r values (true, 'a hazard stamped before the removal is accepted');
exception when others then insert into t_r values (false, 'a hazard stamped before the removal was refused: ' || sqlerrm); end $$;
do $$ begin
  insert into public.ic_hazards (incident_id, user_id, kind, note) values ((select incident from t_ctx), (select unit from t_ctx), 'Gas smell', 'after the removal');
  insert into t_r values (false, 'a hazard after the removal was accepted');
exception when others then insert into t_r values (sqlstate = '42501', 'a hazard after the removal is refused: ' || sqlstate); end $$;
do $$ begin
  perform public.ic_join((select code from t_ctx), 'unit', 'Unit T', null, null, null, null);
  insert into t_r values (false, 'a removed member rejoined with the code');
exception when others then insert into t_r values (sqlerrm like 'You were removed from%', 'the join code does not let a removed member back in: ' || sqlerrm); end $$;
do $$ begin
  update public.ic_members set removed_at = null where incident_id = (select incident from t_ctx) and user_id = (select unit from t_ctx);
  insert into t_r values (not exists (select 1 from public.ic_members where incident_id = (select incident from t_ctx) and user_id = (select unit from t_ctx) and removed_at is null), 'a removed member cannot put itself back');
exception when others then insert into t_r values (sqlerrm like '%Only Operations%', 'a removed member cannot put itself back: ' || sqlerrm); end $$;
reset role;

-- as the opener: Restore
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
update public.ic_members set removed_at = null where incident_id = (select incident from t_ctx) and user_id = (select unit from t_ctx);
insert into t_r select status = 'available' and removed_by is null, 'Restore makes the member available again: ' || status from public.ic_members where incident_id = (select incident from t_ctx) and user_id = (select unit from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Unit T (People Test) put back on the incident by Operations'), 'and the log says so';

-- personal records: the clock starts at the close
insert into public.ic_evacuees (incident_id, label, count, needs, note, from_text, status, facility_id) values ((select incident from t_ctx), 'Garza, family of 3', 3, array['infant'], 'wet, cold, a baby', '120 Pecan Ln', 'here', (select facility from t_ctx));
do $$ begin
  perform public.ic_clear_personal((select incident from t_ctx));
  insert into t_r values (false, 'personal records were cleared on an open incident');
exception when others then insert into t_r values (sqlerrm like 'Close the incident first%', 'nothing clears while the incident is open: ' || sqlerrm); end $$;
update public.ic_incidents set status = 'closed' where id = (select incident from t_ctx);
insert into t_r select clear_personal_at between now() + interval '29 days' and now() + interval '31 days' and personal_cleared_at is null, 'closing sets the date 30 days out' from public.ic_incidents where id = (select incident from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Incident closed · personal records clear by rule in 30 days'), 'the close line says when';
select public.ic_keep_personal((select incident from t_ctx), 30);
insert into t_r select clear_personal_at between now() + interval '59 days' and now() + interval '61 days', 'Keep 30 more days moves the date on' from public.ic_incidents where id = (select incident from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Personal records kept 30 more days'), 'and is logged';
-- Clear now: the relief chief is in no open incident and is cleared; the unit is still on the other incident and is kept
select public.ic_clear_personal((select incident from t_ctx));
insert into t_r select licence_number = '' and licence_state = '' and licence_expires is null and date_of_birth is null and address = '' and photo_path is null and id_source = '' and full_name = 'Relief Chief' and phone = '512 555 0001',
  'the licence, date of birth, address and photo go; the name and phone stay' from public.ic_profiles where user_id = (select relief from t_ctx);
insert into t_r select count(*) = 1 and bool_and(done_at is null), 'the licence photo is queued for the base to remove through the Storage API: ' || count(*) from public.ic_id_purge where incident_id = (select incident from t_ctx) and path = (select relief from t_ctx) || '/licence.jpg';
insert into t_r select licence_number = 'U7654321' and address <> '', 'a member still on an open incident keeps the licence' from public.ic_profiles where user_id = (select unit from t_ctx);
insert into t_r select label = 'family of 3' and count = 3 and needs = array['infant'] and note = '' and from_text = '120 Pecan Ln', 'the evacuee record keeps its count, needs and where from, and loses the name and the note: ' || label
  from public.ic_evacuees where incident_id = (select incident from t_ctx);
insert into t_r select personal_cleared_at is not null, 'the incident is stamped cleared' from public.ic_incidents where id = (select incident from t_ctx);
insert into t_r select count(*) = 1, 'one line in the 214: ' || max(text) from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Personal records cleared by rule: 1 licence record, 1 sheltered person''s name';
select public.ic_clear_personal((select incident from t_ctx));
insert into t_r select count(*) = 1, 'a second run does nothing' from public.ic_events where incident_id = (select incident from t_ctx) and text like 'Personal records cleared by rule%';
-- the other incident closes; when its date comes, the nightly run clears it, called by anyone
update public.ic_incidents set status = 'closed' where id = (select inc2 from t_ctx);
reset role;
update public.ic_incidents set clear_personal_at = now() - interval '1 day' where id = (select inc2 from t_ctx);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
insert into t_r select public.ic_clear_personal_due() = 1, 'the due run clears the one incident whose date has come';
insert into t_r select licence_number = '' and address = '' and date_of_birth is null and full_name = 'People Test', 'now in no open incident, the unit''s licence goes too' from public.ic_profiles where user_id = (select unit from t_ctx);
insert into t_r select personal_cleared_at is not null, 'and the other incident is stamped' from public.ic_incidents where id = (select inc2 from t_ctx);
reset role;

select * from t_r order by ok, what;
rollback;
