-- Mutual aid, public information and replay. The incident names its lead agency and a period
-- can name a unified command; a photo can be cleared for public information; every position a
-- unit reports is kept in ic_tracks so the base can replay the day.

alter table public.ic_incidents add column if not exists lead_agency text not null default '';
alter table public.ic_periods add column if not exists unified text not null default '';   -- the other Incident Commanders and their agencies
alter table public.ic_photos add column if not exists public_ok boolean not null default false;

-- ---------------------------------------------------------------- public information

create or replace function public.ic_log_photo_public() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.public_ok is distinct from old.public_ok then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops',
            'Photo from ' || public.ic_unit_label(new.incident_id, new.user_id) || case when new.public_ok then ' cleared for public information' else ' withdrawn from public information' end,
            'ic_photos', new.id::text);
  end if;
  return new;
end $$;
drop trigger if exists ic_photos_public on public.ic_photos;
create trigger ic_photos_public after update on public.ic_photos for each row execute function public.ic_log_photo_public();

drop policy if exists ic_photos_update on public.ic_photos;
create policy ic_photos_update on public.ic_photos for update to authenticated using (public.ic_is_ops(incident_id)) with check (public.ic_is_ops(incident_id));

-- ---------------------------------------------------------------- the lead agency and unified command are logged

create or replace function public.ic_log_incident() returns trigger
language plpgsql security definer set search_path = public as $$
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
    insert into public.ic_events (incident_id, user_id, kind, text) values (new.id, auth.uid(), 'ops', 'Incident closed');
  end if;
  return new;
end $$;

create or replace function public.ic_log_period() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.closed_at is null and (new.ic_name, new.ops_chief, new.safety_officer, new.ends_at, new.unified) is distinct from (old.ic_name, old.ops_chief, old.safety_officer, old.ends_at, old.unified) then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.incident_id, auth.uid(), 'ops', 'Operational period ' || new.number || ' updated'
            || case when new.ic_name <> old.ic_name then ', Incident Commander ' || coalesce(nullif(new.ic_name, ''), 'not set') else '' end
            || case when new.ops_chief <> old.ops_chief then ', Operations ' || coalesce(nullif(new.ops_chief, ''), 'not set') else '' end
            || case when new.safety_officer <> old.safety_officer then ', Safety ' || coalesce(nullif(new.safety_officer, ''), 'not set') else '' end
            || case when new.unified <> old.unified then ', unified command ' || coalesce(nullif(new.unified, ''), 'cleared') else '' end);
  end if;
  if tg_op = 'UPDATE' and new.sitrep is distinct from old.sitrep then
    insert into public.ic_events (incident_id, user_id, kind, text)
    values (new.incident_id, auth.uid(), 'ops', 'Situation report updated for operational period ' || new.number);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- the position history, for replay

create table if not exists public.ic_tracks (
  id bigint generated always as identity primary key,
  incident_id uuid not null references public.ic_incidents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  heading double precision,
  at timestamptz not null default now()
);
create index if not exists ic_tracks_incident_at on public.ic_tracks(incident_id, at);

create or replace function public.ic_track_position() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or (new.lat, new.lng) is distinct from (old.lat, old.lng) or new.at - old.at > interval '60 seconds' then
    insert into public.ic_tracks (incident_id, user_id, lat, lng, heading, at) values (new.incident_id, new.user_id, new.lat, new.lng, new.heading, new.at);
  end if;
  return new;
end $$;
drop trigger if exists ic_positions_track on public.ic_positions;
create trigger ic_positions_track after insert or update on public.ic_positions for each row execute function public.ic_track_position();

alter table public.ic_tracks enable row level security;
drop policy if exists ic_tracks_select on public.ic_tracks;
create policy ic_tracks_select on public.ic_tracks for select to authenticated using (public.ic_is_member(incident_id));
-- no insert policy: tracks are written by the trigger alone

-- The replay: one sample per unit per p_every seconds between two moments, the last position in
-- each slice, so a day of positions comes back in one read. Membership is checked by the policy.
create or replace function public.ic_replay(p_incident uuid, p_from timestamptz, p_to timestamptz, p_every integer default 60)
returns table (user_id uuid, lat double precision, lng double precision, heading double precision, at timestamptz)
language sql stable
set search_path = public as $$
  select distinct on (t.user_id, floor(extract(epoch from t.at) / greatest(coalesce(p_every, 60), 1)))
         t.user_id, t.lat, t.lng, t.heading, t.at
  from public.ic_tracks t
  where t.incident_id = p_incident and t.at >= p_from and t.at <= p_to
  order by t.user_id, floor(extract(epoch from t.at) / greatest(coalesce(p_every, 60), 1)), t.at desc
$$;
grant execute on function public.ic_replay(uuid, timestamptz, timestamptz, integer) to authenticated;
