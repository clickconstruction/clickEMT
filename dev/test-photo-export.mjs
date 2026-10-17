// js/base/photo-export.js: the zip the Public Information Officer downloads and the caption written into
// each picture. node dev/test-photo-export.mjs (chained into npm test). The zip is read back by this
// module and, where the system has it, by unzip itself.
import { crc32, zip, unzip, photoCaption, photoFileName, imageType, jpegWithCaption, pngWithCaption, withCaption, whenText } from '../js/base/photo-export.js';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

let passed = 0, failed = 0;
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log('FAIL', name, detail); } }
const enc = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder().decode(b);
const has = (bytes, s) => dec(bytes).includes(s);

check('crc32 of the quick brown fox', crc32(enc('The quick brown fox jumps over the lazy dog')) === 0x414FA339, crc32(enc('The quick brown fox jumps over the lazy dog')).toString(16));
check('crc32 of nothing', crc32(new Uint8Array(0)) === 0);

const at = new Date(2026, 9, 17, 5, 53, 12);
check('the time in words', whenText(at) === '17 October 2026 at 05:53', whenText(at));
const cap = photoCaption({ note: 'water over road', place: 'Riverside Drive (division A-1)', incident: 'Cedar Fork Flooding', takenAt: at, credit: 'Cedar Fork Fire Department' });
check('a caption: what, where, when, whose', cap === 'Water over road. Riverside Drive (division A-1), Cedar Fork Flooding, 17 October 2026 at 05:53. Photo: Cedar Fork Fire Department.', cap);
const bare = photoCaption({ note: '', place: '', incident: 'Cedar Fork Flooding', takenAt: at, credit: 'Unit 3' });
check('with no note and no division', bare === 'Cedar Fork Flooding, 17 October 2026 at 05:53. Photo: Unit 3.', bare);
check('a file name from the time, the division and the note', photoFileName({ takenAt: at, code: 'A-1', note: 'Water over road!', ext: 'jpg' }) === '2026-10-17_0553_A-1_water-over-road.jpg', photoFileName({ takenAt: at, code: 'A-1', note: 'Water over road!', ext: 'jpg' }));
check('and without a division or a note', photoFileName({ takenAt: at, code: '', note: '', ext: 'png' }) === '2026-10-17_0553.png');

// a JPEG's caption goes after the JFIF header, as XMP and as a comment
const jfif = [0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
const jpeg = new Uint8Array([0xFF, 0xD8, ...jfif, 0xFF, 0xDB, 0x00, 0x03, 0x00, 0xFF, 0xD9]);
check('a JPEG is known by its first bytes', imageType(jpeg) === 'jpg');
const j2 = jpegWithCaption(jpeg, { caption: cap + ' <&>', title: 'Water over road', credit: 'Cedar Fork Fire Department', takenAt: at });
check('the start marker and the JFIF header stay first', j2[0] === 0xFF && j2[1] === 0xD8 && j2[2] === 0xFF && j2[3] === 0xE0 && j2[20] === 0xFF && j2[21] === 0xE1, [...j2.subarray(0, 24)].map((b) => b.toString(16)).join(' '));
const app1Len = (j2[22] << 8) | j2[23];
check('the XMP segment\'s length is its own', j2[20 + 2 + app1Len] === 0xFF && j2[20 + 2 + app1Len + 1] === 0xFE, app1Len);
check('the XMP carries the caption escaped, the credit and the date', has(j2, 'http://ns.adobe.com/xap/1.0/') && has(j2, 'Water over road. Riverside Drive (division A-1)') && has(j2, '&lt;&amp;&gt;') && has(j2, '<photoshop:Credit>Cedar Fork Fire Department</photoshop:Credit>') && has(j2, '<photoshop:DateCreated>2026-10-17T05:53:12</photoshop:DateCreated>'));
check('the picture itself is untouched after the new segments', j2.length > jpeg.length && dec(j2.subarray(j2.length - 7)) === dec(jpeg.subarray(jpeg.length - 7)));

// a PNG's caption is an iTXt chunk after IHDR with a good checksum
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
check('a PNG is known by its first bytes', imageType(png) === 'png');
const p2 = pngWithCaption(png, { caption: 'Café sign under water' });
const chunks = [];
for (let o = 8; o < p2.length;) {
  const len = (p2[o] << 24) | (p2[o + 1] << 16) | (p2[o + 2] << 8) | p2[o + 3];
  const type = dec(p2.subarray(o + 4, o + 8));
  const crc = ((p2[o + 8 + len] << 24) | (p2[o + 9 + len] << 16) | (p2[o + 10 + len] << 8) | p2[o + 11 + len]) >>> 0;
  chunks.push({ type, ok: crc32(p2.subarray(o + 4, o + 8 + len)) === crc, text: dec(p2.subarray(o + 8, o + 8 + len)) });
  o += 12 + len;
}
check('the PNG reads IHDR, iTXt, then the rest, every checksum good', chunks.map((c) => c.type).join(' ') === 'IHDR iTXt IDAT IEND' && chunks.every((c) => c.ok), chunks.map((c) => c.type + (c.ok ? '' : '!')).join(' '));
check('the iTXt is the Description in UTF-8', chunks[1].text.startsWith('Description\0') && chunks[1].text.endsWith('Café sign under water'));
check('anything else comes back as it was', withCaption(enc('GIF89a'), { caption: 'x' }).length === 6);

// the zip, read back here and by the system's unzip
const files = [{ name: '2026-10-17_0553_A-1_water-over-road.jpg', bytes: j2, date: at }, { name: 'captions.txt', bytes: enc('Captions, with a café\n'), date: at }];
const z = zip(files);
const back = unzip(z);
check('the zip reads back: two entries, the same names and bytes', back.length === 2 && back[0].name === files[0].name && back[1].name === 'captions.txt' && dec(back[1].bytes) === 'Captions, with a café\n' && back[0].bytes.length === j2.length);
const dir = mkdtempSync(join(tmpdir(), 'photo-export-'));
try {
  writeFileSync(join(dir, 'cleared.zip'), z);
  let out = null;
  try { out = execFileSync('unzip', ['-t', join(dir, 'cleared.zip')], { encoding: 'utf8' }); } catch (e) { out = e.code === 'ENOENT' ? null : String(e.stdout || e.message); }
  if (out !== null) check('the system\'s unzip finds no errors', /No errors detected/.test(out), out);
  else console.log('(no unzip on this system; skipped its check)');
} finally { rmSync(dir, { recursive: true, force: true }); }

console.log(`photo-export: ${passed}/${passed + failed} passed`);
if (failed) process.exit(1);
