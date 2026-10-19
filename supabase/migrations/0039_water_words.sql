-- The 214's water words as 45m (v79). Since v76 every duration in the app reads "4h 8m", "45m", "12h"
-- (durationText in js/shared/rules.js); the one duration the database writes itself, the 214's
-- "Unit 2 out of the water after 45 min" (0020's ic_member_after), kept the old words. ic_duration_text
-- says what durationText says, so any trigger that writes a duration can use it, and ic_member_after
-- (0020's body, the water line alone changed) writes "out of the water after 45m" / "after 1h 5m" / "after 2h".
-- No table or column changes: the apps may ship before this is applied.

-- a duration in minutes as durationText in rules.js says it: "45m", "1h 5m", "2h"; null or less than 0 is "0m"
create or replace function public.ic_duration_text(p_minutes integer) returns text
language sql immutable as $$
  select case when m < 60 then m || 'm'
              else (m / 60) || 'h' || case when m % 60 > 0 then ' ' || (m % 60) || 'm' else '' end end
  from (select greatest(0, coalesce(p_minutes, 0)) as m) x
$$;

-- 0020's body: in and out of the water are one line each, the minutes through ic_duration_text now; then removal,
-- restore, role, kind and status as in 0019.
create or replace function public.ic_member_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who text := public.ic_unit_label(new.incident_id, new.user_id);
  nm text := (select nullif(p.full_name, '') from public.ic_profiles p where p.user_id = new.user_id);
  loose text := '';
  mins integer;
begin
  if new.in_water_since is distinct from old.in_water_since then
    if new.in_water_since is not null and old.in_water_since is null then
      insert into public.ic_events (incident_id, user_id, kind, text) values (new.incident_id, auth.uid(), 'status', who || ' in the water');
    elsif new.in_water_since is null and old.in_water_since is not null then
      mins := greatest(0, round(extract(epoch from (now() - old.in_water_since)) / 60))::int;
      insert into public.ic_events (incident_id, user_id, kind, text) values (new.incident_id, auth.uid(), 'status', who || ' out of the water after ' || public.ic_duration_text(mins));
    end if;
  end if;
  if new.removed_at is not null and old.removed_at is null then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.incident_id, auth.uid(), 'status', who || case when nm is not null then ' (' || nm || ')' else '' end || ' removed from the incident by Operations');
    update public.ic_zones set assigned_to = null, status = 'open'
      where incident_id = new.incident_id and assigned_to = new.user_id and status = 'active';
    update public.ic_zones set assigned_to = null
      where incident_id = new.incident_id and assigned_to = new.user_id;
    perform set_config('ic.quiet', '1', true);
    update public.ic_people set checked_out_at = now()
      where incident_id = new.incident_id and user_id = new.user_id and archived_at is null and checked_out_at is null;
    perform set_config('ic.quiet', '', true);
    return new;
  elsif new.removed_at is null and old.removed_at is not null then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.incident_id, auth.uid(), 'status', who || case when nm is not null then ' (' || nm || ')' else '' end || ' put back on the incident by Operations');
    return new;
  end if;
  if new.kind is distinct from old.kind and not public.ic_quiet() then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.incident_id, auth.uid(), 'status', who || case when new.kind = '' then ': kind cleared' else ' is a ' || public.ic_kind_text(new.kind) end);
  end if;
  if new.role is distinct from old.role and not public.ic_quiet() then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.incident_id, auth.uid(), 'status',
            case when new.role = 'ops' then coalesce(old.unit_name, 'A unit') || case when nm is not null then ' (' || nm || ')' else '' end || ' is now Operations'
                 else coalesce(nm, 'A member of Operations') || ' is now a unit, ' || coalesce(new.unit_name, 'unnamed') end);
  end if;
  if new.status is distinct from old.status then
    if new.status = 'checked_out' and new.demob is not null then
      select coalesce(string_agg(x, ' · '), '') into loose from jsonb_array_elements_text(coalesce(new.demob -> 'open', '[]'::jsonb)) x;
    end if;
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.incident_id, auth.uid(), 'status',
            case new.status
              when 'available' then who || ' is available' || case when old.status = 'out_of_service' then ', back in service' else '' end
              when 'out_of_service' then who || ' is out of service' || case when new.status_note <> '' then ': ' || new.status_note else '' end
              when 'checked_out' then who || ' checked out'
                || case when loose <> '' then ' · not done: ' || loose else '' end
                || case when new.demob is not null and coalesce(new.demob ->> 'note', '') <> '' then ' · for the next crew: ' || (new.demob ->> 'note') else '' end
              else who || ' is assigned' end);
    if new.status = 'checked_out' then
      update public.ic_zones set assigned_to = null, status = 'open'
        where incident_id = new.incident_id and assigned_to = new.user_id and status = 'active';
      update public.ic_zones set assigned_to = null
        where incident_id = new.incident_id and assigned_to = new.user_id;
      perform set_config('ic.quiet', '1', true);
      update public.ic_people set checked_out_at = now()
        where incident_id = new.incident_id and user_id = new.user_id and archived_at is null and checked_out_at is null;
      perform set_config('ic.quiet', '', true);
    elsif old.status = 'checked_out' and old.checked_out_at is not null then
      perform set_config('ic.quiet', '1', true);
      update public.ic_people set checked_out_at = null
        where incident_id = new.incident_id and user_id = new.user_id and archived_at is null and checked_out_at is not null and checked_out_at >= old.checked_out_at;
      perform set_config('ic.quiet', '', true);
    end if;
  end if;
  return new;
end $$;
