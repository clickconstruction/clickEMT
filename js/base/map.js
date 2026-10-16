// The base map: Leaflet over OpenStreetMap tiles, with the incident boundary, the zones and their
// labels, each unit's position and heading, photo pins with the wedge of what they face, hazard
// marks, and a click-to-outline drawing mode for the boundary and new zones.
import { ringToLatLngs, latLngsToPolygon, centroid, PHOTO_WEDGE, unitLabel, facilityKind, facilityLabel, sampleAt, samplesBefore } from '../shared/rules.js';

const STALE_MS = 3 * 60 * 1000;   // a unit that has not reported for this long is drawn grey
const TRAIL = 12;                 // positions kept per unit for the breadcrumb trail
const REPLAY_TRAIL_MS = 15 * 60 * 1000;   // how far behind a replayed unit its breadcrumb reaches

const ZONE_STYLE = {
  open: { color: '#7A776F', weight: 2, fillColor: '#CFCAC0', fillOpacity: 0.35, dashArray: null },
  active: { color: '#24588F', weight: 2, fillColor: '#2F6FB3', fillOpacity: 0.28, dashArray: null },
  primary: { color: '#3D8B5F', weight: 2, fillColor: '#8FCFA7', fillOpacity: 0.45, dashArray: null },
  cleared: { color: '#1F6B42', weight: 2, fillColor: '#2E8B57', fillOpacity: 0.42, dashArray: null }
};
const STRUCTURE_COLOR = { searched: '#2E8B57', in_progress: '#D9822B', not_searched: '#8F8B82' };

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function wedgePath() {
  const r = 38, a = -PHOTO_WEDGE * Math.PI / 180, b = PHOTO_WEDGE * Math.PI / 180;
  const x1 = (r * Math.sin(a)).toFixed(1), y1 = (-r * Math.cos(a)).toFixed(1), x2 = (r * Math.sin(b)).toFixed(1), y2 = (-r * Math.cos(b)).toFixed(1);
  return `M0,0 L${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2} Z`;
}
const WEDGE = wedgePath();

function icon(html, className) {
  return L.divIcon({ html, className: className || '', iconSize: [0, 0], iconAnchor: [0, 0] });
}

export class BaseMap {
  constructor(el, cb) {
    this.el = el;
    this.cb = cb;
    this.map = L.map(el, { zoomControl: true, attributionControl: true, zoomSnap: 0.5 });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(this.map);
    this.layers = {};
    for (const name of ['boundary', 'zones', 'structures', 'trails', 'hazards', 'facilities', 'photos', 'labels', 'units', 'replay', 'draft']) this.layers[name] = L.layerGroup().addTo(this.map);
    this.replay = null;   // samples by unit while the base is replaying, else null
    this.unitMarkers = new Map();
    this.trails = new Map();
    this.mode = null;
    this.draft = [];
    this.map.on('click', (e) => {
      if (!this.mode) { this.cb.onBlank && this.cb.onBlank(); return; }
      if (this.mode === 'structures') { this.cb.onPlace && this.cb.onPlace(e.latlng.lat, e.latlng.lng); return; }
      if (this.mode === 'facility') { this.cb.onPlaceFacility && this.cb.onPlaceFacility(e.latlng.lat, e.latlng.lng); return; }
      this.draft.push([e.latlng.lat, e.latlng.lng]);
      this.renderDraft();
      this.cb.onDraftChange && this.cb.onDraftChange(this.draft.length);
    });
  }

  setView(lat, lng, zoom) { this.map.setView([lat, lng], zoom || 14); }
  fitPolygon(polygon) {
    const pts = ringToLatLngs(polygon);
    if (pts.length) this.map.fitBounds(L.latLngBounds(pts), { padding: [30, 30] });
  }
  panTo(lat, lng) { if (lat != null && lng != null) this.map.panTo([lat, lng]); }
  invalidate() { setTimeout(() => this.map.invalidateSize(), 50); }

  // ---- drawing
  startDraw(mode) {
    this.mode = mode;
    this.draft = [];
    this.el.classList.add('drawing');
    this.renderDraft();
  }
  finishDraw() {
    const pts = this.draft.slice();
    this.cancelDraw();
    return pts.length >= 3 ? latLngsToPolygon(pts) : null;
  }
  cancelDraw() {
    this.mode = null;
    this.draft = [];
    this.el.classList.remove('drawing');
    this.layers.draft.clearLayers();
  }
  renderDraft() {
    const g = this.layers.draft;
    g.clearLayers();
    if (!this.draft.length) return;
    if (this.draft.length >= 3) L.polygon(this.draft, { color: '#1F4E79', weight: 2, dashArray: '6 4', fillColor: '#1F4E79', fillOpacity: 0.12 }).addTo(g);
    else L.polyline(this.draft, { color: '#1F4E79', weight: 2, dashArray: '6 4' }).addTo(g);
    for (const p of this.draft) L.circleMarker(p, { radius: 4, color: '#1F4E79', weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(g);
  }

  // ---- drawing the incident
  render(data, state) {
    const sel = state.selected || {};
    const inc = data.incident;
    this.layers.boundary.clearLayers();
    if (inc && inc.boundary) {
      L.polygon(ringToLatLngs(inc.boundary), { color: '#1B1B18', weight: 2.5, dashArray: '10 6', fillColor: '#1B1B18', fillOpacity: 0.03, interactive: false }).addTo(this.layers.boundary);
    }

    this.layers.zones.clearLayers();
    this.layers.labels.clearLayers();
    for (const z of data.zones()) {
      const pts = ringToLatLngs(z.polygon);
      if (pts.length < 3) continue;
      const style = Object.assign({}, ZONE_STYLE[z.status] || ZONE_STYLE.open);
      if (z.hazard) { style.color = '#D9822B'; style.dashArray = '7 4'; }
      if (sel.type === 'zone' && sel.id === z.id) style.weight = 4;
      const poly = L.polygon(pts, style).addTo(this.layers.zones);
      poly.on('click', (e) => { if (this.mode) return; L.DomEvent.stopPropagation(e); this.cb.onZone(z.id); });
      const c = centroid(z.polygon);
      const label = L.marker(c, { icon: icon(`<button class="zpill${sel.type === 'zone' && sel.id === z.id ? ' sel' : ''}" type="button" aria-label="Zone ${esc(z.code)}"><span class="pb p${z.priority}">${z.priority}</span>${esc(z.code)}</button>`), interactive: true, keyboard: false }).addTo(this.layers.labels);
      label.on('click', (e) => { if (this.mode) return; L.DomEvent.stopPropagation(e); this.cb.onZone(z.id); });
    }

    this.layers.structures.clearLayers();
    for (const s of data.structures()) {
      if (s.lat == null || s.lng == null) continue;
      const picked = sel.type === 'structure' && sel.id === s.id;
      const help = s.people_needing_help > 0;
      const m = L.circleMarker([s.lat, s.lng], { radius: picked ? 7 : 5, color: help ? '#B3261E' : '#fff', weight: help ? 3 : 1.5, fillColor: STRUCTURE_COLOR[s.status] || '#8F8B82', fillOpacity: 1, className: 'structure' }).addTo(this.layers.structures);
      m.bindTooltip((s.label || 'Structure') + ' · ' + (s.status === 'searched' ? 'searched' : s.status === 'in_progress' ? 'being searched' : 'not searched'), { direction: 'top', offset: [0, -6] });
      m.on('click', (e) => { if (this.mode) return; L.DomEvent.stopPropagation(e); this.cb.onStructure && this.cb.onStructure(s.id); });
    }

    this.layers.facilities.clearLayers();
    for (const f of data.facilities(true)) {
      const k = facilityKind(f.kind);
      const picked = sel.type === 'facility' && sel.id === f.id;
      const m = L.marker([f.lat, f.lng], { icon: icon(`<span class="fmark fmark-${esc(f.kind)}${f.closed_at ? ' closed' : ''}${picked ? ' sel' : ''}">${esc(k[2])}</span>`), keyboard: false, zIndexOffset: 500 }).addTo(this.layers.facilities);
      m.bindTooltip(facilityLabel(f) + (f.closed_at ? ' (closed)' : ''), { direction: 'top', offset: [0, -14] });
      m.on('click', (e) => { if (this.mode) return; L.DomEvent.stopPropagation(e); this.cb.onFacility && this.cb.onFacility(f.id); });
    }

    this.layers.hazards.clearLayers();
    for (const h of data.hazards(true)) {
      if (h.lat == null || h.lng == null) continue;
      const m = L.marker([h.lat, h.lng], { icon: icon(`<span class="hmark${h.resolved_at ? ' done' : ''}" title="${esc(h.kind)}"></span>`), keyboard: false }).addTo(this.layers.hazards);
      m.on('click', (e) => { if (this.mode) return; L.DomEvent.stopPropagation(e); this.cb.onHazard && this.cb.onHazard(h.id); });
    }

    this.renderPhotos(data, state);
    if (this.replay) this.renderReplayUnits(data, state);
    else this.renderUnits(data, state);
  }

  // the photo pins; while replaying, only the ones taken by the moment shown
  renderPhotos(data, state) {
    const sel = state.selected || {};
    const replayAt = this.replay && state.replay ? state.replay.t : null;
    this.layers.photos.clearLayers();
    for (const p of data.photos()) {
      if (p.lat == null || p.lng == null) continue;
      if (replayAt != null && new Date(p.taken_at).getTime() > replayAt) continue;
      const fresh = Date.now() - new Date(p.created_at || p.taken_at).getTime() < 20000;
      const html = `<span class="ppin${sel.type === 'photo' && sel.id === p.id ? ' sel' : ''}${fresh ? ' fresh' : ''}">` +
        (p.heading == null ? '' : `<svg class="wedge" viewBox="-40 -40 80 80" style="transform:rotate(${Math.round(p.heading)}deg)" aria-hidden="true"><path d="${WEDGE}"></path></svg>`) +
        `<span class="pdot"></span></span>`;
      const m = L.marker([p.lat, p.lng], { icon: icon(html), keyboard: false }).addTo(this.layers.photos);
      m.on('click', (e) => { if (this.mode) return; L.DomEvent.stopPropagation(e); this.cb.onPhoto(p.id); });
    }
  }

  // ---- replay: the units where they were at a moment, from the samples the base fetched
  setReplay(byUnit) {
    this.replay = byUnit || null;
    this.layers.replay.clearLayers();
    if (this.replay) {
      for (const m of this.unitMarkers.values()) this.layers.units.removeLayer(m);
      this.unitMarkers.clear();
      this.layers.trails.clearLayers();
    }
  }
  // what changes from one moment to the next: the photos taken by then and where the units were
  renderReplay(data, state) {
    this.renderPhotos(data, state);
    this.renderReplayUnits(data, state);
  }
  renderReplayUnits(data, state) {
    const g = this.layers.replay;
    g.clearLayers();
    const r = state.replay;
    if (!this.replay || !r) return;
    const sel = state.selected || {};
    for (const [userId, list] of this.replay) {
      const member = data.member(userId);
      if (!member || member.role !== 'unit') continue;
      const s = sampleAt(list, r.t);
      if (!s) continue;
      const crumbs = samplesBefore(list, r.t, REPLAY_TRAIL_MS).map((x) => [x.lat, x.lng]);
      if (crumbs.length > 1) L.polyline(crumbs, { className: 'rtrail', interactive: false }).addTo(g);
      const cls = ['umark', 'ghost'];
      if (sel.type === 'unit' && sel.id === userId) cls.push('sel');
      const label = esc(unitLabel(member).replace(/^Unit /, 'U'));
      const html = `<span class="${cls.join(' ')}"><span class="udot"></span><span class="uhead" style="transform:rotate(${Math.round(s.heading || 0)}deg)"></span><span class="ulab">${label}</span></span>`;
      const m = L.marker([s.lat, s.lng], { icon: icon(html), keyboard: false, zIndexOffset: 1000 }).addTo(g);
      m.on('click', (e) => { if (this.mode) return; L.DomEvent.stopPropagation(e); this.cb.onUnit(userId); });
    }
  }

  renderUnits(data, state) {
    const sel = state.selected || {};
    const now = Date.now();
    const openAlerts = data.alerts();
    const seen = new Set();
    for (const pos of data.positions()) {
      const member = data.member(pos.user_id);
      if (!member || member.role !== 'unit') continue;
      seen.add(pos.user_id);
      const trail = this.trails.get(pos.user_id) || [];
      const last = trail[trail.length - 1];
      if (!last || last[0] !== pos.lat || last[1] !== pos.lng) { trail.push([pos.lat, pos.lng]); while (trail.length > TRAIL) trail.shift(); this.trails.set(pos.user_id, trail); }
      const alert = openAlerts.find((a) => a.user_id === pos.user_id);
      const cls = ['umark'];
      if (alert && !alert.acknowledged_at) cls.push('sos');
      if (now - new Date(pos.at).getTime() > STALE_MS) cls.push('stale');
      if (sel.type === 'unit' && sel.id === pos.user_id) cls.push('sel');
      const label = esc(unitLabel(member).replace(/^Unit /, 'U'));
      const html = `<span class="${cls.join(' ')}"><span class="upulse"></span><span class="udot"></span><span class="uhead" style="transform:rotate(${Math.round(pos.heading || 0)}deg)"></span><span class="ulab">${label}</span></span>`;
      let m = this.unitMarkers.get(pos.user_id);
      if (!m) {
        m = L.marker([pos.lat, pos.lng], { icon: icon(html), keyboard: false, zIndexOffset: 1000 }).addTo(this.layers.units);
        m.on('click', (e) => { if (this.mode) return; L.DomEvent.stopPropagation(e); this.cb.onUnit(pos.user_id); });
        this.unitMarkers.set(pos.user_id, m);
      } else {
        m.setLatLng([pos.lat, pos.lng]);
        const el = m.getElement();
        if (el && el.innerHTML !== html) el.innerHTML = html;
      }
    }
    for (const [id, m] of this.unitMarkers) if (!seen.has(id)) { this.layers.units.removeLayer(m); this.unitMarkers.delete(id); }
    this.layers.trails.clearLayers();
    for (const [, trail] of this.trails) for (const p of trail.slice(0, -1)) L.circleMarker(p, { radius: 2, className: 'trail', interactive: false }).addTo(this.layers.trails);
  }
}
