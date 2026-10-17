-- The rules for ICS-100 (migration 0016), run against the real database inside one transaction that
-- is rolled back at the end, so nothing is left behind:
--   python3 dev/sbq.py supabase/tests/ics100.sql
-- Every row of the result should say ok: true. Two pretend accounts stand in for Operations and a
-- unit (gone with the rollback); the policies are exercised as the authenticated role with the
-- account's id in request.jwt.claims, the way PostgREST runs a request.
begin;
create temp table t_r (ok boolean, what text);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ics100-test-ops@example.invalid', '', now(), now(), now(), '{}', '{}', false, false),
       ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ics100-test-unit@example.invalid', '', now(), now(), now(), '{}', '{}', false, false);
create temp table t_ctx (incident uuid, code text, period uuid, ops uuid default '00000000-0000-4000-8000-0000000000b1', unit uuid default '00000000-0000-4000-8000-0000000000b2');
insert into t_ctx (incident) values (null);
grant all on t_r, t_ctx to authenticated;
insert into public.ic_profiles (user_id, full_name, phone, licence_number, licence_state, id_source) values ('00000000-0000-4000-8000-0000000000b2', 'Test Unit', '512 555 0000', 'T1', 'TX', 'typed');

-- as Operations: open the incident, seat the command staff
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
update t_ctx set incident = r.id, code = r.code, period = r.current_period_id from (select * from public.ic_create_incident('ICS-100 rule test', null, 'Depot', null, null, 14)) r;
update public.ic_periods set ic_name = 'Dana Ruiz', ops_chief = 'Marcus Bell', pio = 'Lena Marsh', liaison = 'Tomas Herrera' where id = (select period from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Operational period 1 updated, Incident Commander Dana Ruiz, Operations Marcus Bell, PIO Lena Marsh, Liaison Tomas Herrera'), 'the period''s log line names the PIO and the Liaison';
insert into t_r select count(*) = 1 and bool_and(ic_name = 'Dana Ruiz' and from_name = '' and ended_at is null and period_id = (select period from t_ctx)), 'the first Incident Commander named establishes command: one open row, nobody handed over: ' || count(*) from public.ic_commands where incident_id = (select incident from t_ctx);
update public.ic_periods set ic_name = 'Dana Ruiz-Ortega' where id = (select period from t_ctx);
insert into t_r select count(*) = 1 and bool_and(ic_name = 'Dana Ruiz-Ortega'), 'a changed name on a plain save corrects the open row in place (a typo), no handover: ' || string_agg(ic_name, ', ') from public.ic_commands where incident_id = (select incident from t_ctx);
insert into t_r select not exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text like 'Command transferred%'), 'and no transfer line is written for it';

-- the agency representatives
insert into public.ic_period_agencies (incident_id, period_id, agency, name, phone) values ((select incident from t_ctx), (select period from t_ctx), '  Travis County Rescue ', 'Sam Whitaker', '512 555 0150');
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Travis County Rescue representative: Sam Whitaker, 512 555 0150'), 'an agency representative is logged, the agency trimmed';
do $$ begin
  insert into public.ic_period_agencies (incident_id, period_id, agency, name) values ((select incident from t_ctx), (select period from t_ctx), 'Travis County Rescue', 'Someone Else');
  insert into t_r values (false, 'a second row for the same agency in a period was accepted');
exception when others then insert into t_r values (sqlstate = '23505', 'one row per agency per period: ' || sqlstate); end $$;
do $$ begin
  insert into public.ic_period_agencies (incident_id, period_id, agency, name) values ((select incident from t_ctx), (select period from t_ctx), '  ', 'Nobody');
  insert into t_r values (false, 'a representative with no agency was accepted');
exception when others then insert into t_r values (sqlerrm like '%name the agency%', 'the agency is named: ' || sqlerrm); end $$;

-- a unit checks in with its kind
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
select public.ic_join((select code from t_ctx), 'unit', 'Unit T', null, null, 'Test Rescue', null, 'boat');
insert into t_r select kind = 'boat', 'check-in takes the unit''s kind: ' || kind from public.ic_members where incident_id = (select incident from t_ctx) and user_id = (select unit from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Unit T, boat crew checked in as Test Unit, 512 555 0000, licence typed'), 'the check-in line says what the unit is';
insert into t_r select not exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Unit T is a boat crew'), 'without a kind line of its own';
select public.ic_join((select code from t_ctx), 'unit', 'Unit T', null, null, null, null, null);
insert into t_r select kind = 'boat', 'a check-in with no kind keeps the one on record: ' || kind from public.ic_members where incident_id = (select incident from t_ctx) and user_id = (select unit from t_ctx);
update public.ic_members set kind = 'swift_water' where incident_id = (select incident from t_ctx) and user_id = (select unit from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Unit T is a swift-water team'), 'a changed kind is logged in words';
do $$ begin
  update public.ic_members set kind = 'tank' where incident_id = (select incident from t_ctx) and user_id = (select unit from t_ctx);
  insert into t_r values (false, 'a kind off the list was accepted');
exception when others then insert into t_r values (sqlstate = '23514', 'the kind comes from the list: ' || sqlstate); end $$;
-- a unit cannot transfer command, nor write the command or representative rows
do $$ begin
  perform public.ic_transfer_command((select incident from t_ctx), 'Intruder', false, '');
  insert into t_r values (false, 'a unit transferred command');
exception when others then insert into t_r values (sqlerrm like 'Only Operations%', 'a unit cannot transfer command: ' || sqlerrm); end $$;
do $$ begin
  insert into public.ic_commands (incident_id, ic_name) values ((select incident from t_ctx), 'Intruder');
  insert into t_r values (false, 'a unit wrote a command row');
exception when others then insert into t_r values (sqlstate = '42501', 'nobody writes ic_commands by hand: ' || sqlstate); end $$;
do $$ begin
  insert into public.ic_period_agencies (incident_id, period_id, agency, name) values ((select incident from t_ctx), (select period from t_ctx), 'Intruders', 'X');
  insert into t_r values (false, 'a unit wrote an agency representative');
exception when others then insert into t_r values (sqlstate = '42501', 'only Operations keeps the agency representatives: ' || sqlstate); end $$;
insert into t_r select count(*) = 1, 'a unit reads who holds command: ' || count(*) from public.ic_commands where incident_id = (select incident from t_ctx);
reset role;

-- as Operations: transfer command, telling everyone
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
select public.ic_transfer_command((select incident from t_ctx), ' Marcus Bell ', true, '14:20', 'Jo Castillo');
insert into t_r select count(*) = 2 and count(*) filter (where ended_at is not null and ic_name = 'Dana Ruiz-Ortega') = 1 and count(*) filter (where ended_at is null and ic_name = 'Marcus Bell' and from_name = 'Dana Ruiz-Ortega' and ops_chief = 'Jo Castillo' and transferred_by = (select ops from t_ctx)) = 1,
  'the transfer closes the old row and opens the new one with who handed over and the Operations chief: ' || string_agg(ic_name || case when ended_at is null then ' (open)' else '' end, ', ' order by started_at) from public.ic_commands where incident_id = (select incident from t_ctx);
insert into t_r select ic_name = 'Marcus Bell' and ops_chief = 'Jo Castillo', 'the period''s seats follow: ' || ic_name || ' / ' || ops_chief from public.ic_periods where id = (select period from t_ctx);
insert into t_r select exists (select 1 from public.ic_events e where e.incident_id = (select incident from t_ctx) and e.text = 'Command transferred from Dana Ruiz-Ortega to Marcus Bell · Operations Section Chief Jo Castillo' and e.notable and e.ref_table = 'ic_commands'), 'the log line is notable and points at the command row';
insert into t_r select not exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text like 'Operational period 1 updated, Incident Commander Marcus Bell%'), 'the quiet seat change writes no period-updated line';
insert into t_r select count(*) = 1 and bool_and(kind = 'safety' and to_label = 'everyone' and to_users = array[(select unit from t_ctx)] and text = 'Command transferred to Marcus Bell at 14:20. Operations Section Chief is Jo Castillo. Your assignment, your division and your channel do not change.'),
  'every unit on the incident gets the safety-style message with the words of ic_transfer_text: ' || count(*) from public.ic_messages where incident_id = (select incident from t_ctx);
do $$ begin
  perform public.ic_transfer_command((select incident from t_ctx), 'Marcus Bell', false, '');
  insert into t_r values (false, 'a transfer to the holder was accepted');
exception when others then insert into t_r values (sqlerrm like '%already holds command%', 'a transfer to whoever holds command already is refused: ' || sqlerrm); end $$;
do $$ begin
  perform public.ic_transfer_command((select incident from t_ctx), '  ', false, '');
  insert into t_r values (false, 'a transfer to nobody was accepted');
exception when others then insert into t_r values (sqlerrm like '%name the incoming%', 'the incoming IC is named: ' || sqlerrm); end $$;
select public.ic_transfer_command((select incident from t_ctx), 'Priya Natarajan', false, '');
insert into t_r select count(*) = 1, 'p_notify false sends no message: ' || count(*) from public.ic_messages where incident_id = (select incident from t_ctx);
insert into t_r select count(*) = 3 and count(*) filter (where ended_at is null) = 1, 'three holders, one open: ' || count(*) from public.ic_commands where incident_id = (select incident from t_ctx);

-- the next period carries the new seats and the representatives; a branch on a division is logged
select public.ic_start_period((select incident from t_ctx), null, 'Priya Natarajan', 'Jo Castillo', '', '', true, '', '', '', '', 'Lena Marsh', 'Tomas Herrera');
insert into t_r select pio = 'Lena Marsh' and liaison = 'Tomas Herrera', 'period 2 seats the PIO and the Liaison: ' || pio || ' / ' || liaison from public.ic_periods where incident_id = (select incident from t_ctx) and number = 2;
insert into t_r select count(*) = 1 and bool_and(name = 'Sam Whitaker' and phone = '512 555 0150'), 'the agency representatives come over to period 2: ' || count(*) from public.ic_period_agencies a join public.ic_periods p on p.id = a.period_id where p.incident_id = (select incident from t_ctx) and p.number = 2;
insert into t_r select count(*) = 1, 'quietly, with no representative line of its own for period 2: ' || count(*) from public.ic_events where incident_id = (select incident from t_ctx) and text like 'Travis County Rescue representative%';
insert into t_r select count(*) = 3 and count(*) filter (where ended_at is null and ic_name = 'Priya Natarajan') = 1, 'a period that starts with the same IC adds no command row: ' || count(*) from public.ic_commands where incident_id = (select incident from t_ctx);
insert into public.ic_zones (incident_id, code, polygon) values ((select incident from t_ctx), 'A-1', '{"type":"Polygon","coordinates":[[[-97.74,30.26],[-97.73,30.26],[-97.73,30.27],[-97.74,30.26]]]}'::jsonb);
update public.ic_zones set branch = 'North' where incident_id = (select incident from t_ctx) and code = 'A-1';
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'A-1 assignment updated, branch North'), 'a branch on a division is logged';
insert into public.ic_facilities (incident_id, kind, name, lat, lng) values ((select incident from t_ctx), 'camp', 'Fairgrounds camp', 30.26, -97.74), ((select incident from t_ctx), 'helibase', 'Airfield', 30.26, -97.74);
insert into t_r select count(*) = 2, 'Camp and Helibase are facility kinds, logged by name: ' || count(*) from public.ic_events where incident_id = (select incident from t_ctx) and text in ('Camp: Fairgrounds camp opened', 'Helibase: Airfield opened');
delete from public.ic_commands where incident_id = (select incident from t_ctx);
delete from public.ic_period_agencies where incident_id = (select incident from t_ctx);
insert into t_r select (select count(*) from public.ic_commands where incident_id = (select incident from t_ctx)) = 3 and (select count(*) from public.ic_period_agencies where incident_id = (select incident from t_ctx)) = 2, 'nothing is deleted';
reset role;

select * from t_r order by ok, what;
rollback;
