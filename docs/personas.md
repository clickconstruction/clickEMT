# Personas

Who the app is designed around, with what each needs done and where the app stands for them. Written 2026-10-17 at v22; the gaps named here were the state then. Walkthroughs (`docs/walkthroughs.md`, when they exist) take each persona through the app with only that person's knowledge.

**1. Dana Ruiz, Incident Commander.** Small-town fire chief, at the command post, pulled in five directions. Needs: to know in thirty seconds whether anyone is in trouble, how far the search has got, and what the next period's plan is; to sign the IAP and brief the shift change; to name a unified command when the county arrives. Today: the header counts, the mayday bar, the briefing, the IAP, lead agency and unified command. Gap: no "what changed since I last looked" summary for someone away for an hour.

**2. Marcus Bell, Operations Section Chief.** The base map's main user, in front of it for twelve hours. Needs: to draw divisions and set priorities fast, assign and reassign units, see photos as they arrive, keep the PAR honest, answer the radio with the map in front of him, and never lose a report. Today: nearly everything on the base is his. Gap: a second screen for the log exists, but no way to hand the map to a relief chief with his context intact.

**3. Lt. Ana Ramirez, unit lead in the field.** On foot in a division with a crew of two, wet gloves, a phone in a chest pocket. Needs: one tap to clear an address and to send a photo that says which way it faced, to know her assignment and channel without asking, to raise help instantly, and to answer a PAR without typing. Today: the phone's home screen is built around her. Gap: nothing works with the screen locked, and the crew card from the tags canvas is not built yet.

**4. Rosa Alvarez, swift-water boat operator.** In the water at the low crossing, with a mutual-aid crew. Needs: time-in-water rotation prompts, her people tracked when phones are in dry bags, the shelter and the boat ramp on the map, and intake of the people she pulls out. Today: facilities with directions, the structure record. Gap: GPS trackers, rotation timers and wristband intake are the tags proposal.

**5. Priya Natarajan, Safety Officer.** Walks between divisions, watches the water and the crews. Needs: to push a safety message that takes over every phone, to see who has not acknowledged, to read hazards as they are reported, and to know who has been on scene too long. Today: safety messages, the yellow bar, hazard reports, the period's safety message on the 204 and 208. Gap: hours on scene per person are only there since the people record landed; no fatigue alerts yet.

**6. The Documentation Unit, often one borrowed clerk.** Needs: an ICS 214 that writes itself, a 211 with names, the situation report at the top of each period, and a replay for the after-action review. Today: all of that exists, with notable lines and the pop-out log. Gap: the EOC still gets the sitrep by copy and paste; no email or scheduled send.

**7. The Public Information Officer.** Under pressure for pictures within the hour. Needs: only photos Operations has cleared, with time and place, nothing that shows a victim or an address. Today: the public-safe flag and the cleared set on the home panel. Gap: no export of the cleared photos as files with captions.

**8. Capt. Reyes, mutual-aid crew from two counties over.** Arrives at staging knowing nobody and nothing about the town. Needs: to join in a minute by scanning a code, to prove who he is, to get a 204 on paper with a map, to find the hospital and the channels, and to be released cleanly at the end. Today: QR join, identity, the printed 204 with its map, facilities, check-out. Gap: his agency's own qualifications and rosters have to be typed in each time.

**9. Dep. Luis Moreno, sheriff's deputy at a traffic post.** Works alone at a closed bridge for hours. Needs: to be counted without a buddy, to report a car in the water with its spot in two taps, and to be told when the post can stand down. Today: urgent messages with a location pin, the PAR. Gap: the separation and not-heard warnings do not help a one-person post; that is the tags work.

**10. The shelter desk volunteer.** At the gym door with a clipboard and a line of wet families. Needs: who is arriving on which bus, who needs oxygen or insulin, pets, and an answer for the woman asking after her mother. Today: nothing; the structure record only has counts. Gap: the evacuee board and wristbands from the tags canvas.

**11. The agency administrator.** Sets the app up before the season. Needs: accounts for every member, a Google Maps key if they want it, the identity records cleared after an incident, and confidence that nothing a crew sent can be lost or deleted. Today: the never-delete rule and the audit log, the config key. Gap: no admin screen; accounts and retention are done by hand in Supabase.

**12. The resident who refused to leave.** Not a user, but the person the app exists for. Needs: to be revisited at a set time, to have their oxygen noted, and for the next crew to know the house has been searched. Today: the structure record carries all of that and the marking. Gap: the revisit is a note, not a reminder that fires.

**What they share.** Rain, gloves, one hand, no signal for minutes at a time, night shifts, and people who have never seen the app before being handed a phone at a check-in table. That last one argues for the first screen a newcomer sees being the thing to polish next.

If you would like this on a page to hand to the team, I can put it on one.
