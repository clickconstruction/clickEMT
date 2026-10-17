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
import { markingFor, ringToLatLngs, nextPass, nearestFacility } from '../js/shared/rules.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const text = (s) => ($(s) ? $(s).innerText.replace(/\s+/g, ' ').trim().toLowerCase() : '');
const has = (s, ...needles) => { const t = text(s); return needles.every((x) => t.includes(x.toLowerCase())); };
const until = async (fn, ms = 4000) => { const end = Date.now() + ms; let v = fn(); while (!v && Date.now() < end) { await wait(50); v = fn(); } return v; };
const M = () => window.__mock;
const logTexts = () => $$('#log .log-row').map((r) => r.innerText.replace(/\s+/g, ' ').trim());
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

// Reset the mock, make the page reopen the incident through its own handler, and open two Data
// instances on it: the base's client (Operations) and a field client signed in as Unit 3.
async function reload() {
  await M().ready();
  if (base) base.close();
  if (field) field.close();
  M().reset();
  if (!$('#draw-btns').hidden) $('[data-action="cancel-draw"]').click();
  const btn = document.createElement('button');
  btn.dataset.action = 'open-incident'; btn.dataset.id = INC(); btn.hidden = true;
  document.body.appendChild(btn); btn.click(); btn.remove();
  const ok = await until(() => !$('#app').hidden && $('#inc-name').textContent === 'Cedar Fork Flooding' && $$('#zones .zr').length === 6 && $('#panel').textContent.includes('Join code'));
  if (!ok) throw new Error('the page did not reopen the seeded incident');
  if ($('#logbox').classList.contains('closed')) $('[data-action="log-toggle"]').click();   // a folded log from an earlier run hides the rows the suites read
  base = new Data(window.sb);
  await base.init();
  await base.open(INC());
  const fc = window.supabase.createClient();
  await fc.auth.signInWithPassword({ email: 'unit3@mock.local', password: 'any' });
  field = new Data(fc);
  await field.init();
  await field.open(INC());
  await wait(60);
}

export async function run({ only } = {}) {
  const results = [];
  const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail: String(detail).slice(0, 200) });
  const suites = { seeded, baseActions, boundary, fieldReports, emergency, messages, accountability, people, periods, assignment, search, facilities, reports, agencies, publicInfo, replay, log, layers, zoneCard, join, identity, checkIn, permissions };
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
  check('the home panel lists the three units with their assignments', has('#panel', 'unit 1', 'assigned to a-1', 'unit 2', 'assigned to b-1', 'unit 3', 'assigned to a-2'), text('#panel'));
  check('the log has the morning in it, newest first', logTexts().length >= 12 && /shelter open/i.test(logTexts()[0]) && /incident opened/i.test(logTexts()[logTexts().length - 1]), logTexts()[0]);
  check('live updates say live', has('#live-text', 'live') && base.realtime === 'SUBSCRIBED', text('#live-text'));
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
  check('assigning Unit 2 to B-2 makes it active and logs it', base.zone(b2).status === 'active' && $(`#zones .zr[data-id="${b2}"] .sdot`).classList.contains('active') && has(`#zones .zr[data-id="${b2}"]`, 'in progress · unit 2'), text(`#zones .zr[data-id="${b2}"]`));
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
  check('a note goes into the log as a note event by Operations', !!note && note.kind === 'note' && note.user_id === USERS().ops && /Smoke test note for the log$/.test(logTexts()[0]) && $('#note-form input').value === '', logTexts()[0]);
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
  check('standing down clears the bar, keeps the alert in history, and logs it', $('#mayday').hidden && base.alerts().length === 0 && base.alerts(true).length === 1 && !!eventText(base, 'Unit 3 stood down, all OK') && $$('#map .umark.sos').length === 0);
}

// Messages (ICS 213): Operations messages Unit 3 and gets a reply, a safety message to everyone
// stays on the yellow bar until all three units acknowledge, and Unit 3 messages Operations.
async function messages(check) {
  const u = USERS();
  const composer = () => $('#panel form[data-form="message"]');
  check('the home panel shows the seeded messages, both still waiting on Unit 3', $$('#panel .mrow').length === 2 && $$('#panel .mrow .ack.wait').every((e) => /waiting on unit 3/i.test(e.textContent)), text('#panel'));
  check('Unit 3 has two unanswered messages in its inbox', field.myUnanswered().length === 2 && field.myInbox().length === 2);
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
  check('the yellow bar shows it, waiting on all three', await until(() => !$('#safety').hidden && has('#safety', 'safety', 'stop work', 'waiting on unit 1, unit 2, unit 3')), text('#safety'));
  check('the log marks it as a safety message', !!eventText(base, 'SAFETY MESSAGE, Operations to everyone: Stop work, water rising at the low-water crossing') && eventText(base, 'SAFETY MESSAGE, Operations to everyone: Stop work, water rising at the low-water crossing').kind === 'safety');
  check('Unit 3 has it as an unanswered safety message', await until(() => field.myUnanswered().some((m) => m.id === s1.id && m.kind === 'safety')));
  await field.ackMessage(s1.id, 'Acknowledged');
  check('after Unit 3 answers, the bar waits on Unit 1 and Unit 2', await until(() => has('#safety', 'waiting on unit 1, unit 2') && !has('#safety', 'unit 3')), text('#safety'));
  for (const email of ['unit1@mock.local', 'unit2@mock.local']) {
    const c = window.supabase.createClient();
    await c.auth.signInWithPassword({ email, password: 'any' });
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
  await field.sendMessage(urgent, { ...field.recipientsFor('ops'), kind: 'message', text: 'Culvert washed out, road gone', urgency: 'now', lat: 30.2676, lng: -97.7388 });
  await until(() => base.message(urgent));
  check('a message carries how urgent it is and the spot it is about, and the base shows both', await until(() => has(`#panel .mrow[data-message="${urgent}"]`, 'act on now', 'culvert washed out')) && !!$(`#panel .mrow[data-message="${urgent}"] [data-action="pan-to"]`) && $$('#map .mpin.urg-now').length === 1, text(`#panel .mrow[data-message="${urgent}"]`));
  check('the log says how urgent and that a location came with it', !!eventText(base, 'Unit 3 to Operations (act on now): Culvert washed out, road gone · location attached'), logTexts()[0]);
  const badUrg = await field.sb.from('ic_messages').insert({ id: uuid(), incident_id: INC(), from_user: u.unit3, to_users: [u.ops], to_label: 'Operations', kind: 'message', text: 'x', urgency: 'asap' }).select().single();
  check('urgency is one of the four words or nothing', !!badUrg.error && badUrg.error.code === '23514', JSON.stringify(badUrg.error));
  const forged = await field.sb.from('ic_messages').insert({ id: uuid(), incident_id: INC(), from_user: u.unit1, to_users: [u.ops], to_label: 'Operations', kind: 'message', text: 'Forged' }).select().single();
  check('a message must carry the sender\'s own user id', forged.error && forged.error.code === '42501' && !base.messages().some((m) => m.text === 'Forged'), JSON.stringify(forged.error));
}

// Accountability: status from the field and from the base, assignment setting status, the PAR
// with head counts and a missing report, and check-out giving zones back.
async function accountability(check) {
  const u = USERS();
  check('the resources board groups the three units as assigned, six people in the field', has('#panel', '6 people in the field on 3 units') && $$('#panel .grp').length === 1 && has('#panel .grp', 'assigned'), text('#panel'));

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
  $('#panel [data-action="start-par"][data-target="all"]').click();
  await until(() => base.lastPar());
  const par = base.lastPar();
  check('Start PAR sends a PAR to the three units, and the bar shows it waiting on all of them', par.kind === 'par' && par.to_users.length === 3 && await until(() => !$('#safety').hidden && has('#safety', 'par', '0 of 3 answered')), text('#safety'));
  check('the log has the PAR', !!eventText(base, 'PAR, Operations to everyone: PAR: is everyone accounted for?'));
  check('Unit 3 gets it as unanswered', await until(() => field.myUnanswered().some((m) => m.id === par.id)));
  await field.answerPar(par.id, true, 3);
  check('Unit 3 answers all accounted for with 3: the panel and the bar say so, and the log has the count', await until(() => has('#panel', 'unit 3', 'all accounted for (3)') && has('#safety', '1 of 3 answered')) && !!eventText(base, 'Unit 3: All accounted for (3)'), text('#safety'));
  const c1 = window.supabase.createClient();
  await c1.auth.signInWithPassword({ email: 'unit1@mock.local', password: 'any' });
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
  const rows = () => $$('#people-page .pp-row');
  const row = (id) => $(`#people-page .pp-row[data-person="${id}"]`);
  check('six people are seeded on the three units, and the resources board names them', base.people().length === 6 && base.unitPeople(u.unit1).map((p) => p.name).join() === 'Ramirez,Okafor' && has('#panel', 'unit 1 ramirez, okafor · 2', 'unit 2 nguyen, patel · 2', 'unit 3 hale, dominguez · 2', '6 people in the field'), text('#panel'));
  check('the log has each check-in with the qualifications, linked to the board', !!eventText(base, 'Ramirez (swift water, EMT) checked in with Unit 1') && eventText(base, 'Ramirez (swift water, EMT) checked in with Unit 1').kind === 'status' && $$('#log .llink[data-action="people"]').length === 6, logTexts().find((t) => /Ramirez/.test(t)));
  $('.top [data-action="people"]').click();
  await until(() => !$('#people').hidden && rows().length === 6);
  check('the People board opens with everyone by unit: name, rank, qualifications, status and hours on scene', $$('#people-page .pp-grp').length === 3 && has('#people-page', '6 on scene on 3 units', 'unit 1', 'ramirez', 'lt.', 'swift water', 'emt', 'okafor', 'paramedic', 'boat', 'nguyen', 'capt.', 'boat operator', 'on scene 2 h', 'since'), text('#people-page').slice(0, 400));
  check('the chips count who on scene carries each qualification', has('#people-quals', 'swift water 3', 'boat 2', 'rope 1', 'emt 3', 'paramedic 2', 'k9 0'), text('#people-quals'));
  check('buddies are paired', $(`select[data-select="person-buddy"][data-id="${PP[0]}"]`).value === PP[1] && $(`select[data-select="person-buddy"][data-id="${PP[5]}"]`).value === PP[4]);
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

  $(`#people-page .pp-row[data-person="${PP[4]}"] [data-action="person-out"]`).click();
  await until(() => base.person(PP[4]).checked_out_at);
  check('Operations checks Hale out from the board, and the unit is recounted', base.member(u.unit3).crew_count === 1 && base.member(u.unit3).crew === 'Dominguez' && !!eventText(base, 'Hale checked out from Unit 3') && await until(() => field.person(PP[4]) && field.person(PP[4]).checked_out_at));
  await until(() => $(`#people-page .pp-row[data-person="${PP[4]}"] [data-action="person-in"]`));
  $(`#people-page .pp-row[data-person="${PP[4]}"] [data-action="person-in"]`).click();
  await until(() => !base.person(PP[4]).checked_out_at);
  check('and back in, with the qualifications on the line', base.member(u.unit3).crew_count === 2 && !!eventText(base, 'Hale (swift water, EMT) checked back in with Unit 3'), logTexts()[0]);
  const bsel = $(`select[data-select="person-buddy"][data-id="${PP[4]}"]`);
  bsel.value = ''; bsel.dispatchEvent(new Event('change', { bubbles: true }));
  await until(() => base.person(PP[4]).buddy_id === null);
  check('the buddy can be cleared from the board', base.person(PP[4]).buddy_id === null);
  const usel = () => $(`select[data-select="person-unit"][data-id="${pid}"]`);
  await until(() => usel());
  usel().value = u.unit1; usel().dispatchEvent(new Event('change', { bubbles: true }));
  await until(() => base.person(pid).user_id === u.unit1);
  check('Operations moves Smith to Unit 1: the log says from where to where, and both units are recounted', !!eventText(base, 'Smith moved from Unit 3 to Unit 1') && base.member(u.unit1).crew_count === 2 && base.unitPeople(u.unit1).length === 3 && await until(() => row(pid) && row(pid).closest('.pp-grp').dataset.unit === u.unit1), logTexts()[0]);

  $('#people-page [data-action="people-add-toggle"]').click();
  await until(() => $('#people-page form[data-form="person-add"]'));
  const af = $('#people-page form[data-form="person-add"]');
  af.unit.value = u.unit2; af.name.value = 'Lee'; af.querySelector('input[value="k9"]').checked = true;
  af.requestSubmit();
  await until(() => base.people().some((p) => p.name === 'Lee'));
  const lee = base.people().find((p) => p.name === 'Lee');
  check('Operations adds a person from the board, with the unit\'s agency and the qualification ticked', lee.user_id === u.unit2 && lee.agency === 'Travis County Rescue' && lee.qualifications.join() === 'k9' && base.member(u.unit2).crew === 'Nguyen, Patel, Lee' && !!eventText(base, 'Lee (K9) checked in with Unit 2') && await until(() => !$('#people-page form[data-form="person-add"]') && row(lee.id)), logTexts()[0]);
  const confirmWas = window.confirm; window.confirm = () => true;
  try {
    $(`#people-page .pp-row[data-person="${lee.id}"] [data-action="person-remove"]`).click();
    await until(() => base.person(lee.id).archived_at);
  } finally { window.confirm = confirmWas; }
  check('Remove archives the person, never deletes: off the roster, in the history, logged, recounted', !!base.person(lee.id).archived_at && base.people().length === 7 && base.people(true).length === 8 && M().tables.ic_people.length === 8 && !!eventText(base, 'Lee removed from Unit 2') && base.member(u.unit2).crew_count === 2 && await until(() => rows().length === 7), logTexts()[0]);

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
  check('Print 211 lists everyone by unit with when they checked in and out, and the totals', ['check-in list, ics 211', 'unit 1 · cedar fork fire department · assigned · a-1', 'ramirez, lt. · swift water, emt · checked in', 'on scene', 'smith, probie · rope · checked in', 'checked out', 'unit 2 · travis county rescue', 'nguyen, capt. · swift water, boat', 'with patel', 'new guy, driver · checked in', 'totals', '8 people checked in on 3 units · 7 on scene · 1 checked out', 'by agency: cedar fork fire department 6 · travis county rescue 2', 'on scene by qualification: swift water 3'].every((t) => has('#briefing-page', t)), text('#briefing-page').slice(0, 900));
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);
  $('#people [data-action="close-people"]').click();
  check('the board closes', $('#people').hidden);

  $(`#zones .zr[data-id="${ZONE('A-1')}"]`).click();
  await until(() => has('#panel .title', 'division a-1'));
  $('#panel [data-action="print-204"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'division a-1 assignment'));
  check('the 204 lists the unit\'s people under Resources assigned', has('#briefing-page', 'resources assigned', 'unit 1 (ramirez, okafor) · 2 people · cedar fork fire department · assigned', 'ramirez, lt. · swift water, emt', 'okafor · boat, paramedic', 'smith, probie · rope · checked out') && $$('#briefing-page p.sub').length === 3, text('#briefing-page').slice(0, 600));
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);
  $('[data-action="iap"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'incident action plan'));
  check('the IAP\'s 203 names every unit\'s people, and each 204 its own', has('#briefing-page', 'organization, ics 203', 'unit 1 (ramirez, okafor) · 2 people · cedar fork fire department', 'nguyen, capt. · swift water, boat', 'new guy, driver') && $$('#briefing-page p.sub').length >= 12, text('#briefing-page').slice(0, 800));
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);
  $('[data-action="briefing"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'briefing'));
  check('the briefing\'s Resources name them too', has('#briefing-page', 'resources', '7 people in the field on 3 units', 'unit 3 (hale, dominguez, new guy) · 3 people', 'hale · swift water, emt'), text('#briefing-page').slice(0, 800));
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
  check('the header names operational period 1 and the Incident Commander', has('#inc-sub', 'op 1', 'ic dana ruiz'), text('#inc-sub'));
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
  await until(() => base.currentPeriod() && base.currentPeriod().number === 2);
  const p2 = base.currentPeriod();
  check('period 2 starts with the new IC, period 1 is closed, and the log says what came over', p2.ic_name === 'Jordan Pike' && p2.notes.startsWith('Night') && !!base.period(per).closed_at && !!eventText(base, 'Operational period 2 started, Incident Commander Jordan Pike, 2 objectives carried over'), logTexts()[0]);
  const carried = base.objectives(p2.id);
  check('the two open objectives came over, renumbered 1 and 2, the done ones stayed behind', carried.length === 2 && carried[0].number === 1 && carried[0].text.startsWith('Primary search') && carried[1].number === 2 && carried[1].text.startsWith('Secondary search') && base.objectives(per).length === 4, carried.map((o) => o.number + ' ' + o.text).join(' | '));
  check('zones follow their objectives into the new period', base.zone(ZONE('A-1')).objective_id === carried[0].id && base.zone(ZONE('B-3')).objective_id === carried[1].id && base.zone(ZONE('B-1')).objective_id === obj[1]);
  check('carry-over wrote no objective lines of its own', base.events().filter((e) => /^Objective 1 set/.test(e.text)).length === 1);
  check('the header and the field see period 2', await until(() => has('#inc-sub', 'op 2', 'ic jordan pike')) && await until(() => field.currentPeriod() && field.currentPeriod().number === 2), text('#inc-sub'));

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
  check('the base says division where ICS does', has('#btn-zone', 'draw division') && has('.side-h', 'divisions by priority') && has('#inc-sub', '6 divisions') && /Division A-1 drawn/.test(logTexts().join(' ')), text('#inc-sub'));
  $(`#zones .zr[data-id="${a1}"]`).click();
  await until(() => has('#panel .title', 'division a-1'));
  const f = $('#panel form[data-form="zone-edit"]');
  check('the zone panel carries the 204 fields, seeded for A-1, and shows the channel and supervisor', f.work_assignment.value.startsWith('Primary search of every structure') && f.channel.value === 'TAC 2' && f.supervisor.value === 'Lt. Okafor' && has('#panel', 'radio tac 2', 'supervisor lt. okafor'), text('#panel'));
  check('the unit sees its work assignment, instructions and channel', field.zone(a1).work_assignment.startsWith('Primary search') && field.zone(a1).channel === 'TAC 2');
  $('#panel [data-action="print-204"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'division a-1 assignment'));
  check('Print the 204 opens the assignment list with the resources, the work, the instructions, the hazards and the progress', ['assignment list, ics 204', 'division a-1 · riverside drive', 'division supervisor: lt. okafor', 'radio channel: tac 2', 'resources assigned', 'unit 1 (ramirez, okafor)', 'work assignment', 'primary search of every structure', 'special instructions', 'stay out of moving water', 'period safety message', 'known hazards', 'none reported', 'progress', 'in progress · unit 1 · 9 of 24'].every((t) => has('#briefing-page', t)), text('#briefing-page').slice(0, 400));
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
  check('the seed has six searched structures in A-3 and three placed in B-2, all drawn on the map', base.structures(a3).length === 6 && base.structures(b2).length === 3 && base.structures(b2).every((s) => s.status === 'not_searched') && $$('#map path.structure').length === 9, $$('#map path.structure').length);

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
  check('the situation report opens with the counts, the seeded words, resources by status and agency, and the facilities', ['incident status summary, ics 209', 'situation', 'cedar fork crested', 'progress', '6 divisions', '6 of 9 structures on record searched', 'people: 0 needing help', 'resources needed', 'swift-water team', 'outlook', 'resources', 'assigned: 3', 'cedar fork fire department: 2 units', 'travis county rescue: 1 unit', 'facilities', 'staging area: high school east lot'].every((t) => has('#briefing-page', t)), text('#briefing-page').slice(0, 500));
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
  check('the IAP stitches the 202, 203, a 204 per division, the 205, 206 and 208 together', ['objectives, ics 202', '1. primary search', 'organization, ics 203', 'incident commander: dana ruiz', 'division a-1 supervisor: lt. okafor', 'unit 1 (ramirez, okafor)', 'assignment, ics 204 · division a-1', 'work assignment: primary search of every structure', 'assignment, ics 204 · division b-3', 'communications, ics 205', 'command: cmd 1', 'medical, ics 206', 'dell seton', 'emergency traffic: tac 9', 'safety message, ics 208', 'swift water everywhere'].every((t) => has('#briefing-page', t)), text('#briefing-page').slice(0, 500));
  check('every division has its own 204 section', $$('#briefing-page h2').filter((h) => /ICS 204/.test(h.textContent)).length === 6);
  check('each division\'s 204 in the IAP carries its map, on a page of its own when printed', $$('#briefing-page section.has-map svg.pmap').length === 6 && $$('#briefing-page svg.pmap').map((m) => m.getAttribute('aria-label')).join(', ') === 'Map of Division A-1, Map of Division A-2, Map of Division A-3, Map of Division B-1, Map of Division B-2, Map of Division B-3' && $('#briefing-page').classList.contains('kind-iap'), $$('#briefing-page svg.pmap').map((m) => m.getAttribute('aria-label')).join(', '));
  $('[data-action="close-briefing"]').click();
  check('and it closes', $('#briefing').hidden);
}

// A new unit checks in with the code; Operations can open a second incident.
async function checkIn(check) {
  const c = window.supabase.createClient();
  await c.auth.signInWithPassword({ email: 'unit4@mock.local', password: 'any' });
  const d = new Data(c);
  await d.init();
  let bad = null;
  try { await d.join('NOPE22', 'unit', 'Unit 4', ''); } catch (e) { bad = e; }
  check('a wrong code is refused with the database\'s message', !!bad && /No active incident has the code NOPE22/.test(bad.message), bad && bad.message);
  let noId = null;
  try { await d.join(' cedar7 ', 'unit', 'Unit 4', 'Smoke'); } catch (e) { noId = e; }
  check('a unit that has not said who it is cannot check in', !!noId && /Identify yourself first/.test(noId.message), noId && noId.message);
  await d.saveProfile({ full_name: 'Sam Smoke', phone: '512 555 0144', licence_number: 'S1122334', licence_state: 'TX', id_source: 'typed' });
  const inc = await d.join(' cedar7 ', 'unit', 'Unit 4', 'Smoke');
  check('the code, trimmed and upper-cased, joins the incident', inc && inc.id === INC());
  await until(() => base.units().some((u) => u.unit_name === 'Unit 4') && eventText(base, 'Unit 4 checked in as Sam Smoke, 512 555 0144, licence typed'));
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
  await stranger.auth.signInWithPassword({ email: 'stranger@mock.local', password: 'any' });
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
  check('it starts at the first report of the range, before any photo of the hour was taken', $$('#map .ppin').length === 0 && $('#replay-time').textContent !== '--:--' && Number(slider.value) > 0 && Number(slider.value) < 1000, slider.value + ' ' + $('#replay-time').textContent);
  slider.value = '1000'; slider.dispatchEvent(new Event('input', { bubbles: true }));
  await until(() => $$('#map .ppin').length === 3);
  check('at the end of the range the three photos are back and the latest log line shows', $$('#map .umark.ghost').length === 3 && has('#replay-log', '3 units on the map', logTexts()[0].slice(0, 30)), text('#replay-log'));
  slider.value = '0'; slider.dispatchEvent(new Event('input', { bubbles: true }));
  await until(() => $$('#map .umark.ghost').length === 0);
  check('at the start of the period nobody had reported yet', $$('#map .umark.ghost').length === 0 && $$('#map .ppin').length === 0 && has('#replay-log', '0 units on the map'), text('#replay-log'));
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
  check('the Field filter keeps only what the units sent', rows() > 0 && $$('#log .log-row').every((r) => /log-(photo|clear|hazard|help)/.test(r.className)) && $('[data-action="log-group"][data-group="field"]').classList.contains('on'), rows());
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
    check('the pop-out draws the log alone, open, with its chips and search; the map, the sidebar and the Pop out button left out', !!loaded && gone('#map') && gone('.side') && gone('.tools') && gone('[data-action="log-popout"]') && !gone('#log-filters') && !gone('#log-search') && !$f('#logbox').classList.contains('closed') && d().querySelectorAll('#log-filters .chip').length === 6 && d().title === 'Activity log · Cedar Fork Flooding' && $f('#inc-name').textContent === 'Cedar Fork Flooding', loaded ? d().title : 'did not load');
    await field.addNote('The pop-out sees this');
    const live = await until(() => $f('#log .log-row.new') && /The pop-out sees this/.test($f('#log').textContent) && !$f('#log-new').hidden, 6000);
    check('a line that arrives shows in the pop-out, counted as new on its header', !!live && $f('#log-new').textContent === '1 new' && /The pop-out sees this/.test($f('#log .log-row').textContent), $f('#log-new') && $f('#log-new').textContent);
    $f('#log .llink[data-action="select-structure"]').click();
    const shown = await until(() => has('#panel', 'bus barn'), 4000);
    check('a link in the pop-out opens the thing on the main screen', !!shown, text('#panel').slice(0, 120));
  } finally { frame.remove(); }
}

// The map underneath and the imagery over it: streets or satellite per device, and custom imagery
// Operations uploads by its corners for every screen.
async function layers(check) {
  const pick = $('#layer-pick');
  const tileHosts = () => [...new Set($$('#map img.leaflet-tile').map((t) => new URL(t.src).hostname))];
  check('the picker offers Streets and Satellite, Google only with a key, and starts on Streets', $$('option', pick).map((o) => o.value).join(' ') === 'streets satellite' && pick.value === 'streets' && tileHosts().some((h) => /openstreetmap/.test(h)), $$('option', pick).map((o) => o.value).join(' ') + ' ' + tileHosts());
  pick.value = 'satellite'; pick.dispatchEvent(new Event('change', { bubbles: true }));
  await until(() => tileHosts().includes('server.arcgisonline.com') && !tileHosts().some((h) => /openstreetmap/.test(h)), 6000);
  check('Satellite swaps the tiles underneath and is remembered on this device', tileHosts().includes('server.arcgisonline.com') && localStorage.getItem('ic.map.layer') === 'satellite', tileHosts());
  pick.value = 'streets'; pick.dispatchEvent(new Event('change', { bubbles: true }));
  await until(() => tileHosts().some((h) => /openstreetmap/.test(h)) && !tileHosts().includes('server.arcgisonline.com'), 6000);
  check('and back to Streets', localStorage.getItem('ic.map.layer') === 'streets', tileHosts());

  const ovl = M().ids.overlays[0];
  check('the seeded imagery is on the map and listed under Map imagery', base.overlays().length === 1 && await until(() => $$('#map img.imagery').length === 1, 6000) && has('#panel', 'map imagery', 'aerial 06:40, civil air patrol'), text('#panel'));
  const form = () => $('#panel form[data-form="overlay-add"]');
  const f = form();
  check('the upload form has the map\'s view as its corners', !!f && Number(f.north.value) > Number(f.south.value) && Number(f.east.value) > Number(f.west.value), f && f.north.value + ' ' + f.south.value);
  const corners = { south: Number(f.south.value), west: Number(f.west.value), north: Number(f.north.value), east: Number(f.east.value) };
  const dt = new DataTransfer(); dt.items.add(new File([await tinyPng()], 'drone.png', { type: 'image/png' })); f.file.files = dt.files;
  f.name.value = 'Drone pass 14:10'; f.opacity.value = '0.6';
  f.requestSubmit();
  await until(() => base.overlays().length === 2, 6000);
  const o = base.overlays()[1];
  check('saving uploads the picture and keeps its corners and opacity, logs it, and both maps show it', o.name === 'Drone pass 14:10' && o.storage_path.endsWith('.png') && o.bounds.north === corners.north && o.bounds.west === corners.west && Number(o.opacity) === 0.6 && !!eventText(base, 'Imagery: Drone pass 14:10 added to the map') && await until(() => $$('#map img.imagery').length === 2, 6000) && await until(() => field.overlays().length === 2), logTexts()[0]);
  const r = $(`#panel [data-range="overlay-opacity"][data-id="${o.id}"]`);
  r.value = '0.3'; r.dispatchEvent(new Event('change', { bubbles: true }));
  await until(() => Number(base.overlay(o.id).opacity) === 0.3);
  check('the opacity slider sets it for everyone', Number(base.overlay(o.id).opacity) === 0.3 && await until(() => field.overlay(o.id) && Number(field.overlay(o.id).opacity) === 0.3));
  $(`#panel [data-action="overlay-hide"][data-id="${o.id}"]`).click();
  await until(() => $$('#map img.imagery').length === 1);
  check('Hide takes it off this screen only', $$('#map img.imagery').length === 1 && (localStorage.getItem('ic.map.hidden') || '').includes(o.id) && !base.overlay(o.id).archived_at && !!$(`#panel [data-action="overlay-show"][data-id="${o.id}"]`));
  $(`#panel [data-action="overlay-show"][data-id="${o.id}"]`).click();
  await until(() => $$('#map img.imagery').length === 2);
  const confirmWas = window.confirm; window.confirm = () => true;
  try {
    $(`#panel [data-action="overlay-remove"][data-id="${ovl}"]`).click();
    await until(() => base.overlay(ovl).archived_at);
  } finally { window.confirm = confirmWas; }
  check('Remove archives it for everyone, never deletes, logs it, and offers to put it back', !!base.overlay(ovl).archived_at && M().tables.ic_overlays.length === 2 && !!eventText(base, 'Imagery: Aerial 06:40, Civil Air Patrol removed from the map') && await until(() => $$('#map img.imagery').length === 1) && await until(() => has('#panel', '1 removed')) && await until(() => field.overlays().length === 1), logTexts()[0]);
  $(`#panel [data-action="overlay-restore"][data-id="${ovl}"]`).click();
  await until(() => !base.overlay(ovl).archived_at);
  check('Put back restores it', await until(() => $$('#map img.imagery').length === 2) && !!eventText(base, 'Imagery: Aerial 06:40, Civil Air Patrol put back on the map'));
  const e1 = await (async () => { try { await field.addOverlay(new File([await tinyPng()], 'x.png', { type: 'image/png' }), { name: 'Nope', bounds: corners }); return null; } catch (e) { return e; } })();
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
  const url = 'http://localhost:8766/field/?join=' + M().tables.ic_incidents[0].code;
  check('the home panel draws the join code as a QR beside the code', !!$('#panel .qr-box svg') && has('#panel', 'join code for field phones', 'cedar7', 'print a join card'), text('#panel').slice(0, 200));
  $('#panel [data-action="print-join"]').click();
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
  check('the unit panel shows the identity: name, phone, the licence tail and expiry, read from the barcode, not verified, with the photo loading', has('#panel .ident', 'jordan lee hale', '512 555 0133', 'tx ···5678', 'expires 2030-03-04', 'read from the barcode', 'not verified') && !!$('#panel .ident [data-action="verify-profile"]') && await until(() => $('#panel .id-box img') && !$('#panel .id-box img').hidden && $('#panel .id-box img').src), text('#panel .ident'));
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
  await c.auth.signInWithPassword({ email: 'newcomer@mock.local', password: 'any' });
  const n = new Data(c);
  await n.init();
  const e3 = await (async () => { try { await n.join('CEDAR7', 'unit', 'Unit 9', null, null, 'Bastrop County FD', []); return null; } catch (e) { return e; } })();
  check('an account that has not said who it is cannot check in as a unit', !!e3 && /Identify yourself first/.test(e3.message), e3 && e3.message);
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
