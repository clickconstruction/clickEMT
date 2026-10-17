# Punchlist

The open work on clickEMT as of 17 October 2026, after v26 (`e84c308`, shelter and evacuee records). Each
numbered release below is written to be picked up cold: why it matters, what to build, what was already decided,
and how to know it is done. Read [handoff.md](handoff.md) first for how to run, test and ship.

Take them in order. Each release bumps `VERSION` in `sw.js` by one, so the next is **v27**, and each new migration
takes the next free number in `supabase/migrations/`, so the next is **0019**. Most of this work came out of the
persona walkthroughs in [walkthroughs.md](walkthroughs.md); after each release, walk the screens it touched again as
the personas who hit them, and add a "Re-walk after vN" section there, as v25 did.

| # | What | Size | After | Found by |
|---|---|---|---|---|
| 1 | Write the re-walk after v26 (done 17 October, `docs: re-walk after v26`) | an hour | now | the v26 release, cut short |
| 2 | v27 Members and roles, and personal records that clear by rule (shipped 17 October) | medium | 1 | the agency administrator (3 jobs he could not do) |
| 3 | v28 Time in the water, incident settings, the public photo set, and v25's four leftovers (shipped 17 October) | medium | v27 | Rosa (boat crew), Priya (Safety), the administrator, the PIO |
| 4 | v29 Accountability by name (shipped 17 October) | small to medium | v28 | the people release's follow-ups, Rosa's PAR |
| 5 | Small fixes, any time | small | — | testing and hand-over notes |
| 6 | Decisions only Grace can make | — | — | testing and hand-over notes |

---

## 1. Write the re-walk after v26

v26 shipped complete (migration 0018 applied, its rule test `supabase/tests/evacuees.sql` passes 28 of 28, Node
tests green), but its session was stopped while re-walking. Five screenshots were saved and are committed under
`docs/walkthroughs/rewalk-v26-*.jpg`; the written section is missing.

- Walk the shelter desk volunteer's six jobs (persona 10 in [personas.md](personas.md)) and Rosa's intake job
  (persona 4) on the phone at 375 px wide, reading only what is on screen, as [walkthroughs.md](walkthroughs.md)
  describes.
- Append "Re-walk after v26" to `docs/walkthroughs.md` with a table (item, who, what they saw, verdict), using the
  saved screenshots where they fit, and a "Still bites" list.
- Commit as `docs: re-walk after v26`.

**Done** 17 October 2026: the section is in [walkthroughs.md](walkthroughs.md). Its "Still bites" list is six small things (the toast over a sheet's buttons, the house record's save below the fold, the desk's briefing and quick chips, a street in Find a person, the briefing re-shown on a shared phone) that belong with item 5, and two dev notes (a redraw that waits for a frame that never comes in a hidden pane; the mock's accounts are per tab).

## 2. v27 Members and roles, and personal records that clear by rule

**Why.** Anyone holding the printed join card can join as Operations and run the incident. Nobody can see or
manage who is a member. Licence numbers, dates of birth, home addresses and licence photos (and, since v26,
evacuees' names) are kept forever.

**Build.**

1. The join code joins as a unit only. Remove "Join as Operations" with the join code from the incident picker.
2. An Operations code: `ic_incidents.ops_code`, generated, shown only on the Operations home panel with Copy and New
   code (logged), never printed and never on the join card. Joining with it makes the member Operations. The person
   who opened the incident is always Operations and cannot be demoted.
3. A Members tab on the People board: who, agency, role, identity state (verified, not verified, name and phone
   only), with Make Operations / Make a unit, Remove, and removed members listed with Restore. Remove archives the
   membership; the phone shows "You were removed from <incident> by Operations" with Sign out on its next sync. Log
   every role change, removal, restore and new code.
4. Personal records clear on a date. `ic_incidents.clear_personal_at` is set to the close time plus 30 days when an
   incident closes. A SQL function `ic_clear_personal(incident)` blanks the licence number, date of birth, address
   and licence photo on `ic_profiles` (removing the file from the `ic-ids` bucket) for members who are in no open
   incident, reduces `ic_evacuees` to labels without names (keep counts, needs and "family of N"), and stamps when
   it ran. Run it nightly with `pg_cron` if the project has it, otherwise from the base on its next open after the
   date. The closed incident's card shows the date with **Clear now** and **Keep 30 more days**, then "cleared
   <date> by rule", and one line goes in the 214.

**Already decided.**

- Promotion alone is not enough: at 03:00 the relief Operations chief may have nobody awake to promote them, so
  the Operations code exists, and New code retires one that leaked.
- Removing a member while their phone is offline must not lose what the crew already sent. The policy accepts rows
  the phone created before the membership was archived and refuses new ones after.
- Clearing personal records is the one deletion in the app, for personal data only, never for work product. It is
  a visible date with Clear now and Keep longer, not a button someone has to remember.
- Invite-by-email accounts are out: they need server-side auth (an edge function with the service key). The
  Members list and the Operations code close the hole without it.

**Done when.** The migration is applied and kept in `supabase/migrations/`, with a rule test in `supabase/tests/`
(rolled back) covering the Operations code, a removal with a queued row, and the clearing; the mock mirror and its
seed are updated; a smoke suite `members` passes and the full smoke run is green at 1280 wide; `npm test` and
`npm run check` pass; `VERSION` is v27; README and CLAUDE.md say what changed (CLAUDE.md's "Nothing is deleted"
rule names this one exception); items 8 and 10 in `docs/walkthroughs.md` are marked built. Commit:
`Members and roles, and personal records that clear by rule (v27)`.

**Start in.** `js/base/ui.js` (the People board), `js/base/main.js` (the incident picker), `js/shared/data.js`,
`supabase/migrations/0013_people.sql` and `0017_walkthrough_fixes.sql` (`ic_join`, `ic_profiles`),
`dev/mock-supabase.js`.

**Shipped** 17 October 2026 as `Members and roles, and personal records that clear by rule (v27)`, migration `0019_members.sql`, rule test `supabase/tests/members.sql` (44 of 44), smoke suite `members`. One change from the plan: Supabase refuses a SQL delete on `storage.objects`, so the licence photos are queued (`ic_id_purge`) and removed through the Storage API by the base the next time Operations opens it, right after Clear now included.

## 3. v28 Time in the water, incident settings, the public photo set, and v25's four leftovers

**Why.** A boat crew has no way to show how long it has been in the water, and the Safety Officer cannot see who is
past the rotation. The administrator has nowhere to put the Google Maps key. The PIO cannot write a public caption or
record that a photo was checked. Four small things still bite after v25.

**Build.**

1. **Time in the water, per unit.** `ic_members.in_water_since`. One tap in and one out, from the phone's menu and
   the home screen's unit line, through the outbox so it works with no signal. `ic_periods.rotation_minutes`
   (default 45, carried into the next period, 0 turns the nudge off), set on the period sheet's Safety line and
   printed on the 208 and every 204. Past the minutes the phone shows one small banner (never a takeover) and asks
   again at each further rotation; checking out ends the clock; past three rotations the base shows "probably left
   running" instead of a number. The base's accountability rows and unit panel show the time (orange past the
   rotation), and the briefing and situation report list who is in the water. Log in and out with the minutes.
2. **Incident settings.** `ic_incidents.settings` (jsonb, Operations writes) and a Settings sheet from the header's
   incident menu with: the Google Maps browser key and a Test button that opens a Map Tiles session and says whether
   it worked; the personal-records retention days (30, 60 or 90, used by v27's `clear_personal_at`); the default
   rotation minutes. `js/shared/layers.js` reads the key from the settings instead of `config.js`. Settings carry
   into the next incident the same account opens. The log says "Bell set the Google Maps key", never the key.
3. **The public photo set.** `ic_photos.public_caption`, and `public_checked_by` / `public_checked_at`, edited on the
   photo panel by the PIO or Operations ("Checked: no face, no plate, no house number in the frame"). v25's
   "Download cleared photos" becomes "Download the public set": checked photos only, each named by time and place,
   with `captions.txt` carrying the time, the place to the street and the public caption, never coordinates or the
   unit's own note; cleared photos not yet checked are listed as missing. The Public information list shows each
   photo's caption and check, and the situation report counts cleared and checked.
4. **v25's four leftovers** (see "Re-walk after v25" in `docs/walkthroughs.md`):
   - The Agency box's grey placeholder ("Cedar Fork Fire Department") reads like a filled-in answer. Use a plain
     example ("e.g. Red Cross, county sheriff").
   - Half-typed words in a base sidebar form are lost when the panel redraws after focus leaves it. `drawSide` in
     `js/base/main.js` could carry typed values (`value !== defaultValue`) across the redraw.
   - With the safety bar and the PAR bar both open, the safety message's own words are cut off ("…at the park
     entranc…" with only four units waiting). Put the message's words before the waiting list, and shorten the list
     to "waiting on 4" with the names on hover.
   - A boat crew's briefing names only staging under Work area; name the nearest boat ramp (`js/shared/briefings.js`).
5. **A dev fix.** The smoke check "the phone's decoder reads the join link out of the base's QR" hard-codes
   `http://localhost:8766`, so it fails on any other port. Build the expected URL from `location.origin`.

**Already decided.**

- The water clock is per unit, not per person. Per-person clocks need trackers (the People and tags design); with a
  head count of one the two are the same.
- A crew that forgets to tap out must not show six hours in the water, hence the re-asking, the end at check-out and
  "probably left running".
- The Maps key is a browser key by design: every member's browser reads it. The sheet says it must be restricted in
  Google Cloud to the site's address and to the Map Tiles API. Never put a key in `config.js`.
- No EXIF stripping is needed: every phone photo is re-encoded through a canvas (`shrink()` in
  `js/field/camera.js`) before upload, so GPS never reaches the server. A v25 zip was checked and has no EXIF block.
- The PIO's check is a mark, not a second approval: clearing stays Operations' call.

**Done when.** The migration is applied and kept, with a rule test; the mock mirror is updated (with a sample Maps
key so the Layers suite sees Google listed); a smoke suite `safetyset` passes and the full run is green; `npm test`
and `npm run check` pass; `VERSION` is v28; README and CLAUDE.md lines; items 4 and 9 and the PIO's third job in
`docs/walkthroughs.md` marked built. Commit: `Time in the water, incident settings and the public set (v28)`. Then
re-walk Rosa's rotation job, the administrator's key job and the PIO's three jobs.

**Shipped** 17 October 2026 as `Time in the water, incident settings and the public set (v28)`, migration `0020_safetyset.sql`, rule test `supabase/tests/safetyset.sql` (23 of 23), smoke suite `safetyset`. The dev fix (5) had already gone in with v27.

## 4. v29 Accountability by name

**Why.** A PAR (personnel accountability report) answers with a number only, even when the unit's people are on
record by name, so a missing person is reported as "someone". A unit that checks in without typing names has no head
count at all, and its PAR then starts at 1, so "All accounted for" can be sent for one person when three are in the
boat. A person's agency, role, qualifications and notes cannot be corrected after they are added.

**Build.**

1. **PAR by name, still one tap.** When the unit has people on record, the phone's PAR card lists the names checked in
   as a reminder to look, with one button, "All 3 accounted for". "Someone's missing" replaces today's confirm box
   with the list: tick who is missing, then Send. The answer stores the missing people (on `ic_message_acks`) with the
   count, and the emergency alert names them. The base's yellow bar reads "MISSING · Okafor (Unit 1) · 14:05"; that
   person's row on the People board and the unit panel turn red with the unit's last reported position; the 214 line
   names them. A unit with no people on record keeps the − / + count.
2. **The head count is never unknown.** The phone's check-in form gets "How many with you?" beside the names: typing
   names raises it to at least the number of names, and it cannot go below them; with no names the number stands.
   Extra unnamed people are kept as `ic_members.unnamed_count`, and `ic_member_before` (in
   `supabase/migrations/0013_people.sql`) sets `crew_count` to the named people checked in plus the unnamed. A unit
   with no count shows "head count unknown" in orange on the resources board and unit panel, and its PAR card asks for
   the number before either button works. The base nudges "Name them for the PAR"; names stay optional.
3. **Edit a person.** An Edit button on the People board row opens the add form filled in (name, rank or role,
   agency, qualifications, notes) for Operations; the phone's "People on the unit" lets the unit lead do the same for
   their own people. A blank agency means the unit's, shown only when different. Log the edits.

**Already decided.** Ticking every name in the rain is worse than today, so the common answer stays one tap and the
names are only ticked for the exception.

**Done when.** The migration is applied and kept, with a rule test covering the unnamed count and the missing people;
the mock is updated; a smoke suite `parbyname` covers an all-accounted PAR, a missing-by-name PAR reaching the bar and
the board, a check-in with a count and no names, the unknown-count block, and an edit on each view; the full run is
green; `VERSION` is v29. Commit: `Accountability by name: the PAR names who is missing, the head count is never
unknown (v29)`. Then re-walk Rosa's and Ana's PAR jobs.

**Start in.** `js/field/main.js` (`parCount`, `answerPar`, the `par` row), `js/base/ui.js` (the yellow bar, the People
board row), `supabase/migrations/0013_people.sql`.

**Shipped** 17 October 2026 as `Accountability by name: the PAR names who is missing, the head count is never unknown (v29)`, migration `0021_accountability_by_name.sql`, rule test `supabase/tests/parbyname.sql` (10 of 10), smoke suite `parbyname`. One rule added while building: a person named later on a unit that had unnamed people takes one off the unnamed, so the head count stays.

---

## 5. Small fixes, any time

Each is a few lines. Commit app fixes with a version bump; test-only fixes as `smoke:` or `dev:`.

- **"Medic: J" on the phone's home screen.** For a medic named "J. Ortiz", the Nearby row shows "Medic: J" because
  the line is cut at the first ". " (`js/field/main.js`, the `hurt` row in Nearby). Cut at the end of the sentence,
  not at an initial.
- **A flaky smoke check.** In the `checkIn` suite, "the base sees Unit 4 join…" waits for the data and the log line
  but reads `#panel` at once, before the next animation frame redraws it. Put `has('#panel', 'unit 4', 'available')`
  inside the `until`.
- **Empty printed maps in the mock.** The seed has no structures in A-1, A-2, B-1 or B-3, so their printed 204 maps
  show only an outline. A few seeded addresses there would make the mock's 204s look real.
- **The 207 repeats itself.** The organization chart overlay prints the chart's lines as text above the chart; on
  paper the chart alone may do.
- **The README's smoke timing.** It says the run takes about 40 seconds; the full run is now two to three minutes.

## 6. Decisions only Grace can make

- **The hazard outline after the last hazard is resolved.** Resolving a hazard does not clear the division's orange
  outline. Keep it as "a hazard was reported here", or clear it when the last one is resolved?
- **One division per unit, or several?** Pressing another unit under "Assigned to" adds it to the division rather than
  moving it, so a unit can end up on two divisions (Unit 3 on A-2 and B-4 in a walkthrough).
- **The period's label.** The picker, the home panel and the phone's incident row show the period as typed ("07:00 to
  19:00"); every report shows the real times ("03:33 to 19:00"). Drop the typed label, or derive it?
- **A deputy seat.** ICS-100's other remedy for a span of control past seven is a deputy; the 207 warning suggests one
  but the period has no seat for it.
- **Already decided not to build:** per-person "last seen" notes for boat crews (trackers instead), invite-by-email
  accounts, a transport board ("who is on the next bus" is the shelter card's Expected line for now), NIMS resource
  typing (Type 1 to 4) and strike team / task force labels.
