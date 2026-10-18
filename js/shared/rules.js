// Rules both views share. No DOM and no network here, so the base, the field app and tests
// all agree on what a heading is called, which zone a point is in, and what a status means.

export const STATUS_TEXT = { open: 'Not started', active: 'In progress', primary: 'Primary search done', cleared: 'Cleared' };
// A structure record: who was there and what state it is in.
export const OCCUPANTS = [['unknown', 'Unknown'], ['none', 'Nobody home'], ['evacuated', 'Evacuated'], ['sheltering', 'Sheltering in place'], ['refused', 'Refused to leave']];
export const WATER = [[0, 'Dry'], [20, 'Ankle'], [50, 'Knee'], [100, 'Waist'], [200, 'Over head']];
export const DAMAGE = [['unknown', 'Unknown'], ['affected', 'Affected'], ['minor', 'Minor'], ['major', 'Major'], ['destroyed', 'Destroyed']];
export const STRUCTURE_STATUS = { not_searched: 'Not searched', in_progress: 'Being searched', searched: 'Searched' };

// The places an incident runs from and sends people to, with the letter drawn on the map.
export const FACILITY_KINDS = [['icp', 'Command post', 'CP'], ['staging', 'Staging area', 'S'], ['base', 'Base', 'B'], ['camp', 'Camp', 'C'], ['shelter', 'Shelter', 'SH'], ['pod', 'Point of distribution', 'POD'], ['hospital', 'Hospital', 'H'], ['ramp', 'Boat ramp', 'BR'], ['helibase', 'Helibase', 'HB'], ['helispot', 'Helispot', 'HL'], ['other', 'Facility', 'F']];
export function facilityKind(kind) { return FACILITY_KINDS.find((k) => k[0] === kind) || FACILITY_KINDS[FACILITY_KINDS.length - 1]; }
export function facilityLabel(f) { return facilityKind(f.kind)[1] + (f.name ? ': ' + f.name : ''); }
// What the phone's Nearby card lists, nearest of each, in this order. A boat ramp is where a boat crew
// puts in and where the people it brings out come ashore, so every unit sees it once one is placed.
export const NEARBY_KINDS = ['staging', 'ramp', 'shelter', 'hospital'];

// Who is behind an account (ic_profiles). A unit checks in with a name and a phone; a licence (scanned,
// photographed or typed) is the identity. Without one the unit is "identity not given" until Operations
// checks who it is in person and marks it verified. The SQL twins are ic_profile_ready and the
// ", identity not given" in ic_join's line.
export function profileReady(p) { return !!(p && p.full_name && p.phone); }
export function identityGiven(p) { return !!(p && (p.photo_path || p.licence_number)); }
export const NO_ID_TEXT = 'identity not given';

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
// the order the base lists hazards in (v48): act on now, blocks further operations, before nightfall, can wait, no word
const URGENCY_RANK = { now: 0, blocking: 1, nightfall: 2, tomorrow: 3 };
export function urgencyRank(u) { return u in URGENCY_RANK ? URGENCY_RANK[u] : 4; }
export function sortHazards(list) { return [...list].sort((a, b) => urgencyRank(a.urgency) - urgencyRank(b.urgency) || (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0)); }

// A unit's resource status, as ICS names it.
export const STATUS_LABEL = { assigned: 'Assigned', available: 'Available', out_of_service: 'Out of service', checked_out: 'Checked out' };
export const OOS_REASONS = ['Rest', 'Fuel', 'Equipment', 'Medical', 'Weather', 'Other'];
export const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

// What a field unit can say a photo shows, one tap each.
export const NOTE_CHIPS = ['Water over road', 'Waterline on structure', 'Blocked access', 'Structure damage', 'People here', 'Other'];
// Kinds of hazard a unit can report.
export const HAZARD_KINDS = ['Downed power line', 'Gas smell', 'Structure unsafe', 'Road under water', 'Person or car in the water', 'Tree down, road blocked', 'Loose animal', 'Other'];
// an act-on-now hazard waits on the base's bar until Operations acknowledges it (v41)
export function hazardUrgent(h) { return !!h && h.urgency === 'now' && !h.acked_at && !h.resolved_at; }
// the hazard's words on one line (v53): the kind and the note, or the note alone when it restates the kind
// ("Person or car in the water" + "Car in the water at the bridge" reads "Car in the water at the bridge")
export function hazardWords(h) {
  const kind = String(h.kind || ''), note = String(h.note || '').trim();
  if (!note) return kind;
  const k = kind.toLowerCase(), n = note.toLowerCase();
  const tail = k.split(/[\s,]+/).filter(Boolean).slice(-2).join(' ');
  return n.includes(k) || (tail && n.includes(tail)) ? note : kind + ', ' + note;
}
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

// What a unit is (ICS-100's single resource): the kind Operations asks for and Logistics fills.
// [key, label, plural, the words in a line]; ic_kind_text in SQL says the same words.
// A shelter desk is not a search crew: its phone opens on People here (v26).
export const UNIT_KINDS = [['engine', 'Engine', 'Engines', 'engine'], ['boat', 'Boat crew', 'Boat crews', 'boat crew'], ['swift_water', 'Swift-water team', 'Swift-water teams', 'swift-water team'], ['high_water', 'High-water vehicle', 'High-water vehicles', 'high-water vehicle'], ['ambulance', 'Ambulance', 'Ambulances', 'ambulance'], ['search', 'Search team', 'Search teams', 'search team'], ['k9', 'K9 team', 'K9 teams', 'K9 team'], ['drone', 'Drone team', 'Drone teams', 'drone team'], ['pump', 'Pump crew', 'Pump crews', 'pump crew'], ['shelter_desk', 'Shelter desk', 'Shelter desks', 'shelter desk'], ['volunteer', 'Volunteer', 'Volunteers', 'volunteer'], ['other', 'Other', 'Other', 'other']];
export function unitKind(kind) { return UNIT_KINDS.find((k) => k[0] === kind) || null; }
export function kindText(kind) { const k = unitKind(kind); return k && k[0] !== 'other' ? k[3] : ''; }
// "Unit 2, boat crew": how a unit reads on the 203, the 204 and the board
export function unitWithKind(member) { const t = member ? kindText(member.kind) : ''; return unitLabel(member) + (t ? ', ' + t : ''); }
// Which kinds of unit answer a request: the words in what was asked for first ("2 boat crews"),
// else the request's kind (a boat or water team, an ambulance, a pump).
const KIND_WORDS = [['boat', /\bboats?\b/i], ['swift_water', /swift[\s-]?water/i], ['high_water', /high[\s-]?water|deuce|lmtv/i], ['ambulance', /ambulance|medic\b|ems\b/i], ['engine', /\bengine/i], ['search', /search team|search crew/i], ['k9', /\bk-?9\b|dog/i], ['drone', /drone|uas\b/i], ['pump', /pump/i], ['volunteer', /volunteer/i]];
const KINDS_FOR_REQUEST = { water: ['boat', 'swift_water', 'high_water'], medical: ['ambulance'] };
export function kindsAsked(r) {
  const words = KIND_WORDS.filter(([, re]) => re.test(r.what || '')).map(([k]) => k);
  return words.length ? words : (KINDS_FOR_REQUEST[r.kind] || []);
}
// The units on scene of the kinds a request asks for, nearest to the request's division (or its
// spot) first: [{ unit, zone, distance }], distance in metres when both ends are known.
export function unitsForRequest(r, { units, zones, positions }) {
  const kinds = kindsAsked(r);
  if (!kinds.length) return [];
  const z = r.zone_id ? zones.find((x) => x.id === r.zone_id) : null;
  const to = z ? centroid(z.polygon) : (r.lat != null && r.lng != null ? [r.lat, r.lng] : null);
  return units.filter((u) => u.status !== 'checked_out' && kinds.includes(u.kind)).map((u) => {
    const zone = zones.find((x) => x.assigned_to === u.user_id && x.status === 'active') || null;
    const pos = positions.find((p) => p.user_id === u.user_id) || null;
    const from = pos ? [pos.lat, pos.lng] : (zone ? centroid(zone.polygon) : null);
    return { unit: u, zone, distance: to && from ? distanceM(from, to) : null };
  }).sort((a, b) => (a.distance ?? 1e12) - (b.distance ?? 1e12));
}

// The message every unit gets on a transfer of command, the same words as ic_transfer_text in SQL.
export function transferText(to, ops, at) {
  return 'Command transferred to ' + to + (at ? ' at ' + at : '') + '.' + (ops ? ' Operations Section Chief is ' + ops + '.' : '') + ' Your assignment, your division and your channel do not change.';
}
// "Dana Ruiz · 02:41 to 14:20": who held command when, oldest first (ic_commands)
export function commandLines(commands) {
  return commands.slice().sort((a, b) => (a.started_at < b.started_at ? -1 : 1)).map((c) => c.ic_name + ' · ' + (c.ended_at ? hhmm(c.started_at) + ' to ' + hhmm(c.ended_at) : 'since ' + hhmm(c.started_at)) + (c.from_name ? ', from ' + c.from_name : ''));
}

export function pct(zone) {
  return zone.structures ? Math.round(zone.cleared / zone.structures * 100) : 0;
}

// accepted (v42): the unit pressed Accept, or sent a report from the division since its status last changed
export function zoneAccepted(zone, member, reports) {
  if (!zone || !member) return false;
  if (member.accepted_zone_id === zone.id) return true;
  const since = member.status_at || '';
  return (reports || []).some((r) => r.zone_id === zone.id && r.user_id === member.user_id && (!since || (r.at || '') > since));
}
export function zoneStatusText(zone, assignedLabel, accepted = true) {
  let t;
  if (zone.status === 'cleared') t = 'Cleared' + (zone.cleared_at ? ' at ' + hhmm(zone.cleared_at) : '') + ' · ' + zone.structures + ' of ' + zone.structures;
  else if (zone.status === 'primary') t = 'Primary search done' + (zone.primary_done_at ? ' at ' + hhmm(zone.primary_done_at) : '') + ' · ' + zone.cleared + ' of ' + zone.structures + ' · secondary pending';
  else if (zone.status === 'active' && !accepted) t = 'Assigned, not accepted · ' + (assignedLabel || 'assigned') + ' · ' + zone.cleared + ' of ' + zone.structures;
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
// What came in since the operator last looked (v45): the log lines after a moment, counted by what they are.
export function sinceSummary(events) {
  const n = (re, kind) => events.filter((e) => (!kind || e.kind === kind) && re.test(e.text)).length;
  const one = (c, s, p) => (c ? c + ' ' + (c === 1 ? s : p || s + 's') : '');
  const stood = n(/ stood down, all OK$/, 'help'), found = n(/ found, reported by /, 'par');
  const parts = [
    one(n(/^Hazard in /, 'hazard'), 'hazard'),
    n(/^EMERGENCY, /, 'help') ? one(n(/^EMERGENCY, /, 'help'), 'emergency', 'emergencies') + (stood ? ' (' + stood + ' stood down)' : '') : (stood ? one(stood, 'stand-down') : ''),
    n(/: Missing someone/, 'par') ? one(n(/: Missing someone/, 'par'), 'missing person', 'missing people') + (found ? ' (' + found + ' found)' : '') : (found ? one(found, 'person found', 'people found') : ''),
    one(n(/^PAR, /, 'par'), 'PAR started', 'PARs started'),
    one(n(/: (All accounted for|Missing someone)/, 'par'), 'PAR answer'),
    one(n(/^SAFETY MESSAGE, /, 'safety'), 'safety message'),
    one(n(/ to /, 'msg'), 'message'),
    one(n(/sent a photo/, 'photo'), 'photo'),
    one(n(/^Structure cleared|marked clear|search (done|complete)/i, 'clear'), 'division or structure update'),
    one(n(/./, 'shelter'), 'shelter record'),
    one(n(/./, 'request'), 'request update'),
    one(n(/./, 'status'), 'status change'),
    one(n(/./, 'ops'), 'line by Operations'),
    one(n(/./, 'note'), 'note')
  ].filter(Boolean);
  const notable = events.filter((e) => e.notable).length;
  return (parts.length ? parts.join(', ') : 'nothing new') + (notable ? ' · ' + notable + ' notable' : '');
}
// A day and a time in one form everywhere (v40): "17 Oct 2026 21:58", never the browser's locale with seconds.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function dateText(iso) { const d = new Date(iso); return isNaN(d) ? '' : d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
export function whenText(iso) { const d = new Date(iso); return isNaN(d) ? '' : dateText(d) + ' ' + hhmm(d); }
// The period against the clock (v40): closed, overdue (its planned end has passed and it is still open), or open.
export function periodState(p, now = Date.now()) {
  if (!p) return { state: 'none', overMin: 0 };
  if (p.closed_at) return { state: 'closed', overMin: 0 };
  const end = p.ends_at ? new Date(p.ends_at).getTime() : null;
  if (end != null && now > end) return { state: 'overdue', overMin: Math.max(1, Math.floor((now - end) / 60000)) };
  return { state: 'open', overMin: 0 };
}
export function overdueText(p, now) { const s = periodState(p, now); return s.state === 'overdue' ? 'overdue ' + durationText(s.overMin) : ''; }
export function periodLabel(p, now) {
  if (!p) return '';
  const over = overdueText(p, now);
  return 'OP ' + p.number + ' · ' + hhmm(p.starts_at) + (p.ends_at ? ' to ' + hhmm(p.ends_at) : '') + (p.closed_at ? ', closed ' + hhmm(p.closed_at) : '') + (over ? ' · ' + over : '');
}
// "Operational period 1, 18:47 to 19:00", with the overdue words when the planned end has passed: the reports' line
export function periodLine(p, now) {
  if (!p) return 'No operational period set';
  const s = periodState(p, now);
  return 'Operational period ' + p.number + ', ' + hhmm(p.starts_at) + (p.closed_at ? ' to ' + hhmm(p.closed_at) + ', closed' : p.ends_at ? ' to ' + hhmm(p.ends_at) : '')
    + (s.state === 'overdue' ? ' · the planned end passed ' + durationText(s.overMin) + ' ago; the next period has not been started' : '');
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
// ---- on scene too long (v47): the period's threshold of hours on scene (ic_periods.scene_hours; 12 unless Safety sets
// it, 0 for off, carried into the next period like the rotation). A person on scene past it reads orange on the People
// board and the unit panel, and the briefing, the sitrep and the 208 name them. The minutes count from the person's
// check-in, as onSceneText does; a person whose unit has checked out is off scene whatever their own row says.
export const SCENE_HOURS_DEFAULT = 12;
// the start of the person's current stretch (v48): stint_at once they have checked out and come back, else the check-in;
// the board, the briefing and the threshold read it, the Hours and the 211 keep every stretch from checked_in_at
export function sceneStart(p) { return p.stint_at || p.checked_in_at; }
export function stintText(p, now = Date.now()) { return onSceneText({ checked_in_at: sceneStart(p), checked_out_at: p.checked_out_at }, now); }
export function sceneMinutes(p, now = Date.now()) { return Math.max(0, Math.round((now - new Date(sceneStart(p)).getTime()) / 60000)); }
export function sceneOver(p, hours, now = Date.now()) { const h = Math.max(0, Number(hours) || 0); return h > 0 && personOn(p) && sceneMinutes(p, now) >= h * 60; }
export function sceneText(hours) { const h = Math.max(0, Number(hours) || 0); return h > 0 ? 'Safety is told past ' + h + ' hours on scene' : 'no hours-on-scene threshold set'; }
// everyone past the threshold, longest first: people on scene whose unit is still on the incident
export function peopleOverScene(people, members, hours, now = Date.now()) {
  const unitOf = new Map((members || []).map((m) => [m.user_id, m]));
  return (people || []).filter((p) => { const m = unitOf.get(p.user_id); return sceneOver(p, hours, now) && !!m && m.status !== 'checked_out' && !m.removed_at; })
    .map((p) => ({ person: p, unit: unitOf.get(p.user_id), min: sceneMinutes(p, now) })).sort((a, b) => b.min - a.min);
}
// "Okafor (Unit 1): 13 h 12 min on scene, past 12 h"
export function sceneLine(x, hours) { return `${x.person.name} (${unitLabel(x.unit)}): ${durationText(x.min)} on scene, past ${Math.max(0, Number(hours) || 0)} h`; }
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

// ---- resource requests (ICS 213RR) and the check-out list
export const REQUEST_KINDS = [['people', 'More hands'], ['water', 'Boat or water team'], ['medical', 'Ambulance'], ['fuel', 'Fuel'], ['equipment', 'Pump, lights, equipment'], ['supplies', 'Food, water, supplies'], ['other', 'Other']];
export const REQUEST_STATUS = { asked: 'Asked', approved: 'Approved', ordered: 'Ordered, on the way', filled: 'Filled', declined: 'Could not fill' };
export function requestKind(kind) { const r = REQUEST_KINDS.find((k) => k[0] === kind); return r ? r[1] : 'Other'; }
export function requestLine(r) { return (r.quantity > 1 ? r.quantity + ' ' : (r.quantity === 1 ? '1 ' : '')) + (r.what || requestKind(r.kind)); }
// what a unit ticks off before it leaves; the keys live in ic_members.demob
export const DEMOB_ITEMS = [
  ['people', 'Everyone on the unit is accounted for'],
  ['zone', 'The division is handed over or released'],
  ['equipment', 'Radio and equipment returned to Logistics'],
  ['reported', 'Every hazard and open request is reported'],
  ['unhurt', 'Nobody hurt, no equipment damaged'],
  ['hours', 'Hours confirmed']
];
export function demobOpen(ticks) { return DEMOB_ITEMS.filter(([k]) => !(ticks && ticks[k])).map(([, label]) => label.charAt(0).toLowerCase() + label.slice(1)); }

// ---- people sheltered and moved (ic_evacuees, v26): one record per person or family, made by a crew
// from the house record, by the shelter desk, or by Operations. Where now is a status and a facility:
// here (signed in at a shelter), on the way (to a shelter, for its desk to sign in), moved (to a hospital
// or elsewhere), or gone from the record's places: with family, own transport, unknown.
// [key, chip, the words in a line]; ic_needs_text in SQL says the same words in the same order.
export const NEEDS = [['oxygen', 'Oxygen', 'oxygen'], ['insulin', 'Insulin', 'insulin'], ['wheelchair', 'Wheelchair', 'wheelchair'], ['infant', 'Infant', 'infant care'], ['pets', 'Pets', 'pets'], ['other', 'Other', 'other help']];
export function needsText(needs) {
  const words = NEEDS.filter(([k]) => (needs || []).includes(k)).map((n) => n[2]);
  return words.length < 2 ? (words[0] || '') : words.slice(0, -1).join(', ') + ' and ' + words[words.length - 1];
}
export const EVAC_STATUS = { on_the_way: 'On the way', here: 'Signed in', moved: 'Moved', with_family: 'Left with family', own_transport: 'Left by own transport', unknown: 'Whereabouts unknown' };
// Where now, as a choice: a place, or one of the ways of leaving the record's places.
export const LEFT_CHOICES = [['with_family', 'With family'], ['own_transport', 'Own transport'], ['unknown', 'Not known']];
// The places a person can be signed in at or moved to.
export const PERSON_PLACES = ['shelter', 'hospital'];

// "Okonkwo family (5)": the label, with the count when the label does not say it (ic_evacuee_who in SQL)
export function evacueeWho(e) {
  const label = (e.label || '').trim(), n = e.count || 1;
  if (!label) return n > 1 ? n + ' people with no name yet' : 'a person with no name yet';
  return n > 1 && !label.includes(String(n)) ? label + ' (' + n + ')' : label;
}
function placeName(f) { return f ? (f.name || facilityKind(f.kind)[1]) : 'a place no longer on record'; }
// Where a record says the person is now, and since when: "Dell Seton since 15:10".
export function evacueeWhere(e, facilityOf) {
  const f = e.facility_id ? facilityOf(e.facility_id) : null, prev = e.prev_facility_id ? facilityOf(e.prev_facility_id) : null;
  const at = hhmm(e.status_at || e.created_at);
  if (e.archived_at) return 'record withdrawn ' + hhmm(e.archived_at);
  switch (e.status) {
    case 'here': case 'moved': return placeName(f) + ' since ' + at;
    case 'on_the_way': return 'on the way to ' + placeName(f) + ', sent ' + at;
    case 'with_family': return 'left' + (prev ? ' ' + placeName(prev) : '') + ' with family at ' + at;
    case 'own_transport': return 'left' + (prev ? ' ' + placeName(prev) : '') + ' by own transport at ' + at;
    default: return 'whereabouts unknown since ' + at + (prev ? ', last at ' + placeName(prev) : '');
  }
}
// Where they came from: what was typed, else the house a crew took them from, with its division.
export function evacueeFrom(e, { structureOf, zoneOf } = {}) {
  const s = e.structure_id && structureOf ? structureOf(e.structure_id) : null;
  const z = s && s.zone_id && zoneOf ? zoneOf(s.zone_id) : null;
  const t = e.from_text || (s ? s.label : '');
  return [t, z && !t.includes(z.code) ? z.code : ''].filter(Boolean).join(' · ');
}
// The choice in a "Where now" picker: 'f:<facility id>' or one of LEFT_CHOICES.
export function whereValue(e) { return e.facility_id && ['here', 'on_the_way', 'moved'].includes(e.status) ? 'f:' + e.facility_id : e.status; }
// What a choice writes. Picking the place the record is signed in at, or the desk's own shelter, signs
// them in there; another shelter puts them on the way to it, for its desk to sign in; a hospital or any
// other place is a move.
export function wherePatch(value, { facilityOf, hereId, current } = {}) {
  if (!value || !value.startsWith('f:')) return { status: value || 'unknown', facility_id: null };
  const id = value.slice(2), f = facilityOf ? facilityOf(id) : null;
  if (id === hereId || (current && current.status === 'here' && current.facility_id === id)) return { status: 'here', facility_id: id };
  return { status: f && f.kind === 'shelter' ? 'on_the_way' : 'moved', facility_id: id };
}

// "family of 4" → 4, "Bus 2 from Pecan Park, 12 people, 17:30" → 12; null when the words give no count
export function countIn(text) {
  const t = String(text || '');
  const m = /family of (\d{1,3})\b/i.exec(t) || /\b(\d{1,4})\s*(?:people|persons|adults?|kids|children|evacuees|residents)\b/i.exec(t);
  return m ? Number(m[1]) : null;
}
// The needs a crew's words imply ("on oxygen", "a dog"), for the desk's chips and the shelter's totals.
const NEED_WORDS = [['oxygen', /\boxygen\b|\bo2\b/i], ['insulin', /insulin|diabet/i], ['wheelchair', /wheel\s?chair|walker/i], ['infant', /\binfant|\bbaby\b|\bbabies\b|newborn/i], ['pets', /\bdogs?\b|\bcats?\b|\bpets?\b|\bbirds?\b/i]];
export function needsIn(text) { return NEED_WORDS.filter(([, re]) => re.test(String(text || ''))).map(([k]) => k); }

// Does a label carry a name? "Alvarez, family of 4" does; "family of 4, Pecan Park" does not. Words
// that describe (family, man, elderly, a dog), numbers and the incident's own place words (its divisions,
// houses and facilities, given as placeWords) are not names; any other word is.
const NOT_NAMES = new Set(('a an the and with of no name yet unknown family families people person persons man men woman women child children kid kids baby babies infant infants toddler teen teens teenager adult adults elderly older old young boy boys girl girls couple mother father mom mum dad son daughter grandmother grandfather grandma grandpa wife husband resident residents neighbor neighbors neighbour neighbours occupant occupants dog dogs cat cats pet pets plus from at in near on by house home mr mrs ms miss sir lady ' +
  'one two three four five six seven eight nine ten oxygen insulin wheelchair walker blind deaf diabetic pregnant sick hurt injured wet cold ' +
  'park lane ln street st road rd drive dr avenue ave court ct way trailer mobile apartments apartment apt school church creek bridge crossing farm ranch estates').split(' '));
export function placeWordsOf({ zones, structures, facilities } = {}) {
  const words = new Set();
  for (const t of [].concat((zones || []).map((z) => z.name), (structures || []).map((s) => s.label), (facilities || []).map((f) => f.name))) for (const w of String(t || '').toLowerCase().match(/[a-zÀ-ɏ]+/g) || []) words.add(w);
  return words;
}
export function hasName(label, placeWords) {
  const words = String(label || '').toLowerCase().match(/[a-zÀ-ɏ]+(?:['’-][a-zÀ-ɏ]+)*/g) || [];
  return words.some((w) => w.length > 1 && !NOT_NAMES.has(w) && !(placeWords && placeWords.has(w)));
}

// Find a person: every word typed is somewhere in the record (who, where from, the note, where now).
export function evacueeMatch(list, q, { facilityOf, structureOf, zoneOf } = {}) {
  const words = String(q || '').toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (!words.length) return [];
  return list.filter((e) => {
    const f = e.facility_id && facilityOf ? facilityOf(e.facility_id) : null;
    const hay = [e.label, e.note, evacueeFrom(e, { structureOf, zoneOf }), f ? f.name : '', needsText(e.needs)].join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  }).sort((a, b) => (!!a.archived_at - !!b.archived_at) || (a.status_at < b.status_at ? 1 : -1));
}

// A place's people: who is signed in there, who is on the way, who left it, and the needs of those there.
export function placeCounts(evacuees, facilityId) {
  const live = evacuees.filter((e) => !e.archived_at);
  const here = live.filter((e) => e.facility_id === facilityId && (e.status === 'here' || e.status === 'moved'));
  const arriving = live.filter((e) => e.facility_id === facilityId && e.status === 'on_the_way');
  const left = live.filter((e) => e.prev_facility_id === facilityId && !(e.facility_id === facilityId && e.status === 'here'));
  const sum = (rows) => rows.reduce((n, e) => n + (e.count || 1), 0);
  const needs = NEEDS.map(([k, label]) => [k, label, here.filter((e) => (e.needs || []).includes(k)).length]).filter((x) => x[2] > 0);
  return { here, people: sum(here), arriving, arrivingPeople: sum(arriving), left, needs };
}
// "3 oxygen · 2 insulin · 6 pets": records with each need
export function needsTotalsText(needs) { return needs.map(([, label, n]) => n + ' ' + label.toLowerCase()).join(' · '); }
// "38 of 60" against the beds, or "38 here" when the beds are not set
export function bedsText(people, beds) { return beds != null ? people + ' of ' + beds : people + ' here'; }

// The situation report's line (ICS 209), counts only, never a name:
// "People sheltered: 38 at High school gym (60 beds), 3 moved to hospital, 12 expected · 5 records with no name yet"
export function peopleShelteredLine({ evacuees, facilities, placeWords }) {
  const live = evacuees.filter((e) => !e.archived_at);
  const shelters = facilities.filter((f) => f.kind === 'shelter' && (!f.closed_at || live.some((e) => e.facility_id === f.id && e.status === 'here')));
  const sum = (rows) => rows.reduce((n, e) => n + (e.count || 1), 0);
  const kindOf = new Map(facilities.map((f) => [f.id, f.kind]));
  const at = shelters.map((f) => `${sum(live.filter((e) => e.facility_id === f.id && e.status === 'here'))} at ${f.name || 'a shelter'}${f.beds != null ? ' (' + f.beds + ' beds)' : ''}`);
  const hospital = sum(live.filter((e) => e.facility_id && kindOf.get(e.facility_id) === 'hospital' && (e.status === 'moved' || e.status === 'here')));
  const expected = sum(live.filter((e) => e.status === 'on_the_way')) + shelters.filter((f) => !f.closed_at).reduce((n, f) => n + (countIn(f.expected) || 0), 0);
  const unnamed = live.filter((e) => !hasName(e.label, placeWords)).length;
  if (!shelters.length && !live.length) return 'People sheltered: no shelter open and nobody on record';
  return `People sheltered: ${at.length ? at.join(', ') : 'no shelter open'}, ${hospital} moved to hospital, ${expected} expected · ${unnamed} record${unnamed === 1 ? '' : 's'} with no name yet`;
}

// ---- time in the water (v28): one stamp per unit (ic_members.in_water_since), the rotation on the period
// (ic_periods.rotation_minutes, 0 = off). Past WATER_LOST_ROTATIONS rotations nobody believes the number.
export const WATER_LOST_ROTATIONS = 3;
export const WATER_KINDS = ['boat', 'swift_water', 'high_water'];   // the kinds whose home screen offers the clock before it runs
export function durationText(min) { return min < 60 ? min + ' min' : (Math.floor(min / 60) + ' h ' + (min % 60 ? (min % 60) + ' min' : '')).trim(); }
export function waterMinutes(since, now = Date.now()) { return since ? Math.max(0, Math.round((now - new Date(since).getTime()) / 60000)) : null; }
export function waterState(since, rotation, now = Date.now()) {
  const min = waterMinutes(since, now);
  if (min == null) return null;
  const rot = Math.max(0, Number(rotation) || 0);
  const rotations = rot > 0 ? Math.floor(min / rot) : 0;
  const lost = rot > 0 && rotations >= WATER_LOST_ROTATIONS;
  return { min, rotation: rot, rotations, overdue: rot > 0 && min >= rot, lost, text: lost ? 'in the water, probably left running (' + durationText(min) + ')' : 'in the water ' + durationText(min) };
}
export function rotationText(rotation) { const r = Math.max(0, Number(rotation) || 0); return r > 0 ? 'crews out of the water every ' + r + ' minutes' : 'no rotation set'; }
export function unitsInWater(units, rotation, now = Date.now()) { return units.filter((u) => u.in_water_since && u.status !== 'checked_out' && !u.removed_at).map((u) => ({ unit: u, state: waterState(u.in_water_since, rotation, now) })); }

// ---- accountability by name (v29): a PAR names who is missing (ic_message_acks.missing, [{id, name}]), the
// head count is the named people plus the unnamed (ic_members.unnamed_count) and is unknown only when neither was given
export const HEAD_COUNT_UNKNOWN = 'head count unknown';
export function headCountKnown(member) { return !!member && member.crew_count != null; }
export function missingEntries(ack) { return Array.isArray(ack && ack.missing) ? ack.missing.filter(Boolean) : []; }
export function missingNames(ack) { return missingEntries(ack).map((x) => x.name || 'someone'); }
// found (v38): an entry marked found by the unit or Operations is no longer missing
export function stillMissing(ack) { return missingEntries(ack).filter((x) => !x.found_at); }
export function foundNames(ack) { return missingEntries(ack).filter((x) => x.found_at).map((x) => x.name || 'the missing person'); }
// the people reported missing on the latest PAR and not yet found: one entry per name, with the unit that reported them
export function missingOnPar(par, acks, memberOf) {
  if (!par) return [];
  const out = [];
  for (const a of acks) {
    if (a.reply !== 'Missing someone') continue;
    const all = missingEntries(a), names = stillMissing(a);
    if (!all.length) out.push({ id: null, name: null, unit: memberOf(a.user_id), ack: a });
    for (const x of names) out.push({ id: x.id || null, name: x.name || 'someone', unit: memberOf(a.user_id), ack: a });
  }
  return out;
}
export function parAnswerText(ack) {
  if (!ack) return '';
  const open = stillMissing(ack).map((x) => x.name || 'someone'), found = foundNames(ack);
  if (open.length || found.length) return (open.length ? 'Missing: ' + open.join(', ') : '') + (found.length ? (open.length ? ' · ' : '') + found.join(', ') + ' found' : '') + (ack.count != null ? ' · ' + ack.count + ' accounted for' : '');
  return ack.reply + (ack.count != null ? ' (' + ack.count + ')' : '');
}
// a revisit's words (v48): "16:00" today, "tomorrow 06:00" when the moment is on the next day; due once it has passed.
// revisitHhmm is what the phone sends with the record (ic_structures.revisit_hhmm), the clock time as typed, 'tomorrow ' first when it is.
export function revisitWords(iso, now = Date.now()) {
  if (!iso) return null;
  const d = new Date(iso), n = new Date(now);
  if (isNaN(d)) return null;
  const tomorrow = d.getTime() > n.getTime() && d.toDateString() !== n.toDateString();
  return { hhmm: hhmm(d), tomorrow, due: d.getTime() <= n.getTime(), text: (tomorrow ? 'tomorrow ' : '') + hhmm(d) };
}
export function revisitHhmm(iso, typed, now = Date.now()) { const w = revisitWords(iso, now); return w ? (w.tomorrow ? 'tomorrow ' : '') + String(typed || w.hhmm).trim().slice(0, 5) : ''; }
// a PAR closed by a newer one (v38) is not open: the bar, the panel and the phone show the newest
export function parOpen(m) { return !!m && m.kind === 'par' && !m.superseded_by; }
