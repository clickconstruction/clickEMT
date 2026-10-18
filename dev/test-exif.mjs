// Checks for js/shared/exif.js (v67): a JPEG's Exif date, from a file built here byte by byte. Run: node dev/test-exif.mjs
import assert from 'node:assert/strict';
import { exifTaken } from '../js/shared/exif.js';

let n = 0;
function t(name, fn) { fn(); n++; console.log('ok', name); }

// SOI, an APP1 Exif segment with IFD0 → Exif IFD → DateTimeOriginal (and IFD0's own DateTime), then SOS
function jpegWith({ le = true, original = '2026:10:18 06:40:12', plain = '2026:10:19 09:00:00', exifIfd = true } = {}) {
  const tiff = [];
  const u16 = (v) => le ? [v & 255, v >> 8] : [v >> 8, v & 255];
  const u32 = (v) => le ? [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255] : [(v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255];
  const str = (s) => [...Buffer.from(s + '\0', 'latin1')];
  tiff.push(...(le ? [0x49, 0x49] : [0x4D, 0x4D]), ...u16(42), ...u32(8));
  // IFD0 at 8: two entries (DateTime 0x0132, ExifIFD 0x8769), next 0
  const ifd0Len = 2 + (exifIfd ? 2 : 1) * 12 + 4;
  const dateOff = 8 + ifd0Len;                   // DateTime's 20 bytes
  const exifOff = dateOff + 20;                  // the Exif IFD
  const origOff = exifOff + 2 + 12 + 4;          // DateTimeOriginal's 20 bytes
  tiff.push(...u16(exifIfd ? 2 : 1));
  tiff.push(...u16(0x0132), ...u16(2), ...u32(20), ...u32(dateOff));
  if (exifIfd) tiff.push(...u16(0x8769), ...u16(4), ...u32(1), ...u32(exifOff));
  tiff.push(...u32(0));
  tiff.push(...str(plain));
  if (exifIfd) { tiff.push(...u16(1), ...u16(0x9003), ...u16(2), ...u32(20), ...u32(origOff), ...u32(0), ...str(original)); }
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const len = app1.length + 2;
  return new Uint8Array([0xFF, 0xD8, 0xFF, 0xE1, len >> 8, len & 255, ...app1, 0xFF, 0xDA, 0, 2, 0xFF, 0xD9]);
}

t('DateTimeOriginal wins, little-endian', () => { assert.equal(exifTaken(jpegWith()), '2026-10-18T06:40'); });
t('and big-endian', () => { assert.equal(exifTaken(jpegWith({ le: false })), '2026-10-18T06:40'); });
t('without an Exif IFD, IFD0\'s DateTime stands in', () => { assert.equal(exifTaken(jpegWith({ exifIfd: false })), '2026-10-19T09:00'); });
t('a JPEG with no Exif, a PNG, or junk gives nothing', () => {
  assert.equal(exifTaken(new Uint8Array([0xFF, 0xD8, 0xFF, 0xDA, 0, 2, 0xFF, 0xD9])), '');
  assert.equal(exifTaken(new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0, 0, 0, 0, 0, 0, 0, 0, 0])), '');
  assert.equal(exifTaken(new ArrayBuffer(4)), '');
});
t('a date that is not a date gives nothing', () => { assert.equal(exifTaken(jpegWith({ original: '    :  :     :  :  ' })), ''); });

console.log(`${n} checks passed`);
