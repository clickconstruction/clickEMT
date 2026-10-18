// The base view: sign in, pick or open an incident, then keep the map, the sidebar and the log
// drawn from the shared data module while it follows live changes.
import { Data } from '../shared/data.js';
import { BaseMap } from './map.js';
import { logSinceHtml, zonesHtml, panelHtml, zoneModalHtml, logHtml, logFiltersHtml, imageryHtml, layersPopHtml, hoursHtml, hoursCsvText, joinCardHtml, joinCardText, fieldJoinUrl, maydayHtml, safetyHtml, briefingHtml, briefingText, form204Html, form204Text, form214Html, form214Text, sitrepHtml, sitrepText, sitrepFormHtml, iapHtml, iapText, form211Html, form211Text, orgHtml, orgText, transferDialogHtml, peopleBoardHtml, peopleChipsHtml, findPersonHtml, placeListHtml, placeListText, settingsDialogHtml, publicPageHtml, transportsPageHtml, transportFormFields, bandsSheetHtml, bandsSheetText, esc, codesPopHtml, zoneHoverHtml, headCountHtml, liveHtml } from './ui.js';
import { whenText, dateText, nextZoneCode, hhmm, hhmmUtc, zoneShort, centroid, periodLabel, zoneAt as zoneAtRule, markingFor, unitLabel as unitLabelOf, replayIndex, sampleAt, replayWindow as replayWindowRule, replayWindowLabel, replayPickCheck, dayIso, transferText, kindText, wherePatch, evacueeWho, evacueeWhere, FACILITY_KINDS, transportLabel, TRANSPORT_STATUS, bandLabel, inviteFromSearch } from '../shared/rules.js';
import { currentTheme, toggleTheme, storedTheme } from '../shared/theme.js';
import { availableLayers, storedLayer, setOverlayHidden, boundsOk, setGoogleKey, testGoogleKey } from '../shared/layers.js';
import { codeFromSearch, joinUrl, CODE_RE } from '../shared/qr.js';
import { watchUpdates } from '../shared/update.js';
import { startAround, clearAround, layoutAround, aroundOn, aroundSeen } from './discover.js';
import { photoCaption, photoFileName, imageType, withCaption, zip } from './photo-export.js';
const FACILITY_LABEL = Object.fromEntries(FACILITY_KINDS.map(([v, label]) => [v, label]));

const LAST_INCIDENT = 'ic.base.incident';
// #log is the log alone in its own window (the Pop out button), for a second screen: the same
// page, the same Data, with the map, the tools and the sidebar left out and the log always open.
const LOG_ONLY = location.hash === '#log';
const DEMO = /[?&]demo\b/.test(location.search);   // the public demo: its tours show the base around, not the labels (v58)
if (LOG_ONLY) document.documentElement.classList.add('log-only');
const LOG_KEY = LOG_ONLY ? 'ic.base.log.popout' : 'ic.base.log';   // this screen's log: folded or open, which group
const BOARD_KEY = 'ic.base.board';   // the resources board: by kind or by status, a device setting
const DEFAULT_VIEW = [30.2672, -97.7431, 12];

const $ = (sel) => document.querySelector(sel);
const data = window.sb ? new Data(window.sb) : null;
const state = { tr: { add: false, edit: null, open: null, gone: false }, printTags: null, roster: null, invite: null, selected: null, newZone: null, pendingPolygon: null, oosFor: null, periodNext: false, printZone: null, print: null, placeZone: null, placeKind: null, replay: null, log: loadLogPrefs(), modalZone: null, highlight: null, layersOpen: false, layersUpload: false, hoursPeriod: null, people: { q: '', quals: new Set(), add: false, addUnit: null, tab: 'people', edit: null }, board: loadBoardPref(), transfer: null, find: { top: '', home: '' }, evAdd: null, printFacility: null, armed: false, identOpen: null, gearOpen: false, codesOpen: false, opsShown: false, liveOpen: false, lastUpdate: null, liveSince: null, version: null, updateReady: false };
function loadBoardPref() { try { return localStorage.getItem(BOARD_KEY) === 'status' ? 'status' : 'kind'; } catch (e) { return 'kind'; } }
function loadLogPrefs() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(LOG_KEY) || '{}') || {}; } catch (e) { /* storage blocked */ }
  return { open: LOG_ONLY || saved.open !== false, group: saved.group || 'all', q: '', seenAt: null, sinceAt: saved.sinceAt || null };   // sinceAt: the last look the operator marked (v45), kept per device
}
function saveLogPrefs() { try { localStorage.setItem(LOG_KEY, JSON.stringify({ open: state.log.open, group: state.log.group, sinceAt: state.log.sinceAt || null })); } catch (e) { /* storage blocked */ } }
let map = null;
let drawQueued = false;

function toast(msg, bad) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('bad', !!bad);
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, 2600);
}

function show(which) {
  for (const id of ['auth', 'pick', 'app']) $('#' + id).hidden = id !== which;
  if (which === 'app' && map) map.invalidate();
}

// ---- boot
async function boot() {
  if (!data) { document.body.innerHTML = '<p style="padding:24px">Supabase is not configured. See config.example.js.</p>'; return; }
  const user = await data.init();
  data.on(onData);
  if (!user) { show('auth'); drawLandingInvite(); return; }
  const last = localStorage.getItem(LAST_INCIDENT);
  if (last && !pendingInvite()) {   // an invitation is accepted on the picker first (v56)
    try { await openIncident(last); return; } catch (e) { console.warn('could not reopen', e); localStorage.removeItem(LAST_INCIDENT); }
  }
  await showPicker();
}

function onData(what, detail) {
  if (what === 'auth') {
    if (!data.user) { show('auth'); return; }
    if ($('#auth').hidden === false) showPicker();
  }
  if (what === 'change' && detail && detail.table === 'ic_incidents' && data.incident) setGoogleKey(data.settings().maps_key);   // the settings changed on another screen
  if (what === 'change' && detail) state.lastUpdate = { at: Date.now(), what: updateWords(detail) };   // v60: the connection card's last update
  if (what === 'change' || what === 'open') queueDraw();
  if (what === 'realtime') drawLive();
}

// ---- auth
// ---- the front door: a join code opens the field app with the code filled in, the link a join card's QR carries
// (?mock or ?demo on this page carries over as ?demo, so the way in can be tried on the stand-in)
$('#door-code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); $('#door-msg').textContent = ''; });
$('#door-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = $('#door-code').value.trim().toUpperCase();
  if (!CODE_RE.test(code)) { $('#door-msg').textContent = 'A join code is six letters and numbers, like CEDAR7. It never has 0, O, 1 or I.'; $('#door-code').focus(); return; }
  location.href = joinUrl(code, new URL('field/', location.href)) + (/[?&](mock|demo)\b/.test(location.search) ? '&demo' : '');
});

$('#auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#auth-msg');
  msg.textContent = 'Signing in…'; msg.classList.remove('ok');
  try { await data.signIn($('#auth-email').value.trim(), $('#auth-password').value); msg.textContent = ''; await showPicker(); }
  catch (err) { msg.textContent = err.message || String(err); }
});
$('#auth-signup').addEventListener('click', async () => {
  const msg = $('#auth-msg');
  const email = $('#auth-email').value.trim(), password = $('#auth-password').value;
  if (!email || password.length < 8) { msg.textContent = 'Enter an email and a password of at least 8 characters.'; return; }
  try {
    const res = await data.signUp(email, password);
    if (res.session) { msg.textContent = ''; await showPicker(); }
    else { msg.textContent = 'Account created. Check your email to confirm it, then sign in.'; msg.classList.add('ok'); }
  } catch (err) { msg.textContent = err.message || String(err); }
});

// ---- picker
// ---- an invitation's link (v56): ?invite=<token> in the address, kept through sign-in, accepted on the picker
const INVITE_KEY = 'ic.base.invite';
(function takeInviteLink() {
  const t = inviteFromSearch(location.search);
  if (!t) return;
  try { sessionStorage.setItem(INVITE_KEY, t); } catch (e) { /* storage blocked */ }
  try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* fine */ }
})();
function pendingInvite() { try { return sessionStorage.getItem(INVITE_KEY) || ''; } catch (e) { return ''; } }
function clearPendingInvite() { state.invite = null; try { sessionStorage.removeItem(INVITE_KEY); } catch (e) { /* fine */ } }
async function peekInvite() {
  const t = pendingInvite();
  if (!t) return null;
  if (state.invite && state.invite.token === t) return state.invite;
  try { const v = await data.invitePeek(t); state.invite = v ? Object.assign({ token: t }, v) : { token: t, state: 'missing' }; } catch (e) { state.invite = { token: t, state: 'missing' }; }
  return state.invite;
}
const inviteAs = (v) => (v.role === 'ops' ? 'Operations' : v.unit ? 'a unit, ' + v.unit : 'a unit');
// signed out: the landing says who invited whom, and the sign-in form takes the address
async function drawLandingInvite() {
  const el = $('#land-invite'); if (!el) return;
  const v = await peekInvite();
  if (!v || v.state === 'missing') { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<div class="k">You're invited</div><div class="big">${esc(v.incident)}</div><div>as <strong>${esc(inviteAs(v))}</strong>, by ${esc(v.by)}${v.agency ? ' · ' + esc(v.agency) : ''}</div>
    <div class="muted" style="font-size:13px">${v.state === 'pending' ? 'Sign in below with ' + esc(v.email) + ' to accept it. The link from the email signs you in by itself the first time and asks for a password.' : v.state === 'expired' ? 'This invitation has expired; ask ' + esc(v.by) + ' to send it again.' : v.state === 'withdrawn' ? 'This invitation was withdrawn.' : v.state === 'accepted' ? 'This invitation was accepted already; sign in to open the incident.' : ''}</div>`;
  const em = $('#auth-email'); if (em && !em.value) em.value = v.email;
}
// signed in: the picker offers to accept, with a password the first time
async function drawPickInvite() {
  const el = $('#pick-invite'); if (!el) return;
  const v = await peekInvite();
  if (!v) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  const me = (data.user && data.user.email || '').toLowerCase();
  const fresh = data.user && data.user.last_sign_in_at && Date.now() - new Date(data.user.last_sign_in_at).getTime() < 10 * 60000;
  const can = v.state === 'pending' || v.state === 'accepted';
  el.innerHTML = `<div class="pick-invite"><div class="k">You're invited</div><div class="big">${esc(v.incident || 'an incident')}</div>
    ${v.state === 'missing' ? '<div>This invitation is not on record; ask Operations for a new one.</div>' : `<div>as <strong>${esc(inviteAs(v))}</strong>, by ${esc(v.by)}${v.agency ? ' · ' + esc(v.agency) : ''}</div>`}
    ${v.email && me && v.email !== me ? `<div class="inv-bad">This invitation is for ${esc(v.email)}; you are signed in as ${esc(me)}. Sign out and sign in with that address.</div>` : ''}
    ${v.state === 'expired' ? '<div class="inv-bad">It has expired; ask them to send it again.</div>' : v.state === 'withdrawn' ? '<div class="inv-bad">It was withdrawn.</div>' : ''}
    ${can && fresh ? `<form data-form="invite-password"><label style="flex:1;min-width:200px">Choose a password for next time <input name="password" type="password" minlength="8" autocomplete="new-password" placeholder="8 or more characters"></label><button class="btn sm" type="submit">Save the password</button></form>` : ''}
    <div class="row-btns">${can && (!me || v.email === me) ? `<button class="btn pri sm" data-action="invite-accept">${v.role === 'ops' ? 'Join as Operations' : 'Check in'} · ${esc(v.incident)}</button>` : ''}<button class="btn sm" data-action="invite-dismiss">Not now</button></div></div>`;
}
async function acceptInvite() {
  const v = state.invite; if (!v) return;
  try {
    const inc = await data.join(null, v.role, v.unit || null, null, null, null, null, null, v.token);
    clearPendingInvite();
    toast('You are in ' + inc.name + (v.role === 'ops' ? ' as Operations' : ''));
    await openIncident(inc.id);
  } catch (e) { toast(e.message || String(e), true); }
}
async function showPicker() {
  show('pick');
  $('#pick-user').textContent = data.user ? data.user.email : '';
  drawPickInvite();
  const list = $('#pick-list');
  list.innerHTML = '<p class="muted">Loading…</p>';
  try { await data.clearPersonalDue(); } catch (e) { console.warn('personal records due', e); }   // whatever is due clears on open too, not only nightly
  try {
    const rows = await data.myIncidents();
    list.innerHTML = rows.length ? rows.map((r) => `
      <button class="pick-row" data-action="open-incident" data-id="${r.id}">
        <span><span class="name">${esc(r.name)}</span><br><span class="sub">${esc(r.period || '')}${r.base_name ? ' · ' + esc(r.base_name) : ''} · you are ${r.role === 'ops' ? 'Operations' : esc(r.unit_name || 'a unit')}</span></span>
        <span class="spacer"></span>
        <span class="pill mono">${esc(r.code)}</span>
        <span class="badge ${r.status === 'active' ? 'active' : ''}">${esc(r.status)}</span>
      </button>${clearLineHtml(r)}`).join('') : '<p class="muted">None yet. Open one below, or join with a code.</p>';
  } catch (err) { list.innerHTML = `<p class="msg">${esc(err.message || err)}</p>`; }
}
// A closed incident's personal records (licences, dates of birth, addresses, licence photos, the
// names of people sheltered) clear by rule 30 days after the close; the card shows the date, with
// Clear now and Keep 30 more days for Operations, then "cleared … by rule".
// A small sheet of the app's own in place of the browser's prompt() (v44): resolves with the words, or null on Cancel.
// The app's own question (v62), in place of the browser's confirm(): a title, what it does in the app's words, and
// two buttons. True on the first button; false on Cancel, Escape or the dialog closing any other way.
function askConfirm({ title, text, ok = 'OK', cancel = 'Cancel', danger = false }) {
  const dlg = $('#confirm-dialog'), okb = $('#confirm-ok'), cb = $('#confirm-cancel');
  $('#confirm-title').textContent = title; $('#confirm-text').innerHTML = text;
  okb.textContent = ok; okb.classList.toggle('danger', danger); okb.classList.toggle('pri', !danger); cb.textContent = cancel;
  return new Promise((resolve) => {
    const done = (v) => { dlg.removeEventListener('close', onClose); if (dlg.open) dlg.close(); resolve(v); };
    const onClose = () => done(false);
    dlg.addEventListener('close', onClose);
    okb.onclick = () => done(true); cb.onclick = () => done(false);
    dlg.showModal(); okb.focus();
  });
}
function askName(title, value) {
  const dlg = $('#name-dialog'), form = $('#name-form'), input = $('#name-input');
  $('#name-title').textContent = title; input.value = value || '';
  return new Promise((resolve) => {
    const done = (v) => { dlg.removeEventListener('close', onClose); form.removeEventListener('submit', onSubmit); if (dlg.open) dlg.close(); resolve(v); };
    const onSubmit = (e) => { e.preventDefault(); done(input.value.trim() || null); };
    const onClose = () => done(null);
    form.addEventListener('submit', onSubmit); dlg.addEventListener('close', onClose);
    dlg.querySelector('[data-action="name-cancel"]').onclick = () => done(null);
    dlg.showModal(); input.focus(); input.select();
  });
}
function clearLineHtml(r) {
  if (r.status !== 'closed') return '';
  if (r.personal_cleared_at) return `<div class="pick-sub" data-clear="${r.id}">Personal records cleared ${esc(dateText(r.personal_cleared_at))} by rule · the names, the log and the forms stay</div>`;
  const when = r.clear_personal_at ? new Date(r.clear_personal_at) : null;
  return `<div class="pick-sub warn" data-clear="${r.id}"><span>Personal records clear by rule ${when ? 'on ' + esc(dateText(when)) : 'after the close'}: licences, dates of birth, addresses, licence photos and the names of people sheltered</span>${r.role === 'ops' ? `<button class="btn sm" data-action="reopen-pick" data-id="${r.id}" title="Reopen the incident: phones can check in again and the clearing clock stops">Reopen</button><button class="btn sm" data-action="clear-personal" data-id="${r.id}">Clear now</button><button class="btn sm" data-action="keep-personal" data-id="${r.id}">Keep 30 more days</button>` : ''}</div>`;
}

$('#new-incident').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, msg = f.querySelector('[data-msg]');
  msg.textContent = 'Creating…';
  try {
    const lat = f.lat.value ? Number(f.lat.value) : null, lng = f.lng.value ? Number(f.lng.value) : null;
    const inc = await data.createIncident({ name: f.name.value, period: f.period.value, base: f.base.value, lat, lng, zoom: 14 });
    f.reset(); msg.textContent = '';
    await openIncident(inc.id);
  } catch (err) { msg.textContent = err.message || String(err); }
});

$('#join-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, msg = f.querySelector('[data-msg]');
  msg.textContent = 'Joining…';
  try {
    const inc = await data.join(f.code.value, 'ops', 'Operations', null);
    f.reset(); msg.textContent = '';
    await openIncident(inc.id);
  } catch (err) { msg.textContent = err.message || String(err); }
});

// ---- the open incident
async function openIncident(id) {
  if (state.replay) closeReplay();
  const inc = await data.open(id);
  setGoogleKey(data.settings().maps_key);   // the Google layers come from the incident's settings (v28)
  localStorage.setItem(LAST_INCIDENT, id);
  state.selected = null; state.newZone = null; state.pendingPolygon = null;
  state.liveSeen = false; state.liveSince = null;   // v59: this open has not been live yet
  state.codesOpen = false; state.liveOpen = false; state.opsShown = false; setGearOpen(false); hideZoneHover();   // v60: the cards close with the incident
  show('app');
  if (LOG_ONLY) document.title = 'Activity log · ' + inc.name;
  if (!map && !LOG_ONLY) {
    map = new BaseMap($('#map'), {
      onZone: (zid) => select({ type: 'zone', id: zid }),
      onZoneMenu: (zid) => openZoneModal(zid),
      onPhoto: (pid) => select({ type: 'photo', id: pid }),
      onUnit: (uid) => select({ type: 'unit', id: uid }),
      onStructure: (sid) => select({ type: 'structure', id: sid }),
      onPlace: (lat, lng) => placeStructure(lat, lng),
      onFacility: (fid) => select({ type: 'facility', id: fid }),
      onPlaceFacility: (lat, lng) => placeFacility(lat, lng),
      onHazard: (hid) => { const h = data.hazards(true).find((x) => x.id === hid); if (h && h.zone_id) select({ type: 'zone', id: h.zone_id }); },
      overlayUrl: (path) => data.overlayUrl(path),
      onError: (err) => toast(err.message || String(err), true),
      onBlank: () => { if (state.selected && state.selected.type !== 'newzone') select(null); },
      onDraftChange: (n) => { setHint(n === 0 ? 'Click the map to place the first corner.' : n < 3 ? `${n} of at least 3 points. Click the next corner; Backspace takes one off.` : `${n} points. Click to add more, Backspace takes one off, Finish saves it.`); }
    });
  }
  markLogSeen();
  if (map) {
    map.trails = new Map();
    if (inc.boundary) map.fitPolygon(inc.boundary);
    else if (inc.center_lat != null && inc.center_lng != null) map.setView(inc.center_lat, inc.center_lng, inc.zoom || 14);
    else { const z = data.zones()[0]; if (z) map.fitPolygon(z.polygon); else map.setView(DEFAULT_VIEW[0], DEFAULT_VIEW[1], DEFAULT_VIEW[2]); }
    map.invalidate();
  }
  drawAll();
  if (!LOG_ONLY && !DEMO && !aroundSeen()) showAround();   // the first open of the base on this device: a label over each part of the screen (v58)
}
// Show me around (v58): the labels over the screen, from the first open or from Settings; the toast says where they come back from
function showAround() { startAround({ onDone: (why) => toast(why === 'emergency' ? 'An emergency is open: the labels are put away. Show me around is in Settings.' : 'That is the base. Show me around is in Settings whenever you want it back.') }); }

function select(sel) {
  if (sel && sel.type === 'people') { openPeople(); return; }   // the board is a page of its own, not a panel
  state.selected = sel;
  queueDraw();
  if (sel && sel.type === 'photo') loadPhoto(sel.id);
}

// Operations places a structure it knows about, not searched yet, into the zone under the click.
async function placeStructure(lat, lng) {
  const zone = (state.placeZone && data.zone(state.placeZone)) || zoneAtPoint(lat, lng);
  // number on from what is on record, counting the ones placed a moment ago that have not landed yet
  const n = Math.max(data.structures(zone ? zone.id : null).length, state.placeN || 0) + 1;
  state.placeN = n;
  try {
    await data.addStructure(crypto.randomUUID(), { zone_id: zone ? zone.id : null, lat, lng, status: 'not_searched', label: '#' + n });
    toast((zone ? zone.code + ': ' : '') + 'structure #' + n + ' placed');
  } catch (err) { toast(err.message || String(err), true); }
}
function zoneAtPoint(lat, lng) { return zoneAtRule(data.zones(), lat, lng); }

// One click places the facility of the kind chosen, then opens it to name it.
async function placeFacility(lat, lng) {
  const kind = state.placeKind || 'staging';
  stopDraw();
  try {
    const f = await data.addFacility({ kind, lat, lng });
    select({ type: 'facility', id: f.id });
    toast('Placed. Give it a name and a contact.');
  } catch (err) { toast(err.message || String(err), true); }
}

// Redraw once per frame while frames are coming. A background tab or a hidden pane gets no frames
// (and may not even say it is hidden) and throttles its timers, so when no frame has come lately
// the draw runs at once, and the page is current the moment it is looked at.
let lastFrameAt = 0;
(function tickFrames() { requestAnimationFrame(() => { lastFrameAt = Date.now(); tickFrames(); }); })();
function queueDraw() {
  if (drawQueued) return;
  if (Date.now() - lastFrameAt > 1500) { drawAll(); return; }
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; drawAll(); });
  setTimeout(() => { if (drawQueued) { drawQueued = false; drawAll(); } }, 1600);   // a frame that never comes (the pane hidden a moment after the draw was queued) no longer holds every later draw
}

// The base's sound (v46): a short chime when an emergency or an act-on-now hazard arrives, never for what
// was already there when the page opened. Web Audio, no file; the browser lets it sound after the first click.
let audioCtx = null;
// the browser lets a page ring only after a click or a key: the first one arms the sound, and until then the bar's quiet
// line says so (v48)
function armAudio(e) {
  if (e && !e.isTrusted) return;   // only a real click or key unlocks the browser's audio; a script's event does not
  document.removeEventListener('pointerdown', armAudio, true); document.removeEventListener('keydown', armAudio, true);
  try { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {}); state.armed = true; } catch (e2) { state.armed = true; }
  queueDraw();
}
document.addEventListener('pointerdown', armAudio, true);
document.addEventListener('keydown', armAudio, true);
function chime(kind) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    const tones = kind === 'emergency' ? [880, 660, 880] : [660];
    tones.forEach((hz, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = hz; o.connect(g); g.connect(audioCtx.destination);
      const t = audioCtx.currentTime + i * 0.22;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.start(t); o.stop(t + 0.22);
    });
  } catch (e) { /* no sound here */ }
}
function ringForNew() {
  if (!data.incident) return;
  const open = data.alerts().filter((a) => !a.acknowledged_at).map((a) => 'a:' + a.id).concat(data.urgentHazards().map((h) => 'h:' + h.id));
  if (!state.rang) { state.rang = new Set(open); return; }
  let emergency = false, hazard = false;
  for (const id of open) if (!state.rang.has(id)) { state.rang.add(id); if (id[0] === 'a') emergency = true; else hazard = true; }
  if (emergency) chime('emergency'); else if (hazard) chime('hazard');
}
function drawAll() {
  if (!data.incident || $('#app').hidden) return;
  const inc = data.incident;
  $('#inc-name').textContent = inc.name;
  const cur = data.currentPeriod();
  $('#inc-sub').textContent = [cur ? periodLabel(cur) + (cur.ic_name ? ', IC ' + cur.ic_name : '') : inc.period, inc.base_name ? 'Base: ' + inc.base_name : null, `${data.activeUnits().length} units`, `${data.zones().length} divisions, ${data.zones().filter((z) => z.status === 'cleared').length} cleared`, data.hazards().length ? `${data.hazards().length} hazard${data.hazards().length === 1 ? '' : 's'} open` : null].filter(Boolean).join(' · ');
  $('#inc-code').textContent = inc.code;   // v59: the code alone; the words are in its title, and the home panel has it large
  drawLog();
  drawLegend();
  drawLayers();
  drawFind();
  if (!$('#briefing').hidden) drawBriefing();
  if (!$('#people').hidden) drawPeople();
  if (!$('#public').hidden) drawPublic();
  if (!$('#transports').hidden) drawTransports();
  drawLive();
  if (LOG_ONLY) return;   // the pop-out is the log alone: no map, sidebar or bars to draw
  drawHeadCount(); drawTools(); drawCodes(); drawLivePop(); refreshZoneHover();   // v60
  map.render(data, state);
  drawSide();
  drawZoneModal();
  const md = $('#mayday');
  const mh = maydayHtml(data);
  md.hidden = !mh;
  if (md.__html !== mh) { md.__html = mh; md.innerHTML = mh; }
  md.classList.toggle('ack', !!mh && data.alerts().every((a) => a.acknowledged_at));
  if (mh && aroundOn()) clearAround('emergency');   // v58: an emergency puts the labels away at once
  ringForNew();   // v46: a chime for an emergency or an act-on-now hazard that just arrived
  const sf = $('#safety');
  const sh = safetyHtml(data);
  sf.hidden = !sh;
  if (sf.__html !== sh) { sf.__html = sh; sf.innerHTML = sh; }
  $('#bars-quiet').hidden = !!(mh || sh);
  $('#bars-quiet').textContent = 'No emergency open · no safety message or PAR waiting on an answer' + (state.armed ? '' : ' · click anywhere once so the base can ring');   // v48
  $('#bars').title = state.armed ? '' : 'Click anywhere once so the base can ring for an emergency or an urgent hazard';
  layoutAround();   // v58: the labels follow the parts they sit on
}

// The sidebar: the divisions and the panel, redrawn on every live update, but only where the words
// changed. What the operator was looking at stays put: the heading or row at the top of the view is
// found again after the redraw and kept at the same height, so a message arriving above the Public
// information section no longer pushes it away. When the selection changes, the new panel's top comes
// into view (the new-division form after Finish appeared above where the sidebar was scrolled).
let sideSel = 'home';
const ANCHORS = '#panel .title, #panel .k, #panel [data-id]';
function anchorKey(el) { return el.dataset.id ? 'id:' + (el.dataset.action || el.dataset.form || el.tagName) + ':' + el.dataset.id : 'tx:' + el.className + ':' + el.textContent.trim().slice(0, 80); }
function sideAnchor(side) {
  const top = side.getBoundingClientRect().top;
  let fallback = null;
  for (const el of side.querySelectorAll(ANCHORS)) {
    const r = el.getBoundingClientRect();
    if (!r.height || r.bottom <= top) continue;
    if (r.top >= top - 1) return { key: anchorKey(el), off: r.top - top };
    fallback = fallback || { key: anchorKey(el), off: r.top - top };
  }
  return fallback;
}
function drawSide() {
  const side = $('.side'), zones = $('#zones'), panel = $('#panel');
  const zh = zonesHtml(data, state);
  if (zones.__html !== zh) { zones.__html = zh; zones.innerHTML = zh; }
  const key = state.selected ? state.selected.type + ':' + (state.selected.id || '') : 'home';
  // a field being typed in holds the panel still, unless the selection itself changed: the field then
  // belongs to the panel being left (a word left in the composer kept the new-division form from showing)
  const focused = document.activeElement && panel.contains(document.activeElement) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
  if (!focused || key !== sideSel) {
    const html = panelHtml(data, state);
    if (panel.__html !== html) {
      const anchor = key === sideSel && side.scrollTop > 0 ? sideAnchor(side) : null;
      // words typed in a box that has lost focus come through the redraw, as long as the data did not change the box
      const typed = key === sideSel ? [...panel.querySelectorAll('form[data-form] input[name], form[data-form] textarea[name]')]
        .filter((el) => !['checkbox', 'radio', 'file', 'submit', 'button', 'hidden'].includes(el.type) && el.value !== el.defaultValue && !(el.form && el.form.dataset.submitted))
        .map((el) => ({ form: el.form.dataset.form, id: el.form.dataset.id || '', name: el.name, value: el.value, was: el.defaultValue })) : [];
      panel.__html = html; panel.innerHTML = html;
      for (const t of typed) {
        const f = [...panel.querySelectorAll(`form[data-form="${t.form}"]`)].find((x) => (x.dataset.id || '') === t.id);
        const el = f && f.elements[t.name];
        if (el && el.defaultValue === t.was) el.value = t.value;
      }
      if (state.selected && state.selected.type === 'photo') loadPhoto(state.selected.id);
      loadIdPhoto();
      if (anchor) {
        const el = [...side.querySelectorAll(ANCHORS)].find((x) => anchorKey(x) === anchor.key);
        if (el) side.scrollTop += el.getBoundingClientRect().top - side.getBoundingClientRect().top - anchor.off;
      }
    }
    fillOverlayBounds(false);
  }
  if (key !== sideSel) {
    sideSel = key;
    const top = panel.getBoundingClientRect().top - side.getBoundingClientRect().top + side.scrollTop;
    if (side.scrollTop > top) side.scrollTop = top;
  }
}

// The legend's status entries: pressed, the divisions in that status stand out and the rest fade.
const LEGEND_WORDS = { open: 'not started', active: 'in progress', primary: 'with the primary search done', cleared: 'cleared' };
function drawLegend() {
  const counts = {};
  for (const z of data.zones()) counts[z.status] = (counts[z.status] || 0) + 1;
  for (const b of document.querySelectorAll('[data-action="legend-status"]')) {
    const st = b.dataset.status;
    b.classList.toggle('on', state.highlight === st);
    b.setAttribute('aria-pressed', String(state.highlight === st));
    const n = b.querySelector('[data-legend-count]');
    if (n) n.textContent = counts[st] ? String(counts[st]) : '';
  }
  const hint = $('#legend-hint');
  if (hint) {
    const n = state.highlight ? (counts[state.highlight] || 0) : 0;
    hint.hidden = !state.highlight;
    hint.innerHTML = state.highlight ? `${n} division${n === 1 ? '' : 's'} ${esc(LEGEND_WORDS[state.highlight])} <button class="btn sm" data-action="legend-clear">Show all</button>` : '';
  }
}
function setHighlight(status) { state.highlight = status || null; queueDraw(); }

// Right-click (or a long press) on a division: a card with its rank, priority and the facts.
function openZoneModal(id) {
  if (!data.zone(id)) return;
  state.modalZone = id;
  drawZoneModal();
  const dlg = $('#zone-dialog');
  if (!dlg.open) dlg.showModal();
}
function closeZoneModal() { const dlg = $('#zone-dialog'); if (dlg.open) dlg.close(); state.modalZone = null; }
function drawZoneModal() {
  const z = state.modalZone ? data.zone(state.modalZone) : null;
  if (!z) { if ($('#zone-dialog').open) closeZoneModal(); return; }
  const html = zoneModalHtml(data, z);
  const body = $('#zone-dialog-body');
  if (body.__html !== html) { body.__html = html; body.innerHTML = html; }
}
$('#zone-dialog').addEventListener('close', () => { state.modalZone = null; });
$('#zone-dialog').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeZoneModal(); });   // the backdrop
document.addEventListener('contextmenu', (e) => {
  const row = e.target.closest('#zones .zr');
  if (!row) return;
  e.preventDefault();
  openZoneModal(row.dataset.id);
});

// The log under the map: folded to its latest line or open; new lines since the operator last
// looked are counted on the header and tinted until the pointer comes over the log.
function markLogSeen() { const n = data.events()[0]; state.log.seenAt = n ? n.at : null; }
// the "since you last looked" mark (v45): set by Seen, or on the first draw of an incident when there is none yet
function markSince() { const n = data.events()[0]; state.log.sinceAt = n ? n.at : new Date().toISOString(); saveLogPrefs(); }
function unseenCount() { return state.log.seenAt ? data.events().filter((e) => e.at > state.log.seenAt).length : 0; }
function drawLog() {
  const box = $('#logbox');
  box.classList.toggle('closed', !state.log.open);
  $('[data-action="log-toggle"]').setAttribute('aria-expanded', String(state.log.open));
  $('#log-filters').innerHTML = logFiltersHtml(data, state);
  if (!state.log.sinceAt && data.events().length) markSince();
  const sinceEl = $('#log-since'); if (sinceEl) { const sh = state.log.open ? logSinceHtml(data, state) : ''; if (sinceEl.__html !== sh) { sinceEl.__html = sh; sinceEl.innerHTML = sh; } }
  const unseen = unseenCount();
  const badge = $('#log-new');
  badge.hidden = !unseen;
  badge.textContent = unseen + ' new';
  const latest = data.events()[0];
  $('#log-latest').textContent = !state.log.open && latest ? hhmm(latest.at) + '  ' + latest.text : '';
  if (state.log.open) $('#log').innerHTML = logHtml(data, state);
}
$('#log-search').addEventListener('input', (e) => { state.log.q = e.target.value; drawLog(); });
$('#logbox').addEventListener('pointerenter', () => { if (state.log.open && unseenCount()) { markLogSeen(); drawLog(); } });
// The pop-out: the same page at #log in its own window, named so a second press brings it back
// rather than opening another. A line's link there opens the thing on the main screen through
// a channel between the windows (a message carries the incident, so another incident's log is ignored).
const bus = 'BroadcastChannel' in window ? new BroadcastChannel('ic-base') : null;
function popOutLog() {
  const w = window.open(location.pathname + location.search + '#log', 'ic-log', 'popup=yes,width=980,height=640');
  if (!w) toast('The browser blocked the window. Allow pop-ups for this site and try again', true);
}
function selectFromLog(sel) {
  if (!LOG_ONLY) { select(sel); return; }
  if (bus && data.incident) bus.postMessage({ incident: data.incident.id, select: sel });
  else toast('Open it on the main screen', true);
}
if (bus && !LOG_ONLY) bus.onmessage = (e) => {
  const m = e.data || {};
  if (m.select && data.incident && m.incident === data.incident.id && !$('#app').hidden) select(m.select);
};

// One overlay draws the briefing, a division's 204, the situation report, the IAP or the 214.
function drawBriefing() {
  if (!data.incident) return;
  const z = state.printZone ? data.zone(state.printZone) : null;
  const kind = z ? '204' : (state.print || 'briefing');
  const pf = kind === 'shelter' && state.printFacility ? data.facility(state.printFacility) : null;
  if (kind === 'shelter' && !pf) return;
  const html = kind === 'shelter' ? placeListHtml(data, pf) : kind === '204' ? form204Html(data, z) : kind === '214' ? form214Html(data) : kind === '211' ? form211Html(data) : kind === 'join' ? joinCardHtml(data) : kind === 'bands' ? bandsSheetHtml(data, state.printTags) : kind === 'hours' ? hoursHtml(data, state) : kind === 'sitrep' ? sitrepFormHtml(data) + sitrepHtml(data) : kind === 'iap' ? iapHtml(data) : kind === 'org' ? orgHtml(data) : briefingHtml(data);
  const page = $('#briefing-page');
  const focused = document.activeElement && page.contains(document.activeElement) && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
  if (page.__html !== html && !focused) { page.__html = html; page.innerHTML = html; }
  page.className = 'briefing-page kind-' + kind;
  $('#briefing-title').textContent = kind === 'shelter' ? 'People at ' + (pf.name || 'the facility') : kind === '204' ? 'Division ' + z.code + ' assignment (ICS 204)' : kind === '214' ? 'Activity log (ICS 214)' : kind === '211' ? 'Check-in list (ICS 211)' : kind === 'join' ? 'Join card · deployment briefing' : kind === 'bands' ? 'Bands to print' : kind === 'hours' ? 'Hours on scene' : kind === 'sitrep' ? 'Situation report (ICS 209)' : kind === 'iap' ? 'Incident Action Plan' : kind === 'org' ? 'Organization chart (ICS 207)' : 'Shift-change briefing';
  $('#briefing-when').textContent = data.incident.name + ' · ' + (data.currentPeriod() ? periodLabel(data.currentPeriod()) : '') + ' · ' + hhmm(new Date());
  // Send by email (v43): the mail app with the text in the body; the app sends nothing itself
  const mail = $('#briefing-mail');
  if (mail) { const subject = data.incident.name + ' · ' + $('#briefing-title').textContent + (data.currentPeriod() ? ' · ' + periodLabel(data.currentPeriod()) : '') + ' · ' + whenText(new Date()); mail.href = 'mailto:' + (data.settings().eoc_email || '') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(briefingAsText()); }   // the EOC address from the settings, else the mail app's own book (v46)
}
function briefingAsText() {
  const z = state.printZone ? data.zone(state.printZone) : null;
  const kind = z ? '204' : (state.print || 'briefing');
  if (kind === 'shelter') { const f = data.facility(state.printFacility); return f ? placeListText(data, f) : ''; }
  return kind === '204' ? form204Text(data, z) : kind === '214' ? form214Text(data) : kind === '211' ? form211Text(data) : kind === 'join' ? joinCardText(data) : kind === 'bands' ? bandsSheetText(data, state.printTags) : kind === 'hours' ? hoursCsvText(data, state) : kind === 'sitrep' ? sitrepText(data) : kind === 'iap' ? iapText(data) : kind === 'org' ? orgText(data) : briefingText(data);
}
// The maps' tiles are plain <image>s; give them a moment to arrive before the print dialog
// takes a picture of the page.
function mapsReady(root, ms = 3000) {
  const urls = [...new Set([...root.querySelectorAll('svg.pmap image')].map((i) => i.getAttribute('href')))];
  if (!urls.length) return Promise.resolve();
  const one = (src) => new Promise((done) => { const im = new Image(); im.onload = im.onerror = () => done(); im.src = src; });
  return Promise.race([Promise.all(urls.map(one)), new Promise((done) => setTimeout(done, ms))]);
}
function openOverlay(kind, zoneId) { state.print = kind; state.printZone = zoneId || null; $('#briefing').hidden = false; drawBriefing(); }

// ---- transfer of command: a different name in the Incident Commander seat asks whether command is
// being handed over (ICS-100: a full briefing and notification to all personnel) or just mistyped.
// The pending save waits in state.transfer until the answer.
function askTransfer(t) {
  state.transfer = Object.assign({ preview: transferText(t.to, t.ops, hhmm(new Date())) }, t);
  $('#transfer-dialog-body').innerHTML = transferDialogHtml(data, state.transfer);
  const dlg = $('#transfer-dialog');
  if (!dlg.open) dlg.showModal();
}
function closeTransfer() { const dlg = $('#transfer-dialog'); if (dlg.open) dlg.close(); state.transfer = null; }
// the plain save the form asked for: an edit of the period, or the start of the next one
async function savePending(t) {
  if (t.mode === 'start') { const p = await data.startPeriod(t.payload); state.periodNext = false; toast('Operational period ' + p.number + ' started'); }
  else { await data.updatePeriod(t.periodId, t.patch); toast('Period saved'); }
  queueDraw();
}
async function doTransfer() {
  const t = state.transfer;
  if (!t) return;
  const body = $('#transfer-dialog-body');
  const notify = body.querySelector('input[name="notify"]').checked, briefing = body.querySelector('input[name="briefing"]').checked, period = body.querySelector('input[name="period"]').checked;
  closeTransfer();
  const c = await data.transferCommand(t.to, { notify, at: hhmm(new Date()), ops: t.ops });
  if (t.mode === 'start') await savePending(t);
  else {
    const patch = Object.assign({}, t.patch, { ic_name: c.ic_name, ops_chief: c.ops_chief });
    await data.updatePeriod(t.periodId, patch);
    if (period) { const cur = data.currentPeriod(); const p = await data.startPeriod({ endsAt: new Date(Date.now() + 12 * 3600000).toISOString(), ic: c.ic_name, ops: cur.ops_chief, safety: cur.safety_officer, notes: cur.notes, carry: true, planning: cur.planning_chief, logistics: cur.logistics_chief, finance: cur.finance_chief, unified: cur.unified, pio: cur.pio, liaison: cur.liaison, rotation: cur.rotation_minutes, deputy: cur.deputy, bring: cur.bring, scene: cur.scene_hours }); toast('Operational period ' + p.number + ' started'); }
  }
  toast('Command transferred to ' + c.ic_name + (notify ? ' · every unit is told' : ''));
  queueDraw();
  if (briefing) openOverlay('briefing');
}
$('#transfer-dialog').addEventListener('close', () => { state.transfer = null; });
$('#settings-dialog').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });   // the backdrop
$('#transfer-dialog').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeTransfer(); });

// ---- the People board: everyone on scene by unit, in a page of its own. The find box and the chips
// live in state.people; the page is redrawn on every change unless a field in it has focus.
function openPublic() { $('#public').hidden = false; drawPublic(); }   // the PIO's page (v52)
function closePublic() { $('#public').hidden = true; }
function drawPublic() {
  if (!data.incident || $('#public').hidden) return;
  $('#public-sub').textContent = data.incident.name + ' · ' + hhmm(new Date());
  const page = $('#public-page'), html = publicPageHtml(data);
  if (page.__html !== html) { page.__html = html; page.innerHTML = html; }
}
// the transport board (v54): a page of its own, redrawn on every change unless a field in it has focus
function openTransports() { $('#transports').hidden = false; drawTransports(); }
function closeTransports() { $('#transports').hidden = true; state.tr.add = false; state.tr.edit = null; }
function drawTransports() {
  if (!data.incident || $('#transports').hidden) return;
  $('#transports-sub').textContent = data.incident.name + ' · ' + hhmm(new Date());
  const page = $('#transports-page'), html = transportsPageHtml(data, state);
  const focused = document.activeElement && page.contains(document.activeElement) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
  if (page.__html !== html && !focused) { page.__html = html; page.innerHTML = html; }
}
function focusTrForm() { setTimeout(() => { const f = $('#transports-page form.tr-form'); if (f) f.label.focus(); }, 30); }
function openPeople() { $('#people').hidden = false; drawPeople(); loadRoster(); }
function loadRoster() {   // the addresses invited on earlier incidents, for the Members tab (v56)
  if (state.people.tab !== 'members' || !data.me() || data.me().role !== 'ops') return;
  data.roster().then((r) => { state.roster = r; drawPeople(); }).catch(() => {});
}
function closePeople() { $('#people').hidden = true; state.people.add = false; }
function drawPeople() {
  if (!data.incident || $('#people').hidden) return;
  const chips = peopleChipsHtml(data, state);
  const bar = $('#people-quals');
  if (bar.__html !== chips) { bar.__html = chips; bar.innerHTML = chips; }
  $('#people-sub').textContent = data.incident.name + ' · ' + hhmm(new Date());
  if ($('#people-q').value !== state.people.q) $('#people-q').value = state.people.q;
  const page = $('#people-page');
  const html = peopleBoardHtml(data, state);
  const focused = document.activeElement && page.contains(document.activeElement) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
  if (page.__html !== html && !focused) { page.__html = html; page.innerHTML = html; }
}
$('#people-q').addEventListener('input', (e) => { state.people.q = e.target.value; drawPeople(); });

// ---- find a person (v26): where anyone sheltered, moved or on the way is now and since when, from the
// header on any screen (and the home panel's box). The popover redraws with live updates while open.
function drawFind() {
  const pop = $('#find-pop'), q = state.find.top.trim();
  pop.hidden = !q;
  if (!q || !data.incident) return;
  const html = `<div class="find-head"><span class="k">Find a person · every shelter, hospital and crew record</span><button class="btn sm" data-action="find-close">Close</button></div>` + findPersonHtml(data, q);
  if (pop.__html !== html) { pop.__html = html; pop.innerHTML = html; }
}
function closeFind() { state.find.top = ''; $('#find-q').value = ''; drawFind(); }
$('#find-q').addEventListener('input', (e) => { state.find.top = e.target.value; drawFind(); });
$('#find-q').addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeFind(); e.target.blur(); } });
document.addEventListener('input', (e) => {
  const box = e.target.closest('[data-find="home"]');
  if (!box) return;
  state.find.home = box.value;
  const out = box.parentElement.querySelector('[data-find-results="home"]');
  if (out) out.innerHTML = box.value.trim() ? findPersonHtml(data, box.value) : '';
});

// ---- replay: the day played back from the position history (ic_tracks), on a slider under the map.
// The samples are fetched once per range; the slider and Play only move the moment shown. Every range
// starts at the incident's first position (v63; replayWindow in rules.js), read once per open of the
// bar, so the slider never covers a moment with nothing to show; Pick a time… is bounded the same way.
const REPLAY_TICK_MS = 100;
const REPLAY_MAX_SAMPLES = 2000;   // per unit, so a whole day comes back in one read
let replayTimer = null;

function replayWindow(kind) {   // the range's two ends in ms, cut to the first position; null when there is nothing in it
  const inc = data.incident, p = data.currentPeriod();
  return replayWindowRule(kind, { now: Date.now(), opened: new Date(inc.created_at).getTime(), periodStart: p ? new Date(p.starts_at).getTime() : null, periodEnd: p && p.closed_at ? new Date(p.closed_at).getTime() : null, first: state.replay ? state.replay.first : null });
}
// the range menu's words: where each range's positions begin; Pick a time… only once there is a position
function drawReplayRanges() {
  const r = state.replay;
  if (!r) return;
  const now = Date.now();
  for (const o of $('#replay-range').options) {
    if (o.value === 'pick') o.disabled = r.first == null;
    else o.textContent = replayWindowLabel(o.value, replayWindow(o.value), now);
  }
}
async function openReplay(kind, jumpTo = null) {
  stopReplayPlay();
  kind = kind || $('#replay-range').value;
  if (kind === 'pick') kind = state.replay ? state.replay.kind : 'period';
  const r = { kind, from: 0, to: 0, t: 0, by: new Map(), playing: false, every: 60, loading: true, empty: false, first: state.replay ? state.replay.first : undefined };
  state.replay = r;
  $('#replay').hidden = false;
  $('#btn-replay').classList.add('on');
  closeReplayPick(false);
  $('#replay-log').textContent = 'Loading the positions…';
  try {
    if (r.first === undefined) {   // the incident's first position, read once while the bar is open
      const at = await data.replayFirst();
      if (state.replay !== r) return;
      r.first = at ? new Date(at).getTime() : null;
    }
    drawReplayRanges();
    const win = replayWindow(kind);
    if (!win) { r.loading = false; r.empty = true; map.setReplay(new Map()); drawReplay(); return; }
    [r.from, r.to] = win;
    r.every = Math.max(10, Math.ceil((r.to - r.from) / 1000 / REPLAY_MAX_SAMPLES));
    const samples = await data.replay(new Date(r.from).toISOString(), new Date(r.to).toISOString(), r.every);
    if (state.replay !== r) return;   // closed or reopened on another range meanwhile
    r.by = replayIndex(samples);
    r.loading = false;
    // start where the first report of the range was made, so there is something to see at once; a picked moment lands there
    const first = Math.min(...[...r.by.values()].map((l) => new Date(l[0].at).getTime()));
    r.t = jumpTo != null ? Math.min(r.to, Math.max(r.from, jumpTo)) : Number.isFinite(first) ? Math.min(r.to, Math.max(r.from, first)) : r.from;
    map.setReplay(r.by);
    drawReplay();
  } catch (err) { toast(err.message || String(err), true); closeReplay(); }
}
function drawReplay() {
  const r = state.replay;
  if (!r) return;
  $('#replay-slider').disabled = r.empty;
  $('#replay-play').disabled = r.empty;
  if ($('#replay-pick').hidden) $('#replay-range').value = r.kind;
  if (r.empty) {   // no phone has reported yet: nothing to slide through
    $('#replay-slider').value = '0';
    $('#replay-time').textContent = '--:--';
    $('#replay-play').textContent = 'Play';
    $('#replay-log').textContent = 'Nothing to replay yet: the first phone to check in starts the record.';
    map.renderReplay(data, state);
    return;
  }
  const span = Math.max(1, r.to - r.from);
  $('#replay-slider').value = String(Math.round((r.t - r.from) / span * 1000));
  $('#replay-time').textContent = hhmm(new Date(r.t));
  $('#replay-play').textContent = r.playing ? 'Pause' : (r.t >= r.to ? 'Replay' : 'Play');
  const seen = [...r.by.values()].filter((l) => sampleAt(l, r.t)).length;
  const e = data.events().find((ev) => new Date(ev.at).getTime() <= r.t);   // newest first, so the first at or before the moment is the latest then
  $('#replay-log').textContent = (r.loading ? 'Loading the positions… ' : '') + `${seen} unit${seen === 1 ? '' : 's'} on the map` + (e ? ` · ${hhmm(e.at)} ${e.text}` : '');
  map.renderReplay(data, state);
}
function playReplay() {
  const r = state.replay;
  if (!r || r.loading || r.empty) return;
  if (r.t >= r.to) r.t = r.from;
  r.playing = true;
  let last = Date.now();
  replayTimer = setInterval(() => {
    const now = Date.now();
    r.t = Math.min(r.to, r.t + (now - last) * (Number($('#replay-speed').value) || 60));
    last = now;
    if (r.t >= r.to) stopReplayPlay();
    drawReplay();
  }, REPLAY_TICK_MS);
  drawReplay();
}
function stopReplayPlay() {
  if (replayTimer) clearInterval(replayTimer);
  replayTimer = null;
  if (state.replay) state.replay.playing = false;
}
function closeReplay() {
  stopReplayPlay();
  state.replay = null;
  if (map) map.setReplay(null);
  closeReplayPick(false);
  $('#replay').hidden = true;
  $('#btn-replay').classList.remove('on');
  queueDraw();
}
// Pick a time… (v63): a date and a time on their own row in the bar, bounded by the first position and now
// (replayPickCheck in rules.js says the bounds, or the reason a moment is refused, while Go is off)
function openReplayPick() {
  const r = state.replay;
  if (!r || r.first == null) { closeReplayPick(); return; }
  stopReplayPlay();
  const at = r.t || r.first;
  $('#replay-date').min = dayIso(r.first);
  $('#replay-date').max = dayIso(Date.now());
  $('#replay-date').value = dayIso(at);
  $('#replay-clock').value = hhmm(new Date(at));
  $('#replay-pick').hidden = false;
  checkReplayPick();
  $('#replay-clock').focus();
}
function closeReplayPick(restore = true) {
  $('#replay-pick').hidden = true;
  if (restore && state.replay) $('#replay-range').value = state.replay.kind;
}
function replayPicked() {   // the sheet's moment in ms, read as local time, or null
  const d = $('#replay-date').value, c = $('#replay-clock').value;
  if (!d || !c) return null;
  const t = new Date(d + 'T' + c).getTime();
  return Number.isFinite(t) ? t : null;
}
function checkReplayPick() {
  const r = state.replay;
  if (!r) return false;
  const { ok, words } = replayPickCheck(replayPicked(), r.first, Date.now());
  $('#replay-why').textContent = words;
  $('#replay-why').classList.toggle('bad', !ok);
  $('#replay-go').disabled = !ok;
  return ok;
}
function goReplayPick() {
  const r = state.replay;
  if (!r || !checkReplayPick()) return;
  const t = Math.max(replayPicked(), r.first);   // the first position's own minute lands on it
  closeReplayPick();
  if (t >= r.from && t <= r.to) { r.t = t; drawReplay(); }
  else openReplay('all', t);   // outside this range: the whole incident holds every moment the check allows
}
$('#replay-slider').addEventListener('input', (e) => {
  const r = state.replay;
  if (!r || r.empty) return;
  stopReplayPlay();
  r.t = r.from + (r.to - r.from) * Number(e.target.value) / 1000;
  drawReplay();
});
$('#replay-range').addEventListener('change', (e) => {
  if (!state.replay) return;
  if (e.target.value === 'pick') { openReplayPick(); return; }
  closeReplayPick(false);
  openReplay(e.target.value);
});
$('#replay-pick').addEventListener('submit', (e) => { e.preventDefault(); goReplayPick(); });
$('#replay-date').addEventListener('input', checkReplayPick);
$('#replay-clock').addEventListener('input', checkReplayPick);

// the theme button names the other mode; the system's choice redraws the map's inked lines
function drawTheme() { $('#btn-theme').textContent = currentTheme() === 'dark' ? 'Light' : 'Dark'; }
drawTheme();
if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!storedTheme()) { drawTheme(); queueDraw(); } });

// ---- the map underneath and the imagery over it
// The Layers panel: open under its button, closed by a click elsewhere or Escape
function drawLayers() {
  const pop = $('#layers-pop');
  $('#btn-layers').setAttribute('aria-expanded', String(state.layersOpen));
  $('#btn-layers').classList.toggle('on', state.layersOpen);
  pop.hidden = !state.layersOpen;
  if (!state.layersOpen || !data.incident) return;
  const focused = document.activeElement && pop.contains(document.activeElement) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && document.activeElement.type !== 'radio' && document.activeElement.type !== 'checkbox';
  if (focused) return;
  const html = layersPopHtml(data, state);
  if (pop.__html !== html) { pop.__html = html; pop.innerHTML = html; }
  fillOverlayBounds(false);
}
function setLayersOpen(open) { state.layersOpen = !!open; if (!open) state.layersUpload = false; drawLayers(); }
// the upload form's corners: the map's view, unless Operations has typed its own
function fillOverlayBounds(force) {
  if (!map) return;
  for (const f of document.querySelectorAll('form[data-form="overlay-add"]')) {
    if (!force && f.south.value !== '') continue;
    let b;
    try { b = map.viewBounds(); } catch (e) { return; }   // a map with no size yet (the pane still laying out) has no bounds
    for (const k of ['south', 'west', 'north', 'east']) f[k].value = b[k].toFixed(5);
  }
}
document.addEventListener('input', (e) => {
  const r = e.target.closest('[data-range="overlay-opacity"]');
  if (r && map) map.setOverlayOpacity(r.dataset.id, r.value);
});

function drawLive() {
  const ok = data.realtime === 'SUBSCRIBED';
  $('#live-dot').className = 'dot ' + (ok ? 'on' : (data.realtime === 'off' ? '' : 'bad'));
  // v59: until this open has been live once, "off" is still connecting, not a loss; the dot stays alone while live or
  // connecting, and the words show only when a connection that was there has gone
  if (ok) state.liveSeen = true;
  state.liveSince = ok ? (state.liveSince || new Date().toISOString()) : null;   // v60: the connection card's "since"
  const quiet = ok || !state.liveSeen;
  $('#live-text').textContent = ok ? 'live' : !state.liveSeen ? 'connecting' : (data.realtime === 'off' ? 'not connected' : String(data.realtime).toLowerCase().replace(/_/g, ' '));
  $('#live-pill').classList.toggle('quiet', quiet);
  $('#live-pill').title = ok ? 'Live: updates arrive as they happen' : quiet ? 'Connecting' : 'Not connected: the base shows what it last received and reconnects by itself (' + $('#live-text').textContent + ')';
}

async function loadPhoto(id) {
  const p = data.photo(id);
  const box = document.querySelector('[data-photo-box]');
  if (!p || !box) return;
  try {
    const url = await data.photoUrl(p.storage_path);
    const img = box.querySelector('img'), wait = box.querySelector('[data-photo-wait]'), link = document.querySelector('[data-photo-link]');
    if (!img) return;
    img.src = url; img.hidden = false;
    if (wait) wait.hidden = true;
    if (link) { link.href = url; link.hidden = false; }
  } catch (err) {
    const wait = box.querySelector('[data-photo-wait]');
    if (wait) wait.textContent = 'Could not load the photo: ' + (err.message || err);
  }
}

// The Public Information Officer's photos: every cleared one in a zip, named by its time and division,
// its caption written into the file and listed in captions.txt (js/base/photo-export.js).
async function downloadPublic(btn) {
  const photos = data.publicSet().slice().sort((a, b) => (a.taken_at < b.taken_at ? -1 : 1));
  const waiting = data.publicPhotos().filter((p) => !p.public_checked_at).sort((a, b) => (a.taken_at < b.taken_at ? -1 : 1));
  if (!photos.length) { toast(waiting.length ? 'No photo is checked yet: open a cleared photo, write its public caption and press Checked' : 'No photo is cleared for the public yet', true); return; }
  const inc = data.incident, now = new Date();
  btn.disabled = true;
  toast('Preparing ' + photos.length + ' photo' + (photos.length === 1 ? '' : 's') + '…');
  try {
    const files = [], lines = [], missed = [], names = new Set();
    for (const p of photos) {
      const zone = p.zone_id ? data.zone(p.zone_id) : null, m = data.member(p.user_id), takenAt = new Date(p.taken_at);
      const place = zone ? (zone.name ? zone.name + ' (division ' + zone.code + ')' : 'Division ' + zone.code) : inc.base_name || inc.name;   // the place to the street, never a house number or coordinates
      const words = p.public_caption || 'Flood response photo';
      const caption = photoCaption({ note: words, place, incident: inc.name, takenAt, credit: (m && m.agency) || unitLabelOf(m) });
      try {
        const res = await fetch(await data.photoUrl(p.storage_path));
        if (!res.ok) throw new Error('the server said ' + res.status);
        const raw = new Uint8Array(await res.arrayBuffer());
        const first = photoFileName({ takenAt, code: zone ? zone.code : '', note: zone ? zone.name || '' : inc.name, ext: imageType(raw) || 'jpg' });
        let name = first;
        for (let i = 2; names.has(name); i++) name = first.replace(/(\.\w+)$/, '_' + i + '$1');   // two in the same minute and place
        names.add(name);
        files.push({ name, bytes: withCaption(raw, { caption, title: words, credit: (m && m.agency) || '', takenAt }), date: takenAt });
        lines.push(name, whenText(takenAt) + ' · ' + place, words, '');
      } catch (err) { missed.push(hhmm(p.taken_at) + ' · ' + place + ': not saved, ' + (err.message || err)); }
    }
    const head = [inc.name + ' · the public set: photos cleared by Operations and checked (no face, no plate, no house number)', 'Saved ' + whenText(now) + ' · ' + files.length + ' photo' + (files.length === 1 ? '' : 's') + '. Each caption is also written into its file (the description a newsroom tool reads). No coordinates.', ''];
    const tail = [];
    if (waiting.length) tail.push('Cleared but not yet checked, so not in this set:', ...waiting.map((p) => hhmm(p.taken_at) + ' · ' + (p.zone_id && data.zone(p.zone_id) ? data.zone(p.zone_id).code : 'no division') + ' · ' + unitLabelOf(data.member(p.user_id))));
    if (missed.length) tail.push('Not saved:', ...missed);
    files.push({ name: 'captions.txt', bytes: new TextEncoder().encode(head.concat(lines, tail).join('\n')), date: now });
    const blob = new Blob([zip(files)], { type: 'application/zip' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${inc.code}-public-set-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${hhmm(now).replace(':', '')}.zip`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(missed.length ? `${files.length - 1} saved with captions; ${missed.length} could not be fetched (listed in captions.txt)` : `${files.length - 1} photo${files.length === 2 ? '' : 's'} saved with captions` + (waiting.length ? `; ${waiting.length} cleared but not checked, listed as missing` : ''), !!missed.length);
  } finally { btn.disabled = false; }
}

// the front of a licence in the unit panel, from a signed link
async function loadIdPhoto() {
  const box = document.querySelector('#panel [data-id-photo]');
  if (!box || box.__loaded) return;
  box.__loaded = true;
  try {
    const url = await data.idPhotoUrl(box.dataset.idPhoto);
    const img = box.querySelector('img'), wait = box.querySelector('[data-photo-wait]');
    if (img) { img.src = url; img.hidden = false; }
    if (wait) wait.hidden = true;
  } catch (err) { const wait = box.querySelector('[data-photo-wait]'); if (wait) wait.textContent = 'Could not load the licence: ' + (err.message || err); }
}

// ---- actions
document.addEventListener('click', async (e) => {
  if (state.layersOpen && !e.target.closest('#layers-pop') && !e.target.closest('#btn-layers')) setLayersOpen(false);
  if (state.gearOpen && !e.target.closest('.gear-wrap')) setGearOpen(false);   // v60: the menu and the cards close on a click outside
  if (state.codesOpen && !e.target.closest('#codes-pop') && !e.target.closest('#inc-code')) { state.codesOpen = false; drawCodes(); }
  if (state.liveOpen && !e.target.closest('#live-pop') && !e.target.closest('#live-pill')) { state.liveOpen = false; drawLivePop(); }
  if (state.find.top && !e.target.closest('.find-top')) closeFind();
  else if (state.find.top && e.target.closest('#find-pop [data-action="select-facility"], #find-pop [data-action="select-unit"]')) setTimeout(closeFind, 0);
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const act = btn.dataset.action, id = btn.dataset.id;
  if (btn.closest('#gear-menu')) setGearOpen(false);   // v60: a menu item chosen closes the menu
  try {
    switch (act) {
      case 'sign-out': localStorage.removeItem(LAST_INCIDENT); await data.signOut(); show('auth'); break;
      case 'open-incident': await openIncident(id); break;
      case 'switch-incident': closeReplay(); data.close(); localStorage.removeItem(LAST_INCIDENT); await showPicker(); break;
      case 'use-my-location': {
        const f = $('#new-incident');
        navigator.geolocation.getCurrentPosition((pos) => { f.lat.value = pos.coords.latitude.toFixed(5); f.lng.value = pos.coords.longitude.toFixed(5); }, (err) => toast('Location: ' + err.message, true), { enableHighAccuracy: true, timeout: 10000 });
        break;
      }
      case 'copy-code': await navigator.clipboard.writeText(data.incident.code); toast('Join code copied'); break;
      case 'copy-ops-code': await navigator.clipboard.writeText(data.opsCode() || ''); toast('Operations code copied. Give it by radio or phone, never on paper'); break;
      case 'new-ops-code': if (!data.opsCode() || await askConfirm({ title: 'Replace the Operations code?', text: 'Whoever has the old one can no longer join with it. Those already on the incident stay.', ok: 'Replace it' })) { await data.newOpsCode(); toast('New Operations code; the old one no longer joins'); queueDraw(); } break;
      case 'people-tab': state.people.tab = btn.dataset.tab === 'members' ? 'members' : 'people'; drawPeople(); loadRoster(); break;
      case 'member-role': {
        const m = data.member(id);
        if (!m) break;
        if (btn.dataset.role === 'unit') {
          const p = data.profileOf(id);
          const name = await askName('Unit name for ' + ((p && p.full_name) || 'this member'), m.unit_name && m.unit_name !== 'Operations' ? m.unit_name : '');
          if (name == null) break;
          await data.setRole(id, 'unit', name.trim() || null);
          toast(((p && p.full_name) || 'The member') + ' is now a unit' + (name.trim() ? ', ' + name.trim() : ''));
        } else {
          if (!await askConfirm({ title: `Make ${esc(unitLabelOf(m))} Operations?`, text: `<p><b>They get</b> the base: the map, drawing and assigning, every identity, the Operations code, roles, the clearing.</p><p><b>What changes:</b> their row leaves the units and reads Operations everywhere; their phone stops showing a unit's briefing; the 214 says "${esc(unitLabelOf(m))} is now Operations".</p>`, ok: 'Make Operations' })) break;
          await data.setRole(id, 'ops');
          toast(unitLabelOf(m) + ' is now Operations');
        }
        drawPeople();
        break;
      }
      case 'member-remove': {
        const m = data.member(id);
        if (m && await askConfirm({ title: `Remove ${esc(unitLabelOf(m))} from the incident?`, text: 'Everything they sent stays on record. Their phone shows they were removed. You can put them back from the Members tab.', ok: 'Remove', danger: true })) { await data.removeMember(id); toast(unitLabelOf(m) + ' removed from the incident'); drawPeople(); }
        break;
      }
      case 'member-restore': { const m = data.member(id); await data.restoreMember(id); toast((m ? unitLabelOf(m) : 'The member') + ' is back on the incident'); drawPeople(); break; }
      case 'clear-personal': {
        if (!await askConfirm({ title: 'Clear the personal records now?', text: 'Licence numbers, dates of birth, addresses and licence photos of its members (unless they are on another open incident), and the names of the people sheltered, are blanked. Names, phones, the log and the forms stay. This cannot be undone.', ok: 'Clear now', danger: true })) break;
        await data.clearPersonal(id);
        toast('Personal records cleared');
        await showPicker();
        break;
      }
      case 'keep-personal': await data.keepPersonal(id, 30); toast('Kept 30 more days'); await showPicker(); break;
      case 'close-incident': {
        if (!await askConfirm({ title: `Close ${esc(data.incident.name)}?`, text: 'Phones can no longer check in with its code. Its personal records clear by rule in 30 days; the picker shows the date. It can be reopened.', ok: 'Close the incident' })) break;
        await data.closeIncident();
        toast('Incident closed');
        closeReplay(); data.close(); localStorage.removeItem(LAST_INCIDENT); await showPicker();
        break;
      }
      case 'reopen-incident': await data.updateIncident({ status: 'active' }); toast('Incident reopened; the clearing clock stopped'); break;
      case 'reopen-pick': await data.reopenIncident(id); toast('Incident reopened; the clearing clock stopped'); await showPicker(); break;   // from the picker's closed row (v44)
      case 'verify-profile': await data.verifyProfile(id, true); toast('Marked verified'); break;
      case 'unverify-profile': await data.verifyProfile(id, false); toast('Verification withdrawn'); break;
      case 'copy-join-link': await navigator.clipboard.writeText(fieldJoinUrl(data.incident.code)); toast('Join link copied'); break;
      case 'print-join': openOverlay('join'); break;
      case 'invite-resend': { const v = data.invite(id); try { const r = await data.resendInvite(id); toast(r[0] && r[0].ok ? 'Sent again to ' + (v ? v.email : 'them') : (r[0] && r[0].error) || 'Could not send'); } catch (e) { toast(e.message || String(e), true); } queueDraw(); drawPeople(); break; }   // v56
      case 'invite-withdraw': { const v = data.invite(id); if (v && await askConfirm({ title: `Withdraw the invitation to ${esc(v.email)}?`, text: 'The link stops working. It stays on record.', ok: 'Withdraw' })) { await data.withdrawInvite(id); toast('Invitation to ' + v.email + ' withdrawn'); queueDraw(); drawPeople(); } break; }
      case 'invite-roster': { const rows = (state.roster || []).map((r) => ({ email: r.email, role: r.role, unit: r.unit_name })); if (!rows.length) break; try { const res = await data.sendInvites(rows); const ok = res.filter((r) => r.ok).length; toast(ok + ' of ' + rows.length + ' invited' + (ok < rows.length ? '; see the list for the rest' : '')); } catch (e) { toast(e.message || String(e), true); } state.roster = []; queueDraw(); drawPeople(); loadRoster(); break; }
      case 'invite-accept': await acceptInvite(); break;
      case 'invite-dismiss': clearPendingInvite(); drawPickInvite(); break;
      case 'print-bands': { const made = await data.printBands(24); state.printTags = made.map((t) => t.id); toast(made.length + ' bands printed, ' + bandLabel(made[0]).replace('Band ', '') + ' to ' + bandLabel(made[made.length - 1]).replace('Band ', '')); openOverlay('bands'); break; }   // v55
      case 'band-void': { const t = data.tag(id); if (t && await askConfirm({ title: `Void ${esc(bandLabel(t))}?`, text: 'A voided band is never reused. Give a new one by scanning it.', ok: 'Void it' })) { await data.voidBand(id); toast(bandLabel(t) + ' voided'); queueDraw(); drawPeople(); } break; }
      case 'select-zone': selectFromLog({ type: 'zone', id }); break;
      case 'select-photo': if (btn.closest('#public')) closePublic(); selectFromLog({ type: 'photo', id }); break;
      case 'photo-public': await data.setPhotoPublic(id, btn.dataset.ok === '1'); toast(btn.dataset.ok === '1' ? 'Cleared for public information · write its public caption and check it' : 'Withdrawn from public information'); break;
      case 'photo-check': await data.setPhotoChecked(id, btn.dataset.ok === '1'); toast(btn.dataset.ok === '1' ? 'Checked: in the public set' : 'Check withdrawn: out of the public set'); break;
      case 'unit-water': { const m = data.member(id); await data.setInWater(id, btn.dataset.on === '1' ? new Date().toISOString() : null); toast(unitLabelOf(m) + (btn.dataset.on === '1' ? ' in the water' : ' out of the water')); break; }
      case 'settings': { if (!data.incident) break; $('#settings-dialog-body').innerHTML = settingsDialogHtml(data); const dlg = $('#settings-dialog'); if (!dlg.open) dlg.showModal(); break; }
      case 'settings-close': { const dlg = $('#settings-dialog'); if (dlg.open) dlg.close(); break; }
      case 'show-around': { const dlg = $('#settings-dialog'); if (dlg.open) dlg.close(); showAround(); break; }   // v58
      case 'settings-test': {
        const f = btn.closest('form'), out = f.querySelector('[data-settings-test]');
        out.textContent = 'Testing…';
        const r = await testGoogleKey(f.maps_key.value);
        out.textContent = r.message;
        out.style.color = r.ok ? 'var(--cleared, inherit)' : 'var(--danger)';
        break;
      }
      case 'replay': if (state.replay) closeReplay(); else await openReplay(); break;
      case 'replay-play': if (state.replay && state.replay.playing) { stopReplayPlay(); drawReplay(); } else playReplay(); break;
      case 'replay-close': closeReplay(); break;
      case 'replay-pick-cancel': closeReplayPick(); break;
      case 'theme': toggleTheme(); drawTheme(); queueDraw(); break;
      case 'gear': setGearOpen(!state.gearOpen); break;   // v60
      case 'codes': state.codesOpen = !state.codesOpen; state.liveOpen = false; drawCodes(); drawLivePop(); break;   // v60
      case 'ops-show': state.opsShown = !state.opsShown; drawCodes(); break;   // v60
      case 'live': state.liveOpen = !state.liveOpen; state.codesOpen = false; drawLivePop(); drawCodes(); break;   // v60
      case 'reconnect': state.liveOpen = false; drawLivePop(); toast('Reconnecting…'); await openIncident(data.incident.id); break;   // v60
      case 'clock': clockUtcOn = !clockUtcOn; try { localStorage.setItem(CLOCK_KEY, clockUtcOn ? 'utc' : 'local'); } catch (err) { /* storage blocked */ } drawClock(); break;   // v59
      case 'log-toggle': if (LOG_ONLY) break; state.log.open = !state.log.open; if (state.log.open) markLogSeen(); saveLogPrefs(); drawLog(); map.invalidate(); break;
      case 'log-group': state.log.group = btn.dataset.group || 'all'; saveLogPrefs(); drawLog(); break;
      case 'log-since-seen': markSince(); if (state.log.group === 'new') state.log.group = 'all'; saveLogPrefs(); drawLog(); break;
      case 'log-notable': await data.setNotable(id, btn.dataset.on === '1'); drawLog(); break;
      case 'log-popout': popOutLog(); break;
      case 'print-214': openOverlay('214'); break;
      case 'people': if (LOG_ONLY) { selectFromLog({ type: 'people' }); break; } state.people.addUnit = btn.dataset.unit || state.people.addUnit; if (btn.dataset.tab) state.people.tab = btn.dataset.tab; openPeople(); break;
      case 'close-people': closePeople(); break;
      case 'public': if (!LOG_ONLY) openPublic(); break;
      case 'transports': if (LOG_ONLY) break; if (id) state.tr.open = id; openTransports(); break;
      case 'close-transports': closeTransports(); break;
      case 'tr-new': if (LOG_ONLY) break; state.tr.add = true; state.tr.edit = null; openTransports(); focusTrForm(); break;
      case 'tr-add-toggle': state.tr.add = !state.tr.add; state.tr.edit = null; drawTransports(); if (state.tr.add) focusTrForm(); break;
      case 'tr-edit': state.tr.edit = id; state.tr.add = false; drawTransports(); focusTrForm(); break;
      case 'tr-edit-cancel': state.tr.edit = null; state.tr.add = false; drawTransports(); break;
      case 'tr-open': state.tr.open = state.tr.open === id ? null : id; drawTransports(); break;
      case 'tr-gone-toggle': state.tr.gone = !state.tr.gone; drawTransports(); break;
      case 'tr-step': { const t = data.transport(id); if (!t) break; const done = await data.updateTransport(id, { status: btn.dataset.status }); toast(transportLabel(done) + ': ' + TRANSPORT_STATUS[done.status].toLowerCase()); queueDraw(); drawTransports(); break; }
      case 'tr-withdraw': { const t = data.transport(id); if (t && await askConfirm({ title: `Withdraw ${esc(transportLabel(t))}?`, text: 'It stays in the history and can be put back. The people on it keep their records.', ok: 'Withdraw' })) { await data.updateTransport(id, { archived_at: new Date().toISOString() }); state.tr.edit = null; toast(transportLabel(t) + ' withdrawn'); queueDraw(); drawTransports(); } break; }
      case 'tr-restore': { const t = data.transport(id); await data.updateTransport(id, { archived_at: null }); toast((t ? transportLabel(t) : 'The run') + ' is back'); queueDraw(); drawTransports(); break; }
      case 'tr-take-off': { const ev = data.evacuee(id); const done = await data.putOnTransport(id, null); toast(evacueeWho(done || ev) + ' taken off the run'); queueDraw(); drawTransports(); break; }
      case 'close-public': closePublic(); break;
      case 'print-211': openOverlay('211'); break;
      case 'hours': openOverlay('hours'); break;
      case 'hours-csv': {
        const period = state.hoursPeriod === 'all' ? null : (state.hoursPeriod && data.period(state.hoursPeriod)) || data.currentPeriod();
        const blob = new Blob([hoursCsvText(data, state)], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `hours-${data.incident.code}-${period ? 'OP' + period.number : 'all'}.csv`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        toast('CSV downloaded');
        break;
      }
      case 'people-qual': { const q = btn.dataset.q; if (state.people.quals.has(q)) state.people.quals.delete(q); else state.people.quals.add(q); drawPeople(); break; }
      case 'people-add-toggle': state.people.add = !state.people.add; drawPeople(); if (state.people.add) { const f = $('#people-page form[data-form="person-add"]'); if (f) f.name.focus(); } break;
      case 'person-out': await data.checkOutPerson(id); break;
      case 'person-in': await data.checkInPerson(id); break;
      case 'person-remove': { const p = data.person(id); if (p && await askConfirm({ title: `Take ${esc(p.name)} off the roster?`, text: 'The record is kept and can be put back.', ok: 'Take off' })) { await data.archivePerson(id); toast(p.name + ' removed'); } break; }
      case 'person-restore': await data.updatePerson(id, { archived_at: null }); break;
      case 'person-edit': state.people.edit = id; state.people.add = false; drawPeople(); { const f = $('#people-page form[data-form="person-edit"]'); if (f) f.name.focus(); } break;
      case 'person-edit-cancel': state.people.edit = null; drawPeople(); break;
      case 'overlay-hide': setOverlayHidden(id, true); queueDraw(); break;
      case 'overlay-show': setOverlayHidden(id, false); queueDraw(); break;
      case 'overlay-remove': { const o = data.overlay(id); if (o && await askConfirm({ title: `Remove "${esc(o.name || 'this imagery')}" from the map?`, text: 'For every screen. It is kept and can be put back.', ok: 'Remove' })) { await data.archiveOverlay(id); toast('Imagery removed from the map'); } break; }
      case 'overlay-restore': await data.updateOverlay(id, { archived_at: null }); toast('Imagery put back'); break;
      case 'overlay-view-bounds': fillOverlayBounds(true); break;
      case 'select-unit': if (btn.closest('#people')) closePeople(); select({ type: 'unit', id }); break;
      case 'select-structure': selectFromLog({ type: 'structure', id }); break;
      case 'select-facility': if (btn.closest('#briefing')) $('#briefing').hidden = true; selectFromLog({ type: 'facility', id }); break;
      case 'select-evacuee': {   // a log line about a person: open the place the record says they are, or were
        const ev = data.evacuee(id);
        const place = ev && (ev.facility_id || ev.prev_facility_id);
        if (place) selectFromLog({ type: 'facility', id: place });
        else if (ev) { state.find.top = ev.label || ''; $('#find-q').value = state.find.top; drawFind(); }
        break;
      }
      case 'find-close': closeFind(); break;
      case 'ev-add-toggle': state.evAdd = id || null; queueDraw(); if (id) setTimeout(() => { const f = $('#panel form[data-form="evacuee-add"]'); if (f) f.label.focus(); }, 30); break;
      case 'ev-sign-in': { const ev = await data.updateEvacuee(id, { status: 'here', facility_id: btn.dataset.facility }); toast(evacueeWho(ev) + ' signed in'); break; }
      case 'print-shelter': state.printFacility = id; openOverlay('shelter'); break;
      case 'place-facility': {
        const sel = $('#facility-kind');
        state.placeKind = sel ? sel.value : 'staging';
        map.startDraw('facility');
        $('#btn-boundary').classList.remove('on'); $('#btn-zone').classList.remove('on');
        $('#draw-btns').hidden = false;
        setHint('Click the map where the ' + (data.facilities ? (FACILITY_LABEL[state.placeKind] || 'facility').toLowerCase() : 'facility') + ' is.');
        break;
      }
      case 'download-public': await downloadPublic(btn); break;
      case 'close-facility': { const f = await data.updateFacility(id, { closed_at: new Date().toISOString() }); toast((f && f.name ? f.name : 'The facility') + ' marked closed. Reopen brings it back.'); break; }
      case 'reopen-facility': { const f = await data.updateFacility(id, { closed_at: null }); toast((f && f.name ? f.name : 'The facility') + ' reopened'); break; }
      case 'channel-remove': { const ch = data.channels().slice(); ch.splice(Number(btn.dataset.i), 1); await data.setChannels(ch); break; }
      case 'place-structures': {
        state.placeZone = id;
        state.placeN = 0;
        map.startDraw('structures');
        $('#btn-boundary').classList.remove('on'); $('#btn-zone').classList.remove('on');
        $('#draw-btns').hidden = false;
        setHint('Click the map once per structure to place it in ' + (data.zone(id) ? data.zone(id).code : 'the division under the click') + ', then press Finish.');
        break;
      }
      case 'finish-pass': {
        const z = data.zone(id);
        if (!z) break;
        const pass = btn.dataset.pass;
        if (!await askConfirm({ title: `${pass === 'secondary' ? 'Mark ' + esc(z.code) + ' clear (secondary search complete)' : 'Mark the primary search of ' + esc(z.code) + ' complete'} from the base?`, text: 'Normally the unit in the division does this from the field.', ok: 'Mark it' })) break;
        await data.finishPass(id, pass, { marking: markingFor('BASE', new Date(), [], 0) });
        break;
      }
      case 'close-panel': select(null); break;
      case 'set-priority': await data.updateZone(id, { priority: Number(btn.dataset.p) }); break;
      case 'assign': { const z = data.zone(id); await data.assignZone(id, z && z.assigned_to === btn.dataset.user ? null : btn.dataset.user); break; }
      case 'resolve-hazard': await data.resolveHazard(id); break;
      case 'ack-hazard': await data.ackHazard(id); toast('Hazard acknowledged'); break;
      case 'zoom-zone': { const z = data.zone(id); if (z) map.fitPolygon(z.polygon); break; }
      case 'pan-to': map.panTo(Number(btn.dataset.lat), Number(btn.dataset.lng)); break;
      case 'reopen-zone': { const z = data.zone(id); if (z) await data.updateZone(id, { status: z.assigned_to ? 'active' : 'open', marking: null }); break; }
      case 'ack-alert': await data.ackAlert(id); break;
      case 'ident-toggle': state.identOpen = state.identOpen === id ? null : id; queueDraw(); break;   // the unit panel's identity details (v50)
      case 'org-period': $('[data-action="close-briefing"]').click(); $('[data-action="period"]').click(); break;   // the 207 warning's link (v44)
      case 'mark-all-found': await data.markFound(btn.dataset.message, btn.dataset.user, {}); toast('Everyone marked found'); queueDraw(); break;   // one line in the log (v48)
      case 'mark-found': await data.markFound(btn.dataset.message, btn.dataset.user, { personId: btn.dataset.person || null, name: btn.dataset.name || null }); toast((btn.dataset.name || 'The missing person') + ' marked found'); break;
      case 'ack-message': await data.ackMessage(id, btn.dataset.reply || 'Copy'); break;
      case 'set-status': {
        if (btn.dataset.status === 'out_of_service') { state.oosFor = id; queueDraw(); break; }
        state.oosFor = null;
        await data.setStatus(id, btn.dataset.status);
        break;
      }
      case 'oos-cancel': state.oosFor = null; queueDraw(); break;
      case 'check-out': {
        const m = data.member(id);
        if (m && await askConfirm({ title: `Check ${esc(unitLabelOf(m))} out?`, text: 'Its divisions go back to not started.', ok: 'Check out' })) await data.setStatus(id, 'checked_out');
        break;
      }
      case 'period': state.periodNext = false; selectFromLog({ type: 'period' }); break;
      case 'period-next': state.periodNext = true; select({ type: 'period' }); break;
      case 'period-next-cancel': state.periodNext = false; queueDraw(); break;
      case 'objective-done': await data.updateObjective(id, { done_at: new Date().toISOString() }); break;
      case 'objective-undo': await data.updateObjective(id, { done_at: null }); break;
      case 'briefing': openOverlay('briefing'); break;
      case 'org': openOverlay('org'); break;
      case 'board-mode': state.board = btn.dataset.mode === 'status' ? 'status' : 'kind'; try { localStorage.setItem(BOARD_KEY, state.board); } catch (err) { /* storage blocked */ } queueDraw(); break;
      case 'set-kind': await data.setKind(id, btn.dataset.kind || ''); toast(btn.dataset.kind ? unitLabelOf(data.member(id)) + ' is a ' + kindText(btn.dataset.kind) : 'Kind cleared'); break;
      case 'msg-chip': { const f = btn.closest('form'); if (f && f.text) { f.text.value = btn.dataset.text || ''; f.text.focus(); } break; }
      case 'transfer-go': await doTransfer(); break;
      case 'transfer-rename': { const t = state.transfer; closeTransfer(); if (t) await savePending(t); break; }
      case 'transfer-cancel': closeTransfer(); break;
      case 'print-204': closeZoneModal(); openOverlay('204', id); break;
      case 'zone-modal-open': closeZoneModal(); select({ type: 'zone', id }); break;
      case 'zone-modal-close': closeZoneModal(); break;
      case 'legend-status': setHighlight(state.highlight === btn.dataset.status ? null : btn.dataset.status); break;
      case 'legend-clear': setHighlight(null); break;
      case 'layers': setLayersOpen(!state.layersOpen); break;
      case 'layer-pick': { const want = btn.dataset.layer; const got = await map.setBaseLayer(want); if (got !== want) drawLayers(); break; }
      case 'overlay-toggle': setOverlayHidden(id, !btn.checked); queueDraw(); break;
      case 'layers-upload': state.layersUpload = true; drawLayers(); { const f = $('#layers-pop form[data-form="overlay-add"]'); if (f) f.file.focus(); } break;
      case 'sitrep': openOverlay('sitrep'); break;
      case 'iap': openOverlay('iap'); break;
      case 'close-briefing': $('#briefing').hidden = true; state.printZone = null; state.print = null; state.printFacility = null; break;
      case 'print-briefing': drawBriefing(); await mapsReady($('#briefing-page')); window.print(); break;
      case 'copy-briefing': await navigator.clipboard.writeText(briefingAsText()); toast('Copied as text'); break;
      case 'start-par': {
        const r = data.recipientsFor(btn.dataset.target || 'all');
        if (!r.toUsers.length) { toast('Nobody to ask', true); break; }
        await data.startPar(btn.dataset.target || 'all');
        toast('PAR sent to ' + r.toLabel);
        break;
      }
      case 'draw-boundary': case 'draw-zone': {
        const mode = act === 'draw-boundary' ? 'boundary' : 'zone';
        if (map.mode === mode) { stopDraw(); break; }
        map.startDraw(mode);
        $('#btn-boundary').classList.toggle('on', mode === 'boundary');
        $('#btn-zone').classList.toggle('on', mode === 'zone');
        $('#draw-btns').hidden = false;
        $('#btn-undo-point').hidden = false;
        setHint(mode === 'boundary' ? 'Click the map to outline the incident area, then press Finish.' : 'Click the map to outline the division, then press Finish.');
        if (state.selected) select(null);
        break;
      }
      case 'finish-draw': {
        const mode = map.mode;
        if (mode === 'structures' || mode === 'facility') { stopDraw(); break; }
        const polygon = map.finishDraw();
        stopDraw();
        if (!polygon) { toast('A division needs at least three points', true); break; }
        if (mode === 'boundary') { await data.setBoundary(polygon); toast('Boundary saved'); }
        else { state.pendingPolygon = polygon; state.newZone = { code: nextZoneCode(data.zones()) }; select({ type: 'newzone' }); }
        break;
      }
      case 'cancel-draw': stopDraw(); break;
      case 'undo-point': map.undoPoint(); break;
      case 'newzone-discard': state.pendingPolygon = null; state.newZone = null; select(null); break;
    }
  } catch (err) {
    console.error(err);
    toast(err.message || String(err), true);
  }
});

// "19:00" today, or tomorrow when that time has passed, as an ISO timestamp
function timeToIso(hhmmValue) {
  if (!hhmmValue) return null;
  const [h, m] = hhmmValue.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  if (d.getTime() < Date.now() - 60000) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

document.addEventListener('change', async (e) => {
  const box = e.target.closest('[data-check="invite-only"]');
  if (box) { try { await data.setInviteOnly(box.checked); toast(box.checked ? 'Invited members only: the join code is off' : 'The join code is on again'); } catch (err) { toast(err.message || String(err), true); box.checked = !box.checked; } queueDraw(); return; }   // v56
  const sel = e.target.closest('[data-select], [data-range]');
  if (!sel) return;
  try {
    if (sel.dataset.select === 'zone-objective') { await data.updateZone(sel.dataset.id, { objective_id: sel.value || null }); sel.blur(); queueDraw(); }
    if (sel.dataset.range === 'overlay-opacity') { await data.updateOverlay(sel.dataset.id, { opacity: Number(sel.value) }); sel.blur(); queueDraw(); }
    if (sel.dataset.select === 'hours-period') { state.hoursPeriod = sel.value; drawBriefing(); }
    if (sel.dataset.select === 'person-unit') { const p = data.person(sel.dataset.id); await data.updatePerson(sel.dataset.id, { user_id: sel.value }); sel.blur(); if (p) toast(p.name + ' moved to ' + unitLabelOf(data.member(sel.value))); queueDraw(); }
    if (sel.dataset.select === 'ev-where') {
      const ev = data.evacuee(sel.dataset.id);
      if (ev) { const done = await data.updateEvacuee(ev.id, wherePatch(sel.value, { facilityOf: (fid) => data.facility(fid), current: ev })); toast(evacueeWho(done) + ': ' + evacueeWhere(done, (fid) => data.facility(fid))); }
      sel.blur(); queueDraw();
    }
    if (sel.dataset.select === 'ev-transport') {   // put a record on a run, or take it off (v54)
      const done = await data.putOnTransport(sel.dataset.id, sel.value || null);
      const t = sel.value ? data.transport(sel.value) : null;
      toast(evacueeWho(done) + (t ? ' on ' + transportLabel(t) : ' off the run') + ': ' + evacueeWhere(done, (fid) => data.facility(fid)));
      sel.blur(); queueDraw();
    }
    if (sel.dataset.select === 'unit-facility') { await data.setUnitFacility(sel.dataset.id, sel.value || null); sel.blur(); toast(unitLabelOf(data.member(sel.dataset.id)) + (sel.value ? ' works at ' + (data.facility(sel.value).name || 'the shelter') : ': no shelter chosen')); queueDraw(); }
    if (sel.dataset.select === 'person-buddy') { await data.updatePerson(sel.dataset.id, { buddy_id: sel.value || null }); sel.blur(); queueDraw(); }
  } catch (err) { toast(err.message || String(err), true); }
});

// While outlining, Backspace or Delete takes the last corner off (not while typing in a field).
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && aroundOn()) { clearAround('cleared'); return; }   // v58
  if (e.key === 'Escape' && (state.gearOpen || state.codesOpen || state.liveOpen)) { setGearOpen(false); state.codesOpen = false; state.liveOpen = false; drawCodes(); drawLivePop(); return; }   // v60
  if (e.key === 'Escape' && state.layersOpen) { setLayersOpen(false); return; }
  if (e.key === 'Escape' && state.highlight && !$('#zone-dialog').open && $('#briefing').hidden) { setHighlight(null); return; }
  if (e.key !== 'Backspace' && e.key !== 'Delete') return;
  if (!map || (map.mode !== 'boundary' && map.mode !== 'zone')) return;
  const t = e.target;
  if (t && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable)) return;
  e.preventDefault();
  map.undoPoint();
});

// The hint shares the tools' one row with the buttons; a long one is cut short on screen and whole on hover.
function setHint(t) { const h = $('#tool-hint'); h.textContent = t; h.title = t; }

function stopDraw() {
  map.cancelDraw();
  $('#btn-undo-point').hidden = true;
  state.placeZone = null;
  $('#btn-boundary').classList.remove('on');
  $('#btn-zone').classList.remove('on');
  $('#draw-btns').hidden = true;
  setHint(defaultHint());
  drawTools();
}

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  form.dataset.submitted = '1';   // what is typed here is being sent: a redraw (which may run at once) must not bring it back
  try {
    if (form.dataset.form === 'new-zone') {
      if (!state.pendingPolygon) { toast('Draw the zone first', true); return; }
      const z = await data.addZone({ code: form.code.value.trim().toUpperCase(), name: form.name.value.trim(), priority: Number(form.priority.value), polygon: state.pendingPolygon, structures: Number(form.structures.value) || 0 });
      state.pendingPolygon = null; state.newZone = null;
      select({ type: 'zone', id: z.id });
      toast('Division ' + z.code + ' saved');
    } else if (form.dataset.form === 'zone-edit') {
      await data.updateZone(form.dataset.id, { code: form.code.value.trim().toUpperCase(), name: form.name.value.trim(), structures: Number(form.structures.value) || 0, work_assignment: form.work_assignment.value.trim(), instructions: form.instructions.value.trim(), channel: form.channel.value.trim(), supervisor: form.supervisor.value.trim(), branch: form.branch.value.trim() });
      toast('Saved');
      if (document.activeElement && form.contains(document.activeElement)) document.activeElement.blur();
      queueDraw();
    } else if (form.dataset.form === 'sitrep-edit') {
      await data.updatePeriod(form.dataset.id, { sitrep: { summary: form.summary.value.trim(), needs: form.needs.value.trim(), outlook: form.outlook.value.trim() } });
      toast('Situation report saved');
      if (document.activeElement && form.contains(document.activeElement)) document.activeElement.blur();
      drawBriefing();
    } else if (form.dataset.form === 'facility-edit') {
      const patch = { kind: form.kind.value, name: form.name.value.trim(), contact: form.contact.value.trim(), notes: form.notes.value.trim(), address: form.address ? form.address.value.trim() : '' };
      if (form.beds) patch.beds = form.beds.value === '' ? null : Math.max(0, Math.round(Number(form.beds.value)));
      if (form.expected) patch.expected = form.expected.value.trim();
      await data.updateFacility(form.dataset.id, patch);
      toast('Saved');
      if (document.activeElement && form.contains(document.activeElement)) document.activeElement.blur();
      queueDraw();
    } else if (form.dataset.form === 'invite-send') {   // v56
      const email = form.email.value.trim().toLowerCase(), role = form.role.value === 'ops' ? 'ops' : 'unit', unit = form.unit.value.trim();
      if (!email) { toast('An email address is needed', true); return; }
      try {
        const res = await data.sendInvites([{ email, role, unit }]);
        const r = res[0];
        if (r && r.ok) { toast('Invitation sent to ' + email); form.email.value = ''; form.unit.value = ''; }
        else toast((r && r.error) || 'Could not send', true);
      } catch (e) { toast(e.message || String(e), true); }
      queueDraw(); drawPeople();
    } else if (form.dataset.form === 'invite-password') {
      const pw = form.password.value;
      if (pw.length < 8) { toast('8 characters or more', true); return; }
      try { await data.setPassword(pw); toast('Password saved'); form.remove(); } catch (e) { toast(e.message || String(e), true); }
    } else if (form.dataset.form === 'transport-add' || form.dataset.form === 'transport-edit') {   // the board's New run and Edit (v54)
      const fields = transportFormFields(form);
      if (!fields.to_facility_id) { toast('Say where to: place a shelter or a hospital first', true); return; }
      if (!fields.from_facility_id && !fields.from_zone_id && !fields.from_text) { toast('Say where from: a facility, a division, or a few words', true); return; }
      const t = form.dataset.form === 'transport-edit' ? await data.updateTransport(form.dataset.id, fields) : await data.addTransport(crypto.randomUUID(), fields);
      state.tr.add = false; state.tr.edit = null; state.tr.open = t.id;
      toast(transportLabel(t) + (form.dataset.form === 'transport-edit' ? ' saved' : ' planned'));
      if (document.activeElement && form.contains(document.activeElement)) document.activeElement.blur();
      queueDraw(); drawTransports();
    } else if (form.dataset.form === 'evacuee-add') {
      const label = form.label.value.trim();
      if (!label) { toast('Who: a name, or "family of 4"', true); return; }
      const ev = await data.addEvacuee(crypto.randomUUID(), { label, count: Math.min(999, Math.max(1, Number(form.count.value) || 1)), needs: [...form.querySelectorAll('input[name="need"]:checked')].map((i) => i.value), from_text: form.from.value.trim(), note: form.note.value.trim(), status: 'here', facility_id: form.dataset.facility });
      state.evAdd = null;
      toast(evacueeWho(ev) + ' signed in');
      if (document.activeElement && form.contains(document.activeElement)) document.activeElement.blur();
      queueDraw();
    } else if (form.dataset.form === 'settings') {
      const patch = { maps_key: form.maps_key.value.trim(), retention_days: Math.max(1, Number(form.retention_days.value) || 30), rotation_minutes: Math.min(600, Math.max(0, Math.round(Number(form.rotation_minutes.value) || 0))), eoc_email: form.eoc_email ? form.eoc_email.value.trim() : '' };
      await data.saveSettings(patch);
      setGoogleKey(patch.maps_key);
      const dlg = $('#settings-dialog'); if (dlg.open) dlg.close();
      toast('Settings saved' + (patch.maps_key ? ' · Google Maps is in the Layers panel' : ''));
      queueDraw();
    } else if (form.dataset.form === 'photo-public') {
      await data.setPhotoCaption(form.dataset.id, form.caption.value);
      toast('Public caption saved');
      if (document.activeElement && form.contains(document.activeElement)) document.activeElement.blur();
      queueDraw();
    } else if (form.dataset.form === 'channel-add') {
      const use = form.use.value.trim(), channel = form.channel.value.trim();
      if (!use || !channel) return;
      await data.setChannels(data.channels().concat([{ use, channel }]));
      form.reset();
      form.use.blur();
      queueDraw();
    } else if (form.dataset.form === 'structure-edit') {
      await data.updateStructure(form.dataset.id, { label: form.label.value.trim(), status: form.status.value, occupants: form.occupants.value, people_needing_help: Number(form.people.value) || 0, water_cm: form.water.value === '' ? null : Number(form.water.value), damage: form.damage.value, hazards: form.hazards.value.trim().toUpperCase(), notes: form.notes.value.trim() });
      toast('Saved');
      if (document.activeElement && form.contains(document.activeElement)) document.activeElement.blur();
      queueDraw();
    } else if (form.dataset.form === 'objective') {
      const text = form.text.value.trim();
      if (!text) return;
      await data.addObjective(text);
      form.text.value = '';
      form.text.blur();
      queueDraw();
    } else if (form.dataset.form === 'overlay-add') {
      const file = form.file.files && form.file.files[0];
      if (!file) { toast('Choose a picture first', true); return; }
      const bounds = { south: Number(form.south.value), west: Number(form.west.value), north: Number(form.north.value), east: Number(form.east.value) };
      if (!boundsOk(bounds)) { toast('The corners need south below north and west left of east', true); return; }
      toast('Uploading the imagery…');
      await data.addOverlay(file, { name: form.name.value.trim(), bounds, opacity: Number(form.opacity.value), takenAt: form.taken.value ? new Date(form.taken.value).toISOString() : null });
      toast('Imagery on the map for everyone');
      if (document.activeElement && form.contains(document.activeElement)) document.activeElement.blur();
      state.layersUpload = false;
      queueDraw();
    } else if (form.dataset.form === 'person-add') {
      const name = form.name.value.trim();
      if (!name) return;
      const quals = [...form.querySelectorAll('input[name="q"]:checked')].map((i) => i.value);
      await data.addPerson(crypto.randomUUID(), { userId: form.unit.value, name, role: form.role.value.trim(), agency: form.agency.value.trim(), qualifications: quals });
      state.people.add = false; state.people.addUnit = form.unit.value;
      toast(name + ' added to ' + unitLabelOf(data.member(form.unit.value)));
      if (document.activeElement && form.contains(document.activeElement)) document.activeElement.blur();   // the page redraws only while no field in it has focus
      drawPeople();
    } else if (form.dataset.form === 'person-edit') {
      const p = data.person(form.dataset.id), unit = p && data.member(p.user_id);
      const name = form.name.value.trim();
      if (!p || !name) return;
      const quals = [...form.querySelectorAll('input[name="q"]:checked')].map((i) => i.value);
      await data.updatePerson(p.id, { name, role: form.role.value.trim(), agency: form.agency.value.trim() || (unit ? unit.agency : ''), qualifications: quals, notes: form.notes.value.trim() });
      state.people.edit = null;
      toast(name + ' updated');
      if (document.activeElement && form.contains(document.activeElement)) document.activeElement.blur();
      drawPeople();
    } else if (form.dataset.form === 'request-add') {
      await data.addRequest({ kind: form.kind.value, what: form.what.value, quantity: form.quantity.value, urgency: form.urgency.value, note: form.note.value, zoneId: form.zone.value || null });
      toast('Asked');
      if (document.activeElement && form.contains(document.activeElement)) document.activeElement.blur();
      queueDraw();
    } else if (form.dataset.form === 'request-answer') {
      const status = e.submitter && e.submitter.value;
      if (!status) return;
      await data.answerRequest(form.dataset.id, status, form.answer.value);
      toast({ approved: 'Approved', ordered: 'Marked ordered', filled: 'Filled', declined: 'Marked as not fillable', asked: 'Asked again' }[status] || 'Saved');
      if (document.activeElement && form.contains(document.activeElement)) document.activeElement.blur();
      queueDraw();
    } else if (form.dataset.form === 'incident-edit') {
      await data.setLeadAgency(form.lead_agency.value);
      toast('Saved');
      if (document.activeElement && form.contains(document.activeElement)) document.activeElement.blur();
      queueDraw();
    } else if (form.dataset.form === 'period-edit') {
      const cur = data.period(form.dataset.id);
      const patch = { ic_name: form.ic.value.trim(), ops_chief: form.ops.value.trim(), safety_officer: form.safety.value.trim(), notes: form.notes.value.trim(), ends_at: timeToIso(form.ends.value), unified: form.unified.value.trim(), planning_chief: form.planning.value.trim(), logistics_chief: form.logistics.value.trim(), finance_chief: form.finance.value.trim(), pio: form.pio.value.trim(), liaison: form.liaison.value.trim(), rotation_minutes: form.rotation ? Math.min(600, Math.max(0, Math.round(Number(form.rotation.value) || 0))) : undefined, deputy: form.deputy ? form.deputy.value.trim() : undefined, bring: form.bring ? form.bring.value.trim() : undefined, scene_hours: form.scene ? Math.min(72, Math.max(0, Math.round(Number(form.scene.value) || 0))) : undefined };
      // the agency representatives: one row per agency, saved when changed
      const reps = new Map();
      for (const el of form.querySelectorAll('[data-rep]')) { const r = reps.get(el.dataset.agency) || { agency: el.dataset.agency }; r[el.dataset.rep] = el.value.trim(); reps.set(el.dataset.agency, r); }
      for (const r of reps.values()) {
        const was = data.periodAgencies(form.dataset.id).find((a) => a.agency === r.agency);
        if ((was ? was.name : '') !== (r.name || '') || (was ? was.phone : '') !== (r.phone || '')) await data.savePeriodAgency({ periodId: form.dataset.id, agency: r.agency, name: r.name, phone: r.phone });
      }
      if (document.activeElement && form.contains(document.activeElement)) document.activeElement.blur();
      const from = cur ? cur.ic_name : '';
      if (from && patch.ic_name && patch.ic_name !== from) { askTransfer({ mode: 'edit', from, to: patch.ic_name, ops: patch.ops_chief, periodId: form.dataset.id, patch }); return; }
      await savePending({ mode: 'edit', periodId: form.dataset.id, patch });
    } else if (form.dataset.form === 'period-start') {
      const cur = data.currentPeriod();
      const payload = { endsAt: timeToIso(form.ends.value), ic: form.ic.value.trim(), ops: form.ops.value, safety: form.safety.value, notes: form.notes.value, carry: form.carry.checked, planning: form.planning.value, logistics: form.logistics.value, finance: form.finance.value, unified: form.unified.value, pio: form.pio.value, liaison: form.liaison.value, rotation: form.rotation ? Math.min(600, Math.max(0, Math.round(Number(form.rotation.value) || 0))) : null, deputy: form.deputy ? form.deputy.value.trim() : '', bring: form.bring ? form.bring.value.trim() : '', scene: form.scene ? Math.min(72, Math.max(0, Math.round(Number(form.scene.value) || 0))) : null };
      const from = cur ? cur.ic_name : '';
      if (from && payload.ic && payload.ic !== from) { askTransfer({ mode: 'start', from, to: payload.ic, ops: payload.ops.trim(), payload }); return; }
      await savePending({ mode: 'start', payload });
    } else if (form.dataset.form === 'oos') {
      await data.setStatus(form.dataset.id, 'out_of_service', form.reason.value);
      state.oosFor = null;
      queueDraw();
    } else if (form.dataset.form === 'message') {
      const text = form.text.value.trim();
      if (!text) return;
      const r = data.recipientsFor(form.to.value);
      if (!r.toUsers.length) { toast('Nobody to send that to', true); return; }
      const safety = !!(form.safety && form.safety.checked);
      await data.sendMessage(null, { toUsers: r.toUsers, toLabel: r.toLabel, toZone: r.toZone, kind: safety ? 'safety' : 'message', text });
      form.text.value = '';
      if (form.safety) form.safety.checked = false;
      form.text.blur();
      toast((safety ? 'Safety message' : 'Message') + ' sent to ' + r.toLabel);
      queueDraw();
    }
  } catch (err) { toast(err.message || String(err), true); }
});

$('#note-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = e.target.text;
  const text = input.value.trim();
  if (!text) return;
  try { await data.addNote(text); input.value = ''; } catch (err) { toast(err.message || String(err), true); }
});

// the clock and "ago" texts
// The gear (v60): the incident's settings, this screen (Light or dark, Show me around), Switch incident and Sign out,
// one icon in place of four buttons.
function setGearOpen(open) { state.gearOpen = !!open; $('#gear-menu').hidden = !state.gearOpen; $('#btn-gear').setAttribute('aria-expanded', String(state.gearOpen)); $('#btn-gear').classList.toggle('on', state.gearOpen); }

// The codes' card and the connection's card under the header's pills (v60). Both are drawn on every draw, so a
// hidden button is still there to press, and shown while their state says so.
function drawCodes() {
  if (!data.incident) return;
  const pop = $('#codes-pop'), html = codesPopHtml(data, state);
  if (pop.__html !== html) { pop.__html = html; pop.innerHTML = html; }
  pop.hidden = !state.codesOpen;
  $('#inc-code').setAttribute('aria-expanded', String(state.codesOpen)); $('#inc-code').classList.toggle('on', state.codesOpen);
}
function drawLivePop() {
  if (!data.incident) return;
  const pop = $('#live-pop');
  if (state.liveOpen) { const html = liveHtml(data, state); if (pop.__html !== html) { pop.__html = html; pop.innerHTML = html; } }
  pop.hidden = !state.liveOpen;
  $('#live-pill').setAttribute('aria-expanded', String(state.liveOpen)); $('#live-pill').classList.toggle('on', state.liveOpen);
}
// what a change was, for the connection card's "last update"
function updateWords(d) {
  const t = String(d.table || '').replace(/^ic_/, '');
  const m = d.row && d.row.user_id ? data.member(d.row.user_id) : null;
  const word = { positions: 'position', photos: 'photo', events: 'log line', members: 'unit', zones: 'division', hazards: 'hazard', messages: 'message', message_acks: 'answer', structures: 'house record', alerts: 'emergency', evacuees: 'shelter record', transports: 'run', people: 'person', tags: 'band', seen: 'scan', incidents: 'the incident', periods: 'the period', requests: 'request', facilities: 'facility', invites: 'invitation' }[t] || t.replace(/_/g, ' ');
  return ((m ? unitLabelOf(m) + ' ' : '') + word).trim();
}
// the head count beside Find a person (v60)
function drawHeadCount() {
  const el = $('#head-count'); if (!el || !data.incident) return;
  const { html, title } = headCountHtml(data);
  el.hidden = false; el.title = title;
  if (el.__html !== html) { el.__html = html; el.innerHTML = html; }
}
// The drawing buttons (v60): which one is lit follows the map. No boundary yet: Boundary. A boundary and no
// divisions: Division. Otherwise neither. The hint says why while nothing is being drawn.
function defaultHint() {
  if (!data.incident) return '';
  if (!data.incident.boundary) return 'Start with the boundary: the incident\'s outer edge, drawn once.';
  if (!data.zones().length) return 'Now divisions inside it: an area of the map for each unit.';
  return 'Click a division, a unit or a photo pin to open it.';
}
function drawTools() {
  if (!map || !data.incident) return;
  const drawing = !!map.mode, noB = !data.incident.boundary, noZ = !data.zones().length;
  $('#btn-boundary').classList.toggle('pri', !drawing && noB);
  $('#btn-zone').classList.toggle('pri', !drawing && !noB && noZ);
  if (!drawing) setHint(defaultHint());
}
// A division's hover card (v60): rest on a row for half a second and it opens beside the side panel, over the map;
// it goes on leaving the list, scrolling it or clicking.
let hoverT = null, hoverZone = null;
function hideZoneHover() { clearTimeout(hoverT); hoverT = null; hoverZone = null; const el = $('#zone-hover'); if (el) el.hidden = true; }
function showZoneHover(id, row) {
  const z = data.zone(id); if (!z) { hideZoneHover(); return; }
  const el = $('#zone-hover');
  el.innerHTML = zoneHoverHtml(data, z); el.hidden = false;
  const r = row.getBoundingClientRect(), side = $('.side').getBoundingClientRect();
  el.style.left = Math.max(8, side.left - el.offsetWidth - 10) + 'px';
  el.style.top = Math.max(8, Math.min(r.top, document.documentElement.clientHeight - el.offsetHeight - 8)) + 'px';
  hoverZone = id;
}
function refreshZoneHover() { if (!hoverZone) return; const row = $(`#zones .zr[data-id="${hoverZone}"]`); if (row) showZoneHover(hoverZone, row); else hideZoneHover(); }
$('#zones').addEventListener('mouseover', (e) => { const row = e.target.closest('.zr[data-id]'); if (!row) return; if (row.dataset.id === hoverZone) return; clearTimeout(hoverT); hoverT = setTimeout(() => showZoneHover(row.dataset.id, row), 500); });
$('#zones').addEventListener('mouseleave', hideZoneHover);
$('#zones').addEventListener('click', hideZoneHover);
$('.side').addEventListener('scroll', hideZoneHover, { passive: true });

// the header clock (v59): local with the zone's short name, or UTC; a click swaps, kept per device. The log and
// the forms stay local, as ICS has them.
const CLOCK_KEY = 'ic.base.clock';
let clockUtcOn = (() => { try { return localStorage.getItem(CLOCK_KEY) === 'utc'; } catch (e) { return false; } })();
function drawClock() {
  const now = new Date(), el = $('#clock'), z = zoneShort(now);
  el.textContent = clockUtcOn ? hhmmUtc(now) + ' UTC' : (hhmm(now) + ' ' + z).trim();
  el.title = clockUtcOn ? 'UTC. Click for the local time; the log and the forms stay local.' : 'Local time' + (z ? ' (' + z + ')' : '') + '. Click for UTC.';
}
setInterval(() => {
  drawClock();
  if (!$('#app').hidden && data.incident) queueDraw();
}, 15000);
drawClock();

// New versions: the signed-out front door reloads itself once when a new worker takes over; a signed-in
// base gets the chip instead. The front door's footer says which version is on screen, with Reload.
const updates = watchUpdates({ script: 'sw.js', mayReload: () => !$('#auth').hidden, chip: 'update-chip' });
new MutationObserver(() => { state.updateReady = !$('#update-chip').hidden; if (state.liveOpen) drawLivePop(); }).observe($('#update-chip'), { attributes: true, attributeFilter: ['hidden'] });   // v60
(async () => {
  let v = await updates.version();
  if (!v) { try { v = ((await (await fetch('sw.js', { cache: 'no-store' })).text()).match(/VERSION = '([^']+)'/) || [])[1]; } catch (e) { /* offline */ } }
  if ($('#land-ver')) $('#land-ver').textContent = v ? 'Version ' + v : '';
  state.version = v || null;   // v60: the connection card says which version this base runs
})();
if ($('#land-reload')) $('#land-reload').addEventListener('click', async () => { await updates.check(); location.reload(); });

// a join link opened on the base (?join=<code>) fills the picker's join form
(function takeJoinLink() {
  const code = codeFromSearch(location.search);
  if (!code) return;
  const input = document.querySelector('#join-form input[name="code"]');
  if (input) input.value = code;
  try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* fine */ }
})();

boot();
