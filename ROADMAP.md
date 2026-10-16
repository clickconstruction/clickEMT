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

- [ ] `ic_members.status` as ICS names it: assigned, available (at staging), out of service (with a reason), checked out; `crew_count`; `agency`.
- [ ] Field: set your status from the menu; check out at the end of the shift.
- [ ] Base: units grouped by status (the T-card board); a checked-out unit is not shown as missing.
- [ ] PAR, the Personnel Accountability Report: one button on the base sends a PAR to everyone or to a division; each unit answers with one tap, all accounted for with a head count, or missing someone, which raises an alert; the base shows who has not answered and for how long.

## 3. Operational periods and objectives (ICS 202, transfer of command)

- [ ] `ic_periods` (number, start, end, Incident Commander, Operations Section Chief, Safety Officer, notes) and `ic_objectives` (per period, numbered, text, done). A zone can point at the objective it serves, which is what its priority means.
- [ ] Base: the period in the header; a Period panel with its objectives; Start next period carries open objectives and open assignments forward and closes the old one.
- [ ] The shift-change briefing, assembled from the data: objectives and their state, zones cleared and open, hazards still live, units in the field and their status, open alerts, the last hour of the log. Printable. This is the ICS transfer-of-command checklist.

## 4. The Division assignment (ICS 204) and ICS vocabulary

- [ ] `ic_zones`: work assignment (what to do, in words), special instructions, radio channel, division supervisor.
- [ ] Base: those fields on the zone panel; Print the 204 for a division: resources assigned, the assignment, instructions, communications, known hazards, the map.
- [ ] Vocabulary: the base says Division, Assigned, Available, Out of service, Operational period, Check-in, Emergency traffic, each with a plain hint. The field app stays plain.

## 5. Primary and secondary search, and structure records

- [ ] Zone status gains the search pass: not started, in progress, primary complete, secondary complete. Two shades of green on the map. Marking the zone clear from the field asks which pass is done.
- [ ] `ic_structures`: one record per address the field touches: where, searched by whom and when, occupants (evacuated, sheltering in place, refused, none, unknown), people needing help, water depth and waterline, damage class (affected, minor, major, destroyed), hazards, the marking painted. Address clear creates one at the unit's position.
- [ ] Base: structure dots on the map colored by state; the zone's progress counts records when it has them; a structure panel.

## 6. Facilities and the communications plan (ICS 205, 206)

- [ ] `ic_facilities`: command post, staging area, base, shelter, point of distribution, hospital, helispot; placed by clicking the map; each with notes and a contact.
- [ ] `ic_incidents.channels`: the communications plan, which channel for command, tactical per division, emergency.
- [ ] Field: the nearest staging area, shelter and hospital on the card, with directions; the channel for your division.

## 7. Situation report (ICS 209) and the printed IAP

- [ ] A one-screen situation report assembled from the data: period, objectives, zones by state, structures searched, people found, hazards, units by status, alerts, resources needed; copy as text, print, send up to the EOC.
- [ ] Print the Incident Action Plan: objectives (202), organization (203), every division's 204, communications (205), medical (206), the safety message (208), the map.

## 8. Agencies, public information, replay

- [ ] Mutual aid: an agency on every unit and on the incident; unified command names more than one Incident Commander.
- [ ] A public-safe flag on photos for the Public Information Officer; nothing is public by default.
- [ ] `ic_tracks`: position history, so the base can replay the day with a time slider, for the Documentation Unit and the after-action review.

## Left out on purpose

Finance and Administration (time, procurement, claims, cost), Logistics ordering and supply, air operations, and the full organization chart. They are run from an emergency operations center with other tools; modelling them here would bury the field.
