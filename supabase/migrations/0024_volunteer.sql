-- A volunteer unit kind (v39): someone handed a phone at a check-in table, on their own, is not "Other".
alter table public.ic_members drop constraint if exists ic_members_kind_check;
alter table public.ic_members add constraint ic_members_kind_check
  check (kind in ('', 'engine', 'boat', 'swift_water', 'high_water', 'ambulance', 'search', 'k9', 'drone', 'pump', 'shelter_desk', 'volunteer', 'other'));
create or replace function public.ic_kind_text(p_kind text) returns text language sql immutable as $$
  select case p_kind when 'engine' then 'engine' when 'boat' then 'boat crew' when 'swift_water' then 'swift-water team' when 'high_water' then 'high-water vehicle'
                     when 'ambulance' then 'ambulance' when 'search' then 'search team' when 'k9' then 'K9 team' when 'drone' then 'drone team' when 'pump' then 'pump crew'
                     when 'shelter_desk' then 'shelter desk' when 'volunteer' then 'volunteer' when 'other' then 'other' else '' end;
$$;
