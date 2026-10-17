// The ICS-100 briefings, assembled from the data and never typed: the organization chart (ICS 207)
// with its span of control, a unit's own briefing on the phone, what to do if someone is hurt (the
// phone's card and the 204's medical lines), the deployment lines on the join card, and the agency
// representatives the Liaison Officer keeps. No DOM and no network: every function takes the data
// module's read API (or anything with the same read methods, as the Node test does) and returns
// plain lines, so the base, the phone and the tests all say the same things.
import { hhmm, unitLabel, unitWithKind, centroid, distanceM, milesText, nearestFacility, personOn, qualsText, agenciesOn, latLngText, STATUS_LABEL, directionsUrl, placeCounts, bedsText, WATER_KINDS, rotationText } from './rules.js';

// ICS-100: one supervisor to three to seven people, five being best. Past seven the count turns orange.
export const SPAN_MAX = 7;

const on = (u) => u.status !== 'checked_out';
const unitPeopleOn = (data, u) => data.unitPeople(u.user_id).filter(personOn);
const channelFor = (channels, re) => (channels.find((c) => re.test(c.use || '')) || {}).channel || '';
const sentence = (s) => { const t = (s || '').trim(); return t ? (/[.!?]$/.test(t) ? t : t + '.') : ''; };

// ---- the organization (ICS 207), counted where it is already known: the IC over the staff,
// Operations over its branches or divisions, a branch over its divisions, a supervisor over the
// unit's people. A branch is a word on a division; divisions with none report straight to Operations.
export function orgTree(data) {
  const inc = data.incident, p = data.currentPeriod() || {};
  const zones = data.zones(), units = data.units().filter(on), channels = data.channels();
  const warnings = [];
  const division = (z) => {
    const unit = z.assigned_to ? data.member(z.assigned_to) : null;
    const people = unit ? unitPeopleOn(data, unit) : [];
    const count = unit ? (people.length || unit.crew_count || 0) : 0;
    const over = count > SPAN_MAX;
    if (over) warnings.push(`${unitLabel(unit)} has ${count} people (1 : ${count})`);
    return { zone: z, unit, people: people.map((x) => x.name), count, over, cleared: z.status === 'cleared' };
  };
  const live = zones.filter((z) => z.status !== 'cleared');
  const byBranch = new Map();
  for (const z of zones) { const b = (z.branch || '').trim(); if (!byBranch.has(b)) byBranch.set(b, []); byBranch.get(b).push(division(z)); }
  const branches = [...byBranch.entries()].filter(([name]) => name).map(([name, divisions]) => {
    const count = divisions.filter((d) => !d.cleared).length;
    const over = count > SPAN_MAX;
    if (over) warnings.push(`Branch ${name} is at 1 : ${count}`);
    return { name, divisions, count, over };
  });
  const loose = byBranch.get('') || [];
  const opsCount = branches.length + loose.filter((d) => !d.cleared).length;
  const opsOver = opsCount > SPAN_MAX;
  if (opsOver) warnings.unshift(`Operations is at 1 : ${opsCount}`);
  const staff = [['Safety Officer', p.safety_officer], ['Public Information Officer', p.pio], ['Liaison Officer', p.liaison]].map(([seat, name]) => ({ seat, name: name || '' }));
  const openReq = data.openRequests().length;
  const general = [
    { key: 'ops', seat: 'Operations', name: p.ops_chief || '', count: opsCount, over: opsOver, note: `${live.length} division${live.length === 1 ? '' : 's'} · ${units.length} unit${units.length === 1 ? '' : 's'} · ${data.peopleInField()} people` + (branches.length ? ` · ${branches.length} branch${branches.length === 1 ? '' : 'es'}` : '') },
    { key: 'planning', seat: 'Planning', name: p.planning_chief || '', count: 0, over: false, note: 'situation, resources, the 209' },
    { key: 'logistics', seat: 'Logistics', name: p.logistics_chief || '', count: 0, over: false, note: openReq ? `${openReq} request${openReq === 1 ? '' : 's'} open` : 'no requests open' },
    { key: 'finance', seat: 'Finance / Admin', name: p.finance_chief || '', count: 0, over: false, note: p.finance_chief ? 'hours and claims' : 'hours and claims go to the IC' }
  ];
  const icCount = staff.filter((s) => s.name).length + general.filter((g) => g.name).length;
  return {
    incident: inc, period: p, ic: { name: p.ic_name || '', agency: inc.lead_agency || '', unified: p.unified || '', count: icCount },
    staff, general, branches, loose, warnings, channels
  };
}
// the 207 as lines, for the IAP and the copied text
export function orgLines(data) {
  const t = orgTree(data);
  const L = [];
  L.push('Incident Commander: ' + (t.ic.name || 'not set') + (t.ic.agency ? ' (' + t.ic.agency + ')' : '') + (t.ic.unified ? ' · unified command with ' + t.ic.unified : ''));
  for (const s of t.staff) L.push(`${s.seat}: ${s.name || 'not set'}`);
  for (const g of t.general) L.push(`${g.seat} Section Chief: ${g.name || 'not set'}` + (g.key === 'ops' ? ` · 1 : ${g.count}` + (g.over ? ' · over the span of control' : '') : '') + (g.note ? ' · ' + g.note : ''));
  const div = (d) => `  Division ${d.zone.code}${d.zone.name ? ' ' + d.zone.name : ''} · ${d.cleared ? 'cleared, released' : 'supervisor ' + (d.zone.supervisor || 'not named')}${d.unit ? ' · ' + unitWithKind(d.unit) + (d.people.length ? ' · ' + d.people.join(', ') : '') + ` · 1 : ${d.count}` + (d.over ? ' · over the span of control' : '') : d.cleared ? '' : ' · no unit'}`;
  for (const b of t.branches) { L.push(`Branch ${b.name} · 1 : ${b.count}${b.over ? ' · over the span of control' : ''}`); for (const d of b.divisions) L.push(div(d)); }
  if (t.loose.length) { if (t.branches.length) L.push('Reporting to Operations'); for (const d of t.loose) L.push(div(d)); }
  for (const w of t.warnings) L.push('! ' + w + '. ICS-100 recommends one supervisor to five, three to seven at most.');
  return L;
}

// ---- the agency representatives for the Liaison Officer: one row per agency on scene (from the
// units), the lead agency first with no inputs (its contact is the IC), plus any agency a name was
// saved for in this period even if its units have gone.
export function agencyReps(data, period) {
  const lead = (data.incident.lead_agency || '').trim();
  const saved = period ? data.periodAgencies(period.id) : [];
  const rows = new Map();
  for (const r of agenciesOn(data.activeUnits())) if (r.agency) rows.set(r.agency, { agency: r.agency, units: r.units, people: r.people, name: '', phone: '', saved: null, lead: r.agency === lead });
  for (const s of saved) {
    const row = rows.get(s.agency) || { agency: s.agency, units: 0, people: 0, name: '', phone: '', saved: null, lead: s.agency === lead };
    row.name = s.name; row.phone = s.phone; row.saved = s;
    rows.set(s.agency, row);
  }
  return [...rows.values()].sort((a, b) => (b.lead - a.lead) || b.units - a.units || a.agency.localeCompare(b.agency));
}
export function agencyRepLines(data, period) {
  return agencyReps(data, period).filter((r) => !r.lead).map((r) => `${r.agency}: ${r.name || 'not set'}${r.phone ? ' · ' + r.phone : ''}`);
}

// ---- if someone is hurt: the IAP's fourth question, answered from the data for one unit at a
// place (the phone's fix, or a division's centre on the 204). Lines may start with "! " when
// something is missing (no medic on the unit, no hospital on the map).
export function hurtLines(data, { unit, at } = {}) {
  const L = [];
  const channels = data.channels();
  const people = unit ? unitPeopleOn(data, unit) : [];
  const medics = people.filter((p) => (p.qualifications || []).includes('paramedic')).concat(people.filter((p) => (p.qualifications || []).includes('emt') && !(p.qualifications || []).includes('paramedic')));
  if (medics.length) {
    const first = medics[0];
    const rest = medics.slice(1).map((p) => `${p.name} is ${(p.qualifications || []).includes('paramedic') ? 'a paramedic' : 'an EMT'}`).join(', ');
    L.push({ n: 1, text: `Medic on your unit: ${first.name}, ${(first.qualifications || []).includes('paramedic') ? 'paramedic' : 'EMT'}.${rest ? ' ' + rest + '.' : ''}` });
  } else {
    const near = nearestMedic(data, { exclude: unit ? unit.user_id : null, at });
    L.push({ n: 1, warn: true, text: `No medic on ${unit ? unitLabel(unit) : 'your unit'}. ` + (near ? `Nearest medic: ${unitLabel(near.unit)}, ${near.person.name} (${qualsText(near.person.qualifications)})${near.zone ? ', in ' + near.zone.code : ''}${near.distance != null ? ', ' + milesText(near.distance) : ''}.` : 'No EMT or paramedic on scene; press Need help now.') });
  }
  const emergency = channelFor(channels, /emergency/i), command = channelFor(channels, /command/i);
  if (emergency) L.push({ n: 2, text: `Call it on ${emergency}, emergency traffic, plain words: who, where, what. Or press Need help now; Operations acknowledges and every unit near you sees it.` });
  else if (command) L.push({ n: 2, text: `Call it on ${command}, the command channel, plain words: who, where, what. Or press Need help now; Operations acknowledges and every unit near you sees it.` });
  else L.push({ n: 2, warn: true, text: 'No emergency channel in the communications plan yet. Press Need help now; Operations acknowledges and every unit near you sees it.' });
  const h = at ? nearestFacility(data.facilities(), 'hospital', at[0], at[1]) : null;
  const hospital = h ? h.facility : data.facilities().find((f) => f.kind === 'hospital') || null;
  const ambulances = data.units().filter((u) => on(u) && u.kind === 'ambulance').map((u) => {
    const pos = data.position(u.user_id), zone = data.zones().find((z) => z.assigned_to === u.user_id && z.status === 'active');
    const from = pos ? [pos.lat, pos.lng] : (zone ? centroid(zone.polygon) : null);
    return { unit: u, zone, distance: at && from ? distanceM(from, at) : null };
  }).sort((a, b) => (a.distance ?? 1e12) - (b.distance ?? 1e12));
  const amb = ambulances.length ? ' ' + ambulances.slice(0, 2).map((a) => `${unitLabel(a.unit)} (ambulance)${a.zone ? ' in ' + a.zone.code : a.unit.status === 'available' ? ' at staging' : ''}${a.distance != null ? ', ' + milesText(a.distance) : ''}`).join(' · ') + '.' : ' No ambulance on scene: Ask for the ambulance goes to Logistics as act on now.';
  if (hospital) L.push({ n: 3, text: `Nearest hospital: ${hospital.name || 'Hospital'}${h ? ', ' + milesText(h.distance) : ''}.${hospital.notes ? ' ' + sentence(hospital.notes) : ''}${hospital.contact ? ' ' + hospital.contact + '.' : ''}${amb}`, directions: directionsUrl(hospital.lat, hospital.lng), hospital, ask: true });
  else L.push({ n: 3, warn: true, text: `No hospital placed on the map. Ask Operations for the nearest one before you need it.${amb}`, ask: true });
  L.push({ n: 4, text: 'Afterwards, tell Operations the same day: the check-out list asks "nobody hurt, no equipment damaged"; untick it and say what happened. Finance needs it for the claim.' });
  return L;
}
// the same lines as plain text for the 204's Medical section
export function hurtText(data, opts) { return hurtLines(data, opts).map((l) => (l.warn ? '! ' : '') + l.text); }
// the nearest person on another unit with a paramedic or EMT qualification
export function nearestMedic(data, { exclude, at } = {}) {
  let best = null;
  for (const u of data.units()) {
    if (!on(u) || u.user_id === exclude) continue;
    const people = unitPeopleOn(data, u).filter((p) => (p.qualifications || []).includes('paramedic') || (p.qualifications || []).includes('emt'));
    if (!people.length) continue;
    const person = people.find((p) => (p.qualifications || []).includes('paramedic')) || people[0];
    const pos = data.position(u.user_id), zone = data.zones().find((z) => z.assigned_to === u.user_id && z.status === 'active');
    const from = pos ? [pos.lat, pos.lng] : (zone ? centroid(zone.polygon) : null);
    const distance = at && from ? distanceM(from, at) : null;
    if (!best || (distance ?? 1e12) < (best.distance ?? 1e12)) best = { unit: u, person, zone, distance };
  }
  return best;
}

// ---- your briefing: ICS-100's briefing items for one unit, read in the truck. Every line comes
// from the incident as it is now. A section may carry an action for the phone (the map, the ask
// sheet, the hurt card).
export function fieldBriefing(data, { me, at } = {}) {
  const inc = data.incident, p = data.currentPeriod();
  const zones = data.zones(), units = data.units().filter(on), channels = data.channels();
  const mine = me ? zones.filter((z) => z.assigned_to === me.user_id && z.status !== 'cleared') : [];
  const zone = mine[0] || null;
  const here = zone ? centroid(zone.polygon) : at;
  const S = [];
  const hazards = data.hazards();
  const sr = (p && p.sitrep) || {};
  S.push({ key: 'situation', title: 'Situation', text: [
    `${inc.name}, ${p ? 'OP ' + p.number + (p.ends_at ? ' until ' + hhmm(p.ends_at) : '') : 'no operational period set'}.`,
    sentence(sr.summary),
    `${zones.length} division${zones.length === 1 ? '' : 's'}, ${units.length} unit${units.length === 1 ? '' : 's'}, ${zones.filter((z) => z.status === 'cleared').length} cleared.`,
    hazards.length ? `${hazards.length} hazard${hazards.length === 1 ? '' : 's'} open: ` + hazards.slice(0, 3).map((h) => h.kind.toLowerCase() + (h.note ? ' (' + h.note + ')' : '') + (h.zone_id && data.zone(h.zone_id) ? ' in ' + data.zone(h.zone_id).code : '')).join('; ') + (hazards.length > 3 ? '; and more' : '') + '.' : 'No hazards open.'
  ].filter(Boolean).join(' ') });
  if (zone) {
    const o = zone.objective_id ? data.objective(zone.objective_id) : null;
    S.push({ key: 'job', title: 'Your job', lead: `Division ${zone.code}${zone.name ? ', ' + zone.name : ''}.`, text: [
      sentence(zone.work_assignment) || 'No work assignment written yet; Operations will say.',
      sentence(zone.instructions),
      `Supervisor: ${zone.supervisor || 'not named'}. Priority ${zone.priority}.`,
      o ? `Objective ${o.number}: ${sentence(o.text)}` : ''
    ].filter(Boolean).join(' ') });
  } else if (me && me.kind === 'shelter_desk') {
    // a shelter desk's job is the people at its shelter, not a division (v26)
    const f = (me.facility_id && data.facility ? data.facility(me.facility_id) : null) || data.facilities().find((x) => x.kind === 'shelter') || null;
    const c = f && data.evacuees ? placeCounts(data.evacuees(), f.id) : null;
    S.push({ key: 'job', title: 'Your job', lead: f ? `People here at ${f.name || 'the shelter'}.` : 'People here.', text: [
      'Sign in everyone who arrives: who, how many, their needs (oxygen, insulin, a wheelchair, an infant, pets) and where from. Only who is needed.',
      'A crew\'s people on their way to you are listed first: tap They\'re here, so nobody is signed in twice.',
      'Find a person answers "is my mother here?" across every shelter and hospital; Not listed? asks Operations to look.',
      c ? `Now: ${bedsText(c.people, f.beds)}${f.beds != null ? ' beds' : ''}, ${c.arriving.length} record${c.arriving.length === 1 ? '' : 's'} on the way${f.expected ? ', expected ' + f.expected : ''}.` : (f ? '' : 'Operations has not placed a shelter on the map yet.')
    ].filter(Boolean).join(' ') });
  } else {
    const staging = data.facilities().find((f) => f.kind === 'staging');
    S.push({ key: 'job', title: 'Your job', lead: 'No assignment yet.', text: `Operations assigns divisions from the base. ${staging ? 'Wait at staging, ' + (staging.name || 'the staging area') + '.' : 'Stay available.'}` });
  }
  const crew = me ? unitPeopleOn(data, me) : [];
  const others = units.filter((u) => !me || u.user_id !== me.user_id).map((u) => ({ u, z: zones.find((z) => z.assigned_to === u.user_id && z.status === 'active') || null })).filter((x) => x.z)
    .map((x) => ({ ...x, d: here ? distanceM(centroid(x.z.polygon), here) : 0 })).sort((a, b) => a.d - b.d).slice(0, 4);
  const icp = data.facilities().find((f) => f.kind === 'icp');
  S.push({ key: 'with', title: 'Who you work with', text: [
    crew.length ? `On ${unitLabel(me)}: ${crew.map((x) => x.name + (qualsText(x.qualifications) ? ' (' + qualsText(x.qualifications) + ')' : '')).join(', ')}.` : (me ? `On ${unitLabel(me)}: nobody listed yet; add your people from the menu.` : ''),
    others.length ? `Next door: ${others.map((x) => unitLabel(x.u) + ' in ' + x.z.code).join(', ')}.` : 'No other unit assigned yet.',
    `Operations: ${p && p.ops_chief ? p.ops_chief : 'not named'}${icp ? ' at ' + (icp.name || 'the command post') : ''}.`
  ].filter(Boolean).join(' ') });
  const stagingNear = at ? nearestFacility(data.facilities(), 'staging', at[0], at[1]) : null;
  const staging = stagingNear ? stagingNear.facility : data.facilities().find((f) => f.kind === 'staging');
  const rampNear = at && me && WATER_KINDS.includes(me.kind) ? nearestFacility(data.facilities(), 'ramp', at[0], at[1]) : null;   // a boat crew is told where to put in (v28)
  S.push({ key: 'area', title: 'Work area', text: [
    zone ? `${zone.code} on the map${zone.structures ? ', ' + zone.structures + ' structures, ' + zone.cleared + ' cleared' : ''}.` : (at ? 'Where you stand is on the map.' : 'The map shows the divisions.'),
    rampNear ? `Boat ramp: ${rampNear.facility.name || 'boat ramp'}, ${milesText(rampNear.distance)}.` : (me && WATER_KINDS.includes(me.kind) ? 'No boat ramp on the map yet; ask Operations where to put in.' : ''),
    staging ? `Staging: ${staging.name || 'staging area'}${stagingNear ? ', ' + milesText(stagingNear.distance) : ''}.` : ''
  ].filter(Boolean).join(' '), action: 'map' });
  const emergency = channelFor(channels, /emergency/i), command = channelFor(channels, /command/i);
  S.push({ key: 'radio', title: 'Radio', text: [
    zone && zone.channel ? `${zone.channel} for your division.` : (channels.length ? 'No division channel set; use the plan.' : 'No communications plan set yet.'),
    command ? `Command on ${command}.` : '',
    emergency ? `Emergency traffic on ${emergency}.` : '',
    'Plain English, no codes.'
  ].filter(Boolean).join(' ') });
  const pod = data.facilities().find((f) => f.kind === 'pod');
  S.push({ key: 'supplies', title: 'Supplies, fuel, more hands', text: `Ask from the inbox: Ask for something. Logistics works it and you see each step.${pod ? ' ' + (pod.name || 'Point of distribution') + (pod.notes ? ': ' + sentence(pod.notes) : '.') : ''}`, action: 'ask' });
  S.push({ key: 'shift', title: 'Shift', text: `${p && p.ends_at ? 'This period ends ' + hhmm(p.ends_at) + (staging ? '; the next crew is briefed at staging' : '') + '.' : 'No end of period set yet.'} Check out from the menu when you leave: the list asks what you leave behind.` });
  S.push({ key: 'safety', title: 'Safety and PPE', warn: true, lead: p && p.notes ? sentence(p.notes) : 'No safety message written for this period.', text: (hazards.length ? `Hazard${hazards.length === 1 ? '' : 's'} open: ` + hazards.slice(0, 3).map((h) => h.kind.toLowerCase() + (h.note ? ', ' + h.note : '')).join('; ') + '. ' : '') + (p && p.rotation_minutes > 0 ? 'Time in the water: ' + rotationText(p.rotation_minutes) + '; the phone nudges you past it. ' : '') + 'If someone is hurt: see the next card.', action: 'hurt' });
  return S;
}
export function fieldBriefingText(data, opts) { return fieldBriefing(data, opts).map((s) => s.title.toUpperCase() + '\n  ' + [s.lead, s.text].filter(Boolean).join(' ')).join('\n\n'); }

// ---- the deployment briefing on the join card: ICS-100's six lines, and what to bring
export function deploymentLines(data, now = new Date()) {
  const inc = data.incident, p = data.currentPeriod();
  const staging = data.facilities().find((f) => f.kind === 'staging'), icp = data.facilities().find((f) => f.kind === 'icp');
  const where = staging ? `Staging, ${staging.name || 'staging area'}` : (inc.base_name ? `Base, ${inc.base_name}` : (icp ? `Command post, ${icp.name || ''}`.trim() : 'the base'));
  const objectives = (p ? data.objectives(p.id) : []).filter((o) => !o.done_at);
  const needed = data.openRequests();
  const ends = p && p.ends_at ? new Date(p.ends_at) : null;
  const channels = data.channels();
  const dt = (d) => d.toLocaleDateString() + ' ' + hhmm(d);
  return [
    ['Incident', `${inc.name}${inc.lead_agency ? ' · lead agency ' + inc.lead_agency : ''}${p && p.ic_name ? ' · IC ' + p.ic_name : ''} · opened ${dt(new Date(inc.created_at))}`],
    ['Check in at', `${where}${staging && staging.notes ? ' · ' + staging.notes : ''} · check in on your phone with the code, then find the staging manager`],
    ['Your assignment', 'Given at check-in by Operations.' + (objectives.length ? ' The period\'s objectives: ' + objectives.slice(0, 3).map((o) => o.number + '. ' + o.text).join('; ') + '.' : '') + (needed.length ? ' Needed now: ' + needed.slice(0, 3).map((r) => (r.quantity > 1 ? r.quantity + ' ' : '') + r.what + (r.zone_id && data.zone(r.zone_id) ? ' for ' + data.zone(r.zone_id).code : '')).join(' · ') + '.' : '')],
    ['Report by', ends && ends.getTime() > now.getTime() ? `${hhmm(ends)} on ${ends.toLocaleDateString()} for the operational period ${p.number + 1} briefing${staging ? ' at staging' : ''} (OP ${p.number} runs ${hhmm(p.starts_at)} to ${hhmm(ends)})` : 'Now: the incident is under way and units are checked in as they arrive'],
    ['Getting there', staging ? `${staging.name || 'Staging area'} at ${latLngText(staging.lat, staging.lng)} · directions open from Nearby on your phone once you have checked in` : (icp ? `${icp.name || 'Command post'} at ${latLngText(icp.lat, icp.lng)}` : (inc.base_name ? 'Report to ' + inc.base_name : 'Operations will say'))],
    ['Radio', channels.length ? channels.map((c) => c.use + ' ' + c.channel).join(' · ') + ' · plain English, no codes' : 'No communications plan set yet; Operations gives you a channel at check-in'],
    ['Bring', p && p.notes ? p.notes : 'not set: the period\'s safety message goes here']
  ];
}
export function whoToAsk(data) {
  const p = data.currentPeriod() || {};
  return [['Staging', p.logistics_chief ? p.logistics_chief + ' (Logistics)' : 'Logistics'], ['Operations', p.ops_chief || 'not set'], ['Safety', p.safety_officer || 'not set'], ['Liaison, other agencies', p.liaison || 'not set']].map(([k, v]) => k + ': ' + v).join(' · ');
}

// ---- the units a request can be filled from, as one line for the card
export function onSceneLine(matches) {
  if (!matches.length) return '';
  return matches.slice(0, 3).map((m) => `${unitWithKind(m.unit)}${m.zone ? ' on ' + m.zone.code : m.unit.status === 'available' ? ' at staging' : ' · ' + (STATUS_LABEL[m.unit.status] || m.unit.status).toLowerCase()}${m.distance != null ? ', ' + milesText(m.distance) : ''}`).join(' · ');
}
