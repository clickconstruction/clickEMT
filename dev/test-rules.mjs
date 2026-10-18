// Checks for js/shared/rules.js, the rules both views share. Run: node dev/test-rules.mjs
import assert from 'node:assert/strict';
import { hazardWords, sceneMinutes, sortHazards, urgencyRank, sceneStart, stintText, revisitWords, revisitHhmm, SCENE_HOURS_DEFAULT, sceneOver, peopleOverScene, sceneLine, sceneText, sinceSummary, whenText, dateText, periodState, periodLabel, periodLine, compass, nextZoneCode, ringToLatLngs, latLngsToPolygon, pointInPolygon, zoneAt, centroid, distanceM, markingFor, sortZones, zoneStatusText, pct, commandText, agenciesOn, agencyLine, replayIndex, sampleAt, samplesBefore, profileReady, identityGiven, NEARBY_KINDS, UNIT_KINDS, kindText, NEEDS, needsText, evacueeWho, evacueeWhere, evacueeFrom, whereValue, wherePatch, countIn, needsIn, hasName, placeWordsOf, evacueeMatch, placeCounts, needsTotalsText, bedsText, peopleShelteredLine } from '../js/shared/rules.js';

let n = 0;
function t(name, fn) { fn(); n++; console.log('ok', name); }

t('compass names the eight points and pads degrees', () => {
  assert.equal(compass(0), 'N 000°');
  assert.equal(compass(61), 'NE 061°');
  assert.equal(compass(225), 'SW 225°');
  assert.equal(compass(359.6), 'N 000°');
  assert.equal(compass(-90), 'W 270°');
  assert.equal(compass(null), '');
});

t('zone codes count up within a division and start a new one at 1', () => {
  const zones = [{ code: 'A-1' }, { code: 'A-2' }, { code: 'B-1' }];
  assert.equal(nextZoneCode(zones, 'A'), 'A-3');
  assert.equal(nextZoneCode(zones, 'b'), 'B-2');
  assert.equal(nextZoneCode(zones, 'C'), 'C-1');
  assert.equal(nextZoneCode(zones), 'B-2', 'with no division, the last division used');
  assert.equal(nextZoneCode([]), 'A-1');
});

t('GeoJSON rings round-trip to Leaflet latlngs without the closing point', () => {
  const poly = latLngsToPolygon([[30.1, -97.5], [30.2, -97.5], [30.2, -97.4]]);
  assert.deepEqual(poly.coordinates[0], [[-97.5, 30.1], [-97.5, 30.2], [-97.4, 30.2], [-97.5, 30.1]]);
  assert.deepEqual(ringToLatLngs(poly), [[30.1, -97.5], [30.2, -97.5], [30.2, -97.4]]);
  assert.deepEqual(ringToLatLngs(null), []);
});

t('a point inside a zone is found, one outside is not', () => {
  const square = latLngsToPolygon([[30.0, -97.0], [30.0, -96.9], [30.1, -96.9], [30.1, -97.0]]);
  assert.equal(pointInPolygon(30.05, -96.95, square), true);
  assert.equal(pointInPolygon(30.15, -96.95, square), false);
  const zones = [{ code: 'A-1', polygon: square }];
  assert.equal(zoneAt(zones, 30.05, -96.95).code, 'A-1');
  assert.equal(zoneAt(zones, 29.0, -96.95), null);
  assert.equal(zoneAt(zones, null, null), null);
  const c = centroid(square);
  assert.ok(Math.abs(c[0] - 30.05) < 1e-9 && Math.abs(c[1] + 96.95) < 1e-9);
});

t('distance in metres is about right', () => {
  const d = distanceM([30.0, -97.0], [30.0, -97.01]);
  assert.ok(d > 950 && d < 970, 'one hundredth of a degree of longitude at 30° north is about 963 m, got ' + d);
});

t('the search marking carries team, time, hazards and people', () => {
  const m = markingFor('U3', new Date(2026, 9, 16, 13, 42), ['ELEC', 'GAS'], 1);
  assert.equal(m.team, 'U3');
  assert.equal(m.out, '13:42');
  assert.equal(m.haz, 'ELEC GAS');
  assert.equal(m.victims, 1);
  assert.equal(markingFor('U3', new Date(), [], 0).haz, 'none');
});

t('zones sort by priority then code, and status text reads well', () => {
  const zones = [{ code: 'B-1', priority: 2 }, { code: 'A-1', priority: 1 }, { code: 'A-2', priority: 2 }];
  assert.deepEqual(sortZones(zones).map((z) => z.code), ['A-1', 'A-2', 'B-1']);
  assert.equal(zoneStatusText({ status: 'open', structures: 12, cleared: 0, hazard: false }), 'Not started · 12 structures');
  assert.equal(zoneStatusText({ status: 'active', structures: 14, cleared: 9, hazard: true }, 'Unit 3'), 'In progress · Unit 3 · 9 of 14 · hazard');
  assert.equal(zoneStatusText({ status: 'active', structures: 9, cleared: 0, hazard: false }, 'Brush 12', false), 'Assigned, not accepted · Brush 12 · 0 of 9');   // v42
  assert.equal(pct({ structures: 14, cleared: 7 }), 50);
  assert.equal(pct({ structures: 0, cleared: 0 }), 0);
});

console.log(n + ' checks passed');

t('the command line names the lead agency and the unified command', () => {
  assert.equal(commandText({ lead_agency: '' }, { unified: '' }), '');
  assert.equal(commandText({ lead_agency: 'Cedar Fork FD' }, null), 'Cedar Fork FD (lead)');
  assert.equal(commandText({ lead_agency: 'Cedar Fork FD' }, { unified: 'Travis County SO' }), 'Cedar Fork FD (lead), unified command with Travis County SO');
  assert.equal(commandText({ lead_agency: '' }, { unified: 'Travis County SO' }), 'unified command with Travis County SO');
});

t('agencies on scene count units and people, biggest first, no agency last', () => {
  const rows = agenciesOn([{ agency: 'B', crew_count: 2 }, { agency: 'A', crew_count: 3 }, { agency: 'B', crew_count: null }, { agency: '', crew_count: 4 }]);
  assert.deepEqual(rows.map(agencyLine), ['B: 2 units, 2 people', 'A: 1 unit, 3 people', 'No agency named: 1 unit, 4 people']);
});

t('a replay finds the sample at a moment and the crumbs before it', () => {
  const at = (s) => new Date(Date.UTC(2026, 0, 1, 12, 0, s)).toISOString();
  const by = replayIndex([{ user_id: 'u', lat: 3, lng: 0, at: at(30) }, { user_id: 'u', lat: 1, lng: 0, at: at(0) }, { user_id: 'u', lat: 2, lng: 0, at: at(10) }, { user_id: 'v', lat: 9, lng: 0, at: at(5) }]);
  const list = by.get('u');
  assert.deepEqual(list.map((s) => s.lat), [1, 2, 3], 'sorted by time');
  const ms = (s) => new Date(at(s)).getTime();
  assert.equal(sampleAt(list, ms(0) - 1), null, 'nothing before the first report');
  assert.equal(sampleAt(list, ms(0)).lat, 1);
  assert.equal(sampleAt(list, ms(15)).lat, 2);
  assert.equal(sampleAt(list, ms(99)).lat, 3);
  assert.deepEqual(samplesBefore(list, ms(30), 25000).map((s) => s.lat), [2, 3]);
});

t('a name and a phone check in; a licence or its photo is the identity (v25)', () => {
  assert.equal(profileReady({ full_name: 'Pat Doe', phone: '512 555 0199', licence_number: '', photo_path: null }), true);
  assert.equal(identityGiven({ full_name: 'Pat Doe', phone: '512 555 0199', licence_number: '', photo_path: null }), false);
  assert.equal(profileReady({ full_name: 'Pat Doe', phone: '' }), false);
  assert.equal(profileReady(null), false);
  assert.equal(identityGiven({ licence_number: 'D1' }), true);
  assert.equal(identityGiven({ licence_number: '', photo_path: 'u/licence.jpg' }), true);
});

t('Nearby lists staging, the boat ramp, the shelter and the hospital (v25)', () => {
  assert.deepEqual(NEARBY_KINDS, ['staging', 'ramp', 'shelter', 'hospital']);
});

// ---- people sheltered and moved (v26)
const FAC = [{ id: 'gym', kind: 'shelter', name: 'High school gym', beds: 60, expected: 'Bus 2 from Pecan Park, 12 people, 17:30', closed_at: null }, { id: 'hall', kind: 'shelter', name: 'Church hall', beds: null, expected: '', closed_at: null }, { id: 'dell', kind: 'hospital', name: 'Dell Seton', closed_at: null }];
const fac = (id) => FAC.find((f) => f.id === id) || null;
const EV = [
  { id: 'e1', label: 'Okonkwo family', count: 5, needs: ['infant', 'pets'], status: 'here', facility_id: 'gym', status_at: '2026-10-17T13:10:00', note: '', from_text: 'Riverside Drive' },
  { id: 'e2', label: 'family of 3', count: 3, needs: [], status: 'here', facility_id: 'gym', status_at: '2026-10-17T13:30:00', note: '', from_text: 'Mill Street' },
  { id: 'e3', label: 'family of 4', count: 4, needs: ['pets'], status: 'on_the_way', facility_id: 'gym', status_at: '2026-10-17T14:05:00', note: 'wet, cold, a dog', from_text: '', structure_id: 's1' },
  { id: 'e4', label: 'Maria Alvarez, 78', count: 1, needs: ['oxygen'], status: 'moved', facility_id: 'dell', prev_facility_id: 'gym', status_at: '2026-10-17T15:10:00', note: 'on oxygen', from_text: '112 Pecan Ln' },
  { id: 'e5', label: 'Nguyen, Tam', count: 1, needs: ['oxygen'], status: 'with_family', facility_id: null, prev_facility_id: 'gym', status_at: '2026-10-17T15:40:00', note: '', from_text: '' }
];

t('a shelter desk is a kind of unit, between the pump crews and other', () => {
  assert.deepEqual(UNIT_KINDS.find((k) => k[0] === 'shelter_desk'), ['shelter_desk', 'Shelter desk', 'Shelter desks', 'shelter desk']);
  assert.equal(UNIT_KINDS[UNIT_KINDS.length - 1][0], 'other');
  assert.equal(kindText('shelter_desk'), 'shelter desk');
});

t('needs read as the database writes them', () => {
  assert.deepEqual(NEEDS.map((n) => n[0]), ['oxygen', 'insulin', 'wheelchair', 'infant', 'pets', 'other']);
  assert.equal(needsText(['pets', 'insulin']), 'insulin and pets');
  assert.equal(needsText(['pets', 'oxygen', 'infant']), 'oxygen, infant care and pets');
  assert.equal(needsText([]), '');
  assert.deepEqual(needsIn('on oxygen, stable, a dog and a baby'), ['oxygen', 'infant', 'pets']);
  assert.deepEqual(needsIn('diabetic, uses a walker'), ['insulin', 'wheelchair']);
});

t('who a record is: the label, with the count when the label does not say it', () => {
  assert.equal(evacueeWho({ label: 'Okonkwo family', count: 5 }), 'Okonkwo family (5)');
  assert.equal(evacueeWho({ label: 'family of 4', count: 4 }), 'family of 4');
  assert.equal(evacueeWho({ label: '', count: 3 }), '3 people with no name yet');
  assert.equal(evacueeWho({ label: '', count: 1 }), 'a person with no name yet');
  assert.equal(countIn('family of 4, Pecan Park'), 4);
  assert.equal(countIn('Bus 2 from Pecan Park, 12 people, 17:30'), 12);
  assert.equal(countIn('Maria Alvarez, 78'), null);
});

t('where a record says they are now, and since when', () => {
  assert.ok(/^High school gym since \d\d:\d\d$/.test(evacueeWhere(EV[0], fac)));
  assert.ok(/^on the way to High school gym, sent \d\d:\d\d$/.test(evacueeWhere(EV[2], fac)));
  assert.ok(/^Dell Seton since \d\d:\d\d$/.test(evacueeWhere(EV[3], fac)));
  assert.ok(/^left High school gym with family at \d\d:\d\d$/.test(evacueeWhere(EV[4], fac)));
  assert.equal(evacueeFrom(EV[2], { structureOf: () => ({ label: '112 Pecan Ln', zone_id: 'z2' }), zoneOf: () => ({ code: 'A-2' }) }), '112 Pecan Ln · A-2');
});

t('where now as a choice: here, on the way to another shelter, moved to a hospital, or gone', () => {
  assert.equal(whereValue(EV[0]), 'f:gym');
  assert.equal(whereValue(EV[4]), 'with_family');
  assert.deepEqual(wherePatch('f:gym', { facilityOf: fac, hereId: 'gym' }), { status: 'here', facility_id: 'gym' });
  assert.deepEqual(wherePatch('f:hall', { facilityOf: fac, hereId: 'gym' }), { status: 'on_the_way', facility_id: 'hall' });
  assert.deepEqual(wherePatch('f:dell', { facilityOf: fac, hereId: 'gym' }), { status: 'moved', facility_id: 'dell' });
  assert.deepEqual(wherePatch('f:gym', { facilityOf: fac }), { status: 'on_the_way', facility_id: 'gym' }, 'a crew sending someone to a shelter: on the way, for its desk to sign in');
  assert.deepEqual(wherePatch('own_transport', { facilityOf: fac }), { status: 'own_transport', facility_id: null });
});

t('a name in a label, not a description or a place', () => {
  const places = placeWordsOf({ zones: [{ name: 'Pecan Mobile Home Park' }], structures: [{ label: '112 Pecan Ln' }], facilities: [{ name: 'High school gym' }] });
  assert.equal(hasName('Alvarez, family of 4', places), true);
  assert.equal(hasName('Maria Alvarez, 78', places), true);
  assert.equal(hasName('Mr. Okafor', places), true);
  assert.equal(hasName('family of 4, Pecan Park', places), false);
  assert.equal(hasName('elderly man and a dog', places), false);
  assert.equal(hasName('woman in a wheelchair', places), false);
  assert.equal(hasName('', places), false);
});

t('find a person: every word typed, the latest first', () => {
  assert.deepEqual(evacueeMatch(EV, 'alvarez', { facilityOf: fac }).map((e) => e.id), ['e4']);
  assert.deepEqual(evacueeMatch(EV, 'family', { facilityOf: fac }).map((e) => e.id), ['e3', 'e2', 'e1']);
  assert.deepEqual(evacueeMatch(EV, 'pecan oxygen', { facilityOf: fac }).map((e) => e.id), ['e4']);
  assert.deepEqual(evacueeMatch(EV, '', { facilityOf: fac }), []);
});

t('a shelter\'s count against its beds, its arrivals, who left, and the needs of those there', () => {
  const c = placeCounts(EV, 'gym');
  assert.equal(c.people, 8);
  assert.deepEqual(c.here.map((e) => e.id), ['e1', 'e2']);
  assert.equal(c.arrivingPeople, 4);
  assert.deepEqual(c.left.map((e) => e.id), ['e4', 'e5']);
  assert.equal(needsTotalsText(c.needs), '1 infant · 1 pets');
  assert.equal(bedsText(c.people, 60), '8 of 60');
  assert.equal(bedsText(3, null), '3 here');
  assert.equal(placeCounts(EV, 'dell').people, 1, 'a hospital counts the people moved there');
});

t('the situation report\'s line: counts, beds, hospital, expected, no names', () => {
  const line = peopleShelteredLine({ evacuees: EV, facilities: FAC, placeWords: placeWordsOf({ zones: [{ name: 'Pecan Mobile Home Park' }] }) });
  assert.equal(line, 'People sheltered: 8 at High school gym (60 beds), 0 at Church hall, 1 moved to hospital, 16 expected · 2 records with no name yet');
  assert.ok(!/Alvarez|Okonkwo|Nguyen/.test(line));
  assert.equal(peopleShelteredLine({ evacuees: [], facilities: [] }), 'People sheltered: no shelter open and nobody on record');
});

t('the since-you-last-looked line counts what came in by what it is (v45)', () => {
  const E = [
    { kind: 'hazard', text: 'Hazard in A-2 (act on now): gas smell, reported by Unit 3' }, { kind: 'hazard', text: 'Hazard resolved in A-2: gas smell' },
    { kind: 'help', text: 'EMERGENCY, Unit 2 needs help in B-1: Missing: Patel' }, { kind: 'help', text: 'Unit 2 stood down, all OK' },
    { kind: 'par', text: 'Unit 2: Missing someone: Patel (1 accounted for)' }, { kind: 'par', text: 'Patel found, reported by Unit 2', notable: true }, { kind: 'par', text: 'Unit 1: All accounted for (2)' }, { kind: 'par', text: 'PAR, Operations to everyone: PAR: is everyone accounted for?' },
    { kind: 'msg', text: 'SO 14 to Operations (act on now): Road closed' }, { kind: 'safety', text: 'SAFETY MESSAGE, Operations to everyone: Stay out' },
    { kind: 'photo', text: 'Unit 1 sent a photo from A-1, facing E 095°: Water over road' }, { kind: 'clear', text: 'Structure cleared in A-2 (6 of 18)' }, { kind: 'ops', text: 'B-2 assigned to SO 14' }
  ];
  assert.equal(sinceSummary(E), '1 hazard, 1 emergency (1 stood down), 1 missing person (1 found), 1 PAR started, 2 PAR answers, 1 safety message, 1 message, 1 photo, 1 division or structure update, 1 line by Operations · 1 notable');
  assert.equal(sinceSummary([]), 'nothing new');
});

t('times and dates read in one form, and the period knows when its planned end has passed (v40)', () => {
  const d = new Date(2026, 9, 17, 21, 58);
  assert.equal(dateText(d), '17 Oct 2026');
  assert.equal(whenText(d), '17 Oct 2026 21:58');
  assert.equal(whenText('not a date'), '');
  const starts = new Date(2026, 9, 17, 18, 47), ends = new Date(2026, 9, 17, 19, 0);
  const p = { number: 1, starts_at: starts.toISOString(), ends_at: ends.toISOString(), closed_at: null };
  assert.deepEqual(periodState(p, new Date(2026, 9, 17, 18, 50).getTime()), { state: 'open', overMin: 0 });
  assert.deepEqual(periodState(p, new Date(2026, 9, 17, 22, 0).getTime()), { state: 'overdue', overMin: 180 });
  assert.equal(periodState(Object.assign({}, p, { closed_at: ends.toISOString() }), new Date(2026, 9, 17, 22, 0).getTime()).state, 'closed');
  assert.equal(periodLabel(p, new Date(2026, 9, 17, 18, 50).getTime()), 'OP 1 · 18:47 to 19:00');
  assert.equal(periodLabel(p, new Date(2026, 9, 17, 22, 0).getTime()), 'OP 1 · 18:47 to 19:00 · overdue 3 h');
  assert.equal(periodLine(p, new Date(2026, 9, 17, 22, 5).getTime()), 'Operational period 1, 18:47 to 19:00 · the planned end passed 3 h 5 min ago; the next period has not been started');
  assert.equal(periodLine(null), 'No operational period set');
});

t('on scene too long (v47): the threshold, who is past it, and the words', () => {
  const now = new Date(2026, 9, 17, 22, 0).getTime();
  const at = (h) => new Date(now - h * 3600000).toISOString();
  const members = [{ user_id: 'u1', unit_name: 'Unit 1', status: 'assigned' }, { user_id: 'u2', unit_name: 'Unit 2', status: 'checked_out' }];
  const people = [
    { id: 'a', user_id: 'u1', name: 'Okafor', checked_in_at: at(13.2), checked_out_at: null, archived_at: null },
    { id: 'b', user_id: 'u1', name: 'Ramirez', checked_in_at: at(3), checked_out_at: null, archived_at: null },
    { id: 'c', user_id: 'u1', name: 'Gone', checked_in_at: at(20), checked_out_at: at(1), archived_at: null },
    { id: 'd', user_id: 'u2', name: 'Patel', checked_in_at: at(15), checked_out_at: null, archived_at: null }
  ];
  assert.equal(SCENE_HOURS_DEFAULT, 12);
  assert.equal(sceneOver(people[0], 12, now), true);
  assert.equal(sceneOver(people[1], 12, now), false);
  assert.equal(sceneOver(people[0], 0, now), false, '0 turns it off');
  assert.equal(sceneOver(people[2], 12, now), false, 'checked out is not on scene');
  const over = peopleOverScene(people, members, 12, now);
  assert.deepEqual(over.map((x) => x.person.name), ['Okafor'], 'a unit that checked out is not counted');
  assert.equal(sceneLine(over[0], 12), 'Okafor (Unit 1): 13 h 12 min on scene, past 12 h');
  assert.deepEqual(peopleOverScene(people, members, 2, now).map((x) => x.person.name), ['Okafor', 'Ramirez'], 'longest first');
  assert.equal(sceneText(12), 'Safety is told past 12 hours on scene');
  assert.equal(sceneText(0), 'no hours-on-scene threshold set');
});

t('a hazard\'s words on one line (v53): the note alone when it restates the kind', () => {
  assert.equal(hazardWords({ kind: 'Person or car in the water', note: 'Car in the water at the bridge, one person inside' }), 'Car in the water at the bridge, one person inside');
  assert.equal(hazardWords({ kind: 'Person or car in the water', note: 'one inside' }), 'Person or car in the water, one inside');
  assert.equal(hazardWords({ kind: 'Tree down, road blocked', note: 'Across Pecan Ln' }), 'Tree down, road blocked, Across Pecan Ln');
  assert.equal(hazardWords({ kind: 'Tree down, road blocked', note: 'Tree down, road blocked at the fairgrounds gate' }), 'Tree down, road blocked at the fairgrounds gate');
  assert.equal(hazardWords({ kind: 'Gas smell', note: '' }), 'Gas smell');
});

t('small items from the re-walks (v48): hazards by urgency, the current stretch, the revisit\'s words', () => {
  const H = [{ id: 'a', urgency: '', created_at: '2026-10-17T20:00:00Z' }, { id: 'b', urgency: 'nightfall', created_at: '2026-10-17T19:00:00Z' }, { id: 'c', urgency: 'blocking', created_at: '2026-10-17T18:00:00Z' }, { id: 'd', urgency: 'now', created_at: '2026-10-17T17:00:00Z' }, { id: 'e', urgency: 'tomorrow', created_at: '2026-10-17T21:00:00Z' }, { id: 'f', urgency: '', created_at: '2026-10-17T22:00:00Z' }];
  assert.deepEqual(sortHazards(H).map((h) => h.id), ['d', 'c', 'b', 'e', 'f', 'a'], 'act on now, blocks, nightfall, can wait, then no word newest first');
  assert.equal(urgencyRank('made up'), 4);
  const now = new Date(2026, 9, 17, 22, 0).getTime();
  const p = { checked_in_at: new Date(2026, 9, 17, 9, 0).toISOString(), checked_out_at: null, stint_at: new Date(2026, 9, 17, 20, 30).toISOString() };
  assert.equal(sceneStart(p), p.stint_at);
  assert.equal(stintText(p, now), '1 h 30 min', 'the current stretch, not the day');
  assert.equal(sceneMinutes(p, now), 90);
  assert.equal(sceneOver(p, 12, now), false, 'back in for ninety minutes is not past twelve hours');
  assert.equal(sceneStart({ checked_in_at: p.checked_in_at, stint_at: null }), p.checked_in_at);
  const today = new Date(2026, 9, 17, 23, 0).toISOString(), tomorrow = new Date(2026, 9, 18, 6, 0).toISOString(), past = new Date(2026, 9, 17, 16, 0).toISOString();
  assert.deepEqual(revisitWords(today, now), { hhmm: '23:00', tomorrow: false, due: false, text: '23:00' });
  assert.deepEqual(revisitWords(tomorrow, now), { hhmm: '06:00', tomorrow: true, due: false, text: 'tomorrow 06:00' });
  assert.deepEqual(revisitWords(past, now), { hhmm: '16:00', tomorrow: false, due: true, text: '16:00' });
  assert.equal(revisitWords(null, now), null);
  assert.equal(revisitHhmm(tomorrow, '06:00', now), 'tomorrow 06:00');
  assert.equal(revisitHhmm(today, '23:00', now), '23:00');
  assert.equal(revisitHhmm(null, '23:00', now), '');
});
