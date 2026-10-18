-- A hazard that says how urgent it is (v41). The four urgency words a message carries (ic_urgency_label) go on a
-- hazard too, and an act-on-now hazard sits on the base's bar until Operations acknowledges it; the log says both.
alter table public.ic_hazards add column if not exists urgency text not null default '' check (urgency in ('', 'now', 'nightfall', 'tomorrow', 'blocking'));
alter table public.ic_hazards add column if not exists acked_at timestamptz;
alter table public.ic_hazards add column if not exists acked_by uuid references auth.users(id);

create or replace function public.ic_log_hazard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, new.user_id, 'hazard',
            'Hazard in ' || public.ic_zone_code(new.zone_id) || case when new.urgency <> '' then ' (' || public.ic_urgency_label(new.urgency) || ')' else '' end
            || ': ' || lower(new.kind) || case when new.note <> '' then ' (' || new.note || ')' else '' end
            || ', reported by ' || public.ic_unit_label(new.incident_id, new.user_id),
            'ic_hazards', new.id::text);
    if new.zone_id is not null then update public.ic_zones set hazard = true where id = new.zone_id and not hazard; end if;
  elsif new.acked_at is not null and old.acked_at is null then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, coalesce(new.acked_by, auth.uid()), 'hazard', 'Hazard acknowledged by ' || public.ic_unit_label(new.incident_id, coalesce(new.acked_by, auth.uid())) || ': ' || lower(new.kind) || ' in ' || public.ic_zone_code(new.zone_id), 'ic_hazards', new.id::text);
  elsif new.resolved_at is not null and old.resolved_at is null then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, auth.uid(), 'hazard', 'Hazard resolved in ' || public.ic_zone_code(new.zone_id) || ': ' || lower(new.kind), 'ic_hazards', new.id::text);
  end if;
  return new;
end $$;
