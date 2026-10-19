// Checks for js/shared/rules.js, the rules both views share. Run: node dev/test-rules.mjs
import assert from 'node:assert/strict';
import { phoneE164, phoneDisplay, signInAddress, accountText, codeSentText, codeErrorText, URGENCY_STEPS, stepLabel, STUCK_WORDS, urgencyWords, stepRank, actNow, hhmmUtc, zoneShort, hazardWords, ALERT_WRONG, ALERT_NEEDS, alertWords, alertCodes, alertChange, sceneMinutes, sortHazards, urgencyRank, sceneStart, stintText, revisitWords, revisitHhmm, SCENE_HOURS_DEFAULT, sceneOver, peopleOverScene, sceneLine, sceneText, sinceSummary, whenText, dateText, periodState, periodLabel, periodLine, compass, nextZoneCode, ringToLatLngs, latLngsToPolygon, pointInPolygon, zoneAt, centroid, distanceM, markingFor, sortZones, zoneStatusText, pct, commandText, agenciesOn, agencyLine, replayIndex, sampleAt, samplesBefore, replayWindow, replayWindowLabel, dayHhmm, replayPickCheck, dayIso, profileReady, identityGiven, NEARBY_KINDS, UNIT_KINDS, kindText, NEEDS, needsText, evacueeWho, evacueeWhere, evacueeFrom, whereValue, wherePatch, countIn, needsIn, hasName, placeWordsOf, evacueeMatch, placeCounts, needsTotalsText, bedsText, peopleShelteredLine, bandFromScan, bandFromSearch, bandCodeNumber, bandLabel, bandUrl, tagOf, lastSeen, seenStale, seenWords, lastSeenText, seenGuess, runCard, foldRuns, RUN_FOLD, cornersBox, cornersOk, boxCorners, overlayCorners, CREDENTIAL_KINDS, REJECT_REASONS, credentialLabel, credentialText, credentialExpired, credentialsOf, credentialOf, pendingCredentials, credentialState, idState, personQuals, qualChipText, qualsTextWith, mapRuns, runState, runGeometry, RUN_FRESH_MS, runStacks, incidentLine, incidentLineText, incidentFacts } from '../js/shared/rules.js';

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

t('a run on the map (v70): the open runs, their points and their state', () => {
  const now = new Date(2026, 9, 18, 17, 30).getTime();
  const iso = (min) => new Date(now - min * 60000).toISOString();
  const gym = { id: 'g', lat: 30.2566, lng: -97.7426 }, park = { id: 'p', lat: 30.2600, lng: -97.7400 };
  const zone = { id: 'z', polygon: { type: 'Polygon', coordinates: [[[-97.74, 30.26], [-97.73, 30.26], [-97.73, 30.27], [-97.74, 30.27], [-97.74, 30.26]]] } };
  const positions = { d1: { lat: 30.2590, lng: -97.7420, at: iso(2) }, d2: { lat: 30.2590, lng: -97.7420, at: iso(6) } };
  const opts = { facilityOf: (id) => ({ g: gym, p: park }[id] || null), zoneOf: (id) => (id === 'z' ? zone : null), positionOf: (id) => positions[id] || null, now };
  const runs = [
    { id: 1, status: 'planned', from_zone_id: 'z', to_facility_id: 'g', leaves_at: iso(-30) },
    { id: 2, status: 'en_route', from_text: 'Pecan Park pickup', to_facility_id: 'g', driver_user_id: 'd1', expected_at: iso(10) },
    { id: 3, status: 'done', to_facility_id: 'g' },
    { id: 4, status: 'loading', from_facility_id: 'p', to_facility_id: 'g', archived_at: iso(1) },
    { id: 5, status: 'arrived', from_facility_id: 'p', to_facility_id: 'g', driver_user_id: 'd2' },
    { id: 6, status: 'loading', from_facility_id: 'p', to_facility_id: 'g', leaves_at: iso(5) },
    { id: 7, status: 'planned', from_text: 'the corner', to_facility_id: 'g' }
  ];
  assert.deepEqual(mapRuns(runs).map((t) => t.id), [1, 2, 5, 6, 7], 'done and withdrawn come off');
  const g1 = runGeometry(runs[0], opts);
  assert.deepEqual(g1.from, [30.265, -97.735], 'a division pickup is its centroid');
  assert.deepEqual(g1.to, [30.2566, -97.7426]);
  assert.equal(g1.vehicle, null);
  assert.deepEqual(g1.line, [g1.from, g1.to]);
  assert.deepEqual(g1.label, [(30.265 + 30.2566) / 2, (-97.735 + -97.7426) / 2], 'no vehicle: the label sits midway');
  assert.equal(g1.state, 'planned');
  const g2 = runGeometry(runs[1], opts);
  assert.equal(g2.from, null, 'words alone are no point');
  assert.deepEqual(g2.vehicle, [30.2590, -97.7420], 'the driver\'s phone two minutes ago is fresh');
  assert.equal(g2.vehicleAt, iso(2));
  assert.deepEqual(g2.line, [g2.vehicle, g2.to], 'with no pickup the line runs from the vehicle');
  assert.deepEqual(g2.label, g2.vehicle);
  assert.equal(g2.state, 'late', 'expected ten minutes ago and not arrived');
  const g5 = runGeometry(runs[4], opts);
  assert.equal(g5.vehicle, null, 'six minutes old is stale (RUN_FRESH_MS ' + RUN_FRESH_MS + ')');
  assert.deepEqual(g5.from, [30.26, -97.74], 'a facility pickup is its spot');
  assert.equal(g5.state, 'arrived');
  assert.equal(runState(runs[5], now), 'late', 'still loading past the planned departure');
  const g7 = runGeometry(runs[6], opts);
  assert.equal(g7.line, null);
  assert.deepEqual(g7.label, g7.to, 'nothing but the destination: the label sits there');
  assert.equal(runGeometry({ status: 'planned' }, opts).label, null, 'no destination on the map: nothing to draw');
});

t('sign in by a code (v73): a mobile number as E.164, the number as people write it, what the box holds, the words', () => {
  assert.equal(phoneE164('512 555 0100'), '+15125550100', 'ten US digits get +1');
  assert.equal(phoneE164('(512) 555-0100'), '+15125550100');
  assert.equal(phoneE164('1 512 555 0100'), '+15125550100', 'eleven with the 1');
  assert.equal(phoneE164('+1 512 555 0100'), '+15125550100');
  assert.equal(phoneE164('+44 7700 900123'), '+447700900123', 'a country code is kept');
  assert.equal(phoneE164('0044 7700 900123'), '+447700900123', '00 is the + written out');
  assert.equal(phoneE164('+1.512.555.0100'), '+15125550100');
  assert.equal(phoneE164('555 0100'), null, 'seven digits is not a mobile number');
  assert.equal(phoneE164('0512 555 0100'), null, 'a US number never starts with 0 or 1');
  assert.equal(phoneE164('1125550100'), null);
  assert.equal(phoneE164('+0 123 456 789'), null, 'a country code never starts with 0');
  assert.equal(phoneE164('+1234567'), null, 'too short with a code');
  assert.equal(phoneE164('+1234567890123456'), null, 'past fifteen digits');
  assert.equal(phoneE164('512 555 01OO'), null, 'letters are not digits');
  assert.equal(phoneE164(''), null);
  assert.equal(phoneE164(null), null);
  assert.equal(phoneDisplay('+15125550100'), '512 555 0100');
  assert.equal(phoneDisplay('15125550100'), '512 555 0100', 'as Supabase keeps it, no +');
  assert.equal(phoneDisplay('+447700900123'), '+447700900123');
  assert.equal(phoneDisplay(''), '');
  assert.deepEqual(signInAddress(' Ana.Lopez@CedarFork.gov '), { email: 'ana.lopez@cedarfork.gov' }, 'an address, lower case');
  assert.deepEqual(signInAddress('(512) 555-0100'), { phone: '+15125550100' });
  assert.match(signInAddress('').error, /email address or your mobile number/);
  assert.match(signInAddress('ana@cedarfork').error, /not complete/);
  assert.match(signInAddress('ana lopez').error, /has an @/);
  assert.match(signInAddress('555 0100').error, /ten digits, like 512 555 0100/);
  assert.equal(accountText({ email: 'ops@mock.local' }), 'ops@mock.local');
  assert.equal(accountText({ phone: '15125550199' }), '512 555 0199', 'an account made with a number');
  assert.equal(accountText(null), '');
  assert.equal(codeSentText({ email: 'ops@mock.local' }), 'A six-digit code went to ops@mock.local. Type it here, or open the link in the email: it signs you in by itself.');
  assert.equal(codeSentText({ phone: '+15125550199' }), 'A text message with a six-digit code went to 512 555 0199.');
  assert.match(codeErrorText('Token has expired or is invalid'), /^That code is not right/);
  assert.match(codeErrorText({ message: 'Email rate limit exceeded' }), /^Too many codes/);
  assert.match(codeErrorText('Unsupported phone provider'), /^Text messages are not set up/);
  assert.match(codeErrorText('Signups not allowed for otp'), /^There is no account/);
  assert.equal(codeErrorText('Failed to fetch'), 'Failed to fetch', 'anything else as it came');
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

t('the replay\'s ranges start at the first position, say so in the menu, and a pick outside them is refused', () => {
  const H = 3600000, M = 60000, now = new Date(2026, 9, 18, 10, 5).getTime();   // local, so the words read as the base shows them
  const day = { now, opened: now - 233 * M, periodStart: now - 125 * M, periodEnd: null, first: now - 205 * M + 37000 };   // opened 06:12, first position 06:40:37, period 2 from 08:00
  assert.deepEqual(replayWindow('all', day), [day.first, now], 'the whole incident starts at the first position, not the opening');
  assert.deepEqual(replayWindow('period', day), [day.periodStart, now], 'a period that started after it keeps its own start');
  assert.deepEqual(replayWindow('hour', day), [now - H, now]);
  assert.equal(replayWindow('all', { ...day, first: null }), null, 'nothing to replay before the first position');
  assert.equal(replayWindow('period', { ...day, periodStart: now - 300 * M, periodEnd: now - 250 * M }), null, 'a closed period before the first position has nothing');
  assert.equal(replayWindowLabel('all', replayWindow('all', day), now), 'Whole incident · from 06:40');
  assert.equal(replayWindowLabel('period', replayWindow('period', day), now), 'This period · from 08:00');
  assert.equal(replayWindowLabel('hour', replayWindow('hour', day), now), 'Last hour');
  assert.equal(replayWindowLabel('hour', replayWindow('hour', { ...day, first: now - 20 * M }), now), 'Last hour · from 09:45', 'cut short, it says so');
  assert.equal(replayWindowLabel('all', null, now), 'Whole incident · no positions yet');
  assert.equal(dayHhmm(now - 24 * H, now), 'yesterday 10:05');
  assert.equal(dayHhmm(now - 48 * H, now), '16 Oct 2026 10:05');
  assert.deepEqual(replayPickCheck(now - 245 * M, day.first, now), { ok: false, words: '06:00 is before the first position, 06:40.' });
  assert.equal(replayPickCheck(now - 205 * M, day.first, now).ok, true, 'the first position\'s own minute, 06:40, is allowed');
  assert.equal(replayPickCheck(now - 206 * M, day.first, now).ok, false, 'the minute before it is not');
  assert.deepEqual(replayPickCheck(now - 24 * H, day.first, now), { ok: false, words: 'Yesterday 10:05 is before the first position, 06:40.' });
  assert.deepEqual(replayPickCheck(now + 55 * M, day.first, now), { ok: false, words: '11:00 has not happened yet.' });
  assert.deepEqual(replayPickCheck(null, day.first, now), { ok: false, words: 'Type a date and a time.' });
  assert.deepEqual(replayPickCheck(now - 35 * M, day.first, now), { ok: true, words: 'Positions run from 06:40 to now, 10:05.' });
  assert.equal(replayPickCheck(now, null, now).ok, false, 'nothing to pick before the first position');
  assert.equal(dayIso(now), '2026-10-18');
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
  assert.equal(periodLabel(p, new Date(2026, 9, 17, 22, 0).getTime()), 'OP 1 · 18:47 to 19:00 · overdue 3h');
  assert.equal(periodLine(p, new Date(2026, 9, 17, 22, 5).getTime()), 'Operational period 1, 18:47 to 19:00 · the planned end passed 3h 5m ago; the next period has not been started');
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
  assert.equal(sceneLine(over[0], 12), 'Okafor (Unit 1): 13h 12m on scene, past 12h');
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

t('what\'s wrong, what you need on an alert (v68): the lists\' order, the note last, the line after a tap', () => {
  assert.equal(ALERT_WRONG.length, 6); assert.equal(ALERT_NEEDS.length, 4);
  assert.equal(alertWords({ wrong: ['injured', 'trapped'], needs: ['medic', 'boat'] }), 'trapped, injured · needs boat, medic');
  assert.equal(alertWords({ wrong: [], needs: ['hands'] }), 'needs more hands');
  assert.equal(alertWords({ wrong: ['in_water'], needs: [], note: '' }), 'in the water');
  assert.equal(alertWords({ note: 'Missing: Okafor' }), 'Missing: Okafor');
  assert.equal(alertWords({ wrong: ['trapped'], note: 'Missing: Okafor' }), 'trapped: Missing: Okafor');
  assert.equal(alertWords({}), ''); assert.equal(alertWords(null), '');
  assert.deepEqual(alertCodes(ALERT_WRONG, ['missing', 'in_water', 'made_up']), ['in_water', 'missing']);
  assert.deepEqual(alertChange({ wrong: [], needs: [] }, { wrong: ['in_water'], needs: ['boat'] }), { added: 'in the water · needs boat', gone: '' });
  assert.deepEqual(alertChange({ wrong: ['trapped', 'injured'], needs: ['rope'] }, { wrong: ['trapped'], needs: [] }), { added: '', gone: 'injured, rope' });
  assert.deepEqual(alertChange({ wrong: ['trapped'], needs: [] }, { wrong: ['trapped'], needs: ['medic'] }), { added: 'needs medic', gone: '' });
  assert.deepEqual(alertChange(null, { wrong: ['cut_off'] }), { added: 'cut off', gone: '' });
});

t('tell the base (v74): three steps, the stuck flag, the words and the order', () => {
  assert.deepEqual(URGENCY_STEPS.map((s) => s[0]), ['now', 'nightfall', 'tomorrow'], 'the codes stay; blocking is not a step');
  assert.equal(stepLabel('nightfall'), 'Before dark');
  assert.equal(stepLabel('blocking'), '', 'the old fourth word is no step');
  assert.equal(urgencyWords('now', true), 'now, stuck');
  assert.equal(urgencyWords('nightfall', false), 'before dark');
  assert.equal(urgencyWords('', true), 'stuck');
  assert.equal(urgencyWords('', false), '');
  assert.equal(STUCK_WORDS.badge, 'Stuck');
  const R = [{ id: 'a', urgency: 'tomorrow' }, { id: 'b', urgency: 'now' }, { id: 'c', urgency: '', blocking: true }, { id: 'd', urgency: 'now', blocking: true }, { id: 'e', urgency: 'nightfall' }, { id: 'f', urgency: '' }];
  assert.deepEqual(R.slice().sort((x, y) => stepRank(x) - stepRank(y)).map((r) => r.id), ['d', 'b', 'e', 'a', 'c', 'f'], 'by step, the stuck one first among equals');
  assert.deepEqual(R.filter(actNow).map((r) => r.id), ['b', 'c', 'd'], 'to act on now: the Now step and every stuck one');
});
t('small items from the re-walks (v48): hazards by urgency, the current stretch, the revisit\'s words', () => {
  const H = [{ id: 'a', urgency: '', created_at: '2026-10-17T20:00:00Z' }, { id: 'b', urgency: 'nightfall', created_at: '2026-10-17T19:00:00Z' }, { id: 'c', urgency: 'blocking', created_at: '2026-10-17T18:00:00Z' }, { id: 'd', urgency: 'now', created_at: '2026-10-17T17:00:00Z' }, { id: 'e', urgency: 'tomorrow', created_at: '2026-10-17T21:00:00Z' }, { id: 'f', urgency: '', created_at: '2026-10-17T22:00:00Z' }];
  assert.deepEqual(sortHazards(H).map((h) => h.id), ['d', 'c', 'b', 'e', 'f', 'a'], 'act on now, blocks, nightfall, can wait, then no word newest first');
  assert.equal(urgencyRank('made up'), 4);
  const now = new Date(2026, 9, 17, 22, 0).getTime();
  const p = { checked_in_at: new Date(2026, 9, 17, 9, 0).toISOString(), checked_out_at: null, stint_at: new Date(2026, 9, 17, 20, 30).toISOString() };
  assert.equal(sceneStart(p), p.stint_at);
  assert.equal(stintText(p, now), '1h 30m', 'the current stretch, not the day');
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

t('bands (v55): what a scan or a typed box gives, the band on a person, last seen and its words', () => {
  assert.deepEqual(bandFromScan('https://clickemt.com/field/?band=CED-013-K2PQ'), { code: 'CED-013-K2PQ' });
  assert.deepEqual(bandFromScan('ced-013-k2pq'), { code: 'CED-013-K2PQ' });
  assert.deepEqual(bandFromScan('13'), { number: 13 });
  assert.deepEqual(bandFromScan('Band 013'), { number: 13 });
  assert.equal(bandFromScan('https://clickemt.com/field/?join=CEDAR7'), null, 'a join link is not a band');
  assert.equal(bandFromScan(''), null);
  assert.equal(bandFromSearch('?mock&band=CED-026-AX2Q'), 'CED-026-AX2Q');
  assert.equal(bandCodeNumber('CED-026-AX2Q'), 26, 'the number read out of the code (v62)');
  assert.equal(bandCodeNumber('ced-013-k2pq'), 13);
  assert.equal(bandCodeNumber('26'), null, 'a bare number is not a code');
  assert.equal(bandCodeNumber(''), null);
  assert.equal(bandLabel({ number: 7 }), 'Band 007');
  assert.equal(bandUrl('CED-013-K2PQ', 'https://clickemt.com/field/'), 'https://clickemt.com/field/?band=CED-013-K2PQ');
  const tags = [{ id: 't1', number: 1, person_id: 'p1', voided_at: null }, { id: 't2', number: 2, person_id: 'p1', voided_at: '2026-10-18T10:00:00Z' }, { id: 't3', number: 3, evacuee_id: 'e1', voided_at: null }];
  assert.equal(tagOf(tags, { personId: 'p1' }).id, 't1', 'the live band, not the voided one');
  assert.equal(tagOf(tags, { evacueeId: 'e1' }).id, 't3');
  assert.equal(tagOf(tags, { personId: 'p9' }), null);
  const now = new Date(2026, 9, 18, 18, 0).getTime();
  const seen = [{ tag_id: 't1', kind: 'enter', zone_id: 'z1', at: new Date(2026, 9, 18, 17, 5).toISOString() }, { tag_id: 't1', kind: 'check_in', at: new Date(2026, 9, 18, 6, 40).toISOString() }, { tag_id: 't3', kind: 'arrive', facility_id: 'f1', at: new Date(2026, 9, 18, 15, 20).toISOString() }];
  const opts = { zoneOf: (id) => ({ z1: { code: 'A-2' } }[id]), facilityOf: (id) => ({ f1: { kind: 'shelter', name: 'High school gym' } }[id]), transportOf: (id) => ({ r1: { kind: 'bus', label: 'Bus 2' } }[id]) };
  assert.equal(lastSeen(seen, ['t1']).kind, 'enter', 'the newest scan of the band');
  assert.equal(lastSeenText(lastSeen(seen, ['t1']), opts), 'seen entering A-2 17:05');
  assert.equal(lastSeenText(lastSeen(seen, ['t3']), opts), 'seen at High school gym 15:20');
  assert.equal(lastSeenText(null), 'not seen');
  assert.equal(seenStale(lastSeen(seen, ['t1']), now), false);
  assert.equal(seenStale(lastSeen(seen, ['t3']), now), true, 'two hours and forty minutes ago is long ago');
  assert.equal(seenWords({ kind: 'board', transport_id: 'r1' }, opts), 'boarding Bus 2');
  assert.equal(seenWords({ kind: 'leave', zone_id: 'zz' }, opts), 'leaving a division');
  assert.equal(seenWords({ kind: 'par' }), 'on the PAR');
  assert.equal(seenGuess({ desk: true }), 'arrive');
  assert.equal(seenGuess({ zone: { code: 'A-2' } }), 'enter');
  assert.equal(seenGuess({ par: true, desk: true }), 'par');
  assert.equal(seenGuess({}), 'check_in');
});

t('a run as a card: the label and where it goes, the times and the seats, the crew\'s own division marked; past three they fold (v66)', () => {
  const fac = (id) => ({ gym: { kind: 'shelter', name: 'High school gym' } }[id]);
  const now = new Date('2026-10-18T18:00:00Z').getTime();
  const bus = { id: 'b3', kind: 'bus', label: 'Bus 3', from_zone_id: 'a1', to_facility_id: 'gym', capacity: 40, status: 'planned', leaves_at: '2026-10-18T18:04:00Z', expected_at: '2026-10-18T18:29:00Z' };
  const ev = [{ transport_id: 'b3', count: 3, status: 'on_the_way', facility_id: 'gym' }];
  const c = runCard(bus, ev, { facilityOf: fac, zoneOf: (id) => ({ a1: { code: 'A-1' } }[id]), zoneId: 'a2', now });
  assert.equal(c.label, 'Bus 3');
  assert.equal(c.to, 'High school gym');
  assert.equal(c.sub, 'leaves ' + new Date(bus.leaves_at).toTimeString().slice(0, 5) + ' · expected ' + new Date(bus.expected_at).toTimeString().slice(0, 5) + ' · 3 of 40');
  assert.equal(c.own, false);
  assert.equal(runCard(bus, ev, { facilityOf: fac, zoneId: 'a1', now }).own, true, 'leaving from the crew\'s own division');
  assert.equal(runCard({ ...bus, capacity: null, to_facility_id: null }, [], { now }).to, 'a facility');
  assert.equal(runCard({ ...bus, capacity: null, to_facility_id: null }, [], { now }).sub.endsWith(' · 0'), true, 'no seats set: the count alone');
  assert.equal(c.title.startsWith('Bus 3 · A-1 → High school gym · leaves '), true);
  const runs = ['r1', 'r2', 'r3', 'r4', 'r5'].map((id) => ({ id }));
  assert.equal(RUN_FOLD, 3);
  assert.deepEqual(foldRuns(runs.slice(0, 3), '', false), { shown: runs.slice(0, 3), hidden: 0 }, 'three show whole');
  assert.deepEqual(foldRuns(runs, '', false), { shown: runs.slice(0, 2), hidden: 3 }, 'past three: the first two and N more');
  assert.deepEqual(foldRuns(runs, 'r4', false), { shown: [runs[0], runs[1], runs[3]], hidden: 2 }, 'the one chosen is never hidden');
  assert.deepEqual(foldRuns(runs, 'r4', true), { shown: runs, hidden: 0 }, 'opened, all of them');
});

t('the header clock reads UTC from the same moment, and the zone has a short name (v59)', () => {
  assert.equal(hhmmUtc('2026-10-18T19:57:00Z'), '19:57');
  assert.equal(hhmmUtc(new Date('2026-10-18T00:05:00Z')), '00:05');
  assert.equal(hhmmUtc(''), '');
  assert.equal(typeof zoneShort(new Date()), 'string');
});

t('a picture by its corners (v67): the box, what is a valid set of corners, and where an overlay lies', () => {
  const c = [[30.2735, -97.7445], [30.2718, -97.7275], [30.2635, -97.7283], [30.2652, -97.7452]];
  assert.deepEqual(cornersBox(c), { south: 30.2635, north: 30.2735, west: -97.7452, east: -97.7275 });
  assert.equal(cornersOk(c), true);
  assert.equal(cornersOk(c.map((p) => p.map(String))), true, 'numbers as strings count');
  assert.equal(cornersOk(c.slice(0, 3)), false);
  assert.equal(cornersOk(null), false);
  assert.equal(cornersOk([[1, 1], [1, 1], [1, 1], [1, 1]]), false, 'no size');
  assert.equal(cornersOk([[91, 0], [1, 2], [0, 2], [0, 1]]), false, 'off the globe');
  assert.deepEqual(boxCorners({ south: 1, west: 2, north: 3, east: 4 }), [[3, 2], [3, 4], [1, 4], [1, 2]]);
  assert.deepEqual(overlayCorners({ corners: c, bounds: { south: 0, west: 0, north: 1, east: 1 } }), c);
  assert.deepEqual(overlayCorners({ corners: null, bounds: { south: 1, west: 2, north: 3, east: 4 } }), [[3, 2], [3, 4], [1, 4], [1, 2]]);
});

t('credentials (v69): the fixed list, the words, a credential\'s standing, the ID\'s, and the chips a person\'s row reads', () => {
  assert.deepEqual(CREDENTIAL_KINDS.map((k) => k[0]), ['licence', 'emt', 'paramedic', 'swift_water', 'boat', 'rope', 'k9', 'hazmat', 'drone', 'other'], 'the SQL check says the same');
  assert.equal(REJECT_REASONS.length, 4);
  assert.equal(credentialLabel({ kind: 'boat' }), 'Boat operator');
  assert.equal(credentialLabel({ kind: 'other', title: 'Wilderness First Responder' }), 'Wilderness First Responder');
  assert.equal(credentialLabel({ kind: 'other', title: '' }), 'Other');
  assert.equal(credentialText({ kind: 'emt' }), 'EMT', 'ic_credential_kind_text says the same');
  assert.equal(credentialText({ kind: 'swift_water' }), 'swift water');
  assert.equal(credentialText({ kind: 'licence' }), "driver's licence");
  assert.equal(credentialText({ kind: 'other', title: ' WFR ' }), 'WFR');
  assert.equal(credentialText({ kind: 'other', title: '' }), 'a credential');
  const now = new Date(2026, 9, 18, 14, 0).getTime();
  assert.equal(credentialExpired({ expires_at: '2025-11-30' }, now), true);
  assert.equal(credentialExpired({ expires_at: '2026-10-18' }, now), false, 'expires at the end of the day');
  assert.equal(credentialExpired({ expires_at: null }, now), false);
  const sent = new Date(2026, 9, 18, 14, 6).toISOString(), decided = new Date(2026, 9, 18, 14, 12).toISOString();
  const creds = [
    { id: 'c1', user_id: 'u1', kind: 'emt', status: 'confirmed', confirmed_at: decided, created_at: sent, reason: '', archived_at: null },
    { id: 'c2', user_id: 'u1', kind: 'boat', status: 'rejected', confirmed_at: decided, created_at: sent, reason: 'expired', expires_at: '2025-11-30', archived_at: null },
    { id: 'c3', user_id: 'u1', kind: 'swift_water', status: 'pending', created_at: new Date(2026, 9, 18, 14, 7).toISOString(), reason: '', archived_at: null },
    { id: 'c4', user_id: 'u1', kind: 'rope', status: 'pending', created_at: sent, reason: '', archived_at: '2026-10-18T13:00:00Z' },
    { id: 'c5', user_id: 'u2', kind: 'emt', status: 'pending', created_at: sent, reason: '', archived_at: null }
  ];
  assert.deepEqual(credentialsOf(creds, 'u1').map((c) => c.id), ['c3', 'c1', 'c2'], 'the live ones, newest first; the withdrawn one is gone');
  assert.equal(credentialOf(credentialsOf(creds, 'u1'), 'emt').id, 'c1');
  assert.equal(credentialOf(credentialsOf(creds, 'u1'), 'k9'), null);
  assert.deepEqual(pendingCredentials(creds).map((c) => c.id), ['c5', 'c3'], 'the queue, oldest first, withdrawn left out');
  assert.equal(credentialState(creds[0], now).state, 'confirmed');
  assert.match(credentialState(creds[0], now).text, /^confirmed by Operations \d\d:\d\d$/);
  assert.equal(credentialState(creds[1], now).text.replace(/\d\d:\d\d/, 'hh:mm'), 'not accepted hh:mm: expired');
  assert.equal(credentialState(creds[1], now).expired, true);
  assert.equal(credentialState(creds[2], now).text.replace(/\d\d:\d\d/, 'hh:mm'), 'pending · sent hh:mm');
  assert.equal(credentialState(creds[2], now).short, 'pending');
  assert.equal(idState(null).state, 'none');
  assert.equal(idState({ full_name: 'Rosa', phone: '' }).state, 'none');
  assert.deepEqual(idState({ full_name: 'Rosa', phone: '512', licence_number: '', photo_path: null, id_source: '' }).state, 'none');
  const given = idState({ full_name: 'Rosa', phone: '512', licence_number: '', photo_path: 'u/licence.jpg', id_source: 'photo' });
  assert.equal(given.state, 'given'); assert.equal(given.text, 'given, not checked'); assert.equal(given.words, 'front photographed · Operations checks it');
  const checked = idState({ full_name: 'Rosa', phone: '512', licence_number: 'X1', photo_path: null, id_source: 'typed', verified_at: decided });
  assert.equal(checked.state, 'checked'); assert.match(checked.text, /^checked ✓ \d\d:\d\d$/); assert.match(checked.words, /^licence checked by Operations/);
  assert.match(idState({ full_name: 'Rosa', phone: '512', licence_number: '', photo_path: null, id_source: '', verified_at: decided }).words, /^checked in person by Operations/);
  // the chips: the lead's words, the account's credentials of each kind, the ones the lead did not tap added
  const typed = { qualifications: ['emt', 'rope'], claimed_by: null };
  assert.deepEqual(personQuals(typed, creds).map(qualChipText), ['Rope', 'EMT'], 'no account on the row: the lead\'s words, plain, in the list\'s order');
  const mine = { qualifications: ['emt', 'rope'], claimed_by: 'u1' };
  assert.deepEqual(personQuals(mine, creds).map(qualChipText), ['Swift water · pending', 'Boat ✗', 'Rope', 'EMT ✓']);
  assert.equal(personQuals(mine, creds).find((x) => x.kind === 'boat').cred.reason, 'expired', 'the reason rides on the chip');
  assert.equal(qualsTextWith(mine, creds), 'swift water (pending), boat (not accepted), rope, EMT ✓', 'the 211\'s words');
  assert.equal(qualsTextWith({ qualifications: [], claimed_by: 'u9' }, creds), '');
});

t('runs that share a point stack: the pills at one spot, the rings on one destination, the dots on one pickup (v75)', () => {
  const gym = [30.2566, -97.7426], a2 = [30.2673, -97.7384], phone = [30.259, -97.7424], er = [30.2497, -97.7342];
  const geos = [
    { vehicle: phone, label: phone, from: null, to: gym },              // Bus 2 on Unit 2's phone, a pickup in words
    { vehicle: phone, label: phone, from: a2, to: gym },                // Van 4 on the same phone, from A-2
    { vehicle: null, label: [30.258, -97.741], from: a2, to: gym },     // Bus 3 on its route, from A-2 as well
    { vehicle: null, label: [30.258, -97.736], from: a2, to: er },      // Ambulance 1 from A-2 to the hospital
    { vehicle: null, label: er, from: null, to: er }                    // a run with no pickup point and no vehicle sits on its destination
  ];
  const s = runStacks(geos);
  assert.deepEqual(s.map((x) => x.pill), [0, 1, 0, 0, 0], 'Bus 2 the lowest pill on the phone, Van 4 above it, the rest alone');
  assert.equal(s[0].stack, s[1].stack, 'the two on the phone share a column');
  assert.notEqual(s[1].stack, s[2].stack);
  assert.deepEqual(s.map((x) => x.ring), [0, 1, 2, 0, 1], 'three rings on the gym, one inside the next; two on the hospital');
  assert.deepEqual(s.map((x) => x.dot), [0, 0, 1, 2, 0], 'the dot on A-2 is Van 4\'s, Bus 3 and Ambulance 1 ring it; words have no dot');
  assert.deepEqual(runStacks([]), []);
});

t('the incident line says what changes, the alarm first; the card has the rest (v76)', () => {
  const now = new Date('2026-10-18T23:08:00-05:00').getTime();
  const period = { number: 1, starts_at: '2026-10-18T19:58:00-05:00', ends_at: '2026-10-18T19:00:00-05:00', closed_at: null, ic_name: 'Dana Ruiz', ops_chief: 'Marcus Bell', safety_officer: 'Priya Natarajan' };
  const units = [{ user_id: 'u1', unit_name: 'Unit 1', role: 'unit', kind: 'engine', status: 'assigned' }, { user_id: 'u2', unit_name: 'Unit 2', role: 'unit', kind: 'boat', status: 'assigned' }, { user_id: 'u3', unit_name: 'Unit 3', role: 'unit', kind: 'other', status: 'available' }];
  const zones = [{ code: 'A-1', status: 'active', assigned_to: 'u1' }, { code: 'A-2', status: 'active', assigned_to: 'u3' }, { code: 'A-3', status: 'cleared' }, { code: 'B-1', status: 'active', assigned_to: 'u2' }, { code: 'B-2', status: 'open' }, { code: 'B-3', status: 'open' }];
  const hazards = [{ id: 'h1', kind: 'Downed power line', note: 'across the park entrance', zone_id: 'z2', created_at: '2026-10-18T22:49:00-05:00', user_id: 'u3' }];
  const line = incidentLine({ period, units, zones, hazards }, now);
  assert.equal(incidentLineText(line), 'Period 1 · overdue 4h 8m · 3 units · 6 divisions, 1 cleared · 1 hazard open');
  assert.deepEqual(line.map((p) => p.kind), ['period', 'alarm', 'count', 'count', 'count']);
  assert.equal(incidentLineText(incidentLine({ period: { ...period, ends_at: '2026-10-19T01:00:00-05:00' }, units, zones, hazards: [] }, now)), 'Period 1 · to 01:00 · 3 units · 6 divisions, 1 cleared', 'nothing overdue: the planned end, and no hazard piece');
  assert.equal(incidentLineText(incidentLine({ period: null, units: [], zones: [] }, now)), 'No period set · 0 units · 0 divisions');
  const f = incidentFacts({ incident: { name: 'Cedar Fork Flooding', created_at: '2026-10-18T19:58:00-05:00', base_name: 'Cedar Fork High School', lead_agency: 'Cedar Fork Fire Department' }, period, units, zones, hazards, memberOf: (id) => units.find((u) => u.user_id === id), zoneOf: (id) => (id === 'z2' ? zones[1] : null) }, now);
  assert.equal(f.opened, '19:58'); assert.equal(f.base, 'Cedar Fork High School'); assert.equal(f.agency, 'Cedar Fork Fire Department');
  assert.deepEqual(f.period, { number: 1, started: '19:58', plannedTo: '19:00', overdue: '4h 8m', left: '', closed: '' });
  assert.deepEqual(f.command, { ic: 'Dana Ruiz', ops: 'Marcus Bell', safety: 'Priya Natarajan' });
  assert.equal(f.units.statusWords, '2 assigned, 1 available');
  assert.deepEqual(f.units.list.map((u) => u.name + (u.kind ? ', ' + u.kind : '') + ', in ' + u.where.join(', ')), ['Unit 1, engine, in A-1', 'Unit 2, boat crew, in B-1', 'Unit 3, in A-2']);
  assert.deepEqual(f.divisions, { n: 6, counts: { active: 3, primary: 0, cleared: 1, open: 2 } });
  assert.deepEqual(f.hazards[0], { id: 'h1', kind: 'Downed power line', note: 'across the park entrance', zone: 'A-2', at: '22:49', by: 'Unit 3' });
  const quiet = incidentFacts({ incident: null, period: { ...period, ends_at: '2026-10-19T01:00:00-05:00' }, units: units.map((u) => ({ ...u, status: 'assigned' })), zones, hazards: [] }, now);
  assert.equal(quiet.period.left, '1h 52m'); assert.equal(quiet.units.statusWords, 'all assigned'); assert.equal(quiet.name, '');
  assert.equal(incidentFacts({ incident: null, period: null }, now).period, null);
});

