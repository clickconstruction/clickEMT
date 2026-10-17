// The barcode on the back of a North American driver's licence: PDF417 carrying AAMVA records,
// three-letter element ids each followed by a value, one per line, after a header that names the
// issuer and the subfiles. This reads the few the incident needs: who, born when, which licence,
// until when, from where. No DOM, so Node tests it. Jurisdiction-specific "Z" elements are ignored.
const MONTHS = { USA: 'mdy', CAN: 'ymd' };

function titleCase(s) {
  return String(s || '').toLowerCase().replace(/(^|[\s'-])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/\bMc([a-z])/g, (m, b) => 'Mc' + b.toUpperCase());
}
function isoDate(v, order) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length !== 8) return null;
  const y = order === 'ymd' ? d.slice(0, 4) : d.slice(4, 8);
  const mo = order === 'ymd' ? d.slice(4, 6) : d.slice(0, 2);
  const da = order === 'ymd' ? d.slice(6, 8) : d.slice(2, 4);
  if (Number(mo) < 1 || Number(mo) > 12 || Number(da) < 1 || Number(da) > 31) return null;
  return `${y}-${mo}-${da}`;
}

// true when the text is an AAMVA barcode payload at all
export function looksLikeLicence(text) { return /ANSI |AAMVA/.test(String(text || '')); }

export function parseLicence(text) {
  const raw = String(text || '');
  if (!looksLikeLicence(raw)) return null;
  // drop the header: everything up to the DL or ID subfile designator that is followed by a data element
  const body = raw.replace(/^[\s\S]*?(?:DL|ID)(?=D[A-Z]{2})/, '');
  const f = {};
  for (const line of body.split(/[\n\r]+/)) {
    const m = /^([A-Z]{3})(.*)$/.exec(line.trim());
    if (m && !(m[1] in f)) f[m[1]] = m[2].trim();
  }
  const country = (f.DCG || 'USA').toUpperCase();
  const order = MONTHS[country] || 'mdy';
  const last = f.DCS || f.DAB || '', first = f.DAC || f.DCT || '', middle = f.DAD || '';
  let fullName = [first, middle, last].filter((x) => x && x !== 'NONE').map(titleCase).join(' ').trim();
  if (!fullName && f.DAA) fullName = titleCase(f.DAA.replace(/,/g, ' ').replace(/\s+/g, ' '));
  const rawZip = (f.DAK || '').trim();
  const zip = country === 'CAN' ? rawZip.replace(/[^A-Za-z0-9]/g, '').toUpperCase().replace(/^(\w{3})(\w{3})$/, '$1 $2') : rawZip.replace(/\D/g, '').slice(0, 5);
  const address = [titleCase(f.DAG), titleCase(f.DAI), [(f.DAJ || '').toUpperCase(), zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const out = {
    fullName,
    firstName: titleCase(first), middleName: middle === 'NONE' ? '' : titleCase(middle), lastName: titleCase(last),
    dateOfBirth: isoDate(f.DBB, order),
    licenceNumber: (f.DAQ || '').toUpperCase().replace(/\s+/g, ''),
    licenceState: (f.DAJ || '').toUpperCase(),
    expires: isoDate(f.DBA, order),
    issued: isoDate(f.DBD, order),
    address,
    country
  };
  if (!out.fullName && !out.licenceNumber) return null;
  return out;
}

// a licence that has run out is still identification, but Operations should know
export function licenceExpired(expiresIso, now = new Date()) {
  if (!expiresIso) return false;
  return new Date(expiresIso + 'T23:59:59') < now;
}
// the last few characters of a licence number, for a list that should not show the whole thing
export function licenceTail(number) { const n = String(number || ''); return n ? '···' + n.slice(-4) : ''; }
