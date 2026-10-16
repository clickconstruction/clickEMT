// The base map: Leaflet over OpenStreetMap tiles, with the incident boundary, the zones and their
// labels, each unit's position and heading, photo pins with the wedge of what they face, hazard
// marks, and a click-to-outline drawing mode for the boundary and new zones.
import { ringToLatLngs, latLngsToPolygon, centroid, PHOTO_WEDGE, unitLabel } from '../shared/rules.js';

const STALE_MS = 3 * 60 * 1000;   // a unit that has not reported for this long is drawn grey
const TRAIL = 12;                 // positions kept per unit for the breadcrumb trail

const ZONE_STYLE = {
  open: { color: '#7A776F', weight: 2, fillColor: '#CFCAC0', fillOpacity: 0.35, dashArray: null },
  active: { color: '#24588F', weight: 2, fillColor: '#2F6FB3', fillOpacity: 0.28, dashArray: null },
  cleared: { color: '#1F6B42', weight: 2, fillColor: '#2E8B57', fillOpacity: 0.42, dashArray: null }
};

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
    for (const name of ['boundary', 'zones', 'trails', 'hazards', 'photos', 'labels', 'units', 'draft']) this.layers[name] = L.layerGroup().addTo(this.map);
    this.unitMarkers = new Map();
    this.trails = new Map();
    this.mode = null;
    this.draft = [];
    this.map.on('click', (e) => {
      if (!this.mode) { this.cb.onBlank && this.cb.onBlank(); return; }
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

    this.layers.hazards.clearLayers();
    for (const h of data.hazards(true)) {
      if (h.lat == null || h.lng == null) continue;
      const m = L.marker([h.lat, h.lng], { icon: icon(`<span class="hmark${h.resolved_at ? ' done' : ''}" title="${esc(h.kind)}"></span>`), keyboard: false }).addTo(this.layers.hazards);
      m.on('click', (e) => { if (this.mode) return; L.DomEvent.stopPropagation(e); this.cb.onHazard && this.cb.onHazard(h.id); });
    }

    this.layers.photos.clearLayers();
    for (const p of data.photos()) {
      if (p.lat == null || p.lng == null) continue;
      const fresh = Date.now() - new Date(p.created_at || p.taken_at).getTime() < 20000;
      const html = `<span class="ppin${sel.type === 'photo' && sel.id === p.id ? ' sel' : ''}${fresh ? ' fresh' : ''}">` +
        (p.heading == null ? '' : `<svg class="wedge" viewBox="-40 -40 80 80" style="transform:rotate(${Math.round(p.heading)}deg)" aria-hidden="true"><path d="${WEDGE}"></path></svg>`) +
        `<span class="pdot"></span></span>`;
      const m = L.marker([p.lat, p.lng], { icon: icon(html), keyboard: false }).addTo(this.layers.photos);
      m.on('click', (e) => { if (this.mode) return; L.DomEvent.stopPropagation(e); this.cb.onPhoto(p.id); });
    }

    this.renderUnits(data, state);
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
