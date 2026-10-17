// The base view: sign in, pick or open an incident, then keep the map, the sidebar and the log
// drawn from the shared data module while it follows live changes.
import { Data } from '../shared/data.js';
import { BaseMap } from './map.js';
import { zonesHtml, panelHtml, zoneModalHtml, logHtml, logFiltersHtml, imageryHtml, layersPopHtml, hoursHtml, hoursCsvText, joinCardHtml, joinCardText, fieldJoinUrl, maydayHtml, safetyHtml, briefingHtml, briefingText, form204Html, form204Text, form214Html, form214Text, sitrepHtml, sitrepText, sitrepFormHtml, iapHtml, iapText, form211Html, form211Text, orgHtml, orgText, transferDialogHtml, peopleBoardHtml, peopleChipsHtml, findPersonHtml, placeListHtml, placeListText, esc } from './ui.js';
import { nextZoneCode, hhmm, centroid, periodLabel, zoneAt as zoneAtRule, markingFor, unitLabel as unitLabelOf, replayIndex, sampleAt, transferText, kindText, wherePatch, evacueeWho, evacueeWhere, FACILITY_KINDS } from '../shared/rules.js';
import { currentTheme, toggleTheme, storedTheme } from '../shared/theme.js';
import { availableLayers, storedLayer, setOverlayHidden, boundsOk } from '../shared/layers.js';
import { codeFromSearch } from '../shared/qr.js';
import { photoCaption, photoFileName, imageType, withCaption, zip, whenText } from './photo-export.js';
const FACILITY_LABEL = Object.fromEntries(FACILITY_KINDS.map(([v, label]) => [v, label]));

const LAST_INCIDENT = 'ic.base.incident';
// #log is the log alone in its own window (the Pop out button), for a second screen: the same
// page, the same Data, with the map, the tools and the sidebar left out and the log always open.
const LOG_ONLY = location.hash === '#log';
if (LOG_ONLY) document.documentElement.classList.add('log-only');
const LOG_KEY = LOG_ONLY ? 'ic.base.log.popout' : 'ic.base.log';   // this screen's log: folded or open, which group
const BOARD_KEY = 'ic.base.board';   // the resources board: by kind or by status, a device setting
const DEFAULT_VIEW = [30.2672, -97.7431, 12];

const $ = (sel) => document.querySelector(sel);
const data = window.sb ? new Data(window.sb) : null;
const state = { selected: null, newZone: null, pendingPolygon: null, oosFor: null, periodNext: false, printZone: null, print: null, placeZone: null, placeKind: null, replay: null, log: loadLogPrefs(), modalZone: null, highlight: null, layersOpen: false, layersUpload: false, hoursPeriod: null, people: { q: '', quals: new Set(), add: false, addUnit: null, tab: 'people' }, board: loadBoardPref(), transfer: null, find: { top: '', home: '' }, evAdd: null, printFacility: null };
function loadBoardPref() { try { return localStorage.getItem(BOARD_KEY) === 'status' ? 'status' : 'kind'; } catch (e) { return 'kind'; } }
function loadLogPrefs() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(LOG_KEY) || '{}') || {}; } catch (e) { /* storage blocked */ }
  return { open: LOG_ONLY || saved.open !== false, group: saved.group || 'all', q: '', seenAt: null };
}
function saveLogPrefs() { try { localStorage.setItem(LOG_KEY, JSON.stringify({ open: state.log.open, group: state.log.group })); } catch (e) { /* storage blocked */ } }
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
  if (!user) { show('auth'); return; }
  const last = localStorage.getItem(LAST_INCIDENT);
  if (last) {
    try { await openIncident(last); return; } catch (e) { console.warn('could not reopen', e); localStorage.removeItem(LAST_INCIDENT); }
  }
  await showPicker();
}

function onData(what) {
  if (what === 'auth') {
    if (!data.user) { show('auth'); return; }
    if ($('#auth').hidden === false) showPicker();
  }
  if (what === 'change' || what === 'open') queueDraw();
  if (what === 'realtime') drawLive();
}

// ---- auth
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
async function showPicker() {
  show('pick');
  $('#pick-user').textContent = data.user ? data.user.email : '';
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
function clearLineHtml(r) {
  if (r.status !== 'closed') return '';
  if (r.personal_cleared_at) return `<div class="pick-sub" data-clear="${r.id}">Personal records cleared ${esc(new Date(r.personal_cleared_at).toLocaleDateString())} by rule · the names, the log and the forms stay</div>`;
  const when = r.clear_personal_at ? new Date(r.clear_personal_at) : null;
  return `<div class="pick-sub warn" data-clear="${r.id}"><span>Personal records clear by rule ${when ? 'on ' + esc(when.toLocaleDateString()) : 'after the close'}: licences, dates of birth, addresses, licence photos and the names of people sheltered</span>${r.role === 'ops' ? `<button class="btn sm" data-action="clear-personal" data-id="${r.id}">Clear now</button><button class="btn sm" data-action="keep-personal" data-id="${r.id}">Keep 30 more days</button>` : ''}</div>`;
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
  localStorage.setItem(LAST_INCIDENT, id);
  state.selected = null; state.newZone = null; state.pendingPolygon = null;
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
}

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

function drawAll() {
  if (!data.incident || $('#app').hidden) return;
  const inc = data.incident;
  $('#inc-name').textContent = inc.name;
  const cur = data.currentPeriod();
  $('#inc-sub').textContent = [cur ? periodLabel(cur) + (cur.ic_name ? ', IC ' + cur.ic_name : '') : inc.period, inc.base_name ? 'Base: ' + inc.base_name : null, `${data.activeUnits().length} units`, `${data.zones().length} divisions, ${data.zones().filter((z) => z.status === 'cleared').length} cleared`].filter(Boolean).join(' · ');
  $('#inc-code').textContent = 'Join code ' + inc.code;
  drawLog();
  drawLegend();
  drawLayers();
  drawFind();
  if (!$('#briefing').hidden) drawBriefing();
  if (!$('#people').hidden) drawPeople();
  drawLive();
  if (LOG_ONLY) return;   // the pop-out is the log alone: no map, sidebar or bars to draw
  map.render(data, state);
  drawSide();
  drawZoneModal();
  const md = $('#mayday');
  const mh = maydayHtml(data);
  md.hidden = !mh;
  if (md.__html !== mh) { md.__html = mh; md.innerHTML = mh; }
  md.classList.toggle('ack', !!mh && data.alerts().every((a) => a.acknowledged_at));
  const sf = $('#safety');
  const sh = safetyHtml(data);
  sf.hidden = !sh;
  if (sf.__html !== sh) { sf.__html = sh; sf.innerHTML = sh; }
  $('#bars-quiet').hidden = !!(mh || sh);
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
      panel.__html = html; panel.innerHTML = html;
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
function unseenCount() { return state.log.seenAt ? data.events().filter((e) => e.at > state.log.seenAt).length : 0; }
function drawLog() {
  const box = $('#logbox');
  box.classList.toggle('closed', !state.log.open);
  $('[data-action="log-toggle"]').setAttribute('aria-expanded', String(state.log.open));
  $('#log-filters').innerHTML = logFiltersHtml(data, state);
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
  const html = kind === 'shelter' ? placeListHtml(data, pf) : kind === '204' ? form204Html(data, z) : kind === '214' ? form214Html(data) : kind === '211' ? form211Html(data) : kind === 'join' ? joinCardHtml(data) : kind === 'hours' ? hoursHtml(data, state) : kind === 'sitrep' ? sitrepFormHtml(data) + sitrepHtml(data) : kind === 'iap' ? iapHtml(data) : kind === 'org' ? orgHtml(data) : briefingHtml(data);
  const page = $('#briefing-page');
  const focused = document.activeElement && page.contains(document.activeElement) && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
  if (page.__html !== html && !focused) { page.__html = html; page.innerHTML = html; }
  page.className = 'briefing-page kind-' + kind;
  $('#briefing-title').textContent = kind === 'shelter' ? 'People at ' + (pf.name || 'the facility') : kind === '204' ? 'Division ' + z.code + ' assignment (ICS 204)' : kind === '214' ? 'Activity log (ICS 214)' : kind === '211' ? 'Check-in list (ICS 211)' : kind === 'join' ? 'Join card · deployment briefing' : kind === 'hours' ? 'Hours on scene' : kind === 'sitrep' ? 'Situation report (ICS 209)' : kind === 'iap' ? 'Incident Action Plan' : kind === 'org' ? 'Organization chart (ICS 207)' : 'Shift-change briefing';
  $('#briefing-when').textContent = data.incident.name + ' · ' + (data.currentPeriod() ? periodLabel(data.currentPeriod()) : '') + ' · ' + hhmm(new Date());
}
function briefingAsText() {
  const z = state.printZone ? data.zone(state.printZone) : null;
  const kind = z ? '204' : (state.print || 'briefing');
  if (kind === 'shelter') { const f = data.facility(state.printFacility); return f ? placeListText(data, f) : ''; }
  return kind === '204' ? form204Text(data, z) : kind === '214' ? form214Text(data) : kind === '211' ? form211Text(data) : kind === 'join' ? joinCardText(data) : kind === 'hours' ? hoursCsvText(data, state) : kind === 'sitrep' ? sitrepText(data) : kind === 'iap' ? iapText(data) : kind === 'org' ? orgText(data) : briefingText(data);
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
    if (period) { const cur = data.currentPeriod(); const p = await data.startPeriod({ endsAt: new Date(Date.now() + 12 * 3600000).toISOString(), ic: c.ic_name, ops: cur.ops_chief, safety: cur.safety_officer, notes: cur.notes, carry: true, planning: cur.planning_chief, logistics: cur.logistics_chief, finance: cur.finance_chief, unified: cur.unified, pio: cur.pio, liaison: cur.liaison }); toast('Operational period ' + p.number + ' started'); }
  }
  toast('Command transferred to ' + c.ic_name + (notify ? ' · every unit is told' : ''));
  queueDraw();
  if (briefing) openOverlay('briefing');
}
$('#transfer-dialog').addEventListener('close', () => { state.transfer = null; });
$('#transfer-dialog').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeTransfer(); });

// ---- the People board: everyone on scene by unit, in a page of its own. The find box and the chips
// live in state.people; the page is redrawn on every change unless a field in it has focus.
function openPeople() { $('#people').hidden = false; drawPeople(); }
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
// The samples are fetched once per range; the slider and Play only move the moment shown.
const REPLAY_TICK_MS = 100;
const REPLAY_MAX_SAMPLES = 2000;   // per unit, so a whole day comes back in one read
let replayTimer = null;

function replayRange(kind) {
  const inc = data.incident, p = data.currentPeriod();
  const now = Date.now(), opened = new Date(inc.created_at).getTime();
  if (kind === 'hour') return [now - 3600000, now];
  if (kind === 'all') return [opened, now];
  return [p ? new Date(p.starts_at).getTime() : opened, p && p.closed_at ? new Date(p.closed_at).getTime() : now];
}
async function openReplay(kind) {
  stopReplayPlay();
  const [from, to] = replayRange(kind || $('#replay-range').value);
  const every = Math.max(10, Math.ceil((to - from) / 1000 / REPLAY_MAX_SAMPLES));
  const r = { from, to, t: from, by: new Map(), playing: false, every, loading: true };
  state.replay = r;
  $('#replay').hidden = false;
  $('#btn-replay').classList.add('on');
  $('#replay-log').textContent = 'Loading the positions…';
  try {
    const samples = await data.replay(new Date(from).toISOString(), new Date(to).toISOString(), every);
    if (state.replay !== r) return;   // closed or reopened on another range meanwhile
    r.by = replayIndex(samples);
    r.loading = false;
    // start where the first report of the range was made, so there is something to see at once
    const first = Math.min(...[...r.by.values()].map((l) => new Date(l[0].at).getTime()));
    r.t = Number.isFinite(first) ? Math.min(to, Math.max(from, first)) : from;
    map.setReplay(r.by);
    drawReplay();
  } catch (err) { toast(err.message || String(err), true); closeReplay(); }
}
function drawReplay() {
  const r = state.replay;
  if (!r) return;
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
  if (!r || r.loading) return;
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
  $('#replay').hidden = true;
  $('#btn-replay').classList.remove('on');
  queueDraw();
}
$('#replay-slider').addEventListener('input', (e) => {
  const r = state.replay;
  if (!r) return;
  stopReplayPlay();
  r.t = r.from + (r.to - r.from) * Number(e.target.value) / 1000;
  drawReplay();
});
$('#replay-range').addEventListener('change', (e) => { if (state.replay) openReplay(e.target.value); });

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
  $('#live-text').textContent = ok ? 'live' : (data.realtime === 'off' ? 'not connected' : String(data.realtime).toLowerCase().replace(/_/g, ' '));
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
  const photos = data.publicPhotos().slice().sort((a, b) => (a.taken_at < b.taken_at ? -1 : 1));
  if (!photos.length) { toast('No photo is cleared for the public yet', true); return; }
  const inc = data.incident, now = new Date();
  btn.disabled = true;
  toast('Preparing ' + photos.length + ' photo' + (photos.length === 1 ? '' : 's') + '…');
  try {
    const files = [], lines = [], missed = [], names = new Set();
    for (const p of photos) {
      const zone = p.zone_id ? data.zone(p.zone_id) : null, m = data.member(p.user_id), takenAt = new Date(p.taken_at);
      const caption = photoCaption({ note: p.note, place: zone ? (zone.name ? zone.name + ' (division ' + zone.code + ')' : 'Division ' + zone.code) : '', incident: inc.name, takenAt, credit: (m && m.agency) || unitLabelOf(m) });
      try {
        const res = await fetch(await data.photoUrl(p.storage_path));
        if (!res.ok) throw new Error('the server said ' + res.status);
        const raw = new Uint8Array(await res.arrayBuffer());
        const first = photoFileName({ takenAt, code: zone ? zone.code : '', note: p.note, ext: imageType(raw) || 'jpg' });
        let name = first;
        for (let i = 2; names.has(name); i++) name = first.replace(/(\.\w+)$/, '_' + i + '$1');   // two in the same minute and place
        names.add(name);
        files.push({ name, bytes: withCaption(raw, { caption, title: p.note || '', credit: (m && m.agency) || '', takenAt }), date: takenAt });
        lines.push(name, caption, '');
      } catch (err) { missed.push(hhmm(p.taken_at) + ' · ' + unitLabelOf(m) + (p.note ? ' · ' + p.note : '') + ': not saved, ' + (err.message || err)); }
    }
    const head = [inc.name + ' · photos cleared for public information by Operations', 'Saved ' + whenText(now) + ' · ' + files.length + ' photo' + (files.length === 1 ? '' : 's') + '. Each caption is also written into its file (the description a newsroom tool reads).', ''];
    files.push({ name: 'captions.txt', bytes: new TextEncoder().encode(head.concat(lines, missed.length ? ['Not saved:'].concat(missed) : []).join('\n')), date: now });
    const blob = new Blob([zip(files)], { type: 'application/zip' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${inc.code}-cleared-photos-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${hhmm(now).replace(':', '')}.zip`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(missed.length ? `${files.length - 1} saved with captions; ${missed.length} could not be fetched (listed in captions.txt)` : `${files.length - 1} photo${files.length === 2 ? '' : 's'} saved with captions`, !!missed.length);
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
  if (state.find.top && !e.target.closest('.find-top')) closeFind();
  else if (state.find.top && e.target.closest('#find-pop [data-action="select-facility"], #find-pop [data-action="select-unit"]')) setTimeout(closeFind, 0);
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const act = btn.dataset.action, id = btn.dataset.id;
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
      case 'new-ops-code': if (!data.opsCode() || confirm('Replace the Operations code? Whoever has the old one can no longer join with it; those already on the incident stay.')) { await data.newOpsCode(); toast('New Operations code; the old one no longer joins'); queueDraw(); } break;
      case 'people-tab': state.people.tab = btn.dataset.tab === 'members' ? 'members' : 'people'; drawPeople(); break;
      case 'member-role': {
        const m = data.member(id);
        if (!m) break;
        if (btn.dataset.role === 'unit') {
          const p = data.profileOf(id);
          const name = prompt('Unit name for ' + ((p && p.full_name) || 'this member') + ' (what the field calls them):', m.unit_name && m.unit_name !== 'Operations' ? m.unit_name : '');
          if (name == null) break;
          await data.setRole(id, 'unit', name.trim() || null);
          toast(((p && p.full_name) || 'The member') + ' is now a unit' + (name.trim() ? ', ' + name.trim() : ''));
        } else {
          if (!confirm(`Make ${unitLabelOf(m)} Operations? They can then run the incident from the base: draw divisions, assign units, change roles, clear records.`)) break;
          await data.setRole(id, 'ops');
          toast(unitLabelOf(m) + ' is now Operations');
        }
        drawPeople();
        break;
      }
      case 'member-remove': {
        const m = data.member(id);
        if (m && confirm(`Remove ${unitLabelOf(m)} from the incident? Everything they sent stays on record, their phone shows they were removed, and you can put them back from the Members tab.`)) { await data.removeMember(id); toast(unitLabelOf(m) + ' removed from the incident'); drawPeople(); }
        break;
      }
      case 'member-restore': { const m = data.member(id); await data.restoreMember(id); toast((m ? unitLabelOf(m) : 'The member') + ' is back on the incident'); drawPeople(); break; }
      case 'clear-personal': {
        if (!confirm('Clear the personal records of this incident now? Licence numbers, dates of birth, addresses and licence photos of its members (unless they are on another open incident), and the names of the people sheltered, are blanked. Names, phones, the log and the forms stay. This cannot be undone.')) break;
        await data.clearPersonal(id);
        toast('Personal records cleared');
        await showPicker();
        break;
      }
      case 'keep-personal': await data.keepPersonal(id, 30); toast('Kept 30 more days'); await showPicker(); break;
      case 'verify-profile': await data.verifyProfile(id, true); toast('Marked verified'); break;
      case 'unverify-profile': await data.verifyProfile(id, false); toast('Verification withdrawn'); break;
      case 'copy-join-link': await navigator.clipboard.writeText(fieldJoinUrl(data.incident.code)); toast('Join link copied'); break;
      case 'print-join': openOverlay('join'); break;
      case 'select-zone': selectFromLog({ type: 'zone', id }); break;
      case 'select-photo': selectFromLog({ type: 'photo', id }); break;
      case 'photo-public': await data.setPhotoPublic(id, btn.dataset.ok === '1'); toast(btn.dataset.ok === '1' ? 'Cleared for public information' : 'Withdrawn from public information'); break;
      case 'replay': if (state.replay) closeReplay(); else await openReplay(); break;
      case 'replay-play': if (state.replay && state.replay.playing) { stopReplayPlay(); drawReplay(); } else playReplay(); break;
      case 'replay-close': closeReplay(); break;
      case 'theme': toggleTheme(); drawTheme(); queueDraw(); break;
      case 'log-toggle': if (LOG_ONLY) break; state.log.open = !state.log.open; if (state.log.open) markLogSeen(); saveLogPrefs(); drawLog(); map.invalidate(); break;
      case 'log-group': state.log.group = btn.dataset.group || 'all'; saveLogPrefs(); drawLog(); break;
      case 'log-notable': await data.setNotable(id, btn.dataset.on === '1'); drawLog(); break;
      case 'log-popout': popOutLog(); break;
      case 'print-214': openOverlay('214'); break;
      case 'people': if (LOG_ONLY) { selectFromLog({ type: 'people' }); break; } state.people.addUnit = btn.dataset.unit || state.people.addUnit; if (btn.dataset.tab) state.people.tab = btn.dataset.tab; openPeople(); break;
      case 'close-people': closePeople(); break;
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
      case 'person-remove': { const p = data.person(id); if (p && confirm(`Take ${p.name} off the roster? The record is kept and can be put back.`)) { await data.archivePerson(id); toast(p.name + ' removed'); } break; }
      case 'person-restore': await data.updatePerson(id, { archived_at: null }); break;
      case 'overlay-hide': setOverlayHidden(id, true); queueDraw(); break;
      case 'overlay-show': setOverlayHidden(id, false); queueDraw(); break;
      case 'overlay-remove': { const o = data.overlay(id); if (o && window.confirm(`Remove "${o.name || 'this imagery'}" from the map for everyone? It is kept and can be put back.`)) { await data.archiveOverlay(id); toast('Imagery removed from the map'); } break; }
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
        if (!confirm(`${pass === 'secondary' ? 'Mark ' + z.code + ' clear (secondary search complete)' : 'Mark the primary search of ' + z.code + ' complete'} from the base? Normally the unit in the division does this from the field.`)) break;
        await data.finishPass(id, pass, { marking: markingFor('BASE', new Date(), [], 0) });
        break;
      }
      case 'close-panel': select(null); break;
      case 'set-priority': await data.updateZone(id, { priority: Number(btn.dataset.p) }); break;
      case 'assign': { const z = data.zone(id); await data.assignZone(id, z && z.assigned_to === btn.dataset.user ? null : btn.dataset.user); break; }
      case 'resolve-hazard': await data.resolveHazard(id); break;
      case 'zoom-zone': { const z = data.zone(id); if (z) map.fitPolygon(z.polygon); break; }
      case 'pan-to': map.panTo(Number(btn.dataset.lat), Number(btn.dataset.lng)); break;
      case 'reopen-zone': { const z = data.zone(id); if (z) await data.updateZone(id, { status: z.assigned_to ? 'active' : 'open', marking: null }); break; }
      case 'ack-alert': await data.ackAlert(id); break;
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
        if (m && confirm(`Check ${unitLabelOf(m)} out? Its zones go back to not started.`)) await data.setStatus(id, 'checked_out');
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
    if (sel.dataset.select === 'unit-facility') { await data.setUnitFacility(sel.dataset.id, sel.value || null); sel.blur(); toast(unitLabelOf(data.member(sel.dataset.id)) + (sel.value ? ' works at ' + (data.facility(sel.value).name || 'the shelter') : ': no shelter chosen')); queueDraw(); }
    if (sel.dataset.select === 'person-buddy') { await data.updatePerson(sel.dataset.id, { buddy_id: sel.value || null }); sel.blur(); queueDraw(); }
  } catch (err) { toast(err.message || String(err), true); }
});

// While outlining, Backspace or Delete takes the last corner off (not while typing in a field).
document.addEventListener('keydown', (e) => {
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
  setHint('Click a division, a unit or a photo pin to open it.');
}

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
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
      const patch = { kind: form.kind.value, name: form.name.value.trim(), contact: form.contact.value.trim(), notes: form.notes.value.trim() };
      if (form.beds) patch.beds = form.beds.value === '' ? null : Math.max(0, Math.round(Number(form.beds.value)));
      if (form.expected) patch.expected = form.expected.value.trim();
      await data.updateFacility(form.dataset.id, patch);
      toast('Saved');
      if (document.activeElement && form.contains(document.activeElement)) document.activeElement.blur();
      queueDraw();
    } else if (form.dataset.form === 'evacuee-add') {
      const label = form.label.value.trim();
      if (!label) { toast('Who: a name, or "family of 4"', true); return; }
      const ev = await data.addEvacuee(crypto.randomUUID(), { label, count: Math.min(999, Math.max(1, Number(form.count.value) || 1)), needs: [...form.querySelectorAll('input[name="need"]:checked')].map((i) => i.value), from_text: form.from.value.trim(), note: form.note.value.trim(), status: 'here', facility_id: form.dataset.facility });
      state.evAdd = null;
      toast(evacueeWho(ev) + ' signed in');
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
      const patch = { ic_name: form.ic.value.trim(), ops_chief: form.ops.value.trim(), safety_officer: form.safety.value.trim(), notes: form.notes.value.trim(), ends_at: timeToIso(form.ends.value), unified: form.unified.value.trim(), planning_chief: form.planning.value.trim(), logistics_chief: form.logistics.value.trim(), finance_chief: form.finance.value.trim(), pio: form.pio.value.trim(), liaison: form.liaison.value.trim() };
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
      const payload = { endsAt: timeToIso(form.ends.value), ic: form.ic.value.trim(), ops: form.ops.value, safety: form.safety.value, notes: form.notes.value, carry: form.carry.checked, planning: form.planning.value, logistics: form.logistics.value, finance: form.finance.value, unified: form.unified.value, pio: form.pio.value, liaison: form.liaison.value };
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
setInterval(() => {
  $('#clock').textContent = hhmm(new Date());
  if (!$('#app').hidden && data.incident) queueDraw();
}, 15000);
$('#clock').textContent = hhmm(new Date());

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

// a join link opened on the base (?join=<code>) fills the picker's join form
(function takeJoinLink() {
  const code = codeFromSearch(location.search);
  if (!code) return;
  const input = document.querySelector('#join-form input[name="code"]');
  if (input) input.value = code;
  try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* fine */ }
})();

boot();
