// The field app: sign in, check in to an incident with its code, then report. Everything a unit
// sends goes through the outbox, so a dead spot never loses a photo or a cleared zone.
import { Data } from '../shared/data.js';
import { Outbox } from '../shared/queue.js';
import { Sensors } from './sensors.js';
import { pickPhoto, shrink } from './camera.js';
import { compass, hhmm, ago, pct, unitLabel, unitWithKind, kindText, zoneAt, ringToLatLngs, latLngText, markingFor, periodLabel, nextPass, passDone, structureSummary, nearestFacility, facilityKind, milesText, directionsUrl, commandText, urgencyLabel, qualsText, crewNames, onSceneText, identityGiven, NEARBY_KINDS, NO_ID_TEXT, URGENCY, NOTE_CHIPS, HAZARD_KINDS, CLEAR_HAZARDS, PHOTO_WEDGE, STATUS_LABEL, OOS_REASONS, OCCUPANTS, WATER, DAMAGE, QUALIFICATIONS, UNIT_KINDS } from '../shared/rules.js';
import { fieldBriefing, hurtLines } from '../shared/briefings.js';

const LAST_INCIDENT = 'ic.field.incident';
import { applyTheme, storedTheme } from '../shared/theme.js';
import { availableLayers, layerDef, storedLayer, storeLayer, makeBaseLayer, makeOverlay } from '../shared/layers.js';
import { joinUrl, codeFromScan, codeFromSearch, qrSvg } from '../shared/qr.js';
import { startScan } from './scan.js';
import { parseLicence, looksLikeLicence, licenceExpired, licenceTail } from '../shared/licence.js';
import { REQUEST_KINDS, REQUEST_STATUS, URGENCY as URGENCY_WORDS, requestLine, DEMOB_ITEMS, demobOpen } from '../shared/rules.js';
import { NEEDS, LEFT_CHOICES, PERSON_PLACES, evacueeWho, evacueeWhere, evacueeFrom, evacueeMatch, whereValue, wherePatch, countIn, needsIn, needsText, placeCounts, bedsText } from '../shared/rules.js';
// The agency a check-in prefills is the one this account gave last time, never the last unit's on a
// shared phone: kept per account here, and read from the account's own check-ins once they load.
const AGENCY_KEY = 'ic.field.agency.';   // + the account's id
try { localStorage.removeItem('ic.field.agency'); } catch (e) { /* the old key was per phone */ }
const JOIN_KEY = 'ic.field.join';   // a code that arrived in the address (?join=), kept through sign-in
const SEEN_ZONE = 'ic.field.seen.';
const BRIEFED = 'ic.field.briefed.';   // the check-in the unit was briefed for (its joined_at), per incident
const POSITION_EVERY_MS = 10000;
const POSITION_MIN_M = 8;

const $ = (sel) => document.querySelector(sel);
const data = window.sb ? new Data(window.sb) : null;
const state = { screen: 'home', pending: null, noteI: 0, hazI: 0, victims: 0, clearHaz: new Set(), lastSentAt: null, lastPosSent: null, lastPosAt: 0, justCleared: null, outbox: 0, outboxError: null, seenMsgs: null, composeI: 0, parCounts: new Map(), oosPick: null, st: null, pass: 'primary', composeU: '', composeLoc: null, ask: { kind: 'people', urgency: 'now' }, coTicks: {}, ident: { read: null, photo: null, source: '' }, identShown: false, joinPeople: [blankPerson(), blankPerson()], mpQuals: new Set(), joinKind: '', briefOnce: false, joinFor: null, ev: null, deskQ: '', deskPicked: null };
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

function show(which) { for (const id of ['auth', 'join', 'app']) $('#' + id).hidden = id !== which; if (which !== 'app') $('#s-removed').hidden = true; }
function toTop(el) { if (el) el.scrollTop = 0; }
function screen(name) {
  const was = state.screen;
  state.screen = name;
  for (const s of ['photo', 'clear', 'hazard', 'help', 'helpsent', 'menu', 'safety', 'inbox', 'compose', 'structure', 'showcode', 'ask', 'checkout', 'briefing', 'hurt', 'person']) $('#s-' + s).hidden = name !== s;
  // A sheet opens at its top. The browser gives a sheet shown again the scroll it had when it was
  // hidden, so the briefing came back at its end, where Briefed was pressed last time.
  if (name !== was && name !== 'home') toTop($('#s-' + name));
  if (name === 'home') { state.pending = null; if (mini) setTimeout(() => mini.invalidateSize(), 50); }
}

// ---- the outbox: what the phone sends, in order, even after a dead spot
// Each new row carries the moment it was queued (at): what a phone queued before Operations removed it
// still lands, and nothing it queues after does (ic_may_write in the database).
const outbox = new Outbox({
  photo: (p, blob) => data.addPhoto(p.id, blob, p),
  addr: (p) => data.updateZone(p.zoneId, { cleared: p.cleared }),
  clear: (p) => data.updateZone(p.zoneId, p.patch),
  hazard: (p, _b, at) => data.addHazard(p.id, { ...p, createdAt: at }),
  alert: (p, _b, at) => data.raiseAlert(p.id, { ...p, createdAt: at }),
  standdown: (p) => data.standDown(p.id),
  message: (p, _b, at) => data.sendMessage(p.id, { ...p, createdAt: at }),
  ack: (p, _b, at) => data.ackMessage(p.messageId, p.reply, p.count, at),
  status: (p) => data.setStatus(p.userId, p.status, p.note),
  structure: (p, _b, at) => (p.update ? data.updateStructure(p.id, p.fields) : data.addStructure(p.id, Object.assign(at ? { created_at: at } : {}, p.fields))),
  pass: (p) => data.finishPass(p.zoneId, p.pass, p.opts),
  person: (p, _b, at) => data.addPerson(p.id, { ...p, checkedInAt: at }),
  evacuee: (p, _b, at) => (p.update ? data.updateEvacuee(p.id, p.patch) : data.addEvacuee(p.id, Object.assign(at ? { created_at: at } : {}, p.fields))),
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
  data.on((what, detail) => {
    if (what === 'auth') { if (!data.user) show('auth'); else if (!$('#auth').hidden) showJoin(); }
    if (what === 'change' && detail && detail.table === 'ic_members') drawRemoved();
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
  window.scrollTo(0, 0);
  $('#join-user').textContent = data.user ? data.user.email : '';
  const f = $('#join-form');
  if (state.joinFor !== (data.user && data.user.id)) { clearJoinForm(); state.joinFor = data.user && data.user.id; }
  if (!f.agency.value) { f.agency.value = lastAgency(); f.agency.dataset.prefill = f.agency.value; }
  const pending = pendingJoin();
  if (pending) { const f = $('#join-form'); f.code.value = pending; f.unit.focus(); toast('Code ' + pending + ' from the link. Name your unit and check in.'); }
  try { await data.myProfile(); } catch (e) { console.warn(e); }
  drawYouLine();
  if (!data.profileReady() && !state.identShown) { state.identShown = true; openIdentify(); }
  drawJoinPeople();
  drawJoinKind();
  // The incidents this account is already in come first, above the form, and only when there are some:
  // someone reopening theirs taps the row instead of scrolling past a whole check-in form.
  const list = $('#join-list'), mine = $('#join-mine');
  try {
    const all = await data.myIncidents();
    const rows = all.filter((r) => r.status === 'active');
    const already = pending && rows.find((r) => r.code === pending);
    if (already) { clearPendingJoin(); toast('You are already on ' + already.name); await openIncident(already.id); return; }
    // the agency this account gave at its own last check-in, unless the box has been typed in since
    const last = all.find((r) => r.role === 'unit' && r.agency);
    if (last && f.agency.value === (f.agency.dataset.prefill || '')) { f.agency.value = last.agency; f.agency.dataset.prefill = last.agency; }
    list.innerHTML = rows.map((r) => `
      <button class="pick-row" data-action="open-incident" data-id="${r.id}">
        <span style="flex:1;min-width:0"><span class="name">${esc(r.name)}</span><br><span class="sub">${esc(r.period || '')} · you are ${r.role === 'ops' ? 'Operations' : esc(r.unit_name || 'a unit')}</span></span>
        <span class="pill mono">${esc(r.code)}</span>
      </button>`).join('');
    mine.hidden = !rows.length;
    $('#join-title').textContent = rows.length ? 'Check in to another incident' : 'Check in to an incident';
  } catch (err) { list.innerHTML = `<p class="msg">${esc(err.message || err)}</p>`; mine.hidden = false; }
}
function lastAgency() { try { return (data.user && localStorage.getItem(AGENCY_KEY + data.user.id)) || ''; } catch (e) { return ''; } }
// Everything one person typed on this phone, gone before the next one signs in: the sign-in form, the
// check-in form with its people and kind, the identity sheet.
function clearJoinForm() {
  const f = $('#join-form');
  f.reset(); delete f.agency.dataset.prefill;
  const msg = f.querySelector('[data-msg]'); if (msg) msg.textContent = '';
  state.joinPeople = [blankPerson(), blankPerson()]; state.joinKind = '';
  drawJoinPeople(); drawJoinKind();
}
function clearForms() {
  $('#auth-form').reset(); $('#auth-msg').textContent = ''; $('#auth-msg').classList.remove('ok');
  clearJoinForm(); state.joinFor = null; state.identShown = false;
  for (const id of ['id-name', 'id-phone', 'id-number', 'id-state']) $('#' + id).value = '';
  $('#join-mine').hidden = true; $('#join-list').innerHTML = ''; $('#join-title').textContent = 'Check in to an incident';
  closeIdentify();
}

document.addEventListener('change', (e) => { const co = e.target.closest('[data-co]'); if (co) { state.coTicks[co.dataset.co] = co.checked; drawCheckout(); } });
$('#compose-text').addEventListener('input', () => { $('#compose-chips').hidden = $('#compose-text').value.trim() !== ''; });

// The people on the unit at check-in: a row per person, name and rank or role typed, what they are
// qualified for tapped. The rows live in state.joinPeople; the inputs are read back before a redraw.
function qualChips(quals, action, extra) {
  return QUALIFICATIONS.map(([q, label]) => `<button type="button" class="chip sm${quals.has(q) ? ' on' : ''}" data-action="${action}" data-q="${q}"${extra || ''} aria-pressed="${quals.has(q)}">${esc(label)}</button>`).join('');
}
// what the unit is, one tap at check-in (kept from the last check-in when nothing is picked)
function kindChips(cur, action) { return UNIT_KINDS.map(([k, label]) => `<button type="button" class="chip sm${cur === k ? ' on' : ''}" data-action="${action}" data-kind="${k}" aria-pressed="${cur === k}">${esc(label)}</button>`).join(''); }
function drawJoinKind() { setHtml($('#join-kind'), kindChips(state.joinKind, 'jp-kind')); }
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
    const inc = await data.join(f.code.value, 'unit', f.unit.value, null, null, f.agency.value, joinPeopleList(), state.joinKind);
    try { localStorage.setItem(AGENCY_KEY + data.user.id, f.agency.value.trim()); } catch (e) { /* storage blocked */ }
    clearJoinForm();
    clearPendingJoin();
    state.briefOnce = true;   // your briefing opens once the incident is open
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
  const me = data.me();
  let briefedFor = null;
  try { briefedFor = localStorage.getItem(BRIEFED + id); } catch (e) { /* storage blocked */ }
  if (me && me.role === 'unit' && (state.briefOnce || briefedFor !== me.joined_at)) { state.briefOnce = false; openBriefing(); }
}

// ---- your briefing: ICS-100's briefing items for this unit, assembled from the data (js/shared/briefings.js),
// shown once after check-in and kept in the menu. Live updates redraw it while it is open.
function openBriefing() { screen('briefing'); drawBriefingSheet(); }
function drawBriefingSheet() {
  const me = data.me(), p = sensors.pos;
  $('#briefing-sub').textContent = unitWithKind(me) + ' · ' + hhmm(new Date());
  const S = fieldBriefing(data, { me, at: p ? [p.lat, p.lng] : null });
  const action = (s) => s.action === 'map' ? `<button class="btn sm" data-action="briefing-map">Show on map</button>` : s.action === 'ask' ? `<button class="btn sm" data-action="ask">Ask</button>` : s.action === 'hurt' ? `<button class="btn sm" data-action="hurt">Open the card</button>` : '';
  setHtml($('#briefing-list'), S.map((s) => `<div class="brief-sec${s.warn ? ' warn' : ''}"><div class="k">${esc(s.title)}</div><div class="brief-row"><span class="brief-text">${s.lead ? '<strong>' + esc(s.lead) + '</strong> ' : ''}${esc(s.text)}</span>${action(s)}</div></div>`).join(''));
}
function markBriefed() { const me = data.me(); try { if (me) localStorage.setItem(BRIEFED + data.incident.id, me.joined_at); } catch (e) { /* storage blocked */ } }

// ---- if someone is hurt: the IAP's fourth question for this unit, from the unit's qualifications,
// the communications plan and the facilities. On the Nearest card, in the menu and under Safety.
function openHurt() { screen('hurt'); drawHurt(); }
function drawHurt() {
  const me = data.me(), p = sensors.pos;
  const L = hurtLines(data, { unit: me, at: p ? [p.lat, p.lng] : null });
  const lead = (t) => { const i = t.indexOf('. '); return i > 0 ? '<strong>' + esc(t.slice(0, i + 1)) + '</strong>' + esc(t.slice(i + 1)) : esc(t); };   // the first sentence in bold, as on the card
  setHtml($('#hurt-list'), L.map((l) => `<div class="hurt-row${l.warn ? ' warn' : ''}"><span class="hurt-n">${l.n}</span><div class="hurt-text">${lead(l.text)}${l.directions || l.ask ? `<div class="hurt-btns">${l.directions ? `<a class="btn sm" href="${esc(l.directions)}" target="_blank" rel="noopener">Directions</a>` : ''}${l.ask ? '<button class="btn sm" data-action="ask-ambulance">Ask for the ambulance</button>' : ''}</div>` : ''}</div></div>`).join(''));
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
async function setMyKind(kind) {
  const me = data.me();
  if (!me) return;
  const next = me.kind === kind ? '' : kind;
  data.local('ic_members', Object.assign({}, me, { kind: next }));
  try { await data.setKind(me.user_id, next); } catch (e) { toast(e.message || String(e), true); return; }
  toast(next ? unitLabel(me) + ' is a ' + kindText(next) : 'Kind cleared');
  drawMenu();
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
// ---- Ask for something: a resource request to Logistics, worked at the base, answered here
function drawAsk() {
  const a = state.ask;
  $('#ask-kinds').innerHTML = REQUEST_KINDS.map(([v, label]) => `<button class="chip${a.kind === v ? ' on' : ''}" data-action="ask-kind" data-value="${v}">${esc(label)}</button>`).join('');
  $('#ask-urgency').innerHTML = URGENCY_WORDS.filter(([v]) => v !== 'blocking').map(([v, label]) => `<button class="chip${a.urgency === v ? ' on' : ''}" data-action="ask-urgency" data-value="${v}">${esc(label)}</button>`).join('');
  const zone = data.myZones()[0] || (sensors.pos ? zoneAt(data.zones(), sensors.pos.lat, sensors.pos.lng) : null);
  $('#ask-where').textContent = zone ? `For ${zone.code} ${zone.name || ''}, where you are · your spot goes with it` : (sensors.pos ? 'Your spot goes with it' : 'No GPS fix yet; the request goes without a spot');
  const mine = data.myRequests().slice(0, 6);
  $('#ask-mine').innerHTML = mine.length ? mine.map((r) => `<div class="req-row"><span class="req-dot ${esc(r.status)}"></span><span style="flex:1"><strong>${esc(requestLine(r))}</strong><br><span class="muted" style="font-size:12px">${esc(REQUEST_STATUS[r.status] || r.status)}${r.answer ? ' · ' + esc(r.answer) : ''} · ${hhmm(r.status_at || r.created_at)}</span></span>${r.status === 'asked' ? `<button class="btn sm" data-action="ask-withdraw" data-id="${r.id}">Withdraw</button>` : ''}</div>`).join('') : '<div class="muted small">Nothing asked yet.</div>';
}
// the hurt card's shortcut: an ambulance, act on now, with the spot
function askAmbulance() {
  state.ask = { kind: 'medical', urgency: 'now' };
  screen('ask'); drawAsk();
  $('#ask-what').value = 'ambulance';
  $('#ask-note').value = 'Someone is hurt';
  $('#ask-note').focus();
}
async function sendAsk() {
  const what = $('#ask-what').value.trim() || REQUEST_KINDS.find(([v]) => v === state.ask.kind)[1].toLowerCase();
  const qty = Math.max(1, Number($('#ask-qty').value) || 1);
  const zone = data.myZones()[0] || (sensors.pos ? zoneAt(data.zones(), sensors.pos.lat, sensors.pos.lng) : null);
  try {
    await data.addRequest({ kind: state.ask.kind, what, quantity: qty, urgency: state.ask.urgency, note: $('#ask-note').value.trim(), zoneId: zone ? zone.id : null, lat: sensors.pos ? sensors.pos.lat : null, lng: sensors.pos ? sensors.pos.lng : null });
    $('#ask-what').value = ''; $('#ask-note').value = ''; $('#ask-qty').value = '1';
    toast('Sent to Logistics');
    drawAsk();
  } catch (err) { toast(err.message || String(err), true); }
}

// ---- checking out with the list: what is done is ticked, the rest rides along to the base
function drawCheckout() {
  const me = data.me();
  const people = data.unitPeople ? data.unitPeople(me.user_id).filter((p) => !p.checked_out_at) : [];
  const zone = data.myZones().find((z) => z.status === 'active');
  const hazards = data.hazards().filter((h) => h.user_id === me.user_id).length;
  const open = data.myRequests().filter((r) => r.status === 'asked' || r.status === 'approved' || r.status === 'ordered').length;
  const hours = ((Date.now() - new Date(me.joined_at).getTime()) / 3600000);
  const subs = {
    people: people.length ? people.map((p) => p.name).join(', ') + ' · ' + people.length + ' on the unit' : 'nobody listed on the unit',
    zone: zone ? `${zone.code} · ${zone.cleared} of ${zone.structures} cleared · Operations will reassign it` : 'no division assigned',
    equipment: 'radios, pumps, lights borrowed from Logistics',
    reported: `${hazards} hazard${hazards === 1 ? '' : 's'} reported by you · ${open} request${open === 1 ? '' : 's'} of yours open`,
    unhurt: 'untick to say what happened; Finance needs it the same day',
    hours: `${unitLabel(me)} on scene ${hhmm(me.joined_at)} to now, ${Math.floor(hours)} h ${String(Math.round((hours % 1) * 60)).padStart(2, '0')}`
  };
  $('#checkout-title').textContent = 'Check out ' + unitLabel(me);
  $('#checkout-list').innerHTML = DEMOB_ITEMS.map(([k, label]) => `<label class="co-item"><input type="checkbox" data-co="${k}"${state.coTicks[k] ? ' checked' : ''}><span style="flex:1"><strong>${esc(label)}</strong><br><span class="sub">${esc(subs[k])}</span></span></label>`).join('');
  const left = demobOpen(state.coTicks);
  $('#checkout-open').textContent = left.length ? `${left.length} item${left.length === 1 ? '' : 's'} not ticked. They go to Operations with your check-out: ${left.join(' · ')}.` : 'Everything ticked. Operations sees a clean check-out.';
}
function openCheckout() {
  const me = data.me();
  if (!me) return;
  const zone = data.myZones().find((z) => z.status === 'active');
  state.coTicks = { people: true, zone: !zone, reported: true, hours: true };
  $('#checkout-note').value = '';
  screen('checkout');
  drawCheckout();
}
async function checkOut() {
  const me = data.me();
  if (!me) return;
  const demob = { ticks: { ...state.coTicks }, open: demobOpen(state.coTicks), note: $('#checkout-note').value.trim() };
  try { await data.checkOut(demob); }
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
  setTimeout(() => { if (drawQueued) { drawQueued = false; drawAll(); } }, 1600);   // a frame that never comes (the pane hidden a moment after the draw was queued) no longer holds every later draw
}

// Removed by Operations (migration 0019): the phone keeps its own member row in view and learns it live.
// The sheet covers everything; the way out is Sign out. Nothing new it sends would land anyway.
function drawRemoved() {
  const me = data.me();
  const removed = !!(me && me.removed_at && !$('#app').hidden);
  const sheet = $('#s-removed');
  if (sheet.hidden === !removed) return;
  sheet.hidden = !removed;
  if (removed) { $('#removed-inc').textContent = data.incident ? data.incident.name : 'the incident'; sensors.stop(); toTop(sheet); }
}
function drawAll() {
  drawRemoved();
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

  // a shelter desk is not a search crew: its home is People here, not the zone and the search buttons
  const desk = isDesk();
  $('#desk').hidden = !desk;
  for (const el of [$('#assignment'), $('.actions'), $('#banner')]) el.hidden = desk;
  if ($('#mini').hidden !== desk) { $('#mini').hidden = desk; if (!desk && mini) setTimeout(() => mini.invalidateSize(), 50); }
  if (desk) drawDesk();
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
  if (state.screen === 'briefing') drawBriefingSheet();
  if (state.screen === 'hurt') drawHurt();
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

// The nearest staging area, boat ramp, shelter and hospital (each when one is open), with directions in the phone's own maps app.
function drawNearby() {
  const p = sensors.pos;
  const rows = [];
  for (const kind of NEARBY_KINDS) {
    const n = p ? nearestFacility(data.facilities(), kind, p.lat, p.lng) : null;
    const f = n ? n.facility : data.facilities().find((x) => x.kind === kind);
    if (!f) continue;
    rows.push(`<div class="near"><span class="fmark fmark-${esc(f.kind)} inline">${esc(facilityKind(f.kind)[2])}</span><span class="near-main"><span class="near-name">${esc(f.name || facilityKind(f.kind)[1])}</span><span class="muted">${esc(facilityKind(f.kind)[1])}${n ? ' · ' + milesText(n.distance) : ''}${f.contact ? ' · ' + esc(f.contact) : ''}</span></span><a class="btn sm" href="${directionsUrl(f.lat, f.lng)}" target="_blank" rel="noopener">Directions</a></div>`);
  }
  // the hurt card rides on the Nearest card: the medic on the unit, or the nearest one
  const me = data.me();
  const hurt = me ? hurtLines(data, { unit: me, at: p ? [p.lat, p.lng] : null })[0] : null;
  if (hurt) rows.push(`<div class="near hurt-near" data-action="hurt" role="button" tabindex="0"><span class="fmark inline">+</span><span class="near-main"><span class="near-name">If someone is hurt</span><span class="${hurt.warn ? 'warn' : 'muted'}" style="${hurt.warn ? 'color:var(--hazard-ink)' : ''}">${esc(hurt.text.replace(/^Medic on your unit: /, 'Medic: ').split('. ')[0])}</span></span><button class="btn sm" data-action="hurt" type="button">Open</button></div>`);
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
  } else if (data.profileReady(p)) {
    // a name and a phone check in; Operations sees "identity not given" and checks in person
    el.className = 'you-line noid';
    el.innerHTML = `<span>Checking in as <strong>${esc(p.full_name)}</strong> · ${esc(p.phone)} · ${NO_ID_TEXT}${p.verified_at ? ', verified in person' : ': Operations checks who you are in person'}</span><button type="button" class="btn sm" data-action="id-open">Add a licence</button>`;
  } else {
    el.className = 'you-line missing';
    el.innerHTML = `<span>Say who you are before you check in: your name and your phone, and your licence if you have it.</span><button type="button" class="btn sm" data-action="id-open">Identify yourself</button>`;
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
  toTop($('#s-identify'));
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
  if (!name) { msg.textContent = 'Your name, as on your licence if you have one.'; $('#id-name').focus(); return; }
  if (!phone) { msg.textContent = 'A phone Operations can reach you on.'; $('#id-phone').focus(); return; }
  const p = data.profile || {};
  // A licence is the identity, but not a condition: without one the unit checks in as "identity not
  // given" and Operations checks in person (the volunteer handed a phone at the shelter door).
  const hasId = !!(state.ident.read || state.ident.photo || p.photo_path || number);
  msg.textContent = 'Saving…';
  try {
    const r = state.ident.read;
    let photoPath = p.photo_path || null;
    if (state.ident.photo) photoPath = await data.uploadIdPhoto(state.ident.photo);
    const source = state.ident.source || (number ? 'typed' : p.id_source || '');
    await data.saveProfile({
      full_name: name, phone, licence_number: number || (r ? r.licenceNumber : p.licence_number) || '', licence_state: st || (r ? r.licenceState : p.licence_state) || '',
      licence_expires: r ? r.expires : (p.licence_expires || null), date_of_birth: r ? r.dateOfBirth : (p.date_of_birth || null), address: r ? r.address : (p.address || ''),
      id_source: hasId ? source || 'typed' : '', photo_path: photoPath
    });
    msg.textContent = '';
    closeIdentify();
    drawYouLine();
    if (state.screen === 'menu' && data.incident) drawMenu();
    toast(hasId ? 'Saved. Operations sees this when you check in.' : 'Saved without a licence. Operations will check who you are in person.');
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
    <span class="k">You</span><span>${esc(unitWithKind(me))}${me && crewNames(me, data.people()) ? ' · ' + esc(crewNames(me, data.people())) : ''}</span>
    ${data.profile ? `<span class="k">Identity</span><span>${esc(data.profile.full_name)} · ${esc(data.profile.phone)}${data.profile.licence_number ? ' · ' + esc(data.profile.licence_state) + ' ' + esc(licenceTail(data.profile.licence_number)) : ''}${identityGiven(data.profile) ? '' : ' · ' + NO_ID_TEXT}${data.profile.verified_at ? ' · verified by Operations' : ' · not yet verified'}</span>` : ''}
    <span class="k">Live updates</span><span>${data.realtime === 'SUBSCRIBED' ? 'connected' : esc(String(data.realtime).toLowerCase())}</span>
    <span class="k">Heading from</span><span>${sensors.headingSource === 'compass' ? 'the compass' : sensors.headingSource === 'gps' ? 'direction of travel' : 'nothing yet'}</span>`;
  setHtml($('#menu-kind'), kindChips(me ? me.kind : '', 'me-kind'));
  const shelters = data.facilities().filter((f) => f.kind === 'shelter'), myShelter = isDesk() ? deskShelter() : null;
  $('#menu-shelter-box').hidden = !isDesk();
  setHtml($('#menu-shelter'), isDesk() ? (shelters.length ? shelters.map((f) => `<button class="chip${myShelter && myShelter.id === f.id ? ' on' : ''}" data-action="desk-shelter" data-id="${f.id}" aria-pressed="${!!myShelter && myShelter.id === f.id}">${esc(placeLabel(f))}</button>`).join('') : '<span class="muted small">No shelter on the map yet; Operations places one.</span>') : '');
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


// ---- People here: a shelter desk's home (v26). The shelter's count against its beds, a search across
// every shelter and hospital, the crews' records on their way here (sign them in, not again), Sign in
// a person, and who is here now, newest first. One record per person or family (ic_evacuees).
function isDesk() { const me = data.me(); return !!me && me.kind === 'shelter_desk'; }
// The shelter this desk works at: the one on its membership, else the nearest open shelter (or the only
// one), saved once so the base and the database know which shelter's desk this is.
function deskShelter() {
  const me = data.me();
  if (!me) return null;
  const chosen = me.facility_id ? data.facility(me.facility_id) : null;
  if (chosen) return chosen;
  const shelters = data.facilities().filter((f) => f.kind === 'shelter');
  const p = sensors.pos, near = p ? nearestFacility(shelters, 'shelter', p.lat, p.lng) : null;
  const pick = near ? near.facility : shelters[0] || null;
  if (pick && state.deskPicked !== pick.id) {
    state.deskPicked = pick.id;
    data.local('ic_members', Object.assign({}, me, { facility_id: pick.id }));
    data.setUnitFacility(me.user_id, pick.id).catch((e) => { state.deskPicked = null; toast(e.message || String(e), true); });
  }
  return pick;
}
const facilityOf = (id) => data.facility(id);
const fromOf = (e) => evacueeFrom(e, { structureOf: (id) => data.structure(id), zoneOf: (id) => data.zone(id) });
function placeLabel(f) { return f ? (f.name || facilityKind(f.kind)[1]) : ''; }
function drawDesk() {
  const f = deskShelter();
  const all = data.evacuees();
  const c = f ? placeCounts(all, f.id) : null;
  setHtml($('#desk-head'), f
    ? `<div class="desk-top"><h2>People here</h2><span class="desk-count">${esc(placeLabel(f))} · <strong>${esc(bedsText(c.people, f.beds))}</strong></span></div>
       <div class="muted small">${c.here.length} record${c.here.length === 1 ? '' : 's'}${c.needs.length ? ' · ' + esc(c.needs.map(([, label, n]) => n + ' ' + label.toLowerCase()).join(' · ')) : ''}${f.expected ? ' · expected: ' + esc(f.expected) : ''}. Operations sees this count live on the shelter's card.</div>`
    : `<div class="desk-top"><h2>People here</h2></div><div class="muted small">Operations has not placed a shelter yet. You can still find a person; Sign in waits for a shelter on the map.</div>`);
  drawDeskResults();
  const arriving = c ? c.arriving : [];
  setHtml($('#desk-arriving'), arriving.length ? `<div class="k desk-arr-k">Arriving from crews · sign them in, not again</div>` + arriving.map((e) => `
    <div class="arrive" data-ev="${e.id}"><span class="arrive-main"><strong>${esc(evacueeWho(e))}</strong>${fromOf(e) ? ' from ' + esc(fromOf(e)) : ''} · ${esc(unitLabel(data.member(e.logged_by)))}, ${hhmm(e.status_at || e.created_at)}${e.needs.length ? ' · ' + esc(needsText(e.needs)) : ''}${e.note ? `<span class="muted"> · ${esc(e.note)}</span>` : ''}</span><button type="button" class="btn arrive-btn" data-action="ev-arrived" data-id="${e.id}">They're here</button></div>`).join('') : '');
  const here = c ? c.here : [];
  const left = c ? c.left : [];
  setHtml($('#desk-here'), f ? `<div class="k">Here now · ${c.people} ${c.people === 1 ? 'person' : 'people'} in ${here.length} record${here.length === 1 ? '' : 's'}, newest first</div>` +
    (here.length ? here.map((e) => evRow(e, f)).join('') : '<div class="muted small">Nobody signed in yet.</div>') +
    (left.length ? `<div class="k" style="margin-top:6px">Left here · moved, never removed</div>` + left.map((e) => evRow(e, f)).join('') : '') : '');
}
function evRow(e, f) {
  const away = !(e.facility_id === f.id && e.status === 'here');
  return `<button type="button" class="ev-row${away ? ' away' : ''}" data-action="ev-open" data-id="${e.id}"><span class="ev-main"><span class="ev-who">${esc(evacueeWho(e))}</span><span class="ev-sub">${esc([fromOf(e) ? 'from ' + fromOf(e) : '', needsText(e.needs), e.note].filter(Boolean).join(' · '))}</span></span><span class="ev-when">${away ? esc(evacueeWhere(e, facilityOf)) : hhmm(e.signed_in_at || e.status_at)}</span></button>`;
}
// Find a person: every record on the incident, wherever it says they are now and since when. Not listed?
// One tap asks Operations to look, with the desk's number.
function drawDeskResults() {
  const q = state.deskQ.trim();
  if (!q) { setHtml($('#desk-results'), ''); return; }
  const hits = evacueeMatch(data.evacuees(true), q, { facilityOf, structureOf: (id) => data.structure(id), zoneOf: (id) => data.zone(id) }).slice(0, 8);
  setHtml($('#desk-results'), `<div class="card find-card">${hits.map((e) => `<div class="find-row"><span><strong>${esc(evacueeWho(e))}</strong>${e.needs.length ? ' · ' + esc(needsText(e.needs)) : ''}</span><span class="muted">${esc(evacueeWhere(e, facilityOf))}${fromOf(e) ? ' · from ' + esc(fromOf(e)) : ''}</span></div>`).join('') || `<div class="muted">Nobody on record matches "${esc(q)}".</div>`}
    <div class="find-ask">Not listed? <button type="button" class="btn sm" data-action="ev-ask">Ask Operations to look</button><span class="muted"> sends "Looking for ${esc(q)}" with your desk's number.</span></div></div>`);
}
async function askOpsToLook() {
  const q = state.deskQ.trim();
  if (!q) { toast('Type the name first', true); $('#desk-q').focus(); return; }
  const r = data.recipientsFor('ops');
  if (!r.toUsers.length) { toast('Nobody at Operations to send to', true); return; }
  const me = data.me(), f = deskShelter(), phone = data.profile && data.profile.phone;
  const text = `Looking for ${q}. Not on any shelter or hospital record. Call ${unitLabel(me)}${f ? ' at ' + placeLabel(f) : ''}${phone ? ' on ' + phone : ''}.`;
  const id = uuid();
  data.local('ic_messages', { id, incident_id: data.incident.id, from_user: data.user.id, to_users: r.toUsers, to_label: r.toLabel, to_zone: null, kind: 'message', text, urgency: '', lat: null, lng: null, created_at: new Date().toISOString() });
  await outbox.add('message', { id, toUsers: r.toUsers, toLabel: r.toLabel, toZone: null, kind: 'message', text, urgency: '' });
  state.lastSentAt = Date.now();
  toast('Asked Operations to look for ' + q);
}
// Where now, as a select: here (the desk's shelter), the other shelters and the hospitals, or gone from them.
function whereOptions(cur, hereId) {
  const places = data.facilities().filter((f) => PERSON_PLACES.includes(f.kind) || f.id === (cur && cur.facility_id));
  const opt = (v, label) => `<option value="${esc(v)}">${esc(label)}</option>`;
  return places.sort((a, b) => (b.id === hereId) - (a.id === hereId) || PERSON_PLACES.indexOf(a.kind) - PERSON_PLACES.indexOf(b.kind)).map((f) => opt('f:' + f.id, f.id === hereId ? 'Here, ' + placeLabel(f) : placeLabel(f) + ' (' + facilityKind(f.kind)[1].toLowerCase() + ')')).join('')
    + LEFT_CHOICES.map(([v, label]) => opt(v, label)).join('');
}
// The sheet: a new person signed in here, a crew's arrival just signed in (add the name), or a record to change.
function openPerson(mode, id) {
  const f = deskShelter();
  const e = id ? data.evacuee(id) : null;
  if (mode === 'new' && !f) { toast('No shelter on the map yet to sign people in at', true); return; }
  state.ev = { mode, id: e ? e.id : null, needs: new Set(e ? e.needs : []), countTouched: !!e };
  $('#person-title').textContent = mode === 'new' ? 'Sign in a person' : mode === 'arrived' ? 'Signed in: ' + evacueeWho(e) : evacueeWho(e);
  $('#person-sub').textContent = mode === 'new' ? (f ? placeLabel(f) + ' · ' + hhmm(new Date()) : '') : evacueeWhere(e, facilityOf);
  $('#person-hint').textContent = mode === 'arrived' ? `${unitLabel(data.member(e.logged_by))} sent them${fromOf(e) ? ' from ' + fromOf(e) : ''}. They are signed in; add the name if you have it.` : mode === 'edit' ? 'Change what is wrong, or where they are now. A record is moved, never removed.' : '';
  $('#person-hint').hidden = mode === 'new';
  $('#ev-who').value = e ? e.label : '';
  $('#ev-count').value = e ? e.count : 1;
  $('#ev-from').value = e ? (e.from_text || fromOf(e)) : '';
  $('#ev-note').value = e ? e.note : '';
  $('#ev-where').innerHTML = whereOptions(e, f && f.id);
  $('#ev-where').value = e ? whereValue(e) : (f ? 'f:' + f.id : 'unknown');
  if (e && e.status === 'on_the_way' && f && e.facility_id === f.id) $('#ev-where').value = 'f:' + f.id;
  $('#ev-save').textContent = mode === 'new' ? 'Sign in here' : mode === 'arrived' ? 'Save the name' : 'Save';
  $('#ev-cancel').textContent = mode === 'arrived' ? 'Not now' : 'Cancel';   // they are signed in already
  drawPersonNeeds();
  screen('person');
  if (mode !== 'edit') setTimeout(() => $('#ev-who').focus(), 60);
}
function drawPersonNeeds() { setHtml($('#ev-needs'), NEEDS.map(([k, label]) => `<button type="button" class="chip${state.ev.needs.has(k) ? ' on' : ''}" data-action="ev-need" data-need="${k}" aria-pressed="${state.ev.needs.has(k)}">${esc(label)}</button>`).join('')); }
async function savePerson() {
  const ev = state.ev;
  if (!ev) return;
  const label = $('#ev-who').value.trim();
  if (!label) { toast('Who: a name, or "family of 4"', true); $('#ev-who').focus(); return; }
  const f = deskShelter();
  const cur = ev.id ? data.evacuee(ev.id) : null;
  const where = wherePatch($('#ev-where').value, { facilityOf, hereId: f && f.id, current: cur });
  const fields = { label, count: Math.min(999, Math.max(1, Number($('#ev-count').value) || 1)), needs: [...ev.needs], from_text: $('#ev-from').value.trim(), note: $('#ev-note').value.trim(), ...where };
  const now = new Date().toISOString();
  if (cur) {
    const patch = {};
    for (const k of Object.keys(fields)) if (JSON.stringify(fields[k]) !== JSON.stringify(k === 'from_text' ? (cur.from_text || '') : cur[k])) patch[k] = fields[k];
    if (patch.from_text === fromOf(cur) && !cur.from_text) delete patch.from_text;   // the house's label shown in the box, unchanged
    if (Object.keys(patch).length) {
      const moved = 'status' in patch || 'facility_id' in patch;
      data.local('ic_evacuees', Object.assign({}, cur, patch, moved ? { status_at: now, prev_facility_id: cur.status === 'here' ? cur.facility_id : cur.prev_facility_id } : {}, patch.status === 'here' ? { signed_in_at: now, signed_in_by: data.user.id } : {}));
      await outbox.add('evacuee', { id: cur.id, update: true, patch });
    }
    toast(Object.keys(patch).length ? evacueeWho(Object.assign({}, cur, patch)) + (patch.status && patch.status !== 'here' ? ': ' + evacueeWhere(Object.assign({}, cur, patch, { status_at: now }), facilityOf) : ' saved') : 'Nothing changed');
  } else {
    const id = uuid();
    data.local('ic_evacuees', Object.assign({ id, incident_id: data.incident.id, structure_id: null, prev_facility_id: null, logged_by: data.user.id, status_at: now, created_at: now, updated_at: now, archived_at: null, signed_in_by: where.status === 'here' ? data.user.id : null, signed_in_at: where.status === 'here' ? now : null }, fields));
    await outbox.add('evacuee', { id, fields });
    toast(evacueeWho(fields) + (where.status === 'here' ? ' signed in' : ': ' + evacueeWhere(Object.assign({}, fields, { status_at: now }), facilityOf)));
  }
  state.lastSentAt = Date.now();
  state.ev = null;
  screen('home');
  queueDraw();
}
// They're here: one tap signs the crew's record in at this shelter; the sheet then asks for the name.
async function theyAreHere(id) {
  const e = data.evacuee(id), f = deskShelter();
  if (!e || !f) return;
  const now = new Date().toISOString();
  data.local('ic_evacuees', Object.assign({}, e, { status: 'here', facility_id: f.id, status_at: now, signed_in_at: now, signed_in_by: data.user.id }));
  await outbox.add('evacuee', { id, update: true, patch: { status: 'here', facility_id: f.id } });
  state.lastSentAt = Date.now();
  openPerson('arrived', id);
}
$('#desk-q').addEventListener('input', (e) => { state.deskQ = e.target.value; drawDeskResults(); });
$('#ev-who').addEventListener('input', () => { if (state.ev && !state.ev.countTouched) { const n = countIn($('#ev-who').value); $('#ev-count').value = n || 1; } });
$('#ev-count').addEventListener('input', () => { if (state.ev) state.ev.countTouched = true; });
// the help count follows the rows as they are typed: everyone on a row needed help
$('#st-people').addEventListener('input', () => {
  if (!state.st) return;
  syncStPeople();
  const n = state.st.people.filter((r) => r.who.trim()).reduce((sum, r) => sum + (countIn(r.who) || 1), 0);
  if (n > state.st.help) { state.st.help = n; $('#help-count').textContent = n; }
});

// The crew's rows under People needing help: who, their condition, where they went. Each becomes a
// record linked to the house, on its way when sent to a shelter, so the desk sees "from 112 Pecan Ln".
function stWhereOptions(sel) {
  const places = data.facilities().filter((f) => PERSON_PLACES.includes(f.kind)).sort((a, b) => PERSON_PLACES.indexOf(a.kind) - PERSON_PLACES.indexOf(b.kind));
  return places.map((f) => `<option value="f:${f.id}"${sel === 'f:' + f.id ? ' selected' : ''}>Went to ${esc(placeLabel(f))} (${esc(facilityKind(f.kind)[1].toLowerCase())})</option>`).join('')
    + LEFT_CHOICES.map(([v, label]) => `<option value="${v}"${sel === v ? ' selected' : ''}>${esc(label)}</option>`).join('');
}
function blankStPerson() {
  const st = state.st, shelters = data.facilities().filter((f) => f.kind === 'shelter');
  const near = st && st.lat != null ? nearestFacility(shelters, 'shelter', st.lat, st.lng) : null;
  const f = near ? near.facility : shelters[0];
  return { who: '', cond: '', where: f ? 'f:' + f.id : 'unknown' };
}
function syncStPeople() {
  for (const el of document.querySelectorAll('#st-people [data-stp]')) { const r = state.st.people[Number(el.dataset.i)]; if (r) r[el.dataset.stp] = el.value; }
}
function drawStPeople() {
  const st = state.st;
  const on = st.id ? data.evacuees().filter((e) => e.structure_id === st.id) : [];
  setHtml($('#st-people'), on.map((e) => `<div class="st-on"><strong>${esc(evacueeWho(e))}</strong>${e.note ? ' · ' + esc(e.note) : ''}<span class="muted"> · ${esc(evacueeWhere(e, facilityOf))}</span></div>`).join('')
    + st.people.map((r, i) => `<div class="st-row">
      <input class="input" data-stp="who" data-i="${i}" value="${esc(r.who)}" placeholder="Who: a name, or &quot;family of 4&quot;" autocapitalize="words" autocomplete="off" maxlength="120" aria-label="Who">
      <input class="input" data-stp="cond" data-i="${i}" value="${esc(r.cond)}" placeholder="Condition: on oxygen, stable" autocomplete="off" maxlength="200" aria-label="Condition">
      <select class="input" data-stp="where" data-i="${i}" aria-label="Went to" title="Went to">${stWhereOptions(r.where, true)}</select>
      <button type="button" class="btn pp-x" data-action="st-person-x" data-i="${i}" aria-label="Remove this row" title="Remove this row">×</button></div>`).join(''));
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
    water: existing ? existing.water_cm : null, damage: existing ? existing.damage : 'unknown', haz, people: []
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
  drawStPeople();
}
async function saveStructure() {
  const st = state.st;
  if (!st) return;
  syncStPeople();
  const rows = st.people.filter((r) => r.who.trim()).map((r) => ({ ...r, who: r.who.trim(), cond: r.cond.trim(), count: countIn(r.who) || 1 }));
  st.help = Math.max(st.help, rows.reduce((n, r) => n + r.count, 0));   // everyone on a row needed help
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
  // each row a record linked to the house: after the house in the outbox, so the link has something to point at
  for (const r of rows) {
    const eid = uuid(), at = now.toISOString();
    const ev = { label: r.who, count: r.count, needs: needsIn(r.who + ' ' + r.cond), note: r.cond, structure_id: id, from_text: fields.label || (zone ? zone.code : ''), ...wherePatch(r.where, { facilityOf }) };
    data.local('ic_evacuees', Object.assign({ id: eid, incident_id: data.incident.id, prev_facility_id: null, logged_by: data.user.id, status_at: at, signed_in_by: null, signed_in_at: null, created_at: at, updated_at: at, archived_at: null }, ev));
    await outbox.add('evacuee', { id: eid, fields: ev });
  }
  state.lastSentAt = Date.now();
  state.st = null;
  screen('home');
  const z = zone ? data.zone(zone.id) : null;
  if (z && z.structures && z.cleared >= z.structures) { openClear(); toast('That was the last structure. Is the search of ' + z.code + ' complete?'); }
  else toast((fields.label || 'Structure') + ' searched' + (z ? ' · ' + z.cleared + ' of ' + z.structures : '') + (rows.length ? ' · ' + rows.length + (rows.length === 1 ? ' record' : ' records') + ' of who went where' : ''));
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
      case 'sign-out': localStorage.removeItem(LAST_INCIDENT); sensors.stop(); await data.signOut(); clearForms(); show('auth'); break;
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
      case 'occ': syncStPeople(); state.st.occ = btn.dataset.v; drawStructure(); break;
      case 'water': syncStPeople(); state.st.water = state.st.water === Number(btn.dataset.v) ? null : Number(btn.dataset.v); drawStructure(); break;
      case 'damage': syncStPeople(); state.st.damage = btn.dataset.v; drawStructure(); break;
      case 'shaz': { syncStPeople(); const i = Number(btn.dataset.i); if (state.st.haz.has(i)) state.st.haz.delete(i); else state.st.haz.add(i); drawStructure(); break; }
      case 'help-up': syncStPeople(); state.st.help = Math.min(999, state.st.help + 1); if (!state.st.people.length) state.st.people.push(blankStPerson()); drawStructure(); break;
      case 'st-person-add': syncStPeople(); state.st.people.push(blankStPerson()); drawStructure(); { const last = document.querySelector('#st-people .st-row:last-child [data-stp="who"]'); if (last) last.focus(); } break;
      case 'st-person-x': syncStPeople(); state.st.people.splice(Number(btn.dataset.i), 1); drawStructure(); break;
      case 'ev-new': openPerson('new'); break;
      case 'ev-open': { const e = data.evacuee(btn.dataset.id); if (e) openPerson('edit', e.id); break; }
      case 'ev-arrived': await theyAreHere(btn.dataset.id); break;
      case 'ev-need': { const k = btn.dataset.need; if (state.ev.needs.has(k)) state.ev.needs.delete(k); else state.ev.needs.add(k); drawPersonNeeds(); break; }
      case 'ev-save': await savePerson(); break;
      case 'ev-ask': await askOpsToLook(); break;
      case 'desk-shelter': { const me = data.me(); if (me) { data.local('ic_members', Object.assign({}, me, { facility_id: btn.dataset.id })); await data.setUnitFacility(me.user_id, btn.dataset.id); toast('Your shelter: ' + placeLabel(data.facility(btn.dataset.id))); drawMenu(); queueDraw(); } break; }
      case 'help-down': syncStPeople(); state.st.help = Math.max(0, state.st.help - 1); drawStructure(); break;
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
      case 'check-out': openCheckout(); break;
      case 'compose': state.composeI = 0; screen('compose'); drawCompose(); break;
      case 'ask': screen('ask'); drawAsk(); break;
      case 'ask-kind': state.ask.kind = btn.dataset.value; drawAsk(); break;
      case 'ask-urgency': state.ask.urgency = btn.dataset.value; drawAsk(); break;
      case 'ask-send': await sendAsk(); break;
      case 'ask-withdraw': await data.withdrawRequest(btn.dataset.id); drawAsk(); toast('Withdrawn'); break;
      case 'ask-ambulance': askAmbulance(); break;
      case 'briefing': openBriefing(); break;
      case 'briefing-later': screen(state.screen === 'briefing' ? 'home' : 'menu'); queueDraw(); break;
      case 'briefed': markBriefed(); screen('home'); queueDraw(); toast('Briefed. Your briefing stays in the menu.'); break;
      case 'briefing-map': markBriefed(); screen('home'); queueDraw(); { const z = myZone(); if (z && mini) mini.fitBounds(L.latLngBounds(ringToLatLngs(z.polygon)), { padding: [16, 16] }); } break;
      case 'hurt': openHurt(); break;
      case 'jp-kind': state.joinKind = state.joinKind === btn.dataset.kind ? '' : btn.dataset.kind; drawJoinKind(); break;
      case 'me-kind': await setMyKind(btn.dataset.kind); break;
      case 'checkout-confirm': await checkOut(); break;
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
