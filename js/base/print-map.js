// The map on the paper: one division drawn as an inline SVG for the printed 204 and each
// division's page of the IAP, with OpenStreetMap tiles underneath as <image> elements. No canvas
// is involved, so a cross-origin tile cannot taint anything; a tile that never loads leaves the
// plain background, and the outline, the north arrow and the scale bar still make sense on paper.
// Everything here builds strings from the data (no DOM, no network), so Node can test it.
import { ringToLatLngs, centroid, distanceM, milesText, facilityKind, STATUS_TEXT } from '../shared/rules.js';

export const MAP_W = 760, MAP_H = 440, LEGEND_H = 44;   // SVG units; the drawing scales to the page width
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE = 256, MIN_ZOOM = 3, MAX_ZOOM = 19;
const PAD = 0.18;          // ground kept around the division, as a share of its extent
const MIN_PAD_M = 120;     // and never less than this, so a small division still shows its streets
const LABELS_UP_TO = 30;   // structures in the division get their address written when there are this many or fewer
const GO_TO = ['icp', 'staging', 'shelter', 'hospital'];   // the places a crew goes to: off the paper, a chip at the edge points their way

// The same colours as the base map, so the paper matches the screen.
const ZONE_FILL = { open: '#CFCAC0', active: '#2F6FB3', primary: '#8FCFA7', cleared: '#2E8B57' };
const STRUCTURE = { searched: '#2E8B57', in_progress: '#D9822B', not_searched: '#FFFFFF' };
const FACILITY = { icp: '#1F4E79', staging: '#6B5DBF', base: '#3E3C36', shelter: '#2F7A52', pod: '#B86E00', hospital: '#B3261E', helispot: '#1B6F8A', other: '#6B6860' };
const PRIORITY = { 1: '#B3261E', 2: '#B86E00', 3: '#6B6860' };
const INK = '#1B1B18', GREY = '#7A776F', HAZARD = '#F2B134', HELP = '#B3261E';
const HALO = 'stroke:#fff;stroke-width:3px;paint-order:stroke;stroke-linejoin:round';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r1 = (n) => Math.round(n * 10) / 10;

// ---- Web Mercator, in tile pixels at a zoom (256 px per tile), the way the tiles are cut.
export function project(lat, lng, z) {
  const n = TILE * Math.pow(2, z);
  const s = Math.sin(Math.max(-85.05, Math.min(85.05, lat)) * Math.PI / 180);
  return [(lng + 180) / 360 * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
}

// Metres on the ground per tile pixel at a zoom, at a latitude.
export function metresPerPixel(lat, z) { return 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z); }

// The lat/lng box around a ring, padded so the division has ground around it.
export function paddedBounds(latlngs) {
  let south = Infinity, north = -Infinity, west = Infinity, east = -Infinity;
  for (const [lat, lng] of latlngs) { south = Math.min(south, lat); north = Math.max(north, lat); west = Math.min(west, lng); east = Math.max(east, lng); }
  const mid = (south + north) / 2;
  const mLat = 111320, mLng = 111320 * Math.cos(mid * Math.PI / 180);
  const padNS = Math.max(PAD * (north - south) * mLat, MIN_PAD_M) / mLat;
  const padEW = Math.max(PAD * (east - west) * mLng, MIN_PAD_M) / mLng;
  return { south: south - padNS, north: north + padNS, west: west - padEW, east: east + padEW };
}

// The tile zoom and the scale that fit a box into the map: an integer zoom, with the tiles drawn
// between 0.71 and 1.41 of their size so street names stay readable on paper.
export function fitView(bounds) {
  const [x0, y0] = project(bounds.north, bounds.west, 0), [x1, y1] = project(bounds.south, bounds.east, 0);
  const s0 = Math.min(MAP_W / Math.max(x1 - x0, 1e-9), MAP_H / Math.max(y1 - y0, 1e-9));
  const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(Math.log2(s0))));
  const scale = s0 / Math.pow(2, z);
  return { z, scale, cx: (x0 + x1) / 2 * Math.pow(2, z), cy: (y0 + y1) / 2 * Math.pow(2, z), lat: (bounds.south + bounds.north) / 2 };
}

// The tiles under the map at a view: their place on the paper and where to fetch them.
export function tilesFor(view) {
  const { z, scale, cx, cy } = view;
  const n = Math.pow(2, z);
  const halfW = MAP_W / 2 / scale, halfH = MAP_H / 2 / scale;
  const tx0 = Math.floor((cx - halfW) / TILE), tx1 = Math.floor((cx + halfW) / TILE);
  const ty0 = Math.max(0, Math.floor((cy - halfH) / TILE)), ty1 = Math.min(n - 1, Math.floor((cy + halfH) / TILE));
  const out = [];
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const wx = ((tx % n) + n) % n;
      out.push({ x: MAP_W / 2 + (tx * TILE - cx) * scale, y: MAP_H / 2 + (ty * TILE - cy) * scale, size: TILE * scale, url: TILE_URL.replace('{z}', z).replace('{x}', wx).replace('{y}', ty) });
    }
  }
  return out;
}

// The scale bar: the longest round distance in feet or miles that fits in the bar's room.
const BAR_STEPS = [[50, '50 ft'], [100, '100 ft'], [200, '200 ft'], [500, '500 ft'], [1000, '1,000 ft'], [2000, '2,000 ft'], [5280, '1 mi'], [10560, '2 mi'], [26400, '5 mi'], [52800, '10 mi']];
export function scaleBarFor(metresPerUnit, roomUnits = 170) {
  let best = BAR_STEPS[0];
  for (const step of BAR_STEPS) if (step[0] * 0.3048 / metresPerUnit <= roomUnits) best = step;
  return { units: best[0] * 0.3048 / metresPerUnit, label: best[1] };
}

function ringPath(latlngs, pt) {
  return latlngs.map((p, i) => (i ? 'L' : 'M') + pt(p[0], p[1]).map(r1).join(',')).join(' ') + ' Z';
}

// The whole figure for one division: the tiles, the boundary, the neighbours, the division
// itself, the structures, hazards and facilities in view, the division's label, the north arrow,
// the scale bar, the attribution the tiles require, and a legend strip under the map.
export function divisionMapHtml(data, z) {
  const ring = ringToLatLngs(z.polygon);
  if (ring.length < 3) return '';
  const view = fitView(paddedBounds(ring));
  const pt = (lat, lng) => { const [x, y] = project(lat, lng, view.z); return [MAP_W / 2 + (x - view.cx) * view.scale, MAP_H / 2 + (y - view.cy) * view.scale]; };
  const inView = (lat, lng) => { if (lat == null || lng == null) return false; const [x, y] = pt(lat, lng); return x >= -4 && x <= MAP_W + 4 && y >= -4 && y <= MAP_H + 4; };
  const id = 'pm-' + String(z.id).replace(/[^a-zA-Z0-9]/g, '');
  const parts = [];

  // the ground
  parts.push(`<rect x="0" y="0" width="${MAP_W}" height="${MAP_H}" fill="#F3F1EC"/>`);
  parts.push(`<g clip-path="url(#${id}-clip)">`);
  for (const t of tilesFor(view)) parts.push(`<image href="${esc(t.url)}" x="${r1(t.x)}" y="${r1(t.y)}" width="${r1(t.size + 0.6)}" height="${r1(t.size + 0.6)}" preserveAspectRatio="none"/>`);

  // the incident boundary and the other divisions, for where this one sits
  const inc = data.incident;
  if (inc && inc.boundary) {
    const b = ringToLatLngs(inc.boundary);
    if (b.length >= 3) parts.push(`<path d="${ringPath(b, pt)}" fill="none" stroke="${INK}" stroke-width="2" stroke-dasharray="10 6"/>`);
  }
  for (const other of data.zones()) {
    if (other.id === z.id) continue;
    const r = ringToLatLngs(other.polygon);
    if (r.length < 3) continue;
    parts.push(`<path d="${ringPath(r, pt)}" fill="#fff" fill-opacity="0.18" stroke="${GREY}" stroke-width="1.5"/>`);
    const c = centroid(other.polygon);
    if (c && inView(c[0], c[1])) parts.push(`<text x="${r1(pt(c[0], c[1])[0])}" y="${r1(pt(c[0], c[1])[1] + 4)}" text-anchor="middle" font-size="12" font-weight="600" fill="${GREY}" style="${HALO}">${esc(other.code)}</text>`);
  }

  // the division itself: a bold outline in ink, tinted with its status
  const dash = z.hazard ? ' stroke-dasharray="9 5"' : '';
  parts.push(`<path class="pm-division" d="${ringPath(ring, pt)}" fill="${ZONE_FILL[z.status] || ZONE_FILL.open}" fill-opacity="0.2" stroke="${z.hazard ? '#D9822B' : INK}" stroke-width="3.5" stroke-linejoin="round"${dash}/>`);

  // the structures, the ones in the division with their address when there are not too many
  const mine = data.structures(z.id).filter((s) => s.lat != null && s.lng != null);
  const label = mine.length <= LABELS_UP_TO;
  for (const s of data.structures()) {
    if (!inView(s.lat, s.lng)) continue;
    const [x, y] = pt(s.lat, s.lng).map(r1);
    const here = s.zone_id === z.id;
    const help = s.people_needing_help > 0;
    parts.push(`<circle class="pm-structure" cx="${x}" cy="${y}" r="5" fill="${STRUCTURE[s.status] || '#8F8B82'}" stroke="${help ? HELP : s.status === 'not_searched' ? GREY : '#fff'}" stroke-width="${help ? 2.5 : 1.5}"${here ? '' : ' opacity="0.55"'}/>`);
    if (here && label && s.label) parts.push(`<text x="${x + 8}" y="${y + 3.5}" font-size="9.5" fill="${INK}" style="${HALO}">${esc(s.label)}</text>`);
  }

  // open hazards: the same triangle as on the screen
  for (const h of data.hazards()) {
    if (!inView(h.lat, h.lng)) continue;
    const [x, y] = pt(h.lat, h.lng).map(r1);
    parts.push(`<g class="pm-hazard" transform="translate(${x},${y})"><path d="M0,-12 L11,9 L-11,9 Z" fill="${HAZARD}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/><text x="0" y="7" text-anchor="middle" font-size="11" font-weight="700" fill="${INK}">!</text></g>`);
  }

  // open facilities: the lettered boxes
  for (const f of data.facilities()) {
    if (!inView(f.lat, f.lng)) continue;
    const [x, y] = pt(f.lat, f.lng).map(r1);
    const k = facilityKind(f.kind);
    const w = 12 + k[2].length * 7.5;
    parts.push(`<g class="pm-facility" transform="translate(${x},${y})"><rect x="${r1(-w / 2)}" y="-11" width="${r1(w)}" height="22" rx="5" fill="${FACILITY[f.kind] || FACILITY.other}" stroke="#fff" stroke-width="1.5"/><text x="0" y="4" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">${esc(k[2])}</text></g>`);
  }

  // the places a crew goes to that are off the paper: a chip at the edge, the way there and how far
  const c = centroid(z.polygon);
  const c0 = c ? pt(c[0], c[1]) : [MAP_W / 2, MAP_H / 2];
  const chips = [];
  for (const f of data.facilities()) {
    if (f.lat == null || f.lng == null || inView(f.lat, f.lng) || !GO_TO.includes(f.kind)) continue;
    const [fx, fy] = pt(f.lat, f.lng);
    const dx = fx - c0[0], dy = fy - c0[1];
    const k = facilityKind(f.kind), dist = milesText(distanceM(c || [f.lat, f.lng], [f.lat, f.lng]));
    const lw = 10 + k[2].length * 7.5, w = 22 + lw + 6 + dist.length * 6.2 + 8;
    // where the line from the division's centre leaves the map, kept far enough in for the chip
    const ix = w / 2 + 4, iy = 15;
    const tx = dx > 0 ? (MAP_W - ix - c0[0]) / dx : dx < 0 ? (ix - c0[0]) / dx : Infinity;
    const ty = dy > 0 ? (MAP_H - iy - c0[1]) / dy : dy < 0 ? (iy - c0[1]) / dy : Infinity;
    const t = Math.max(0, Math.min(tx, ty));
    const side = tx < ty ? 'x' : 'y';
    let x = c0[0] + dx * t, y = c0[1] + dy * t;
    // not over the north arrow, the scale bar or the credit in the corners; the arrow still points the true way
    if (side === 'y') { y = dy > 0 ? MAP_H - 34 : 15; x = Math.max(dy > 0 ? 200 + w / 2 : w / 2 + 4, Math.min(dy > 0 ? MAP_W - 4 - w / 2 : MAP_W - 52 - w / 2, x)); }
    else { y = Math.max(50, Math.min(MAP_H - 40, y)); }
    chips.push({ k, dist, w, lw, x, y, angle: Math.atan2(dy, dx) * 180 / Math.PI, side, kind: f.kind });
  }
  chips.sort((a, b) => a.angle - b.angle);
  const placed = [];
  for (const ch of chips) {
    // two chips on the same spot: move the later one along the edge
    for (let guard = 0; guard < 12 && placed.some((o) => Math.abs(o.x - ch.x) < (o.w + ch.w) / 2 + 4 && Math.abs(o.y - ch.y) < 28); guard++) {
      if (ch.side === 'x') ch.y = ch.y + 28 > MAP_H - 40 ? ch.y - 28 : ch.y + 28; else ch.x = ch.x + ch.w + 8 > MAP_W - 4 - ch.w / 2 ? ch.x - ch.w - 8 : ch.x + ch.w + 8;
    }
    placed.push(ch);
    const x = r1(ch.x), y = r1(ch.y), left = r1(-ch.w / 2);
    parts.push(`<g class="pm-offmap" transform="translate(${x},${y})"><rect x="${left}" y="-13" width="${r1(ch.w)}" height="26" rx="13" fill="#fff" stroke="${INK}" stroke-width="1"/>` +
      `<path transform="translate(${r1(left + 12)},0) rotate(${r1(ch.angle)})" d="M-5,-5 L5,0 L-5,5 Z" fill="${INK}"/>` +
      `<rect x="${r1(left + 22)}" y="-9" width="${r1(ch.lw)}" height="18" rx="4" fill="${FACILITY[ch.kind] || FACILITY.other}"/><text x="${r1(left + 22 + ch.lw / 2)}" y="4" text-anchor="middle" font-size="10.5" font-weight="700" fill="#fff">${esc(ch.k[2])}</text>` +
      `<text x="${r1(left + 22 + ch.lw + 6)}" y="4" font-size="10.5" font-weight="600" fill="${INK}">${esc(ch.dist)}</text></g>`);
  }

  // the division's code, where the screen puts it
  if (c) {
    const [x, y] = pt(c[0], c[1]).map(r1);
    const w = 44 + z.code.length * 9;
    parts.push(`<g class="pm-label" transform="translate(${x},${y})"><rect x="${r1(-w / 2)}" y="-14" width="${w}" height="28" rx="14" fill="#fff" stroke="${INK}" stroke-width="1.5"/><circle cx="${r1(-w / 2 + 14)}" cy="0" r="10" fill="${PRIORITY[z.priority] || PRIORITY[3]}"/><text x="${r1(-w / 2 + 14)}" y="4" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">${esc(z.priority)}</text><text x="${r1(-w / 2 + 30)}" y="5" font-size="15" font-weight="700" fill="${INK}">${esc(z.code)}</text></g>`);
  }
  parts.push('</g>');

  // the north arrow, the scale bar and the attribution
  parts.push(`<g class="pm-north" transform="translate(${MAP_W - 26},14)"><circle cx="0" cy="12" r="15" fill="#fff" fill-opacity="0.85"/><path d="M0,0 L6,14 L0,10 L-6,14 Z" fill="${INK}"/><text x="0" y="25" text-anchor="middle" font-size="10" font-weight="700" fill="${INK}">N</text></g>`);
  const bar = scaleBarFor(metresPerPixel(view.lat, view.z) / view.scale);
  const bw = r1(bar.units);
  parts.push(`<g class="pm-scale" transform="translate(14,${MAP_H - 22})"><rect x="-6" y="-14" width="${r1(bw + 12)}" height="28" rx="4" fill="#fff" fill-opacity="0.85"/><rect x="0" y="2" width="${bw}" height="6" fill="#fff" stroke="${INK}" stroke-width="1"/><rect x="0" y="2" width="${r1(bw / 2)}" height="6" fill="${INK}"/><text x="0" y="-2" font-size="10" font-weight="600" fill="${INK}">${esc(bar.label)}</text></g>`);
  parts.push(`<text class="pm-credit" x="${MAP_W - 6}" y="${MAP_H - 6}" text-anchor="end" font-size="9" fill="${INK}" style="${HALO}">© OpenStreetMap contributors</text>`);

  // the legend strip
  parts.push(`<rect x="0" y="${MAP_H}" width="${MAP_W}" height="${LEGEND_H}" fill="#fff"/>`);
  parts.push(legend(z, MAP_H + LEGEND_H / 2));
  parts.push(`<rect x="0.5" y="0.5" width="${MAP_W - 1}" height="${MAP_H + LEGEND_H - 1}" fill="none" stroke="#D8D5CD"/>`);

  return `<figure class="pmap"><svg class="pmap" viewBox="0 0 ${MAP_W} ${MAP_H + LEGEND_H}" width="100%" role="img" aria-label="Map of Division ${esc(z.code)}"><defs><clipPath id="${id}-clip"><rect x="0" y="0" width="${MAP_W}" height="${MAP_H}"/></clipPath></defs>${parts.join('')}</svg></figure>`;
}

// What the marks mean, in two rows under the map: the division and the structures, then the rest.
function legend(z, y) {
  const items = [];
  let x = 12, row = 0;
  const add = (mark, words) => { items.push(`<g transform="translate(${r1(x)},${r1(y + (row - 0.5) * 20)})">${mark}<text x="12" y="3.5" font-size="10.5" fill="${INK}">${esc(words)}</text></g>`); x += 12 + words.length * 5.6 + 16; };
  const next = () => { x = 12; row += 1; };
  add(`<rect x="-6" y="-6" width="12" height="12" fill="${ZONE_FILL[z.status] || ZONE_FILL.open}" fill-opacity="0.3" stroke="${z.hazard ? '#D9822B' : INK}" stroke-width="2"/>`, `Division ${z.code} · ${STATUS_TEXT[z.status] || z.status}${z.hazard ? ' · hazard' : ''}`);
  add(`<circle r="5" fill="${STRUCTURE.searched}" stroke="#fff" stroke-width="1.5"/>`, 'Searched');
  add(`<circle r="5" fill="${STRUCTURE.in_progress}" stroke="#fff" stroke-width="1.5"/>`, 'Being searched');
  add(`<circle r="5" fill="#fff" stroke="${GREY}" stroke-width="1.5"/>`, 'Not searched');
  add(`<circle r="5" fill="#fff" stroke="${HELP}" stroke-width="2.5"/>`, 'People need help');
  next();
  add(`<path d="M0,-7 L6,5 L-6,5 Z" fill="${HAZARD}" stroke="${INK}" stroke-width="1"/>`, 'Hazard');
  add(`<rect x="-8" y="-6" width="16" height="12" rx="3" fill="${FACILITY.base}"/>`, 'Facility');
  add(`<path d="M-7,0 H7" stroke="${GREY}" stroke-width="1.5"/>`, 'Other divisions');
  add(`<path d="M-7,0 H7" stroke="${INK}" stroke-width="1.5" stroke-dasharray="4 2"/>`, 'Incident boundary');
  add(`<path d="M-6,-5 L4,0 L-6,5 Z" fill="${INK}"/>`, 'Off the map, this way and this far');
  return items.join('');
}
