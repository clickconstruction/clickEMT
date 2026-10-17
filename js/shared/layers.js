// The map's base layers and the custom imagery laid over them, for both views. Leaflet is the
// page's global L. Streets (OpenStreetMap) and Satellite (Esri World Imagery) need nothing;
// Google Maps streets and satellite appear when config.js carries a Google Maps key for the
// Map Tiles API (window.GOOGLE_MAPS_KEY). The choice is a device setting.
export const LAYER_KEY = 'ic.map.layer';
export const HIDDEN_KEY = 'ic.map.hidden';   // imagery this device has hidden, by id

export const BASE_LAYERS = [
  { id: 'streets', name: 'Streets', source: 'OpenStreetMap', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19, dim: true },
  { id: 'satellite', name: 'Satellite', source: 'Esri World Imagery', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics', maxZoom: 19, dim: false },
  { id: 'google-streets', name: 'Google Maps, streets', source: 'Google', google: 'roadmap', dim: true, needsKey: true },
  { id: 'google-satellite', name: 'Google Maps, satellite', source: 'Google', google: 'satellite', dim: false, needsKey: true }
];
export function googleKey() { return (typeof window !== 'undefined' && window.GOOGLE_MAPS_KEY) || ''; }
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
  return L.imageOverlay(url, overlayBounds(o), { opacity: o.opacity == null ? 0.8 : Number(o.opacity), interactive: false, pane: pane || 'imagery', className: 'imagery' });
}
export function boundsText(b) {
  if (!boundsOk(b)) return '';
  const f = (v) => Number(v).toFixed(4);
  return `${f(b.south)}, ${f(b.west)} to ${f(b.north)}, ${f(b.east)}`;
}
