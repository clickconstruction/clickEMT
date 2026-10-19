# Handoff

For whoever picks up clickEMT next, on another computer. This says where things stand, how to get it running, how
a change is shipped, how the work was run, and where the open work is, in order. The open work itself is in
[punchlist.md](punchlist.md). New here? Read the one-page [handoff-brief.md](handoff-brief.md) first. Written 17 October 2026, brought up to date at v74 late on 18 October, and at v80
on the afternoon of 19 October, at v81, for a hand-off to a new person, and at v82 later that afternoon, and at v83 that evening.

## Start here

Two views of one incident: the base (the map at the command post) and the phone app a unit installs. One Supabase
database, shared with a charity app, holds both. Pushing `main` deploys https://clickemt.com through GitHub Pages.

- `main` is at **v83**, "The facility card's address box", live since the evening of 19 October.
  Nothing is waiting on a branch. The next piece is the first item under [Open work, in order](#open-work-in-order).
- The first six things on a new computer:
  1. Clone `clickconstruction/clickEMT` and run `npm run serve`; open `http://localhost:8766/?mock` (the base) and
     `http://localhost:8766/field/?mock` (the phone). No build, no `npm install`, no account.
  2. `gh auth login` (the GitHub CLI): pushing `main` deploys, and a release lands as a plain fast-forward of `main`.
  3. `supabase login` (the Supabase CLI) with an account in the Supabase organization that holds project
     `cjwybuhogxyayjnuxpem` ("charity-tooling"): ask the product owner for an invitation (Grace held access before;
     on 19 October the owner's own login was used). `supabase projects list` should show charity-tooling, and
     `python3 dev/sbq.py -c "select count(*) from public.ic_incidents"` should answer.
  4. Google Chrome in `/Applications`: `npm run smoke` runs the browser smoke suite in headless Chrome, which is how
     every release on 19 October was tested. The Claude desktop app's Browser pane runs it too, but only while it is
     on screen (its launch configs are in `.claude/launch.json`).
  5. A real browser on a phone or a laptop for anything with a camera: the band and licence scanners need one.
  6. Read [Open work, in order](#open-work-in-order), then [What only Todd can set](#what-only-todd-can-set) and
     [Rules that are easy to break](#rules-that-are-easy-to-break).

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

- **The code.** `main` is at v83; the service worker reads `v83`. Released on 19 October, each with its
  section in [punchlist.md](punchlist.md), its "Re-walk after vN" in [walkthroughs.md](walkthroughs.md) and its
  mock-up page in `try/mockups/`:
  - v75 Runs that share a point: pills in a column clear of the heading arrow, rings one inside the next, a
    Transport runs box in the Layers panel (section 34, `transports.html`).
  - v76 The incident line, broken out: the line under the name says what changes with the alarm first, the rest on
    a card of four tiles; every duration reads "4h 8m" (section 35, `incident-line.html`).
  - v77 Incident kinds and starter periods: two rows of kind buttons on the New incident sheet, a starter that
    pre-fills period 1, Flood in full and sixteen thin; the kind is kept in `ic_incidents.settings`, no column
    (section 36, `starters.html`).
  - v78 The centre by address: an Address box with Google Places suggestions on the New incident sheet,
    `js/shared/places.js` (section 37, `starters.html`).
  - v79 The 214's water words as 45m: migration 0039 (section 38).
  - v80 The header in four groups (This period · Boards · Forms · The day, the gear beside the pills) and a quieter
    first minute on a fresh incident (section 39, `leftovers.html`).
  - v81 Every time in UTC on the clock's click, with Z, and the front door's pictures re-shot by
    `dev/front-shots.py` (section 40, `leftovers.html`). Its build session stopped on a usage limit mid-release;
    the coordinating chat committed its work, and the session finished it when it came back.
  - v82 The incident's kind as a column: migration 0040 gives the kind and the starter their columns and an objective
    × removed its `archived_at`; the opening line, the removal and a change of kind come from the database (section
    41; no mock-up page of its own, the words were decided on `starters.html`).
  - v83 The facility card's address box: the sheet's suggestions on every facility card, a pick filling the address,
    the point and an empty Name, Save moving the pin (section 42, `starters.html` decisions 9 to 13; no migration).
  - Also that day: `dev/smoke-headless.py` (`npm run smoke`), and the Google Maps key in `config.js`.
- **The database:** Supabase project `cjwybuhogxyayjnuxpem` ("charity-tooling"). Migrations `0001` to `0040` in
  `supabase/migrations/` are all applied, by hand with `dev/sbq.py`, and are **not** recorded in
  `supabase_migrations.schema_migrations`, so check for an object (a table, a column, a function) rather than
  reading that table. `0040_incident_kind.sql` (v82) was applied on 19 October: `ic_incidents.kind` is there and
  `ic_incident_kind_text('flood')` reads "a flood" on the real database. The next free migration number is **0041**.
- **The live database holds no incident yet** (checked on 19 October: no row in `ic_incidents`). Everything so far
  was done in the mock and the suites. The first real incident, invitation email and sign-in code are still to happen.
- **Tests at v83:** `npm run check` and `npm test` pass on `main`. The SQL rule tests, 26 files and 461 checks, all
  pass on the real database (19 October, after 0040): `accept` 4, `alertwords` 18, `bring` 3, `corners` 10,
  `credentials` 50, `decisions` 3, `deputy` 5, `evacuees` 28, `hazards` 5, `ics100` 33, `incidentkind` 22, `invites` 32, `joincount` 10,
  `members` 44, `newcomer` 3, `par` 10, `parbyname` 10, `people` 28, `rewalks` 10, `safetyset` 23, `scene` 9, `tags`
  28, `tellbase` 17, `transports` 33, `walkfix` 10, `waterwords` 13. The full smoke run, in headless Chrome, release
  by release: v75 822 of 852, v76 817 of 836, v77 891 of 902, v78 913 of 917, v80 918 of 921, v81 914 of 923, v82 913 of 924, v83 930 of 932. Every missed suite
  passed alone afterwards except one real miss at v80, fixed inside that release (the Public information section
  vanished once a photo was un-cleared). Run every rule test before a release is called done, not only the new one:
  at v55 and v56 two of them failed on the real database without anyone noticing (punchlist section 16).
- **Known misses in the smoke run,** none of them the code: the division hover card's half-second in `seeded` late
  in a full run (passes alone); the `layers` suite's overlay upload sometimes not arriving within its wait late in a
  run (v50 to v53; passes alone); a suite that reads the panel right after a click that queues a redraw passes with
  the window hidden and fails with it visible (wrap such a read in `until`); the `transports` suite run twice in one
  page fails its Withdraw check (`state.tr.gone` survives `reload()`; reload the page between runs); the `fieldReports` suite's two revisit checks
  after 22:00 local, when the revisit two hours ahead falls tomorrow and `revisitWords` says so while the check
  expects the bare time (seen at v75, on `main` at v74 the same: run the suite earlier, or teach the check the
  word). Headless, as on 19 October: a hidden phone frame's outbox landing its tap late (`safetyset`, `walkfix`), the `log`
  suite's star checks and a row-level-security error late in a long run (`log`, `evacuees`, `transports`), a suite
  throwing on a timing wait (`rewalks`, `transports`). Rerun a missed suite alone before it counts.
- **The Google Maps key** is in `config.js` since 19 October: a browser key from Google Cloud project
  `clicktooling-drive` (the owner's account robert@douglasmining.com), named "clickEMT browser key", restricted to the
  HTTP referrers `https://clickemt.com/*` and `http://localhost:8766/*` and to three APIs: Map Tiles API (the Google
  layers in the Layers picker), Places API (New) (the address box, v78) and Geocoding API (enabled, unused: its web
  service refuses a referrer-restricted key, so v78 uses Places Text Search instead). The file is public; the
  referrer restriction is what keeps the key safe. It cannot be tested with curl, only from a page on one of those
  two sites: the Test button under gear → Incident settings, or `testGoogleKey` in `js/shared/layers.js` from
  `http://localhost:8766/`. The address lookup was tried once against Google on 19 October: "1200 Mill St Austin"
  gave five suggestions and the first resolved to its point. A checkout served on any other port gets the Google
  layers' refusal and the mock's stand-in for Places.
- **Waiting on Grace, outside the code:** the contact for "Pilot it with your agency" on the front door (Get in touch
  points at the GitHub issues until there is an email); the pilot agreement draft, a Claude Doc on claude.ai with an
  open comment in section 6 (a free pilot, and the 30-day clearing); and the questions in section 7 of the plan doc,
  asked before v54 to v56 were built and still unanswered there. Both docs are private to Grace's account; ask her to
  share them.
- **The server code:** the Edge Function `invite` (`supabase/functions/invite/`), the app's only server code, deployed
  with `supabase functions deploy invite --project-ref cjwybuhogxyayjnuxpem --use-api` (the Supabase CLI's saved
  login; no Docker). Its secrets are the project's (`RESEND_API_KEY`, `RESEND_DEFAULT_FROM`, the Supabase keys) plus
  `APP_URL` (`https://clickemt.com`), set for this app. On the evening of 18 October the v73 build session changed
  only its email's words ("there is no password: next time, a six-digit code to this address does") and redeployed
  it, on its own call, before v73 was on `main`: the live email and the live site agree again since v73 landed. A
  deploy needs Todd's own word; see the rules below.
- **Sign-in by a code (v73) is built but cannot work for real yet**: the shared project needs these settings, none
  changed as of 19 October (the app side is built and tested on the mock). Each is project-wide, so the charity app sees it too; Todd sets
  them, in the dashboard of project `cjwybuhogxyayjnuxpem`:
  1. **An SMS provider**, or a mobile number's code never sends and the door says "Text messages are not set up on this
     server yet: sign in with your email address" (the email path works without it). Authentication → Providers →
     Phone: Enable phone provider, pick the provider and paste its credentials. **Twilio Verify** is the one to pick:
     Twilio sends the code, retries and rate-limits it, and Supabase needs only the Account SID, the Auth Token and the
     Verify Service SID from the Twilio console (a Verify service costs per check, no phone number to rent). Twilio
     programmable SMS (a number of your own, the same SID and token, a Message Service SID), MessageBird and Vonage are
     the others. Leave "Enable phone confirmations" on. Fewer than a few hundred codes a month stay in cents.
  2. **The Magic Link email template** must carry the code: Authentication → Email Templates → Magic Link, add
     `{{ .Token }}` to the body (for example "Your code is {{ .Token }}. Or open this link: {{ .ConfirmationURL }}");
     without it the email has the link alone and the code box on the form has nothing to take. This changes the charity
     app's magic-link emails too, so word it for both. Keep the OTP length at 6 (Authentication → Providers → Email):
     the forms check six digits by themselves.
  3. **Custom SMTP** before a real incident: Supabase's built-in sender is rate limited to a few emails an hour and
     meant for testing, so a check-in table of twenty phones would stall. Authentication → SMTP Settings: the project
     already has a Resend account for the invite function (host `smtp.resend.com`, port 465, user `resend`, the API key
     as the password, the sender the project's verified address, the same one `RESEND_DEFAULT_FROM` holds), then raise
     the email rate limit under Authentication → Rate Limits.
  4. **The redirect allow list** already carries `https://clickemt.com/**`, `http://localhost:8766/**` and
     `http://localhost:8782/**` (set for v56): a code's email link lands on the page it was asked from, with `?join=`,
     `?band=` or `?invite=` when one was waiting, which the `**` patterns cover. Check once that the first real link
     lands on clickemt.com and not on the site URL (the charity app's).
  Sign-ups stay on (`disable_signup = false`): a new address or number makes its account on its first code, and
  turning them off would make an invitation the only way in. "Confirm email" may stay on: the code or the link
  confirms in the same step. Accounts from before v73 keep their password in Supabase unused; a code to the same
  address signs them in.  The product owner chose these settings as the next piece on 19 October. Each one is an auth change on the shared
  project and needs the owner's own word, change by change.
- **Settings changed on the shared project** (18 October, for v56): the auth redirect allow list gained
  `https://clickemt.com/**`, `http://localhost:8766/**` and `http://localhost:8782/**` (without them Supabase sends an
  invitation's link to the site URL, which is the charity app's), and sign-ups were turned back on after the charity
  app had turned them off for a few hours (email confirmation is still required). The project's other auth settings,
  its email hook (`auth-email`) and its other functions belong to the charity app; leave them alone.
- **What shipped on 18 October,** one release per note of Todd's walk of the base, each with its section in
  [punchlist.md](punchlist.md) and its "Re-walk after vN" in [walkthroughs.md](walkthroughs.md): v57 the check-in
  head count put back on the real database (migration 0034); v58 Show me around; v59 the header's right end and a
  clock that swaps to UTC; v60 a cleaner base (eight marks); v61 the units section; v62 confirmations as the app's
  own dialogs, and the band door; v63 Replay, a time you name; v64 the pages as windows; v65 the People board as
  cards and a drawer; v66 Went to and On which run as chips; v67 a picture by its corners (0035); v68 Need help now,
  what's wrong and what you need (0036); v69 claim a band, submit licences, Operations confirms (0037); v70 a
  transport on the map; v71 and v72 the 211 as a table, then per the mock-up's panel; v73 sign in by a code; v74 tell the base, one
  scale and a stuck flag (0038). Before
  that day: v38 to v48 from the walk at v37, v49 the front door, v50 to v53 from the walk at v48, v54 the transport
  board, v55 QR bands, v56 invitations by email.

## Open work, in order

The product owner set this order on 19 October.

1. **The sign-in settings** on the shared project, the list above: an SMS provider, `{{ .Token }}` in the Magic Link
   template, custom SMTP. Each on the owner's word, in the Supabase dashboard with the owner signed in, and each
   written down here once changed.
2. **The first real incident, invitation and code,** by hand on a phone and a laptop: open an incident on
   clickemt.com, invite yourself from the Members tab, sign in with a code by email and by text, join a phone with
   the code, clear a house, and read the 214.
3. **The fresh walk** by Grace's routine, every persona and every job, at the version then live. Most new work has
   come from walks; see [walkthroughs.md](walkthroughs.md).
4. **Smaller open items,** each in its punchlist section: the sixteen thin starters' words read by crews of their
   kind (section 36; the kind's column came as v82, section 41, and the facility card's address box as v83, section 42);
   and the walk's remainders under [The walk of 18 October, and
   what is open](#the-walk-of-18-october-and-what-is-open).
5. **Talked through, not drawn:** a mass casualty module, with triage colours and tag numbers on the QR bands, a
   count by colour on the base, the Medical Branch on the 203 and the 207, hospital capacity, and a METHANE-style
   declaration to every phone. It is a roadmap slice of its own, and wants a mock-up first.

## What only Todd can set

Nothing here is code. As of 19 October the first is done and the other two are not.

- **The Google Maps key:** set on 19 October from the owner's Google account; see "Where things stand".
- **The three settings for sign-in by a code** (the list above): an SMS provider, `{{ .Token }}` in the Magic Link
  template (this one touches the charity app's emails), custom SMTP. Without the first, mobile numbers cannot sign in;
  without the second, the email has only the link; without the third, twenty phones at a check-in table stall.
- **The first real incident, invitation and code.** The live database is empty of incidents; nothing has been sent
  for real. The first of each is a test to do by hand, on a phone and a laptop, before a pilot.

## How Todd works, and the rules he set

Todd walks the base and the phone in the mock and sends one note per thing, often with a screenshot. The rules
below are his, with the day he set them, and the "main session" is the Claude Code chat that coordinated the work.

- **Every piece of work goes to its own session; the main chat coordinates** (18 October). The main chat answers
  him, briefs a session per mock-up or build, relays their reports, and lands releases. Nothing is built in the
  main chat itself.
- **A mock-up first, his yes, then one release per piece** (18 October, all day). Each note gets a click-through
  page in `try/mockups/` (the ask in his words, the screens, the decisions as short questions with the recommended
  answer first); he answers; the piece is built as one release and the page gets a "Built as vN" line.
- **Push each release as soon as it is green and tell him when it is live** (18 October, evening). The routine
  (check, test, the full smoke run, every rule test) is the gate; no question before a push.
- **Apply a release's migration when it is time, without asking** (18 October, his words typed into the v68 build
  session). He approved 0034 to 0037 one by one before that.
- **A function deploy, or any change to the shared project's auth settings, still needs his own word.** He never
  lifted this one. On 18 October the v73 session redeployed `invite` on a brief that repeated CLAUDE.md's "deploy
  before pushing" without this rule; the rule now stands in every brief, in words.
- **Archive a finished thread** once its work is landed and it has no open question (18 October).
- **Fewer, plainer words everywhere** (18 October, throughout): twelve words at most on a label, one line of purpose
  on a sheet, a heading of one or two words.
- **The repository's own rules,** older than that day: nothing the user made is ever deleted; the database writes
  the activity log; a rule both views obey lives in `js/shared/rules.js` or the database; everything on the shared
  Supabase project carries the `ic_` prefix and nothing else there is touched.

## Read these first

1. [README.md](../README.md): what the app does, feature by feature, and how to run it, including mock mode.
2. [CLAUDE.md](../CLAUDE.md): the product rules, the stack, the release routine, and a long list of gotchas, one per
   feature. Written for an AI assistant, but it is the most complete technical guide to the code.
3. [audit-2026-10-18.md](audit-2026-10-18.md): the walk's audit, every ask of 18 October against `main` at v67,
   with where each landed and how it differs from his words. The open rows are listed below.
4. `try/mockups/` (published at https://clickemt.com/try/mockups/): the design record of every piece since v58, one
   page per note, each ending with the decisions and what was built.
5. [personas.md](personas.md): the twelve people the app is designed around, from the Incident Commander to a
   shelter desk volunteer. [guides/](guides/README.md) has a guide for each, their jobs step by step with the words on
   the screen, and `/try/` (the public demo, on the stand-in with `?demo`) walks one beside the base and the phone.
6. [walkthroughs.md](walkthroughs.md): each persona walked through the app, what confused or stopped them, and the
   re-walk after each round of fixes. This is where most new work comes from.
7. [ROADMAP.md](../ROADMAP.md): the original plan for bringing ICS into the app, ticked as it shipped.

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
  touch nothing else in that project. Its auth settings (sign-ups, the redirect allow list, the email hook, the phone
  provider, the email templates, SMTP) are project-wide: a change there reaches the charity app too, so change them
  only when this app needs it, on Todd's word, and write the change down in "Where things stand" above.
- **No function deploy and no auth change without Todd's own word.** A brief that says "deploy if you changed it",
  or CLAUDE.md's release step, is not that word. Migrations are the one thing he said to apply without asking.
- **A function a migration redefines starts from its newest body.** `ic_join` and many triggers are redefined
  release after release; take the body from the highest-numbered migration that defines it
  (`grep -l "function public.ic_join" supabase/migrations/*.sql`), never an older one, or earlier work is lost on the
  real database while the mock keeps it, as 0032 lost v29's head count. Only the rule tests against the real database
  catch that.
- **`config.js` holds only public values** (the publishable key). Never put a secret key in it.

## Getting it running

You need Python 3 and Node (v20 works). There is no build step and nothing to `npm install`. For anything that
touches the real database or the Edge Function you also need the Supabase CLI, logged in once (`supabase login`) with
an account that has access to the project (see Database access). For pushing, the GitHub CLI logged in
(`gh auth login`), or any push access to the repository.

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
`python3 -m http.server` lets the browser keep stale files. A second checkout (a git worktree, say) is served on its
own port with `PORT=8798 python3 dev/serve.py 8798`; the suites read whatever port they are served from.

## Testing

- `npm run check`: syntax-checks every JS file.
- `npm test`: the Node tests in `dev/` for the pure modules (rules, hours, briefings, the printed map, QR codes,
  licence barcodes, the photo export).
- **Smoke suite**, in the browser against the mock: open `http://localhost:8766/?mock` at 1280 px wide, with no other
  mock tab open and the window visible, and in the console run

  ```js
  const { run } = await import('/dev/smoke.js'); await run()
  ```

  It drives both views through 42 suites (v80) and takes one and a half to five minutes, depending on the machine;
  `run({ only: ['evacuees'] })` runs one suite. The window must stay visible (the base redraws on animation frames,
  which a hidden tab never gets), and at narrow widths the base switches to its phone layout and some checks fail.
  Reload the page before a second run. In an embedded browser with a short script timeout, start it detached and
  read the result when it is done:
  `window.__smokeResult = null; import('/dev/smoke.js').then((m) => m.run()).then((r) => { window.__smokeResult = r; })`.
  An embedded browser usually refuses the camera: the suites scan bands and codes by typing the number, as a phone
  whose camera refuses does. The known misses are listed under "Where things stand".
- **The smoke suite headless** (v75), the way every release on 19 October was tested: `npm run smoke`
  (`dev/smoke-headless.py`) runs the same suite in headless Google Chrome from `/Applications`, for a machine with no
  window to keep visible (the Browser pane only draws while it is on screen, and the suite stalls without frames).
  `python3 dev/smoke-headless.py --url http://localhost:8770/?mock --port 9340 transports` runs one suite from a
  checkout served on 8770 with Chrome's debugging port 9340, so two runs can go at once; `--log file` keeps the
  console lines and the result; `--eval "<js>"` evaluates an expression on the page instead. A full run takes about
  twenty minutes headless and misses more on timing than a window does (between 3 and 30 checks a run on 19
  October), so rerun a missed suite alone before it counts, as the rule above says.
- **The front door's pictures** (v81): `python3 dev/front-shots.py` shoots the
  five pictures in `images/front/` from the mock in headless Chrome. Redo them when a screen they show changes.
- **SQL rule tests**, against the real database: `python3 dev/sbq.py supabase/tests/<file>.sql`. Each runs in one
  transaction that rolls back, so nothing is left behind, and returns rows that should all say `ok: true`. Run all
  of them (25 files at v79) before a release, not only the new one.

## Database access

`dev/sbq.py` runs a SQL file through the Supabase Management API using the Supabase CLI's saved login, so you need a
Supabase account with access to the charity-tooling project and `supabase login` done once. Ask the product owner
for an invitation to the organization that holds it (Grace held access before 19 October).
Apply a migration with `python3 dev/sbq.py supabase/migrations/<file>.sql`, and keep the file in the repo. Never use
`supabase db push`. `python3 dev/sbq.py -c "<sql>"` runs one statement, which is how "is there an incident yet" was
answered.

## Shipping a change

The routine for every release, as it was run on 18 October (CLAUDE.md, "Every release", says the same in fewer
words):

1. The migration first, if the database changes, numbered with the next free number; mirror it in
   `dev/mock-supabase.js` (tables, defaults, triggers, policies, and a seed row that uses it; bump `SEED_VERSION`);
   add a rule test in `supabase/tests/` that rolls back. Check that no other branch on `origin` already carries that
   migration number.
2. Build both views; add or extend a smoke suite.
3. Bump `VERSION` in `sw.js` (the service worker is cache-first, so phones keep the old app until it changes) and add
   any new JS or CSS file to its `SHELL` list.
4. `npm run check`, `npm test`, the full smoke run (from the checkout's own port, the window visible), and every rule
   test on the real database.
5. Apply the migration before pushing, because the apps read new columns on start. If `supabase/functions/` changed,
   the deploy waits for Todd's word (the command is under "Where things stand"); the smoke suite runs against the
   mock's stand-in for it (`client.functions.invoke` in `dev/mock-supabase.js`), so keep the two saying the same thing.
6. The docs, every release: a feature line at the top of README.md's version list; a gotcha in CLAUDE.md (short); a section
   in punchlist.md with its table of what was built, a row in its table, and its head's "next is vN+1" and the next
   migration number; "main is at" here; "Re-walk after vN" at the end of walkthroughs.md; "Built as vN" on the
   mock-up page.
7. One commit titled after the feature with the version in parentheses, matching `sw.js`: `Shelter and evacuee
   records: who was moved where (v26)`, ending with a `Co-Authored-By:` line naming the Claude model that wrote it
   (Claude Fable 5.1 through the morning of 19 October, Claude Opus 5.5 after). Test-only changes start with `smoke:`
   or `dev:`, docs with `docs:`.
8. Land it: a build session pushes its branch (never `main`); the main session fast-forwards `main` to it (`git merge
   --ff-only`), runs check and test once more, pushes, and checks that `https://clickemt.com/sw.js` reads the new
   version (GitHub Pages builds in about a minute; `gh api repos/clickconstruction/clickEMT/pages/builds/latest` says
   when). A pull request is optional; GitHub marks it merged once its head is on `main`.
9. Walk the changed screens as the personas who needed them and add the "Re-walk after vN" section to
   `docs/walkthroughs.md`.

Grace's standing preference: after each change, ask "is this the best we can do?" and improve it before moving on.

## Working with sessions

On 18 October the work ran as one coordinating chat and a session per piece, in the Claude desktop app. What to
know if the next person works the same way:

- **A build session works in its own git worktree** (`.claude/worktrees/<name>`, a branch cut from `main`), serves
  it on its own port, commits one release and pushes the branch. Early on 18 October four sessions edited the shared
  checkout at once and collided; worktrees ended that. The worktrees are local to the Mac they ran on.
- **On 19 October** the same pattern ran from one coordinating chat on the product owner's Mac, with one build
  session per piece. The coordinator landed each release by fast-forward, except v78, which was cherry-picked onto
  `main` because a docs commit sat on top; so `origin/starters` is not an ancestor of `main`, though everything on it
  is. The worktrees left on that Mac: `incident-line`, `starters`, `water-words`, `leftovers`.
- **Commit as soon as check and test pass, and push the branch.** v81's session stopped on a usage limit with its
  whole release uncommitted in its worktree, where nobody on another computer could have found it. A pushed branch
  loses nothing when a session stops.
- **Branches on `origin` that can be deleted,** all merged into `main` or carried by it: `claude/credentials-61131d`,
  `claude/sleepy-rhodes-9aaea0`, `handoff`, `imagery`, `incident-line`, `mayday`, `passwordless`, `starters`,
  `transports-stacks`, `water-words`, `worktree-transports-211`, `leftovers` (v81), `kind-column` (v82) and `facility-address` (v83).
- **Todd types into a build session directly** when he wants to: he approved migration 0036 and the v66 push that
  way, and asked the audit session to start builds. A session's report may therefore carry his words that the
  coordinating chat never saw; read the report before relaying it, and take "Todd said" in it as his unless it
  cannot be.
- **A brief states the rules in words**: the worktree, one release per commit, push the branch only, apply the
  migration when it is time, no deploy and no auth change without Todd, report the counts (check, test, the full
  smoke run with its suites, every rule test with its files), say what was not verified and what was built beyond
  the brief. Two sessions applied migrations and one redeployed a function on briefs that lacked a rule.
- **Sessions' hand-over notes live outside the repository,** in `~/Library/Application Support/Claude/side-session-notes/<session id>/`
  on the Mac they ran on, and a session's folder goes when it is archived. Everything still useful from the 18
  October notes is in this file, the punchlist's sections or CLAUDE.md's gotchas; the audit table is
  [audit-2026-10-18.md](audit-2026-10-18.md). Do not count on finding them.
- **Two coordinators is one too many.** For a while the audit session (started read-only) also started builds and
  offered sessions to Todd, so two builds of the same two items ran at once and one was dropped. One chat lands
  releases and numbers them; a session that finds `main` has moved under it rebases and renumbers.

## The walk of 18 October, and what is open

Todd walked the base and the phone at v59 and kept sending notes; the audit in
[audit-2026-10-18.md](audit-2026-10-18.md) checked all 27 against `main`. With v68 to v73 landed, every ask is on
`main` or, for v74, about to be. What is left, in his words where there are any:

- **Two deviations he was asked about and has not answered:** the connection's card opens on a click of the live
  pill, not on hover as he said (punchlist section 19 decided it); the head count sits in the header beside Find a
  person, not beside the People board's find box as he said. Both are small if he still wants them.
- **Toasts.** "All notifications like this should be modals" was read as the questions (every `confirm()` became
  the app's own dialog at v62); about 110 toasts on the base and 77 on the phone remain for outcomes ("Boundary
  saved", "Hazard sent"). He has not said whether he meant those too.
- **From punchlist section 15:** the header row grouped and a new incident starting emptier were built as v80;
  every time in UTC and the front door's screenshots as v81. Still open:
  the labels on the public demo; Replay's past periods in the menu and clicking the time to type a moment; what
  happens to a division held by a unit made Operations. Section 15's
  "mocked up and waiting" list still carries pieces since built (each says so, except imagery, v67); tidy it when
  the section is next touched.
- **A transport on the map** (v70, `try/mockups/transports.html`): v75 took the re-walk's three (the pill clear of
  the heading arrow, two runs on one phone as one column of pills, two runs to one shelter as rings one inside the
  next) and the page's first open item, the Transport runs box in the Layers panel (punchlist section 34). A pickup
  as a point, the run on the phone's mini map and a trail stay open, the page's recommendations standing.
- **The 211** (v71, v72): no hours column (the Hours sheet has them) and no signature line per person.
- **Report a hazard keeps its four urgency chips** and their long words until its own walk; v74 shortens the scale
  for messages and requests only.
- **Message Operations and Ask for something** (`try/mockups/tell-the-base.html`): the six decisions were taken as
  the page recommended and built as v74, live.
- **The older "Still bites" items** from the re-walks before the walk (section 15's second list): the PAR by scan is
  one scan per press; runs nobody updates; a pickup is not a point; the desk cannot put a walk-in on a run; the base
  cannot give a sheltered person a band; Boarding needs a run loading from here; the Public page is a list; Details
  per unit; a checked-out membership still listed; a unit's invitation opened on a laptop.

## Design mock-ups

Since v58 every piece was designed as a click-through page in `try/mockups/` (published at
https://clickemt.com/try/mockups/), judged by Todd, then built; each page ends with the decisions, and most with a
"Built as vN" line (`people.html`, `replay.html`, `mayday.html` and `credentials.html` lack it; add it when they are
next touched). The pages: `index.html` (`#discovery`, Show me around, v58; `#cleaner`, the walk's ten panels, v60
and v61, with the 211 as a table as panel 10, v71 and v72), `people.html` (v65), `replay.html` (v63), `modals.html`
(v64), `imagery.html` (v67), `mayday.html` (v68), `credentials.html` (v69), `runchips.html` (v66),
`transports.html` (v70, written after the build as its record), `tell-the-base.html` (v74, built, on its branch),
`incident-line.html` (the header's second line broken out into a card; drawn at v75, built as v76 on its six decisions),
`starters.html` (incident kinds and starter periods: two rows of buttons on the New incident sheet, a starter that
pre-fills period 1, Flood in full and sixteen sketched, and the centre by address, an Address box with Google Places
suggestions on the same sheet; drawn at v76 from the notes of 19 October, built as v77 and v78 with every decision as
recommended and no migration),
`leftovers.html` (the four leftovers of the walk at v59 in punchlist section 15: the header row grouped as a labelled row,
a new incident starting emptier with the codes first, every time in UTC on the clock's click, and the front door's
pictures re-shot from headless Chrome; drawn 19 October at v76; the header and the emptier start built as v80, every
decision as recommended; every time in UTC and the pictures, by `dev/front-shots.py`, built as v81).

The larger features before that were designed as mock-up canvases on claude.ai, private to Grace's account; ask her
to share any you need. The punchlist repeats every decision that matters, so you can work without them.

- "The big six": v26 to v28 (evacuees, members, retention, time in the water, settings, the public set).
- "ICS-100 gaps": what v24 added from the ICS-100 course.
- "Planning, Logistics and Finance": v23.
- "People and tags": the first proposal for tracking people with tags and trackers. Phase 1, the QR bands, was built
  as v55; phase 2, trackers, waits on the hardware.
- "Invite by email, a transport board, and people and tags" (a Claude Doc, 18 October): the plan for v54 to v56,
  each piece with its design, its data, its decisions and "done when", and section 7's questions, still open. Its
  click-through mock-ups are the first pages of `try/mockups/`.
- The pilot agreement (a Claude Doc, 18 October): the draft an agency signs to pilot the app, with one comment open.

## Layout

- `index.html`: the base, and when signed out the front door (the join code box first, then the landing).
  `404.html` asks for the join code too, at any address that is not a page.
- `js/base/`: the base. `main.js` wires events, `ui.js` draws the panels and the printed forms,
  `map.js` the Leaflet map, `print-map.js` the maps on printed 204s, `photo-export.js` the public photo zip,
  `placing.js` a picture dragged into place by its corners, `discover.js` the Show me around labels.
- `field/index.html`, `js/field/`: the phone. `main.js` is the app, `camera.js` photos, `sensors.js` GPS and compass,
  `scan.js` QR and licence barcodes.
- `js/shared/`: `rules.js`, `data.js`, `queue.js` (the outbox), `briefings.js`, `hours.js`, `layers.js`, `qr.js`,
  `licence.js`, `exif.js`, `theme.js`, `update.js` (new versions: the reload on the front door, the chip when signed
  in), `places.js` (v78: Google Places suggestions and points for the address box, fetch only).
- `try/`: the public demo on the mock's stand-in (`?demo`): the role cards and tours (`tours.js`), the full-screen
  base and phone (`try/base/`, `try/phone/`) and the mock-up pages (`try/mockups/`).
- `supabase/migrations/`, `supabase/tests/`: the database and its rule tests. `supabase/functions/`: the Edge
  Function `invite`, the app's only server code.
- `docs/`: this file, the punchlist, the walkthroughs, the personas, the audit of 18 October, `guides/` (a guide per
  persona, read raw by the demo); `images/front/`: the front door's screenshots.
- `dev/`: the mock, the smoke suite, the Node tests, the dev server, `sbq.py`, `smoke-headless.py` (the smoke suite
  in headless Chrome) and `front-shots.py` (the front door's pictures, v81).
- `vendor/`: the QR code maker and readers, the licence barcode reader and supabase-js, with their licences in
  `vendor/LICENSES.md`. Leaflet loads from cdnjs.
- `.claude/launch.json`: the Browser pane's two dev-server configs; `.claude/worktrees/`: the build sessions'
  worktrees on this Mac (not in the repository).

## History

Facts that were true and are kept for the record.

- v25 was tested independently on 17 October: every fix held up by hand at phone and desktop widths, and the
  cleared-photo download was opened and checked (no coordinates, no GPS data in the files).
- The `layers` suite's overlay-upload miss (v50 to v53) did not come up in the full runs at v54 to v57; the `ics100`
  board check was the first "reads too soon with the window visible" miss (v62) and now waits.
- The shared project's sign-ups were off for a few hours on 18 October (the charity app's change) and were turned
  back on for v56; email confirmation stayed required. v73 made the question moot: a code or a link confirms in the
  same step.
- v57 to v65 were pushed one by one on Todd's yes; from v66 the rule was "push when green". Migrations 0035 and
  0036 were applied inside their build sessions, 0035 before he had lifted the rule and 0036 on his click there;
  0037 on his yes to the main chat, 0038 on the standing word. The v73 session's function redeploy was the one deploy
  without his word.
- PR #1 (imagery, v67), PR #2 (mayday, v68) and PR #3 (a transport on the map and the 211, v70 and v71) were merged
  as fast-forwards of `main`; every other release was a branch fast-forwarded without a pull request.
- On 19 October the work moved to the product owner's Mac: v75 to v81 landed between early morning and afternoon, the
  owner's Supabase login made the rule tests and migration 0039 possible there, and the Google key was made in the
  owner's Google Cloud project with Claude driving the console in Chrome.
