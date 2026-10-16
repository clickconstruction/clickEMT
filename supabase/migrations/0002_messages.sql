-- Messages with acknowledgement: the ICS 213 General Message, and safety messages that stay up
-- until every recipient has acknowledged. Recipients are fixed when the message is sent (to_users),
-- so a unit assigned later does not inherit old traffic. Every message and acknowledgement goes
-- into the log by trigger.

create table if not exists public.ic_messages (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.ic_incidents(id) on delete cascade,
  from_user uuid not null references auth.users(id),
  to_users uuid[] not null default '{}',      -- who must acknowledge
  to_label text not null default '',          -- how the sender named them: Everyone, B-2, Unit 3, Operations
  to_zone uuid references public.ic_zones(id) on delete set null,
  kind text not null default 'message' check (kind in ('message', 'safety', 'par')),
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ic_message_acks (
  message_id uuid not null references public.ic_messages(id) on delete cascade,
  incident_id uuid not null references public.ic_incidents(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  reply text not null default '',             -- Copy, Will do, Cannot, or words; for a PAR: All accounted for / Missing someone
  count integer,                              -- for a PAR: people accounted for
  acked_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists ic_messages_incident on public.ic_messages(incident_id, created_at desc);
create index if not exists ic_message_acks_incident on public.ic_message_acks(incident_id);

-- ---------------------------------------------------------------- the log

create or replace function public.ic_log_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
  values (new.incident_id, new.from_user,
          case when new.kind = 'safety' then 'safety' when new.kind = 'par' then 'par' else 'msg' end,
          case when new.kind = 'safety' then 'SAFETY MESSAGE, ' when new.kind = 'par' then 'PAR, ' else '' end
          || public.ic_unit_label(new.incident_id, new.from_user) || ' to ' || coalesce(nullif(new.to_label, ''), 'everyone') || ': ' || new.text,
          'ic_messages', new.id::text);
  return new;
end $$;
drop trigger if exists ic_messages_log on public.ic_messages;
create trigger ic_messages_log after insert on public.ic_messages for each row execute function public.ic_log_message();

create or replace function public.ic_log_ack() returns trigger
language plpgsql security definer set search_path = public as $$
declare m public.ic_messages;
begin
  select * into m from public.ic_messages where id = new.message_id;
  insert into public.ic_events (incident_id, user_id, kind, text, ref_table, ref_id)
  values (new.incident_id, new.user_id,
          case when m.kind = 'safety' then 'safety' when m.kind = 'par' then 'par' else 'msg' end,
          public.ic_unit_label(new.incident_id, new.user_id)
          || case when m.kind = 'par' then ': ' || coalesce(nullif(new.reply, ''), 'answered') || case when new.count is not null then ' (' || new.count || ')' else '' end
                  else ' acknowledged ' || public.ic_unit_label(new.incident_id, m.from_user) || case when nullif(new.reply, '') is null then '' else ': ' || new.reply end end,
          'ic_messages', new.message_id::text);
  return new;
end $$;
drop trigger if exists ic_message_acks_log on public.ic_message_acks;
create trigger ic_message_acks_log after insert on public.ic_message_acks for each row execute function public.ic_log_ack();

-- ---------------------------------------------------------------- row level security

alter table public.ic_messages enable row level security;
alter table public.ic_message_acks enable row level security;

drop policy if exists ic_messages_select on public.ic_messages;
create policy ic_messages_select on public.ic_messages for select to authenticated using (public.ic_is_member(incident_id));
drop policy if exists ic_messages_insert on public.ic_messages;
create policy ic_messages_insert on public.ic_messages for insert to authenticated with check (from_user = auth.uid() and public.ic_is_member(incident_id));

drop policy if exists ic_message_acks_select on public.ic_message_acks;
create policy ic_message_acks_select on public.ic_message_acks for select to authenticated using (public.ic_is_member(incident_id));
drop policy if exists ic_message_acks_insert on public.ic_message_acks;
create policy ic_message_acks_insert on public.ic_message_acks for insert to authenticated with check (user_id = auth.uid() and public.ic_is_member(incident_id));

-- ---------------------------------------------------------------- live updates

do $$
declare t text;
begin
  foreach t in array array['ic_messages', 'ic_message_acks'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
