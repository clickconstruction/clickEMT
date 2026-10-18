-- A picture placed by its corners (v63). ic_overlays.corners is the picture's four corners as [[lat, lng] × 4]:
-- top-left, top-right, bottom-right, bottom-left, so a photo shot from an aircraft lies where it belongs; null is a
-- picture that fills its bounds, as before. When corners are given, bounds is written as their box here, so every
-- reader of bounds (the rows on the base, the phone's mini map, the mock) stays right. The words are
-- cornersOk / cornersBox in js/shared/rules.js, which say the same.

alter table public.ic_overlays add column if not exists corners jsonb;

-- four [lat, lng] pairs, in range, with a box of some size
create or replace function public.ic_corners_ok(c jsonb) returns boolean language sql immutable as $$
  select c is not null and jsonb_typeof(c) = 'array' and jsonb_array_length(c) = 4
    and (select bool_and(jsonb_typeof(p) = 'array' and jsonb_array_length(p) = 2 and jsonb_typeof(p->0) = 'number' and jsonb_typeof(p->1) = 'number'
                         and (p->>0)::numeric between -90 and 90 and (p->>1)::numeric between -180 and 180)
           and max((p->>0)::numeric) > min((p->>0)::numeric) and max((p->>1)::numeric) > min((p->>1)::numeric)
         from jsonb_array_elements(c) p)
$$;

create or replace function public.ic_overlay_before() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then new.created_by := coalesce(new.created_by, auth.uid()); end if;
  if new.corners is not null then
    if not public.ic_corners_ok(new.corners) then raise exception 'corners must be four [lat, lng] pairs'; end if;
    select jsonb_build_object('south', min((p->>0)::numeric), 'north', max((p->>0)::numeric), 'west', min((p->>1)::numeric), 'east', max((p->>1)::numeric))
      into new.bounds from jsonb_array_elements(new.corners) p;
  end if;
  return new;
end $$;
drop trigger if exists ic_overlays_before on public.ic_overlays;
create trigger ic_overlays_before before insert or update on public.ic_overlays for each row execute function public.ic_overlay_before();

-- 0011's body, with the corners counted as a change
create or replace function public.ic_overlay_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare what text := 'Imagery' || case when new.name <> '' then ': ' || new.name else '' end;
begin
  if tg_op = 'INSERT' then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', what || ' added to the map', 'ic_overlays', new.id::text);
  elsif new.archived_at is not null and old.archived_at is null then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', what || ' removed from the map', 'ic_overlays', new.id::text);
  elsif new.archived_at is null and old.archived_at is not null then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', what || ' put back on the map', 'ic_overlays', new.id::text);
  elsif (new.name, new.bounds, new.corners) is distinct from (old.name, old.bounds, old.corners) then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', what || ' updated', 'ic_overlays', new.id::text);
  end if;
  return new;
end $$;
drop trigger if exists ic_overlays_after on public.ic_overlays;
create trigger ic_overlays_after after insert or update on public.ic_overlays for each row execute function public.ic_overlay_after();
