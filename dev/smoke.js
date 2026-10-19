// Smoke test for the base and the field against the mock. Open http://localhost:8766/?mock in a
// window at least 1100 px wide, with no other mock tab open, then in the console:
//   const { run } = await import('/dev/smoke.js'); await run()
// or one suite: await run({ only: ['fieldReports'] }). Returns { passed, total, failed, results }
// and logs a summary. Each suite resets the mock data and reopens the incident in the page first.
//
// The base's own actions are driven through the page (buttons, the map, the forms). The field's
// reports are sent through a second Data instance signed in as Unit 3, the same module the field
// app uses, and after each one the test reads what the base's Data sees and what the page draws.
import { Data } from '../js/shared/data.js';
import { markingFor, ringToLatLngs, nextPass, nearestFacility, dayIso, cornersBox, accountText } from '../js/shared/rules.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const text = (s) => ($(s) ? $(s).innerText.replace(/\s+/g, ' ').trim().toLowerCase() : '');
const has = (s, ...needles) => { const t = text(s); return needles.every((x) => t.includes(x.toLowerCase())); };
const until = async (fn, ms = 4000) => { const end = Date.now() + ms; let v = fn(); while (!v && Date.now() < end) { await wait(50); v = fn(); } return v; };
const M = () => window.__mock;
// The app's own questions (v62): while on, every question the base asks is answered with its first button, as the old
// window.confirm stub did; off, a suite reads the dialog and presses it itself.
let autoConfirmObs = null;
function autoConfirm(on) {
  if (autoConfirmObs) { autoConfirmObs.disconnect(); autoConfirmObs = null; }
  if (!on) return;
  const dlg = $('#confirm-dialog'); if (!dlg) return;
  const press = () => { if (dlg.open) $('#confirm-ok').click(); };
  autoConfirmObs = new MutationObserver(press); autoConfirmObs.observe(dlg, { attributes: true, attributeFilter: ['open'] }); press();
}
const logTexts = () => $$('#log .log-row').map((r) => r.innerText.replace(/\s+/g, ' ').trim());
// the 211 as a table (v72): one person's row, found by the name in its first cell, as collapsed lower-case text
const row211 = (name) => { const tr = $$('#briefing-page table.t211 tbody tr').find((r) => r.cells[0] && r.cells[0].querySelector('b') && r.cells[0].querySelector('b').textContent.toLowerCase() === name.toLowerCase()); return tr ? tr.innerText.replace(/\s+/g, ' ').trim().toLowerCase() : ''; };
const eventText = (data, t) => data.events().find((e) => e.text === t) || null;
const uuid = () => crypto.randomUUID();
const tinyPng = () => new Promise((resolve) => { const c = document.createElement('canvas'); c.width = 40; c.height = 30; const g = c.getContext('2d'); g.fillStyle = 'rgba(90,120,80,0.8)'; g.fillRect(0, 0, 40, 30); c.toBlob(resolve, 'image/png'); });
const tinyJpeg = () => new Promise((resolve) => { const c = document.createElement('canvas'); c.width = 32; c.height = 24; const g = c.getContext('2d'); g.fillStyle = '#5B8FC9'; g.fillRect(0, 0, 32, 24); c.toBlob(resolve, 'image/jpeg', 0.7); });
// A click on the map at an offset from its centre, as Leaflet sees a real one (it reads clientX/Y).
function mapClick(dx, dy) {
  const el = $('#map'), r = el.getBoundingClientRect();
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2 + dx, clientY: r.top + r.height / 2 + dy }));
}

let base = null, field = null;
const INC = () => M().ids.incident;
const ZONE = (code) => M().ids.zones[code];
const USERS = () => M().ids.users;

// Sign a raw client in on the stand-in (v73): Send code, read the code it "sent", verify. An address or a mobile number.
async function mockSignIn(c, to) {
  const who = /@/.test(to) ? { email: to } : { phone: to };
  const sent = await c.auth.signInWithOtp(who); if (sent.error) throw sent.error;
  const v = await c.auth.verifyOtp(Object.assign({ token: M().codeFor(to), type: who.email ? 'email' : 'sms' }, who)); if (v.error) throw v.error;
  return v.data;
}
// Reset the mock, make the page reopen the incident through its own handler, and open two Data
// instances on it: the base's client (Operations) and a field client signed in as Unit 3.
async function reload() {
  await M().ready();
  window.confirm = () => { throw new Error('the browser confirm() was called: the app asks with #confirm-dialog (v62)'); };   // any confirm() left anywhere fails loudly
  autoConfirm(false);
  if (base) base.close();
  if (field) field.close();
  M().reset();
  if (!$('#draw-btns').hidden) $('[data-action="cancel-draw"]').click();
  try { localStorage.setItem('ic.base.around', '1'); } catch (e) { /* storage blocked */ }   // the first open's labels (v58) stay off the suites; the around suite asks for them itself
  try { sessionStorage.removeItem('ic.base.invite'); } catch (e) { /* storage blocked */ }   // an invitation's landing tried by hand in this tab would send the pop-out's boot to the picker (v73)
  if ($('#around .around-all')) $('#around .around-all').click();
  for (const s of ['#briefing', '#transports', '#public', '#people']) if ($(s) && !$(s).hidden) $(s + ' [data-action^="close-"]').click();   // a page left open would take the next suite's Escape (v64)
  const btn = document.createElement('button');
  btn.dataset.action = 'open-incident'; btn.dataset.id = INC(); btn.hidden = true;
  document.body.appendChild(btn); btn.click(); btn.remove();
  const ok = await until(() => !$('#app').hidden && $('#inc-name').textContent === 'Cedar Fork Flooding' && $$('#zones .zr').length === 6 && !!$('#panel [data-home]'));
  if (!ok) throw new Error('the page did not reopen the seeded incident');
  if ($('#logbox').classList.contains('closed')) $('[data-action="log-toggle"]').click();   // a folded log from an earlier run hides the rows the suites read
  base = new Data(window.sb);
  await base.init();
  await base.open(INC());
  const fc = window.supabase.createClient();
  await mockSignIn(fc, 'unit3@mock.local');
  field = new Data(fc);
  await field.init();
  await field.open(INC());
  await wait(60);
}

export async function run({ only } = {}) {
  const results = [];
  const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail: String(detail).slice(0, 200) });
  const suites = { seeded, baseActions, boundary, fieldReports, emergency, messages, accountability, people, periods, assignment, search, facilities, reports, agencies, publicInfo, replay, log, layers, zoneCard, join, identity, legend, sections, ics100, walkfix, evacuees, members, safetyset, parbyname, newcomer, checkIn, permissions, rewalks, transports, tags, invite, around, pages, credentials, passwordless, demo, starters };
  for (const [name, fn] of Object.entries(suites)) {
    if (only && !only.includes(name)) continue;
    try { await reload(); await fn(check); } catch (e) { check(`${name}: threw`, false, e.stack || e.message); }
  }
  if (base) { base.close(); base = null; }
  if (field) { field.close(); field = null; }
  const failed = results.filter((r) => !r.ok);
  console.log(`smoke: ${results.length - failed.length}/${results.length} passed`, failed);
  return { passed: results.length - failed.length, total: results.length, failed, results };
}

// The page opens straight onto the seeded incident, signed in as Operations.
async function seeded(check) {
  check('the base is signed in as Operations and on Cedar Fork Flooding', base.user.id === USERS().ops && base.me().role === 'ops' && has('#inc-name', 'cedar fork flooding'));
  check('six zones in the list, by priority then code', $$('#zones .zr .zr-id').map((e) => e.textContent).join(' ') === 'A-1 A-2 A-3 B-1 B-2 B-3' && $$('#zones .zr .pb').map((e) => e.textContent).join('') === '112223', $$('#zones .zr .zr-id').map((e) => e.textContent).join(' '));
  check('the map draws the boundary, six zones, three units, three photo pins and a hazard', $$('#map path').length >= 7 && $$('#map .umark').length === 3 && $$('#map .ppin').length === 3 && $$('#map .hmark').length === 1, `${$$('#map path').length} paths, ${$$('#map .umark').length} units, ${$$('#map .ppin').length} pins, ${$$('#map .hmark').length} hazards`);
  check('the home panel lists the three units, each with its division at the right of its row (v61)', has('#panel', 'unit 1', 'unit 2', 'unit 3') && $$('#panel .ur .ur-where').map((e) => e.textContent).join(' ') === 'A-1 B-1 A-2' && /assigned to a-1 since/i.test($('#panel .ur .ur-where').title) && has('#panel .rs-head', 'units · 6 people in the field on 3 units') && $$('#panel .seg.board-mode button').map((b) => b.textContent).join('/') === 'Kind/Status', text('#panel').slice(0, 300));
  check('the PAR is one line and a row of answers: all six accounted for by the last answer (v61)', has('#panel', 'head count (par)', 'all 6 accounted for by') && $$('#panel .par-chip.ok').length === 3 && has('#panel .par-chips', 'unit 1 · all accounted for (2)'), text('#panel .par-chips'));
  check('the log has the morning in it, newest first', logTexts().length >= 12 && /shelter open/i.test(logTexts()[0]) && /incident opened/i.test(logTexts()[logTexts().length - 1]), logTexts()[0]);
  check('live updates say live', has('#live-text', 'live') && base.realtime === 'SUBSCRIBED', text('#live-text'));
  // the header's right end (v59): the three pills at the end of the buttons row, the code alone, the clock local then UTC
  check('the join code, the connection and the clock are the header\'s last group, at its right end, the code pill reading the code alone and the connection a quiet dot while live', !!$('.top > .top-pills #inc-code') && $('#inc-code').textContent === 'CEDAR7' && /join code/i.test($('#inc-code').title) && $('#live-pill').classList.contains('quiet') && /live/i.test($('#live-pill').title) && !!$('.top-pills button#clock') && (() => { const p = $('.top-pills').getBoundingClientRect(), t = $('.top').getBoundingClientRect(); return Math.abs(p.right - (t.right - 16)) < 3 && p.bottom <= t.bottom; })(), $('#inc-code').textContent + ' | ' + $('#live-pill').className);
  const clk = () => $('#clock').textContent.trim();
  if (/UTC$/.test(clk())) $('[data-action="clock"]').click();
  const nowLocal = () => [0, 60000].map((ms) => new Date(Date.now() - ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
  const nowUtc = () => [0, 60000].map((ms) => { const x = new Date(Date.now() - ms); return String(x.getUTCHours()).padStart(2, '0') + ':' + String(x.getUTCMinutes()).padStart(2, '0'); });
  check('the clock reads the local time with the zone\'s short name, and says a click gives UTC', /^\d\d:\d\d( \S+)?$/.test(clk()) && !/UTC$/.test(clk()) && nowLocal().includes(clk().slice(0, 5)) && /click for utc/i.test($('#clock').title), clk());
  $('[data-action="clock"]').click();
  check('a click swaps it to UTC, the right hour, kept for this device', /^\d\d:\d\d UTC$/.test(clk()) && nowUtc().includes(clk().slice(0, 5)) && localStorage.getItem('ic.base.clock') === 'utc' && /local/i.test($('#clock').title), clk() + ' | ' + nowUtc().join('/'));
  // every time in UTC (v81): the log, the line and the printed forms follow the clock, a Z on each
  const utcOf = (iso) => { const x = new Date(iso); return String(x.getUTCHours()).padStart(2, '0') + ':' + String(x.getUTCMinutes()).padStart(2, '0') + 'Z'; };
  check('every time on the screen follows: the log\'s lines read with a Z, the newest the right UTC minute, and the toast says so', await until(() => /Z$/.test($('#log .log-row .t').textContent)) && $$('#log .log-row .t').every((t) => /^\d\d:\d\dZ$/.test(t.textContent)) && $('#log .log-row .t').textContent === utcOf(base.events()[0].at) && has('#toast', 'every time on this screen is utc now'), $('#log .log-row .t').textContent + ' | ' + utcOf(base.events()[0].at));
  $('[data-action="print-214"]').click();
  check('the printed 214 says Times UTC (Z) in its head and its lines carry the Z', await until(() => !$('#briefing').hidden && has('#briefing-page', 'times utc (z)')) && /^\d\d:\d\dZ  Incident opened/.test((() => { const secs = $$('#briefing-page section'); return $$('p', secs[secs.length - 1]).map((p) => p.textContent)[0] || ''; })()) && /prepared by operations, \d+ \w+ 2026 \d\d:\d\dZ/i.test(text('#briefing-page')), text('#briefing-page').slice(0, 240));
  $('[data-action="close-briefing"]').click(); await until(() => $('#briefing').hidden);
  $('[data-action="clock"]').click();
  check('and back to local', !/UTC$/.test(clk()) && nowLocal().includes(clk().slice(0, 5)) && localStorage.getItem('ic.base.clock') === 'local', clk());
  check('and every time with it: no Z on the log, and the 214\'s head says Times local with the zone', await until(() => !/Z$/.test($('#log .log-row .t').textContent)) && $$('#log .log-row .t').every((t) => /^\d\d:\d\d$/.test(t.textContent)) && (() => { $('[data-action="print-214"]').click(); return true; })() && await until(() => !$('#briefing').hidden && has('#briefing-page', 'times local')) && !has('#briefing-page', 'times utc'), text('#briefing-page').slice(0, 240));
  $('[data-action="close-briefing"]').click(); await until(() => $('#briefing').hidden);
  // ---- the incident line and its card (v76): the line says what changes, the alarm first; a rest opens the card to peek, a click keeps it
  const lineText = () => $('#inc-sub').textContent.replace(/\s*·\s*/g, ' · ').replace(/\s*▾\s*$/, ' ▾').replace(/\s+/g, ' ').trim();
  check('the line under the name is a button saying what changes, the alarm first, with a caret; the hours, the IC and the base are not on it', /^Period 1 · (overdue \d+(h( \d+m)?|m)|to \d\d:\d\d) · 3 units · 6 divisions, 1 cleared · 1 hazard open ▾$/.test(lineText()) && !/Dana|Base:|\d\d:\d\d to \d\d:\d\d/.test(lineText()) && $('#inc-sub').tagName === 'BUTTON' && $('#inc-pop').hidden && ((/overdue/.test(lineText())) === !!$('#inc-sub .warn')), lineText());
  $('#inc-sub').dispatchEvent(new MouseEvent('mouseenter'));
  check('a rest of half a second on the line opens the card to peek, not kept', !(await until(() => !$('#inc-pop').hidden, 300)) && await until(() => !$('#inc-pop').hidden, 1500) && !$('#inc-sub').classList.contains('on') && $$('#inc-pop .ic-tile').length === 4, $$('#inc-pop .ic-tile').length + ' tiles');
  $('#inc-sub').dispatchEvent(new MouseEvent('mouseleave'));
  check('the pointer leaving lets it go', await until(() => $('#inc-pop').hidden, 1500));
  $('#inc-sub').click();
  check('a click keeps it: the caret lit; four tiles with one number each (the units, the divisions, the hazard), the names at the foot', await until(() => !$('#inc-pop').hidden) && $('#inc-sub').classList.contains('on') && $$('#inc-pop .ic-tile .ic-big').map((b) => b.textContent).slice(1).join('|') === '3|6|1' && has('#inc-pop .ic-foot', 'ic dana ruiz', 'operations marcus bell', 'cedar fork high school', 'cedar fork fire department leads'), $$('#inc-pop .ic-tile .ic-big').map((b) => b.textContent).join('|'));
  check('the divisions tile carries a bar of the search, cleared to not started, and the counts in one line', $$('#inc-pop .ic-bar .seg').map((x) => x.className.replace('seg ', '')).join('|') === 'cleared|active|open' && has('#inc-pop', '1 cleared', '3 in progress', '2 not started'), $$('#inc-pop .ic-bar .seg').map((x) => x.className).join('|'));
  $('#inc-pop .ic-tile[data-action="people"]').click();
  check('a tile is the button to its place: the units tile opens the People board and the card goes', await until(() => !$('#people').hidden) && $('#inc-pop').hidden, $('#people').hidden + ' ' + $('#inc-pop').hidden);
  $('#people [data-action^="close-"]').click();
  await until(() => $('#people').hidden);
  $('#inc-sub').click();
  await until(() => !$('#inc-pop').hidden);
  document.body.click();
  check('a click elsewhere closes it', await until(() => $('#inc-pop').hidden) && $('#inc-sub').getAttribute('aria-expanded') === 'false');
  // ---- v60: the gear in place of four buttons, the head count, the codes' and the connection's cards, the drawing buttons, a division's hover card
  check('the buttons sit in four groups, a word over each and a line between, every button still one press, the gear last with the pills (v80)', $$('.top-btns .top-group').length === 4 && $$('.top-btns .tg-label').map((l) => l.textContent).join(' | ') === 'This period | Boards | Forms | The day' && $$('.top-btns .tg-div').length === 3 && $$('.top-btns .top-group .btn').map((b) => b.dataset.action).join(' ') === 'period briefing people transports public org sitrep iap replay' && $$('.top-btns .top-group').map((g) => g.querySelectorAll('.btn').length).join('') === '2331' && (document.documentElement.clientWidth < 1240 || getComputedStyle($('.tg-label')).display !== 'none') && !!$('.top-pills .gear-wrap [data-action="gear"]') && $('.top-pills .gear-wrap').previousElementSibling.id === 'clock', $$('.top-btns .tg-label').map((l) => l.textContent).join(' | ') + ' · ' + $$('.top-btns .top-group .btn').map((b) => b.dataset.action).join(' '));
  check('the header row ends with a gear; Light, Settings, Pages (v64), Switch incident and Sign out are in its menu, not on the row', !!$('.top-pills [data-action="gear"]') && !$('.top-btns [data-action="gear"]') && !$('.top-btns > [data-action="settings"]') && !$('.top-btns > [data-action="sign-out"]') && $$('#gear-menu [data-action]').map((b) => b.dataset.action).join(' ') === 'settings theme show-around pages-size switch-incident sign-out' && $('#gear-menu').hidden, $$('#gear-menu [data-action]').map((b) => b.dataset.action).join(' '));
  $('[data-action="gear"]').click();
  check('the gear opens its menu; Escape closes it', !$('#gear-menu').hidden && (() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return $('#gear-menu').hidden; })());
  check('a head count sits beside Find a person: six people on three units, and it opens the People board', !$('#head-count').hidden && has('#head-count', '6', 'on 3 units') && /6 people in the field on 3 units/.test($('#head-count').title) && $('#head-count').dataset.action === 'people', text('#head-count'));
  $('#inc-code').click();
  check('the CEDAR7 pill opens the codes\' card: the join code with its QR, and the Operations code as dots', await until(() => !$('#codes-pop').hidden) && !!$('#codes-pop .qr-box svg') && has('#codes-pop', 'cedar7', 'operations code', '••••••••') && !text('#codes-pop').includes(M().ids.opsCode.toLowerCase()) && $('#inc-code').getAttribute('aria-expanded') === 'true', text('#codes-pop').slice(0, 200));
  $('#codes-pop [data-action="ops-show"]').click();
  check('Show reveals the Operations code; Hide puts the dots back', has('#codes-pop', M().ids.opsCode.toLowerCase()) && has('#codes-pop', 'hide') && (() => { $('#codes-pop [data-action="ops-show"]').click(); return has('#codes-pop', '••••••••'); })(), text('#codes-pop').slice(0, 200));
  // the app's own questions (v62): a question is #confirm-dialog, a <dialog> of the page's own, and Cancel changes nothing
  const opsBefore = base.opsCode();
  $('#codes-pop [data-action="new-ops-code"]').click();
  check('New code asks in the app\'s own dialog, not the browser\'s: the question, what it does, Cancel and Replace it (v62)', await until(() => $('#confirm-dialog').open) && $('#confirm-dialog').tagName === 'DIALOG' && has('#confirm-title', 'replace the operations code?') && has('#confirm-text', 'whoever has the old one can no longer join with it') && $('#confirm-ok').textContent === 'Replace it' && $('#confirm-cancel').textContent === 'Cancel', text('#confirm-title') + ' | ' + text('#confirm-text'));
  $('#confirm-cancel').click();
  await wait(200);
  check('Cancel closes it and the code is the same, nothing logged', !$('#confirm-dialog').open && base.opsCode() === opsBefore && !eventText(base, 'Operations code replaced; the old one no longer joins'), base.opsCode());
  if ($('#codes-pop').hidden) { $('#inc-code').click(); await until(() => !$('#codes-pop').hidden); }   // the click on the dialog counted as one outside the card
  $('#live-pill').click();
  check('the dot opens the connection\'s card and closes the codes\': live since when, the last update, the three units\' last reports, this base\'s version, Reconnect', await until(() => !$('#live-pop').hidden) && $('#codes-pop').hidden && has('#live-pop', 'connection', 'live since', 'last update', 'unit 1', 'unit 2', 'unit 3', 'this base') && !!$('#live-pop [data-action="reconnect"]'), text('#live-pop').slice(0, 300));
  document.body.click();
  check('a click outside closes it', $('#live-pop').hidden);
  check('the drawing buttons read Draw · Boundary · Division with their marks; on an incident with a boundary and divisions neither is lit and the hint is the plain one', has('.tools', 'draw', 'boundary', 'division') && !!$('#btn-boundary .sw-b') && !!$('#btn-zone .sw-d') && !$('#btn-boundary').classList.contains('pri') && !$('#btn-zone').classList.contains('pri') && has('#tool-hint', 'click a division, a unit or a photo pin'), text('.tools'));
  const a1row = $(`#zones .zr[data-id="${ZONE('A-1')}"]`);
  a1row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  check('resting on A-1\'s row for half a second opens its hover card beside the panel: tasked against in it now, the search, hazards, the last report, the objective', await until(() => !$('#zone-hover').hidden, 1500) && has('#zone-hover', 'a-1 riverside drive, east', 'tasked', 'unit 1', 'in it now', 'searched', '9 of 24', 'hazards open', 'last report', 'objective 1') && $('#zone-hover').getBoundingClientRect().right < $('.side').getBoundingClientRect().left, text('#zone-hover').slice(0, 300));
  $('#zones').dispatchEvent(new Event('mouseleave'));
  check('leaving the list closes it', $('#zone-hover').hidden);
  check('the field client is Unit 3, assigned A-2', field.user.id === USERS().unit3 && field.me().unit_name === 'Unit 3' && field.myZones().map((z) => z.code).join() === 'A-2');
}

// Operations at the base: select a zone, set its priority, assign and release a unit, draw a zone,
// open a photo, add a note.
async function baseActions(check) {
  const a1 = ZONE('A-1'), b2 = ZONE('B-2');
  $(`#zones .zr[data-id="${a1}"]`).click();
  await until(() => has('#panel .title', 'a-1'));
  check('selecting A-1 opens its panel, with its unit and photo', has('#panel .title', 'a-1', 'riverside drive') && has('#panel', 'in progress · unit 1 · 9 of 24') && $$('#panel [data-action="select-photo"]').length === 1, text('#panel .title'));
  check('its row is marked selected', $(`#zones .zr[data-id="${a1}"]`).classList.contains('sel'));

  $('#panel [data-action="set-priority"][data-p="3"]').click();
  await until(() => base.zone(a1).priority === 3 && eventText(base, 'A-1 priority set to 3'));
  check('priority 3: the base\'s data has it, the row moves down with a 3, and the log says so', base.zone(a1).priority === 3 && $(`#zones .zr[data-id="${a1}"] .pb`).textContent === '3' && $$('#zones .zr .zr-id').map((e) => e.textContent).join(' ') === 'A-2 A-3 B-1 B-2 A-1 B-3' && logTexts()[0].endsWith('A-1 priority set to 3 Open division'), logTexts()[0]);
  check('the event is by Operations and points at the zone', (() => { const e = eventText(base, 'A-1 priority set to 3'); return e && e.user_id === USERS().ops && e.kind === 'ops' && e.ref_table === 'ic_zones' && e.ref_id === a1; })());
  check('the zone\'s updated_at moved', M().tables.ic_zones.find((z) => z.id === a1).updated_at > M().tables.ic_zones.find((z) => z.id === a1).created_at);

  $(`#zones .zr[data-id="${b2}"]`).click();
  await until(() => has('#panel .title', 'b-2'));
  $(`#panel [data-action="assign"][data-user="${USERS().unit2}"]`).click();
  await until(() => base.zone(b2).assigned_to === USERS().unit2 && eventText(base, 'B-2 assigned to Unit 2'));
  check('assigning Unit 2 to B-2 makes it active and logs it', base.zone(b2).status === 'active' && $(`#zones .zr[data-id="${b2}"] .sdot`).classList.contains('active') && has(`#zones .zr[data-id="${b2}"]`, 'assigned, not accepted · unit 2'), text(`#zones .zr[data-id="${b2}"]`));   // v42: not In progress until the unit accepts or reports
  check('the field client sees the assignment too', await until(() => field.zone(b2).assigned_to === USERS().unit2));
  $(`#panel [data-action="assign"][data-user="${USERS().unit2}"]`).click();
  await until(() => base.zone(b2).assigned_to === null && eventText(base, 'B-2 released from Unit 2'));
  check('pressing the unit again releases the zone, back to not started', base.zone(b2).status === 'open' && $(`#panel [data-action="assign"][data-user="${USERS().unit2}"]`).classList.contains('on') === false, text('#panel'));

  const before = $$('#map path').length;
  $('#btn-zone').click();
  check('Draw zone arms the map and says what to do', $('#map').classList.contains('drawing') && has('#tool-hint', 'outline the division') && !$('#draw-btns').hidden);
  mapClick(-70, -40); mapClick(70, -40); mapClick(0, 50);
  check('three clicks on the map are three corners, drawn as a dashed outline with its dots', has('#tool-hint', '3 points') && $$('#map path').length === before + 4, `${$$('#map path').length - before} new paths · ${text('#tool-hint')}`);
  $('[data-action="finish-draw"]').click();
  await until(() => $('#panel form[data-form="new-zone"]'));
  const form = $('#panel form[data-form="new-zone"]');
  check('Finish opens the new-zone form with the next code in the last division', !!form && form.code.value === 'B-4' && !$('#map').classList.contains('drawing'), form && form.code.value);
  form.name.value = 'Smoke test zone'; form.structures.value = '5';
  form.requestSubmit();
  await until(() => base.zoneByCode('B-4') && eventText(base, 'Division B-4 drawn, priority 2'));
  const b4 = base.zoneByCode('B-4');
  check('the zone is saved with the drawn polygon, priority 2, 5 structures', !!b4 && ringToLatLngs(b4.polygon).length === 3 && b4.priority === 2 && b4.structures === 5 && b4.name === 'Smoke test zone' && b4.status === 'open');
  check('it is selected, in the list, on the map, and in the log', has('#panel .title', 'b-4', 'smoke test zone') && $$('#zones .zr').length === 7 && $$('#map .zpill').length === 7 && /Division B-4 drawn, priority 2/.test(logTexts()[0]), logTexts()[0]);
  check('the field client sees the new zone', await until(() => field.zoneByCode('B-4')));

  const p3 = M().ids.photos[2];
  $(`#log [data-action="select-photo"][data-id="${p3}"]`).click();
  const img = await until(() => { const i = $('#panel [data-photo-box] img'); return i && !i.hidden && i.src.startsWith('blob:') ? i : null; });
  check('View photo on a log line opens the photo, served as an object URL', !!img, img ? img.src : text('#panel'));
  check('the photo panel names Unit 3, A-2 and the heading', has('#panel', 'unit 3', 'a-2 · pecan mobile home park', 'facing s 180°', 'blocked access'), text('#panel'));
  check('the pin on the map is marked selected', $$('#map .ppin.sel').length === 1);

  $('#note-form input').value = 'Smoke test note for the log';
  $('#note-form').requestSubmit();
  await until(() => eventText(base, 'Smoke test note for the log'));
  const note = eventText(base, 'Smoke test note for the log');
  check('a note goes into the log as a note event by Operations', !!note && note.kind === 'note' && note.user_id === USERS().ops && await until(() => /Smoke test note for the log$/.test(logTexts()[0])) && $('#note-form input').value === '', logTexts()[0]);
  check('the field client sees the note', await until(() => eventText(field, 'Smoke test note for the log')));
}

// The incident boundary is redrawn from the map and logged by the incident trigger.
async function boundary(check) {
  const old = JSON.stringify(base.incident.boundary);
  $('#btn-boundary').click();
  mapClick(-120, -80); mapClick(120, -80); mapClick(120, 80); mapClick(-120, 80);
  check('four corners for the boundary', has('#tool-hint', '4 points'), text('#tool-hint'));
  mapClick(-200, 0);
  check('a fifth, wrong corner', has('#tool-hint', '5 points') && $$('#map .leaflet-interactive').length >= 1, text('#tool-hint'));
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
  check('Backspace takes the last corner off', has('#tool-hint', '4 points'), text('#tool-hint'));
  $('#note-form input').focus();
  $('#note-form input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
  $('#note-form input').blur();
  check('…but not while typing in a field', has('#tool-hint', '4 points'), text('#tool-hint'));
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
  check('Delete does the same, and the button is there for a mouse', has('#tool-hint', '3 points') && !$('#btn-undo-point').hidden, text('#tool-hint'));
  $('#btn-undo-point').click();
  check('the button takes one off too, and the outline is a line again under three points', has('#tool-hint', '2 of at least 3 points'), text('#tool-hint'));
  mapClick(120, 80); mapClick(-120, 80);
  check('two corners put back', has('#tool-hint', '4 points'), text('#tool-hint'));
  $('[data-action="finish-draw"]').click();
  await until(() => JSON.stringify(base.incident.boundary) !== old && eventText(base, 'Incident boundary redrawn'));
  check('the boundary is saved with four points and the log says it was redrawn', ringToLatLngs(base.incident.boundary).length === 4 && !!eventText(base, 'Incident boundary redrawn') && has('#toast', 'boundary saved'), text('#toast'));
  check('the field client has the new boundary', await until(() => JSON.stringify(field.incident.boundary) === JSON.stringify(base.incident.boundary)));
}

// Unit 3 in the field: a photo with a heading, an address clear, the zone clear with its marking,
// a hazard (and the base resolving it).
async function fieldReports(check) {
  const a2 = ZONE('A-2'), b2 = ZONE('B-2');
  const pid = uuid();
  const pins = $$('#map .ppin').length;
  const photo = await field.addPhoto(pid, await tinyJpeg(), { lat: 30.2672, lng: -97.7388, heading: 45, note: 'Water over road', zoneId: a2 });
  check('addPhoto returns the row with its storage path', photo.id === pid && photo.storage_path === `${INC()}/${USERS().unit3}/${pid}.jpg` && photo.user_id === USERS().unit3);
  await until(() => base.photo(pid) && eventText(base, 'Unit 3 sent a photo from A-2, facing NE 045°: Water over road'));
  check('the base sees the photo and the log line with unit, zone, heading and note', !!base.photo(pid) && base.photo(pid).heading === 45 && !!eventText(base, 'Unit 3 sent a photo from A-2, facing NE 045°: Water over road'));
  check('the event is a photo event pointing at the photo', (() => { const e = eventText(base, 'Unit 3 sent a photo from A-2, facing NE 045°: Water over road'); return e.kind === 'photo' && e.ref_table === 'ic_photos' && e.ref_id === pid && e.user_id === USERS().unit3; })());
  check('one more pin on the map, and the base can load the file', await until(() => $$('#map .ppin').length === pins + 1) && (await base.photoUrl(photo.storage_path)).startsWith('blob:'));
  check('sending the same photo again is harmless (the outbox may retry)', (await field.addPhoto(pid, await tinyJpeg(), { lat: 30.2672, lng: -97.7388, heading: 45, note: 'Water over road', zoneId: a2 })).id === pid && M().tables.ic_photos.filter((p) => p.id === pid).length === 1);

  await field.updateZone(a2, { cleared: 7 });
  await until(() => base.zone(a2).cleared === 7);
  check('an address clear counts one more structure on the base', base.zone(a2).cleared === 7 && has(`#zones .zr[data-id="${a2}"]`, '7 of 18') && !!eventText(base, 'Structure cleared in A-2 (7 of 18)'), text(`#zones .zr[data-id="${a2}"]`));

  const green = $$('#map path[fill="#2E8B57"]').length;
  const z = field.zone(a2);
  const at = new Date();
  await field.updateZone(a2, { status: 'cleared', cleared: z.structures, cleared_at: at.toISOString(), marking: markingFor('U3', at, ['ELEC'], 1), hazard: true });
  await until(() => base.zone(a2).status === 'cleared' && $$('#map path[fill="#2E8B57"]').length === green + 1);
  check('the zone clear turns A-2 green on the base map and in the list', base.zone(a2).status === 'cleared' && $$('#map path[fill="#2E8B57"]').length === green + 1 && $(`#zones .zr[data-id="${a2}"] .sdot`).classList.contains('cleared') && has(`#zones .zr[data-id="${a2}"]`, 'cleared at', '18 of 18'), text(`#zones .zr[data-id="${a2}"]`));
  check('the log says A-2 was marked clear with one person found', !!eventText(base, 'A-2 marked clear (18 of 18), 1 found needing help') && eventText(base, 'A-2 marked clear (18 of 18), 1 found needing help').kind === 'clear');
  $(`#zones .zr[data-id="${a2}"]`).click();
  check('the marking painted shows on the zone panel', await until(() => has('#panel', 'team u3', 'hazards elec', 'people found 1')), text('#panel'));
  check('the header counts two zones cleared', has('#inc-sub', '2 cleared'), text('#inc-sub'));

  const hid = uuid();
  const marks = $$('#map .hmark').length;
  await field.addHazard(hid, { kind: 'Gas smell', note: 'Near the pump house', lat: 30.2598, lng: -97.7475, zoneId: b2 });
  await until(() => base.hazards().some((h) => h.id === hid) && base.zone(b2).hazard === true);
  check('a hazard reaches the base, flags its zone, and is logged with kind, note and unit', base.hazards().some((h) => h.id === hid) && base.zone(b2).hazard === true && !!eventText(base, 'Hazard in B-2: gas smell (Near the pump house), reported by Unit 3'));
  check('the zone row says hazard and the map has one more mark and an orange outline', has(`#zones .zr[data-id="${b2}"]`, 'hazard') && $$('#map .hmark').length === marks + 1 && $$('#map path[stroke="#D9822B"]').length >= 2, text(`#zones .zr[data-id="${b2}"]`));
  $(`#zones .zr[data-id="${b2}"]`).click();
  await until(() => $(`#panel [data-action="resolve-hazard"][data-id="${hid}"]`));
  $(`#panel [data-action="resolve-hazard"][data-id="${hid}"]`).click();
  await until(() => eventText(base, 'Hazard resolved in B-2: gas smell'));
  check('Resolved from the base logs it and takes the hazard off the open list on both sides', !!eventText(base, 'Hazard resolved in B-2: gas smell') && !base.hazards().some((h) => h.id === hid) && base.hazards(true).some((h) => h.id === hid) && await until(() => !field.hazards().some((h) => h.id === hid)));
  // v41: an act-on-now hazard waits on the bar until Operations acknowledges it; the home panel lists what is open and the header counts it
  const hid2 = uuid();
  if ($('#panel [data-action="close-panel"]')) { $('#panel [data-action="close-panel"]').click(); await until(() => !!$('#panel [data-home]')); }   // the Hazards open section is on the home panel
  await field.addHazard(hid2, { kind: 'Person or car in the water', note: 'one inside', urgency: 'now', lat: 30.2598, lng: -97.7475, zoneId: b2 });
  check('an urgent hazard sits on the bar with Acknowledge, the home panel lists it under Hazards open with its urgency, the header counts it, and the log carries the word', await until(() => has('#safety', 'hazard · person or car in the water, one inside', 'b-2') && !!$('#safety [data-action="ack-hazard"]')) && await until(() => has('#panel', 'hazards open · ', 'person or car in the water', 'act on now')) && has('#inc-sub', 'hazards open') && !!eventText(base, 'Hazard in B-2 (act on now): person or car in the water (one inside), reported by Unit 3'), text('#safety') + ' | ' + text('#inc-sub'));
  $('#safety [data-action="ack-hazard"]').click();
  check('Acknowledge takes it off the bar, logs it, and leaves it open on the list until Resolved', await until(() => !has('#safety', 'hazard ·')) && await until(() => eventText(base, 'Hazard acknowledged by Operations: person or car in the water in B-2')) && base.hazards().some((h) => h.id === hid2 && h.acked_at && !h.resolved_at) && await until(() => has('#panel', 'acknowledged')), logTexts()[0]);
  await base.resolveHazard(hid2);
  await until(() => !base.hazards().some((h) => h.id === hid2));
  // v46: a revisit time on a house record
  const rid = uuid(), rat = new Date(Date.now() + 2 * 3600000), rhh = String(rat.getHours()).padStart(2, '0') + ':' + String(rat.getMinutes()).padStart(2, '0');
  await field.addStructure(rid, { zone_id: b2, label: '113 Bee Creek Rd', status: 'not_searched', notes: 'on oxygen', revisit_at: rat.toISOString(), revisit_hhmm: rhh });   // the clock time as the phone types it (v47)
  await until(() => base.structure(rid));
  $(`#zones .zr[data-id="${b2}"]`).click();
  await until(() => has('#panel .title', 'b-2'));
  check('a revisit time shows on the division\'s structure list and is logged', await until(() => has('#panel', '113 bee creek rd · not searched', 'revisit ' + rhh)) && !!eventText(base, 'B-2: 113 Bee Creek Rd · revisit at ' + rhh + ' (on oxygen)'), text('#panel').slice(0, 600));
  $$('#panel button').find((x) => /print the 204/i.test(x.innerText)).click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', '204'));
  check('the 204 carries a Revisits section for the next crew', has('#briefing-page', 'revisits', '113 bee creek rd at ' + rhh + ' · on oxygen'), text('#briefing-page').slice(0, 1200));
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);
  $('#panel [data-action="close-panel"]').click();
}

// Unit 3 raises an alert, Operations acknowledges it on the base, Unit 3 stands down.
async function emergency(check) {
  const a2 = ZONE('A-2'), aid = uuid();
  await field.raiseAlert(aid, { lat: 30.2673, lng: -97.7386, zoneId: a2 });
  await until(() => !$('#mayday').hidden && eventText(base, 'EMERGENCY, Unit 3 needs help in A-2'));
  check('the alert shows the red bar on the base with the unit and zone', !$('#mayday').hidden && has('#mayday', 'emergency · unit 3 needs help in a-2') && !!$('#mayday [data-action="ack-alert"]'), text('#mayday'));
  check('the log has the emergency and the unit marker flashes', !!eventText(base, 'EMERGENCY, Unit 3 needs help in A-2') && eventText(base, 'EMERGENCY, Unit 3 needs help in A-2').kind === 'help' && $$('#map .umark.sos').length === 1);
  $('#mayday [data-action="ack-alert"]').click();
  await until(() => base.alerts()[0] && base.alerts()[0].acknowledged_at && eventText(base, 'Operations acknowledged the emergency from Unit 3'));
  const al = base.alerts()[0];
  check('Acknowledge stamps the alert with Operations and logs it', al.acknowledged_by === USERS().ops && !!al.acknowledged_at && $('#mayday').classList.contains('ack') && has('#mayday', 'acknowledged') && !$('#mayday [data-action="ack-alert"]'), text('#mayday'));
  check('the acknowledgement event is by Operations', eventText(base, 'Operations acknowledged the emergency from Unit 3').user_id === USERS().ops);
  check('the field client sees the acknowledgement', await until(() => field.alerts()[0] && field.alerts()[0].acknowledged_at));
  await field.standDown(aid);
  await until(() => $('#mayday').hidden && eventText(base, 'Unit 3 stood down, all OK'));
  check('standing down clears the bar, keeps the alert in history, and logs it', $('#mayday').hidden && base.alerts().length === 0 && base.alerts(true).some((a) => a.id === aid) && !!eventText(base, 'Unit 3 stood down, all OK') && $$('#map .umark.sos').length === 0);

  // v68: what's wrong and what you need, on the phone's sheet and after the send, read by the bar, the unit panel and the 214
  const count = (t) => base.events().filter((e) => e.text === t).length;
  let P = null;
  try {
    P = await phoneFrame();
    check('the field app opens beside the base as Unit 3', !!P.ready, P.text('#me-name'));
    if (P.$('#s-briefing') && !P.$('#s-briefing').hidden) await P.act('briefing-later');
    for (let i = 0; i < 4 && P.shown('#s-safety'); i++) {   // the seeded PAR, and anything else waiting on Unit 3's phone, is answered first
      const b = P.$('#s-safety [data-action="par-ok"]:not([disabled])') || P.$('#s-safety [data-action="ack"]');
      if (!b) break;
      b.click(); await wait(400);
    }
    await P.act('help');
    await until(() => P.shown('#s-help'), 5000);
    const kids = [...P.$('#s-help').children], at = (s) => kids.indexOf(P.$(s));
    check('Need help now offers six What\'s wrong chips and four What you need chips, none lit, between the Will be sent card and the buttons, with the shorter sentence', P.$$('#help-ask .chip').length === 10 && !P.$('#help-ask .chip.on') && /what's wrong/.test(P.text('#help-ask')) && /what you need/.test(P.text('#help-ask')) && /goes to operations and every unit, with your position/.test(P.text('#s-help')) && at('#s-help .card') < at('#help-ask') && at('#help-ask') < at('#s-help .sheet-btns'), P.text('#s-help').slice(0, 240));
    check('nothing wider than the phone with the chips on the sheet', P.sideways().length === 0, P.sideways().join('; '));
    const bare = 'EMERGENCY, Unit 3 needs help in A-2';
    P.$('#s-help [data-action="send-alert"]').click();   // a bare press: nothing chosen
    await until(() => P.shown('#s-helpsent'), 5000);
    await until(() => count(bare) === 2 && !$('#mayday').hidden, 30000);
    check('a bare press sends today\'s alert word for word: the bar and the 214 read as before', has('#mayday', 'emergency · unit 3 needs help in a-2 · sent') && count(bare) === 2 && base.alerts()[0].wrong.length === 0 && base.alerts()[0].needs.length === 0, text('#mayday'));
    check('Alert sent keeps the same two rows, nothing lit, and says Operations sees each tap', P.$$('#helpsent-ask .chip').length === 10 && !P.$('#helpsent-ask .chip.on') && /operations sees each tap/.test(P.text('#helpsent-ask')), P.text('#helpsent-ask'));
    P.$('#helpsent-ask .chip[data-code="medic"]').click();
    await until(() => eventText(base, 'Unit 3 adds: needs medic'), 30000);
    check('a chip tapped after the send updates the open alert: the bar reads it, the 214 says what was added, the chip stays lit', await until(() => has('#mayday', 'needs help in a-2 · needs medic · sent'), 5000) && base.alerts()[0].needs.includes('medic') && await until(() => P.$('#helpsent-ask .chip[data-code="medic"]').classList.contains('on'), 5000), text('#mayday'));
    P.$('#helpsent-ask .chip[data-code="trapped"]').click();
    await until(() => eventText(base, 'Unit 3 adds: trapped'), 30000);
    P.$('#helpsent-ask .chip[data-code="medic"]').click();   // a glove slip, taken back
    await until(() => eventText(base, 'Unit 3 takes back: medic'), 30000);
    check('a lit chip tapped again is taken back, logged, and the bar follows', await until(() => has('#mayday', 'needs help in a-2 · trapped · sent') && !has('#mayday', 'medic'), 5000), text('#mayday'));
    $('#mayday [data-action="select-unit"]').click();
    check('the unit panel\'s badge carries the words', await until(() => has('#panel', 'emergency · trapped'), 5000), text('#panel').slice(0, 300));
    $('#mayday [data-action="ack-alert"]').click();
    await until(() => base.alerts()[0] && base.alerts()[0].acknowledged_at, 10000);
    check('acknowledged, the badge keeps the words and adds the time', await until(() => /emergency · trapped · acknowledged \d\d:\d\d/.test(text('#panel')), 5000), text('#panel').slice(0, 300));
    await P.act('stand-down');
    await until(() => $('#mayday').hidden && count('Unit 3 stood down, all OK') === 2, 30000);
    // chips chosen before the send ride on the first line
    await P.act('help');
    await until(() => P.shown('#s-help'), 5000);
    P.$('#help-ask .chip[data-code="in_water"]').click(); P.$('#help-ask .chip[data-code="boat"]').click();
    check('chips chosen on the sheet light up, and Send alert stays the one red button', P.$$('#help-ask .chip.on').length === 2 && P.$('#s-help [data-action="send-alert"]').classList.contains('danger') && !P.$('#s-help [data-action="send-alert"]').disabled, P.$$('#help-ask .chip.on').map((c) => c.textContent).join());
    P.$('#s-help [data-action="send-alert"]').click();
    const said = 'EMERGENCY, Unit 3 needs help in A-2: in the water · needs boat';
    await until(() => eventText(base, said), 30000);
    check('the words ride on the first line and the bar, in the lists\' order, and the chips are lit on Alert sent', !!eventText(base, said) && await until(() => has('#mayday', 'needs help in a-2 · in the water · needs boat · sent'), 5000) && await until(() => P.shown('#s-helpsent') && P.$$('#helpsent-ask .chip.on').length === 2, 5000), text('#mayday'));
    await P.act('stand-down');
    await until(() => $('#mayday').hidden, 30000);
    check('the seed carries the morning\'s alert with its words, stood down, and its lines', base.alerts(true).some((a) => a.user_id === USERS().unit2 && a.wrong.includes('in_water') && a.needs.includes('boat') && a.stood_down_at) && !!eventText(base, 'EMERGENCY, Unit 2 needs help in B-1: in the water · needs boat') && !!eventText(base, 'Unit 2 stood down, all OK'));
  } finally { if (P) P.frame.remove(); }
}

// Messages (ICS 213): Operations messages Unit 3 and gets a reply, a safety message to everyone
// stays on the yellow bar until all three units acknowledge, and Unit 3 messages Operations.
async function messages(check) {
  const u = USERS();
  const composer = () => $('#panel form[data-form="message"]');
  check('the home panel shows the seeded messages, two still waiting on Unit 3 and Unit 1\'s stuck one acknowledged with its Now and Stuck badges (v74), and the two answered PARs, the first closed by the second (v38)', $$('#panel .mrow.message').length === 3 && $$('#panel .mrow .ack.wait').every((e) => /waiting on unit 3/i.test(e.textContent)) && $$('#panel .mrow.message').some((e) => e.querySelector('.badge.urg-now') && e.querySelector('.badge.stuck') && /all 1 acknowledged/i.test(e.textContent)) && $$('#panel .mrow.par').length === 2 && $$('#panel .mrow.par .ack').some((e) => /closed by the par started/i.test(e.textContent)), text('#panel'));
  check('Unit 3 has two unanswered messages in its inbox (the seeded PARs are answered or closed)', field.myUnanswered().length === 2 && field.myInbox().filter((m) => m.kind === 'message').length === 2, field.myUnanswered().map((m) => m.kind).join(','));
  check('the composer offers everyone, the three assigned zones and the three units', (() => { const o = $$('option', composer()).map((x) => x.value); return o[0] === 'all' && o.filter((v) => v.startsWith('zone:')).length === 3 && o.filter((v) => v.startsWith('user:')).length === 3; })(), $$('option', composer()).map((x) => x.textContent).join(' | '));

  composer().to.value = 'user:' + u.unit3;
  composer().text.value = 'Hold at the bridge until Unit 2 arrives';
  composer().requestSubmit();
  await until(() => base.messages()[0] && base.messages()[0].text === 'Hold at the bridge until Unit 2 arrives');
  const m1 = base.messages()[0];
  check('the message is saved to Unit 3 only, as a plain message from Operations', m1.from_user === u.ops && m1.to_users.length === 1 && m1.to_users[0] === u.unit3 && m1.to_label === 'Unit 3' && m1.kind === 'message');
  check('the panel lists it waiting on Unit 3, the composer is cleared, the log has it', await until(() => has(`#panel .mrow[data-message="${m1.id}"]`, 'waiting on unit 3')) && composer().text.value === '' && !!eventText(base, 'Operations to Unit 3: Hold at the bridge until Unit 2 arrives') && eventText(base, 'Operations to Unit 3: Hold at the bridge until Unit 2 arrives').kind === 'msg', logTexts()[0]);
  check('Unit 3 sees it in its inbox, unanswered', await until(() => field.message(m1.id)) && field.myUnanswered().some((m) => m.id === m1.id));
  await field.ackMessage(m1.id, 'Will do');
  await until(() => base.ack(m1.id, u.unit3));
  check('Unit 3 answers Will do: the panel says acknowledged with the reply, and the log has it', await until(() => has(`#panel .mrow[data-message="${m1.id}"]`, 'all 1 acknowledged', 'unit 3: will do')) && !!eventText(base, 'Unit 3 acknowledged Operations: Will do') && base.waitingOn(m1).length === 0, text(`#panel .mrow[data-message="${m1.id}"]`));
  check('answering twice is harmless', (await field.ackMessage(m1.id, 'Will do')) && base.acksFor(m1.id).length === 1);

  composer().to.value = 'all';
  composer().safety.checked = true;
  composer().text.value = 'Stop work, water rising at the low-water crossing';
  composer().requestSubmit();
  await until(() => base.messages()[0] && base.messages()[0].kind === 'safety');
  const s1 = base.messages()[0];
  check('a safety message goes to all three units', s1.to_users.length === 3 && s1.to_label === 'everyone' && s1.text === 'Stop work, water rising at the low-water crossing');
  check('the yellow bar shows it, the words first, waiting on all three (the names on hover)', await until(() => !$('#safety').hidden && has('#safety', 'safety · stop work', 'waiting on 3 units') && $$('#safety .bar-item').some((b) => /waiting on Unit 1, Unit 2, Unit 3/.test(b.title))), text('#safety'));
  check('the log marks it as a safety message', !!eventText(base, 'SAFETY MESSAGE, Operations to everyone: Stop work, water rising at the low-water crossing') && eventText(base, 'SAFETY MESSAGE, Operations to everyone: Stop work, water rising at the low-water crossing').kind === 'safety');
  check('Unit 3 has it as an unanswered safety message', await until(() => field.myUnanswered().some((m) => m.id === s1.id && m.kind === 'safety')));
  await field.ackMessage(s1.id, 'Acknowledged');
  check('after Unit 3 answers, the bar waits on Unit 1 and Unit 2', await until(() => has('#safety', 'waiting on 2 units') && $$('#safety .bar-item').some((b) => /waiting on Unit 1, Unit 2(?!, Unit 3)/.test(b.title) && !/Unit 3/.test(b.title))), text('#safety'));
  for (const email of ['unit1@mock.local', 'unit2@mock.local']) {
    const c = window.supabase.createClient();
    await mockSignIn(c, email);
    const d = new Data(c);
    await d.init(); await d.open(INC());
    await d.ackMessage(s1.id, 'Acknowledged');
    d.close();
  }
  check('once every unit has answered, the bar goes away and the log has each acknowledgement', await until(() => $('#safety').hidden) && !!eventText(base, 'Unit 1 acknowledged Operations: Acknowledged') && !!eventText(base, 'Unit 2 acknowledged Operations: Acknowledged') && base.openSafety().length === 0);

  const mid = uuid();
  await field.sendMessage(mid, { ...field.recipientsFor('ops'), kind: 'message', text: 'Need more hands at the park' });
  await until(() => base.message(mid));
  const row = () => $(`#panel .mrow[data-message="${mid}"]`);
  check('Unit 3 can message Operations, and the base panel shows it with an Acknowledge button', await until(() => row() && has(`#panel .mrow[data-message="${mid}"]`, 'unit 3', 'to operations', 'need more hands')) && !!$('[data-action="ack-message"]', row()), text('#panel'));
  $('[data-action="ack-message"]', row()).click();
  await until(() => base.ack(mid, u.ops));
  check('Operations acknowledges it from the panel, and the unit sees the acknowledgement', await until(() => has(`#panel .mrow[data-message="${mid}"]`, 'all 1 acknowledged')) && !!eventText(base, 'Operations acknowledged Unit 3: Copy') && await until(() => field.ack(mid, u.ops)));
  const urgent = uuid();
  await field.sendMessage(urgent, { ...field.recipientsFor('ops'), kind: 'message', text: 'Culvert washed out, road gone', urgency: 'now', blocking: true, lat: 30.2676, lng: -97.7388 });
  await until(() => base.message(urgent));
  check('a message carries its step, the stuck flag and the spot it is about, and the base shows all three (v74)', await until(() => has(`#panel .mrow[data-message="${urgent}"]`, 'culvert washed out') && !!$(`#panel .mrow[data-message="${urgent}"] .badge.urg-now`)) && $(`#panel .mrow[data-message="${urgent}"] .badge.urg-now`).textContent === 'Now' && $(`#panel .mrow[data-message="${urgent}"] .badge.stuck`).textContent === 'Stuck' && !!$(`#panel .mrow[data-message="${urgent}"] [data-action="pan-to"]`) && $$('#map .mpin.urg-now').length === 1, text(`#panel .mrow[data-message="${urgent}"]`));
  check('the log says the step and the flag, and that a location came with it', !!eventText(base, 'Unit 3 to Operations (now, stuck): Culvert washed out, road gone · location attached'), logTexts()[0]);
  const badUrg = await field.sb.from('ic_messages').insert({ id: uuid(), incident_id: INC(), from_user: u.unit3, to_users: [u.ops], to_label: 'Operations', kind: 'message', text: 'x', urgency: 'asap' }).select().single();
  check('urgency is one of the three steps or nothing', !!badUrg.error && badUrg.error.code === '23514', JSON.stringify(badUrg.error));
  const oldWord = await field.sb.from('ic_messages').insert({ id: uuid(), incident_id: INC(), from_user: u.unit3, to_users: [u.ops], to_label: 'Operations', kind: 'message', text: 'x', urgency: 'blocking' }).select().single();
  check('blocking is no longer a step: it is the flag (v74)', !!oldWord.error && oldWord.error.code === '23514', JSON.stringify(oldWord.error));
  const forged = await field.sb.from('ic_messages').insert({ id: uuid(), incident_id: INC(), from_user: u.unit1, to_users: [u.ops], to_label: 'Operations', kind: 'message', text: 'Forged' }).select().single();
  check('a message must carry the sender\'s own user id', forged.error && forged.error.code === '42501' && !base.messages().some((m) => m.text === 'Forged'), JSON.stringify(forged.error));
}

// Accountability: status from the field and from the base, assignment setting status, the PAR
// with head counts and a missing report, and check-out giving zones back.
async function accountability(check) {
  const u = USERS();
  check('the resources board lists the three units by kind, six people in the field', has('#panel', '6 people in the field on 3 units') && $$('#panel .grp').length === 3 && has('#panel', 'engines', 'boat crews', 'swift-water teams'), text('#panel'));

  await field.setStatus(u.unit3, 'out_of_service', 'Fuel');
  await until(() => base.member(u.unit3).status === 'out_of_service');
  check('Unit 3 out of service for fuel: grouped apart, four people left, and logged as a status line', await until(() => has('#panel', 'out of service: fuel', '4 people in the field')) && !!eventText(base, 'Unit 3 is out of service: Fuel') && eventText(base, 'Unit 3 is out of service: Fuel').kind === 'status', text('#panel'));
  await field.setStatus(u.unit3, 'assigned');
  await until(() => base.member(u.unit3).status === 'assigned');
  check('back on the zone clears the reason and logs it', base.member(u.unit3).status_note === '' && !!eventText(base, 'Unit 3 is assigned'));
  await field.updateMe({ crew_count: 3 });
  await wait(120);
  check('a hand change to the head count is overruled while the unit has people on record', base.member(u.unit3).crew_count === 2 && has('#panel', '6 people in the field'), text('#panel'));

  $(`#panel [data-action="select-unit"][data-id="${u.unit2}"]`).click();
  await until(() => has('#panel .title', 'unit 2'));
  $('#panel [data-action="set-status"][data-status="available"]').click();
  await until(() => base.member(u.unit2).status === 'available' && eventText(base, 'Unit 2 is available'));
  check('Operations sets Unit 2 available from its panel, with the agency and head count shown', has('#panel', 'available', 'travis county rescue'), text('#panel'));
  $(`#zones .zr[data-id="${ZONE('B-2')}"]`).click();
  await until(() => has('#panel .title', 'b-2'));
  $(`#panel [data-action="assign"][data-user="${u.unit2}"]`).click();
  await until(() => base.zone(ZONE('B-2')).assigned_to === u.unit2 && base.member(u.unit2).status === 'assigned');
  check('assigning a zone makes an available unit assigned, and logs it', !!eventText(base, 'Unit 2 is assigned'));
  $(`#panel [data-action="assign"][data-user="${u.unit2}"]`).click();
  await until(() => base.zone(ZONE('B-2')).assigned_to === null);
  await wait(80);
  check('releasing it leaves Unit 2 assigned, since B-1 is still its zone', base.member(u.unit2).status === 'assigned');
  await base.updateZone(ZONE('B-1'), { assigned_to: null });
  check('releasing its last zone makes it available', await until(() => base.member(u.unit2).status === 'available') && base.events().filter((e) => e.text === 'Unit 2 is available').length === 2);
  $(`#panel [data-action="close-panel"]`) && $(`#panel [data-action="close-panel"]`).click();
  await until(() => $(`#panel [data-action="select-unit"][data-id="${u.unit2}"]`));
  $(`#panel [data-action="select-unit"][data-id="${u.unit2}"]`).click();
  await until(() => has('#panel .title', 'unit 2'));
  $('#panel [data-action="set-status"][data-status="out_of_service"]').click();
  await until(() => $('#panel form[data-form="oos"]'));
  $('#panel form[data-form="oos"] input[value="Medical"]').checked = true;
  $('#panel form[data-form="oos"]').requestSubmit();
  await until(() => base.member(u.unit2).status === 'out_of_service');
  check('out of service from the base asks for a reason first', base.member(u.unit2).status_note === 'Medical' && !!eventText(base, 'Unit 2 is out of service: Medical'));
  const bad = await (async () => { try { await field.setStatus(u.unit1, 'available'); return null; } catch (e) { return e; } })();
  check('a unit cannot set another unit\'s status', !!bad && bad.code === '42501' && base.member(u.unit1).status === 'assigned', bad && bad.message);

  $('#panel [data-action="close-panel"]').click();
  await until(() => $('#panel [data-action="start-par"][data-target="all"]'));
  const parBefore = base.lastPar();   // the seed carries two answered PARs (v38), so wait for a new one, not any
  $('#panel [data-action="start-par"][data-target="all"]').click();
  await until(() => base.lastPar() && base.lastPar() !== parBefore);
  const par = base.lastPar();
  check('Start PAR sends a PAR to the three units, and the bar shows it waiting on all of them', par.kind === 'par' && par.to_users.length === 3 && await until(() => !$('#safety').hidden && has('#safety', 'par', '0 of 3 answered')), text('#safety'));
  check('the log has the PAR', !!eventText(base, 'PAR, Operations to everyone: PAR: is everyone accounted for?'));
  check('Unit 3 gets it as unanswered', await until(() => field.myUnanswered().some((m) => m.id === par.id)));
  await field.answerPar(par.id, true, 3);
  check('Unit 3 answers all accounted for with 3: the panel and the bar say so, and the log has the count', await until(() => has('#panel', 'unit 3', 'all accounted for (3)') && has('#safety', '1 of 3 answered')) && !!eventText(base, 'Unit 3: All accounted for (3)'), text('#safety'));
  const c1 = window.supabase.createClient();
  await mockSignIn(c1, 'unit1@mock.local');
  const d1 = new Data(c1);
  await d1.init(); await d1.open(INC());
  await d1.answerPar(par.id, false, 1);
  check('Unit 1 reports someone missing: the bar says MISSING and the log has it', await until(() => has('#safety', 'missing', 'unit 1 reports someone missing')) && !!eventText(base, 'Unit 1: Missing someone (1)') && has('#panel', 'missing someone (1)'), text('#safety'));
  d1.close();

  await field.setStatus(u.unit3, 'checked_out');
  await until(() => base.member(u.unit3).status === 'checked_out' && base.zone(ZONE('A-2')).assigned_to === null);
  check('Unit 3 checks out: A-2 goes back to not started, it is listed as checked out, and the log says both', base.zone(ZONE('A-2')).status === 'open' && !!base.member(u.unit3).checked_out_at && !!eventText(base, 'Unit 3 checked out') && !!eventText(base, 'A-2 released from Unit 3') && await until(() => has('#panel', 'checked out')), text('#panel'));
  check('a checked-out unit is not messaged and not counted', !base.recipientsFor('all').toUsers.includes(u.unit3) && base.activeUnits().length === 2);
  const inc = await field.join('CEDAR7', 'unit', 'Unit 3', 'Hale, Dominguez', 2, 'Cedar Fork Fire Department');
  await until(() => base.member(u.unit3).status === 'available');
  check('checking in again makes it available with its head count, and logs it', inc.id === INC() && base.member(u.unit3).checked_out_at === null && base.member(u.unit3).crew_count === 2 && !!eventText(base, 'Unit 3 checked in as Jordan Lee Hale, 512 555 0133, licence scanned with 2 people'));
}

// People: a record per responder, riding with a unit. The board with its find box and chips, the
// names in every report, the field adding and checking out a person, the unit's count following its
// people, Operations moving, adding and removing one, the unit's check-out taking its people along,
// and the rules a unit cannot get round.
async function people(check) {
  const u = USERS(), PP = M().ids.people;
  const rows = () => $$('#people-page .pp-line');
  const row = (id) => $(`#people-page .pp-line[data-person="${id}"]`);
  const drawer = async (id) => { const sel = `#people-page .pp-drawer[data-person="${id}"]`; if (!$(sel)) { row(id).click(); await until(() => $(sel)); } return $(sel); };   // a line opens the person's drawer (v65)
  check('six people are seeded on the three units, and the resources board names them', base.people().length === 6 && base.unitPeople(u.unit1).map((p) => p.name).join() === 'Ramirez,Okafor' && has('#panel', 'unit 1, engine', 'ramirez, okafor · 2', 'unit 2, boat crew', 'nguyen, patel · 2', 'unit 3, swift-water team', 'hale, dominguez · 2', '6 people in the field'), text('#panel'));
  check('the log has each check-in with the qualifications, linked to the board', !!eventText(base, 'Ramirez (swift water, EMT) checked in with Unit 1') && eventText(base, 'Ramirez (swift water, EMT) checked in with Unit 1').kind === 'status' && $$('#log .log-row').filter((r) => /checked in with/.test(r.textContent) && r.querySelector('.llink[data-action="people"]')).length === 6, logTexts().find((t) => /Ramirez/.test(t)));   // the band lines link to the board too (v55)
  $('.top [data-action="people"]').click();
  await until(() => !$('#people').hidden && rows().length === 6);
  check('the People board opens with a card per unit and a line per person: name, rank, qualifications and the hours on scene at the right, no drawer yet (v65)', $$('#people-page .pp-card').length === 3 && has('#people-page', '6 on scene on 3 units', 'unit 1', 'assigned', 'a-1', 'engine', '2 on the unit', 'ramirez', 'lt.', 'swift water', 'emt', 'okafor', 'paramedic', 'boat', 'nguyen', 'capt.') && /\b2h \d+m\b/.test(text(`#people-page .pp-line[data-person="${PP[0]}"] .pp-l-on`)) && !$('#people-page .pp-drawer') && getComputedStyle($('#people-page .pp-cards')).gridTemplateColumns.split(' ').length === 3, text('#people-page').slice(0, 400));
  check('the bar is the tabs, the incident\'s name and the buttons on one row, Close last; the find box, the chips and Add a person are the People tab\'s heading row', (() => { const b = $$('#people .briefing-bar .btn, #people .briefing-bar .pp-tabs button'); const tops = b.map((x) => Math.round(x.getBoundingClientRect().top + x.getBoundingClientRect().height / 2)); return Math.max(...tops) - Math.min(...tops) < 8 && b[b.length - 1].textContent.trim() === 'Close' && b[0].textContent.trim() === 'People'; })() && text('#people-sub') === base.incident.name.toLowerCase() && !$('#people-head').hidden && $('#people-head').contains($('#people-q')) && $('#people-head').contains($('#people-quals')) && $('#people-head').contains($('#people-add')) && !$('#people-page').contains($('#people-q')), $$('#people .briefing-bar .btn').map((x) => x.textContent.trim()).join('/'));
  check('the chips count who on scene carries each qualification', has('#people-quals', 'swift water 3', 'boat 2', 'rope 1', 'emt 3', 'paramedic 2', 'k9 0'), text('#people-quals'));
  const d0 = await drawer(PP[0]);
  check('a line opens the drawer beside the cards, which fall to two columns: the facts (on scene since when, last seen by whom and the band, with, qualified), every action spelled out, and the person\'s lines from the 214, six at most (v65)', $('#people-page .pp-body').classList.contains('open') && row(PP[0]).classList.contains('sel') && has('#people-page .pp-drawer', 'ramirez', 'lt.', 'unit 1 · a-1', 'on scene', ', since', 'last seen', 'entering a-1', 'by unit 1 · band 001', 'with', 'okafor', 'qualified', 'swift water', 'never reused; kept on record', 'off the roster; kept on record, put back undoes it', 'in the log', 'checked in with unit 1') && ['person-out', 'person-edit', 'band-void', 'person-remove', 'person-close'].every((a) => !!d0.querySelector(`[data-action="${a}"]`)) && !!d0.querySelector('select[data-select="person-unit"]') && !!d0.querySelector('select[data-select="person-buddy"]') && $$('#people-page .pp-drawer .pp-loglines div').length <= 6 && getComputedStyle($('#people-page .pp-cards')).gridTemplateColumns.split(' ').length === 2, text('#people-page .pp-drawer').slice(0, 300));
  check('buddies are paired', $(`select[data-select="person-buddy"][data-id="${PP[0]}"]`).value === PP[1] && await (async () => { await drawer(PP[5]); return $(`select[data-select="person-buddy"][data-id="${PP[5]}"]`).value === PP[4]; })());
  $('#people-page .pp-drawer [data-action="person-close"]').click();
  check('Close puts the drawer away and the cards back to three columns', !$('#people-page .pp-drawer') && getComputedStyle($('#people-page .pp-cards')).gridTemplateColumns.split(' ').length === 3);
  const q = $('#people-q');
  q.value = 'nguyen'; q.dispatchEvent(new Event('input', { bubbles: true }));
  await until(() => rows().length === 1);
  check('the find box narrows the board to a name', rows().length === 1 && has('#people-page', '1 of 6 people matching "nguyen"', 'unit 2'), text('#people-page .pp-count'));
  q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true }));
  await until(() => rows().length === 6);
  $('#people-quals [data-action="people-qual"][data-q="swift_water"]').click();
  await until(() => rows().length === 3);
  $('#people-quals [data-action="people-qual"][data-q="emt"]').click();
  await until(() => rows().length === 2);
  check('two chips find the people who carry both', rows().length === 2 && !!row(PP[0]) && !!row(PP[4]) && has('#people-page', '2 of 6 people with swift water and emt'), text('#people-page .pp-count'));
  $('#people-quals [data-action="people-qual"][data-q="swift_water"]').click();
  $('#people-quals [data-action="people-qual"][data-q="emt"]').click();
  await until(() => rows().length === 6);

  const pid = uuid();
  await field.addPerson(pid, { name: 'Smith', role: 'Probie', qualifications: ['rope'] });
  await until(() => base.person(pid) && base.member(u.unit3).crew_count === 3);
  check('the field adds a person: the base has it with the unit\'s agency, the count follows, and the log says who came in with what', base.person(pid).agency === 'Cedar Fork Fire Department' && base.member(u.unit3).crew === 'Hale, Dominguez, Smith' && base.member(u.unit3).crew_count === 3 && base.peopleInField() === 7 && !!eventText(base, 'Smith (rope) checked in with Unit 3') && await until(() => rows().length === 7 && has('#people-page', '7 on scene')), text('#people-page .pp-count'));
  await field.checkOutPerson(pid);
  await until(() => base.person(pid).checked_out_at && base.member(u.unit3).crew_count === 2);
  check('the field checks a person out: the count goes back, the row is dimmed, and the log says so', base.member(u.unit3).crew === 'Hale, Dominguez' && !!eventText(base, 'Smith checked out from Unit 3') && await until(() => row(pid) && row(pid).classList.contains('out') && has('#people-page', '6 on scene on 3 units · 1 checked out')), text('#people-page .pp-count'));
  await field.updateMe({ crew_count: 9 });
  await wait(120);
  check('a hand change to the head count is overruled while the unit has people on record', base.member(u.unit3).crew_count === 2, base.member(u.unit3).crew_count);

  (await drawer(PP[4])).querySelector('[data-action="person-out"]').click();
  await until(() => base.person(PP[4]).checked_out_at);
  check('Operations checks Hale out from the drawer, and the unit is recounted; the line dims and reads out hh:mm', base.member(u.unit3).crew_count === 1 && base.member(u.unit3).crew === 'Dominguez' && !!eventText(base, 'Hale checked out from Unit 3') && await until(() => field.person(PP[4]) && field.person(PP[4]).checked_out_at) && await until(() => row(PP[4]).classList.contains('out') && /^out \d\d:\d\d$/.test(text(`#people-page .pp-line[data-person="${PP[4]}"] .pp-l-on`))), text(`#people-page .pp-line[data-person="${PP[4]}"]`));
  await until(() => $(`#people-page .pp-drawer[data-person="${PP[4]}"] [data-action="person-in"]`));
  $(`#people-page .pp-drawer[data-person="${PP[4]}"] [data-action="person-in"]`).click();
  await until(() => !base.person(PP[4]).checked_out_at);
  check('and back in, with the qualifications on the line', base.member(u.unit3).crew_count === 2 && !!eventText(base, 'Hale (swift water, EMT) checked back in with Unit 3'), logTexts()[0]);
  const bsel = $(`select[data-select="person-buddy"][data-id="${PP[4]}"]`);
  bsel.value = ''; bsel.dispatchEvent(new Event('change', { bubbles: true }));
  await until(() => base.person(PP[4]).buddy_id === null);
  check('the buddy can be cleared from the board', base.person(PP[4]).buddy_id === null);
  const usel = () => $(`select[data-select="person-unit"][data-id="${pid}"]`);
  await drawer(pid);
  await until(() => usel());
  check('Move to… lists the other units, not Smith\'s own', usel().options[0].textContent === 'Move to…' && [...usel().options].some((o) => o.value === u.unit1) && ![...usel().options].some((o) => o.value === u.unit3), [...usel().options].map((o) => o.textContent).join('/'));
  usel().value = u.unit1; usel().dispatchEvent(new Event('change', { bubbles: true }));
  await until(() => base.person(pid).user_id === u.unit1);
  check('Operations moves Smith to Unit 1: the log says from where to where, both units are recounted, and the drawer follows him to the other card', !!eventText(base, 'Smith moved from Unit 3 to Unit 1') && base.member(u.unit1).crew_count === 2 && base.unitPeople(u.unit1).length === 3 && await until(() => row(pid) && row(pid).closest('.pp-card').dataset.unit === u.unit1) && !!$(`#people-page .pp-drawer[data-person="${pid}"]`) && has(`#people-page .pp-drawer[data-person="${pid}"]`, 'unit 1'), logTexts()[0]);

  $('#people-head [data-action="people-add-toggle"]').click();
  await until(() => $('#people-page form[data-form="person-add"]'));
  const af = $('#people-page form[data-form="person-add"]');
  af.unit.value = u.unit2; af.name.value = 'Lee'; af.querySelector('input[value="k9"]').checked = true;
  af.requestSubmit();
  await until(() => base.people().some((p) => p.name === 'Lee'));
  const lee = base.people().find((p) => p.name === 'Lee');
  check('Operations adds a person from the heading row\'s form, with the unit\'s agency and the qualification ticked, and the drawer opens on them', lee.user_id === u.unit2 && lee.agency === 'Travis County Rescue' && lee.qualifications.join() === 'k9' && base.member(u.unit2).crew === 'Nguyen, Patel, Lee' && !!eventText(base, 'Lee (K9) checked in with Unit 2') && await until(() => !$('#people-page form[data-form="person-add"]') && row(lee.id) && $(`#people-page .pp-drawer[data-person="${lee.id}"]`)), logTexts()[0]);
  autoConfirm(true);
  try {
    $(`#people-page .pp-drawer[data-person="${lee.id}"] [data-action="person-remove"]`).click();
    await until(() => base.person(lee.id).archived_at);
    check('Remove archives the person, never deletes: off the roster, in the history, logged, recounted; the line stays on the card greyed, and the drawer offers Put back', !!base.person(lee.id).archived_at && base.people().length === 7 && base.people(true).length === 8 && M().tables.ic_people.length === 8 && !!eventText(base, 'Lee removed from Unit 2') && base.member(u.unit2).crew_count === 2 && await until(() => rows().filter((r) => !r.classList.contains('gone')).length === 7 && row(lee.id) && row(lee.id).classList.contains('gone')) && await until(() => $(`#people-page .pp-drawer[data-person="${lee.id}"] [data-action="person-restore"]`)) && /removed \d\d:\d\d/.test(text(`#people-page .pp-line[data-person="${lee.id}"] .pp-l-on`)), logTexts()[0]);
    $(`#people-page .pp-drawer[data-person="${lee.id}"] [data-action="person-restore"]`).click();
    await until(() => !base.person(lee.id).archived_at);
    check('Put back undoes it: nothing was deleted', !base.person(lee.id).archived_at && base.people().length === 8 && await until(() => row(lee.id) && !row(lee.id).classList.contains('gone')));
    await until(() => $(`#people-page .pp-drawer[data-person="${lee.id}"] [data-action="person-remove"]`));
    $(`#people-page .pp-drawer[data-person="${lee.id}"] [data-action="person-remove"]`).click();
    await until(() => base.person(lee.id).archived_at);
    await until(() => rows().filter((r) => !r.classList.contains('gone')).length === 7);
  } finally { autoConfirm(false); }

  const fail = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
  const e1 = await fail(() => field.addPerson(uuid(), { userId: u.unit1, name: 'Intruder' }));
  check('a unit cannot put a person on another unit', !!e1 && e1.code === '42501' && !base.people().some((p) => p.name === 'Intruder'), e1 && e1.message);
  const e2 = await fail(() => field.updatePerson(PP[4], { user_id: u.unit1 }));
  check('nor move one', !!e2 && e2.code === '42501' && base.person(PP[4]).user_id === u.unit3, e2 && e2.message);
  const r3 = await field.sb.from('ic_people').insert({ id: uuid(), incident_id: INC(), user_id: u.unit3, name: 'Ninja', qualifications: ['ninja'] }).select().single();
  check('qualifications come from the list', !!r3.error && r3.error.code === '23514', JSON.stringify(r3.error));
  const r4 = await field.sb.from('ic_people').insert({ id: uuid(), incident_id: INC(), user_id: u.unit3, name: '   ' }).select().single();
  check('a person needs a name', !!r4.error && /needs a name/.test(r4.error.message), JSON.stringify(r4.error));
  const r5 = await field.sb.from('ic_people').delete().eq('id', PP[4]);
  check('nothing is deleted', !!r5.error && base.person(PP[4]) && M().tables.ic_people.some((p) => p.id === PP[4]), JSON.stringify(r5.error));

  const outLines = () => base.events().filter((e) => /^(Hale|Dominguez) checked out from Unit 3$/.test(e.text)).length;
  const before = outLines();
  await field.setStatus(u.unit3, 'checked_out');
  await until(() => base.member(u.unit3).status === 'checked_out' && base.unitPeople(u.unit3).every((p) => p.checked_out_at));
  check('the unit\'s check-out takes its people with it, quietly, and the board says the unit checked out', outLines() === before && base.member(u.unit3).crew_count === 0 && await until(() => has('#people-page', '4 on scene on 2 units · 3 checked out')), text('#people-page .pp-count'));
  const inc = await field.join('CEDAR7', 'unit', 'Unit 3', null, null, null, [{ name: 'hale', qualifications: ['swift_water', 'emt'] }, { name: 'Dominguez', qualifications: ['paramedic'] }, { name: 'New Guy', role: 'Driver', qualifications: [] }]);
  await until(() => base.member(u.unit3).crew_count === 3);
  check('checking the unit back in with its roster brings the names back and adds the new one', inc.id === INC() && base.member(u.unit3).crew === 'Hale, Dominguez, New Guy' && base.unitPeople(u.unit3).length === 3 && !base.person(PP[4]).checked_out_at && !!eventText(base, 'Unit 3 checked in as Jordan Lee Hale, 512 555 0133, licence scanned with 3 people') && !!eventText(base, 'New Guy checked in with Unit 3') && base.person(pid).checked_out_at && await until(() => has('#people-page', '7 on scene on 3 units · 1 checked out')), text('#people-page .pp-count'));

  $('#people [data-action="print-211"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'check-in list (ics 211)'));
  check('Print 211 is a table per unit (v72): the unit\'s header with who checked it in and the division, a row per person with rank, qualifications, in, on scene, band and out, and the totals as two small tables', ['check-in list, ics 211', 'unit 1, engine cedar fork fire department · checked in by ana ramirez', 'name rank qualifications checked in on scene band · last seen out', 'unit 2, boat crew travis county rescue · checked in by minh nguyen', 'totals', '8 people checked in on 3 units · 7 on scene · 1 checked out', 'by agency people cedar fork fire department 6 travis county rescue 2', 'on scene by qualification people swift water 3'].every((t) => has('#briefing-page', t)) && $$('#briefing-page table.t211').length === 5 && row211('Ramirez').startsWith('ramirez own account · with okafor lt. swift water, emt ✓ ') && row211('Smith').startsWith('smith probie rope ') && /\d\d:\d\d$/.test(row211('Smith')) && row211('Nguyen').startsWith('nguyen own account · with patel · boat operator capt. swift water, boat (pending) ') && row211('New Guy').startsWith('new guy driver '), text('#briefing-page').slice(0, 600) + ' | ' + row211('Smith') + ' | ' + row211('Nguyen'));
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);
  $('#people [data-action="close-people"]').click();
  check('the board closes', $('#people').hidden);

  $(`#zones .zr[data-id="${ZONE('A-1')}"]`).click();
  await until(() => has('#panel .title', 'division a-1'));
  $('#panel [data-action="print-204"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'division a-1 assignment'));
  check('the 204 lists the unit\'s people under Resources assigned', has('#briefing-page', 'resources assigned', 'unit 1, engine (ramirez, okafor) · 2 people · cedar fork fire department · assigned', 'ramirez, lt. · swift water, emt', 'okafor · boat, paramedic', 'smith, probie · rope · checked out') && $$('#briefing-page p.sub').length === 3, text('#briefing-page').slice(0, 600));
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);
  $('[data-action="iap"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'incident action plan'));
  check('the IAP\'s 203 names every unit\'s people, and each 204 its own', has('#briefing-page', 'organization, ics 203', 'unit 1, engine (ramirez, okafor) · 2 people · cedar fork fire department', 'nguyen, capt. · swift water, boat', 'new guy, driver') && $$('#briefing-page p.sub').length >= 12, text('#briefing-page').slice(0, 800));
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);
  $('[data-action="briefing"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'briefing'));
  check('the briefing\'s Resources name them too', has('#briefing-page', 'resources', '7 people in the field on 3 units', 'unit 3, swift-water team (hale, dominguez, new guy) · 3 people', 'hale · swift water, emt'), text('#briefing-page').slice(0, 800));
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);
  $(`#panel [data-action="close-panel"]`) && $(`#panel [data-action="close-panel"]`).click();
  await until(() => $(`#panel [data-action="select-unit"][data-id="${u.unit3}"]`));
  $(`#panel [data-action="select-unit"][data-id="${u.unit3}"]`).click();
  await until(() => has('#panel .title', 'unit 3'));
  check('the unit panel lists its people with check-out at hand', $$('#panel .pp-row').length === 3 && has('#panel', 'people on the unit · 3', 'hale', 'swift water', 'new guy', 'driver') && $$('#panel .pp-row [data-action="person-out"]').length === 3, text('#panel'));
  $('#log .llink[data-action="people"]').click();
  await until(() => !$('#people').hidden);
  check('a people line in the log opens the board', !$('#people').hidden);
  $('#people [data-action="close-people"]').click();
}

// Operational periods and objectives: the header names the period and the IC, the Period panel
// lists objectives and adds one, a zone is pointed at an objective, the next period starts and
// carries the open objectives and the zones with them, and the briefing assembles the picture.
async function periods(check) {
  const per = M().ids.period, obj = M().ids.objectives;
  check('the header line names period 1 and the counts; the IC is on its card, not the line (v76)', has('#inc-sub', 'period 1', '3 units', '6 divisions', '1 cleared', '1 hazard open') && !has('#inc-sub', 'dana ruiz') && !has('#inc-sub', 'op 1'), text('#inc-sub'));
  { // v40: past its planned end the header says overdue, the reports say the next period has not been started, and the sheet lights Start period; before it, none of that
    const over = Date.now() > new Date(base.currentPeriod().ends_at).getTime();
    check('the header says overdue only when the planned end has passed (' + (over ? 'it has' : 'it has not') + ')', has('#inc-sub', 'overdue') === over, text('#inc-sub'));
    $('#inc-sub').click();
    check('the line clicked opens the incident\'s card, kept: four tiles, the period\'s ' + (over ? 'overdue in orange with Start period 2 at the top' : 'time left') + ', the units all assigned, the divisions with the bar, the hazard and where; the names at the foot (v76)', await until(() => !$('#inc-pop').hidden) && has('#inc-pop', over ? 'overdue' : 'left', 'period 1', '19:00', 'units', 'all assigned', 'divisions', '1 cleared', '3 in progress', '2 not started', 'hazard open', 'downed power line', 'a-2', 'ic dana ruiz', 'operations marcus bell', 'safety priya natarajan', 'cedar fork high school', 'cedar fork fire department leads') && (!!$('#inc-pop [data-action="period-next"]') === over) && ($('#inc-pop .ic-tile').classList.contains('alarm') === over) && $('#inc-sub').classList.contains('on') && $('#inc-sub').getAttribute('aria-expanded') === 'true', text('#inc-pop').slice(0, 400));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    check('Escape closes the card', await until(() => $('#inc-pop').hidden) && $('#inc-sub').getAttribute('aria-expanded') === 'false' && !$('#inc-sub').classList.contains('on'));
    $('[data-action="iap"]').click();
    await until(() => !$('#briefing').hidden);
    check('the IAP\'s period line and its Prepared line read in the app\'s own form', (/the planned end passed .* ago; the next period has not been started/.test(text('#briefing-page')) === over) && /prepared \d{1,2} [a-z]{3} \d{4} \d{2}:\d{2}/.test(text('#briefing-page')) && !/\d{1,2}\/\d{1,2}\/\d{4}/.test(text('#briefing-page')), text('#briefing-page').slice(0, 300));
    $('[data-action="close-briefing"]').click();
    await until(() => $('#briefing').hidden);
    $('[data-action="period"]').click();
    await until(() => has('#panel .title', 'operational period 1'));
    check('the Period sheet shows the overdue note and lights Start period only then', (!!$('#panel .period-overdue') === over) && ($('#panel [data-action="period-next"]').classList.contains('pri') === over), text('#panel').slice(0, 200));
    $('#panel [data-action="close-panel"]') && $('#panel [data-action="close-panel"]').click();
  }
  check('the data has period 1 with three objectives, one done', base.currentPeriod().id === per && base.objectives().length === 3 && !!base.objectives()[2].done_at);
  $('[data-action="period"]').click();
  await until(() => has('#panel .title', 'operational period 1'));
  check('the Period panel shows the names and the three objectives, with the zones each serves', $('#panel form[data-form="period-edit"] input[name="ic"]').value === 'Dana Ruiz' && $('#panel form[data-form="period-edit"] input[name="safety"]').value === 'Priya Natarajan' && has('#panel', 'primary search of every structure', 'a-1, a-2, a-3', 'mill street bridge approach', 'b-1, b-2') && $$('#panel .obj.done').length === 1, text('#panel'));
  const of = $('#panel form[data-form="objective"]');
  of.text.value = 'Secondary search of A-3 before dark';
  of.requestSubmit();
  await until(() => base.objectives().length === 4);
  const o4 = base.objectives()[3];
  check('adding an objective numbers it 4 and logs it', o4.number === 4 && o4.text === 'Secondary search of A-3 before dark' && !!eventText(base, 'Objective 4 set: Secondary search of A-3 before dark') && await until(() => has('#panel', '4. secondary search of a-3')));
  $(`#panel [data-action="objective-done"][data-id="${obj[1]}"]`).click();
  await until(() => base.objective(obj[1]).done_at);
  check('ticking objective 2 marks it done and logs it', !!eventText(base, 'Objective 2 done: Keep the Mill Street bridge approach closed and watched') && await until(() => $$('#panel .obj.done').length === 2));
  check('the field sees the objectives too', await until(() => field.objectives().length === 4 && field.objective(obj[1]).done_at));

  $(`#zones .zr[data-id="${ZONE('B-3')}"]`).click();
  await until(() => has('#panel .title', 'b-3'));
  const sel = $('#panel select[data-select="zone-objective"]');
  check('the zone panel offers the period\'s objectives', !!sel && $$('option', sel).length === 5 && sel.value === '', sel && $$('option', sel).length);
  sel.value = o4.id;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  await until(() => base.zone(ZONE('B-3')).objective_id === o4.id);
  check('B-3 now serves objective 4, shown in its row', await until(() => has(`#zones .zr[data-id="${ZONE('B-3')}"]`, 'objective 4')), text(`#zones .zr[data-id="${ZONE('B-3')}"]`));

  $('[data-action="period"]').click();
  await until(() => has('#panel .title', 'operational period 1'));
  $('#panel [data-action="period-next"]').click();
  await until(() => $('#panel form[data-form="period-start"]'));
  const pf = $('#panel form[data-form="period-start"]');
  check('the start form is prefilled with the current command names and carries objectives by default', pf.ic.value === 'Dana Ruiz' && pf.carry.checked, pf.ic.value);
  pf.ic.value = 'Jordan Pike';
  pf.notes.value = 'Night operations: lights on every unit.';
  pf.requestSubmit();
  await until(() => $('#transfer-dialog').open);
  check('a new period with a different Incident Commander asks whether command is being transferred (v24)', has('#transfer-dialog', 'transfer command from dana ruiz to jordan pike'), text('#transfer-dialog').slice(0, 200));
  $('#transfer-dialog input[name="notify"]').checked = false;
  $('#transfer-dialog input[name="briefing"]').checked = false;
  $('#transfer-dialog [data-action="transfer-go"]').click();
  await until(() => base.currentPeriod() && base.currentPeriod().number === 2);
  const p2 = base.currentPeriod();
  check('period 2 carries the hours on scene from period 1 (v47)', p2.scene_hours === 12 && base.period(per).scene_hours === 12, p2.scene_hours);
  check('period 2 starts with the new IC, period 1 is closed, and the log says what came over', p2.ic_name === 'Jordan Pike' && p2.notes.startsWith('Night') && !!base.period(per).closed_at && !!eventText(base, 'Operational period 2 started, Incident Commander Jordan Pike, 2 objectives carried over'), logTexts()[0]);
  const carried = base.objectives(p2.id);
  check('the two open objectives came over, renumbered 1 and 2, the done ones stayed behind', carried.length === 2 && carried[0].number === 1 && carried[0].text.startsWith('Primary search') && carried[1].number === 2 && carried[1].text.startsWith('Secondary search') && base.objectives(per).length === 4, carried.map((o) => o.number + ' ' + o.text).join(' | '));
  check('zones follow their objectives into the new period', base.zone(ZONE('A-1')).objective_id === carried[0].id && base.zone(ZONE('B-3')).objective_id === carried[1].id && base.zone(ZONE('B-1')).objective_id === obj[1]);
  check('carry-over wrote no objective lines of its own', base.events().filter((e) => /^Objective 1 set/.test(e.text)).length === 1);
  check('the header and the field see period 2', await until(() => has('#inc-sub', 'period 2')) && await until(() => field.currentPeriod() && field.currentPeriod().number === 2), text('#inc-sub'));
  $('#inc-sub').click();
  check('the card names the new period and its IC, Jordan Pike (v76)', await until(() => !$('#inc-pop').hidden && has('#inc-pop', 'period 2', 'ic jordan pike')), text('#inc-pop').slice(0, 200));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await until(() => $('#inc-pop').hidden);

  $('[data-action="briefing"]').click();
  await until(() => !$('#briefing').hidden && $('#briefing-page').textContent.includes('Objectives'));
  check('the briefing opens with the incident, the period, objectives, zones, resources, hazards and the log', ['incident', 'operational period 2', 'jordan pike', 'night operations', 'objectives', '1. primary search', 'divisions', '6 divisions', 'resources', '6 people in the field', 'hazards still open', 'downed power line', 'needs attention', 'log of this period'].every((t) => has('#briefing-page', t)), text('#briefing-page').slice(0, 300));
  $('[data-action="close-briefing"]').click();
  check('and closes again', $('#briefing').hidden);

  const e1 = await (async () => { try { await field.addObjective('Not allowed'); return null; } catch (e) { return e; } })();
  check('a unit cannot add objectives', !!e1 && e1.code === '42501', e1 && e1.message);
  const e2 = await (async () => { try { await field.startPeriod({}); return null; } catch (e) { return e; } })();
  check('a unit cannot start a period', !!e2 && /Only Operations/.test(e2.message), e2 && e2.message);
}

// The Division assignment (ICS 204): the words, the channel and the supervisor on the zone
// panel, shown to the unit, printed as a 204, and the base speaks ICS.
async function assignment(check) {
  const a1 = ZONE('A-1'), b3 = ZONE('B-3');
  check('the base says division where ICS does', has('.tools', 'draw') && has('#btn-zone', 'division') && has('.side-h', 'divisions by priority') && has('#inc-sub', '6 divisions') && /Division A-1 drawn/.test(logTexts().join(' ')), text('#inc-sub'));
  $(`#zones .zr[data-id="${a1}"]`).click();
  await until(() => has('#panel .title', 'division a-1'));
  const f = $('#panel form[data-form="zone-edit"]');
  check('the zone panel carries the 204 fields, seeded for A-1, and shows the channel and supervisor', f.work_assignment.value.startsWith('Primary search of every structure') && f.channel.value === 'TAC 2' && f.supervisor.value === 'Lt. Okafor' && has('#panel', 'radio tac 2', 'supervisor lt. okafor'), text('#panel'));
  check('the unit sees its work assignment, instructions and channel', field.zone(a1).work_assignment.startsWith('Primary search') && field.zone(a1).channel === 'TAC 2');
  $('#panel [data-action="print-204"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'division a-1 assignment'));
  check('Print the 204 opens the assignment list with the resources, the work, the instructions, the hazards and the progress', ['assignment list, ics 204', 'division a-1 · riverside drive', 'division supervisor: lt. okafor', 'radio channel: tac 2', 'resources assigned', 'unit 1, engine (ramirez, okafor)', 'work assignment', 'primary search of every structure', 'special instructions', 'stay out of moving water', 'period safety message', 'known hazards', 'none reported', 'progress', 'in progress · unit 1 · 9 of 24'].every((t) => has('#briefing-page', t)), text('#briefing-page').slice(0, 400));
  const pm = $('#briefing-page section.has-map svg.pmap');
  check('the 204 carries the division\'s map: OpenStreetMap tiles, the outline, its label, the north arrow, the scale bar, the credit and the legend', !!pm && $$('image', pm).length >= 4 && $$('image', pm).every((i) => /^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/.test(i.getAttribute('href'))) && !!$('.pm-division', pm) && $('.pm-label', pm).textContent.includes('A-1') && !!$('.pm-north', pm) && !!$('.pm-scale', pm) && pm.textContent.includes('© OpenStreetMap contributors') && pm.textContent.includes('Division A-1 · In progress'), pm ? pm.textContent.slice(0, 200) : 'no map');
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);
  $(`#zones .zr[data-id="${ZONE('B-2')}"]`).click();
  await until(() => has('#panel .title', 'division b-2'));
  $('#panel [data-action="print-204"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'division b-2 assignment'));
  const pm2 = $('#briefing-page svg.pmap');
  check('B-2\'s map has its three houses by address, the neighbour B-1, and the staging area, command post, shelter and hospital off the map with the way there and the distance', !!pm2 && $$('.pm-structure', pm2).length === 3 && ['101 Bee Creek Rd', '105 Bee Creek Rd', '109 Bee Creek Rd', 'B-1'].every((t) => pm2.textContent.includes(t)) && $$('.pm-offmap', pm2).length === 4 && ['S', 'CP', 'SH', 'H'].every((l) => $$('.pm-offmap text', pm2).some((t) => t.textContent === l)) && $$('.pm-offmap text', pm2).filter((t) => / (ft|mi)$/.test(t.textContent)).length === 4, pm2 ? $$('.pm-offmap', pm2).map((g) => g.textContent).join(' ') : 'no map');
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);

  $(`#zones .zr[data-id="${b3}"]`).click();
  await until(() => has('#panel .title', 'division b-3'));
  const g = $('#panel form[data-form="zone-edit"]');
  g.work_assignment.value = 'Windshield survey of the fairgrounds, then primary search of the barns';
  g.instructions.value = 'Livestock loose near the east gate';
  g.channel.value = 'TAC 4';
  g.supervisor.value = 'Capt. Reyes';
  g.requestSubmit();
  await until(() => base.zone(b3).channel === 'TAC 4');
  const z = base.zone(b3);
  check('saving the 204 fields keeps them all, and logs the change with the channel and supervisor', z.work_assignment.startsWith('Windshield survey') && z.instructions === 'Livestock loose near the east gate' && z.supervisor === 'Capt. Reyes' && !!eventText(base, 'B-3 assignment updated, channel TAC 4, supervisor Capt. Reyes'), logTexts()[0]);
  check('the field sees the new assignment words', await until(() => field.zone(b3).work_assignment.startsWith('Windshield survey')));
  await base.updateZone(b3, { instructions: 'Livestock loose near the east gate, gate now shut' });
  check('a change to the words alone logs without channel or supervisor', await until(() => eventText(base, 'B-3 assignment updated')));
}

// Primary and secondary search with structure records: a structure searched from the field with
// its details, counts that follow the records, placing structures from the base, the primary
// pass, the secondary pass, and reopening.
async function search(check) {
  const u = USERS(), a2 = ZONE('A-2'), b2 = ZONE('B-2'), a3 = ZONE('A-3');
  check('the seed has six searched structures in A-3, three placed in B-2 and five more in A-1, B-1 and B-3 (v30), all drawn on the map', base.structures(a3).length === 6 && base.structures(b2).length === 3 && base.structures(b2).every((s) => s.status === 'not_searched') && base.structures().length === 14 && $$('#map path.structure').length === 14, $$('#map path.structure').length);

  const sid = uuid();
  await field.addStructure(sid, { zone_id: a2, lat: 30.2670, lng: -97.7380, status: 'searched', label: '12 Pecan Ln', occupants: 'sheltering', people_needing_help: 2, water_cm: 50, damage: 'major', hazards: 'ELEC', notes: 'Elderly couple upstairs' });
  await until(() => base.structure(sid) && base.zone(a2).cleared === 1);
  check('A-2 now counts its records, 1 of 18 searched, and the old count gives way', base.zone(a2).cleared === 1 && base.zone(a2).structures === 18 && await until(() => has(`#zones .zr[data-id="${a2}"]`, '1 of 18')), text(`#zones .zr[data-id="${a2}"]`));
  check('the structure is logged with its details', !!eventText(base, 'A-2: 12 Pecan Ln · 2 need help · sheltering in place · water knee deep · major damage · hazards ELEC'), logTexts()[0]);
  check('a red-ringed dot appears for people needing help', await until(() => $$('#map path.structure[stroke="#B3261E"]').length === 1));
  $(`#zones .zr[data-id="${a2}"]`).click();
  await until(() => has('#panel', 'structures on record · 1'));
  check('the zone panel lists it', has('#panel', '12 pecan ln', 'searched', '2 need help'), text('#panel'));
  $(`#panel [data-action="select-structure"][data-id="${sid}"]`).click();
  await until(() => has('#panel .title', '12 pecan ln'));
  check('the structure panel shows who searched it and the facts', has('#panel', 'unit 3', 'sheltering in place', 'water knee deep', 'major damage', 'elderly couple'), text('#panel'));
  const f = $('#panel form[data-form="structure-edit"]');
  f.people.value = '3';
  f.requestSubmit();
  check('the base can correct a record', await until(() => base.structure(sid).people_needing_help === 3));

  $(`#zones .zr[data-id="${b2}"]`).click();
  await until(() => has('#panel .title', 'division b-2'));
  $('#panel [data-action="place-structures"]').click();
  check('Place structures arms the map', $('#map').classList.contains('drawing') && has('#tool-hint', 'place it in b-2'), text('#tool-hint'));
  mapClick(-30, 10);
  mapClick(30, 10);
  await until(() => base.structures(b2).length === 5);
  $('[data-action="finish-draw"]').click();
  check('two clicks place two structures in B-2, not searched, numbered on, and the count stays 9', base.structures(b2).length === 5 && base.structures(b2).slice(-1)[0].status === 'not_searched' && base.structures(b2).slice(-1)[0].label === '#5' && base.zone(b2).structures === 9 && !$('#map').classList.contains('drawing'), base.structures(b2).map((s) => s.label).join(','));
  const placed = base.structures(b2)[0];
  await field.updateStructure(placed.id, { status: 'searched', occupants: 'evacuated', water_cm: 20 });
  check('searching a placed structure counts it, 1 of 9, stamped with who and when', await until(() => base.zone(b2).cleared === 1) && base.structure(placed.id).searched_by === u.unit3 && !!base.structure(placed.id).searched_at);

  await field.finishPass(a2, 'primary', { marking: markingFor('U3', new Date(), [], 0) });
  await until(() => base.zone(a2).status === 'primary');
  check('the primary pass leaves A-2 light green with its own log line, and frees Unit 3', !!base.zone(a2).primary_done_at && !base.zone(a2).secondary_done_at && await until(() => $$('#map path[fill="#8FCFA7"]').length === 1) && !!eventText(base, 'A-2 primary search complete (1 of 18)') && await until(() => base.member(u.unit3).status === 'available') && await until(() => has(`#zones .zr[data-id="${a2}"]`, 'primary search done', 'secondary pending')), text(`#zones .zr[data-id="${a2}"]`));
  check('the field sees the pass and knows the next one is secondary', await until(() => field.zone(a2).status === 'primary') && nextPass(field.zone(a2)) === 'secondary');
  await field.finishPass(a2, 'secondary', { marking: markingFor('U3', new Date(), ['GAS'], 1) });
  await until(() => base.zone(a2).status === 'cleared');
  check('the secondary pass clears it, dark green, with its line and the people found', !!base.zone(a2).secondary_done_at && await until(() => $$('#map path[fill="#8FCFA7"]').length === 0) && !!eventText(base, 'A-2 secondary search complete, zone clear (1 of 18), 1 found needing help'), logTexts()[0]);
  $(`#zones .zr[data-id="${a2}"]`).click();
  await until(() => $('#panel [data-action="reopen-zone"]'));
  $('#panel [data-action="reopen-zone"]').click();
  await until(() => base.zone(a2).status === 'active');
  check('reopening puts it back to in progress, still assigned, with the stamp cleared and a log line', base.zone(a2).assigned_to === u.unit3 && base.zone(a2).cleared_at === null && !!eventText(base, 'A-2 reopened'));
  check('the panel offers the primary pass again', await until(() => $('#panel [data-action="finish-pass"][data-pass="primary"]')));
}

// Facilities and the communications plan: the seeded places on the map and the panel, placing a
// shelter from the base and naming it, closing it, editing the plan, the field finding the
// nearest places, and the briefing carrying both.
async function facilities(check) {
  check('five facilities are seeded, drawn as lettered marks, and listed on the home panel with the plan', base.facilities().length === 5 && $$('#map .fmark').length === 5 && has('#panel', 'command post', 'high school east lot', 'staging area', 'dell seton', 'communications plan', 'cmd 1', 'tac 9') && $$('#panel .chan').length === 4, text('#panel'));
  $('#facility-kind').value = 'shelter';
  $('#panel [data-action="place-facility"]').click();
  check('Place arms the map for a shelter', $('#map').classList.contains('drawing') && has('#tool-hint', 'shelter'), text('#tool-hint'));
  mapClick(60, -60);
  await until(() => base.facilities().length === 6);
  const f = base.facilities()[5];
  check('one click places it and opens it to be named, logged as opened', f.kind === 'shelter' && !$('#map').classList.contains('drawing') && await until(() => $('#panel form[data-form="facility-edit"]')) && !!eventText(base, 'Shelter opened'), logTexts()[0]);
  const ff = $('#panel form[data-form="facility-edit"]');
  ff.name.value = 'First Baptist hall'; ff.contact.value = 'TAC 5'; ff.notes.value = 'Cots for 40';
  ff.requestSubmit();
  await until(() => base.facility(f.id).name === 'First Baptist hall');
  check('naming it saves and logs the update, and the field sees it', base.facility(f.id).contact === 'TAC 5' && !!eventText(base, 'Shelter: First Baptist hall updated') && await until(() => field.facility(f.id) && field.facility(f.id).name === 'First Baptist hall'));
  check('the field finds the new hall as the nearest shelter to Unit 3, a few hundred metres away', (() => { const n = nearestFacility(field.facilities(), 'shelter', 30.2674, -97.7384); return n && n.facility.id === f.id && n.distance < 1000; })());
  $('#panel [data-action="close-facility"]').click();
  await until(() => base.facility(f.id).closed_at);
  check('closing it logs it and drops it from the open list, keeping it in history', !!eventText(base, 'Shelter: First Baptist hall closed') && base.facilities().length === 5 && base.facilities(true).length === 6 && await until(() => $$('#map .fmark.closed').length === 1));
  check('with the hall closed, the nearest open shelter is the gym again', await until(() => field.facility(f.id) && field.facility(f.id).closed_at) && (() => { const n = nearestFacility(field.facilities(), 'shelter', 30.2674, -97.7384); return n && n.facility.name === 'High school gym' && n.distance > 500 && n.distance < 3000; })());
  $('#panel [data-action="reopen-facility"]').click();
  check('and it can be reopened', await until(() => !base.facility(f.id).closed_at) && !!eventText(base, 'Shelter: First Baptist hall reopened'));

  // the address box on the card (v83; decisions 9 to 13 on try/mockups/starters.html): the sheet's suggestions, a pick
  // fills the point and an empty Name, Save moves the pin, Escape closes the list alone, a pick not saved goes with the card
  const fa = () => $('#panel form[data-form="facility-edit"]');
  const typeAddr = (words) => { const i = fa().address; i.focus(); i.value = words; i.dispatchEvent(new Event('input', { bubbles: true })); };
  const key = (k) => fa().address.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  check('the card\'s Street address box is a combobox with its list under it, and the line says what a pick does (v83)', fa().address.getAttribute('role') === 'combobox' && !!$('#panel [data-addr="facility"] .sugg') && has('#panel', 'suggestions as you type; a pick fills the point, save moves the pin'), text('#panel').slice(0, 240));
  typeAddr('mill');
  check('typing "mill" offers the two Mill Street places under the box, the first lit, powered by Google', await until(() => !$('#fac-addr-list').hidden && $$('#fac-addr-list [data-pick]').length === 2, 4000) && has('#fac-addr-list', 'cedar fork high school', 'mill street bridge', 'powered by google') && $('#fac-addr-list [data-pick="0"]').classList.contains('on') && fa().address.getAttribute('aria-expanded') === 'true', text('#fac-addr-list'));
  const wasLat = base.facility(f.id).lat;
  key('ArrowDown'); key('Enter');
  check('arrow and Enter pick the bridge: the address fills, the point is read back under the box with "the pin moves on Save", the list goes; nothing is written yet and the typed name stays', await until(() => fa().address.value === 'Mill St at Cedar Fork Creek, Cedar Fork, TX', 4000) && await until(() => has('#panel [data-fac-pick]', 'point: 30.2612, -97.7402', 'mill street bridge', 'the pin moves on save'), 4000) && $('#fac-addr-list').hidden && base.facility(f.id).lat === wasLat && (base.facility(f.id).address || '') === '' && fa().name.value === 'First Baptist hall', text('#panel [data-fac-pick]') + ' | ' + fa().address.value);
  fa().requestSubmit();
  await until(() => base.facility(f.id).lat === 30.2612, 6000);
  check('Save writes the address and the point together, one "updated" line as before, and the card reads the new position with no pick line', base.facility(f.id).lng === -97.7402 && base.facility(f.id).address === 'Mill St at Cedar Fork Creek, Cedar Fork, TX' && !!eventText(base, 'Shelter: First Baptist hall updated') && await until(() => has('#panel', 'position', '30.2612') && !has('#panel', 'the pin moves on save'), 6000) && $$('#map .fmark').length === 6, text('#panel').slice(0, 320));
  // a new facility with no name yet: a press on a suggestion names it; Escape; Close without Save
  $('[data-action="close-panel"]').click();
  await until(() => $('#panel [data-action="place-facility"]'));
  $('#facility-kind').value = 'pod';
  $('#panel [data-action="place-facility"]').click();
  mapClick(-40, 40);
  await until(() => base.facilities().length === 7);
  const pod = base.facilities()[6];
  await until(() => fa() && fa().dataset.id === pod.id);
  typeAddr('pecan');
  await until(() => !$('#fac-addr-list').hidden && $$('#fac-addr-list [data-pick]').length >= 1, 4000);
  $('#fac-addr-list [data-pick="0"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  check('a press on a suggestion fills an empty Name with the place\'s name and stages its point', await until(() => fa().name.value === 'Pecan Park', 4000) && fa().address.value === '2 Pecan Park Dr, Cedar Fork, TX' && has('#panel [data-fac-pick]', 'point: 30.2592, -97.7471', 'pecan park'), fa().name.value + ' | ' + fa().address.value);
  typeAddr('main');
  await until(() => !$('#fac-addr-list').hidden && $$('#fac-addr-list [data-pick]').length === 2, 4000);
  key('Escape');
  check('Escape puts the list away and leaves the card open', $('#fac-addr-list').hidden && !!fa() && fa().dataset.id === pod.id);
  $('#panel [data-action="close-panel"]').click();
  await until(() => !fa());
  const openPod = () => { const b = document.createElement('button'); b.dataset.action = 'select-facility'; b.dataset.id = pod.id; b.hidden = true; document.body.appendChild(b); b.click(); b.remove(); };
  openPod();
  await until(() => fa() && fa().dataset.id === pod.id);
  check('Close without Save drops the pick: the card opens again with no point line, the facility where the click put it, nothing saved', !has('#panel', 'the pin moves on save') && base.facility(pod.id).lat === pod.lat && (base.facility(pod.id).name || '') === '' && (base.facility(pod.id).address || '') === '', text('#panel').slice(0, 200));
  // without the key the box is the typed box it was: no line about the key, no list (decision 12)
  {
    const L = await import('../js/shared/layers.js');
    const hadKey = window.GOOGLE_MAPS_KEY, hadInc = L.googleKey();
    try {
      window.GOOGLE_MAPS_KEY = ''; L.setGoogleKey('');
      $('#panel [data-action="close-panel"]').click(); await until(() => !fa());
      openPod(); await until(() => fa() && fa().dataset.id === pod.id);
      typeAddr('mill'); await new Promise((r) => setTimeout(r, 700));
      check('without the key the card keeps its typed Street address box, says nothing about the key, and offers no list', !!fa().address && !has('#panel', 'suggestions as you type') && !has('#panel', 'google maps key') && $('#fac-addr-list').hidden, text('#panel').slice(0, 200));
    } finally { window.GOOGLE_MAPS_KEY = hadKey; L.setGoogleKey(hadInc); }
  }

  $('[data-action="close-panel"]').click();
  await until(() => $('#panel form[data-form="channel-add"]'));
  const cf = $('#panel form[data-form="channel-add"]');
  cf.use.value = 'Air to ground'; cf.channel.value = 'AIR 1';
  cf.requestSubmit();
  await until(() => base.channels().length === 5);
  check('adding a channel updates the plan on the incident and logs the whole plan', base.channels()[4].channel === 'AIR 1' && !!base.events().find((e) => /^Communications plan updated: .*Air to ground AIR 1$/.test(e.text)) && await until(() => field.channels().length === 5), logTexts()[0]);
  $('#panel [data-action="channel-remove"][data-i="4"]').click();
  check('removing it takes it back out', await until(() => base.channels().length === 4));

  $('[data-action="briefing"]').click();
  await until(() => !$('#briefing').hidden);
  check('the briefing carries the facilities and the communications plan', has('#briefing-page', 'facilities', 'staging area: high school east lot', 'communications (ics 205)', 'command: cmd 1'), text('#briefing-page').slice(-400));
  $('[data-action="close-briefing"]').click();

  const bad = await (async () => { try { await field.addFacility({ kind: 'other', lat: 30.26, lng: -97.74 }); return null; } catch (e) { return e; } })();
  check('a unit cannot place facilities', !!bad && bad.code === '42501', bad && bad.message);
}

// The situation report and the Incident Action Plan: assembled from the data, the report's words
// edited and saved on the period, both copied as text.
async function reports(check) {
  $('[data-action="sitrep"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'situation report'));
  check('the situation report opens with the counts, the seeded words, resources by status and agency, and the facilities', ['incident status summary, ics 209', 'situation', 'cedar fork crested', 'progress', '6 divisions', '7 of 14 structures on record searched', 'people: 0 needing help', 'resources needed', 'swift-water team', 'outlook', 'resources', 'assigned: 3', 'cedar fork fire department: 2 units', 'travis county rescue: 1 unit', 'facilities', 'staging area: high school east lot'].every((t) => has('#briefing-page', t)), text('#briefing-page').slice(0, 500));
  const sf = $('#briefing-page form[data-form="sitrep-edit"]');
  check('the words are editable above the report', !!sf && sf.summary.value.startsWith('Cedar Fork crested'));
  sf.needs.value = 'Two more boats and a fuel truck by 18:00';
  sf.requestSubmit();
  await until(() => base.currentPeriod().sitrep && base.currentPeriod().sitrep.needs.startsWith('Two more boats'));
  check('saving the words keeps them on the period, logs it, and the report shows them', !!eventText(base, 'Situation report updated for operational period 1') && await until(() => has('#briefing-page', 'two more boats and a fuel truck')) && base.currentPeriod().sitrep.summary.startsWith('Cedar Fork crested'), logTexts()[0]);
  check('the field sees the words', await until(() => field.currentPeriod().sitrep && field.currentPeriod().sitrep.needs.startsWith('Two more boats')));
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);

  $('[data-action="iap"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'incident action plan'));
  check('the IAP opens with the Prepared by and Approved by signature lines, and Send by email carries the text (v43)', has('#briefing-page', 'prepared by (planning section chief): theresa okafor · signature', 'approved by (incident commander): dana ruiz · signature', 'date and time') && /^mailto:\?subject=/.test($('#briefing-mail').getAttribute('href')) && /Incident Action Plan/.test(decodeURIComponent($('#briefing-mail').getAttribute('href').split('subject=')[1].split('&')[0])) && /INCIDENT ACTION PLAN/.test(decodeURIComponent($('#briefing-mail').getAttribute('href').split('&body=')[1] || '')), text('#briefing-page').slice(0, 400));
  check('the IAP stitches the 202, 203, a 204 per division, the 205, 206 and 208 together', ['objectives, ics 202', '1. primary search', 'organization, ics 203', 'incident commander: dana ruiz', 'division a-1 supervisor: lt. okafor', 'unit 1, engine (ramirez, okafor)', 'assignment, ics 204 · division a-1', 'work assignment: primary search of every structure', 'assignment, ics 204 · division b-3', 'communications, ics 205', 'command: cmd 1', 'medical, ics 206', 'dell seton', 'emergency traffic: tac 9', 'safety message, ics 208', 'swift water everywhere'].every((t) => has('#briefing-page', t)), text('#briefing-page').slice(0, 500));
  check('every division has its own 204 section', $$('#briefing-page h2').filter((h) => /ICS 204/.test(h.textContent)).length === 6);
  check('each division\'s 204 in the IAP carries its map, on a page of its own when printed', $$('#briefing-page section.has-map svg.pmap').length === 6 && $$('#briefing-page svg.pmap').map((m) => m.getAttribute('aria-label')).join(', ') === 'Map of Division A-1, Map of Division A-2, Map of Division A-3, Map of Division B-1, Map of Division B-2, Map of Division B-3' && $('#briefing-page').classList.contains('kind-iap'), $$('#briefing-page svg.pmap').map((m) => m.getAttribute('aria-label')).join(', '));
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);
  $('[data-action="print-join"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'join'));
  check('the join card tells Safety and Bring apart and gives the staging area with its notes and satnav coordinates (v43)', has('#briefing-page', 'safety: swift water everywhere south of mill street', 'bring: pfds and dry bags for water crews', 'getting there: high school east lot · 1200 mill st, east lot · units wait here between assignments · for a satnav 30.25560, -97.74000'), text('#briefing-page').slice(0, 900));
  $('[data-action="close-briefing"]').click();
  check('and it closes', $('#briefing').hidden);
}

// A new unit checks in with the code; Operations can open a second incident.
async function checkIn(check) {
  const c = window.supabase.createClient();
  await mockSignIn(c, 'unit4@mock.local');
  const d = new Data(c);
  await d.init();
  let bad = null;
  try { await d.join('NOPE22', 'unit', 'Unit 4', ''); } catch (e) { bad = e; }
  check('a wrong code is refused with the database\'s message', !!bad && /No active incident has the code NOPE22/.test(bad.message), bad && bad.message);
  let noId = null;
  try { await d.join(' cedar7 ', 'unit', 'Unit 4', 'Smoke'); } catch (e) { noId = e; }
  check('a unit that has not said who it is cannot check in', !!noId && /Say who you are first: your name and your phone/.test(noId.message), noId && noId.message);
  await d.saveProfile({ full_name: 'Sam Smoke', phone: '512 555 0144', licence_number: 'S1122334', licence_state: 'TX', id_source: 'typed' });
  const inc = await d.join(' cedar7 ', 'unit', 'Unit 4', 'Smoke');
  check('the code, trimmed and upper-cased, joins the incident', inc && inc.id === INC());
  await until(() => base.units().some((u) => u.unit_name === 'Unit 4') && eventText(base, 'Unit 4 checked in as Sam Smoke, 512 555 0144, licence typed') && has('#panel', 'unit 4', 'available'));   // the panel redraws on the next frame
  check('the base sees Unit 4 join, available in its resources list and in the log', base.units().some((u) => u.unit_name === 'Unit 4' && u.crew === 'Smoke' && u.status === 'available') && !!eventText(base, 'Unit 4 checked in as Sam Smoke, 512 555 0144, licence typed') && has('#panel', 'unit 4', 'available'), text('#panel'));
  await d.open(INC());
  check('Unit 4 can read the incident it joined', d.me().unit_name === 'Unit 4' && d.zones().length === 6);
  const made = await d.createIncident({ name: 'Smoke drill', period: 'OP 1', base: 'Depot', lat: 30.3, lng: -97.7, zoom: 14 });
  check('a new incident gets a six-letter code without 0, O, 1 or I', /^[A-HJ-NP-Z2-9]{6}$/.test(made.code) && made.name === 'Smoke drill' && made.status === 'active', made.code);
  await d.open(made.id);
  check('its creator is Operations on it, it opens in period 1, and the log opens with it', d.me().role === 'ops' && d.events().length === 1 && d.events()[0].text === 'Incident opened: Smoke drill, operational period 1' && d.currentPeriod() && d.currentPeriod().number === 1);
  const mine = await d.myIncidents();
  check('myIncidents lists the new incident with the role', mine.some((i) => i.id === made.id && i.role === 'ops'));
  check('the first incident is untouched by the second', base.incident.id === INC() && base.events().every((e) => e.incident_id === INC()));
  d.close();
}

// Row-level security as the migration has it: a unit cannot draw zones or move the boundary, a
// photo must be the sender's own, only notes go into the log by hand.
async function permissions(check) {
  const fail = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
  const e1 = await fail(() => field.addZone({ code: 'Z-9', name: 'Not allowed', priority: 1, polygon: base.zone(ZONE('A-1')).polygon, structures: 1 }));
  check('a unit cannot draw a zone (ops only)', !!e1 && e1.code === '42501' && !base.zoneByCode('Z-9') && !M().tables.ic_zones.some((z) => z.code === 'Z-9'), e1 && e1.message);
  const redrawn = () => base.events().filter((e) => e.text === 'Incident boundary redrawn').length;
  const was = redrawn();
  const e2 = await fail(() => field.setBoundary(base.incident.boundary));
  await wait(80);
  check('a unit cannot change the incident', !!e2 && e2.code === '42501' && redrawn() === was, e2 && e2.message);
  const r3 = await field.sb.from('ic_photos').insert({ id: uuid(), incident_id: INC(), user_id: USERS().unit1, storage_path: 'x', note: '' }).select().single();
  check('a photo must carry the sender\'s own user id', r3.error && r3.error.code === '42501' && M().tables.ic_photos.every((p) => p.storage_path !== 'x'), JSON.stringify(r3.error));
  const r4 = await field.sb.from('ic_events').insert({ incident_id: INC(), user_id: USERS().unit3, kind: 'ops', text: 'Forged' }).select().single();
  check('only note events can be inserted by hand', r4.error && r4.error.code === '42501' && !eventText(base, 'Forged'), JSON.stringify(r4.error));
  const r5 = await field.sb.from('ic_zones').delete().eq('id', ZONE('B-3'));
  check('nothing is deleted', !!r5.error && base.zone(ZONE('B-3')) && M().tables.ic_zones.some((z) => z.id === ZONE('B-3')), JSON.stringify(r5.error));
  const stranger = window.supabase.createClient();
  await mockSignIn(stranger, 'stranger@mock.local');
  const s = new Data(stranger);
  await s.init();
  const e6 = await fail(() => s.open(INC()));
  check('someone who is not a member cannot open the incident', !!e6 && e6.code === 'PGRST116', e6 && e6.message);
  check('…and sees no incidents of their own', (await s.myIncidents()).length === 0);
  s.close();
  const note = await field.addNote('A note from the field');
  check('a unit can add a note', note.kind === 'note' && note.user_id === USERS().unit3 && await until(() => eventText(base, 'A note from the field')));
}

// Slice 8: the lead agency, the unified command, and who is on scene from where (ICS 203).
async function agencies(check) {
  check('the home panel names the lead agency and the agencies on scene with their head counts', has('#panel', 'agencies on scene', 'cedar fork fire department (lead)', '2 units · 4 people', 'travis county rescue', '1 unit · 2 people'), text('#panel'));
  const f = $('#panel form[data-form="incident-edit"]');
  check('the lead agency is editable under Incident', !!f && f.lead_agency.value === 'Cedar Fork Fire Department');
  f.lead_agency.value = 'Travis County Office of Emergency Management';
  f.requestSubmit();
  await until(() => base.incident.lead_agency === 'Travis County Office of Emergency Management');
  check('saving it logs the change and the field sees it', !!eventText(base, 'Lead agency: Travis County Office of Emergency Management') && await until(() => field.incident.lead_agency === 'Travis County Office of Emergency Management'), logTexts()[0]);
  $('[data-action="period"]').click();
  await until(() => $('#panel form[data-form="period-edit"]'));
  const pf = $('#panel form[data-form="period-edit"]');
  check('the period form has a unified command field, empty to start', !!pf.unified && pf.unified.value === '');
  pf.unified.value = 'Cedar Fork Fire Department (Chief Ruiz), Travis County Sheriff (Lt. Ortiz)';
  pf.requestSubmit();
  await until(() => (base.currentPeriod().unified || '').startsWith('Cedar Fork Fire Department (Chief Ruiz)'));
  check('the unified command is on the period and in the log', !!eventText(base, 'Operational period 1 updated, unified command Cedar Fork Fire Department (Chief Ruiz), Travis County Sheriff (Lt. Ortiz)'), logTexts()[0]);
  $('[data-action="briefing"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'briefing'));
  check('the briefing names the command and the agencies', has('#briefing-page', 'travis county office of emergency management (lead), unified command with cedar fork fire department (chief ruiz)', 'cedar fork fire department: 2 units, 4 people', 'travis county rescue: 1 unit, 2 people'), text('#briefing-page').slice(0, 600));
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);
  $('[data-action="iap"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'incident action plan'));
  check('the IAP\'s 203 opens with the command line', has('#briefing-page', 'organization, ics 203', 'command: travis county office of emergency management (lead), unified command with'), text('#briefing-page').slice(0, 600));
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);
  const e1 = await (async () => { try { await field.setLeadAgency('Nope'); return null; } catch (e) { return e; } })();
  check('a unit cannot change the lead agency', !!e1 && e1.code === '42501' && base.incident.lead_agency !== 'Nope', e1 && e1.message);
}

// Slice 8: the Public Information Officer's set. Nothing is public until Operations clears it.
async function publicInfo(check) {
  const P = M().ids.photos;
  check('one seeded photo is cleared for the public and the home panel says so', base.publicPhotos().length === 1 && base.publicPhotos()[0].id === P[0] && has('#panel', 'public information', '1 photo cleared for the public'), text('#panel'));
  $(`#panel [data-action="select-photo"][data-id="${P[0]}"]`).click();
  await until(() => has('#panel .title', 'photo') && $('#panel .badge.pub'));
  check('the cleared photo shows its Public badge and offers to withdraw it', has('#panel', 'cleared for public information') && $('#panel [data-action="photo-public"]').textContent === 'Withdraw from public');
  $('#panel [data-action="photo-public"]').click();
  await until(() => !base.photo(P[0]).public_ok);
  check('withdrawing it logs the change', !!eventText(base, 'Photo from Unit 1 withdrawn from public information') && await until(() => !$('#panel .badge.pub')), logTexts()[0]);
  $('#panel [data-action="close-panel"]').click();
  await until(() => has('#panel', 'no photo is cleared for the public'));
  check('the home panel says so', has('#panel', 'no photo is cleared for the public'));
  $(`#zones .zr[data-id="${ZONE('A-2')}"]`).click();
  await until(() => has('#panel .title', 'a-2'));
  $(`#panel [data-action="select-photo"][data-id="${P[2]}"]`).click();
  await until(() => has('#panel .title', 'photo') && $('#panel [data-action="photo-public"]'));
  $('#panel [data-action="photo-public"]').click();
  await until(() => base.photo(P[2]).public_ok);
  check('clearing Unit 3\'s photo logs it, the badge shows, and the field sees the flag', !!eventText(base, 'Photo from Unit 3 cleared for public information') && await until(() => $('#panel .badge.pub')) && await until(() => field.photo(P[2]).public_ok), logTexts()[0]);
  $(`#zones .zr[data-id="${ZONE('A-2')}"]`).click();
  await until(() => has('#panel .title', 'a-2'));
  check('the zone\'s photo list marks it public', has('#panel', 'blocked access · public'), text('#panel'));
  const e1 = await (async () => { try { await field.setPhotoPublic(P[1], true); return null; } catch (e) { return e; } })();
  check('a unit cannot clear a photo for the public', !!e1 && e1.code === '42501' && !base.photo(P[1]).public_ok, e1 && e1.message);
  const pid = uuid();
  await field.addPhoto(pid, await tinyJpeg(), { lat: 30.2674, lng: -97.7384, heading: 90, note: 'People here', zoneId: ZONE('A-2') });
  await until(() => base.photo(pid));
  check('a new photo is not public', base.photo(pid).public_ok === false);
  // v52: the PIO's own page from the header
  $('[data-action="public"]').click();
  await until(() => !$('#public').hidden && has('#public-page', 'public information'));
  check('Public on the header opens the PIO\'s page: who is PIO, the counts, every cleared photo with its check and caption, the public set (v52)', has('#public-page', 'public information officer: lena marsh', '1 photo cleared for the public, 0 checked', 'cleared photos · 1', 'unit 3 · a-2 · not checked · no public caption yet', 'the public set', '0 of 1 ready to download') && !!$('#public [data-action="download-public"]'), text('#public-page').slice(0, 400));
  $('#public-page [data-action="select-photo"]').click();
  check('a row opens the photo\'s panel and puts the page away', await until(() => $('#public').hidden && has('#panel .title', 'photo')) && !!$('#panel [data-action="photo-check"]'), text('#panel .title'));
  $('[data-action="sitrep"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'situation report'));
  check('the situation report counts the cleared photos', has('#briefing-page', 'public information', '1 photo cleared for public release'), text('#briefing-page').slice(-300));
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);
}

// Slice 8: the replay. Every position a unit reports is kept in ic_tracks; the base plays the day back.
async function replay(check) {
  const U3 = USERS().unit3;
  const samples = await base.replay(new Date(Date.now() - 3600000 - 1000).toISOString(), new Date().toISOString(), 60);
  check('the position history comes back as one sample per unit per minute, grouped by unit in time order', samples.length >= 90 && samples.filter((s) => s.user_id === U3).length >= 30 && samples.every((s, i) => i === 0 || s.user_id !== samples[i - 1].user_id || s.at > samples[i - 1].at), samples.length);
  await field.upsertPosition({ lat: 30.2680, lng: -97.7380, heading: 10, accuracy: 5 });
  await field.upsertPosition({ lat: 30.2680, lng: -97.7380, heading: 10, accuracy: 5 });
  await field.upsertPosition({ lat: 30.2681, lng: -97.7381, heading: 12, accuracy: 5 });
  const mine = M().tracksFor(U3);
  check('every position a unit reports is kept; a repeat of the same spot within a minute is not', mine.length === 33 && mine[mine.length - 1].lat === 30.2681, mine.length);
  const r1 = await field.sb.from('ic_tracks').insert({ incident_id: INC(), user_id: U3, lat: 1, lng: 1 }).select().single();
  check('tracks cannot be written by hand', !!r1.error && r1.error.code === '42501', JSON.stringify(r1.error));
  $('[data-action="replay"]').click();
  await until(() => !$('#replay').hidden && $('#btn-replay').classList.contains('on') && $$('#map .umark.ghost').length === 3, 6000);
  check('Replay opens the bar on this period and draws the three units where they were an hour ago, the live markers gone', !$('#replay').hidden && $$('#map .umark.ghost').length === 3 && $$('#map .umark:not(.ghost)').length === 0 && has('#replay-log', '3 units on the map'), text('#replay-log'));
  const slider = $('#replay-slider');
  const fromOf = (i) => (($('#replay-range').options[i].textContent.match(/from (?:yesterday )?(\d\d:\d\d)/) || [])[1] || '');
  check('the range starts at the first position (v63), so the slider\'s left end is the start, before any photo of the hour, and the menu says where each range begins', $$('#map .ppin').length === 0 && $('#replay-time').textContent === fromOf(1) && Number(slider.value) === 0 && fromOf(2) === fromOf(1) && $('#replay-range').options[0].textContent === 'Last hour' && $('#replay-range').options[3].textContent === 'Pick a time…' && !$('#replay-range').options[3].disabled, slider.value + ' ' + $('#replay-time').textContent + ' · ' + $('#replay-range').options[1].textContent);
  check('the speed menu says what a second of play shows', $('#replay-speed').selectedOptions[0].textContent === 'Normal · a minute a second' && $('#replay-speed').selectedOptions[0].title === '60×', $('#replay-speed').selectedOptions[0].textContent);
  slider.value = '1000'; slider.dispatchEvent(new Event('input', { bubbles: true }));
  await until(() => $$('#map .ppin').length === 3);
  check('at the end of the range the three photos are back and the latest log line shows', $$('#map .umark.ghost').length === 3 && has('#replay-log', '3 units on the map', logTexts()[0].slice(0, 30)), text('#replay-log'));
  slider.value = '0'; slider.dispatchEvent(new Event('input', { bubbles: true }));
  await until(() => $$('#map .ppin').length === 0);
  check('back at the start the photos are gone and the first phone to report is there: the range never reaches a moment with nobody', $$('#map .umark.ghost').length >= 1 && $$('#map .ppin').length === 0 && !has('#replay-log', '0 units on the map') && $('#replay-time').textContent === fromOf(1), text('#replay-log'));
  // Pick a time… (v63): bounded by the first position and now, the reason said while Go is off
  const firstMs = new Date(await base.replayFirst()).getTime();
  const clock = (ms) => new Date(ms).toTimeString().slice(0, 5);
  const typeMoment = (ms) => { $('#replay-date').value = dayIso(ms); $('#replay-clock').value = clock(ms); $('#replay-clock').dispatchEvent(new Event('input', { bubbles: true })); };
  $('#replay-range').value = 'pick'; $('#replay-range').dispatchEvent(new Event('change', { bubbles: true }));
  await until(() => !$('#replay-pick').hidden);
  check('Pick a time… opens the sheet in the bar on the slider\'s moment, with the bounds in one sentence and Go on', !$('#replay-pick').hidden && $('#replay-clock').value === clock(firstMs) && has('#replay-why', 'positions run from ' + clock(firstMs), 'to now') && !$('#replay-go').disabled && $('#replay-date').min === dayIso(firstMs), text('#replay-why'));
  typeMoment(firstMs - 20 * 60000);
  check('a moment before the first position is refused with the reason', has('#replay-why', 'is before the first position, ' + clock(firstMs)) && $('#replay-why').classList.contains('bad') && $('#replay-go').disabled, text('#replay-why'));
  typeMoment(Date.now() + 20 * 60000);
  check('a moment after now is refused, whatever the period\'s plan says', has('#replay-why', 'has not happened yet') && $('#replay-go').disabled, text('#replay-why'));
  const want = firstMs + 30 * 60000;
  typeMoment(want);
  check('a moment inside the bounds is accepted', !$('#replay-go').disabled && has('#replay-why', 'positions run from'), text('#replay-why'));
  $('#replay-go').click();
  await until(() => $('#replay-pick').hidden && $('#replay-time').textContent === clock(want));
  check('Go lands the slider on the moment and the menu names the range again', $('#replay-pick').hidden && $('#replay-time').textContent === clock(want) && $('#replay-range').value === 'period' && $$('#map .umark.ghost').length === 3, $('#replay-time').textContent + ' ' + $('#replay-range').value);
  $('#replay-range').value = 'pick'; $('#replay-range').dispatchEvent(new Event('change', { bubbles: true }));
  await until(() => !$('#replay-pick').hidden);
  $('[data-action="replay-pick-cancel"]').click();
  check('Cancel puts the sheet away and the menu back on the range', $('#replay-pick').hidden && $('#replay-range').value === 'period' && $('#replay-time').textContent === clock(want));
  $('#replay-play').click();
  await wait(1500);
  const moved = Number(slider.value);
  check('Play moves the moment forward', $('#replay-play').textContent === 'Pause' && moved > 0, moved);
  $('#replay-play').click();
  await wait(250);
  check('…and Pause holds it', $('#replay-play').textContent === 'Play' && Number(slider.value) >= moved);
  $('#replay-range').value = 'hour'; $('#replay-range').dispatchEvent(new Event('change', { bubbles: true }));
  await until(() => has('#replay-log', '3 units on the map') && !has('#replay-log', 'loading'), 6000);
  check('the last hour replays too', $$('#map .umark.ghost').length === 3);
  $('[data-action="replay-close"]').click();
  await until(() => $('#replay').hidden && $$('#map .umark:not(.ghost)').length === 3);
  check('Close puts the live units and photos back', $$('#map .umark.ghost').length === 0 && $$('#map .ppin').length === 3 && !$('#btn-replay').classList.contains('on'));
}

// The activity log: folded or open, filtered, searched, counted while folded, marked notable,
// printed as the 214, and popped out into its own window.
async function log(check) {
  const rows = () => $$('#log .log-row').length;
  const all = rows();
  check('the log is open with the morning in it, the hours marked between the rows', all >= 20 && $$('#log .log-sep').length >= 1 && !$('#logbox').classList.contains('closed') && has('#log-filters', 'all', 'from the field', 'messages', 'operations', 'notes'), `${all} rows, ${$$('#log .log-sep').length} separators`);
  check('lines link to the thing they are about', $$('#log .llink[data-action="select-structure"]').length >= 1 && $$('#log .llink[data-action="select-facility"]').length >= 1 && $$('#log .llink[data-action="select-photo"]').length >= 3, $$('#log .llink').length);
  $('[data-action="log-group"][data-group="field"]').click();
  await until(() => rows() < all);
  check('the Field filter keeps only what the units sent', rows() > 0 && $$('#log .log-row').every((r) => /log-(photo|clear|hazard|help|request|shelter|transport|seen)/.test(r.className)) && $('[data-action="log-group"][data-group="field"]').classList.contains('on'), rows());
  $('[data-action="log-group"][data-group="all"]').click();
  await until(() => rows() === all);
  const q = $('#log-search');
  q.value = 'bus barn'; q.dispatchEvent(new Event('input', { bubbles: true }));
  await until(() => rows() === 1);
  check('the search box finds a line', rows() === 1 && has('#log', 'bus barn'), text('#log'));
  q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true }));
  await until(() => rows() === all);
  $('[data-action="log-toggle"]').click();
  await until(() => $('#logbox').classList.contains('closed'));
  check('the log folds to its latest line and remembers it', getComputedStyle($('#log')).display === 'none' && has('#log-latest', 'shelter open') && /"open":false/.test(localStorage.getItem('ic.base.log') || ''), text('#log-latest'));
  await field.addNote('Pump truck at the bridge');
  await until(() => !$('#log-new').hidden);
  check('a line that arrives while it is folded is counted on the header, and the latest line is the new one', has('#log-new', '1 new') && has('#log-latest', 'pump truck'), text('#log-latest'));
  $('[data-action="log-toggle"]').click();
  await until(() => !$('#logbox').classList.contains('closed') && rows() === all + 1);
  check('opening it shows the line and clears the count', $('#log-new').hidden && has('#log', 'pump truck at the bridge'));
  // notable: Operations stars a line, the chip keeps the marked lines, the 214 leads with them
  const marked = () => $$('#log .log-row.notable').length;
  check('the seeded marks show on their lines and the Notable chip counts them', marked() === 2 && $$('#log .nmark.on').length === 2 && $$('#log .nmark').length === rows() && has('#log-filters', 'notable 2') && !/★/.test(logTexts()[0]), `${marked()} marked, ${$$('#log .nmark').length} stars, ${text('#log-filters')}`);
  const star = $('#log .log-row:not(.notable) .nmark');   // the newest unmarked line: the pump truck note
  const evId = star.closest('.log-row').dataset.event;
  star.click();
  await until(() => marked() === 3);
  const ev = () => base.events().find((e) => String(e.id) === evId);
  check('a click on the star marks the line for every screen', marked() === 3 && ev().notable === true && ev().text === 'Pump truck at the bridge' && $(`#log .log-row[data-event="${evId}"] .nmark`).classList.contains('on') && has('#log-filters', 'notable 3'), text('#log-filters'));
  $('[data-action="log-group"][data-group="notable"]').click();
  await until(() => rows() === 3);
  check('the Notable chip keeps only the marked lines', rows() === 3 && $$('#log .log-row').every((r) => r.classList.contains('notable')) && $('[data-action="log-group"][data-group="notable"]').classList.contains('on'), rows());
  $('[data-action="log-group"][data-group="all"]').click();
  await until(() => rows() === all + 1);
  const fail = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
  const e1 = await fail(() => field.setNotable(evId, false));
  check('a unit cannot mark or unmark a line (ops only)', !!e1 && e1.code === '42501' && ev().notable === true, e1 && e1.message);
  const r2 = await base.sb.from('ic_events').update({ text: 'Forged' }).eq('id', evId).select().single();
  check('Operations cannot change a line\'s words, only its mark', !!r2.error && ev().text === 'Pump truck at the bridge' && M().tables.ic_events.every((e) => e.text !== 'Forged'), JSON.stringify(r2.error));
  $('[data-action="print-214"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'activity log (ics 214)'));
  const secs = $$('#briefing-page section');
  const full = $$('p', secs[secs.length - 1]).map((p) => p.textContent);   // the whole log is the last section
  check('Print 214 lays the whole period out oldest first', has('#briefing-page', 'entries, oldest first') && /^\d\d:\d\d  Incident opened/.test(full[0]) && /pump truck/i.test(full[full.length - 1]), full.slice(-1)[0]);
  const heads = $$('#briefing-page h2').map((h) => h.textContent);
  const notableLines = secs[1] ? $$('p', secs[1]).map((p) => p.textContent) : [];
  check('the 214 leads with the notable entries under their own heading, starred again in the full log', heads[1] === '3 notable entries' && /entries, oldest first$/.test(heads[2]) && notableLines.length === 3 && /^\d\d:\d\d  ★ Shelter: High school gym opened$/.test(notableLines[0]) && /★ Pump truck at the bridge$/.test(notableLines[2]) && /★ Pump truck/.test(full[full.length - 1]), heads.join(' | ') + ' / ' + notableLines.join(' | '));
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);
  $(`#log .log-row[data-event="${evId}"] .nmark`).click();
  await until(() => marked() === 2);
  check('a second click takes the mark off again', marked() === 2 && ev().notable === false && has('#log-filters', 'notable 2'));
  // the pop-out: the same page at #log in its own window draws the log alone and follows the same
  // changes; here it is an iframe, since a script's window.open has no user gesture behind it
  let opened = null;
  const realOpen = window.open;
  window.open = (url, name, features) => { opened = { url, name, features }; return window; };
  try { $('[data-action="log-popout"]').click(); } finally { window.open = realOpen; }
  check('Pop out opens this page at #log in a named window', !!opened && /\?mock#log$/.test(opened.url) && opened.name === 'ic-log' && /popup/.test(opened.features), opened && opened.url);
  const frame = document.createElement('iframe');
  frame.src = location.pathname + location.search + '#log';
  frame.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:480px;z-index:50;background:#fff;border:0';
  document.body.appendChild(frame);
  try {
    const d = () => frame.contentDocument;
    const $f = (sel) => (d() ? d().querySelector(sel) : null);
    const loaded = await until(() => $f('html.log-only') && $f('#app') && !$f('#app').hidden && d().querySelectorAll('#log .log-row').length === all + 1, 8000);
    const gone = (sel) => $f(sel) && frame.contentWindow.getComputedStyle($f(sel)).display === 'none';
    check('the pop-out draws the log alone, open, with its chips and search; the map, the sidebar and the Pop out button left out', !!loaded && gone('#map') && gone('.side') && gone('.tools') && gone('[data-action="log-popout"]') && !gone('#log-filters') && !gone('#log-search') && !$f('#logbox').classList.contains('closed') && d().querySelectorAll('#log-filters .chip').length >= 6 && d().title === 'Activity log · Cedar Fork Flooding' && $f('#inc-name').textContent === 'Cedar Fork Flooding', loaded ? d().title : 'did not load');
    await field.addNote('The pop-out sees this');
    const live = await until(() => $f('#log .log-row.new') && /The pop-out sees this/.test($f('#log').textContent) && !$f('#log-new').hidden, 6000);
    check('a line that arrives shows in the pop-out, counted as new on its header', !!live && $f('#log-new').textContent === '1 new' && /The pop-out sees this/.test($f('#log .log-row').textContent), $f('#log-new') && $f('#log-new').textContent);
    $f('#log .llink[data-action="select-structure"]').click();
    const shown = await until(() => has('#panel', 'bus barn'), 4000);
    check('a link in the pop-out opens the thing on the main screen', !!shown, text('#panel').slice(0, 120));
  } finally { frame.remove(); }
  // v45: since you last looked
  if ($('#logbox').classList.contains('closed')) { $('[data-action="log-toggle"]').click(); await until(() => !$('#logbox').classList.contains('closed')); }
  $('[data-action="log-group"][data-group="all"]').click(); await until(() => $('[data-action="log-group"][data-group="all"].on'));
  const before = rows();
  if ($('#log-since [data-action="log-since-seen"]')) $('#log-since [data-action="log-since-seen"]').click();
  await until(() => !$('#log-since .log-since'));
  check('with nothing new since the mark there is no summary line and no Since you looked chip', !$('#log-since .log-since') && !$('[data-action="log-group"][data-group="new"]'), text('#log-since'));
  await field.addHazard(uuid(), { kind: 'Gas smell', note: 'since-check', zoneId: ZONE('A-2') });
  await base.sendMessage(null, { toUsers: [USERS().unit3], toLabel: 'Unit 3', kind: 'message', text: 'since-check message' });
  check('a line above the log says what came in since the mark, with Show them and Seen', await until(() => has('#log-since', 'since you last looked', '1 hazard', '1 message') && !!$('#log-since [data-action="log-group"][data-group="new"]') && !!$('#log-since [data-action="log-since-seen"]')), text('#log-since'));
  $('#log-since [data-action="log-group"][data-group="new"]').click();
  await until(() => $('[data-action="log-group"][data-group="new"].on'));
  check('Show them keeps only the new lines', rows() === 2 && $$('#log .log-row').every((r) => /since-check/.test(r.textContent)), $$('#log .log-row').map((r) => r.textContent.trim().slice(0, 60)).join(' | '));
  $('#log-since [data-action="log-since-seen"]').click();
  await until(() => !$('#log-since .log-since') && rows() === before + 2);
  check('Seen clears the line, drops the chip and goes back to All', !$('#log-since .log-since') && !$('[data-action="log-group"][data-group="new"]') && $('[data-action="log-group"][data-group="all"]').classList.contains('on'), text('#log-filters'));
}

// The map underneath and the imagery over it: streets or satellite per device, and custom imagery
// Operations uploads by its corners for every screen.
async function layers(check) {
  const tileHosts = () => [...new Set($$('#map img.leaflet-tile').map((t) => new URL(t.src).hostname))];
  const radios = () => $$('#layers-pop [data-action="layer-pick"]');
  $('#btn-layers').click();
  await until(() => !$('#layers-pop').hidden && radios().length === 2);
  check('the panel\'s left column is the overlays, the right the map underneath (v60)', $$('#layers-pop .lp-col .k').map((k) => k.textContent).join(' | ') === 'Overlays | Map underneath', $$('#layers-pop .lp-col .k').map((k) => k.textContent).join(' | '));
  check('Layers opens a panel: the map underneath on one side (Streets, Satellite, and Google twice because the mock\'s settings carry a key; Streets on), the overlays on the other', radios().map((r) => r.dataset.layer).join(' ') === 'streets satellite google-streets google-satellite' && radios()[0].checked && has('#layers-pop', 'map underneath', 'overlays', 'aerial 06:40', 'add a picture', 'google maps, streets') && tileHosts().some((h) => /openstreetmap/.test(h)), text('#layers-pop').slice(0, 300) + ' | ' + radios().map((r) => r.dataset.layer).join(' '));
  radios()[1].click();
  await until(() => tileHosts().includes('server.arcgisonline.com') && !tileHosts().some((h) => /openstreetmap/.test(h)), 6000);
  check('Satellite swaps the tiles underneath and is remembered on this device', tileHosts().includes('server.arcgisonline.com') && localStorage.getItem('ic.map.layer') === 'satellite' && radios()[1].checked, tileHosts());
  radios()[0].click();
  await until(() => tileHosts().some((h) => /openstreetmap/.test(h)) && !tileHosts().includes('server.arcgisonline.com'), 6000);
  check('and back to Streets', localStorage.getItem('ic.map.layer') === 'streets', tileHosts());
  const box = () => $('#layers-pop [data-action="overlay-toggle"]');
  check('the seeded imagery is listed with its box ticked', !!box() && box().checked);
  box().click();
  await until(() => $$('#map img.imagery').length === 0);
  check('unticking it hides it on this screen', $$('#map img.imagery').length === 0 && (localStorage.getItem('ic.map.hidden') || '').includes(M().ids.overlays[0]));
  box().click();
  await until(() => $$('#map img.imagery').length === 1);
  check('Add a picture is one button, with no edges to type (v67)', !!$('#layers-pop label.pick-btn input[data-file="overlay"]') && !$('#layers-pop form[data-form="overlay-add"]'));
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await until(() => $('#layers-pop').hidden);
  check('Escape closes the panel', $('#layers-pop').hidden && !$('#btn-layers').classList.contains('on'));

  const ovl = M().ids.overlays[0];
  const pic = () => $('#map img.imagery:not(.placing)');
  check('the seeded picture lies by its corners on the map (one image under a matrix3d) and is listed under Map imagery (v67)', base.overlays().length === 1 && Array.isArray(base.overlay(ovl).corners) && await until(() => pic() && /matrix3d/.test(pic().style.transform), 6000) && pic().classList.contains('imagery-corners') && has('#panel', 'map imagery', 'aerial 06:40, civil air patrol', 'add a picture') && !$('#panel form[data-form="overlay-add"]'), text('#panel').slice(0, 200));
  // a new picture: chosen on the home panel, it lands over the view with handles; dragged, undone, saved
  const input = $('#panel input[data-file="overlay"]');
  const dt = new DataTransfer(); dt.items.add(new File([await tinyPng()], 'drone-pass.png', { type: 'image/png' })); input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  const placing = () => $('#map img.imagery.placing');
  await until(() => !$('#place-card').hidden && $$('#map .hdl.corner').length === 4 && placing() && placing().style.transform, 8000);
  check('a chosen picture lands over the view at half strength, with four corner handles, a Turn handle and the card, named from the file', !$('#place-card').hidden && $$('#map .hdl.corner').length === 4 && !!$('#map .hdl.turn') && $('#place-name').value === 'drone pass' && placing().style.opacity === '0.5' && $('#place-card [data-action="place-undo"]').disabled && has('#tool-hint', 'drag it until the roads line up'), $('#place-name').value + ' | ' + text('#tool-hint'));
  const mouse = (type, target, x, y) => target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1, view: window }));
  const dragHandle = async (sel, dx, dy) => { const h = $(sel), r = h.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2; mouse('mousedown', h, x, y); for (let i = 1; i <= 4; i++) mouse('mousemove', document.body, x + dx * i / 4, y + dy * i / 4); mouse('mouseup', document.body, x + dx, y + dy); await wait(60); };
  const before = placing().style.transform;
  await dragHandle('#map .hdl.c0', -40, -30);
  check('dragging a corner moves it: the picture follows and Undo wakes', placing().style.transform !== before && !$('#place-card [data-action="place-undo"]').disabled);
  $('#place-card [data-action="place-undo"]').click();
  await wait(40);
  check('Undo puts it back', placing().style.transform === before && $('#place-card [data-action="place-undo"]').disabled);
  await dragHandle('#map .hdl.turn', 50, 20);
  check('the Turn handle turns it', placing().style.transform !== before && !/,0,0,0,0,/.test(placing().style.transform.replace(/^matrix3d\(/, '')));
  $('#place-name').value = 'Drone pass 14:10';
  $('#place-op').value = '0.6'; $('#place-op').dispatchEvent(new Event('input', { bubbles: true }));
  check('the opacity slider works live', placing().style.opacity === '0.6' && $('#place-op-v').textContent === '60%');
  $('#place-card [data-action="place-save"]').click();
  await until(() => base.overlays().length === 2, 15000);   // the picture's decode and upload take longer late in a full run
  const o = base.overlays()[1];
  check('Save uploads the picture with its four corners and their box as bounds, the name and the opacity, logs it, closes the card, and both maps show it', o.name === 'Drone pass 14:10' && Array.isArray(o.corners) && o.corners.length === 4 && JSON.stringify(o.bounds) === JSON.stringify(cornersBox(o.corners)) && o.storage_path.endsWith('.png') && Number(o.opacity) === 0.6 && !!eventText(base, 'Imagery: Drone pass 14:10 added to the map') && await until(() => $('#place-card').hidden && $$('#map .hdl').length === 0) && await until(() => $$('#map img.imagery').length === 2, 6000) && await until(() => field.overlays().length === 2), logTexts()[0]);
  // Adjust: the same handles on a saved picture; Escape leaves it as it was; a nudge and Save move it for everyone
  $(`#panel [data-action="overlay-adjust"][data-id="${o.id}"]`).click();
  await until(() => !$('#place-card').hidden && $$('#map .hdl.corner').length === 4 && placing(), 8000);
  check('Adjust opens the handles on a saved picture, with its name and opacity, and keeps the saved copy off the map meanwhile', !$('#place-card').hidden && $('#place-name').value === 'Drone pass 14:10' && $('#place-op').value === '0.6' && $$('#map img.imagery:not(.placing)').length === 1, $$('#map img.imagery').length);
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await until(() => $('#place-card').hidden && $$('#map img.imagery').length === 2);
  check('Escape cancels: the card closes, the handles go, the picture is back as it was', $('#place-card').hidden && $$('#map .hdl').length === 0 && $$('#map img.imagery').length === 2 && base.overlay(o.id).name === 'Drone pass 14:10');
  $(`#panel [data-action="overlay-adjust"][data-id="${o.id}"]`).click();
  await until(() => !$('#place-card').hidden && placing(), 8000);
  const b0 = JSON.stringify(base.overlay(o.id).bounds);
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
  await wait(30);
  check('Shift + arrow nudges it ten pixels and wakes Undo', !$('#place-card [data-action="place-undo"]').disabled);
  $('#place-card [data-action="place-save"]').click();
  await until(() => JSON.stringify(base.overlay(o.id).bounds) !== b0, 8000);
  check('Save after a nudge moves the corners for everyone, the box with them, logged once as updated', JSON.stringify(base.overlay(o.id).bounds) !== b0 && JSON.stringify(base.overlay(o.id).bounds) === JSON.stringify(cornersBox(base.overlay(o.id).corners)) && base.events().filter((ev) => ev.text === 'Imagery: Drone pass 14:10 updated').length === 1 && await until(() => $('#place-card').hidden) && await until(() => field.overlay(o.id) && JSON.stringify(field.overlay(o.id).bounds) !== b0), logTexts()[0]);
  const r = $(`#panel [data-range="overlay-opacity"][data-id="${o.id}"]`);
  r.value = '0.3'; r.dispatchEvent(new Event('change', { bubbles: true }));
  await until(() => Number(base.overlay(o.id).opacity) === 0.3);
  check('the opacity slider sets it for everyone', Number(base.overlay(o.id).opacity) === 0.3 && await until(() => field.overlay(o.id) && Number(field.overlay(o.id).opacity) === 0.3));
  $(`#panel [data-action="overlay-hide"][data-id="${o.id}"]`).click();
  await until(() => $$('#map img.imagery').length === 1);
  check('Hide takes it off this screen only', $$('#map img.imagery').length === 1 && (localStorage.getItem('ic.map.hidden') || '').includes(o.id) && !base.overlay(o.id).archived_at && !!$(`#panel [data-action="overlay-show"][data-id="${o.id}"]`));
  $(`#panel [data-action="overlay-show"][data-id="${o.id}"]`).click();
  await until(() => $$('#map img.imagery').length === 2);
  autoConfirm(true);
  try {
    $(`#panel [data-action="overlay-remove"][data-id="${ovl}"]`).click();
    await until(() => base.overlay(ovl).archived_at);
  } finally { autoConfirm(false); }
  check('Remove archives it for everyone, never deletes, logs it, and offers to put it back', !!base.overlay(ovl).archived_at && M().tables.ic_overlays.length === 2 && !!eventText(base, 'Imagery: Aerial 06:40, Civil Air Patrol removed from the map') && await until(() => $$('#map img.imagery').length === 1) && await until(() => has('#panel', '1 removed')) && await until(() => field.overlays().length === 1), logTexts()[0]);
  $(`#panel [data-action="overlay-restore"][data-id="${ovl}"]`).click();
  await until(() => !base.overlay(ovl).archived_at);
  check('Put back restores it', await until(() => $$('#map img.imagery').length === 2) && !!eventText(base, 'Imagery: Aerial 06:40, Civil Air Patrol put back on the map'));
  const e1 = await (async () => { try { await field.addOverlay(new File([await tinyPng()], 'x.png', { type: 'image/png' }), { name: 'Nope', bounds: o.bounds }); return null; } catch (e) { return e; } })();
  check('a unit cannot put imagery on the map', !!e1 && e1.code === '42501' && base.overlays().length === 2, e1 && e1.message);
  const e2 = await (async () => { try { await field.updateOverlay(o.id, { opacity: 1 }); return null; } catch (e) { return e; } })();
  check('nor change it', !!e2 && e2.code === '42501', e2 && e2.message);
}

// Right-click on a division, on the map or in the list: a card with its rank, its priority and the facts.
async function zoneCard(check) {
  const dlg = $('#zone-dialog');
  const menu = (el) => el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: window, button: 2 }));
  menu($(`#zones .zr[data-id="${ZONE('A-2')}"]`));
  await until(() => dlg.open);
  check('right-click on a row opens the card with the division, its rank, priority, unit and progress', dlg.open && has('#zone-dialog', 'a-2', 'pecan mobile home park', 'rank', '2', 'of 6', 'priority', 'unit 3', '6 of 18 cleared', 'hazard', 'downed power line', 'radio', 'tac 2', 'last activity'), text('#zone-dialog'));
  $('#zone-dialog [data-action="set-priority"][data-p="3"]').click();
  await until(() => base.zone(ZONE('A-2')).priority === 3);
  check('the priority changes from the card and the rank follows', await until(() => has('#zone-dialog', '5', 'of 6')) && $('#zone-dialog [data-action="set-priority"][data-p="3"]').classList.contains('on') && $$('#zones .zr .zr-id').map((e) => e.textContent).join(' ') === 'A-1 A-3 B-1 B-2 A-2 B-3', text('#zone-dialog .zm-head'));
  $('#zone-dialog [data-action="set-priority"][data-p="1"]').click();
  await until(() => base.zone(ZONE('A-2')).priority === 1);
  $('#zone-dialog [data-action="zone-modal-close"]').click();
  await until(() => !dlg.open);
  check('Close shuts it', !dlg.open);
  const pill = $$('#map .zpill').find((b) => b.textContent.includes('A-3'));
  menu(pill);
  await until(() => dlg.open);
  check('right-click on the map label opens it for that division', dlg.open && has('#zone-dialog', 'a-3', 'cedar fork elementary', 'cleared at'), text('#zone-dialog .zm-head'));
  $('#zone-dialog [data-action="zone-modal-open"]').click();
  await until(() => !dlg.open && has('#panel .title', 'a-3'));
  check('Open in the panel closes the card and selects the division', !dlg.open && has('#panel .title', 'division a-3'));
}

// The code to join as a QR: drawn on the base beside the code, printed as a join card, and read
// back by the phone's decoder from the very picture the base draws.
async function join(check) {
  const url = location.origin + '/field/?join=' + M().tables.ic_incidents[0].code;   // whatever port serves this checkout
  $('#inc-code').click();
  await until(() => !$('#codes-pop').hidden);
  check('the CEDAR7 pill opens the codes\' card: the QR beside the code, the join card, the link, the bands (v60)', !!$('#codes-pop .qr-box svg') && has('#codes-pop', 'join code for field phones', 'cedar7', 'print a join card', 'copy the link', 'print bands') && !$('#panel .qr-box'), text('#codes-pop').slice(0, 200));
  $('#codes-pop [data-action="print-join"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'join card'));
  check('the join card has the big code, the QR and the how-to', !!$('#briefing-page .join-card-qr svg') && has('#briefing-page', 'cedar7', 'check in with your phone', 'scan the code, or open', 'anyone with this code can join'), text('#briefing-page').slice(0, 300));
  const svg = $('#briefing-page .join-card-qr svg').outerHTML;
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);
  // the decoder the phone falls back to reads the base's picture
  if (!window.jsQR) await new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = '/vendor/jsQR-1.4.0.js'; sc.onload = res; sc.onerror = rej; document.head.appendChild(sc); });
  const img = new Image();
  const sized = (svg.includes('xmlns=') ? svg : svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')).replace('<svg ', '<svg width="320" height="320" ');
  const blob = new Blob([sized], { type: 'image/svg+xml' });
  const objUrl = URL.createObjectURL(blob);
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = objUrl; });
  const c = document.createElement('canvas'); c.width = 360; c.height = 360;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 360, 360); g.drawImage(img, 20, 20, 320, 320);
  const read = window.jsQR(g.getImageData(0, 0, 360, 360).data, 360, 360);
  URL.revokeObjectURL(objUrl);
  check('the phone\'s decoder reads the join link out of the base\'s QR', !!read && read.data === url, read && read.data);
  const { codeFromScan } = await import('../js/shared/qr.js');
  check('and the link means the code', codeFromScan(read ? read.data : '') === M().tables.ic_incidents[0].code);
}

// Who is behind each account: a name, a phone and a licence before a unit can check in, seen and
// verified by Operations, never by another unit.
async function identity(check) {
  const U = USERS();
  check('the base sees every member\'s profile, a unit only its own', base.profileOf(U.unit3) && base.profileOf(U.unit3).full_name === 'Jordan Lee Hale' && base.profileOf(U.unit1).verified_at && !base.profileOf(U.unit2).verified_at && (await field.myProfile()).full_name === 'Jordan Lee Hale' && !field.profileOf(U.unit1), JSON.stringify(field.profileOf(U.unit1)));
  check('the resources rows carry the names, with a tick for the verified', has('#panel', 'ana ramirez ✓', 'minh nguyen', 'jordan lee hale') && !has('#panel', 'jordan lee hale ✓'), text('#panel').slice(0, 400));
  $(`#panel [data-action="select-unit"][data-id="${U.unit3}"]`).click();
  await until(() => has('#panel .title', 'unit 3') && $('#panel .ident'));
  check('the unit panel puts where the unit is first, then the identity folded to one line: name, phone, the licence tail, not verified (v50)', $('#panel .ident').classList.contains('folded') && has('#panel .ident', 'jordan lee hale', '512 555 0133', 'licence tx ···5678', 'not verified') && !has('#panel .ident', 'expires 2030-03-04') && !!$('#panel .ident [data-action="verify-profile"]') && $('#panel .kv').getBoundingClientRect().top < $('#panel .ident').getBoundingClientRect().top && has('#panel .kv', 'standing in', 'position', 'last report'), text('#panel .ident') + ' | kv at ' + Math.round($('#panel .kv').getBoundingClientRect().top) + ', ident at ' + Math.round($('#panel .ident').getBoundingClientRect().top));
  $('#panel .ident [data-action="ident-toggle"]').click();
  await until(() => $('#panel .ident') && !$('#panel .ident').classList.contains('folded'));
  check('Details opens the identity: the expiry, read from the barcode, the photo loading, Mark verified and Fold', has('#panel .ident', 'tx ···5678', 'expires 2030-03-04', 'read from the barcode', 'not verified') && !!$('#panel .ident [data-action="verify-profile"]') && !!$('#panel .ident [data-action="ident-toggle"]') && await until(() => $('#panel .id-box img') && !$('#panel .id-box img').hidden && $('#panel .id-box img').src), text('#panel .ident'));
  $('#panel .ident [data-action="verify-profile"]').click();
  await until(() => base.profileOf(U.unit3).verified_at);
  check('Mark verified stamps the profile, logs it, and the unit sees it', !!base.profileOf(U.unit3).verified_by && !!eventText(base, 'Unit 3 (Jordan Lee Hale) identity verified by Operations') && await until(() => has('#panel .ident', 'verified')) && await until(() => field.profileOf(U.unit3) && field.profileOf(U.unit3).verified_at), logTexts()[0]);
  $('#panel .ident [data-action="unverify-profile"]').click();
  await until(() => !base.profileOf(U.unit3).verified_at);
  check('and withdraws it again', !!eventText(base, 'Unit 3 (Jordan Lee Hale) identity verification withdrawn'));
  const e1 = await (async () => { try { await field.verifyProfile(U.unit3, true); return null; } catch (e) { return e; } })();
  check('a unit cannot verify', !!e1 && /Only Operations/.test(e1.message), e1 && e1.message);
  const r2 = await field.sb.from('ic_profiles').update({ verified_at: new Date().toISOString(), verified_by: U.unit3 }).eq('user_id', U.unit3).select().single();
  check('nor mark itself verified', !!r2.error && /Only Operations/.test(r2.error.message) && !base.profileOf(U.unit3).verified_at, JSON.stringify(r2.error));
  await base.verifyProfile(U.unit3, true);
  await until(() => base.profileOf(U.unit3).verified_at);
  await field.saveProfile({ full_name: 'Jordan L. Hale' });
  check('changing the name clears the verification', await until(() => base.profileOf(U.unit3) && !base.profileOf(U.unit3).verified_at && base.profileOf(U.unit3).full_name === 'Jordan L. Hale'), base.profileOf(U.unit3).full_name);
  // a new account: no profile, no check-in
  const c = window.supabase.createClient();
  await mockSignIn(c, 'newcomer@mock.local');
  const n = new Data(c);
  await n.init();
  const e3 = await (async () => { try { await n.join('CEDAR7', 'unit', 'Unit 9', null, null, 'Bastrop County FD', []); return null; } catch (e) { return e; } })();
  check('an account that has not said who it is cannot check in as a unit', !!e3 && /Say who you are first: your name and your phone/.test(e3.message), e3 && e3.message);
  await n.saveProfile({ full_name: 'Casey Brooks', phone: '512 555 0199', licence_number: 'B9988776', licence_state: 'TX', id_source: 'typed' });
  const inc = await n.join('CEDAR7', 'unit', 'Unit 9', null, null, 'Bastrop County FD', [{ name: 'Casey Brooks', qualifications: ['emt'] }]);
  await until(() => base.member(n.user.id));
  check('once it has, it checks in and the log says who, with what', inc.code === 'CEDAR7' && await until(() => eventText(base, 'Unit 9 checked in as Casey Brooks, 512 555 0199, licence typed with 1 person')), logTexts()[0]);
  check('the base now sees the newcomer\'s profile, the newcomer sees nobody else\'s', await until(() => base.profileOf(n.user.id) && base.profileOf(n.user.id).full_name === 'Casey Brooks') && !n.profileOf(U.unit3));
  n.close();
  $('[data-action="people"]') && $('[data-action="people"]').click();
  await wait(300);
  const btn = $('[data-action="print-211"]') || $('#panel [data-action="print-211"]');
  if (btn) {
    btn.click();
    await until(() => !$('#briefing').hidden && has('#briefing-title', '211'));
    check('the 211 names who checked each unit in', has('#briefing-page', 'checked in by ana ramirez, 512 555 0111, licence tx ···3746, verified', 'checked in by casey brooks'), text('#briefing-page').slice(0, 400));
    $('[data-action="close-briefing"]').click();
    await until(() => $('#briefing').hidden);
  }
}

// The legend's status entries: pressed, the divisions in that status stand out on the map and in the list.
async function legend(check) {
  check('the legend entries are buttons with the counts', $$('[data-action="legend-status"]').length === 4 && $('[data-legend-count="active"]').textContent === '3' && $('[data-legend-count="open"]').textContent === '2' && $('[data-legend-count="cleared"]').textContent === '1' && $('#legend-hint').hidden, $$('[data-legend-count]').map((e) => e.textContent).join(','));
  $('[data-action="legend-status"][data-status="active"]').click();
  await until(() => $$('#map path.zone-hl').length === 3);
  check('In progress lights the three active divisions on the map and fades the other three', $$('#map path.zone-hl').length === 3 && $$('#map path.zone-dim').length === 3 && $$('#map .zpill.hl').length === 3 && $$('#map .zpill.dim').length === 3, `${$$('#map path.zone-hl').length} lit, ${$$('#map path.zone-dim').length} dim`);
  check('the list follows, the entry shows pressed, and the hint says what is shown', $$('#zones .zr.hl').length === 3 && $$('#zones .zr.dim').length === 3 && $('[data-action="legend-status"][data-status="active"]').classList.contains('on') && !$('#legend-hint').hidden && has('#legend-hint', '3 divisions in progress'), text('#legend-hint'));
  $('[data-action="legend-status"][data-status="cleared"]').click();
  await until(() => $$('#map path.zone-hl').length === 1);
  check('another entry switches the highlight', $$('#map path.zone-hl').length === 1 && $$('#zones .zr.hl').length === 1 && has('#legend-hint', '1 division cleared'), text('#legend-hint'));
  $('[data-action="legend-status"][data-status="cleared"]').click();
  await until(() => $$('#map path.zone-hl').length === 0);
  check('pressing it again shows all', $$('#map path.zone-dim').length === 0 && $$('#zones .zr.dim').length === 0 && $('#legend-hint').hidden);
  $('[data-action="legend-status"][data-status="open"]').click();
  await until(() => $$('#map path.zone-hl').length === 2);
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await until(() => $$('#map path.zone-hl').length === 0);
  check('Escape shows all too', $$('#zones .zr.dim').length === 0 && $('#legend-hint').hidden);
}

// Planning, Logistics and Finance: the section chiefs on the period and the 203, resource requests
// worked from asked to filled, the check-out list riding along to the base, and the hours for Finance.
async function sections(check) {
  const u = USERS(), REQ = M().ids.requests;
  // 1 · the chiefs
  $('[data-action="period"]').click();
  await until(() => $('#panel form[data-form="period-edit"]'));
  const pf = $('#panel form[data-form="period-edit"]');
  check('the period form seats Planning, Logistics and Finance, seeded with two of them', pf.planning.value === 'Theresa Okafor' && pf.logistics.value === 'Sam Whitaker' && pf.finance.value === '', pf.planning.value);
  pf.finance.value = 'Rae Lindqvist';
  pf.requestSubmit();
  await until(() => base.currentPeriod().finance_chief === 'Rae Lindqvist');
  check('saving a seat logs it', !!eventText(base, 'Operational period 1 updated, Finance Rae Lindqvist'), logTexts()[0]);
  // v47: the hours on scene beside the rotation; past it the board, the unit panel, the briefing and the sitrep say who
  const pf2 = $('#panel form[data-form="period-edit"]');
  check('the period form has the hours on scene beside the rotation, 12 by default (v47)', !!pf2.scene && pf2.scene.value === '12' && pf2.rotation.value === '45', pf2.scene && pf2.scene.value);
  pf2.scene.value = '2';
  pf2.requestSubmit();
  await until(() => base.currentPeriod().scene_hours === 2);
  check('saving 2 hours is one line of its own', !!eventText(base, 'Operational period 1: on scene too long past 2 hours'), logTexts()[0]);
  $('[data-action="people"]').click();
  await until(() => !$('#people').hidden);
  check('the People board turns everyone past 2h orange, says so on each line and counts them', await until(() => $$('#people-page .pp-line.over').length === 6) && has('#people-page', '6 past 2h on scene') && /\b2h( \d+m)? · past 2h\b/.test(text('#people-page')), text('#people-page').slice(0, 300));
  $('[data-action="close-people"]').click();
  await until(() => $('#people').hidden);
  $('[data-action="briefing"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'shift-change'));
  check('the briefing\'s Needs attention names who is past it, longest first', /needs attention.*ramirez \(unit 1\): 2h( \d+m)? on scene, past 2h.*okafor \(unit 1\)/.test(text('#briefing-page')), text('#briefing-page').slice(0, 200));
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);
  $('[data-action="sitrep"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'situation report'));
  check('the situation report has an On scene too long section', has('#briefing-page', 'on scene too long', 'okafor (unit 1): 2h'), text('#briefing-page').slice(-600));
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);
  $('#panel [data-action="close-panel"]').click();
  await until(() => !!$('#panel [data-home]'));
  $(`#panel [data-action="select-unit"][data-id="${u.unit1}"]`).click();
  await until(() => has('#panel .title', 'unit 1'));
  check('the unit panel\'s people are orange too', await until(() => $$('#panel .pp-row.over').length === 2) && has('#panel', 'past 2h'), text('#panel').slice(0, 300));
  // the crew's own briefing says under Shift that it is past the period's hours (the phone's one line of it)
  const { fieldBriefing: fb } = await import('../js/shared/briefings.js');
  const shift = fb(base, { me: base.member(u.unit1), at: [30.2681, -97.7318] }).find((x) => x.key === 'shift');
  check('the crew\'s own briefing says under Shift that it is past the period\'s hours', !!shift && shift.warn === true && /Your crew has been on scene 2h( \d+m)?, past the period's 2 hours: Safety sees it; say when you need relief\./.test(shift.text), shift && shift.text);
  $('[data-action="period"]').click();
  await until(() => $('#panel form[data-form="period-edit"]'));
  $('[data-action="iap"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'incident action plan'));
  check('the 203 lists all five seats and Safety', has('#briefing-page', 'planning section chief: theresa okafor', 'logistics section chief: sam whitaker', 'finance / administration section chief: rae lindqvist', 'safety officer: priya natarajan'), text('#briefing-page').slice(0, 600));
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);
  // 2 · requests
  $('#panel [data-action="close-panel"]').click();
  await until(() => has('#panel', 'requests (213rr)'));
  check('the home panel lists the open requests, the urgent first, with the seeded ask from Unit 1', $$('#panel .req').length >= 2 && has('#panel', '2 open', '4 portable lights', 'fuel truck, diesel', 'ordered, on the way'), text('#panel').slice(0, 400));
  const rid = uuid();
  await field.addRequest({ id: rid, kind: 'water', what: 'swift-water team', quantity: 1, urgency: 'now', blocking: true, note: 'Two houses with people on the roof', zoneId: ZONE('A-2'), lat: 30.2674, lng: -97.7384 });
  await until(() => base.request(rid));
  check('the field asks and the base has it at the top with its Now and Stuck badges, logged with the words of the ask (v74)', await until(() => $(`#panel .req[data-request="${rid}"]`) && $$('#panel .req')[0].dataset.request === rid) && has('#panel', '1 to act on now') && $(`#panel .req[data-request="${rid}"] .badge.urg-now`).textContent === 'Now' && $(`#panel .req[data-request="${rid}"] .badge.stuck`).textContent === 'Stuck' && !!eventText(base, 'Unit 3 asked for swift-water team for A-2, now, stuck: Two houses with people on the roof'), logTexts()[0]);
  const answer = (st, words) => { const f = $(`#panel .req[data-request="${rid}"] form[data-form="request-answer"]`); f.answer.value = words || ''; f.requestSubmit(); };
  // requestSubmit has no submitter: click the button instead
  const press = (st) => $(`#panel .req[data-request="${rid}"] button[name="status"][value="${st}"]`).click();
  press('approved');
  await until(() => base.request(rid).status === 'approved');
  check('Approve moves it on and the unit sees it', base.request(rid).status_by === u.ops && !!eventText(base, 'Request for swift-water team (Unit 3) approved') && await until(() => field.request(rid) && field.request(rid).status === 'approved'));
  $(`#panel .req[data-request="${rid}"] form[data-form="request-answer"] input[name="answer"]`).value = 'Boat 2, Bastrop County, 15 min';
  press('ordered');
  await until(() => base.request(rid).status === 'ordered');
  check('Mark ordered carries who is coming and when', base.request(rid).answer === 'Boat 2, Bastrop County, 15 min' && !!eventText(base, 'Request for swift-water team (Unit 3) ordered: Boat 2, Bastrop County, 15 min'), logTexts()[0]);
  press('filled');
  await until(() => base.request(rid).status === 'filled');
  check('Filled closes it, off the open list, in the sitrep no more', await until(() => eventText(base, 'Request for swift-water team (Unit 3) filled')) && base.openRequests().every((r) => r.id !== rid), logTexts()[0]);
  $('[data-action="sitrep"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'situation report'));
  check('the situation report\'s Resources needed is written from the open requests', has('#briefing-page', 'resources needed', '4 portable lights for a-1, before dark · asked', 'fuel truck, diesel, before dark · ordered, on the way, county yard'), text('#briefing-page').slice(-700));
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);
  const e1 = await (async () => { try { await field.answerRequest(REQ[2], 'approved', ''); return null; } catch (e) { return e; } })();
  check('a unit cannot work a request', !!e1 && e1.code === '42501', e1 && e1.message);
  await field.addRequest({ kind: 'fuel', what: 'diesel, 20 gallons', quantity: 1, urgency: 'tomorrow' });
  const mine = field.myRequests().find((r) => r.what === 'diesel, 20 gallons');
  await field.withdrawRequest(mine.id);
  check('a unit can withdraw its own ask while it is only asked', !!mine && await until(() => base.request(mine.id) && base.request(mine.id).archived_at));
  // 3 · checking out with the list
  await field.checkOut({ ticks: { people: true, zone: true, reported: true, hours: true }, open: ['radio and equipment returned to logistics', 'nobody hurt, no equipment damaged'], note: 'Pump left at 112 Pecan Ln, still running' });
  await until(() => base.member(u.unit3).status === 'checked_out');
  check('the check-out line carries what was not done and the note', !!eventText(base, 'Unit 3 checked out · not done: radio and equipment returned to logistics · nobody hurt, no equipment damaged · for the next crew: Pump left at 112 Pecan Ln, still running') && base.member(u.unit3).demob.open.length === 2, logTexts()[0]);
  $(`#panel [data-action="select-unit"][data-id="${u.unit3}"]`).click();
  await until(() => has('#panel .title', 'unit 3') && $('#panel .demob'));
  check('the unit panel shows how it checked out', has('#panel .demob', 'not done: radio and equipment', 'for the next crew: pump left'), text('#panel .demob'));
  $('[data-action="people"]').click();
  await until(() => !$('#people').hidden);
  $('[data-action="print-211"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', '211'));
  check('the 211 says what the unit left undone', has('#briefing-page', 'at check-out, not done: radio and equipment returned to logistics, nobody hurt, no equipment damaged · for the next crew: pump left'), text('#briefing-page').slice(0, 900));
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);
  // 4 · hours
  $('[data-action="hours"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'hours on scene'));
  check('the Hours page lists every person and unit with hours, the seeded people on scene and Unit 3 checked out', $$('#briefing-page .hours-table tbody tr').length >= 9 && has('#briefing-page', 'ramirez', 'on scene', 'unit 3', 'checked out', 'people hours', 'by agency: cedar fork fire department') && has('#briefing-page', 'counted to now'), text('#briefing-page').slice(0, 500));
  const sel = $('#briefing-page [data-select="hours-period"]');
  sel.value = 'all'; sel.dispatchEvent(new Event('change', { bubbles: true }));
  await until(() => has('#briefing-page', 'the whole incident so far'));
  check('the period picker switches to the whole incident', has('#briefing-page', 'the whole incident so far'));
  const { hoursCsv, hoursRows } = await import('../js/shared/hours.js');
  const csv = hoursCsv(hoursRows({ people: base.people(), members: base.members(), period: null }), base.incident.name, 'whole incident');
  check('the CSV has a header and a row per person and unit', csv.startsWith('incident,period,row,name,unit,agency,role,checked_in_utc,checked_out_utc,hours,note') && csv.split('\r\n').filter(Boolean).length >= 10 && /"unit","Unit 3"/.test(csv), csv.split('\r\n')[1]);
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);
  $('[data-action="people-close"]') && $('[data-action="people-close"]').click();
}

// ICS-100 (v24): the command staff and the agency representatives, the organization chart and its
// span of control, a transfer of command that tells everyone, a unit's own briefing and the hurt
// card from the data, the join card as the deployment briefing, a unit's kind, Camp and Helibase,
// and the "You are released" chip.
async function ics100(check) {
  const u = USERS();
  const { fieldBriefing, hurtLines, orgTree } = await import('../js/shared/briefings.js');
  // 1 · the command staff and the agency representatives
  $('[data-action="period"]').click();
  await until(() => $('#panel form[data-form="period-edit"]'));
  const pf = $('#panel form[data-form="period-edit"]');
  check('the period form seats the PIO and the Liaison Officer, and lists the agencies on scene for their representatives', pf.pio.value === 'Lena Marsh' && pf.liaison.value === 'Tomás Herrera' && $$('#panel .rep-row').length === 2 && has('#panel .reps', 'cedar fork fire department', 'lead agency', 'travis county rescue') && $('#panel [data-rep="name"][data-agency="Travis County Rescue"]').value === 'Sam Whitaker', text('#panel .reps'));
  pf.liaison.value = 'Ana Ortiz';
  $('#panel [data-rep="phone"][data-agency="Travis County Rescue"]').value = '512 555 0199';
  pf.requestSubmit();
  await until(() => base.currentPeriod().liaison === 'Ana Ortiz' && base.periodAgencies()[0].phone === '512 555 0199');
  check('saving logs the seat and the representative, and the field sees both', !!eventText(base, 'Operational period 1 updated, Liaison Ana Ortiz') && !!eventText(base, 'Travis County Rescue representative: Sam Whitaker, 512 555 0199') && await until(() => field.currentPeriod().liaison === 'Ana Ortiz' && field.periodAgencies().length === 1), logTexts().slice(0, 2).join(' | '));
  $('[data-action="iap"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'incident action plan'));
  check('the 203 has the command staff, the agency representatives and the units with their kinds', has('#briefing-page', 'deputy incident commander: not set', 'public information officer: lena marsh', 'liaison officer: ana ortiz', 'agency representatives', 'travis county rescue: sam whitaker · 512 555 0199', 'unit 2, boat crew (nguyen, patel)', 'division a-1 supervisor: lt. okafor · unit 1, engine'), text('#briefing-page').slice(0, 1200));
  check('the IAP carries the 207 with the span of control', has('#briefing-page', 'organization chart, ics 207', 'operations section chief: marcus bell · 1 : 5') && $$('#briefing-page .org .org-div').length === 6, text('#briefing-page').slice(1200, 2000));
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);
  $('[data-action="briefing"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'shift-change'));
  check('the briefing\'s command line names the PIO and the Liaison, and the agency representatives', has('#briefing-page', 'pio lena marsh · liaison ana ortiz', 'agency representatives: travis county rescue: sam whitaker'), text('#briefing-page').slice(0, 500));
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);
  $('[data-action="sitrep"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'situation report'));
  check('the situation report\'s public information line names the PIO', has('#briefing-page', '1 photo cleared for public release, 0 checked (no face, no plate, no house number), to lena marsh (pio)'), text('#briefing-page').slice(-300));
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);

  // 2 · the organization chart (ICS 207) and the span of control
  $('[data-action="org"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'organization chart'));
  check('the Org chart opens from the header: the IC on top, three staff seats, four sections, a card per division with its supervisor, unit and people', has('#briefing-page .org-box.ic', 'dana ruiz', 'cedar fork fire department') && $$('#briefing-page .org-box.staff').length === 3 && $$('#briefing-page .org-box.general').length === 4 && $$('#briefing-page .org-div').length === 6 && has('#briefing-page .org-div.st-active', 'a-1', 'supervisor lt. okafor', 'unit 1, engine', 'ramirez, okafor') && !$('#briefing-page .org-warn'), text('#briefing-page').slice(0, 500));
  check('Operations counts 1 : 5 (the cleared division is released), not orange', $$('#briefing-page .org-box.general .org-span')[0].textContent === '1 : 5' && !$('#briefing-page .org-span.over'), $$('#briefing-page .org-box.general .org-span')[0].textContent);
  for (const i of [1, 2, 3]) await base.addZone({ code: 'C-' + i, name: 'Smoke ' + i, priority: 3, polygon: base.zone(ZONE('B-3')).polygon, structures: 1 });
  check('with eight divisions the count turns orange and the page says what to do', await until(() => $('#briefing-page .org-span.over') && has('#briefing-page .org-warn', 'operations is at 1 : 8', 'group the divisions into branches')), text('#briefing-page .org-warn'));
  check('the warning points at the empty Deputy seat, and the seat under the IC turns orange (v31)', has('#briefing-page .org-warn', 'the deputy seat on the period sheet is empty: add a deputy') && !!$('#briefing-page .org-box.deputy.over.empty') && has('#briefing-page .org-box.deputy', 'deputy incident commander', 'not set', 'add a deputy: the span of control is past seven'), text('#briefing-page .org-box.deputy'));
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);
  $('[data-action="briefing"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'shift-change'));
  check('the briefing\'s Needs attention carries the one-line warning', has('#briefing-page', 'needs attention', 'operations is at 1 : 8: past the span of control'), text('#briefing-page').slice(-900));
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);
  // the Deputy seat (v31): named on the period sheet, logged, drawn under the IC, the warning names them
  $('[data-action="period"]').click();
  await until(() => $('#panel form[data-form="period-edit"]'));
  const pf2 = $('#panel form[data-form="period-edit"]');
  check('the period sheet has the Deputy seat beside the Incident Commander, empty', pf2.deputy && pf2.deputy.value === '' && pf2.deputy.closest('.row-2') === pf2.ic.closest('.row-2'), String(!!pf2.deputy));
  pf2.deputy.value = 'Chief Al Barnes';
  pf2.requestSubmit();
  await until(() => base.currentPeriod().deputy === 'Chief Al Barnes');
  check('naming the deputy is logged like the other seats, and the field sees it', !!eventText(base, 'Operational period 1 updated, Deputy Chief Al Barnes') && await until(() => field.currentPeriod().deputy === 'Chief Al Barnes'), logTexts()[0]);
  $('[data-action="org"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'organization chart'));
  check('the 207 draws the deputy under the IC and the warning names them instead', has('#briefing-page .org-box.deputy', 'chief al barnes') && !$('#briefing-page .org-box.deputy.over') && !$('#briefing-page .org-box.deputy.empty') && has('#briefing-page .org-warn', 'deputy: chief al barnes') && !has('#briefing-page .org-warn', 'add a deputy'), text('#briefing-page .org-warn'));
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);
  for (const code of ['A-1', 'A-2', 'A-3', 'B-1']) await base.updateZone(ZONE(code), { branch: 'North' });
  for (const code of ['B-2', 'B-3']) await base.updateZone(ZONE(code), { branch: 'South' });
  for (const z of base.zones().filter((z) => z.code.startsWith('C-'))) await base.updateZone(z.id, { branch: 'South' });
  await until(() => base.zones().every((z) => z.branch));
  check('a branch is a word on the division, logged', await until(() => eventText(base, 'A-1 assignment updated, branch North')), logTexts()[0]);
  const tree = orgTree(base);
  check('grouped into two branches, Operations is at 1 : 2 and each branch under seven', tree.general[0].count === 2 && tree.branches.map((b) => b.name + ' ' + b.count).join(', ') === 'North 3, South 5' && tree.warnings.length === 0, JSON.stringify(tree.warnings) + ' ' + tree.general[0].count);
  $(`#zones .zr[data-id="${ZONE('A-1')}"]`).click();
  await until(() => $('#panel form[data-form="zone-edit"]') && $('#panel form[data-form="zone-edit"]').branch.value === 'North');
  check('the division panel shows and edits the branch', $('#panel form[data-form="zone-edit"] input[name="branch"]').value === 'North' && has('#panel', 'branch north'));
  $('#panel [data-action="print-204"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', '204'));
  check('the 204\'s header reads Branch North · Division A-1, the unit with its kind, and the medical lines from the unit\'s own medics', has('#briefing-page', 'branch north · division a-1', 'unit 1, engine (ramirez, okafor)', 'medical, ics 206', '1. medic on your unit: okafor, paramedic. ramirez is an emt.', '2. call it on tac 9, emergency traffic', '3. nearest hospital: dell seton medical center'), text('#briefing-page').slice(0, 1400));
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);

  // 3 · transfer of command
  $('[data-action="period"]').click();
  await until(() => $('#panel form[data-form="period-edit"]'));
  let f = $('#panel form[data-form="period-edit"]');
  f.ic.value = 'Dana Ruiz-Ortega';
  f.requestSubmit();
  await until(() => $('#transfer-dialog').open);
  check('a different Incident Commander name asks whether command is being transferred', has('#transfer-dialog', 'transfer command from dana ruiz to dana ruiz-ortega', 'tell everyone in the field', 'open the briefing', 'start a new operational period'), text('#transfer-dialog').slice(0, 300));
  $('#transfer-dialog [data-action="transfer-rename"]').click();
  await until(() => base.currentPeriod().ic_name === 'Dana Ruiz-Ortega');
  check('Just change the name is a correction: the period is updated, the open command row renamed, no transfer logged', !$('#transfer-dialog').open && !!eventText(base, 'Operational period 1 updated, Incident Commander Dana Ruiz-Ortega') && base.commands().length === 1 && base.commands()[0].ic_name === 'Dana Ruiz-Ortega' && !base.events().some((e) => /^Command transferred/.test(e.text)), logTexts()[0]);
  await until(() => $('#panel form[data-form="period-edit"]') && $('#panel form[data-form="period-edit"]').ic.value === 'Dana Ruiz-Ortega');
  f = $('#panel form[data-form="period-edit"]');
  f.ic.value = 'Marcus Bell'; f.ops.value = 'Jo Castillo';
  f.requestSubmit();
  await until(() => $('#transfer-dialog').open);
  check('the sheet previews the message every unit will get', has('#transfer-dialog', 'every unit (3)', 'command transferred to marcus bell at', 'operations section chief is jo castillo'), text('#transfer-dialog'));
  $('#transfer-dialog [data-action="transfer-go"]').click();
  await until(() => base.currentCommand() && base.currentCommand().ic_name === 'Marcus Bell');
  const cmd = base.currentCommand();
  check('Transfer command: the old row is closed, the new one open with who handed over, the period\'s seats changed', base.commands().length === 2 && !!base.commands()[0].ended_at && cmd.from_name === 'Dana Ruiz-Ortega' && cmd.ops_chief === 'Jo Castillo' && base.currentPeriod().ic_name === 'Marcus Bell' && base.currentPeriod().ops_chief === 'Jo Castillo', JSON.stringify(base.commands()));
  const line = base.events().find((e) => /^Command transferred/.test(e.text));
  check('the log has a notable line, and no period-updated line for the name', !!line && line.text === 'Command transferred from Dana Ruiz-Ortega to Marcus Bell · Operations Section Chief Jo Castillo' && line.notable === true && line.ref_table === 'ic_commands' && !base.events().some((e) => /^Operational period 1 updated, Incident Commander Marcus Bell/.test(e.text)), line && line.text);
  const msg = base.messages().find((m) => m.kind === 'safety' && /^Command transferred to Marcus Bell/.test(m.text));
  check('every unit gets the safety-style message, on the yellow bar until all three answer', !!msg && msg.to_users.length === 3 && /Operations Section Chief is Jo Castillo\./.test(msg.text) && await until(() => !$('#safety').hidden && has('#safety', 'command transferred to marcus bell', 'waiting on 3 units') && $$('#safety .bar-item').some((b) => /waiting on Unit 1, Unit 2, Unit 3/.test(b.title))), msg && msg.text);
  check('the briefing opened for the handover, with the new IC and the transfer line', !$('#briefing').hidden && has('#briefing-title', 'shift-change') && has('#briefing-page', 'incident commander marcus bell', 'command transferred at', 'from dana ruiz-ortega to marcus bell'), text('#briefing-page').slice(0, 500));
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);
  check('Unit 3 has it as an unanswered safety message', await until(() => field.myUnanswered().some((m) => m.id === msg.id && m.kind === 'safety')));
  await field.ackMessage(msg.id, 'Acknowledged');
  check('its acknowledgement is logged like any safety message', await until(() => !!eventText(base, 'Unit 3 acknowledged Operations: Acknowledged')) && await until(() => has('#safety', 'waiting on 2 units') && $$('#safety .bar-item').some((b) => /waiting on Unit 1, Unit 2$|waiting on Unit 1, Unit 2 ·/.test(b.title) && !/Unit 3/.test(b.title))), text('#safety'));
  $('#inc-sub').click();
  check('the incident\'s card reads IC Marcus Bell (v76)', await until(() => !$('#inc-pop').hidden && has('#inc-pop', 'ic marcus bell')), text('#inc-pop').slice(0, 200));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await until(() => $('#inc-pop').hidden);
  $('[data-action="iap"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'incident action plan'));
  check('the 203 says who holds command since when, and who held it before, and prints the deputy', has('#briefing-page', 'incident commander: marcus bell · since', 'from dana ruiz-ortega', 'held command earlier: dana ruiz-ortega ·', 'deputy incident commander: chief al barnes'), text('#briefing-page').slice(0, 500));
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);
  $('[data-action="print-214"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', '214'));
  check('the 214 leads with the transfer as a notable entry and its header carries the handover', has('#briefing-page', 'notable', '★ command transferred from dana ruiz-ortega to marcus bell', 'incident commander marcus bell · dana ruiz-ortega ·'), text('#briefing-page').slice(0, 600));
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);
  $('[data-action="period"]').click();
  await until(() => $('#panel [data-action="period-next"]'));
  $('#panel [data-action="period-next"]').click();
  await until(() => $('#panel form[data-form="period-start"]'));
  const sf = $('#panel form[data-form="period-start"]');
  check('the start form carries the PIO, the Liaison and the Deputy over', sf.pio.value === 'Lena Marsh' && sf.liaison.value === 'Ana Ortiz' && sf.ic.value === 'Marcus Bell' && sf.deputy.value === 'Chief Al Barnes', sf.ic.value + ' / ' + sf.deputy.value);
  sf.ic.value = 'Priya Natarajan';
  sf.requestSubmit();
  await until(() => $('#transfer-dialog').open);
  check('a new period with a different IC asks too, the period start part of it', has('#transfer-dialog', 'transfer command from marcus bell to priya natarajan', 'start operational period 2'), text('#transfer-dialog').slice(0, 300));
  $('#transfer-dialog input[name="notify"]').checked = false;
  $('#transfer-dialog input[name="briefing"]').checked = false;
  $('#transfer-dialog [data-action="transfer-go"]').click();
  await until(() => base.currentPeriod() && base.currentPeriod().number === 2);
  const p2 = base.currentPeriod();
  check('period 2 starts with the new IC, the transfer logged, no message this time, the representatives carried over', p2.ic_name === 'Priya Natarajan' && p2.pio === 'Lena Marsh' && p2.deputy === 'Chief Al Barnes' && base.events().some((e) => /^Operational period 2 started, Incident Commander Priya Natarajan, Deputy Chief Al Barnes/.test(e.text)) && base.currentCommand().ic_name === 'Priya Natarajan' && base.commands().length === 3 && !!eventText(base, 'Command transferred from Marcus Bell to Priya Natarajan · Operations Section Chief Jo Castillo') && base.messages().filter((m) => /^Command transferred/.test(m.text)).length === 1 && base.periodAgencies(p2.id).length === 1 && base.periodAgencies(p2.id)[0].phone === '512 555 0199' && $('#briefing').hidden, logTexts().slice(0, 3).join(' | '));
  const bad = await (async () => { try { await field.transferCommand('Nobody'); return null; } catch (e) { return e; } })();
  check('a unit cannot transfer command', !!bad && /Only Operations/.test(bad.message), bad && bad.message);

  // 4 · your briefing on the phone: the sections the phone draws, from the field's own data
  const fb = fieldBriefing(field, { me: field.me(), at: [30.2674, -97.7384] });
  check('Unit 3\'s briefing has the eight items, every line from the incident as it is now', fb.map((s) => s.key).join() === 'situation,job,with,area,radio,supplies,shift,safety' && fb[0].text.includes('Cedar Fork Flooding, OP 2') && fb[1].lead === 'Division A-2, Pecan Mobile Home Park.' && fb[1].text.includes('Supervisor: not named. Priority 1.') && fb[2].text.includes('On Unit 3: Hale (swift water, EMT), Dominguez (paramedic).') && fb[2].text.includes('Next door: Unit 1 in A-1, Unit 2 in B-1.') && fb[2].text.includes('Operations: Jo Castillo at Cedar Fork High School, front office.') && /^A-2 on the map, 18 structures, 6 cleared\. (No boat ramp on the map yet; ask Operations where to put in\. )?Staging: High school east lot,/.test(fb[3].text) && fb[4].text === 'TAC 2 for your division. Command on CMD 1. Emergency traffic on TAC 9. Plain English, no codes.' && fb[7].warn && fb[7].lead === 'No safety message written for this period.' && fb[7].text.startsWith('Hazard open: downed power line'), JSON.stringify(fb.map((s) => [s.lead, s.text])).slice(0, 600));

  // 5 · if someone is hurt
  const hl = hurtLines(field, { unit: field.me(), at: [30.2674, -97.7384] });
  check('the hurt card names the medic on the unit, the emergency channel, the nearest hospital with its distance and directions, and the check-out reminder', hl.length === 4 && hl[0].text === 'Medic on your unit: Dominguez, paramedic. Hale is an EMT.' && hl[1].text.startsWith('Call it on TAC 9, emergency traffic') && /^Nearest hospital: Dell Seton Medical Center, 0\.8 mi\. 1500 Red River St\. Trauma center, 12 minutes from the base\. 512 555 0100\. No ambulance on scene/.test(hl[2].text) && hl[2].directions.includes('30.278') && hl[3].text.includes('Finance needs it for the claim'), hl.map((l) => l.text).join(' | '));
  const c4 = window.supabase.createClient();
  await mockSignIn(c4, 'unit4@mock.local');
  const d4 = new Data(c4); await d4.init();
  await d4.saveProfile({ full_name: 'Sam Smoke', phone: '512 555 0144', licence_number: 'S1122334', licence_state: 'TX', id_source: 'typed' });
  await d4.join('CEDAR7', 'unit', 'Unit 4', null, null, 'Bastrop County', [{ name: 'Novak', role: '', qualifications: ['boat'] }], 'boat');
  await d4.open(INC());
  await base.updateFacility(M().ids.facilities[3], { closed_at: new Date().toISOString() });
  await until(() => d4.facility(M().ids.facilities[3]).closed_at);
  const h4 = hurtLines(d4, { unit: d4.me(), at: [30.2556, -97.7400] });
  check('with no medic on the unit and no hospital placed, both lines go orange and the nearest medic is named', h4[0].warn === true && /^No medic on Unit 4\. Nearest medic: Unit 2, Patel \(rope, EMT\), in B-1, 0\.\d mi\.$/.test(h4[0].text) && h4[2].warn === true && h4[2].text.startsWith('No hospital placed on the map'), h4[0].text + ' | ' + h4[2].text);
  await base.updateFacility(M().ids.facilities[3], { closed_at: null });
  check('checking in with a kind says so in the line', !!eventText(base, 'Unit 4, boat crew checked in as Sam Smoke, 512 555 0144, licence typed with 1 person') && base.member(d4.user.id).kind === 'boat', logTexts().slice(0, 4).join(' | '));
  d4.close();

  // 6 · the join card as the deployment briefing
  $('[data-action="close-panel"]').click();
  await until(() => $('#codes-pop [data-action="print-join"]'));
  $('#codes-pop [data-action="print-join"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'join card'));
  check('the join card carries the six deployment lines and what to bring, from the data, and when it was printed', has('#briefing-page', 'deployment briefing', 'incident: cedar fork flooding · lead agency cedar fork fire department · ic priya natarajan', 'check in at: staging, high school east lot · units wait here between assignments', 'your assignment: given at check-in by operations. the period', 'report by:', 'for the operational period 3 briefing at staging', 'getting there: high school east lot · 1200 mill st, east lot · units wait here between assignments · for a satnav 30.25560, -97.74000', 'radio: command cmd 1 · tactical, division a tac 2', 'safety:', 'bring: pfds and dry bags for water crews', 'who to ask for', 'staging: sam whitaker (logistics) · operations: jo castillo', 'printed') && has('#briefing-page', 'check in with your phone', 'scan the code, or open', 'anyone with this code can join'), text('#briefing-page').slice(0, 1400));
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);

  // 7 · a unit's kind: the board, the panel, the request
  check('the resources board groups the units by kind with counts, Unit 4 among the boat crews', await until(() => has('#panel', 'engines · 1', 'boat crews · 2', 'swift-water teams · 1', 'unit 4, boat crew') && $$('#panel .grp .rs-g').length >= 3), text('#panel').slice(0, 500));   // Close puts the home panel back on the next frame; with the pane visible the read must wait for it (v62)
  $('#panel [data-action="board-mode"][data-mode="status"]').click();
  await until(() => $('#panel .grp .badge.st-assigned'));
  check('or by status, the T-card rack', has('#panel .grp', 'assigned') && has('#panel', 'available'), text('#panel').slice(0, 300));
  $('#panel [data-action="board-mode"][data-mode="kind"]').click();
  await until(() => $('#panel .grp .badge.kind'));
  $(`#panel [data-action="select-unit"][data-id="${u.unit2}"]`).click();
  await until(() => has('#panel .title', 'unit 2, boat crew') && $('#panel [data-action="set-kind"]'));
  $('#panel [data-action="set-kind"][data-kind="high_water"]').click();
  await until(() => base.member(u.unit2).kind === 'high_water');
  check('Operations changes a unit\'s kind from its panel, logged, seen by the field', !!eventText(base, 'Unit 2 is a high-water vehicle') && await until(() => has('#panel .title', 'unit 2, high-water vehicle')) && await until(() => field.member(u.unit2).kind === 'high_water'), logTexts()[0]);
  $('#panel [data-action="set-kind"][data-kind="boat"]').click();
  await until(() => base.member(u.unit2).kind === 'boat');
  const rid = uuid();
  await field.addRequest({ id: rid, kind: 'water', what: 'boat crew', quantity: 2, urgency: 'now', note: 'Two houses with people on the roof', zoneId: ZONE('A-2'), lat: 30.2674, lng: -97.7384 });
  $('[data-action="close-panel"]').click();
  await until(() => $(`#panel .req[data-request="${rid}"]`));
  check('a request for boat crews says which are on scene now, nearest to the division first', has(`#panel .req[data-request="${rid}"]`, 'on scene now:', 'unit 2, boat crew on b-1', 'unit 4, boat crew at staging'), text(`#panel .req[data-request="${rid}"]`));
  check('the field\'s check-in keeps the kind when none is given', !!(await field.join('CEDAR7', 'unit', 'Unit 3', null, null, null, null)) && await until(() => base.member(u.unit3).kind === 'swift_water' && eventText(base, 'Unit 3 checked in as Jordan Lee Hale, 512 555 0133, licence scanned')));
  const badKind = await (async () => { try { await field.setKind(u.unit3, 'tank'); return null; } catch (e) { return e; } })();
  check('a kind off the list is refused', !!badKind && badKind.code === '23514', badKind && badKind.message);

  // 8 · Camp and Helibase; the "You are released" chip
  check('Camp and Helibase can be placed', $$('#facility-kind option').map((o) => o.value).includes('camp') && $$('#facility-kind option').map((o) => o.value).includes('helibase'));
  await base.addFacility({ kind: 'camp', name: 'Fairgrounds camp', lat: 30.258, lng: -97.736 });
  check('a camp is logged by its name and drawn with its letter', await until(() => eventText(base, 'Camp: Fairgrounds camp opened')) && await until(() => $$('#map .fmark-camp').length === 1), logTexts()[0]);
  const chip = $('#panel form[data-form="message"] [data-action="msg-chip"][data-text^="You are released"]');
  chip.click();
  const composer = $('#panel form[data-form="message"]');
  check('the "You are released" chip fills the message with the staging area and the radio', composer.text.value === 'You are released. Return to staging, High school east lot, return the radio to Logistics, and check out on your phone. Thank you.', composer.text.value);
}

// ---- small items from the re-walks (v48): the eight Still bites from the re-walks after v38 to v47, as the personas met them
async function rewalks(check) {
  const u = USERS(), b2 = ZONE('B-2'), PPL = M().ids.people;
  // the front door's sign-in card says what is true (the card is hidden while signed in: read its text, not its screen)
  check('the front door\'s sign-in card says a code, no password, and who is Operations (v73)', /No password: type your email or mobile number and a six-digit code comes back[\s\S]*Whoever opens an incident is its Operations and decides who else runs the base/.test($('#auth').textContent) && !/account your agency gave you/.test($('#auth').textContent) && !$('#auth-password') && !$('#auth-signup'), $('#auth-form p.muted').textContent);
  // the chime's first click: the quiet line says so until a real click or key arrives (the suite's events are synthetic, so it stays)
  check('the bar\'s quiet line says to click once so the base can ring', has('#bars-quiet', 'no emergency open', 'click anywhere once so the base can ring'), text('#bars-quiet'));
  // a street address on a facility: the card, the join card's Getting there and the 204's Where to go
  const staging = M().ids.facilities[1];
  const sel = document.createElement('button'); sel.dataset.action = 'select-facility'; sel.dataset.id = staging; sel.hidden = true; document.body.appendChild(sel); sel.click(); sel.remove();
  const ff = await until(() => $('#panel form[data-form="facility-edit"]'));
  check('the facility card has the seeded street address and a box for it', !!ff && ff.address.value === '1200 Mill St, east lot' && has('#panel', 'address', '1200 mill st, east lot'), ff && ff.address.value);
  ff.address.value = '1200 Mill St, east lot, gate 3'; ff.requestSubmit();
  await until(() => base.facility(staging).address === '1200 Mill St, east lot, gate 3');
  check('a changed address is saved and logged as an update', base.facility(staging).address === '1200 Mill St, east lot, gate 3' && !!eventText(base, 'Staging area: High school east lot updated'), logTexts()[0]);
  $('#panel [data-action="close-panel"]').click();
  await until(() => !!$('#panel [data-home]'));
  $('[data-action="print-join"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'join card'));
  const there = text('#briefing-page');
  check('Getting there on the join card gives the address before the coordinates', /getting there:? high school east lot · 1200 mill st, east lot, gate 3 · units wait here between assignments · for a satnav/.test(there), there.slice(there.indexOf('getting there'), there.indexOf('getting there') + 160));
  $('[data-action="close-briefing"]').click(); await until(() => $('#briefing').hidden);
  $(`#zones .zr[data-id="${ZONE('A-1')}"]`).click();
  await until(() => has('#panel .title', 'a-1'));
  $$('#panel button').find((x) => /print the 204/i.test(x.innerText)).click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', '204'));
  check('the 204\'s Where to go carries the address too', has('#briefing-page', 'where to go', 'staging area: high school east lot · 1200 mill st, east lot, gate 3 · cmd 1', 'shelter: high school gym · 1200 mill st, gym entrance'), text('#briefing-page').slice(text('#briefing-page').indexOf('where to go'), text('#briefing-page').indexOf('where to go') + 300));
  $('[data-action="close-briefing"]').click(); await until(() => $('#briefing').hidden);
  // the softer urgency words: the Hazards open list in urgency order, the words on the division panel's chip
  const h1 = uuid(), h2 = uuid(), h3 = uuid();
  await field.addHazard(h1, { kind: 'Downed power line', note: 'across the lane', urgency: 'nightfall', lat: 30.2590, lng: -97.7480, zoneId: b2 });
  await field.addHazard(h2, { kind: 'Gas smell', urgency: 'blocking', lat: 30.2592, lng: -97.7470, zoneId: b2 });
  await field.addHazard(h3, { kind: 'Loose animal', urgency: '', lat: 30.2594, lng: -97.7460, zoneId: b2 });
  await until(() => base.hazards().length >= 4);
  $('#panel [data-action="close-panel"]').click();
  await until(() => has('#panel', 'hazards open · 4'));
  check('Hazards open lists blocks further operations first, then before nightfall, then the rest newest first', await until(() => $$('#panel .haz-row').map((r) => r.dataset.hazard).slice(0, 3).join() === [h2, h1, h3].join()), $$('#panel .haz-row').map((r) => r.dataset.hazard.slice(0, 4)).join(' '));
  $(`#zones .zr[data-id="${b2}"]`).click();
  await until(() => has('#panel .title', 'b-2'));
  check('the division panel\'s hazard chips carry the urgency words', $$('#panel .hazline .badge').map((b) => b.textContent).join(' | ') === 'Blocks further operations | Before nightfall', $$('#panel .hazline').map((x) => x.innerText.replace(/\s+/g, ' ')).join(' || '));
  // a revisit already past today means tomorrow, on the list and in the 214
  const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(6, 0, 0, 0);
  const rid = uuid();
  await field.addStructure(rid, { zone_id: b2, label: '115 Bee Creek Rd', status: 'not_searched', notes: 'gas off', revisit_at: t.toISOString(), revisit_hhmm: 'tomorrow 06:00' });
  await until(() => base.structure(rid));
  check('a revisit for tomorrow reads "tomorrow 06:00" on the division\'s list and in the log', await until(() => has('#panel', '115 bee creek rd · not searched · revisit tomorrow 06:00')) && !!eventText(base, 'B-2: 115 Bee Creek Rd · revisit tomorrow at 06:00 (gas off)'), text('#panel').slice(0, 400));
  $('#panel [data-action="close-panel"]').click();
  await until(() => !!$('#panel [data-home]'));
  // the current stretch: Nguyen checked out and back in
  const ng = base.person(PPL[2]), was = ng.checked_in_at;
  await base.checkOutPerson(PPL[2]);
  await until(() => base.person(PPL[2]).checked_out_at);
  await base.checkInPerson(PPL[2]);
  await until(() => base.person(PPL[2]).stint_at && eventText(base, 'Nguyen (swift water, boat) checked back in with Unit 2'));
  check('checked out and back in: the check-in stays, the stint stamp is now, and the log says so', base.person(PPL[2]).checked_in_at === was && !base.person(PPL[2]).checked_out_at && Date.now() - new Date(base.person(PPL[2]).stint_at).getTime() < 60000 && !!eventText(base, 'Nguyen (swift water, boat) checked back in with Unit 2'), `${base.person(PPL[2]).checked_in_at === was} ${base.person(PPL[2]).stint_at} | ${logTexts()[0]}`);
  $('[data-action="people"]').click();
  await until(() => !$('#people').hidden);
  check('the board counts the current stretch: "0m · back in" on the line, "0m, since now · back in" in the drawer', await until(() => /0m · back in/.test(text(`#people-page .pp-line[data-person="${PPL[2]}"]`))) && await (async () => { $(`#people-page .pp-line[data-person="${PPL[2]}"]`).click(); return until(() => /0m, since \d\d:\d\d · back in/.test(text(`#people-page .pp-drawer[data-person="${PPL[2]}"]`))); })(), text(`#people-page .pp-line[data-person="${PPL[2]}"]`));
  $('[data-action="print-211"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', '211'));
  check('the 211 keeps every stretch: checked in at the first check-in', row211('Nguyen').includes('capt. swift water, boat (pending) ' + new Date(was).toTimeString().slice(0, 5) + ' '), row211('Nguyen'));
  $('[data-action="close-briefing"]').click(); await until(() => $('#briefing').hidden);
  $('[data-action="close-people"]').click(); await until(() => $('#people').hidden);
  // they're all found: a crew whose whole boat was out of contact, one press on the base
  const par = await base.startPar('all');
  await field.answerPar(par.id, false, 0, [{ id: PPL[4], name: 'Hale' }, { id: PPL[5], name: 'Dominguez' }]);
  await until(() => base.missingNow().length === 2 && $$('#safety [data-action="mark-all-found"]').length === 2);
  check('two missing on one answer: Found per name and They\'re all found on each line', has('#safety', 'missing · hale (unit 3)', 'missing · dominguez (unit 3)') && $$('#safety [data-action="mark-found"]').length === 2 && $$('#safety [data-action="mark-all-found"]').length === 2, text('#safety'));
  $('#safety [data-action="mark-all-found"]').click();
  await until(() => base.missingNow().length === 0);
  check('one press clears both lines and writes one notable line', !has('#safety', 'missing ·') && !!eventText(base, 'Hale, Dominguez found, reported by Operations') && eventText(base, 'Hale, Dominguez found, reported by Operations').notable, logTexts()[0]);
  // the phone: Operations' acknowledgement of its hazard, and They're all found on its own card
  let P = null;
  try {
    P = await phoneFrame();
    check('the field app opens beside the base as Unit 3', !!P.ready, P.text('#me-name'));
    if (P.$('#s-briefing') && !P.$('#s-briefing').hidden) await P.act('briefing-later');
    const h4 = uuid();
    await field.addHazard(h4, { kind: 'Tree down, road blocked', urgency: 'now', lat: 30.2674, lng: -97.7384, zoneId: ZONE('A-2') });
    check('the phone lists its own hazard as waiting for Operations', await until(() => /tree down, road blocked · a-2 · waiting for operations to acknowledge/.test(P.text('#myhaz')), 30000), P.text('#myhaz'));
    await base.ackHazard(h4);
    check('when Operations acknowledges it the phone says so, with a toast', await until(() => /acknowledged by operations \d\d:\d\d/.test(P.text('#myhaz')), 30000) && await until(() => P.$('#toast') && !P.$('#toast').hidden && /Operations acknowledged your hazard: tree down, road blocked in A-2 at \d\d:\d\d/.test(P.$('#toast').textContent), 5000), P.text('#myhaz') + ' | ' + (P.$('#toast') ? P.$('#toast').textContent : ''));
    const par2 = await base.startPar('all');
    await until(() => P.$('#s-safety') && !P.$('#s-safety').hidden, 30000);
    await field.answerPar(par2.id, false, 0, [{ id: PPL[4], name: 'Hale' }, { id: PPL[5], name: 'Dominguez' }]);
    check('the phone\'s missing card offers They\'re all found beside Found per name', await until(() => P.$('#missing [data-all="1"]') || P.$('#helpsent-missing [data-all="1"]'), 30000) && /they're all found/.test(P.text('#missing') + P.text('#helpsent-missing')), P.text('#missing') + P.text('#helpsent-missing'));
    (P.$('#missing [data-all="1"]') || P.$('#helpsent-missing [data-all="1"]')).click();
    check('one tap on the phone clears both, and the log names them', await until(() => base.missingNow().length === 0, 70000) && await until(() => eventText(base, 'Hale, Dominguez found, reported by Unit 3'), 10000), logTexts()[0]);
    // v53: a hazard whose note restates its kind reads once on the bar; the check-in page says who checked out
    const h5 = uuid();
    await field.addHazard(h5, { kind: 'Person or car in the water', note: 'Car in the water at the bridge, one person inside', urgency: 'now', lat: 30.2674, lng: -97.7384, zoneId: ZONE('A-2') });
    check('the bar\'s hazard item gives the note alone when it restates the kind', await until(() => has('#safety', 'hazard · car in the water at the bridge, one person inside · a-2')) && !has('#safety', 'hazard · person or car in the water, car in the water'), text('#safety'));
    await base.ackHazard(h5);
    await P.act('menu'); await until(() => P.shown('#s-menu'), 5000);
    await P.act('check-out'); await until(() => P.shown('#s-checkout'), 5000);
    await P.act('checkout-confirm');
    check('after its own check-out the phone\'s check-in page says you were Unit 3 · checked out', await until(() => P.shown('#join') && /you were unit 3 · checked out \d\d:\d\d/.test(P.text('#join-list')), 70000), P.text('#join-list').slice(0, 200));
  } finally {
    if (P) P.frame.remove();
    for (const k of Object.keys(localStorage)) if (/^ic\.field\./.test(k)) localStorage.removeItem(k);
    await wait(100);
  }
}

// ---- the transport board (v54): a run from a pickup to a facility with evacuee records on it. The base plans
// a run and presses its steps, the gym card lists the runs coming, a crew puts its people on a run from the house
// record, a unit that drives sees its run card, and the desk signs a whole run in with one tap.
async function transports(check) {
  autoConfirm(true);
  for (const k of Object.keys(localStorage)) if (/^ic\.field\./.test(k)) localStorage.removeItem(k);
  localStorage.removeItem('ic.map.runs');   // v75: a run cut short may have left the runs off this screen
  let P = null;
  const gym = M().ids.facilities[2], a2 = ZONE('A-2');
  const TR = M().tables.ic_transports.map((t) => t.id);
  const run = (label) => base.transports(true).find((t) => t.label === label) || null;
  const rec = (label) => base.evacuees(true).find((e) => e.label === label) || null;
  const openFacility = async (id) => {
    const b = document.createElement('button'); b.dataset.action = 'select-facility'; b.dataset.id = id; b.hidden = true; document.body.appendChild(b); b.click(); b.remove();
    return until(() => $('#panel form[data-form="facility-edit"]') && $('#panel .title') && base.facility(id) && $('#panel .title').textContent.startsWith(base.facility(id).name));
  };
  try {
    check('seeded: three runs, Bus 2 en route to the gym with the family of 4 on it, the home panel counts people in transit', base.transports().length === 3 && run('Bus 2').status === 'en_route' && rec('family of 4').transport_id === run('Bus 2').id && rec('family of 4').status === 'on_the_way' && has('#panel', 'transports: 1 under way with 4 people in transit, 1 planned, 1 arrived, 0 done'), text('#panel').slice(0, 300));
    check('the seeded log names the run the crew put them on', !!eventText(base, 'Unit 3 sent family of 4 from 112 Pecan Ln to High school gym on Bus 2, needs pets') && !!eventText(base, 'Bus 2 left Pecan Park pickup for High school gym with 4 people in 1 record'));

    // ---- the runs on the map (v70): a pill per open run, on the driver's phone or on the route, a dashed line to the destination
    const mark = (label) => $$('#map .tr-mark').find((m) => m.textContent === label) || null;
    const at = (el) => el ? el.closest('.leaflet-marker-icon').style.transform : null;
    const u2mark = () => $$('#map .umark').find((m) => m.querySelector('.ulab').textContent === 'U2') || null;
    check('the three open runs are on the map: a pill and a dashed line each, Bus 2\'s pill on Unit 2\'s phone (its driver, en route), Bus 3\'s on its route (planned), Ambulance 1\'s (arrived); the pill\'s title is the run\'s line', $$('#map .tr-mark').length === 3 && $$('#map .tr-line').length === 3 && !!mark('Bus 2') && mark('Bus 2').classList.contains('veh') && mark('Bus 2').classList.contains('st-en_route') && at(mark('Bus 2')) === at(u2mark()) && !!mark('Bus 3') && mark('Bus 3').classList.contains('route') && mark('Bus 3').classList.contains('st-planned') && !!mark('Ambulance 1') && mark('Ambulance 1').classList.contains('st-arrived') && /^bus 2 · pecan park pickup → high school gym · left \d\d:\d\d · expected \d\d:\d\d · 4 of 40 · unit 2's phone \d\d:\d\d$/.test(mark('Bus 2').title.toLowerCase()), $$('#map .tr-mark').map((m) => m.className + ' ' + m.textContent).join(' | ') + ' · ' + (mark('Bus 2') ? mark('Bus 2').title : ''));
    // ---- what shares a point (v75): the pill clear of the heading arrow, the rings on one shelter one inside the next
    const dotY = () => { const r = u2mark().querySelector('.udot').getBoundingClientRect(); return r.top + r.height / 2; };
    const tailTip = (el) => el.getBoundingClientRect().bottom + 7;   // the tail's point, 7 px under the pill (base.css)
    check('the pill sits in a column clear of the phone\'s heading arrow: its tail stops short of the arrow\'s 17 px reach (v75)', mark('Bus 2').parentElement.classList.contains('tr-stack') && mark('Bus 2').parentElement.classList.contains('veh') && dotY() - tailTip(mark('Bus 2')) > 17, (dotY() - tailTip(mark('Bus 2'))).toFixed(1) + ' px between the tail and the dot');
    const endsAt = (cls, attr) => { const by = {}; for (const p of $$('#map path.' + cls)) { const m = /^M([-\d.]+),([-\d.]+)a([\d.]+),/.exec(p.getAttribute('d') || ''); if (!m) continue; const r = +m[3], k = Math.round(+m[1] + r) + ',' + Math.round(+m[2]); (by[k] = by[k] || []).push(r + ':' + p.getAttribute(attr)); } return Object.values(by).map((l) => l.sort().join('/')).sort().join(' '); };
    check('two runs to the gym are two rings on its mark, one inside the next: Bus 2 (under way, blue) 15 px inside, Bus 3 (planned, grey) 19 px outside; the hospital has Ambulance 1\'s alone', endsAt('tr-ring', 'stroke') === '15:#2E8B57 15:#2F6FB3/19:#8F8B82', endsAt('tr-ring', 'stroke'));
    const c2 = window.supabase.createClient();
    await mockSignIn(c2, 'unit2@mock.local');
    const boat = new Data(c2); await boat.init(); await boat.open(INC());
    const wasAt = at(mark('Bus 2'));
    await boat.upsertPosition({ lat: 30.2590, lng: -97.7424, heading: 190, accuracy: 5 });
    check('the driver\'s phone reports from further down the road: the pill moves with it', await until(() => mark('Bus 2') && at(mark('Bus 2')) !== wasAt) && at(mark('Bus 2')) === at(u2mark()), wasAt + ' → ' + at(mark('Bus 2')));
    boat.close();
    $('[data-action="replay"]').click();
    await until(() => !$('#replay').hidden && $$('#map .umark.ghost').length === 3, 6000);
    check('while Replay is on, the runs come off the map like the live units', $$('#map .tr-mark').length === 0 && $$('#map .tr-line').length === 0 && $$('#map .umark.ghost').length === 3, $$('#map .tr-mark').length + ' pills, ' + $$('#map .tr-line').length + ' lines');
    $('[data-action="replay-close"]').click();
    check('Close puts them back', await until(() => $('#replay').hidden && $$('#map .tr-mark').length === 3, 6000) && $$('#map .tr-line').length === 3, $$('#map .tr-mark').length + ' pills');
    // ---- the Transport runs box in the Layers panel (v75): off takes every run off this screen; Show on map puts them back
    const runsBox = () => $('#layers-pop [data-action="runs-toggle"]');
    $('#btn-layers').click();
    await until(() => !$('#layers-pop').hidden && runsBox());
    check('the Layers panel has a Transport runs box under the imagery, on, counting the open runs (v75)', !!runsBox() && runsBox().checked && has('#layers-pop', 'transport runs', '3 open') && !$('#legend-run').hidden, text('#layers-pop').slice(0, 300));
    runsBox().click();
    check('off takes every run off this screen: no pills, lines or rings; the legend\'s entry goes; the device remembers', await until(() => $$('#map .tr-mark').length === 0 && $$('#map .tr-line').length === 0 && $$('#map path.tr-ring').length === 0) && $('#legend-run').hidden && localStorage.getItem('ic.map.runs') === 'off', $$('#map .tr-mark').length + ' pills, ' + $$('#map .tr-line').length + ' lines, ' + localStorage.getItem('ic.map.runs'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await until(() => $('#layers-pop').hidden);
    $(`#panel .tr-home [data-action="tr-show"][data-id="${run('Bus 3').id}"]`).click();
    check('Show on map while they are off puts them all back, that run lit, and the box reads on again', await until(() => $$('#map .tr-mark').length === 3 && mark('Bus 3') && mark('Bus 3').classList.contains('lit')) && $$('#map .tr-line').length === 3 && localStorage.getItem('ic.map.runs') === 'on' && !$('#legend-run').hidden && (() => { $('#btn-layers').click(); return true; })() && await until(() => !$('#layers-pop').hidden && runsBox() && runsBox().checked), (runsBox() ? String(runsBox().checked) : 'no box') + ' · ' + localStorage.getItem('ic.map.runs') + ' · ' + $$('#map .tr-mark').length + ' pills');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));   // the panel first
    await until(() => $('#layers-pop').hidden);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));   // then the light
    await until(() => $$('#map .tr-mark.lit').length === 0);
    mark('Bus 3').click();
    check('a pill clicked opens the board on that run', await until(() => !$('#transports').hidden && $(`#transports-page .tr-row[data-id="${run('Bus 3').id}"].open`)), $$('#transports-page .tr-row.open').map((r) => r.dataset.id).join());
    $(`#transports-page .tr-row[data-id="${run('Bus 3').id}"] [data-action="tr-show"]`).click();
    const inView = (el) => { const r = $('#map').getBoundingClientRect(), b = el.getBoundingClientRect(); return b.left >= r.left && b.right <= r.right && b.top >= r.top && b.bottom <= r.bottom; };
    check('Show on map on the board\'s row closes the board, lights the run and brings it into view', await until(() => $('#transports').hidden && mark('Bus 3') && mark('Bus 3').classList.contains('lit')) && $$('#map .tr-mark.lit').length === 1 && $$('#map .tr-line.lit').length === 1 && inView(mark('Bus 3')), mark('Bus 3') && mark('Bus 3').className);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    check('Escape puts the light out; the home panel\'s runs have Show on map too, and it lights Bus 2', await until(() => $$('#map .tr-mark.lit').length === 0) && $$('#panel .tr-home [data-action="tr-show"]').length === 3 && (() => { $(`#panel .tr-home [data-action="tr-show"][data-id="${run('Bus 2').id}"]`).click(); return true; })() && await until(() => mark('Bus 2') && mark('Bus 2').classList.contains('lit')), $$('#panel .tr-home [data-action="tr-show"]').length + ' buttons');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await until(() => $$('#map .tr-mark.lit').length === 0);

    // ---- the board from the header
    $('.top-btns [data-action="transports"]').click();
    await until(() => !$('#transports').hidden && $$('#transports-page .tr-row').length === 3);
    check('Transports on the header opens the board: a row per run, under way first, then planned, then arrived', $$('#transports-page .tr-row .tr-run strong').map((e) => e.textContent).join('|') === 'Bus 2|Bus 3|Ambulance 1' && has('#transports-page .tr-row', 'pecan park pickup → high school gym', '4 of 40', 'en route') && $('#transports-page .tr-row [data-action="tr-step"]').textContent === 'Arrived', $$('#transports-page .tr-row').map((r) => r.innerText.replace(/\s+/g, ' ').slice(0, 80)).join(' | '));
    $('#transports-page [data-action="tr-add-toggle"]').click();
    const f = await until(() => $('#transports-page form[data-form="transport-add"]'));
    check('New run opens the form with the label focused and the shelter as the destination', !!f && await until(() => document.activeElement === f.label, 1500) && f.to.value === gym && [...f.kind.options].map((o) => o.textContent).join('|') === 'Bus|Van|Ambulance|Boat run|High-water vehicle|Transport', f && f.to.value);
    const hm = (ms) => { const d = new Date(Date.now() + ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };   // three hours on: after the seeded Bus 3, whatever the clock says
    const leaves = hm(3 * 3600000), expected = hm(3 * 3600000 + 20 * 60000);
    f.kind.value = 'van'; f.label.value = 'Van 4'; f.capacity.value = '12'; f.from.value = 'z:' + a2; f.to.value = gym; f.leaves.value = leaves; f.expected.value = expected; f.driver.value = USERS().unit2; f.notes.value = 'wheelchair lift';
    f.requestSubmit();
    const van = await until(() => run('Van 4'));
    check('Save the run makes it: planned, from A-2, to the gym, 12 seats, Unit 2 driving, and the log says so', !!van && van.status === 'planned' && van.from_zone_id === a2 && van.to_facility_id === gym && van.capacity === 12 && van.driver_user_id === USERS().unit2 && van.notes === 'wheelchair lift' && !!van.leaves_at && await until(() => eventText(base, 'Van 4 planned by Operations: A-2 Pecan Mobile Home Park to High school gym, 12 seats, driver Unit 2')), logTexts()[0]);
    check('the new run\'s row is open with nobody on it yet, in its place among the planned', await until(() => $(`#transports-page .tr-row[data-id="${van.id}"].open`)) && has(`#transports-page .tr-row[data-id="${van.id}"]`, 'nobody on it yet', 'leaves ' + leaves + ' · expected ' + expected) && $$('#transports-page .tr-row .tr-run strong').map((e) => e.textContent).join('|') === 'Bus 2|Bus 3|Van 4|Ambulance 1', $$('#transports-page .tr-row .tr-run strong').map((e) => e.textContent).join('|'));
    $(`#transports-page .tr-row[data-id="${van.id}"] [data-action="tr-step"]`).click();
    check('Loading is one press: the status, the stamp, the log line and the row moving up with the runs under way', await until(() => run('Van 4').status === 'loading') && await until(() => eventText(base, 'Van 4 loading at A-2 Pecan Mobile Home Park for High school gym')) && await until(() => $$('#transports-page .tr-row .tr-run strong').map((e) => e.textContent).join('|') === 'Bus 2|Van 4|Bus 3|Ambulance 1') && $(`#transports-page .tr-row[data-id="${van.id}"] [data-action="tr-step"]`).textContent === 'Leaving', logTexts()[0]);
    const amb = run('Ambulance 1');
    // the ends are SVG paths, and Leaflet gives a circle off the view an empty path (M0 0); Show on map left the view tight
    // on Bus 2 with every pickup outside it, so the board closes and the map zooms out for this one look (one step at a
    // time: a zoom asked during the last one's animation is dropped), then the board comes back for Done
    $('[data-action="close-transports"]').click();
    await until(() => $('#transports').hidden);
    for (let i = 0; i < 3; i++) { $('#map .leaflet-control-zoom-out').click(); await wait(600); }
    check('two runs from A-2 share its pickup: Van 4\'s white dot (loading, first on the board) with Ambulance 1\'s ring around it; Bus 3\'s dot on A-1 alone (v75)', await until(() => endsAt('tr-dot', 'fill') === '5:#fff 5:#fff/8:none', 8000), endsAt('tr-dot', 'fill') + ' · ' + $$('#map path.tr-dot').length + ' dots: ' + $$('#map path.tr-dot').map((d) => (d.getAttribute('d') || '').slice(0, 24)).join(' | '));
    $('.top-btns [data-action="transports"]').click();
    await until(() => !$('#transports').hidden && $$('#transports-page .tr-row').length === 4);
    $(`#transports-page .tr-row[data-id="${amb.id}"] [data-action="tr-step"]`).click();
    check('Done on an arrived run is final, with who rode it in the log', await until(() => run('Ambulance 1').status === 'done') && await until(() => eventText(base, 'Ambulance 1 done at Dell Seton Medical Center, 1 person in 1 record')) && !$(`#transports-page .tr-row[data-id="${amb.id}"] [data-action="tr-step"]`), logTexts()[0]);
    const e1 = await (async () => { try { await base.updateTransport(amb.id, { status: 'en_route' }); return null; } catch (e) { return e; } })();
    check('a done run stays done', !!e1 && /done stays done/.test(e1.message) && run('Ambulance 1').status === 'done', e1 && e1.message);
    check('a done run comes off the map; the new run is on it, its pill on Unit 2\'s phone (it drives this one too)', await until(() => !mark('Ambulance 1') && !!mark('Van 4')) && $$('#map .tr-mark').length === 3 && mark('Van 4').classList.contains('veh') && mark('Van 4').classList.contains('st-loading'), $$('#map .tr-mark').map((m) => m.textContent).join());
    check('two runs on one phone are one column of pills: Bus 2 (first on the board) lowest with the tail, Van 4 above it, each with its own words, the column still clear of the arrow (v75)', mark('Van 4').parentElement === mark('Bus 2').parentElement && mark('Bus 2').parentElement.classList.contains('tr-stack') && mark('Bus 2').parentElement.firstElementChild === mark('Bus 2') && mark('Van 4').getBoundingClientRect().bottom <= mark('Bus 2').getBoundingClientRect().top && $$('#map .tr-stack').length === 2 && /^van 4 · /.test(mark('Van 4').title.toLowerCase()) && dotY() - tailTip(mark('Bus 2')) > 17, $$('#map .tr-stack').map((s) => [...s.children].map((c) => c.textContent).join('+')).join(' | ') + ' · ' + (dotY() - tailTip(mark('Bus 2'))).toFixed(1) + ' px');
    $('[data-action="close-transports"]').click();

    // ---- the gym card: the typed Expected line gave way to the runs coming here; a record is put on a run from its row
    await openFacility(gym);
    check('the gym card lists the runs coming here, the typed Expected line gives way, and each run has its next step', !$('#panel input[name="expected"]') && has('#panel .ev-box.coming', 'coming here · 3 runs', 'bus 2 from pecan park pickup', 'en route', '4 people in 1 record: family of 4', 'van 4 from a-2', 'loading', 'nobody listed on it yet', 'bus 3 from a-1') && has('#panel', 'the runs on the transports board say who is coming') && $$('#panel .ev-box.coming [data-action="tr-step"]').length === 3, text('#panel .ev-box.coming').slice(0, 300));
    // the arriving row's On which run is a row of cards (v66), the same as the phone's, Not on a run first
    const cards = () => $$(`#panel .ev-r[data-ev="${rec('family of 4').id}"] .chips.runs .rcard`);
    const tops = () => cards().map((c) => (c.querySelector('.l1') || c).textContent.trim()).join('|');
    const litRun = () => { const on = cards().filter((c) => c.classList.contains('on')); return on.length === 1 ? on[0].dataset.run : null; };
    check('the family on its way has run cards with Bus 2 lit, offering the runs coming here with their times and seats, no drop-down', tops() === 'Not on a run|Bus 2 → High school gym|Van 4 → High school gym|Bus 3 → High school gym' && litRun() === run('Bus 2').id && /^left \d\d:\d\d · expected \d\d:\d\d · 4 of 40$/.test(cards()[1].querySelector('.l2').textContent) && !$('#panel [data-select="ev-transport"]') && $(`#panel .ev-r[data-ev="${rec('family of 4').id}"]`).classList.contains('runs'), tops());
    cards().find((c) => c.dataset.run === run('Bus 3').id).click();
    check('moving them to Bus 3 is one line in the log, the record still on its way to the gym', await until(() => rec('family of 4').transport_id === run('Bus 3').id) && rec('family of 4').status === 'on_the_way' && rec('family of 4').facility_id === gym && await until(() => eventText(base, 'Operations put family of 4 from 112 Pecan Ln on Bus 3 to High school gym')), logTexts()[0]);
    await until(() => litRun() === run('Bus 3').id);
    cards().find((c) => c.dataset.run === run('Bus 2').id).click();
    await until(() => rec('family of 4').transport_id === run('Bus 2').id);
    check('and back on Bus 2 for the desk', rec('family of 4').transport_id === run('Bus 2').id && await until(() => eventText(base, 'Operations put family of 4 from 112 Pecan Ln on Bus 2 to High school gym')), logTexts()[0]);

    // ---- a crew's house record (Unit 3's phone): On which run, its own division's run first
    P = await phoneFrame();
    check('the field app opens at 375 px as Unit 3, with no run card (it drives nothing)', !!P.ready && !P.$('#myrun .run-card'));
    await P.act('briefed');
    await P.act('addr-clear');
    P.$('#structure-label').value = '116 Pecan Ln';
    await P.act('help-up');
    const rowCards = () => P.$$('#st-people .st-row .chips.runs .rcard');
    const rowTops = () => rowCards().map((c) => (c.querySelector('.l1') || c).textContent.trim()).join('|');
    const litIn = (sel) => { const on = P.$$('#st-people .st-row ' + sel + ' .on'); return on.length === 1 ? on[0].dataset.v : null; };
    check('the first person counted opens a row with On which run as cards: Not on a run lit, Van 4 (loading from A-2, the crew\'s own division, marked) first, Bus 3 next, Bus 2 (gone) not offered', rowTops() === 'Not on a run|Van 4 → High school gymA-2|Bus 3 → High school gym' && litIn('.chips.runs') === '' && /^loading since \d\d:\d\d · expected \d\d:\d\d · 0 of 12$/.test(rowCards()[1].querySelector('.l2').textContent) && rowCards()[1].querySelector('.own').textContent === 'A-2' && !rowCards()[2].querySelector('.own'), rowTops());
    check('the sheet is whole at 375 px with the run cards', P.sideways().length === 0, P.sideways().join('; '));
    P.$('#st-people [data-stp="who"]').value = 'Patel, family of 2'; P.$('#st-people [data-stp="cond"]').value = 'wet, cold';
    P.$(`#st-people [data-action="st-run"][data-v="${van.id}"]`).click();
    check('a run tapped lights its card and keeps Went to at the gym and the typed words', litIn('.chips.runs') === van.id && litIn('.chips.where') === 'f:' + gym && P.$('#st-people [data-stp="who"]').value === 'Patel, family of 2', litIn('.chips.runs'));
    P.$('#st-people [data-action="st-where"][data-v="f:' + M().ids.facilities[3] + '"]').click();
    check('Dell Seton tapped takes them off Van 4, which does not go there, says so, and no run row shows since no open run goes to the hospital', litIn('.chips.where') === 'f:' + M().ids.facilities[3] && !P.$('#st-people .chips.runs') && /van 4 does not go there: off the run/.test(P.text('#toast')), P.text('#toast'));
    P.$('#st-people [data-action="st-where"][data-v="f:' + gym + '"]').click();
    check('the gym tapped again brings the cards back with Not on a run lit', rowTops() === 'Not on a run|Van 4 → High school gymA-2|Bus 3 → High school gym' && litIn('.chips.runs') === '', rowTops());
    P.$(`#st-people [data-action="st-run"][data-v="${van.id}"]`).click();
    await P.act('save-structure');
    const patel = await until(() => rec('Patel, family of 2'), 70000);
    check('saved, the record is on Van 4 and on its way to the gym, and the log names the run', !!patel && patel.transport_id === van.id && patel.status === 'on_the_way' && patel.facility_id === gym && patel.count === 2 && await until(() => eventText(base, 'Unit 3 sent Patel, family of 2 from 116 Pecan Ln to High school gym on Van 4'), 10000), logTexts()[0]);
    check('the phone said how many went on a run', /1 record of who went where, 1 on a run/.test(P.text('#toast')), P.text('#toast'));

    // ---- a driver who is a unit: the run card on the home screen, one button per step
    await base.updateTransport(van.id, { driver_user_id: USERS().unit3 });
    check('made Van 4\'s driver, Unit 3\'s phone shows the run card: You are Van 4, the route, who is aboard, Leaving', await until(() => P.$('#myrun .run-card'), 30000) && /you are van 4 · loading/.test(P.text('#myrun')) && /a-2 pecan mobile home park → high school gym/.test(P.text('#myrun')) && /2 of 12 aboard · patel, family of 2/.test(P.text('#myrun')) && P.$('#myrun [data-action="my-run-step"]').textContent === 'Leaving', P.text('#myrun'));
    check('the home screen is whole at 375 px with the card', P.sideways().length === 0, P.sideways().join('; '));
    P.$('#myrun [data-action="my-run-step"]').click();
    check('Leaving on the phone sends the step: en route, left_at stamped, the log counts who left on it, the button is Arrived', await until(() => run('Van 4').status === 'en_route', 70000) && !!run('Van 4').left_at && await until(() => eventText(base, 'Van 4 left A-2 Pecan Mobile Home Park for High school gym with 2 people in 1 record'), 10000) && await until(() => P.$('#myrun [data-action="my-run-step"]') && P.$('#myrun [data-action="my-run-step"]').textContent === 'Arrived', 10000), logTexts()[0]);

    // ---- the shelter desk: Arriving by run, They're here for the whole bus
    await P.act('menu');
    await P.act('sign-out');
    await until(() => P.shown('#auth'));
    await phoneSignIn(P, 'tr-desk@mock.local', true);
    await until(() => P.shown('#s-identify'));
    P.$('#id-name').value = 'Sam Lee'; P.$('#id-phone').value = '512 555 0198';
    await P.act('id-save');
    await P.act('jp-kind', { kind: 'shelter_desk' });
    const jf = P.$('#join-form');
    jf.code.value = 'CEDAR7'; jf.unit.value = 'Gym desk'; jf.agency.value = 'Red Cross';
    jf.requestSubmit();
    await until(() => P.shown('#app') && P.$('#me-name').textContent === 'Gym desk', 8000);
    await until(() => P.shown('#s-briefing'), 8000);
    await P.act('briefed');
    check('her home says the runs coming, not the typed line, and Arriving is by run: Bus 2 with the family of 4, Van 4 with the Patels, Bus 3 with nobody listed yet', await until(() => P.shown('#desk') && P.$$('#desk-arriving .arrive-run').length === 3, 10000) && /3 runs coming/.test(P.text('#desk-head')) && !/expected: bus 2 from pecan park/.test(P.text('#desk-head')) && /bus 2 from pecan park pickup en route 4 people in 1 record/.test(P.text('#desk-arriving')) && /family of 4 · from 112 pecan ln · pets/.test(P.text('#desk-arriving')) && /van 4 from a-2 pecan mobile home park en route 2 people in 1 record/.test(P.text('#desk-arriving')) && /bus 3 from a-1 riverside drive, east planned/.test(P.text('#desk-arriving')) && /nobody listed on it yet/.test(P.text('#desk-arriving')), P.text('#desk-arriving').slice(0, 400));
    check('each run with people has They\'re here for all of them, and Here per family', P.$$('#desk-arriving [data-action="ev-run-arrived"]').length === 2 && P.$$('#desk-arriving [data-action="ev-arrived"]').length === 2 && /they're here, all 4/.test(P.text('#desk-arriving')), P.text('#desk-arriving').slice(0, 300));
    check('People here at 375 px: nothing sideways', P.sideways().length === 0, P.sideways().join('; '));
    const desk = base.units().find((u) => u.unit_name === 'Gym desk');
    P.$$('#desk-arriving .arrive-run').find((r) => /bus 2/i.test(r.textContent)).querySelector('[data-action="ev-run-arrived"]').click();
    check('They\'re here, all 4: the family is signed in by the desk, Bus 2 is arrived, both in the log', await until(() => rec('family of 4').status === 'here' && rec('family of 4').signed_in_by === desk.user_id, 70000) && await until(() => run('Bus 2').status === 'arrived', 70000) && !!run('Bus 2').arrived_at && await until(() => eventText(base, 'Bus 2 arrived at High school gym with 4 people in 1 record'), 10000) && !!eventText(base, 'High school gym: Gym desk signed in family of 4, from 112 Pecan Ln, needs pets'), logTexts().slice(0, 3).join(' | '));
    check('the record stays on Bus 2 for the history, the count is 13 of 60, and Bus 2 reads all signed in', rec('family of 4').transport_id === run('Bus 2').id && await until(() => /13 of 60/.test(P.text('#desk-head')), 10000) && await until(() => /bus 2 from pecan park pickup arrived/.test(P.text('#desk-arriving')) && /all 4 signed in/.test(P.text('#desk-arriving')), 10000), P.text('#desk-head') + ' | ' + P.text('#desk-arriving').slice(0, 200));
    check('the toast counted the bus', /bus 2 signed in: 4 people in 1 record/.test(P.text('#toast')), P.text('#toast'));

    // ---- the base again: who is on it, take off, withdraw, the reports
    $('.top-btns [data-action="transports"]').click();
    await until(() => !$('#transports').hidden && $(`#transports-page .tr-row[data-id="${van.id}"]`));
    if (!$(`#transports-page .tr-row[data-id="${van.id}"].open`)) $(`#transports-page .tr-row[data-id="${van.id}"] [data-action="tr-open"]`).click();
    await until(() => $(`#transports-page .tr-row[data-id="${van.id}"] .tr-on`));
    check('Who is on it lists the Patels with where they are and Take off', has(`#transports-page .tr-row[data-id="${van.id}"] .tr-on`, 'patel, family of 2', 'from 116 pecan ln', 'on the way to high school gym') && !!$(`#transports-page .tr-row[data-id="${van.id}"] [data-action="tr-take-off"]`), text(`#transports-page .tr-row[data-id="${van.id}"] .tr-on`));
    $(`#transports-page .tr-row[data-id="${van.id}"] [data-action="tr-take-off"]`).click();
    check('Take off leaves the record where it says and logs it', await until(() => rec('Patel, family of 2').transport_id === null) && rec('Patel, family of 2').status === 'on_the_way' && await until(() => eventText(base, 'Patel, family of 2 taken off Van 4 by Operations')), logTexts()[0]);
    const bus3 = run('Bus 3');
    $(`#transports-page .tr-row[data-id="${bus3.id}"] [data-action="tr-edit"]`).click();
    await until(() => $('#transports-page form[data-form="transport-edit"]'));
    check('Edit opens the form filled in, with Withdraw', $('#transports-page form[data-form="transport-edit"]').label.value === 'Bus 3' && $('#transports-page form[data-form="transport-edit"]').from.value === 'z:' + ZONE('A-1') && !!$('#transports-page [data-action="tr-withdraw"]'));
    $('#transports-page [data-action="tr-withdraw"]').click();
    check('Withdraw archives the run, logs it, and folds it under withdrawn; nothing is deleted', await until(() => run('Bus 3').archived_at) && await until(() => eventText(base, 'Bus 3 withdrawn by Operations')) && await until(() => has('#transports-page', '1 withdrawn')) && !$(`#transports-page .tr-row[data-id="${bus3.id}"]`) && M().tables.ic_transports.some((t) => t.id === bus3.id), logTexts()[0]);
    $('#transports-page [data-action="tr-gone-toggle"]').click();
    await until(() => $(`#transports-page .tr-row[data-id="${bus3.id}"].gone`));
    $(`#transports-page .tr-row[data-id="${bus3.id}"] [data-action="tr-restore"]`).click();
    check('Put back brings it back', await until(() => !run('Bus 3').archived_at) && await until(() => eventText(base, 'Bus 3 put back by Operations')), logTexts()[0]);
    $('[data-action="close-transports"]').click();
    $('[data-action="sitrep"]').click();
    await until(() => !$('#briefing').hidden && has('#briefing-page', 'incident status summary'));
    check('the situation report counts the runs and the people in transit', has('#briefing-page', 'transports: 1 under way with 0 people in transit, 1 planned, 1 arrived, 1 done'), (text('#briefing-page').match(/transports: [^·]*/) || [])[0]);
    $('#briefing [data-action="close-briefing"]').click();
    check('the log line for a run opens the board', (() => { const row = $$('#log .log-row').find((r) => /van 4 left/i.test(r.textContent)); return !!row && !!row.querySelector('[data-action="transports"]'); })());
  } finally {
    autoConfirm(false);
    if (P) P.frame.remove();
    for (const k of Object.keys(localStorage)) if (/^ic\.field\./.test(k)) localStorage.removeItem(k);
    if (!$('#transports').hidden) $('[data-action="close-transports"]').click();
    if (!$('#briefing').hidden) $('#briefing [data-action="close-briefing"]').click();
    await wait(100);
  }
}

// ---- people and tags, phase 1 (v55): bands printed from the base, given by scanning (or typing the number) on the
// phone, scans as last seen on the board, the PAR by scan, check-in with a band number, the band link, the desk's
// sign-in by band, voiding, the 211.
async function tags(check) {
  autoConfirm(true);
  for (const k of Object.keys(localStorage)) if (/^ic\.field\./.test(k)) localStorage.removeItem(k);
  let P = null;
  const PPL = M().ids.people;
  const tagN = (n) => base.tags(true).find((t) => t.number === n) || null;
  const row = (id) => $(`#people-page .pp-line[data-person="${id}"]`);
  const openBoard = async () => { if ($('#people').hidden) $('.top-btns [data-action="people"]').click(); await until(() => !$('#people').hidden && $$('#people-page .pp-line').length >= 6); };
  const closeBoard = () => { if (!$('#people').hidden) $('[data-action="close-people"]').click(); };
  try {
    check('seeded: 24 bands, four on Unit 1 and Unit 2 with their scans, Unit 3 without', base.tags(true).length === 24 && base.tags(true).filter((t) => t.person_id).length === 4 && base.seen().length === 7 && !base.tags(true).some((t) => t.person_id === PPL[4]), base.tags(true).length + ' bands, ' + base.seen().length + ' scans');
    await openBoard();
    check('the board reads each band and its last scan: Ramirez entering A-1, Patel at the gym long ago in orange, Hale with no band', has(`#people-page .pp-line[data-person="${PPL[0]}"] .pp-seen`, 'band 001 · entering a-1') && row(PPL[3]).querySelector('.pp-seen').classList.contains('stale') && has(`#people-page .pp-line[data-person="${PPL[3]}"] .pp-seen`, 'band 004 · at high school gym', 'ago') && has(`#people-page .pp-line[data-person="${PPL[4]}"] .pp-seen`, 'no band'), text(`#people-page .pp-line[data-person="${PPL[3]}"] .pp-seen`));
    $('#people .briefing-bar [data-action="print-bands"]').click();
    await until(() => base.tags(true).length === 48 && !$('#briefing').hidden && has('#briefing-title', 'bands to print'));
    check('Print bands makes 24 more, numbered on, and shows the sheet: a QR and a number per band, no name on any, logged', base.tags(true).length === 48 && !!tagN(25) && !!tagN(48) && $$('#briefing-page .band').length === 24 && has('#briefing-page .band', 'band 025') && !/ramirez|okafor|nguyen|patel/i.test(text('#briefing-page .band-sheet')) && await until(() => eventText(base, '24 bands printed, 025 to 048')), text('#briefing-page').slice(0, 200));
    const svg = $('#briefing-page .band .band-qr svg').outerHTML;
    if (!window.jsQR) await new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = '/vendor/jsQR-1.4.0.js'; sc.onload = res; sc.onerror = rej; document.head.appendChild(sc); });
    const img = new Image();
    const sized = (svg.includes('xmlns=') ? svg : svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')).replace('<svg ', '<svg width="320" height="320" ');
    const objUrl = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }));
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = objUrl; });
    const c = document.createElement('canvas'); c.width = 360; c.height = 360;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 360, 360); g.drawImage(img, 20, 20, 320, 320);
    const read = window.jsQR(g.getImageData(0, 0, 360, 360).data, 360, 360);
    URL.revokeObjectURL(objUrl);
    const { bandFromScan } = await import('../js/shared/rules.js');
    check('the phone\'s decoder reads the band link out of the sheet\'s QR, and the link means the band', !!read && read.data === location.origin + '/field/?band=' + tagN(25).code && bandFromScan(read ? read.data : '').code === tagN(25).code, read && read.data);
    $('[data-action="close-briefing"]').click(); await until(() => $('#briefing').hidden);
    closeBoard();

    // ---- Unit 3's phone: give a band by typing its number (the pane has no camera), then a scan in the division
    P = await phoneFrame();
    check('the field app opens at 375 px as Unit 3', !!P.ready);
    await P.act('briefed');
    await P.act('scan-band');
    await until(() => P.shown('#s-scan') && P.shown('#scan-typed'), 5000);
    check('Scan a band opens the camera sheet with the typed box under it; with no camera it says to type the number', P.shown('#scan-typed') && await until(() => /type the band's number below/.test(P.text('#scan-msg')), 5000), P.text('#scan-msg'));
    P.$('#scan-type').value = '99'; await P.act('scan-typed');
    check('a number no band has is refused', /no band 099 on this incident/.test(P.text('#scan-msg')), P.text('#scan-msg'));
    P.$('#scan-type').value = 'XYZ-001-ABCD'; await P.act('scan-typed');
    check('a code from another incident is refused', /not from this incident/.test(P.text('#scan-msg')), P.text('#scan-msg'));
    P.$('#scan-type').value = '25'; await P.act('scan-typed');
    await until(() => P.shown('#s-band'), 5000);
    check('band 025 opens the band sheet: not on anyone yet, whose band is this, Hale and Dominguez to pick, and Me (the lead\'s own account, v69)', /band 025 · not on anyone yet/.test(P.text('#band-title')) && P.$$('#band-who .chip').map((c) => c.textContent).join('|') === 'Hale|Dominguez|Me · Jordan Lee Hale' && P.$('#band-save').disabled, P.text('#band-title') + ' | ' + P.text('#band-who'));
    check('the band sheet is whole at 375 px', P.sideways().length === 0, P.sideways().join('; '));
    P.$$('#band-who .chip').find((x) => x.textContent === 'Hale').click();
    check('Hale picked: Save says so', P.$('#band-save').textContent === 'Give Band 025 to Hale' && !P.$('#band-save').disabled, P.$('#band-save').textContent);
    await P.act('band-save');
    check('saved: band 025 is Hale\'s, the scan is his check-in, both in the log', await until(() => tagN(25).person_id === PPL[4] && tagN(25).kind === 'responder', 70000) && await until(() => eventText(base, 'Band 025 given to Hale (Unit 3) by Unit 3') && eventText(base, 'Hale seen checking in with Unit 3'), 10000), logTexts().slice(0, 2).join(' | '));
    await openBoard();
    check('the board reads it', await until(() => has(`#people-page .pp-line[data-person="${PPL[4]}"] .pp-seen`, 'band 025 · checking in'), 10000), text(`#people-page .pp-line[data-person="${PPL[4]}"] .pp-seen`));
    closeBoard();
    await P.act('scan-band'); await until(() => P.shown('#s-scan'), 5000);
    P.$('#scan-type').value = '025'; await P.act('scan-typed');
    await until(() => P.shown('#s-band') && /hale/i.test(P.text('#band-title')), 5000);
    check('scanned again, the sheet names him with his last scan and preselects Entering A-2, the division Unit 3 is in', /band 025 · hale \(unit 3\)/.test(P.text('#band-title')) && /seen checking in \d\d:\d\d by unit 3/.test(P.text('#band-sub')) && !!P.$('#band-what .chip.on') && P.$('#band-what .chip.on').textContent === 'Entering A-2' && /^Save: Hale entering A-2, \d\d:\d\d$/.test(P.$('#band-save').textContent), P.text('#band-what') + ' | ' + P.$('#band-save').textContent);
    await P.act('band-save');
    check('the scan is a line, and the board\'s last seen follows', await until(() => eventText(base, 'Hale (Unit 3) seen entering A-2, by Unit 3'), 70000) && await (async () => { await openBoard(); return until(() => has(`#people-page .pp-line[data-person="${PPL[4]}"] .pp-seen`, 'band 025 · entering a-2'), 10000); })(), logTexts()[0]);
    closeBoard();

    // ---- the PAR by scan
    const par = await base.startPar('all');
    await until(() => P.shown('#s-safety') && P.$('#s-safety [data-action="par-scan"]'), 30000);
    check('the PAR card offers Scan them in · 0 of 1 (Hale has a band, Dominguez not) beside All accounted for', P.$('#s-safety [data-action="par-scan"]').textContent === 'Scan them in · 0 of 1' && /all 2 accounted for/.test(P.text('#s-safety')), P.text('#s-safety').slice(0, 300));
    P.$('#s-safety [data-action="par-scan"]').click();
    await until(() => P.shown('#s-scan'), 5000);
    P.$('#scan-type').value = '25'; await P.act('scan-typed');
    check('Hale\'s band scanned in: marked scanned on the card, the button counts 1 of 1, and the scan is on record', await until(() => /hale scanned \d\d:\d\d/.test(P.text('#s-safety')), 5000) && P.$('#s-safety [data-action="par-scan"]').textContent === 'Scan them in · 1 of 1' && await until(() => eventText(base, 'Hale (Unit 3) seen on the PAR, by Unit 3'), 70000), P.text('#s-safety').slice(0, 300));
    P.$('#s-safety [data-action="par-ok"]').click();
    check('All accounted for carries the scan: the base\'s panel and the 214 count it', await until(() => base.ack(par.id, USERS().unit3) && base.ack(par.id, USERS().unit3).scanned === 1, 70000) && await until(() => eventText(base, 'Unit 3: All accounted for (2, 1 scanned)'), 10000) && await until(() => has('#panel', 'all accounted for (2) · 1 scanned'), 10000), logTexts()[0]);

    // ---- check-in with the band's number on the person's row
    await P.act('menu'); await P.act('sign-out'); await until(() => P.shown('#auth'));
    await phoneSignIn(P, 'tags-crew@mock.local', true);
    await until(() => P.shown('#s-identify'));
    P.$('#id-name').value = 'Jo Vela'; P.$('#id-phone').value = '512 555 0177';
    await P.act('id-save');
    const jf = P.$('#join-form');
    jf.code.value = 'CEDAR7'; jf.unit.value = 'Unit 9'; jf.agency.value = 'Travis County Rescue';
    await P.act('jp-add');
    check('the check-in row has a Band № box beside the name', !!P.$('#join-people [data-jp="band"]') && P.$('#join-people [data-jp="band"]').placeholder === 'Band №' && P.sideways().length === 0, P.sideways().join('; '));
    P.$('#join-people [data-jp="name"]').value = 'Vela'; P.$('#join-people [data-jp="band"]').value = '26';
    jf.count.value = '3'; jf.count.dispatchEvent(new Event('input', { bubbles: true }));   // three with me, one named (v57)
    jf.requestSubmit();
    check('checked in with band 26 typed: the band is Vela\'s, the scan is the check-in, both lines in the log', await until(() => base.members().some((m) => m.unit_name === 'Unit 9'), 70000) && await until(() => tagN(26).person_id && base.person(tagN(26).person_id) && base.person(tagN(26).person_id).name === 'Vela', 10000) && await until(() => eventText(base, 'Band 026 given to Vela (Unit 9) by Unit 9') && eventText(base, 'Vela seen checking in with Unit 9'), 10000), logTexts().slice(0, 3).join(' | '));
    const u9 = () => base.members().find((m) => m.unit_name === 'Unit 9');
    check('a band on a name keeps the head count: three with me and one named is three, two unnamed, and the line says three (v57)', await until(() => u9() && u9().crew_count === 3 && u9().unnamed_count === 2, 10000) && base.events().some((e) => /^Unit 9 checked in as Jo Vela, .* with 3 people$/.test(e.text)), JSON.stringify(u9() && [u9().crew_count, u9().unnamed_count]) + ' | ' + ((base.events().find((e) => e.text.startsWith('Unit 9 checked in')) || {}).text || ''));
    await until(() => P.shown('#s-briefing'), 8000); await P.act('briefed');

    // ---- the band link: any reader opens the field app with the band
    P.frame.remove(); P = null;
    P = await phoneFrame('&band=' + tagN(26).code);
    check('a band link opens the band once the incident is open: Vela (Unit 9), with what the scan means', !!P.ready && await until(() => P.shown('#s-band') && /band 026 · vela \(unit 9\)/.test(P.text('#band-title')), 15000), P.text('#band-title'));
    await P.act('band-cancel');

    // ---- the band door (v62): the same link on a phone that is signed out says the band is waiting, and the scan goes through once the incident is open
    P.frame.remove(); P = null;
    P = await phoneFrame('&nobody&band=' + tagN(26).code, { signedOut: true });
    check('a band link on a signed-out phone: the sign-in screen says Band 026 is waiting and what a band is, in place of the plain lead (v62)', !!P.ready && P.shown('#auth-band') && /^band 026 is waiting\. sign in and the scan goes through\./.test(P.text('#auth-band')) && /identifies a person to the incident's team only/.test(P.text('#auth-band')) && /hand it back to them/.test(P.text('#auth-band')) && !P.shown('#auth-lead') && !P.shown('#auth-code'), P.text('#auth-band'));
    check('the door is whole at 375 px', P.sideways().length === 0, P.sideways().join('; '));
    await phoneSignIn(P, 'unit3@mock.local', false);
    await until(() => P.$('#join-list [data-action="open-incident"]'), 8000);
    P.$('#join-list [data-action="open-incident"]').click();
    check('signed in and the incident opened, the band sheet opens as from a link on a signed-in phone', await until(() => P.shown('#s-band') && /band 026 · vela \(unit 9\)/.test(P.text('#band-title')), 15000) && !P.shown('#auth'), P.text('#band-title'));
    await P.act('band-cancel');

    // ---- the desk: a walk-up gets a band from the box; her band scanned again brings her record up
    await P.act('menu'); await P.act('sign-out'); await until(() => P.shown('#auth'));
    check('signed out again with the band used, the door is the plain one', P.shown('#auth-lead') && !P.shown('#auth-band'), P.text('#auth'));
    await phoneSignIn(P, 'tags-desk@mock.local', true);
    await until(() => P.shown('#s-identify'));
    P.$('#id-name').value = 'Sam Lee'; P.$('#id-phone').value = '512 555 0198';
    await P.act('id-save');
    await P.act('jp-kind', { kind: 'shelter_desk' });
    const jf2 = P.$('#join-form'); jf2.code.value = 'CEDAR7'; jf2.unit.value = 'Gym desk'; jf2.agency.value = 'Red Cross'; jf2.requestSubmit();
    await until(() => P.shown('#app') && P.$('#me-name').textContent === 'Gym desk', 8000);
    await until(() => P.shown('#s-briefing'), 8000); await P.act('briefed');
    await until(() => P.shown('#desk'), 8000);
    await P.act('ev-new'); await until(() => P.shown('#s-person'), 5000);
    check('Sign in a person offers Scan a band', P.shown('#ev-band-btn') && /no band yet/.test(P.text('#ev-band-line')), P.text('#ev-band-line'));
    await P.act('scan-band-desk'); await until(() => P.shown('#s-scan'), 5000);
    P.$('#scan-type').value = '27'; await P.act('scan-typed');
    check('a band from the box scanned: the sheet says it goes on this record when saved', await until(() => /band 027 · scanned \d\d:\d\d/.test(P.text('#ev-band-line')), 5000) && !P.shown('#s-scan') && P.shown('#s-person'), P.text('#ev-band-line'));
    P.$('#ev-who').value = 'Lopez, Ana';
    await P.act('ev-save');
    check('signed in with the band: the record has band 027 and the scan at the gym is a line', await until(() => { const e = base.evacuees().find((x) => x.label === 'Lopez, Ana'); return !!e && tagN(27).evacuee_id === e.id && tagN(27).kind === 'evacuee'; }, 70000) && await until(() => eventText(base, 'Band 027 given to Lopez, Ana by Gym desk') && eventText(base, 'Lopez, Ana seen at High school gym, by Gym desk'), 10000), logTexts().slice(0, 3).join(' | '));
    await P.act('ev-new'); await until(() => P.shown('#s-person'), 5000);
    await P.act('scan-band-desk'); await until(() => P.shown('#s-scan'), 5000);
    P.$('#scan-type').value = '27'; await P.act('scan-typed');
    check('her band scanned at the desk again brings her record up, with the band on it', await until(() => P.shown('#s-person') && /lopez, ana/i.test(P.text('#person-title')), 5000) && /band 027 on this record/.test(P.text('#ev-band-line')) && P.$('#ev-band-btn').hidden, P.text('#person-title') + ' | ' + P.text('#ev-band-line'));
    await P.act('home');
    // ---- the phone's one question (v62): Missing someone on a PAR asks in the app's own dialog; Cancel raises nothing
    const deskId = base.members().find((m) => m.unit_name === 'Gym desk').user_id, alertsBefore = base.alerts().length;
    const parDesk = await base.startPar('all');
    await until(() => P.shown('#s-safety') && P.$(`#s-safety [data-action="par-missing"][data-id="${parDesk.id}"]`), 30000);
    P.$(`#s-safety [data-action="par-missing"][data-id="${parDesk.id}"]`).click();
    check('Missing someone opens the phone\'s own dialog: Report someone missing?, what it does, Cancel and a red Report missing (v62)', await until(() => P.$('#confirm-dialog') && P.$('#confirm-dialog').open, 3000) && P.text('#confirm-title') === 'report someone missing?' && /operations gets an emergency alert with your position/.test(P.text('#confirm-text')) && P.$('#confirm-ok').textContent === 'Report missing' && P.$('#confirm-ok').classList.contains('danger') && P.$('#confirm-cancel').textContent === 'Cancel', P.text('#confirm-title') + ' | ' + P.text('#confirm-text'));
    P.$('#confirm-cancel').click();
    await wait(400);
    check('Cancel closes it: no alert screen, no alert, the PAR still to answer', !P.$('#confirm-dialog').open && !P.shown('#s-helpsent') && base.alerts().length === alertsBefore && !base.ack(parDesk.id, deskId) && !!P.$(`#s-safety [data-action="par-missing"][data-id="${parDesk.id}"]`), String(base.alerts().length));
    P.$(`#s-safety [data-action="par-ok"][data-id="${parDesk.id}"]`).click();
    await until(() => base.ack(parDesk.id, deskId), 70000);

    // ---- the base: the gym card says the band, Void band, the 211
    const bOpen = document.createElement('button'); bOpen.dataset.action = 'select-facility'; bOpen.dataset.id = M().ids.facilities[2]; bOpen.hidden = true; document.body.appendChild(bOpen); bOpen.click(); bOpen.remove();
    check('the gym card\'s row says her band and its last scan', await until(() => has('#panel', 'lopez, ana', 'band 027, seen at high school gym'), 10000), (text('#panel').match(/lopez[^\n]{0,80}/) || [''])[0]);
    await openBoard();
    await until(() => row(PPL[4]));
    row(PPL[4]).click();
    await until(() => $(`#people-page .pp-drawer[data-person="${PPL[4]}"] [data-action="band-void"]`));
    check('the drawer says Void band 025 and that it is never reused', has(`#people-page .pp-drawer[data-person="${PPL[4]}"]`, 'void band 025', 'never reused; kept on record'), text(`#people-page .pp-drawer[data-person="${PPL[4]}"] .pp-dr-acts`));
    $(`#people-page .pp-drawer[data-person="${PPL[4]}"] [data-action="band-void"]`).click();
    check('Void band: voided, logged with who had it, the line says no band', await until(() => tagN(25).voided_at) && await until(() => eventText(base, 'Band 025 (Hale (Unit 3)) voided by Operations')) && await until(() => has(`#people-page .pp-line[data-person="${PPL[4]}"] .pp-seen`, 'no band')), logTexts()[0]);
    $('#people .briefing-bar [data-action="print-211"]').click();
    await until(() => !$('#briefing').hidden && has('#briefing-title', '211'));
    check('the 211 lists each band and its last scan in the Band · last seen column', row211('Ramirez').includes(' 001 · entering a-1 ') && row211('Vela').includes(' 026 · checking in '), row211('Ramirez') + ' | ' + row211('Vela'));
    $('[data-action="close-briefing"]').click();
    closeBoard();
    check('a voided band is refused on the phone', await (async () => { await P.act('menu'); await P.act('scan-band'); await until(() => P.shown('#s-scan'), 5000); P.$('#scan-type').value = '25'; await P.act('scan-typed'); return /band 025 was voided/.test(P.text('#scan-msg')); })(), P.text('#scan-msg'));
    await P.act('scan-cancel');
  } finally {
    autoConfirm(false);
    if (P) P.frame.remove();
    for (const k of Object.keys(localStorage)) if (/^ic\.field\./.test(k)) localStorage.removeItem(k);
    if (!$('#briefing').hidden) $('[data-action="close-briefing"]').click();
    if (!$('#people').hidden) $('[data-action="close-people"]').click();
    await wait(100);
  }
}

// ---- claim a band, submit licences, Operations confirms (v69): the seed's chips and queue; Rosa's phone, signed out with
// a band's link, signs up, claims the band on "Is this your band?", is on the incident at once as Unit 2's crew, types an
// EMT and sees it pending; the base confirms it and refuses Nguyen's boat card with a reason; the chips, the 211, the hover
// card and the 214 follow; a voided band is refused at the door.
async function credentials(check) {
  autoConfirm(true);
  for (const k of Object.keys(localStorage)) if (/^ic\.field\./.test(k)) localStorage.removeItem(k);
  let P = null;
  const PPL = M().ids.people, CR = M().ids.credentials, U = USERS();
  const tagN = (n) => base.tags(true).find((t) => t.number === n) || null;
  const row = (id) => $(`#people-page .pp-line[data-person="${id}"]`);
  const chips = (id) => (row(id) ? [...row(id).querySelectorAll('.pp-quals .badge')].map((b) => b.textContent.trim()) : []);
  const openBoard = async () => { if ($('#people').hidden) $('.top-btns [data-action="people"]').click(); await until(() => !$('#people').hidden); const ptab = $('#people [data-action="people-tab"][data-tab="people"]'); if (ptab && !ptab.classList.contains('on')) ptab.click(); await until(() => $$('#people-page .pp-line').length >= 6); };   // the People tab, whatever the suite before left
  const drawer = async (id) => { const sel = `#people-page .pp-drawer[data-person="${id}"]`; if (!$(sel)) { row(id).click(); await until(() => $(sel)); } return $(sel); };
  const closeBoard = () => { if (!$('#people').hidden) $('[data-action="close-people"]').click(); };
  try {
    check('seeded: Ramirez\'s EMT confirmed, Nguyen\'s boat card pending; the base reads every member\'s, a unit only its own', base.credentials().length === 2 && base.credential(CR[0]).status === 'confirmed' && base.credential(CR[1]).status === 'pending' && base.pendingCredentials().length === 1 && field.credentials().length === 0, base.credentials().length + ' on the base, ' + field.credentials().length + ' on Unit 3');
    check('the home panel has To confirm · 1 with Nguyen\'s boat operator card: a photo thumb, who, the issuer, the expiry, Confirm and Not accepted…', has('#panel', 'to confirm · 1') && has('#panel .cq-row', 'minh nguyen', 'unit 2', 'boat operator', 'texas parks and wildlife', 'expires 2027-11-30') && !!$('#panel .cq-row [data-action="cred-confirm"]') && !!$('#panel .cq-row [data-action="cred-reject"]') && !!$('#panel .cq-row [data-cred-photo]'), text('#panel .cq-row'));
    check('the queue\'s photo loads from a signed link', await until(() => $('#panel .cq-thumb img') && !$('#panel .cq-thumb img').hidden && $('#panel .cq-thumb img').src, 8000), ($('#panel .cq-thumb img') || {}).src);
    await openBoard();
    check('the People board reads the chips: Ramirez "Swift water" (the lead\'s word) and "EMT ✓", Nguyen "Boat · pending", Okafor plain', chips(PPL[0]).join('|') === 'Swift water|EMT ✓' && chips(PPL[2]).join('|') === 'Swift water|Boat · pending' && chips(PPL[1]).join('|') === 'Boat|Paramedic', chips(PPL[0]).join('|') + ' / ' + chips(PPL[2]).join('|'));
    check('a person with their own account on the row says so on the line; the lead\'s word has no such mark', !!row(PPL[0]).querySelector('.pp-own') && !!row(PPL[2]).querySelector('.pp-own') && !row(PPL[1]).querySelector('.pp-own'), text(`#people-page .pp-line[data-person="${PPL[2]}"]`));
    await drawer(PPL[2]);
    check('the drawer carries the Identity row in the Members tab\'s words: Nguyen "ID given, not checked" with Check, and the chips with their states', has(`#people-page .pp-drawer[data-person="${PPL[2]}"] .pp-own-id`, 'own account', 'id given, not checked') && !!$(`#people-page .pp-drawer[data-person="${PPL[2]}"] .pp-own-id [data-action="member-check"]`) && has(`#people-page .pp-drawer[data-person="${PPL[2]}"] .pp-kv`, 'boat · pending'), text(`#people-page .pp-drawer[data-person="${PPL[2]}"] .pp-kv`));
    $('#people-page .pp-drawer [data-action="person-close"]').click();
    await until(() => !$('#people-page .pp-drawer'));
    check('the board carries the queue too', has('#people-page', 'to confirm · 1') && !!$('#people-page .cq-row [data-action="cred-confirm"]'), text('#people-page .cq-row'));
    closeBoard();

    // ---- Rosa's phone: a band's link, signed out; she signs up and the claim sheet opens
    const band = tagN(5);
    P = await phoneFrame('&nobody&band=' + band.code, { signedOut: true });
    Object.assign(P.frame.contentWindow.__mock.geo, { lat: 30.2616, lng: -97.7418, drift: false });   // her phone stands in B-1, Unit 2's division
    check('the door says Band 005 is waiting (v62)', !!P.ready && P.shown('#auth-band') && /^band 005 is waiting/.test(P.text('#auth-band')), P.text('#auth-band'));
    await phoneSignIn(P, 'rosa.alvarez@mock.local', true);
    await until(() => P.shown('#s-claim'), 8000);
    check('signed up, an unissued band opens Is this your band?: Band 005 · not on anyone yet, the incident\'s name, name and phone empty for a new account, the three units and Not on a unit yet', P.shown('#s-claim') && P.text('#claim-title') === 'band 005 · not on anyone yet' && P.text('#claim-sub') === 'cedar fork flooding' && P.$('#claim-name').value === '' && P.$$('#claim-units button').map((b) => b.querySelector('b').textContent).join('|') === 'Unit 1 · engine|Unit 2 · boat crew|Unit 3 · swift-water team|Not on a unit yet' && !P.shown('#s-identify'), P.$$('#claim-units button').map((b) => b.textContent).join('|'));
    check('the claim sheet is whole at 375 px', P.sideways().length === 0, P.sideways().join('; '));
    await P.act('claim-go');
    check('It\'s mine with no name says so', /your name/.test(P.text('#claim-msg')) && P.shown('#s-claim'), P.text('#claim-msg'));
    P.$('#claim-name').value = 'Rosa Alvarez'; P.$('#claim-phone').value = '512 555 0177';
    P.$('#claim-agency').value = 'Travis County Rescue'; P.$('#claim-agency').dispatchEvent(new Event('input', { bubbles: true }));
    check('typing her agency picks its unit, Unit 2, and the button says so', P.$('#claim-units button.on') && /unit 2/i.test(P.$('#claim-units button.on').textContent) && /check in with unit 2/i.test(P.$('#claim-go').textContent), P.$('#claim-go').textContent);
    await P.act('claim-go');
    check('It\'s mine: the incident opens on her phone as Unit 2\'s crew, and Add your licences is first', await until(() => P.shown('#app') && P.$('#me-name').textContent === 'Unit 2', 15000) && await until(() => P.shown('#s-licences'), 8000) && /rosa alvarez · with unit 2/.test(P.text('#me-crew')), P.text('#me-crew'));
    const rosaId = () => (base.members().find((m) => m.rides_with === U.unit2) || {}).user_id;
    check('the base: she is a member riding with Unit 2, on no list of units of its own; Unit 2\'s roster has her, with her account on the row, band 005 on her, the scan is her check-in, Unit 2 is three', await until(() => rosaId(), 10000) && base.units().length === 3 && base.member(rosaId()).unit_name === 'Unit 2' && await until(() => base.people().some((p) => p.name === 'Rosa Alvarez' && p.user_id === U.unit2 && p.claimed_by === rosaId()), 10000) && await until(() => tagN(5).person_id === base.people().find((p) => p.name === 'Rosa Alvarez').id && tagN(5).kind === 'responder', 10000) && base.seen().some((s) => s.tag_id === tagN(5).id && s.kind === 'check_in') && await until(() => base.member(U.unit2).crew_count === 3, 10000), JSON.stringify([base.units().length, base.member(U.unit2).crew_count]));
    check('one 214 line: Rosa Alvarez claimed Band 005 (Unit 2); no line for the band, the scan or the roster underneath', await until(() => eventText(base, 'Rosa Alvarez claimed Band 005 (Unit 2)'), 10000) && !base.events().some((e) => /^Band 005 given|Rosa Alvarez seen checking in|Rosa Alvarez checked in with/.test(e.text)), logTexts().slice(0, 3).join(' | '));
    check('the units section still lists three units, Unit 2 once, with three people', has('#panel', 'unit 2') && $$('#panel [data-action="select-unit"]').length === 3 && await until(() => has(`#panel [data-action="select-unit"][data-id="${U.unit2}"]`, 'rosa alvarez'), 10000), text(`#panel [data-action="select-unit"][data-id="${U.unit2}"]`));
    // ---- Add your licences: the ID row opens Identify yourself; an EMT typed is pending at once
    check('the sheet lists the fixed kinds, the driver\'s licence first as the ID with Add your ID, Camera and Type on the rest, Other with Type alone', P.$$('#licences-list .cred-row').length === 10 && P.$('#licences-list .cred-row[data-kind="licence"] [data-action="id-open"]') && P.$('#licences-list .cred-row[data-kind="emt"] [data-action="lic-cam"]') && P.$('#licences-list .cred-row[data-kind="emt"] [data-action="lic-type"]') && !P.$('#licences-list .cred-row[data-kind="other"] [data-action="lic-cam"]') && P.$('#licences-ok').textContent === 'Done', P.$$('#licences-list .cred-row .nm').map((e) => e.textContent.trim()).join('|'));
    check('the licences sheet is whole at 375 px', P.sideways().length === 0, P.sideways().join('; '));
    P.$('#licences-list .cred-row[data-kind="emt"] [data-action="lic-type"]').click();
    await until(() => P.$('#lic-number'), 3000);
    P.$('#lic-number').value = 'emt-204471'; P.$('#lic-issuer').value = 'Texas DSHS'; P.$('#lic-expires').value = '2028-01-31';
    await P.act('lic-add', { kind: 'emt' });
    check('Add: the EMT reads pending at once with its words, and Done counts it', await until(() => P.$('#licences-list .cred-row[data-kind="emt"] .st.pending'), 3000) && /typed emt-204471 · texas dshs · expires 2028-01-31 · pending · sent \d\d:\d\d/.test(P.text('#licences-list .cred-row[data-kind="emt"]')) && P.$('#licences-ok').textContent === 'Done · 1 pending', P.text('#licences-list .cred-row[data-kind="emt"]'));
    check('the base: the queue counts 2, Rosa\'s typed EMT with the number\'s tail, and the 214 says she submitted it', await until(() => base.pendingCredentials().length === 2, 70000) && await until(() => has('#panel', 'to confirm · 2') && has('#panel .cq-list', 'rosa alvarez', 'emt', '···4471'), 10000) && await until(() => eventText(base, 'Rosa Alvarez submitted EMT'), 10000), text('#panel .cq-list').slice(0, 300));
    await P.act('licences-done');
    await until(() => P.shown('#s-briefing'), 8000); await P.act('briefed');
    await until(() => P.shown('#s-home'), 5000);
    check('home: the You card reads the ID none and the EMT pending, with Add a licence and her unit; the unit\'s division is read-only (no Accept, no Address clear), Message Operations is offered, and her phone reports no position of its own', /id · driver's licence none/.test(P.text('#you-card')) && /emt · texas dshs pending/.test(P.text('#you-card')) && !!P.$('#you-card [data-action="licences"]') && /with unit 2 · boat crew/.test(P.text('#you-card')) && !P.$('#banner [data-action="accept"]') && P.$('.actions [data-action="addr-clear"]').hidden && P.$('.actions [data-action="zone-clear"]').hidden && !P.$('#act-compose').hidden && await until(() => /unit 2's division/.test(P.text('#assignment')) && /b-1/.test(P.text('#assignment')), 8000) && !base.position(rosaId()), P.text('#you-card') + ' | ' + P.text('#assignment').slice(0, 80));
    await P.act('menu');
    check('the menu carries the same card', await until(() => P.shown('#s-menu') && /emt/.test(P.text('#menu-you')), 3000) && /pending/.test(P.text('#menu-you')), P.text('#menu-you'));
    await P.act('home');

    // ---- the base confirms Rosa's EMT and refuses Nguyen's boat card with a reason
    const rosaCred = () => base.credentials().find((c) => c.kind === 'emt' && c.user_id === rosaId());
    $(`#panel .cq-row[data-cred="${rosaCred().id}"] [data-action="cred-confirm"]`).click();
    check('Confirm: confirmed by Operations, one 214 line, the queue counts 1', await until(() => rosaCred().status === 'confirmed' && rosaCred().confirmed_by === U.ops, 8000) && await until(() => eventText(base, "Rosa Alvarez's EMT confirmed by Operations"), 8000) && await until(() => has('#panel', 'to confirm · 1'), 8000), logTexts()[0]);
    check('her phone reads it: the You card says confirmed by Operations hh:mm', await until(() => /emt[^|]*confirmed ✓/.test(P.text('#you-card')) && /confirmed by operations \d\d:\d\d/.test(P.text('#you-card')), 15000), P.text('#you-card'));
    autoConfirm(false);
    $(`#panel .cq-row[data-cred="${CR[1]}"] [data-action="cred-reject"]`).click();
    check('Not accepted… asks why in the app\'s own dialog: the card and the person named, four reasons as chips, a box for your own words', await until(() => $('#reason-dialog').open, 3000) && has('#reason-title', 'not accepted: boat operator, minh nguyen') && $$('#reason-chips .chip').map((c) => c.textContent).join('|') === 'Expired|Cannot read it|Not this person|Wrong kind' && !!$('#reason-input'), text('#reason-title') + ' | ' + $$('#reason-chips .chip').map((c) => c.textContent).join('|'));
    $$('#reason-chips .chip').find((c) => c.textContent === 'Expired').click();
    check('the chip decides: rejected with the reason, the line says why, the queue is empty', await until(() => base.credential(CR[1]).status === 'rejected' && base.credential(CR[1]).reason === 'expired', 8000) && !$('#reason-dialog').open && await until(() => eventText(base, "Minh Nguyen's boat operator not accepted: expired"), 8000) && await until(() => !has('#panel', 'to confirm'), 8000), logTexts()[0]);
    autoConfirm(true);
    await openBoard();
    check('the board\'s chips follow: Rosa "EMT ✓" with own account on Unit 2\'s card, Nguyen "Boat ✗" with the reason in the title, and nothing to confirm', await until(() => { const r = base.people().find((p) => p.name === 'Rosa Alvarez'); return r && chips(r.id).join('|') === 'EMT ✓' && !!row(r.id).querySelector('.pp-own') && row(r.id).closest('.pp-card').dataset.unit === U.unit2; }, 10000) && chips(PPL[2]).join('|') === 'Swift water|Boat ✗' && row(PPL[2]).querySelector('.badge.cred-rejected').title === 'not accepted: expired' && has('#people-page', 'nothing to confirm'), chips(PPL[2]).join('|'));
    $('#people .briefing-bar [data-action="print-211"]').click();
    await until(() => !$('#briefing').hidden && has('#briefing-title', '211'));
    check('the 211 prints the confirmed with a tick, the refused marked, a plain word the lead\'s, own account under her name, and the legend', row211('Rosa Alvarez').startsWith('rosa alvarez own account emt ✓ ') && row211('Nguyen').startsWith('nguyen own account · with patel · boat operator capt. swift water, boat (not accepted) ') && row211('Okafor').startsWith('okafor with ramirez boat, paramedic ') && has('#briefing-page', '✓ confirmed by operations · (pending) submitted'), row211('Rosa Alvarez') + ' | ' + row211('Nguyen') + ' | ' + row211('Okafor'));
    $('[data-action="close-briefing"]').click();
    closeBoard();
    // the division's hover card gains who is qualified for what
    const zr = $(`#zones .zr[data-id="${ZONE('B-1')}"]`);
    zr.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    check('B-1\'s hover card lists Unit 2\'s people with their chips, the confirmed ticked', await until(() => !$('#zone-hover').hidden && $('#zone-hover .zh-ql'), 3000) && has('#zone-hover .zh-ql', 'nguyen', 'boat ✗', 'rosa alvarez', 'emt ✓'), text('#zone-hover .zh-ql'));
    $('#zones').dispatchEvent(new MouseEvent('mouseleave'));
    // the Members tab shows her as crew by band, with Unit 2
    await openBoard();
    $('#people [data-action="people-tab"][data-tab="members"]').click();
    check('the Members tab: Rosa Alvarez · with Unit 2 · Crew, by band, her own Identity cell (No ID · Check in person), and Open goes to Unit 2', await until(() => has(`#people-page .mb-row[data-member="${rosaId()}"]`, 'rosa alvarez · with unit 2', 'crew, by band', 'no id'), 5000) && !!$(`#people-page .mb-row[data-member="${rosaId()}"] [data-action="verify-profile"]`) && $(`#people-page .mb-row[data-member="${rosaId()}"] [data-action="select-unit"]`).dataset.id === U.unit2, text(`#people-page .mb-row[data-member="${rosaId()}"]`));
    $('#people [data-action="people-tab"][data-tab="people"]').click();
    closeBoard();

    // ---- a voided band at the door
    await base.voidBand(tagN(6).id);
    P.frame.remove(); P = null;
    P = await phoneFrame('&nobody&band=' + tagN(6).code, { signedOut: true });
    await phoneSignIn(P, 'rosa.alvarez@mock.local', false);
    check('a voided band on a signed-out phone: after sign-in the check-in form says it was voided, no claim sheet', await until(() => P.shown('#join') && P.shown('#join-band-note'), 8000) && /band 006 was voided; ask the table for another/.test(P.text('#join-band-note')) && !P.shown('#s-claim'), P.text('#join-band-note'));
    check('her incident is listed to reopen, as Unit 2', await until(() => /you are unit 2/.test(P.text('#join-list')), 5000), P.text('#join-list'));
  } finally {
    autoConfirm(false);
    if (P) P.frame.remove();
    for (const k of Object.keys(localStorage)) if (/^ic\.field\./.test(k)) localStorage.removeItem(k);
    if ($('#reason-dialog') && $('#reason-dialog').open) $('#reason-dialog').close();
    if (!$('#briefing').hidden) $('[data-action="close-briefing"]').click();
    if (!$('#people').hidden) $('[data-action="close-people"]').click();
    await wait(100);
  }
}

// ---- invitations by email (v56): the Members tab's box, Resend and Withdraw, the switch, the code refused for the
// uninvited, the link's landing on a phone with no code to type, the roster on a second incident. The function that
// sends the email is stood in by the mock (client.functions.invoke).
async function invite(check) {
  autoConfirm(true);
  for (const k of Object.keys(localStorage)) if (/^ic\.field\./.test(k)) localStorage.removeItem(k);
  let P = null;
  const members = async () => { if ($('#people').hidden) $('.top-btns [data-action="people"]').click(); await until(() => !$('#people').hidden); if (!$('#people-page form[data-form="invite-send"]')) $('#people [data-action="people-tab"][data-tab="members"]').click(); await until(() => $('#people-page form[data-form="invite-send"]')); };
  try {
    check('seeded: one accepted invitation (Ana Ramirez, Unit 1) and one pending (j.ortiz, Unit 4); the join code is on', base.invites(true).length === 2 && base.invites(true).some((v) => v.email === 'unit1@mock.local' && v.accepted_at) && base.invites(true).some((v) => v.email === 'j.ortiz@cedarfork.gov' && !v.accepted_at && v.sent_at) && !base.incident.invite_only, base.invites(true).map((v) => v.email).join());
    await members();
    check('the Members tab has Invite by email, the invited list with Resend and Withdraw, the accepted, and the roster line', has('#people-page', 'invite by email', 'invited, not yet in · 1', 'j.ortiz@cedarfork.gov · unit · unit 4', 'accepted · 1', 'unit1@mock.local · unit · unit 1', 'the roster') && $$('#people-page [data-action="invite-resend"]').length === 1 && $$('#people-page [data-action="invite-withdraw"]').length === 1, text('#people-page').slice(-700));
    const f = $('#people-page form[data-form="invite-send"]');
    f.email.value = 'Ana.Lopez@CedarFork.gov'; f.role.value = 'unit'; f.unit.value = 'Unit 7';
    f.requestSubmit();
    const v = await until(() => base.invites(true).find((x) => x.email === 'ana.lopez@cedarfork.gov'));
    check('Send the invitation: the row, tidied, sent once by Operations with a token; the 214 says so; the list shows it', !!v && v.role === 'unit' && v.unit_name === 'Unit 7' && !!v.sent_at && v.sends === 1 && v.token.length === 24 && v.invited_by === USERS().ops && await until(() => eventText(base, 'Invitation sent to ana.lopez@cedarfork.gov as a unit (Unit 7) by Operations')) && await until(() => has('#people-page', 'invited, not yet in · 2', 'ana.lopez@cedarfork.gov · unit · unit 7')), logTexts()[0]);
    const tok1 = v.token;
    $(`#people-page .inv-row[data-invite="${v.id}"] [data-action="invite-resend"]`).click();
    check('Resend: a new link, counted, logged', await until(() => base.invite(v.id).token !== tok1 && base.invite(v.id).sends === 2) && await until(() => eventText(base, 'Invitation to ana.lopez@cedarfork.gov sent again by Operations')) && await until(() => has('#people-page', '(2 times)')), logTexts()[0]);
    const ortiz = base.invites(true).find((x) => x.email === 'j.ortiz@cedarfork.gov');
    $(`#people-page .inv-row[data-invite="${ortiz.id}"] [data-action="invite-withdraw"]`).click();
    check('Withdraw: kept on record under Withdrawn, logged, never deleted', await until(() => base.invite(ortiz.id).withdrawn_at) && await until(() => eventText(base, 'Invitation to j.ortiz@cedarfork.gov withdrawn by Operations')) && await until(() => has('#people-page', 'withdrawn · 1')) && M().tables.ic_invites.some((x) => x.id === ortiz.id), logTexts()[0]);
    const f2 = $('#people-page form[data-form="invite-send"]');   // the page was redrawn since
    f2.email.value = 'ana.lopez@cedarfork.gov'; f2.requestSubmit();
    check('the same address twice is refused with the reason', await until(() => $('#toast') && /is invited already; send it again from the list/.test($('#toast').textContent), 4000), $('#toast') && $('#toast').textContent);
    $('[data-action="close-people"]').click();

    // ---- the switch: the join code off for the uninvited
    $('#inc-code').click(); await until(() => !$('#codes-pop').hidden);
    const box = $('#codes-pop [data-check="invite-only"]');
    check('the codes\' card has Invited members only beside the code, off', !!box && !box.checked, text('#codes-pop').slice(0, 400));
    box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true }));
    check('switched on: the incident says so, the 214 says the code is off, the panel too', await until(() => base.incident.invite_only === true) && await until(() => eventText(base, 'Invited members only: the join code is off')) && await until(() => has('#codes-pop', 'the join code is off')), logTexts()[0]);
    const e1 = await (async () => { const fc = window.supabase.createClient(); await mockSignIn(fc, 'stranger@mock.local'); const D = new Data(fc); await D.init(); try { await D.join('CEDAR7', 'unit', 'Unit 9', null, 1, 'x', [], 'engine'); return null; } catch (e) { return e; } finally { D.close(); } })();
    check('with the code off, a stranger with CEDAR7 is told the incident is by invitation', !!e1 && /by invitation; ask operations/i.test(e1.message), e1 && e1.message);
    await field.join('CEDAR7', 'unit', 'Unit 3', null, 2, 'Cedar Fork Fire Department', [], 'swift_water');
    check('a member still checks in by code', !!field.me() && field.me().status !== 'checked_out');

    // ---- the link on a phone: signed out, the card; the account with that address; Check in with no code
    P = await phoneFrame('&nobody&invite=' + base.invite(v.id).token, { signedOut: true });
    check('the link opens the phone signed out with the invitation card: the incident, as a unit, Unit 7, by Marcus Bell, the address on the form', !!P.ready && await until(() => P.shown('#auth-invite'), 8000) && /you're invited cedar fork flooding as a unit, unit 7, by marcus bell/.test(P.text('#auth-invite')) && P.$('#auth-email').value === 'ana.lopez@cedarfork.gov', P.text('#auth-invite'));
    check('the card is whole at 375 px', P.sideways().length === 0, P.sideways().join('; '));
    check('the card says the link signs in by itself and a code to that address does the same, no password (v73)', /a code to ana\.lopez@cedarfork\.gov does the same: no password/.test(P.text('#auth-invite')), P.text('#auth-invite'));
    P.$('#auth-form').requestSubmit();   // the address is on the form already: Send code
    check('Send code with the invitation\'s address: the code step names it', await until(() => P.shown('#auth-enter'), 5000) && /code went to ana\.lopez@cedarfork\.gov/.test(P.text('#auth-sent')), P.text('#auth-sent'));
    P.$('#auth-otp').value = P.frame.contentWindow.__mock.codeFor('ana.lopez@cedarfork.gov'); P.$('#auth-form').requestSubmit();
    await until(() => P.shown('#join'), 8000);
    check('signed in with that address, the check-in screen offers the invitation: Check in · no code to type, and no password step (v73)', await until(() => P.shown('#join-invite') && P.$('#join-invite [data-action="invite-accept"]'), 8000) && /check in · no code to type/.test(P.text('#join-invite')) && !P.$('#join-invite form') && !/password/.test(P.text('#join-invite')), P.text('#join-invite'));
    await until(() => P.shown('#s-identify'), 5000);
    P.$('#id-name').value = 'Ana Lopez'; P.$('#id-phone').value = '512 555 0170';
    await P.act('id-save');
    await until(() => !P.shown('#s-identify'), 5000);
    P.$('#join-invite [data-action="invite-accept"]').click();
    check('Check in by invitation: in as Unit 7 with no code, the invitation accepted, both lines in the 214', await until(() => P.shown('#app') && P.$('#me-name').textContent === 'Unit 7', 15000) && await until(() => base.invite(v.id).accepted_at && base.members().some((m) => m.unit_name === 'Unit 7'), 10000) && await until(() => eventText(base, 'Ana Lopez accepted the invitation from Operations') && eventText(base, 'Unit 7 checked in by invitation as Ana Lopez, 512 555 0170, identity not given with 1 person'), 10000), logTexts().slice(0, 3).join(' | '));
    await members();
    check('the Members tab lists her under Accepted as Unit 7', await until(() => has('#people-page', 'accepted · 2', 'ana.lopez@cedarfork.gov · unit · unit 7', 'as unit 7'), 8000), text('#people-page').slice(-500));
    $('[data-action="close-people"]').click();

    // ---- the roster: a second incident offers the addresses invited on this one, and invites them in one press
    const second = await base.createIncident({ name: 'Second incident', period: 'OP 1', base: null, lat: 30.26, lng: -97.74, zoom: 14 });
    await base.open(second.id);
    const roster = await base.roster();
    check('the roster on a second incident: the two addresses invited here and accepted (not the withdrawn one), with their role and unit', roster.length === 2 && roster.some((r) => r.email === 'ana.lopez@cedarfork.gov' && r.role === 'unit' && r.unit_name === 'Unit 7') && roster.some((r) => r.email === 'unit1@mock.local') && !roster.some((r) => r.email === 'j.ortiz@cedarfork.gov'), JSON.stringify(roster));
    const res = await base.sendInvites(roster.map((r) => ({ email: r.email, role: r.role, unit: r.unit_name })));
    check('Invite the roster sends them all: two rows on the second incident, logged, and the roster is empty there now', res.length === 2 && res.every((r) => r.ok) && await until(() => base.invites().length === 2) && !!eventText(base, 'Invitation sent to ana.lopez@cedarfork.gov as a unit (Unit 7) by Operations') && (await base.roster()).length === 0, JSON.stringify(res));
    await base.open(INC());
  } finally {
    autoConfirm(false);
    if (P) P.frame.remove();
    for (const k of Object.keys(localStorage)) if (/^ic\.field\./.test(k)) localStorage.removeItem(k);
    if (!$('#people').hidden) $('[data-action="close-people"]').click();
    await wait(100);
  }
}

// Show me around (v58): the labels over each part of the screen on the device's first open, cleared one by one or all at
// once, kept off this device after, back from Settings, never tinting an open alarm line, gone when an emergency arrives.
async function around(check) {
  const cards = () => $$('#around .around-card');
  const card = (k) => $(`#around .around-card[data-around-key="${k}"]`);
  const zone = (k) => $(`#around .around-zone[data-around-key="${k}"]`);
  const mark = () => { try { return localStorage.getItem('ic.base.around'); } catch (e) { return null; } };
  const reopen = () => { const b = document.createElement('button'); b.dataset.action = 'open-incident'; b.dataset.id = INC(); b.hidden = true; document.body.appendChild(b); b.click(); b.remove(); };
  const over = (k, sel) => { const z = zone(k), t = $(sel); if (!z || z.hidden || !t) return k + ': no tint'; const a = z.getBoundingClientRect(), b = t.getBoundingClientRect(); return Math.abs(a.left - b.left) < 3 && Math.abs(a.top - b.top) < 3 && Math.abs(a.width - b.width) < 3 ? '' : `${k}: tint ${[a.left, a.top, a.width].map(Math.round)} part ${[b.left, b.top, b.width].map(Math.round)}`; };
  // ---- the first open on a device that has not seen the base
  try { localStorage.removeItem('ic.base.around'); } catch (e) { /* storage blocked */ }
  reopen();
  check('the first open on this device shows nine labels, numbered in order, each the part\'s name and one line of twelve words at most, and the pill counts them (v60)', await until(() => cards().length === 9 && !!$('#around .around-pill')) && cards().every((c, i) => c.querySelector('.n').textContent === String(i + 1) && c.querySelector('b').textContent.length > 3 && c.querySelector('p').textContent.split(/\s+/).length <= 14) && has('#around .around-pill', 'show me around', '9 left'), cards().length + ' | ' + text('#around .around-pill'));
  check('each tint carries its number too, and a thin row\'s card hangs under it with a caret while a tall part\'s sits inside (v60)', $$('#around .around-zone .n').length === 9 && card('head').classList.contains('below') && card('tools').classList.contains('below') && !card('map').classList.contains('below') && zone('map').classList.contains('tall') && (() => { const r = $('.tools').getBoundingClientRect(), c = card('tools').getBoundingClientRect(); return Math.abs(c.top - r.bottom - 7) < 3; })(), String(card('tools').getBoundingClientRect().top - $('.tools').getBoundingClientRect().bottom));
  const offs = [over('map', '#map'), over('tools', '.tools'), over('log', '#logbox'), over('bars', '#bars')].filter(Boolean);
  check('each tint sits over its part: the map, the tools, the log, the alarm line', offs.length === 0, offs.join(' | '));
  check('the codes have one label, on the CEDAR7 pill; the log\'s is the ninth (v60)', !!card('codes') && card('codes').querySelector('.n').textContent === '8' && card('log').querySelector('.n').textContent === '9' && !card('join') && !card('ops'));
  check('every card is on the screen and none sits on another', (() => { const rs = cards().filter((c) => !c.hidden).map((c) => c.getBoundingClientRect()); const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight; if (!rs.every((r) => r.left >= 0 && r.top >= 0 && r.right <= vw + 1 && r.bottom <= vh + 1)) return false; for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { const a = rs[i], b = rs[j]; if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) return false; } return true; })(), cards().filter((c) => !c.hidden).map((c) => c.dataset.aroundKey + ':' + Math.round(c.getBoundingClientRect().top)).join(' '));
  // ---- one click clears one label; the device is not marked until the last goes
  zone('map').click();
  check('clicking the map\'s tint clears that label alone: the pill counts eight, the device is not yet marked', zone('map').hidden && card('map').hidden && !card('log').hidden && has('#around .around-pill', '8 left') && mark() !== '1', text('#around .around-pill') + ' | ' + mark());
  // ---- Escape clears the rest and marks the device
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check('Escape clears the rest, marks this device as shown around, and says where they come back from', await until(() => !$('#around')) && mark() === '1' && await until(() => has('#toast', 'show me around is in settings')), text('#toast') + ' | ' + mark());
  // ---- the next open on this device shows nothing
  reopen();
  await until(() => !$('#app').hidden && $('#inc-name').textContent === 'Cedar Fork Flooding');
  await wait(300);
  check('the next open on this device shows no labels', !$('#around'));
  // ---- the gear brings them back; Clear all puts them away
  $('[data-action="gear"]').click();
  check('the gear menu has Show me around (v60)', await until(() => !$('#gear-menu').hidden) && !!$('#gear-menu [data-action="show-around"]'), text('#gear-menu'));
  $('#gear-menu [data-action="show-around"]').click();
  check('Show me around closes the menu and puts every label back', await until(() => cards().length === 9 && $('#gear-menu').hidden) && has('#around .around-pill', '9 left'), cards().length);
  $('#around .around-all').click();
  check('Clear all puts them away', await until(() => !$('#around')) && mark() === '1');
  // ---- the alarm line is never tinted while something is open on it; an emergency puts every label away
  const par = await base.startPar('user:' + USERS().unit3);   // Unit 3 alone, so its answer closes it
  await until(() => !$('#safety').hidden);
  $('[data-action="gear"]').click(); await until(() => !$('#gear-menu').hidden); $('#gear-menu [data-action="show-around"]').click();
  check('with a PAR waiting on the alarm line, its label shows but the line is not tinted', await until(() => cards().length === 9 && card('bars') && !card('bars').hidden) && zone('bars').hidden && !zone('map').hidden, String(zone('bars') && zone('bars').hidden) + ' | ' + String(card('bars') && card('bars').hidden));
  await field.answerPar(par.id, true, 2);
  check('the PAR answered and the alarm line quiet again, its tint is back', await until(() => $('#safety').hidden && !zone('bars').hidden, 6000), String(zone('bars') && zone('bars').hidden));
  const aid = uuid();
  await field.raiseAlert(aid, { lat: 30.2673, lng: -97.7386, zoneId: ZONE('A-2') });
  check('an emergency arriving puts every label away at once, and the toast says why', await until(() => !$('#mayday').hidden && !$('#around')) && await until(() => has('#toast', 'an emergency is open')), text('#toast'));
  await field.standDown(aid);
  await until(() => $('#mayday').hidden);
}


// ---- the pages as windows (v64): a window over the dimmed body under the alarm line, Expand to full screen kept per
// device, Escape and the dim click close, a half-filled form holds them off, the print rules unchanged.
async function pages(check) {
  const root = document.documentElement;
  const win = (sel) => $(sel + ' .briefing-win');
  const stored = () => { try { return localStorage.getItem('ic.base.pages'); } catch (e) { return null; } };
  const vw = document.documentElement.clientWidth;
  if (stored() === 'full') { $('[data-action="gear"]').click(); await until(() => !$('#gear-menu').hidden); $('#btn-pages').click(); }   // start as windows
  $('[data-action="briefing"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'briefing'));
  const b = win('#briefing').getBoundingClientRect(), bars = $('#bars').getBoundingClientRect();
  check('the Briefing opens as a window under the header and the alarm line, 870 px wide, centred, the base dimmed around it', root.classList.contains('page-open') && !root.classList.contains('page-full') && Math.abs(b.width - 870) < 2 && Math.abs((vw - b.right) - b.left) < 3 && b.top >= bars.bottom + 18 && getComputedStyle($('#app > .top')).display !== 'none' && getComputedStyle($('#briefing')).backgroundColor.startsWith('rgba(0, 0, 0'), `${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.width)}×${Math.round(b.height)} bars ${Math.round(bars.bottom)}`);
  check('its bar ends with Expand then Close, the title on one line', $$('#briefing .briefing-bar .btn').slice(-2).map((x) => x.textContent.trim()).join('/') === 'Expand/Close' && $('#briefing-title').getBoundingClientRect().height < 30, $$('#briefing .briefing-bar .btn').map((x) => x.textContent.trim()).join('/'));
  $('#briefing [data-action="pages-size"]').click();
  const f = win('#briefing').getBoundingClientRect(), bars2 = $('#bars').getBoundingClientRect();
  check('Expand makes it full screen: the header folds away, the alarm line stays as the top strip, the page fills the rest, and the choice is kept for this device', root.classList.contains('page-full') && getComputedStyle($('#app > .top')).display === 'none' && Math.round(bars2.top) === 0 && Math.abs(f.top - bars2.bottom) < 2 && Math.abs(f.width - vw) < 2 && stored() === 'full' && $('#briefing [data-action="pages-size"]').textContent.trim() === 'Shrink' && has('#btn-pages', 'pages as windows'), `${Math.round(f.left)},${Math.round(f.top)} ${Math.round(f.width)} bars ${Math.round(bars2.top)}-${Math.round(bars2.bottom)} | ${stored()}`);
  const aid = uuid();
  await field.raiseAlert(aid, { lat: 30.2673, lng: -97.7386, zoneId: ZONE('A-2') });
  await until(() => !$('#mayday').hidden);
  const m = $('#mayday .bar-item').getBoundingClientRect(), hit = document.elementFromPoint(m.left + 20, m.top + m.height / 2);
  check('an emergency arriving while a page is full screen shows on the alarm line above the page, in front of it', m.height > 30 && m.bottom <= win('#briefing').getBoundingClientRect().top + 1 && !!(hit && hit.closest('#mayday')), `${Math.round(m.top)}-${Math.round(m.bottom)} hit ${hit && hit.className}`);
  await field.standDown(aid);
  await until(() => $('#mayday').hidden);
  $('#briefing [data-action="pages-size"]').click();
  check('Shrink brings the window back and remembers that', !root.classList.contains('page-full') && getComputedStyle($('#app > .top')).display !== 'none' && stored() === 'window' && has('#btn-pages', 'pages full screen'), stored());
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check('Escape closes the page', $('#briefing').hidden && !root.classList.contains('page-open'));
  const pb = document.createElement('button'); pb.dataset.action = 'people'; pb.dataset.tab = 'people'; pb.hidden = true; document.body.appendChild(pb); pb.click(); pb.remove();   // the People tab, whatever tab an earlier suite left
  const onBoard = await until(() => !$('#people').hidden && $$('#people-page .pp-line').length === 6);
  const p = win('#people').getBoundingClientRect(), page = $('#people-page').getBoundingClientRect();
  check('the People board opens on its People tab with the six rows', !!onBoard, $$('#people-page .pp-line').length + ' lines');
  check('the People board opens as a 1150 px window with the board inside it as wide as before, 1100 px', Math.abs(p.width - 1150) < 2 && Math.abs(page.width - 1100) < 2, `${Math.round(p.width)} / ${Math.round(page.width)}`);
  $('#people-head [data-action="people-add-toggle"]').click();
  await until(() => $('#people-page form[data-form="person-add"]'));
  $('#people-page form[data-form="person-add"] input[name="name"]').value = 'Half typed';
  $('#people').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  check('with a name half typed in the add form, a click on the dim leaves the board open and says why', !$('#people').hidden && await until(() => has('#toast', 'save or cancel the form first')), text('#toast'));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check('and so does Escape', !$('#people').hidden);
  document.activeElement.blur();   // a press on Cancel takes the focus off the name box; a script's click does not
  $('#people-page form[data-form="person-add"] [data-action="people-add-toggle"]').click();
  await until(() => !$('#people-page form[data-form="person-add"]'));
  $('#people').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  check('the form cancelled, a click on the dim closes the board', $('#people').hidden);
  const css = [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules]; } catch (e) { return []; } }).filter((r) => r.media && /print/.test(r.media.mediaText)).flatMap((r) => [...r.cssRules]).map((r) => r.cssText).join('\n');
  check('print CSS prints #briefing alone, static, the window\'s edges and the dim off', /body > \*?:not\(#briefing\)[^{]*\{[^}]*display: none/.test(css) && /#briefing \.briefing-win[^{]*\{[^}]*position: static/.test(css), css.slice(0, 200));
  $('[data-action="gear"]').click(); await until(() => !$('#gear-menu').hidden);
  $('#btn-pages').click();
  check('the gear menu\'s Pages item swaps the setting and closes the menu', stored() === 'full' && $('#gear-menu').hidden && has('#btn-pages', 'pages as windows'), stored());
  $('[data-action="gear"]').click(); await until(() => !$('#gear-menu').hidden); $('#btn-pages').click();   // back to windows for the suites after this one
}

// ---- the public demo (v32): ?demo loads the stand-in on any host, and /try/ frames both views on it.
async function demo(check) {
  await new Promise((r) => { try { const req = indexedDB.deleteDatabase('incident-map'); req.onsuccess = req.onerror = req.onblocked = () => r(); } catch (e) { r(); } });
  const frame = document.createElement('iframe');
  frame.src = '/field/?demo';
  frame.style.cssText = 'position:fixed;right:0;top:0;width:375px;height:780px;z-index:3000;background:#fff;border:0';
  document.body.appendChild(frame);
  const w = () => frame.contentWindow;
  check('?demo loads the stand-in on the phone', await until(() => w() && w().__mock && w().supabase && w().supabase.mock === true, 8000));
  check('the demo phone opens the seeded incident as Unit 3', await until(() => { const d = frame.contentDocument; return !!(d && d.body && /Unit 3/.test(d.body.innerText)); }, 10000));
  frame.remove();
  const page = document.createElement('iframe');
  page.src = '/try/';
  page.style.cssText = 'position:fixed;right:0;top:0;width:1200px;height:800px;z-index:3000;background:#fff;border:0';
  document.body.appendChild(page);
  const pd = () => page.contentDocument;
  const cards = await until(() => pd() && pd().querySelectorAll('.card[data-role]').length === 12 && pd().querySelectorAll('.card[data-role]').length, 8000);
  check('/try/ draws a card for each of the twelve personas and frames both views in demo mode', cards === 12 && pd().querySelector('#base').dataset.src === '/?demo' && pd().querySelector('#phone').dataset.src === '/field/?demo' && !!pd().querySelector('#full'), `${cards} cards`);
  pd().querySelector('.card[data-role="10-shelter-desk"]').click();
  check('a role card loads both frames on the stand-in and shows that role\'s tour', await until(() => pd().querySelector('#base').getAttribute('src') === '/?demo' && pd().querySelector('#phone').getAttribute('src') === '/field/?demo' && /Shelter desk volunteer/.test((pd().querySelector('.who-head') || {}).textContent || '') && pd().querySelectorAll('.step').length >= 6, 8000), `${pd().querySelectorAll('.step').length} steps`);
  check('the base\'s signed-out screen is the front door: the join code first, two routes, one picture, three steps, six roles, five promises, the pilot and the sign-in', !!$('#auth.landing #door-form') && has('#auth .door h1', 'have a join code') && $$('#auth .route').length === 2 && !!$('#auth .compose .base-shot') && $$('#auth .step').length === 3 && $$('#auth .land-card').length === 6 && $$('#auth .grid5 > div').length === 5 && !!$('#auth .land-pilot a.btn.pri') && !!$('#auth #auth-form #auth-email'), text('#auth .door h1'));
  $('#door-code').value = 'CEDAR0'; $('#door-form').requestSubmit();
  check('the code box refuses a code outside the join code\'s alphabet, and stays on the page', /never has 0, O, 1 or I/.test($('#door-msg').textContent) && location.pathname === '/', $('#door-msg').textContent);
  $('#door-code').value = ''; $('#door-msg').textContent = '';
  check('the front door\'s footer says which version is on screen, with Reload, and the new-version chip waits hidden', await until(() => /^Version v\d+$/.test(($('#land-ver') || {}).textContent || ''), 6000) && !!$('#land-reload') && !!$('#update-chip') && $('#update-chip').hidden, ($('#land-ver') || {}).textContent);
  const nf = document.createElement('iframe'); nf.src = '/404.html'; nf.style.cssText = 'position:fixed;right:0;top:0;width:375px;height:700px;z-index:3000;background:#fff;border:0'; document.body.appendChild(nf);
  const nd = () => nf.contentDocument;
  check('the 404 page says the page is not here and asks for the join code, with the ways back', await until(() => nd() && nd().querySelector('#door-form') && /not here/i.test(nd().body.innerText) && nd().querySelectorAll('a[href="/"], a[href="/try/"]').length >= 3, 8000), nd() && nd().title);
  await until(() => nd().defaultView.__doorReady, 6000);   // the page's script is a module; the box is a plain join link until it loads
  nd().getElementById('door-code').value = 'CEDAR0'; nd().getElementById('door-form').requestSubmit();
  check('its code box refuses a code outside the alphabet and stays put', await until(() => /never has 0, O, 1 or I/.test(nd().getElementById('door-msg').textContent), 4000) && /404\.html$/.test(nd().location.pathname), nd().getElementById('door-msg').textContent);
  nf.remove();
  const alone = await Promise.all(['/try/base/', '/try/phone/'].map((u) => fetch(u, { cache: 'no-store' }).then((r) => (r.ok ? r.text() : ''))));
  check('the base and the phone each have a page of their own on the stand-in, with Full screen and Reset', /src="\/\?demo"/.test(alone[0]) && /src="\/field\/\?demo"/.test(alone[1]) && alone.every((t) => /id="full"/.test(t) && /id="reset"/.test(t)));
  const tour = page.contentWindow.__tour;
  check('six roles have a tour, with Show me on every step and Do it for me on most', !!tour && tour.tours.length === 6 && pd().querySelectorAll('.step [data-act="show"]').length === pd().querySelectorAll('.step').length && pd().querySelectorAll('.step [data-act="do"]').length >= 5, tour && tour.tours.join());
  await tour.pick('03-unit-lead-on-foot');
  await until(() => pd().querySelectorAll('.step').length === 7);
  const ok0 = await tour.run(0);
  check('Do it for me on the unit lead\'s first step presses Briefed on the demo phone and reports back', ok0 === true && /assembled from the incident/i.test(pd().querySelector('.step[data-i="0"] .res').textContent), pd().querySelector('.step[data-i="0"] .res').textContent.slice(0, 120));
  page.remove();
}

// ---- the walkthrough fixes (v25): each as the persona who hit it met it. The phone is the field app at
// 375 px in a frame beside the base; its own mock copies the base's data over the BroadcastChannel and
// opens signed in as Unit 3. The frame goes before the suite ends, so the next reset is not undone by it.
async function phoneFrame(extra = '', { signedOut = false, waitFor = '' } = {}) {   // extra: more of the address, like '&band=CODE' (v55); signedOut: opened with &nobody (v56); waitFor: a selector the frame is ready at, for a link's landing (v73)
  await new Promise((r) => { try { const req = indexedDB.deleteDatabase('incident-map'); req.onsuccess = req.onerror = req.onblocked = () => r(); } catch (e) { r(); } });   // an earlier frame's unsent entries would block this one's
  const frame = document.createElement('iframe');
  frame.src = '/field/?mock' + extra;
  frame.style.cssText = 'position:fixed;right:0;top:0;width:375px;height:780px;z-index:3000;background:#fff;border:0;box-shadow:0 0 0 1px #999';
  document.body.appendChild(frame);
  const doc = () => frame.contentDocument;
  const P = {
    frame, doc,
    $: (s) => (doc() ? doc().querySelector(s) : null),
    $$: (s) => (doc() ? [...doc().querySelectorAll(s)] : []),
    text: (s) => { const el = P.$(s); return el ? el.innerText.replace(/\s+/g, ' ').trim().toLowerCase() : ''; },
    // what a tap on a button with this action does (the field's handler is on the document)
    act: async (action, extra = {}) => { const b = doc().createElement('button'); b.dataset.action = action; Object.assign(b.dataset, extra); b.hidden = true; doc().body.appendChild(b); b.click(); b.remove(); await wait(150); },
    shown: (s) => { const el = P.$(s); return !!el && !el.hidden && el.getClientRects().length > 0; },
    // nothing wider than the phone: the page, and the sheet or page that is showing
    sideways: () => {
      const d = doc(), w = frame.contentWindow.innerWidth;
      const out = [];
      if (d.documentElement.scrollWidth > w + 1) out.push('page ' + d.documentElement.scrollWidth);
      for (const el of d.querySelectorAll('.sheet, .join, .auth, .p-body')) if (el.getClientRects().length && el.scrollWidth > el.clientWidth + 1) out.push((el.id || el.className) + ' ' + el.scrollWidth);
      for (const b of d.querySelectorAll('.btn, .chip')) { if (!b.getClientRects().length) continue; const r = b.getBoundingClientRect(); if (r.right > w + 1 || r.left < -1) out.push('button "' + b.textContent.trim() + '" ' + Math.round(r.left) + '–' + Math.round(r.right)); }
      return out;
    }
  };
  P.ready = await until(() => waitFor ? P.shown(waitFor) : signedOut ? P.$('#auth') && !P.$('#auth').hidden : P.$('#app') && !P.$('#app').hidden && P.$('#me-name').textContent === 'Unit 3', 20000);   // a hidden pane throttles the frame's timers
  return P;
}
async function phoneSignIn(P, to) {   // the door (v73): the address or number, Send code, the code the frame's mock "sent", in; a new address makes its account on the way
  P.$('#auth-email').value = to; P.$('#auth-form').requestSubmit();
  if (!await until(() => P.shown('#auth-enter'), 5000)) return false;
  P.$('#auth-otp').value = P.frame.contentWindow.__mock.codeFor(to); P.$('#auth-form').requestSubmit();
  return until(() => P.shown('#join') && (!/@/.test(to) || P.$('#join-user').textContent === to.toLowerCase()), 5000);
}

// Sign in by a code (v73): no password anywhere. The base's landing form sends a code to an email and takes it (a
// wrong one refused, Resend a new one that retires the first, Use another address back to the box, six digits
// checking by themselves); the phone's door takes a mobile number (a bad one refused with the reason before anything
// is sent), its code signs in and the Identify sheet's phone is filled from it; Sign out clears the door; a link's
// landing (the mock stands in for the magic link with #access_token=mock-<id>) opens signed in with the join code the
// link carried. The invitation's landing with no password step is in the invite suite.
async function passwordless(check) {
  let P = null;
  const press = (action) => { const b = document.createElement('button'); b.dataset.action = action; b.hidden = true; document.body.appendChild(b); b.click(); b.remove(); };
  try {
    // ---- the base: sign out to the landing
    press('sign-out');
    await until(() => !$('#auth').hidden, 5000);
    await wait(250);   // the handler's clearAuth() runs after the sign-out resolves; a submit before it would be wiped
    check('signed out, the landing\'s sign-in is one box, Email or mobile number, and Send code: no password box, no Create account, the code step put away', !$('#auth').hidden && !!$('#auth-form #auth-email') && !$('#auth-password') && !$('#auth-signup') && /email or mobile number/i.test($('#auth-ask label').textContent) && $('#auth-ask button[type="submit"]').textContent.trim() === 'Send code' && $('#auth-enter').hidden && !$('#auth-form .mock-code'), $('#auth-form').innerText.slice(0, 300));
    $('#auth-email').value = 'ana lopez'; $('#auth-form').requestSubmit(); await wait(80);
    check('words that are neither an address nor a number are refused with the reason, nothing sent', /email address has an @/.test($('#auth-msg').textContent) && $('#auth-enter').hidden && !$('#auth-form .mock-code'), $('#auth-msg').textContent);
    $('#auth-email').value = ' Ops@Mock.local '; $('#auth-form').requestSubmit();
    check('Send code: the code step, the sentence naming the address lower case and the link, the code box as a one-time code, Resend and Use another address, and the stand-in\'s chip with the code', await until(() => !$('#auth-enter').hidden, 5000) && $('#auth-ask').hidden && /a six-digit code went to ops@mock\.local\. type it here, or open the link in the email/i.test($('#auth-sent').textContent) && $('#auth-otp').getAttribute('autocomplete') === 'one-time-code' && $('#auth-otp').getAttribute('inputmode') === 'numeric' && !!$('#auth-form [data-auth="resend"]') && !!$('#auth-form [data-auth="other"]') && await until(() => $('#auth-form .mock-code') && /mock: the code for ops@mock\.local is \d{6}/i.test($('#auth-form .mock-code').textContent)) && document.activeElement === $('#auth-otp'), text('#auth-form'));
    const code1 = M().codeFor('ops@mock.local');
    check('the chip shows the code the stand-in sent', $('#auth-form .mock-code b').textContent === code1, code1);
    $('#auth-otp').value = String((Number(code1) + 1) % 1000000).padStart(6, '0'); $('#auth-form').requestSubmit();
    check('a wrong code is refused with the reason, the code step stays', await until(() => /not right, or it has expired/.test($('#auth-msg').textContent), 5000) && !$('#auth-enter').hidden && !$('#auth').hidden, $('#auth-msg').textContent);
    $('#auth-otp').value = '12'; $('#auth-form').requestSubmit(); await wait(50);
    check('two digits are not a code', /code is six digits/.test($('#auth-msg').textContent), $('#auth-msg').textContent);
    $('#auth-form [data-auth="resend"]').click();
    check('Resend: another code, the message and the chip say so', await until(() => M().codeFor('ops@mock.local') !== code1, 5000) && await until(() => /another code is on its way; the first one no longer works/i.test($('#auth-msg').textContent)) && $('#auth-msg').classList.contains('ok') && $('#auth-form .mock-code b').textContent === M().codeFor('ops@mock.local'), $('#auth-msg').textContent);
    $('#auth-otp').value = code1; $('#auth-form').requestSubmit();
    check('the first code no longer works', await until(() => /not right, or it has expired/.test($('#auth-msg').textContent), 5000), $('#auth-msg').textContent);
    $('#auth-form [data-auth="other"]').click();
    check('Use another address: the box again with the address in it to fix, the code step and the message gone', !$('#auth-ask').hidden && $('#auth-enter').hidden && $('#auth-msg').textContent === '' && $('#auth-email').value === ' Ops@Mock.local ' && document.activeElement === $('#auth-email'), $('#auth-email').value);
    $('#auth-email').value = 'ops@mock.local'; $('#auth-form').requestSubmit();
    await until(() => !$('#auth-enter').hidden, 5000);
    $('#auth-otp').value = M().codeFor('ops@mock.local'); $('#auth-otp').dispatchEvent(new Event('input', { bubbles: true }));   // six digits typed: no button to press
    check('six digits typed check by themselves: in as Operations on the picker, the account named, the chip gone, the form reset', await until(() => !$('#pick').hidden && $('#pick-user').textContent === 'ops@mock.local', 8000) && $('#auth').hidden && !$('#auth-form .mock-code') && $('#auth-email').value === '' && $('#auth-enter').hidden, $('#pick-user').textContent);
    $(`#pick-list [data-action="open-incident"][data-id="${INC()}"]`).click();
    check('the incident opens again', await until(() => !$('#app').hidden && $('#inc-name').textContent === 'Cedar Fork Flooding', 8000));
    check('an account made with a number is read as the number on screen, an address as itself (rules)', accountText({ phone: '15125550199' }) === '512 555 0199' && accountText({ email: 'ops@mock.local' }) === 'ops@mock.local' && accountText(null) === '');

    // ---- the phone: a mobile number at the door
    P = await phoneFrame('&nobody', { signedOut: true });
    check('the phone\'s door: one box, Send code, no password, the lead says email or mobile number and no password', !!P.ready && !P.$('#auth-password') && !P.$('#auth-signup') && /email or mobile number: a six-digit code comes back, no password/.test(P.text('#auth-lead')) && P.shown('#auth-ask') && !P.shown('#auth-enter') && P.$('#auth-email').getAttribute('autocomplete') === 'off', P.text('#auth'));
    check('the door is whole at 375 px', P.sideways().length === 0, P.sideways().join('; '));
    P.$('#auth-email').value = '555 0199'; P.$('#auth-form').requestSubmit(); await wait(80);
    check('a number that is not a mobile number is refused with the reason, nothing sent', /ten digits, like 512 555 0100/.test(P.text('#auth-msg')) && !P.shown('#auth-enter') && !P.$('.mock-code'), P.text('#auth-msg'));
    P.$('#auth-email').value = '(512) 555-0199'; P.$('#auth-form').requestSubmit();
    check('a mobile number: the sentence says a text message went to 512 555 0199, and the code went to +15125550199', await until(() => P.shown('#auth-enter'), 5000) && /a text message with a six-digit code went to 512 555 0199\./.test(P.text('#auth-sent')) && !!P.frame.contentWindow.__mock.codes.get('15125550199') && /mock: the code for \+15125550199 is \d{6}/.test(P.text('#auth-form .mock-code')), P.text('#auth-sent') + ' | ' + P.text('#auth-form .mock-code'));
    check('the code step is whole at 375 px', P.sideways().length === 0, P.sideways().join('; '));
    P.$('#auth-otp').value = P.frame.contentWindow.__mock.codeFor('(512) 555-0199'); P.$('#auth-form').requestSubmit();
    check('the code signs the number in: the check-in screen names it, and Identify yourself opens with the phone filled in from the sign-in and the name empty', await until(() => P.shown('#join') && P.text('#join-user') === '512 555 0199', 8000) && await until(() => P.shown('#s-identify'), 5000) && P.$('#id-phone').value === '512 555 0199' && P.$('#id-name').value === '', P.text('#join-user') + ' / ' + P.$('#id-phone').value);
    check('the account was made with the number and no address', P.frame.contentWindow.__mock.users.some((u) => u.phone === '15125550199' && !u.email), JSON.stringify(P.frame.contentWindow.__mock.users.slice(-1)));
    await P.act('id-cancel');
    await P.act('sign-out');
    await until(() => P.shown('#auth'), 5000);
    check('Sign out clears the door: the box empty, the code step put away, the chip gone', P.$('#auth-email').value === '' && P.$('#auth-otp').value === '' && P.shown('#auth-ask') && !P.shown('#auth-enter') && !P.$('.mock-code'), P.text('#auth'));

    // ---- a link's landing: the page opens signed in, the hash gone, with the join code the link carried
    const c = window.supabase.createClient();
    const made = await mockSignIn(c, 'link.landing@mock.local');
    P.frame.remove(); P = null;
    P = await phoneFrame('&nobody&join=CEDAR7#access_token=mock-' + made.user.id + '&token_type=bearer&type=magiclink', { waitFor: '#join' });
    check('a link\'s landing: the phone opens signed in with no sign-in form, the hash gone from the address, the account named, the code the link carried on the check-in form with its sentence', !!P.ready && !P.shown('#auth') && P.text('#join-user') === 'link.landing@mock.local' && P.$('#join-form').code.value === 'CEDAR7' && /code cedar7 came with the link/.test(P.text('#join-code-note')) && !/access_token/.test(P.frame.contentWindow.location.hash) && /join=/.test(P.frame.contentWindow.location.search) === false, P.frame.contentWindow.location.href);
    check('a new account: Identify yourself opens over the form, the phone empty since the sign-in was by email', await until(() => P.shown('#s-identify'), 5000) && P.$('#id-phone').value === '' && P.$('#id-name').value === '', P.$('#id-phone').value);
  } finally {
    if (P) P.frame.remove();
    for (const k of Object.keys(localStorage)) if (/^ic\.field\./.test(k)) localStorage.removeItem(k);
    if ($('#app').hidden) {   // whatever happened, the next suite needs the base signed in as Operations with the incident open
      try {
        if (!$('#auth').hidden) { $('#auth-form [data-auth="other"]') && $('#auth-form [data-auth="other"]').click(); $('#auth-email').value = 'ops@mock.local'; $('#auth-form').requestSubmit(); await until(() => !$('#auth-enter').hidden, 5000); $('#auth-otp').value = M().codeFor('ops@mock.local'); $('#auth-form').requestSubmit(); await until(() => !$('#pick').hidden, 8000); }
        const row = $(`#pick-list [data-action="open-incident"][data-id="${INC()}"]`); if (row) row.click();
        await until(() => !$('#app').hidden, 8000);
      } catch (e) { console.warn('passwordless: could not put the base back', e); }
    }
    await wait(100);
  }
}

// The newcomer's door (v39): the sign-in screen with a code waiting, the code's sentence on the form, the
// people rows folded for someone on their own, and the Volunteer kind, on the phone at 375 px.
async function newcomer(check) {
  let P = null;
  try {
    P = await phoneFrame();
    check('the field app opens at 375 px as Unit 3', !!P.ready);
    if (P.ready) {
      P.frame.contentWindow.sessionStorage.setItem('ic.field.join', 'CEDAR7');   // as the front door's code box leaves it
      await P.act('sign-out');
      await until(() => P.shown('#auth'), 5000);
      check('with a code waiting, the sign-in screen says the code is ready and that an email or a mobile number gets a code, no password (v73): one box and Send code', P.shown('#auth-code') && /code cedar7 is ready/.test(P.text('#auth-code')) && /with your email or mobile number: a six-digit code comes back, no password/.test(P.text('#auth-code')) && !P.shown('#auth-lead') && !P.$('#auth-password') && !P.$('#auth-signup') && P.$('#auth-ask button[type="submit"]').textContent.trim() === 'Send code', P.text('#auth-code'));
      await phoneSignIn(P, 'newcomer@mock.local', true);
      check('after Create account the code is on the form with its sentence, and Identify yourself is open over it', P.$('#join-form').code.value === 'CEDAR7' && P.shown('#join-code-note') && /came with the link/.test(P.text('#join-code-note')) && !P.$('#s-identify').hidden, P.text('#join-code-note'));
      check('the people rows are folded for someone on their own, and the unit box says a name will do', !P.shown('#join-people') && /your own name will do/.test(P.text('#join-unit-hint')) && /or your name/.test(P.$('#join-form').unit.placeholder), P.$('#join-form').unit.placeholder);
      P.$('#id-name').value = 'Kim Tran'; P.$('#id-phone').value = '512 555 0190';
      P.$$('#s-identify button').find((b) => b.textContent.trim() === 'Save').click();
      await until(() => P.$('#s-identify').hidden, 5000);
      const f = P.$('#join-form');
      check('the head count box starts at 1, you, on a fresh form (v51)', f.count.value === '1' && !P.shown('#join-people'), f.count.value);
      f.count.value = '2'; f.count.dispatchEvent(new Event('input', { bubbles: true }));
      const unfold2 = P.shown('#join-people');
      f.count.value = '1'; f.count.dispatchEvent(new Event('input', { bubbles: true }));
      const fold1 = !P.shown('#join-people');
      await P.act('jp-add');
      check('a count of two unfolds the rows, one folds them, Add a person unfolds them', unfold2 && fold1 && P.shown('#join-people'), [unfold2, fold1, P.shown('#join-people')].join());
      check('a Volunteer kind is offered', !!P.$('#join [data-kind="volunteer"]'), P.$$('#join [data-kind]').map((e) => e.dataset.kind).join());
      f.unit.value = 'Volunteer 4'; f.agency.value = 'Cedar Fork volunteers'; P.$('#join [data-kind="volunteer"]').click();   // the count box left as it stands (v51)
      f.requestSubmit();
      await until(() => base.members().some((m) => m.unit_name === 'Volunteer 4'), 70000);
      check('checked in with the box untouched, the base counts her as one, not head count unknown, and her briefing says you alone (v51)', base.members().find((m) => m.unit_name === 'Volunteer 4').crew_count === 1 && await until(() => !/head count unknown/.test(($(`#panel [data-action="select-unit"][data-id="${base.members().find((m) => m.unit_name === 'Volunteer 4').user_id}"]`) || {}).innerText || 'head count unknown'), 15000) && await until(() => /on volunteer 4: you alone/.test(P.text('#briefing-list')), 15000), String(base.members().find((m) => m.unit_name === 'Volunteer 4').crew_count) + ' | ' + P.text('#briefing-list').slice(0, 200));
      await until(() => P.shown('#s-home') && /no assignment yet/.test(P.text('#assignment')), 15000);
      check('a unit with no division sees No assignment yet, not another unit\'s card: Address clear and Zone clear are put away and Message Operations is offered (v42)', /no assignment yet/.test(P.text('#assignment')) && /stay where operations put you/.test(P.text('#assignment')) && P.$('.actions [data-action="addr-clear"]').hidden && P.$('.actions [data-action="zone-clear"]').hidden && !P.$('#act-compose').hidden && !P.$('.actions [data-action="hazard"]').hidden, P.text('#assignment'));
      // the base assigns a division: "Assigned, not accepted" until the phone's Accept, which the 214 records (v42)
      const vol = base.members().find((m) => m.unit_name === 'Volunteer 4');
      await base.updateZone(ZONE('B-2'), { assigned_to: vol.user_id, status: 'active' });   // as the base's Assigned to press does
      check('assigned from the base, the division reads Assigned, not accepted, and the phone shows the Accept card', await until(() => has(`#zones .zr[data-id="${ZONE('B-2')}"]`, 'assigned, not accepted · volunteer 4')) && await until(() => P.$('#banner [data-action="accept"]'), 15000), text(`#zones .zr[data-id="${ZONE('B-2')}"]`));
      P.$('#banner [data-action="accept"]').click();
      await until(() => base.member(vol.user_id).accepted_zone_id === ZONE('B-2'), 70000);
      await P.act('zone-clear');
      await until(() => P.shown('#s-clear'), 5000);
      check('Zone clear says what Confirm clear sends and offers My part is done (v46)', /b-2 bee creek low-water crossing: 0 of 9 marked\. confirm clear sends the whole division to operations as primary search complete/.test(P.text('#clear-sub')) && /my part is done tells operations and leaves the division open/.test(P.text('#clear-sub')) && !!P.$('#s-clear [data-action="my-part-done"]'), P.text('#clear-sub'));
      P.$('#s-clear [data-action="my-part-done"]').click();
      check('My part is done reaches Operations as a message and leaves the division open', await until(() => eventText(base, 'Volunteer 4 to Operations: My part of B-2 is done: 0 of 9 marked; the rest is still to search.'), 70000) && base.zone(ZONE('B-2')).status === 'active' && await until(() => P.shown('#s-home'), 5000), logTexts()[0]);
      check('Accept on the phone makes it In progress on the base and writes the line', await until(() => base.member(vol.user_id).accepted_zone_id === ZONE('B-2'), 70000) && await until(() => has(`#zones .zr[data-id="${ZONE('B-2')}"]`, 'in progress · volunteer 4')) && await until(() => eventText(base, 'Volunteer 4 accepted the assignment to B-2'), 8000) && await until(() => !P.$('#banner [data-action="accept"]') && !P.$('.actions [data-action="addr-clear"]').hidden), logTexts()[0]);
      await base.updateZone(ZONE('B-2'), { assigned_to: null, status: 'open' });
      await until(() => !P.$('.actions [data-action="addr-clear"]') || P.$('.actions [data-action="addr-clear"]').hidden, 15000);
      await P.act('addr-clear');
      await until(() => P.shown('#s-structure'), 5000);
      { const sh = P.$('#s-structure'), fb = P.$('#s-structure .sheet-btns').getBoundingClientRect(), H = P.frame.contentWindow.innerHeight;
        check('the house record\'s Searched, save stays on screen however long the sheet is (v42)', sh.scrollHeight > sh.clientHeight && fb.bottom <= H + 1 && fb.top >= 0, `buttons ${Math.round(fb.top)}-${Math.round(fb.bottom)} of ${H}, sheet ${sh.scrollHeight} in ${sh.clientHeight}`); }
      await P.act('home');
      check('the base sees the volunteer under Volunteers, and the check-in line says so', await until(() => eventText(base, 'Volunteer 4, volunteer checked in as Kim Tran, 512 555 0190, identity not given with 1 person'), 8000) && base.members().find((m) => m.unit_name === 'Volunteer 4').kind === 'volunteer' && await until(() => has('#panel', 'volunteers', 'volunteer 4')), text('#panel').slice(0, 400));
      // v41: the hazard sheet chooses nothing for the crew, offers the urgency words and the new kinds, and a toast never sits over its buttons
      await P.act('hazard');
      await until(() => P.shown('#s-hazard'), 5000);
      check('the hazard sheet opens with nothing chosen: Send waits for a kind, the four urgency words are offered, and the new kinds are there', P.$('#s-hazard [data-action="send-hazard"]').disabled && !P.$('#hazard-chips .chip.on') && P.$$('#hazard-urgency .chip').length === 4 && P.$$('#hazard-chips .chip').some((c) => c.textContent.trim() === 'Person or car in the water') && P.$$('#hazard-chips .chip').some((c) => c.textContent.trim() === 'Tree down, road blocked'), P.text('#s-hazard').slice(0, 240));
      P.$('#s-hazard [data-action="send-hazard"]').disabled = false; P.$('#s-hazard [data-action="send-hazard"]').click();
      await until(() => P.shown('#toast'), 3000);
      const tr = P.$('#toast').getBoundingClientRect(), ft = P.$('#s-hazard .sheet-btns').getBoundingClientRect();
      check('a toast while a sheet is open sits under the header, not over the sheet\'s buttons', /pick what kind/.test(P.text('#toast')) && tr.bottom <= ft.top + 1, `toast bottom ${Math.round(tr.bottom)}, buttons top ${Math.round(ft.top)}: ${P.text('#toast')}`);
      await P.act('home');
      check('the sheet that opened is at its top and nothing is wider than the phone', P.sideways().length === 0, P.sideways().join(' | '));
    }
  } finally { if (P) P.frame.remove(); }
}

async function walkfix(check) {
  autoConfirm(true);
  for (const k of Object.keys(localStorage)) if (/^ic\.field\.(briefed|agency|seen)/.test(k)) localStorage.removeItem(k);
  let P = null;
  try {
    // ---- the base first, while the phone is not there yet: the bars, the toolbar, the sidebar, the card, the photos
    const at = (s) => Math.round($(s).getBoundingClientRect().top);
    check('the bars\' slot is there with nothing open and says so', !$('#bars').hidden && !$('#bars-quiet').hidden && has('#bars-quiet', 'no emergency open', 'no safety message or par') && $('#mayday').hidden && $('#safety').hidden, text('#bars'));
    const mapTop = at('#map'), printTop = at('[data-action="print-214"]'), toolsTop = at('.tools');
    const safetyMsg = await base.sendMessage(uuid(), { ...base.recipientsFor('all'), kind: 'safety', text: 'Stay out of moving water' });
    await until(() => !$('#safety').hidden);
    check('a SAFETY bar takes the slot: the tools, the map and Print 214 do not move (the clerk\'s first click)', !$('#safety').hidden && $('#bars-quiet').hidden && at('#map') === mapTop && at('[data-action="print-214"]') === printTop && at('.tools') === toolsTop, `${at('#map')} vs ${mapTop}, ${at('[data-action="print-214"]')} vs ${printTop}`);
    const parMsg = await base.startPar('all');
    await until(() => has('#safety', 'par', '0 of 3 answered'));
    const alertId = uuid();
    await field.raiseAlert(alertId, { lat: 30.2674, lng: -97.7384, zoneId: ZONE('A-2') });
    await until(() => !$('#mayday').hidden);
    check('a PAR and an emergency beside it share the one row: still nothing below moves', !$('#mayday').hidden && $$('#bars .bar-item').length === 3 && at('#map') === mapTop && at('[data-action="print-214"]') === printTop && $('#bars').getBoundingClientRect().height === 40, `${$$('#bars .bar-item').length} items, bars ${$('#bars').getBoundingClientRect().height} px, map ${at('#map')} vs ${mapTop}`);
    const titles = $$('#bars .bar-item').map((b) => b.title);
    check('the message\'s words come first on the bar, the count of who is waiting after, and the names on hover (v28)', titles.some((t) => /^SAFETY · Stay out of moving water · waiting on Unit 1, Unit 2, Unit 3 · sent/.test(t)) && titles.some((t) => /^PAR · 0 of 3 answered · waiting on Unit 1, Unit 2, Unit 3/.test(t)) && has('#safety', 'safety · stay out of moving water · waiting on 3 units') && has('#mayday', 'emergency · unit 3 needs help') && !!$('#mayday [data-action="ack-alert"]'), titles.join(' | '));

    // the drawing toolbar stays one row and Finish stays put
    const toolsH = $('.tools').getBoundingClientRect().height;
    $('#btn-zone').click();
    mapClick(-90, -60);
    const finishAt1 = $('[data-action="finish-draw"]').getBoundingClientRect();
    mapClick(80, -60); mapClick(80, 40); mapClick(-90, 40);
    const finishAt4 = $('[data-action="finish-draw"]').getBoundingClientRect();
    check('drawing a division: the toolbar stays one row at 1280 and Finish does not move after the first corner', has('#tool-hint', '4 points') && $('.tools').getBoundingClientRect().height === toolsH && finishAt1.left === finishAt4.left && finishAt1.top === finishAt4.top && at('#map') === mapTop, `tools ${toolsH} → ${$('.tools').getBoundingClientRect().height}, Finish ${Math.round(finishAt1.left)},${Math.round(finishAt1.top)} → ${Math.round(finishAt4.left)},${Math.round(finishAt4.top)}`);
    check('the long hint is cut short on one line and whole on hover', $('#tool-hint').scrollWidth >= $('#tool-hint').clientWidth && getComputedStyle($('#tool-hint')).whiteSpace === 'nowrap' && /Finish saves it/.test($('#tool-hint').title), $('#tool-hint').title);
    // Marcus had been typing in Message the field, further down the sidebar, before he pressed Finish
    const side = $('.side');
    const composer = $('#panel form[data-form="message"] input[name="text"]');
    side.scrollTop += composer.getBoundingClientRect().top - side.getBoundingClientRect().top - 200;
    composer.focus();
    $('[data-action="finish-draw"]').click();
    await until(() => $('#panel form[data-form="new-zone"]'));
    await wait(120);
    const nf = $('#panel form[data-form="new-zone"]').getBoundingClientRect(), sr = side.getBoundingClientRect();
    check('after Finish the new-division form is in view, though the sidebar was scrolled down', nf.top >= sr.top - 1 && nf.top < sr.bottom - 60, `form at ${Math.round(nf.top)}, sidebar ${Math.round(sr.top)}–${Math.round(sr.bottom)}, scrolled ${side.scrollTop}`);
    $('[data-action="newzone-discard"]').click();
    await until(() => !!$('#panel [data-home]'));

    // the PIO reading Public information while a message arrives above it
    const pubHead = () => $$('#panel .k').find((k) => /public information/i.test(k.textContent));
    side.scrollTop += pubHead().getBoundingClientRect().top - side.getBoundingClientRect().top - 40;
    await wait(100);
    const before = Math.round(pubHead().getBoundingClientRect().top), scrolled = side.scrollTop;
    await field.sendMessage(uuid(), { ...field.recipientsFor('ops'), kind: 'message', text: 'Water rising at the trailer park entrance' });
    await until(() => has('#panel', 'water rising at the trailer park entrance'));
    await wait(150);
    check('a message arriving above Public information leaves it where the PIO was reading', Math.abs(Math.round(pubHead().getBoundingClientRect().top) - before) <= 1 && side.scrollTop > scrolled, `heading ${before} → ${Math.round(pubHead().getBoundingClientRect().top)}, scroll ${scrolled} → ${side.scrollTop}`);

    // the cleared photos, as the PIO takes them away
    const realClick = HTMLAnchorElement.prototype.click;
    let saved = null;
    HTMLAnchorElement.prototype.click = function () { if (this.download) saved = { name: this.download, href: this.href }; else realClick.call(this); };
    try {
      await base.setPhotoCaption(M().ids.photos[0], 'Water over road'); await base.setPhotoChecked(M().ids.photos[0], true);   // v28: only checked photos leave, with their public caption
      await until(() => base.publicSet().length === 1 && has('#panel', 'download the public set', '1 of 1'));   // the page's own data has the check before the button is pressed
      check('Public information offers the public set as a download', !!$('#panel [data-action="download-public"]') && has('#panel [data-action="download-public"]', 'download the public set'));
      $('#panel [data-action="download-public"]').click();
      await until(() => saved, 6000);
    } finally { HTMLAnchorElement.prototype.click = realClick; }
    const { unzip } = await import('../js/base/photo-export.js');
    const entries = saved ? unzip(new Uint8Array(await (await fetch(saved.href)).arrayBuffer())) : [];
    const pic = entries.find((e) => /\.jpg$/.test(e.name)), caps = entries.find((e) => e.name === 'captions.txt');
    const capText = caps ? new TextDecoder().decode(caps.bytes) : '';
    check('it is one zip named for the incident: the checked photo, named by time and place, and captions.txt', !!saved && /^CEDAR7-public-set-\d{4}-\d\d-\d\d-\d{4}\.zip$/.test(saved.name) && entries.length === 2 && !!pic && /_\d{4}_A-1_riverside-drive-east\.jpg$/.test(pic.name), saved ? saved.name + ' · ' + entries.map((e) => e.name).join(', ') : 'nothing saved');
    const caption = /Water over road\. Riverside Drive, east \(division A-1\), Cedar Fork Flooding, \d+ \w+ \d{4} at \d\d:\d\d\. Photo: Cedar Fork Fire Department\./;
    check('the caption says what, where, when and whose inside the picture; captions.txt carries the time, the place and the public words, with no coordinates', !!pic && caption.test(new TextDecoder('latin1').decode(pic.bytes)) && new TextDecoder('latin1').decode(pic.bytes).includes('ns.adobe.com/xap/1.0/') && /Riverside Drive, east \(division A-1\)\nWater over road/.test(capText) && !/30\.26|-97\.7/.test(capText), capText.slice(0, 300));

    // the facility card: Close closes the card, Mark closed the facility
    const icp = M().ids.facilities ? M().ids.facilities[0] : base.facilities().find((f) => f.kind === 'icp').id;
    const btnSel = document.createElement('button'); btnSel.dataset.action = 'select-facility'; btnSel.dataset.id = icp; btnSel.hidden = true; document.body.appendChild(btnSel); btnSel.click(); btnSel.remove();
    await until(() => $('#panel form[data-form="facility-edit"]'));
    const closeBtn = $('#panel form[data-form="facility-edit"] [data-action="close-panel"]');
    check('the facility card has a plain Close where Close was, and Mark closed beside its Open badge', !!closeBtn && closeBtn.textContent === 'Close' && has('#panel', 'open', 'mark closed') && !$$('#panel button').some((b) => b.textContent.trim() === 'Close' && b.dataset.action === 'close-facility'), text('#panel').slice(0, 200));
    const lines = base.events().length;
    closeBtn.click();
    await until(() => !!$('#panel [data-home]'));
    await wait(200);
    check('Close puts the card away and leaves the command post open, with nothing logged', !base.facility(icp).closed_at && base.events().length === lines && !!$('#panel [data-home]'));
    const btnSel2 = document.createElement('button'); btnSel2.dataset.action = 'select-facility'; btnSel2.dataset.id = icp; btnSel2.hidden = true; document.body.appendChild(btnSel2); btnSel2.click(); btnSel2.remove();
    await until(() => $('#panel [data-action="close-facility"]'));
    $('#panel [data-action="close-facility"]').click();
    await until(() => base.facility(icp).closed_at);
    check('Mark closed closes the facility itself, logged, with Reopen in its place', !!eventText(base, 'Command post: Cedar Fork High School, front office closed') && await until(() => $('#panel [data-action="reopen-facility"]')) && has('#panel', 'closed'));
    $('#panel [data-action="reopen-facility"]').click();
    await until(() => !base.facility(icp).closed_at);

    // a boat ramp placed by Operations
    $('#panel [data-action="close-panel"]') && $('#panel [data-action="close-panel"]').click();
    await until(() => $('#facility-kind'));
    check('Boat ramp is a kind Operations can place', [...$('#facility-kind').options].some((o) => o.value === 'ramp' && o.textContent === 'Boat ramp'));
    $('#facility-kind').value = 'ramp';
    $('#panel [data-action="place-facility"]').click();
    mapClick(30, 70);
    const ramp = await until(() => base.facilities().find((f) => f.kind === 'ramp'));
    await until(() => $('#panel form[data-form="facility-edit"]'));
    const rf = $('#panel form[data-form="facility-edit"]');
    rf.name.value = 'Low-water crossing ramp'; rf.contact.value = 'TAC 3';
    rf.requestSubmit();
    check('placing it is logged as a boat ramp and drawn with its letters', await until(() => eventText(base, 'Boat ramp: Low-water crossing ramp updated')) && !!eventText(base, 'Boat ramp opened') && await until(() => $$('#map .fmark-ramp').length === 1 && $('#map .fmark-ramp').textContent === 'BR'), logTexts()[0]);
    $('#panel [data-action="close-panel"]').click();
    await until(() => !!$('#panel [data-home]'));
    // the safety message, the PAR and the alert answered by Unit 3, so its phone opens on its own screens
    await field.ackMessage(safetyMsg.id, 'Copy');
    await field.answerPar(parMsg.id, true, 2);
    await field.standDown(alertId);
    await until(() => base.alerts().length === 0 && !has('#safety', 'unit 3'));

    // ---- the phone at 375 px
    P = await phoneFrame();
    check('the field app opens at 375 px beside the base as Unit 3', !!P.ready, P.text('#me-name'));
    const brief = P.$('#s-briefing');
    check('Unit 3\'s briefing opens at its top: the situation first, not Safety and the buttons (Reyes, the shelter desk, Moreno)', await until(() => P.shown('#s-briefing')) && brief.scrollTop === 0 && brief.scrollHeight > brief.clientHeight && /situation/i.test(P.$('#briefing-list .k').textContent), `scrollTop ${brief.scrollTop} of ${brief.scrollHeight - brief.clientHeight}`);
    brief.scrollTop = brief.scrollHeight;
    const wasAtEnd = brief.scrollTop;
    await P.act('briefing-later');
    await P.act('menu');
    await P.act('briefing');
    check('read to its end and left, it opens at its top again from the menu', wasAtEnd > 0 && P.shown('#s-briefing') && brief.scrollTop === 0, `left at ${wasAtEnd}, opened at ${brief.scrollTop}`);
    await P.act('briefed');
    // every sheet at phone width
    const wide = [];
    for (const [a, sheet] of [['menu', '#s-menu'], ['inbox', '#s-inbox'], ['compose', '#s-compose'], ['ask', '#s-ask'], ['briefing', '#s-briefing'], ['hurt', '#s-hurt'], ['show-code', '#s-showcode'], ['check-out', '#s-checkout'], ['hazard', '#s-hazard'], ['help', '#s-help'], ['addr-clear', '#s-structure'], ['zone-clear', '#s-clear'], ['home', '#s-home']]) {
      await P.act(a);
      await wait(100);
      if (!P.shown(sheet)) { wide.push(sheet + ' did not open'); continue; }
      const o = P.sideways();
      if (o.length) wide.push(sheet + ': ' + o.join('; '));
    }
    check('no sheet scrolls sideways at 375 px, and every button is whole on screen', wide.length === 0, wide.join(' | '));
    await P.act('inbox');
    const mo = P.$$('#s-inbox .btn').find((b) => b.textContent.trim() === 'Message Operations');
    check('the inbox says "Message Operations" in full, not "Message Opera" (Reyes)', !!mo && mo.scrollWidth <= mo.clientWidth + 1 && mo.getBoundingClientRect().right <= 375, mo ? `${mo.scrollWidth} in ${mo.clientWidth}, right ${Math.round(mo.getBoundingClientRect().right)}` : 'no button');
    mo.click();
    await until(() => P.shown('#s-compose'));
    P.$('#compose-text').value = 'The gym is nearly full';
    await P.act('send-compose');
    await until(() => P.shown('#s-inbox') && /the gym is nearly full/.test(P.text('#inbox-list')));
    check('after sending, the Messages page is whole: not clipped at the left (the shelter desk)', P.sideways().length === 0 && P.$('#s-inbox').scrollLeft === 0 && P.doc().scrollingElement.scrollLeft === 0 && /the gym is nearly full/.test(P.text('#inbox-list')), P.sideways().join('; '));
    // v74: the two sheets share one anatomy: the scale, the stuck flag and the Where switch on Message Operations
    await P.act('compose');
    await until(() => P.shown('#s-compose'));
    if (!P.$('#compose-loc').classList.contains('on')) { await wait(600); await P.act('compose-loc'); }   // the pretend phone's first fix can land after the sheet opened
    check('Message Operations opens with three steps on the scale and nothing lit, the flag off, the spot on with the map, four quick starts, Send to Operations (v74)', P.$$('#compose-scale .step').length === 3 && !P.$('#compose-scale .step.on') && !P.$('#compose-flag').classList.contains('on') && P.$('#compose-loc').classList.contains('on') && !P.$('#compose-map').hidden && P.$$('#compose-chips button').length === 4 && P.$('[data-action="send-compose"]').textContent.trim() === 'Send to Operations', P.text('#s-compose').slice(0, 300));
    P.$('#compose-chips [data-text="Road blocked"]').click();
    await wait(50);
    check('a quick start fills the box and the quick starts go', P.$('#compose-text').value === 'Road blocked' && P.$('#compose-chips').hidden, P.$('#compose-text').value);
    P.$('#compose-scale .step.s-now').click();
    await wait(50);
    P.$('#compose-flag').click();
    await wait(50);
    check('Now fills with a tick, the flag turns on, and the pin takes the step\'s colour', P.$('#compose-scale .step.s-now').classList.contains('on') && /Now/.test(P.$('#compose-scale .step.on').textContent) && P.$('#compose-flag').classList.contains('on') && !!P.$('#compose-map .mpin.urg-now') && P.sideways().length === 0, P.text('#compose-scale') + ' | ' + P.sideways().join('; '));
    await P.act('send-compose');
    await until(() => P.shown('#s-inbox') && /road blocked/.test(P.text('#inbox-list')));
    const stuckMsg = await until(() => base.messages().find((m) => m.text === 'Road blocked'));
    check('the message carries the step and the flag: the phone\'s inbox reads Now and Stuck, the base\'s row too, the 214 says (now, stuck)', !!stuckMsg && stuckMsg.urgency === 'now' && stuckMsg.blocking === true && stuckMsg.lat != null && !!P.$('#inbox-list .badge.stuck') && P.$('#inbox-list .badge.urg-now').textContent === 'Now' && await until(() => $(`#panel .mrow[data-message="${stuckMsg.id}"] .badge.stuck`)) && !!eventText(base, 'Unit 3 to Operations (now, stuck): Road blocked · location attached'), logTexts()[0]);
    // Ask for something: the same anatomy, nothing chosen for the unit, the request's words
    await P.act('ask');
    await until(() => P.shown('#s-ask'));
    check('Ask for something opens with no kind and no step lit, the same scale and flag, the spot on for the division, Send to Logistics (v74)', !P.$('#ask-kinds .chip.on') && P.$$('#ask-scale .step').length === 3 && !P.$('#ask-scale .step.on') && !P.$('#ask-flag').classList.contains('on') && P.$('#ask-where').classList.contains('on') && /for a-2/.test(P.text('#ask-where')) && P.$('[data-action="ask-send"]').textContent.trim() === 'Send to Logistics' && P.sideways().length === 0, P.text('#s-ask').slice(0, 300) + ' | ' + P.sideways().join('; '));
    await P.act('ask-send');
    check('Send with no kind asks for one and stays on the sheet', P.shown('#s-ask') && /pick what you need/.test(P.text('#toast')), P.text('#toast'));
    P.$('#ask-kinds .chip[data-value="equipment"]').click();
    await wait(50);
    P.$('#ask-scale .step.s-nightfall').click();
    await wait(50);
    P.$('#ask-what').value = 'pumps'; P.$('#ask-qty').value = '2';
    await P.act('ask-send');
    const pumps = await until(() => base.requests().find((r) => r.what === 'pumps'));
    check('the request carries its step and no flag: the base\'s card reads Before dark, the 214 ", before dark", the phone lists it with the word', !!pumps && pumps.urgency === 'nightfall' && pumps.blocking === false && pumps.quantity === 2 && pumps.lat != null && await until(() => $(`#panel .req[data-request="${pumps.id}"] .badge.urg-nightfall`)) && $(`#panel .req[data-request="${pumps.id}"] .badge.urg-nightfall`).textContent === 'Before dark' && !$(`#panel .req[data-request="${pumps.id}"] .badge.stuck`) && !!eventText(base, 'Unit 3 asked for 2 pumps for A-2, before dark') && await until(() => /before dark/.test(P.text('#ask-mine'))), logTexts()[0]);
    await P.act('inbox');
    await P.act('home');
    check('Nearby lists the boat ramp with directions (Rosa)', await until(() => /boat ramp/.test(P.text('#nearby'))) && P.$$('#nearby .near').some((r) => /low-water crossing ramp/i.test(r.textContent) && r.querySelector('a.btn[href*="google.com/maps/dir"]')), P.text('#nearby'));

    // a shared phone: sign out, and the next person finds nothing of the last
    P.$('#auth-email').value = 'unit3@mock.local'; P.$('#auth-otp').value = '123456';
    await P.act('menu');
    await P.act('sign-out');
    await until(() => P.shown('#auth'));
    check('after Sign out the sign-in form is empty, the address and the code boxes, back at the box step, and the address does not autofill (the administrator; a code, no password, v73)', P.$('#auth-email').value === '' && P.$('#auth-otp').value === '' && P.shown('#auth-ask') && !P.shown('#auth-enter') && P.$('#auth-email').getAttribute('autocomplete') === 'off' && !P.$('#auth-password'), `${P.$('#auth-email').value} / ${P.$('#auth-otp').value} / ${P.$('#auth-email').getAttribute('autocomplete')}`);
    // the shelter desk volunteer: a new account, a name and a phone, no licence
    await phoneSignIn(P, 'walk-desk@mock.local', true);
    check('a new account sees the check-in form alone: no empty "already in" list above it', P.shown('#join-form') && !P.shown('#join-mine') && P.$('#join-title').textContent === 'Check in to an incident' && P.$('#join-form').agency.value === '', P.text('#join'));
    check('the Identify sheet says a licence is not a condition', await until(() => P.shown('#s-identify')) && /no licence\? your name and phone are enough/.test(P.text('#s-identify')) && /identity not given/.test(P.text('#id-none')));
    P.$('#id-name').value = 'Pat Doe'; P.$('#id-phone').value = '512 555 0199';
    await P.act('id-save');
    check('it saves with a name and a phone, and the check-in line says "identity not given"', await until(() => !P.shown('#s-identify')) && /checking in as pat doe · 512 555 0199 · identity not given: operations checks who you are in person/.test(P.text('#join-you')) && P.$('#join-you').classList.contains('noid'), P.text('#join-you'));
    const jf = P.$('#join-form');
    jf.code.value = 'CEDAR7'; jf.unit.value = 'Gym shelter desk'; jf.agency.value = 'Red Cross';
    jf.requestSubmit();
    const deskIn = await until(() => P.shown('#app') && P.$('#me-name').textContent === 'Gym shelter desk', 6000);
    check('the volunteer checks in without a licence (the shelter desk was LOST here)', !!deskIn && await until(() => eventText(base, 'Gym shelter desk checked in as Pat Doe, 512 555 0199, identity not given with 1 person')), logTexts()[0]);
    check('and her briefing opens at its top too', await until(() => P.shown('#s-briefing')) && brief.scrollTop === 0);
    const desk = base.units().find((u) => u.unit_name === 'Gym shelter desk');
    check('the resources row marks her "no ID"', await until(() => has(`#panel [data-action="select-unit"][data-id="${desk.user_id}"]`, 'pat doe · no id')), text(`#panel [data-action="select-unit"][data-id="${desk.user_id}"]`));
    $('[data-action="people"]').click(); await until(() => !$('#people').hidden);
    $('#people [data-action="people-tab"][data-tab="members"]').click(); await until(() => $(`#people-page .mb-row[data-member="${desk.user_id}"]`));
    check('the Members tab reads "No ID" in orange on her row with Check in person, the same press as Mark verified (v65)', has(`#people-page .mb-row[data-member="${desk.user_id}"] .mb-id`, 'no id', 'check in person') && $(`#people-page .mb-row[data-member="${desk.user_id}"] .idc`).classList.contains('warn') && !!$(`#people-page .mb-row[data-member="${desk.user_id}"] [data-action="verify-profile"]`), text(`#people-page .mb-row[data-member="${desk.user_id}"]`));
    $('#people [data-action="people-tab"][data-tab="people"]').click();
    $('[data-action="close-people"]').click(); await until(() => $('#people').hidden);
    $(`#panel [data-action="select-unit"][data-id="${desk.user_id}"]`).click();
    await until(() => $('#panel .ident'));
    check('her unit panel says "identity not given" and how to verify in person', $('#panel .ident').classList.contains('noid') && has('#panel .ident', 'identity not given', 'not verified', 'check who this is in person', 'pat doe', '512 555 0199') && !$$('#panel .ident .kv .k').some((k) => /licence/i.test(k.textContent)) && !!$('#panel .ident [data-action="verify-profile"]'), text('#panel .ident'));
    $('#panel .ident [data-action="verify-profile"]').click();
    check('Operations can mark her verified in person', await until(() => base.profileOf(desk.user_id) && base.profileOf(desk.user_id).verified_at) && await until(() => has('#panel .ident', 'verified in person')), text('#panel .ident'));
    $('[data-action="people"]').click();
    await until(() => !$('#people').hidden);
    $('[data-action="print-211"]').click();
    await until(() => !$('#briefing').hidden && has('#briefing-title', '211'));
    check('the 211 says so too', has('#briefing-page', 'checked in by pat doe, 512 555 0199, identity not given, verified in person'), text('#briefing-page').slice(0, 300));
    $('[data-action="close-briefing"]').click(); $('[data-action="close-people"]').click();

    // the next person on the same phone (Moreno after the shelter desk)
    await P.act('briefed');
    await P.act('menu');
    await P.act('sign-out');
    await until(() => P.shown('#auth'));
    await phoneSignIn(P, 'walk-deputy@mock.local', true);
    await until(() => P.shown('#s-identify'));
    check('the next account on the phone finds the Agency box empty, not the last unit\'s Red Cross', P.$('#join-form').agency.value === '' && P.$('#join-form').unit.value === '' && P.$('#id-name').value === '', `agency "${P.$('#join-form').agency.value}"`);
    await P.act('id-cancel');
    await P.act('sign-out');
    await until(() => P.shown('#auth'));
    for (const k of Object.keys(P.frame.contentWindow.localStorage)) if (k.startsWith('ic.field.agency')) P.frame.contentWindow.localStorage.removeItem(k);
    await phoneSignIn(P, 'walk-desk@mock.local', false);
    check('the shelter desk back on the phone gets her own agency again, from her own check-in', await until(() => P.$('#join-form').agency.value === 'Red Cross'), `agency "${P.$('#join-form').agency.value}"`);
    const mine = P.$('#join-mine'), form = P.$('#join-form');
    check('someone already in the incident sees it first, above the form (Rosa, Ana)', P.shown('#join-mine') && mine.getBoundingClientRect().bottom <= form.getBoundingClientRect().top && /cedar fork flooding/.test(P.text('#join-list')) && /you are gym shelter desk/.test(P.text('#join-list')) && P.$('#join-title').textContent === 'Check in to another incident', P.text('#join').slice(0, 200));
    check('the check-in page is whole at 375 px', P.sideways().length === 0, P.sideways().join('; '));
    P.$('#join-list [data-action="open-incident"]').click();
    check('one tap on it opens the incident', await until(() => P.shown('#app') && P.$('#me-name').textContent === 'Gym shelter desk'));
  } finally {
    autoConfirm(false);
    if (P) P.frame.remove();
    for (const k of Object.keys(localStorage)) if (/^ic\.field\./.test(k)) localStorage.removeItem(k);
    await wait(100);
  }
}

// ---- people sheltered and moved (v26): a crew's house record gains rows of who went where; a shelter
// desk (a new account, kind Shelter desk) gets People here as its home, signs in the crew's arrivals with
// They're here, signs in a walk-up, moves someone to hospital and asks Operations to look for someone;
// the base's shelter card, find a person, Print the list and the situation report follow. The phone is
// the field app at 375 px in a frame, as in walkfix.
async function evacuees(check) {
  autoConfirm(true);
  for (const k of Object.keys(localStorage)) if (/^ic\.field\./.test(k)) localStorage.removeItem(k);
  let P = null;
  const gym = M().ids.facilities[2], dell = M().ids.facilities[3];
  const rec = (label) => base.evacuees(true).find((e) => e.label === label) || null;
  const openFacility = async (id) => {
    const b = document.createElement('button'); b.dataset.action = 'select-facility'; b.dataset.id = id; b.hidden = true; document.body.appendChild(b); b.click(); b.remove();
    return until(() => $('#panel form[data-form="facility-edit"]') && $('#panel .title') && base.facility(id) && $('#panel .title').textContent.startsWith(base.facility(id).name));
  };
  try {
    check('seeded: 9 people in 3 records at the gym, a family of 4 on its way from Unit 3, Maria Alvarez sent to Dell Seton', base.evacuees().filter((e) => e.facility_id === gym && e.status === 'here').reduce((n, e) => n + e.count, 0) === 9 && rec('family of 4').status === 'on_the_way' && rec('family of 4').logged_by === USERS().unit3 && rec('Maria Alvarez, 78').status === 'moved' && rec('Maria Alvarez, 78').facility_id === dell && base.facility(gym).beds === 60);

    // ---- a crew's house record (Unit 3's phone): People needing help gains rows
    // three more runs to the gym first, so the row's cards fold past three (v66); the sheet draws its rows once, when opened
    for (const [label, mins] of [['Bus 7', 200], ['Van 8', 220], ['Boat run 9', 240]]) await base.addTransport(uuid(), { kind: label.startsWith('Bus') ? 'bus' : label.startsWith('Van') ? 'van' : 'boat', label, from_text: 'Staging, east lot', to_facility_id: gym, capacity: 12, leaves_at: new Date(Date.now() + mins * 60000).toISOString(), expected_at: new Date(Date.now() + (mins + 25) * 60000).toISOString(), status: 'planned' });
    P = await phoneFrame();
    check('the field app opens at 375 px as Unit 3', !!P.ready);
    await P.act('briefed');
    await P.act('addr-clear');
    P.$('#structure-label').value = '114 Pecan Ln';
    await P.act('help-up');
    // Went to is a chip row and On which run a row of cards (v66): the words from rules.js, the nearest shelter lit
    const whereChips = (i) => P.$$('#st-people .st-row')[i].querySelectorAll('.chips.where .chip');
    const runTops = (i) => [...P.$$('#st-people .st-row')[i].querySelectorAll('.chips.runs .rcard')].map((c) => (c.querySelector('.l1') || c).textContent.trim());
    const lit = (i, sel) => { const c = [...P.$$('#st-people .st-row')[i].querySelectorAll(sel + ' .on')]; return c.length === 1 ? c[0].dataset.v : null; };
    check('the first person counted opens a row: who, condition, Went to as chips (the shelter, the hospital, the ways of leaving) with the nearest shelter lit, no drop-down', P.$$('#st-people .st-row').length === 1 && lit(0, '.chips.where') === 'f:' + gym && [...whereChips(0)].map((c) => c.textContent).join('|') === 'High school gym|Dell Seton Medical Center|With family|Own transport|Not known' && !P.$('#st-people select'), [...whereChips(0)].map((c) => c.textContent).join('|'));
    await P.act('st-person-add');
    check('On which run under the place: Not on a run first and lit, Bus 3 then the three new runs, folded past three to the first two and "2 more"; Bus 2, which has left, is not offered', runTops(0).join('|') === 'Not on a run|Bus 3 → High school gym|Bus 7 → High school gym|2 more' && lit(0, '.chips.runs') === '', runTops(0).join('|'));
    P.$$('#st-people .st-row')[0].querySelector('[data-action="st-runs-more"]').click();
    check('More opens them all', runTops(0).join('|') === 'Not on a run|Bus 3 → High school gym|Bus 7 → High school gym|Van 8 → High school gym|Boat run 9 → High school gym' && /^leaves \d\d:\d\d · expected \d\d:\d\d · 0 of 40$/.test(P.$$('#st-people .st-row')[0].querySelector('.chips.runs .rcard[data-v] .l2').textContent), runTops(0).join('|'));
    const fill = (i, who, cond, where) => { P.$$('#st-people [data-stp="who"]')[i].value = who; P.$$('#st-people [data-stp="cond"]')[i].value = cond; P.$$('#st-people .st-row')[i].querySelector(`[data-action="st-where"][data-v="${where}"]`).click(); };
    fill(0, 'Reyes, family of 2', 'cold, a cat', 'f:' + gym);
    fill(1, 'Mr. Okafor, 81', 'on oxygen, short of breath', 'f:' + dell);
    check('a place tapped lights its chip and keeps the typed words; no open run goes to Dell Seton, so Mr. Okafor\'s row has no run row', lit(1, '.chips.where') === 'f:' + dell && P.$$('#st-people [data-stp="who"]')[1].value === 'Mr. Okafor, 81' && !P.$$('#st-people .st-row')[1].querySelector('.chips.runs') && !!P.$$('#st-people .st-row')[0].querySelector('.chips.runs'), lit(1, '.chips.where'));
    P.$('#st-people').dispatchEvent(new P.frame.contentWindow.Event('input', { bubbles: true }));
    check('the help count follows the rows: a family of 2 and one man is 3', P.text('#help-count') === '3', P.text('#help-count'));
    check('the structure sheet is whole at 375 px with its rows', P.sideways().length === 0, P.sideways().join('; '));
    await P.act('save-structure');
    const reyes = await until(() => rec('Reyes, family of 2')), okafor = await until(() => rec('Mr. Okafor, 81'));
    const house = reyes && base.structure(reyes.structure_id);
    check('each row is a record linked to the house: the family on its way to the gym, Mr. Okafor moved to hospital', !!reyes && reyes.status === 'on_the_way' && reyes.facility_id === gym && reyes.count === 2 && reyes.needs.join() === 'pets' && reyes.note === 'cold, a cat' && reyes.from_text === '114 Pecan Ln' && !!house && house.label === '114 Pecan Ln' && house.people_needing_help === 3
      && !!okafor && okafor.status === 'moved' && okafor.facility_id === dell && okafor.needs.join() === 'oxygen' && okafor.structure_id === reyes.structure_id, JSON.stringify([reyes, okafor].map((e) => e && [e.status, e.count, e.needs, e.from_text])));
    check('the log says who the crew sent where', await until(() => eventText(base, 'Unit 3 sent Reyes, family of 2 from 114 Pecan Ln to High school gym, needs pets')) && !!eventText(base, 'Unit 3 sent Mr. Okafor, 81 from 114 Pecan Ln to Dell Seton Medical Center, needs oxygen'), logTexts().slice(0, 3).join(' | '));
    await openFacility(gym);
    check('the gym card on the base shows the crew\'s records on their way, live', await until(() => has('#panel', 'on the way from crews · 6 people', 'reyes, family of 2', '6 on their way from crews')), text('#panel').slice(0, 600));

    // ---- the shelter desk: a new account on the same phone, kind Shelter desk
    await P.act('menu');
    await P.act('sign-out');
    await until(() => P.shown('#auth'));
    await phoneSignIn(P, 'evac-desk@mock.local', true);
    await until(() => P.shown('#s-identify'));
    P.$('#id-name').value = 'Pat Doe'; P.$('#id-phone').value = '512 555 0199';
    await P.act('id-save');
    check('Shelter desk is a kind at check-in', P.$$('#join-kind .chip').some((c) => c.textContent === 'Shelter desk'), P.text('#join-kind'));
    await P.act('jp-kind', { kind: 'shelter_desk' });
    const jf = P.$('#join-form');
    jf.code.value = 'CEDAR7'; jf.unit.value = 'Gym desk'; jf.agency.value = 'Red Cross';
    jf.requestSubmit();
    check('she checks in as a shelter desk, said in the check-in line', await until(() => P.shown('#app') && P.$('#me-name').textContent === 'Gym desk', 6000) && await until(() => eventText(base, 'Gym desk, shelter desk checked in as Pat Doe, 512 555 0199, identity not given with 1 person')), logTexts()[0]);
    check('her briefing gives her job as People here at the gym, not waiting at staging', await until(() => P.shown('#s-briefing') && /people here at high school gym/.test(P.text('#briefing-list'))) && /they're here/.test(P.text('#briefing-list')) && !/wait at staging/.test(P.text('#briefing-list')), P.text('#briefing-list').slice(0, 400));
    await P.act('briefed');
    check('her home is People here: the gym\'s count against its beds, no division card and no search buttons', await until(() => P.shown('#desk') && /high school gym · 9 of 60/.test(P.text('#desk-head'))) && !P.shown('.actions') && !P.shown('#assignment') && !P.shown('#mini') && P.shown('.help'), P.text('#desk-head'));
    const desk = base.units().find((u) => u.unit_name === 'Gym desk');
    check('the desk\'s shelter is saved on her unit, so the base knows whose desk it is', await until(() => base.member(desk.user_id).facility_id === gym) && base.member(desk.user_id).kind === 'shelter_desk');
    check('Arriving lists the records on their way here, with who sent them: the Reyes family on no run as a row, the family of 4 under Bus 2 (v54)', P.$$('#desk-arriving .arrive').length === 1 && /reyes, family of 2 from 114 pecan ln · a-2 · unit 3/.test(P.text('#desk-arriving')) && P.$$('#desk-arriving .arrive-run').length >= 1 && /bus 2 from pecan park pickup/.test(P.text('#desk-arriving')) && /family of 4 · from 112 pecan ln/.test(P.text('#desk-arriving')), P.text('#desk-arriving'));
    check('People here at 375 px: nothing sideways, every button whole', P.sideways().length === 0, P.sideways().join('; '));

    // They're here: one tap signs the crew's record in, then the name
    P.$$('#desk-arriving .arrive').find((r) => /reyes/i.test(r.textContent)).querySelector('[data-action="ev-arrived"]').click();
    await until(() => P.shown('#s-person'));
    check('They\'re here signs the crew\'s record in at once (not a second record) and asks for the name', await until(() => rec('Reyes, family of 2') && rec('Reyes, family of 2').status === 'here') && rec('Reyes, family of 2').signed_in_by === desk.user_id && base.evacuees().filter((e) => /reyes/i.test(e.label)).length === 1 && P.$('#person-title').textContent === 'Signed in: Reyes, family of 2' && P.$('#ev-cancel').textContent === 'Not now' && P.$('#ev-save').textContent === 'Save the name', P.$('#person-title').textContent);
    check('the sign-in is logged at the shelter', await until(() => eventText(base, 'High school gym: Gym desk signed in Reyes, family of 2, from 114 Pecan Ln, needs pets')), logTexts()[0]);
    check('the sheet is whole at 375 px', P.sideways().length === 0, P.sideways().join('; '));
    P.$('#ev-who').value = 'Reyes, Ana and Luis';
    await P.act('ev-save');
    check('the name she adds is on the record and in the log', await until(() => eventText(base, 'Reyes, family of 2 now on record as Reyes, Ana and Luis (2)')) && !!rec('Reyes, Ana and Luis'), logTexts()[0]);
    check('her count is 11 of 60 now, the arrival gone from Arriving', await until(() => /11 of 60/.test(P.text('#desk-head'))) && P.$$('#desk-arriving .arrive').length === 0 && /family of 4/.test(P.text('#desk-arriving')), P.text('#desk-head') + ' | ' + P.text('#desk-arriving').slice(0, 120));

    // a walk-up, with only who and a need
    await P.act('ev-new');
    check('Sign in a person: only Who is needed, Where now is here', P.shown('#s-person') && P.$('#ev-save').textContent === 'Sign in here' && P.$('#ev-where').value === 'f:' + gym && /^here, high school gym$/i.test(P.$('#ev-where').selectedOptions[0].textContent));
    P.$('#ev-who').value = 'family of 5, Garza';
    P.$('#ev-who').dispatchEvent(new P.frame.contentWindow.Event('input', { bubbles: true }));
    check('"family of 5" fills How many', P.$('#ev-count').value === '5', P.$('#ev-count').value);
    P.$('#ev-who').value = 'Lopez, Ana';
    P.$('#ev-who').dispatchEvent(new P.frame.contentWindow.Event('input', { bubbles: true }));
    await P.act('ev-need', { need: 'insulin' });
    P.$('#ev-from').value = 'Bee Creek Rd';
    await P.act('ev-save');
    check('a walk-up is signed in with only who and a need, and logged', await until(() => rec('Lopez, Ana')) && rec('Lopez, Ana').status === 'here' && rec('Lopez, Ana').count === 1 && rec('Lopez, Ana').needs.join() === 'insulin' && await until(() => eventText(base, 'High school gym: Gym desk signed in Lopez, Ana, from Bee Creek Rd, needs insulin')));
    check('newest first on her list', await until(() => /lopez, ana/.test((P.$('#desk-here .ev-row') || { textContent: '' }).textContent.toLowerCase())), P.text('#desk-here').slice(0, 200));

    // a move: Nguyen, Tam to Dell Seton
    P.$$('#desk-here .ev-row').find((r) => /nguyen/i.test(r.textContent)).click();
    await until(() => P.shown('#s-person') && P.$('#person-title').textContent === 'Nguyen, Tam');
    P.$('#ev-where').value = 'f:' + dell;
    await P.act('ev-save');
    check('a move: to Dell Seton, logged from where to where, the shelter it left remembered', await until(() => rec('Nguyen, Tam').status === 'moved') && rec('Nguyen, Tam').facility_id === dell && rec('Nguyen, Tam').prev_facility_id === gym && await until(() => eventText(base, 'Nguyen, Tam moved from High school gym to Dell Seton Medical Center')), logTexts()[0]);
    check('he stays on the gym\'s list under Left here, with where he went', await until(() => /left here/.test(P.text('#desk-here')) && /nguyen, tam.*dell seton medical center since \d\d:\d\d/.test(P.text('#desk-here'))), P.text('#desk-here'));

    // find a person on the phone; Not listed? asks Operations
    const typeFind = async (q) => { P.$('#desk-q').value = q; P.$('#desk-q').dispatchEvent(new P.frame.contentWindow.Event('input', { bubbles: true })); await wait(100); };
    await typeFind('alvarez');
    check('Find a person, any shelter or hospital: Maria Alvarez at Dell Seton since when, and from where', /maria alvarez, 78/.test(P.text('#desk-results')) && /dell seton medical center since \d\d:\d\d · from 112 pecan ln/.test(P.text('#desk-results')), P.text('#desk-results'));
    await typeFind('Rosa Diaz');
    check('nobody on record: it says so, and Not listed? offers to ask Operations', /nobody on record matches "rosa diaz"/.test(P.text('#desk-results')) && !!P.$('#desk-results [data-action="ev-ask"]'), P.text('#desk-results'));
    await P.act('ev-ask');
    check('Operations gets "Looking for Rosa Diaz" with the desk\'s number', await until(() => base.messages().find((m) => m.text === 'Looking for Rosa Diaz. Not on any shelter or hospital record. Call Gym desk at High school gym on 512 555 0199.')), base.messages()[0] && base.messages()[0].text);
    await typeFind('');

    // ---- the base: the gym's card
    await openFacility(gym);
    check('the gym card: beds against the count, expected with the live count, needs, the desk', await until(() => has('#panel', 'beds', '11 of 60', 'bus 2 from pecan park, 12 people, 17:30', '4 on their way from crews', '1 insulin · 1 infant · 2 pets', 'gym desk')), text('#panel').slice(0, 700));
    const rows = () => $$('#panel .ev-box:not(.arriving) .ev-grid').length ? $$('#panel .ev-box:not(.arriving) .ev-grid')[0].querySelectorAll('.ev-r') : [];
    check('People here, newest first: Lopez, then the Reyes family', /lopez, ana/i.test(rows()[0] ? rows()[0].textContent : '') && /reyes, ana and luis/i.test(rows()[1] ? rows()[1].textContent : ''), [...rows()].map((r) => r.textContent.trim().slice(0, 30)).join(' | '));
    check('a moved record shows where it went', /nguyen, tam[\s\S]*dell seton medical center since \d\d:\d\d/i.test(text('#panel')), text('#panel').slice(-600));
    const ff = $('#panel form[data-form="facility-edit"]');
    check('the typed Expected box is gone from the gym\'s card because runs are coming here; the board says who is coming (v54)', !ff.expected && has('#panel', 'the runs on the transports board say who is coming') && !!$('#panel .ev-box.coming'), text('#panel').slice(0, 300));
    ff.beds.value = '40';
    ff.requestSubmit();
    check('beds are set on the card, logged, and the count reads against them', await until(() => eventText(base, 'Shelter: High school gym has 40 beds')) && !eventText(base, 'Shelter: High school gym updated') && await until(() => has('#panel', '11 of 40')), logTexts().slice(0, 3).join(' | '));
    check('the desk\'s phone follows: 11 of 40', await until(() => /11 of 40/.test(P.text('#desk-head'))), P.text('#desk-head'));
    $('#panel [data-action="ev-add-toggle"]').click();
    const af = await until(() => $('#panel form[data-form="evacuee-add"]'));
    af.label.value = 'Haddad, Omar'; af.querySelector('input[name="need"][value="wheelchair"]').checked = true; af.from.value = 'Mill Street';
    af.requestSubmit();
    check('Operations signs a person in from the card', await until(() => rec('Haddad, Omar') && rec('Haddad, Omar').status === 'here') && rec('Haddad, Omar').signed_in_by === USERS().ops && await until(() => eventText(base, 'High school gym: Operations signed in Haddad, Omar, from Mill Street, needs wheelchair')) && await until(() => /haddad, omar/i.test(rows()[0] ? rows()[0].textContent : '')));
    const fam3 = rec('family of 3');
    const sel = $(`#panel select[data-select="ev-where"][data-id="${fam3.id}"]`);
    sel.value = 'with_family'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    check('Where now on a row: the family of 3 left with family, logged, kept under Left here', await until(() => rec('family of 3').status === 'with_family') && await until(() => eventText(base, 'family of 3 (3) left High school gym with family') || eventText(base, 'family of 3 left High school gym with family')) && await until(() => /family of 3[\s\S]*left high school gym with family at/i.test(text('#panel'))), logTexts()[0]);

    // find a person from the header
    $('#find-q').value = 'nguyen'; $('#find-q').dispatchEvent(new Event('input', { bubbles: true }));
    check('the header\'s Find a person answers where a person is now and since when, and finds the responders too', await until(() => !$('#find-pop').hidden && has('#find-pop', 'nguyen, tam', 'dell seton medical center since', 'responders', 'responder on unit 2')), text('#find-pop'));
    $$('#find-pop .find-row').find((r) => /nguyen, tam/i.test(r.textContent)).querySelector('[data-action="select-facility"]').click();
    check('Open on a result opens the place the record says, and closes the search', await until(() => has('#panel .title', 'dell seton') && $('#find-pop').hidden) && has('#panel', 'people sent here', 'nguyen, tam', 'mr. okafor, 81', 'maria alvarez, 78'), text('#panel').slice(0, 300));
    $('#find-q').value = 'zzz'; $('#find-q').dispatchEvent(new Event('input', { bubbles: true }));
    check('nobody matching says so', await until(() => has('#find-pop', 'nobody on record matches "zzz"')));
    document.body.click();
    check('a click elsewhere closes it', await until(() => $('#find-pop').hidden && $('#find-q').value === ''));
    // the home panel's line per place, and its own find box
    $('#panel [data-action="close-panel"]').click();
    await until(() => !!$('#panel [data-home]'));
    check('the home panel lists people sheltered and moved per place', has('#panel', 'people sheltered and moved', 'high school gym', '9 of 40 beds', '4 on the way', 'dell seton medical center', '3 sent here'), text('#panel').slice(0, 200));
    const hf = $('#panel [data-find="home"]');
    hf.value = 'okafor'; hf.dispatchEvent(new Event('input', { bubbles: true }));
    check('its find box finds Mr. Okafor at Dell Seton, brought out by Unit 3', has('#panel [data-find-results="home"]', 'mr. okafor, 81', 'dell seton medical center since', 'brought out by unit 3'), text('#panel [data-find-results="home"]'));
    hf.value = ''; hf.dispatchEvent(new Event('input', { bubbles: true })); hf.blur();

    // a log line opens where the person is
    const line = $$('#log .log-row').find((r) => /nguyen, tam moved from/i.test(r.textContent));
    check('a log line about a person opens where the record says they are', !!line && !!line.querySelector('[data-action="select-evacuee"]'));
    line.querySelector('[data-action="select-evacuee"]').click();
    check('...the hospital, for Nguyen, Tam', await until(() => has('#panel .title', 'dell seton')));

    // Print the list
    await openFacility(gym);
    $('#panel [data-action="print-shelter"]').click();
    check('Print the list: the people at the gym by name, for the incident only', await until(() => !$('#briefing').hidden && has('#briefing-title', 'people at high school gym')) && has('#briefing-page', 'beds: 9 of 40 taken', 'here now, newest first', 'haddad, omar', 'lopez, ana', 'on the way from crews', 'family of 4', 'left here', 'nguyen, tam', 'never for public release'), text('#briefing-page').slice(0, 500));
    $('[data-action="close-briefing"]').click();

    // the situation report: counts, never a name
    $('[data-action="sitrep"]').click();
    await until(() => !$('#briefing').hidden && has('#briefing-title', 'situation report'));
    check('the situation report says people sheltered, beds, moved to hospital, expected and records with no name yet', has('#briefing-page', 'people sheltered: 9 at high school gym (40 beds), 3 moved to hospital, 4 expected · 2 records with no name yet')   /* the typed line no longer counts once a run comes (v54) */, (text('#briefing-page').match(/people sheltered[^.]*/) || [''])[0]);
    check('and no name of anyone sheltered or moved appears in it', !/alvarez|okafor|nguyen|reyes|lopez|haddad|okonkwo/i.test($('#briefing-page').innerText));
    $('[data-action="close-briefing"]').click();

    // the rules: another unit cannot change a record it did not make; the crew can correct its own; nothing is deleted
    const c1 = window.supabase.createClient();
    await mockSignIn(c1, 'unit1@mock.local');
    const u1 = new Data(c1); await u1.init(); await u1.open(INC());
    let refused = false;
    try { await u1.updateEvacuee(rec('Lopez, Ana').id, { status: 'unknown' }); } catch (e) { refused = true; }
    check('another unit cannot move a record it did not make', refused && rec('Lopez, Ana').status === 'here');
    u1.close();
    const fixed = await field.updateEvacuee(rec('Mr. Okafor, 81').id, { note: 'by ambulance, on oxygen' });
    check('the crew that made a record can still correct it', fixed.note === 'by ambulance, on oxygen');
    const del = await window.sb.from('ic_evacuees').delete().eq('id', rec('Lopez, Ana').id);
    check('nothing is deleted: a record is moved or withdrawn', !!del.error && !!rec('Lopez, Ana'));
  } finally {
    autoConfirm(false);
    if (P) P.frame.remove();
    if (!$('#briefing').hidden) $('[data-action="close-briefing"]').click();
    for (const k of Object.keys(localStorage)) if (/^ic\.field\./.test(k)) localStorage.removeItem(k);
    await wait(100);
  }
}

// Members and roles, and the personal records that clear by rule (v27, migration 0019): the Operations
// code on the home panel, the role following the code, the Members tab with Make Operations / Make a
// unit / Remove / Restore, the removed phone's notice and its queued rows, and the clearing from the picker.
async function members(check) {
  autoConfirm(true);   // the role questions (v62); the unit's name goes through #name-dialog (v44)
  let P = null, relief = null;
  try {
    const U = USERS(), opsCode = M().ids.opsCode;
    $('#inc-code').click(); await until(() => !$('#codes-pop').hidden);
    check('the codes\' card shows the Operations code as dots until Show is pressed, then the code, with Copy and New code, and says it never goes on paper (v60)', has('#codes-pop', 'operations code', '••••••••', 'never on paper') && !text('#codes-pop').includes(opsCode.toLowerCase()) && !!$('#codes-pop [data-action="ops-show"]') && (() => { $('#codes-pop [data-action="ops-show"]').click(); return has('#codes-pop', opsCode.toLowerCase()) && !!$('#codes-pop [data-action="new-ops-code"]') && !!$('#codes-pop [data-action="copy-ops-code"]'); })(), text('#codes-pop').slice(0, 400));
    check('a unit cannot read it', !field.opsCode() && ((await field.sb.from('ic_ops_codes').select('*')).data || []).length === 0);
    check('the join box and the join card do not carry it', !$('#codes-pop .join-box').textContent.includes(opsCode) && !joinCardTextOf().includes(opsCode));
    // the role follows the code
    const c = window.supabase.createClient();
    await mockSignIn(c, 'relief@mock.local');
    relief = new Data(c); await relief.init();
    await relief.saveProfile({ full_name: 'Relief Chief', phone: '512 555 0177', licence_number: 'R5551212', licence_state: 'TX', date_of_birth: '1979-05-05', address: '4 Oak St, Cedar Fork', id_source: 'typed' });
    const e1 = await (async () => { try { await relief.join('CEDAR7', 'ops', 'Operations'); return null; } catch (e) { return e; } })();
    check('the base holding the units\' join code is told which code it needs', !!e1 && /join code for field units/.test(e1.message), e1 && e1.message);
    await relief.join(opsCode, 'unit', 'Whatever');
    await until(() => base.member(relief.user.id));
    check('the Operations code makes the member Operations, whatever the phone meant, and the log says so', base.member(relief.user.id).role === 'ops' && await until(() => eventText(base, 'Operations joined as Operations with the Operations code as Relief Chief, 512 555 0177, licence typed')), logTexts()[0]);
    await relief.open(INC());
    check('and they read the code too', relief.opsCode() === opsCode);
    $('#codes-pop [data-action="new-ops-code"]').click();
    await until(() => base.opsCode() && base.opsCode() !== opsCode);
    check('New code gives a new eight-letter code, logged without the code itself, and the panel shows it', base.opsCode().length === 8 && !!eventText(base, 'Operations code replaced; the old one no longer joins') && await until(() => has('#codes-pop', base.opsCode().toLowerCase())) && !base.events().some((e) => e.text.includes(opsCode)), logTexts()[0]);
    const e2 = await (async () => { try { await relief.join(opsCode, 'unit', 'X'); return null; } catch (e) { return e; } })();
    check('the old code no longer joins', !!e2 && /No active incident has the code/.test(e2.message), e2 && e2.message);
    // the Members tab
    $('[data-action="people"]').click();
    await until(() => !$('#people').hidden);
    $('#people [data-action="people-tab"][data-tab="members"]').click();
    await until(() => $('#people-page .mb-list'));
    check('the Members tab is two groups, Operations (the opener first) and Units (the status word beside the name), each row with who, name · phone · agency and the Identity column (v65)', has('#people-page', '5 members · 2 operations', 'operations · 2', 'units · 3', 'marcus bell · opened the incident', 'relief chief · since', 'unit 1, engine', 'assigned', 'a-1', 'ana ramirez · 512 555 0111 · cedar fork fire department', 'id checked ✓', 'unit 2, boat crew', 'minh nguyen · 512 555 0122', 'id given, not checked') && $$('#people-page .mb-list').length === 2 && $$('#people-page .mb-list')[0].querySelector('.mb-row').dataset.member === U.ops && $$('#people-page .mb-row [data-action="member-menu"]').length === 4 && $$('#people-page .mb-row [data-action="member-check"]').length >= 2 && $$('#people-page .mb-row [data-action="select-unit"]').length === 3 && $('#people-head').hidden, text('#people-page').slice(0, 600));
    check('the opener has no Make a unit and no Remove; the others do, in the row\'s ··· menu', !$(`#people-page .mb-row[data-member="${U.ops}"] [data-action="member-role"]`) && !$(`#people-page .mb-row[data-member="${U.ops}"] [data-action="member-remove"]`) && !$(`#people-page .mb-row[data-member="${U.ops}"] [data-action="member-menu"]`) && !!$(`#people-page .mb-row[data-member="${relief.user.id}"] .mb-menu [data-action="member-role"][data-role="unit"]`) && !!$(`#people-page .mb-row[data-member="${U.unit1}"] .mb-menu [data-action="member-role"][data-role="ops"]`) && !!$(`#people-page .mb-row[data-member="${U.unit1}"] .mb-menu [data-action="member-remove"]`));
    const menuOpen = () => !!$('#people-page .mb-menu:not([hidden])');
    $(`#people-page .mb-row[data-member="${U.unit1}"] [data-action="member-menu"]`).click();
    await until(() => $(`#people-page .mb-row[data-member="${U.unit1}"] .mb-menu:not([hidden])`));
    check('··· opens the row\'s menu: Make Operations… and Remove · kept on record; a click outside closes it, so does Escape, the board staying open (v65)', has(`#people-page .mb-row[data-member="${U.unit1}"] .mb-menu`, 'make operations…', 'remove · kept on record') && $(`#people-page .mb-row[data-member="${U.unit1}"] [data-action="member-menu"]`).getAttribute('aria-expanded') === 'true' && (() => { $('#people-page .pp-count').click(); return !menuOpen(); })() && (() => { $(`#people-page .mb-row[data-member="${U.unit1}"] [data-action="member-menu"]`).click(); return menuOpen(); })() && (() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return !menuOpen() && !$('#people').hidden; })(), text(`#people-page .mb-row[data-member="${U.unit1}"] .mb-act`));
    $(`#people-page .mb-row[data-member="${U.unit2}"] [data-action="member-check"]`).click();
    await until(() => $('#people').hidden && has('#panel .title', 'unit 2') && $('#panel .ident') && !$('#panel .ident').classList.contains('folded'));
    check('Check on "ID given, not checked" opens the unit\'s panel with the identity unfolded, where Mark verified is (v65)', $('#people').hidden && has('#panel .title', 'unit 2') && !$('#panel .ident').classList.contains('folded') && !!$('#panel .ident [data-action="verify-profile"]'), text('#panel .ident').slice(0, 200));
    $('[data-action="people"]').click();
    await until(() => !$('#people').hidden && $('#people-page .mb-list'));
    autoConfirm(false);   // read the question itself (v62)
    $(`#people-page .mb-row[data-member="${relief.user.id}"] [data-action="member-role"][data-role="unit"]`).click();
    await until(() => $('#confirm-dialog').open);
    check('Make a unit… asks in the app\'s own dialog, mirroring Make Operations: they check in on a phone, hold divisions and send reports; the base is Operations\' alone (v65)', has('#confirm-title', 'make relief chief a unit?') && has('#confirm-text', 'they check in on a phone, hold divisions and send reports; the base is operations\' alone', 'what changes', '"relief chief is now a unit"') && $('#confirm-ok').textContent === 'Make a unit' && $('#confirm-cancel').textContent === 'Cancel', text('#confirm-title') + ' | ' + text('#confirm-text'));
    $('#confirm-ok').click();
    autoConfirm(true);
    await until(() => $('#name-dialog').open);   // the app's own sheet, not prompt() (v44)
    $('#name-input').value = 'Unit 9'; $('#name-form').requestSubmit();
    check('Make a unit asks for the unit name, changes the role and logs it by name', await until(() => base.member(relief.user.id).role === 'unit' && base.member(relief.user.id).unit_name === 'Unit 9') && await until(() => eventText(base, 'Relief Chief is now a unit, Unit 9')), logTexts()[0]);
    await until(() => $(`#people-page .mb-row[data-member="${relief.user.id}"] [data-action="member-role"][data-role="ops"]`));
    autoConfirm(false);   // read the question itself (v62)
    $(`#people-page .mb-row[data-member="${relief.user.id}"] [data-action="member-menu"]`).click();
    await until(() => $(`#people-page .mb-row[data-member="${relief.user.id}"] .mb-menu:not([hidden])`));
    $(`#people-page .mb-row[data-member="${relief.user.id}"] .mb-menu:not([hidden]) [data-action="member-role"][data-role="ops"]`).click();
    await until(() => $('#confirm-dialog').open);
    check('pressing the item closes the menu', !menuOpen());
    check('Make Operations asks in the app\'s own dialog: what they get, what changes, the 214\'s line, and the button reads Make Operations (v62)', $('#confirm-dialog').open && has('#confirm-title', 'make unit 9 operations?') && has('#confirm-text', 'they get', 'the operations code', 'what changes', 'their phone stops showing a unit\'s briefing', '"unit 9 is now operations"') && $('#confirm-ok').textContent === 'Make Operations' && $('#confirm-cancel').textContent === 'Cancel', text('#confirm-title') + ' | ' + text('#confirm-text'));
    $('#confirm-ok').click();
    autoConfirm(true);
    check('Make Operations changes it back and logs it', await until(() => base.member(relief.user.id).role === 'ops') && await until(() => eventText(base, 'Unit 9 (Relief Chief) is now Operations')), logTexts()[0]);
    const e3 = await (async () => { try { await base.setRole(U.ops, 'unit'); return null; } catch (e) { return e; } })();
    check('the person who opened the incident cannot be demoted', !!e3 && /always Operations/.test(e3.message) && base.member(U.ops).role === 'ops', e3 && e3.message);
    const e4 = await (async () => { try { await field.setRole(U.unit3, 'ops'); return null; } catch (e) { return e; } })();
    check('a unit cannot make itself Operations', !!e4 && /Only Operations/.test(e4.message) && base.member(U.unit3).role === 'unit', e4 && e4.message);
    relief.close(); relief = null;
    // removal: Unit 3 on its phone, holding A-2 with two people
    P = await phoneFrame();
    check('the phone is open as Unit 3', !!P.ready);
    $(`#people-page .mb-row[data-member="${U.unit3}"] [data-action="member-remove"]`).click();
    await until(() => base.member(U.unit3) && base.member(U.unit3).removed_at);
    const u3 = base.member(U.unit3);
    check('Remove archives the membership: checked out, stamped by whom, one line by unit and name, no check-out line', !!u3.removed_at && u3.removed_by === U.ops && u3.status === 'checked_out' && !!eventText(base, 'Unit 3 (Jordan Lee Hale) removed from the incident by Operations') && !eventText(base, 'Unit 3 checked out'), logTexts()[0]);
    check('its division goes back to not started and its people are checked out', base.zone(ZONE('A-2')).assigned_to === null && base.zone(ZONE('A-2')).status === 'open' && base.unitPeople(U.unit3).length === 2 && base.unitPeople(U.unit3).every((p) => p.checked_out_at));
    check('it is off the members and the units, kept under removed', !base.members().some((m) => m.user_id === U.unit3) && !base.units().some((m) => m.user_id === U.unit3) && base.removedMembers().some((m) => m.user_id === U.unit3));
    check('the Members tab shows it under Removed with Restore', await until(() => has('#people-page', 'removed · kept, never deleted') && !!$(`#people-page .mb-row.gone[data-member="${U.unit3}"] [data-action="member-restore"]`)), text('#people-page').slice(-300));
    check('the phone shows it was removed, with Sign out', await until(() => P.shown('#s-removed') && /you were removed from cedar fork flooding by operations/.test(P.text('#s-removed')), 8000) && !!P.$('#s-removed [data-action="sign-out"]'), P.text('#s-removed'));
    // what the phone queued before the removal still lands; nothing after
    const before = new Date(new Date(u3.removed_at).getTime() - 60000).toISOString();
    const h1 = await (async () => { try { return await field.addHazard(uuid(), { kind: 'Gas smell', note: 'queued before the removal', zoneId: ZONE('A-2'), createdAt: before }); } catch (e) { return e; } })();
    check('a hazard the phone stamped before the removal is accepted', !!h1 && !h1.message && await until(() => base.hazards().some((h) => h.note === 'queued before the removal')), h1 && h1.message);
    const h2 = await (async () => { try { return await field.addHazard(uuid(), { kind: 'Gas smell', note: 'after the removal', zoneId: ZONE('A-2') }); } catch (e) { return e; } })();
    check('one it makes after the removal is refused', !!h2 && /row-level security/.test(h2.message || ''), h2 && h2.message);
    const e5 = await (async () => { try { await field.join('CEDAR7', 'unit', 'Unit 3'); return null; } catch (e) { return e; } })();
    check('the join code does not let a removed member back in', !!e5 && /You were removed from Cedar Fork Flooding/.test(e5.message), e5 && e5.message);
    const e6 = await (async () => { try { await field.restoreMember(U.unit3); return null; } catch (e) { return e; } })();
    check('nor can it put itself back', !!e6 && /Only Operations/.test(e6.message), e6 && e6.message);
    $(`#people-page .mb-row[data-member="${U.unit3}"] [data-action="member-restore"]`).click();
    check('Restore makes it a member again, available, logged', await until(() => base.member(U.unit3) && !base.member(U.unit3).removed_at && base.member(U.unit3).status === 'available') && await until(() => eventText(base, 'Unit 3 (Jordan Lee Hale) put back on the incident by Operations')), logTexts()[0]);
    check('and the phone\'s notice goes away', await until(() => !P.shown('#s-removed'), 8000));
    P.frame.remove(); P = null;
    $('[data-action="close-people"]').click();
    // personal records clear by rule: the clock starts at the close, the picker shows the date
    const e7 = await (async () => { try { await base.clearPersonal(INC()); return null; } catch (e) { return e; } })();
    check('nothing clears while the incident is open', !!e7 && /Close the incident first/.test(e7.message), e7 && e7.message);
    await base.closeIncident();
    const inc = () => M().tables.ic_incidents.find((i) => i.id === INC());
    await until(() => inc().status === 'closed' && inc().clear_personal_at);
    const days = (iso) => Math.round((new Date(iso) - Date.now()) / 86400000);
    check('closing sets the date 30 days out and the log says so', days(inc().clear_personal_at) === 30 && await until(() => eventText(base, 'Incident closed · personal records clear by rule in 30 days')), logTexts()[0]);
    $('[data-action="switch-incident"]').click();
    await until(() => !$('#pick').hidden && $(`#pick-list [data-clear="${INC()}"]`));
    check('the picker shows the date on the closed incident with Clear now and Keep 30 more days', has(`#pick-list [data-clear="${INC()}"]`, 'personal records clear by rule on', 'licences, dates of birth') && !!$(`#pick-list [data-clear="${INC()}"] [data-action="clear-personal"]`) && !!$(`#pick-list [data-clear="${INC()}"] [data-action="keep-personal"]`), text(`#pick-list [data-clear="${INC()}"]`));
    $(`#pick-list [data-clear="${INC()}"] [data-action="keep-personal"]`).click();
    await until(() => days(inc().clear_personal_at) === 60);
    check('Keep 30 more days moves the date on, logged', days(inc().clear_personal_at) === 60 && M().tables.ic_events.some((e) => e.text === 'Personal records kept 30 more days'));
    await until(() => $(`#pick-list [data-clear="${INC()}"] [data-action="clear-personal"]`));
    const prof = (u) => M().tables.ic_profiles.find((x) => x.user_id === u);
    const hadPhoto = prof(U.unit1).photo_path;
    $(`#pick-list [data-clear="${INC()}"] [data-action="clear-personal"]`).click();
    await until(() => inc().personal_cleared_at);
    check('Clear now blanks the licence, date of birth, address and photo of every member in no open incident, and keeps the names and phones', inc().personal_cleared_at && [U.ops, U.unit1, U.unit2, U.unit3].every((u) => prof(u).licence_number === '' && prof(u).photo_path == null && prof(u).date_of_birth == null && prof(u).address === '') && prof(U.unit1).full_name === 'Ana Ramirez' && prof(U.unit1).phone === '512 555 0111', JSON.stringify(prof(U.unit1)));
    check('the licence photos are removed through the Storage API and the queue is marked done', M().tables.ic_id_purge.length >= 4 && M().tables.ic_id_purge.every((q) => q.done_at) && !M().files.has(hadPhoto));
    check('the evacuee records keep counts, needs and where from, and lose the names and notes', M().tables.ic_evacuees.every((e) => e.note === '' && (e.label === '' || /^family of \d+$/.test(e.label))) && M().tables.ic_evacuees.some((e) => e.label === 'family of 5' && e.needs.includes('infant') && e.from_text === 'Riverside Drive'), JSON.stringify(M().tables.ic_evacuees.map((e) => e.label)));
    check('one line in the 214 counts what was cleared, the credentials too (v69)', M().tables.ic_events.filter((e) => /^Personal records cleared by rule: 5 licence records, 5 sheltered people's names, 2 credentials blanked$/.test(e.text)).length === 1, (M().tables.ic_events.find((e) => /cleared by rule/.test(e.text)) || {}).text);
    check('the picker now says cleared by rule', await until(() => has(`#pick-list [data-clear="${INC()}"]`, 'personal records cleared', 'by rule')), text(`#pick-list [data-clear="${INC()}"]`));
    // the nightly run clears what is due, called by anyone
    const closed = M().tables.ic_incidents.find((i) => i.id === INC());
    closed.personal_cleared_at = null; closed.clear_personal_at = new Date(Date.now() - 86400000).toISOString();
    check('the due run clears a closed incident whose date has come', (await field.clearPersonalDue()) === 1 && !!inc().personal_cleared_at);
  } finally {
    autoConfirm(false);
    if (relief) relief.close();
    if (P) P.frame.remove();
    for (const k of Object.keys(localStorage)) if (/^ic\.field\./.test(k)) localStorage.removeItem(k);
    await wait(100);
  }
}
function joinCardTextOf() {
  const btn = $('#codes-pop [data-action="print-join"]');
  if (!btn) return '';
  btn.click();
  const t = $('#briefing-page') ? $('#briefing-page').innerText : '';
  if ($('[data-action="close-briefing"]')) $('[data-action="close-briefing"]').click();
  return t;
}

// Time in the water, incident settings and the public set (v28, migration 0020), with v25's leftovers.
async function safetyset(check) {
  autoConfirm(true);
  const realClick = HTMLAnchorElement.prototype.click;
  let P = null;
  try {
    const U = USERS();
    // ---- the water clock: in, overdue, probably left running, out; the rows, the panel, the reports, the log
    const boat = window.supabase.createClient();
    await mockSignIn(boat, 'unit2@mock.local');
    const u2 = new Data(boat); await u2.init(); await u2.open(INC());
    check('the period carries a rotation of 45 minutes, and the briefing tells a boat crew about it and the boat ramp', base.rotationMinutes() === 45);
    await u2.setInWater(U.unit2, new Date().toISOString());
    check('one tap puts the crew in the water, logged', await until(() => base.member(U.unit2).in_water_since) && await until(() => eventText(base, 'Unit 2 in the water')) && await until(() => has('#panel', 'unit 2', 'in the water 0m')), logTexts()[0]);
    await u2.setInWater(U.unit2, new Date(Date.now() - 50 * 60000).toISOString());
    check('past the rotation the row says so in orange', await until(() => $$('#panel .ur .water.over').some((w) => /in the water 50m/.test(w.textContent))), text('#panel').slice(0, 200));
    await u2.setInWater(U.unit2, new Date(Date.now() - 140 * 60000).toISOString());
    check('past three rotations the base says the clock was probably left running', await until(() => has('#panel', 'unit 2', 'probably left running (2h 20m)')));
    $(`#panel [data-action="select-unit"][data-id="${U.unit2}"]`).click();
    await until(() => has('#panel .title', 'unit 2') && $('#panel [data-action="unit-water"]'));
    check('the unit panel shows the clock with Out of the water for Operations', has('#panel', 'in the water', 'probably left running', 'rotation 45 min') && $('#panel [data-action="unit-water"]').textContent === 'Out of the water');
    $('[data-action="briefing"]').click();
    await until(() => !$('#briefing').hidden && has('#briefing-title', 'briefing'));
    check('the shift-change briefing lists who is in the water', has('#briefing-page', 'in the water', 'unit 2 in the water, probably left running'), text('#briefing-page').slice(-300));
    $('[data-action="close-briefing"]').click();
    $('[data-action="sitrep"]').click();
    await until(() => !$('#briefing').hidden && has('#briefing-title', 'situation report'));
    check('and so does the situation report', has('#briefing-page', 'in the water', 'unit 2'), text('#briefing-page').slice(-300));
    $('[data-action="close-briefing"]').click();
    $('#panel [data-action="unit-water"]').click();
    check('Operations takes the crew out, with the minutes in the log', await until(() => !base.member(U.unit2).in_water_since) && await until(() => eventText(base, 'Unit 2 out of the water after 2h 20m')), logTexts()[0]);
    await u2.setInWater(U.unit2, new Date(Date.now() - 12 * 60000).toISOString());
    await until(() => base.member(U.unit2).in_water_since);
    await u2.checkOut({ ticks: {}, open: [], note: '' });
    check('checking out ends the clock', await until(() => base.member(U.unit2).status === 'checked_out' && !base.member(U.unit2).in_water_since) && await until(() => eventText(base, 'Unit 2 out of the water after 12m')));
    await u2.join('CEDAR7', 'unit', 'Unit 2', null, null, null, null, 'boat');
    await until(() => base.member(U.unit2).status !== 'checked_out');
    // the rotation on the period sheet, printed on the 204 and the 208, carried into the next period
    $('[data-action="period"]').click();
    const pf = await until(() => $('#panel form[data-form="period-edit"]'));
    check('the period sheet has the rotation beside the seats', !!pf && pf.rotation && pf.rotation.value === '45', pf && pf.rotation && pf.rotation.value);
    pf.rotation.value = '30'; pf.requestSubmit();
    check('a changed rotation is saved and logged', await until(() => base.currentPeriod().rotation_minutes === 30) && await until(() => eventText(base, 'Operational period 1: rotation in the water every 30 minutes')), logTexts()[0]);
    $('[data-action="iap"]').click();
    await until(() => !$('#briefing').hidden && has('#briefing-title', 'incident action plan'));
    check('the 204s and the 208 print the rotation', has('#briefing-page', 'time in the water: crews out of the water every 30 minutes'), (text('#briefing-page').match(/time in the water[^.]*/) || [''])[0]);
    $('[data-action="close-briefing"]').click();
    $('[data-action="period-next"]').click();
    const sf = await until(() => $('#panel form[data-form="period-start"]'));
    check('the next period\'s form starts from the current rotation', !!sf && sf.rotation.value === '30', sf && sf.rotation.value);
    sf.requestSubmit();
    check('and the next period carries it', await until(() => base.currentPeriod().number === 2 && base.currentPeriod().rotation_minutes === 30));
    // the phone: the row on the home screen, the nudge past the rotation, one tap out
    P = await phoneFrame();
    check('the phone frame opened as Unit 3', !!P.ready);
    if (P.ready) {
      await field.setKind(U.unit3, 'swift_water');
      check('a swift-water crew\'s home screen offers In the water before the clock runs', await until(() => P.shown('#water-row') && /in the water/.test(P.text('#water-row')) && !/in the water \d/.test(P.text('#water-row')) && !!P.$('#water-row [data-action="water-toggle"]'), 6000), P.text('#water-row'));
      P.$('#water-row [data-action="water-toggle"]').click();
      check('one tap: the row flips at once, and the base sees it in the water, logged (a hidden frame\'s outbox is slow to send)', await until(() => /in the water \d+m · rotation 30 min/.test(P.text('#water-row')), 8000) && await until(() => base.member(U.unit3).in_water_since, 70000) && await until(() => eventText(base, 'Unit 3 in the water'), 8000), P.text('#water-row'));
      await base.setInWater(U.unit3, new Date(Date.now() - 35 * 60000).toISOString());
      check('past the rotation the row turns to the safety colour and nudges: swap the crew, with Later', await until(() => P.$('#water-row .water-row.over') && /past the rotation: swap the crew/.test(P.text('#water-row')) && !!P.$('#water-row [data-action="water-later"]'), 8000), P.text('#water-row'));
      P.$('#water-row [data-action="water-later"]').click();
      check('Later puts the nudge away until the next rotation, the clock stays', await until(() => !/swap the crew/.test(P.text('#water-row')) && /in the water 35m/.test(P.text('#water-row')), 6000), P.text('#water-row'));
      await base.setInWater(U.unit3, new Date(Date.now() - 65 * 60000).toISOString());
      check('the next rotation asks again', await until(() => /swap the crew/.test(P.text('#water-row')), 8000), P.text('#water-row'));
      P.$('#water-row [data-action="water-toggle"]').click();
      check('one tap out, with the minutes', await until(() => !/in the water \d/.test(P.text('#water-row')) && !!P.$('#water-row [data-action="water-toggle"]'), 8000) && await until(() => !base.member(U.unit3).in_water_since, 70000) && await until(() => eventText(base, 'Unit 3 out of the water after 1h 5m'), 8000), logTexts()[0]);
      check('the Agency box\'s placeholder is a plain example now', (P.$('#join-form input[name="agency"]') || {}).placeholder === 'e.g. Red Cross, county sheriff', (P.$('#join-form input[name="agency"]') || {}).placeholder);
      P.frame.remove(); P = null;
    }
    // the boat crew's briefing (the pure module): the boat ramp and the rotation
    await base.addFacility({ kind: 'ramp', name: 'Low-water crossing ramp', lat: 30.2612, lng: -97.7455 });
    await until(() => u2.facilities().some((f) => f.kind === 'ramp'));
    const { fieldBriefing } = await import('../js/shared/briefings.js');
    const bl = fieldBriefing(u2, { me: u2.me(), at: [30.2614, -97.742] });
    const area = bl.find((x) => x.key === 'area'), safe = bl.find((x) => x.key === 'safety');
    check('a boat crew\'s briefing names the nearest boat ramp under Work area, and the rotation under Safety', !!area && /Boat ramp: Low-water crossing ramp, [\d.]+ mi\./.test(area.text) && !!safe && /Time in the water: crews out of the water every 30 minutes/.test(safe.text), (area && area.text) + ' | ' + (safe && safe.text));
    u2.close();
    // ---- the settings sheet: the Google Maps key, the retention days, the default rotation
    $('[data-action="settings"]').click();
    const sform = await until(() => $('#settings-dialog[open] form[data-form="settings"]'));
    check('Settings opens from the header with the key, the retention days and the default rotation, the mock\'s values filled in', !!sform && sform.maps_key.value === 'mock-maps-key-for-the-layers-suite' && sform.retention_days.value === '30' && sform.rotation_minutes.value === '45' && has('#settings-dialog', 'google cloud', 'never the key'), text('#settings-dialog').slice(0, 300));
    sform.maps_key.value = 'AIza-new-key-9'; sform.retention_days.value = '60'; sform.rotation_minutes.value = '20'; sform.eoc_email.value = 'eoc@county.gov';
    sform.requestSubmit();
    await until(() => $('#settings-dialog') && !$('#settings-dialog').open);
    const inc = () => M().tables.ic_incidents.find((i) => i.id === INC());
    check('Save writes the settings and logs what changed, never the key', await until(() => inc().settings.maps_key === 'AIza-new-key-9' && inc().settings.retention_days === 60 && inc().settings.rotation_minutes === 20) && await until(() => eventText(base, 'Marcus Bell set the Google Maps key') && eventText(base, 'Marcus Bell set personal records to clear 60 days after the close') && eventText(base, 'Marcus Bell set the default rotation to 20 minutes in the water') && eventText(base, 'Marcus Bell set the EOC email address to eoc@county.gov')) && !base.events().some((e) => /AIza-new-key-9/.test(e.text)), logTexts().slice(0, 4).join(' | '));
    $('[data-action="sitrep"]').click();
    await until(() => !$('#briefing').hidden && has('#briefing-title', 'situation report'));
    check('with an EOC address set, Send by email goes to it (v46)', /^mailto:eoc@county\.gov\?subject=/.test($('#briefing-mail').getAttribute('href')), $('#briefing-mail').getAttribute('href').slice(0, 60));
    $('[data-action="close-briefing"]').click();
    await until(() => $('#briefing').hidden);
    $('[data-action="layers"]').click();
    await until(() => !$('#layers-pop').hidden);
    check('the Layers panel lists Google Maps from the incident\'s key', $$('#layers-pop input[type="radio"]').some((r) => r.dataset.layer === 'google-satellite'), $$('#layers-pop input[type="radio"]').map((r) => r.dataset.layer).join(' '));
    document.body.click();
    const c2 = window.supabase.createClient();
    await mockSignIn(c2, 'ops@mock.local');
    const d2 = new Data(c2); await d2.init();
    const made = await d2.createIncident({ name: 'Settings carry test', period: 'OP 1', base: '', lat: null, lng: null, zoom: 14 });
    const madeRow = M().tables.ic_incidents.find((i) => i.id === made.id);
    check('the next incident the same account opens carries the settings, and its first period the default rotation', madeRow.settings.maps_key === 'AIza-new-key-9' && madeRow.settings.retention_days === 60 && M().tables.ic_periods.find((p) => p.incident_id === made.id).rotation_minutes === 20, JSON.stringify(madeRow.settings));
    d2.close();
    await base.closeIncident();
    await until(() => inc().status === 'closed' && inc().clear_personal_at);
    check('closing now sets the clearing date 60 days out, as the settings say', Math.round((new Date(inc().clear_personal_at) - Date.now()) / 86400000) === 60 && await until(() => eventText(base, 'Incident closed · personal records clear by rule in 60 days')), logTexts()[0]);
    await base.updateIncident({ status: 'active' });
    await until(() => inc().status === 'active');
    // ---- the public set: a caption and a check on the photo panel, the download, the list and the sitrep
    const photo = M().ids.photos[0];
    $(`#panel [data-action="select-photo"][data-id="${photo}"]`) ? $(`#panel [data-action="select-photo"][data-id="${photo}"]`).click() : (() => { const b = document.createElement('button'); b.dataset.action = 'select-photo'; b.dataset.id = photo; b.hidden = true; document.body.appendChild(b); b.click(); b.remove(); })();
    const pform = await until(() => $('#panel form[data-form="photo-public"]'));
    check('a cleared photo\'s panel has the public caption and the check; the photo is not in the set yet', !!pform && has('#panel', 'not checked yet, so not in the public set') && $('#panel [data-action="photo-check"]').textContent.startsWith('Checked: no face'), text('#panel').slice(0, 300));
    pform.caption.value = 'Floodwater over Riverside Drive on Saturday morning'; pform.requestSubmit();
    check('the public caption is saved and logged', await until(() => base.photo(photo).public_caption === 'Floodwater over Riverside Drive on Saturday morning') && await until(() => eventText(base, 'Photo from Unit 1, public caption: Floodwater over Riverside Drive on Saturday morning')), logTexts()[0]);
    $('#panel [data-action="photo-check"]').click();
    check('the check is stamped with who looked, and logged', await until(() => base.photo(photo).public_checked_at && base.photo(photo).public_checked_by === U.ops) && await until(() => eventText(base, 'Photo from Unit 1 checked for public release: no face, no plate, no house number')) && await until(() => has('#panel', 'checked', 'no face, no plate, no house number')), logTexts()[0]);
    await base.setPhotoPublic(M().ids.photos[1], true);   // cleared, not checked: listed as missing
    await until(() => base.publicPhotos().length === 2);
    $('#panel [data-action="close-panel"]').click();
    await until(() => $('#panel [data-home]') && has('#panel', '2 photos cleared for the public'), 8000);   // the page's own data has the second photo before the counts are read
    check('Public information counts cleared and checked, lists each photo\'s caption and check, and offers the public set', has('#panel', '2 photos cleared for the public, 1 checked', 'download the public set', '1 of 2', 'checked · floodwater over riverside drive', 'not checked · no public caption'), text('#panel').slice(text('#panel').indexOf('public information'), text('#panel').indexOf('public information') + 400));
    let saved = null;
    HTMLAnchorElement.prototype.click = function () { if (this.download) saved = { name: this.download, href: this.href }; else realClick.call(this); };
    try { $('#panel [data-action="download-public"]').click(); await until(() => saved, 6000); } finally { HTMLAnchorElement.prototype.click = realClick; }
    const { unzip } = await import('../js/base/photo-export.js');
    const entries = saved ? unzip(new Uint8Array(await (await fetch(saved.href)).arrayBuffer())) : [];
    const pic = entries.find((e) => /\.jpg$/.test(e.name)), caps = entries.find((e) => e.name === 'captions.txt');
    const capText = caps ? new TextDecoder().decode(caps.bytes) : '';
    check('the public set is one zip: the checked photo named by time and place, and captions.txt', !!saved && /^CEDAR7-public-set-/.test(saved.name) && entries.length === 2 && !!pic && /_A-1_riverside-drive-east\.jpg$/.test(pic.name), saved ? saved.name + ' · ' + entries.map((e) => e.name).join(', ') : 'nothing saved');
    check('captions.txt carries the time, the place to the street and the public caption, never coordinates or the unit\'s note, and lists the cleared-but-unchecked photo as missing', /Riverside Drive, east \(division A-1\)\nFloodwater over Riverside Drive on Saturday morning/.test(capText) && /Cleared but not yet checked, so not in this set:\n\d\d:\d\d · B-1 · Unit 2/.test(capText) && !/Water over road|30\.26|-97\.7/.test(capText), capText.slice(0, 400));
    check('and the public caption is inside the picture', !!pic && new TextDecoder('latin1').decode(pic.bytes).includes('Floodwater over Riverside Drive on Saturday morning'));
    $('[data-action="sitrep"]').click();
    await until(() => !$('#briefing').hidden && has('#briefing-title', 'situation report'));
    check('the situation report counts cleared and checked', has('#briefing-page', '2 photos cleared for public release, 1 checked'), (text('#briefing-page').match(/\d photos cleared[^.]*/) || [''])[0]);
    $('[data-action="close-briefing"]').click();
    // ---- v25's leftovers on the base: the bars' words first, half-typed words kept
    await base.sendMessage(uuid(), { ...base.recipientsFor('all'), kind: 'safety', text: 'Water rising fast at the park entrance, everyone out of A-2 now' });
    await base.startPar('all');
    await until(() => $$('#safety .bar-item').length === 2);
    const bars = $$('#safety .bar-item').map((b) => b.textContent.replace(/\s+/g, ' ').trim());
    check('with a safety message and a PAR open, the message\'s words come before a count of who is waiting, the names on hover', bars.some((b) => /^SAFETY · Water rising fast at the park entrance, everyone out of A-2 now · waiting on 3 units/.test(b)) && bars.some((b) => /^PAR · 0 of 3 answered · waiting on 3 units/.test(b)) && $$('#safety .bar-item').every((b) => /Unit 1, Unit 2, Unit 3/.test(b.title)), bars.join(' | '));
    const composer = $('#panel form[data-form="message"] textarea[name="text"], #panel form[data-form="message"] input[name="text"]');
    composer.value = 'Half a sentence about the'; composer.dispatchEvent(new Event('input', { bubbles: true }));
    composer.blur(); document.body.focus();
    await field.addHazard(uuid(), { kind: 'Gas smell', note: 'behind the school', zoneId: ZONE('A-2') });
    await until(() => base.hazards().some((h) => h.note === 'behind the school'));
    await wait(200);
    const again = $('#panel form[data-form="message"] textarea[name="text"], #panel form[data-form="message"] input[name="text"]');
    check('words half-typed in a sidebar box survive a live redraw after focus left it', !!again && again.value === 'Half a sentence about the', again && again.value);
    again.value = '';
  } finally {
    autoConfirm(false);
    HTMLAnchorElement.prototype.click = realClick;
    if (P) P.frame.remove();
    if (!$('#briefing').hidden) $('[data-action="close-briefing"]').click();
    if ($('#settings-dialog') && $('#settings-dialog').open) $('#settings-dialog').close();
    for (const k of Object.keys(localStorage)) if (/^ic\.field\./.test(k)) localStorage.removeItem(k);
    await wait(100);
  }
}

// Accountability by name (v29, migration 0021): the PAR by name on the phone, who is missing on the bar and
// the board, a check-in with a count and no names, the unknown head count, an edit on each view.
async function parbyname(check) {
  autoConfirm(true);
  let P = null;
  try {
    const U = USERS();
    // check-ins: a count with no names stands; names come off the count; neither is unknown
    const mk = async (email) => { const c = window.supabase.createClient(); await mockSignIn(c, email); const d = new Data(c); await d.init(); await d.saveProfile({ full_name: 'Test ' + email.split('@')[0], phone: '512 555 0199' }); return d; };
    const u9 = await mk('counted@mock.local');
    await u9.join('CEDAR7', 'unit', 'Unit 9', null, 3, 'Sheriff', [], 'other');
    await until(() => base.member(u9.user.id));
    check('a check-in with a count and no names: the number stands, three unnamed', base.member(u9.user.id).crew_count === 3 && base.member(u9.user.id).unnamed_count === 3 && !!eventText(base, 'Unit 9, other checked in as Test counted, 512 555 0199, identity not given with 3 people'), JSON.stringify([base.member(u9.user.id).crew_count, base.member(u9.user.id).unnamed_count]));
    const u8 = await mk('named@mock.local');
    await u8.join('CEDAR7', 'unit', 'Unit 8', null, 4, 'Bastrop County FD', [{ name: 'Reyes', qualifications: ['emt'] }, { name: 'Cruz', qualifications: [] }], 'engine');
    await until(() => base.member(u8.user.id) && base.unitPeople(u8.user.id).length === 2);
    check('two names and a count of four: head count 4, two unnamed', base.member(u8.user.id).crew_count === 4 && base.member(u8.user.id).unnamed_count === 2 && await until(() => has('#panel', 'unit 8, engine', 'reyes, cruz · 4')), text('#panel').slice(0, 300));
    await u8.open(INC());
    await u8.addPerson(uuid(), { name: 'Vela', qualifications: [] });
    check('naming one of the unnamed later keeps the count and takes one off the unnamed', await until(() => base.member(u8.user.id).unnamed_count === 1) && base.member(u8.user.id).crew_count === 4);
    const u7 = await mk('blank@mock.local');
    await u7.join('CEDAR7', 'unit', 'Unit 7', null, null, 'Volunteers', [], null);
    await until(() => base.member(u7.user.id));
    check('neither names nor a count: the resources row says head count unknown in orange, the unit panel says name them for the PAR', base.member(u7.user.id).crew_count == null && await until(() => $$('#panel .hc-unknown').some((e) => /head count unknown/.test(e.textContent))), text('#panel').slice(0, 300));
    $(`#panel [data-action="select-unit"][data-id="${u7.user.id}"]`).click();
    await until(() => has('#panel .title', 'unit 7'));
    check('…and the unit panel', has('#panel', 'head count unknown · name them for the par'), text('#panel').slice(0, 400));
    $('#panel [data-action="close-panel"]').click();
    $('[data-action="people"]').click();
    await until(() => !$('#people').hidden);
    const ptab = $('#people [data-action="people-tab"][data-tab="people"]'); if (ptab && !ptab.classList.contains('on')) { ptab.click(); await until(() => $('#people-page .pp-card')); }   // an earlier suite may have left the Members tab on
    const cardOf = (re) => $$('#people-page .pp-card').find((c) => re.test(c.textContent));
    check('the People board nudges on the empty cards: name them for the PAR', has('#people-page', 'no names on record', 'head count unknown', '3 counted', 'name them for the par') && !!cardOf(/Unit 7/) && /head count unknown/i.test(cardOf(/Unit 7/).textContent) && !!cardOf(/Unit 9/) && /3 counted/.test(cardOf(/Unit 9/).textContent), text('#people-page').slice(-300));
    // Edit a person on the base
    const ramirez = base.people().find((p) => p.name === 'Ramirez');
    $(`#people-page .pp-line[data-person="${ramirez.id}"]`).click();
    await until(() => $(`#people-page .pp-drawer[data-person="${ramirez.id}"] [data-action="person-edit"]`));
    $(`#people-page .pp-drawer[data-person="${ramirez.id}"] [data-action="person-edit"]`).click();
    const ef = await until(() => $('#people-page .pp-drawer form[data-form="person-edit"]'));
    check('Edit opens the form filled in', !!ef && ef.name.value === 'Ramirez' && ef.role.value === 'Lt.' && ef.querySelector('input[name="q"][value="emt"]').checked && ef.agency.value === '', ef && JSON.stringify([ef.name.value, ef.role.value, ef.agency.value]));
    ef.role.value = 'Capt.'; ef.notes.value = 'Drives the engine'; ef.requestSubmit();
    check('Save writes the edit and logs it', await until(() => base.person(ramirez.id).role === 'Capt.' && base.person(ramirez.id).notes === 'Drives the engine') && await until(() => eventText(base, 'Ramirez (swift water, EMT) updated on Unit 1, Capt., notes changed')), logTexts()[0]);
    $('[data-action="close-people"]').click();
    u9.close(); u8.close(); u7.close();
    // the PAR by name on the phone: Unit 3 has Hale and Dominguez on record
    P = await phoneFrame();
    check('the phone frame opened as Unit 3', !!P.ready);
    if (P.ready) {
      await base.startPar('all');
      await until(() => P.shown('#s-safety') && /checked in with you hale, dominguez/.test(P.text('#s-safety')), 15000);
      check('the PAR card lists the names checked in and offers one button for all of them', /checked in with you hale, dominguez/.test(P.text('#s-safety')) && !!P.$$('#s-safety button').find((b) => b.textContent.trim() === 'All 2 accounted for') && !!P.$$('#s-safety button').find((b) => b.textContent.trim() === "Someone's missing"), P.text('#s-safety').slice(0, 300));
      P.$$('#s-safety button').find((b) => b.textContent.trim() === 'All 2 accounted for').click();
      const par1 = base.lastPar();
      check('one tap answers all accounted for with the count', await until(() => base.ack(par1.id, U.unit3) && base.ack(par1.id, U.unit3).count === 2, 70000) && await until(() => eventText(base, 'Unit 3: All accounted for (2)'), 8000), logTexts()[0]);
      await base.startPar('all');
      await until(() => P.shown('#s-safety') && /someone's missing/.test(P.text('#s-safety')), 15000);
      P.$$('#s-safety button').find((b) => b.textContent.trim() === "Someone's missing").click();
      await until(() => P.$('#s-safety [data-par-miss]'));
      check('Someone\'s missing opens the list to tick, with Send waiting on a tick', !!P.$('#s-safety [data-par-miss]') && P.$$('#s-safety [data-par-miss]').length === 2 && P.$$('#s-safety button').find((b) => /^Send: nobody missing/.test(b.textContent.trim())).disabled, P.text('#s-safety').slice(0, 300));
      const dom = base.people().find((p) => p.name === 'Dominguez');
      const tick = P.$(`#s-safety [data-par-miss][value="${dom.id}"]`); tick.checked = true; tick.dispatchEvent(new Event('change', { bubbles: true }));
      await until(() => P.$$('#s-safety button').find((b) => /^Send: 1 missing/.test(b.textContent.trim())));
      P.$$('#s-safety button').find((b) => /^Send: 1 missing/.test(b.textContent.trim())).click();
      const par2 = base.lastPar();
      check('Send stores who is missing with the count, logged by name, and raises an alert that names them', await until(() => base.ack(par2.id, U.unit3), 70000) && JSON.stringify(base.ack(par2.id, U.unit3).missing.map((x) => x.name)) === '["Dominguez"]' && base.ack(par2.id, U.unit3).count === 1 && await until(() => eventText(base, 'Unit 3: Missing someone: Dominguez (1 accounted for)'), 8000) && await until(() => base.alerts().some((a) => a.user_id === U.unit3 && a.note === 'Missing: Dominguez'), 70000) && await until(() => eventText(base, 'EMERGENCY, Unit 3 needs help in A-2: Missing: Dominguez'), 8000), logTexts().slice(0, 3).join(' | '));
      check('the yellow bar names who is missing and the unit', await until(() => has('#safety', 'missing · dominguez (unit 3)')), text('#safety'));
      $('[data-action="people"]').click();
      await until(() => !$('#people').hidden);
      check('the People board turns the person\'s line red, MISSING since when, and the drawer adds the unit\'s last position', await until(() => $(`#people-page .pp-line.missing[data-person="${dom.id}"]`)) && has(`#people-page .pp-line[data-person="${dom.id}"]`, 'missing since') && await (async () => { $(`#people-page .pp-line[data-person="${dom.id}"]`).click(); return until(() => has(`#people-page .pp-drawer[data-person="${dom.id}"]`, 'missing since', 'unit 3 last at')); })(), text(`#people-page .pp-line[data-person="${dom.id}"]`));
      $('[data-action="close-people"]').click();
      $(`#panel [data-action="select-unit"][data-id="${U.unit3}"]`) ? $(`#panel [data-action="select-unit"][data-id="${U.unit3}"]`).click() : null;
      await until(() => has('#panel .title', 'unit 3'));
      check('and so does the unit panel', !!$(`#panel .pp-row.missing[data-person="${dom.id}"]`), text('#panel').slice(0, 300));
      $('#panel [data-action="ack-alert"]') && $('#panel [data-action="ack-alert"]').click();
      $('#panel [data-action="close-panel"]').click();
      // Found (v38): the phone's alert screen lists who it reported missing with a Found button; pressing it clears the bar and the row and writes a notable line
      await until(() => P.shown('#s-helpsent') && P.$('#helpsent-missing [data-action="found"]'), 15000);
      check('the phone\'s alert screen names who it reported missing, with Found', /reported missing at/.test(P.text('#helpsent-missing')) && /dominguez/.test(P.text('#helpsent-missing')) && !!P.$('#helpsent-missing [data-action="found"]'), P.text('#helpsent-missing'));
      P.$('#helpsent-missing [data-action="found"]').click();
      check('Found from the phone clears the MISSING line and the red row, and the log gets a notable line', await until(() => !has('#safety', 'missing ·'), 70000) && await until(() => eventText(base, 'Dominguez found, reported by Unit 3'), 8000) && base.events().find((e) => e.text === 'Dominguez found, reported by Unit 3').notable === true && !base.missingPerson(dom.id) && base.ack(par2.id, U.unit3).missing[0].found_at, logTexts().slice(0, 2).join(' | '));
      check('the PAR panel says they were found', await until(() => has('#panel', 'dominguez found · 1 accounted for')), text('#panel').slice(0, 400));
      // one head count at a time (v38): a third PAR closes the second on the bar and on the phone, and says who had still to answer
      P.$('#s-helpsent [data-action="stand-down"]').click();   // the alert screen outranks a head count; Unit 3 stands down first, as Rosa would
      await until(() => !P.shown('#s-helpsent'), 15000);
      await base.startPar('all');
      const par3 = base.lastPar();
      check('a new PAR closes the one before it: one PAR on the bar, the old one superseded, the log says who had still to answer', await until(() => base.message(par2.id).superseded_by === par3.id) && $$('#safety .bar-item').filter((e) => /^PAR ·/.test(e.textContent.trim())).length === 1 && await until(() => base.events().some((e) => /^Earlier PAR closed by the new one, still waiting on /.test(e.text))), logTexts().slice(0, 3).join(' | '));
      check('the Messages list says the old PAR was closed by the new one', await until(() => $$('.mrow.par .ack').some((e) => /closed by the par started/i.test(e.textContent))), $$('.mrow.par .ack').map((e) => e.textContent).join(' | ').slice(0, 300));
      await until(() => P.shown('#s-safety') && P.$$('#s-safety .mrow.par').length === 1, 15000);
      check('the phone shows one head count card, the newest', P.$$('#s-safety .mrow.par').length === 1 && P.$$('#s-safety button').some((b) => b.textContent.trim() === 'All 2 accounted for'), P.text('#s-safety').slice(0, 300));
      P.$$('#s-safety button').find((b) => b.textContent.trim() === 'All 2 accounted for').click();
      await until(() => base.ack(par3.id, U.unit3), 70000);
      // Edit a person on the phone
      await P.act('menu');
      await until(() => P.$(`#menu-people [data-action="person-edit"][data-id="${base.people().find((p) => p.name === 'Hale').id}"]`));
      P.$(`#menu-people [data-action="person-edit"][data-id="${base.people().find((p) => p.name === 'Hale').id}"]`).click();
      await until(() => P.$('#mp-name').value === 'Hale');
      check('Edit on the phone fills the form and turns Add into Save', P.$('#mp-name').value === 'Hale' && P.$('[data-action="person-add"]').textContent.trim() === 'Save', P.$('[data-action="person-add"]').textContent);
      P.$('#mp-role').value = 'Lt.'; P.$('[data-action="person-add"]').click();
      const hale = base.people().find((p) => p.name === 'Hale');
      check('Save sends the edit and the log says so', await until(() => base.person(hale.id).role === 'Lt.', 70000) && await until(() => eventText(base, 'Hale (swift water, EMT) updated on Unit 3, Lt.'), 8000), logTexts()[0]);
      P.frame.remove(); P = null;
    }
  } finally {
    autoConfirm(false);
    if (P) P.frame.remove();
    if (!$('#people').hidden) $('[data-action="close-people"]').click();
    for (const k of Object.keys(localStorage)) if (/^ic\.field\./.test(k)) localStorage.removeItem(k);
    await wait(100);
  }
}

// ---- incident kinds and starter periods (v77): the seeded incident is a flood (its card, the picker, the phone's
// briefing, Place first on the Period sheet); a new incident opened from the sheet with Flood pressed gets the starter's
// lines as Operations' own, the Period sheet first; × hides an objective and the carry-over keeps it hidden.
async function starters(check) {
  const U = USERS();
  $('#inc-sub').click();
  check('the seeded incident is a flood: the card\'s head says so beside since', await until(() => !$('#inc-pop').hidden) && has('#inc-pop .ic-head', 'cedar fork flooding', 'a flood', 'since'), text('#inc-pop .ic-head'));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await until(() => $('#inc-pop').hidden);
  $('[data-action="period"]').click();
  await until(() => has('#panel .title', 'operational period 1'));
  check('the Period sheet offers Place first for the flood\'s facility kinds not yet on the map (the boat ramp alone: the post, staging and the shelter are placed), the units to expect, and no from-starter line, since the seed wrote its own lines', $$('#panel .place-first').map((b) => b.dataset.kind).join(' ') === 'ramp' && has('#panel', 'units to expect', 'boat crews, swift-water teams') && !$('#panel .from-starter') && $$('#panel .obj-x').length === 3, $$('#panel .place-first').map((b) => b.dataset.kind).join(' '));
  $('#panel .place-first[data-kind="ramp"]').click();
  check('the chip arms the map for a boat ramp', $('#map').classList.contains('drawing') && has('#tool-hint', 'boat ramp'), text('#tool-hint'));
  mapClick(70, 50);
  await until(() => base.facilities().some((f) => f.kind === 'ramp'));
  const ramp = base.facilities().find((f) => f.kind === 'ramp');
  check('one click places the ramp and opens it to be named', !!ramp && await until(() => $('#panel form[data-form="facility-edit"]')) && !!eventText(base, 'Boat ramp opened'), logTexts()[0]);
  $('[data-action="period"]').click();
  await until(() => has('#panel .title', 'operational period 1'));
  check('with the ramp placed, Place first is gone from the sheet', await until(() => !$('#panel .place-first') && !has('#panel', 'place first')), text('#panel').slice(0, 160));
  let P = null;
  try {
    P = await phoneFrame();
    await P.act('briefing');
    check('the phone\'s briefing says the kind in one word under its title: "A flood · Unit 3, swift-water team · hh:mm"', await until(() => P.shown('#s-briefing') && /^a flood · unit 3, swift-water team · \d\d:\d\d$/.test(P.text('#briefing-sub')), 8000), P.text('#briefing-sub'));
  } finally { if (P) P.frame.remove(); }
  // the picker and the New incident sheet
  $('[data-action="switch-incident"]').click();
  await until(() => !$('#pick').hidden && has('#pick-list', 'cedar fork flooding'));
  check('the picker\'s row says a flood', has('#pick-list', 'a flood'), text('#pick-list').slice(0, 200));
  const f = $('#new-incident');
  check('the sheet offers the five kinds, nothing pressed, the sub-kinds hidden, period 1 empty by default', $$('#new-kinds .btn').map((b) => b.textContent).join(' | ') === 'Natural hazard | Human-caused | Medical and public health | Search and rescue | Planned event' && $('#new-subs').hidden && f.kind.value === '' && has('#new-kind-hint', 'optional'), text('#new-kind-hint'));
  $('#new-kinds [data-kind="natural"]').click();
  check('Natural hazard pressed shows its four sub-kinds and promises the standing three', !$('#new-subs').hidden && $$('#new-subs .btn').map((b) => b.textContent).join(' | ') === 'Flood | Wildfire | Storm | Winter storm' && f.kind.value === 'natural' && has('#new-kind-hint', 'three standing objectives'), text('#new-kind-hint'));
  $('#new-subs [data-kind="flood"]').click();
  check('Flood pressed names the starter and what it brings', f.kind.value === 'flood' && $('#new-subs [data-kind="flood"]').classList.contains('on') && has('#new-kind-hint', 'from the flood starter', '7 objectives', 'the safety message', 'the rotation', 'the hours on scene', 'what to bring'), text('#new-kind-hint'));
  $('#new-subs [data-kind="flood"]').click();
  check('pressed again, Flood unpicks and the group stands alone', f.kind.value === 'natural' && !$('#new-subs [data-kind="flood"]').classList.contains('on'));
  $('#new-subs [data-kind="flood"]').click();
  // the centre by address (v78): the stand-in's Cedar Fork places; the sheet above the map centre
  const ai = $('#new-address');
  check('the Address box sits above the map centre with its hint, since config.js carries the key', !!ai && !$('#new-addr-wrap').hidden && has('#new-addr-hint', 'suggestions as you type', 'never a person') && !!$('#new-addr-wrap ~ .row-2 input[name="lat"]'), text('#new-addr-hint'));
  ai.focus(); ai.value = 'mill'; ai.dispatchEvent(new Event('input', { bubbles: true }));
  check('typing "mill" offers the two Mill Street places, the first lit, powered by Google', await until(() => !$('#new-addr-list').hidden && $$('#new-addr-list [data-pick]').length === 2, 4000) && has('#new-addr-list', 'cedar fork high school', 'mill street bridge', 'powered by google') && $('#new-addr-list [data-pick="0"]').classList.contains('on') && ai.getAttribute('aria-expanded') === 'true', text('#new-addr-list'));
  ai.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  ai.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  check('arrow and Enter pick the bridge: latitude and longitude filled, Base filled with its name, the centre read back, the list gone', await until(() => f.lat.value === '30.26120' && f.lng.value === '-97.74020', 4000) && f.base.value === 'Mill Street Bridge' && ai.value === 'Mill St at Cedar Fork Creek, Cedar Fork, TX' && has('#new-addr-hint', 'centre: 30.2612, -97.7402', 'mill street bridge') && $('#new-addr-list').hidden, [f.lat.value, f.lng.value, f.base.value, text('#new-addr-hint')].join(' | '));
  ai.value = 'pecan park'; ai.dispatchEvent(new Event('input', { bubbles: true }));
  await until(() => $$('#new-addr-list [data-pick]').length === 1, 4000);
  ai.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check('Escape puts the list away', $('#new-addr-list').hidden);
  ai.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  check('Enter with nothing picked looks the words up and sets the centre; Base, already filled, stays', await until(() => f.lat.value === '30.25920', 4000) && f.lng.value === '-97.74710' && f.base.value === 'Mill Street Bridge' && has('#new-addr-hint', 'centre: 30.2592, -97.7471', '2 pecan park dr'), [f.lat.value, f.lng.value, f.base.value].join(' | '));
  f.name.value = 'Starter drill'; f.base.value = 'The depot';
  f.requestSubmit();
  await until(() => !$('#app').hidden && has('#inc-name', 'starter drill'), 10000);
  const inc = () => M().tables.ic_incidents.find((i) => i.name === 'Starter drill');
  const period = () => M().tables.ic_periods.find((x) => x.incident_id === inc().id && x.number === 1);
  const objs = (n = 1) => M().tables.ic_objectives.filter((o) => o.incident_id === inc().id && o.period_id === (n === 1 ? period().id : M().tables.ic_periods.find((x) => x.incident_id === inc().id && x.number === n).id)).sort((a, b) => a.number - b.number);
  const ev = (t) => M().tables.ic_events.some((e) => e.incident_id === inc().id && e.text === t);
  await until(() => objs().length === 7 && inc().starter === 'flood', 10000);
  check('Create puts the kind and the starter on the row, nothing of them in the settings (v82), and resets the sheet', inc().kind === 'flood' && inc().starter === 'flood' && !('kind' in inc().settings) && !('starter' in inc().settings) && !('removed_objectives' in inc().settings) && f.kind.value === '' && $('#new-subs').hidden, JSON.stringify([inc().kind, inc().starter, inc().settings]));
  check('the incident opened on the centre the address gave (v78)', inc().center_lat === 30.2592 && inc().center_lng === -97.7471 && inc().base_name === 'The depot', [inc().center_lat, inc().center_lng, inc().base_name].join(' | '));
  check('period 1 carries the starter\'s safety message, rotation, hours and bring', period().notes === 'Nobody enters moving water. PFDs on near the water. PAR on the hour.' && period().rotation_minutes === 45 && period().scene_hours === 12 && period().bring === 'PFDs and dry bags, a radio each, water for the day', JSON.stringify([period().notes, period().rotation_minutes, period().scene_hours, period().bring]));
  check('seven objectives, the standing three first, numbered 1 to 7', objs().map((o) => o.number).join('') === '1234567' && objs()[0].text === 'Nobody gets hurt, crews or residents' && objs()[2].text === 'Protect property once people are safe' && objs()[3].text === 'People off the low ground first' && objs()[6].text === 'Shelter open and staffed before dark', objs().map((o) => o.text).join(' | '));
  check('the triggers logged each line as Operations\' own, bring on the period\'s line, and the opening line says the kind and where they came from (v82); no note of the app\'s own', ev('Objective 1 set: Nobody gets hurt, crews or residents') && ev('Objective 7 set: Shelter open and staffed before dark') && ev('Operational period 1 updated, bring: PFDs and dry bags, a radio each, water for the day') && ev('Incident opened: Starter drill, a flood, operational period 1 from the Flood starter') && !M().tables.ic_events.some((e) => e.incident_id === inc().id && /^Opened as /.test(e.text)), M().tables.ic_events.filter((e) => e.incident_id === inc().id).map((e) => e.text).join(' | ').slice(0, 300));
  const sheetReady = () => !!$('#panel .from-starter') && has('#panel .title', 'operational period 1');
  await until(sheetReady, 8000);
  const pfv = (n) => { const el = $('#panel form[data-form="period-edit"] [name="' + n + '"]'); return el ? el.value : null; };
  check('the Period sheet opened first, saying where the lines came from', sheetReady() && has('#panel .from-starter', 'from the flood starter', 'edit any line'), text('#panel .from-starter'));
  check('every box filled from the starter: the rotation, the hours, the safety message, what to bring', await until(() => pfv('rotation') === '45' && pfv('scene') === '12' && (pfv('notes') || '').startsWith('Nobody enters moving water') && (pfv('bring') || '').startsWith('PFDs and dry bags'), 6000), [pfv('rotation'), pfv('scene'), pfv('notes'), pfv('bring')].join(' | '));
  check('seven rows each with its ×, four kinds to place first, the units to expect', await until(() => $$('#panel .obj').length === 7 && $$('#panel .obj-x').length === 7, 6000) && $$('#panel .place-first').map((b) => b.dataset.kind).join(' ') === 'icp staging ramp shelter' && has('#panel', 'units to expect', 'boat crews, swift-water teams, high-water vehicles, engines, ambulances, pump crews'), $$('#panel .obj').length + ' rows, ' + $$('#panel .obj-x').length + ' ×, chips ' + $$('#panel .place-first').map((b) => b.dataset.kind).join(' '));
  // a fresh incident starts emptier (v80): no phone has joined, so the codes lead the home panel and the empty sections wait
  $('#panel [data-action="close-panel"]').click();
  await until(() => !!$('#panel .qr-box'), 6000);
  check('Back to units on a fresh incident: the codes\' card leads the home panel, the QR with the code, the join card and the bands, the Operations code as dots; no units line, no PAR, no Message the field (v80)', !!$('#panel .qr-box svg') && has('#panel', 'join code for field phones', 'print a join card', 'print bands', 'operations code', '••••••••') && !$('#panel [data-home]') && !has('#panel', 'no units have joined', 'head count (par)', 'message the field'), text('#panel').slice(0, 300));
  check('Messages, Transports, Public information and Map imagery wait for their first row; Hazards, Facilities, the 205 and Incident stay', !has('#panel', 'messages', 'transports', 'public information', 'map imagery', 'agencies on scene') && has('#panel', 'hazards open · 0', 'facilities', 'communications plan (ics 205)', 'requests (213rr)') && !!$('#panel form[data-form="incident-edit"]'), text('#panel').slice(0, 600));
  check('the divisions list says what to do first, and the legend shows no zero', has('#zones [data-empty]', 'nothing here yet. draw the boundary, then divisions inside it.') && $$('[data-legend-count]').every((n) => n.textContent === '') && $('#legend-run').hidden && !$$('#log-filters .chip').some((c) => / 0$/.test(c.textContent.trim())), text('#zones') + ' | ' + $$('#log-filters .chip').map((c) => c.textContent.trim()).join(', '));
  $('[data-action="period"]').click();
  await until(sheetReady, 6000);
  check('the incident\'s card says a flood', ($('#inc-sub').click(), await until(() => !$('#inc-pop').hidden)) && has('#inc-pop .ic-head', 'starter drill', 'a flood'), text('#inc-pop .ic-head'));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await until(() => $('#inc-pop').hidden);
  // × on an objective: hidden, never deleted, one note
  const o5 = objs()[4];
  $(`#panel .obj-x[data-id="${o5.id}"]`).click();
  await until(() => $$('#panel .obj').length === 6, 6000);
  check('× on objective 5 takes it off the sheet, keeps the row archived (v82), and the database writes one line', $$('#panel .obj').length === 6 && !has('#panel', 'primary search of every flooded structure') && M().tables.ic_objectives.some((o) => o.id === o5.id && !!o.archived_at) && ev('Objective 5 removed: Primary search of every flooded structure'), JSON.stringify(M().tables.ic_objectives.filter((o) => o.id === o5.id).map((o) => o.archived_at)));
  // a box cleared is a plain save
  const pf = $('#panel form[data-form="period-edit"]');
  pf.bring.value = ''; pf.requestSubmit();
  await until(() => period().bring === '', 6000);
  check('clearing What to bring is a plain save, logged as not set', period().bring === '' && ev('Operational period 1 updated, bring: not set'));
  // the kind changes in Incident settings; no period is rewritten
  $('[data-action="settings"]').click();
  await until(() => $('#settings-dialog') && $('#settings-dialog').open && $('#settings-dialog select[name="kind"]'));
  check('Incident settings shows the kind', $('#settings-dialog select[name="kind"]').value === 'flood');
  $('#settings-dialog select[name="kind"]').value = 'wildfire';
  $('#settings-dialog form').requestSubmit();
  await until(() => inc().kind === 'wildfire', 6000);
  check('changed to wildfire: the row says so and the 214 says who (v82), the starter and period 1 are untouched, the card reads a wildfire', inc().kind === 'wildfire' && inc().starter === 'flood' && M().tables.ic_events.some((e) => e.incident_id === inc().id && e.text === 'Marcus Bell set the kind to a wildfire') && objs().length === 7 && period().rotation_minutes === 45 && ($('#inc-sub').click(), await until(() => !$('#inc-pop').hidden && has('#inc-pop .ic-head', 'a wildfire'))), text('#inc-pop .ic-head'));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await until(() => $('#inc-pop').hidden);
  // Start period 2: the carry-over copies the removed objective too; the app hides the copy
  autoConfirm(true);
  try {
    $('[data-action="period"]').click();
    await until(() => has('#panel .title', 'operational period 1'));
    $('#panel [data-action="period-next"]').click();
    const sf = await until(() => $('#panel form[data-form="period-start"]'));
    sf.requestSubmit();
    await until(() => M().tables.ic_periods.some((x) => x.incident_id === inc().id && x.number === 2) && objs(2).length === 6, 10000);
    await until(() => has('#panel .title', 'operational period 2') && $$('#panel .obj').length === 6, 8000);
    check('period 2 carries six: the archived one stays behind in the database (v82), the sheet shows six numbered 1 to 6, the period\'s line counts six, and no from-starter line on period 2', objs(2).length === 6 && $$('#panel .obj').length === 6 && !has('#panel', 'primary search of every flooded structure') && objs(2).map((o) => o.number).join('') === '123456' && M().tables.ic_events.some((e) => e.incident_id === inc().id && /^Operational period 2 started.*, 6 objectives carried over$/.test(e.text)) && !$('#panel .from-starter'), objs(2).map((o) => o.number + ' ' + o.text).join(' | '));
  } finally { autoConfirm(false); }
  // without the key in config.js the Address box is one muted line (v78)
  const L = await import('../js/shared/layers.js');
  const hadKey = window.GOOGLE_MAPS_KEY, hadInc = L.googleKey();
  try {
    window.GOOGLE_MAPS_KEY = ''; L.setGoogleKey('');
    $('[data-action="switch-incident"]').click();
    await until(() => !$('#pick').hidden && has('#pick-list', 'starter drill'));
    check('with no key the sheet shows one muted line in place of the Address box', $('#new-addr-wrap').hidden && has('#new-addr-hint', 'address lookup needs the google maps key in config.js'), text('#new-addr-hint'));
  } finally { window.GOOGLE_MAPS_KEY = hadKey; L.setGoogleKey(hadInc); }
}
