-- Notable lines in the activity log (ICS 214): Operations marks the entries that matter (a rescue,
-- a decision, a hazard found) so the printed 214 can lead with them. The mark is the only thing on
-- a log line that may change after the trigger wrote it; a line is never deleted.

alter table public.ic_events add column if not exists notable boolean not null default false;

-- Only the mark may change: the rest of a line is what the database wrote.
create or replace function public.ic_event_before_update() returns trigger language plpgsql as $$
begin
  if (new.incident_id, new.user_id, new.kind, new.text, new.ref_table, new.ref_id, new.at)
     is distinct from (old.incident_id, old.user_id, old.kind, old.text, old.ref_table, old.ref_id, old.at) then
    raise exception 'a log line is never changed, only marked notable';
  end if;
  return new;
end $$;
drop trigger if exists ic_events_before_update on public.ic_events;
create trigger ic_events_before_update before update on public.ic_events for each row execute function public.ic_event_before_update();

-- Operations alone marks a line; members keep reading, and only notes are inserted by hand (0001).
drop policy if exists ic_events_update on public.ic_events;
create policy ic_events_update on public.ic_events for update to authenticated using (public.ic_is_ops(incident_id)) with check (public.ic_is_ops(incident_id));
-- no delete policy: the log is kept whole
