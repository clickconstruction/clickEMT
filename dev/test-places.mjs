// Checks for js/shared/places.js's pure parts (v78): the request places:autocomplete gets, what the page draws from
// its answer, and a place's answer as the sheet uses it. The fetches themselves are not run here. Run: node dev/test-places.mjs
import assert from 'node:assert/strict';
import { suggestBody, searchBody, suggestionsOf, placeOf, newSessionToken } from '../js/shared/places.js';

let n = 0;
function t(name, fn) { fn(); n++; console.log('ok', name); }

t('the autocomplete request carries the words, the session token and a 50 km bias around the point given', () => {
  assert.deepEqual(suggestBody('  1200 Mill ', { token: 'tok-1', near: [30.2562, -97.7415] }), { input: '1200 Mill', languageCode: 'en', regionCode: 'US', sessionToken: 'tok-1', locationBias: { circle: { center: { latitude: 30.2562, longitude: -97.7415 }, radius: 50000 } } });
  assert.deepEqual(suggestBody('Main St'), { input: 'Main St', languageCode: 'en', regionCode: 'US' }, 'no token and no point: no session, the country alone');
  assert.deepEqual(suggestBody('x', { near: [null, 1] }), { input: 'x', languageCode: 'en', regionCode: 'US' }, 'a half point is no point');
});

t('the text search asks for one place, biased the same way; Enter with nothing picked goes through it, not the Geocoding API', () => {
  assert.deepEqual(searchBody(' 1100 Congress Ave, Austin ', { near: [30.2672, -97.7431] }), { textQuery: '1100 Congress Ave, Austin', languageCode: 'en', regionCode: 'US', pageSize: 1, locationBias: { circle: { center: { latitude: 30.2672, longitude: -97.7431 }, radius: 50000 } } });
  assert.deepEqual(searchBody('x'), { textQuery: 'x', languageCode: 'en', regionCode: 'US', pageSize: 1 });
});

t('the suggestions read the place id and the two lines of text; a prediction with no place is skipped', () => {
  const answer = { suggestions: [
    { placePrediction: { placeId: 'ChIJ1', text: { text: 'Cedar Fork High School, 1200 Mill St, Cedar Fork, TX' }, structuredFormat: { mainText: { text: 'Cedar Fork High School' }, secondaryText: { text: '1200 Mill St, Cedar Fork, TX' } } } },
    { placePrediction: { place: 'places/ChIJ2', text: { text: '120 Pecan Ln' } } },
    { queryPrediction: { text: { text: 'mill' } } }
  ] };
  assert.deepEqual(suggestionsOf(answer), [
    { id: 'ChIJ1', text: 'Cedar Fork High School, 1200 Mill St, Cedar Fork, TX', main: 'Cedar Fork High School', secondary: '1200 Mill St, Cedar Fork, TX' },
    { id: 'ChIJ2', text: '120 Pecan Ln', main: '', secondary: '' }
  ]);
  assert.deepEqual(suggestionsOf({}), []); assert.deepEqual(suggestionsOf(null), []);
});

t('a place is its point, its name and its address; nothing when the answer has no location', () => {
  assert.deepEqual(placeOf({ location: { latitude: 30.2612, longitude: -97.7402 }, displayName: { text: 'Mill Street Bridge' }, formattedAddress: 'Mill St, Cedar Fork, TX' }), { lat: 30.2612, lng: -97.7402, name: 'Mill Street Bridge', address: 'Mill St, Cedar Fork, TX' });
  assert.deepEqual(placeOf({ displayName: { text: 'x' } }), { lat: null, lng: null, name: 'x', address: '' });
  assert.deepEqual(placeOf(null), { lat: null, lng: null, name: '', address: '' });
});

t('a session token is a fresh string each time', () => {
  const a = newSessionToken(), b = newSessionToken();
  assert.ok(typeof a === 'string' && a.length >= 16 && a !== b);
});

console.log(`places: ${n} checks passed`);
