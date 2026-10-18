// The tours on /try/: one per role, a story in steps. Each step is on the base or the phone and has
// `show`, the element to ring for Show me, and most have `do`, what Do it for me performs through the
// app's own buttons and forms, with `done` saying when it has happened and `result` what to tell the
// visitor. `h` is the helper kit from try/index.html: h.b / h.p (querySelector in the base / the
// phone), h.bb / h.pp (all), h.tap (ring, then click), h.fill (type into a field), h.act (press a
// data-action the way the app's own handler sees it), h.until, h.wait, h.logHas (the base's log),
// h.baseHome / h.phoneHome (back to the start), h.byText (find by words), h.phoneAccount (sign the
// phone in as someone new and identify them). Every tour starts from the seeded incident: the base
// as Operations, the phone as Unit 3, a swift-water team in A-2.
window.IC_TOURS = (function () {
  'use strict';
  const U3 = 'Unit 3';

  // ---- shared steps
  const briefed = {
    on: 'phone', say: 'Read your briefing, then go to the map.',
    show: (h) => h.p('#s-briefing [data-action="briefed"]'),
    do: async (h) => { if (h.shown(h.p('#s-briefing'))) await h.tap(() => h.p('#s-briefing [data-action="briefed"]')); },
    done: (h) => !h.shown(h.p('#s-briefing')),
    result: 'The briefing is assembled from the incident as it is: situation, your job, who you work with, work area, radio, supplies, shift, safety. It stays in the menu and changes when Operations changes something.'
  };
  const needHelp = {
    on: 'phone', say: 'Need help now: the red button, then Send alert.',
    prep: (h) => h.phoneHome(),
    show: (h) => h.p('[data-action="help"]'),
    do: async (h) => { await h.tap(() => h.p('[data-action="help"]')); await h.until(() => h.shown(h.p('[data-action="send-alert"]'))); await h.tap(() => h.p('[data-action="send-alert"]')); },
    done: (h) => h.b('#mayday') && !h.b('#mayday').hidden,
    result: 'Two taps. The base\'s red bar reads EMERGENCY · Unit 3 needs help in A-2, with Acknowledge and Show unit, and the unit\'s marker flashes. Your location keeps sending.'
  };
  const ackAndStandDown = {
    on: 'base', say: 'Operations acknowledges; the crew stands down.',
    show: (h) => h.b('#mayday [data-action="ack-alert"]'),
    do: async (h) => { await h.tap(() => h.b('#mayday [data-action="ack-alert"]')); await h.until(() => h.shown(h.p('[data-action="stand-down"]'))); await h.wait(600); await h.tap(() => h.p('[data-action="stand-down"]')); },
    done: (h) => h.b('#mayday') && h.b('#mayday').hidden && h.logHas('stood down'),
    result: 'The phone read "Operations acknowledged · Stay put if you can", then Stand down, all OK. The alert stays in the history and the 214 has every line.'
  };
  const par = {
    on: 'phone', say: 'Answer the head count without typing.',
    prep: async (h) => { await h.phoneHome(); await h.baseHome(); if (!h.shown(h.p('#s-safety'))) { await h.tap(() => h.b('#panel [data-action="start-par"][data-target="all"]')); } await h.until(() => h.shown(h.p('#s-safety')) && /accounted for/i.test(h.p('#s-safety').innerText), 12000); },
    show: (h) => h.byText(h.pp('#s-safety button'), /^All \d+ accounted for$/),
    do: async (h) => { await h.tap(() => h.byText(h.pp('#s-safety button'), /^All \d+ accounted for$/)); },
    done: (h) => h.logHas('All accounted for'),
    result: 'Operations pressed Start PAR; your card listed the names checked in with you, Hale and Dominguez, and one tap answered for both. Someone\'s missing would list them to tick, and the base would name who.'
  };
  const houseRecord = (label, who, cond) => ({
    on: 'phone', say: who ? `Log who you pulled out of ${label}.` : `Mark ${label} searched, with a note for the next crew.`,
    prep: (h) => h.phoneHome(),
    show: (h) => h.p('[data-action="addr-clear"]'),
    do: async (h) => {
      await h.tap(() => h.p('[data-action="addr-clear"]'));
      await h.until(() => h.shown(h.p('#s-structure')));
      h.fill(h.p('#structure-label'), label);
      if (who) {
        await h.tap(() => h.p('[data-action="help-up"]'));
        await h.until(() => h.p('#st-people [data-stp="who"]'));
        h.fill(h.p('#st-people [data-stp="who"]'), who);
        h.fill(h.p('#st-people [data-stp="cond"]'), cond);
        h.p('#st-people').dispatchEvent(new h.P.Event('input', { bubbles: true }));
      } else {
        h.fill(h.p('#structure-notes'), 'Dog inside, gas shut off at the meter');
      }
      await h.wait(400);
      const save = h.p('[data-action="save-structure"]'); save.scrollIntoView({ block: 'center' });
      await h.tap(save);
    },
    done: (h) => h.logHas(label),
    result: who ? `The 214 reads "Unit 3 sent ${who} from ${label} to High school gym". The shelter desk sees them under Arriving from crews and signs them in with one tap; Find a person answers where they are.` : `A-2 counts one more structure on the base, the record is on its map by address, and the note is there for the next crew.`
  });

  return {
    '01-incident-commander': {
      intro: 'You are at the command post. The base is signed in as Operations, which can do everything you can; your seat is on the Period sheet.',
      steps: [
        { on: 'base', say: 'Thirty seconds: is anyone in trouble, how far has the search got, what is the plan.',
          show: (h) => h.b('#inc-sub'),
          do: async (h) => { await h.baseHome(); await h.tap(() => h.b('[data-action="briefing"]')); },
          done: (h) => !h.b('#briefing').hidden,
          look: (h) => h.b('#briefing-page'),
          result: 'The header counts units and divisions; the bar under it is red while anyone needs help and yellow while a message or a head count is open; the legend counts divisions by status. Briefing puts the whole picture on one sheet.' },
        { on: 'base', say: 'Sign the Incident Action Plan.',
          prep: (h) => h.baseHome(),
          show: (h) => h.b('[data-action="iap"]'),
          do: async (h) => { await h.tap(() => h.b('[data-action="iap"]')); },
          done: (h) => !h.b('#briefing').hidden && /incident action plan/i.test(h.b('#briefing-title').textContent),
          look: (h) => h.b('#briefing-page'),
          result: 'The 202, the 203, the 207, every division\'s 204 with its map and medical lines, the 205, 206 and 208, stitched from the data. Print it or copy it as text.' },
        { on: 'base', say: 'Hand command to the county chief.',
          prep: async (h) => { await h.baseHome(); await h.tap(() => h.b('[data-action="period"]')); await h.until(() => h.b('#panel form[data-form="period-edit"]')); },
          show: (h) => h.b('#panel form[data-form="period-edit"] input[name="ic"]'),
          do: async (h) => {
            const f = h.b('#panel form[data-form="period-edit"]');
            const name = f.ic.value === 'Chief Al Barnes' ? 'Chief Rosa Delgado' : 'Chief Al Barnes';   // a re-run without a reset still transfers
            h.fill(f.ic, name); await h.wait(300); f.requestSubmit();
            await h.until(() => h.b('#transfer-dialog').open, 6000);
            await h.wait(900);
            await h.tap(() => h.b('#transfer-dialog [data-action="transfer-go"]'));
          },
          done: (h) => h.logHas('Command transferred'),
          watch: 'phone', look: (h) => h.p('#s-safety'),
          result: 'A different name in the Incident Commander seat asked "Transfer command?" with ICS-100\'s wording. Every phone got a card to acknowledge, the handover briefing opened, the 214 got a notable line, and the 203 keeps who held command when.' },
        { on: 'base', say: 'Who is in which seat, and who is stretched.',
          prep: (h) => h.baseHome(),
          show: (h) => h.b('[data-action="org"]'),
          do: async (h) => { await h.tap(() => h.b('[data-action="org"]')); },
          done: (h) => !h.b('#briefing').hidden && !!h.b('#briefing-page .org-box'),
          result: 'The organization chart, ICS 207, drawn from the seats, the divisions and their supervisors, the units and their people, with the span of control counted on every box. Past seven a box turns orange and the warning says to add a deputy.' },
        { on: 'base', say: 'Seat a deputy.',
          prep: async (h) => { await h.baseHome(); await h.tap(() => h.b('[data-action="period"]')); await h.until(() => h.b('#panel form[data-form="period-edit"]')); },
          show: (h) => h.b('#panel form[data-form="period-edit"] input[name="deputy"]'),
          do: async (h) => { const f = h.b('#panel form[data-form="period-edit"]'); h._deputy = f.deputy.value === 'Capt. Nina Ortiz' ? 'Capt. Omar Haddad' : 'Capt. Nina Ortiz'; h.fill(f.deputy, h._deputy); await h.wait(300); f.requestSubmit(); },
          done: (h) => h.logHas('Deputy ' + h._deputy),
          result: 'Logged like every seat, carried into the next period, printed on the 203 and drawn under the IC on the 207.' },
        { on: 'base', say: 'What changed while you were away: play the day back.',
          prep: (h) => h.baseHome(),
          show: (h) => h.b('[data-action="replay"]'),
          do: async (h) => { await h.tap(() => h.b('[data-action="replay"]')); await h.until(() => h.shown(h.b('#replay-play'))); await h.wait(500); await h.tap(() => h.b('#replay-play')); },
          done: (h) => h.shown(h.b('#replay-play')),
          result: 'Every position a unit reported is kept. Replay plays the period, the last hour or the whole incident back on a slider, the photos appearing as they were taken, the log line of the moment under it.' }
      ]
    },

    '02-operations-section-chief': {
      intro: 'You are in front of the base map. Unit 3\'s phone is beside it, so what you send reaches a phone you can see.',
      steps: [
        { on: 'base', say: 'Open division A-1 and give it priority 3.',
          prep: (h) => h.baseHome(),
          show: (h) => h.byText(h.bb('#zones .zr'), /A-1/),
          do: async (h) => { await h.tap(() => h.byText(h.bb('#zones .zr'), /A-1/)); await h.until(() => h.b('#panel [data-action="set-priority"][data-p="3"]')); h._p = h.b('#panel [data-action="set-priority"][data-p="3"]').classList.contains('on') ? '2' : '3'; await h.tap(() => h.b('#panel [data-action="set-priority"][data-p="' + h._p + '"]')); },
          done: (h) => h.logHas('A-1 priority set to ' + h._p),
          result: 'The row moved down with a 3, the crew\'s phone shows the new priority on its zone card, and the 214 has the line, pointing at the division.' },
        { on: 'base', say: 'Assign Unit 2 to B-2.',
          prep: (h) => h.baseHome(),
          show: (h) => h.byText(h.bb('#zones .zr'), /B-2/),
          do: async (h) => { await h.tap(() => h.byText(h.bb('#zones .zr'), /B-2/)); await h.until(() => h.b('#panel [data-action="assign"]')); await h.tap(() => h.byText(h.bb('#panel [data-action="assign"]'), /Unit 2/)); },
          done: (h) => h.logHas('B-2 assigned to Unit 2'),
          result: 'B-2 is in progress with Unit 2; its phone shows the assignment with Accept. Pressing the name again releases it. A unit may be on more than one division.' },
        { on: 'base', say: 'See a photo as it came in, and which way the camera faced.',
          prep: (h) => h.baseHome(),
          show: (h) => h.b('#log [data-action="select-photo"]'),
          do: async (h) => { await h.tap(() => h.b('#log [data-action="select-photo"]')); },
          done: (h) => /facing/i.test(h.b('#panel').innerText),
          result: 'Facing E 095°, who took it, when, the division, the note, and whether it is cleared for the public. The pin on the map has the wedge.' },
        { on: 'base', say: 'Run a PAR: a head count from every unit, one tap each.',
          prep: (h) => h.baseHome(),
          show: (h) => h.b('#panel [data-action="start-par"][data-target="all"]'),
          do: async (h) => { await h.tap(() => h.b('#panel [data-action="start-par"][data-target="all"]')); await h.until(() => h.shown(h.p('#s-safety')), 10000); },
          done: (h) => h.b('#safety') && !h.b('#safety').hidden && /par/i.test(h.b('#safety').innerText),
          watch: 'phone', look: (h) => h.p('#s-safety'),
          result: 'The yellow bar counts the answers and names who is waiting. Unit 3\'s phone shows the card with Hale and Dominguez and one button, All 2 accounted for. A missing person turns a row red on your board and raises an emergency.' },
        { on: 'phone', say: 'Unit 3 answers.',
          show: (h) => h.byText(h.pp('#s-safety button'), /^All \d+ accounted for$/),
          do: async (h) => { await h.tap(() => h.byText(h.pp('#s-safety button'), /^All \d+ accounted for$/)); },
          done: (h) => h.logHas('All accounted for'),
          result: 'The PAR panel reads "Unit 3 · All accounted for (2)" and the bar counts one more.' },
        { on: 'base', say: 'Answer the radio: where is Unit 1, what is it doing?',
          prep: (h) => h.baseHome(),
          show: (h) => h.byText(h.bb('#panel [data-action="select-unit"]'), /Unit 1/),
          do: async (h) => { await h.tap(() => h.byText(h.bb('#panel [data-action="select-unit"]'), /Unit 1/)); },
          done: (h) => /unit 1/i.test(h.b('#panel .title') ? h.b('#panel .title').innerText : ''),
          result: 'One click: assigned to, standing in, position, heading, last report, head count, the people with their hours on scene, requests, Set status, Message.' },
        { on: 'base', say: 'A safety message that takes over every phone.',
          prep: (h) => h.baseHome(),
          show: (h) => h.b('#panel form[data-form="message"]'),
          do: async (h) => {
            const f = h.b('#panel form[data-form="message"]'); f.scrollIntoView({ block: 'center' });
            f.to.value = 'all'; f.safety.checked = true; h.fill(f.text, 'Stop work: water rising at the low-water crossing');
            await h.wait(500); await h.tap(f.querySelector('button[type="submit"], .btn.pri') || f);
            if (!h.logHas('SAFETY MESSAGE')) f.requestSubmit();
          },
          done: (h) => h.logHas('SAFETY MESSAGE'),
          watch: 'phone', look: (h) => h.p('#s-safety'),
          result: 'Unit 3\'s phone shows it over whatever was open until the crew answers Copy, Will do or Cannot. The yellow bar says who is still waiting, and the 214 marks it as a safety message.' }
      ]
    },

    '03-unit-lead-on-foot': {
      intro: 'You are on foot with a crew of two. In the mock you are Unit 3, a swift-water team in A-2 with Hale and Dominguez; the base is beside you so you can watch what Operations sees.',
      steps: [
        briefed,
        houseRecord('118 Pecan Ln', null, null),
        { on: 'phone', say: 'Your assignment and your channel, without asking.',
          prep: (h) => h.phoneHome(),
          show: (h) => h.p('#assignment'),
          result: 'The zone card: A-2, the work assignment, the special instructions, the radio channel, the supervisor and the objective it serves. The menu has the whole communications plan.' },
        needHelp,
        ackAndStandDown,
        par,
        { on: 'phone', say: 'Mark the division clear.',
          prep: (h) => h.phoneHome(),
          show: (h) => h.p('[data-action="zone-clear"]'),
          do: async (h) => { await h.tap(() => h.p('[data-action="zone-clear"]')); await h.until(() => h.shown(h.p('[data-action="confirm-clear"]'))); await h.wait(500); await h.tap(() => h.p('[data-action="confirm-clear"]')); },
          done: (h) => h.logHas('A-2 marked clear') || h.logHas('A-2 primary search') || h.logHas('primary search complete') || h.logHas('A-2 cleared'),
          result: 'A-2 turned green on the base\'s map and in its list, with the search marking drawn for you: time out, team, hazards, people found.' }
      ]
    },

    '04-swift-water-boat-operator': {
      intro: 'You are in the water at the low crossing. In the mock you are Unit 3, a swift-water team, with the base beside you.',
      steps: [
        briefed,
        { on: 'phone', say: 'Tap In the water: the rotation clock starts.',
          prep: (h) => h.phoneHome(),
          show: (h) => h.p('#water-row [data-action="water-toggle"]'),
          do: async (h) => { await h.tap(() => h.p('#water-row [data-action="water-toggle"]')); },
          done: (h) => h.logHas('Unit 3 in the water'),
          result: 'The row reads "In the water 0 min · rotation 45 min". On the base, your row shows the clock; past the rotation it turns orange, and past three rotations it says "probably left running". Past 45 minutes the phone nudges: swap the crew.' },
        { on: 'phone', say: 'Where is the boat ramp, the shelter, the hospital.',
          prep: (h) => h.phoneHome(),
          show: (h) => h.p('#nearby'),
          result: 'Nearby lists the nearest staging area, shelter, hospital and boat ramp with Directions. Operations places them on the base; your briefing names the ramp with its distance.' },
        houseRecord('120 Pecan Ln', 'Garza, family of 3', 'wet, cold, a baby'),
        needHelp,
        ackAndStandDown,
        par,
        { on: 'phone', say: 'Out of the water.',
          prep: (h) => h.phoneHome(),
          show: (h) => h.p('#water-row [data-action="water-toggle"]'),
          do: async (h) => { await h.tap(() => h.p('#water-row [data-action="water-toggle"]')); },
          done: (h) => h.logHas('Unit 3 out of the water'),
          result: 'Logged with the minutes. Checking out would have ended the clock too.' }
      ]
    },

    '10-shelter-desk': {
      intro: 'You are at the gym door with a line of wet families. The tour signs the phone in as a new account, the gym\'s desk, Red Cross, with a name and a phone and no licence.',
      steps: [
        { on: 'phone', say: 'Check in as the gym\'s desk.',
          show: (h) => h.p('[data-action="menu"]'),
          do: async (h) => { await h.phoneAccount({ email: 'gym-desk@demo.local', name: 'Pat Doe', phone: '512 555 0199', unit: 'Gym desk', agency: 'Red Cross', kind: 'shelter_desk', count: 1 }); },
          done: (h) => h.p('#me-name') && h.p('#me-name').textContent === 'Gym desk',
          result: 'The base\'s 214 reads "Gym desk, shelter desk checked in as Pat Doe, 512 555 0199, identity not given": Operations verifies you in person. Your shelter is the nearest open one, High school gym.' },
        { ...briefed, result: 'Your job reads "People here at High school gym. Sign in everyone who arrives: who, how many, their needs and where from. A crew\'s people on their way to you are listed first: tap They\'re here."' },
        { on: 'phone', say: 'Who is coming on the next bus.',
          show: (h) => h.p('#desk-head'),
          result: 'The count against the beds, the needs counted, and what Operations expects next: "Bus 2 from Pecan Park, 12 people, 17:30". Under it, Arriving from crews: the people a crew has sent your way, with the house they left.' },
        { on: 'phone', say: 'A family a crew sent arrives: They\'re here.',
          show: (h) => h.p('#desk-arriving [data-action="ev-arrived"]'),
          do: async (h) => { await h.tap(() => h.p('#desk-arriving [data-action="ev-arrived"]')); await h.until(() => h.shown(h.p('#s-person'))); await h.wait(500); h.fill(h.p('#ev-who'), 'Ortega, family of 4'); await h.wait(300); await h.tap(() => h.p('#ev-save')); },
          done: (h) => h.logHas('now on record as Ortega'),
          result: 'One tap signed the crew\'s record in, not a second record, and asked for the name. The count went up, the row is at the top of Here now, and the 214 says who signed them in.' },
        { on: 'phone', say: 'Sign in a walk-up who needs insulin.',
          show: (h) => h.p('[data-action="ev-new"]'),
          do: async (h) => { await h.tap(() => h.p('[data-action="ev-new"]')); await h.until(() => h.shown(h.p('#s-person'))); await h.wait(400); h.fill(h.p('#ev-who'), 'Lopez, Ana'); await h.tap(() => h.p('#s-person [data-need="insulin"]')); h.fill(h.p('#ev-from'), 'Bee Creek Rd'); await h.wait(300); await h.tap(() => h.p('#ev-save')); },
          done: (h) => /lopez, ana/i.test(h.p('#desk-here') ? h.p('#desk-here').innerText : ''),
          result: 'Only "who" is needed. The header counts insulin now, the base\'s shelter card shows her, and the situation report counts people sheltered. Names are seen by the incident\'s members only, never in anything public.' },
        { on: 'phone', say: '"Is my mother here?"',
          show: (h) => h.p('#desk-q'),
          do: async (h) => { const q = h.p('#desk-q'); q.scrollIntoView({ block: 'center' }); await h.ring(q); h.fill(q, 'Nguyen'); },
          done: (h) => /nguyen, tam/i.test(h.p('#desk-results') ? h.p('#desk-results').innerText : ''),
          result: '"Nguyen, Tam · oxygen · High school gym since 12:01 · from 118 Pecan Ln", across every shelter and hospital. Nobody on record? Not listed? sends Operations "Looking for …" with your desk\'s number.' },
        { on: 'phone', say: 'Tell Operations you are nearly full.',
          show: (h) => h.p('[data-action="inbox"]'),
          do: async (h) => { await h.tap(() => h.p('[data-action="inbox"]')); await h.until(() => h.shown(h.p('[data-action="compose"]'))); await h.tap(() => h.p('[data-action="compose"]')); await h.until(() => h.shown(h.p('#s-compose'))); const urg = h.p('#compose-urgency .chip'); if (urg) await h.tap(urg); h.fill(h.p('#compose-text'), 'The gym is nearly full: 52 of 60'); await h.wait(300); await h.tap(() => h.p('[data-action="send-compose"]')); },
          done: (h) => h.logHas('nearly full'),
          result: 'Four words say how urgent it is (act on now, before nightfall, can wait until tomorrow, blocks further operations). The base shows the badge; your inbox reads "Waiting on Operations" until they answer.' }
      ]
    },

    '08-mutual-aid-captain': {
      intro: 'You arrive at staging knowing nobody. The tour signs the phone in as a new account, Brush 12 from Bandera County, three on the truck.',
      steps: [
        { on: 'phone', say: 'Check in at staging with the code.',
          show: (h) => h.p('[data-action="menu"]'),
          do: async (h) => { await h.phoneAccount({ email: 'brush12@demo.local', name: 'Capt. Reyes', phone: '830 555 0142', unit: 'Brush 12', agency: 'Bandera County FD', kind: 'engine', count: 3 }); },
          done: (h) => h.p('#me-name') && h.p('#me-name').textContent === 'Brush 12',
          result: 'One screen: the code (typed, or scanned from the card, Operations\' screen or another unit\'s phone), your callsign, your agency, what the unit is, how many with you, and your people with their qualifications. The base saw you the moment you pressed Check in.' },
        { ...briefed, result: 'Your deployment briefing, from the data: the situation, your job (wait at staging until assigned), who you work with, the radio, what to bring, the safety message, and the rotation if you are a water crew.' },
        { on: 'phone', say: 'Where is the hospital, where is staging.',
          prep: (h) => h.phoneHome(),
          show: (h) => h.p('#nearby'),
          result: 'Nearby: staging, the shelter, the hospital, the boat ramp, each with Directions. "If someone is hurt" names the medic on your unit or the nearest, the emergency channel and the nearest hospital, with Ask for the ambulance.' },
        { on: 'base', say: 'Your 204 on paper, with a map of the division.',
          prep: (h) => h.baseHome(),
          show: (h) => h.byText(h.bb('#zones .zr'), /B-2/),
          do: async (h) => { await h.tap(() => h.byText(h.bb('#zones .zr'), /B-2/)); await h.until(() => h.b('#panel [data-action="print-204"]')); await h.tap(() => h.b('#panel [data-action="print-204"]')); },
          done: (h) => !h.b('#briefing').hidden && /204/.test(h.b('#briefing-title').textContent),
          result: 'The assignment in words, the special instructions, the supervisor, the channel, your names, the medical lines (ICS 206) and a map of the division with the structures, hazards and facilities. The phone\'s zone card has the same words.' },
        { on: 'phone', say: 'Get released: check out.',
          prep: (h) => h.phoneHome(),
          show: (h) => h.p('[data-action="menu"]'),
          do: async (h) => { await h.tap(() => h.p('[data-action="menu"]')); await h.until(() => h.shown(h.p('[data-action="check-out"]'))); await h.tap(() => h.p('[data-action="check-out"]')); await h.until(() => h.shown(h.p('[data-action="checkout-confirm"]'))); await h.wait(600); await h.tap(() => h.p('[data-action="checkout-confirm"]')); },
          done: (h) => h.logHas('Brush 12 checked out'),
          result: 'The demobilization list first (nothing required; what is not ticked goes to Operations), a note for the next crew, then Check out. Your hours are on the 211 and the Hours page for Finance.' }
      ]
    }
  };
})();
