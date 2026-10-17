// Checks for js/shared/licence.js: reading the AAMVA barcode on the back of a licence. Run: node dev/test-licence.mjs
import assert from 'node:assert/strict';
import { parseLicence, looksLikeLicence, licenceExpired, licenceTail } from '../js/shared/licence.js';

let n = 0;
function t(name, fn) { fn(); n++; console.log('ok', name); }

const TEXAS = '@\n\x1e\rANSI 636015090002DL00410278ZT03190024DLDAQ12345678\nDCSHALE\nDDEN\nDACJORDAN\nDDFN\nDADLEE\nDDGN\nDCAC\nDCBNONE\nDCDNONE\nDBD01152022\nDBB03041990\nDBA03042030\nDBC1\nDAU070 in\nDAYBRO\nDAG108 PECAN LN\nDAICEDAR FORK\nDAJTX\nDAK787000000  \nDCF12345678901234567\nDCGUSA\nDAW180\nDDAF\nDDB10012016\rZTZTAN\nZTB...\r';
const ONTARIO = '@\n\x1e\rANSI 636012080002DL00410233ZO02740042DLDAQH1234-56789-01234\nDCSOKONKWO\nDACGRACE\nDADNONE\nDBB19880207\nDBA20290207\nDBD20240207\nDAG14 RIVERSIDE DR\nDAITORONTO\nDAJON\nDAKM5V1A1\nDCGCAN\rZOZOA...\r';

t('a Texas licence gives the name, the dates and the address, month first', () => {
  const r = parseLicence(TEXAS);
  assert.equal(r.fullName, 'Jordan Lee Hale');
  assert.equal(r.dateOfBirth, '1990-03-04');
  assert.equal(r.licenceNumber, '12345678');
  assert.equal(r.licenceState, 'TX');
  assert.equal(r.expires, '2030-03-04');
  assert.equal(r.address, '108 Pecan Ln, Cedar Fork, TX 78700');
  assert.equal(r.country, 'USA');
});
t('a Canadian licence reads year first and skips a middle name of NONE', () => {
  const r = parseLicence(ONTARIO);
  assert.equal(r.fullName, 'Grace Okonkwo');
  assert.equal(r.dateOfBirth, '1988-02-07');
  assert.equal(r.expires, '2029-02-07');
  assert.equal(r.licenceNumber, 'H1234-56789-01234');
  assert.equal(r.address, '14 Riverside Dr, Toronto, ON M5V 1A1');
});
t('other barcodes are not licences', () => {
  assert.equal(looksLikeLicence('https://clickemt.com/field/?join=CEDAR7'), false);
  assert.equal(parseLicence('hello'), null);
  assert.equal(parseLicence(''), null);
});
t('expiry and the tail of a number', () => {
  assert.equal(licenceExpired('2030-03-04', new Date('2026-10-17')), false);
  assert.equal(licenceExpired('2024-03-04', new Date('2026-10-17')), true);
  assert.equal(licenceExpired(null), false);
  assert.equal(licenceTail('12345678'), '···5678');
  assert.equal(licenceTail(''), '');
});
console.log(n + ' checks passed');
