# Punchlist

The open work on clickEMT as of 17 October 2026, after v37 (`c89a929`, the public demo, the front door, new
versions, the 404 page). Each numbered release below is written to be picked up cold: why it matters, what to build,
what was already decided, and how to know it is done. Read [handoff.md](handoff.md) first for how to run, test and
ship.

Everything here came out of the walk at v37 in [walkthroughs.md](walkthroughs.md) ("Walk at v37: best we can do"):
all twelve personas plus a newcomer at the check-in table, each job asked "is this the best we can do for this
person?", with the open items of the re-walks after v25 to v31 and the v24 items never taken up folded in. Take them
in order. Each release bumps `VERSION` in `sw.js` by one, so the next is **v38**, and each new migration takes the
next free number in `supabase/migrations/`, so the next is **0023**. After each release, walk the screens it touched
again as the personas who hit them and add a "Re-walk after vN" section to `walkthroughs.md`.

| # | What | Size | After | Serves |
|---|---|---|---|---|
| 1 | v38 One head count at a time, and a missing person who is found (shipped 17 October) | small to medium | now | Marcus, Priya, Dana, Ana, Rosa, Moreno, every phone |
| 2 | v39 The newcomer's door (shipped 17 October) | small | v38 | the newcomer, Reyes, Moreno, the shelter desk, the administrator |
| 3 | v40 A period that has ended says so, and times and dates in one form (shipped 17 October) | small | v39 | the IC, Marcus, the clerk, the PIO, the administrator, every briefing |
| 4 | v41 A hazard that says how urgent it is, and the open hazards where Safety looks (shipped 17 October) | medium | v40 | Moreno, the newcomer, Priya, Dana, Marcus, Rosa |
| 5 | v42 The phone's sheets: Save on screen, Assigned before In progress, the briefing for a unit with no division (shipped 17 October) | small to medium | v41 | Ana, Rosa, Reyes, Moreno, the desk, the newcomer, Marcus |
| 6 | v43 Paper that leaves the base: signatures, the sitrep by email, the join card (shipped 17 October) | small | v42 | the IC, the clerk, Reyes, the administrator |
| 7 | v44 Small words and buttons (shipped 18 October) | small | any time | one or two personas each |
| 8 | Later: since you last looked (shipped 18 October, v45); on scene too long (shipped 18 October, v47) | medium | v44 | the IC, Marcus's relief, Priya |
| 9 | Decisions only Grace can make (answered 18 October; built as v46 The decisions) | small to medium | v45 | Ana, Reyes, Priya, the clerk, the resident |

---

## 1. v38 One head count at a time, and a missing person who is found

**Why.** Operations pressed Start PAR twice ten minutes apart. The first PAR never closed: it stayed on the bar as
"0 of 3 answered … 10 min ago", it could never complete because units that joined after it were not asked, and every
phone's takeover carried two head counts (three cards with the safety message). With an emergency and a missing person
as well, the bar under the header held five things at 256 px each. When Rosa's missing person turned up and she stood
the alert down, "MISSING · Patel (Unit 2)" stayed on the bar and Patel's row stayed red: nothing clears a missing
report but the next PAR.

**Build.**

1. **A new PAR closes the one before it.** `ic_messages.superseded_by` (uuid, null) and `superseded_at`. Inserting a
   PAR message sets both on the open PAR(s) of the incident (a trigger, `ic_par_supersede`), and logs "PAR superseded
   by the one started at 22:12; waiting on Unit 2, Unit 3 when it closed". A superseded PAR is not open: the bar, the
   Accountability panel and the phone's takeover ignore it; its acks stay in the log and in the Messages list ("closed,
   superseded 22:12"). `ic_quiet` is not involved; the line is wanted.
2. **The bar shows what is open now.** `openPars()` in `data.js` returns the one open PAR; `barItem`s are the
   emergency, the missing people, the one PAR and the open safety messages. Keep the fixed 40 px slot; with four or
   more cells the words are cut with the whole on hover, as now.
3. **Found.** A missing report is an ack row with `missing` names (v29). Add `ic_message_acks.found_at` and
   `found_by` and `ic_mark_found(p_ack, p_person)` (the reporting unit or Operations), which stamps the row's missing
   entry `{id, name, found_at, found_by}` and logs "Patel found, reported by Unit 2" (kind `par`, notable). The base's
   MISSING line gets a **Found** button per name; the phone's alert screen and its PAR card get **Found** per name
   while the report is open. `missingNow()` skips found entries. The stand-down alone does not clear a missing person
   (someone has to say they are found).
4. **One card on the phone.** The takeover draws the open PAR once, newest first, then the safety messages. Answering
   the newest PAR is the answer; nothing else to tap for the old one.
5. Mirror all of it in `dev/mock-supabase.js` (SEED_VERSION up), seed an old superseded PAR so the Messages list shows
   the words, and a rule test `supabase/tests/par.sql`: a second PAR supersedes the first and logs it; a superseded PAR
   is not open; Found stamps and logs; a unit may mark its own report found, Operations any.

**Already decided.** A PAR asks "is everyone accounted for now", so the newer one is the question; the older answers
are kept, never deleted. "Found" is an explicit act by the unit or Operations, logged and notable, never inferred
from a stand-down.

**Done when.** Migration 0023 applied and kept; `par.sql` passes and rolls back; the mock mirrors it; the `parbyname`
smoke suite gains: a second PAR closes the first on the bar and on the phone, Found clears the MISSING line and the
red row and writes the line; the full run is green at 1280 wide; `npm test` and `npm run check` pass; `VERSION` v38;
README and CLAUDE.md lines. Commit: `One head count at a time, and a missing person who is found (v38)`. Re-walk
Marcus's PAR job and Rosa's missing job.

**Start in.** `supabase/migrations/0021_accountability_by_name.sql` (the ack trigger, `ic_missing_names`),
`js/base/ui.js` (`safetyHtml`, `barItem`, the PAR panel), `js/field/main.js` (`parCardHtml`, `answerPar`, the
takeover), `js/shared/rules.js` (`missingNames`, `missingOnPar`), `js/shared/data.js` (`missingNow`,
`missingPerson`).

**Shipped** 17 October 2026 as `One head count at a time, and a missing person who is found (v38)`, migration
`0023_par.sql`, rule test `supabase/tests/par.sql` (10 of 10), the `parbyname` smoke suite extended (24 checks), full run
557 of 557. As planned, with one difference: Found is a security-definer function (`ic_mark_found`) that stamps the
answer's missing entries, not a column of its own, so no update policy on acks was needed.

## 2. v39 The newcomer's door

**Why.** A volunteer handed a phone at the check-in table typed the join code on the front door and landed on "Sign in
with the account your agency gave you", with nothing saying the code had arrived and Create account a second button on
the same form. "Your unit" asks for a unit a volunteer does not have. The code's sentence is a toast that is gone in
seconds. (The walk's note that the Identify sheet opened only once per page load was the walker's misreading of a
fixed-position sheet; it opens for every new account.)

**Build.**

1. The phone's sign-in screen, when a code is pending (`pendingJoin()`): the heading "Code CEDAR7 is ready" and the
   words "Sign in, or make an account with any email and a password: it takes a minute, and only this incident's
   Operations sees who you are." Create account becomes a full button beside Sign in, always; its hint moves above
   the boxes.
2. (Dropped: the Identify sheet already opens for every new account; `clearForms` resets `identShown` on Sign out.)
3. The join form: "Your unit" placeholder "Your callsign, or your own name if you are on your own"; a sentence under
   the code box when it came from the link: "Code CEDAR7 came with the link; name your unit and check in." The toast
   goes.
4. A `volunteer` unit kind (`UNIT_KINDS`, the SQL check, `ic_kind_text`, the mock's check) so a single volunteer is
   not "Other".
5. The people rows at check-in are hidden until "How many with you, including you?" is more than 1 or a name is
   typed; "Add a person" stays.

**Already decided.** Accounts stay self-made on the phone (no invite-by-email). A name and a phone are enough to
check in (v25).

**Done when.** Migration 0024 (the kind) applied and kept, the mock mirrors it; the `checkIn` and `walkfix` smoke
suites cover the sign-in words with a code, two new accounts in a row on one page both shown the sheet, and the
volunteer kind; full run green; `VERSION` v39. Commit: `The newcomer's door (v39)`. Re-walk the newcomer from the
front door at 375 wide.

**Start in.** `js/field/main.js` (`showJoin`, `takeJoinLink`, the auth form, `openIdentify`), `field/index.html`
(`#auth`, `#join-form`), `js/shared/rules.js` (`UNIT_KINDS`), `supabase/migrations/0016_ics100.sql` (the kind check).

**Shipped** 17 October 2026 as `The newcomer's door (v39)`, migration `0024_volunteer.sql`, rule test
`supabase/tests/newcomer.sql` (3 of 3), smoke suite `newcomer`. Step 2 was dropped: the Identify sheet already opened for
every new account (the walk had misread a fixed-position sheet).

## 3. v40 A period that has ended says so, and times and dates in one form

**Why.** At 22:00 the header read "OP 1 · 18:47 to 19:00" and the briefings "OP 1 until 19:00" / "This period ends
19:00": the planned end was three hours past and nothing said so, so the IC, Marcus, the clerk and every crew read a
plan that had expired. Every "prepared", "opened", "joined" and "taken" line, and the clearing date on the picker, are
in the browser's locale with seconds ("Prepared 10/17/2026, 9:58:39 PM", "clear by rule on 11/16/2026") beside 21:58
everywhere else.

**Build.**

1. `periodState(p, now)` in rules.js: `open`, `overdue` (past `ends_at`, not closed) with the hours over. The header
   reads "OP 1 · 18:47 to 19:00 · overdue 3 h"; the Period sheet says "Planned end 19:00 has passed; start period 2
   or move the end" with Start period lit; the briefing, the IAP and the sitrep say "ended 19:00 (planned); the next
   period has not been started"; the phone's briefing's Shift line the same, with "stay on until Operations starts the
   next period".
2. `whenText(iso)` in rules.js: "17 Oct 2026 21:58" (the device's zone, no seconds), `dateText(iso)` "16 Nov 2026".
   Use them for every prepared / made / opened / joined / taken / clear line in both views, on paper and in the
   captions file (`photoCaption` keeps its own form if the PIO's set depends on it; check `dev/test-photo-export.mjs`).

**Already decided.** The typed period label stays on the picker, the home panel and the phone's incident row (Grace,
item 6 of the previous list).

**Done when.** `dev/test-rules.mjs` covers `periodState`, `whenText`, `dateText`; the `periods` smoke suite checks the
overdue words with the mock's clock; no `toLocaleString` / `toLocaleDateString` left in `js/` except inside those
helpers; full run green; `VERSION` v40. Commit: `A period that has ended says so, and times in one form (v40)`.

**Start in.** `js/base/ui.js` (`headerText`, `periodFormHtml`, the `prepared` lines), `js/shared/briefings.js`,
`js/field/main.js` (the menu's period line, the briefing's Shift), `js/base/main.js` (`clearLineHtml`).

**Shipped** 17 October 2026 as `A period that has ended says so, and times in one form (v40)`: `whenText` / `dateText` /
`periodState` / `periodLabel` / `periodLine` in rules.js (tests in `dev/test-rules.mjs`), the briefings read `periodState`
(tests in `dev/test-briefings.mjs`), the `periods` smoke suite checks the header, the IAP and the Period sheet either
side of the planned end. No migration.

## 4. v41 A hazard that says how urgent it is, and the open hazards where Safety looks

**Why.** A car in the water with a person inside is three taps and typing with "Downed power line" preselected, and
arrives on the base as a log line and a triangle with no urgency; the deputy's message about a closed road carried
"Act on now" and a pin, the hazard did not. The toast "Briefed…" sat over the sheet's Cancel and Send. Safety has no
list of open hazards of her own (the log, the map, the division panels and the briefing's section are where they
are), and the IC's thirty seconds has no count of them.

**Build.**

1. `ic_hazards.urgency` (the four words of `URGENCY`, or ''), `acked_at` / `acked_by`. The hazard sheet: no kind
   preselected (Send waits for one); kinds gain "Person or car in the water" and "Tree down, road blocked"
   (`HAZARD_KINDS` in rules.js, the SQL check, `ic_hazard_kind_text`, the mock); the urgency row from the message
   sheet above "Anything else". `ic_log_hazard` says "(act on now)" like the message line.
2. An act-on-now hazard is a bar item until Operations acknowledges it ("HAZARD · Person or car in the water · B-2 ·
   22:12 · Acknowledge · Show on map"); the phone's toast says "Hazard sent, act on now; Operations will acknowledge".
3. A "Hazards open · 3" section on the home panel above Messages: kind and words, division, when, who, Resolved,
   Show on map; the header line gains "· 3 hazards open" when any are.
4. Toasts: `#toast` sits above the sheet's foot (`bottom: 84px` on the phone when a sheet is open) and never over
   Cancel / Send.
5. Mock mirror, seed one urgent hazard, rule test `supabase/tests/hazards.sql` (the kind check, the urgency word,
   the log line, acknowledge by ops only).

**Already decided.** An urgent hazard is not an emergency: it does not take over every phone; it sits on the bar for
Operations. Whether it should also page the base like an emergency is Grace's (item 9).

**Done when.** Migration applied and kept; the `fieldReports` smoke suite covers a hazard with urgency reaching the bar
and the new section; the `walkfix` suite checks the toast's place; full run green; `VERSION` v41. Commit: `A hazard
that says how urgent it is (v41)`. Re-walk Moreno's car in the water and Priya's hazards job.

**Start in.** `js/field/main.js` (the hazard sheet, `#s-hazard`), `js/base/ui.js` (`barItem`, `safetyHtml`, the
home panel), `supabase/migrations/0005_hazards.sql` or wherever `ic_hazards` lives (`grep -l ic_hazards
supabase/migrations/*`), `js/shared/rules.js` (`URGENCY`).

**Shipped** 17 October 2026 as `A hazard that says how urgent it is (v41)`, migration `0025_hazards.sql`, rule test
`supabase/tests/hazards.sql` (5 of 5), the `fieldReports` and `newcomer` smoke suites extended. Two differences from the
plan: the toast goes under the header while a sheet is open (a sheet's foot buttons are not always at the bottom of the
screen, so "above the foot" could still cover them), and no urgent hazard was seeded (the seeded checks count one hazard).

## 5. v42 The phone's sheets

**Why.** "Searched, save" sits at 949 px on an 812 px screen (a scroll with gloves, hit by Ana, Rosa, Reyes and the
newcomer, open since v24). A division reads "In progress" the moment Operations presses a unit's name, before the
unit has accepted, and the phone's "New assignment … Accept" card never retires (Ana's showed for a division she had
worked three hours). The briefing tells a bridge post, a desk and a lone volunteer to "wait at staging" and to "add
your people"; the desk's Work area says "where you stand is on the map"; a unit with no division sees another unit's
division card and search buttons.

**Build.**

1. The phone's sheet foot (`.sheet-foot`, Cancel / Save) is `position: sticky; bottom: 0` with the sheet's own
   background, on every sheet: Address clear, Zone clear, Report hazard, Message Operations, Sign in a person, Check
   out.
2. `ic_zones.status` stays as it is; the words change: a division with a unit that has not accepted and has sent
   nothing from it reads "Assigned, not accepted" on the base (the row, the panel, the briefing, the 204's header) and
   "In progress" once `ic_members.accepted_zone_id` (new, set by Accept) or any report from the division exists. The
   phone's Accept card is drawn only while that holds.
3. The briefing (`briefings.js`): Your job for a unit with no division says "No assignment yet. Operations assigns
   divisions from the base; stay where Operations put you" and names staging only when the unit is Available and
   nowhere else is recorded; "add your people from the menu" only when `crew_count` is more than the names on record;
   a shelter desk's Work area names the shelter and its address (from the facility's notes or position).
4. The phone's home for a unit with no division: the "You are standing in" card and the five buttons give way to
   "No assignment yet" with Report hazard, Message Operations and Need help now; the division card returns with the
   assignment.

**Already decided.** A unit may be on several divisions (Grace). Zone clear's whole-division words wait for Grace
(item 9); the sheet's words say plainly what it sends meanwhile.

**Done when.** Migration (the accepted column) applied, the mock mirrors it; the `walkfix` suite measures every sheet's
Save inside the viewport at 375 × 812 and checks the briefing words for a lone unit and a desk; full run green;
`VERSION` v42. Commit: `The phone's sheets: Save on screen, Assigned before In progress, a briefing for a unit with no
division (v42)`. Re-walk Ana's Address clear, Moreno's briefing and the desk's briefing.

**Start in.** `css/field.css` (`.sheet`, the foot), `js/field/main.js` (`drawHome`, the assignment card),
`js/shared/briefings.js` (`fieldBriefing`), `js/shared/rules.js` (`zoneStatusText`), `js/base/ui.js` (the row words).

**Shipped** 17 October 2026 as `The phone's sheets: Save on screen, Assigned before In progress, a briefing for a unit with
no division (v42)`, migration `0026_accept.sql`, rule test `supabase/tests/accept.sql` (4 of 4), the `baseActions` and
`newcomer` smoke suites extended. One difference: Take photo stays on the home screen of a unit with no division (a
photo from where it stands is always useful); Address clear and Zone clear are put away.

## 6. v43 Paper that leaves the base

**Why.** The IAP has no line to sign; the sitrep reaches the EOC by copy and paste; the join card's "Bring:" carries the
safety message and "Getting there:" gives coordinates.

**Build.**

1. The IAP's first page ends with "Prepared by (Planning Section Chief): ____ · Approved by (Incident Commander): ____
   · Date and time: ____", printed names from the period's seats where set; each report's "Prepared by" uses
   `whenText`.
2. Sitrep and briefing: **Send by email** opens `mailto:` with the subject "Cedar Fork Flooding · situation report ·
   OP 1 · 17 Oct 2026 22:00" and the text in the body (the browser's mail app; nothing is sent by the app). The EOC
   address, if Grace wants one kept, goes in the incident settings later.
3. The join card: "Safety:" for the period's safety message; "Bring:" from a new period field `bring` (the Period
   sheet, "What to bring: PPE, water, a radio…", carried into the next period like the notes), "not set" otherwise;
   "Getting there:" with the facility's address when its notes hold one, else "open Directions from Nearby once you
   have checked in".

**Done when.** Migration (`ic_periods.bring`) applied and mirrored; `dev/test-briefings.mjs` or the `reports` suite
checks the lines; full run green; `VERSION` v43. Commit: `Paper that leaves the base (v43)`.

**Shipped** 17 October 2026 as `Paper that leaves the base (v43)`, migration `0027_bring.sql`, rule test
`supabase/tests/bring.sql` (3 of 3), checks in `dev/test-briefings.mjs` and the `reports` smoke suite. Send by email is an
anchor with a `mailto:` link rebuilt on every draw (the mail app may cut a long body; Copy as text stays beside it);
Getting there gives the facility's notes and the coordinates "for a satnav", since a facility has no street address field.

## 7. v44 Small words and buttons

Each is a few lines; take them together.

- The Hours table's ROLE column reads "Lt., swift_water, emt": use `qualsText` (the clerk).
- The licence scan's refusal says "Type the code instead": "Type the licence number instead" for `pdf417` (Reyes).
- "Nobody hurt, no equipment damaged" on the check-out is ticked by default; unticking is the exception (Reyes).
- Reopen on the picker's closed row, beside Clear now (the administrator).
- Make a unit asks the name in a sheet, not `prompt()` (the administrator).
- The unit panel: where it is, what it is on and its last report first; Kind and Identity under them (Marcus).
- The phone names the deputy on the menu's command line and in the briefing (v31's Still bites).
- Nearby says "No boat ramp on the map yet; ask Operations where to put in" for a water crew when none is placed (Rosa).
- Find a person on the desk: a street search offers "Looking for someone from Pecan" (the desk).
- The desk's Message Operations chips: Nearly full, Need cots and blankets, Need a nurse (the desk).
- The 207 warning's "add a deputy" links to the Period sheet (v31's Still bites).
- The water row folds to one small button on a dry assignment once the unit has never used it (Rosa).
- Take photo with no camera says "This phone gave no camera" instead of nothing (Ana; the pane only).

**Shipped** 18 October 2026 as `Small words and buttons (v44)`: all of the above but the last (a file input gives no
word when the phone has no camera; only the Browser pane lacks one), with the check-out's default tick, the picker's
Reopen, the name sheet (`askName`), the 207 link, the desk's chips, the folded water row and Nearby's ramp line checked
by the suites they touch.

## 8. Later

- **Since you last looked** (the IC, Marcus's relief): a line at the top of the log, from `state.log.seenAt`: "Since
  21:10: 2 hazards, 1 emergency (stood down), 1 missing person, 3 PAR answers, 4 messages" with **Show them** (the
  log filtered to the new lines) and the notable ones first. Medium: `logHtml`, `drawLog`, a `sinceText` in rules.js.
  *Shipped 18 October 2026 as `Since you last looked (v45)`: `sinceSummary` in rules.js, `logSinceHtml`, the New group,
  Seen; the mark kept per device in the log's prefs; the `log` smoke suite covers it.*
- **On scene too long** (Priya): `ic_periods.hours_limit` beside the rotation on the Period sheet; past it a person's
  row is orange on the People board and the unit panel, and the briefing's Needs attention names them. Small.
  *Shipped 18 October 2026 as `On scene too long (v47)`, migration `0029_scene_hours.sql` (the column is `scene_hours`,
  default 12, 0 off, carried by `ic_start_period`), rule test `supabase/tests/scene.sql`; the board and the unit panel
  rows, the briefing's Needs attention, the sitrep's own section and the 208 name who is past it; the `sections`,
  `periods` and `fieldReports` suites cover it (rule test 9 of 9, full run 595 of 595); the phone's Your briefing
  says so under Shift. A person checked out and back in still counts from the first check-in, as the Hours do (a
  reset of the check-in stamp was tried and left out; see the re-walk). It also carries v46's revisit clock time into
  the 214 line (`revisit_hhmm`, typed by the phone, as Grace asked after the v46 report). Nothing is left on this list.*

## 9. Decisions only Grace can make

Answered by Grace on 18 October 2026; all four are built in **v46 The decisions** (v45 was taken by "Since you
last looked" before the answers arrived).

- **Zone clear for a part of a division.** *Decided: keep Zone clear for the unit the division is assigned to, with
  plainer words on the sheet ("9 of 24 marked; send A-1 as primary search complete?"), and add "My part is done" as a
  message to Operations for a unit that shares the division with another. Both in v46.*
- **An urgent hazard and the base.** *Decided: the yellow bar until acknowledged, with the base's sound, but not the
  red slot, which stays for a crew in trouble. v41 built the bar; v46 adds the sound.*
- **The sitrep's address.** *Decided: yes, keep an EOC email address in the incident's settings so Send by email is one
  tap, with the mail app's own address book as the fallback when none is set. v46.*
- **A revisit that fires.** *Decided: yes, "revisit at" on the house record, shown on the division's structure list and
  on the next crew's 204, without push alerts for now. v46.*
- **Already decided not to build:** per-person "last seen" notes for boat crews (trackers instead), invite-by-email
  accounts, a transport board, NIMS resource typing and strike team / task force labels. Decided earlier: the hazard
  outline stays after the last hazard is resolved; a unit may be on several divisions; the typed period label stays on
  the picker, the home panel and the phone.

---

## Done before this list

The previous punchlist (items 1 to 6, from the v24 walkthroughs and the re-walks after v25 and v26) shipped on 17
October 2026: the re-walk after v26 (`22db8c5`), Members and roles with personal records that clear by rule (v27,
`0ea25c2`), Time in the water, incident settings and the public set (v28, `ffdc7a8`), Accountability by name (v29,
`386586d`), Small fixes (v30, `9ec9782`), and Grace's four decisions with the Deputy seat (v31, `08b2156`). What each
built is in the git log, the README's feature lines and the "Re-walk after vN" sections of
[walkthroughs.md](walkthroughs.md).
