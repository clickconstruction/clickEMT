# Punchlist

The work on clickEMT, release by release. Everything here has shipped: the walk at v37's list as v38 to v48 (sections 1
to 10), the walk at v48's four items as v50 to v53 (section 11), and the plan "Invite by email, a transport board, and
people and tags" as v54 to v56 (sections 12 to 14), each with its Shipped note, v57, the check-in head count put
back on the real database (section 16), v58, Show me around (section 17), v59, the header's right end and a clock
that swaps to UTC (section 18), and v60, a cleaner base from Todd's walk (section 19). **Open and not yet ranked**
(18 October 2026, v60): the rest of Todd's walk at v59, in section 15 under "From Todd's walk", each with a mock-up.
Written 17 October 2026, after v37 (`c89a929`), brought up to date at v60. Each numbered release below is written to be picked
up cold: why it matters, what to build, what was already decided, and how to know it is done. Read
[handoff.md](handoff.md) first for how to run, test and ship.

Everything here came out of the walk at v37 in [walkthroughs.md](walkthroughs.md) ("Walk at v37: best we can do"):
all twelve personas plus a newcomer at the check-in table, each job asked "is this the best we can do for this
person?", with the open items of the re-walks after v25 to v31 and the v24 items never taken up folded in. Take them
in order. Each release bumps `VERSION` in `sw.js` by one, so the next is **v61**, and each new migration takes the
next free number in `supabase/migrations/`, so the next is **0035**. After each release, walk the screens it touched
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
| 10 | v48 Small items from the re-walks (shipped 18 October) | small | v47 | Rosa, the newcomer, Reyes, Priya, Moreno, the resident, the IC, Finance |
| 11 | The walk at v48: the unit panel's order, the check-in count, a Public page, small words (shipped 18 October as v50 to v53) | small | v48 | Marcus, the newcomer, Moreno, Reyes, the PIO, Priya |
| 12 | v54 A transport board (shipped 18 October) | medium | v53 | Marcus, the desk, the crews, a driver |
| 13 | v55 People and tags, phase 1: QR bands (shipped 18 October) | medium to large | v54 | everyone: Ana, Rosa, the desk, Marcus, Priya |
| 14 | v56 Invite by email, the app's first server code (shipped 18 October) | medium | v55 | Ana, the administrator, Marcus |
| 15 | Known candidates, and the rest of Todd's walk at v59 (open, not ranked) | small to large | v60 | see the section |
| 16 | v57 The check-in head count put back on the real database (shipped 18 October) | small | v56 | every unit with more people than names, Marcus's PAR |
| 17 | v58 Show me around: a label over each part of the base on a device's first open (shipped 18 October) | small to medium | v57 | Marcus's relief, the IC, the clerk, anyone new at the base |
| 18 | v59 The header's right end, and a clock that swaps to UTC (shipped 18 October) | small | v58 | Marcus, the IC, the clerk, mutual aid on Zulu time |
| 19 | v60 A cleaner base: shorter labels, the codes behind the pill, the connection's card, the head count, the drawing buttons, the gear, Layers flipped, a division's hover card (shipped 18 October) | medium | v59 | Marcus, his relief, the IC, anyone new at the base |

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

## 10. v48 Small items from the re-walks

The eight Still bites from the re-walks after v38 to v47, swept together.

- **They're all found** beside the per-name Found (the base's MISSING line, the phone's card), one line in the 214.
- **The front door's sign-in card** says what is true: sign in or create an account; whoever opens an incident is its Operations.
- **A street address on a facility** (`ic_facilities.address`), on the card, used by Getting there and the 204 before the coordinates.
- **The softer urgency words on a hazard**: Hazards open in urgency order, the word on the division panel's chip.
- **The phone shows Operations' acknowledgement** of its hazard: a Your hazards card and a toast.
- **A revisit already past today means tomorrow**: "tomorrow 06:00" on the sheet, the list, the 204 and in the 214.
- **The chime's first click** is said on the bar's quiet line until the page is clicked.
- **A second stamp for the current stretch** (`ic_people.stint_at`): the board and the briefing count it, the Hours and the 211 keep every stretch.

**Shipped** 18 October 2026 as `Small items from the re-walks (v48)`, migration `0030_rewalks.sql`, rule test
`supabase/tests/rewalks.sql`, smoke suite `rewalks`; re-walk after v48 in walkthroughs.md.

## 11. The walk at v48: open work

From "Walk at v48: best we can do" in [walkthroughs.md](walkthroughs.md) (18 October 2026, commit 84a18c4): all twelve
personas plus the newcomer at the check-in table, each job asked "is this the best we can do?", with the eleven releases
since v37 read with fresh eyes. Nothing was LOST or SLOWED; three PUZZLED items and some small words were left. Written
as one small release, v49; v49 went to the front door's redesign instead, and the four items shipped one release each
as v50 to v53 (their Shipped notes below).

1. **The unit panel: where it is first, identity folded** (Marcus, and every unit's privacy). *Why.* Unit 1's panel
   puts IDENTITY in full (verified, name, phone, licence tail and expiry, date of birth, home address, Withdraw
   verification) under the status line, then the request, the water clock and Set status, and only then Agency, Head
   count, Assigned, Standing in, Position, Heading, Last report. The answer to "where is Unit 1" is a screen down, and
   every unit lead's date of birth and home address are in front of Operations on every open. *Build.* The facts right
   under the status line; identity as one line ("Verified 23:13 · Ana Ramirez · 512 555 0111 · licence on file") with
   the details, the photo and Withdraw verification a press away (`identityHtml` in js/base/ui.js, a `state` flag per
   unit or a `<details>`); the 211 and the rule that only Operations sees it are unchanged. *Done when* the `walkfix` or
   `identity` suite reads the position before the identity and the folded line's words; re-walk Marcus's "answer the radio".
   *Shipped 18 October 2026 as `The unit panel: where it is first, identity folded (v50)`; the `identity` suite covers it.*
2. **The check-in count starts at one** (the newcomer, Moreno, Reyes, any unit alone). *Why.* "How many with you,
   including you?" has no default; a volunteer who skips it is "head count unknown" in orange on the base and her
   briefing says "add your people from the menu". *Build.* `#join-count` starts at 1 on a fresh form (`clearJoinForm`),
   a typed number stands, names raise it as now; `ic_join` already works the unnamed out of the count. *Done when* the
   `newcomer` suite checks in with the box untouched and the base reads "1" with "you alone" in the briefing.
   *Shipped 18 October 2026 as `The check-in head count starts at one (v51)`; the `newcomer` suite covers it.*
3. **A Public page for the PIO** (the PIO). *Why.* Public information is about 4,000 px down Operations' home panel, the
   same as at v37. *Build.* A Public button on the header beside People, opening an overlay (like `#people`) with the
   cleared photos, their captions and checks, Download the public set and who is PIO; the home panel's section stays
   for Operations. *Done when* the `publicInfo` suite opens it from the header and the walk's PIO job reads it there.
   *Shipped 18 October 2026 as `A Public page for the PIO (v52)`; the `publicInfo` suite covers it.*
4. **Small words.** The bar's hazard item repeats the kind when the note restates it ("Person or car in the water, Car in
   the water at the bridge"): the note alone when it starts with the kind's words (`barItem` in `safetyHtml`); the
   check-in page's row for an incident a unit has checked out of reads "you were Brush 12 · checked out 02:10"
   (`showJoin` in js/field/main.js).
   *Shipped 18 October 2026 as `Small words: the hazard once, who checked out (v53)`; the `rewalks` suite covers both.*

**Seen by the walker, not for the list:** the seed's period reads "22:48 to 19:00" (its start three hours before the
clock, its planned end a fixed 19:00); the mock's pretend GPS takes about twenty seconds to give a new phone its first fix.

---

## 12. v54 A transport board

From the plan "Invite by email, a transport board, and people and tags" (18 October 2026, on claude.ai) and its mock-ups
at `/try/mockups/#transport`: the first of the three, chosen because it is the smallest, needs no server code and no
hardware, and the desk and Operations feel it at once.

1. **A run is a row, not a typed line** (Marcus, the desk, the crews). *Why.* "Who is on the next bus" was a line
   Operations typed on the shelter's card; the desk could not see who was on it, Operations could not count people in
   transit, and a family put on a bus at a pickup was nowhere until the desk signed them in. *Built.* `ic_transports`
   (kind, label, from a facility, a division or words, to a facility, seats, leaves and expected, status planned →
   loading → en route → arrived → done with its stamps, driver a member or a name and a phone, withdrawn never deleted)
   and `ic_evacuees.transport_id`: a record put on a run is on the way to the run's destination from that moment, follows
   a new destination, and is off the run when it leaves for somewhere else. The 214 has the plan, loading, departure and
   arrival with who was on it, and who put each record on. Update is Operations, the maker, the driver or the desk at
   the destination. The base: Transports on the header (a row per run, one button for the next step, New run, Edit,
   Withdraw, who is on it), the home panel's section, the shelter card's Coming here (the typed Expected line gives way
   once a run exists) and On which run on the arriving rows; the sitrep and the briefing count runs under way and people
   in transit. The phone: Arriving by run with They're here for the whole bus, the house record's On which run (the
   crew's own division's run first), the driver's You are Bus 2 card with one button per step.
   *Decisions kept from the plan:* transports are of people, never supplies; a run's people are records, never names
   typed on the run; a driver not in the app is a name and a phone and Operations presses the buttons; the typed line
   stays until the first run exists for that shelter. *Not in this cut:* a pickup as a point clicked on the map (a
   facility, a division or a few words instead); the desk putting a walk-in on a run.
   *Shipped 18 October 2026 as `A transport board (v54)`; rule test `supabase/tests/transports.sql` (33), smoke suite
   `transports` (34).*

## 13. v55 People and tags, phase 1

The second of the three pieces in the plan "Invite by email, a transport board, and people and tags" (18 October 2026),
mock-up at `/try/mockups/#tags`: a QR band per person, scanned at check-in, at the division, at a transport and at the
shelter door; last seen on the board; the PAR by scan.

1. **A band is an id, never a name** (everyone). *Built.* `ic_tags` (a number and a code, printed from the base in sheets
   of 24 by `ic_print_bands`, given once to a responder or a sheltered person, voided never reused) and `ic_seen` (a scan:
   what it meant, where, when, by whom; never changed). The base prints bands, reads each person's band and last scan on
   the People board, the unit panel and the 211, voids a lost one, counts the scans on the PAR panel. The phone scans a
   band from the menu, the PAR card and the desk's sign-in sheet, types the number when the camera refuses, preselects
   what the scan means from where it is, takes a band number on the check-in rows, and opens a band's link from any
   reader. A sheltered person's band is voided with their name by the clearing rule.
   *Decisions kept from the plan:* a tag is an id; no scan is ever required (names and counts stay); last seen is a
   record, never "is at"; evacuees' bands clear with their names. *Not in this cut:* NFC (Web NFC is Android only), the
   base giving a sheltered person a band (the desk and the crews do), trackers (phase 2, when the hardware is chosen).
   *Shipped 18 October 2026 as `People and tags, phase 1 (v55)`; rule test `supabase/tests/tags.sql` (28), smoke suite
   `tags` (29).*

## 14. v56 Invite by email

The third of the three pieces in the plan "Invite by email, a transport board, and people and tags" (18 October 2026),
mock-up at `/try/mockups/#invite`: an account that arrives by invitation instead of self-made, a closed roster, the
season's roster to invite in one press. The app's first server code.

1. **One link, one email, no code** (Ana, the administrator, Marcus). *Built.* `ic_invites` and the Edge Function
   `invite` (the service key lives there alone): Operations invites from the Members tab, the function makes the account
   or a sign-in link through Supabase Auth's admin API and sends the email through Resend; the link lands on the field
   app (a unit) or the base (Operations) with the token, the person sets a password once, gives their name and phone,
   and `ic_join` with the token joins them as the role invited. Resend, Withdraw, seven days, every step in the 214.
   `invite_only` turns the units' code off for the uninvited; `ic_roster` offers the addresses invited on earlier
   incidents to a new one. *Decisions kept from the plan:* an invitation is to an incident, not to the app; email only;
   an invited account is self-service after that; the function needs its own deploy step (in CLAUDE.md's routine).
   *Found on the way:* the shared project's auth had sign-ups turned off for a few hours on 18 October (the charity
   app's change), which refused Create account on the phone and the base; they were turned on again the same day, and
   an invitation is the other way in for a new address. *Not in this cut:* SMS; an invitation to the app without an incident; a test of the real
   function's email from the pane (it was deployed and answers; the mock stands in for it in the suite).
   *Shipped 18 October 2026 as `Invite by email (v56)`; rule test `supabase/tests/invites.sql` (32), smoke suite
   `invite` (18).*

## 15. Known candidates, and the rest of Todd's walk at v59 (open, not ranked)

Nothing here is decided. These are the "Still bites" items of the re-walks after v50 to v56 in
[walkthroughs.md](walkthroughs.md), and a few things seen in passing, gathered so the walk starts from them. The second
list is what Todd marked walking the base at v59 on 18 October that v60 did not take; each has a mock-up to judge.

**From Todd's walk at v59, mocked up and waiting:**

- **The units section, cleaner** (panel 2 of `/try/mockups/#cleaner`): one line per unit with the division at the right,
  the facts under it, groups as headings, the count in the heading, the PAR as one line, each request with its one button.
  Touches the home panel every suite reads; its own release.
- **The People board, offered better** (`/try/mockups/people.html`, its own session): the six controls on every person's
  row crowd out the facts; two or three directions drawn.
- **Replay: a time you name, and a speed in words** (`/try/mockups/replay.html`): Pick a time bounded by the first
  record (the earliest `ic_tracks` row), the slider hatched before it, the speed menu saying what a second of play covers.
- **The pages as large modals, not full screens** (`/try/mockups/modals.html`): Briefing, People and the rest over the
  dimmed map with Expand to full screen; the alarm line, printing and the pop-out log thought through there.
- **Placing aerial imagery by its corners** (`/try/mockups/imagery.html`): drag the picture to fit instead of typing four
  edges; a rectangle first (today's bounds), four free corners later.
- **A transport on the map** (Todd, 18 October): a run shown on the map view, its pickup and destination and where the
  bus is when the driver's phone reports. Not drawn yet.
Walk first, then rank, as before.

- **Verify the first real invitation email** (Marcus, Ana). The Edge Function is deployed but no email has been sent
  from the live site. Send one to yourself; a refusal shows as "could not be sent: …" on the Members tab and in the 214.
- **The PAR by scan is one scan per press** (Ana, Rosa; v55). Scan them in opens the camera once per band; a crew of
  six is six presses. A sheet that keeps the camera open and ticks names as bands pass would be the next cut.
- **Runs nobody updates under load** (Marcus, the desk; v54). A bus that left without Leaving pressed reads "loading
  since" and goes late on its own clock, which at least says so. The risk the plan named.
- **A pickup is not a point on the map** (the crews; v54). From is a facility, a division or a few words.
- **The desk cannot put a walk-in on a run** (the desk; v54). On which run is on the house record and the base's
  arriving rows only.
- **The base cannot give a sheltered person a band** (Operations; v55). Only the desk and the crew that made the
  record can, by the plan's choice; a Band box on the base's rows if the desks ask for it.
- **Boarding needs a run loading from here** (the crews; v55). The Boarding chip names the first run planned or loading
  from the crew's division, or "a run" when there is none.
- **The Public page is a list, not a gallery** (the PIO; v52). The pictures are a press away on each photo's panel.
- **Details on the unit panel is a press per unit** (Marcus verifying identities; v50). The fold does not carry across
  units, which is the point for privacy.
- **A checked-out membership still lists under "Incidents you are already in"** (Reyes; v53). One tap reopens it and
  the check-in brings the people back.
- **A unit's invitation opened on a laptop** lands on the base as a unit (v56). The link sends units to the field app.
- **The header row grouped** (seen while drawing v58's labels): thirteen buttons in one row is most of "too much going on"; the mock-up at `/try/mockups/#discovery` shows them as This period · Boards · Forms · The day, with the device and the account on the right. Not decided.
- **A new incident starting emptier** (v58): a fresh incident has no divisions, units or log lines, so its screen is already quieter than the seeded one; the labels could then say "nothing here yet: draw the boundary", and the side panel could lead with the codes.
- **The front door's screenshots are the base at v33** (`images/front/`): the header has changed since (Public, Transports, v59's row of pills) and the pictures have not. Redoing them needs the html2canvas-pro render CLAUDE.md describes.
- **Every time in UTC** (v59): only the header clock swaps; the log, the 214 and the forms stay local. A device setting that swaps them all is the next cut if Zulu-time agencies ask.
- **The labels on the public demo** (v58): /try/ frames the base with its own tours, so the labels stay off it; they could show there on the first open as well, before the tours.
- **Seen by the walkers, not product:** the mock's seeded period reads "22:48 to 19:00" (its start three hours before
  the clock, its planned end a fixed 19:00); the mock's pretend GPS takes about twenty seconds to give a new phone a
  fix; the `layers` smoke suite's overlay upload sometimes times out late in a full run (handoff.md, "Where things
  stand").
- **Waiting on Grace:** the front door's pilot contact (Get in touch points at the GitHub issues), the pilot agreement's
  open comment, and the plan doc's section 7 questions (handoff.md says where each is).
- **Tags phase 2, trackers**, waits on the hardware.

## 16. v57 The check-in head count, put back on the real database

**Why.** On picking the work up on another computer (18 October), the SQL rule tests `parbyname.sql` (6 of 10) and
`people.sql` (27 of 28) failed against the real database while every mock suite passed. Migration 0032 (v55, a band
on a person's row at check-in) rewrote `ic_join` from a body older than 0021 (v29), and 0033 (v56, invitations) carried
that body forward, so three things v29 built were gone from the database and kept by the mock: the unnamed (a unit
that typed "4 with me" and named two was counted as two on the base, in the check-in line, in the 211 and in every
PAR; a unit alone at 1 with no names had no unnamed on record), `ic.join` staying on through the roster (so the
roster's own names are not taken off the unnamed), and the clock stamps that keep the crew in the order typed. The
smoke suite could not see it: it runs against the mock, which was right.

**Built.** Migration `0034_join_count.sql`: 0033's `ic_join` with those three put back and nothing else changed,
plus the `grant execute` line 0033 left out when it dropped and recreated the function (Supabase's default privileges
had covered it). Rule test `supabase/tests/joincount.sql` checks the three ways in (the code with a band on a name, an
invitation, a unit alone at one) and a second check-in with one more name; against the database as it stood it passed
3 of 10. The `tags` smoke suite's check-in now types three with one named and reads 3, two unnamed, on the base. The
mock needed nothing.

**Nothing to repair.** No unit checked in on the real database while 0032 and 0033 stood (the 214 has no check-in
line after v55 shipped), so no count was left short; had one, it would have kept its short count until it checked in
again, since the count typed is not kept anywhere.

**So it does not happen again.** `ic_join` is redefined by every migration that touches the check-in; the next one
starts from 0034's body (CLAUDE.md says so), and the rule tests run against the real database before a release is
called done, as the routine says. `parbyname.sql` and `people.sql` would have caught it at v55.

**Shipped** 18 October 2026 as `The check-in head count put back on the real database (v57)`, migration
`0034_join_count.sql`, rule test `supabase/tests/joincount.sql` (10 of 10); every rule test 20 of 20 files; the `tags`
smoke suite extended.

## 17. v58 Show me around

**Why.** On picking the work up, the base at v57 looked like too much going on for a new user: thirteen buttons in
a row, the alarm line, the drawing tools, the map, the legend, the divisions, two codes and the log, all at once,
with nothing saying what each is for. The phone has Your briefing once per check-in; the base had nothing for its
first open. The idea (Todd, 18 October): a discovery mode, a transparent layer over each part of the screen with its
name and purpose, each going when clicked, until the user has cleared discovery mode. Drawn first as a click-through
mock-up at `/try/mockups/#discovery` over a screenshot of the base, judged, then built.

**Built.** `js/base/discover.js`: the first time the base opens an incident on a device, ten labels sit over the
screen, numbered in the order a new Operations uses it (the incident in one line, the sheets and boards and forms,
the alarm line, Start here, the map, the legend, the divisions, the join code, the Operations code, the 214), each a
name, one sentence of purpose and the first thing to do there, with the part under it tinted and outlined so the shape
of the screen reads at a glance, and a pill counting what is left. Click a label and it goes; click through it to use
the part and it goes too (the first click clears, the next works). Clear all or Escape clears the rest; Settings gained
a This device line with Show me around, which puts every label back. Per device (`ic.base.around` in localStorage),
like the theme: nothing goes to the database and the mock needed nothing. The alarm line is never tinted while
something is open on it, and an emergency arriving puts every label away at once with a toast saying why. The labels
follow the parts on every draw, resize and scroll; a part scrolled out of the side panel waits there, counted as out of
view. Not on the pop-out log, and not on the public demo, whose tours show the base around already.

*Decisions kept from the mock-up:* every label at once, not a tour; one sentence of purpose and one of what to do
first, never a manual; using the part clears its label; the base only, the phone has its briefing. *Left open there and
decided here:* the switch says "Show me around" (the plan's name was discovery mode); ten labels, not eight; not on the
demo. *Seen on the way and left for the walk:* the header row grouped, a new incident starting emptier, the labels on
the demo (section 15).

**Shipped** 18 October 2026 as `Show me around (v58)`: `js/base/discover.js`, the styles at the foot of base.css, the
Settings dialog's This device line, the `around` smoke suite (13 checks); full run 715 of 715 across 38 suites; every rule
test 20 of 20 files; the re-walk after v58 in walkthroughs.md. No migration; the mock needed nothing.

## 18. v59 The header's right end, and a clock that swaps to UTC

**Why.** On the base at v58 the header's top row carried the incident's name and line, Find a person, then three
pills (Join code CEDAR7, live, the clock), and the thirteen buttons wrapped to a second row that ended short, with
empty space under the pills (Todd, 18 October, with a picture of the two). The clock said `14:57` with nothing about
which time it was, and a mutual-aid agency on Zulu time had no UTC anywhere.

**Built.** The three pills are the header's last group, pushed to its right end: on a wide screen the whole header is
one row; at 1280 they sit at the end of the buttons' row, where the empty corner was. The connection is a green dot
alone while live or still connecting, its words only when a connection that was there has gone, so the row is quiet
when all is well and never jumps as an open comes live. The join code pill reads the code alone, `CEDAR7`, its
words in the hover text; the home panel has the code large with the QR. The clock is a button: `14:57 CDT`, and a
click swaps it to `19:57 UTC` and back, the choice kept per device (`ic.base.clock`) like the theme; its hover text
says which it is and what a click gives. Only the header clock swaps: the log, the 214 and every form stay in local
time, as ICS has them (section 15 has "every time in UTC" as a candidate). `hhmmUtc` and `zoneShort` in rules.js,
tested in `dev/test-rules.mjs`; label 2 of Show me around names the pills at the row's end.

*Decided:* local first, a click for UTC (Todd, 18 October): every timestamp on the screen is local, and a UTC clock
beside a local log would make the clerk do arithmetic.

**Shipped** 18 October 2026 as `The header's right end, and a clock that swaps to UTC (v59)`: index.html, the header's
styles in base.css, `drawClock` / `drawLive` in main.js, `hhmmUtc` / `zoneShort` in rules.js (`dev/test-rules.mjs`), the
`seeded` smoke suite extended (the pills' place, the clock both ways); full run 719 of 719 across 38 suites; check and
test pass; every rule test 20 of 20 files. No migration. On the way: the labels of v58 were placed from a stale layout
when the header lost a row after they were drawn, so discover.js re-lays them on a `ResizeObserver` and a 500 ms tick
(a hidden pane gets no frames), and the `around` suite's check now names the part that is off.

## 19. v60 A cleaner base

**Why.** Todd walked the base at v59 on 18 October and marked what was unclear or wordy, with a picture of each:
the labels said too much and a thin row's label floated free of its row; the join code and the Operations code took
half the home panel; the green dot said nothing about what it meant; the header had no head count; Draw boundary and
Draw division sat as equals with nothing saying which comes first; Settings, Switch incident and Sign out were three
buttons for one idea; the Layers panel read better flipped; a division's row packed facts a hover could unpack. Each
was drawn first on `/try/mockups/#cleaner` (panels 1 and 3 to 9) and judged, then built together.

**Built.** The labels: the part's own name and one line of twelve words at most, the number on the tint too, a thin
row's card hung under it with a caret; nine labels, the two codes' as one. The codes behind the header's `CEDAR7`
pill: click it for the QR, Invited members only, the join card, the link, the bands, and the Operations code as dots
until Show, so it is never on a screen someone walks past; the home panel starts with the units. The connection's
card on the green dot: live since when, the last update and what it was, each phone's last report (quiet past five
minutes, in orange), this base's version and whether a newer one is ready, Reconnect. A head count beside Find a
person, opening the People board. Draw · Boundary · Division with the legend's marks and a hover sentence each; which
is lit follows the map, and the hint says why. A gear in place of Light, Settings, Switch incident and Sign out, with
Show me around in it (the Settings dialog's This device line went). The Layers panel with the overlays on the left.
A division's hover card after half a second on its row: tasked against in it now (the units whose phones reported
inside the outline in the last five minutes), searched of how many, hazards open, the last report, the objective.

*Decided:* the Operations code is dots until Show; the cards open on a click, not a hover, and close on a click
outside or Escape; Boundary first is a nudge, not a rule; a phone is quiet after five minutes.

**Shipped** 18 October 2026 as `A cleaner base (v60)`: index.html, base.css, `codesPopHtml` / `zoneHoverHtml` /
`headCountHtml` / `liveHtml` in ui.js, the wiring in main.js, discover.js shortened; the `seeded`, `join`, `invite`,
`members`, `layers` and `around` suites moved to the codes' card and gained the new checks; full run 731 of 731 across
38 suites; check and test pass; every rule test 20 of 20 files. No migration; the mock needed nothing.

## Done before this list

The previous punchlist (items 1 to 6, from the v24 walkthroughs and the re-walks after v25 and v26) shipped on 17
October 2026: the re-walk after v26 (`22db8c5`), Members and roles with personal records that clear by rule (v27,
`0ea25c2`), Time in the water, incident settings and the public set (v28, `ffdc7a8`), Accountability by name (v29,
`386586d`), Small fixes (v30, `9ec9782`), and Grace's four decisions with the Deputy seat (v31, `08b2156`). What each
built is in the git log, the README's feature lines and the "Re-walk after vN" sections of
[walkthroughs.md](walkthroughs.md).
