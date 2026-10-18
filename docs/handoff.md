# Handoff

For whoever picks up clickEMT next. This says where things stand, how to get it running, how a change is shipped,
and where the open work is. The open work itself is in [punchlist.md](punchlist.md). Written 17 October 2026.

## What it is

A field-to-base app for flood incidents, built on the Incident Command System (ICS) and its forms. Two views share
one database:

- **The base** (`index.html`): the map at the command post. Operations draws the incident boundary and the divisions,
  assigns units, watches positions, photos (with the direction each faces), hazards and cleared houses arrive, runs
  head counts (PARs) and messages, works resource requests (ICS 213RR), and prints the ICS forms: the Incident
  Action Plan (202 to 208, with a map on each division's 204), the 207 organization chart, the 209 situation report,
  the 211 check-in list and the 214 activity log.
- **The field app** (`field/`): the phone app a unit installs. It shares its position, takes photos with a compass
  heading, clears houses with the search marking, reports hazards, asks for resources, has one red button for "need
  help now", and keeps every report until there is signal.

Live at https://clickemt.com/ (base) and https://clickemt.com/field/ (phone). The repository is
`clickconstruction/clickEMT` on GitHub; pushing `main` deploys the site through GitHub Pages.

## Where things stand

- `main` is at **v54**, "A transport board" (after v53, small words). The service worker reads `v54`.
- **Database:** Supabase project `cjwybuhogxyayjnuxpem` ("charity-tooling"). Migrations `0001` to `0031` in
  `supabase/migrations/` are all applied. They were applied by hand with `dev/sbq.py` and are **not** recorded in
  `supabase_migrations.schema_migrations`, so check for an object (a table or column) rather than reading that table.
- **Tests on `main`:** `npm test` and `npm run check` pass. The SQL rule tests in `supabase/tests/` pass
  (`transports.sql` 33 of 33, `rewalks.sql` 10 of 10, `scene.sql` 9 of 9, `decisions.sql` 3 of 3, `bring.sql` 3 of 3, `accept.sql` 4 of 4, `hazards.sql` 5 of 5, `newcomer.sql` 3 of 3, `par.sql` 10 of 10, `deputy.sql` 5 of 5, `parbyname.sql` 10 of 10, `safetyset.sql` 23 of 23, `members.sql` 44 of 44, `evacuees.sql` 28 of 28, `walkfix.sql`
  10 of 10, `ics100.sql`, `people.sql`). v26 added an `evacuees` smoke suite, v27 `members`, v28 `safetyset`, v29
  `parbyname`; each release's notes in `docs/punchlist.md` say how its full run went.
- **One known flake in the full smoke run** (18 October, v50 to v53): the `layers` suite's overlay upload sometimes does not
  arrive within its wait late in a full run ("Cannot read properties of undefined (reading 'name')" at the saved overlay);
  it passes alone, with the `log` suite before it, and with either half of the run before it, so it is an effect of the whole
  sequence, not of the code. Rerun it alone before it counts, as the routine says; the cause is still to find.
- **v25 was tested independently** on 17 October: every fix held up by hand at phone and desktop widths, and the
  cleared-photo download was opened and checked (no coordinates, no GPS data in the files).
- **Open work:** the walk at v37 in [walkthroughs.md](walkthroughs.md) ("Walk at v37: best we can do") ranked what still
  bites; [punchlist.md](punchlist.md) is that list. Releases v38 to v47 shipped on 17 and 18 October (v46 built Grace's four
  decisions, v47 the last item, on scene too long, v48 the small items from the re-walks); nothing on that list is left.
  The walk at v48's four items shipped as v50 to v53. v54 built the transport board, the first of the three pieces in
  the plan "Invite by email, a transport board, and people and tags" (punchlist section 12); tags phase 1 and
  invitations are next, in that order, each with its mock-up at `/try/mockups/`.

## Read these first

1. [README.md](../README.md): what the app does, feature by feature, and how to run it, including mock mode.
2. [CLAUDE.md](../CLAUDE.md): the product rules, the stack, the release routine, and a long list of gotchas, one per
   feature. Written for an AI assistant, but it is the most complete technical guide to the code.
3. [personas.md](personas.md): the twelve people the app is designed around, from the Incident Commander to a
   shelter desk volunteer. [guides/](guides/README.md) has a guide for each, their jobs step by step with the words on
   the screen, and `/try/` (the public demo, on the stand-in with `?demo`) walks one beside the base and the phone.
4. [walkthroughs.md](walkthroughs.md): each persona walked through the app, what confused or stopped them, and the
   re-walk after each round of fixes. This is where most new work comes from.
5. [ROADMAP.md](../ROADMAP.md): the original plan for bringing ICS into the app, ticked as it shipped.

## Rules that are easy to break

- **Nothing the user made is deleted.** Hazards are resolved, alerts stood down, zones reopened, people and members
  archived. There is no delete path and row-level security has no delete policy, with one exception since v27:
  personal records (licence numbers, dates of birth, addresses, licence photos, the names of people sheltered) clear
  by rule thirty days after an incident closes, never work product.
- **The database writes the activity log.** Triggers fill `ic_events`, the 214. A new kind of report needs its
  trigger in a migration, not a write from the app.
- **Two views, one truth.** A rule both views obey goes in `js/shared/rules.js` (no DOM, no network) or in the
  database, never in one view. `js/shared/data.js` is the only module that talks to Supabase.
- **Field first.** A phone action is one or two taps, works with gloves in the rain, and goes through the outbox
  (`js/shared/queue.js`) so a dead spot never loses a report.
- **Nothing public by default.** A photo reaches the Public Information Officer only when Operations clears it;
  identity records are seen by the person and Operations only; evacuee names never leave the incident.
- **The Supabase project is shared** with a separate charity app. Everything of this app carries the `ic_` prefix;
  touch nothing else in that project.
- **`config.js` holds only public values** (the publishable key). Never put a secret key in it.

## Getting it running

You need Python 3 and Node (v20 works). There is no build step and nothing to `npm install`.

```bash
git clone https://github.com/clickconstruction/clickEMT.git
```

```bash
cd clickEMT && npm run serve
```

Then open `http://localhost:8766/?mock` (the base) and `http://localhost:8766/field/?mock` (the phone). Mock mode
needs no account and no network: `dev/mock-supabase.js` stands in for Supabase with a seeded incident, Cedar Fork
Flooding (join code `CEDAR7`), signed in as Operations on the base and as Unit 3 on the phone. Open both in the same
browser and what one does shows on the other. README.md's "Mock mode" section has the details, including the seeded
accounts and how to reset.

For the phone, use a narrow window or the browser's device mode at 375 px wide. `npm run serve` matters: the stock
`python3 -m http.server` lets the browser keep stale files.

## Testing

- `npm run check`: syntax-checks every JS file.
- `npm test`: the Node tests in `dev/` for the pure modules (rules, hours, briefings, the printed map, QR codes,
  licence barcodes, the photo export).
- **Smoke suite**, in the browser against the mock: open `http://localhost:8766/?mock` at 1280 px wide, with no other
  mock tab open and the window visible, and in the console run

  ```js
  const { run } = await import('/dev/smoke.js'); await run()
  ```

  It drives both views and takes two to three minutes; `run({ only: ['evacuees'] })` runs one suite. The window must
  stay visible (the base redraws on animation frames, which a hidden tab never gets), and at narrow widths the base
  switches to its phone layout and some checks fail. Reload the page before a second run. Until punchlist item 5 is
  done, one QR check fails on any port other than 8766.
- **SQL rule tests**, against the real database: `python3 dev/sbq.py supabase/tests/<file>.sql`. Each runs in one
  transaction that rolls back, so nothing is left behind, and returns rows that should all say `ok: true`.

## Database access

`dev/sbq.py` runs a SQL file through the Supabase Management API using the Supabase CLI's saved login, so you need a
Supabase account with access to the charity-tooling project and `supabase login` done once. Ask Grace for access.
Apply a migration with `python3 dev/sbq.py supabase/migrations/<file>.sql`, and keep the file in the repo. Never use
`supabase db push`.

## Shipping a change

The routine for every release (CLAUDE.md, "Every release"):

1. Write the migration first if the database changes, mirror it in `dev/mock-supabase.js` (tables, defaults,
   triggers, policies, and a seed row that uses it; bump `SEED_VERSION`), and add a rule test.
2. Build both views; add or extend a smoke suite.
3. Bump `VERSION` in `sw.js` (the service worker is cache-first, so phones keep the old app until it changes) and add
   any new JS or CSS file to its `SHELL` list.
4. Run `npm run check`, `npm test`, the full smoke run and the rule tests.
5. Apply the migration to the database before pushing, because the apps read new columns on start.
6. Update README.md (a feature line) and CLAUDE.md (a gotcha line) when something works differently.
7. Commit on `main`, titled after the feature with the version in parentheses, matching `sw.js`: `Shelter and
   evacuee records: who was moved where (v26)`. Test-only changes start with `smoke:` or `dev:`, docs with `docs:`.
8. Push `main`. That deploys.
9. Walk the changed screens as the personas who needed them and add a "Re-walk after vN" section to
   `docs/walkthroughs.md`.

Grace's standing preference: after each change, ask "is this the best we can do?" and improve it before moving on.

## Design mock-ups

The larger features were designed as mock-up canvases on claude.ai before they were built. They are private to
Grace's account; ask her to share any you need. The punchlist repeats every decision that matters, so you can work
without them.

- "The big six": v26 to v28 (evacuees, members, retention, time in the water, settings, the public set).
- "ICS-100 gaps": what v24 added from the ICS-100 course.
- "Planning, Logistics and Finance": v23.
- "People and tags": a proposal not yet built, for tracking people with tags and trackers; the reason boat crews'
  per-person "last seen" is deferred.

## Layout

- `index.html`, `js/base/`: the base. `main.js` wires events, `ui.js` draws the panels and the printed forms,
  `map.js` the Leaflet map, `print-map.js` the maps on printed 204s, `photo-export.js` the public photo zip.
- `field/index.html`, `js/field/`: the phone. `main.js` is the app, `camera.js` photos, `sensors.js` GPS and compass,
  `scan.js` QR and licence barcodes.
- `js/shared/`: `rules.js`, `data.js`, `queue.js` (the outbox), `briefings.js`, `hours.js`, `layers.js`, `qr.js`,
  `licence.js`, `theme.js`.
- `supabase/migrations/`, `supabase/tests/`: the database and its rule tests.
- `dev/`: the mock, the smoke suite, the Node tests, the dev server and `sbq.py`.
- `vendor/`: the QR code maker and readers, the licence barcode reader and supabase-js, with their licences in
  `vendor/LICENSES.md`. Leaflet loads from cdnjs.
