-- The incident's kind as a column (migration 0040, v82): ic_incidents.kind and .starter, their checks and their words,
-- the opening line ic_create_incident writes with them, an objective × removed (archived, never deleted, one line),
-- the carry-over leaving it behind and counting right, and a change of kind saying who. Run against the real database
-- inside one transaction that is rolled back at the end:  python3 dev/sbq.py supabase/tests/incidentkind.sql
-- Every row of the result should say ok: true. One pretend account, the one who opens the incidents (Operations).
begin;
create temp table t_r (ok boolean, what text);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'incidentkind-test-ops@example.invalid', '', now(), now(), now(), '{}', '{}', false, false);
create temp table t_ctx (incident uuid, plain uuid, grp uuid, ops uuid default '00000000-0000-4000-8000-0000000000b1');
insert into t_ctx (incident) values (null);
grant all on t_r, t_ctx to authenticated;
insert into public.ic_profiles (user_id, full_name, phone) values ('00000000-0000-4000-8000-0000000000b1', 'Kind Test Ops', '512 555 0031');

-- the words, as incidentKindText and starterFor(code).from in rules.js say them
insert into t_r select public.ic_incident_kind_text('flood') = 'a flood' and public.ic_incident_kind_text('outbreak') = 'an outbreak' and public.ic_incident_kind_text('swift') = 'a swift water rescue' and public.ic_incident_kind_text('natural') = 'a natural hazard', 'the kind in a sentence: a flood, an outbreak, a swift water rescue, a natural hazard';
insert into t_r select public.ic_incident_kind_text('utility') = 'a utility failure', 'a utility failure takes "a", not "an"';
insert into t_r select public.ic_incident_kind_text('') = '' and public.ic_incident_kind_text(null) = '' and public.ic_incident_kind_text('tsunami') = '', 'no kind, or a code not in the list, reads as nothing';
insert into t_r select public.ic_starter_name('flood') = 'Flood' and public.ic_starter_name('mci') = 'Mass casualty' and public.ic_starter_name('winter') = 'Winter storm' and public.ic_starter_name('natural') = '' and public.ic_starter_name('') = '', 'a starter''s name is its sub-kind''s label; a group has none';

-- as Operations: an incident with its kind and starter, one with neither (the six-argument call every other test makes), one with a group alone
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
update t_ctx set incident = r.id from (select * from public.ic_create_incident('Kind test', null, 'Depot', null, null, 14, 'flood', 'flood')) r;
update t_ctx set plain = r.id from (select * from public.ic_create_incident('Plain test', null, null, null, null, 14)) r;
update t_ctx set grp = r.id from (select * from public.ic_create_incident('Group test', null, null, null, null, 14, 'natural', '')) r;
insert into t_r select kind = 'flood' and starter = 'flood' and not (settings ? 'kind') and not (settings ? 'starter') and not (settings ? 'removed_objectives'), 'the kind and the starter are on the row, nothing of them in the settings' from public.ic_incidents where id = (select incident from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Incident opened: Kind test, a flood, operational period 1 from the Flood starter'), 'the opening line says the kind and the starter';
insert into t_r select kind = '' and starter = '', 'the six-argument call still works and gives no kind' from public.ic_incidents where id = (select plain from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select plain from t_ctx) and text = 'Incident opened: Plain test, operational period 1'), 'with no kind the opening line reads as before';
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select grp from t_ctx) and text = 'Incident opened: Group test, a natural hazard, operational period 1'), 'a group alone names the kind and no starter';
insert into t_r select count(*) = 1, 'one opening line per incident: ' || count(*) from public.ic_events where incident_id = (select incident from t_ctx) and text like 'Incident opened:%';

-- a code not in the list is refused by the check, for the kind and for the starter
do $$
begin
  perform public.ic_create_incident('Bad kind', null, null, null, null, 14, 'tsunami', '');
  insert into t_r values (false, 'a kind not in the list is refused');
exception when check_violation then
  insert into t_r values (true, 'a kind not in the list is refused');
end $$;
do $$
begin
  perform public.ic_create_incident('Bad starter', null, null, null, null, 14, 'natural', 'natural');
  insert into t_r values (false, 'a starter that is not a sub-kind is refused');
exception when check_violation then
  insert into t_r values (true, 'a starter that is not a sub-kind is refused');
end $$;

-- × on an objective: archived, still there, one line; the carry-over leaves it behind and counts the rest
insert into public.ic_objectives (incident_id, period_id, number, text)
  select incident, current_period_id, 1, 'Nobody gets hurt, crews or residents' from t_ctx join public.ic_incidents i on i.id = t_ctx.incident;
insert into public.ic_objectives (incident_id, period_id, number, text)
  select incident, current_period_id, 2, 'Keep it from getting worse' from t_ctx join public.ic_incidents i on i.id = t_ctx.incident;
insert into public.ic_objectives (incident_id, period_id, number, text)
  select incident, current_period_id, 3, 'Shelter open and staffed before dark' from t_ctx join public.ic_incidents i on i.id = t_ctx.incident;
update public.ic_objectives set archived_at = now() where incident_id = (select incident from t_ctx) and number = 2;
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Objective 2 removed: Keep it from getting worse'), 'archiving an objective writes "Objective 2 removed: …"';
insert into t_r select count(*) = 3 and count(*) filter (where archived_at is not null) = 1, 'the row stays: three objectives on period 1, one archived' from public.ic_objectives where incident_id = (select incident from t_ctx);
insert into t_r select count(*) = 1, 'the archived line is written once, not again on the same row: ' || count(*) from public.ic_events where incident_id = (select incident from t_ctx) and text like 'Objective 2 removed:%';
select public.ic_start_period((select incident from t_ctx));
insert into t_r select count(*) = 2 and string_agg(text, ' | ' order by number) = 'Nobody gets hurt, crews or residents | Shelter open and staffed before dark' and string_agg(number::text, '' order by number) = '12',
  'period 2 carries the two open objectives, numbered 1 and 2, and not the archived one'
  from public.ic_objectives o where o.incident_id = (select incident from t_ctx) and o.period_id = (select current_period_id from public.ic_incidents where id = (select incident from t_ctx));
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Operational period 2 started, 2 objectives carried over'), 'the period''s line counts the two that came, not three';

-- the kind changes in Incident settings: the database says who; the starter stays
update public.ic_incidents set kind = 'wildfire' where id = (select incident from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Kind Test Ops set the kind to a wildfire'), 'a change of kind is one line naming who';
insert into t_r select kind = 'wildfire' and starter = 'flood', 'the kind changed, the starter period 1 came from stays' from public.ic_incidents where id = (select incident from t_ctx);
update public.ic_incidents set kind = '' where id = (select incident from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Kind Test Ops cleared the kind'), 'clearing it is one line too';
do $$
begin
  update public.ic_incidents set kind = 'tsunami' where id = (select incident from t_ctx);
  insert into t_r values (false, 'a change to a code not in the list is refused');
exception when check_violation then
  insert into t_r values (true, 'a change to a code not in the list is refused');
end $$;
-- the settings still log as before: 0028's body was kept
update public.ic_incidents set settings = settings || '{"eoc_email": "eoc@example.invalid"}'::jsonb where id = (select incident from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Kind Test Ops set the EOC email address to eoc@example.invalid'), 'the EOC email line of 0028 still comes: the newest body was kept';
reset role;

select * from t_r order by ok, what;
rollback;
