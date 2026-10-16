# CLAUDE.md

Guidance for Claude working in this repo. README.md says what the app is and how to run it.

## Product rules

- **Two views, one truth.** The base (`index.html`) and the field app (`field/`) share `js/shared/`: `rules.js` (no DOM, no network: headings, zone codes, polygons, statuses), `data.js` (the only module that talks to Supabase) and `queue.js` (the field's outbox). A rule that both views must obey goes in `rules.js` or in the database, never in one view.
- **The database writes the log.** `ic_events` (the ICS 214) is filled by triggers on zones, photos, hazards, alerts and the incident. The apps insert only `note` events. If you add a kind of thing a unit can send, add its trigger in a migration.
- **Nothing is deleted.** Hazards are resolved, alerts are stood down, incidents are closed, zones are reopened. There is no delete path, and RLS has no delete policy.
- **Field first.** Every field action is one or two taps, works with gloves and rain, and goes through the outbox so a dead spot never loses a report. Ids are made on the phone before queueing, so a retry is harmless.
- **Heading is part of a photo.** A photo carries the compass heading at the moment it was taken; the base draws the wedge. Never drop it to simplify.

## Stack

- Plain JavaScript ES modules, no build step, hosted as a static site. Leaflet 1.9.4 from cdnjs; the service worker caches it on first use.
- Supabase project `cjwybuhogxyayjnuxpem` (charity-tooling), shared with the charity app. Every table, function and policy of this app carries the `ic_` prefix. Owner-only RLS by incident membership: `ic_is_member(incident_id)` / `ic_is_ops(incident_id)`. The photo bucket is `ic-photos`, private, read through signed URLs.
- Apply migrations with `python3 dev/sbq.py supabase/migrations/<file>.sql` (the Management API with the Supabase CLI's saved login) and keep the file in `supabase/migrations/`. Rule tests go in `supabase/tests/` and must roll back.
- `config.js` is committed and holds only the public publishable key. Never put a secret key in it. Local overrides go in `config.local.js` (gitignored, localhost only).
- Sign-in is Supabase email and password. Field units check in to an incident with its six-letter code (`ic_join`); Operations creates incidents (`ic_create_incident`).

## Every release

1. Bump `VERSION` in `sw.js` when any shell file changes (cache-first). Add new JS or CSS files to `SHELL`.
2. `node --check` every JS file; run `node dev/test-rules.mjs` if it exists for `rules.js`.
3. Apply any new migration before pushing: the apps read the new columns on start.
4. Commit messages: a release is titled after the feature with the version in parentheses, matching `sw.js`.

## Gotchas

- GPS, camera and compass need a secure context: `localhost` or HTTPS. A LAN `http://` address on a phone gives none of them.
- iOS gives compass readings only after `DeviceOrientationEvent.requestPermission()` from a tap; `Sensors.requestCompass()` is called before the camera opens and from the menu.
- The camera is a file input with `capture="environment"`; the heading recorded is the compass reading when the picture comes back, not when the shutter was pressed.
- Realtime subscriptions use one filter per table (`incident_id=eq.<id>`); the incident row itself is filtered by `id`.
- Leaflet markers are `divIcon`s with `iconSize: [0, 0]`; CSS centres the marker on the point. Unit markers are kept and moved, everything else is redrawn on change.
- GitHub Pages serves the site from a subpath, so every link and import is relative; the field app registers `../sw.js`.
