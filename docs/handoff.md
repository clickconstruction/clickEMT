# Handoff

For whoever picks up clickEMT next, on another computer. This says where things stand, how to get it running, how
a change is shipped, how the work was run on 18 October, and where the open work is. The open work itself is in
[punchlist.md](punchlist.md). Written 17 October 2026, brought up to date late on 18 October 2026 at v74.

## Start here

Two views of one incident: the base (the map at the command post) and the phone app a unit installs. One Supabase
database, shared with a charity app, holds both. Pushing `main` deploys https://clickemt.com through GitHub Pages.

- `main` is at **v79**, "The 214's water words as 45m", live since the morning of 19 October, right after v78 (the
  centre by address), v77 (incident kinds and starter periods), v76 (the incident line broken out), v75 (runs that
  share a point) and the headless smoke runner (`npm run smoke`). Migration 0039 is applied; the next free number is
  0040.
- The first five things on a new computer:
  1. Clone `clickconstruction/clickEMT` and run `npm run serve`; open `http://localhost:8766/?mock` (the base) and
     `http://localhost:8766/field/?mock` (the phone). No build, no `npm install`, no account.
  2. `gh auth login` (the GitHub CLI): pushing `main` deploys, and a release lands as a plain fast-forward of `main`.
  3. `supabase login` (the Supabase CLI) with an account that has access to project `cjwybuhogxyayjnuxpem`:
     `python3 dev/sbq.py` runs SQL through the Management API with that saved login, which is how migrations are
     applied and the rule tests run. Ask Grace for access.
  4. A browser window at 1280 px wide for the smoke suite (the Claude desktop app's Browser pane was used; its launch
     configs are in `.claude/launch.json`, `incident-map` on 8766 and `incident-map-any-port` on 8781). The window
     must stay visible for a run.
  5. Chrome, or any real browser, for anything with a camera: the Browser pane has none, so the band and licence
     scanners were only ever seen refusing there. A camera test in Chrome passed on 18 October.
- Then read [What only Todd can set](#what-only-todd-can-set) and [The walk of 18 October, and what is
  open](#the-walk-of-18-october-and-what-is-open).

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

- `main` is at **v79**, "The 214's water words as 45m" (after v78, The centre by address; v77, Incident kinds and starter
  periods; v76, The incident line broken out). The service worker reads `v79`. Migration `0039_water_words.sql` is
  applied (19 October; `ic_duration_text(45)` reads "45m" on the real database) and the 25 rule tests pass there, 439
  of 439; the next free migration number is **0040**. The address lookup was tried once against
  Google from a page on localhost:8766 on 19 October: "1200 Mill St Austin" gave five suggestions and the first resolved
  to its point through Places; the Geocoding web service refuses a referrer-restricted key by design, so the module
  never calls it. The Supabase CLI on the user's Mac reaches the
  project since 19 October (`supabase login`), so `dev/sbq.py` applies migrations and runs the rule tests there; all
  24 files, 426 checks, passed on 19 October. None of v75
  to v78 has a migration. **`0039_water_words.sql` (v79, branch `water-words`) was applied on 19 October** from its
  build session with `dev/sbq.py`: the 214 now reads "Unit 2 out of the water after 45m", as every other duration has
  since v76 (punchlist section 38). The next free migration number is `0040`.
- **Database:** Supabase project `cjwybuhogxyayjnuxpem` ("charity-tooling"). Migrations `0001` to `0038` in
  `supabase/migrations/` are all applied (`0038_tell_the_base.sql`, v74's, from its build session on 18 October,
  before the release landed). They were applied by hand with `dev/sbq.py` and are **not** recorded in
  `supabase_migrations.schema_migrations`, so check for an object (a table or column) rather than reading that table.
  `0039_water_words.sql` (v79's) was applied the same way on 19 October from its build session, before the release
  landed: no table or column, the 214's water line through `ic_duration_text`. The next free migration number is
  **0040**.
- **The live database holds no incident yet** (checked on 18 October): everything so far was done in the mock and
  the suites. The first real incident, the first real invitation email and the first real sign-in code are all still
  to happen.
- **Tests on `main` at v79** (branch `water-words` on the v78 tree, 19 October, before landing): `npm run check` and
  `npm test` pass; the `safetyset` suite headless 39 of 39 alone, first time, on the rebased tree (served on 8768; before the rebase a first run had missed three at the phone half when the hidden frame's outbox landed its tap late, the known timing miss, and passed 39 of 39 alone on the next run). The SQL rule tests on the real database after
  0039 was applied: 25 files, 439 checks, all passing: `accept` 4, `alertwords` 18, `bring` 3, `corners` 10, `credentials` 50, `decisions` 3, `deputy` 5, `evacuees` 28, `hazards` 5, `ics100` 33, `invites` 32, `joincount` 10, `members` 44, `newcomer` 3, `par` 10, `parbyname` 10, `people` 28, `rewalks` 10, `safetyset` 23, `scene` 9, `tags` 28, `tellbase` 17, `transports` 33, `walkfix` 10, `waterwords` 13.
- **Tests on `main` at v76:** `npm run check` and `npm test` pass. The full smoke run was made in headless Chrome
  (`npm run smoke`, the pane being off screen): 822 of 852 on the v75 tree and 817 of 836 on the v76 tree, every
  missed suite passing alone afterwards (the misses are timing and row-level-security slips of a long headless run;
  the handoff's rule, rerun alone before it counts, held). No rule test was run on the real database since v74:
  the Mac that built v75 and v76 has no Supabase login, and neither release changed the database.
- **Tests on `main` at v74** (the last run on the real database): `npm run check` and `npm test` pass. The full smoke run is 42 suites, 869 checks
  (868 of 869 on the rebased tree over v73, the one miss the known hover-timing flake in `seeded`, which passed 24 of
  24 alone). The SQL rule tests are 24 files, 426 checks, all passing on the real database: `accept` 4, `alertwords` 18, `bring` 3,
  `corners` 10, `credentials` 50, `decisions` 3, `deputy` 5, `evacuees` 28, `hazards` 5, `ics100` 33, `invites` 32,
  `joincount` 10, `members` 44, `newcomer` 3, `par` 10, `parbyname` 10, `people` 28, `rewalks` 10, `safetyset` 23,
  `scene` 9, `tags` 28, `tellbase` 17, `transports` 33, `walkfix` 10. Run
  every file before a release is called done, not only the new one: at v55 and v56 two of them failed on the real
  database without anyone noticing (punchlist section 16).
- **Known misses in the smoke run,** none of them the code: the division hover card's half-second in `seeded` late
  in a full run (passes alone); the `layers` suite's overlay upload sometimes not arriving within its wait late in a
  run (v50 to v53; passes alone); a suite that reads the panel right after a click that queues a redraw passes with
  the window hidden and fails with it visible (wrap such a read in `until`); the `transports` suite run twice in one
  page fails its Withdraw check (`state.tr.gone` survives `reload()`; reload the page between runs); the `fieldReports` suite's two revisit checks
  after 22:00 local, when the revisit two hours ahead falls tomorrow and `revisitWords` says so while the check
  expects the bare time (seen at v75, on `main` at v74 the same: run the suite earlier, or teach the check the
  word). Rerun a missed suite alone before it counts.
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
- **What shipped on 19 October,** early: v75 Runs that share a point (the pills in a column clear of the heading
  arrow, the rings one inside the next, the Transport runs box in the Layers panel; punchlist section 34) with
  `dev/smoke-headless.py`; v76 The incident line, broken out (what changes on the line with the alarm first, the rest
  on a card of four tiles; durations as "4h 8m"; punchlist section 35, mock-up `try/mockups/incident-line.html`).
- **Open work:** the walk's audit and leftovers are under [The walk of 18 October, and what is
  open](#the-walk-of-18-october-and-what-is-open). The fresh walk by Grace's routine (every persona, every job) is
  still to do after them. Trackers (tags phase 2) wait on the hardware Grace chooses.
- **Not yet seen working for real:** the first real code by email and by text message, and a real link's landing on
  clickemt.com (v73; the settings under "What only Todd can set" come first; the Browser pane cannot receive email or
  a text message, so the mock's stand-in is what was tested); the first real invitation email (the Edge Function
  `invite` is deployed and refuses a call with no session; the smoke suite drives the flow against the mock's
  stand-in). Send one to yourself from the Members tab: if the mail sender refuses, the row says "could not be
  sent: …" on the tab and in the 214.
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
- **Settings the shared project needs for v73, not yet changed** (sign in by a code; the app side is built and tested
  on the mock, nothing was changed on the project). Each is project-wide, so the charity app sees it too; Todd sets
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
  address signs them in.
- **Settings changed on the shared project** (18 October, for v56): the auth redirect allow list gained
  `https://clickemt.com/**`, `http://localhost:8766/**` and `http://localhost:8782/**` (without them Supabase sends an
  invitation's link to the site URL, which is the charity app's), and sign-ups were turned back on after the charity
  app had turned them off for a few hours (email confirmation is still required). The project's other auth settings,
  its email hook (`auth-email`) and its other functions belong to the charity app; leave them alone.

## What only Todd can set

Nothing here is code. Each was left for Todd on purpose, and none was done as of the evening of 18 October.

- **The Google Maps key** is set (19 October, early morning, by the user with Claude driving the console): `config.js`
  on `main` carries a browser key from Google Cloud project `clicktooling-drive` (the account robert@douglasmining.com),
  named "clickEMT browser key", restricted to the HTTP referrers `https://clickemt.com/*` and `http://localhost:8766/*`
  and to three APIs, Map Tiles API (the Google layers in the Layers picker), Places API (New) and Geocoding API (for
  the address lookup drawn in `try/mockups/starters.html`, not built yet). Those three are the only Maps APIs enabled
  on the project. The file is public, so the referrer restriction is what keeps the key safe; a key with that
  restriction cannot be tested with curl, only from a page on one of those sites (the Test button under gear →
  Incident settings, or `testGoogleKey` in js/shared/layers.js from `http://localhost:8766/?mock`). The incident
  setting under the gear is still there for an incident that wants a key of its own.
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

  It drives both views through 41 suites (v73) and takes one and a half to five minutes, depending on the machine;
  `run({ only: ['evacuees'] })` runs one suite. The window must stay visible (the base redraws on animation frames,
  which a hidden tab never gets), and at narrow widths the base switches to its phone layout and some checks fail.
  Reload the page before a second run. In an embedded browser with a short script timeout, start it detached and
  read the result when it is done:
  `window.__smokeResult = null; import('/dev/smoke.js').then((m) => m.run()).then((r) => { window.__smokeResult = r; })`.
  An embedded browser usually refuses the camera: the suites scan bands and codes by typing the number, as a phone
  whose camera refuses does. The known misses are listed under "Where things stand".
- **The smoke suite headless** (v75): `npm run smoke` (`dev/smoke-headless.py`) runs the same suite in headless Google
  Chrome from `/Applications`, for a machine with no window to keep visible: the Browser pane only draws while the
  session is open on screen, and the suite stalls without frames. `python3 dev/smoke-headless.py transports` runs one
  suite in a fresh page; `--log file` keeps the console lines and the result. A full run takes about a quarter of an
  hour headless and misses more on timing than a window does (30 of 852 at v75 on 18 October: four of the six suites
  that missed passed alone, `tags` on its second run alone, and `fieldReports`'s two revisit misses are the suite's
  own after-22:00 flake, under Known misses), so rerun a missed suite alone before it counts, as the rule above says.
- **SQL rule tests**, against the real database: `python3 dev/sbq.py supabase/tests/<file>.sql`. Each runs in one
  transaction that rolls back, so nothing is left behind, and returns rows that should all say `ok: true`. Run all
  of them (25 files at v79) before a release, not only the new one.

## Database access

`dev/sbq.py` runs a SQL file through the Supabase Management API using the Supabase CLI's saved login, so you need a
Supabase account with access to the charity-tooling project and `supabase login` done once. Ask Grace for access.
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
   records: who was moved where (v26)`, ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` when
   Claude wrote it. Test-only changes start with `smoke:` or `dev:`, docs with `docs:`.
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
  it on its own port, commits one release and pushes the branch. Early in the day four sessions edited the shared
  checkout at once and collided; worktrees ended that. The worktrees on this Mac are local to it; the branches on
  `origin` (`imagery`, `mayday`, `passwordless`, `worktree-transports-211`, `claude/credentials-61131d`, all merged;
  `claude/sleepy-rhodes-9aaea0`, v74; `transports-stacks`, v75; `incident-line`, v76; all merged) can be deleted now
  that v76 is on `main`.
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
- **From punchlist section 15, still open:** the header row grouped (the mock-up at `try/mockups/#discovery` shows
  This period · Boards · Forms · The day); a new incident starting emptier; every time in UTC as a device setting;
  the labels on the public demo; Replay's past periods in the menu and clicking the time to type a moment; the front
  door's screenshots, still the base at v33; what happens to a division held by a unit made Operations. Section 15's
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
recommended and no migration).

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
  in).
- `try/`: the public demo on the mock's stand-in (`?demo`): the role cards and tours (`tours.js`), the full-screen
  base and phone (`try/base/`, `try/phone/`) and the mock-up pages (`try/mockups/`).
- `supabase/migrations/`, `supabase/tests/`: the database and its rule tests. `supabase/functions/`: the Edge
  Function `invite`, the app's only server code.
- `docs/`: this file, the punchlist, the walkthroughs, the personas, the audit of 18 October, `guides/` (a guide per
  persona, read raw by the demo); `images/front/`: the front door's screenshots.
- `dev/`: the mock, the smoke suite, the Node tests, the dev server and `sbq.py`.
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
