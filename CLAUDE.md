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
- Mock mode: `?mock` on localhost loads `dev/mock-supabase.js` before `supabase-client.js` (two lines in `index.html` and `field/index.html`, the only hook in the real app). It stands in for Supabase in memory, mirrors the migration's triggers (`afterInsert` / `afterUpdate`), column defaults (`DEFAULTS`) and policies (`allowed`), and seeds Cedar Fork Flooding with the base signed in as Operations and the field as Unit 3. Claude's browser pane cannot sign in to the real project (the credentials would go to Supabase), so this is how anything behind sign-in is exercised. When a migration adds a table, a column with a default, a trigger or a policy, mirror it in the mock and give the seed a row that uses it; when `data.js` gains a supabase-js call, add it to the builder. README.md says how to run it.

## Every release

1. Bump `VERSION` in `sw.js` when any shell file changes (cache-first). Add new JS or CSS files to `SHELL`.
2. `npm run check` (`node --check` on every JS file) and `npm test` (`dev/test-rules.mjs`, for `rules.js`). For anything the views do, run the smoke test against the mock: open `http://localhost:8766/?mock` at desktop width (1280 wide) with no other mock tab open, and in the console `const { run } = await import('/dev/smoke.js'); await run()`. It takes about 20 seconds; in the Browser pane start it detached (`import('/dev/smoke.js').then((m) => m.run()).then((r) => { window.__smokeResult = r; })`) and read `window.__smokeResult`. The pane must stay visible: the base redraws on `requestAnimationFrame`, which a background tab never gets.
3. Apply any new migration before pushing: the apps read the new columns on start.
4. Commit messages: a release is titled after the feature with the version in parentheses, matching `sw.js`.

## Gotchas

- GPS, camera and compass need a secure context: `localhost` or HTTPS. A LAN `http://` address on a phone gives none of them.
- iOS gives compass readings only after `DeviceOrientationEvent.requestPermission()` from a tap; `Sensors.requestCompass()` is called before the camera opens and from the menu.
- The camera is a file input with `capture="environment"`; the heading recorded is the compass reading when the picture comes back, not when the shutter was pressed.
- Realtime subscriptions use one filter per table (`incident_id=eq.<id>`); the incident row itself is filtered by `id`.
- Leaflet markers are `divIcon`s with `iconSize: [0, 0]`; CSS centres the marker on the point. Unit markers are kept and moved, everything else is redrawn on change.
- GitHub Pages serves the site from a subpath, so every link and import is relative; the field app registers `../sw.js`.
- The mock's data is per tab. A tab that opens beside another mock tab copies that tab's data over the BroadcastChannel; `window.__mock.reset()` reseeds this tab only. The smoke test resets before each suite and reopens the incident through the page's own `open-incident` click handler (a synthetic button), because `js/base/main.js` exports nothing; keep that action. The mock also replaces `navigator.geolocation` with a pretend phone (`window.__mock.geo`), so the field tab shares a position without a device.
