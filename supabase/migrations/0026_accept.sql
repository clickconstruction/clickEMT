-- Assigned before In progress (v42). A unit accepts its assignment from the phone (ic_members.accepted_zone_id,
-- its own row); until it has accepted or sent a report from the division, the base reads "Assigned, not
-- accepted". The acceptance is a line in the 214.
alter table public.ic_members add column if not exists accepted_zone_id uuid references public.ic_zones(id) on delete set null;

create or replace function public.ic_member_accept() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.accepted_zone_id is not null then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, new.user_id, 'status', public.ic_unit_label(new.incident_id, new.user_id) || ' accepted the assignment to ' || public.ic_zone_code(new.accepted_zone_id), 'ic_zones', new.accepted_zone_id::text);
  end if;
  return new;
end $$;
drop trigger if exists ic_members_accept on public.ic_members;
create trigger ic_members_accept after update on public.ic_members for each row when (new.accepted_zone_id is distinct from old.accepted_zone_id) execute function public.ic_member_accept();
