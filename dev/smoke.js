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
  const suites = { seeded, baseActions, boundary, fieldReports, emergency, messages, accountability, people, periods, assignment, search, facilities, reports, agencies, publicInfo, replay, log, layers, zoneCard, join, identity, legend, sections, ics100, walkfix, evacuees, members, safetyset, parbyname, newcomer, checkIn, permissions, demo };
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
  if ($('#panel [data-action="close-panel"]')) { $('#panel [data-action="close-panel"]').click(); await until(() => has('#panel', 'join code')); }   // the Hazards open section is on the home panel
  await field.addHazard(hid2, { kind: 'Person or car in the water', note: 'one inside', urgency: 'now', lat: 30.2598, lng: -97.7475, zoneId: b2 });
  check('an urgent hazard sits on the bar with Acknowledge, the home panel lists it under Hazards open with its urgency, the header counts it, and the log carries the word', await until(() => has('#safety', 'hazard · person or car in the water, one inside', 'b-2') && !!$('#safety [data-action="ack-hazard"]')) && await until(() => has('#panel', 'hazards open · ', 'person or car in the water', 'act on now')) && has('#inc-sub', 'hazards open') && !!eventText(base, 'Hazard in B-2 (act on now): person or car in the water (one inside), reported by Unit 3'), text('#safety') + ' | ' + text('#inc-sub'));
  $('#safety [data-action="ack-hazard"]').click();
  check('Acknowledge takes it off the bar, logs it, and leaves it open on the list until Resolved', await until(() => !has('#safety', 'hazard ·')) && await until(() => eventText(base, 'Hazard acknowledged by Operations: person or car in the water in B-2')) && base.hazards().some((h) => h.id === hid2 && h.acked_at && !h.resolved_at) && await until(() => has('#panel', 'acknowledged')), logTexts()[0]);
  await base.resolveHazard(hid2);
  await until(() => !base.hazards().some((h) => h.id === hid2));
  // v46: a revisit time on a house record
  const rid = uuid(), rat = new Date(Date.now() + 2 * 3600000), rhh = String(rat.getHours()).padStart(2, '0') + ':' + String(rat.getMinutes()).padStart(2, '0');
  await field.addStructure(rid, { zone_id: b2, label: '113 Bee Creek Rd', status: 'not_searched', notes: 'on oxygen', revisit_at: rat.toISOString() });
  await until(() => base.structure(rid));
  $(`#zones .zr[data-id="${b2}"]`).click();
  await until(() => has('#panel .title', 'b-2'));
  check('a revisit time shows on the division\'s structure list and is logged', await until(() => has('#panel', '113 bee creek rd · not searched', 'revisit ' + rhh)) && !!eventText(base, 'B-2: 113 Bee Creek Rd · revisit requested (on oxygen)'), text('#panel').slice(0, 600));
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
  check('standing down clears the bar, keeps the alert in history, and logs it', $('#mayday').hidden && base.alerts().length === 0 && base.alerts(true).length === 1 && !!eventText(base, 'Unit 3 stood down, all OK') && $$('#map .umark.sos').length === 0);
}

// Messages (ICS 213): Operations messages Unit 3 and gets a reply, a safety message to everyone
// stays on the yellow bar until all three units acknowledge, and Unit 3 messages Operations.
async function messages(check) {
  const u = USERS();
  const composer = () => $('#panel form[data-form="message"]');
  check('the home panel shows the seeded messages, both still waiting on Unit 3, and the two answered PARs, the first closed by the second (v38)', $$('#panel .mrow.message').length === 2 && $$('#panel .mrow .ack.wait').every((e) => /waiting on unit 3/i.test(e.textContent)) && $$('#panel .mrow.par').length === 2 && $$('#panel .mrow.par .ack').some((e) => /closed by the par started/i.test(e.textContent)), text('#panel'));
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
  check('six people are seeded on the three units, and the resources board names them', base.people().length === 6 && base.unitPeople(u.unit1).map((p) => p.name).join() === 'Ramirez,Okafor' && has('#panel', 'unit 1, engine ramirez, okafor · 2', 'unit 2, boat crew nguyen, patel · 2', 'unit 3, swift-water team hale, dominguez · 2', '6 people in the field'), text('#panel'));
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
  check('Print 211 lists everyone by unit with when they checked in and out, and the totals', ['check-in list, ics 211', 'unit 1, engine · cedar fork fire department · assigned · a-1', 'ramirez, lt. · swift water, emt · checked in', 'on scene', 'smith, probie · rope · checked in', 'checked out', 'unit 2, boat crew · travis county rescue', 'nguyen, capt. · swift water, boat', 'with patel', 'new guy, driver · checked in', 'totals', '8 people checked in on 3 units · 7 on scene · 1 checked out', 'by agency: cedar fork fire department 6 · travis county rescue 2', 'on scene by qualification: swift water 3'].every((t) => has('#briefing-page', t)), text('#briefing-page').slice(0, 900));
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
  check('the header names operational period 1 and the Incident Commander', has('#inc-sub', 'op 1', 'ic dana ruiz'), text('#inc-sub'));
  { // v40: past its planned end the header says overdue, the reports say the next period has not been started, and the sheet lights Start period; before it, none of that
    const over = Date.now() > new Date(base.currentPeriod().ends_at).getTime();
    check('the header says overdue only when the planned end has passed (' + (over ? 'it has' : 'it has not') + ')', has('#inc-sub', 'overdue') === over, text('#inc-sub'));
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
  check('the join card tells Safety and Bring apart and gives the staging area with its notes and satnav coordinates (v43)', has('#briefing-page', 'safety: swift water everywhere south of mill street', 'bring: pfds and dry bags for water crews', 'getting there: high school east lot · units wait here between assignments · for a satnav 30.25560, -97.74000'), text('#briefing-page').slice(0, 900));
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
  check('the Field filter keeps only what the units sent', rows() > 0 && $$('#log .log-row').every((r) => /log-(photo|clear|hazard|help|request|shelter)/.test(r.className)) && $('[data-action="log-group"][data-group="field"]').classList.contains('on'), rows());
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
  check('Layers opens a panel: the map underneath on one side (Streets, Satellite, and Google twice because the mock\'s settings carry a key; Streets on), the overlays on the other', radios().map((r) => r.dataset.layer).join(' ') === 'streets satellite google-streets google-satellite' && radios()[0].checked && has('#layers-pop', 'map underneath', 'overlays', 'aerial 06:40', 'upload aerial photography', 'google maps, streets') && tileHosts().some((h) => /openstreetmap/.test(h)), text('#layers-pop').slice(0, 300) + ' | ' + radios().map((r) => r.dataset.layer).join(' '));
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
  $('#layers-pop [data-action="layers-upload"]').click();
  await until(() => $('#layers-pop form[data-form="overlay-add"]'));
  const pf = $('#layers-pop form[data-form="overlay-add"]');
  check('Upload aerial photography opens the form right there, corners from the map\'s view', !!pf && Number(pf.north.value) > Number(pf.south.value), pf && pf.north.value);
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await until(() => $('#layers-pop').hidden);
  check('Escape closes the panel', $('#layers-pop').hidden && !$('#btn-layers').classList.contains('on'));

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
  const url = location.origin + '/field/?join=' + M().tables.ic_incidents[0].code;   // whatever port serves this checkout
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
  $('[data-action="iap"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'incident action plan'));
  check('the 203 lists all five seats and Safety', has('#briefing-page', 'planning section chief: theresa okafor', 'logistics section chief: sam whitaker', 'finance / administration section chief: rae lindqvist', 'safety officer: priya natarajan'), text('#briefing-page').slice(0, 600));
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);
  // 2 · requests
  $('#panel [data-action="close-panel"]').click();
  await until(() => has('#panel', 'resource requests (ics 213rr)'));
  check('the home panel lists the open requests, the urgent first, with the seeded ask from Unit 1', $$('#panel .req').length >= 2 && has('#panel', '2 open', '4 portable lights', 'fuel truck, diesel', 'ordered, on the way'), text('#panel').slice(0, 400));
  const rid = uuid();
  await field.addRequest({ id: rid, kind: 'water', what: 'swift-water team', quantity: 1, urgency: 'now', note: 'Two houses with people on the roof', zoneId: ZONE('A-2'), lat: 30.2674, lng: -97.7384 });
  await until(() => base.request(rid));
  check('the field asks and the base has it at the top, logged with the words of the ask', await until(() => $(`#panel .req[data-request="${rid}"]`) && $$('#panel .req')[0].dataset.request === rid) && has('#panel', '1 to act on now') && !!eventText(base, 'Unit 3 asked for swift-water team for A-2, act on now: Two houses with people on the roof'), logTexts()[0]);
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
  check('the situation report\'s Resources needed is written from the open requests', has('#briefing-page', 'resources needed', '4 portable lights for a-1, before nightfall · asked', 'fuel truck, diesel, before nightfall · ordered, on the way, county yard'), text('#briefing-page').slice(-700));
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
  check('the header reads IC Marcus Bell', await until(() => has('#inc-sub', 'ic marcus bell')), text('#inc-sub'));
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
  check('the hurt card names the medic on the unit, the emergency channel, the nearest hospital with its distance and directions, and the check-out reminder', hl.length === 4 && hl[0].text === 'Medic on your unit: Dominguez, paramedic. Hale is an EMT.' && hl[1].text.startsWith('Call it on TAC 9, emergency traffic') && /^Nearest hospital: Dell Seton Medical Center, 0\.8 mi\. Trauma center, 12 minutes from the base\. 512 555 0100\. No ambulance on scene/.test(hl[2].text) && hl[2].directions.includes('30.278') && hl[3].text.includes('Finance needs it for the claim'), hl.map((l) => l.text).join(' | '));
  const c4 = window.supabase.createClient();
  await c4.auth.signInWithPassword({ email: 'unit4@mock.local', password: 'any' });
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
  await until(() => $('#panel [data-action="print-join"]'));
  $('#panel [data-action="print-join"]').click();
  await until(() => !$('#briefing').hidden && has('#briefing-title', 'join card'));
  check('the join card carries the six deployment lines and what to bring, from the data, and when it was printed', has('#briefing-page', 'deployment briefing', 'incident: cedar fork flooding · lead agency cedar fork fire department · ic priya natarajan', 'check in at: staging, high school east lot · units wait here between assignments', 'your assignment: given at check-in by operations. the period', 'report by:', 'for the operational period 3 briefing at staging', 'getting there: high school east lot · units wait here between assignments · for a satnav 30.25560, -97.74000', 'radio: command cmd 1 · tactical, division a tac 2', 'safety:', 'bring: pfds and dry bags for water crews', 'who to ask for', 'staging: sam whitaker (logistics) · operations: jo castillo', 'printed') && has('#briefing-page', 'check in with your phone', 'scan the code, or open', 'anyone with this code can join'), text('#briefing-page').slice(0, 1400));
  $('[data-action="close-briefing"]').click();
  await until(() => $('#briefing').hidden);

  // 7 · a unit's kind: the board, the panel, the request
  check('the resources board groups the units by kind with counts, Unit 4 among the boat crews', has('#panel', 'engines 1', 'boat crews 2', 'swift-water teams 1', 'unit 4, boat crew') && $$('#panel .badge.kind').length >= 3, text('#panel').slice(0, 500));
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
  check('the base\'s signed-out screen is the front door: the join code first, then Try it and Sign in', !!$('#auth.landing #door-form') && has('#auth .door h1', 'part of an incident right now') && $$('#auth .land-card').length === 6 && $$('#auth #show .show-pic').length === 8 && $('#auth #show .show-pic.cur').dataset.i === '0' && !!$('#auth #auth-form #auth-email'), text('#auth .door h1'));
  $('#auth #show [data-show="next"]').click();
  check('the slideshow moves one screen at a time, with its caption and its title lit', $('#auth #show .show-pic.cur').dataset.i === '1' && $('#auth #show .show-cap.cur').dataset.i === '1' && $('#auth #show .show-jump button.on').dataset.show === '1' && $('#show-n').textContent === '2 of 8', $('#show-n').textContent);
  $('#auth #show [data-show="5"]').click();
  check('a title jumps straight to that screen', $('#auth #show .show-pic.cur').dataset.i === '5' && /204/.test($('#auth #show .show-cap.cur').textContent), $('#show-n').textContent);
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
async function phoneFrame() {
  await new Promise((r) => { try { const req = indexedDB.deleteDatabase('incident-map'); req.onsuccess = req.onerror = req.onblocked = () => r(); } catch (e) { r(); } });   // an earlier frame's unsent entries would block this one's
  const frame = document.createElement('iframe');
  frame.src = '/field/?mock';
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
  P.ready = await until(() => P.$('#app') && !P.$('#app').hidden && P.$('#me-name').textContent === 'Unit 3', 20000);   // a hidden pane throttles the frame's timers
  return P;
}
async function phoneSignIn(P, email, signUp) {
  P.$('#auth-email').value = email; P.$('#auth-password').value = 'walkfix-pw';
  if (signUp) P.$('#auth-signup').click(); else P.$('#auth-form').requestSubmit();
  return until(() => P.shown('#join') && P.$('#join-user').textContent === email, 5000);
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
      check('with a code waiting, the sign-in screen says the code is ready and that any email makes an account, with Create account beside Sign in', P.shown('#auth-code') && /code cedar7 is ready/.test(P.text('#auth-code')) && /make an account with any email/.test(P.text('#auth-code')) && !P.shown('#auth-lead') && P.$('#auth-signup').classList.contains('btn') && !P.$('#auth-signup').classList.contains('link'), P.text('#auth-code'));
      await phoneSignIn(P, 'newcomer@mock.local', true);
      check('after Create account the code is on the form with its sentence, and Identify yourself is open over it', P.$('#join-form').code.value === 'CEDAR7' && P.shown('#join-code-note') && /came with the link/.test(P.text('#join-code-note')) && !P.$('#s-identify').hidden, P.text('#join-code-note'));
      check('the people rows are folded for someone on their own, and the unit box says a name will do', !P.shown('#join-people') && /your own name will do/.test(P.text('#join-unit-hint')) && /or your name/.test(P.$('#join-form').unit.placeholder), P.$('#join-form').unit.placeholder);
      P.$('#id-name').value = 'Kim Tran'; P.$('#id-phone').value = '512 555 0190';
      P.$$('#s-identify button').find((b) => b.textContent.trim() === 'Save').click();
      await until(() => P.$('#s-identify').hidden, 5000);
      const f = P.$('#join-form');
      f.count.value = '2'; f.count.dispatchEvent(new Event('input', { bubbles: true }));
      const unfold2 = P.shown('#join-people');
      f.count.value = '1'; f.count.dispatchEvent(new Event('input', { bubbles: true }));
      const fold1 = !P.shown('#join-people');
      await P.act('jp-add');
      check('a count of two unfolds the rows, one folds them, Add a person unfolds them', unfold2 && fold1 && P.shown('#join-people'), [unfold2, fold1, P.shown('#join-people')].join());
      check('a Volunteer kind is offered', !!P.$('#join [data-kind="volunteer"]'), P.$$('#join [data-kind]').map((e) => e.dataset.kind).join());
      f.unit.value = 'Volunteer 4'; f.agency.value = 'Cedar Fork volunteers'; f.count.value = '1'; P.$('#join [data-kind="volunteer"]').click();
      f.requestSubmit();
      await until(() => base.members().some((m) => m.unit_name === 'Volunteer 4'), 70000);
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
  const confirmWas = window.confirm; window.confirm = () => true;
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
    await until(() => has('#panel', 'join code'));

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
    await until(() => has('#panel', 'join code'));
    await wait(200);
    check('Close puts the card away and leaves the command post open, with nothing logged', !base.facility(icp).closed_at && base.events().length === lines && has('#panel', 'join code'));
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
    await until(() => has('#panel', 'join code'));
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
    await P.act('home');
    check('Nearby lists the boat ramp with directions (Rosa)', await until(() => /boat ramp/.test(P.text('#nearby'))) && P.$$('#nearby .near').some((r) => /low-water crossing ramp/i.test(r.textContent) && r.querySelector('a.btn[href*="google.com/maps/dir"]')), P.text('#nearby'));

    // a shared phone: sign out, and the next person finds nothing of the last
    P.$('#auth-email').value = 'unit3@mock.local'; P.$('#auth-password').value = 'typed-by-the-last-person';
    await P.act('menu');
    await P.act('sign-out');
    await until(() => P.shown('#auth'));
    check('after Sign out the sign-in form is empty, and the password does not autofill (the administrator)', P.$('#auth-email').value === '' && P.$('#auth-password').value === '' && P.$('#auth-password').getAttribute('autocomplete') === 'off', `${P.$('#auth-email').value} / ${P.$('#auth-password').value ? 'a password' : ''} / ${P.$('#auth-password').getAttribute('autocomplete')}`);
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
    check('the volunteer checks in without a licence (the shelter desk was LOST here)', !!deskIn && await until(() => eventText(base, 'Gym shelter desk checked in as Pat Doe, 512 555 0199, identity not given')), logTexts()[0]);
    check('and her briefing opens at its top too', await until(() => P.shown('#s-briefing')) && brief.scrollTop === 0);
    const desk = base.units().find((u) => u.unit_name === 'Gym shelter desk');
    check('the resources row marks her "no ID"', await until(() => has(`#panel [data-action="select-unit"][data-id="${desk.user_id}"]`, 'pat doe · no id')), text(`#panel [data-action="select-unit"][data-id="${desk.user_id}"]`));
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
    window.confirm = confirmWas;
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
  const confirmWas = window.confirm; window.confirm = () => true;
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
    P = await phoneFrame();
    check('the field app opens at 375 px as Unit 3', !!P.ready);
    await P.act('briefed');
    await P.act('addr-clear');
    P.$('#structure-label').value = '114 Pecan Ln';
    await P.act('help-up');
    check('the first person counted opens a row: who, condition, went to, the nearest shelter first', P.$$('#st-people .st-row').length === 1 && P.$('#st-people [data-stp="where"]').value === 'f:' + gym && [...P.$('#st-people [data-stp="where"]').options].map((o) => o.textContent).join('|') === 'Went to High school gym (shelter)|Went to Dell Seton Medical Center (hospital)|With family|Own transport|Not known', [...P.$('#st-people [data-stp="where"]').options].map((o) => o.textContent).join('|'));
    await P.act('st-person-add');
    const fill = (i, who, cond, where) => { P.$$('#st-people [data-stp="who"]')[i].value = who; P.$$('#st-people [data-stp="cond"]')[i].value = cond; P.$$('#st-people [data-stp="where"]')[i].value = where; };
    fill(0, 'Reyes, family of 2', 'cold, a cat', 'f:' + gym);
    fill(1, 'Mr. Okafor, 81', 'on oxygen, short of breath', 'f:' + dell);
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
    check('she checks in as a shelter desk, said in the check-in line', await until(() => P.shown('#app') && P.$('#me-name').textContent === 'Gym desk', 6000) && await until(() => eventText(base, 'Gym desk, shelter desk checked in as Pat Doe, 512 555 0199, identity not given')), logTexts()[0]);
    check('her briefing gives her job as People here at the gym, not waiting at staging', await until(() => P.shown('#s-briefing') && /people here at high school gym/.test(P.text('#briefing-list'))) && /they're here/.test(P.text('#briefing-list')) && !/wait at staging/.test(P.text('#briefing-list')), P.text('#briefing-list').slice(0, 400));
    await P.act('briefed');
    check('her home is People here: the gym\'s count against its beds, no division card and no search buttons', await until(() => P.shown('#desk') && /high school gym · 9 of 60/.test(P.text('#desk-head'))) && !P.shown('.actions') && !P.shown('#assignment') && !P.shown('#mini') && P.shown('.help'), P.text('#desk-head'));
    const desk = base.units().find((u) => u.unit_name === 'Gym desk');
    check('the desk\'s shelter is saved on her unit, so the base knows whose desk it is', await until(() => base.member(desk.user_id).facility_id === gym) && base.member(desk.user_id).kind === 'shelter_desk');
    check('Arriving from crews lists the records on their way here, with who sent them', P.$$('#desk-arriving .arrive').length === 2 && /reyes, family of 2 from 114 pecan ln · a-2 · unit 3/.test(P.text('#desk-arriving')) && /family of 4 from 112 pecan ln · unit 3/.test(P.text('#desk-arriving')), P.text('#desk-arriving'));
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
    check('her count is 11 of 60 now, the arrival gone from Arriving', await until(() => /11 of 60/.test(P.text('#desk-head'))) && P.$$('#desk-arriving .arrive').length === 1, P.text('#desk-head'));

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
    ff.beds.value = '40'; ff.expected.value = 'Bus 3 from Bee Creek, 8 people, 19:00';
    ff.requestSubmit();
    check('beds and expected are set on the card, logged, and the count reads against them', await until(() => eventText(base, 'Shelter: High school gym has 40 beds')) && !!eventText(base, 'Shelter: High school gym expecting Bus 3 from Bee Creek, 8 people, 19:00') && !eventText(base, 'Shelter: High school gym updated') && await until(() => has('#panel', '11 of 40')), logTexts().slice(0, 3).join(' | '));
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
    await until(() => has('#panel', 'join code'));
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
    check('the situation report says people sheltered, beds, moved to hospital, expected and records with no name yet', has('#briefing-page', 'people sheltered: 9 at high school gym (40 beds), 3 moved to hospital, 12 expected · 2 records with no name yet'), (text('#briefing-page').match(/people sheltered[^.]*/) || [''])[0]);
    check('and no name of anyone sheltered or moved appears in it', !/alvarez|okafor|nguyen|reyes|lopez|haddad|okonkwo/i.test($('#briefing-page').innerText));
    $('[data-action="close-briefing"]').click();

    // the rules: another unit cannot change a record it did not make; the crew can correct its own; nothing is deleted
    const c1 = window.supabase.createClient();
    await c1.auth.signInWithPassword({ email: 'unit1@mock.local', password: 'any' });
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
    window.confirm = confirmWas;
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
  const confirmWas = window.confirm, promptWas = window.prompt;
  window.confirm = () => true; window.prompt = () => 'Unit 9';
  let P = null, relief = null;
  try {
    const U = USERS(), opsCode = M().ids.opsCode;
    check('the home panel shows the Operations code with Copy and New code, and says it never goes on paper', has('#panel', 'operations code', opsCode.toLowerCase(), 'never on paper') && !!$('#panel [data-action="new-ops-code"]') && !!$('#panel [data-action="copy-ops-code"]'), text('#panel').slice(0, 400));
    check('a unit cannot read it', !field.opsCode() && ((await field.sb.from('ic_ops_codes').select('*')).data || []).length === 0);
    check('the join box and the join card do not carry it', !$('#panel .join-box').textContent.includes(opsCode) && !joinCardTextOf().includes(opsCode));
    // the role follows the code
    const c = window.supabase.createClient();
    await c.auth.signInWithPassword({ email: 'relief@mock.local', password: 'any' });
    relief = new Data(c); await relief.init();
    await relief.saveProfile({ full_name: 'Relief Chief', phone: '512 555 0177', licence_number: 'R5551212', licence_state: 'TX', date_of_birth: '1979-05-05', address: '4 Oak St, Cedar Fork', id_source: 'typed' });
    const e1 = await (async () => { try { await relief.join('CEDAR7', 'ops', 'Operations'); return null; } catch (e) { return e; } })();
    check('the base holding the units\' join code is told which code it needs', !!e1 && /join code for field units/.test(e1.message), e1 && e1.message);
    await relief.join(opsCode, 'unit', 'Whatever');
    await until(() => base.member(relief.user.id));
    check('the Operations code makes the member Operations, whatever the phone meant, and the log says so', base.member(relief.user.id).role === 'ops' && await until(() => eventText(base, 'Operations joined as Operations with the Operations code as Relief Chief, 512 555 0177, licence typed')), logTexts()[0]);
    await relief.open(INC());
    check('and they read the code too', relief.opsCode() === opsCode);
    $('#panel [data-action="new-ops-code"]').click();
    await until(() => base.opsCode() && base.opsCode() !== opsCode);
    check('New code gives a new eight-letter code, logged without the code itself, and the panel shows it', base.opsCode().length === 8 && !!eventText(base, 'Operations code replaced; the old one no longer joins') && await until(() => has('#panel', base.opsCode().toLowerCase())) && !base.events().some((e) => e.text.includes(opsCode)), logTexts()[0]);
    const e2 = await (async () => { try { await relief.join(opsCode, 'unit', 'X'); return null; } catch (e) { return e; } })();
    check('the old code no longer joins', !!e2 && /No active incident has the code/.test(e2.message), e2 && e2.message);
    // the Members tab
    $('[data-action="people"]').click();
    await until(() => !$('#people').hidden);
    $('#people-page [data-action="people-tab"][data-tab="members"]').click();
    await until(() => $('#people-page .mb-list'));
    check('the Members tab lists everyone with role, agency and identity state', has('#people-page', '5 members · 2 operations', 'operations · marcus bell', 'opened the incident', 'unit 1, engine · ana ramirez', 'verified', 'unit 2, boat crew · minh nguyen', 'licence on file, not verified', 'operations · relief chief'), text('#people-page').slice(0, 600));
    check('the opener has no Make a unit and no Remove; the others do', !$(`#people-page .mb-row[data-member="${U.ops}"] [data-action="member-role"]`) && !$(`#people-page .mb-row[data-member="${U.ops}"] [data-action="member-remove"]`) && !!$(`#people-page .mb-row[data-member="${relief.user.id}"] [data-action="member-role"][data-role="unit"]`) && !!$(`#people-page .mb-row[data-member="${U.unit1}"] [data-action="member-role"][data-role="ops"]`) && !!$(`#people-page .mb-row[data-member="${U.unit1}"] [data-action="member-remove"]`));
    $(`#people-page .mb-row[data-member="${relief.user.id}"] [data-action="member-role"][data-role="unit"]`).click();
    await until(() => $('#name-dialog').open);   // the app's own sheet, not prompt() (v44)
    $('#name-input').value = 'Unit 9'; $('#name-form').requestSubmit();
    check('Make a unit asks for the unit name, changes the role and logs it by name', await until(() => base.member(relief.user.id).role === 'unit' && base.member(relief.user.id).unit_name === 'Unit 9') && await until(() => eventText(base, 'Relief Chief is now a unit, Unit 9')), logTexts()[0]);
    await until(() => $(`#people-page .mb-row[data-member="${relief.user.id}"] [data-action="member-role"][data-role="ops"]`));
    $(`#people-page .mb-row[data-member="${relief.user.id}"] [data-action="member-role"][data-role="ops"]`).click();
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
    check('one line in the 214 counts what was cleared', M().tables.ic_events.filter((e) => /^Personal records cleared by rule: 5 licence records, 5 sheltered people's names$/.test(e.text)).length === 1, (M().tables.ic_events.find((e) => /cleared by rule/.test(e.text)) || {}).text);
    check('the picker now says cleared by rule', await until(() => has(`#pick-list [data-clear="${INC()}"]`, 'personal records cleared', 'by rule')), text(`#pick-list [data-clear="${INC()}"]`));
    // the nightly run clears what is due, called by anyone
    const closed = M().tables.ic_incidents.find((i) => i.id === INC());
    closed.personal_cleared_at = null; closed.clear_personal_at = new Date(Date.now() - 86400000).toISOString();
    check('the due run clears a closed incident whose date has come', (await field.clearPersonalDue()) === 1 && !!inc().personal_cleared_at);
  } finally {
    window.confirm = confirmWas; window.prompt = promptWas;
    if (relief) relief.close();
    if (P) P.frame.remove();
    for (const k of Object.keys(localStorage)) if (/^ic\.field\./.test(k)) localStorage.removeItem(k);
    await wait(100);
  }
}
function joinCardTextOf() {
  const btn = $('#panel [data-action="print-join"]');
  if (!btn) return '';
  btn.click();
  const t = $('#briefing-page') ? $('#briefing-page').innerText : '';
  if ($('[data-action="close-briefing"]')) $('[data-action="close-briefing"]').click();
  return t;
}

// Time in the water, incident settings and the public set (v28, migration 0020), with v25's leftovers.
async function safetyset(check) {
  const confirmWas = window.confirm; window.confirm = () => true;
  const realClick = HTMLAnchorElement.prototype.click;
  let P = null;
  try {
    const U = USERS();
    // ---- the water clock: in, overdue, probably left running, out; the rows, the panel, the reports, the log
    const boat = window.supabase.createClient();
    await boat.auth.signInWithPassword({ email: 'unit2@mock.local', password: 'any' });
    const u2 = new Data(boat); await u2.init(); await u2.open(INC());
    check('the period carries a rotation of 45 minutes, and the briefing tells a boat crew about it and the boat ramp', base.rotationMinutes() === 45);
    await u2.setInWater(U.unit2, new Date().toISOString());
    check('one tap puts the crew in the water, logged', await until(() => base.member(U.unit2).in_water_since) && await until(() => eventText(base, 'Unit 2 in the water')) && await until(() => has('#panel', 'unit 2', 'in the water 0 min')), logTexts()[0]);
    await u2.setInWater(U.unit2, new Date(Date.now() - 50 * 60000).toISOString());
    check('past the rotation the row says so in orange', await until(() => $$('#panel .ur .water.over').some((w) => /in the water 50 min/.test(w.textContent))), text('#panel').slice(0, 200));
    await u2.setInWater(U.unit2, new Date(Date.now() - 140 * 60000).toISOString());
    check('past three rotations the base says the clock was probably left running', await until(() => has('#panel', 'unit 2', 'probably left running (2 h 20 min)')));
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
    check('Operations takes the crew out, with the minutes in the log', await until(() => !base.member(U.unit2).in_water_since) && await until(() => eventText(base, 'Unit 2 out of the water after 140 min')), logTexts()[0]);
    await u2.setInWater(U.unit2, new Date(Date.now() - 12 * 60000).toISOString());
    await until(() => base.member(U.unit2).in_water_since);
    await u2.checkOut({ ticks: {}, open: [], note: '' });
    check('checking out ends the clock', await until(() => base.member(U.unit2).status === 'checked_out' && !base.member(U.unit2).in_water_since) && await until(() => eventText(base, 'Unit 2 out of the water after 12 min')));
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
      check('one tap: the row flips at once, and the base sees it in the water, logged (a hidden frame\'s outbox is slow to send)', await until(() => /in the water \d+ min · rotation 30 min/.test(P.text('#water-row')), 8000) && await until(() => base.member(U.unit3).in_water_since, 70000) && await until(() => eventText(base, 'Unit 3 in the water'), 8000), P.text('#water-row'));
      await base.setInWater(U.unit3, new Date(Date.now() - 35 * 60000).toISOString());
      check('past the rotation the row turns to the safety colour and nudges: swap the crew, with Later', await until(() => P.$('#water-row .water-row.over') && /past the rotation: swap the crew/.test(P.text('#water-row')) && !!P.$('#water-row [data-action="water-later"]'), 8000), P.text('#water-row'));
      P.$('#water-row [data-action="water-later"]').click();
      check('Later puts the nudge away until the next rotation, the clock stays', await until(() => !/swap the crew/.test(P.text('#water-row')) && /in the water 35 min/.test(P.text('#water-row')), 6000), P.text('#water-row'));
      await base.setInWater(U.unit3, new Date(Date.now() - 65 * 60000).toISOString());
      check('the next rotation asks again', await until(() => /swap the crew/.test(P.text('#water-row')), 8000), P.text('#water-row'));
      P.$('#water-row [data-action="water-toggle"]').click();
      check('one tap out, with the minutes', await until(() => !/in the water \d/.test(P.text('#water-row')) && !!P.$('#water-row [data-action="water-toggle"]'), 8000) && await until(() => !base.member(U.unit3).in_water_since, 70000) && await until(() => eventText(base, 'Unit 3 out of the water after 65 min'), 8000), logTexts()[0]);
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
    await c2.auth.signInWithPassword({ email: 'ops@mock.local', password: 'any' });
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
    await until(() => has('#panel', 'join code', '2 photos cleared for the public'), 8000);   // the page's own data has the second photo before the counts are read
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
    window.confirm = confirmWas;
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
  const confirmWas = window.confirm; window.confirm = () => true;
  let P = null;
  try {
    const U = USERS();
    // check-ins: a count with no names stands; names come off the count; neither is unknown
    const mk = async (email) => { const c = window.supabase.createClient(); await c.auth.signInWithPassword({ email, password: 'any' }); const d = new Data(c); await d.init(); await d.saveProfile({ full_name: 'Test ' + email.split('@')[0], phone: '512 555 0199' }); return d; };
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
    const ptab = $('#people-page [data-action="people-tab"][data-tab="people"]'); if (ptab && !ptab.classList.contains('on')) { ptab.click(); await until(() => $('#people-page .pp-grp')); }   // an earlier suite may have left the Members tab on
    check('the People board nudges: name them for the PAR', has('#people-page', 'no names on record for', 'unit 7 (head count unknown)', 'unit 9 (3 counted)', 'name them for the par'), text('#people-page').slice(-300));
    // Edit a person on the base
    const ramirez = base.people().find((p) => p.name === 'Ramirez');
    $(`#people-page .pp-row[data-person="${ramirez.id}"] [data-action="person-edit"]`).click();
    const ef = await until(() => $('#people-page form[data-form="person-edit"]'));
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
      check('the People board turns the person\'s row red with the unit\'s last position', await until(() => $(`#people-page .pp-row.missing[data-person="${dom.id}"]`)) && has(`#people-page .pp-row[data-person="${dom.id}"]`, 'missing since', 'unit 3 last at'), text(`#people-page .pp-row[data-person="${dom.id}"]`));
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
    window.confirm = confirmWas;
    if (P) P.frame.remove();
    if (!$('#people').hidden) $('[data-action="close-people"]').click();
    for (const k of Object.keys(localStorage)) if (/^ic\.field\./.test(k)) localStorage.removeItem(k);
    await wait(100);
  }
}
