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
import { markingFor, ringToLatLngs } from '../js/shared/rules.js';

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
  const suites = { seeded, baseActions, boundary, fieldReports, emergency, messages, accountability, checkIn, permissions };
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
  check('priority 3: the base\'s data has it, the row moves down with a 3, and the log says so', base.zone(a1).priority === 3 && $(`#zones .zr[data-id="${a1}"] .pb`).textContent === '3' && $$('#zones .zr .zr-id').map((e) => e.textContent).join(' ') === 'A-2 A-3 B-1 B-2 A-1 B-3' && logTexts()[0].endsWith('A-1 priority set to 3 Open zone'), logTexts()[0]);
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
  check('Draw zone arms the map and says what to do', $('#map').classList.contains('drawing') && has('#tool-hint', 'outline the zone') && !$('#draw-btns').hidden);
  mapClick(-70, -40); mapClick(70, -40); mapClick(0, 50);
  check('three clicks on the map are three corners, drawn as a dashed outline with its dots', has('#tool-hint', '3 points') && $$('#map path').length === before + 4, `${$$('#map path').length - before} new paths · ${text('#tool-hint')}`);
  $('[data-action="finish-draw"]').click();
  await until(() => $('#panel form[data-form="new-zone"]'));
  const form = $('#panel form[data-form="new-zone"]');
  check('Finish opens the new-zone form with the next code in the last division', !!form && form.code.value === 'B-4' && !$('#map').classList.contains('drawing'), form && form.code.value);
  form.name.value = 'Smoke test zone'; form.structures.value = '5';
  form.requestSubmit();
  await until(() => base.zoneByCode('B-4') && eventText(base, 'Zone B-4 drawn, priority 2'));
  const b4 = base.zoneByCode('B-4');
  check('the zone is saved with the drawn polygon, priority 2, 5 structures', !!b4 && ringToLatLngs(b4.polygon).length === 3 && b4.priority === 2 && b4.structures === 5 && b4.name === 'Smoke test zone' && b4.status === 'open');
  check('it is selected, in the list, on the map, and in the log', has('#panel .title', 'b-4', 'smoke test zone') && $$('#zones .zr').length === 7 && $$('#map .zpill').length === 7 && /Zone B-4 drawn, priority 2/.test(logTexts()[0]), logTexts()[0]);
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
  check('a unit can change its head count, and the board shows it', await until(() => base.member(u.unit3).crew_count === 3 && has('#panel', '7 people in the field')), text('#panel'));

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
  check('checking in again makes it available with its head count, and logs it', inc.id === INC() && base.member(u.unit3).checked_out_at === null && base.member(u.unit3).crew_count === 2 && !!eventText(base, 'Unit 3 checked in with 2 people'));
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
  const inc = await d.join(' cedar7 ', 'unit', 'Unit 4', 'Smoke');
  check('the code, trimmed and upper-cased, joins the incident', inc && inc.id === INC());
  await until(() => base.units().some((u) => u.unit_name === 'Unit 4') && eventText(base, 'Unit 4 checked in'));
  check('the base sees Unit 4 join, available in its resources list and in the log', base.units().some((u) => u.unit_name === 'Unit 4' && u.crew === 'Smoke' && u.status === 'available') && !!eventText(base, 'Unit 4 checked in') && has('#panel', 'unit 4', 'available'), text('#panel'));
  await d.open(INC());
  check('Unit 4 can read the incident it joined', d.me().unit_name === 'Unit 4' && d.zones().length === 6);
  const made = await d.createIncident({ name: 'Smoke drill', period: 'OP 1', base: 'Depot', lat: 30.3, lng: -97.7, zoom: 14 });
  check('a new incident gets a six-letter code without 0, O, 1 or I', /^[A-HJ-NP-Z2-9]{6}$/.test(made.code) && made.name === 'Smoke drill' && made.status === 'active', made.code);
  await d.open(made.id);
  check('its creator is Operations on it, and the log opens with it', d.me().role === 'ops' && d.events().length === 1 && d.events()[0].text === 'Incident opened: Smoke drill');
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
