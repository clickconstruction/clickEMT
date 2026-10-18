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
| | | *Built in v28: a cleared photo's panel takes a public caption and a Checked (no face, no plate, no house number) button; only checked photos leave in the public set, named by time and place with the caption inside and in captions.txt, the cleared-but-unchecked listed as missing.* | | |

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
4. **No rotation timer** (Rosa). A "in the water since" stamp per person on the unit's menu with a nudge at a set number of minutes. *Built in v28, per unit: In the water / Out of the water on the phone's home screen and menu, the rotation on the period (45 minutes unless Safety sets it), a slim nudge past it that asks again each rotation, the time on the base's rows and panel (orange past the rotation, "probably left running" past three), who is in the water on the briefing and the sitrep, and a check-out that ends the clock.*
5. **No per-person tracking when phones are in dry bags** (Rosa). Until the tags work lands, a one-line "last seen" note per person on the unit (where, when) that the unit lead updates from the menu.
6. **No intake for the people a crew pulls out** (Rosa). Under "People needing help" on the house record, a row per person with name, condition and where they went. *Built in v26: People needing help on the house record has a row per person or family (who, condition, went to); each row is a record linked to the house, on its way to the shelter's desk or moved to the hospital, and the help count follows the rows.*
7. **No export of the cleared photos with captions** (PIO). A "Download cleared photos" button on the Public information section that saves each file with its time, place and note as the caption. *Fixed in v25: Download cleared photos on Public information saves one zip, each photo named by time and division with its caption (what, where, when, whose; no coordinates) written into the file and listed in captions.txt.*
8. **No accounts screen** (administrator). A members list on the base with invite and remove, replacing "Create account" on the phone for agencies that want it closed. *Built in v27: the People board's Members tab lists every member with role, agency and identity state, with Make Operations / Make a unit, Remove and Restore; the join code joins units only and an Operations code, shown to Operations alone and never printed, makes Operations; the person who opened the incident is always Operations. Invite-by-email stays out (it needs server-side auth).*
9. **No place for the Google Maps key** (administrator). A settings field on the base that writes the key where the Layers panel reads it. *Built in v28: Settings in the header holds the Google Maps browser key with a Test button, the personal-records retention days and the default rotation; the Layers panel reads the key from the incident, the settings carry into the next incident the same account opens, and the log says a key was set, never the key.*
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

---

## Re-walk after v27

The screens v27 added, walked on 2026-10-17 after commit 0ea25c2 (members and roles, personal records that clear by rule) in the same mock on the base at 1280 × 800, as the agency administrator (persona 11), whose three LOST jobs this release was for. The Browser pane was hidden, so the walk read the screen's text; no screenshots.

| Item | Who | What they saw | Verdict |
|---|---|---|---|
| 8 · Job 1, accounts for every member | Administrator | People → a second tab, Members: "4 members · 1 Operations", then a row per member: "Unit 1, engine · Ana Ramirez · 512 555 0111 / Cedar Fork Fire Department · in A-1 / Unit / Verified 10:44 · Assigned / Open · Make Operations · Remove". The opener's row reads "Operations · opened the incident" and carries no buttons. The line above says what the codes do and that removing keeps everything sent. Accounts are still made on the phone; the hole (anyone with the card could be Operations) is closed by the codes and this list, as decided. | Clear |
| 5 · Job 5, open an incident and print the join card | Administrator | The home panel: "JOIN CODE FOR FIELD PHONES · CEDAR7 · Copy · Print a join card · Copy the link", then "OPERATIONS CODE · MR7KQ2VD · Copy · New code · Whoever joins with this code is Operations and can run the incident. Give it by radio or phone, never on paper; the join card carries the units' code only." The picker's third card now reads "Join as Operations with the Operations code: Operations gives it by radio or phone; it is on the Operations home panel, never on the join card. The six-letter join code on the card joins field units only." | Clear |
| 10 · Job 3, clear the licence records after an incident | Administrator | First: nothing on the screen closed an incident (the data module could, the base never offered it), so the 30 days could never start. Fixed in this walk: the home panel's Incident section ends "Closing ends the incident for every phone and starts the 30 days after which its personal records clear by rule · Close incident" (and "Reopen incident" on a closed one). After Close, the picker's row: "Cedar Fork Flooding · closed · Personal records clear by rule on 11/16/2026: licences, dates of birth, addresses, licence photos and the names of people sheltered · Clear now · Keep 30 more days". Keep moved it to 12/16/2026. Clear now: "Personal records cleared 10/17/2026 by rule · the names, the log and the forms stay". The 214: "Incident closed · personal records clear by rule in 30 days", "Personal records kept 30 more days", "Personal records cleared by rule: 4 licence records, 5 sheltered people's names". | Clear, after the fix |

Items 8 and 10 of "What to fix first" are clear; item 9 (the Google Maps key) is v28.

**Still bites, small:**

- **Nothing says a closed incident can be reopened.** Reopen is on the home panel, reached by opening the closed incident from the picker; the picker's row only says "closed".
- **Make a unit asks the unit's name in the browser's own prompt**, not a sheet in the app's style.
- **"Prove nothing a crew sent can be lost"** (the administrator's job 4) still has no one place that says so; the Members tab's line ("removing a member keeps everything they sent") is the nearest.
- **Dates on the picker are the browser's short form** (11/16/2026) while the log counts days ("in 30 days"); on a shared machine set to another locale the two will not read alike.

---

## Re-walk after v28

The screens v28 added, walked on 2026-10-17 after commit ffdc7a8 (time in the water, incident settings, the public set) in the same mock: Rosa as the seeded Unit 2 on the phone at 375 × 812, the administrator and the Public Information Officer on the base at 1280 × 800. The Browser pane was hidden, so the walk read the screens' text; no screenshots.

| Item | Who | What they saw | Verdict |
|---|---|---|---|
| 4 · Job 2, a rotation timer | Rosa | Her briefing's Safety and PPE now ends "Time in the water: crews out of the water every 45 minutes; the phone nudges you past it." The home screen's first row: "Not in the water · In the water"; the menu's status area says the same with the rotation. One tap: "In the water 0 min · rotation 45 min · Out of the water", the toast "In the water · the clock runs until you tap out", the 214 "Unit 2 in the water". At 50 minutes the row turned the safety yellow: "In the water 50 min · rotation 45 min · past the rotation: swap the crew · Later · Out of the water". Later put the words away and kept the clock. Out of the water: "Out of the water after 50 min", the 214 "Unit 2 out of the water after 50 min". Nothing wider than the screen. | Clear |
| Rosa's boat ramp (v25's leftover) | Rosa | Work area: "B-1 on the map, 15 structures, 2 cleared. No boat ramp on the map yet; ask Operations where to put in. Staging: High school east lot, 0.8 mi." The seed has no ramp; with one placed, the briefing names it with the distance (the `safetyset` suite checks it). | Clear |
| Who is past the rotation (Priya's job 4, part) | Safety, on the base | The resources row: "Unit 2, boat crew · Nguyen, Patel · … · in the water 50 min", the time in orange past the 45; the unit panel: "In the water · in the water 50 min · since 13:17 · Out of the water · rotation 45 min"; the briefing, the situation report and the 208 list who is in the water. | Clear |
| 9 · Job 2, the Google Maps key | Administrator | Header → Settings: "Incident settings · Cedar Fork Flooding. Operations' settings for this incident. They carry into the next incident this account opens. Google Maps browser key … Every member's browser reads it, so in Google Cloud restrict it to this site's address and to the Map Tiles API. The log says a key was set, never the key. Test the key. Personal records clear by rule: 30 · 60 · 90 days after the close. Default rotation in the water, minutes (0 = off)." Layers listed Streets, Satellite and Google Maps streets and satellite from the mock's key. | Clear (Test not pressed: it calls Google) |
| PIO · Job 1, which photos are cleared | PIO | Public information: "1 photo cleared for the public, 0 checked (no face, no plate, no house number). Only checked photos leave in the public set; open a photo to write its public caption and check it. · Download the public set · 0 of 1; the rest wait for a check. · 13:15 · Unit 1 · A-1 · not checked · no public caption". | Clear |
| PIO · Job 3, none shows a victim or an address | PIO | The photo panel: "Cleared for public information · not checked yet, so not in the public set", a Public caption box ("what the public reads, never the unit's note or a house number") and "Checked: no face, no plate, no house number". Wrote the caption and pressed Checked: "checked 14:06 (no face, no plate, no house number) · Withdraw the check". The 214: "Photo from Unit 1, public caption: Floodwater over Riverside Drive on Saturday morning" and "Photo from Unit 1 checked for public release: no face, no plate, no house number". | Clear |
| PIO · Job 2, files with time, place and caption | PIO | After the check: "1 photo cleared for the public, 1 checked … Download the public set · 1 of 1", the list row "13:15 · Unit 1 · A-1 · checked · Floodwater over Riverside Drive", and the situation report "1 photo cleared for public release, 1 checked (no face, no plate, no house number), to Lena Marsh (PIO)". The download itself was not pressed in the pane; the `safetyset` and `walkfix` suites open the zip: the photo named by time and place with the caption inside, captions.txt with the time, the place to the street and the caption, no coordinates, the cleared-but-unchecked listed as missing. | Clear on screen; the file checked by the suites |

Items 4 and 9 of "What to fix first" and the PIO's three jobs are clear.

**Still bites, small:**

- **The clock is per unit.** A crew that swaps one person out keeps one clock running for the boat; per-person clocks wait for the People and tags work, as decided.
- **Every water crew's home screen carries the row** ("Not in the water · In the water") even on a dry assignment such as a bridge hold. One line; it could fold to a button once a unit has never used it.
- **The nudge is only on the screen.** Past the rotation the row turns yellow and says swap the crew, but a phone in a dry bag makes no sound (never a takeover, by decision); the base's orange time is the other half of the warning.
- **A photo outside any division has the base for its place** in the public set's captions; a street name typed by Operations would read better.
- **Test the key is a live call** to Google from the browser, so the mock cannot show what "worked" looks like; the words appear beside the button.

---

## Re-walk after v29

Rosa's and Ana's PAR jobs, walked on 2026-10-17 after commit 386586d (accountability by name) in the same mock: the phone at 375 × 812 as the seeded Unit 2 (Rosa, Nguyen and Patel on record) and Unit 1 (Ana, Ramirez and Okafor), the base at 1280 × 800 as Operations. The Browser pane was hidden, so the walk read the screens' text; no screenshots.

| Item | Who | What they saw | Verdict |
|---|---|---|---|
| Rosa · "Answer the head count" (v24's count that started at 1) | Rosa | Operations pressed Start PAR. The phone's takeover: "Head count (PAR) · 14:31 Operations to everyone · PAR: is everyone accounted for? · CHECKED IN WITH YOU Nguyen, Patel · All 2 accounted for · Someone's missing". One tap on "All 2 accounted for": the toast "All 2 accounted for, sent", the card gone, the 214 "Unit 2: All accounted for (2)"; the base's PAR panel "Unit 2 · All accounted for (2) · 14:31". Nothing wider than the screen. | Clear |
| Rosa · someone is missing | Rosa | On the next PAR, "Someone's missing": "WHO IS MISSING? TICK THEM · Nguyen · Patel · Back · Send: nobody missing" (Send greyed until a tick). Ticked Patel: "Send: 1 missing". Send: the alert screen ("Alert sent 14:31 · WAITING FOR OPERATIONS · Your location keeps sending … · Stand down, all OK"), the 214 "Unit 2: Missing someone: Patel (1 accounted for)" and "EMERGENCY, Unit 2 needs help in B-1: Missing: Patel". | Clear |
| Operations · who is missing | Marcus | The yellow bar: "MISSING · Patel (Unit 2) · 14:31 · 1 accounted for"; the red bar: "EMERGENCY · Unit 2 needs help in B-1 · Acknowledge · Show unit"; the PAR panel: "Unit 2 · Missing: Patel · 1 accounted for · 14:31". The People board's Patel row is red: "Patel · Rope EMT · MISSING since 14:31 · Unit 2 last at 30.26742, -97.73820, live"; the same row, red, on Unit 2's panel. | Clear |
| Ana · "Answer the PAR without typing" | Ana | Her card: "CHECKED IN WITH YOU Ramirez, Okafor · All 2 accounted for · Someone's missing". One tap; the 214 "Unit 1: All accounted for (2)". | Clear |
| The check-in's head count | Rosa | The check-in form now has "How many with you, including you?" beside the names, with "Names are optional; the number is not. Typing names raises it." | Clear (not re-typed: Rosa reopened her incident) |

Rosa's and Ana's PAR jobs are clear; v24's "People with you − 1 +" for a two-person unit is gone for any unit with names on record.

**Still bites, small:**

- **A found person stays "missing" until the next PAR.** Rosa stood down ("Unit 2 stood down, all OK"), but the MISSING line stayed on the bar and Patel's row stayed red: nothing clears a missing report but a new PAR. The stand-down could clear it, or Operations could mark the person found.
- **Two PARs in a row stack on the phone.** Operations started a second PAR before everyone had answered the first; Ana's phone showed two cards, each needing an answer. The base's bar showed both too. A second PAR could close the first, or the phone could answer the newest for both.
- **The Missing someone list has no "all of them".** A crew whose whole boat is out of contact ticks every name; a one-tap "Everyone" would do.
- **The names on the card are the people checked in, not where they are.** A crew that split (two on the bank, one in the boat) has no way to say so; that is the People and tags work.

---

## Re-walk after v31

The Deputy seat, walked on 2026-10-17 after migration 0022 in the mock through the `ics100` smoke suite's steps: the base at 1280 × 800 as Operations. The Browser pane was hidden, so the walk read the screens' text; no screenshots.

| Item | Who | What they saw | Verdict |
|---|---|---|---|
| The period sheet | Marcus | Operational period: "Incident Commander · Deputy Incident Commander" on the first row (the placeholder "ICS-100's remedy for a span past seven"), then Operations and Safety, then Planned end with the note "The deputy prints on the 203 and sits under the IC on the 207, which points at the seat when a span passes seven." Saved "Chief Al Barnes": the 214 "Operational period 1 updated, Deputy Chief Al Barnes". | Clear |
| The 207 with eight divisions and no deputy | Marcus | The orange warning: "Span of control: Operations is at 1 : 8. ICS-100 recommends one supervisor to five, three to seven at most. Group the divisions into branches (a word on each division), or seat a deputy. The Deputy seat on the Period sheet is empty: add a deputy." Under the IC box a dashed orange box: "Deputy Incident Commander · not set · add a deputy: the span of control is past seven". | Clear |
| The 207 once the deputy is named | Marcus | The box reads "Deputy Incident Commander · Chief Al Barnes", plain; the warning ends "Deputy: Chief Al Barnes." until the branches bring Operations back under seven. | Clear |
| The 203 | Marcus | "Deputy Incident Commander: Chief Al Barnes" under the Incident Commander's line, "not set" before the seat was filled. | Clear |
| The next period | Marcus | Start the next period carries the deputy with the other seats; the 214 "Operational period 2 started, Incident Commander Priya Natarajan, Deputy Chief Al Barnes, 2 objectives carried over". | Clear |

**Still bites, small:**

- **The phone does not name the deputy.** Your briefing's "Operations: …" line and the menu's command line say who holds command, not the deputy; a unit that needs the deputy finds them on the printed 203.
- **The warning's advice is in prose.** "add a deputy" is words in the orange box, not a link to the period sheet; the sheet is one click away on the home panel.

---

## Walk at v37: best we can do

Every persona in `docs/personas.md` walked through the app again on 2026-10-17 at v37 (commit c89a929), with Grace's question for each job: is this the best we can do for this person? The mock (`?mock`) with the seeded Cedar Fork Flooding, the base at 1280 × 800 as Operations, the phone at 375 × 812, one phone handed from person to person (Unit 3, a newcomer, Reyes, Moreno, the shelter desk, Ana, Rosa, Unit 3 again). The Browser pane was hidden, so the walk read the screens' text and drove them through their own buttons; no screenshots. The camera is blocked in the pane and the pretend GPS stands every phone in A-2, as at v24. The mock's clock stood at 21:57 when the walk began; the seeded period runs 18:47 to 19:00.

Severity as before: **LOST** = could not finish the job; **SLOWED** = finished after a wrong turn; **PUZZLED** = finished, but a word or layout meant nothing to them; **Clear** = the job went through without a wrong turn. The last column is the best version of that screen for that person, in one line, which is what the ranked list at the end is made from. The open items from the re-walks after v25 to v31 and the v24 items never taken up are folded into the tables where the persona met them again.

A thirteenth person was added, as `personas.md` asked: someone handed a phone at a check-in table who has never seen the app, starting from clickemt.com's front door.

### 13. The newcomer at the check-in table

Phone. A volunteer, Kim Tran, handed a phone and told "check in with the app, the code is on the card". Walked as a new account from the front door at 375 wide, then the 404 page and the join card's link.

| Job | What they saw | Severity | The best version |
|---|---|---|---|
| Find where to start | The front door at phone width: "Incident Map · clickEMT", three buttons (Try it, Sign in, How it is built), then "Part of an incident right now?" with the code box on the first screen (286 px from the top), "Join on this phone", and "No code? It is on the join card at the check-in table…". A five-letter code answered "A join code is six letters and numbers, like CEDAR7. It never has 0, O, 1 or I." The 404 page says "That page is not here … what you need is the six-letter join code, not the link" with the same box (446 px down). | Clear | As it is. |
| Get in with the code | A good code opened the field app at a plain sign-in: "Sign in with the account your agency gave you. You will check in to the incident next." Email, Password, Sign in, and "Create account" as a second button on the same form. Nothing said the code had arrived (it is kept, silently); she has no agency account; pressing Create account with empty boxes said only "Enter an email and a password of at least 8 characters." | SLOWED | With a code waiting, the screen says "Code CEDAR7 is ready. Sign in, or make an account with any email: it takes a minute and only Operations sees who you are", and Create account is as big as Sign in. |
| Say who she is | After Create account: the check-in form with the Identify yourself sheet over it, and a toast "Code CEDAR7 from the link. Name your unit and check in." that was gone in seconds. The sheet leads with "Scan the back of your licence" and "Photo of the front"; name and phone are under them; "No licence at all? Save with your name and phone." Saved: "Saved without a licence. Operations will check who you are in person." | Clear, with a scroll | Name and phone first, the licence under them as the optional extra; the code sentence on the form itself, not a toast. |
| Check in | "Checking in as Kim Tran · 512 555 0190 · identity not given"; code CEDAR7 filled in; "Your unit" with the placeholder "Unit 3" (she has no unit; typed "Volunteer 4"); Agency "e.g. Red Cross, county sheriff"; eleven kind chips, none for a volunteer; two empty people rows; "How many with you, including you?". | PUZZLED | The unit box says "Your callsign, or your own name if you are on your own"; a Volunteer kind; the people rows hidden until the count is more than one. |
| Know what to do now | The home screen was a search crew's: "YOU ARE STANDING IN A-2 · Pecan Mobile Home Park · Priority 1 · 18 structures", Take photo / Address clear / Zone clear / Report hazard / Need help now, Nearby, "No medic on Volunteer 4". Her briefing over it: "OP 1 until 19:00" (three hours past), "YOUR JOB No assignment yet … Wait at staging", "On Volunteer 4: nobody listed yet; add your people from the menu", "This period ends 19:00". | PUZZLED | A unit with no division sees "No assignment yet: stay where Operations put you" and the buttons for what it can do (Report hazard, Message Operations, Need help now), not another unit's division; the briefing never tells a one-person unit to add its people. |
| Her first report | Report hazard: "Pinned where you stand … Operations sees it at once"; "Downed power line" already chosen; kinds Downed power line / Gas smell / Structure unsafe / Road under water / Loose animal / Other; the toast "Briefed. Your briefing stays in the menu." sat over the sheet as it opened. Chose Other, typed "Tree down across Pecan Ln", Send: "Hazard sent"; the base's log "Hazard in A-2: other (Tree down across Pecan Ln, road blocked), reported by Volunteer 4" and her row "Kind not set · Volunteer 4 · 1 Kim Tran · no ID · Available since 22:05 · live". | SLOWED | No kind chosen until she chooses; a Tree down / road blocked kind; toasts never over a sheet's buttons. |
| The next person on the same phone | After Sign out, the next new account (Reyes, then Moreno, then the desk) was shown Identify yourself again over the form. *Correction after v38: the walker first wrote that the sheet had not opened and that Check in answered in red; the sheet is drawn fixed over the page and the walker's visibility check could not see it, while the walker's script pressed the covered Check in button underneath. The red line is right for a form submitted past the sheet, which a thumb cannot do.* | Clear | As it is. |

**What worked**: the front door and the 404 page put the code box first and say where a code comes from; the code survives sign-in and account creation; a name and a phone are enough; the base saw her at once with "no ID" for Operations to verify in person; the hazard reached the map and the log in one send.

### 8. Capt. Reyes, mutual-aid captain

Phone, and the base for the 204 and the join card. A new account, Brush 12, Bandera County FD, engine, Reyes (Capt.) and Ortiz (EMT), count 2.

| Job | What they saw | Severity | The best version |
|---|---|---|---|
| Check in at staging | Identify yourself (open over the form): "Scan the back of your licence" answered "Camera permission was refused. Type the code instead." (a licence has no code; the words are the QR scanner's). Typed the number under "No licence to hand? Type its number". "Checking in as Ray Reyes · 830 555 0177 · licence typed · Change". The code box was empty (no link this time) and pressing Check in with it empty showed only the browser's own bubble. | PUZZLED | The scan sheet says "Camera refused. Type the licence number instead"; an empty code answers in the app's words. |
| Put the crew in | Two rows at check-in (name, rank or role, qualification chips), "How many with you, including you?" set to 2. Briefing: "On Brush 12: Reyes, Ortiz". Menu → Show a code to join: "Join this incident … CEDAR7 … the link" for his second crew. | Clear | As it is. |
| His 204 and his channel | Base: B-2's 204 with "Division supervisor: not named · Operations Section Chief: Marcus Bell", the map with addresses, the off-map facilities with distances, the channels, the medical lines. Phone: "YOUR ZONE B-2 · Radio TAC 3 · Objective 2". | Clear | As it is. |
| Accept the assignment | The base read "In progress · Brush 12 · 0 of 9" the moment Operations pressed his name, before he accepted; his phone: "NEW ASSIGNMENT FROM OPERATIONS · B-2 … · Accept" above "YOUR ZONE B-2 … In progress". | PUZZLED | A division reads "Assigned, not accepted" until the unit accepts or sends its first report from it. |
| Hospital and staging | Nearby: staging 0.8 mi, shelter, hospital, each with Directions; If someone is hurt names the medic, the channel and the hospital. | Clear | As it is. |
| Get released | "You are released. Return to staging, High school east lot, return the radio to Logistics, and check out on your phone. Thank you." Will do. Menu → Check out: six lines, three ticked for him; "Nobody hurt, no equipment damaged" unticked with the hint "untick to say what happened"; "3 items not ticked. They go to Operations with your check-out". Check out → "Checked out", back on the check-in page. | PUZZLED | "Nobody hurt, no equipment damaged" ticked by default; unticking it is the exception Finance needs. |
| The join card he would be handed | "Bring: Swift water everywhere south of Mill Street…" (the safety message, not what to bring); "Getting there: High school east lot at 30.25560, -97.74000". | PUZZLED | "Safety:" for the message and "Bring:" for what to bring; "Getting there:" with the street address when the facility has one, else "open Directions from Nearby once you have checked in". |

### 10. The shelter desk volunteer

Phone. A new account, Gym desk, Red Cross, kind Shelter desk, count 1, name and phone only.

| Job | What they saw | Severity | The best version |
|---|---|---|---|
| Get in | The third account on the phone: Identify yourself over the form, name and phone, Save. (The walker's first reading, that the sheet had not opened, was wrong; see the newcomer.) | Clear | As it is. |
| Know her job | Her briefing's Your job is hers: "People here at High school gym. Sign in everyone who arrives… Now: 9 of 60 beds, 1 record on the way, expected Bus 2…". But "WHO YOU WORK WITH On Gym desk: nobody listed yet; add your people from the menu" and "WORK AREA Where you stand is on the map." Home: People here with the count against the beds, the needs, the expected line, Find a person, Arriving from crews with They're here, Sign in a person, Here now. | PUZZLED | Work area names the shelter and its address; "add your people" only when the count says there are more. |
| Who is on the next bus | "expected: Bus 2 from Pecan Park, 12 people, 17:30. Operations sees this count live on the shelter's card." and "ARRIVING FROM CREWS · family of 4 from 112 Pecan Ln · Unit 3, 21:43 · pets · wet, cold, a dog · They're here". | Clear | As it is. |
| Sign in a family | "WHO · HOW MANY · NEEDS (Oxygen, Insulin, Wheelchair, Infant, Pets, Other) · FROM · WHERE NOW · NOTE · Only "Who" is needed". Garcia family, 3, insulin and pets → "Garcia family signed in"; the header "10 of 60 · 4 records · 1 oxygen · 1 insulin · 1 infant · 2 pets". They're here on the arriving family → "Signed in: family of 4 · High school gym since 22:14 · Unit 3 sent them from 112 Pecan Ln… add the name if you have it". | Clear | As it is. |
| Oxygen, insulin, pets | The chips on the sheet and on the row. | Clear | As it is. |
| Is my mother here | "Alvarez" → "Maria Alvarez, 78 · oxygen · Dell Seton Medical Center since 21:43 · from 112 Pecan Ln". "Pecan" → three records and "Not listed? Ask Operations to look · sends "Looking for Pecan" with your desk's number". | Clear, one odd ask | A street search offers "Looking for someone from Pecan", or no ask at all. |
| We are nearly full | Message Operations: the urgency words, her own words, quick chips that are a search crew's (Need more hands, Water rising here, Road blocked, Done here, what next?). | PUZZLED | A desk's chips: Nearly full, Need cots and blankets, Need a nurse. |

**On the base**: the shelter card read "14 of 60 · Expected … 0 on their way from crews (live…)", the needs, People here with Where now on every row, Print the list; the header's Find a person found "Garcia family · High school gym since 22:14 · signed in by Gym desk" at once.

### 9. Dep. Luis Moreno, deputy at a closed bridge

Phone. A new account, SO 14, Cedar County Sheriff's Office, Other, count 1.

| Job | What they saw | Severity | The best version |
|---|---|---|---|
| Check in alone | Count 1 accepted; "identity not given" for Operations to verify. His briefing: "No assignment yet … Wait at staging, High school east lot" for a post at a bridge, and "On SO 14: nobody listed yet; add your people from the menu" though he said he is one. Home: the search crew's five buttons and "You are standing in A-2". | PUZZLED | A unit with no division sees "stay where Operations put you"; no "add your people" for a count of one. |
| Car in the water, right here | Report hazard: pinned where he stands; "Downed power line" preselected; no kind for a car or a person in the water; Other, typed, Send: "Hazard sent". On the base a log line and a triangle, no urgency. Three taps and typing. | SLOWED | A "Person in the water / car in the water" kind, nothing preselected, and an "Act on now" word on the hazard that puts it on the base's bar until Operations acknowledges. |
| Answer the head count | "Head count (PAR) · People with you − 1 + · All accounted for · Missing someone": his count of 1 was already there; one tap; "All 1 accounted for, sent"; the base "SO 14 · All accounted for (1) · 22:12". | Clear | As it is. |
| The road is closed | Inbox → Message Operations: "HOW URGENT Act on now …", his words, the Road blocked chip, Attach my location, Send → "Sent to Operations"; the inbox "You to Operations · Act on now · location attached · … · Waiting on Operations"; the base's log "SO 14 to Operations (act on now): Road closed … · location attached" with Acknowledge and Show on map. Five taps and typing. | Clear | As it is; the hazard above should carry the same urgency word so a car in the water is not the quieter of the two. |
| When can I stand down | Operations' release message with Will do (seen with Reyes). | Clear | As it is. |

### 4. Rosa Alvarez, swift-water boat operator

Phone, as the seeded Unit 2 (Travis County Rescue, Nguyen and Patel, B-1).

| Job | What they saw | Severity | The best version |
|---|---|---|---|
| Open her incident | "Incidents you are already in" first; then the takeover "Safety message and head count" with three cards: a PAR from 22:12, the safety message from 22:02, a PAR from 22:02, each wanting an answer. | SLOWED | One head count at a time: a new PAR closes the one before it, and the phone shows one card. |
| Someone is missing | "Someone's missing" on the newest card → "WHO IS MISSING? TICK THEM · Nguyen · Patel · Back · Send: nobody missing" → ticked Patel → "Send: 1 missing" → "Alert sent 22:16 · WAITING FOR OPERATIONS · Your location keeps sending", then "OPERATIONS ACKNOWLEDGED AT 22:17 · Stay put if you can", then Stand down → "Stood down". | Clear | As it is. |
| When Patel turns up | After the stand-down the base still read "MISSING · Patel (Unit 2) · 22:16 · 1 accounted for" and Patel's row "MISSING since 22:16 · Unit 2 last at …". Nothing on her phone says "found". | SLOWED | A "Found" answer on the phone and a Found button on the base's MISSING line, logged. |
| Time in the water | "Not in the water · In the water" is the first row; one tap → "In the water · the clock runs until you tap out", "In the water 0 min · rotation 45 min · Out of the water"; out → "Out of the water after 1 min". The base's unit panel "in the water 1 min · since 22:17". | Clear | As it is (the row could fold to a button on a dry assignment). |
| The boat ramp | Nearby listed staging, the shelter and the hospital; nothing said there is no ramp on the map yet (her briefing says so). | PUZZLED | Nearby says "No boat ramp on the map yet; ask Operations where to put in" when none is placed. |
| Log who we pulled out | Address clear → "Add who and where they went": a row with Went to High school gym (shelter) / Went to Dell Seton (hospital) / With family / Own transport / Not known. The save is below the fold with the rows added. | Clear, with a scroll | The sheet's foot buttons stay on screen. |
| Her people | Menu → People on the unit: "2 on the unit. Operations counts them from here. · Nguyen Capt. · swift water, boat · since 19:09 · 3 h 8 min on scene · with Patel · Edit · Check out" and Patel. | Clear | As it is; per-person tracking is the tags work. |

### 2. Marcus Bell, Operations Section Chief

Base at 1280 × 800.

| Job | What they saw | Severity | The best version |
|---|---|---|---|
| Draw a division | The toolbar one row: "Draw boundary · Draw division · Finish · Remove last point · Cancel · Click the map to outline the division, then press Finish." | Clear | As it is. |
| Assign and move a unit | A-1's panel: "ASSIGNED TO Unit 1 Unit 2 Unit 3 …" (a press adds, by decision); the division turned "In progress · Brush 12 · 0 of 9" at the press, before the unit accepted. | PUZZLED | "Assigned" until the unit accepts or reports. |
| Photos as they come | A photo's panel: "Facing S 180° · TAKEN BY Unit 3 · TIME 10/17/2026, 9:45:58 PM · ZONE · POSITION · NOTE · PUBLIC · Clear for public information". | Clear, one odd time | The time as 21:45, like every other time on the base. |
| Run a PAR | Start PAR → "PAR · 0 of 3 answered · waiting on 3 units · started 22:02 to everyone". A second Start PAR ten minutes later, before everyone had answered, put a second PAR on the bar; the first stayed open ("0 of 3 answered … 10 min ago") and could never complete for the units that joined after it. With an emergency and a missing person as well, the bar held five things in its one row, each cut to 256 px with the whole on hover. The panel under Accountability lists only the newest. | SLOWED | A new PAR closes the one before it (logged as superseded); the bar holds one PAR, one safety message and what is open now. |
| Answer the radio | U1's marker → the unit panel: Kind chips (eleven) and Identity first, then requests, the water clock, status, agency, head count, assigned, standing in, position, heading, last report, photos, "JOINED 10/17/2026, 7:07:58 PM", people, message. The answer to "where is Unit 1" is a screen down. | PUZZLED | Where it is, what it is on and its last report first; kind and identity under them. |
| Hand the map to the relief | Briefing (one sheet), Pop out for the log, Start period 2 on the Period sheet. | Clear | As it is; a "since you last looked" would serve the relief too. |

### 1. Dana Ruiz, Incident Commander

Base at 1280 × 800.

| Job | What they saw | Severity | The best version |
|---|---|---|---|
| Thirty seconds | Header "OP 1 · 18:47 to 19:00, IC Dana Ruiz · Base: Cedar Fork High School · 3 units · 6 divisions, 1 cleared"; the bar "No emergency open · no safety message or PAR waiting on an answer"; the legend's counts. It was 21:57: the period's planned end was three hours past and nothing said so, here or on the Period sheet or in the briefing ("OP 1 until 19:00"). No count of open hazards or people needing help at the top; the briefing has "HAZARDS STILL OPEN" and the sitrep "Hazards open: 1 · emergencies open: 0". | PUZZLED | The header says "ends 19:00 · overdue 3 h" and the Period sheet offers the next period; a hazards count on the header line. |
| Sign the IAP | 202, 203 (with the Deputy seat), 207, every 204, 205, 206, 208; "Prepared 10/17/2026, 9:58:39 PM"; Copy as text / Print / Close. No Prepared by / Approved by line. | PUZZLED | "Prepared by (Planning) · Approved by (Incident Commander) · date and time" lines on the IAP's first page, and "Prepared by" on each report, in the app's own time form. |
| Brief the shift change | One sheet: seats (Deputy not set), representatives, the safety message, objectives, divisions, resources, hazards still open, facilities, who is in the water. | Clear | As it is. |
| Unified command, transfer | The Period sheet with the Deputy beside her, the unified box, representatives, the transfer rule in words. (Walked at v24 and v31.) | Clear | As it is. |
| Who is in which seat | The 207 with the span of control on every box and the Deputy box under hers. | Clear | As it is. |
| What changed while I was away | After an hour of events the log's header read "33 new" with the chips "All 102 · Notable 2 · From the field 26 · Messages 20 · Operations 53 · Notes 1". The nearest thing. | PUZZLED | A "since you last looked" line at the top of the log: 2 hazards, 1 emergency (stood down), 1 missing person, 3 PAR answers, with Show them. |

### 3. Lt. Ana Ramirez, unit lead on foot

Phone, as the seeded Unit 1 (engine, Ramirez and Okafor, A-1).

| Job | What they saw | Severity | The best version |
|---|---|---|---|
| Open her incident | "Incidents you are already in · Cedar Fork Flooding · OP 1 · 07:00 to 19:00 · you are Unit 1" first (by decision, the typed label). Then the three-card takeover: PAR 22:12, safety 22:02, PAR 22:02; three taps, each with a toast. | SLOWED | One head count at a time. |
| Her home | "NEW ASSIGNMENT FROM OPERATIONS · A-1 … · Accept" for the division she has worked since 19:17; nothing retires an unaccepted card. | PUZZLED | The card folds once the unit has reported from the division. |
| Address clear | The house record (filed under A-2 by the pretend GPS): address, occupants, people needing help with "Add who and where they went", water, damage, hazards, notes; "Searched, save" at 949 px on an 812 px screen. | SLOWED | The foot buttons stay on screen (sticky), so one tap, type, one tap. |
| Take photo | The tap did nothing and said nothing (no camera in the pane). | PUZZLED | On a phone the camera opens; when it cannot, one line says so. |
| Zone clear | "Finish the search of A-1 · Sends A-1 to Operations · WHICH SEARCH IS COMPLETE Primary search done / Secondary search done, zone clear · PEOPLE FOUND · HAZARDS STILL IN THE ZONE · SEARCH MARKING TO PAINT (22:15 / U1 / none / 0)". She had 9 of 24: the whole division, or her part? | PUZZLED | The sheet says plainly it sends the whole division (9 of 24 marked so far) and offers "My part is done" as a message to Operations instead; whether a unit may close a division it has not finished is Grace's call. |
| Mayday, the PAR | Need help now then Send alert; the PAR one tap with her two names. | Clear | As it is. |

### 5. Priya Natarajan, Safety Officer

Base to send and watch, the phone to read.

| Job | What they saw | Severity | The best version |
|---|---|---|---|
| A safety message | Message the field: everyone, the "Safety" tick, the words, Send → "SAFETY · Walk test: … · waiting on 3 units · sent 22:02 by Operations" on the bar; every phone's takeover headed "Safety message and head count". | Clear | As it is. |
| Who has not acknowledged | The bar "waiting on Unit 3", the Messages list "Waiting on Unit 2, Unit 3 · Unit 1: Acknowledged". | Clear | As it is. |
| Hazards as they come in | Log lines ("Hazard in A-2: other (Car in the water at the low crossing, one person inside), reported by SO 14"), a triangle, the division's "hazard" word, the zone card's list, the briefing's "HAZARDS STILL OPEN". No list of its own on the base, no urgency on any of them. | SLOWED | A "Hazards open" section on the home panel (kind, division, when, who, Resolved) and the urgent ones on the bar. |
| On scene too long | People board "On scene 3 h 8 min, since 19:09"; the water clock orange past the rotation; Hours totals; nothing warns at a threshold. | PUZZLED | A threshold on the Period sheet beside the rotation ("flag people past 12 h on scene"), orange on the board and a line in the briefing. *Built in v47 (see Re-walk after v47).* |
| The period's safety message and rotation | On the Period sheet; printed on every 204 and the 208; read in every briefing. | Clear | As it is. |

### 6. The Documentation Unit

Base.

| Job | What they saw | Severity | The best version |
|---|---|---|---|
| Print the 214 | "2 NOTABLE ENTRIES" first, then "102 ENTRIES, OLDEST FIRST" (every event, checked against the data); "Prepared by Operations, 10/17/2026, 10:00:37 PM". | Clear, one odd time | The time in the app's form. |
| Print the 211 | Every unit with who checked it in, verified or not, each person's times. | Clear | As it is. |
| The situation report | Three boxes and Save the words; the assembled 209 (progress, people sheltered, hazards open, resources, needs, outlook, facilities, public information); Copy as text / Print. Getting it to the EOC is still copy and paste. | PUZZLED | "Send by email" opens the mail app with the report in the body (and an EOC address on the incident's settings, if Grace wants one kept). |
| Replay | Play, Last hour / This period / Whole incident, 10× / 60× / 600×, the line of the moment. | Clear | As it is. |
| Who said what at 10:40 | Find in the log "Bus barn" → "21:15 A-3: Bus barn · water waist deep · major damage · hazards ELEC · Open structure". | Clear | As it is. |
| Hours | "Lt., swift_water, emt" with underscores in the ROLE column; rows counted to now marked. | PUZZLED | The qualification words as everywhere else. |
| The period | Header 18:47 to 19:00 three hours past; the picker and the phone "07:00 to 19:00" (by decision). | PUZZLED | The overdue period said so. |

### 7. The Public Information Officer

Base.

| Job | What they saw | Severity | The best version |
|---|---|---|---|
| Which photos are cleared | Public information at the foot of the home panel: "1 photo cleared for the public, 0 checked … · Download the public set · 0 of 1; the rest wait for a check." | Clear, far down | The section nearer the top for whoever is seated as PIO, or a header button. |
| Check one | The cleared photo's panel: "Cleared for public information · not checked yet, so not in the public set", the Public caption box, "Checked: no face, no plate, no house number", Save caption, Withdraw from public. | Clear | As it is. |
| Get the files | Download the public set (walked at v28). | Clear | As it is. |
| Am I named | The Period sheet, the 203, the 207 and the sitrep's last section name her. | Clear | As it is. |

### 11. The agency administrator

Base.

| Job | What they saw | Severity | The best version |
|---|---|---|---|
| Who is a member | People → Members: "4 members · 1 Operations", each with role, licence state, Open / Make Operations / Remove; "The six-letter join code makes a unit; the Operations code on the home panel makes Operations." Make a unit asks the name in the browser's own prompt. | Clear, one odd prompt | A small sheet for the name. |
| The two codes | Join code with Copy, Print a join card, Copy the link; the Operations code with Copy and New code and its warning. | Clear | As it is. |
| The Maps key | Settings: the key with Test, the retention days, the default rotation. | Clear | As it is. |
| Close and clear | Close incident asks in plain words; the picker's row "closed · Personal records clear by rule on 11/16/2026 … · Clear now · Keep 30 more days"; the home panel of a closed incident "Closed · … · Reopen incident". The picker's row does not say it can be reopened; the date is in the browser's short form. | PUZZLED | Reopen on the picker's row too; the date as "16 Nov 2026". |
| Start the season | Open a new incident on the picker, Period for the seats, Print a join card. | Clear | As it is. |

### 12. The resident who refused to leave

Not a user. The house record still carries "Refused to leave", the people needing help, the hazards, the marking and "Notes for the next crew"; the revisit is a note, not a reminder that fires. The best version: a "revisit at" time on the record that shows on the division's panel and the next crew's 204.

---

### What to do first

Ranked by how many personas it serves and how badly it bites, each with the smallest change that would do it. The first nine are the releases; the rest are small words and buttons to take in one release, and two that wait for Grace.

1. **One head count at a time, and a missing person who is found.** Seven personas (Marcus, Priya, Dana, Ana, Rosa, Moreno, every unit's phone). A second PAR stacks on the first, the old one can never complete for units that joined later, the phone shows two or three cards, the bar holds five things, and MISSING stays after the stand-down. *Smallest change:* Start PAR closes the PAR before it (its unanswered units are asked again by the new one; the log says "PAR superseded"); the bar and the phone show one PAR; a Found button on the base's MISSING line and a "Found" answer on the phone, both logged, clear the missing report.
2. **The newcomer's door.** Five personas (the newcomer, Reyes, Moreno, the desk, the administrator). *Smallest change:* with a code waiting, the sign-in screen says so and offers Create account as a first-class button with the words a volunteer needs; "Your unit" says "your callsign, or your own name if you are on your own"; the code sentence sits on the form, not in a toast; a Volunteer kind. (The Identify sheet already opens for every new account; the walker's "once per page" was a misreading, corrected above.)
3. **A period that ended three hours ago says so.** Nine personas read the period (the IC, Marcus, the clerk and every phone's briefing). *Smallest change:* past `ends_at` the header reads "ends 19:00 · overdue 3 h", the briefing and the phone's briefing say "ended 19:00; the next period has not been started", and the Period sheet's Start period button is lit.
4. **Times and dates in one form.** Six personas (the IC, Marcus, the clerk, the PIO, the administrator, Reyes). "Prepared 10/17/2026, 9:58:39 PM", "JOINED 10/17/2026, 7:07:58 PM", "clear by rule on 11/16/2026" beside 21:58 everywhere else. *Smallest change:* one `whenText()` in rules.js ("17 Oct 2026 21:58") used by every prepared / opened / joined / taken / clear line in both views and on paper.
5. **A hazard that says how urgent it is.** Five personas (Moreno, the newcomer, Priya, Rosa, the desk for the toast). *Smallest change:* no kind preselected (Send waits for one); new kinds "Person or car in the water" and "Tree down, road blocked"; the message's four urgency words on the hazard sheet, and an act-on-now hazard on the base's bar with Acknowledge; toasts drawn above a sheet's foot buttons.
6. **Open hazards where Safety and the IC look.** Three personas (Priya, Dana, Marcus). *Smallest change:* a "Hazards open" section on the home panel (kind, division, when, who, Resolved) and the count on the header line.
7. **The house record's Save on screen.** Four personas (Ana, Rosa, Reyes, the newcomer). *Smallest change:* the sheet's foot buttons are sticky at the bottom of the screen.
8. **Assigned is not In progress, and the Accept card retires.** Four personas (Ana, Rosa, Reyes, Marcus). *Smallest change:* a division reads "Assigned" until the unit accepts or sends its first report from it, then "In progress"; the phone's Accept card folds once the unit has reported from the division.
9. **The briefing for a unit with no division.** Four personas (Moreno, the desk, the newcomer, Reyes). *Smallest change:* Your job says "No assignment yet: stay where Operations put you" (staging named only when Operations has not placed the unit elsewhere); "add your people" only when the count is more than the names; a desk's Work area names the shelter and its address; a unit with no division gets Report hazard, Message Operations and Need help now, not another unit's division card.
10. **Paper that leaves the base.** The IC and the clerk: "Prepared by (Planning Section Chief) · Approved by (Incident Commander) · date and time" lines on the IAP, "Prepared by" on each report; Send the sitrep by email (the mail app with the text in the body); Reyes and the administrator: the join card's "Safety:" and "Bring:" told apart, "Getting there:" with the address.
11. **Small words and buttons**, one release: the Hours table's underscores; the licence scan's "Type the code instead"; "Nobody hurt, no equipment damaged" ticked by default; Reopen on the picker's closed row; a sheet instead of prompt() for Make a unit; the unit panel's order (where it is first); the phone naming the deputy; Nearby saying "no boat ramp on the map yet"; Find a person's street ask; the desk's quick chips; the 207 warning's "add a deputy" as a link to the Period sheet; the water row folded on a dry assignment; a Volunteer unit kind.
12. **What changed while I was away** (the IC, Marcus's relief): a "since you last looked" line at the top of the log with the counts by kind and Show them. Medium; after the above.
13. **On scene too long** (Priya): a threshold of hours beside the rotation on the Period sheet; orange on the board and a line in the briefing. Small; with 11 or after. *Built, v47.*

**For Grace:** whether a unit may close a division it has not finished (Ana's Zone clear: the sheet can say what it sends either way); whether a hazard's urgency should also page the base like an emergency does, or only sit on the bar; whether the sitrep's email address is kept on the incident; a "revisit at" time on the house record (the resident).

**Seen by the walker, not a persona:** once, right after a phone already on the incident opened a join link for it and then signed out, the log got "Hale (swift water, EMT) updated on Unit 3, Lt." by that unit's account; it did not recur when the same steps were walked again without the link.

---

## Re-walk after v38

One head count at a time, and a missing person who is found: Marcus's PAR job and Rosa's missing job, walked on 2026-10-17 after migration 0023 in the same mock, the base at 1280 × 800 as Operations and the phone at 375 × 812 as the seeded Unit 2. The Browser pane was hidden, so the walk read the screens' text; no screenshots.

| Item | Who | What they saw | Verdict |
|---|---|---|---|
| Two PARs ten minutes apart | Marcus | The first Start PAR: "PAR · 0 of 3 answered · waiting on 3 units · started 22:46". The second: the same one line, not two; the 214 "Earlier PAR closed by the new one, still waiting on Unit 1, Unit 2, Unit 3" under the new "PAR, Operations to everyone"; the Messages list's old row "Closed by the PAR started 22:46 · Unit 1, Unit 2, Unit 3 never answered". The seeded morning PAR reads the same way under the one that followed it. | Clear |
| The phone when a second PAR arrives | Rosa | One card: "Head count (PAR) · 22:46 · Operations to everyone · CHECKED IN WITH YOU Nguyen, Patel · All 2 accounted for · Someone's missing". Not three. | Clear |
| Patel is missing, then found | Rosa | Someone's missing → ticked Patel → "Send: 1 missing" → the alert screen: "Alert sent 22:47 · WAITING FOR OPERATIONS · … · REPORTED MISSING AT 22:47 · Patel · Found · Operations sees them as missing until you or the base press Found." Pressed Found: toast "Patel marked found", the card gone; Stand down → home with nothing left to clear. | Clear |
| The base while it happened | Marcus | "MISSING · Patel (Unit 2) · 22:47 · 1 accounted for · Found" on the bar; after her Found the line was gone, the PAR panel read "Unit 2 · Patel found · 1 accounted for · 22:47", the 214 "Patel found, reported by Unit 2" starred as notable, then "Unit 2 stood down, all OK". | Clear |

Item 1 of "What to do first" is clear: the bar holds one head count, the phone one card, and a found person leaves the bar and the board.

**Still bites, small:**

- **Found is per person.** A crew whose whole boat was out of contact presses Found once per name; "all found" would be one tap. *Built in v48.*
- **A superseded PAR keeps its "never answered" words for ever** in the Messages list; that is the record, but on a long incident the list of closed PARs grows under the open one. The list shows eight messages; older ones are in the 214.
- **A safety message still stacks with a PAR** on the phone's takeover (two cards, each one tap), by design: a safety message is not superseded by a head count.

---

## Re-walk after v39

The newcomer's door, walked on 2026-10-17 after migration 0024 on the phone at 375 × 812, from clickemt.com's front door: the walker typed the code on the door, read the field app's sign-in as it opened, and then went the same way in the mock as a new account. The Browser pane was hidden, so the walk read the screens' text; no screenshots.

| Item | Who | What they saw | Verdict |
|---|---|---|---|
| The code on the door, then the sign-in | The newcomer | The field app opened on "Code CEDAR7 is ready. Sign in below, or make an account with any email and a password: it takes a minute, and only this incident's Operations sees who you are." with Email, Password, and Sign in beside Create account, both full buttons. Nothing wider than the screen. | Clear |
| Make an account | The newcomer | Create account with an email and a password: the check-in form with Identify yourself over it (the sheet is drawn over the page; the walker's check in the v37 walk could not see it and was wrong). Name and phone, Save: "Checking in as Kim Tran · 512 555 0190 · identity not given: Operations checks who you are in person". | Clear |
| The form | The newcomer | The code CEDAR7 filled in, and under it in plain words "Code CEDAR7 came with the link. Name your unit and check in." The unit box reads "Engine 3, Boat 1, or your name" and the line under it "Your callsign; if you are on your own, your own name will do." The people rows are folded; a Volunteer chip among the kinds. Typed her own name, Cedar Fork volunteers, Volunteer, 1. | Clear |
| On the base | Marcus | "Kim Tran, volunteer checked in as Kim Tran, 512 555 0190, identity not given with 1 person"; the resources board lists her under Volunteers. | Clear |

Item 2 of "What to do first" is clear. Her briefing still says "Wait at staging" and "add your people from the menu"; that is item 9 (v42).

**Still bites, small:**

- **The base's front door still says "the account your agency gave you"** under Running the base?; that is Operations' screen and reads right for them, but a volunteer who scrolls past the code box reads it too. *Built in v48.*
- **A code typed with a wrong letter** (0 for O) is refused on the door with the rule; the field app's own code box, for a code typed by hand, answers only with the database's "No active incident has the code".

---

## Re-walk after v40

A period that has ended says so, and times in one form: Dana's thirty seconds, the clerk's reports and a crew's briefing, walked on 2026-10-17 at 23:17 in the same mock (whose seeded period is planned to end at 19:00, so it was overdue), the base at 1280 × 800 and the phone at 375 × 812 as Unit 3. The Browser pane was hidden, so the walk read the screens' text; no screenshots.

| Item | Who | What they saw | Verdict |
|---|---|---|---|
| The header | Dana | "OP 1 · 20:07 to 19:00 · overdue 4 h 17 min, IC Dana Ruiz · Base: Cedar Fork High School · 3 units · 6 divisions, 1 cleared". | Clear |
| The IAP | Dana, the clerk | "Operational period 1, 20:07 to 19:00 · the planned end passed 4 h 17 min ago; the next period has not been started" and "Prepared 17 Oct 2026 23:17". The same line heads the 203, the 207, the sitrep, the 211 and the 214. | Clear |
| The Period sheet | Dana | "Operational period 1 · 20:07 to 19:00 · overdue 4 h 17 min", then in orange "The planned end 19:00 passed 4 h 17 min ago and the period is still open. Start period 2, or move the planned end below.", and Start period 2 drawn as the primary button under Shift change. | Clear |
| The home panel, a photo, a unit | Marcus, the PIO | "OPENED 17 Oct 2026 20:07", a photo's "TIME 17 Oct 2026 23:05", a unit's "JOINED 17 Oct 2026 20:27": the same form as every other time on the base. | Clear |
| The phone | Unit 3 | The menu's "PERIOD OP 1 · 20:07 to 19:00 · overdue 4 h 17 min, IC Dana Ruiz"; the briefing's Situation "Cedar Fork Flooding, OP 1, planned end 19:00 has passed." and Shift "This period was to end 19:00, 4 h 17 min ago; stay on until Operations starts the next period, when the next crew is briefed at staging." | Clear |

Items 3 and 4 of "What to do first" are clear.

**Still bites, small:**

- **A planned end before the start** reads "20:07 to 19:00" (the mock's seed starts the period three hours ago and ends it at a fixed 19:00); the sheet lets Operations type any time. The overdue words still make sense; a warning when the end is typed earlier than the start would end it.
- **"Overdue" is a word Operations may not want on the header** for a period that ran its course and was simply never closed; starting the next period clears it, which is the right habit, and the words say so.

---

## Re-walk after v41

A hazard that says how urgent it is, and the open hazards where Safety looks: Moreno's car in the water and Priya's hazards job, walked on 2026-10-17 after migration 0025 in the same mock, the phone at 375 × 812 (as the seeded Unit 3, standing in A-2) and the base at 1280 × 800 as Operations. The Browser pane was hidden, so the walk read the screens' text; no screenshots.

| Item | Who | What they saw | Verdict |
|---|---|---|---|
| Report hazard | Moreno | "Pinned where you stand … Operations sees it at once. HOW URGENT Act on now / Before nightfall / Can wait until tomorrow / Blocks further operations · WHAT KIND Downed power line / Gas smell / Structure unsafe / Road under water / Person or car in the water / Tree down, road blocked / Loose animal / Other · ANYTHING ELSE · Cancel · Send hazard (greyed until a kind is chosen)". Nothing chosen for him. Act on now, Person or car in the water, a line typed, Send: "Hazard sent, act on now: Operations will acknowledge". Four taps and typing, the urgency said. | Clear |
| The base at that moment | Priya, Marcus, Dana | The yellow bar: "HAZARD · Person or car in the water, Car in the water at the low crossing, one inside · A-2 · 23:31 · Unit 3 · Acknowledge · Show on map". The header: "… 6 divisions, 1 cleared · 2 hazards open". The home panel's "HAZARDS OPEN · 2": the new one with its Act on now badge, "A-2 · Unit 3", Acknowledge / Show on map / Resolved, then the morning's downed power line with Show on map / Resolved. The 214: "Hazard in A-2 (act on now): person or car in the water (Car in the water at the low crossing, one inside), reported by Unit 3". | Clear |
| Acknowledge | Marcus | The bar back to "No emergency open · no safety message or PAR waiting on an answer"; the list row "A-2 · Unit 3 · acknowledged 23:31" with Show on map and Resolved still there; the 214 "Hazard acknowledged by Operations: person or car in the water in A-2". | Clear |

Items 5 and 6 of "What to do first" are clear. The toast now sits under the header while a sheet is open (checked by the `newcomer` suite on the hazard sheet).

**Still bites, small:**

- **The bar's words repeat themselves** when the crew's note restates the kind ("Person or car in the water, Car in the water at the low crossing"); the kind could be dropped from the bar when the note starts with the same words.
- **Acknowledge is the base's word, not the crew's**: the phone says "Operations will acknowledge" but shows nothing when they do. A line on the phone's home ("Operations saw your hazard at 23:31") would close the loop. *Built in v48.*
- **Before nightfall and the other three words** do nothing yet on the base beyond the badge; only Act on now reaches the bar, by design. *Built in v48.*

---

## Re-walk after v42

The phone's sheets: Ana's Address clear, Moreno's briefing and home screen, and Marcus's assignment, walked on 2026-10-17 after migration 0026 in the same mock, the phone at 375 × 812 (as the seeded Unit 3, then as a new one-person unit, SO 14) and the base at 1280 × 800 as Operations. The Browser pane was hidden, so the walk read the screens' text and measured the buttons; no screenshots.

| Item | Who | What they saw | Verdict |
|---|---|---|---|
| Address clear | Ana | The house record is 1,019 px tall on an 812 px screen, and "Cancel · Searched, save" sat at 734 to 812 px from the top, on screen, before and after scrolling the sheet. One tap, type, one tap. | Clear |
| A one-person post's briefing | Moreno | "YOUR JOB No assignment yet. Operations assigns divisions from the base. Stay where Operations put you; if you have nowhere yet, staging is High school east lot." and "WHO YOU WORK WITH On SO 14: you alone. Next door: Unit 3 in A-2 …". | Clear |
| A one-person post's home | Moreno | "YOUR ASSIGNMENT No assignment yet · Operations assigns divisions from the base. Stay where Operations put you. From here you can take a photo, report a hazard, message Operations or call for help. You are standing in A-2, Unit 3's division." with Take photo, Report hazard, Message Operations and Need help now; Address clear and Zone clear put away. | Clear |
| Assign and accept | Marcus, Moreno | Operations pressed SO 14 under B-2's Assigned to: the row and the panel read "Assigned, not accepted · SO 14 · 0 of 9". The phone: "NEW ASSIGNMENT FROM OPERATIONS · B-2 … · Accept". Accept: the card gone, the division card "YOUR ZONE B-2 … In progress", the search buttons back; the base's row "In progress · SO 14 · 0 of 9" and the 214 "SO 14 accepted the assignment to B-2". *The first press of Accept on the walk failed with "id is not defined": a slip in the new handler, fixed before the release and now pressed by the `newcomer` suite.* | Clear |

Items 7, 8 and 9 of "What to do first" are clear.

**Still bites, small:**

- **The desk's "you alone"** reads oddly for a desk with helpers it never named; the count is theirs to give.
- **A unit standing in another unit's division** still reads that division's name on its card ("You are standing in A-2, Unit 3's division"), by design now, so a crew driving through knows whose ground it is on.
- **Accept is not required**: a unit that never presses it but sends a photo from the division reads "In progress" all the same, which is the point; one that neither presses nor reports stays "not accepted" for ever, which Operations can read as a prompt to call them.

---

## Re-walk after v43

Paper that leaves the base: Dana's IAP, the clerk's situation report and Reyes's join card, walked on 2026-10-18 after migration 0027 in the same mock on the base at 1280 × 800 as Operations. The Browser pane was hidden, so the walk read the screens' text through the `reports` and `ics100` suites' steps; no screenshots.

| Item | Who | What they saw | Verdict |
|---|---|---|---|
| Sign the IAP | Dana | The first page ends "Prepared by (Planning Section Chief): Theresa Okafor · signature ______" and "Approved by (Incident Commander): Dana Ruiz · signature ______ · date and time ______"; an empty seat prints the line with a blank for the name. | Clear |
| Get the sitrep to the EOC | The clerk | A Send by email button beside Copy as text on every report; it opens the mail app with the subject "Cedar Fork Flooding · Situation report · OP 1 · … · 18 Oct 2026 00:05" and the whole report in the body. Nothing is sent by the app, and the mail app's own limits may cut a very long body; Copy as text is still there. | Clear |
| The join card | Reyes, the administrator | "Safety: Swift water everywhere south of Mill Street…" and, as its own line, "Bring: PFDs and dry bags for water crews, a radio each, water for the day" from the Period sheet's new What to bring box (carried into the next period, logged like the seats); "Getting there: High school east lot · Units wait here between assignments · for a satnav 30.25560, -97.74000 · directions open from Nearby on your phone once you have checked in". | Clear |

Item 10 of "What to do first" is clear.

**Still bites, small:**

- **A facility has no street address field**, so Getting there gives its notes and the coordinates "for a satnav"; an address line on the facility card would read better on paper. *Built in v48.*
- **Send by email is only as good as the mail app's URL limit**; a report over a few thousand characters may arrive cut short. A true send needs a server, which the app does not have.

---

## Re-walk after v44

Small words and buttons, walked on 2026-10-18 in the same mock, the base at 1280 × 800 as Operations and the phone at 375 × 812 as Rosa (the seeded Unit 2) and as a new shelter desk. The Browser pane was hidden, so the walk read the screens' text; no screenshots.

| Item | Who | What they saw | Verdict |
|---|---|---|---|
| The unit panel | Marcus | Unit 1's panel: the status line, Identity, then the facts (Agency, Head count, Assigned, Standing in, Position, Heading, Last report, Photos, Joined) and only then the Kind chips; the answer to the radio is a screen higher than before. | Clear |
| A closed incident on the picker | The administrator | "closed · Personal records clear by rule on 16 Nov 2026 … · Reopen · Clear now · Keep 30 more days"; Reopen brought the row back to "active" without opening the incident first. | Clear |
| Make a unit | The administrator | A sheet of the app's own, "Unit name for …" with one box and Save, in place of the browser's prompt (pressed by the `members` suite; the seed has nobody to demote by hand). | Clear |
| The deputy on the phone | Rosa | The menu: "DEPUTY IC Chief Al Barnes" under Command; the briefing's Who you work with ends "Deputy Incident Commander: Chief Al Barnes." once the seat is filled. | Clear |
| The boat ramp | Rosa | Nearby's fourth row: "BR · No boat ramp on the map yet · ask Operations where to put in", instead of silence. | Clear |
| The water row | Rosa | One button, "In the water", until she goes in. | Clear |
| A street in Find a person | The desk | "Pecan" lists the three records from Pecan Ln and offers "Ask Operations to look · sends "Looking for someone from Pecan" with your desk's number". | Clear |
| The desk's quick chips | The desk | Message Operations offers Nearly full, Need cots and blankets, Need a nurse, Bus has arrived. | Clear |
| Hours, the licence scan, the check-out, the 207 link | The clerk, Reyes, the IC | Checked by the suites: the Hours table reads "Lt., swift water"; the licence scanner's refusal says "type the licence number"; "Nobody hurt" starts ticked; the 207 warning's "add a deputy" opens the Period sheet. | Clear |

Item 11 of "What to do first" is clear, all but one line: a phone with no camera still says nothing when Take photo is pressed (a file input gives no word; only the Browser pane lacks a camera).

**Still bites, small:**

- **"Bus has arrived" on the desk's chips** is a guess at the words a desk sends most; the desk will say.
- **The deputy on the phone is two lines**, in the menu and the briefing; the home screen's header does not carry it, by design (the IC's name is not there either).

---

## Re-walk after v45

Since you last looked: Dana's "what changed while I was away", walked on 2026-10-18 in the same mock on the base at 1280 × 800, through the `log` suite's steps (the pane was hidden; the words were read from the screen).

| Item | Who | What they saw | Verdict |
|---|---|---|---|
| Coming back to the base | Dana | Above the log's rows: "Since you last looked (00:17): 1 hazard, 1 message · Show them · Seen" once something had come in after the mark; nothing while nothing had. The "Since you looked" chip appears among the filters only then. | Clear |
| Show them | Dana | The log filtered to the new lines, the notable ones first; Seen marks now, clears the line, drops the chip and goes back to All. The mark is kept per device, so it survives closing the laptop. | Clear |
| The pop-out | The clerk | The log alone keeps its own mark and line. | Clear |

Item 12 ("Later") is built. The one left on the list, on scene too long (item 13), was not started.

**Still bites, small:**

- **The line counts, it does not name**: "1 missing person (1 found)" says what, not who; Show them is one press away.
- **The first mark is set when the incident is first drawn on this device**, so the very first "since" is since the base was opened, not since the IC's last look.

---

## Re-walk after v46

The decisions: Grace's four answers, walked on 2026-10-18 in the same mock, the base at 1280 × 800 as Marcus and the phone at 375 × 812 as Unit 3 on A-2 Pecan Mobile Home Park (the pane was hidden; the words were read from the screen).

| Item | Who | What they saw | Verdict |
|---|---|---|---|
| Zone clear with the division half done | Unit 3 | The sheet: "A-2 Pecan Mobile Home Park: 1 of 18 marked. Confirm clear sends the whole division to Operations as primary search complete. Only your part done? My part is done tells Operations and leaves the division open." Under the pass chips, on its own row, "My part is done, not the division"; the foot keeps Cancel and Confirm clear. All of it inside 375 px. | Clear |
| My part is done | Unit 3, Marcus | The toast "Sent to Operations; the division stays open"; on the base, the log and the Messages card: "Unit 3 to Operations: My part of A-2 is done: 1 of 18 marked; the rest is still to search." A-2 stays active. | Clear |
| An act-on-now hazard | Marcus | As at v41: the yellow HAZARD bar until acknowledged, the red slot untouched. The chime (three tones for an emergency, one for an urgent hazard) cannot be heard in the Browser pane; it is Web Audio, no file, and sounds only after the first click on the page, as every browser requires. | Clear, the sound unheard |
| The EOC address | Marcus | Settings: "EOC email address · Send by email on the situation report and the other papers goes to it in one tap; leave it empty to pick the address in the mail app." Saved, the log says "Marcus Bell set the EOC email address to eoc@county.gov" and the situation report's Send by email link starts `mailto:eoc@county.gov?subject=Cedar Fork Flooding · Situation report…`. | Clear |
| Revisit at, on the phone | Unit 3 | The house record's new box: "REVISIT AT (the next crew sees it on the division and the 204)", a time; saved with the notes "on oxygen, wants a nurse", the toast "14 Pecan Ln searched · 1 of 18". | Clear |
| Revisit at, on the base | Marcus | The log: "A-2: 14 Pecan Ln · revisit requested (on oxygen, wants a nurse)"; the division's structure list: "14 Pecan Ln · Searched · 00:51 · revisit 02:51" ("(due)" once the time has passed); the 204's new section "REVISITS · 14 Pecan Ln at 02:51 · on oxygen, wants a nurse". No push alert, as decided. | Clear |

Section 9 of the punchlist (Grace's decisions) is built in full. On scene too long (item 8, Later) is the one item left.

**Still bites, small:**

- **The chime is silent until the first click**: a base opened and left untouched rings nothing for the first emergency; the bars still turn red or yellow at once. *Built in v48.*
- **A revisit is a clock time, not a date**: the phone takes the next such moment, so a time already past today means tomorrow; the 204 says "at 02:51" and the next crew reads it against the day it is on. *Built in v48.*
- **My part is done is a message, not a mark**: the division does not say which part is done; the message's words ("1 of 18 marked") and the structure list are what Operations has.

---

## Re-walk after v47

On scene too long: Priya's job 4, walked on 2026-10-18 after migration 0029 in the same mock, the base at 1280 × 900 as Operations and the phone at 375 × 780 in a frame beside it as Unit 3 (the pane was visible this time; the words were read from the screen and one screenshot of the board taken). The seeded people had been on scene a little under three hours, so the threshold was set to 2 to see it bite.

| Item | Who | What they saw | Verdict |
|---|---|---|---|
| The Period sheet | Priya | Beside "Rotation in the water, minutes (0 = off) · 45" a new box, "Hours on scene before Safety is told (0 = off) · 12", and under both: "Safety's two lines. Past the rotation a crew's phone nudges them out and the base shows the time in orange. Past the hours a person's time on scene is orange on the People board and the unit panel, and the briefing and the situation report name them. Both carry into the next period and print on the 204 and the 208." Set to 2 and saved: the log "Operational period 1: on scene too long past 2 hours". | Clear |
| The People board | Priya | The count line "6 on scene on 3 units · 6 past 2 h on scene"; every row's state in orange on an orange tint: "On scene 2 h 53 min, since 22:23 · past 2 h". | Clear |
| The unit panel | Priya, Marcus | Unit 1's people: "Ramirez Lt. · On scene 2 h 53 min, since 22:23 · past 2 h · with Okafor", orange, the same words as the board. | Clear |
| The briefing | Marcus's relief | "NEEDS ATTENTION Ramirez (Unit 1): 2 h 56 min on scene, past 2 h · Okafor (Unit 1): 2 h 55 min on scene, past 2 h · Nguyen (Unit 2) …", six orange lines, longest first. | Clear |
| The situation report, the 208, the 204 | The clerk, Priya | The sitrep's own section "ON SCENE TOO LONG" with the same six lines; the IAP's 208 "Time in the water: crews out of the water every 45 minutes · Hours on scene: Safety is told past 2 hours on scene" and the six lines; A-1's 204 under Special instructions "Hours on scene: Safety is told past 2 hours on scene". | Clear |
| The next period | Priya | Start period 2: the form carried "2", period 2 holds 2. | Clear |
| The crew's phone | Unit 3 | Nothing pages the crew. Its briefing's Shift card: "This period ends 13:15; the next crew is briefed at staging. Your crew has been on scene 2 h 51 min, past the period's 2 hours: Safety sees it; say when you need relief. Check out from the menu when you leave …", drawn as a warning; under the threshold it says only "Safety is told past 12 hours on scene." | Clear |
| The revisit's clock time (v46 follow-up) | The resident's next crew | Address clear in A-2 as Unit 3: "118 Pecan Ln", refused to leave, notes "on oxygen", Revisit at 03:20, Searched, save. The toast "118 Pecan Ln searched · 1 of 18"; the base's log "A-2: 118 Pecan Ln · revisit at 03:20 (on oxygen)" (the time as the phone typed it, since the server has no time zone) and the division's list "118 Pecan Ln · Searched · refused to leave · 01:20 · revisit 03:20". | Clear |

Item 8 (Later) is built in full, so nothing on the punchlist is left; the Safety Officer's guide marks job 4 built. The next work comes from a new walk.

**Still bites, small:**

- **A person checked out and back in counts from their first check-in**, on the board and in the briefing as in the Hours: a crew back for a second day reads as on scene since the first until Operations removes and re-adds them. Resetting the check-in time on "Back in" was tried and left out, because the Hours and the 211 would lose the earlier stretch; a second stamp for the current stretch is the honest fix, for a later release. *Built in v48.*
- **The phone says it once, in the briefing**: no nudge like the water clock's, by design (Safety's threshold is Safety's to act on), so a crew that never reopens its briefing learns of it from Safety or Operations.
- **A low threshold turns the whole board orange at once**, and the 208 lists everyone past it; with 12 hours that is the end of a long shift and a short list.

---

## Re-walk after v48

Small items from the re-walks: the eight Still bites from the re-walks after v38 to v47, walked on 2026-10-18 after migration 0030 in the same mock, the base at 1280 × 900 as Operations and the phone at 375 × 780 in a frame beside it as Unit 3 (the pane was visible; the words were read from the screen).

| Item | Who | What they saw | Verdict |
|---|---|---|---|
| They're all found, on the base | Rosa's Operations | Two names missing on one answer: the bar reads "MISSING · Hale (Unit 3) · 01:56 · 0 accounted for · Found · They're all found" and the same for Dominguez. One press on They're all found: both lines gone, the log "Hale, Dominguez found, reported by Operations", starred as notable. | Clear |
| They're all found, on the phone | Rosa | The card "REPORTED MISSING AT 01:56 · Hale Found · Dominguez Found · They're all found"; one tap, the toast "Everyone marked found", the log "Hale, Dominguez found, reported by Unit 3". | Clear |
| The front door | The newcomer, the IC | "Sign in, or create an account with any email and a password. Whoever opens an incident is its Operations and decides who else runs the base, with the Operations code on the home panel; field units join with the six-letter code instead." | Clear |
| A street address on a facility | Reyes, the IC | The staging card: "ADDRESS 1200 Mill St, east lot" above the position, a Street address box with "Getting there on the join card and the 204's Where to go read it before the coordinates". The join card: "Getting there: High school east lot · 1200 Mill St, east lot · Units wait here between assignments · for a satnav 30.25560, -97.74000 …"; A-1's 204: "Staging area: High school east lot · 1200 Mill St, east lot · CMD 1"; the hurt card's hospital line gives "1500 Red River St." after the distance. | Clear |
| The softer urgency words | Priya | Hazards open: "Gas smell · Blocks further operations · B-2 · Unit 3" first, "Downed power line · across the lane · Before nightfall" second, the seeded line with no word last; B-2's panel chips "Hazard · Gas smell · Blocks further operations · Unit 3 at 01:56 · Resolved". | Clear |
| Operations' acknowledgement on the phone | Moreno | A new card under the home screen: "YOUR HAZARDS · 01:56 · Tree down, road blocked · A-2 · waiting for Operations to acknowledge"; when the base pressed Acknowledge, the line turned green "acknowledged by Operations 01:56" and the toast said "Operations acknowledged your hazard: tree down, road blocked in A-2 at 01:56". Hazards sent without "act on now" read "sent to Operations". | Clear |
| A revisit already past today | The resident's next crew | Under the Revisit at box: "Today at 22:56." for a time still ahead, "That is tomorrow 00:27; the next crew sees it on the division and the 204." for a time ninety minutes past; saved, the log "A-2: 122 Pecan Ln · revisit at 22:56 (gas off at the meter)" or "revisit tomorrow at 06:00 (gas off)", the division's list "revisit 22:56" or "revisit tomorrow 06:00". | Clear |
| The chime's first click | The IC | The bar's quiet line: "No emergency open · no safety message or PAR waiting on an answer · click anywhere once so the base can ring"; the words stay until a real click or key, since a script's event cannot unlock the browser's sound. | Clear |
| The current stretch | Priya, Finance | Nguyen checked out and back in: the board "On scene 0 min, since 01:56 · back in" (the check-in 23:07 unchanged); the 211 "Nguyen, Capt. · swift water, boat · checked in 23:07 · on scene 2 h 49 min", every stretch as before. | Clear |

Nothing from the Still bites lists after v38 to v47 is left open, except the ones recorded there as by design.

**Still bites, small:**

- **They're all found is one line, one answer**: two units each reporting someone missing need a press each; the words name the unit.
- **The address is one line of free text**: nothing checks it or maps it; the coordinates still drive Directions.
- **The chime's note stays for a base that was opened and never touched**, which is the case it is for; on a base in use it goes at the first click and never returns.
- **Your hazards keeps three hours**: an older hazard still open is on the base's list and the map, not on the phone's card.

---

## Walk at v48: best we can do

Every persona in `docs/personas.md` walked through the app again on 2026-10-18 at v48 (commit 84a18c4), with the same question for each job: is this the best we can do for this person? The mock (`?mock`) with the seeded Cedar Fork Flooding, the base at 1280 × 800 as Operations, the phone at 375 × 812 in a frame beside it, one phone handed from person to person (Unit 3, Ana as Unit 1, Rosa as Unit 2, Reyes, Moreno, the shelter desk, the newcomer). The walk read the screens' text and drove them through their own buttons, with the pane visible for most of it; the camera is blocked in the pane and the pretend GPS stands every phone in A-2. The mock's clock stood at 01:58 when the walk began; the seed's period reads "22:48 to 19:00" (its start is three hours before the clock and its planned end a fixed 19:00, so the header does not say overdue; a seed artefact, not a finding).

Severity as before: **LOST** = could not finish the job; **SLOWED** = finished after a wrong turn; **PUZZLED** = finished, but a word or layout meant nothing to them; **Clear** = the job went through without a wrong turn. The last column is the best version of that screen for that person, in one line, which is what the ranked list at the end is made from. Each section opens with what the eleven releases since v37 (v38 to v48) changed for that person, read with fresh eyes.

### 13. The newcomer at the check-in table

**Since v37:** the sign-in screen says the code is ready and that any email makes an account (v39); the code's sentence sits on the form; "Your unit" says a name will do; a Volunteer kind; the people rows fold for someone alone; the home screen of a unit with no division is its own (v42); the hazard sheet chooses nothing for her and has a tree-down kind (v41); the front door's sign-in card no longer promises an agency account (v48).

| Job | What they saw | Severity | The best version |
|---|---|---|---|
| Find where to start | The front door at 375 wide: "Part of an incident right now? Enter the six-letter join code from your join card, from Operations' screen or from another unit's phone. It opens the field app on this phone with the code filled in; you check in with your name and your unit." The code box 286 px from the top; "No code? It is on the join card at the check-in table and on the screen at the base …". A five-letter code: "A join code is six letters and numbers, like CEDAR7. It never has 0, O, 1 or I." The sign-in card ("Running the base? Sign in, or create an account with any email and a password. Whoever opens an incident is its Operations …") is 2,606 px down a 3,640 px page, where a phone in a volunteer's hand does not need it. | Clear | As it is. |
| Get in with the code | "Code CEDAR7 is ready. Sign in below, or make an account with any email and a password: it takes a minute, and only this incident's Operations sees who you are." Sign in and Create account side by side. | Clear | As it is. |
| Say who she is | Create account → Identify yourself over the form: "Once per account. Operations on any incident you check in to sees who is behind the unit; nobody else does … No licence at all? Save with your name and phone. Operations sees "identity not given" beside your unit and checks who you are in person." Name and phone, Save → "Saved without a licence. Operations will check who you are in person." | Clear | As it is. |
| Check in | "Checking in as Kim Tran · 512 555 0190 · identity not given: Operations checks who you are in person · Add a licence"; the code CEDAR7 filled in with "Code CEDAR7 came with the link. Name your unit and check in."; "Your unit" placeholder "Engine 3, Boat 1, or your name" with "Your callsign; if you are on your own, your own name will do."; a Volunteer chip; the people rows folded. She typed Volunteer 4, pressed Volunteer, left "How many with you, including you?" empty, and checked in. On the base: "Volunteer 4, volunteer · head count unknown · Kim Tran · no ID · Available since 02:16 · no position yet", and her briefing said "On Volunteer 4: nobody listed yet; add your people from the menu." | PUZZLED | The count box starts at 1 for a new unit (it says "including you"), so a volunteer alone who skips it is one person, not "head count unknown" in orange, and her briefing says "you alone". |
| Know what to do now | "YOUR ASSIGNMENT No assignment yet · Operations assigns divisions from the base. Stay where Operations put you. From here you can take a photo, report a hazard, message Operations or call for help. You are standing in A-2, Unit 3's division." with Take photo · Report hazard · Message Operations · Need help now. | Clear | As it is. |
| Her first report | Report hazard: nothing chosen, Send waiting; "Tree down, road blocked" one tap, a note, Send → "Hazard sent"; her home "YOUR HAZARDS 02:16 · Tree down, road blocked · A-2 · sent to Operations"; the base's log "Hazard in A-2: tree down, road blocked (Across Pecan Ln), reported by Volunteer 4". | Clear | As it is. |

### 8. Capt. Reyes, mutual-aid captain

**Since v37:** the scan's refusal says "type the licence number" (v44); the check-in form's words for a callsign (v39); a division reads Assigned until he accepts (v42); the join card tells Safety and Bring apart and gives the staging area's address (v43, v48); "Nobody hurt" ticked by default on the check-out (v44); his 204's Where to go carries the address (v48).

| Job | What they saw | Severity | The best version |
|---|---|---|---|
| Check in at staging | A new account (the sign-up wants a password of eight characters; the red line says so). Identify yourself with "Scan the back of your licence · Photo of the front · No licence to hand? Type its number"; saved with name and phone. The form: "Checking in as Ray Reyes · 830 555 0177 · identity not given: Operations checks who you are in person · Add a licence"; Brush 12, Bandera County FD, Engine, count 2 unfolded two rows (Name, Rank or role, the eight qualification chips). | Clear | As it is. |
| On the base | "Brush 12, engine · Reyes, Ortiz · 2 · Ray Reyes · no ID · Available since 02:09 · live, S 170°"; the log "Brush 12, engine checked in as Ray Reyes, 830 555 0177, identity not given with 2 people". | Clear | As it is. |
| His briefing | Situation (the crest, the bridge, "6 divisions, 4 units, 1 cleared", the hazards open), "YOUR JOB No assignment yet … if you have nowhere yet, staging is High school east lot", "On Brush 12: Reyes, Ortiz (EMT). Next door: Unit 3 in A-2 …", Work area, "RADIO No division channel set; use the plan. Command on CMD 1. Emergency traffic on TAC 9.", Supplies, "SHIFT This period ends 19:00; the next crew is briefed at staging. Safety is told past 12 hours on scene …", Safety and PPE. | Clear | As it is. |
| Hospital and staging | Nearby: staging 0.8 mi · CMD 1, the gym, Dell Seton, each with Directions; "If someone is hurt · Medic: Ortiz, EMT". | Clear | As it is. |
| Get released | Check out: "Demobilization. Tick what is done; what is not ticked goes to Operations with your check-out … The time on scene is already counted." Six lines, five ticked for him (people accounted for, no division, the one hazard he reported, "Nobody hurt, no equipment damaged", "Hours confirmed Brush 12 on scene 02:09 to now"); "Radio and equipment returned to Logistics" left for him to tick; "1 item not ticked …" → "Checked out". The log: "Brush 12 checked out · not done: radio and equipment returned to Logistics". Back on the check-in page: "Incidents you are already in · Cedar Fork Flooding · … · you are Brush 12". | Clear, one odd word | The row of an incident he has checked out of says so: "you were Brush 12 · checked out 02:10". |

### 10. The shelter desk volunteer

**Since v37:** her briefing names her shelter as her work area and no longer tells her to add people or wait at staging (v42); the street search asks for "someone from Pecan" (v44); her Message Operations chips are her own (v44).

| Job | What they saw | Severity | The best version |
|---|---|---|---|
| Know her job | "YOUR JOB People here at High school gym. Sign in everyone who arrives: who, how many, their needs … Now: 9 of 60 beds, 1 record on the way, expected Bus 2 from Pecan Park, 12 people, 17:30." "On Gym desk: you alone." "WORK AREA High school gym · Red Cross on site, pets in the ag barn. It is on the map." Home: "People here · High school gym · 9 of 60 · 3 records · 1 oxygen · 1 infant · 1 pets · expected: Bus 2 …", Find a person, "ARRIVING FROM CREWS · SIGN THEM IN, NOT AGAIN · family of 4 from 112 Pecan Ln · Unit 3, 01:44 · pets · wet, cold, a dog · They're here", Sign in a person, "HERE NOW · 9 PEOPLE IN 3 RECORDS, NEWEST FIRST". The division card, the search buttons and the mini map gone. | Clear | As it is. |
| Sign in a family | "WHO · HOW MANY · NEEDS Oxygen Insulin Wheelchair Infant Pets Other · FROM · WHERE NOW Here, High school gym / Dell Seton (hospital) / With family / Own transport / Not known · NOTE · Only "Who" is needed … Names are seen by this incident's members only, never in anything public." "Garcia family of 3" set the count to 3 by itself; insulin and pets; "Garcia family of 3 signed in"; the header "12 of 60 · 4 records · 1 oxygen · 1 insulin · 1 infant · 2 pets". | Clear | As it is. |
| Is my mother here | "Alvarez" → "Maria Alvarez, 78 · oxygen · Dell Seton Medical Center since 01:44 · from 112 Pecan Ln · Not listed? Ask Operations to look"; "Pecan" → three records and "Looking for someone from Pecan". | Clear | As it is. |
| We are nearly full | The chips Nearly full · Need cots and blankets · Need a nurse · Bus has arrived. | Clear | As it is. |

### 9. Dep. Luis Moreno, deputy at a closed bridge

**Since v37:** the hazard sheet has "Person or car in the water", chooses nothing for him, and takes the four urgency words, an act-on-now hazard waiting on the base's bar until acknowledged (v41); his phone now shows Operations' acknowledgement (v48); the people rows fold and the briefing says "you alone" (v39, v42).

| Job | What they saw | Severity | The best version |
|---|---|---|---|
| Check in alone | SO 14, Cedar County Sheriff's Office, Other, count 1: the people rows stayed folded. Briefing: "No assignment yet …", "On SO 14: you alone.", "WORK AREA Where you stand is on the map. Staging …", "SHIFT This period ends 19:00 … Safety is told past 12 hours on scene." Home: "No assignment yet …" with Take photo · Report hazard · Message Operations · Need help now. | Clear | As it is. |
| Car in the water, right here | Report hazard: "Pinned where you stand, 30.26723, -97.73832, zone A-2. Operations sees it at once."; eight kinds, nothing chosen, Send waiting; Person or car in the water + Act on now + a note → "Hazard sent, act on now: Operations will acknowledge"; home "YOUR HAZARDS 02:10 · Person or car in the water · A-2 · waiting for Operations to acknowledge". The base's bar: "HAZARD · Person or car in the water, Car in the water at the bridge, one person inside · A-2 · 02:10 · SO 14 · Acknowledge · Show on map". Acknowledged: the toast "Operations acknowledged your hazard: person or car in the water in A-2 at 02:11" and the card "acknowledged by Operations 02:11". Two taps and a note. | Clear | As it is; the bar's words still repeat the kind when the note restates it ("Person or car in the water, Car in the water …"): the note alone when it starts with the kind's words. |
| Answer the head count | "PAR: is everyone accounted for? · People with you − 1 + · All accounted for · Missing someone" → "All 1 accounted for, sent"; the base "PAR · 1 of 4 answered". | Clear | As it is. |
| The road is closed | Message Operations: the urgency words, "Need more hands / Water rising here / Road blocked / Done here, what next?", "Attach my location" (the frame's pretend GPS had no fix yet, so no pin this time; the app says "No GPS fix yet"); Send → the inbox "You to Operations · Road closed at the Mill Street bridge, water over the deck · Waiting on Operations"; the base's log line. | Clear | As it is. |
| When can I stand down | "MESSAGE FROM OPERATIONS 02:11 Operations to SO 14 You are released. Return to staging … Copy · Will do · Cannot" → Will do → the card gone. | Clear | As it is. |

### 4. Rosa Alvarez, swift-water boat operator

**Since v37:** one head count at a time and Found, by name or all at once (v38, v48); Nearby says there is no boat ramp yet (v44); the water row is one button until she is in (v44); the house record's Save stays on screen (v42); the shelter desk sees the people she sends.

| Job | What they saw | Severity | The best version |
|---|---|---|---|
| Open her incident | "Incidents you are already in · Cedar Fork Flooding · OP 1 · 07:00 to 19:00 · you are Unit 2" (the typed label, by decision), one tap; the takeover "Safety message and head count" with one PAR card: "CHECKED IN WITH YOU Nguyen, Patel · All 2 accounted for · Someone's missing" and the safety message's Acknowledge, one tap each. | Clear | As it is. |
| Where is the boat ramp | Nearby: staging, the gym, Dell Seton with Directions, and "BR No boat ramp on the map yet · ask Operations where to put in"; "Medic: Patel, EMT". | Clear | As it is. |
| Time in the water | "In the water" → "In the water 0 min · rotation 45 min · Out of the water" → "Out of the water after 0 min". | Clear | As it is. |
| Her people | "PEOPLE ON THE UNIT · 2 on the unit. Operations counts them from here. · Nguyen Capt. swift water, boat · since 23:10 · 2 h 54 min on scene · with Patel · Edit · Check out …", the chips, Add to the unit. | Clear | As it is. |
| Log who we pulled out | Address clear → "Add who and where they went" → a row "Who: a name, or "family of 4" · Condition: on oxygen, stable · Went to High school gym (shelter) / Went to Dell Seton Medical Center (hospital) / With family / Own transport / Not known"; "Each row is a person or a family; the shelter desk sees them coming." Save on screen. | Clear | As it is. |
| Someone is missing, then found | Walked in the re-walks after v38 and v48: Someone's missing → tick → the alert; Found per name, or "They're all found" when both of her boat were out of contact. | Clear | As it is. |
| Need help now, her assignment | "WILL BE SENT · UNIT Unit 2 · Nguyen, Patel · ZONE B-1 · POSITION · TIME · Cancel · Send alert"; "YOUR ZONE B-1 · Mill Street bridge approach · Priority 2 · 15 structures · In progress · 2 of 15 · Hold the bridge approach closed … · Radio TAC 3 · Objective 2". | Clear | As it is. |

### 2. Marcus Bell, Operations Section Chief

**Since v37:** a division reads Assigned until the unit accepts (v42); one PAR at a time (v38); the unit panel puts the status line first (v44); Since you last looked (v45); Hazards open in urgency order (v48); the chime for an emergency or an urgent hazard (v46).

| Job | What they saw | Severity | The best version |
|---|---|---|---|
| Draw a division | "Click the map to outline the division, then press Finish." with Draw boundary · Draw division · Finish · Remove last point · Cancel · Layers on one row. | Clear | As it is. |
| Assign and move a unit | B-2: "ASSIGNED TO Unit 1 Unit 2 Unit 3"; a press → "Assigned, not accepted · Unit 2 · 0 of 9 · objective 2"; a second press → "Not started · 9 structures", the log "B-2 released from Unit 2". | Clear | As it is. |
| Photos as they come | "Photo · Unit 3 · 01:46 · Facing S 180° · TAKEN BY Unit 3 · TIME 18 Oct 2026 01:46 · ZONE A-2 · Pecan Mobile Home Park · POSITION · NOTE Blocked access · PUBLIC Not public · Show on map · Open full size · Clear for public information". | Clear | As it is. |
| Run a PAR | "PAR · 0 of 3 answered · waiting on 3 units · started 02:01 to everyone (just now)"; the panel "Started 02:01 to everyone · 3 still to answer · Unit 1 waiting, sent just now …". | Clear | As it is. |
| Answer the radio | Unit 1's panel: the title "Unit 1, engine · Ramirez, Okafor", "Assigned to A-1 since 23:18", then IDENTITY in full ("Verified 23:13 · NAME Ana Ramirez · PHONE 512 555 0111 · LICENCE TX ···3746 · expires 2029-06-30 · read from the barcode · BORN 1986-06-30 · ADDRESS 22 Hill St, Cedar Fork, TX 78700 · Withdraw verification"), then her request, the water clock, Set status, and only then "AGENCY · HEAD COUNT 2 · ASSIGNED A-1 · STANDING IN A-1 · POSITION 30.26810, -97.73180 · HEADING E 095° · LAST REPORT 3 min". The answer to "where is Unit 1" is under a screen of identity, and the licence, the date of birth and the home address are in front of Operations on every open. | PUZZLED | Identity as one line ("Verified 23:13 · Ana Ramirez · 512 555 0111 · licence on file") with the details a press away; where the unit is, what it is on and its last report right under the title. |
| Hand the map to the relief | The Period sheet's "SHIFT CHANGE Briefing · Start period 2", Pop out, Since you last looked. | Clear | As it is. |

### 1. Dana Ruiz, Incident Commander

**Since v37:** an overdue period says so (v40); the IAP's signature lines (v43); times in one form (v40); Since you last looked (v45); the hazards count on the header (v41); the Deputy and the 207's advice (v31, v44).

| Job | What they saw | Severity | The best version |
|---|---|---|---|
| Thirty seconds | Header "OP 1 · 22:48 to 19:00, IC Dana Ruiz · Base: Cedar Fork High School · 3 units · 6 divisions, 1 cleared · 1 hazard open"; the bar "No emergency open · no safety message or PAR waiting on an answer · click anywhere once so the base can ring"; the legend's counts; "Since you last looked (01:53): 1 line by Operations, 1 note · Show them · Seen". | Clear | As it is. |
| Sign the IAP | "Prepared 18 Oct 2026 01:59 · Prepared by (Planning Section Chief): Theresa Okafor · signature · Approved by (Incident Commander): Dana Ruiz · signature · date and time"; 202, 203, 207, six 204s, 205, 206, 208, Facilities; Copy as text · Send by email · Print · Close. | Clear | As it is. |
| Brief the shift change | Incident, Safety message and notes, Objectives, Divisions, Resources, Hazards still open, Facilities, Communications, Needs attention ("Nothing outstanding"), Log of this period. | Clear | As it is. |
| Unified command, transfer | The Period sheet with fifteen seats and boxes; "COMMAND Dana Ruiz · since 22:49"; a changed name asks "Transfer command from Dana Ruiz to County Chief Ortega? ICS-100: a transfer of command always requires a full briefing … Tell everyone in the field … Open the briefing for the handover … Start a new op…". | Clear | As it is. |
| Who is in which seat | The 207, no warning at this span. | Clear | As it is. |
| What changed while I was away | The Since line and the "Since you looked 2" chip. | Clear | As it is. |

### 3. Lt. Ana Ramirez, unit lead on foot

**Since v37:** one PAR card (v38); the Accept card retires and Assigned comes before In progress (v42); Save on screen (v42); Zone clear says what it sends and offers "My part is done" (v46); a revisit time with "tomorrow" (v46, v48).

| Job | What they saw | Severity | The best version |
|---|---|---|---|
| Open her incident | "Incidents you are already in · Cedar Fork Flooding · OP 1 · 07:00 to 19:00 · you are Unit 1", one tap; the takeover with one PAR card ("CHECKED IN WITH YOU Ramirez, Okafor · All 2 accounted for") and the safety message, one tap each; "All 2 accounted for, sent". | Clear | As it is. |
| Her home | "YOUR ZONE A-1 · Riverside Drive, east · Priority 1 · 24 structures · In progress · 9 of 24 structures cleared · Primary search of every structure … · Stay out of moving water … · Radio TAC 2 · Supervisor Lt. Okafor · Objective 1 …"; Take photo · Address clear · Zone clear · Report hazard · Need help now; Nearby with "Medic: Okafor, paramedic"; "Last sent 02:04 · GPS ±6 m · S 183°". | Clear | As it is. |
| Address clear | "A-2 · 30.26744, -97.73839. Save marks it searched and counts it for the zone." (the pretend GPS stands her in A-2; the record files under where she stands), the occupants, people needing help with "Add who and where they went", water, damage, hazards, notes, "REVISIT AT (the next crew sees it on the division and the 204)", Cancel · Searched, save on screen. | Clear | As it is. |
| Zone clear | "Finish the search of A-1 · A-1 Riverside Drive, east: 9 of 24 marked. Confirm clear sends the whole division to Operations as primary search complete. Only your part done? My part is done tells Operations and leaves the division open." the pass chips, people found, hazards, the marking "02:04 U1 none 0", "My part is done, not the division", Cancel · Confirm clear. | Clear | As it is. |
| Mayday | "Sends an emergency alert to Operations with your live location and your zone. Every unit on the incident sees it. WILL BE SENT UNIT Unit 1 · Ramirez, Okafor · ZONE A-1 · POSITION · TIME 02:04 · Cancel · Send alert". | Clear | As it is. |
| Take photo | The pane has no camera; not walked, as before. | — | — |

### 5. Priya Natarajan, Safety Officer

**Since v37:** hazards carry an urgency, an act-on-now one waits on the bar, Hazards open on the home panel (v41), in urgency order with the word on the division's chip (v48); on scene too long (v47).

| Job | What they saw | Severity | The best version |
|---|---|---|---|
| A safety message | The composer: Everyone in the field / the divisions / the units, the Safety tick, chips Hold where you are · Return to staging · PAR · You are released; sent → "SAFETY · Walk test: nobody enters moving water · waiting on 3 units · sent 02:01 by Operations". | Clear | As it is. |
| Who has not acknowledged | The bar, and Messages "Waiting on Unit 1, Unit 2, Unit 3". | Clear | As it is. |
| Hazards as they come in | "HAZARDS OPEN · 1 · 01:38 Downed power line · Line across the park entrance · A-2 · Unit 3 · Show on map · Resolved", the triangle, A-2's chip "Hazard · Downed power line · Line across the park entrance · Unit 3 at 01:38 · Resolved"; later SO 14's car in the water on the bar with Acknowledge. | Clear | As it is. |
| On scene too long | The Period sheet's "Hours on scene before Safety is told (0 = off) · 12" beside the rotation; the board "6 on scene on 3 units", rows "On scene 2 h 53 min, since 23:08". | Clear | As it is. |
| The period's safety message and rotation | "Swift water everywhere south of Mill Street. Nobody enters moving water. PAR on the hour.", rotation 45, and "Safety's two lines …". | Clear | As it is. |

### 6. The Documentation Unit

**Since v37:** the 214's prepared line in the app's form (v40); Send by email with the EOC address (v43, v46); the Hours table's qualification words (v44); the 211 and the Hours keep every stretch while the board counts the current one (v48).

| Job | What they saw | Severity | The best version |
|---|---|---|---|
| Print the 214 | "ACTIVITY LOG, ICS 214 · … · Prepared by Operations, 18 Oct 2026 02:02 · 2 NOTABLE ENTRIES (★) · 77 ENTRIES, OLDEST FIRST". | Clear | As it is. |
| Print the 211 | "Checked in by Ana Ramirez, 512 555 0111, licence TX ···3746, verified · Ramirez, Lt. · swift water, EMT · checked in 23:08 · on scene 2 h 54 min · with Okafor …". | Clear | As it is. |
| The situation report | The boxes "Situation, what happened and where it stands · Resources needed · Outlook for the next period · Save the words"; the assembled 209; Send by email ("mailto:?subject=Cedar Fork Flooding · Situation report …", to the EOC address once Settings holds one). | Clear | As it is. |
| Replay | "Play · 00:58 · Last hour · This period · Whole incident · 10× 60× 600× · 3 units on the map · 00:58 Operations to everyone: Shelter is open …". | Clear | As it is. |
| Who said what | "Find in the log" → "Bus barn" → "01:16 A-3: Bus barn · water waist deep · major damage · hazards ELEC · Open structure". | Clear | As it is. |
| Hours | "Period Operational period 1 · 22:48, open · Whole incident · Export CSV · People hours 17.19 across 6 people, 6 still on scene · unit hours 8.6 across 3 units · By agency …". | Clear | As it is. |

### 7. The Public Information Officer

**Since v37:** the public set is checked photos only, with captions and the time and place (v28); the 209's last section names her; otherwise unchanged.

| Job | What they saw | Severity | The best version |
|---|---|---|---|
| Which photos are cleared | Public information at the foot of the home panel, about 4,250 px down, after the codes, resources, the PAR, requests, hazards, the composer, messages, facilities, people sheltered, channels and agencies: "1 photo cleared for the public, 0 checked (no face, no plate, no house number) … Download the public set · 0 of 1; the rest wait for a check · 01:08 · Unit 1 · A-1 · not checked · no public caption". The same scroll as at v37. | PUZZLED | A Public button on the header beside People, opening the section as its own page: the cleared photos with their captions and checks, Download the public set, who is PIO. |
| Check one | The photo's panel: "PUBLIC Not public · Show on map · Open full size · Clear for public information"; cleared, the caption box and Checked. | Clear | As it is. |
| Am I named, who is in charge | The 203 "Public Information Officer: Lena Marsh"; "AGENCIES ON SCENE Cedar Fork Fire Department (lead) 2 units · 4 people · Travis County Rescue · Sam Whitaker, 512 555 0150 · 1 unit · 2 people". | Clear | As it is. |

### 11. The agency administrator

**Since v37:** Reopen on the picker's closed row and the clearing date in the app's form (v44, v40); Make a unit asks in a sheet (v44); the EOC address in Settings (v46); the front door's words (v48).

| Job | What they saw | Severity | The best version |
|---|---|---|---|
| Who is a member | "4 members · 1 Operations · The six-letter join code makes a unit; the Operations code on the home panel makes Operations. Removing a member keeps everything they sent and can be undone here." Each with role, licence state, Open · Make Operations · Remove. | Clear | As it is. |
| The two codes | CEDAR7 with Copy · Print a join card · Copy the link; MR7KQ2VD with Copy · New code and "Whoever joins with this code is Operations … Give it by radio or phone, never on paper". | Clear | As it is. |
| Settings | Google Maps browser key (Test), Personal records clear by rule, Default rotation in the water, EOC email address. | Clear | As it is. |
| Close and clear | "Closing ends the incident for every phone and starts the 30 days after which its personal records clear by rule. · Close incident" (the picker's row and Reopen walked at v44). The home panel's INCIDENT block reads "PERIOD OP 1 · 07:00 to 19:00" (the typed label, kept by decision) while the header reads "22:48 to 19:00". | Clear, one seed oddity | As it is; the two readings are the seed's. |

### 12. The resident who refused to leave

Not a user. The house record carries "Refused to leave", the people needing help, the hazards, the marking, "Notes for the next crew", and since v46 a revisit time: "118 Pecan Ln · Searched · refused to leave · 01:20 · revisit 03:20" on the division's list and the 204's Revisits, "revisit at 03:20 (on oxygen)" in the 214, "tomorrow 06:00" when the time has passed (v48). The next crew sees it on the division and the 204; nothing pages anyone, as decided.

### What to do first

Ranked by how many personas it serves and how badly it bites, each with the smallest change that would do it. Nothing on this walk was LOST or SLOWED; the three PUZZLED items are small.

1. **The unit panel: where it is first, identity folded.** Marcus, and every unit's privacy. The licence tail, the date of birth and the home address of every unit lead are in front of Operations on every open, above where the unit is. *Smallest change:* the facts (assigned, standing in, position, heading, last report) right under the status line; identity as one line ("Verified 23:13 · Ana Ramirez · 512 555 0111 · licence on file") with the details, the photo and Withdraw verification a press away. Small.
2. **The check-in count starts at one.** The newcomer, Moreno, Reyes, any unit alone. "How many with you, including you?" left empty makes the unit "head count unknown" in orange on the base and tells a lone volunteer to add her people. *Smallest change:* the box starts at 1 for a new unit; a typed number stands; names raise it as now. Small.
3. **A Public page for the PIO.** The PIO. Public information is 4,000 px down Operations' home panel, the same as at v37. *Smallest change:* a Public button on the header beside People that opens the section as its own page (the cleared photos with captions and checks, Download the public set, who is PIO), the section staying where it is for Operations. Small to medium.
4. **Small words.** The bar's hazard item repeats the kind when the note restates it ("Person or car in the water, Car in the water …"): the note alone when it starts with the kind's words (Moreno, Priya). The check-in page's row for an incident a unit has checked out of says "you were Brush 12 · checked out 02:10" (Reyes). One release with whatever else comes up.

**Seen by the walker, not a persona:** the seed's period reads "22:48 to 19:00" (its start three hours before the clock, its planned end a fixed 19:00), so the header never says overdue in a late-night walk; the mock's pretend GPS takes about twenty seconds to give a new phone its first fix, so "Attach my location" says "No GPS fix yet" for a unit that has just checked in; a hazard sent by a unit that then checks out stays on the bar until acknowledged, which is right.
