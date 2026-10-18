-- A picture by its corners (migration 0035), run against the real database inside one transaction that is rolled
-- back at the end:  python3 dev/sbq.py supabase/tests/corners.sql
-- Every row of the result should say ok: true.
begin;
create temp table t_r (ok boolean, what text);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'corners-test-ops@example.invalid', '', now(), now(), now(), '{}', '{}', false, false);
create temp table t_ctx (incident uuid, overlay uuid);
insert into t_ctx (incident) values (null);
grant all on t_r, t_ctx to authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f2","role":"authenticated"}', true);
set local role authenticated;
update t_ctx set incident = r.id from (select * from public.ic_create_incident('Corners test', null, null, null, null, 14)) r;
-- a picture by its corners: bounds is written as their box, whatever was sent
with o as (insert into public.ic_overlays (incident_id, name, storage_path, bounds, corners)
  values ((select incident from t_ctx), 'Aerial 06:40', (select incident from t_ctx) || '/x.jpg', '{"south":0,"west":0,"north":1,"east":1}',
          '[[30.2735,-97.7445],[30.2718,-97.7275],[30.2635,-97.7283],[30.2652,-97.7452]]') returning id)
  update t_ctx set overlay = (select id from o);
insert into t_r select (bounds->>'south')::numeric = 30.2635 and (bounds->>'north')::numeric = 30.2735 and (bounds->>'west')::numeric = -97.7452 and (bounds->>'east')::numeric = -97.7275,
  'bounds is the corners'' box: ' || bounds::text from public.ic_overlays where id = (select overlay from t_ctx);
insert into t_r select exists (select 1 from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Imagery: Aerial 06:40 added to the map'), 'the 214 line is the old one';
-- no bounds sent at all: the trigger fills it before the not-null check
insert into public.ic_overlays (incident_id, name, storage_path, corners) values ((select incident from t_ctx), 'Two', (select incident from t_ctx) || '/y.jpg', '[[1,1],[1,2],[0,2],[0,1]]');
insert into t_r select bounds = '{"south":0,"west":1,"north":1,"east":2}'::jsonb, 'without bounds, the box is filled in: ' || bounds::text from public.ic_overlays where name = 'Two' and incident_id = (select incident from t_ctx);
-- a rectangle without corners keeps the bounds it was given
insert into public.ic_overlays (incident_id, name, storage_path, bounds) values ((select incident from t_ctx), 'Plan', (select incident from t_ctx) || '/z.png', '{"south":30.1,"west":-97.8,"north":30.2,"east":-97.7}');
insert into t_r select corners is null and (bounds->>'north')::numeric = 30.2, 'a picture with no corners fills its bounds, as before' from public.ic_overlays where name = 'Plan' and incident_id = (select incident from t_ctx);
-- moving the corners is one "updated" line; a new opacity is none
update public.ic_overlays set corners = '[[30.2736,-97.7445],[30.2718,-97.7275],[30.2635,-97.7283],[30.2652,-97.7452]]' where id = (select overlay from t_ctx);
update public.ic_overlays set opacity = 0.4 where id = (select overlay from t_ctx);
insert into t_r select count(*) = 1, 'moved corners are logged once as updated, a new opacity is not: ' || count(*) from public.ic_events where incident_id = (select incident from t_ctx) and text = 'Imagery: Aerial 06:40 updated';
insert into t_r select (bounds->>'north')::numeric = 30.2736, 'and the box follows the corners: ' || (bounds->>'north') from public.ic_overlays where id = (select overlay from t_ctx);
-- what is refused
do $$ begin
  update public.ic_overlays set corners = '[[1,1],[1,2],[0,2]]' where id = (select overlay from t_ctx);
  insert into t_r values (false, 'three corners were accepted');
exception when others then insert into t_r values (sqlerrm like '%corners%', 'three corners are refused: ' || sqlerrm); end $$;
do $$ begin
  update public.ic_overlays set corners = '"north up"' where id = (select overlay from t_ctx);
  insert into t_r values (false, 'words as corners were accepted');
exception when others then insert into t_r values (sqlerrm like '%corners%', 'words as corners are refused: ' || sqlerrm); end $$;
do $$ begin
  update public.ic_overlays set corners = '[[1,1],[1,1],[1,1],[1,1]]' where id = (select overlay from t_ctx);
  insert into t_r values (false, 'four corners on one spot were accepted');
exception when others then insert into t_r values (sqlerrm like '%corners%', 'four corners on one spot are refused: ' || sqlerrm); end $$;
do $$ begin
  update public.ic_overlays set corners = '[[91,1],[1,2],[0,2],[0,1]]' where id = (select overlay from t_ctx);
  insert into t_r values (false, 'a latitude past 90 was accepted');
exception when others then insert into t_r values (sqlerrm like '%corners%', 'a latitude past 90 is refused: ' || sqlerrm); end $$;
reset role;
select * from t_r order by ok, what;
rollback;
