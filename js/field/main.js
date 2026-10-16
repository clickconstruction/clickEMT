// The field app: sign in, check in to an incident with its code, then report. Everything a unit
// sends goes through the outbox, so a dead spot never loses a photo or a cleared zone.
import { Data } from '../shared/data.js';
import { Outbox } from '../shared/queue.js';
import { Sensors } from './sensors.js';
import { pickPhoto, shrink } from './camera.js';
import { compass, hhmm, ago, pct, unitLabel, zoneAt, ringToLatLngs, latLngText, markingFor, periodLabel, NOTE_CHIPS, HAZARD_KINDS, CLEAR_HAZARDS, PHOTO_WEDGE, STATUS_LABEL, OOS_REASONS } from '../shared/rules.js';

const LAST_INCIDENT = 'ic.field.incident';
const AGENCY_KEY = 'ic.field.agency';
const SEEN_ZONE = 'ic.field.seen.';
const POSITION_EVERY_MS = 10000;
const POSITION_MIN_M = 8;

const $ = (sel) => document.querySelector(sel);
const data = window.sb ? new Data(window.sb) : null;
const state = { screen: 'home', pending: null, noteI: 0, hazI: 0, victims: 0, clearHaz: new Set(), lastSentAt: null, lastPosSent: null, lastPosAt: 0, justCleared: null, outbox: 0, outboxError: null, seenMsgs: null, composeI: 0, parCounts: new Map(), oosPick: null };
const QUICK = ['Need more hands', 'Water rising here', 'Road blocked', 'Done here, what next?', 'Other'];
const REPLIES = ['Copy', 'Will do', 'Cannot'];
let mini = null, miniLayers = null, miniZoneId = null;
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
  for (const s of ['photo', 'clear', 'hazard', 'help', 'helpsent', 'menu', 'safety', 'inbox', 'compose']) $('#s-' + s).hidden = name !== s;
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
  status: (p) => data.setStatus(p.userId, p.status, p.note)
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
  if (last) { try { await openIncident(last); return; } catch (e) { console.warn(e); localStorage.removeItem(LAST_INCIDENT); } }
  await showJoin();
}

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
  const list = $('#join-list');
  list.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const rows = (await data.myIncidents()).filter((r) => r.status === 'active');
    list.innerHTML = rows.length ? rows.map((r) => `
      <button class="pick-row" data-action="open-incident" data-id="${r.id}">
        <span style="flex:1;min-width:0"><span class="name">${esc(r.name)}</span><br><span class="sub">${esc(r.period || '')} · you are ${r.role === 'ops' ? 'Operations' : esc(r.unit_name || 'a unit')}</span></span>
        <span class="pill mono">${esc(r.code)}</span>
      </button>`).join('') : '<p class="muted">None yet. Check in above with the code from Operations.</p>';
  } catch (err) { list.innerHTML = `<p class="msg">${esc(err.message || err)}</p>`; }
}

$('#join-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, msg = f.querySelector('[data-msg]');
  msg.textContent = 'Checking in…';
  try {
    const inc = await data.join(f.code.value, 'unit', f.unit.value, f.crew.value, f.count.value, f.agency.value);
    try { localStorage.setItem(AGENCY_KEY, f.agency.value.trim()); } catch (e) { /* storage blocked */ }
    f.reset(); msg.textContent = '';
    await openIncident(inc.id);
  } catch (err) { msg.textContent = err.message || String(err); }
});

// ---- the open incident
async function openIncident(id) {
  await data.open(id);
  localStorage.setItem(LAST_INCIDENT, id);
  show('app');
  screen('home');
  if (!mini) {
    mini = L.map($('#mini'), { zoomControl: false, attributionControl: true, dragging: true, tap: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(mini);
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
  return `
    <div class="mrow ${esc(m.kind)}${mine ? ' mine' : ''}">
      <div class="mrow-top"><span class="t mono">${hhmm(m.created_at)}</span><span class="who">${mine ? 'You' : esc(unitLabel(data.member(m.from_user)))}</span><span>to ${esc(m.to_label || 'everyone')}</span>${m.kind === 'safety' ? '<span class="badge haz">Safety</span>' : ''}${m.kind === 'par' ? '<span class="badge">PAR</span>' : ''}</div>
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

function drawCompose() {
  $('#compose-chips').innerHTML = QUICK.map((c, i) => `<button class="chip${state.composeI === i ? ' on' : ''}" data-action="cmp" data-i="${i}">${esc(c)}</button>`).join('');
}

async function sendCompose() {
  const words = $('#compose-text').value.trim();
  const quick = QUICK[state.composeI] === 'Other' ? '' : QUICK[state.composeI];
  const text = [quick, words].filter(Boolean).join('. ');
  if (!text) { toast('Say something first', true); return; }
  const r = data.recipientsFor('ops');
  if (!r.toUsers.length) { toast('Nobody at Operations to send to', true); return; }
  const id = uuid();
  data.local('ic_messages', { id, incident_id: data.incident.id, from_user: data.user.id, to_users: r.toUsers, to_label: r.toLabel, to_zone: null, kind: 'message', text, created_at: new Date().toISOString() });
  await outbox.add('message', { id, toUsers: r.toUsers, toLabel: r.toLabel, toZone: null, kind: 'message', text });
  state.lastSentAt = Date.now();
  $('#compose-text').value = ''; state.composeI = 0;
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
    ${state.oosPick != null ? `<div class="chips" style="margin-top:8px">${OOS_REASONS.map((r, i) => `<button class="chip${state.oosPick === i ? ' on' : ''}" data-action="oos" data-i="${i}">${esc(r)}</button>`).join('')}</div><div class="status-row" style="margin-top:8px"><button class="btn pri" data-action="oos-go">Go out of service</button><button class="btn" data-action="oos-cancel">Cancel</button></div>` : ''}
    <div class="par-count"><span>People on the unit</span><button class="btn" data-action="crew-less" aria-label="Fewer">−</button><span class="num">${me.crew_count != null ? me.crew_count : '?'}</span><button class="btn" data-action="crew-more" aria-label="More">+</button></div>`;
  setHtml($('#menu-status'), html);
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

function queueDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; drawAll(); });
}

function drawAll() {
  if (!data.incident || $('#app').hidden) return;
  const me = data.me();
  $('#me-name').textContent = unitLabel(me);
  $('#me-crew').textContent = [me && me.crew, me && STATUS_LABEL[me.status], data.incident.name].filter(Boolean).join(' · ');

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
    setCard(acard, 'card done-card', `<div class="big">${esc(state.justCleared.code)} marked clear</div><div class="muted">Sent ${hhmm(state.justCleared.at)}. Operations sees the zone in green. Waiting for your next assignment.</div>`);
  } else if (zone) {
    const isAssigned = zone.assigned_to === data.user.id;
    setCard(acard, 'card', `
      <div class="k">${isAssigned ? 'Your zone' : 'You are standing in'}</div>
      <div class="zone-name">${esc(zone.code)} · ${esc(zone.name)}</div>
      <div class="badges"><span class="badge p${zone.priority}">Priority ${zone.priority}</span>${zone.structures ? `<span class="badge">${zone.structures} structures</span>` : ''}<span class="badge ${zone.status === 'cleared' ? 'cleared' : (zone.status === 'active' ? 'active' : '')}">${zone.status === 'cleared' ? 'Cleared ' + hhmm(zone.cleared_at) : (zone.status === 'active' ? 'In progress' : 'Not started')}</span>${zone.hazard ? '<span class="badge haz">Hazard</span>' : ''}</div>
      ${zone.structures ? `<div class="bar"><div class="bar-fill" style="width:${pct(zone)}%"></div></div><div class="muted" style="font-size:12.5px">${zone.cleared} of ${zone.structures} structures cleared</div>` : '<div class="muted" style="font-size:12.5px">Operations has not set a structure count. Address clear still counts them up.</div>'}
      ${zone.work_assignment ? `<div style="font-size:14px;margin-top:4px">${esc(zone.work_assignment)}</div>` : ''}
      ${zone.instructions ? `<div class="muted" style="font-size:12.5px">${esc(zone.instructions)}</div>` : ''}
      ${zone.channel || zone.supervisor ? `<div class="muted" style="font-size:12.5px">${zone.channel ? 'Radio ' + esc(zone.channel) : ''}${zone.channel && zone.supervisor ? ' · ' : ''}${zone.supervisor ? 'Supervisor ' + esc(zone.supervisor) : ''}</div>` : ''}
      ${zone.objective_id && data.objective(zone.objective_id) ? `<div class="muted" style="font-size:12.5px">Objective ${data.objective(zone.objective_id).number}: ${esc(data.objective(zone.objective_id).text)}</div>` : ''}`);
  } else {
    setCard(acard, 'card', `<div class="k">Your zone</div><div class="zone-name">No assignment yet</div><div class="muted" style="font-size:12.5px">Operations assigns zones from the base map. You can still send photos and hazards from where you stand.</div>`);
  }

  drawMini(zone);

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
  miniLayers.zone.clearLayers();
  miniLayers.pins.clearLayers();
  miniLayers.me.clearLayers();
  const p = sensors.pos;
  if (zone) {
    const style = zone.status === 'cleared' ? { color: '#1F6B42', fillColor: '#2E8B57', fillOpacity: 0.4 } : zone.status === 'active' ? { color: '#24588F', fillColor: '#2F6FB3', fillOpacity: 0.25 } : { color: '#7A776F', fillColor: '#CFCAC0', fillOpacity: 0.35 };
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
  if (p) {
    L.marker([p.lat, p.lng], { icon: icon(`<span class="umark"><span class="upulse"></span><span class="udot"></span><span class="uhead" style="transform:rotate(${Math.round(sensors.heading || 0)}deg)"></span></span>`), interactive: false }).addTo(miniLayers.me);
  }
}

function drawMenu() {
  const inc = data.incident, me = data.me(), per = data.currentPeriod();
  $('#menu-facts').innerHTML = `
    <span class="k">Incident</span><span>${esc(inc.name)}</span>
    <span class="k">Period</span><span>${per ? esc(periodLabel(per)) + (per.ic_name ? ', IC ' + esc(per.ic_name) : '') : esc(inc.period || 'not set')}</span>
    ${per && per.notes ? `<span class="k">Notes</span><span>${esc(per.notes)}</span>` : ''}
    <span class="k">Base</span><span>${esc(inc.base_name || 'not set')}</span>
    <span class="k">Code</span><span class="mono">${esc(inc.code)}</span>
    <span class="k">You</span><span>${esc(unitLabel(me))}${me && me.crew ? ' · ' + esc(me.crew) : ''}</span>
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

// ---- clear
function openClear() {
  const z = myZone();
  if (!z) { toast('No zone to mark clear', true); return; }
  if (z.status === 'cleared') { toast(z.code + ' is already clear'); return; }
  state.victims = 0; state.clearHaz = new Set();
  $('#clear-title').textContent = 'Mark ' + z.code + ' clear';
  $('#clear-sub').textContent = `Sends ${z.code} ${z.name} to Operations as searched and clear.` + (z.structures ? ` All ${z.structures} structures are marked searched.` : '');
  screen('clear');
  drawClear();
}
function drawClear() {
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
  const marking = markingFor(unitLabel(me).replace(/^Unit /, 'U'), now, [...state.clearHaz].map((i) => CLEAR_HAZARDS[i][1]), state.victims);
  const patch = { status: 'cleared', cleared: Math.max(z.structures, z.cleared), cleared_at: now.toISOString(), marking, hazard: z.hazard || state.clearHaz.size > 0 };
  data.local('ic_zones', Object.assign({}, z, patch));
  await outbox.add('clear', { zoneId: z.id, patch });
  state.justCleared = { id: z.id, code: z.code, at: now };
  state.lastSentAt = Date.now();
  screen('home');
  toast(navigator.onLine ? z.code + ' marked clear' : z.code + ' kept as clear, it sends when there is signal');
  queueDraw();
}
async function addrClear() {
  const z = myZone();
  if (!z) { toast('No zone here to count against', true); return; }
  if (z.status === 'cleared') { toast(z.code + ' is already clear'); return; }
  const cleared = z.cleared + 1;
  if (z.structures && cleared >= z.structures) {
    data.local('ic_zones', Object.assign({}, z, { cleared: z.structures }));
    await outbox.add('addr', { zoneId: z.id, cleared: z.structures });
    openClear();
    toast('That was the last structure. Mark the zone clear?');
    return;
  }
  data.local('ic_zones', Object.assign({}, z, { cleared }));
  await outbox.add('addr', { zoneId: z.id, cleared });
  state.lastSentAt = Date.now();
  toast(z.structures ? `${cleared} of ${z.structures} cleared` : `${cleared} cleared in ${z.code}`);
  queueDraw();
}

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
    <span class="k">Unit</span><span>${esc(unitLabel(me))}${me && me.crew ? ' · ' + esc(me.crew) : ''}</span>
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
      case 'accept': localStorage.setItem(SEEN_ZONE + data.incident.id, btn.dataset.id); state.justCleared = null; queueDraw(); toast('Assignment accepted'); break;
      case 'camera': await takePhoto(); break;
      case 'note': state.noteI = Number(btn.dataset.i); drawPhotoFacts(); break;
      case 'send-photo': await sendPhoto(); break;
      case 'addr-clear': await addrClear(); break;
      case 'zone-clear': openClear(); break;
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
      case 'crew-less': case 'crew-more': {
        const me = data.me();
        const n = Math.max(0, Math.min(99, (me.crew_count || 0) + (act === 'crew-more' ? 1 : -1)));
        data.local('ic_members', Object.assign({}, me, { crew_count: n }));
        drawStatus();
        try { await data.updateMe({ crew_count: n }); } catch (err) { toast(err.message || String(err), true); }
        break;
      }
      case 'check-out': await checkOut(); break;
      case 'compose': state.composeI = 0; screen('compose'); drawCompose(); break;
      case 'cmp': state.composeI = Number(btn.dataset.i); drawCompose(); break;
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
