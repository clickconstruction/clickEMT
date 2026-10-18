// The moment a JPEG was taken, from its Exif (v62): DateTimeOriginal, else DateTime, as "YYYY-MM-DDTHH:MM" on the
// camera's own clock (Exif carries no zone), or '' when the file has none. No library: the APP1 segment, the TIFF
// header's byte order, IFD0 and the Exif IFD it points at. Nothing else in the file is read.
export function exifTaken(buf) {
  const b = buf instanceof ArrayBuffer ? new DataView(buf) : new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (b.byteLength < 12 || b.getUint16(0) !== 0xFFD8) return '';
  let p = 2;
  while (p + 4 <= b.byteLength) {
    if (b.getUint8(p) !== 0xFF) return '';
    const marker = b.getUint8(p + 1);
    if (marker === 0xFF) { p += 1; continue; }                                            // fill bytes
    if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD8)) { p += 2; continue; }       // markers with no length
    if (marker === 0xDA || marker === 0xD9) return '';                                     // the picture data: no Exif after it
    const len = b.getUint16(p + 2);
    if (marker === 0xE1 && len >= 8 && b.getUint32(p + 4) === 0x45786966) return readTiff(b, p + 10);   // 'Exif'
    p += 2 + len;
  }
  return '';
}
function readTiff(b, t) {
  if (t + 8 > b.byteLength) return '';
  const le = b.getUint16(t) === 0x4949;
  const u16 = (o) => b.getUint16(o, le), u32 = (o) => b.getUint32(o, le);
  if (u16(t + 2) !== 42) return '';
  const ascii = (o, n) => { let s = ''; for (let i = 0; i < n && o + i < b.byteLength; i++) { const c = b.getUint8(o + i); if (!c) break; s += String.fromCharCode(c); } return s; };
  const read = (ifd) => {   // the dates and the Exif pointer of one IFD
    const out = {};
    if (ifd + 2 > b.byteLength) return out;
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (e + 12 > b.byteLength) break;
      const tag = u16(e), type = u16(e + 2), count = u32(e + 4);
      if (tag === 0x8769 && type === 4) out.exif = u32(e + 8);
      else if ((tag === 0x9003 || tag === 0x0132) && type === 2 && count >= 19) out[tag] = ascii(count > 4 ? t + u32(e + 8) : e + 8, Math.min(count, 20));
    }
    return out;
  };
  const a = read(t + u32(t + 4)), x = a.exif ? read(t + a.exif) : {};
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2})/.exec(x[0x9003] || a[0x0132] || '');
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : '';
}
