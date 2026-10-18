-- Grace's decisions (v46): a revisit time on the house record (shown on the division's structure list and the
-- next crew's 204; no push alerts), and an EOC email address in the incident's settings (Send by email is one tap);
-- both logged. The phone's "My part is done" is a plain message and needs nothing here.
alter table public.ic_structures add column if not exists revisit_at timestamptz;   -- when the next crew should go back

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
    values (new.incident_id, auth.uid(), 'clear', coalesce(z.code, 'Outside the divisions') || ': ' || coalesce(nullif(new.label, ''), 'a structure') || ' · revisit requested' || case when new.notes <> '' then ' (' || new.notes || ')' else '' end, 'ic_structures', new.id::text);
  end if;
  return new;
end $$;

create or replace function public.ic_log_incident() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text := public.ic_actor_name(new.id);
begin
  if new.boundary is distinct from old.boundary then
    insert into public.ic_events (incident_id, user_id, kind, text) values (new.id, auth.uid(), 'ops', 'Incident boundary redrawn');
  end if;
  if new.channels is distinct from old.channels then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.id, auth.uid(), 'ops', 'Communications plan updated: ' || coalesce((select string_agg(coalesce(c ->> 'use', '') || ' ' || coalesce(c ->> 'channel', ''), ', ') from jsonb_array_elements(new.channels) c), 'no channels'));
  end if;
  if new.lead_agency is distinct from old.lead_agency then
    insert into public.ic_events (incident_id, user_id, kind, text) values (new.id, auth.uid(), 'ops', 'Lead agency: ' || coalesce(nullif(new.lead_agency, ''), 'not set'));
  end if;
  if new.status = 'closed' and old.status <> 'closed' then
    insert into public.ic_events (incident_id, user_id, kind, text) values (new.id, auth.uid(), 'ops', 'Incident closed'
      || case when new.clear_personal_at is not null then ' · personal records clear by rule in ' || greatest(1, round(extract(epoch from (new.clear_personal_at - now())) / 86400))::int || ' days' else '' end);
  elsif new.status = 'active' and old.status = 'closed' then
    insert into public.ic_events (incident_id, user_id, kind, text) values (new.id, auth.uid(), 'ops', 'Incident reopened');
  end if;
  -- the settings: what changed, never the key itself
  if coalesce(new.settings ->> 'maps_key', '') is distinct from coalesce(old.settings ->> 'maps_key', '') then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.id, auth.uid(), 'ops', who || case when coalesce(new.settings ->> 'maps_key', '') = '' then ' cleared the Google Maps key' else ' set the Google Maps key' end);
  end if;
  if coalesce(new.settings ->> 'retention_days', '') is distinct from coalesce(old.settings ->> 'retention_days', '') then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.id, auth.uid(), 'ops', who || ' set personal records to clear ' || coalesce(nullif(new.settings ->> 'retention_days', ''), '30') || ' days after the close');
  end if;
  if coalesce(new.settings ->> 'rotation_minutes', '') is distinct from coalesce(old.settings ->> 'rotation_minutes', '') then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.id, auth.uid(), 'ops', who || ' set the default rotation to ' || coalesce(nullif(new.settings ->> 'rotation_minutes', ''), '45') || ' minutes in the water');
  end if;
  if coalesce(new.settings ->> 'eoc_email', '') is distinct from coalesce(old.settings ->> 'eoc_email', '') then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.id, auth.uid(), 'ops', who || case when coalesce(new.settings ->> 'eoc_email', '') = '' then ' cleared the EOC email address' else ' set the EOC email address to ' || (new.settings ->> 'eoc_email') end);
  end if;
  return new;
end $$;
