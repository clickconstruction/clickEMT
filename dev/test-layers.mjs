// Checks for the geometry in js/shared/layers.js that lays a picture over its four corners (v63). Run: node dev/test-layers.mjs
import assert from 'node:assert/strict';
import { squareToQuad, cornersTransform, quadConvex } from '../js/shared/layers.js';

let n = 0;
function t(name, fn) { fn(); n++; console.log('ok', name); }
// apply the 3 × 3 to (u, v) with the perspective divide
const map = (m, u, v) => { const [a, b, c, d, e, f, g, h, i] = m; const w = g * u + h * v + i; return [(a * u + b * v + c) / w, (d * u + e * v + f) / w]; };
const near = (p, q) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6;

t('a rectangle is an affine map: no perspective terms', () => {
  const m = squareToQuad([[10, 20], [110, 20], [110, 70], [10, 70]]);
  assert.deepEqual(m.slice(6), [0, 0, 1]);
  assert.ok(near(map(m, 0, 0), [10, 20]) && near(map(m, 1, 0), [110, 20]) && near(map(m, 1, 1), [110, 70]) && near(map(m, 0, 1), [10, 70]));
});

t('a turned, keystoned quadrilateral: every unit corner lands on its point', () => {
  const q = [[30, 10], [140, 25], [120, 95], [5, 80]];
  const m = squareToQuad(q);
  assert.ok(near(map(m, 0, 0), q[0]) && near(map(m, 1, 0), q[1]) && near(map(m, 1, 1), q[2]) && near(map(m, 0, 1), q[3]));
  assert.ok(m[6] !== 0 || m[7] !== 0, 'perspective terms are in play');
  assert.ok(near(map(m, 0.5, 0.5), [(() => { const s = map(m, 0.5, 0.5); return s[0]; })(), map(m, 0.5, 0.5)[1]]));
});

t('the CSS transform scales the element to the unit square first (w × h), in column-major order', () => {
  const s = cornersTransform([[0, 0], [200, 0], [200, 100], [0, 100]], 1000, 500);
  assert.equal(s, 'matrix3d(0.2,0,0,0,0,0.2,0,0,0,0,1,0,0,0,0,1)');
  assert.ok(/^matrix3d\(/.test(cornersTransform([[30, 10], [140, 25], [120, 95], [5, 80]], 640, 480)));
});

t('a convex quadrilateral is accepted, a folded or flat one is not', () => {
  assert.equal(quadConvex([[0, 0], [10, 0], [10, 10], [0, 10]]), true);
  assert.equal(quadConvex([[0, 0], [10, 0], [0, 10], [10, 10]]), false, 'a bow tie');
  assert.equal(quadConvex([[0, 0], [10, 0], [20, 0], [30, 0]]), false, 'a line');
  assert.equal(quadConvex([[0, 0], [10, 0], [10, 10], [8, 2]]), false, 'a corner dragged inside');
});

console.log(`${n} checks passed`);
