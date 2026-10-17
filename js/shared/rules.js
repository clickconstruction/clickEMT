// Rules both views share. No DOM and no network here, so the base, the field app and tests
// all agree on what a heading is called, which zone a point is in, and what a status means.

export const STATUS_TEXT = { open: 'Not started', active: 'In progress', primary: 'Primary search done', cleared: 'Cleared' };
// A structure record: who was there and what state it is in.
export const OCCUPANTS = [['unknown', 'Unknown'], ['none', 'Nobody home'], ['evacuated', 'Evacuated'], ['sheltering', 'Sheltering in place'], ['refused', 'Refused to leave']];
export const WATER = [[0, 'Dry'], [20, 'Ankle'], [50, 'Knee'], [100, 'Waist'], [200, 'Over head']];
export const DAMAGE = [['unknown', 'Unknown'], ['affected', 'Affected'], ['minor', 'Minor'], ['major', 'Major'], ['destroyed', 'Destroyed']];
export const STRUCTURE_STATUS = { not_searched: 'Not searched', in_progress: 'Being searched', searched: 'Searched' };

// The places an incident runs from and sends people to, with the letter drawn on the map.
export const FACILITY_KINDS = [['icp', 'Command post', 'CP'], ['staging', 'Staging area', 'S'], ['base', 'Base', 'B'], ['shelter', 'Shelter', 'SH'], ['pod', 'Point of distribution', 'POD'], ['hospital', 'Hospital', 'H'], ['helispot', 'Helispot', 'HL'], ['other', 'Facility', 'F']];
export function facilityKind(kind) { return FACILITY_KINDS.find((k) => k[0] === kind) || FACILITY_KINDS[FACILITY_KINDS.length - 1]; }
export function facilityLabel(f) { return facilityKind(f.kind)[1] + (f.name ? ': ' + f.name : ''); }

export function milesText(m) {
  if (m == null) return '';
  const mi = m / 1609.344;
  return mi < 0.1 ? Math.round(m * 3.28084) + ' ft' : mi.toFixed(mi < 10 ? 1 : 0) + ' mi';
}

// The nearest open facility of a kind to a point, with its distance in metres.
export function nearestFacility(facilities, kind, lat, lng) {
  if (lat == null || lng == null) return null;
  let best = null;
  for (const f of facilities) {
    if (f.closed_at || (kind && f.kind !== kind) || f.lat == null) continue;
    const d = distanceM([lat, lng], [f.lat, f.lng]);
    if (!best || d < best.distance) best = { facility: f, distance: d };
  }
  return best;
}

// A link that opens the phone's own maps app with directions to a point.
export function directionsUrl(lat, lng) { return 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng; }

export function waterText(cm) {
  if (cm == null) return '';
  if (cm <= 0) return 'dry';
  if (cm < 35) return 'water ankle deep';
  if (cm < 75) return 'water knee deep';
  if (cm < 150) return 'water waist deep';
  return 'water over head';
}

// One line about a structure, the same words the database puts in the log.
export function structureSummary(s) {
  const parts = [];
  if (s.people_needing_help > 0) parts.push(s.people_needing_help + ' need help');
  const occ = OCCUPANTS.find((o) => o[0] === s.occupants);
  if (s.occupants === 'sheltering') parts.push('sheltering in place');
  else if (s.occupants === 'refused') parts.push('refused to leave');
  else if (occ && s.occupants !== 'unknown') parts.push(occ[1].toLowerCase());
  const w = waterText(s.water_cm);
  if (w) parts.push(w);
  if (s.damage && s.damage !== 'unknown') parts.push(s.damage + ' damage');
  if (s.hazards) parts.push('hazards ' + s.hazards);
  return parts.join(' · ');
}
// How urgent a message from the field is: the four words Operations acts on, not a number.
export const URGENCY = [['now', 'Act on now'], ['nightfall', 'Before nightfall'], ['tomorrow', 'Can wait until tomorrow'], ['blocking', 'Blocks further operations']];
export function urgencyLabel(u) { const r = URGENCY.find((x) => x[0] === u); return r ? r[1] : ''; }

// A unit's resource status, as ICS names it.
export const STATUS_LABEL = { assigned: 'Assigned', available: 'Available', out_of_service: 'Out of service', checked_out: 'Checked out' };
export const OOS_REASONS = ['Rest', 'Fuel', 'Equipment', 'Medical', 'Weather', 'Other'];
export const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

// What a field unit can say a photo shows, one tap each.
export const NOTE_CHIPS = ['Water over road', 'Waterline on structure', 'Blocked access', 'Structure damage', 'People here', 'Other'];
// Kinds of hazard a unit can report.
export const HAZARD_KINDS = ['Downed power line', 'Gas smell', 'Structure unsafe', 'Road under water', 'Loose animal', 'Other'];
// Hazards left in a zone when it is marked clear, with the code painted on the search marking.
export const CLEAR_HAZARDS = [['Power', 'ELEC'], ['Gas', 'GAS'], ['Structural', 'STRUC'], ['Water', 'H2O']];
// Half-angle of the wedge drawn in front of a photo pin, degrees.
export const PHOTO_WEDGE = 24;

export function compass(h) {
  if (h == null || Number.isNaN(Number(h))) return '';
  const d = ((Math.round(h) % 360) + 360) % 360;
  return DIRS[Math.round(d / 45) % 8] + ' ' + String(d).padStart(3, '0') + '°';
}

export function hhmm(iso) {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function ago(iso, now = Date.now()) {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 20) return 'live';
  if (s < 90) return s + ' s ago';
  const m = Math.round(s / 60);
  if (m < 60) return m + ' min ago';
  return hhmm(iso);
}

export function unitLabel(member) {
  if (!member) return 'Someone';
  return member.role === 'ops' ? 'Operations' : (member.unit_name || 'A unit');
}

export function pct(zone) {
  return zone.structures ? Math.round(zone.cleared / zone.structures * 100) : 0;
}

export function zoneStatusText(zone, assignedLabel) {
  let t;
  if (zone.status === 'cleared') t = 'Cleared' + (zone.cleared_at ? ' at ' + hhmm(zone.cleared_at) : '') + ' · ' + zone.structures + ' of ' + zone.structures;
  else if (zone.status === 'primary') t = 'Primary search done' + (zone.primary_done_at ? ' at ' + hhmm(zone.primary_done_at) : '') + ' · ' + zone.cleared + ' of ' + zone.structures + ' · secondary pending';
  else if (zone.status === 'active') t = 'In progress · ' + (assignedLabel || 'assigned') + ' · ' + zone.cleared + ' of ' + zone.structures;
  else t = 'Not started · ' + zone.structures + ' structures';
  if (zone.hazard) t += ' · hazard';
  return t;
}

// which pass the next "zone clear" from the field completes
export function nextPass(zone) { return zone && zone.status === 'primary' ? 'secondary' : 'primary'; }
export function passDone(zone) { return zone && (zone.status === 'primary' || zone.status === 'cleared'); }

// Zone codes are a division letter and a number: A-1, A-2, B-1. The next free number in a division.
export function nextZoneCode(zones, division) {
  const letter = (division || lastDivision(zones) || 'A').toUpperCase();
  let max = 0;
  for (const z of zones) {
    const m = /^([A-Z])-(\d+)$/i.exec(z.code || '');
    if (m && m[1].toUpperCase() === letter) max = Math.max(max, Number(m[2]));
  }
  return letter + '-' + (max + 1);
}

function lastDivision(zones) {
  let best = null;
  for (const z of zones) {
    const m = /^([A-Z])-\d+$/i.exec(z.code || '');
    if (m && (!best || m[1].toUpperCase() > best)) best = m[1].toUpperCase();
  }
  return best;
}

// GeoJSON polygons store [lng, lat]; Leaflet wants [lat, lng]. These two convert the outer ring.
export function ringToLatLngs(polygon) {
  const ring = polygon && polygon.coordinates && polygon.coordinates[0];
  if (!ring) return [];
  const pts = ring.map((p) => [p[1], p[0]]);
  if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  return pts;
}

export function latLngsToPolygon(latlngs) {
  const ring = latlngs.map((p) => [Number(p[1] ?? p.lng), Number(p[0] ?? p.lat)]);
  if (ring.length) ring.push(ring[0]);
  return { type: 'Polygon', coordinates: [ring] };
}

export function pointInPolygon(lat, lng, polygon) {
  const ring = polygon && polygon.coordinates && polygon.coordinates[0];
  if (!ring || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    const hit = ((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (hit) inside = !inside;
  }
  return inside;
}

export function zoneAt(zones, lat, lng) {
  if (lat == null || lng == null) return null;
  return zones.find((z) => pointInPolygon(lat, lng, z.polygon)) || null;
}

export function centroid(polygon) {
  const pts = ringToLatLngs(polygon);
  if (!pts.length) return null;
  let lat = 0, lng = 0;
  for (const p of pts) { lat += p[0]; lng += p[1]; }
  return [lat / pts.length, lng / pts.length];
}

export function distanceM(a, b) {
  const R = 6371000, toRad = (x) => x * Math.PI / 180;
  const dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// The search marking a team paints when it leaves a structure or zone: time out on top, the team on
// the left, hazards on the right, people found on the bottom.
export function markingFor(team, outIso, hazardCodes, victims) {
  return { team: team || '', out: hhmm(outIso || new Date()), haz: hazardCodes.length ? hazardCodes.join(' ') : 'none', victims: Number(victims) || 0 };
}

export function sortZones(zones) {
  return zones.slice().sort((a, b) => a.priority - b.priority || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

// "OP 2 · 07:00 to 19:00": how a period is named everywhere.
export function periodLabel(p) {
  if (!p) return '';
  return 'OP ' + p.number + ' · ' + hhmm(p.starts_at) + (p.ends_at ? ' to ' + hhmm(p.ends_at) : '') + (p.closed_at ? ', closed ' + hhmm(p.closed_at) : '');
}

export function latLngText(lat, lng) {
  if (lat == null || lng == null) return '';
  return Number(lat).toFixed(5) + ', ' + Number(lng).toFixed(5);
}

// ---- agencies and command (ICS 203): who is in charge, and who is on scene from where
// "Cedar Fork Fire Department (lead), with Travis County Rescue under unified command"
export function commandText(incident, period) {
  const lead = incident && incident.lead_agency ? incident.lead_agency : '';
  const unified = period && period.unified ? period.unified : '';
  if (!lead && !unified) return '';
  if (!unified) return lead + ' (lead)';
  return (lead ? lead + ' (lead), ' : '') + 'unified command with ' + unified;
}

// Units and head counts by agency, biggest first, the units with no agency named last.
export function agenciesOn(units) {
  const by = new Map();
  for (const u of units) {
    const key = u.agency || '';
    const row = by.get(key) || { agency: key, units: 0, people: 0 };
    row.units += 1;
    row.people += u.crew_count || 0;
    by.set(key, row);
  }
  return [...by.values()].sort((a, b) => (a.agency === '') - (b.agency === '') || b.units - a.units || a.agency.localeCompare(b.agency));
}
export function agencyLine(row) {
  return (row.agency || 'No agency named') + ': ' + row.units + (row.units === 1 ? ' unit' : ' units') + (row.people ? ', ' + row.people + ' people' : '');
}

// ---- people: a record per responder, riding with a unit. The qualifications a person can carry,
// in the order they are listed everywhere (ic_qual_text in SQL says the same words for the log).
export const QUALIFICATIONS = [['swift_water', 'Swift water'], ['boat', 'Boat'], ['rope', 'Rope'], ['emt', 'EMT'], ['paramedic', 'Paramedic'], ['k9', 'K9'], ['hazmat', 'Hazmat'], ['drone', 'Drone']];
const QUAL_TEXT = { swift_water: 'swift water', boat: 'boat', rope: 'rope', emt: 'EMT', paramedic: 'paramedic', k9: 'K9', hazmat: 'hazmat', drone: 'drone' };
export function qualLabel(q) { const r = QUALIFICATIONS.find((x) => x[0] === q); return r ? r[1] : q; }
// "swift water, EMT": the same words and order as the database's log line
export function qualsText(quals) {
  const order = QUALIFICATIONS.map((q) => q[0]);
  return (quals || []).slice().sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((q) => QUAL_TEXT[q] || q).join(', ');
}
// "Ramirez (swift water, EMT)"
export function personLabel(p) { const q = qualsText(p.qualifications); return p.name + (q ? ' (' + q + ')' : ''); }
// A person is on scene while checked in and not archived; a unit that checks out takes its people with it.
export function personOn(p) { return !p.archived_at && !p.checked_out_at; }
// "3 h 20 min" on scene, from check-in to check-out or now
export function onSceneText(p, now = Date.now()) {
  const from = new Date(p.checked_in_at).getTime(), to = p.checked_out_at ? new Date(p.checked_out_at).getTime() : now;
  const m = Math.max(0, Math.round((to - from) / 60000));
  if (m < 60) return m + ' min';
  return Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '');
}
// The names on a unit: its people checked in (the database keeps crew in step), else the crew as typed.
export function crewNames(unit, people) {
  const on = (people || []).filter((p) => p.user_id === unit.user_id && personOn(p));
  if (on.length) return on.map((p) => p.name).join(', ');
  return (people || []).some((p) => p.user_id === unit.user_id && !p.archived_at) ? '' : (unit.crew || '');
}
// People matching a search and a set of qualifications (every one of them), for the board's find box.
export function peopleMatch(people, { q, quals, unitLabelOf } = {}) {
  const needle = (q || '').trim().toLowerCase();
  const want = [...(quals || [])];
  return people.filter((p) => {
    if (want.some((w) => !(p.qualifications || []).includes(w))) return false;
    if (!needle) return true;
    const hay = [p.name, p.role, p.agency, qualsText(p.qualifications), p.notes, unitLabelOf ? unitLabelOf(p.user_id) : ''].join(' ').toLowerCase();
    return hay.includes(needle);
  });
}

// ---- replay: where each unit was at a moment, from the samples ic_replay returns
// Samples come grouped by unit, each group in time order. The sample at a moment is the last one
// at or before it; a unit with none yet is not on the map yet.
export function replayIndex(samples) {
  const by = new Map();
  for (const s of samples) {
    const list = by.get(s.user_id) || [];
    list.push(s);
    by.set(s.user_id, list);
  }
  for (const list of by.values()) list.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return by;
}
export function sampleAt(list, atMs) {
  let lo = 0, hi = list.length - 1, hit = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (new Date(list[mid].at).getTime() <= atMs) { hit = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return hit < 0 ? null : list[hit];
}
// The samples inside the trailing window before a moment, oldest first, for the breadcrumb.
export function samplesBefore(list, atMs, windowMs) {
  return list.filter((s) => { const t = new Date(s.at).getTime(); return t <= atMs && t >= atMs - windowMs; });
}
