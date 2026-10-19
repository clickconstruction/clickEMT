# Handoff

For whoever picks up clickEMT next. This says where things stand, how to get it running, how a change is shipped,
and where the open work is. The open work itself is in [punchlist.md](punchlist.md). Written 17 October 2026, brought
up to date on 18 October 2026 at v69.

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

- `main` is at **v69**, "Claim a band, submit licences, Operations confirms" (after v68, Need help now with what's wrong and what you need). The service worker reads `v69`.
- **Database:** Supabase project `cjwybuhogxyayjnuxpem` ("charity-tooling"). Migrations `0001` to `0034` in
  `supabase/migrations/` are all applied, and so are `0035_overlay_corners.sql` (v67), `0036_alert_words.sql` (v68) and `0037_credentials.sql` (v69), all on 18 October. They were applied by hand with `dev/sbq.py` and are **not** recorded in
  `supabase_migrations.schema_migrations`, so check for an object (a table or column) rather than reading that table.
- **Tests on `main`:** `npm test` and `npm run check` pass. The SQL rule tests in `supabase/tests/` pass
  (`alertwords.sql` 18 of 18, `joincount.sql` 10 of 10, `invites.sql` 32 of 32, `tags.sql` 28 of 28, `transports.sql` 33 of 33, `rewalks.sql` 10 of 10, `scene.sql` 9 of 9, `decisions.sql` 3 of 3, `bring.sql` 3 of 3, `accept.sql` 4 of 4, `hazards.sql` 5 of 5, `newcomer.sql` 3 of 3, `par.sql` 10 of 10, `deputy.sql` 5 of 5, `parbyname.sql` 10 of 10, `safetyset.sql` 23 of 23, `members.sql` 44 of 44, `evacuees.sql` 28 of 28, `walkfix.sql`
  10 of 10, `ics100.sql` 33 of 33, `people.sql` 28 of 28), all twenty files run on 18 October at v57, v58, v59, v60, v61, v62, v63, v64, v65, v66, v67 and v68, now twenty-two files with `alertwords.sql` (18 of 18) and `corners.sql`. At v69 all twenty-three files pass on the real database after 0037 was applied, 409 of 409 (`credentials.sql` 50 of 50). At v55 and v56
  `parbyname.sql` and `people.sql` failed on the real database (section 16 of the punchlist) without anyone
  noticing: run every rule test before a release is called done. v26 added an `evacuees` smoke suite, v27 `members`, v28 `safetyset`, v29
  `parbyname`; each release's notes in `docs/punchlist.md` say how its full run went.
- **One known flake in the full smoke run** (18 October, v50 to v53): the `layers` suite's overlay upload sometimes does not
  arrive within its wait late in a full run ("Cannot read properties of undefined (reading 'name')" at the saved overlay);
  it passes alone, with the `log` suite before it, and with either half of the run before it, so it is an effect of the whole
  sequence, not of the code. Rerun it alone before it counts, as the routine says; the cause is still to find. It did not
  come up in the full runs at v54 to v57. A second kind of miss (v62): a suite that reads the panel right after a click
  that queues a redraw passes with the pane hidden (`queueDraw` draws at once when no frame has come for 1.5 s) and
  fails with it visible (the redraw waits for the next frame); the `ics100` board check was one, and now waits. Wrap
  such a read in `until`.
- **v25 was tested independently** on 17 October: every fix held up by hand at phone and desktop widths, and the
  cleared-photo download was opened and checked (no coordinates, no GPS data in the files).
- **What has shipped:** the walk at v37's list as v38 to v48, the walk at v48's four items as v50 to v53, and the three
  pieces of the plan "Invite by email, a transport board, and people and tags" as v54 (the transport board), v55 (QR
  bands, tags phase 1) and v56 (invitations by email); v57 put back on the real database the check-in head count
  that 0032 and 0033 had lost; v58 is Show me around, a label over each part of the base on a device's first open; v59 moved the header's
  pills to the end of the buttons row and made the clock swap between local and UTC; v60 took eight marks from Todd's
  walk of the base (shorter labels, the codes behind the pill, the connection's card, the head count, the drawing
  buttons, the gear, Layers flipped, a division's hover card); v61 the ninth, the units section; v62 made every confirmation a dialog of the app's own and gave a band's link on a signed-out phone its door; v63 gave Replay a time you name, every range starting at the first position, and a speed in words; v64 put the pages in windows over the dimmed map, with Expand to full screen; v65 redrew the People board as cards and a drawer, with the tabs first in its bar and the Members tab as two groups; v66 made the house record's Went to and On which run chip rows, with the base's arriving rows the same; v68 gave Need help now two rows of chips, what's wrong and what you need.; v69 made a band the door (scan it, say who you are, It's mine), put credentials on the account, pending until Operations confirms them from the queue, and the chips, the 211 and the 214 follow. v49 was the front door's redesign. Each release has its section
  in [punchlist.md](punchlist.md) (1 to 14, 16 to 25, 27, 28) and its "Re-walk after vN" in [walkthroughs.md](walkthroughs.md).
- **Open, not yet ranked: the rest of Todd's walk.** Todd walked the base at v59 on 18 October and kept marking
  things; v60 took eight, v61 the units section, v62 the confirmations and the band door, v63 the Replay bar, v64 the pages as windows, v65 the People board, v66 the house record's two drop-downs and v68 the chips on Need help now (what's wrong, what you need). The rest are in punchlist section 15 ("From Todd's walk at v59"),
  most with a mock-up: Replay's time picker, imagery placed
  by its corners, a transport on the map, the 211 as a table. The fresh walk by Grace's routine (every persona, every job) is still to do after them. The candidates already known are in punchlist section 15 (the
  "Still bites" items of the re-walks after v50 to v56, and a few seen in passing). Trackers (tags phase 2) wait on
  the hardware Grace chooses.
- **Not yet seen working for real:** the first real invitation email. The Edge Function `invite` is deployed and
  refuses a call with no session, and the smoke suite drives the whole flow against the mock's stand-in, but no email
  has been sent from the live site. Send one to yourself from the Members tab: if the mail sender refuses, the row
  says "could not be sent: …" on the tab and in the 214.
- **Waiting on Grace, outside the code:** the contact for "Pilot it with your agency" on the front door (Get in touch
  points at the GitHub issues until there is an email); the pilot agreement draft, a Claude Doc on claude.ai with an
  open comment in section 6 (a free pilot, and the 30-day clearing); and the questions in section 7 of the plan doc,
  asked before the three pieces were built and still unanswered there. Both docs are private to Grace's account; ask
  her to share them.
- **The server code:** v56 added the app's first, the Edge Function `invite` (`supabase/functions/invite/`), deployed
  with `supabase functions deploy invite --project-ref cjwybuhogxyayjnuxpem --use-api` (the Supabase CLI's saved login;
  no Docker). Its secrets are the project's (`RESEND_API_KEY`, `RESEND_DEFAULT_FROM`, the Supabase keys) plus
  `APP_URL` (`https://clickemt.com`), set for this app.
- **Settings changed on the shared project** (18 October, for v56): the auth redirect allow list gained
  `https://clickemt.com/**`, `http://localhost:8766/**` and `http://localhost:8782/**` (without them Supabase sends an
  invitation's link to the site URL, which is the charity app's), and sign-ups were turned back on after the charity
  app had turned them off for a few hours (email confirmation is still required). The project's other auth settings,
  its email hook (`auth-email`) and its other functions belong to the charity app; leave them alone.

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
  touch nothing else in that project. Its auth settings (sign-ups, the redirect allow list, the email hook) are
  project-wide: a change there reaches the charity app too, so change them only when this app needs it and write the
  change down in "Where things stand" above.
- **A function a migration redefines starts from its newest body.** `ic_join` and many triggers are redefined
  release after release; take the body from the highest-numbered migration that defines it
  (`grep -l "function public.ic_join" supabase/migrations/*.sql`), never an older one, or earlier work is lost on the
  real database while the mock keeps it, as 0032 lost v29's head count. Only the rule tests against the real database
  catch that.
- **`config.js` holds only public values** (the publishable key). Never put a secret key in it.

## Getting it running

You need Python 3 and Node (v20 works). There is no build step and nothing to `npm install`. For anything that
touches the real database or the Edge Function you also need the Supabase CLI, logged in once (`supabase login`) with
an account that has access to the project (see Database access).

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

  It drives both views through 40 suites and takes one and a half to five minutes, depending on the machine; `run({ only: ['evacuees'] })` runs one
  suite. The window must stay visible (the base redraws on animation frames, which a hidden tab never gets), and at
  narrow widths the base switches to its phone layout and some checks fail. Reload the page before a second run. Any
  port works (the join and band suites read the address they are served from). In an embedded browser with a short
  script timeout, start it detached and read the result when it is done:
  `window.__smokeResult = null; import('/dev/smoke.js').then((m) => m.run()).then((r) => { window.__smokeResult = r; })`.
  An embedded browser usually refuses the camera: the suites scan bands and codes by typing the number, as a phone
  whose camera refuses does.
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
5. Apply the migration to the database before pushing, because the apps read new columns on start. If
   `supabase/functions/` changed, deploy the function too (the command is under "Where things stand"); the smoke suite
   runs against the mock's stand-in for it (`client.functions.invoke` in `dev/mock-supabase.js`), so keep the two
   saying the same thing.
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
- "People and tags": the first proposal for tracking people with tags and trackers. Phase 1, the QR bands, was built
  as v55; phase 2, trackers, waits on the hardware.
- "Invite by email, a transport board, and people and tags" (a Claude Doc, 18 October): the plan for v54 to v56,
  each piece with its design, its data, its decisions and "done when", and section 7's questions, still open. The
  click-through mock-ups it was judged on are in the repository at `try/mockups/` (published at
  https://clickemt.com/try/mockups/); they are kept as the design record now that all three are built.
- The pilot agreement (a Claude Doc, 18 October): the draft an agency signs to pilot the app, with one comment open.
- "A cleaner base" (18 October, `try/mockups/#cleaner`, with `people.html`, `replay.html`, `modals.html` and
  `imagery.html` beside it): Todd's walk of the base at v59 as mock-ups; panels 1 and 3 to 9 were built as v60.
- "Show me around" (18 October, in the repository at `try/mockups/#discovery`): the labels over the base on a device's
  first open, drawn over a screenshot of the base at v57 and judged before v58 was built; its last panel says what was
  decided and what was left for the walk.

## Layout

- `index.html`: the base, and when signed out the front door (the join code box first, then the landing).
  `404.html` asks for the join code too, at any address that is not a page.
- `js/base/`: the base. `main.js` wires events, `ui.js` draws the panels and the printed forms,
  `map.js` the Leaflet map, `print-map.js` the maps on printed 204s, `photo-export.js` the public photo zip.
- `field/index.html`, `js/field/`: the phone. `main.js` is the app, `camera.js` photos, `sensors.js` GPS and compass,
  `scan.js` QR and licence barcodes.
- `js/shared/`: `rules.js`, `data.js`, `queue.js` (the outbox), `briefings.js`, `hours.js`, `layers.js`, `qr.js`,
  `licence.js`, `theme.js`, `update.js` (new versions: the reload on the front door, the chip when signed in).
- `try/`: the public demo on the mock's stand-in (`?demo`): the role cards and tours (`tours.js`), the full-screen
  base and phone (`try/base/`, `try/phone/`) and the mock-ups of v54 to v56 (`try/mockups/`).
- `supabase/migrations/`, `supabase/tests/`: the database and its rule tests. `supabase/functions/`: the Edge
  Function `invite`, the app's only server code.
- `docs/guides/`: a guide per persona, read raw by the demo; `images/front/`: the front door's screenshots.
- `dev/`: the mock, the smoke suite, the Node tests, the dev server and `sbq.py`.
- `vendor/`: the QR code maker and readers, the licence barcode reader and supabase-js, with their licences in
  `vendor/LICENSES.md`. Leaflet loads from cdnjs.
