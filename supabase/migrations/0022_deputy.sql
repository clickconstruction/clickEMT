-- A Deputy seat on the period (v31). ICS-100's other remedy for a span of control past seven is a
-- deputy; the 207's warning suggested one, but the period had no seat for it. The deputy sits beside
-- the Incident Commander on the period sheet, is carried into the next period like the other seats
-- (the start form carries it), prints on the 203 and is drawn on the 207, whose warning points at the
-- seat. Decided by Grace, 17 October 2026 (docs/punchlist.md, item 6).

alter table public.ic_periods add column if not exists deputy text not null default '';   -- the Deputy Incident Commander

create or replace function public.ic_log_period() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.ic_quiet() then return new; end if;
  if tg_op = 'UPDATE' and new.closed_at is null and (new.ic_name, new.ops_chief, new.safety_officer, new.ends_at, new.unified, new.planning_chief, new.logistics_chief, new.finance_chief, new.pio, new.liaison, new.deputy)
     is distinct from (old.ic_name, old.ops_chief, old.safety_officer, old.ends_at, old.unified, old.planning_chief, old.logistics_chief, old.finance_chief, old.pio, old.liaison, old.deputy) then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.incident_id, auth.uid(), 'ops', 'Operational period ' || new.number || ' updated'
            || case when new.ic_name <> old.ic_name then ', Incident Commander ' || coalesce(nullif(new.ic_name, ''), 'not set') else '' end
            || case when new.deputy <> old.deputy then ', Deputy ' || coalesce(nullif(new.deputy, ''), 'not set') else '' end
            || case when new.ops_chief <> old.ops_chief then ', Operations ' || coalesce(nullif(new.ops_chief, ''), 'not set') else '' end
            || case when new.planning_chief <> old.planning_chief then ', Planning ' || coalesce(nullif(new.planning_chief, ''), 'not set') else '' end
            || case when new.logistics_chief <> old.logistics_chief then ', Logistics ' || coalesce(nullif(new.logistics_chief, ''), 'not set') else '' end
            || case when new.finance_chief <> old.finance_chief then ', Finance ' || coalesce(nullif(new.finance_chief, ''), 'not set') else '' end
            || case when new.safety_officer <> old.safety_officer then ', Safety ' || coalesce(nullif(new.safety_officer, ''), 'not set') else '' end
            || case when new.pio <> old.pio then ', PIO ' || coalesce(nullif(new.pio, ''), 'not set') else '' end
            || case when new.liaison <> old.liaison then ', Liaison ' || coalesce(nullif(new.liaison, ''), 'not set') else '' end
            || case when new.unified <> old.unified then ', unified command ' || coalesce(nullif(new.unified, ''), 'cleared') else '' end);
  end if;
  if tg_op = 'UPDATE' and new.sitrep is distinct from old.sitrep then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.incident_id, auth.uid(), 'ops', 'Situation report updated for operational period ' || new.number);
  end if;
  return new;
end $$;

-- the next period takes the deputy the form carries, like the other seats
drop function if exists public.ic_start_period(uuid, timestamptz, text, text, text, text, boolean, text, text, text, text, text, text, integer);
create or replace function public.ic_start_period(p_incident uuid, p_ends_at timestamptz default null, p_ic text default '', p_ops text default '', p_safety text default '', p_notes text default '', p_carry boolean default true,
                                                   p_planning text default '', p_logistics text default '', p_finance text default '', p_unified text default '', p_pio text default '', p_liaison text default '', p_rotation integer default null, p_deputy text default '')
returns public.ic_periods
language plpgsql security definer set search_path = public as $$
declare
  cur public.ic_periods;
  np public.ic_periods;
  o record;
  n integer := 0;
  newid uuid;
  rot integer;
begin
  if not public.ic_is_ops(p_incident) then raise exception 'Only Operations starts a period'; end if;
  select * into cur from public.ic_periods where incident_id = p_incident and closed_at is null order by number desc limit 1;
  rot := coalesce(p_rotation, cur.rotation_minutes, (select nullif(i.settings ->> 'rotation_minutes', '')::int from public.ic_incidents i where i.id = p_incident), 45);
  if rot < 0 or rot > 600 then raise exception 'The rotation is 0 (off) to 600 minutes'; end if;
  insert into public.ic_periods (incident_id, number, starts_at, ends_at, ic_name, ops_chief, safety_officer, notes, planning_chief, logistics_chief, finance_chief, unified, pio, liaison, rotation_minutes, deputy)
  values (p_incident, coalesce(cur.number, (select coalesce(max(number), 0) from public.ic_periods where incident_id = p_incident)) + 1, now(), p_ends_at,
          coalesce(trim(p_ic), ''), coalesce(trim(p_ops), ''), coalesce(trim(p_safety), ''), coalesce(trim(p_notes), ''),
          coalesce(trim(p_planning), ''), coalesce(trim(p_logistics), ''), coalesce(trim(p_finance), ''), coalesce(trim(p_unified), ''), coalesce(trim(p_pio), ''), coalesce(trim(p_liaison), ''), rot, coalesce(trim(p_deputy), ''))
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
grant execute on function public.ic_start_period(uuid, timestamptz, text, text, text, text, boolean, text, text, text, text, text, text, integer, text) to authenticated;
