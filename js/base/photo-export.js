// The cleared photos for the Public Information Officer: one zip, each picture with its caption (what
// it shows, where, when, whose) written into the file itself, so it travels with the picture into any
// newsroom tool, and listed again in captions.txt for anyone without one. No library: the zip is
// stored, not compressed (a JPEG does not shrink), and the caption is an XMP description in a JPEG
// (with a JPEG comment beside it) or an iTXt Description in a PNG. The place is the division's name and
// code, never the coordinates: a public photo should not lead anyone to a house.
// Strings and bytes only, no DOM, so dev/test-photo-export.mjs runs it in Node.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n) => String(n).padStart(2, '0');
const enc = (s) => new TextEncoder().encode(s);

// "17 October 2026 at 05:53", in this screen's time zone
export function whenText(d) { return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} at ${pad(d.getHours())}:${pad(d.getMinutes())}`; }

function sentence(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  return t[0].toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? '' : '.');
}

// The caption, newsroom order: what it shows, where, the incident and when, then the credit.
//   { note, place, incident, takenAt: Date, credit }
export function photoCaption({ note, place, incident, takenAt, credit }) {
  const where = [place, incident].filter(Boolean).join(', ');
  return [sentence(note), sentence([where, takenAt ? whenText(takenAt) : ''].filter(Boolean).join(', ')), credit ? 'Photo: ' + sentence(credit) : ''].filter(Boolean).join(' ');
}

// "2026-10-17_0553_A-1_water-over-road.jpg"
export function photoFileName({ takenAt, code, note, ext }) {
  const slug = String(note || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  const d = takenAt;
  return [`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, pad(d.getHours()) + pad(d.getMinutes()), code ? code.replace(/[^A-Za-z0-9-]+/g, '') : '', slug].filter(Boolean).join('_') + '.' + (ext || 'jpg');
}

export function imageType(bytes) {
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) return 'jpg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'png';
  return '';
}

const xml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// The caption into the picture: JPEG and PNG; anything else comes back as it was.
//   meta: { caption, title, credit, takenAt: Date }
export function withCaption(bytes, meta) {
  const t = imageType(bytes);
  if (t === 'jpg') return jpegWithCaption(bytes, meta);
  if (t === 'png') return pngWithCaption(bytes, meta);
  return bytes;
}

function segment(marker, payload) {
  const len = payload.length + 2;
  if (len > 0xFFFF) return new Uint8Array(0);
  return concat([new Uint8Array([0xFF, marker, len >> 8, len & 0xFF]), payload]);
}
export function jpegWithCaption(bytes, { caption, title, credit, takenAt }) {
  const d = takenAt;
  const created = d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` : '';
  const packet = '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>'
    + '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
    + '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/">'
    + `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${xml(caption)}</rdf:li></rdf:Alt></dc:description>`
    + (title ? `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xml(title)}</rdf:li></rdf:Alt></dc:title>` : '')
    + (credit ? `<photoshop:Credit>${xml(credit)}</photoshop:Credit>` : '')
    + (created ? `<photoshop:DateCreated>${created}</photoshop:DateCreated>` : '')
    + '</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>';
  const app1 = segment(0xE1, concat([enc('http://ns.adobe.com/xap/1.0/\0'), enc(packet)]));
  const com = segment(0xFE, enc(caption));
  // after the JFIF header when there is one (it must stay first), else straight after the start marker
  let at = 2;
  if (bytes[2] === 0xFF && bytes[3] === 0xE0) at = 4 + ((bytes[4] << 8) | bytes[5]);
  return concat([bytes.subarray(0, at), app1, com, bytes.subarray(at)]);
}

export function pngWithCaption(bytes, { caption }) {
  // iTXt: keyword, no compression, no language, no translated keyword, the words in UTF-8; after IHDR
  const body = concat([enc('iTXt'), enc('Description'), new Uint8Array([0, 0, 0, 0, 0]), enc(caption)]);
  const len = body.length - 4;
  const crc = crc32(body);
  const chunk = concat([u32be(len), body, u32be(crc)]);
  const ihdrEnd = 8 + 4 + 4 + ((bytes[8] << 24) | (bytes[9] << 16) | (bytes[10] << 8) | bytes[11]) + 4;
  return concat([bytes.subarray(0, ihdrEnd), chunk, bytes.subarray(ihdrEnd)]);
}

// ---- the zip: stored entries, UTF-8 names, one central directory
let TABLE = null;
export function crc32(bytes) {
  if (!TABLE) {
    TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; TABLE[n] = c >>> 0; }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function u32be(n) { return new Uint8Array([(n >>> 24) & 0xFF, (n >>> 16) & 0xFF, (n >>> 8) & 0xFF, n & 0xFF]); }
function le(n, size) { const b = new Uint8Array(size); for (let i = 0; i < size; i++) b[i] = (n >>> (8 * i)) & 0xFF; return b; }
function dosTime(d) { return ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF; }
function dosDate(d) { return (((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF; }

// files: [{ name, bytes: Uint8Array, date: Date }] → the zip's bytes
export function zip(files) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = enc(f.name), data = f.bytes, d = f.date || new Date();
    const crc = crc32(data);
    const common = concat([le(10, 2), le(0x0800, 2), le(0, 2), le(dosTime(d), 2), le(dosDate(d), 2), le(crc, 4), le(data.length, 4), le(data.length, 4), le(name.length, 2), le(0, 2)]);
    const local = concat([le(0x04034b50, 4), common, name, data]);
    centrals.push(concat([le(0x02014b50, 4), le(20, 2), common, le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(offset, 4), name]));
    locals.push(local);
    offset += local.length;
  }
  const cd = concat(centrals);
  const end = concat([le(0x06054b50, 4), le(0, 2), le(0, 2), le(files.length, 2), le(files.length, 2), le(cd.length, 4), le(offset, 4), le(0, 2)]);
  return concat([...locals, cd, end]);
}

// What is inside a zip this module made: [{ name, bytes }]. For the tests, and for nothing else.
export function unzip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let e = bytes.length - 22;
  while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not a zip');
  const count = v.getUint16(e + 10, true);
  let p = v.getUint32(e + 16, true);
  const out = [];
  for (let i = 0; i < count; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('bad central directory');
    const crc = v.getUint32(p + 16, true), size = v.getUint32(p + 20, true), nlen = v.getUint16(p + 28, true), elen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true), at = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nlen));
    if (v.getUint32(at, true) !== 0x04034b50) throw new Error('bad local header for ' + name);
    const start = at + 30 + v.getUint16(at + 26, true) + v.getUint16(at + 28, true);
    const data = bytes.subarray(start, start + size);
    if (crc32(data) !== crc) throw new Error('bad checksum for ' + name);
    out.push({ name, bytes: data });
    p += 46 + nlen + elen + clen;
  }
  return out;
}
