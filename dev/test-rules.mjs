// Checks for js/shared/rules.js, the rules both views share. Run: node dev/test-rules.mjs
import assert from 'node:assert/strict';
import { compass, nextZoneCode, ringToLatLngs, latLngsToPolygon, pointInPolygon, zoneAt, centroid, distanceM, markingFor, sortZones, zoneStatusText, pct } from '../js/shared/rules.js';

let n = 0;
function t(name, fn) { fn(); n++; console.log('ok', name); }

t('compass names the eight points and pads degrees', () => {
  assert.equal(compass(0), 'N 000°');
  assert.equal(compass(61), 'NE 061°');
  assert.equal(compass(225), 'SW 225°');
  assert.equal(compass(359.6), 'N 000°');
  assert.equal(compass(-90), 'W 270°');
  assert.equal(compass(null), '');
});

t('zone codes count up within a division and start a new one at 1', () => {
  const zones = [{ code: 'A-1' }, { code: 'A-2' }, { code: 'B-1' }];
  assert.equal(nextZoneCode(zones, 'A'), 'A-3');
  assert.equal(nextZoneCode(zones, 'b'), 'B-2');
  assert.equal(nextZoneCode(zones, 'C'), 'C-1');
  assert.equal(nextZoneCode(zones), 'B-2', 'with no division, the last division used');
  assert.equal(nextZoneCode([]), 'A-1');
});

t('GeoJSON rings round-trip to Leaflet latlngs without the closing point', () => {
  const poly = latLngsToPolygon([[30.1, -97.5], [30.2, -97.5], [30.2, -97.4]]);
  assert.deepEqual(poly.coordinates[0], [[-97.5, 30.1], [-97.5, 30.2], [-97.4, 30.2], [-97.5, 30.1]]);
  assert.deepEqual(ringToLatLngs(poly), [[30.1, -97.5], [30.2, -97.5], [30.2, -97.4]]);
  assert.deepEqual(ringToLatLngs(null), []);
});

t('a point inside a zone is found, one outside is not', () => {
  const square = latLngsToPolygon([[30.0, -97.0], [30.0, -96.9], [30.1, -96.9], [30.1, -97.0]]);
  assert.equal(pointInPolygon(30.05, -96.95, square), true);
  assert.equal(pointInPolygon(30.15, -96.95, square), false);
  const zones = [{ code: 'A-1', polygon: square }];
  assert.equal(zoneAt(zones, 30.05, -96.95).code, 'A-1');
  assert.equal(zoneAt(zones, 29.0, -96.95), null);
  assert.equal(zoneAt(zones, null, null), null);
  const c = centroid(square);
  assert.ok(Math.abs(c[0] - 30.05) < 1e-9 && Math.abs(c[1] + 96.95) < 1e-9);
});

t('distance in metres is about right', () => {
  const d = distanceM([30.0, -97.0], [30.0, -97.01]);
  assert.ok(d > 950 && d < 970, 'one hundredth of a degree of longitude at 30° north is about 963 m, got ' + d);
});

t('the search marking carries team, time, hazards and people', () => {
  const m = markingFor('U3', new Date(2026, 9, 16, 13, 42), ['ELEC', 'GAS'], 1);
  assert.equal(m.team, 'U3');
  assert.equal(m.out, '13:42');
  assert.equal(m.haz, 'ELEC GAS');
  assert.equal(m.victims, 1);
  assert.equal(markingFor('U3', new Date(), [], 0).haz, 'none');
});

t('zones sort by priority then code, and status text reads well', () => {
  const zones = [{ code: 'B-1', priority: 2 }, { code: 'A-1', priority: 1 }, { code: 'A-2', priority: 2 }];
  assert.deepEqual(sortZones(zones).map((z) => z.code), ['A-1', 'A-2', 'B-1']);
  assert.equal(zoneStatusText({ status: 'open', structures: 12, cleared: 0, hazard: false }), 'Not started · 12 structures');
  assert.equal(zoneStatusText({ status: 'active', structures: 14, cleared: 9, hazard: true }, 'Unit 3'), 'In progress · Unit 3 · 9 of 14 · hazard');
  assert.equal(pct({ structures: 14, cleared: 7 }), 50);
  assert.equal(pct({ structures: 0, cleared: 0 }), 0);
});

console.log(n + ' checks passed');
