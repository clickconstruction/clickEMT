// The centre by address (v78; design record try/mockups/starters.html, "The centre by address"): Google Places
// suggestions as Operations types an address on the New incident sheet, the place's point when one is picked, and the
// typed words looked up when nothing is picked. Fetch only, no DOM. The key is the browser key in config.js
// (window.GOOGLE_MAPS_KEY, through googleKey() in layers.js), restricted in Google Cloud to this site's addresses,
// with Places API (New) enabled beside Map Tiles; every call here is Places (New), since the Geocoding API refuses a
// key with referrer restrictions ("API keys with referer restrictions cannot be used with this API", seen 19 October).
// A session token ties the suggestions and the pick into one billed session. In mock mode window.__mock.places
// stands in, so nothing reaches Google from the suites.
import { googleKey } from './layers.js';

const PLACES = 'https://places.googleapis.com/v1';
const BIAS_RADIUS_M = 50000;   // the circle around the device's position or the last incident's centre
const standIn = () => (typeof window !== 'undefined' && window.__mock && window.__mock.places) || null;

export function placesReady() { return !!googleKey(); }
export function newSessionToken() { return (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2); }

// the request places:autocomplete gets for the typed words, biased around near ([lat, lng]) when there is one
export function suggestBody(words, { token, near } = {}) {
  const body = { input: String(words || '').trim(), languageCode: 'en', regionCode: 'US' };
  if (token) body.sessionToken = token;
  if (near && Number.isFinite(near[0]) && Number.isFinite(near[1])) body.locationBias = { circle: { center: { latitude: near[0], longitude: near[1] }, radius: BIAS_RADIUS_M } };
  return body;
}
// what the page draws from an autocomplete answer: [{ id, text, main, secondary }]
export function suggestionsOf(answer) {
  return ((answer && answer.suggestions) || []).map((s) => s.placePrediction).filter(Boolean).map((p) => ({
    id: p.placeId || (p.place || '').replace(/^places\//, ''),
    text: (p.text && p.text.text) || '',
    main: (p.structuredFormat && p.structuredFormat.mainText && p.structuredFormat.mainText.text) || '',
    secondary: (p.structuredFormat && p.structuredFormat.secondaryText && p.structuredFormat.secondaryText.text) || ''
  }));
}
// a place's answer as the sheet uses it: { lat, lng, name, address }
export function placeOf(j) {
  return { lat: j && j.location ? j.location.latitude : null, lng: j && j.location ? j.location.longitude : null, name: (j && j.displayName && j.displayName.text) || '', address: (j && j.formattedAddress) || '' };
}

// the suggestions for the typed words (two letters or more); [] with no key
export async function suggest(words, opts = {}) {
  const q = String(words || '').trim();
  if (q.length < 2) return [];
  const m = standIn(); if (m) return m.suggest(q);
  const key = googleKey(); if (!key) return [];
  const r = await fetch(`${PLACES}/places:autocomplete`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key }, body: JSON.stringify(suggestBody(q, opts)) });
  if (!r.ok) throw new Error('Google Places refused (' + r.status + ')');
  return suggestionsOf(await r.json());
}
// the picked place's point and name; the session token ends the session it started
export async function placeLocation(id, { token } = {}) {
  const m = standIn(); if (m) return m.location(id);
  const key = googleKey(); if (!key) throw new Error('No Google Maps key');
  const r = await fetch(`${PLACES}/places/${encodeURIComponent(id)}?fields=location,displayName,formattedAddress${token ? '&sessionToken=' + encodeURIComponent(token) : ''}`, { headers: { 'X-Goog-Api-Key': key } });
  if (!r.ok) throw new Error('Google Places refused (' + r.status + ')');
  return placeOf(await r.json());
}
// Enter with nothing picked: the typed words through Places Text Search, the first place, or null
export function searchBody(words, { near } = {}) {
  const body = { textQuery: String(words || '').trim(), languageCode: 'en', regionCode: 'US', pageSize: 1 };
  if (near && Number.isFinite(near[0]) && Number.isFinite(near[1])) body.locationBias = { circle: { center: { latitude: near[0], longitude: near[1] }, radius: BIAS_RADIUS_M } };
  return body;
}
export async function searchPlace(words, opts = {}) {
  const q = String(words || '').trim();
  if (!q) return null;
  const m = standIn(); if (m) return m.search(q);
  const key = googleKey(); if (!key) throw new Error('No Google Maps key');
  const r = await fetch(`${PLACES}/places:searchText`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.location,places.displayName,places.formattedAddress' }, body: JSON.stringify(searchBody(q, opts)) });
  if (!r.ok) throw new Error('Google Places refused (' + r.status + ')');
  const j = await r.json();
  const first = (j.places || [])[0];
  return first && first.location ? placeOf(first) : null;
}
// does Places answer this key? one word, no session; for the settings' Test button
export async function testPlaces(key) {
  const k = (key || '').trim();
  if (!k) return { ok: false, message: 'No key to test.' };
  if (standIn()) return { ok: true, message: 'Places answers (the mock’s stand-in).' };
  try {
    const r = await fetch(`${PLACES}/places:autocomplete`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': k }, body: JSON.stringify(suggestBody('Main St')) });
    if (r.ok) return { ok: true, message: 'Places answers: the address box on the New incident sheet works.' };
    let why = '';
    try { const j = await r.json(); why = (j.error && j.error.message) || ''; } catch (e) { /* no body */ }
    return { ok: false, message: 'Places refused the key (' + r.status + ')' + (why ? ': ' + why : '') + '. Enable Places API (New) for it.' };
  } catch (e) { return { ok: false, message: 'Could not reach Google Places: ' + (e.message || e) }; }
}
