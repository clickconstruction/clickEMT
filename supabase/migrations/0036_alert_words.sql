-- What's wrong, what you need on an emergency alert (v68): two rows of chips on the phone's Need help now and Alert
-- sent sheets, optional, multi-select, kept as codes on the alert (the lists are ALERT_WRONG / ALERT_NEEDS in
-- js/shared/rules.js; the checks here must match them, and ic_alert_text must say what alertWords says). The words
-- ride on the alert's 214 line and the base's bar; a tap after the send updates the open alert and writes its own
-- line, "Unit 2 adds: in the water · needs boat" / "Unit 2 takes back: rope". The note stays what v29 made it, the
-- PAR's "Missing: Okafor", read after the chips. A bare press writes the line it wrote before, word for word.
-- Apply with: python3 dev/sbq.py supabase/migrations/0036_alert_words.sql

alter table public.ic_alerts add column if not exists wrong text[] not null default '{}';
alter table public.ic_alerts add column if not exists needs text[] not null default '{}';
alter table public.ic_alerts drop constraint if exists ic_alerts_wrong_check;
alter table public.ic_alerts add constraint ic_alerts_wrong_check
  check (wrong <@ array['in_water', 'trapped', 'injured', 'cut_off', 'unsafe_structure', 'missing']::text[]);
alter table public.ic_alerts drop constraint if exists ic_alerts_needs_check;
alter table public.ic_alerts add constraint ic_alerts_needs_check
  check (needs <@ array['boat', 'medic', 'rope', 'hands']::text[]);

-- the labels of the codes given, in the list's order (alertWords in rules.js reads them the same way)
create or replace function public.ic_alert_labels(p_codes text[], p_kind text) returns text[] language plpgsql immutable as $$
declare a text[];
begin
  if p_kind = 'wrong' then
    select coalesce(array_agg(w order by o), '{}') into a
      from unnest(array['in_water', 'trapped', 'injured', 'cut_off', 'unsafe_structure', 'missing'],
                  array['in the water', 'trapped', 'injured', 'cut off', 'unsafe structure', 'someone missing']) with ordinality t(x, w, o)
      where x = any(coalesce(p_codes, '{}'));
  else
    select coalesce(array_agg(w order by o), '{}') into a
      from unnest(array['boat', 'medic', 'rope', 'hands'], array['boat', 'medic', 'rope', 'more hands']) with ordinality t(x, w, o)
      where x = any(coalesce(p_codes, '{}'));
  end if;
  return a;
end $$;

-- "trapped, injured · needs boat, medic", then the note after a colon; '' when there is nothing to say
create or replace function public.ic_alert_text(p_wrong text[], p_needs text[], p_note text) returns text language plpgsql immutable as $$
declare w text := array_to_string(public.ic_alert_labels(p_wrong, 'wrong'), ', ');
        n text := array_to_string(public.ic_alert_labels(p_needs, 'needs'), ', ');
        s text := '';
        note text := coalesce(trim(p_note), '');
begin
  if w <> '' then s := w; end if;
  if n <> '' then s := s || case when s <> '' then ' · ' else '' end || 'needs ' || n; end if;
  if note <> '' then s := case when s <> '' then s || ': ' || note else note end; end if;
  return s;
end $$;

-- every label given, for "takes back: injured, rope"
create or replace function public.ic_alert_list(p_wrong text[], p_needs text[]) returns text language sql immutable as $$
  select array_to_string(public.ic_alert_labels(p_wrong, 'wrong') || public.ic_alert_labels(p_needs, 'needs'), ', ');
$$;

-- the chips change only by the unit that raised the alert, and never once it is stood down (Operations keeps acknowledged_at)
create or replace function public.ic_alert_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.wrong is distinct from old.wrong or new.needs is distinct from old.needs then
    if old.user_id is distinct from auth.uid() then raise exception 'Only the unit that raised the alert says what is wrong'; end if;
    if old.stood_down_at is not null then raise exception 'the alert was stood down'; end if;
  end if;
  return new;
end $$;
drop trigger if exists ic_alerts_before on public.ic_alerts;
create trigger ic_alerts_before before update on public.ic_alerts for each row execute function public.ic_alert_before();

-- 0021's body (the highest migration that defines it) with the words on the insert line and one more branch:
-- a changed word after the send. One tap is one update, so a line says adds or takes back, never both.
create or replace function public.ic_log_alert() returns trigger
language plpgsql security definer set search_path = public as $$
declare t text; who text; added_w text[]; added_n text[]; gone_w text[]; gone_n text[];
begin
  if tg_op = 'INSERT' then
    t := public.ic_alert_text(new.wrong, new.needs, new.note);
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, new.user_id, 'help', 'EMERGENCY, ' || public.ic_unit_label(new.incident_id, new.user_id) || ' needs help in ' || public.ic_zone_code(new.zone_id)
            || case when t <> '' then ': ' || t else '' end, 'ic_alerts', new.id::text);
  elsif new.stood_down_at is not null and old.stood_down_at is null then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, new.user_id, 'help', public.ic_unit_label(new.incident_id, new.user_id) || ' stood down, all OK', 'ic_alerts', new.id::text);
  elsif new.acknowledged_at is not null and old.acknowledged_at is null then
    insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
    values (new.incident_id, new.acknowledged_by, 'help', 'Operations acknowledged the emergency from ' || public.ic_unit_label(new.incident_id, new.user_id), 'ic_alerts', new.id::text);
  elsif new.wrong is distinct from old.wrong or new.needs is distinct from old.needs then
    who := public.ic_unit_label(new.incident_id, new.user_id);
    added_w := array(select unnest(new.wrong) except select unnest(old.wrong));
    added_n := array(select unnest(new.needs) except select unnest(old.needs));
    gone_w := array(select unnest(old.wrong) except select unnest(new.wrong));
    gone_n := array(select unnest(old.needs) except select unnest(new.needs));
    if cardinality(added_w) + cardinality(added_n) > 0 then
      insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
      values (new.incident_id, new.user_id, 'help', who || ' adds: ' || public.ic_alert_text(added_w, added_n, ''), 'ic_alerts', new.id::text);
    end if;
    if cardinality(gone_w) + cardinality(gone_n) > 0 then
      insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
      values (new.incident_id, new.user_id, 'help', who || ' takes back: ' || public.ic_alert_list(gone_w, gone_n), 'ic_alerts', new.id::text);
    end if;
  end if;
  return new;
end $$;
