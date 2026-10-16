# Roadmap: bringing the Incident Command System into clickEMT

What the app has: an incident with a boundary, zones (ICS calls them Divisions) with priorities and
assignments, units reporting position, photos that know which way they face, hazards, clear with the
painted search marking, the activity log (ICS 214) written by the database, and the emergency alert
(ICS emergency traffic). Everything below is added in slices, each one a migration, its mirror in
the mock, the data module, both views, smoke checks, a version bump and a commit. After each slice:
look at it whole, in the code and in the mock, and improve it before moving on.

Ticked when it is on `main`.

## 1. Messages with acknowledgement (ICS 213, safety messages)

- [x] `ic_messages` (from, to one unit / the unit in a zone / everyone, kind message | safety | par, text) and `ic_message_acks` (who, when, the reply). Recipients are fixed when the message is sent.
- [x] Base: a composer on the home panel, the unit panel and the zone panel; a list of recent messages with who has and has not acknowledged; a safety message (stop work, pull back, evacuate) stays on a yellow bar until every recipient has acknowledged.
- [x] Field: an inbox with an unread badge; one-tap acknowledgement with a reply (Copy, Will do, Cannot); a safety message takes over the screen until acknowledged; the unit can message Operations with quick chips or text.
- [x] Log: every message and acknowledgement is a line in the ICS 214, safety messages marked.

## 2. Accountability (resource status, check-out, PAR)

- [x] `ic_members.status` as ICS names it: assigned, available (at staging), out of service (with a reason), checked out; `crew_count`; `agency`. Assigning a zone makes a unit assigned; releasing or clearing its last zone makes it available; checking out gives its zones back. Every change is a status line in the log.
- [x] Field: set your status from the menu; change the head count; check out at the end of the shift. Check-in asks for the head count and the agency.
- [x] Base: units grouped by status (the T-card board) with the people in the field; Operations can set a unit's status, with a reason for out of service, and check it out.
- [x] PAR, the Personnel Accountability Report: one button on the base sends a PAR to everyone, a division or one unit; each unit answers with one tap, all accounted for with a head count, or missing someone, which raises an alert; the base shows who has not answered and for how long, and a missing report stays on the bar.

## 3. Operational periods and objectives (ICS 202, transfer of command)

- [x] `ic_periods` (number, start, planned end, Incident Commander, Operations Section Chief, Safety Officer, notes) and `ic_objectives` (per period, numbered, text, done). A zone can point at the objective it serves, which is what its priority means. A new incident opens in period 1.
- [x] Base: the period and the IC in the header; a Period panel with the command names, the period's safety message, its objectives (add, tick done) and the zones each serves; Start next period closes the old one and carries open objectives forward, moving the zones with them. The phone shows the objective its zone serves and the period's notes.
- [x] The shift-change briefing, assembled from the data: incident and command, the safety message, objectives and their state, every zone's state, resources by status, hazards still open, what needs attention, the log of the period. Printable, and copied as plain text for radio or email.

## 4. The Division assignment (ICS 204) and ICS vocabulary

- [x] `ic_zones`: work assignment (what to do, in words), special instructions, radio channel, division supervisor. A change is logged.
- [x] Base: those fields on the zone panel; Print the 204 for a division: the division and its objective, supervisor and channel, resources assigned, the work assignment, special instructions with the period's safety message, known hazards, progress. Printable or copied as text. The phone shows its division's words, channel and supervisor on the card.
- [x] Vocabulary: the base says Division (with a hint), Assigned, Available, Out of service, Operational period, Check-in; the log says Division. The field app stays plain. (The map is not yet on the printed 204.)

## 5. Primary and secondary search, and structure records

- [x] Zone status gains the search pass: not started, in progress, primary complete, secondary complete. Two shades of green on the map. "Zone clear" from the field asks which pass is done; a finished pass frees the unit. The base can finish a pass or reopen.
- [x] `ic_structures`: one record per address the field touches: where, searched by whom and when, occupants (evacuated, sheltering in place, refused, none, unknown), people needing help, water depth, damage class (affected, minor, major, destroyed), hazards, the marking painted, notes. Address clear opens the record at the unit's position; a structure Operations placed is tapped on the mini map. A notable one is logged with its details.
- [x] Base: structure dots on the map colored by state, red-ringed when people need help; Place structures puts the ones Operations knows about into a division; the zone's progress counts records once it has them; a structure panel edits the record. (Waterline height is not recorded yet, only depth.)

## 6. Facilities and the communications plan (ICS 205, 206)

- [x] `ic_facilities`: command post, staging area, base, shelter, point of distribution, hospital, helispot; placed by clicking the map; each with notes and a contact; closed and reopened, never deleted; every change logged. Lettered marks on both maps.
- [x] `ic_incidents.channels`: the communications plan, which channel for command, tactical per division, emergency; edited on the base, on the briefing, the 204 and the phone's menu.
- [x] Field: the nearest staging area, shelter and hospital under the mini map, with the distance and directions in the phone's own maps app; the division's channel on the card.

## 7. Situation report (ICS 209) and the printed IAP

- [x] A one-screen situation report assembled from the data: period, the situation in words, divisions by state, structures searched, people needing help, sheltering and refused, damage, hazards and emergencies open, objectives, resources by status and agency, resources needed, the outlook, facilities. The words live on the period and are edited above the report. Copy as text or print; sending to an EOC is copy and paste for now.
- [x] Print the Incident Action Plan: objectives (202), organization (203), every division's 204, communications (205), medical (206), the safety message (208), facilities. (No map on the print yet.)

## 8. Agencies, public information, replay

- [x] Mutual aid: an agency on every unit and on the incident (`ic_incidents.lead_agency`); the period names the unified command (`ic_periods.unified`); the base, the briefing, the situation report and the IAP's 203 say who is in charge and who is on scene from where.
- [x] A public-safe flag on photos for the Public Information Officer (`ic_photos.public_ok`, ops only, logged); nothing is public by default. The home panel lists the cleared set; the situation report counts it.
- [x] `ic_tracks`: every position a unit reports, written by a trigger; `ic_replay` thins it to one sample per unit per step, and the base's Replay bar plays the period, the last hour or the whole incident back on a slider, the photos appearing as they were taken.

## Left out on purpose

Finance and Administration (time, procurement, claims, cost), Logistics ordering and supply, air operations, and the full organization chart. They are run from an emergency operations center with other tools; modelling them here would bury the field.
