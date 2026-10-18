// Checks for js/shared/briefings.js, the ICS-100 briefings assembled from the data. Run: node dev/test-briefings.mjs
// A stub stands in for the data module: the same read methods, a river town three hours in.
import assert from 'node:assert/strict';
import { orgTree, orgLines, agencyReps, agencyRepLines, hurtLines, hurtText, nearestMedic, fieldBriefing, deploymentLines, whoToAsk, onSceneLine, SPAN_MAX } from '../js/shared/briefings.js';
import { unitsForRequest, kindsAsked, transferText, commandLines, latLngsToPolygon, unitWithKind, FACILITY_KINDS, facilityKind } from '../js/shared/rules.js';

let n = 0;
function t(name, fn) { fn(); n++; console.log('ok', name); }

const square = (lat, lng) => latLngsToPolygon([[lat, lng], [lat, lng + 0.004], [lat + 0.003, lng + 0.004], [lat + 0.003, lng]]);
const U = { ops: 'u-ops', u1: 'u-1', u2: 'u-2', u3: 'u-3', u4: 'u-4' };
const at = (min) => new Date(new Date(2026, 9, 17, 12, 0).getTime() - min * 60000).toISOString();   // local time, as the words are
function stub({ zones, units, people, facilities, channels, period, requests, commands, positions, hazards, objectives, incident, structures } = {}) {
  const inc = Object.assign({ id: 'inc', name: 'Cedar Fork Flooding', base_name: 'Cedar Fork High School', lead_agency: 'Cedar Fork Fire Department', created_at: at(190), channels: channels || [{ use: 'Command', channel: 'CMD 1' }, { use: 'Tactical, Division A', channel: 'TAC 2' }, { use: 'Emergency traffic', channel: 'TAC 9' }] }, incident || {});
  const p = period === null ? null : Object.assign({ id: 'p1', number: 1, starts_at: at(190), ends_at: at(-420), ic_name: 'Dana Ruiz', ops_chief: 'Marcus Bell', safety_officer: 'Priya Natarajan', planning_chief: 'Theresa Okafor', logistics_chief: 'Sam Whitaker', finance_chief: '', pio: 'Lena Marsh', liaison: 'Tomás Herrera', unified: '', notes: 'Nobody enters moving water. PFDs on near water.', sitrep: { summary: 'Cedar Fork crested at 04:30.' } }, period || {});
  const Z = zones || [
    { id: 'z1', code: 'A-1', name: 'Riverside', priority: 1, status: 'active', assigned_to: U.u1, structures: 24, cleared: 9, supervisor: 'Lt. Okafor', channel: 'TAC 2', branch: '', work_assignment: 'Primary search of every structure', instructions: 'Stay out of moving water', objective_id: 'o1', polygon: square(30.2665, -97.7345) },
    { id: 'z2', code: 'A-2', name: 'Pecan Mobile Home Park', priority: 1, status: 'active', assigned_to: U.u3, structures: 18, cleared: 6, supervisor: 'Hale', channel: 'TAC 2', branch: '', work_assignment: '', instructions: '', objective_id: 'o1', polygon: square(30.2660, -97.7410) },
    { id: 'z3', code: 'A-3', name: 'School', priority: 2, status: 'cleared', assigned_to: null, structures: 6, cleared: 6, supervisor: '', channel: '', branch: '', polygon: square(30.2695, -97.7420) },
    { id: 'z4', code: 'B-1', name: 'Mill Street', priority: 2, status: 'active', assigned_to: U.u2, structures: 15, cleared: 2, supervisor: 'Nguyen', channel: 'TAC 3', branch: '', polygon: square(30.2600, -97.7440) },
    { id: 'z5', code: 'B-2', name: 'Bee Creek', priority: 2, status: 'open', assigned_to: null, structures: 9, cleared: 0, supervisor: '', channel: '', branch: '', polygon: square(30.2578, -97.7500) }
  ];
  const M = units || [
    { user_id: U.ops, role: 'ops', unit_name: 'Operations', status: 'available', agency: 'Cedar Fork Fire Department', kind: '', crew_count: null },
    { user_id: U.u1, role: 'unit', unit_name: 'Unit 1', status: 'assigned', agency: 'Cedar Fork Fire Department', kind: 'engine', crew: 'Ramirez, Okafor', crew_count: 2 },
    { user_id: U.u2, role: 'unit', unit_name: 'Unit 2', status: 'assigned', agency: 'Travis County Rescue', kind: 'boat', crew: 'Nguyen, Patel', crew_count: 2 },
    { user_id: U.u3, role: 'unit', unit_name: 'Unit 3', status: 'assigned', agency: 'Cedar Fork Fire Department', kind: 'swift_water', crew: 'Hale, Dominguez', crew_count: 2 }
  ];
  const P = people || [
    { id: 'p1', user_id: U.u1, name: 'Ramirez', qualifications: ['swift_water', 'emt'], checked_in_at: at(170), checked_out_at: null, archived_at: null },
    { id: 'p2', user_id: U.u1, name: 'Okafor', qualifications: ['paramedic', 'boat'], checked_in_at: at(170), checked_out_at: null, archived_at: null },
    { id: 'p3', user_id: U.u2, name: 'Nguyen', qualifications: ['boat'], checked_in_at: at(168), checked_out_at: null, archived_at: null },
    { id: 'p4', user_id: U.u2, name: 'Patel', qualifications: ['emt', 'rope'], checked_in_at: at(168), checked_out_at: null, archived_at: null },
    { id: 'p5', user_id: U.u3, name: 'Hale', qualifications: ['swift_water', 'emt'], checked_in_at: at(165), checked_out_at: null, archived_at: null },
    { id: 'p6', user_id: U.u3, name: 'Dominguez', qualifications: ['paramedic'], checked_in_at: at(165), checked_out_at: null, archived_at: null }
  ];
  const F = facilities || [
    { id: 'f1', kind: 'icp', name: 'High school, front office', lat: 30.2562, lng: -97.7415, notes: '', contact: 'CMD 1', closed_at: null },
    { id: 'f2', kind: 'staging', name: 'High school east lot', lat: 30.2556, lng: -97.7400, notes: 'Come by Bee Creek Rd, park in the east lot', contact: 'CMD 1', closed_at: null },
    { id: 'f3', kind: 'hospital', name: 'Dell Seton Medical Center', lat: 30.2780, lng: -97.7338, notes: 'Trauma center', contact: '512 555 0100', closed_at: null },
    { id: 'f4', kind: 'pod', name: 'Fairgrounds gate', lat: 30.2588, lng: -97.7352, notes: 'Water and ice from 14:00', contact: '', closed_at: null }
  ];
  const POS = positions || [{ user_id: U.u1, lat: 30.2681, lng: -97.7318 }, { user_id: U.u2, lat: 30.2614, lng: -97.7420 }, { user_id: U.u3, lat: 30.2674, lng: -97.7384 }];
  const H = hazards || [{ id: 'h1', kind: 'Downed power line', note: 'Line across the park entrance', zone_id: 'z2' }];
  const O = objectives || [{ id: 'o1', number: 1, text: 'Primary search of every structure north of the river by 19:00', done_at: null }, { id: 'o2', number: 2, text: 'Keep the bridge approach closed', done_at: null }];
  const R = requests || [{ id: 'r1', kind: 'water', what: 'boat crew', quantity: 2, zone_id: 'z2', urgency: 'now', status: 'asked', lat: null, lng: null }];
  const C = commands || [{ id: 'c1', ic_name: 'Dana Ruiz', from_name: '', started_at: at(189), ended_at: null }];
  const AG = [{ id: 'a1', period_id: 'p1', agency: 'Travis County Rescue', name: 'Sam Whitaker', phone: '512 555 0150', archived_at: null }];
  return {
    incident: inc,
    currentPeriod: () => p,
    zones: () => Z, zone: (id) => Z.find((z) => z.id === id) || null,
    units: () => M.filter((m) => m.role === 'unit'), members: () => M, member: (id) => M.find((m) => m.user_id === id) || null,
    activeUnits: () => M.filter((m) => m.role === 'unit' && m.status !== 'checked_out'),
    peopleInField: () => M.filter((m) => m.role === 'unit' && m.status !== 'checked_out' && m.status !== 'out_of_service').reduce((s, m) => s + (m.crew_count || 0), 0),
    people: () => P, unitPeople: (uid) => P.filter((x) => x.user_id === uid),
    facilities: () => F.filter((f) => !f.closed_at), channels: () => inc.channels,
    positions: () => POS, position: (uid) => POS.find((x) => x.user_id === uid) || null,
    hazards: () => H, objectives: () => O, objective: (id) => O.find((o) => o.id === id) || null,
    openRequests: () => R.filter((r) => ['asked', 'approved', 'ordered'].includes(r.status)),
    commands: () => C, currentCommand: () => C.find((c) => !c.ended_at) || null,
    periodAgencies: () => AG, structures: () => structures || []
  };
}

t('the org chart counts Operations over its divisions and the supervisors over their people, nothing over seven', () => {
  const o = orgTree(stub());
  assert.equal(o.ic.name, 'Dana Ruiz');
  assert.equal(o.staff.map((s) => s.name).join('|'), 'Priya Natarajan|Lena Marsh|Tomás Herrera');
  const ops = o.general.find((g) => g.key === 'ops');
  assert.equal(ops.count, 4, 'four divisions not cleared report to Operations');
  assert.equal(ops.over, false);
  assert.equal(o.loose.length, 5);
  assert.equal(o.loose[1].count, 2);
  assert.deepEqual(o.warnings, []);
  assert.ok(orgLines(stub()).some((l) => /Division A-2 Pecan Mobile Home Park · supervisor Hale · Unit 3, swift-water team · Hale, Dominguez · 1 : 2/.test(l)));
});

t('past seven divisions the count turns orange and the warning names the number; branches bring it down', () => {
  const more = stub().zones().concat([4, 5, 6, 7].map((i) => ({ id: 'zx' + i, code: 'C-' + i, name: '', priority: 3, status: 'open', assigned_to: null, structures: 0, cleared: 0, supervisor: '', channel: '', branch: '', polygon: square(30.25 + i / 1000, -97.75) })));
  const o = orgTree(stub({ zones: more }));
  const ops = o.general.find((g) => g.key === 'ops');
  assert.equal(ops.count, 8);
  assert.equal(ops.over, true);
  assert.deepEqual(o.warnings, ['Operations is at 1 : 8']);
  assert.ok(orgLines(stub({ zones: more })).some((l) => l.startsWith('! Operations is at 1 : 8')));
  for (const z of more) z.branch = z.code[0] === 'C' ? 'South' : 'North';
  const o2 = orgTree(stub({ zones: more }));
  assert.equal(o2.general.find((g) => g.key === 'ops').count, 2, 'two branches report to Operations');
  assert.deepEqual(o2.branches.map((b) => b.name + ' ' + b.count), ['North 4', 'South 4']);
  assert.deepEqual(o2.warnings, []);
  assert.ok(orgLines(stub({ zones: more })).some((l) => l === 'Branch North · 1 : 4'));
});

t('a unit with more than seven people is marked too', () => {
  const crowd = Array.from({ length: 9 }, (_, i) => ({ id: 'q' + i, user_id: U.u1, name: 'P' + i, qualifications: [], checked_in_at: at(100), checked_out_at: null, archived_at: null }));
  const o = orgTree(stub({ people: crowd }));
  assert.equal(o.loose[0].count, 9);
  assert.equal(o.loose[0].over, true);
  assert.deepEqual(o.warnings, ['Unit 1 has 9 people (1 : 9)']);
  assert.equal(SPAN_MAX, 7);
});

t('the agency representatives are one row per agency on scene, the lead agency first without inputs, the saved names filled in', () => {
  const rows = agencyReps(stub(), { id: 'p1' });
  assert.deepEqual(rows.map((r) => [r.agency, r.lead, r.name]), [['Cedar Fork Fire Department', true, ''], ['Travis County Rescue', false, 'Sam Whitaker']]);
  assert.deepEqual(agencyRepLines(stub(), { id: 'p1' }), ['Travis County Rescue: Sam Whitaker · 512 555 0150']);
});

t('if someone is hurt: the medic on the unit, the emergency channel, the nearest hospital with its distance', () => {
  const d = stub();
  const L = hurtLines(d, { unit: d.member(U.u3), at: [30.2674, -97.7384] });
  assert.equal(L.length, 4);
  assert.equal(L[0].text, 'Medic on your unit: Dominguez, paramedic. Hale is an EMT.');
  assert.equal(L[0].warn, undefined);
  assert.ok(L[1].text.startsWith('Call it on TAC 9, emergency traffic'));
  assert.ok(/^Nearest hospital: Dell Seton Medical Center, 0\.8 mi\. Trauma center\. 512 555 0100\. No ambulance on scene/.test(L[2].text), L[2].text);
  assert.ok(L[2].directions.includes('30.278,-97.7338'));
  assert.ok(L[3].text.includes('nobody hurt, no equipment damaged'));
  assert.equal(hurtText(d, { unit: d.member(U.u3), at: [30.2674, -97.7384] })[0], L[0].text);
});

t('with no medic on the unit the line goes orange and names the nearest one; with no hospital placed, so does that line', () => {
  const people = stub().people().filter((p) => p.user_id !== U.u3).concat([{ id: 'p7', user_id: U.u3, name: 'Novak', qualifications: ['boat'], checked_in_at: at(10), checked_out_at: null, archived_at: null }]);
  const d = stub({ people, facilities: stub().facilities().filter((f) => f.kind !== 'hospital') });
  const L = hurtLines(d, { unit: d.member(U.u3), at: [30.2674, -97.7384] });
  assert.equal(L[0].warn, true);
  assert.ok(/^No medic on Unit 3\. Nearest medic: Unit 1, Okafor \(boat, paramedic\), in A-1, 0\.4 mi\.$/.test(L[0].text), L[0].text);
  assert.equal(L[2].warn, true);
  assert.ok(L[2].text.startsWith('No hospital placed on the map'));
  assert.ok(hurtText(d, { unit: d.member(U.u3), at: [30.2674, -97.7384] })[0].startsWith('! No medic'));
  const near = nearestMedic(d, { exclude: U.u3, at: [30.2674, -97.7384] });
  assert.equal(near.person.name, 'Okafor');
});

t('an ambulance on scene is named with its distance', () => {
  const units = stub().units().concat([{ user_id: U.u4, role: 'unit', unit_name: 'Medic 7', status: 'available', agency: 'Travis County EMS', kind: 'ambulance', crew: '', crew_count: 2 }]);
  const d = stub({ units, positions: stub().positions().concat([{ user_id: U.u4, lat: 30.2556, lng: -97.7400 }]) });
  const L = hurtLines(d, { unit: d.member(U.u3), at: [30.2674, -97.7384] });
  assert.ok(/Medic 7 \(ambulance\) at staging, 0\.8 mi\.$/.test(L[2].text), L[2].text);
});

t('the shift card carries the period\'s hours on scene, and warns the crew past it (v47)', () => {
  const d = stub();
  const S = fieldBriefing(d, { now: new Date(at(0)).getTime(), me: d.member(U.u3), at: [30.2674, -97.7384] }).find((s) => s.key === 'shift');
  assert.ok(/ Safety is told past 12 hours on scene\. Check out from the menu/.test(S.text), S.text);
  assert.equal(S.warn, false);
  const over = fieldBriefing(stub({ period: { scene_hours: 2 } }), { now: new Date(at(0)).getTime(), me: d.member(U.u3), at: [30.2674, -97.7384] }).find((s) => s.key === 'shift');
  assert.ok(/Your crew has been on scene 2 h 45 min, past the period's 2 hours: Safety sees it; say when you need relief\./.test(over.text), over.text);
  assert.equal(over.warn, true);
  const off = fieldBriefing(stub({ period: { scene_hours: 0 } }), { now: new Date(at(0)).getTime(), me: d.member(U.u3), at: [30.2674, -97.7384] }).find((s) => s.key === 'shift');
  assert.ok(!/Safety/.test(off.text), off.text);
});

t('your briefing has the eight ICS-100 items, every line from the data', () => {
  const d = stub();
  const S = fieldBriefing(d, { now: new Date(at(0)).getTime(), me: d.member(U.u3), at: [30.2674, -97.7384] });
  assert.deepEqual(S.map((s) => s.key), ['situation', 'job', 'with', 'area', 'radio', 'supplies', 'shift', 'safety']);
  assert.equal(S[0].text, 'Cedar Fork Flooding, OP 1 until 19:00. Cedar Fork crested at 04:30. 5 divisions, 3 units, 1 cleared. 1 hazard open: downed power line (Line across the park entrance) in A-2.');
  assert.equal(S[1].lead, 'Division A-2, Pecan Mobile Home Park.');
  assert.equal(S[1].text, 'No work assignment written yet; Operations will say. Supervisor: Hale. Priority 1. Objective 1: Primary search of every structure north of the river by 19:00.');
  assert.equal(S[2].text, 'On Unit 3: Hale (swift water, EMT), Dominguez (paramedic). Next door: Unit 1 in A-1, Unit 2 in B-1. Operations: Marcus Bell at High school, front office.');
  assert.equal(S[3].text, 'A-2 on the map, 18 structures, 6 cleared. No boat ramp on the map yet; ask Operations where to put in. Staging: High school east lot, 0.8 mi.');   // a swift-water crew is told where to put in (v28)
  assert.equal(S[3].action, 'map');
  assert.equal(S[4].text, 'TAC 2 for your division. Command on CMD 1. Emergency traffic on TAC 9. Plain English, no codes.');
  assert.ok(S[5].text.includes('Ask for something') && S[5].text.includes('Fairgrounds gate: Water and ice from 14:00.'));
  assert.ok(S[6].text.startsWith('This period ends 19:00; the next crew is briefed at staging.'));
  assert.equal(S[7].lead, 'Nobody enters moving water. PFDs on near water.');
  assert.ok(S[7].warn && S[7].text.startsWith('Hazard open: downed power line, Line across the park entrance.'));
});

t('a water crew is told the nearest boat ramp under Work area and the rotation under Safety (v28)', () => {
  const d = stub({ facilities: stub().facilities().concat([{ id: 'f9', kind: 'ramp', name: 'Low-water crossing ramp', lat: 30.2612, lng: -97.7455, notes: '', contact: '', closed_at: null }]), period: { rotation_minutes: 45 } });
  const S = fieldBriefing(d, { now: new Date(at(0)).getTime(), me: d.member(U.u2), at: [30.2614, -97.7420] });
  const area = S.find((x) => x.key === 'area'), safety = S.find((x) => x.key === 'safety');
  assert.ok(/^B-1 on the map, 15 structures, 2 cleared\. Boat ramp: Low-water crossing ramp, [\d.]+ mi\. Staging:/.test(area.text), area.text);
  assert.ok(safety.text.includes('Time in the water: crews out of the water every 45 minutes; the phone nudges you past it.'), safety.text);
  const engine = fieldBriefing(d, { now: new Date(at(0)).getTime(), me: d.member(U.u1), at: [30.2681, -97.7318] }).find((x) => x.key === 'area');
  assert.ok(!/Boat ramp/.test(engine.text), engine.text);
});

t('a unit with no assignment is told to stay where Operations put it, with staging as the fallback (v42)', () => {
  const d = stub();
  const S = fieldBriefing(d, { now: new Date(at(0)).getTime(), me: { user_id: 'nobody', unit_name: 'Unit 9', role: 'unit', status: 'available', kind: '' }, at: null });
  assert.equal(S[1].lead, 'No assignment yet.');
  assert.equal(S[1].text, 'Operations assigns divisions from the base. Stay where Operations put you; if you have nowhere yet, staging is High school east lot.');
  assert.ok(S[2].text.startsWith('On Unit 9: nobody listed yet'));
  const one = fieldBriefing(d, { now: new Date(at(0)).getTime(), me: { user_id: 'nobody', unit_name: 'SO 14', role: 'unit', status: 'available', kind: 'other', crew_count: 1 }, at: null });
  assert.ok(one[2].text.startsWith('On SO 14: you alone.'), one[2].text);
});

t('a shelter desk\'s job is the people at its shelter, not staging (v26)', () => {
  const F = stub().facilities().concat([{ id: 'f5', kind: 'shelter', name: 'High school gym', lat: 30.2566, lng: -97.7426, notes: '', contact: '', closed_at: null, beds: 60, expected: 'Bus 2, 12 people, 17:30' }]);
  const d = stub({ facilities: F });
  d.facility = (id) => F.find((f) => f.id === id) || null;
  d.evacuees = () => [{ id: 'e1', label: 'Okonkwo family', count: 5, needs: [], status: 'here', facility_id: 'f5' }, { id: 'e2', label: 'family of 4', count: 4, needs: ['pets'], status: 'on_the_way', facility_id: 'f5' }];
  const S = fieldBriefing(d, { now: new Date(at(0)).getTime(), me: { user_id: 'desk', unit_name: 'Gym desk', role: 'unit', status: 'available', kind: 'shelter_desk', facility_id: 'f5' }, at: null });
  assert.equal(S[1].lead, 'People here at High school gym.');
  assert.ok(S[1].text.includes('They\'re here') && S[1].text.endsWith('Now: 5 of 60 beds, 1 record on the way, expected Bus 2, 12 people, 17:30.') && !S[1].text.includes('staging'), S[1].text);
  assert.ok(S[3].text.startsWith('High school gym It is on the map.') || S[3].text.startsWith('High school gym · '), S[3].text);   // the desk's work area is its shelter (v42)
});

t('the deployment lines on the join card: incident, where to check in, assignment, when, how to get there, radio, bring', () => {
  const d = stub();
  const L = deploymentLines(d, new Date(at(0)));
  assert.deepEqual(L.map((l) => l[0]), ['Incident', 'Check in at', 'Your assignment', 'Report by', 'Getting there', 'Radio', 'Safety', 'Bring']);   // Safety and Bring told apart (v43)
  assert.ok(L[0][1].startsWith('Cedar Fork Flooding · lead agency Cedar Fork Fire Department · IC Dana Ruiz · opened '));
  assert.ok(L[1][1].startsWith('Staging, High school east lot · Come by Bee Creek Rd, park in the east lot · check in on your phone'));
  assert.equal(L[2][1], 'Given at check-in by Operations. The period\'s objectives: 1. Primary search of every structure north of the river by 19:00; 2. Keep the bridge approach closed. Needed now: 2 boat crew for A-2.');
  assert.ok(/^19:00 on .* for the operational period 2 briefing at staging \(OP 1 runs \d\d:\d\d to 19:00\)$/.test(L[3][1]), L[3][1]);
  assert.equal(L[4][1], 'High school east lot · Come by Bee Creek Rd, park in the east lot · for a satnav 30.25560, -97.74000 · directions open from Nearby on your phone once you have checked in');
  assert.equal(L[6][1], 'Nobody enters moving water. PFDs on near water.');
  assert.equal(L[7][1], 'not set; ask at check-in');
  assert.equal(deploymentLines(stub({ period: { bring: 'PFDs, dry bags' } }), new Date(at(0)))[7][1], 'PFDs, dry bags');
  assert.equal(L[5][1], 'Command CMD 1 · Tactical, Division A TAC 2 · Emergency traffic TAC 9 · plain English, no codes');
  assert.equal(L[6][1], 'Nobody enters moving water. PFDs on near water.');
  assert.equal(whoToAsk(d), 'Staging: Sam Whitaker (Logistics) · Operations: Marcus Bell · Safety: Priya Natarajan · Liaison, other agencies: Tomás Herrera');
  const later = deploymentLines(d, new Date(at(-600)));
  assert.ok(later[3][1].startsWith('Now:'), 'past the planned end, report now');
  const bare = deploymentLines(stub({ facilities: [], period: { notes: '' }, incident: { channels: [] } }), new Date(at(0)));
  assert.equal(bare[1][1], 'Base, Cedar Fork High School · check in on your phone with the code, then find the staging manager');
  assert.ok(bare[5][1].startsWith('No communications plan set yet') && bare[6][1].startsWith('No safety message written') && bare[7][1].startsWith('not set; ask at check-in'), bare[6][1] + ' | ' + bare[7][1]);   // Safety and Bring told apart (v43)
});

t('a request finds the units of its kind on scene, nearest to its division first', () => {
  const d = stub();
  assert.deepEqual(kindsAsked({ what: 'boat crew', kind: 'water' }), ['boat']);
  assert.deepEqual(kindsAsked({ what: 'team', kind: 'water' }), ['boat', 'swift_water', 'high_water']);
  assert.deepEqual(kindsAsked({ what: 'fuel truck', kind: 'fuel' }), []);
  const m = unitsForRequest({ what: 'team', kind: 'water', zone_id: 'z2' }, { units: d.units(), zones: d.zones(), positions: d.positions() });
  assert.deepEqual(m.map((x) => x.unit.unit_name), ['Unit 3', 'Unit 2'], 'Unit 3 stands in A-2, Unit 2 is at the bridge');
  assert.equal(onSceneLine(m), 'Unit 3, swift-water team on A-2, 193 ft · Unit 2, boat crew on B-1, 0.5 mi');
  assert.equal(unitWithKind(d.member(U.u2)), 'Unit 2, boat crew');
  assert.equal(unitWithKind(d.member(U.ops)), 'Operations');
});

t('the transfer message and the command lines read the same everywhere', () => {
  assert.equal(transferText('Marcus Bell', 'Jo Castillo', '14:20'), 'Command transferred to Marcus Bell at 14:20. Operations Section Chief is Jo Castillo. Your assignment, your division and your channel do not change.');
  assert.equal(transferText('Marcus Bell', '', ''), 'Command transferred to Marcus Bell. Your assignment, your division and your channel do not change.');
  const lines = commandLines([{ ic_name: 'Marcus Bell', from_name: 'Dana Ruiz', started_at: at(0), ended_at: null }, { ic_name: 'Dana Ruiz', from_name: '', started_at: at(189), ended_at: at(0) }]);
  assert.equal(lines.length, 2);
  assert.ok(/^Dana Ruiz · \d\d:\d\d to \d\d:\d\d$/.test(lines[0]), lines[0]);
  assert.ok(/^Marcus Bell · since \d\d:\d\d, from Dana Ruiz$/.test(lines[1]), lines[1]);
});

t('Camp, Helibase and Boat ramp are facility kinds, every kind with its own letter', () => {
  assert.equal(facilityKind('camp')[1], 'Camp');
  assert.equal(facilityKind('helibase')[2], 'HB');
  assert.equal(facilityKind('ramp')[1], 'Boat ramp');
  assert.equal(facilityKind('ramp')[2], 'BR');
  assert.equal(new Set(FACILITY_KINDS.map((k) => k[2])).size, FACILITY_KINDS.length);
  assert.equal(new Set(FACILITY_KINDS.map((k) => k[0])).size, FACILITY_KINDS.length);
});

console.log(`${n} checks passed`);

t('past its planned end the phone\'s briefing says so and tells the crew to stay on (v40)', () => {
  const d = stub();
  const late = new Date(2026, 9, 17, 22, 0).getTime();
  const S = fieldBriefing(d, { now: late, me: d.member(U.u3), at: [30.2674, -97.7384] });
  assert.ok(S[0].text.startsWith('Cedar Fork Flooding, OP 1, planned end 19:00 has passed.'), S[0].text);
  assert.ok(S[6].text.startsWith('This period was to end 19:00, 3 h ago; stay on until Operations starts the next period, when the next crew is briefed at staging.'), S[6].text);
});
