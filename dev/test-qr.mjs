// Checks for js/shared/qr.js: what a scan or a link means. Run: node dev/test-qr.mjs
import assert from 'node:assert/strict';
import { codeFromScan, codeFromSearch, joinUrl, CODE_RE } from '../js/shared/qr.js';

let n = 0;
function t(name, fn) { fn(); n++; console.log('ok', name); }

t('the join link carries the code upper case on the field app', () => {
  assert.equal(joinUrl('cedar7', 'https://clickemt.com/field/'), 'https://clickemt.com/field/?join=CEDAR7');
  assert.equal(joinUrl('CEDAR7', 'http://localhost:8766/field/?mock#x'), 'http://localhost:8766/field/?join=CEDAR7');
});
t('a scan means the code whether it is the link, the bare code or words around it', () => {
  assert.equal(codeFromScan('https://clickemt.com/field/?join=CEDAR7'), 'CEDAR7');
  assert.equal(codeFromScan('cedar7'), 'CEDAR7');
  assert.equal(codeFromScan('Join code: cedar7'), 'CEDAR7');
  assert.equal(codeFromScan('https://example.com/other'), null, 'another site\'s link is not a code');
  assert.equal(codeFromScan('CEDAR0'), null, 'letters the code alphabet never uses');
  assert.equal(codeFromScan(''), null);
  assert.ok(CODE_RE.test('ABC234') && !CODE_RE.test('ABC2341'));
});
t('the page address gives the code once', () => {
  assert.equal(codeFromSearch('?join=cedar7&mock'), 'CEDAR7');
  assert.equal(codeFromSearch('?mock'), null);
});
console.log(n + ' checks passed');
