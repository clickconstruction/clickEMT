// Hours on scene for Finance: every person and every unit from check-in to check-out, cut at the
// edges of a period. Nobody types a time; a row says when a number had to be inferred. No DOM,
// so Node tests it and both views can show it.
const H = 3600000;
const ms = (iso) => (iso ? new Date(iso).getTime() : null);
const round2 = (x) => Math.round(x * 100) / 100;

// The window: a period's start to its close (or now), else the whole incident so far.
export function hoursWindow(period, members, now = Date.now(), people = []) {
  if (period) return { from: ms(period.starts_at), to: period.closed_at ? ms(period.closed_at) : now, closed: !!period.closed_at };
  const first = members.map((m) => ms(m.joined_at)).concat(people.map((p) => ms(p.checked_in_at))).filter(Boolean);
  return { from: first.length ? Math.min(...first) : now, to: now, closed: false };
}

// One row per person and one per unit. `people` rows carry user_id (the unit), checked_in_at,
// checked_out_at, name, role, qualifications, agency; `members` carry user_id, unit_name, role,
// agency, joined_at, checked_out_at, status.
export function hoursRows({ people, members, period, now = Date.now() }) {
  const { from, to, closed } = hoursWindow(period, members, now, people);
  const unitOf = new Map(members.map((m) => [m.user_id, m]));
  const rows = [];
  const unitOut = (m) => (m && m.status === 'checked_out' && m.checked_out_at ? ms(m.checked_out_at) : null);
  for (const p of people) {
    if (p.archived_at) continue;
    const m = unitOf.get(p.user_id);
    const start = Math.max(ms(p.checked_in_at) || from, from);
    let end, note = '';
    if (p.checked_out_at) { end = ms(p.checked_out_at); note = 'checked out'; }
    else if (unitOut(m)) { end = unitOut(m); note = 'left with the unit, not checked out: counted to the unit\'s check-out'; }
    else { end = to; note = closed ? 'counted to the period\'s end' : 'on scene'; }
    end = Math.min(end, to);
    if (end <= start) continue;   // not on scene in this window
    rows.push({ kind: 'person', name: p.name, unit: m ? (m.unit_name || '') : '', agency: p.agency || (m ? m.agency : '') || '', role: [p.role, ...(p.qualifications || [])].filter(Boolean).join(', '), in: new Date(start).toISOString(), out: p.checked_out_at || unitOut(m) ? new Date(end).toISOString() : null, hours: round2((end - start) / H), note, inferred: !p.checked_out_at });
  }
  for (const m of members) {
    if (m.role !== 'unit') continue;
    const start = Math.max(ms(m.joined_at) || from, from);
    const out = unitOut(m);
    let end = out || to, note = out ? 'checked out' : (closed ? 'counted to the period\'s end' : 'on scene');
    end = Math.min(end, to);
    if (end <= start) continue;
    const open = m.demob && Array.isArray(m.demob.open) && m.demob.open.length ? ' · at check-out: ' + m.demob.open.join(', ') : '';
    rows.push({ kind: 'unit', name: m.unit_name || 'Unit', unit: m.unit_name || '', agency: m.agency || '', role: '', in: new Date(start).toISOString(), out: out ? new Date(end).toISOString() : null, hours: round2((end - start) / H), note: note + open, inferred: !out });
  }
  return rows;
}

export function hoursTotals(rows) {
  const people = rows.filter((r) => r.kind === 'person'), units = rows.filter((r) => r.kind === 'unit');
  const byAgency = new Map();
  for (const r of people) byAgency.set(r.agency || 'No agency named', round2((byAgency.get(r.agency || 'No agency named') || 0) + r.hours));
  return {
    peopleHours: round2(people.reduce((n, r) => n + r.hours, 0)), people: people.length, peopleOn: people.filter((r) => !r.out).length,
    unitHours: round2(units.reduce((n, r) => n + r.hours, 0)), units: units.length,
    byAgency: [...byAgency.entries()].sort((a, b) => b[1] - a[1]),
    inferred: rows.filter((r) => r.inferred).length
  };
}

// The CSV a spreadsheet opens as it is: one row per person, then one per unit.
export function hoursCsv(rows, incidentName, periodName) {
  const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const hhmm = (iso) => (iso ? new Date(iso).toISOString().slice(0, 16).replace('T', ' ') : '');
  const head = ['incident', 'period', 'row', 'name', 'unit', 'agency', 'role', 'checked_in_utc', 'checked_out_utc', 'hours', 'note'];
  const lines = [head.join(',')];
  for (const r of rows) lines.push([incidentName, periodName, r.kind, r.name, r.unit, r.agency, r.role, hhmm(r.in), hhmm(r.out), r.hours.toFixed(2), r.note].map(q).join(','));
  return lines.join('\r\n') + '\r\n';
}
