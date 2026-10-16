# Incident Map

Two views of one incident, for floods and other large-scale emergencies:

- **Base** (`index.html`): the map at the base or forward operating base. Operations draws the incident boundary and the zones, sets each zone's priority, assigns units, and watches units move, photos arrive (with the direction each one faces) and zones turn green as the field marks them clear. The activity log is an ICS 214 in all but name.
- **Field** (`field/`): the phone app a unit installs. It shares the unit's location, takes photos tagged with the compass heading, marks addresses and the zone clear with the search marking the team paints, reports hazards, and has one red button for "need help now". Reports are kept on the phone until there is signal.
- **Primary and secondary search, with a record per structure**: a zone goes not started, in progress, primary search done, cleared, in two shades of green. Every address the field clears becomes a record: occupants, people needing help, water depth, damage class, hazards, the marking painted. Operations can place the structures it knows about in advance; the field taps them on its map.
- **The Division assignment (ICS 204)**: each division carries its work assignment in words, special instructions, radio channel and supervisor; the base prints the 204 for the truck, and the phone shows the words on its card.
- **Operational periods**: the incident runs in numbered periods with their command names, safety message and objectives (ICS 202); a zone says which objective it serves. Starting the next period carries open objectives forward. The shift-change briefing assembles the whole picture from the data, printable or copied as text.
- **Accountability**: every unit carries a resource status as ICS names it, assigned, available, out of service or checked out, set by its assignments and by the unit or Operations, with its head count and agency. The base shows the resources board. A PAR asks every unit for a head count with one tap; a missing report raises an alert.
- **Messages** both ways, the ICS 213: Operations writes to one unit, the unit in a zone or everyone; each recipient acknowledges with one tap (Copy, Will do, Cannot). A safety message takes over every phone it is sent to until acknowledged, and stays on the base's yellow bar until the last one answers. Units can message Operations with quick chips or in their own words. ROADMAP.md lists what comes next.

The vocabulary follows the Incident Command System: zones are divisions, priorities are the operational period's objectives, assignments are the ICS 204, the log is the ICS 214.

## Stack

Plain JavaScript ES modules, no build step. Leaflet with OpenStreetMap tiles. Supabase (Postgres, Realtime, Storage) in the shared charity-tooling project, where every table carries the `ic_` prefix. Hosted as a static site; the field app is a PWA.

## Live

The repo is `clickconstruction/clickEMT` on GitHub, published with GitHub Pages from `main`:

- Base: https://clickemt.com/
- Field: https://clickemt.com/field/ (open it on the phone and add it to the home screen)

The custom domain is set by the CNAME file at the repo root; the older clickconstruction.com/clickEMT/ and github.io addresses redirect here.

A push to `main` deploys; bump `VERSION` in `sw.js` first when a shell file changed.

## Run it

Any static server works. From the repo root:

```bash
python3 -m http.server 8766 --bind 127.0.0.1
```

Then open `http://localhost:8766/` for the base and `http://localhost:8766/field/` for the field app. The camera, GPS and compass need HTTPS on a phone; localhost counts, a plain `http://` address on the LAN does not. The deployed site (GitHub Pages) is HTTPS.

### Mock mode: no account, no network

Add `?mock` to either address on localhost (`http://localhost:8766/?mock`, `http://localhost:8766/field/?mock`) and `dev/mock-supabase.js` stands in for Supabase: an in-memory copy of the tables, the triggers that write the log, the row-level security rules, Realtime and the photo bucket, seeded with one incident, Cedar Fork Flooding: six zones around a river town, three units with positions, three photos with headings, a hazard and a morning of log lines. The base tab is signed in as Operations and the field tab as Unit 3, both open on the incident, and the field tab gets a pretend GPS that stands in A-2 and drifts a few metres at a time. Open both in the same browser and what one does shows on the other within a second: mark the zone clear on the field tab and it turns green on the base.

The data lives in the tabs' memory. A tab that opens while another mock tab is open copies that tab's data, so to start over close every mock tab, or run `window.__mock.reset()` in the console and reload the incident. `window.__mock.tables` is the data, `window.__mock.ids` the seeded ids, `window.__mock.geo` the pretend phone's position (set `drift: false` to hold it still). Sign out and sign in with any email and password: a seeded address (`ops@mock.local`, `unit1@mock.local` to `unit3@mock.local`) is that person, anything else is someone new, who can check in with the code `CEDAR7`.

**Smoke test:** open `http://localhost:8766/?mock` in a window at least 1100 px wide, with no other mock tab open, and run this in the browser console:

```js
const { run } = await import('/dev/smoke.js'); await run()
```

It drives the base through the page (select a zone, set a priority, assign a unit, draw a zone and the boundary on the map, open a photo, acknowledge an alert, add a note) and the field through a second copy of the data module signed in as Unit 3 (a photo with a heading, an address clear, the zone clear with its marking, a hazard, an alert and standing down), and after each step checks what the base sees and what went into the log. It takes about 20 seconds and returns `{ passed, total, failed }`. `run({ only: ['fieldReports'] })` runs one suite; the suites are `seeded`, `baseActions`, `boundary`, `fieldReports`, `emergency`, `checkIn` and `permissions`.

## First run

1. Sign in on the base (email and password; "Create account" makes one if sign-ups are enabled on the Supabase project).
2. Open a new incident. It gets a six-letter join code, shown on the base's home panel.
3. On a phone, open the field app, sign in, and check in with the code and a unit name.
4. On the base, draw a zone and assign it to the unit. The phone shows the assignment; what the phone sends shows on the base.

## Layout

```
index.html, js/base/      the base view (map.js draws the map, ui.js the sidebar and log, main.js wires them)
field/, js/field/         the field app (sensors.js: GPS and compass, camera.js: the camera, main.js: screens and the outbox)
js/shared/                rules.js (no DOM: headings, zone codes, polygons), data.js (Supabase), queue.js (the outbox)
css/                      shared.css, base.css, field.css
supabase/migrations/      the schema: tables, RLS, the triggers that write the log
sw.js, manifest.webmanifest, field/manifest.webmanifest, icons/
dev/                      mock-supabase.js (the in-memory Supabase behind ?mock), smoke.js (the browser smoke test), test-rules.mjs,
                          sbq.py (runs SQL on the project with the Supabase CLI's login), make-icons.py (draws the icons)
```
