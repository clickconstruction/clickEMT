// QR codes for joining an incident. The base and a unit show one; a phone reads one and lands on
// the field app with the join code filled in. The code inside is the join link, so a plain QR
// reader opens the site too. Drawing needs the page's global `qrcode` (vendor/qrcode-generator,
// MIT); reading is js/field/scan.js. No DOM here, so Node can test the parsing.
export const CODE_RE = /^[A-Z2-9]{6}$/;   // the alphabet ic_create_incident uses: no 0, O, 1 or I

// The link a QR carries: the field app with ?join=<code>. `fieldApp` is the field app's address
// (the base passes new URL('field/', document.baseURI), the field its own folder).
export function joinUrl(code, fieldApp) {
  const u = new URL(fieldApp);
  u.search = '?join=' + encodeURIComponent(String(code || '').trim().toUpperCase());
  u.hash = '';
  return u.toString();
}

// What a scan or a typed string means: a join link, a link with the code in its path, or the
// bare code. Null when it is none of those.
export function codeFromScan(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const bare = t.toUpperCase();
  if (CODE_RE.test(bare)) return bare;
  try {
    const u = new URL(t);
    const q = (u.searchParams.get('join') || '').trim().toUpperCase();
    if (CODE_RE.test(q)) return q;
  } catch (e) { /* not a link */ }
  const m = /(?:join|code)[=:/\s]+([A-Za-z2-9]{6})\b/i.exec(t);
  return m ? m[1].toUpperCase() : null;
}

// The code in a page's own address, if someone arrived through a join link.
export function codeFromSearch(search) {
  const q = new URLSearchParams(search || '').get('join');
  return q ? codeFromScan(q) : null;
}

// An inline SVG of the code, scalable to its box. Level M: a quarter of it can be dirty or torn.
export function qrSvg(text, { margin = 2, label } = {}) {
  const make = typeof window !== 'undefined' && window.qrcode;
  if (!make) return '';
  const q = make(0, 'M');
  q.addData(String(text), 'Byte');
  q.make();
  const svg = q.createSvgTag({ cellSize: 4, margin: margin * 4, scalable: true });
  return label ? svg.replace('<svg ', `<svg role="img" aria-label="${String(label).replace(/"/g, '&quot;')}" `) : svg.replace('<svg ', '<svg aria-hidden="true" ');
}
