# Incident Map

Two views of one incident, for floods and other large-scale emergencies:

- **Base** (`index.html`): the map at the base or forward operating base. Operations draws the incident boundary and the zones, sets each zone's priority, assigns units, and watches units move, photos arrive (with the direction each one faces) and zones turn green as the field marks them clear. The activity log is an ICS 214 in all but name.
- **Field** (`field/`): the phone app a unit installs. It shares the unit's location, takes photos tagged with the compass heading, marks addresses and the zone clear with the search marking the team paints, reports hazards, and has one red button for "need help now". Reports are kept on the phone until there is signal.

The vocabulary follows the Incident Command System: zones are divisions, priorities are the operational period's objectives, assignments are the ICS 204, the log is the ICS 214.

## Stack

Plain JavaScript ES modules, no build step. Leaflet with OpenStreetMap tiles. Supabase (Postgres, Realtime, Storage) in the shared charity-tooling project, where every table carries the `ic_` prefix. Hosted as a static site; the field app is a PWA.

## Run it

Any static server works. From the repo root:

```bash
python3 -m http.server 8766 --bind 127.0.0.1
```

Then open `http://localhost:8766/` for the base and `http://localhost:8766/field/` for the field app. The camera, GPS and compass need HTTPS on a phone; localhost counts, a plain `http://` address on the LAN does not. The deployed site (GitHub Pages) is HTTPS.

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
dev/sbq.py                runs SQL on the project with the Supabase CLI's login; dev/make-icons.py draws the icons
```
