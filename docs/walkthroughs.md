# Persona walkthroughs (v24)

Each persona in `docs/personas.md` walked through the app with only that person's knowledge, on 2026-10-17 at v24 (commit 08049cc), in mock mode (`?mock`) with the seeded incident Cedar Fork Flooding. The phone personas used the field app at 375 × 812; the base personas used the base at 1280 × 800. The walker did not build the app and did not read its source; where a screen needed something the persona would not know, that is written down as friction rather than worked around.

Two limits of the mock and the Browser pane colour the notes. The camera is blocked, so licence scans, code scans and photos could not be taken (what the app says when the camera is refused is recorded instead). The pretend GPS stands every phone in division A-2, so a unit that is really at staging or at a bridge sees "You are standing in A-2".

Severity: **LOST** = could not finish the job; **SLOWED** = finished after a wrong turn; **PUZZLED** = finished, but a word or layout meant nothing to them. Screenshots of LOST and SLOWED moments are in `docs/walkthroughs/`.

Personas walked, in this order: 8, 10, 9, 4, 2, 1, 3, 5, 6, 7, 11. Persona 12 (the resident) is not a user and was skipped.

---

## 8. Capt. Reyes, mutual-aid captain from two counties over

Phone, plus the base for the printed 204 and the join card. Walked as a new account, Brush 12, Bandera County FD.

**The jobs, in his words**

1. "Check in at staging": scan the code they hold up, or type it.
2. "Show them who I am": name, phone, licence.
3. "Put my crew in": names, ranks, what they are qualified for.
4. "Get my 204 on paper with a map" and "what channel are we on".
5. "Where's the hospital, where's staging".
6. "Get released" at the end: demob, check out.

**Friction**

| Screen | Trying to | Saw | Did or guessed | Severity |
|---|---|---|---|---|
| Phone sign-in | Get in | "Sign in with the account your agency gave you." His agency gave him nothing; "Create account" is a small link under Sign in. | Guessed the link was for him. | PUZZLED |
| Identify yourself | Scan his licence | Camera refused: "Camera permission was refused. Type the code instead." The thing to type is a licence number, and the box for it is behind "No licence to hand? Type its number" on the sheet underneath. | Cancelled, found the disclosure, typed it. | PUZZLED |
| Check in | Name his unit | "Your unit" with the placeholder "Unit 3". He does not know the town's numbering. | Typed his own callsign, Brush 12; accepted. | PUZZLED |
| Briefing (after check-in) | Read his briefing | The sheet opened scrolled to its end: "Safety and PPE" and the Read later / Briefed buttons first, the situation out of sight above. | Scrolled up to find the start. `reyes-briefing-opens-at-its-end.jpg` | SLOWED |
| Briefing · Radio | Find his channel | "No division channel set; use the plan." Which plan, where? (The channels are in the menu under CHANNELS.) | Opened the menu and found them. | PUZZLED |
| Home | Wait at staging | "YOU ARE STANDING IN A-2 · Pecan Mobile Home Park" with Address clear and Zone clear for a division that is Unit 3's, while his status is Available. (Mock GPS; a unit driving through a division would see the same.) | Left it alone. | PUZZLED |
| Home · If someone is hurt | See who the medic is | "Medic: J" — the name cut to the initial of "J. Ortiz" (the card itself says "J. Ortiz, EMT"). | Opened the card. | PUZZLED |
| Inbox | Tell Operations he is at staging | The "Message Operations" button runs off the right edge at phone width ("Message Opera"). | Tapped the visible half. `reyes-inbox-button-cut-off.jpg` | SLOWED |
| Home · new assignment | Accept B-2 | The zone card already said "In progress" before he accepted or started. | Accepted. | PUZZLED |
| 204 (base) | His paper 204 | "Division supervisor: not named" though his is the only unit on B-2. | Read on. | PUZZLED |
| Check out | Get released | "Demobilization" list; "Nobody hurt, no equipment damaged" is unticked by default, with the hint "untick to say what happened". | Left it; pressed Not yet. | PUZZLED |
| Join card (base) | Read the deployment briefing he would be handed | "Bring:" carries the safety message, not what to bring; "Getting there:" gives coordinates, not a street address. | Read on. | PUZZLED |

**What worked**: one check-in screen with code, unit, kind, agency and people; the names and qualifications typed once appeared on the base at once; the 204 came off the base with a map of the division, his two names, the channel, the medical lines and the way to the hospital; Nearby had staging, the shelter and the hospital with Directions; the join card is a full deployment briefing; "Show a code to join" on his phone lets his second crew join from it.

---

## 10. The shelter desk volunteer

Phone (handed one at the gym door), and the base in case someone at the gym has a laptop. Walked as a new account, "Gym shelter desk", Red Cross, kind Other.

**The jobs, in her words**

1. "Who is coming on the next bus."
2. "Sign in a family": name, how many, where from.
3. "Note that this man needs oxygen / insulin."
4. "Note the dog, the cat."
5. "A woman is asking after her mother: has she been brought in anywhere?"
6. "Tell them we're nearly full."

**Friction**

| Screen | Trying to | Saw | Did or guessed | Severity |
|---|---|---|---|---|
| Phone sign-in | Get in | "the account your agency gave you"; Create account as a link. | Made an account. | PUZZLED |
| Check in | Say who she is with | The Agency box came pre-filled with the previous unit's agency on this phone (Bandera County FD). | Noticed, retyped Red Cross. `shelter-agency-prefilled-from-last-unit.jpg` | SLOWED |
| Check in | Press Check in | Red text: "Identify yourself first: your name, your phone and your licence". | Opened Identify yourself. `shelter-identify-yourself-first.jpg` | SLOWED |
| Identify yourself | Give name and phone only | "Scan the back of your licence, photograph the front, or type its number." A licence is required; a volunteer without one to hand cannot check in. | Typed a number to get through. `shelter-licence-required.jpg` | LOST |
| Check in · What the unit is | Say what she is | Engine, boat crew, swift-water team … no shelter or desk. | Chose Other. The base log then reads "Gym shelter desk, other checked in as …". | PUZZLED |
| Briefing | Read it | Opened at its end again; "YOUR JOB: No assignment yet … Wait at staging, High school east lot" (0.8 mi away); "PAR on the hour". | Scrolled up; ignored. `shelter-briefing-opens-at-its-end.jpg` | SLOWED |
| Home | Job 1, who is on the next bus | "YOU ARE STANDING IN A-2 · Priority 1 · 18 structures", Take photo, Address clear, Zone clear, Report hazard, Need help now. Nothing about buses, beds or people. | Nothing to try. | LOST |
| Home / Address clear | Job 2, sign in a family | Address clear is a house record: Occupants (Unknown / Nobody home / Evacuated / Sheltering in place / Refused to leave), People needing help count, water, damage, hazards, notes. No names. | Cancelled. | LOST |
| Home | Job 3, oxygen or insulin | No place for a medical need. | Nothing to try. | LOST |
| Home | Job 4, pets | No place for a pet (the house record's notes placeholder mentions a dog, per house). | Nothing to try. | LOST |
| Base · Find in the log | Job 5, is her mother here | "Nothing matches" for a resident's name; the People board lists responders only; the shelter's facility card has name, contact and notes. | Nothing to try. `shelter-no-way-to-look-up-a-person.jpg` | LOST |
| Inbox · Message Operations | Job 6, we're nearly full | Urgency chips (Act on now / Before nightfall / Can wait until tomorrow / Blocks further operations), free text, quick chips (Need more hands, Water rising here, Road blocked, Done here, what next?), Attach my location. Sent; "Waiting on Operations". | Worked. | — |
| Inbox after sending | Read her sent message | The Messages page is clipped at the left edge at phone width ("essages", "ym is nearly full", "aiting on Operations"): the header row overflows and the page scrolls sideways. | Read what she could. `shelter-messages-page-clipped.jpg` | SLOWED |

**What worked**: a free-text message with an urgency word reached Operations and showed "Waiting on Operations"; Nearby named her own desk's phone number; the shelter is on every unit's map.

---

## 9. Dep. Luis Moreno, sheriff's deputy at a closed bridge

Phone, alone. Walked as a new account, SO 14, Cedar County Sheriff's Office, one person, kind Other.

**The jobs, in his words**

1. "Check in so the CP knows I'm at the bridge, by myself."
2. "Car in the water, right here," in two taps, with the spot.
3. "Answer the head count."
4. "Report the road is closed."
5. "When can I stand down."

**Friction**

| Screen | Trying to | Saw | Did or guessed | Severity |
|---|---|---|---|---|
| Phone sign-in | Get in on a shared phone | The last account's email and password still filled in. | Typed over them. | PUZZLED |
| Check in | Agency | Pre-filled with the previous unit's agency again (Red Cross). | Retyped. | SLOWED |
| Check in | A one-person unit | Accepted without a word; no kind for a sheriff's unit or a traffic post (chose Other). The base People board shows "No buddy"; his phone says nothing. | Checked in. | PUZZLED |
| Briefing | Read it | Opened at its end (third time); "Wait at staging" though he is posted at the bridge; "use the plan" for the radio. | Scrolled; ignored. | PUZZLED |
| Home | Job 2, car in the water | Five search-crew buttons. Pressed Report hazard: it pins where he stands (good), but "Downed power line" is pre-selected as the kind, the kinds are Downed power line / Gas smell / Structure unsafe / Road under water / Loose animal / Other, and a "Briefed. Your briefing stays in the menu." toast sat over Cancel / Send hazard. | Chose Other, typed "Car in the water, one person inside", sent: three taps and typing. `moreno-hazard-kind-preselected.jpg` | SLOWED |
| Home, after sending | Know it was seen | Toast "Hazard sent", nothing more. On the base it is a plain log line, "Hazard in A-2: other (Car in the water …), reported by SO 14", with no urgency and no reply. The red button is "Need help now", help for him, not for someone else. | Wondered which button was for someone else in trouble. | SLOWED |
| Inbox · Message Operations | The other way to say it | Urgency words and Attach my location are there, but it is Inbox → Message Operations → urgency → words → Attach my location → Send. | Not two taps. | SLOWED |
| Home · PAR message | Job 3 (the base used its PAR quick chip) | A message, "PAR: head count to Operations, everyone accounted for or not", answered Copy / Will do / Cannot, which is not a head count. | Pressed Will do. | PUZZLED |
| PAR takeover | Job 3 (the base used Start PAR) | "Head count (PAR) · People with you − 1 + · All accounted for / Missing someone". | One tap; count 1. | — |
| Home · message | Job 5, stand down | "You are released. Return to staging, High school east lot, return the radio to Logistics, and check out on your phone. Thank you." Copy / Will do / Cannot. | Will do. | — |

**What worked**: the PAR takeover with one tap and his count of one; the release message says exactly what to do next; the hazard pins where he stands and reaches the base at once.

---

## 4. Rosa Alvarez, swift-water boat operator

Phone. Walked as the seeded boat crew, Unit 2 (Travis County Rescue, Nguyen and Patel), which is her situation.

**The jobs, in her words**

1. "Where's the boat ramp and the shelter."
2. "Start a rotation timer: how long has this crew been in the water."
3. "Keep track of my people" when their phones are in dry bags.
4. "Log who we pulled out of that house."
5. "Need help now."
6. "What are we assigned to."

**Friction**

| Screen | Trying to | Saw | Did or guessed | Severity |
|---|---|---|---|---|
| Phone sign-in → check in | Re-open her incident | The whole check-in form first; "Incidents you are already in · Cedar Fork Flooding · you are Unit 2" at the bottom, under two empty people rows. The Agency box carried the previous unit's agency. | Scrolled past the form and tapped the row. `rosa-check-in-form-before-your-incident.jpg` | SLOWED |
| PAR takeover (pending on open) | Answer the head count | "People with you − 1 +" for a two-person unit. | Pressed + before All accounted for. `rosa-par-count-defaults-to-1.jpg` | SLOWED |
| Nearby | Job 1, the ramp | Staging, shelter, hospital with Directions. No boat ramp or launch; the facility kinds on the base are command post, staging, base, camp, shelter, point of distribution, hospital, helibase, helispot. | Would ask on the radio. `rosa-nearby-no-boat-ramp.jpg` | LOST |
| Anywhere | Job 2, rotation timer | Nothing counts time in the water; the menu shows "on scene N h N min" per person. | Nothing to try. | LOST |
| Menu · People on the unit | Job 3, track her people | A list with Check out / Back in per person; the unit is one dot on the map. | Nothing to try. | LOST |
| Address clear | Job 4, intake | A house record: "People needing help − 0 +" and Occupants chips; no names, condition or where they went. | Counted them; no intake. | LOST |
| Need help now | Job 5 | A confirmation sheet ("Will be sent: unit, zone, position, time" · Cancel / Send alert), then "Alert sent · Waiting for Operations · Your location keeps sending", then "Operations acknowledged · Stay put if you can", then Stand down, all OK. | Two taps, not one. | — |
| Your zone | Job 6 | "B-1 · Mill Street bridge approach", the words "Hold the bridge approach closed …", Radio TAC 3, the objective. | Read it. | — |

**What worked**: the emergency loop end to end (alert, acknowledgement, stand down) with the base's red bar; the assignment card; "If someone is hurt: Medic: Patel, EMT" one line away.

---

## 2. Marcus Bell, Operations Section Chief

Base at 1280 × 800, signed in as Operations.

**The jobs, in his words**

1. "Draw a division and give it a priority," fast.
2. "Assign a unit; move it later."
3. "See the photos as they come in, and which way the camera faced."
4. "Run a PAR; who hasn't answered."
5. "Answer the radio: where is Unit 1, what's B-2's status, has that address been cleared."
6. "Hand the map to my relief with my context."

**Friction**

| Screen | Trying to | Saw | Did or guessed | Severity |
|---|---|---|---|---|
| Draw division | Finish the outline | After the first corner the toolbar grows ("4 points. Click to add more, Backspace to take the last one off, or press Finish.") and wraps to a second row at 1280 wide, so Finish / Remove last point / Cancel jump to a new line and the map shifts down. | First press of Finish hit nothing. `ops-draw-toolbar-wraps-finish-moves.jpg` | SLOWED |
| After Finish | Fill in the new division | The "New division" form (Code B-4, Structures, Name, Priority, Discard / Save division) appeared at the top of the sidebar, but the sidebar stayed scrolled where it was (Message the field), so nothing seemed to happen. | Scrolled up to find it. `ops-new-division-form-off-screen.jpg` | SLOWED |
| Sidebar, all day | Keep his place | The sidebar redraws on every live event and its scroll position snaps back; scrolling to a section and clicking something two seconds later often landed elsewhere. | Scrolled again. | SLOWED |
| New division | Code | Defaults to the next number (B-4) whatever the branch; the drawn area sat north with the A divisions. | Would retype. | PUZZLED |
| Division panel · Assigned to | Move Unit 2 | Every unit is offered, including "Gym shelter desk" and "SO 14"; pressing a name ADDS the unit (Unit 3 ended up on A-2 and B-4), it does not move it. The only hint is on the unit panel: "To send this unit somewhere, open a zone and press its name under Assigned to." | Would have to release the old division himself. `ops-assign-adds-does-not-move.jpg` | SLOWED |
| Facility card | Close the card | The foot reads Show on map · Close · Save; Close closed the command post itself ("Command post: Cedar Fork High School, front office closed" in the log) and turned into Reopen. | Pressed Reopen. `ops-facility-close-closes-the-facility.jpg` | SLOWED |
| Message the field · PAR chip vs Start PAR | Run a PAR | Two PARs: the "PAR" quick chip sends a plain message answered Copy / Will do / Cannot; "Start PAR" under Accountability runs the head count with the yellow bar ("2 of 6 answered · waiting on …"). | Pressed the chip first. | PUZZLED |
| Shift-change briefing | Hand over | One sheet from the data: seats, agency reps, safety, objectives, divisions, resources; "1 unit, 1 people". Nothing carries what he was watching or had open. | Read it. | PUZZLED |

**What worked**: the U1 marker opens a unit panel that answers the radio in one click (assigned to, standing in, position, heading, last report, head count, people with hours on scene, requests, Set status, Message); log lines link to the thing (Open division, View photo, Open people); "Find in the log" finds a structure by name; the photo panel shows "Facing E 095°", the note and whether it is public; the yellow PAR bar names who has not answered; the red EMERGENCY bar with Acknowledge and Show unit.

---

## 1. Dana Ruiz, Incident Commander

Base at 1280 × 800.

**The jobs, in her words**

1. "Thirty seconds: is anyone in trouble, how far has the search got, what's the plan."
2. "Sign the IAP."
3. "Brief the shift change."
4. "The county's here: name a unified command."
5. "Hand command to the county chief" (v24); "who is in which seat".
6. "What changed while I was away an hour."

**Friction**

| Screen | Trying to | Saw | Did or guessed | Severity |
|---|---|---|---|---|
| Header and legend | Job 1 | "OP 1 · 03:33 to 19:00, IC … · 6 units · 7 divisions, 1 cleared"; the legend counts divisions by status; the red bar only while an alert is open; the yellow PAR bar names who has not answered. No count of people needing help or open hazards at the top. | Read the division list. | PUZZLED |
| IAP | Job 2, sign it | 202, 203, 207, every 204 with its map and medical lines, 205, 206, 208, facilities; Copy as text / Print / Close. No "Prepared by / Approved by" line to sign. | Would sign the paper. | PUZZLED |
| Period sheet | Job 4 | A "Unified command" box beside the seats, and Agency representatives per agency on scene for the Liaison. No hint what to type (names, agencies, both). | Typed. | PUZZLED |
| Period sheet → prompt | Job 5, transfer command | A different name in the Incident Commander seat opens "Transfer command from Dana Ruiz to Chief Al Barnes?" with ICS-100 wording and three boxes (Tell everyone in the field ✓, Open the briefing for the handover ✓, Start a new operational period now ☐); Just change the name / Cancel / Transfer command. The handover briefing opened; every phone got a takeover card. | Worked. | — |
| Phone card (seen as a unit) | The transfer notice | Headed "Safety message", not "Command". | A unit may wonder why. | PUZZLED |
| Org chart | Who is in which seat | A long text list first; the boxes are below the fold. | Scrolled. | PUZZLED |
| Anywhere | Job 6, what changed | No "since you last looked"; the log's "N new" badge is the nearest. | Read the log down. | PUZZLED |

**What worked**: the transfer prompt teaches the rule as it asks, and the whole chain (message to every unit, handover briefing, the 214's notable line, the 203's command history) happened on one press; the briefing is one click; the period sheet carries the names forward.

---

## 3. Lt. Ana Ramirez, unit lead on foot

Phone. Walked as the seeded Unit 1 (engine, Ramirez and Okafor, A-1).

**The jobs, in her words**

1. "Mark this address clear" in one tap.
2. "Send a photo that records which way I was facing."
3. "What's my assignment and what channel am I on."
4. "Mayday."
5. "Answer the PAR without typing."
6. "Mark the division clear" with the marking we painted.

**Friction**

| Screen | Trying to | Saw | Did or guessed | Severity |
|---|---|---|---|---|
| Sign-in → check in | Re-open her incident | The whole check-in form first, her incident at the bottom; the row says "OP 1 · 07:00 to 19:00" while every report says 03:33. | Scrolled, tapped. | SLOWED |
| Address clear | Job 1 | A full house record; "Searched, save" is below the fold at phone height. | One tap, a scroll, a second tap, with gloves. `ana-address-clear-save-below-the-fold.jpg` | SLOWED |
| Take photo | Job 2 | With no camera the tap did nothing and said nothing. (The heading itself is there: the base shows "facing E 095°" on seeded photos.) | Not verifiable here. | PUZZLED |
| Zone clear | Job 6 | "Finish the search of A-1 · Sends A-1 to Operations. All 24 structures are marked searched." She has cleared 9 of 24. | Hesitated: the whole division, or my part? | PUZZLED |

**What worked**: the four big buttons; a pending safety message and a pending PAR stacked into one takeover, each answered with one tap, the count already 2 for her unit; the zone card has the work assignment, the special instructions, "Radio TAC 2 · Supervisor Lt. Okafor" and the objective; the search marking is drawn for her (time out, team, hazards, people found); Need help now is two taps (button, Send alert) and comes back acknowledged.

---

## 5. Priya Natarajan, Safety Officer

Base to send, phone to read (as a unit).

**The jobs, in her words**

1. "Push a safety message that takes over every phone."
2. "Who hasn't acknowledged it."
3. "Read the hazards as they come in; where are they."
4. "Who's been on scene too long."
5. "Write the period's safety message."

**Friction**

| Screen | Trying to | Saw | Did or guessed | Severity |
|---|---|---|---|---|
| Message the field | Job 1 | A small "Safety" checkbox beside the recipient select; nothing says it takes over every phone until acknowledged. | Ticked it; it did. | PUZZLED |
| Log / map | Job 3 | Hazards are log lines ("Hazard in A-2: other (Car in the water, one person inside), reported by SO 14"), an orange outline, a triangle on the map, a chip on the division panel. No list of open hazards of its own, and the deputy's car in the water had no urgency on it. | Read the log down. | SLOWED |
| People board / Hours | Job 4 | "On scene 3 h 17 min, since 03:53" per person; Hours totals them; nothing warns at a threshold. | Scanned the times. | PUZZLED |

**What worked**: the yellow SAFETY bar names who has not acknowledged ("waiting on Unit 3, Brush 12, Gym shelter desk, SO 14") and the Messages list says "All N acknowledged"; the period's safety message box prints on the 204 and 208 and reads in every briefing; the phone's briefing carries the message and the open hazards.

---

## 6. The Documentation Unit, one borrowed clerk

Base.

**The jobs, in their words**

1. "Print the 214 for the period."
2. "Print the 211 with the names."
3. "Make the situation report and get it to the EOC."
4. "Play back the day for the after-action review."
5. "Find who said what at 10:40."

**Friction**

| Screen | Trying to | Saw | Did or guessed | Severity |
|---|---|---|---|---|
| Log toolbar | Job 1 | The Print 214 button moved down the screen when the SAFETY and PAR bars appeared. | First click missed. | SLOWED |
| Sitrep | Job 3, send it | Three boxes to write (Situation / Resources needed / Outlook), "Save the words", the assembled report; Copy as text / Print. Getting it to the EOC is copy and paste. | Copied. | PUZZLED |
| Sitrep, picker, phone | The period | "03:33 to 19:00" on the reports, "07:00 to 19:00" on the picker, the home panel and the phone's incident row. | Two starts. | PUZZLED |
| Hours | Roles | "swift_water, emt" with underscores. | Read past it. | PUZZLED |

**What worked**: Print 214 opens the ICS 214 with the IC history, the notable lines first and every entry oldest first; People → Print 211 lists every unit with who checked it in and each person's times; Replay has a slider, Play, "This period" and a speed, with the log line of the moment under it; Hours exports CSV and marks rows counted to now; "Find in the log" answers job 5.

---

## 7. The Public Information Officer

Base.

**The jobs, in their words**

1. "Which photos are cleared."
2. "Get them as files with time, place and a caption."
3. "Make sure none shows a victim or an address."
4. "Am I named as PIO" (v24).
5. "Who is in charge and who is on scene from where."

**Friction**

| Screen | Trying to | Saw | Did or guessed | Severity |
|---|---|---|---|---|
| Home panel · Public information | Job 1 | "1 photo cleared for the public. Open a photo to clear or withdraw it. · 05:53 · Unit 1 · A-1 · Water over road". The section is far down the sidebar (under join code, resources, accountability, requests, messages, facilities, agencies) and the sidebar's scroll snaps back on each live update. | Reached it on the third try. | SLOWED |
| Photo panel | Job 2 | Picture, "Facing E 095°", taken by, time, zone, position, note, "Cleared for public information"; Show on map / Open full size / Withdraw from public. No export of the cleared set, no caption file; one photo at a time, caption typed by hand. | Opened full size. `pio-photo-panel-no-export.jpg` | LOST |
| Photo panel | Job 3 | The note is the unit's words; the position is coordinates; nothing says "no address on this one". | Judged by eye. | PUZZLED |

**What worked**: the PIO is seated on the Period sheet and printed on the 203, the 207 and the briefing; the Sitrep's last section names the PIO and the count cleared; the header and the Sitrep say who is in charge and who is on scene from where.

---

## 11. The agency administrator

Base sign-in and incident picker; the phone's sign-in.

**The jobs, in their words**

1. "Make accounts for every member."
2. "Put in our Google Maps key."
3. "Clear the licence records after an incident."
4. "Prove nothing a crew sent can be lost or deleted."
5. "Start the season: open an incident, print the join card."

**Friction**

| Screen | Trying to | Saw | Did or guessed | Severity |
|---|---|---|---|---|
| Anywhere | Job 1 | No admin screen, no member list; the phone's "Create account" lets anyone make one, while the sign-in copy says "the account your agency gave you". | Done by hand elsewhere. | LOST |
| Layers | Job 2 | "Google Maps streets and satellite when a key is set", and no place to set it. | Done in a file. | LOST |
| Unit panel · Identity | Job 3 | Licence (masked), date of birth and home address with "Withdraw verification"; nothing clears or expires the record. | Nothing to try. | LOST |
| Anywhere | Job 4 | Nothing says it; the 214 keeping every line and the absence of delete buttons is the only evidence. | Took it on trust. | PUZZLED |
| Incident picker | Job 5 | "Your incidents", "Open a new incident" (Name, Operational period as free text, Base, map centre, Use my location), "Join an incident with its code · Join as Operations". Anyone with the six-letter code can join as Operations. | Opened one. `admin-incident-picker.jpg` | PUZZLED |
| Phone sign-in | Hand a phone to the next crew | The last account's email and password stay filled in after Sign out. | Would worry. | PUZZLED |

**What worked**: opening an incident is one form; the join card prints from the home panel and warns "Anyone with this code can join as a unit. Keep it to the people who should."

---

## What to fix first

Every LOST item, then the SLOWED items two or more personas hit. Each with the smallest change that would fix it.

### LOST

1. **A volunteer without a licence cannot check in** (shelter desk; would hit anyone handed a phone at a check-in table). Let a check-in go through with name and phone alone and mark the unit "identity not given" for Operations to verify in person. *Fixed in v25: a name and a phone check in; the base marks the unit "identity not given" (its row, its panel, the 211) and Operations verifies in person with Mark verified.*
2. **No evacuee record** (shelter desk: who is on the next bus, sign in a family, oxygen or insulin, pets, "is my mother here"). One shelter record per person or family (name, how many, needs, pets, which shelter) that the shelter desk adds from the phone and anyone can find by name on either view. *Built in v26: one record per person or family; a Shelter desk unit opens on People here (the count against the beds, arrivals from crews with They're here, Sign in a person with needs chips, Find a person across every shelter and hospital, Not listed? to Operations); the base's shelter card has beds, Expected and People here, Find a person is in the header, and the situation report counts people sheltered.*
3. **No boat ramp on the map** (Rosa). Add "Boat ramp" to the facility kinds so it appears in Nearby with directions. *Fixed in v25: Boat ramp is a facility kind (BR on the map, off-map chips on the 204), and the phone's Nearby lists the nearest one with Directions.*
4. **No rotation timer** (Rosa). A "in the water since" stamp per person on the unit's menu with a nudge at a set number of minutes.
5. **No per-person tracking when phones are in dry bags** (Rosa). Until the tags work lands, a one-line "last seen" note per person on the unit (where, when) that the unit lead updates from the menu.
6. **No intake for the people a crew pulls out** (Rosa). Under "People needing help" on the house record, a row per person with name, condition and where they went. *Built in v26: People needing help on the house record has a row per person or family (who, condition, went to); each row is a record linked to the house, on its way to the shelter's desk or moved to the hospital, and the help count follows the rows.*
7. **No export of the cleared photos with captions** (PIO). A "Download cleared photos" button on the Public information section that saves each file with its time, place and note as the caption. *Fixed in v25: Download cleared photos on Public information saves one zip, each photo named by time and division with its caption (what, where, when, whose; no coordinates) written into the file and listed in captions.txt.*
8. **No accounts screen** (administrator). A members list on the base with invite and remove, replacing "Create account" on the phone for agencies that want it closed. *Built in v27: the People board's Members tab lists every member with role, agency and identity state, with Make Operations / Make a unit, Remove and Restore; the join code joins units only and an Operations code, shown to Operations alone and never printed, makes Operations; the person who opened the incident is always Operations. Invite-by-email stays out (it needs server-side auth).*
9. **No place for the Google Maps key** (administrator). A settings field on the base that writes the key where the Layers panel reads it.
10. **No way to clear identity records after an incident** (administrator). A "Clear identity records" action on a closed incident that archives name, phone, licence, date of birth and address. *Built in v27: thirty days after an incident closes its personal records clear by rule (licence, date of birth, address, licence photo, and the names of the people sheltered; names and phones stay for the 211 and the 214); the closed incident's card shows the date with Clear now and Keep 30 more days, pg_cron runs it nightly and the base on its next open, and one line goes in the 214.*

### SLOWED, hit by two or more personas

11. **The briefing opens scrolled to its end** (Reyes, shelter desk, Moreno). Scroll the sheet to the top when it opens. *Fixed in v25: every phone sheet opens at its top; the browser had been giving the briefing back the scroll it had when Briefed was last pressed.*
12. **The Agency box carries the previous unit's agency on a shared phone** (shelter desk, Moreno, Rosa). Prefill the agency only from the same account's last check-in. *Fixed in v25: the Agency box is prefilled only from the same account's own last check-in, and Sign out empties the check-in form.*
13. **The inbox overflows sideways at phone width**: "Message Operations" cut to "Message Opera", and the Messages page clipped at the left after sending (Reyes, shelter desk). Let the header's buttons wrap or shrink so the page never scrolls sideways at 375 px. *Fixed in v25: Message Operations and Ask for something sit in a row of their own under the heading; the walkfix suite opens every phone sheet at 375 px and finds nothing wider than the screen.*
14. **Someone already in the incident sees the whole check-in form first** (Rosa, Ana). Show "Incidents you are already in" above the form when there is one. *Fixed in v25: "Incidents you are already in" comes first when there is one (hidden when there is none), and the form below it reads "Check in to another incident".*
15. **The sidebar's scroll position snaps back on every live update** (Marcus, PIO; it also moved the new-division form off screen). Keep the sidebar's scroll position across redraws. *Fixed in v25: the sidebar redraws only what changed and keeps the heading or row at the top of the view where it was; a new selection, such as the new-division form, scrolls into view even while a field has focus.*
16. **Controls move when a bar appears or a toolbar grows** (Marcus's Finish button after the first corner, the clerk's Print 214 under the SAFETY and PAR bars). Keep the drawing toolbar on one row at 1280 wide and give the bars a fixed slot above the toolbar so nothing below shifts. *Fixed in v25: the drawing toolbar is one row (Finish beside Draw division, the hint cut short), and the emergency, SAFETY and PAR bars share a fixed one-row slot under the header that says so when nothing is open.*
17. **"Close" on a facility card closes the facility** (Marcus; it bit the walker during the shelter persona too). Call it "Mark closed" and put a plain Close on the card. *Fixed in v25: the card's Close only puts the card away; "Mark closed" sits beside the facility's Open badge.*

Also fixed in v25, from the administrator's walk: Sign out on the phone empties the sign-in form, and the password field no longer autofills, so a phone handed to the next crew does not carry the last account's email and password.

---

## Re-walk after v25

The fixed screens only, walked again on 2026-10-17 after commit 4f57b64 in the same mock and at the same widths (phone 375 × 812, base 1280 × 800), as the personas who hit them and reading only what was on screen. One phone was handed from person to person: Unit 3 read its briefing to the end and pressed Briefed, then Reyes, the shelter desk, Moreno, Rosa and Ana signed in after each other; the base was Marcus, the PIO and the clerk. Screenshots are `docs/walkthroughs/rewalk-v25-*.jpg`.

| Item | Who | What they saw | Verdict |
|---|---|---|---|
| 11 Briefing at its end | Reyes, shelter desk, Moreno, Rosa | Each briefing opened at Situation, though the last person had left the same sheet at its end. `rewalk-v25-reyes-briefing-at-top.jpg` | Clear |
| 12 Agency carried over | Shelter desk, Moreno, Rosa, Ana | The Agency box was empty for each new account; Rosa and Ana got their own crew's agency. | Clear, one small bite (below) |
| 13 Inbox sideways | Reyes, shelter desk | "Message Operations" in full on a button of its own; after sending, the Messages page whole. `rewalk-v25-reyes-inbox-buttons-whole.jpg`, `rewalk-v25-messages-after-sending.jpg` | Clear |
| 14 Form before "already in" | Rosa, Ana | "Incidents you are already in" at the top, one tap to open, the form below it titled "Check in to another incident". `rewalk-v25-rosa-already-in-first.jpg` | Clear |
| 15 Sidebar jumps | PIO, Marcus | Rosa's message arrived above Public information and the section stayed exactly where the PIO was reading. After Finish, the New division form was in view though Marcus had been typing further down. `rewalk-v25-pio-before-update.jpg`, `rewalk-v25-pio-after-update.jpg` | Clear, one bite (below) |
| 16 Controls move | Marcus, the clerk | One toolbar row through four corners, Finish in the same place. The SAFETY bar, then the PAR bar, took the slot that had said "No emergency open"; Print 214 and the map did not move. `rewalk-v25-clerk-bars-one-row.jpg` | Clear, one small bite (below) |
| 17 Close closes the facility | Marcus | Close put the command post's card away; the post stayed open and nothing was logged. "Mark closed" sits beside the green Open badge. `rewalk-v25-marcus-facility-card.jpg` | Clear |
| 1 No licence, no check-in | Shelter desk | Saved with her name and phone; "identity not given: Operations checks who you are in person"; checked in. The base's log said "identity not given" and its resources row "Pat Doe · no ID". `rewalk-v25-shelter-no-licence.jpg` | Clear |
| 3 No boat ramp | Marcus, Rosa | Marcus placed one ("Click the map where the boat ramp is"); Rosa's Nearby listed "Low-water crossing ramp · Boat ramp · 1.6 mi" with Directions. `rewalk-v25-rosa-nearby-boat-ramp.jpg` | Clear, one small bite (below) |
| 7 Cleared photos | PIO | "Download cleared photos" and a line saying what the zip holds, under Public information. The download itself was not pressed in the pane, because it saves a file to the machine; the walkfix suite opens the same zip and finds the photo named by time and division, with its caption inside it and in captions.txt. | Clear on screen; the file checked by the suite |
| Sign out keeps the last login | Moreno, the administrator | The sign-in form was empty after every Sign out. | Clear |

**Still bites, small:**

- **The Agency box's placeholder looks like a value.** An empty box shows "Cedar Fork Fire Department" in grey, the same words Ana's filled box shows in white. A hurried volunteer could take it for an answer. A placeholder that is plainly an example ("e.g. Red Cross, county sheriff") would end it.
- **Half-typed words in a sidebar form are lost when the panel redraws.** Marcus's unsent words in Message the field were gone once he clicked the map. v24 did the same; the redraw now keeps the place, but not what was typed in a box that has lost focus.
- **Two bars at once cut the message short.** With a SAFETY message and a PAR open and six units waiting, each cell shows the waiting list and cuts the rest; the safety message's own words need a hover.
- **A boat crew's briefing does not name the boat ramp.** Rosa found it in Nearby, but her briefing's Work area still names only staging.

Seen again but outside this release: the already-in row still gives the period as typed on the picker, which differs from the reports; the shelter desk is still "Other" among the unit kinds; Moreno's briefing still says "Wait at staging".

---

## Re-walk after v26

The screens v26 added, walked again on 2026-10-17 after commit e84c308 (the shelter and evacuee records) in the same mock, on the phone at 375 × 812, reading only what was on screen. The shelter desk volunteer walked her six jobs as a new account (Gym desk, Red Cross, kind Shelter desk, "Pat Doe" with a name and a phone and no licence); Rosa walked her intake job as the seeded Unit 2. One phone went desk → Rosa → desk, so the records a crew sends could be seen arriving at the gym. The base was not walked this time. Screenshots are `docs/walkthroughs/rewalk-v26-*.jpg`, taken by the v26 session's own first pass over the same screens (at 12:24; this walk was at 12:42 to 12:52 and saw the same words); the Browser pane was hidden for most of this walk, so no new ones could be taken.

| Item | Who | What they saw | Verdict |
|---|---|---|---|
| 2 · Job 1, who is on the next bus | Shelter desk | The home screen is People here: "High school gym · 9 of 60 · 3 records · 1 oxygen · 1 infant · 1 pets · expected: Bus 2 from Pecan Park, 12 people, 17:30. Operations sees this count live on the shelter's card." Her briefing's Your job says the same. `rewalk-v26-desk-people-here.jpg` | Clear (the Expected line is Operations' words; she reads it, she cannot change it from the phone) |
| 2 · Job 2, sign in a family | Shelter desk | Sign in a person: Who, How many, the needs chips (Oxygen, Insulin, Wheelchair, Infant, Pets, Other), From, Where now with "Here, High school gym" first, Note; "Only 'Who' is needed; the rest can be added from the list. Names are seen by this incident's members only, never in anything public." Typed "Tran, family of 5", Insulin, Pets, 130 Pecan Ln, a note; Sign in here. "Tran, family of 5 signed in"; the list read 14 of 60, 4 records, Tran at the top with "insulin and pets". Cancel and Sign in here sit inside the screen, no scroll. `rewalk-v26-desk-sign-in-family.jpg` | Clear |
| 2 · Job 3, this man needs oxygen | Shelter desk | For someone already here: tapped the "family of 3" row, the same sheet headed "Change what is wrong, or where they are now. A record is moved, never removed." Oxygen, Save: "family of 3 saved", the row read "oxygen · wet, no shoes", the header "2 oxygen". Two taps and Save. | Clear |
| 2 · Job 4, the dog, the cat | Shelter desk | The Pets chip; the note took "a dog and a cat"; the header counted "2 pets". | Clear |
| 2 · Job 5, is my mother here | Shelter desk | Find a person, any shelter or hospital: "Nguyen" gave "Nguyen, Tam · oxygen · High school gym since 12:01 · from 118 Pecan Ln". "Lopez" gave "Nobody on record matches 'Lopez'. Not listed? Ask Operations to look: sends 'Looking for Lopez' with your desk's number." One tap: "Asked Operations to look for Lopez", and her inbox showed the message ("Looking for Lopez. Not on any shelter or hospital record. Call Gym desk at High school gym on 512 555 0199 · Waiting on Operations"). Later "Lee" found Mrs. Lee "Dell Seton Medical Center since 12:50 · from 120 Pecan Ln · A-2", and a street ("Pecan") listed everyone from it, at the gym and at the hospital. | Clear, one small bite (below) |
| 2 · Job 6, we're nearly full | Shelter desk | Inbox → Message Operations → Before nightfall → her words → Send: "Sent to Operations", the message listed with its urgency and "Waiting on Operations". The quick chips are still the search crew's. | Clear, one small bite (below) |
| 2 · A crew's people arriving | Shelter desk | "Arriving from crews · sign them in, not again": "family of 4 from 112 Pecan Ln · Unit 3, 12:27 · pets · wet, cold, a dog" with They're here. One tap: 18 of 60, the row at the top of Here now, and a sheet "Signed in: family of 4 · High school gym since 12:48 · Unit 3 sent them from 112 Pecan Ln. They are signed in; add the name if you have it." with Not now / Save the name. Typed the name: "Ortega, family of 4 saved", and the log "family of 4 now on record as Ortega, family of 4". `rewalk-v26-desk-theyre-here.jpg` | Clear |
| Shelter desk as a unit kind | Shelter desk | "Shelter desk" among What the unit is, at check-in and in the menu; the log reads "Gym desk, shelter desk checked in as Pat Doe, 512 555 0199, identity not given"; the menu says "Your shelter: High school gym", picked for her as the nearest open shelter. | Clear (v25 had her as "Other") |
| Briefing | Shelter desk | Opened at Situation. Your job: "People here at High school gym. Sign in everyone who arrives: who, how many, their needs (oxygen, insulin, a wheelchair, an infant, pets) and where from. Only who is needed. A crew's people on their way to you are listed first: tap They're here, so nobody is signed in twice. Find a person answers 'is my mother here?' across every shelter and hospital; Not listed? asks Operations to look. Now: 9 of 60 beds, 1 record on the way, expected Bus 2 from Pecan Park, 12 people, 17:30." `rewalk-v26-desk-briefing.jpg` | Clear, two small bites (below) |
| 6 · Log who we pulled out of that house | Rosa | Address clear → "Add who and where they went" ("Each row is a person or a family; the shelter desk sees them coming"): Who, Condition, and Went to High school gym (shelter) / Went to Dell Seton Medical Center (hospital) / With family / Own transport / Not known, the shelter first. Two rows: "Garza, family of 3 · wet, cold, a baby" to the shelter, "Mrs. Lee, 90 · cannot walk, on oxygen" to the hospital. People needing help followed the rows as she typed (4). Searched, save: "120 Pecan Ln searched · 1 of 18 · 2 records of who went where". The log: "Unit 2 sent Garza, family of 3 from 120 Pecan Ln to High school gym, needs infant care" and "Unit 2 sent Mrs. Lee, 90 from 120 Pecan Ln to Dell Seton Medical Center, needs oxygen"; the needs were read from her condition words. `rewalk-v26-rosa-house-rows.jpg` | Clear, one bite kept from v24 (below) |
| The loop | Rosa → shelter desk | Back on the desk's phone: "Garza, family of 3 from 120 Pecan Ln · A-2 · Unit 2, 12:50 · infant care · wet, cold, a baby" under Arriving from crews; They're here made it 21 of 60, and the sheet said "Unit 2 sent them from 120 Pecan Ln · A-2." Find a person then placed the Garzas at the gym and Mrs. Lee at the hospital, each with the house and the division. | Clear |

Items 2 and 6 of "What to fix first" are clear: every one of the shelter desk's six jobs and Rosa's intake job finished on the phone without a wrong turn.

**Still bites, small:**

- **The toast covers a sheet's buttons.** "Briefed. Your briefing stays in the menu." sat over Not now / Save the name for its few seconds, and a tap on Save the name went to the toast. Moreno met the same toast over Cancel / Send hazard in v24. Draw the toast above the foot buttons, or under the header.
- **Searched, save is still a scroll away** (Ana, v24). With two person rows the house record is about 1,000 px tall at 375 × 812; the save is below the fold, and the rows push it further.
- **The desk's briefing is a search crew's in places.** Work area says "Where you stand is on the map. Staging: High school east lot, 0.8 mi.", Shift says "the next crew is briefed at staging", and the way out is "Briefed, go to the map" for a unit whose home screen has no map. Name the shelter and its address under Work area, and say "Briefed" plainly.
- **Message Operations has no shelter words.** The quick chips are Need more hands, Water rising here, Road blocked and Done here, what next?. A desk's are "Nearly full" and "Need cots and blankets"; Ask for something already covers supplies.
- **A street in Find a person makes an odd ask.** Searching "Pecan" ends with "Not listed? … sends 'Looking for Pecan'". Hide the ask when the search is a street, or say "Looking for someone from Pecan".
- **Each hand-back re-shows the briefing.** The phone keeps "briefed" per incident, not per account, so a phone passed desk → Rosa → desk showed the desk her own briefing three times. One person's own phone shows it once; a shared phone at a check-in table will show it on every hand-back.

**Seen by the walker, not the persona:**

- **A page whose frames stop right after a draw was queued never redraws.** `queueDraw` in `js/field/main.js` sets `drawQueued` and waits for an animation frame; the hidden Browser pane never gave one, and the desk's list stayed at "9 of 60" after a sign-in the mock had already taken. A phone that goes to the background gets its frame back on return, so this is a test-bench bite; a timeout beside the `requestAnimationFrame` would end it. The walk was finished in a second mock tab, which copies the first tab's data and, never having had a frame, draws at once.
- **The mock's accounts are per tab.** A second tab gives an unknown email a new user id, so the desk's account could not reopen its incident there until its id was set by hand (`window.__mock.users`). Sharing the accounts over the BroadcastChannel with the tables would end it.

Seen again but outside this release: the already-in row still gives the period as typed ("07:00 to 19:00") while the menu says "09:31 to 19:00"; the mock's GPS stands Rosa in A-2 while she is assigned to B-1, so her house record was filed under A-2.
