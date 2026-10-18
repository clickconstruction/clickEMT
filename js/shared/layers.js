// The map's base layers and the custom imagery laid over them, for both views. Leaflet is the
// page's global L. Streets (OpenStreetMap) and Satellite (Esri World Imagery) need nothing;
// Google Maps streets and satellite appear when the incident's settings carry a Google Maps key for the
// Map Tiles API (setGoogleKey; config.js's window.GOOGLE_MAPS_KEY is the fallback). The choice is a device setting.
// A picture with corners (v62) is drawn by cornersImage, a layer of our own: Leaflet's image overlay knows only
// a rectangle, so the picture is laid over its four points by a CSS matrix3d, redrawn on zoom and animated with it.
import { cornersOk, overlayCorners } from './rules.js';
export const LAYER_KEY = 'ic.map.layer';
export const HIDDEN_KEY = 'ic.map.hidden';   // imagery this device has hidden, by id

export const BASE_LAYERS = [
  { id: 'streets', name: 'Streets', source: 'OpenStreetMap', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19, dim: true },
  { id: 'satellite', name: 'Satellite', source: 'Esri World Imagery', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics', maxZoom: 19, dim: false },
  { id: 'google-streets', name: 'Google Maps, streets', source: 'Google', google: 'roadmap', dim: true, needsKey: true },
  { id: 'google-satellite', name: 'Google Maps, satellite', source: 'Google', google: 'satellite', dim: false, needsKey: true }
];
// The key is the incident's (ic_incidents.settings.maps_key, set on the base's Settings sheet; every member's
// browser reads it, so it is a browser key restricted to the site and the Map Tiles API); config.js is the fallback.
let incidentKey = '';
export function setGoogleKey(key) { const k = (key || '').trim(); if (k !== incidentKey) { incidentKey = k; sessions.clear(); } }
export function googleKey() { return incidentKey || (typeof window !== 'undefined' && window.GOOGLE_MAPS_KEY) || ''; }
// Settings' Test button: does this key open a Map Tiles session?
export async function testGoogleKey(key) {
  const k = (key || '').trim();
  if (!k) return { ok: false, message: 'No key to test.' };
  try {
    const res = await fetch('https://tile.googleapis.com/v1/createSession?key=' + encodeURIComponent(k), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mapType: 'roadmap', language: 'en-US', region: 'US' }) });
    if (res.ok) return { ok: true, message: 'The key works: Google Maps opened a tile session.' };
    let why = '';
    try { const j = await res.json(); why = (j.error && j.error.message) || ''; } catch (e) { /* no body */ }
    return { ok: false, message: 'Google Maps refused the key (' + res.status + ')' + (why ? ': ' + why : '') + '. Check that the Map Tiles API is enabled and the key allows this site.' };
  } catch (e) { return { ok: false, message: 'Could not reach Google Maps: ' + (e.message || e) }; }
}
export function availableLayers() { return BASE_LAYERS.filter((l) => !l.needsKey || googleKey()); }
export function layerDef(id) { return availableLayers().find((l) => l.id === id) || BASE_LAYERS[0]; }

export function storedLayer() { try { return localStorage.getItem(LAYER_KEY) || ''; } catch (e) { return ''; } }
export function storeLayer(id) { try { localStorage.setItem(LAYER_KEY, id); } catch (e) { /* storage blocked */ } }
export function hiddenOverlays() { try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')); } catch (e) { return new Set(); } }
export function setOverlayHidden(id, hidden) {
  const set = hiddenOverlays();
  if (hidden) set.add(id); else set.delete(id);
  try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...set])); } catch (e) { /* storage blocked */ }
  return set;
}

// Google's Map Tiles API hands out a session per map type; the tiles are fetched with it.
const sessions = new Map();
async function googleSession(mapType) {
  const key = googleKey();
  const hit = sessions.get(mapType);
  if (hit && hit.expiry > Date.now() / 1000 + 60) return hit.session;
  const res = await fetch('https://tile.googleapis.com/v1/createSession?key=' + encodeURIComponent(key), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapType, language: 'en-US', region: 'US', ...(mapType === 'satellite' ? { layerTypes: ['layerRoadmap'] } : {}) })
  });
  if (!res.ok) throw new Error('Google Maps did not open a session (' + res.status + '). Check the key and that the Map Tiles API is enabled.');
  const s = await res.json();
  sessions.set(mapType, { session: s.session, expiry: Number(s.expiry) || 0 });
  return s.session;
}

// A Leaflet tile layer for a definition. Google needs a session first, so this is async.
export async function makeBaseLayer(def) {
  if (def.google) {
    const session = await googleSession(def.google);
    const url = 'https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=' + encodeURIComponent(session) + '&key=' + encodeURIComponent(googleKey());
    return L.tileLayer(url, { maxZoom: 22, attribution: 'Map data &copy; Google', className: def.dim ? 'tiles-dim' : 'tiles-bright' });
  }
  return L.tileLayer(def.url, { maxZoom: def.maxZoom || 19, attribution: def.attribution, className: def.dim ? 'tiles-dim' : 'tiles-bright' });
}

// The custom imagery: one image stretched over its corner coordinates, in its own pane under
// the drawn layers (the pane is made by the map that uses it).
export function overlayBounds(o) {
  const b = o.bounds || {};
  return [[Number(b.south), Number(b.west)], [Number(b.north), Number(b.east)]];
}
export function boundsOk(b) {
  return b && [b.south, b.west, b.north, b.east].every((v) => Number.isFinite(Number(v))) && Number(b.north) > Number(b.south) && Number(b.east) > Number(b.west);
}
export function makeOverlay(o, url, pane) {
  const opacity = o.opacity == null ? 0.8 : Number(o.opacity);
  if (cornersOk(o.corners)) return new (cornersImage())(url, overlayCorners(o), { opacity, pane: pane || 'imagery', className: 'imagery' });
  return L.imageOverlay(url, overlayBounds(o), { opacity, interactive: false, pane: pane || 'imagery', className: 'imagery' });
}

// ---- a picture over four points (v62)
// The unit square onto four points, as a 3 × 3 projective matrix (Heckbert's formulas), row by row: a point (u, v)
// lands at ((a u + b v + c) / (g u + h v + i), (d u + e v + f) / (g u + h v + i)).
export function squareToQuad(p) {
  const [x0, y0] = p[0], [x1, y1] = p[1], [x2, y2] = p[2], [x3, y3] = p[3];
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) return [x1 - x0, x3 - x0, x0, y1 - y0, y3 - y0, y0, 0, 0, 1];
  const det = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / det, h = (dx1 * dy3 - dx3 * dy1) / det;
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}
// the CSS transform that lays a w × h element (transform-origin 0 0) over four points: top-left, top-right,
// bottom-right, bottom-left, in the element's parent's pixels
export function cornersTransform(pts, w, h) {
  const [a, b, c, d, e, f, g, hh, i] = squareToQuad(pts);
  return `matrix3d(${a / w},${d / w},0,${g / w},${b / h},${e / h},0,${hh / h},0,0,1,0,${c},${f},0,${i})`;
}
// four points keep a picture whole only while they make a convex quadrilateral; a corner dragged across the
// picture would fold it, so placing refuses that drag
export function quadConvex(p) {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const a = p[i], b = p[(i + 1) % 4], c = p[(i + 2) % 4];
    const z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (!z) return false;
    if (!s) s = Math.sign(z); else if (Math.sign(z) !== s) return false;
  }
  return true;
}
// The layer: one <img> in the pane, laid over its corners by cornersTransform once its own size is known, kept there
// through zoom (zoom, viewreset) and moved with the zoom animation as Leaflet's own image overlay is (zoomanim with
// the map's new layer points). Made on first use, because L is the page's global and the tests run in Node.
let CornersImage = null;
export function cornersImage() {
  if (CornersImage) return CornersImage;
  CornersImage = L.Layer.extend({
    options: { opacity: 1, pane: 'imagery', className: '' },
    initialize(url, corners, options) { this._url = url; this._corners = corners.map((c) => [Number(c[0]), Number(c[1])]); L.setOptions(this, options); },
    onAdd() {
      if (!this._img) {
        const img = this._img = L.DomUtil.create('img', 'imagery-corners ' + (this.options.className || ''));
        L.DomUtil.addClass(img, this._zoomAnimated ? 'leaflet-zoom-animated' : 'leaflet-zoom-hide');
        img.alt = ''; img.draggable = false; img.hidden = true;   // nothing until its size is known
        img.style.opacity = String(this.options.opacity);
        img.onload = () => { this._w = img.naturalWidth; this._h = img.naturalHeight; img.hidden = false; this._reset(); this.fire('load'); };
        img.onerror = () => this.fire('error');
        img.src = this._url;
      }
      this.getPane().appendChild(this._img);
      this._reset();
    },
    onRemove() { if (this._img) L.DomUtil.remove(this._img); },
    getEvents() { const ev = { zoom: this._reset, viewreset: this._reset }; if (this._zoomAnimated) ev.zoomanim = this._animateZoom; return ev; },
    setOpacity(v) { this.options.opacity = Number(v); if (this._img) this._img.style.opacity = String(this.options.opacity); return this; },
    setCorners(c) { this._corners = c.map((p) => [Number(p[0]), Number(p[1])]); this._reset(); return this; },
    getCorners() { return this._corners.map((p) => [p[0], p[1]]); },
    getBounds() { return L.latLngBounds(this._corners); },
    getElement() { return this._img; },
    size() { return this._w ? [this._w, this._h] : null; },
    _place(project) { if (!this._img || !this._w) return; this._img.style.transform = cornersTransform(this._corners.map((c) => { const p = project(L.latLng(c[0], c[1])); return [p.x, p.y]; }), this._w, this._h); },
    _reset() { if (this._map) this._place((ll) => this._map.latLngToLayerPoint(ll)); },
    _animateZoom(e) { this._place((ll) => this._map._latLngToNewLayerPoint(ll, e.zoom, e.center)); }
  });
  return CornersImage;
}
export function boundsText(b) {
  if (!boundsOk(b)) return '';
  const f = (v) => Number(v).toFixed(4);
  return `${f(b.south)}, ${f(b.west)} to ${f(b.north)}, ${f(b.east)}`;
}
