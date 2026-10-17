// The field app: sign in, check in to an incident with its code, then report. Everything a unit
// sends goes through the outbox, so a dead spot never loses a photo or a cleared zone.
import { Data } from '../shared/data.js';
import { Outbox } from '../shared/queue.js';
import { Sensors } from './sensors.js';
import { pickPhoto, shrink } from './camera.js';
import { compass, hhmm, ago, pct, unitLabel, zoneAt, ringToLatLngs, latLngText, markingFor, periodLabel, nextPass, passDone, structureSummary, nearestFacility, facilityKind, milesText, directionsUrl, commandText, urgencyLabel, qualsText, crewNames, onSceneText, URGENCY, NOTE_CHIPS, HAZARD_KINDS, CLEAR_HAZARDS, PHOTO_WEDGE, STATUS_LABEL, OOS_REASONS, OCCUPANTS, WATER, DAMAGE, QUALIFICATIONS } from '../shared/rules.js';

const LAST_INCIDENT = 'ic.field.incident';
import { applyTheme, storedTheme } from '../shared/theme.js';
import { availableLayers, layerDef, storedLayer, storeLayer, makeBaseLayer, makeOverlay } from '../shared/layers.js';
import { joinUrl, codeFromScan, codeFromSearch, qrSvg } from '../shared/qr.js';
import { startScan } from './scan.js';
import { parseLicence, looksLikeLicence, licenceExpired, licenceTail } from '../shared/licence.js';
const AGENCY_KEY = 'ic.field.agency';
const JOIN_KEY = 'ic.field.join';   // a code that arrived in the address (?join=), kept through sign-in
const SEEN_ZONE = 'ic.field.seen.';
const POSITION_EVERY_MS = 10000;
const POSITION_MIN_M = 8;

const $ = (sel) => document.querySelector(sel);
const data = window.sb ? new Data(window.sb) : null;
const state = { screen: 'home', pending: null, noteI: 0, hazI: 0, victims: 0, clearHaz: new Set(), lastSentAt: null, lastPosSent: null, lastPosAt: 0, justCleared: null, outbox: 0, outboxError: null, seenMsgs: null, composeI: 0, parCounts: new Map(), oosPick: null, st: null, pass: 'primary', composeU: '', composeLoc: null, ident: { read: null, photo: null, source: '' }, identShown: false, joinPeople: [blankPerson(), blankPerson()], mpQuals: new Set() };
function blankPerson() { return { name: '', role: '', quals: new Set() }; }
let composeMap = null, composeMarker = null, composeZone = null;
const QUICK = ['Need more hands', 'Water rising here', 'Road blocked', 'Done here, what next?'];   // suggestions under the box, gone once the unit types
const REPLIES = ['Copy', 'Will do', 'Cannot'];
let mini = null, miniLayers = null, miniZoneId = null, miniBase = null;
const miniOverlays = new Map();   // overlay id → { layer, stamp }
const overlayUrls = new Map();
let drawQueued = false;

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
// Live updates redraw often; only touch the DOM when the words changed, so a tap never lands on a button that was just replaced.
function setHtml(el, html) { if (el.__html !== html) { el.__html = html; el.innerHTML = html; } }
function setCard(el, cls, html) { if (el.className !== cls) el.className = cls; setHtml(el, html); }
function uuid() { return crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }); }

function toast(msg, bad) {
  const el = $('#toast');
  el.textContent = msg; el.classList.toggle('bad', !!bad); el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 2600);
}

function show(which) { for (const id of ['auth', 'join', 'app']) $('#' + id).hidden = id !== which; }
function screen(name) {
  state.screen = name;
  for (const s of ['photo', 'clear', 'hazard', 'help', 'helpsent', 'menu', 'safety', 'inbox', 'compose', 'structure', 'showcode']) $('#s-' + s).hidden = name !== s;
  if (name === 'home') { state.pending = null; if (mini) setTimeout(() => mini.invalidateSize(), 50); }
}

// ---- the outbox: what the phone sends, in order, even after a dead spot
const outbox = new Outbox({
  photo: (p, blob) => data.addPhoto(p.id, blob, p),
  addr: (p) => data.updateZone(p.zoneId, { cleared: p.cleared }),
  clear: (p) => data.updateZone(p.zoneId, p.patch),
  hazard: (p) => data.addHazard(p.id, p),
  alert: (p) => data.raiseAlert(p.id, p),
  standdown: (p) => data.standDown(p.id),
  message: (p) => data.sendMessage(p.id, p),
  ack: (p) => data.ackMessage(p.messageId, p.reply, p.count),
  status: (p) => data.setStatus(p.userId, p.status, p.note),
  structure: (p) => (p.update ? data.updateStructure(p.id, p.fields) : data.addStructure(p.id, p.fields)),
  pass: (p) => data.finishPass(p.zoneId, p.pass, p.opts),
  person: (p) => data.addPerson(p.id, p),
  personPatch: (p) => data.updatePerson(p.id, p.patch)
}, (count, err) => { state.outbox = count; state.outboxError = err; queueDraw(); });

// ---- sensors
const sensors = new Sensors(async (what) => {
  if (what === 'pos') await maybeSendPosition();
  queueDraw();
});

async function maybeSendPosition() {
  const p = sensors.pos;
  if (!p || !data.incident || !navigator.onLine) return;
  const now = Date.now();
  const moved = !state.lastPosSent || distance(state.lastPosSent, p) > POSITION_MIN_M;
  if (now - state.lastPosAt < POSITION_EVERY_MS && !(moved && now - state.lastPosAt > 3000)) return;
  state.lastPosAt = now; state.lastPosSent = p;
  try { await data.upsertPosition({ lat: p.lat, lng: p.lng, heading: sensors.heading, accuracy: p.accuracy }); state.lastSentAt = now; }
  catch (e) { console.warn('position not sent', e.message); }
}
function distance(a, b) {
  const R = 6371000, toRad = (x) => x * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// ---- boot
async function boot() {
  if (!data) { document.body.innerHTML = '<p style="padding:24px">Supabase is not configured. See config.example.js.</p>'; return; }
  const user = await data.init();
  data.on((what) => {
    if (what === 'auth') { if (!data.user) show('auth'); else if (!$('#auth').hidden) showJoin(); }
    if (what === 'change' || what === 'open' || what === 'realtime') queueDraw();
  });
  if (!user) { show('auth'); return; }
  const last = localStorage.getItem(LAST_INCIDENT);
  if (last && !pendingJoin()) { try { await openIncident(last); return; } catch (e) { console.warn(e); localStorage.removeItem(LAST_INCIDENT); } }
  await showJoin();
}

// ---- a join link: ?join=<code> in the address, kept through sign-in, used once
(function takeJoinLink() {
  const code = codeFromSearch(location.search);
  if (!code) return;
  try { sessionStorage.setItem(JOIN_KEY, code); } catch (e) { /* storage blocked */ }
  try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* fine */ }
})();
function pendingJoin() { try { return sessionStorage.getItem(JOIN_KEY) || ''; } catch (e) { return ''; } }
function clearPendingJoin() { try { sessionStorage.removeItem(JOIN_KEY); } catch (e) { /* fine */ } }

// ---- auth
$('#auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#auth-msg'); msg.textContent = 'Signing in…'; msg.classList.remove('ok');
  try { await data.signIn($('#auth-email').value.trim(), $('#auth-password').value); msg.textContent = ''; await showJoin(); }
  catch (err) { msg.textContent = err.message || String(err); }
});
$('#auth-signup').addEventListener('click', async () => {
  const msg = $('#auth-msg');
  const email = $('#auth-email').value.trim(), password = $('#auth-password').value;
  if (!email || password.length < 8) { msg.textContent = 'Enter an email and a password of at least 8 characters.'; return; }
  try {
    const res = await data.signUp(email, password);
    if (res.session) { msg.textContent = ''; await showJoin(); }
    else { msg.textContent = 'Account created. Check your email to confirm it, then sign in.'; msg.classList.add('ok'); }
  } catch (err) { msg.textContent = err.message || String(err); }
});

// ---- check in
async function showJoin() {
  show('join');
  $('#join-user').textContent = data.user ? data.user.email : '';
  try { const f = $('#join-form'); if (!f.agency.value) f.agency.value = localStorage.getItem(AGENCY_KEY) || ''; } catch (e) { /* storage blocked */ }
  const pending = pendingJoin();
  if (pending) { const f = $('#join-form'); f.code.value = pending; f.unit.focus(); toast('Code ' + pending + ' from the link. Name your unit and check in.'); }
  try { await data.myProfile(); } catch (e) { console.warn(e); }
  drawYouLine();
  if (!data.profileComplete() && !state.identShown) { state.identShown = true; openIdentify(); }
  drawJoinPeople();
  const list = $('#join-list');
  list.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const rows = (await data.myIncidents()).filter((r) => r.status === 'active');
    const already = pending && rows.find((r) => r.code === pending);
    if (already) { clearPendingJoin(); toast('You are already on ' + already.name); await openIncident(already.id); return; }
    list.innerHTML = rows.length ? rows.map((r) => `
      <button class="pick-row" data-action="open-incident" data-id="${r.id}">
        <span style="flex:1;min-width:0"><span class="name">${esc(r.name)}</span><br><span class="sub">${esc(r.period || '')} · you are ${r.role === 'ops' ? 'Operations' : esc(r.unit_name || 'a unit')}</span></span>
        <span class="pill mono">${esc(r.code)}</span>
      </button>`).join('') : '<p class="muted">None yet. Check in above with the code from Operations.</p>';
  } catch (err) { list.innerHTML = `<p class="msg">${esc(err.message || err)}</p>`; }
}

$('#compose-text').addEventListener('input', () => { $('#compose-chips').hidden = $('#compose-text').value.trim() !== ''; });

// The people on the unit at check-in: a row per person, name and rank or role typed, what they are
// qualified for tapped. The rows live in state.joinPeople; the inputs are read back before a redraw.
function qualChips(quals, action, extra) {
  return QUALIFICATIONS.map(([q, label]) => `<button type="button" class="chip sm${quals.has(q) ? ' on' : ''}" data-action="${action}" data-q="${q}"${extra || ''} aria-pressed="${quals.has(q)}">${esc(label)}</button>`).join('');
}
function drawJoinPeople() {
  $('#join-people').innerHTML = state.joinPeople.map((p, i) => `
    <div class="pp-edit">
      <div class="pp-edit-top"><input class="input" placeholder="Name" data-jp="name" data-i="${i}" value="${esc(p.name)}" autocapitalize="words" autocomplete="off" maxlength="80"><input class="input" placeholder="Rank or role" data-jp="role" data-i="${i}" value="${esc(p.role)}" autocomplete="off" maxlength="60">${state.joinPeople.length > 1 ? `<button type="button" class="btn pp-x" data-action="jp-remove" data-i="${i}" aria-label="Remove this person" title="Remove this person">×</button>` : ''}</div>
      <div class="chips">${qualChips(p.quals, 'jp-qual', ` data-i="${i}"`)}</div>
    </div>`).join('');
}
function syncJoinPeople() {
  for (const el of document.querySelectorAll('#join-people [data-jp]')) { const p = state.joinPeople[Number(el.dataset.i)]; if (p) p[el.dataset.jp] = el.value; }
}
function joinPeopleList() {
  syncJoinPeople();
  return state.joinPeople.filter((p) => p.name.trim()).map((p) => ({ name: p.name.trim(), role: p.role.trim(), qualifications: [...p.quals] }));
}

$('#join-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, msg = f.querySelector('[data-msg]');
  msg.textContent = 'Checking in…';
  try {
    const inc = await data.join(f.code.value, 'unit', f.unit.value, null, null, f.agency.value, joinPeopleList());
    try { localStorage.setItem(AGENCY_KEY, f.agency.value.trim()); } catch (e) { /* storage blocked */ }
    f.reset(); msg.textContent = '';
    clearPendingJoin();
    state.joinPeople = [blankPerson(), blankPerson()];
    drawJoinPeople();
    await openIncident(inc.id);
  } catch (err) { msg.textContent = err.message || String(err); }
});

// ---- the open incident
async function openIncident(id) {
  await data.open(id);
  if (!data.profile) data.myProfile().catch(() => {});
  localStorage.setItem(LAST_INCIDENT, id);
  show('app');
  screen('home');
  if (!mini) {
    mini = L.map($('#mini'), { zoomControl: false, attributionControl: true, dragging: true, tap: false });
    mini.createPane('imagery').style.zIndex = 250;
    setMiniLayer(storedLayer() || 'streets');
    miniLayers = { zone: L.layerGroup().addTo(mini), pins: L.layerGroup().addTo(mini), me: L.layerGroup().addTo(mini) };
    mini.setView([30.2672, -97.7431], 13);
  }
  miniZoneId = null;
  state.seenMsgs = new Set(data.myInbox().map((m) => m.id));
  sensors.start();
  outbox.flush();
  drawAll();
}

// ---- messages: the inbox, the card on the home screen, the safety takeover
function noticeNewMessages() {
  if (!state.seenMsgs) return;
  let fresh = null;
  for (const m of data.myUnanswered()) if (!state.seenMsgs.has(m.id)) { state.seenMsgs.add(m.id); fresh = fresh || m; }
  if (!fresh) return;
  if (navigator.vibrate) navigator.vibrate(fresh.kind === 'safety' ? [200, 100, 200, 100, 400] : [120, 60, 120]);
  if (fresh.kind !== 'safety') toast('Message from ' + unitLabel(data.member(fresh.from_user)));
}

function messageRow(m, big) {
  const me = data.user.id;
  const mine = m.from_user === me;
  const acked = data.ack(m.id, me);
  const to = m.to_users || [];
  const waiting = data.waitingOn(m);
  let state_ = '';
  if (mine) state_ = to.length ? (waiting.length ? 'Waiting on ' + waiting.map((u) => esc(unitLabel(data.member(u)))).join(', ') : 'Acknowledged by ' + data.acksFor(m.id).map((a) => esc(unitLabel(data.member(a.user_id))) + (a.reply && a.reply !== 'Copy' ? ' (' + esc(a.reply) + ')' : '')).join(', ')) : '';
  else if (acked) state_ = 'You answered ' + esc(acked.reply || 'Acknowledged') + ' at ' + hhmm(acked.acked_at);
  let btns = '';
  if (!mine && !acked) {
    if (m.kind === 'safety') btns = `<div class="mrow-btns"><button class="btn" data-action="ack" data-id="${m.id}" data-reply="Acknowledged">Acknowledge</button></div>`;
    else if (m.kind === 'par') btns = `<div class="par-count"><span>People with you</span><button class="btn" data-action="par-less" data-id="${m.id}" aria-label="Fewer">−</button><span class="num">${parCount(m.id)}</span><button class="btn" data-action="par-more" data-id="${m.id}" aria-label="More">+</button></div><div class="mrow-btns"><button class="btn green" data-action="par-ok" data-id="${m.id}">All accounted for</button><button class="btn" data-action="par-missing" data-id="${m.id}">Missing someone</button></div>`;
    else btns = `<div class="mrow-btns">${REPLIES.map((r) => `<button class="btn${r === 'Copy' ? ' pri' : ''}" data-action="ack" data-id="${m.id}" data-reply="${r}">${r}</button>`).join('')}</div>`;
  }
  const marks = (m.urgency ? `<span class="badge urg-${esc(m.urgency)}">${esc(urgencyLabel(m.urgency))}</span>` : '') + (m.lat != null && m.lng != null ? '<span class="muted">· location attached</span>' : '');
  return `
    <div class="mrow ${esc(m.kind)}${mine ? ' mine' : ''}">
      <div class="mrow-top"><span class="t mono">${hhmm(m.created_at)}</span><span class="who">${mine ? 'You' : esc(unitLabel(data.member(m.from_user)))}</span><span>to ${esc(m.to_label || 'everyone')}</span>${m.kind === 'safety' ? '<span class="badge haz">Safety</span>' : ''}${m.kind === 'par' ? '<span class="badge">PAR</span>' : ''}${marks}</div>
      <div class="mrow-text">${esc(m.text)}</div>
      ${state_ ? `<div class="mrow-state">${state_}</div>` : ''}
      ${btns}
    </div>`;
}

function drawInbox() {
  const me = data.user.id;
  const rows = data.messages().filter((m) => m.from_user === me || (m.to_users || []).includes(me));
  setHtml($('#inbox-list'), rows.length ? rows.map((m) => messageRow(m)).join('') : '<p class="muted">No messages yet. Operations will see anything you send.</p>');
}

// ---- Message Operations: how urgent (the four words), the words, and the spot it is about
function drawCompose() {
  $('#compose-urgency').innerHTML = URGENCY.map(([v, label]) => `<button class="chip${state.composeU === v ? ' on' : ''}" data-action="cmp-u" data-value="${v}">${esc(label)}</button>`).join('');
  const typed = $('#compose-text').value.trim() !== '';
  $('#compose-chips').hidden = typed;
  $('#compose-chips').innerHTML = QUICK.map((c) => `<button class="chip" data-action="cmp" data-text="${esc(c)}">${esc(c)}</button>`).join('');
  const loc = state.composeLoc;
  $('#compose-loc').textContent = loc ? 'Remove location' : 'Attach my location';
  $('#compose-loc-text').textContent = loc ? latLngText(loc.lat, loc.lng) : '';
  $('#compose-map').hidden = !loc;
  $('#compose-map-hint').hidden = !loc;
  if (loc) drawComposeMap(loc);
}
// The spot: the unit's fix on a small map, as Operations will see it, with the pin free to drag.
function drawComposeMap(loc) {
  if (!composeMap) {
    composeMap = L.map($('#compose-map'), { zoomControl: false, attributionControl: false, tap: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(composeMap);
    composeZone = L.layerGroup().addTo(composeMap);
    composeMarker = L.marker([loc.lat, loc.lng], { draggable: true, icon: L.divIcon({ html: '<span class="mpin urg-none"></span>', className: '', iconSize: [0, 0], iconAnchor: [0, 0] }) }).addTo(composeMap);
    composeMarker.on('dragend', () => { const p = composeMarker.getLatLng(); state.composeLoc = { lat: p.lat, lng: p.lng }; $('#compose-loc-text').textContent = latLngText(p.lat, p.lng) + ' · moved'; });
    composeMap.on('click', (e) => { composeMarker.setLatLng(e.latlng); state.composeLoc = { lat: e.latlng.lat, lng: e.latlng.lng }; $('#compose-loc-text').textContent = latLngText(e.latlng.lat, e.latlng.lng) + ' · moved'; });
  }
  composeZone.clearLayers();
  for (const z of data.zones()) { const pts = ringToLatLngs(z.polygon); if (pts.length >= 3) L.polygon(pts, { color: '#24588F', weight: 1.5, fillOpacity: 0.08, interactive: false }).addTo(composeZone); }
  composeMarker.setLatLng([loc.lat, loc.lng]);
  composeMap.setView([loc.lat, loc.lng], 17);
  setTimeout(() => composeMap.invalidateSize(), 50);
}
function toggleComposeLocation() {
  if (state.composeLoc) { state.composeLoc = null; drawCompose(); return; }
  const p = sensors.pos;
  if (!p) { toast('No GPS fix yet', true); return; }
  state.composeLoc = { lat: p.lat, lng: p.lng };
  drawCompose();
}

async function sendCompose() {
  const text = $('#compose-text').value.trim();
  if (!text) { toast('Say something first', true); return; }
  const r = data.recipientsFor('ops');
  if (!r.toUsers.length) { toast('Nobody at Operations to send to', true); return; }
  const id = uuid();
  const loc = state.composeLoc;
  const extra = { urgency: state.composeU || '', lat: loc ? loc.lat : null, lng: loc ? loc.lng : null };
  data.local('ic_messages', { id, incident_id: data.incident.id, from_user: data.user.id, to_users: r.toUsers, to_label: r.toLabel, to_zone: null, kind: 'message', text, ...extra, created_at: new Date().toISOString() });
  await outbox.add('message', { id, toUsers: r.toUsers, toLabel: r.toLabel, toZone: null, kind: 'message', text, ...extra });
  state.lastSentAt = Date.now();
  $('#compose-text').value = ''; state.composeI = 0; state.composeU = ''; state.composeLoc = null;
  screen('inbox'); drawInbox();
  toast(navigator.onLine ? 'Sent to Operations' : 'Kept, it sends when there is signal');
  queueDraw();
}

async function ackMessage(id, reply) {
  const m = data.message(id);
  if (!m || data.ack(id, data.user.id)) return;
  data.local('ic_message_acks', { message_id: id, incident_id: data.incident.id, user_id: data.user.id, reply, count: null, acked_at: new Date().toISOString() });
  await outbox.add('ack', { messageId: id, reply });
  state.lastSentAt = Date.now();
  if (state.screen === 'inbox') drawInbox();
  if (state.screen === 'safety') drawSafety();
  queueDraw();
}

function drawSafety() {
  const open = data.myUnanswered().filter((m) => m.kind === 'safety' || m.kind === 'par');
  const hasPar = open.some((m) => m.kind === 'par'), hasSafety = open.some((m) => m.kind === 'safety');
  $('#safety-title').textContent = hasPar && hasSafety ? 'Safety message and head count' : hasPar ? 'Head count (PAR)' : 'Safety message';
  setHtml($('#safety-list'), open.map((m) => messageRow(m, true)).join(''));
}

// ---- accountability: the PAR answer, your status, check-out
function parCount(id) {
  if (!state.parCounts.has(id)) { const me = data.me(); state.parCounts.set(id, me && me.crew_count != null ? me.crew_count : 1); }
  return state.parCounts.get(id);
}
async function answerPar(id, allAccounted) {
  const m = data.message(id);
  if (!m || data.ack(id, data.user.id)) return;
  const count = parCount(id);
  const reply = allAccounted ? 'All accounted for' : 'Missing someone';
  data.local('ic_message_acks', { message_id: id, incident_id: data.incident.id, user_id: data.user.id, reply, count, acked_at: new Date().toISOString() });
  await outbox.add('ack', { messageId: id, reply, count });
  state.lastSentAt = Date.now();
  if (!allAccounted && !myAlert()) await sendAlert();
  else { if (state.screen === 'safety') drawSafety(); toast('Head count sent: ' + count); }
  queueDraw();
}
async function setMyStatus(status, note) {
  const me = data.me();
  if (!me) return;
  data.local('ic_members', Object.assign({}, me, { status, status_note: note || '', status_at: new Date().toISOString() }));
  await outbox.add('status', { userId: me.user_id, status, note: note || '' });
  state.oosPick = null;
  toast(STATUS_LABEL[status] + (note ? ': ' + note : ''));
  drawMenu();
  queueDraw();
}
async function checkOut() {
  const me = data.me();
  if (!me || !confirm('Check out of ' + data.incident.name + '? Your zone goes back to Operations and your location stops sharing.')) return;
  try { await data.setStatus(me.user_id, 'checked_out'); }
  catch (e) { toast('Could not check out: ' + (e.message || e), true); return; }
  sensors.stop();
  data.close();
  localStorage.removeItem(LAST_INCIDENT);
  screen('home');
  await showJoin();
  toast('Checked out');
}
function drawStatus() {
  const me = data.me();
  if (!me) return;
  const st = me.status || 'available';
  const onZone = data.myZones().some((z) => z.status === 'active');
  const btn = (status, label) => `<button class="btn" data-action="status" data-status="${status}">${label}</button>`;
  const html = `
    <div class="status-row"><span class="badge st-${esc(st)}">${STATUS_LABEL[st]}${me.status_note ? ': ' + esc(me.status_note) : ''}</span><span class="muted" style="font-size:12px">since ${hhmm(me.status_at)}</span></div>
    <div class="status-row" style="margin-top:8px">
      ${st !== 'available' ? btn('available', 'Available at staging') : ''}
      ${st === 'out_of_service' && onZone ? btn('assigned', 'Back on my zone') : ''}
      ${st !== 'out_of_service' ? `<button class="btn" data-action="oos-pick">Out of service</button>` : ''}
    </div>
    ${state.oosPick != null ? `<div class="chips" style="margin-top:8px">${OOS_REASONS.map((r, i) => `<button class="chip${state.oosPick === i ? ' on' : ''}" data-action="oos" data-i="${i}">${esc(r)}</button>`).join('')}</div><div class="status-row" style="margin-top:8px"><button class="btn pri" data-action="oos-go">Go out of service</button><button class="btn" data-action="oos-cancel">Cancel</button></div>` : ''}`;
  setHtml($('#menu-status'), html);
  drawPeople();
}

// ---- the people on the unit: who is here, since when, and check-out one at a time
function drawPeople() {
  const me = data.me();
  if (!me) return;
  const rows = data.unitPeople(me.user_id);
  const on = rows.filter((p) => !p.checked_out_at);
  const html = (rows.length ? `<div class="muted small">${on.length} on the unit${rows.length > on.length ? ', ' + (rows.length - on.length) + ' checked out' : ''}. Operations counts them from here.</div>` : '<div class="muted small">No names on record yet. Add each person below, with what they are qualified for.</div>')
    + rows.map((p) => {
      const buddy = p.buddy_id ? data.person(p.buddy_id) : null;
      const sub = [qualsText(p.qualifications), p.checked_out_at ? 'checked out ' + hhmm(p.checked_out_at) : 'since ' + hhmm(p.checked_in_at) + ' · ' + onSceneText(p) + ' on scene', buddy ? 'with ' + buddy.name : ''].filter(Boolean).join(' · ');
      return `<div class="pp-row${p.checked_out_at ? ' out' : ''}" data-person="${p.id}">
        <span class="pp-main"><span class="pp-name">${esc(p.name)}${p.role ? ` <span class="role">${esc(p.role)}</span>` : ''}</span><span class="pp-sub">${esc(sub)}</span></span>
        ${p.checked_out_at ? `<button class="btn sm" data-action="person-in" data-id="${p.id}">Back in</button>` : `<button class="btn sm" data-action="person-out" data-id="${p.id}">Check out</button>`}
      </div>`;
    }).join('');
  setHtml($('#menu-people'), html);
  setHtml($('#mp-quals'), qualChips(state.mpQuals, 'mp-qual'));
}
async function addPerson() {
  const me = data.me();
  const name = $('#mp-name').value.trim(), role = $('#mp-role').value.trim();
  if (!me) return;
  if (!name) { toast('Type the person\'s name first', true); $('#mp-name').focus(); return; }
  const id = uuid();
  const row = { id, incident_id: data.incident.id, user_id: me.user_id, name, role, agency: me.agency || '', qualifications: [...state.mpQuals], buddy_id: null, notes: '', checked_in_at: new Date().toISOString(), checked_out_at: null, archived_at: null };
  data.local('ic_people', row);
  $('#mp-name').value = ''; $('#mp-role').value = ''; state.mpQuals = new Set();
  await outbox.add('person', { id, userId: me.user_id, name, role, agency: me.agency || '', qualifications: row.qualifications });
  state.lastSentAt = Date.now();
  toast(name + (navigator.onLine ? ' checked in with ' + unitLabel(me) : ' kept, it sends when there is signal'));
  drawPeople();
  queueDraw();
}
async function setPersonOut(id, out) {
  const p = data.person(id);
  if (!p) return;
  const patch = { checked_out_at: out ? new Date().toISOString() : null };
  data.local('ic_people', Object.assign({}, p, patch));
  await outbox.add('personPatch', { id, patch });
  state.lastSentAt = Date.now();
  toast(p.name + (out ? ' checked out' : ' back on the unit'));
  drawPeople();
  queueDraw();
}

function myZone() {
  const mine = data.myZones().filter((z) => z.status !== 'cleared');
  if (mine.length) return mine[0];
  const assigned = data.myZones();
  if (assigned.length) return assigned[0];
  const p = sensors.pos;
  return p ? zoneAt(data.zones(), p.lat, p.lng) : null;
}
function myAlert() { return data.user ? data.alerts().find((a) => a.user_id === data.user.id) || null : null; }

// Once per frame while frames come; at once when they have stopped (a background tab, a hidden pane).
let lastFrameAt = 0;
(function tickFrames() { requestAnimationFrame(() => { lastFrameAt = Date.now(); tickFrames(); }); })();
function queueDraw() {
  if (drawQueued) return;
  if (Date.now() - lastFrameAt > 1500) { drawAll(); return; }
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; drawAll(); });
}

function drawAll() {
  if (!data.incident || $('#app').hidden) return;
  const me = data.me();
  $('#me-name').textContent = unitLabel(me);
  $('#me-crew').textContent = [me && crewNames(me, data.people()), me && STATUS_LABEL[me.status], data.incident.name].filter(Boolean).join(' · ');

  const gps = $('#gps-pill');
  if (sensors.error) { gps.className = 'live bad'; $('#gps-text').textContent = 'No GPS'; }
  else if (!sensors.pos) { gps.className = 'live off'; $('#gps-text').textContent = 'Locating'; }
  else if (!navigator.onLine) { gps.className = 'live off'; $('#gps-text').textContent = 'Offline'; }
  else { gps.className = 'live'; $('#gps-text').textContent = 'Live'; }

  noticeNewMessages();
  const unanswered = data.myUnanswered();
  const badge = $('#inbox-badge');
  badge.hidden = unanswered.length === 0;
  badge.textContent = unanswered.length;
  const safetyOpen = unanswered.filter((m) => m.kind === 'safety' || m.kind === 'par');
  if (safetyOpen.length && state.screen !== 'helpsent' && state.screen !== 'safety') screen('safety');
  if (state.screen === 'safety') { if (!safetyOpen.length) screen('home'); else drawSafety(); }
  const card = $('#inbox-card');
  const newest = unanswered.filter((m) => m.kind === 'message')[0];
  setHtml(card, newest ? `<div class="inbox-card"><div class="k">Message from ${esc(unitLabel(data.member(newest.from_user)))}${unanswered.length > 1 ? ' · ' + (unanswered.length - 1) + ' more in the inbox' : ''}</div>${messageRow(newest)}</div>` : '');
  if (state.screen === 'inbox') drawInbox();

  const zone = myZone();
  const assigned = data.myZones().filter((z) => z.status !== 'cleared')[0] || null;
  const seenKey = SEEN_ZONE + data.incident.id;
  const banner = $('#banner');
  if (assigned && localStorage.getItem(seenKey) !== assigned.id) {
    setHtml(banner, `<div class="banner"><div class="k">New assignment from Operations</div><div style="font-size:16px;font-weight:600">${esc(assigned.code)} · ${esc(assigned.name)} · priority ${assigned.priority}${assigned.structures ? ' · ' + assigned.structures + ' structures' : ''}</div><button class="btn" data-action="accept" data-id="${assigned.id}">Accept</button></div>`);
  } else setHtml(banner, '');

  const acard = $('#assignment');
  if (state.justCleared && (!zone || zone.id === state.justCleared.id)) {
    const jc = state.justCleared;
    setCard(acard, 'card done-card', `<div class="big">${esc(jc.code)} ${jc.pass === 'secondary' ? 'marked clear' : 'primary search complete'}</div><div class="muted">Sent ${hhmm(jc.at)}. Operations sees the zone in green${jc.pass === 'secondary' ? '' : ', lighter until the secondary search'}. Waiting for your next assignment.</div>`);
  } else if (zone) {
    const isAssigned = zone.assigned_to === data.user.id;
    setCard(acard, 'card', `
      <div class="k">${isAssigned ? 'Your zone' : 'You are standing in'}</div>
      <div class="zone-name">${esc(zone.code)} · ${esc(zone.name)}</div>
      <div class="badges"><span class="badge p${zone.priority}">Priority ${zone.priority}</span>${zone.structures ? `<span class="badge">${zone.structures} structures</span>` : ''}<span class="badge ${zone.status === 'cleared' ? 'cleared' : zone.status === 'primary' ? 'primary' : (zone.status === 'active' ? 'active' : '')}">${zone.status === 'cleared' ? 'Cleared ' + hhmm(zone.cleared_at) : zone.status === 'primary' ? 'Primary done ' + hhmm(zone.primary_done_at) + ', secondary next' : (zone.status === 'active' ? 'In progress' : 'Not started')}</span>${zone.hazard ? '<span class="badge haz">Hazard</span>' : ''}</div>
      ${zone.structures ? `<div class="bar"><div class="bar-fill" style="width:${pct(zone)}%"></div></div><div class="muted" style="font-size:12.5px">${zone.cleared} of ${zone.structures} structures cleared</div>` : '<div class="muted" style="font-size:12.5px">Operations has not set a structure count. Address clear still counts them up.</div>'}
      ${zone.work_assignment ? `<div style="font-size:14px;margin-top:4px">${esc(zone.work_assignment)}</div>` : ''}
      ${zone.instructions ? `<div class="muted" style="font-size:12.5px">${esc(zone.instructions)}</div>` : ''}
      ${zone.channel || zone.supervisor ? `<div class="muted" style="font-size:12.5px">${zone.channel ? 'Radio ' + esc(zone.channel) : ''}${zone.channel && zone.supervisor ? ' · ' : ''}${zone.supervisor ? 'Supervisor ' + esc(zone.supervisor) : ''}</div>` : ''}
      ${zone.objective_id && data.objective(zone.objective_id) ? `<div class="muted" style="font-size:12.5px">Objective ${data.objective(zone.objective_id).number}: ${esc(data.objective(zone.objective_id).text)}</div>` : ''}`);
  } else {
    setCard(acard, 'card', `<div class="k">Your zone</div><div class="zone-name">No assignment yet</div><div class="muted" style="font-size:12.5px">Operations assigns zones from the base map. You can still send photos and hazards from where you stand.</div>`);
  }

  drawMini(zone);
  drawNearby();

  const al = myAlert();
  if (al) {
    if (state.screen !== 'helpsent') screen('helpsent');
    $('#helpsent-title').textContent = 'Alert sent ' + hhmm(al.created_at);
    setHtml($('#helpsent-card'), al.acknowledged_at
      ? `<div class="k" style="color:var(--cleared)">Operations acknowledged at ${hhmm(al.acknowledged_at)}</div><div class="muted">Stay put if you can. Your location keeps sending.</div>`
      : `<div class="k">Waiting for Operations</div><div class="muted">Your location keeps sending every few seconds.</div>`);
    $('#helpsent-card').style.borderColor = al.acknowledged_at ? 'var(--cleared-fill)' : '';
  } else if (state.screen === 'helpsent') screen('home');

  const p = sensors.pos;
  $('#foot-left').textContent = state.outbox ? `${state.outbox} waiting to send${state.outboxError ? ' (retrying)' : ''}` : (state.lastSentAt ? 'Last sent ' + hhmm(state.lastSentAt) : 'Nothing sent yet');
  $('#foot-right').textContent = p ? `GPS ±${Math.round(p.accuracy || 0)} m · ${compass(sensors.heading) || 'no heading'}` : (sensors.error || 'Waiting for GPS');

  if (state.screen === 'menu') drawMenu();
  if (state.screen === 'photo') drawPhotoFacts();
}

function wedgeHtml(h) {
  const r = 38, a = -PHOTO_WEDGE * Math.PI / 180, b = PHOTO_WEDGE * Math.PI / 180;
  const d = `M0,0 L${(r * Math.sin(a)).toFixed(1)},${(-r * Math.cos(a)).toFixed(1)} A${r},${r} 0 0 1 ${(r * Math.sin(b)).toFixed(1)},${(-r * Math.cos(b)).toFixed(1)} Z`;
  return `<svg class="wedge" viewBox="-40 -40 80 80" style="transform:rotate(${Math.round(h)}deg)" aria-hidden="true"><path d="${d}"></path></svg>`;
}
function icon(html) { return L.divIcon({ html, className: '', iconSize: [0, 0], iconAnchor: [0, 0] }); }

function drawMini(zone) {
  if (!mini) return;
  drawMiniOverlays();
  miniLayers.zone.clearLayers();
  miniLayers.pins.clearLayers();
  miniLayers.me.clearLayers();
  const p = sensors.pos;
  if (zone) {
    const style = zone.status === 'cleared' ? { color: '#1F6B42', fillColor: '#2E8B57', fillOpacity: 0.4 } : zone.status === 'primary' ? { color: '#3D8B5F', fillColor: '#8FCFA7', fillOpacity: 0.45 } : zone.status === 'active' ? { color: '#24588F', fillColor: '#2F6FB3', fillOpacity: 0.25 } : { color: '#7A776F', fillColor: '#CFCAC0', fillOpacity: 0.35 };
    if (zone.hazard) { style.color = '#D9822B'; style.dashArray = '7 4'; }
    L.polygon(ringToLatLngs(zone.polygon), Object.assign({ weight: 2 }, style)).addTo(miniLayers.zone);
    if (miniZoneId !== zone.id) { miniZoneId = zone.id; mini.fitBounds(L.latLngBounds(ringToLatLngs(zone.polygon)), { padding: [16, 16] }); }
  } else if (p && miniZoneId !== 'me') { miniZoneId = 'me'; mini.setView([p.lat, p.lng], 16); }
  for (const ph of data.photos()) {
    if (ph.lat == null || (zone && ph.zone_id !== zone.id && ph.user_id !== data.user.id)) continue;
    L.marker([ph.lat, ph.lng], { icon: icon(`<span class="ppin">${ph.heading != null ? wedgeHtml(ph.heading) : ''}<span class="pdot"></span></span>`), interactive: false }).addTo(miniLayers.pins);
  }
  for (const h of data.hazards()) {
    if (h.lat == null) continue;
    L.marker([h.lat, h.lng], { icon: icon('<span class="hmark"></span>'), interactive: false }).addTo(miniLayers.pins);
  }
  for (const f of data.facilities()) {
    L.marker([f.lat, f.lng], { icon: icon(`<span class="fmark fmark-${esc(f.kind)}">${esc(facilityKind(f.kind)[2])}</span>`), interactive: false }).addTo(miniLayers.pins);
  }
  // the structures on record in this zone: tap one to search it
  for (const s of data.structures(zone ? zone.id : null)) {
    if (s.lat == null || s.lng == null) continue;
    const m = L.circleMarker([s.lat, s.lng], { radius: 7, color: s.people_needing_help > 0 ? '#B3261E' : '#fff', weight: 2, fillColor: s.status === 'searched' ? '#2E8B57' : s.status === 'in_progress' ? '#D9822B' : '#8F8B82', fillOpacity: 1 }).addTo(miniLayers.pins);
    m.on('click', () => openStructure(s.id));
  }
  if (p) {
    L.marker([p.lat, p.lng], { icon: icon(`<span class="umark"><span class="upulse"></span><span class="udot"></span><span class="uhead" style="transform:rotate(${Math.round(sensors.heading || 0)}deg)"></span></span>`), interactive: false }).addTo(miniLayers.me);
  }
}

// The nearest staging area, shelter and hospital, with directions in the phone's own maps app.
function drawNearby() {
  const p = sensors.pos;
  const rows = [];
  for (const kind of ['staging', 'shelter', 'hospital']) {
    const n = p ? nearestFacility(data.facilities(), kind, p.lat, p.lng) : null;
    const f = n ? n.facility : data.facilities().find((x) => x.kind === kind);
    if (!f) continue;
    rows.push(`<div class="near"><span class="fmark fmark-${esc(f.kind)} inline">${esc(facilityKind(f.kind)[2])}</span><span class="near-main"><span class="near-name">${esc(f.name || facilityKind(f.kind)[1])}</span><span class="muted">${esc(facilityKind(f.kind)[1])}${n ? ' · ' + milesText(n.distance) : ''}${f.contact ? ' · ' + esc(f.contact) : ''}</span></span><a class="btn sm" href="${directionsUrl(f.lat, f.lng)}" target="_blank" rel="noopener">Directions</a></div>`);
  }
  setHtml($('#nearby'), rows.length ? `<div class="card"><div class="k">Nearby</div>${rows.join('')}</div>` : '');
}

// the map underneath the mini map: a device setting, from the menu
async function setMiniLayer(id) {
  const def = layerDef(id);
  let layer;
  try { layer = await makeBaseLayer(def); } catch (err) { toast(err.message || String(err), true); if (def.id !== 'streets') return setMiniLayer('streets'); return; }
  if (miniBase) mini.removeLayer(miniBase);
  miniBase = layer.addTo(mini);
  storeLayer(def.id);
  drawLayerChips();
}
function drawLayerChips() {
  const cur = storedLayer() || 'streets';
  $('#layer-chips').innerHTML = availableLayers().map((l) => `<button class="chip${l.id === cur ? ' on' : ''}" data-action="layer" data-value="${l.id}">${esc(l.name)}</button>`).join('');
}
// the imagery Operations put on the map, on the mini map too
function drawMiniOverlays() {
  if (!mini) return;
  const want = new Map();
  for (const o of data.overlays()) {
    const url = overlayUrls.get(o.storage_path);
    if (!url) {
      if (!overlayUrls.has(o.storage_path)) { overlayUrls.set(o.storage_path, null); data.overlayUrl(o.storage_path).then((u) => { overlayUrls.set(o.storage_path, u); drawMiniOverlays(); }).catch(() => overlayUrls.delete(o.storage_path)); }
      continue;
    }
    want.set(o.id, { o, url, stamp: o.updated_at + '|' + url + '|' + JSON.stringify(o.bounds) + '|' + o.opacity });
  }
  for (const [id, cur] of miniOverlays) if (!want.has(id) || want.get(id).stamp !== cur.stamp) { mini.removeLayer(cur.layer); miniOverlays.delete(id); }
  for (const [id, w] of want) if (!miniOverlays.has(id)) miniOverlays.set(id, { layer: makeOverlay(w.o, w.url, 'imagery').addTo(mini), stamp: w.stamp });
}

// ---- the code to join: read with the camera at check-in, shown from the menu
let scanner = null;
// mode 'join' reads a QR with the join code; mode 'licence' reads the PDF417 on the back of a licence
async function openScan(mode = 'join') {
  $('#s-scan').hidden = false;
  $('#scan-msg').textContent = 'Opening the camera…';
  $('#s-scan h2').textContent = mode === 'licence' ? 'Scan the back of your licence' : 'Scan the code';
  try {
    scanner = await startScan($('#scan-video'), (text) => {
      if (mode === 'licence') {
        const r = looksLikeLicence(text) ? parseLicence(text) : null;
        if (!r) { $('#scan-msg').textContent = 'That is a barcode, but not a licence. Find the wide one on the back.'; return; }
        closeScan();
        takeLicence(r);
        return;
      }
      const code = codeFromScan(text);
      if (!code) { $('#scan-msg').textContent = 'That is a code, but not a join code. Try another.'; return; }
      closeScan();
      const f = $('#join-form');
      f.code.value = code;
      f.unit.focus();
      toast('Code ' + code + ' read');
    }, { format: mode === 'licence' ? 'pdf417' : 'qr_code' });
    $('#scan-msg').textContent = mode === 'licence' ? 'Hold the back of the licence flat in good light, the wide barcode filling the frame.' : 'Point the camera at the code.';
  } catch (err) { $('#scan-msg').textContent = err.message || String(err); }
}

// ---- Identify yourself: name, phone and licence, once per account
function drawYouLine() {
  const el = $('#join-you');
  if (!el) return;
  const p = data.profile;
  if (data.profileComplete(p)) {
    el.className = 'you-line';
    el.innerHTML = `<span>Checking in as <strong>${esc(p.full_name)}</strong> · ${esc(p.phone)} · ${({ scan: 'licence scanned', photo: 'licence photographed', typed: 'licence typed' })[p.id_source] || 'licence on file'}${p.verified_at ? ' · verified' : ''}</span><button type="button" class="btn sm" data-action="id-open">Change</button>`;
  } else {
    el.className = 'you-line missing';
    el.innerHTML = `<span>Say who you are before you check in: your name, your phone and your licence.</span><button type="button" class="btn sm" data-action="id-open">Identify yourself</button>`;
  }
}
function openIdentify() {
  const p = data.profile || {};
  state.ident = { read: null, photo: null, source: p.id_source || '' };
  $('#id-name').value = p.full_name || '';
  $('#id-phone').value = p.phone || '';
  $('#id-number').value = p.licence_number || '';
  $('#id-state').value = p.licence_state || '';
  $('#id-msg').textContent = '';
  $('#id-photo-box').hidden = !p.photo_path;
  if (p.photo_path) data.idPhotoUrl(p.photo_path).then((u) => { $('#id-photo-preview').src = u; }).catch(() => { $('#id-photo-box').hidden = true; });
  drawIdRead(p.licence_number ? { fullName: p.full_name, dateOfBirth: p.date_of_birth, licenceNumber: p.licence_number, licenceState: p.licence_state, expires: p.licence_expires, address: p.address, fromRecord: true } : null);
  $('#s-identify').hidden = false;
}
function closeIdentify() { $('#s-identify').hidden = true; }
function drawIdRead(r) {
  const box = $('#id-read');
  if (!r) { box.hidden = true; box.innerHTML = ''; return; }
  const exp = r.expires && licenceExpired(r.expires);
  box.hidden = false;
  box.innerHTML = `<div class="k">${r.fromRecord ? 'Licence on file' : 'Read from the licence'}</div>
    <div><strong>${esc(r.fullName || '')}</strong>${r.dateOfBirth ? ' · born ' + esc(r.dateOfBirth) : ''}</div>
    <div class="muted">${esc(r.licenceState || '')} ${esc(r.licenceNumber || '')}${r.expires ? ' · expires ' + esc(r.expires) : ''}${exp ? ' <span class="warn">· expired</span>' : ''}</div>
    ${r.address ? `<div class="muted">${esc(r.address)}</div>` : ''}`;
}
function takeLicence(r) {
  state.ident.read = r;
  state.ident.source = 'scan';
  if (r.fullName) $('#id-name').value = r.fullName;
  $('#id-number').value = r.licenceNumber || '';
  $('#id-state').value = r.licenceState || '';
  drawIdRead(r);
  $('#s-identify').hidden = false;
  toast('Licence read' + (r.expires && licenceExpired(r.expires) ? ', but it has expired' : ''));
  $('#id-phone').focus();
}
async function takeIdPhoto() {
  let file;
  try { file = await pickPhoto($('#camera-input')); } catch (e) { return; }
  try {
    const blob = await shrink(file);
    state.ident.photo = blob;
    if (state.ident.source !== 'scan') state.ident.source = 'photo';
    $('#id-photo-preview').src = URL.createObjectURL(blob);
    $('#id-photo-box').hidden = false;
  } catch (err) { $('#id-msg').textContent = err.message || String(err); }
}
async function saveIdentity() {
  const name = $('#id-name').value.trim(), phone = $('#id-phone').value.trim();
  const number = $('#id-number').value.trim().toUpperCase(), st = $('#id-state').value.trim().toUpperCase();
  const msg = $('#id-msg');
  if (!name) { msg.textContent = 'Your name, as on the licence.'; $('#id-name').focus(); return; }
  if (!phone) { msg.textContent = 'A phone Operations can reach you on.'; $('#id-phone').focus(); return; }
  const p = data.profile || {};
  if (!(state.ident.read || state.ident.photo || p.photo_path || number)) { msg.textContent = 'Scan the back of your licence, photograph the front, or type its number.'; return; }
  msg.textContent = 'Saving…';
  try {
    const r = state.ident.read;
    let photoPath = p.photo_path || null;
    if (state.ident.photo) photoPath = await data.uploadIdPhoto(state.ident.photo);
    const source = state.ident.source || (number ? 'typed' : p.id_source || '');
    await data.saveProfile({
      full_name: name, phone, licence_number: number || (r ? r.licenceNumber : p.licence_number) || '', licence_state: st || (r ? r.licenceState : p.licence_state) || '',
      licence_expires: r ? r.expires : (p.licence_expires || null), date_of_birth: r ? r.dateOfBirth : (p.date_of_birth || null), address: r ? r.address : (p.address || ''),
      id_source: source || 'typed', photo_path: photoPath
    });
    msg.textContent = '';
    closeIdentify();
    drawYouLine();
    if (state.screen === 'menu' && data.incident) drawMenu();
    toast('Saved. Operations sees this when you check in.');
  } catch (err) { msg.textContent = err.message || String(err); }
}
function closeScan() { if (scanner) scanner.stop(); scanner = null; $('#s-scan').hidden = true; }
function openShowCode() {
  const inc = data.incident;
  if (!inc) return;
  const url = joinUrl(inc.code, new URL('./', location.href));
  $('#showcode-qr').innerHTML = qrSvg(url, { label: 'QR code to join ' + inc.name });
  $('#showcode-code').textContent = inc.code;
  $('#showcode-name').textContent = inc.name;
  $('#showcode-url').textContent = url;
  screen('showcode');
}

function drawThemeChips() { const cur = storedTheme(); for (const c of document.querySelectorAll('#theme-chips .chip')) c.classList.toggle('on', c.dataset.value === cur); }

function drawMenu() {
  drawThemeChips();
  drawLayerChips();
  const inc = data.incident, me = data.me(), per = data.currentPeriod();
  $('#menu-facts').innerHTML = `
    <span class="k">Incident</span><span>${esc(inc.name)}</span>
    <span class="k">Period</span><span>${per ? esc(periodLabel(per)) + (per.ic_name ? ', IC ' + esc(per.ic_name) : '') : esc(inc.period || 'not set')}</span>
    ${commandText(inc, per) ? `<span class="k">Command</span><span>${esc(commandText(inc, per))}</span>` : ''}
    ${per && per.notes ? `<span class="k">Notes</span><span>${esc(per.notes)}</span>` : ''}
    ${data.channels().length ? `<span class="k">Channels</span><span>${data.channels().map((c) => esc(c.use) + ' <strong>' + esc(c.channel) + '</strong>').join(' · ')}</span>` : ''}
    <span class="k">Base</span><span>${esc(inc.base_name || 'not set')}</span>
    <span class="k">Code</span><span class="mono">${esc(inc.code)}</span>
    <span class="k">You</span><span>${esc(unitLabel(me))}${me && crewNames(me, data.people()) ? ' · ' + esc(crewNames(me, data.people())) : ''}</span>
    ${data.profile ? `<span class="k">Identity</span><span>${esc(data.profile.full_name)} · ${esc(data.profile.phone)}${data.profile.licence_number ? ' · ' + esc(data.profile.licence_state) + ' ' + esc(licenceTail(data.profile.licence_number)) : ''}${data.profile.verified_at ? ' · verified by Operations' : ' · not yet verified'}</span>` : ''}
    <span class="k">Live updates</span><span>${data.realtime === 'SUBSCRIBED' ? 'connected' : esc(String(data.realtime).toLowerCase())}</span>
    <span class="k">Heading from</span><span>${sensors.headingSource === 'compass' ? 'the compass' : sensors.headingSource === 'gps' ? 'direction of travel' : 'nothing yet'}</span>`;
  $('#menu-outbox').textContent = state.outbox ? `${state.outbox} report${state.outbox === 1 ? '' : 's'} waiting for signal${state.outboxError ? ': ' + (state.outboxError.message || state.outboxError) : ''}` : 'Nothing waiting, everything is sent';
  drawStatus();
}

// ---- photo
function drawPhotoFacts() {
  const p = state.pending;
  if (!p) return;
  $('#photo-heading').textContent = p.heading != null ? compass(p.heading) : 'unknown';
  $('#photo-facing').textContent = p.heading != null ? 'Facing ' + compass(p.heading) : 'Heading unknown';
  $('#photo-pos').textContent = p.pos ? latLngText(p.pos.lat, p.pos.lng) : 'unknown';
  const z = p.pos ? zoneAt(data.zones(), p.pos.lat, p.pos.lng) : null;
  $('#photo-zone').textContent = z ? 'zone ' + z.code : 'outside any zone';
  $('#photo-chips').innerHTML = NOTE_CHIPS.map((c, i) => `<button class="chip${state.noteI === i ? ' on' : ''}" data-action="note" data-i="${i}">${esc(c)}</button>`).join('');
}

async function takePhoto() {
  try { await sensors.requestCompass(); } catch (e) { /* GPS heading still works */ }
  let file;
  try { file = await pickPhoto($('#camera-input')); } catch (e) { return; }
  toast('Preparing photo…');
  try {
    const blob = await shrink(file);
    state.pending = { blob, heading: sensors.heading, pos: sensors.pos, takenAt: new Date().toISOString() };
    state.noteI = 0;
    const img = $('#photo-preview');
    if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
    img.src = img.dataset.url = URL.createObjectURL(blob);
    screen('photo');
    drawPhotoFacts();
  } catch (err) { toast(err.message || String(err), true); }
}

async function sendPhoto() {
  const p = state.pending;
  if (!p) return;
  const z = p.pos ? zoneAt(data.zones(), p.pos.lat, p.pos.lng) : null;
  const payload = { id: uuid(), lat: p.pos ? p.pos.lat : null, lng: p.pos ? p.pos.lng : null, heading: p.heading, note: NOTE_CHIPS[state.noteI] === 'Other' ? '' : NOTE_CHIPS[state.noteI], zoneId: z ? z.id : null, takenAt: p.takenAt };
  await outbox.add('photo', payload, p.blob);
  state.lastSentAt = Date.now();
  screen('home');
  toast(navigator.onLine ? 'Photo sent' + (p.heading != null ? ', facing ' + compass(p.heading) : '') : 'Photo kept, it sends when there is signal');
  queueDraw();
}

// ---- a structure: who was there and what state it is in
function openStructure(id) {
  const existing = id ? data.structure(id) : null;
  const p = sensors.pos;
  const zone = existing && existing.zone_id ? data.zone(existing.zone_id) : (p ? zoneAt(data.zones(), p.lat, p.lng) : null) || myZone();
  if (!existing && !zone) { toast('No zone here to count against', true); return; }
  if (zone && zone.status === 'cleared') { toast(zone.code + ' is already clear'); return; }
  const haz = new Set();
  if (existing && existing.hazards) existing.hazards.split(' ').forEach((code) => { const i = CLEAR_HAZARDS.findIndex((h) => h[1] === code); if (i >= 0) haz.add(i); });
  state.st = {
    id: existing ? existing.id : null, zoneId: zone ? zone.id : null,
    lat: existing && existing.lat != null ? existing.lat : (p ? p.lat : null), lng: existing && existing.lng != null ? existing.lng : (p ? p.lng : null),
    occ: existing ? existing.occupants : 'unknown', help: existing ? existing.people_needing_help : 0,
    water: existing ? existing.water_cm : null, damage: existing ? existing.damage : 'unknown', haz
  };
  $('#structure-title').textContent = existing ? (existing.label || 'Structure') : 'Address clear';
  $('#structure-sub').textContent = (zone ? zone.code + (nextPass(zone) === 'secondary' ? ', secondary search' : '') : 'Outside the divisions') + (state.st.lat != null ? ' · ' + latLngText(state.st.lat, state.st.lng) : ' · no GPS fix yet') + '. Save marks it searched and counts it for the zone.';
  $('#structure-label').value = existing ? existing.label : '';
  $('#structure-notes').value = existing ? existing.notes : '';
  screen('structure');
  drawStructure();
}
function drawStructure() {
  const st = state.st;
  if (!st) return;
  setHtml($('#occ-chips'), OCCUPANTS.map(([v, label]) => `<button class="chip${st.occ === v ? ' on' : ''}" data-action="occ" data-v="${v}">${esc(label)}</button>`).join(''));
  $('#help-count').textContent = st.help;
  setHtml($('#water-chips'), WATER.map(([cm, label]) => `<button class="chip${st.water === cm ? ' on' : ''}" data-action="water" data-v="${cm}">${esc(label)}</button>`).join(''));
  setHtml($('#damage-chips'), DAMAGE.map(([v, label]) => `<button class="chip${st.damage === v ? ' on' : ''}" data-action="damage" data-v="${v}">${esc(label)}</button>`).join(''));
  setHtml($('#shaz-chips'), CLEAR_HAZARDS.map(([label], i) => `<button class="chip${st.haz.has(i) ? ' on' : ''}" data-action="shaz" data-i="${i}">${esc(label)}</button>`).join(''));
}
async function saveStructure() {
  const st = state.st;
  if (!st) return;
  const zone = st.zoneId ? data.zone(st.zoneId) : null;
  const me = data.me();
  const codes = [...st.haz].map((i) => CLEAR_HAZARDS[i][1]);
  const now = new Date();
  const fields = {
    zone_id: st.zoneId, lat: st.lat, lng: st.lng, status: 'searched', pass: nextPass(zone), label: $('#structure-label').value.trim(),
    occupants: st.occ, people_needing_help: st.help, water_cm: st.water, damage: st.damage, hazards: codes.join(' '),
    marking: markingFor(unitLabel(me).replace(/^Unit /, 'U'), now, codes, st.help), notes: $('#structure-notes').value.trim(),
    searched_by: data.user.id, searched_at: now.toISOString()
  };
  const id = st.id || uuid();
  const existing = st.id ? data.structure(st.id) : null;
  data.local('ic_structures', Object.assign({ id, incident_id: data.incident.id, created_by: data.user.id, created_at: now.toISOString(), updated_at: now.toISOString() }, existing || {}, fields));
  if (zone) {
    const recs = data.structures(zone.id);
    data.local('ic_zones', Object.assign({}, zone, { cleared: recs.filter((s) => s.status === 'searched').length, structures: Math.max(zone.structures, recs.length) }));
  }
  await outbox.add('structure', { id, update: !!st.id, fields });
  state.lastSentAt = Date.now();
  state.st = null;
  screen('home');
  const z = zone ? data.zone(zone.id) : null;
  if (z && z.structures && z.cleared >= z.structures) { openClear(); toast('That was the last structure. Is the search of ' + z.code + ' complete?'); }
  else toast((fields.label || 'Structure') + ' searched' + (z ? ' · ' + z.cleared + ' of ' + z.structures : ''));
  queueDraw();
}

// ---- clear
function openClear() {
  const z = myZone();
  if (!z) { toast('No zone to mark clear', true); return; }
  if (z.status === 'cleared') { toast(z.code + ' is already clear'); return; }
  state.victims = 0; state.clearHaz = new Set(); state.pass = nextPass(z);
  $('#clear-title').textContent = state.pass === 'secondary' ? 'Mark ' + z.code + ' clear' : 'Finish the search of ' + z.code;
  $('#clear-sub').textContent = `Sends ${z.code} ${z.name} to Operations.` + (z.structures && !data.structures(z.id).length ? ` All ${z.structures} structures are marked searched.` : '');
  screen('clear');
  drawClear();
}
function drawClear() {
  const z = myZone();
  setHtml($('#pass-chips'), [['primary', 'Primary search done'], ['secondary', 'Secondary search done, zone clear']].map(([v, label]) => `<button class="chip${state.pass === v ? ' on' : ''}${z && z.status === 'primary' && v === 'primary' ? ' dim' : ''}" data-action="pass" data-v="${v}">${label}</button>`).join(''));
  $('#victims').textContent = state.victims;
  $('#clear-chips').innerHTML = CLEAR_HAZARDS.map(([label], i) => `<button class="chip${state.clearHaz.has(i) ? ' on' : ''}" data-action="clear-haz" data-i="${i}">${esc(label)}</button>`).join('');
  const me = data.me();
  const m = markingFor(unitLabel(me).replace(/^Unit /, 'U'), new Date(), [...state.clearHaz].map((i) => CLEAR_HAZARDS[i][1]), state.victims);
  $('#x-out').textContent = m.out; $('#x-team').textContent = m.team; $('#x-haz').textContent = m.haz; $('#x-victims').textContent = m.victims;
}
async function confirmClear() {
  const z = myZone();
  if (!z) { screen('home'); return; }
  const me = data.me();
  const now = new Date();
  const pass = state.pass;
  const marking = markingFor(unitLabel(me).replace(/^Unit /, 'U'), now, [...state.clearHaz].map((i) => CLEAR_HAZARDS[i][1]), state.victims);
  const hasRecords = data.structures(z.id).length > 0;
  const local = { status: pass === 'secondary' ? 'cleared' : 'primary', cleared: hasRecords ? z.cleared : Math.max(z.structures, z.cleared), cleared_at: now.toISOString(), marking, hazard: z.hazard || state.clearHaz.size > 0 };
  if (pass === 'secondary') local.secondary_done_at = now.toISOString(); else local.primary_done_at = now.toISOString();
  data.local('ic_zones', Object.assign({}, z, local));
  await outbox.add('pass', { zoneId: z.id, pass, opts: { marking, hazard: state.clearHaz.size > 0 } });
  state.justCleared = { id: z.id, code: z.code, at: now, pass };
  state.lastSentAt = Date.now();
  screen('home');
  const said = pass === 'secondary' ? z.code + ' marked clear' : 'Primary search of ' + z.code + ' complete';
  toast(navigator.onLine ? said : said + ', it sends when there is signal');
  queueDraw();
}
// "Address clear": one structure record at the unit's position
async function addrClear() { openStructure(null); }

// ---- hazard and help
function openHazard() {
  state.hazI = 0;
  $('#hazard-note').value = '';
  const p = sensors.pos;
  const z = p ? zoneAt(data.zones(), p.lat, p.lng) : null;
  $('#hazard-sub').textContent = p ? `Pinned where you stand, ${latLngText(p.lat, p.lng)}${z ? ', zone ' + z.code : ''}. Operations sees it at once.` : 'No GPS fix yet; the hazard will be sent without a position.';
  $('#hazard-chips').innerHTML = HAZARD_KINDS.map((c, i) => `<button class="chip${state.hazI === i ? ' on' : ''}" data-action="haz" data-i="${i}">${esc(c)}</button>`).join('');
  screen('hazard');
}
async function sendHazard() {
  const p = sensors.pos;
  const z = p ? zoneAt(data.zones(), p.lat, p.lng) : myZone();
  await outbox.add('hazard', { id: uuid(), kind: HAZARD_KINDS[state.hazI], note: $('#hazard-note').value.trim(), lat: p ? p.lat : null, lng: p ? p.lng : null, zoneId: z ? z.id : null });
  state.lastSentAt = Date.now();
  screen('home');
  toast(navigator.onLine ? 'Hazard sent' : 'Hazard kept, it sends when there is signal');
  queueDraw();
}
function openHelp() {
  const p = sensors.pos, me = data.me(), z = myZone();
  $('#help-facts').innerHTML = `
    <span class="k">Unit</span><span>${esc(unitLabel(me))}${me && crewNames(me, data.people()) ? ' · ' + esc(crewNames(me, data.people())) : ''}</span>
    <span class="k">Zone</span><span>${z ? esc(z.code + ' · ' + z.name) : 'none'}</span>
    <span class="k">Position</span><span class="mono">${p ? esc(latLngText(p.lat, p.lng)) : 'no GPS fix yet'}</span>
    <span class="k">Time</span><span>${hhmm(new Date())}</span>`;
  screen('help');
}
async function sendAlert() {
  const p = sensors.pos, z = myZone();
  const id = uuid();
  data.local('ic_alerts', { id, incident_id: data.incident.id, user_id: data.user.id, zone_id: z ? z.id : null, lat: p ? p.lat : null, lng: p ? p.lng : null, created_at: new Date().toISOString(), acknowledged_at: null, stood_down_at: null });
  await outbox.add('alert', { id, lat: p ? p.lat : null, lng: p ? p.lng : null, zoneId: z ? z.id : null });
  state.lastPosAt = 0; await maybeSendPosition();
  screen('helpsent');
  queueDraw();
}
async function standDown() {
  const al = myAlert();
  if (!al) { screen('home'); return; }
  data.local('ic_alerts', Object.assign({}, al, { stood_down_at: new Date().toISOString() }));
  await outbox.add('standdown', { id: al.id });
  screen('home');
  toast('Stood down');
  queueDraw();
}

// ---- actions
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const act = btn.dataset.action;
  try {
    switch (act) {
      case 'sign-out': localStorage.removeItem(LAST_INCIDENT); sensors.stop(); await data.signOut(); show('auth'); break;
      case 'open-incident': await openIncident(btn.dataset.id); break;
      case 'switch-incident': data.close(); localStorage.removeItem(LAST_INCIDENT); screen('home'); await showJoin(); break;
      case 'home': screen('home'); queueDraw(); break;
      case 'menu': screen('menu'); drawMenu(); break;
      case 'refresh': await data.open(data.incident.id); toast('Reloaded'); break;
      case 'compass': try { await sensors.requestCompass(); toast('Compass on'); } catch (err) { toast(err.message, true); } break;
      case 'theme': applyTheme(btn.dataset.value); drawThemeChips(); break;
      case 'scan-code': await openScan('join'); break;
      case 'id-open': openIdentify(); break;
      case 'id-cancel': closeIdentify(); break;
      case 'id-scan': await openScan('licence'); break;
      case 'id-photo': await takeIdPhoto(); break;
      case 'id-save': await saveIdentity(); break;
      case 'scan-cancel': closeScan(); break;
      case 'show-code': openShowCode(); break;
      case 'layer': await setMiniLayer(btn.dataset.value); break;
      case 'accept': localStorage.setItem(SEEN_ZONE + data.incident.id, btn.dataset.id); state.justCleared = null; queueDraw(); toast('Assignment accepted'); break;
      case 'camera': await takePhoto(); break;
      case 'note': state.noteI = Number(btn.dataset.i); drawPhotoFacts(); break;
      case 'send-photo': await sendPhoto(); break;
      case 'addr-clear': await addrClear(); break;
      case 'zone-clear': openClear(); break;
      case 'pass': state.pass = btn.dataset.v; { const z = myZone(); $('#clear-title').textContent = state.pass === 'secondary' ? 'Mark ' + (z ? z.code : '') + ' clear' : 'Finish the search of ' + (z ? z.code : ''); } drawClear(); break;
      case 'occ': state.st.occ = btn.dataset.v; drawStructure(); break;
      case 'water': state.st.water = state.st.water === Number(btn.dataset.v) ? null : Number(btn.dataset.v); drawStructure(); break;
      case 'damage': state.st.damage = btn.dataset.v; drawStructure(); break;
      case 'shaz': { const i = Number(btn.dataset.i); if (state.st.haz.has(i)) state.st.haz.delete(i); else state.st.haz.add(i); drawStructure(); break; }
      case 'help-up': state.st.help = Math.min(999, state.st.help + 1); drawStructure(); break;
      case 'help-down': state.st.help = Math.max(0, state.st.help - 1); drawStructure(); break;
      case 'save-structure': await saveStructure(); break;
      case 'victims-up': state.victims += 1; drawClear(); break;
      case 'victims-down': state.victims = Math.max(0, state.victims - 1); drawClear(); break;
      case 'clear-haz': { const i = Number(btn.dataset.i); if (state.clearHaz.has(i)) state.clearHaz.delete(i); else state.clearHaz.add(i); drawClear(); break; }
      case 'confirm-clear': await confirmClear(); break;
      case 'hazard': openHazard(); break;
      case 'haz': state.hazI = Number(btn.dataset.i); openHazardChips(); break;
      case 'send-hazard': await sendHazard(); break;
      case 'help': openHelp(); break;
      case 'send-alert': await sendAlert(); break;
      case 'stand-down': await standDown(); break;
      case 'inbox': screen('inbox'); drawInbox(); break;
      case 'par-less': state.parCounts.set(btn.dataset.id, Math.max(0, parCount(btn.dataset.id) - 1)); drawSafety(); drawInbox(); break;
      case 'par-more': state.parCounts.set(btn.dataset.id, Math.min(99, parCount(btn.dataset.id) + 1)); drawSafety(); drawInbox(); break;
      case 'par-ok': await answerPar(btn.dataset.id, true); break;
      case 'par-missing': if (confirm('Report someone missing? Operations gets an emergency alert with your position.')) await answerPar(btn.dataset.id, false); break;
      case 'status': await setMyStatus(btn.dataset.status); break;
      case 'oos-pick': state.oosPick = 0; drawStatus(); break;
      case 'oos': state.oosPick = Number(btn.dataset.i); drawStatus(); break;
      case 'oos-cancel': state.oosPick = null; drawStatus(); break;
      case 'oos-go': await setMyStatus('out_of_service', OOS_REASONS[state.oosPick || 0]); break;
      case 'jp-add': syncJoinPeople(); state.joinPeople.push(blankPerson()); drawJoinPeople(); { const last = document.querySelector('#join-people .pp-edit:last-child [data-jp="name"]'); if (last) last.focus(); } break;
      case 'jp-remove': syncJoinPeople(); state.joinPeople.splice(Number(btn.dataset.i), 1); if (!state.joinPeople.length) state.joinPeople.push(blankPerson()); drawJoinPeople(); break;
      case 'jp-qual': { syncJoinPeople(); const p = state.joinPeople[Number(btn.dataset.i)]; if (p) { if (p.quals.has(btn.dataset.q)) p.quals.delete(btn.dataset.q); else p.quals.add(btn.dataset.q); } drawJoinPeople(); break; }
      case 'mp-qual': if (state.mpQuals.has(btn.dataset.q)) state.mpQuals.delete(btn.dataset.q); else state.mpQuals.add(btn.dataset.q); setHtml($('#mp-quals'), qualChips(state.mpQuals, 'mp-qual')); break;
      case 'person-add': await addPerson(); break;
      case 'person-out': await setPersonOut(btn.dataset.id, true); break;
      case 'person-in': await setPersonOut(btn.dataset.id, false); break;
      case 'check-out': await checkOut(); break;
      case 'compose': state.composeI = 0; screen('compose'); drawCompose(); break;
      case 'cmp': $('#compose-text').value = btn.dataset.text || ''; drawCompose(); break;
      case 'cmp-u': state.composeU = state.composeU === btn.dataset.value ? '' : btn.dataset.value; drawCompose(); break;
      case 'compose-loc': toggleComposeLocation(); break;
      case 'send-compose': await sendCompose(); break;
      case 'ack': await ackMessage(btn.dataset.id, btn.dataset.reply || 'Copy'); break;
    }
  } catch (err) { console.error(err); toast(err.message || String(err), true); }
});
function openHazardChips() {
  $('#hazard-chips').innerHTML = HAZARD_KINDS.map((c, i) => `<button class="chip${state.hazI === i ? ' on' : ''}" data-action="haz" data-i="${i}">${esc(c)}</button>`).join('');
}

window.addEventListener('online', () => { toast('Back online, sending'); queueDraw(); });
window.addEventListener('offline', () => { toast('No signal. Reports are kept and sent later.'); queueDraw(); });
setInterval(() => { if (!$('#app').hidden) queueDraw(); }, 15000);

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('../sw.js').catch(() => {});

boot();
