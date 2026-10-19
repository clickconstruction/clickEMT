# Punchlist

The work on clickEMT, release by release. Everything here has shipped: the walk at v37's list as v38 to v48 (sections 1
to 10), the walk at v48's four items as v50 to v53 (section 11), and the plan "Invite by email, a transport board, and
people and tags" as v54 to v56 (sections 12 to 14), each with its Shipped note, v57, the check-in head count put
back on the real database (section 16), v58, Show me around (section 17), v59, the header's right end and a clock
that swaps to UTC (section 18), v60, a cleaner base from Todd's walk (section 19), v61, the units section
(section 20), v62, confirmations as the app's own dialogs and the band door (section 21), v63, Replay with a time you name and a speed in words (section 22), v64, the pages as windows (section 23), v65, the People board as cards and a drawer with its bar and its Members tab redrawn (section 24), and v66, Went to and On which run as chips on the house record (section 25). **Open and not yet ranked** (18 October 2026, v66): the rest of Todd's walk at v59, in section 15 under "From Todd's walk", each with a mock-up.
Written 17 October 2026, after v37 (`c89a929`), brought up to date at v66. Each numbered release below is written to be picked
up cold: why it matters, what to build, what was already decided, and how to know it is done. Read
[handoff.md](handoff.md) first for how to run, test and ship.

Everything here came out of the walk at v37 in [walkthroughs.md](walkthroughs.md) ("Walk at v37: best we can do"):
all twelve personas plus a newcomer at the check-in table, each job asked "is this the best we can do for this
person?", with the open items of the re-walks after v25 to v31 and the v24 items never taken up folded in. Take them
in order. Each release bumps `VERSION` in `sw.js` by one, so the next is **v72**, and each new migration takes the
next free number in `supabase/migrations/`, so the next is **0038**. After each release, walk the screens it touched
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
| 15 | Known candidates, and the rest of Todd's walk at v59 (open, not ranked) | small to large | v61 | see the section |
| 16 | v57 The check-in head count put back on the real database (shipped 18 October) | small | v56 | every unit with more people than names, Marcus's PAR |
| 17 | v58 Show me around: a label over each part of the base on a device's first open (shipped 18 October) | small to medium | v57 | Marcus's relief, the IC, the clerk, anyone new at the base |
| 18 | v59 The header's right end, and a clock that swaps to UTC (shipped 18 October) | small | v58 | Marcus, the IC, the clerk, mutual aid on Zulu time |
| 19 | v60 A cleaner base: shorter labels, the codes behind the pill, the connection's card, the head count, the drawing buttons, the gear, Layers flipped, a division's hover card (shipped 18 October) | medium | v59 | Marcus, his relief, the IC, anyone new at the base |
| 20 | v61 The units section, cleaner: one line per unit with where it is at the right, the PAR as one line (shipped 18 October) | small | v60 | Marcus, Dana, the clerk |
| 21 | v62 Confirmations as the app's own dialogs, and the band door (shipped 18 October) | small | v61 | Marcus, Dana, Rosa, the desk, anyone handed a band |
| 22 | v63 Replay: a time you name, and a speed in words (shipped 18 October) | small | v62 | Marcus, the clerk, Dana |
| 23 | v64 The pages as windows: Briefing, People and the rest over the dimmed map, Expand to full screen (shipped 18 October) | small to medium | v63 | Marcus, the IC, the clerk, Priya |
| 24 | v65 The People board: cards and a drawer, the bar, the Members tab (shipped 18 October) | medium | v64 | Priya, Marcus, the Safety Officer, the clerk, the newcomer at the post, the administrator |
| 25 | v66 Went to and On which run as chips on the house record, and the base's arriving rows the same (shipped 18 October) | small | v65 | Ana, every crew, the desk, Marcus |
| 26 | v67 A picture by its corners: aerial photography dragged into place by its four corners (ready on branch `imagery`, PR #1) | medium | v66 | Marcus, Dana, Civil Air Patrol and drone pictures, every phone's mini map |
| 27 | v68 Need help now: what's wrong and what you need, two rows of chips on the emergency sheet (shipped 18 October) | small | v67 | Ana, Moreno, Marcus, every phone |
| 28 | v69 Claim a band, submit licences, Operations confirms: the band as the door, credentials on the account, pending until confirmed (built 18 October) | medium, v55-sized | v68 | Rosa, the newcomer, Reyes, Marcus, Priya, the clerk |
| 29 | v70 A transport on the map: every open run as a dashed line and a pill, the bus where the driver's phone is (shipped 18 October) | small | v69 | Marcus, his relief, the IC, the desk, a driver |
| 30 | v71 The 211 as a table: a table per unit, the totals as a small one, the text and the email keeping the lines (shipped 18 October) | small | v70 | the clerk, Priya, Marcus, the administrator |

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

- **The People board's bar and tabs** (Todd, 18 October): Close wraps to a second row at the left while Print 211 is cut
  off at the right; the qualification chips and the search sit above both tabs though they filter only People, and a lit
  chip stays lit on Members. The tabs first, the search and chips inside the People tab, Close last at the right. Sent
  to the People board's mock-up page; built as v65 (section 24).
- **The Members tab reads as four command posts** (Todd, 18 October: "these other potential operators feel like forward
  operating bases"): every unit's row carries a Make Operations button as loud as Open and Remove. Present the roles as
  two groups, Operations (who opened the incident, who else holds it) and Units, with Make Operations a quieter action
  in the row's menu or on the unit's own panel. The question it asks says what they get and what changes since v62
  (section 21); the grouping, the row's ··· menu and the Identity column were built as v65 (section 24); what happens to a
  division assigned to a unit made Operations is still to check.
- **The People board, offered better** (`/try/mockups/people.html`, its own session): the six controls on every person's
  row crowd out the facts; three directions drawn, Todd chose C (cards and a drawer), built as v65 (section 24).
- **Replay: a time you name, and a speed in words** (`/try/mockups/replay.html`): built as v63 (section 22), with the
  run-up before the first position cut off rather than hatched; past periods in the menu and clicking the time to type a
  moment are still to do.
- **The pages as large modals, not full screens** (`/try/mockups/modals.html`): Briefing, People and the rest over the
  dimmed map with Expand to full screen; the alarm line, printing and the pop-out log thought through there. Built as
  v64 (section 23).
- **Placing aerial imagery by its corners** (`/try/mockups/imagery.html`): drag the picture to fit instead of typing four
  edges; a rectangle first (today's bounds), four free corners later.
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

## 20. v61 The units section, cleaner

**Why.** Panel 2 of Todd's walk (section 19): the Resources section's rows packed the unit's name, its kind, the crew's
names, the count, the lead's name coloured by verification and a tick on one line, then "Assigned to A-1 since 13:23 ·
2 min ago, E 095°" under it; the "6 people in the field on 3 units" sentence wrapped beside two chips and a button; the
group headings were chips that looked like buttons; the PAR panel repeated "All accounted for (2) · 14:24" on a row
per unit. A glance did not say where each unit was.

**Built.** One line per unit: the name and its kind, and at the right where it is, the division's code for an
assigned unit (blue; hover for "Assigned to A-1 since 13:23"), else Available, Out of service with its reason, or
Checked out with the time; under it the facts, joined by dots: the names, the count (or "head count unknown" in
orange), the lead with ✓ or "no ID", since when, the last position's age and heading, the water clock. The section's
heading carries the counts, "Units · 6 people in the field on 3 units", a Kind | Status switch and the People board;
groups are headings, "Engines · 1", "Assigned · 3". The PAR is "Head count (PAR)" with one line, "14:23 to everyone ·
all 6 accounted for by 14:26" (or "N still to answer", or "everyone answered" when an answer has no count), and a row
of answer chips carrying each unit's words and scans. The requests' heading reads "Requests (213RR) · 2 open".

*Decided:* the app's shared "Unit 1, engine" stays (the forms say it so); "people in the field" stays in the heading
rather than the mock-up's "6 people", since the panel also counts people sheltered; the request cards keep their forms.

## 21. v62 Confirmations as the app's own dialogs, and the band door

**Why.** Todd, walking the base at v59 on 18 October, met "Make Unit 1 Operations? …" in the browser's own Cancel / OK
box: "this should be a modal. in fact across the app, all notifications like this should be modals". And of a band's
QR read by a phone that was signed out, which landed on the bare sign-in form: "when a user scans a band they are
presented with this screen, I don't think that is right".

**Built.** Every question the app asks before it acts is a dialog of its own, `askConfirm()` beside v44's `askName()`:
a title that is the question, what it does in a line or two, Cancel and a button that names the act (Replace it,
Make Operations, Remove, Clear now, Close the incident, Withdraw, Void it, Mark it, Take off, Check out, Report
missing). Twelve on the base (New code, Make Operations, Remove a member, Clear now, Close the incident, Withdraw an
invitation, Void band, Withdraw a run, Take a person off the roster, Remove imagery, Mark clear from the base, Check
out) and one on the phone (Missing someone on a PAR). Make Operations says what they get (the base: the map, drawing
and assigning, every identity, the Operations code, roles, the clearing) and what changes (their row leaves the units
and reads Operations everywhere; their phone stops showing a unit's briefing; the 214 says "Unit 1 is now Operations").
A band's link opened on a signed-out phone says "Band 025 is waiting. Sign in and the scan goes through." where the
door says "Code CEDAR7 is ready" for a join link, with one line under it for anyone not on the team: an Incident Map
band identifies a person to the incident's team only; on its own it tells you nothing; hand it back to them. The
number is read out of the band's code (`bandCodeNumber` in rules.js), since a signed-out phone has no incident to
look it up in.

*Decided:* Escape and the dialog closing any other way are Cancel; the buttons that cannot be taken back (Remove,
Clear now, Report missing) are red; the phone's dialog takes plain text, the base's a line or two of HTML through
`esc`; the browser's `confirm()` is gone from both views and the smoke's `reload()` makes it throw, so none comes
back unnoticed; the Members tab's grouping of the roles (section 15) is still to do.

**Shipped** 18 October 2026 as `Confirmations as the app's own dialogs, and the band door (v62)`: `askConfirm` in
js/base/main.js and js/field/main.js, `#confirm-dialog` in both HTML files, `drawAuthBand` and `#auth-band` on the
phone's sign-in screen, `bandCodeNumber` in rules.js; the suites' `autoConfirm` in place of the `window.confirm`
stubs, the `seeded`, `members` and `tags` suites reading the dialogs and the door, and the `ics100` suite's board
check now waits for the home panel (Close redraws it on the next frame; with the pane visible the read came first,
and the v61 runs had the pane hidden); full run 741 of 741 across 38 suites with the pane visible; check and test
pass; every rule test 20 of 20 files (331 checks). No migration; the mock needed nothing.

## 22. v63 Replay: a time you name, and a speed in words

**Why.** Todd, walking the base at v59 on 18 October, opened Replay's range menu: "in this drop down menu there should
also be the option to set a specific time and date, but it should be super clear when the boundaries of information
was started to be collected so that someone can't click into nothingness". And of the speed menu's 10× / 60× / 600×:
"I don't understand this menu at first glance."

**Built.** Every range of the Replay starts no earlier than the incident's first position (the earliest `ic_tracks`
row, read once when the bar opens through the members' select policy), so the slider never covers a moment with
nothing to show, and the menu says where each begins: "This period · from 08:00", "Whole incident · from 06:40",
"Last hour" bare unless the first position cuts it short. Pick a time… is the menu's fourth option: a date and a time
on their own row inside the bar, bounded by the first position and now, with the bounds in one sentence ("Positions
run from 06:40 to now, 10:05.") that turns orange with the reason while Go is off ("06:00 is before the first
position, 06:40.", "11:00 has not happened yet."); a moment outside the open range reopens the whole incident at it.
The speed menu reads Slow · 10 s a second, Normal · a minute a second, Fast · 10 min a second, the × in each option's
hover title. An incident with no position yet gets the empty state: every range reads "no positions yet", Pick a
time… is off, so are Play and the slider, and one line says "Nothing to replay yet: the first phone to check in
starts the record." The mock-up (`try/mockups/replay.html`) drew three treatments of the run-up before the first
position, hatched, dimmed and cut off; cut off was built as the most robust, since nothing can be clicked into and
the native slider stays, and the minutes before the first phone are still in the log.

*Decided:* the pick is bounded by now, never by the period's planned end; the boxes hold minutes, so the first
position's own minute counts as it (the smoke suite caught 16:16 typed for a first report at 16:16:37 being refused);
no migration and no function, since the first position is one ordered select through the policy that already exists;
past periods in the menu and clicking the time to type a moment are left for later.

**Shipped** 18 October 2026 as `Replay: a time you name, and a speed in words (v63)`: `replayWindow`,
`replayWindowLabel`, `dayHhmm`, `replayPickCheck` and `dayIso` in rules.js, `data.replayFirst()`, the replay block of
js/base/main.js, `#replay-pick` in index.html and its styles in base.css; the `replay` suite reads the menu's words,
the speed words, the sheet's bounds and refusals, Go and Cancel; full run 748 of 748 across 38 suites on v62 plus this release alone (the shared tree, with the pages-as-windows work still open in it, ran 751 of 756, the five misses in that work);
check and test pass; every rule test 20 of 20 files (331 checks). No migration; the mock needed nothing.
## 23. v64 The pages as windows

**Why.** Todd, walking the base at v59 on 18 October, opened Briefing, then People, and each took the whole window:
the map, the alarm line and the log gone behind it. "Perhaps for all of these buttons, instead of opening a full
screen window, we show it as a modal that takes up the majority of the screen and then a user can choose to expand a
full screen." Drawn first as `try/mockups/modals.html` (the base at 1280 × 800 in its own stylesheets, the Briefing and
the People board as a window and full screen, an emergency arriving in each, a phone, the decisions), then built as
drawn.

**Built.** Briefing, Org chart, People, Public, Transports, Sitrep and IAP, and the printed 204, 211, 214, join card,
band sheet, Hours and the shelter's list, open in a window over the dimmed body: 870 px wide for a paper (its 820 px
sheet with the desk showing at the sides), 1150 px for a board (the People board kept its 1100 px, so at 1280 it loses
no width), 20 px above and below, scrolling inside, under the header and the alarm line, which stay live (the gear
menu, the codes' and the connection's cards and Find a person sit over the dim). **Expand** before Close makes the
page full screen: the header folds away, the alarm line stays as the top strip, the page fills the rest; **Shrink**
brings the window back. The choice is this device's (`ic.base.pages`, like the theme), and the gear menu's "Pages
full screen" / "Pages as windows" swaps it too. An emergency, a safety message or a PAR arriving while a page is open
is on the alarm line in front of it in either state, and the base rings as before. Escape closes the page (a focused
field is left first), and so does a click on the dim, as the division's card does; a form in the page with typed words
not yet saved holds both off with "Save or cancel the form first". Printing is unchanged: the paper alone, the window's
edges and the dim off. Under 900 px a page is full screen always and the buttons are hidden. A window's bar stays one
row: the title whole, the sub-line cut short.

*Decided:* all seven pages and the printed forms move together, one setting, not the papers full screen and the boards
as windows; the header folds away in full screen (kept, full screen would gain only the dim and 40 px); the dim is 38%
black (the division's card's backdrop is 45%); the words are Expand and Shrink; the pop-out log is unchanged (it never
opens a page itself; a line's link asks the main window, which opens the page in the remembered state). Not built: a
Pop out for the papers (the Briefing or the IAP alone in a window of its own, like the log, for the second screen at
the command post), a natural next step now that the pages are windows.

**Shipped** 18 October 2026 as `The pages as windows (v64)`: `.briefing` as the dim and `.briefing-win` as the window in
base.css (the full-screen, print and narrow rules with them), `placePages` / `setPagesFull` / `pageDirty` / `closePage`
/ `closeOverlay` and the `pages-size` action in js/base/main.js, the wrapper and the Expand button in each of the four
overlays and the gear menu's item in index.html; the `pages` smoke suite (13 checks: the window's place and width, Expand
and Shrink with the setting, an emergency in front of a full-screen page, Escape, the board's width, the half-filled
form, the dim click, the print rules, the gear menu's item); full run 761 of 761 across 39 suites; check and test pass;
every rule test 20 of 20 files (331 checks). No migration; the mock needed nothing.
## 24. v65 The People board: cards and a drawer, the bar, the Members tab

**Why.** Todd, walking the base at v59 on 18 October, marked the People board three times: the six controls on every
person's row (two selects and four buttons) crowded out the facts; the bar wrapped at 1280 with Close lost on a second
row and Print 211 cut off, and the find box and the qualification chips sat above both tabs though they narrow only
People; and the Members tab "felt like forward operating bases", every unit's row carrying Make Operations as loud as
Open, with an identity badge that did not say what to do. Three directions were drawn in `try/mockups/people.html`
(A facts first with one menu per row, B tick and act, C cards and a drawer) and Todd chose C; the same page drew the
bar and the tabs and the Members tab, with a Decide tab of what was decided and what was still his.

**Built.** The board's bar is the People | Members tabs first, the incident's name alone (the lit tab names the page,
the header has the clock), then Hours, Print 211, Print bands, Expand and Close at the right, one row at 1280. The
find box, the chips and Add a person are the People tab's own heading row under the bar, hidden on Members, drawn once
so the box keeps focus across live redraws. A unit is a card: its name (a link to its panel), the status badge, the
division, agency · kind · n on the unit; a person is a line on it: name and rank, the time on scene at the right
("2 h 57 min", orange with "· past 12 h" when over the period's hours, "· back in" after a stint), the band and its
last scan ("Band 001 · entering A-1 15:03", orange with "· 8 h ago" when the scan is older than two hours), the
qualification chips; Add a person at the card's foot opens the form with the unit fixed. Pressing a line opens a
340 px drawer beside the cards, which fall to two columns: the facts as a key-value list (On scene since when, Last
seen by whom and the band, With, Qualified, Notes), then every action as a full-width button or select with what is
kept said beside it (Check out or Back in; Move to…; Pair with…; Edit, the same form in the drawer; Void band 001,
"Never reused; kept on record."; Remove, "Off the roster; kept on record, Put back undoes it."; Put back on a removed
person, who stays on the card greyed), and In the log: the person's lines from the 214, found by name, newest first,
six at most. Escape and Close close it. Red stays MISSING, the orange tint stays on an over line. The Members tab is
two groups, Operations (the opener first, "opened the incident", nothing to press; another holder "since hh:mm") and
Units ("Unit 1, engine · Assigned · A-1"), each row who, name · phone · agency, the Identity column ("ID checked ✓
14:05" green; "ID given, not checked" grey with Check, which opens the unit's panel with the licence and the photo
unfolded where Mark verified is; "No ID" orange with Check in person, the same press as Mark verified), Open and a ···
menu kept open across live redraws and closed by a click outside, Escape or pressing an item: Make Operations… or
Make a unit…, each asking with the app's own dialog in Todd's words ("Make Unit 1 Operations?", what they get, what
changes, Cancel / Make Operations; "They check in on a phone, hold divisions and send reports; the base is
Operations' alone."), and Remove · kept on record; Restore on a removed row. Escape works the board's own layers
first: the menu, then the drawer or the form (a half-typed form holds it off, as the dim click does), then the page.

*Decided:* the drawn choice wherever the Decide tab left it open: the log lines by name in the 214's text (no
migration), chips under the name, pairing kept on the board, the unit header with status, division, agency and the
count, the chips' zeros kept, a second Operations row "since hh:mm", Check opens the unit's panel, Add a person at the
right of the heading row. Chosen differently from the drawing: the confirm on Void band and Remove is kept (the mock
skipped it), since the brief kept every handler and the dialog already says what is kept; the drawer stacks above the
cards under 900 px (the full-screen breakpoint); "Check out the unit" on a card's header (B's borrowing) is not built.
Every `data-action` and handler of v29 to v55 is kept; only where they are drawn changed. Nothing is deleted anywhere.

**Shipped** 18 October 2026 as `The People board: cards and a drawer, the bar, the Members tab (v65)`: the bar, the
heading row and the `.people-body` wrapper in index.html, `personFacts` / `personLineHtml` / `unitCardHtml` /
`personFormHtml` / `personDrawerHtml` / `peopleBoardHtml` / `membersHtml` / `identityState` in js/base/ui.js, the
drawer, the menu, Check and the Make a unit… dialog in js/base/main.js (`state.people.open` / `menu` / `addFixed`),
the styles under "v65" in base.css; the `people`, `members`, `tags`, `sections`, `rewalks`, `parbyname`, `pages`,
`walkfix` and `invite` suites drive the cards, the drawer, the menu and the dialogs; full run 772 of 772 across 39 suites (761 at v64 and 11 of the board's); check and test
pass; every rule test 20 of 20 files (331 checks). No migration; the mock needed nothing.
## 25. v66 Went to and On which run as chips

**Why.** Todd, walking the phone's Address clear on 18 October: "I think we can make this drop-down a little better
where it's more intuitive for the user to click, perhaps a series of buttons." Every other field on the sheet was a
chip row (Occupants, Water at the structure, Damage, Hazards left there); each person row under People needing help had
two native drop-downs, Went to and On which run, the only pickers on the phone, and the picker cut the runs' words off
("On Bus 3 · A-1 Riverside Drive, east → High school gym · leaves 18:04 · expected 18:29 · 0 of 40"). The Went to box
could also say one place while the run chosen went to another, and the run won silently at Save.

**Built.** Went to is a chip row: the shelters, then the hospitals (`PERSON_PLACES`), each by its name, then With family,
Own transport, Not known (`LEFT_CHOICES`), the nearest shelter lit as before. Under it, when open runs go to the place
chosen, On which run is a row of cards: "Bus 3 → High school gym" over "leaves 18:04 · expected 18:29 · 0 of 40"
(`runCard` in rules.js: the label, the destination, `transportTimes` and the seats), Not on a run first and lit, the
crew's own division's run first and marked with its code, a late run's times orange, folded past three to the first two
and "N more" (`foldRuns`, `RUN_FOLD`), the run chosen never hidden. A run tapped sets Went to from its destination; a
place tapped that the run does not go to takes the person off it and says so, so the row always says what Save sends.
Save sends what it sent before: `wherePatch`'s status and facility and `transport_id`, the run's destination winning, so
the desk, the board and the 214 see no difference. The base's arriving rows on the shelter card carry the same cards at
40 px in place of their drop-down (`runChipsHtml`), with the row's whole width under the facts and Signed in at the end.
The mock-up (`try/mockups/runchips.html`) drew the row as it was, the row as proposed, a run chosen, and a fourth frame
with the run tapped first and every open run listed; place first was built, as Todd approved it, and run first stays
drawn as the alternative (one line to switch, in `stRuns`).

*Decided:* chips, not drop-downs, since the two selects were the only pickers on the phone; the words and the order are
rules.js's, "Not known" being `LEFT_CHOICES`'s word; the seats stay on the card (whether the family fits is what the
crew cannot see from the corner); past three the cards fold to two and More, so a sheet with gloves does not grow a
screen per person; the base's rows changed in the same release, so the two views draw one run one way; no migration.
The sheet draws its rows once, when opened, as the drop-downs were: a run planned while the crew types is on the next
open.

**Shipped** 18 October 2026 as `Went to and On which run as chips (v66)`: `runCard`, `foldRuns` and `RUN_FOLD` in
rules.js, `stWhereChips` / `stRuns` / `stRunCards` and the `st-where` / `st-run` / `st-runs-more` actions in
js/field/main.js, `runChipsHtml` and the `ev-transport` / `ev-runs-more` actions on the base, `.rcard` in shared.css,
the row grids in field.css and base.css; the `evacuees` suite reads the chips, the fold and More, the `transports`
suite the cards on both views, a run tapped, a place that takes them off it, and the base's cards. Full run 754 of 754 across 38 suites on
v63 plus this release alone (the worktree's own served copy, the pane hidden); check and test pass; every rule test
20 of 20 files (331 checks). No migration; the mock needed nothing.

## 26. v67 A picture by its corners

**Why.** Todd, walking the base at v59 on 18 October: "The upload aerial photography tool feels clunky. A user should
be able to set corners to stretch and narrow the aerial photography to make it all fit." The form asked nine things,
four of them edges in degrees, before the picture was seen at all, and a photo from an aircraft never fits a
rectangle. The mock-up is `try/mockups/imagery.html`: two kinds of handle with what each costs, the four corners
recommended and built.

**Built.** Add a picture is one button, on the Layers panel and the home panel's Map imagery section. The picture
lands over the map's view at half strength in its own shape, with four corner handles, a round Turn handle above its
top edge and the picture itself to move; arrows nudge (Shift ten), Undo and ⌘Z step back, Escape cancels. The card
over the map asks Name and Taken at, filled from the file's name and its Exif date (js/shared/exif.js, else the
file's modified time), with the opacity live. Save writes `ic_overlays.corners` (`[[lat, lng] × 4]`: top-left,
top-right, bottom-right, bottom-left) with `bounds` as their box; migration 0035 adds the column, `ic_corners_ok` and
an `ic_overlay_before` that writes the box itself, so every reader of bounds stays right. Both views draw a picture
with corners through `cornersImage` in js/shared/layers.js, one image under a matrix3d, redrawn on zoom and animated
with it, so the phone's mini map changed by one line; a picture with no corners fills its bounds as before. Adjust on
a saved row reopens the handles and logs "updated".

*Decided:* placing is the base's alone, the phone shows; the picture sits under the drawn layers (the `placing` pane
at 260); the slider's value is what is saved, and it starts at 50 so the roads show through; a corner dragged across
the picture is refused, so the quadrilateral stays convex; Cancel takes a new picture off and leaves an adjusted one
as it was. Still open from the mock-up: a JPEG's GPS point as the landing spot, dimming the other pictures while
placing, placing on a tablet in the field, a Turn slider on the card, the picture on the printed 204.

**Ready** on branch `imagery` (PR #1), to land as v67 after v66: `js/base/placing.js`, `js/shared/exif.js`,
`cornersImage` / `cornersTransform` / `quadConvex` in layers.js, `cornersBox` / `cornersOk` / `boxCorners` /
`overlayCorners` in rules.js, `overlayPickHtml` / `placeCardHtml` in ui.js, `landingCorners` and `placingId` in
map.js, `#place-card` in index.html; the mock mirrors the trigger and seeds a turned picture (`SEED_VERSION` 34); the
`layers` suite covers the flow (25 checks); `dev/test-layers.mjs` and `dev/test-exif.mjs` are new. Migration 0035 is
applied to the real database and all 21 rule tests pass there (`corners.sql` 10 of 10); full run 749 of 749 with
main's v62 merged in.

## 27. v68 Need help now: what's wrong and what you need

**Why.** Todd, on the phone's Need help now sheet at v62 on 18 October: "I think on this screen we should be able to
add better context, either what kind of help or the nature of the danger? What do you recommend?" Drawn first as
`try/mockups/mayday.html` (four phones at 375 px on one shared state, the base's alarm line, unit panel and 214
following them, the data note, the decisions), then built as drawn.

**Built.** Two rows of chips on the sheet, under the Will be sent card and above the buttons, optional and
multi-select, 52 px tall, two to a row: **What's wrong** (In the water · Trapped · Injured · Cut off · Unsafe
structure · Someone missing) and **What you need** (Boat · Medic · Rope · More hands). Send alert is the same button
in the same place: a press with nothing chosen sends today's alert, word for word. The words ride on the alert: the
alarm line reads "EMERGENCY · Unit 3 needs help in A-2 · trapped, injured · needs boat · sent 17:46" (the words before
the clock, so they survive the cut), the unit panel's badge the same words, the 214 "EMERGENCY, Unit 3 needs help in
A-2: trapped, injured · needs boat", the briefing's Needs attention too. The chips stay live on Alert sent, because
the first press is a reflex and the detail comes a breath later: each tap updates the open alert and writes its own
line ("Unit 3 adds: needs medic"; a lit chip tapped again, "Unit 3 takes back: medic", because gloves slip). The
words are read in the lists' order, never the tap's. No free-text box; the sheet's sentence is shorter ("Goes to
Operations and every unit, with your position."). The PAR's missing report still sends its note and no chips, and
the note reads after the chips.

*Decided:* the lists changed from the first recommendation ("Person in the water" and "Vehicle in water" became one
chip, the car being a detail that the Boat chip and the position cover; "Lost" became "Cut off", what a flood does to
a crew; "Someone missing" added, the button a lead presses before any PAR); codes in two array columns
(`ic_alerts.wrong` / `needs`), not the note, so the line after a tap says what was added in one array expression and
the note stays the PAR's; the chips change only by the unit that raised the alert, never after a stand-down; no
second chime for a change of words. Not built, each in the mock-up's Yours to decide: a "Tools" chip, Operations
setting the chips from the base, the chips only after the send.

**Shipped** 18 October 2026 as `Need help now: what's wrong and what you need (v68)`: migration
`0036_alert_words.sql` (the two columns and their checks, `ic_alert_labels` / `ic_alert_text` / `ic_alert_list`,
`ic_alert_before`, `ic_log_alert` from 0021's body with the words on the insert line and the adds / takes back
branch); `ALERT_WRONG`, `ALERT_NEEDS`, `alertWords`, `alertCodes` and `alertChange` in rules.js (`dev/test-rules.mjs`);
`data.setAlertWords` and the codes on `raiseAlert`; the phone's `alertAskHtml` / `drawHelpAsk` / `tapAlertChip`, the
`alert-chip` action and outbox kind `alertWords`, `#help-ask` and `#helpsent-ask` in field/index.html, `.alert-ask` in
field.css; `maydayHtml`, `unitHtml` and the briefing's attention line on the base; the mock's columns, checks,
`alertBefore`, both lines and the morning's stood-down alert in the seed (`SEED_VERSION` 34); the `emergency` smoke
suite extended with the phone (12 new checks); rule test `supabase/tests/alertwords.sql` (18 checks). Full run 798 of 798 across 39 suites (on v67); check and test pass; every rule test 22 of 22 files (359 checks). Migration 0036 applied
on 18 October, before the push, since the apps read the two columns on start.
## 28. v69 Claim a band, submit licences, Operations confirms

**Why.** Todd, 18 October: "make it super easy for someone to scan a badge and then identify themselves to that badge
and submit licenses for approval and then licenses show up on their account with either a pending status or confirmed
status. That way people can know if they are verified or unverified, but they can get the badge right away." Until now
a band was never a way in (it waited through sign-in and opened only once the incident was open), a crew member on
their own phone had no row to pick and no right to give a band, and a qualification was a word the lead tapped: no
proof, no approval, typed again at the next incident. Drawn first as `try/mockups/credentials.html` (the flow on
Rosa's phone, the base's queue, the 214, the board's row, the hover card, a 211 excerpt, the data and the decisions),
then built as drawn, with the decisions below.

**Built.** The band is the door. A band's QR on a signed-out phone still says "Band 005 is waiting" (v62); signed in,
or after Create account, an unissued band opens **Is this your band?**: the name and phone (the profile's, or typed
once, as the Identify sheet does), the agency, the incident's units to pick from with the agency's picked, or "Not on
a unit yet", and one button, **It's mine**. The phone asks the database only what a stranger may know
(`ic_band_peek`: the number, the incident's name, whether the band is free, the units); a band on someone, a voided
or a closed one says so on the check-in form and nothing more. It's mine (`ic_claim_band`) puts the person on the
incident that moment: a member riding with the unit (`ic_members.rides_with`, the unit's name, so everything they
send reads "Unit 2" and the base's lists see one Unit 2), a person on the unit's roster with their own account on the
row (`ic_people.claimed_by`; the unit's unclaimed row of their name or surname is taken over, not doubled; else one of
the people the lead counted but did not name), the band theirs, the check-in scan on record, one 214 line, "Rosa
Alvarez claimed Band 005 (Unit 2)". With no unit chosen they are a unit of their own, named after them. A member
scanning an unissued band from the menu gets a "Me · name" chip on the band sheet for the same claim. **Add your
licences** opens next (before the briefing, and from Add a licence on the You card): the fixed list, the driver's
licence first as the ID (which stays the profile: the row opens Identify yourself), EMT, paramedic, swift water, boat
operator, rope, K9, hazmat, drone, other with its title; Camera or Type (a number, who issued it, when it expires), each
through the outbox and **pending** at once; the credential belongs to the account and follows the person to the next
incident. The **You card** on the home screen and in the menu says the ID's standing (none · given, not checked ·
checked ✓ hh:mm) and each licence's (pending · sent hh:mm · confirmed by Operations hh:mm · not accepted hh:mm: why).
The base: **To confirm · N** on the home panel after the PAR and at the top of the People board, each with the photo
from a signed link or the number's tail, who and from which unit, the kind, the issuer, the expiry (expired in orange);
**Confirm** is one press, **Not accepted…** asks why in the app's own dialog (Expired · Cannot read it · Not this
person · Wrong kind, or your own words); each is one 214 line, written to every active incident the owner is on
("Rosa Alvarez's EMT confirmed by Operations", "Minh Nguyen's boat operator not accepted: expired"). A person's chips
read **EMT ✓**, **EMT · pending** or **Boat ✗** (the reason in the title) beside the lead's plain words, on the board, the
unit panel and the division's hover card, which gains a "who is qualified for what" block; a person with their own
account on the row says "own account" with the ID's state; the 211 prints the same words (✓, (pending), (not
accepted)) with a legend. Nothing is deleted: a refused credential keeps its reason and the person submits again, a
withdrawn one is archived, a changed number goes back to pending, and the 30-day clearing blanks the number and the
photo while keeping the fact ("EMT, confirmed by Operations 18 Oct").

*Decided:* a band alone is the door (Todd: "they can get the badge right away"; the found-band risk is on the 214 and
Operations removes them); Operations of the incident confirms, from the queue; credentials belong to the account;
the claim puts the person on the incident at once and approval is asynchronous; one fixed list shared by both views
and the SQL check; nothing is deleted; the ID stays the profile, so the `licence` kind is in the list but the phone
never writes it; a claimant is a member riding with the unit rather than a roster row alone (the policies, the
realtime filters and the data module work unchanged, and `data.units()` keeps riders off every list of units) rather
than a second unit; a rider's phone sends no position (the unit's phone does), shows the unit's division read-only with
no Accept and no search buttons, and gets no PAR of its own; an other needs a title, so it offers Type alone; the
decision stamps `confirmed_by` / `confirmed_at` for either answer. Not built: the Members tab's three-state Identity
column (that is the People board mock-up, v65); messages, the PAR and positions for a rider's own phone; a credential
withdrawn from the phone (the database allows it; the sheet offers Submit again on a refused one instead).

**Shipped** as `Claim a band, submit licences, Operations confirms (v69)`: migration `0037_credentials.sql`
(`ic_people.claimed_by`, `ic_members.rides_with`, `ic_tag_before`, `ic_band_peek`, `ic_claim_band`, `ic_credentials` with
`ic_credential_before` / `ic_credential_after` / `ic_decide_credential` and its policies, `ic_clear_personal`), rules.js
(`CREDENTIAL_KINDS` … `qualsTextWith`), data.js (`credentials` … `claimBand`, `units()` without riders, `myZones()` for a
rider), the mock (`SEED_VERSION` 34), the phone's `#s-claim`, `#s-licences` and `#you`, the base's `toConfirmHtml`,
`askReason` and the chips, the rule test `supabase/tests/credentials.sql` (50 checks) and the
`credentials` smoke suite (31 checks); full run 830 of 830 across 40 suites on 18 October, rebased onto v68, at 1280 wide; check and test pass; 0037 applied
from the main session on 18 October, and every rule test on the real database after it: 23 files, 409 of 409
(`credentials.sql` 50 of 50).

## 29. v70 A transport on the map

**Why.** Todd, 18 October, of the transport board at v54: "For transports we should make it easy to expose a transport on
the map view." A run was a row on the board and a line on the shelter card; the map, which is what Operations watches,
showed nothing of it: not where the bus was, not where it was going.

**Built.** Every open run (planned, loading, en route or arrived; done and withdrawn come off) is drawn on the base's
map: a dashed line from the pickup to the destination, a white dot at the pickup (the facility's spot or the division's
centroid; a pickup typed in words has no point), a ring around the destination's facility mark, and the run's label as a
pill, "Bus 2", on the driver's phone while its last position is fresher than five minutes (the division hover card's
rule), with a tail down to the unit's dot. With no fresh position the pill sits midway along the route with a dashed
edge, and a run with no pickup point draws its line from the vehicle. The colour is the state: planned grey, loading
purple, en route blue, arrived green, late orange. Hover gives the board's line ("Bus 2 · Pecan Park pickup → High
school gym · left 17:05 · expected 17:30 · 4 of 40 · Unit 2's phone 17:40"). A click on the pill, the line or either end
opens the board on that run. Show on map, on the board's rows and the home panel's runs, closes the board, brings the
run into view and lights it (a ring on the pill, a heavier line) until Escape, a click on blank map or another Show. The
legend has a Transport run entry. Replay takes the runs off with the live units and Close puts them back. The phone's
mini map is unchanged.

*Decided:* no migration: the pickup, the destination and the vehicle come from `ic_transports`, `ic_facilities`,
`ic_zones` and `ic_positions` as they are, so the bus is where the driver's phone is, and a driver not in the app (a name
and a phone) has no pill on the vehicle, only on the route; the label is drawn even without a vehicle, so a planned run
is findable on the map; the pill sits above the unit's dot (the same phone) with a tail, not beside it; loading is
purple, not the board's orange tint, because orange means late on the map; a done run comes off, since the board and the
214 keep it. Not built: a pickup clicked as a point on the map (section 15, from v54), the run on the phone's mini
map, a trail behind the bus.

**Shipped** 18 October 2026 as `A transport on the map (v70)`: `mapRuns` / `runState` / `runGeometry` / `RUN_FRESH_MS`
in rules.js (`dev/test-rules.mjs`); `data.mapRuns()` / `data.runOnMap(t)`; `renderRuns`, `fitRun`, `RUN_COLOR` and the
`runs` layer in js/base/map.js (`setReplay` clears it); `onTransport`, the `tr-show` action, `state.runLit`, Escape and
the blank click in js/base/main.js; `runShowBtn` on the board's rows and the home panel's `.tr-home` rows in
js/base/ui.js; `.tr-mark` / `.tr-line` / `.sw.run` / `.tr-home` in base.css; the legend entry in index.html; the mock
gives Bus 2 Unit 2 as its driver, so its phone is the bus (`SEED_VERSION` 35); the `transports` smoke suite gains 11
checks (45). Full run 838 of 838 across 40 suites; check and test pass; no migration.

## 30. v71 The 211 as a table

**Why.** Todd, 18 October, of the printed Check-in list: "I like the idea of this but I don't like the execution." The
211 is a form, and forms are tables; it was the same run of "·"-joined lines every paper uses, a person's eight facts in
one sentence, eight sentences under a unit.

**Built.** On the page and on paper, each unit is a table under its line: the unit's heading as before ("Unit 1, engine
· Cedar Fork Fire Department · Assigned · A-1"), then "Checked in by …" with the identity words and, for a checked-out
unit, what it left undone, then one row per person: Name (the agency when it differs from the unit's, the buddy, "own
account" and the notes in small type under it) · Rank · Qualifications (v69's ✓ and (pending) as before) · Checked in ·
On scene · Band, last seen · Out. A checked-out person's row is grey. A unit with no names keeps its one line. The totals
are a small two-column table: Checked in, On scene, Checked out, Units, then a row per agency and per qualification on
scene; the credentials legend under it. Nobody is printed twice: the page draws the table in place of the person lines.
The copy and the email (`form211Text`) keep every line word for word, so the suites that read the 211's words still do.
Print CSS gives the tables plain grey borders, repeats the header row on a new page and keeps a row whole; a unit's
section is kept on one page where it fits (the `has-map` rule a figure already had). Rides along: the Layers panel's note
now says a Map Tiles API key is pasted into Incident settings, under the gear, not "set in config.js" (true since v28).

*Decided:* one flag on a section, `figureOnly`, so `sectionsHtml` draws the figure in place of the lines and
`sectionsText` never sees it; the unit's own lines (who checked it in, what it left undone) ride inside the figure as
paragraphs, so the table sits under them as on a paper form; the buddy, the agency and the notes go under the name
rather than into three more columns, which would not fit 870 px; the totals as rows, not a sentence. Not built: a
signature line per person, a column for the hours (the Hours sheet has them).

**Shipped** 18 October 2026 as `The 211 as a table (v71)`: `form211Sections` (`cell211`, `table211`, the totals'
`figure`) and `sectionsHtml`'s `figureOnly` in js/base/ui.js; `.t211` / `.t211-totals` and their print rules in
base.css; the Layers note in `layersPopHtml`; `row211` / `cells211` in dev/smoke.js, the `people`, `rewalks` and
`credentials` suites' 211 checks reading the rows. Full run 838 of 838 across 40 suites; check and test pass; no
migration.

## Done before this list

The previous punchlist (items 1 to 6, from the v24 walkthroughs and the re-walks after v25 and v26) shipped on 17
October 2026: the re-walk after v26 (`22db8c5`), Members and roles with personal records that clear by rule (v27,
`0ea25c2`), Time in the water, incident settings and the public set (v28, `ffdc7a8`), Accountability by name (v29,
`386586d`), Small fixes (v30, `9ec9782`), and Grace's four decisions with the Deputy seat (v31, `08b2156`). What each
built is in the git log, the README's feature lines and the "Re-walk after vN" sections of
[walkthroughs.md](walkthroughs.md).
