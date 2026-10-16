// Rules both views share. No DOM and no network here, so the base, the field app and tests
// all agree on what a heading is called, which zone a point is in, and what a status means.

export const STATUS_TEXT = { open: 'Not started', active: 'In progress', cleared: 'Cleared' };
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
  else if (zone.status === 'active') t = 'In progress · ' + (assignedLabel || 'assigned') + ' · ' + zone.cleared + ' of ' + zone.structures;
  else t = 'Not started · ' + zone.structures + ' structures';
  if (zone.hazard) t += ' · hazard';
  return t;
}

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

export function latLngText(lat, lng) {
  if (lat == null || lng == null) return '';
  return Number(lat).toFixed(5) + ', ' + Number(lng).toFixed(5);
}
