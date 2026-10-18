// The base map: Leaflet over OpenStreetMap tiles, with the incident boundary, the zones and their
// labels, each unit's position and heading, photo pins with the wedge of what they face, hazard
// marks, and a click-to-outline drawing mode for the boundary and new zones.
import { ringToLatLngs, latLngsToPolygon, centroid, PHOTO_WEDGE, unitLabel, facilityKind, facilityLabel, urgencyLabel, sampleAt, samplesBefore } from '../shared/rules.js';
import { layerDef, storedLayer, storeLayer, makeBaseLayer, makeOverlay, hiddenOverlays } from '../shared/layers.js';

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

// the lines drawn in ink follow the theme (css/shared.css --map-ink, --map-accent)
function cssVar(name, fallback) { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fallback; }

function icon(html, className) {
  return L.divIcon({ html, className: className || '', iconSize: [0, 0], iconAnchor: [0, 0] });
}

export class BaseMap {
  constructor(el, cb) {
    this.el = el;
    this.cb = cb;
    this.map = L.map(el, { zoomControl: true, attributionControl: true, zoomSnap: 0.5 });
    // the layer underneath (streets, satellite, Google) and the custom imagery over it, under everything drawn
    this.base = null; this.baseId = null;
    this.map.createPane('imagery').style.zIndex = 250;
    this.overlayLayers = new Map();   // overlay id → { layer, stamp }
    this.overlayUrls = new Map();     // storage path → signed url
    this.placingId = null;            // a saved picture being adjusted (v63): drawn by the placing handles, not here
    this.setBaseLayer(storedLayer() || 'streets');
    this.layers = {};
    for (const name of ['boundary', 'zones', 'structures', 'trails', 'hazards', 'facilities', 'messages', 'photos', 'labels', 'units', 'replay', 'draft']) this.layers[name] = L.layerGroup().addTo(this.map);
    this.replay = null;   // samples by unit while the base is replaying, else null
    this.unitMarkers = new Map();
    this.trails = new Map();
    this.mode = null;
    this.draft = [];
    this.map.on('contextmenu', (e) => { if (e.originalEvent) e.originalEvent.preventDefault(); });   // no browser menu over the map
    this.map.on('click', (e) => {
      if (!this.mode) { this.cb.onBlank && this.cb.onBlank(); return; }
      if (this.mode === 'structures') { this.cb.onPlace && this.cb.onPlace(e.latlng.lat, e.latlng.lng); return; }
      if (this.mode === 'facility') { this.cb.onPlaceFacility && this.cb.onPlaceFacility(e.latlng.lat, e.latlng.lng); return; }
      this.draft.push([e.latlng.lat, e.latlng.lng]);
      this.renderDraft();
      this.cb.onDraftChange && this.cb.onDraftChange(this.draft.length);
    });
  }

  // ---- the layer underneath: a device setting, swapped in place
  async setBaseLayer(id) {
    const def = layerDef(id);
    let layer;
    try { layer = await makeBaseLayer(def); } catch (err) { this.cb.onError && this.cb.onError(err); if (def.id === 'streets') return; return this.setBaseLayer('streets'); }
    if (this.base) this.map.removeLayer(this.base);
    this.base = layer.addTo(this.map);
    this.baseId = def.id;
    storeLayer(def.id);
    return def.id;
  }
  // ---- the imagery: one image per active overlay this device has not hidden; urls arrive later
  renderOverlays(data, urlFor) {
    const hidden = hiddenOverlays();
    const want = new Map();
    for (const o of data.overlays ? data.overlays() : []) {
      if (hidden.has(o.id) || o.id === this.placingId) continue;
      const url = this.overlayUrls.get(o.storage_path);
      if (!url) {
        if (!this.overlayUrls.has(o.storage_path)) {
          this.overlayUrls.set(o.storage_path, null);
          urlFor(o.storage_path).then((u) => { this.overlayUrls.set(o.storage_path, u); this.renderOverlays(data, urlFor); }).catch(() => this.overlayUrls.delete(o.storage_path));
        }
        continue;
      }
      want.set(o.id, { o, url, stamp: o.updated_at + '|' + url + '|' + JSON.stringify(o.bounds) + '|' + JSON.stringify(o.corners || null) + '|' + o.opacity });
    }
    for (const [id, cur] of this.overlayLayers) if (!want.has(id) || want.get(id).stamp !== cur.stamp) { this.map.removeLayer(cur.layer); this.overlayLayers.delete(id); }
    for (const [id, w] of want) if (!this.overlayLayers.has(id)) this.overlayLayers.set(id, { layer: makeOverlay(w.o, w.url, 'imagery').addTo(this.map), stamp: w.stamp });
  }
  setOverlayOpacity(id, opacity) { const cur = this.overlayLayers.get(id); if (cur) cur.layer.setOpacity(Number(opacity)); }
  viewBounds() { const b = this.map.getBounds(); return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() }; }
  // where a new picture of w × h pixels lands (v63): over the view, 70 % of it, its own shape, as four corners
  landingCorners(w, h) {
    const size = this.map.getSize();
    let pw = size.x * 0.7, ph = pw * h / w;
    if (ph > size.y * 0.7) { ph = size.y * 0.7; pw = ph * w / h; }
    const cx = size.x / 2, cy = size.y / 2;
    return [[cx - pw / 2, cy - ph / 2], [cx + pw / 2, cy - ph / 2], [cx + pw / 2, cy + ph / 2], [cx - pw / 2, cy + ph / 2]].map(([x, y]) => { const g = this.map.containerPointToLatLng(L.point(x, y)); return [g.lat, g.lng]; });
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
  // Backspace while outlining: the last corner comes off. Only the outline modes have a draft.
  undoPoint() {
    if ((this.mode !== 'boundary' && this.mode !== 'zone') || !this.draft.length) return false;
    this.draft.pop();
    this.renderDraft();
    this.cb.onDraftChange && this.cb.onDraftChange(this.draft.length);
    return true;
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
    const accent = cssVar('--map-accent', '#1F4E79');
    if (this.draft.length >= 3) L.polygon(this.draft, { color: accent, weight: 2, dashArray: '6 4', fillColor: accent, fillOpacity: 0.12 }).addTo(g);
    else L.polyline(this.draft, { color: accent, weight: 2, dashArray: '6 4' }).addTo(g);
    for (const p of this.draft) L.circleMarker(p, { radius: 4, color: accent, weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(g);
  }

  // ---- drawing the incident
  render(data, state) {
    const sel = state.selected || {};
    const inc = data.incident;
    if (this.cb.overlayUrl) this.renderOverlays(data, this.cb.overlayUrl);
    this.layers.boundary.clearLayers();
    if (inc && inc.boundary) {
      const ink = cssVar('--map-ink', '#1B1B18');
      L.polygon(ringToLatLngs(inc.boundary), { color: ink, weight: 2.5, dashArray: '10 6', fillColor: ink, fillOpacity: 0.03, interactive: false }).addTo(this.layers.boundary);
    }

    this.layers.zones.clearLayers();
    this.layers.labels.clearLayers();
    for (const z of data.zones()) {
      const pts = ringToLatLngs(z.polygon);
      if (pts.length < 3) continue;
      const style = Object.assign({}, ZONE_STYLE[z.status] || ZONE_STYLE.open);
      if (z.hazard) { style.color = '#D9822B'; style.dashArray = '7 4'; }
      if (sel.type === 'zone' && sel.id === z.id) style.weight = 4;
      // a legend entry pressed: its divisions stand out, the others fade
      const hl = state.highlight ? (z.status === state.highlight ? 'hl' : 'dim') : '';
      if (hl === 'hl') { style.weight = Math.max(style.weight, 4); style.fillOpacity = Math.min(0.75, style.fillOpacity + 0.25); style.className = 'zone-hl'; }
      else if (hl === 'dim') { style.fillOpacity = style.fillOpacity * 0.2; style.opacity = 0.3; style.className = 'zone-dim'; }
      const poly = L.polygon(pts, style).addTo(this.layers.zones);
      poly.on('click', (e) => { if (this.mode) return; L.DomEvent.stopPropagation(e); this.cb.onZone(z.id); });
      poly.on('contextmenu', (e) => { L.DomEvent.stop(e); if (!this.mode && this.cb.onZoneMenu) this.cb.onZoneMenu(z.id); });
      const c = centroid(z.polygon);
      const label = L.marker(c, { icon: icon(`<button class="zpill${sel.type === 'zone' && sel.id === z.id ? ' sel' : ''}${hl ? ' ' + hl : ''}" type="button" aria-label="Zone ${esc(z.code)}"><span class="pb p${z.priority}">${z.priority}</span>${esc(z.code)}</button>`), interactive: true, keyboard: false }).addTo(this.layers.labels);
      label.on('click', (e) => { if (this.mode) return; L.DomEvent.stopPropagation(e); this.cb.onZone(z.id); });
      label.on('contextmenu', (e) => { L.DomEvent.stop(e); if (!this.mode && this.cb.onZoneMenu) this.cb.onZoneMenu(z.id); });
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
    this.renderMessages(data);
    if (this.replay) this.renderReplayUnits(data, state);
    else this.renderUnits(data, state);
  }

  // a message from the field that carries a spot: a bubble at the spot, coloured by how urgent
  renderMessages(data) {
    this.layers.messages.clearLayers();
    if (this.replay || !data.placedMessages) return;
    for (const m of data.placedMessages()) {
      const who = unitLabel(data.member(m.from_user));
      const mk = L.marker([m.lat, m.lng], { icon: icon(`<span class="mpin urg-${esc(m.urgency || 'none')}" title="${esc(who)}: ${esc(m.text)}"></span>`), keyboard: false, zIndexOffset: 700 }).addTo(this.layers.messages);
      mk.bindTooltip(`${who}${m.urgency ? ' · ' + urgencyLabel(m.urgency) : ''}: ${m.text}`, { direction: 'top', offset: [0, -14] });
      mk.on('click', (e) => { if (this.mode) return; L.DomEvent.stopPropagation(e); this.cb.onUnit(m.from_user); });
    }
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
