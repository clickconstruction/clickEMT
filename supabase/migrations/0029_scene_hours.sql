-- On scene too long (v47): a threshold of hours on scene beside the rotation on the Period sheet
-- (ic_periods.scene_hours, 12 unless Safety sets it, 0 for off), carried into the next period like the
-- rotation. Past it a person's time on scene reads orange on the People board and the unit panel, and the
-- shift-change briefing and the situation report name who is past it. The database keeps the number and
-- logs a change; the reading is the views' (sceneOver / peopleOverScene in rules.js). Also from v46's revisit: the
-- phone passes the clock time it typed (revisit_hhmm, its own local time, as ic_transfer_command takes p_at) and the
-- 214 line reads "revisit at 16:00 (on oxygen)"; without the words it stays "revisit requested".
alter table public.ic_periods add column if not exists scene_hours integer not null default 12 check (scene_hours between 0 and 72);

-- a changed threshold is one line of its own, like the rotation's (ic_log_period keeps its list of seats)
create or replace function public.ic_log_period_scene() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.scene_hours is distinct from old.scene_hours and not public.ic_quiet() then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.incident_id, auth.uid(), 'ops', 'Operational period ' || new.number || case when new.scene_hours = 0 then ': on scene too long turned off' else ': on scene too long past ' || new.scene_hours || ' hours' end);
  end if;
  return new;
end $$;
drop trigger if exists ic_periods_scene_log on public.ic_periods;
create trigger ic_periods_scene_log after update of scene_hours on public.ic_periods for each row execute function public.ic_log_period_scene();

-- the next period carries the threshold unless the form says otherwise
drop function if exists public.ic_start_period(uuid, timestamptz, text, text, text, text, boolean, text, text, text, text, text, text, integer, text, text);
create or replace function public.ic_start_period(p_incident uuid, p_ends_at timestamptz default null, p_ic text default '', p_ops text default '', p_safety text default '', p_notes text default '', p_carry boolean default true,
                                                   p_planning text default '', p_logistics text default '', p_finance text default '', p_unified text default '', p_pio text default '', p_liaison text default '', p_rotation integer default null, p_deputy text default '', p_bring text default '', p_scene integer default null)
returns public.ic_periods
language plpgsql security definer set search_path = public as $$
declare
  cur public.ic_periods;
  np public.ic_periods;
  o record;
  n integer := 0;
  newid uuid;
  rot integer;
  sh integer;
begin
  if not public.ic_is_ops(p_incident) then raise exception 'Only Operations starts a period'; end if;
  select * into cur from public.ic_periods where incident_id = p_incident and closed_at is null order by number desc limit 1;
  rot := coalesce(p_rotation, cur.rotation_minutes, (select nullif(i.settings ->> 'rotation_minutes', '')::int from public.ic_incidents i where i.id = p_incident), 45);
  if rot < 0 or rot > 600 then raise exception 'The rotation is 0 (off) to 600 minutes'; end if;
  sh := coalesce(p_scene, cur.scene_hours, 12);
  if sh < 0 or sh > 72 then raise exception 'The hours on scene are 0 (off) to 72'; end if;
  insert into public.ic_periods (incident_id, number, starts_at, ends_at, ic_name, ops_chief, safety_officer, notes, planning_chief, logistics_chief, finance_chief, unified, pio, liaison, rotation_minutes, deputy, bring, scene_hours)
  values (p_incident, coalesce(cur.number, (select coalesce(max(number), 0) from public.ic_periods where incident_id = p_incident)) + 1, now(), p_ends_at,
          coalesce(trim(p_ic), ''), coalesce(trim(p_ops), ''), coalesce(trim(p_safety), ''), coalesce(trim(p_notes), ''),
          coalesce(trim(p_planning), ''), coalesce(trim(p_logistics), ''), coalesce(trim(p_finance), ''), coalesce(trim(p_unified), ''), coalesce(trim(p_pio), ''), coalesce(trim(p_liaison), ''), rot, coalesce(trim(p_deputy), ''), coalesce(trim(p_bring), ''), sh)
  returning * into np;
  if cur.id is not null then
    update public.ic_periods set closed_at = now() where id = cur.id;
    perform set_config('ic.quiet', '1', true);
    insert into public.ic_period_agencies (incident_id, period_id, agency, name, phone)
      select incident_id, np.id, agency, name, phone from public.ic_period_agencies where period_id = cur.id and archived_at is null;
    if p_carry then
      for o in select * from public.ic_objectives where period_id = cur.id and done_at is null order by number loop
        n := n + 1;
        insert into public.ic_objectives (incident_id, period_id, number, text) values (p_incident, np.id, n, o.text) returning id into newid;
        update public.ic_zones set objective_id = newid where objective_id = o.id;
      end loop;
    end if;
    perform set_config('ic.quiet', '', true);
  end if;
  update public.ic_incidents set current_period_id = np.id, period = 'OP ' || np.number where id = p_incident;
  insert into public.ic_events (incident_id, user_id, kind, text)
  values (p_incident, auth.uid(), 'ops', 'Operational period ' || np.number || ' started'
          || case when np.ic_name <> '' then ', Incident Commander ' || np.ic_name else '' end
          || case when np.deputy <> '' then ', Deputy ' || np.deputy else '' end
          || case when n > 0 then ', ' || n || ' objective' || case when n = 1 then '' else 's' end || ' carried over' else '' end);
  return np;
end $$;
grant execute on function public.ic_start_period(uuid, timestamptz, text, text, text, text, boolean, text, text, text, text, text, text, integer, text, text, integer) to authenticated;

-- ---------------------------------------------------------------- the revisit's clock time in the 214 line

alter table public.ic_structures add column if not exists revisit_hhmm text not null default '' check (revisit_hhmm = '' or revisit_hhmm ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

create or replace function public.ic_structure_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n_all integer; n_done integer; z public.ic_zones; what text;
begin
  if new.zone_id is not null then
    select count(*), count(*) filter (where status = 'searched') into n_all, n_done from public.ic_structures where zone_id = new.zone_id;
    update public.ic_zones set cleared = n_done, structures = greatest(structures, n_all) where id = new.zone_id and (cleared <> n_done or structures < n_all);
    select * into z from public.ic_zones where id = new.zone_id;
  end if;
  if new.status = 'searched' and (tg_op = 'INSERT' or old.status <> 'searched')
     and (new.people_needing_help > 0 or new.occupants in ('sheltering', 'refused') or new.damage in ('major', 'destroyed') or new.hazards <> '') then
    what := concat_ws(' · ',
      case when new.people_needing_help > 0 then new.people_needing_help || ' need help' end,
      case new.occupants when 'sheltering' then 'sheltering in place' when 'refused' then 'refused to leave' end,
      nullif(public.ic_water_text(new.water_cm), ''),
      case when new.damage in ('major', 'destroyed') then new.damage || ' damage' end,
      case when new.hazards <> '' then 'hazards ' || new.hazards end);
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'clear', coalesce(z.code, 'Outside the divisions') || ': ' || coalesce(nullif(new.label, ''), 'a structure') || ' · ' || what, 'ic_structures', new.id::text);
  end if;
  if new.revisit_at is not null and (tg_op = 'INSERT' or new.revisit_at is distinct from old.revisit_at) then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'clear', coalesce(z.code, 'Outside the divisions') || ': ' || coalesce(nullif(new.label, ''), 'a structure') || ' · revisit ' || case when new.revisit_hhmm <> '' then 'at ' || new.revisit_hhmm else 'requested' end || case when new.notes <> '' then ' (' || new.notes || ')' else '' end, 'ic_structures', new.id::text);
  end if;
  return new;
end $$;
