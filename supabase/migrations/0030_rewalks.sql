-- Small items from the re-walks (v48). Three of the eight touch the database: a street address on a facility
-- (ic_facilities.address, read by Getting there on the join card and the 204's Where to go before the coordinates,
-- logged like the name and the contact); a revisit already past today means tomorrow, so the clock words the phone
-- sends may start with "tomorrow " and the 214 line reads "revisit tomorrow at 06:00"; and a second stamp for a
-- person's current stretch on scene (ic_people.stint_at, set when a person checked out comes back on), which the
-- People board, the briefing and the hours-on-scene threshold read while the Hours and the 211 keep every stretch
-- from checked_in_at. "They're all found" needs nothing here: ic_mark_found with no name marks every entry still
-- missing and writes one line.

-- ---------------------------------------------------------------- a street address on a facility
alter table public.ic_facilities add column if not exists address text not null default '';

create or replace function public.ic_facility_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare what text := public.ic_facility_kind_text(new.kind) || case when new.name <> '' then ': ' || new.name else '' end;
begin
  if tg_op = 'INSERT' then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', what || ' opened', 'ic_facilities', new.id::text);
    return new;
  end if;
  if new.closed_at is not null and old.closed_at is null then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', what || ' closed', 'ic_facilities', new.id::text);
  elsif new.closed_at is null and old.closed_at is not null then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', what || ' reopened', 'ic_facilities', new.id::text);
  elsif (new.name, new.kind, new.contact, new.address) is distinct from (old.name, old.kind, old.contact, old.address) then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', what || ' updated', 'ic_facilities', new.id::text);
  end if;
  if new.beds is distinct from old.beds then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', what || case when new.beds is null then ' beds not set' else ' has ' || new.beds || case when new.beds = 1 then ' bed' else ' beds' end end, 'ic_facilities', new.id::text);
  end if;
  if new.expected <> old.expected then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', what || ' expecting ' || coalesce(nullif(new.expected, ''), 'nobody now'), 'ic_facilities', new.id::text);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- a revisit already past today means tomorrow
alter table public.ic_structures drop constraint if exists ic_structures_revisit_hhmm_check;
alter table public.ic_structures add constraint ic_structures_revisit_hhmm_check check (revisit_hhmm = '' or revisit_hhmm ~ '^(tomorrow )?([01][0-9]|2[0-3]):[0-5][0-9]$');

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
    values (new.incident_id, auth.uid(), 'clear', coalesce(z.code, 'Outside the divisions') || ': ' || coalesce(nullif(new.label, ''), 'a structure') || ' · '
            || case when new.revisit_hhmm like 'tomorrow %' then 'revisit tomorrow at ' || substr(new.revisit_hhmm, 10) when new.revisit_hhmm <> '' then 'revisit at ' || new.revisit_hhmm else 'revisit requested' end
            || case when new.notes <> '' then ' (' || new.notes || ')' else '' end, 'ic_structures', new.id::text);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- the current stretch on scene
alter table public.ic_people add column if not exists stint_at timestamptz;   -- when the current stretch began, once a person has checked out and come back; null means the check-in

create or replace function public.ic_person_stint() returns trigger language plpgsql as $$
begin
  if new.checked_out_at is null and old.checked_out_at is not null then new.stint_at := now(); end if;
  return new;
end $$;
drop trigger if exists ic_people_stint on public.ic_people;
create trigger ic_people_stint before update of checked_out_at on public.ic_people for each row execute function public.ic_person_stint();
