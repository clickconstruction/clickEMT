// Checks for js/shared/hours.js. Run: node dev/test-hours.mjs
import assert from 'node:assert/strict';
import { hoursRows, hoursTotals, hoursCsv } from '../js/shared/hours.js';

let n = 0;
function t(name, fn) { fn(); n++; console.log('ok', name); }
const T = (h, m = 0) => new Date(Date.UTC(2026, 9, 17, h, m)).toISOString();
const NOW = Date.UTC(2026, 9, 17, 18, 30);
const period = { starts_at: T(7), closed_at: null };
const members = [
  { user_id: 'u1', role: 'unit', unit_name: 'Unit 1', agency: 'Cedar Fork FD', joined_at: T(7, 40), checked_out_at: null, status: 'assigned' },
  { user_id: 'u2', role: 'unit', unit_name: 'Unit 2', agency: 'Travis County Rescue', joined_at: T(6, 0), checked_out_at: T(17, 50), status: 'checked_out', demob: { open: ['radio and equipment not yet returned'] } },
  { user_id: 'ops', role: 'ops', unit_name: 'Operations', agency: '', joined_at: T(6, 30), checked_out_at: null, status: 'available' }
];
const people = [
  { user_id: 'u1', name: 'Ramirez', role: 'Lt.', qualifications: ['swift_water'], agency: '', checked_in_at: T(7, 40), checked_out_at: null },
  { user_id: 'u2', name: 'Nguyen', role: '', qualifications: [], agency: '', checked_in_at: T(6, 0), checked_out_at: T(17, 50) },
  { user_id: 'u2', name: 'Smith', role: '', qualifications: ['rope'], agency: '', checked_in_at: T(13, 10), checked_out_at: null },
  { user_id: 'u2', name: 'Gone', role: '', qualifications: [], agency: '', checked_in_at: T(5), checked_out_at: T(6, 30) },
  { user_id: 'u1', name: 'Old', role: '', qualifications: [], agency: '', checked_in_at: T(8), checked_out_at: null, archived_at: T(9) }
];

t('a person still on scene is counted to now, one who left with the unit to the unit\'s check-out, one before the period not at all', () => {
  const rows = hoursRows({ people, members, period, now: NOW });
  const by = Object.fromEntries(rows.map((r) => [r.name, r]));
  assert.equal(by.Ramirez.hours, 10.83); assert.equal(by.Ramirez.note, 'on scene'); assert.equal(by.Ramirez.out, null);
  assert.equal(by.Nguyen.hours, 10.83, 'cut at the period\'s start, 07:00 to 17:50'); assert.equal(by.Nguyen.note, 'checked out');
  assert.equal(by.Smith.hours, 4.67); assert.match(by.Smith.note, /left with the unit/); assert.equal(by.Smith.inferred, true);
  assert.equal(by.Gone, undefined); assert.equal(by.Old, undefined);
  assert.equal(by['Unit 2'].hours, 10.83); assert.match(by['Unit 2'].note, /radio and equipment/);
  assert.equal(rows.filter((r) => r.kind === 'unit').length, 2, 'Operations is not a unit');
});
t('totals by agency and the inferred count', () => {
  const tot = hoursTotals(hoursRows({ people, members, period, now: NOW }));
  assert.equal(tot.people, 3); assert.equal(tot.peopleOn, 1, 'Smith left with the unit'); assert.equal(tot.units, 2);
  assert.equal(tot.byAgency[0][0], 'Travis County Rescue'); assert.equal(tot.byAgency[0][1], 15.5);
  assert.equal(tot.inferred, 3, 'Ramirez, Smith and Unit 1');
});
t('the whole incident when no period is given, and the CSV shape', () => {
  const rows = hoursRows({ people, members, period: null, now: NOW });
  assert.ok(rows.some((r) => r.name === 'Gone' && r.hours === 1.5), 'before the period but inside the incident');
  const csv = hoursCsv(rows.slice(0, 1), 'Cedar Fork', 'OP 1');
  assert.equal(csv.split('\r\n')[0], 'incident,period,row,name,unit,agency,role,checked_in_utc,checked_out_utc,hours,note');
  assert.match(csv.split('\r\n')[1], /^"Cedar Fork","OP 1","person","Ramirez","Unit 1","Cedar Fork FD","Lt., swift water","2026-10-17 07:40","","10.83","on scene"$/);
});
console.log(n + ' checks passed');
