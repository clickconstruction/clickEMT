// Checks for js/base/print-map.js, the division map on the printed 204 and the IAP.
// Run: node dev/test-print-map.mjs
import assert from 'node:assert/strict';
import { project, metresPerPixel, paddedBounds, fitView, tilesFor, scaleBarFor, divisionMapHtml, MAP_W, MAP_H } from '../js/base/print-map.js';
import { latLngsToPolygon } from '../js/shared/rules.js';

let n = 0;
function t(name, fn) { fn(); n++; console.log('ok', name); }

t('the projection puts the equator and Greenwich in the middle of the world, and a known point on its tile', () => {
  assert.deepEqual(project(0, 0, 0).map((v) => Math.round(v)), [128, 128]);
  // Austin at zoom 15 sits on tile 7487, 13491 (the slippy map tile names: x = (lng + 180) / 360 · 2^z, y from ln(tan φ + sec φ))
  const [x, y] = project(30.2672, -97.7431, 15);
  assert.equal(Math.floor(x / 256), 7487);
  assert.equal(Math.floor(y / 256), 13491);
  assert.equal(Math.round(metresPerPixel(0, 0)), 156543);
});

const ring = [[30.2665, -97.7345], [30.2668, -97.7295], [30.2697, -97.7298], [30.2694, -97.7348]];   // A-1 in the mock, about 480 by 350 m

t('the padded bounds keep ground around the division, at least 120 m a side', () => {
  const b = paddedBounds(ring);
  assert.ok(b.south < 30.2665 && b.north > 30.2697 && b.west < -97.7348 && b.east > -97.7295);
  assert.ok((b.north - b.south) * 111320 >= (30.2697 - 30.2665) * 111320 + 240 - 1);
  const tiny = paddedBounds([[30.2665, -97.7345], [30.2666, -97.7344], [30.2665, -97.7344]]);
  assert.ok((tiny.north - tiny.south) * 111320 > 230, 'a tiny division still gets its streets');
});

t('the view fits the division in the map at a whole zoom, tiles drawn between 0.71 and 1.41 of their size', () => {
  const v = fitView(paddedBounds(ring));
  assert.ok(Number.isInteger(v.z) && v.z >= 3 && v.z <= 19, 'zoom ' + v.z);
  assert.ok(v.scale >= 0.7 && v.scale <= 1.42, 'scale ' + v.scale);
  const pt = (lat, lng) => { const [x, y] = project(lat, lng, v.z); return [MAP_W / 2 + (x - v.cx) * v.scale, MAP_H / 2 + (y - v.cy) * v.scale]; };
  for (const [lat, lng] of ring) { const [x, y] = pt(lat, lng); assert.ok(x > 0 && x < MAP_W && y > 0 && y < MAP_H, 'corner inside the map'); }
});

t('the tiles cover the map and name the zoom, column and row OpenStreetMap uses', () => {
  const v = fitView(paddedBounds(ring));
  const tiles = tilesFor(v);
  assert.ok(tiles.length >= 4 && tiles.length <= 40, tiles.length + ' tiles');
  for (const tile of tiles) assert.match(tile.url, new RegExp('^https://tile\\.openstreetmap\\.org/' + v.z + '/\\d+/\\d+\\.png$'));
  const left = Math.min(...tiles.map((x) => x.x)), right = Math.max(...tiles.map((x) => x.x + x.size));
  const top = Math.min(...tiles.map((x) => x.y)), bottom = Math.max(...tiles.map((x) => x.y + x.size));
  assert.ok(left <= 0 && right >= MAP_W && top <= 0 && bottom >= MAP_H, 'the tiles reach every edge');
});

t('the scale bar picks the longest round distance that fits, in feet or miles', () => {
  assert.deepEqual(scaleBarFor(1), { units: 500 * 0.3048, label: '500 ft' });   // 1 m per unit: 500 ft is 152 units, 1,000 ft would not fit
  assert.equal(scaleBarFor(10).label, '1 mi');
  assert.equal(scaleBarFor(0.05).label, '50 ft');
});

t('the figure draws the division, its neighbours, the points in view, the label, the arrow, the bar, the credit and the legend', () => {
  const a1 = { id: 'z1', code: 'A-1', priority: 1, status: 'active', hazard: false, polygon: latLngsToPolygon(ring) };
  const a2 = { id: 'z2', code: 'A-2', priority: 1, status: 'active', hazard: true, polygon: latLngsToPolygon([[30.2665, -97.7385], [30.2668, -97.7350], [30.2697, -97.7352], [30.2694, -97.7387]]) };   // right beside A-1, so its label is in view
  const far = { id: 'z3', code: 'C-9', priority: 3, status: 'open', hazard: false, polygon: latLngsToPolygon([[31.0, -98.0], [31.0, -97.99], [31.01, -97.99]]) };
  const data = {
    incident: { boundary: latLngsToPolygon([[30.2545, -97.7540], [30.2550, -97.7260], [30.2750, -97.7265], [30.2745, -97.7545]]) },
    zones: () => [a1, a2, far],
    structures: (zoneId) => [
      { id: 's1', zone_id: 'z1', label: '12 Riverside Dr', lat: 30.2680, lng: -97.7320, status: 'searched', people_needing_help: 0 },
      { id: 's2', zone_id: 'z1', label: '14 Riverside Dr', lat: 30.2682, lng: -97.7310, status: 'not_searched', people_needing_help: 2 },
      { id: 's3', zone_id: 'z2', label: 'Lot 4', lat: 30.2675, lng: -97.7365, status: 'in_progress', people_needing_help: 0 },
      { id: 's4', zone_id: 'z3', label: 'Far away', lat: 31.0, lng: -98.0, status: 'searched', people_needing_help: 0 }
    ].filter((s) => !zoneId || s.zone_id === zoneId),
    hazards: () => [{ id: 'h1', kind: 'Downed power line', lat: 30.2668, lng: -97.7366 }, { id: 'h2', kind: 'Gas smell', lat: 31.0, lng: -98.0 }],
    facilities: () => [{ id: 'f1', kind: 'staging', name: 'East lot', lat: 30.2670, lng: -97.7330 }, { id: 'f2', kind: 'hospital', name: 'Far', lat: 31.0, lng: -98.0 }, { id: 'f3', kind: 'shelter', name: 'Also far', lat: 31.0, lng: -98.0 }, { id: 'f4', kind: 'pod', name: 'Not a place to go', lat: 31.0, lng: -98.0 }]
  };
  const html = divisionMapHtml(data, a1);
  assert.ok(html.startsWith('<figure class="pmap"><svg class="pmap"'));
  assert.match(html, /aria-label="Map of Division A-1"/);
  assert.equal((html.match(/<image /g) || []).length, (html.match(/tile\.openstreetmap\.org/g) || []).length, 'every image is a tile');
  assert.ok((html.match(/<image /g) || []).length >= 4);
  assert.equal((html.match(/class="pm-division"/g) || []).length, 1, 'the division once');
  assert.ok(html.includes('>A-2</text>'), 'the neighbour is named');
  assert.ok(!html.includes('>C-9</text>'), 'a division out of view is not');
  assert.equal((html.match(/class="pm-structure"/g) || []).length, 3, 'the structures in view, the far one left out');
  assert.ok(html.includes('>12 Riverside Dr</text>') && html.includes('>14 Riverside Dr</text>'), 'the division\'s own structures carry their address');
  assert.ok(!html.includes('>Lot 4</text>'), 'a neighbour\'s structure does not');
  assert.ok(html.includes('stroke="#B3261E" stroke-width="2.5"'), 'people needing help ring the dot red');
  assert.equal((html.match(/class="pm-hazard"/g) || []).length, 1);
  assert.equal((html.match(/class="pm-facility"/g) || []).length, 1);
  assert.ok(html.includes('>S</text>'), 'the facility shows its letter');
  const chips = html.match(/<g class="pm-offmap"[^>]*>/g) || [];
  assert.equal(chips.length, 2, 'the hospital and the shelter off the paper get a chip at the edge, the point of distribution does not');
  assert.ok(html.includes('>H</text>') && html.includes('>SH</text>') && / mi<\/text>/.test(html), 'each chip carries the letter and the distance');
  const at = chips.map((g) => /translate\(([-\d.]+),([-\d.]+)\)/.exec(g).slice(1).map(Number));
  for (const [x, y] of at) assert.ok(x > 0 && x < MAP_W && y > 0 && y < MAP_H, 'the chip sits inside the map');
  assert.ok(Math.abs(at[0][0] - at[1][0]) > 40 || Math.abs(at[0][1] - at[1][1]) > 20, 'two chips the same way are not on top of each other');
  assert.ok(html.includes('class="pm-label"') && html.includes('>A-1</text>'), 'the division\'s own label');
  assert.ok(html.includes('class="pm-north"') && html.includes('class="pm-scale"') && / ft<\/text>/.test(html), 'north arrow and a scale bar in feet');
  assert.ok(html.includes('© OpenStreetMap contributors'), 'the tiles\' attribution');
  assert.ok(html.includes('Division A-1 · In progress') && html.includes('People need help') && html.includes('Incident boundary'), 'the legend');
  assert.ok(html.includes('stroke-dasharray="10 6"'), 'the incident boundary is dashed');
  const hazardous = divisionMapHtml(data, a2);
  assert.ok(/class="pm-division"[^>]*stroke="#D9822B"[^>]*stroke-dasharray/.test(hazardous), 'a division with a hazard is outlined orange and dashed, as on the screen');
  assert.equal(divisionMapHtml(data, { id: 'z0', code: 'X', polygon: null }), '', 'no polygon, no map');
});

console.log(`${n} checks passed`);
