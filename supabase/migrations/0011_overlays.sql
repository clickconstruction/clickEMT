-- Custom imagery: a picture Operations uploads (fresh aerial or satellite imagery, a drone
-- mosaic, a scanned plan) laid over the map by its corner coordinates, for every member to see.
-- Removed imagery is archived, never deleted; the file stays in the bucket.

create table if not exists public.ic_overlays (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.ic_incidents(id) on delete cascade,
  name text not null default '',
  storage_path text not null,                 -- object in the ic-overlays bucket: <incident>/<overlay>.<ext>
  bounds jsonb not null,                      -- {south, west, north, east}, degrees
  opacity real not null default 0.8 check (opacity >= 0 and opacity <= 1),
  taken_at timestamptz,                       -- when the imagery was captured, if known
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists ic_overlays_incident on public.ic_overlays(incident_id);

create or replace function public.ic_overlay_before() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then new.created_by := coalesce(new.created_by, auth.uid()); end if;
  return new;
end $$;
drop trigger if exists ic_overlays_before on public.ic_overlays;
create trigger ic_overlays_before before insert or update on public.ic_overlays for each row execute function public.ic_overlay_before();

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
  elsif (new.name, new.bounds) is distinct from (old.name, old.bounds) then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'ops', what || ' updated', 'ic_overlays', new.id::text);
  end if;
  return new;
end $$;
drop trigger if exists ic_overlays_after on public.ic_overlays;
create trigger ic_overlays_after after insert or update on public.ic_overlays for each row execute function public.ic_overlay_after();

alter table public.ic_overlays enable row level security;
drop policy if exists ic_overlays_select on public.ic_overlays;
create policy ic_overlays_select on public.ic_overlays for select to authenticated using (public.ic_is_member(incident_id));
drop policy if exists ic_overlays_insert on public.ic_overlays;
create policy ic_overlays_insert on public.ic_overlays for insert to authenticated with check (public.ic_is_ops(incident_id));
drop policy if exists ic_overlays_update on public.ic_overlays;
create policy ic_overlays_update on public.ic_overlays for update to authenticated using (public.ic_is_ops(incident_id)) with check (public.ic_is_ops(incident_id));
-- no delete policy: imagery is archived

-- the bucket: private, read by members, written by Operations, 50 MB a file
insert into storage.buckets (id, name, public, file_size_limit) values ('ic-overlays', 'ic-overlays', false, 52428800) on conflict (id) do nothing;
drop policy if exists ic_overlays_bucket_read on storage.objects;
create policy ic_overlays_bucket_read on storage.objects for select to authenticated
  using (bucket_id = 'ic-overlays' and public.ic_is_member(public.ic_folder_incident(name)));
drop policy if exists ic_overlays_bucket_write on storage.objects;
create policy ic_overlays_bucket_write on storage.objects for insert to authenticated
  with check (bucket_id = 'ic-overlays' and public.ic_is_ops(public.ic_folder_incident(name)));

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ic_overlays') then
    execute 'alter publication supabase_realtime add table public.ic_overlays';
  end if;
end $$;
