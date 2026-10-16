// The base view: sign in, pick or open an incident, then keep the map, the sidebar and the log
// drawn from the shared data module while it follows live changes.
import { Data } from '../shared/data.js';
import { BaseMap } from './map.js';
import { zonesHtml, panelHtml, logHtml, maydayHtml, safetyHtml, briefingHtml, briefingText, form204Html, form204Text, sitrepHtml, sitrepText, sitrepFormHtml, iapHtml, iapText, esc } from './ui.js';
import { nextZoneCode, hhmm, centroid, periodLabel, zoneAt as zoneAtRule, markingFor, unitLabel as unitLabelOf, replayIndex, sampleAt, FACILITY_KINDS } from '../shared/rules.js';
const FACILITY_LABEL = Object.fromEntries(FACILITY_KINDS.map(([v, label]) => [v, label]));

const LAST_INCIDENT = 'ic.base.incident';
const DEFAULT_VIEW = [30.2672, -97.7431, 12];

const $ = (sel) => document.querySelector(sel);
const data = window.sb ? new Data(window.sb) : null;
const state = { selected: null, newZone: null, pendingPolygon: null, oosFor: null, periodNext: false, printZone: null, print: null, placeZone: null, placeKind: null, replay: null };
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
  try {
    const rows = await data.myIncidents();
    list.innerHTML = rows.length ? rows.map((r) => `
      <button class="pick-row" data-action="open-incident" data-id="${r.id}">
        <span><span class="name">${esc(r.name)}</span><br><span class="sub">${esc(r.period || '')}${r.base_name ? ' · ' + esc(r.base_name) : ''} · you are ${r.role === 'ops' ? 'Operations' : esc(r.unit_name || 'a unit')}</span></span>
        <span class="spacer"></span>
        <span class="pill mono">${esc(r.code)}</span>
        <span class="badge ${r.status === 'active' ? 'active' : ''}">${esc(r.status)}</span>
      </button>`).join('') : '<p class="muted">None yet. Open one below, or join with a code.</p>';
  } catch (err) { list.innerHTML = `<p class="msg">${esc(err.message || err)}</p>`; }
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
  if (!map) {
    map = new BaseMap($('#map'), {
      onZone: (zid) => select({ type: 'zone', id: zid }),
      onPhoto: (pid) => select({ type: 'photo', id: pid }),
      onUnit: (uid) => select({ type: 'unit', id: uid }),
      onStructure: (sid) => select({ type: 'structure', id: sid }),
      onPlace: (lat, lng) => placeStructure(lat, lng),
      onFacility: (fid) => select({ type: 'facility', id: fid }),
      onPlaceFacility: (lat, lng) => placeFacility(lat, lng),
      onHazard: (hid) => { const h = data.hazards(true).find((x) => x.id === hid); if (h && h.zone_id) select({ type: 'zone', id: h.zone_id }); },
      onBlank: () => { if (state.selected && state.selected.type !== 'newzone') select(null); },
      onDraftChange: (n) => { $('#tool-hint').textContent = n < 3 ? `${n} of at least 3 points. Click the map to add the next corner.` : `${n} points. Click to add more, or press Finish.`; }
    });
  }
  map.trails = new Map();
  if (inc.boundary) map.fitPolygon(inc.boundary);
  else if (inc.center_lat != null && inc.center_lng != null) map.setView(inc.center_lat, inc.center_lng, inc.zoom || 14);
  else { const z = data.zones()[0]; if (z) map.fitPolygon(z.polygon); else map.setView(DEFAULT_VIEW[0], DEFAULT_VIEW[1], DEFAULT_VIEW[2]); }
  map.invalidate();
  drawAll();
}

function select(sel) {
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
}

function drawAll() {
  if (!data.incident || $('#app').hidden) return;
  const inc = data.incident;
  $('#inc-name').textContent = inc.name;
  const cur = data.currentPeriod();
  $('#inc-sub').textContent = [cur ? periodLabel(cur) + (cur.ic_name ? ', IC ' + cur.ic_name : '') : inc.period, inc.base_name ? 'Base: ' + inc.base_name : null, `${data.activeUnits().length} units`, `${data.zones().length} divisions, ${data.zones().filter((z) => z.status === 'cleared').length} cleared`].filter(Boolean).join(' · ');
  $('#inc-code').textContent = 'Join code ' + inc.code;
  map.render(data, state);
  $('#zones').innerHTML = zonesHtml(data, state);
  const panel = $('#panel');
  const focused = document.activeElement && panel.contains(document.activeElement) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
  if (!focused) {
    panel.innerHTML = panelHtml(data, state);
    if (state.selected && state.selected.type === 'photo') loadPhoto(state.selected.id);
  }
  $('#log').innerHTML = logHtml(data);
  const md = $('#mayday');
  const mh = maydayHtml(data);
  md.hidden = !mh;
  md.innerHTML = mh;
  md.classList.toggle('ack', !!mh && data.alerts().every((a) => a.acknowledged_at));
  if (!$('#briefing').hidden) drawBriefing();
  const sf = $('#safety');
  const sh = safetyHtml(data);
  sf.hidden = !sh;
  sf.innerHTML = sh;
  drawLive();
}

// One overlay draws the briefing, a division's 204, the situation report or the whole IAP.
function drawBriefing() {
  if (!data.incident) return;
  const z = state.printZone ? data.zone(state.printZone) : null;
  const kind = z ? '204' : (state.print || 'briefing');
  const html = kind === '204' ? form204Html(data, z) : kind === 'sitrep' ? sitrepFormHtml(data) + sitrepHtml(data) : kind === 'iap' ? iapHtml(data) : briefingHtml(data);
  const page = $('#briefing-page');
  const focused = document.activeElement && page.contains(document.activeElement) && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
  if (page.__html !== html && !focused) { page.__html = html; page.innerHTML = html; }
  page.className = 'briefing-page kind-' + kind;
  $('#briefing-title').textContent = kind === '204' ? 'Division ' + z.code + ' assignment (ICS 204)' : kind === 'sitrep' ? 'Situation report (ICS 209)' : kind === 'iap' ? 'Incident Action Plan' : 'Shift-change briefing';
  $('#briefing-when').textContent = data.incident.name + ' · ' + (data.currentPeriod() ? periodLabel(data.currentPeriod()) : '') + ' · ' + hhmm(new Date());
}
function briefingAsText() {
  const z = state.printZone ? data.zone(state.printZone) : null;
  const kind = z ? '204' : (state.print || 'briefing');
  return kind === '204' ? form204Text(data, z) : kind === 'sitrep' ? sitrepText(data) : kind === 'iap' ? iapText(data) : briefingText(data);
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

// ---- actions
document.addEventListener('click', async (e) => {
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
      case 'select-zone': select({ type: 'zone', id }); break;
      case 'select-photo': select({ type: 'photo', id }); break;
      case 'photo-public': await data.setPhotoPublic(id, btn.dataset.ok === '1'); toast(btn.dataset.ok === '1' ? 'Cleared for public information' : 'Withdrawn from public information'); break;
      case 'replay': if (state.replay) closeReplay(); else await openReplay(); break;
      case 'replay-play': if (state.replay && state.replay.playing) { stopReplayPlay(); drawReplay(); } else playReplay(); break;
      case 'replay-close': closeReplay(); break;
      case 'select-unit': select({ type: 'unit', id }); break;
      case 'select-structure': select({ type: 'structure', id }); break;
      case 'select-facility': select({ type: 'facility', id }); break;
      case 'place-facility': {
        const sel = $('#facility-kind');
        state.placeKind = sel ? sel.value : 'staging';
        map.startDraw('facility');
        $('#btn-boundary').classList.remove('on'); $('#btn-zone').classList.remove('on');
        $('#draw-btns').hidden = false;
        $('#tool-hint').textContent = 'Click the map where the ' + (data.facilities ? (FACILITY_LABEL[state.placeKind] || 'facility').toLowerCase() : 'facility') + ' is.';
        break;
      }
      case 'close-facility': await data.updateFacility(id, { closed_at: new Date().toISOString() }); break;
      case 'reopen-facility': await data.updateFacility(id, { closed_at: null }); break;
      case 'channel-remove': { const ch = data.channels().slice(); ch.splice(Number(btn.dataset.i), 1); await data.setChannels(ch); break; }
      case 'place-structures': {
        state.placeZone = id;
        state.placeN = 0;
        map.startDraw('structures');
        $('#btn-boundary').classList.remove('on'); $('#btn-zone').classList.remove('on');
        $('#draw-btns').hidden = false;
        $('#tool-hint').textContent = 'Click the map once per structure to place it in ' + (data.zone(id) ? data.zone(id).code : 'the division under the click') + ', then press Finish.';
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
      case 'period': state.periodNext = false; select({ type: 'period' }); break;
      case 'period-next': state.periodNext = true; select({ type: 'period' }); break;
      case 'period-next-cancel': state.periodNext = false; queueDraw(); break;
      case 'objective-done': await data.updateObjective(id, { done_at: new Date().toISOString() }); break;
      case 'objective-undo': await data.updateObjective(id, { done_at: null }); break;
      case 'briefing': openOverlay('briefing'); break;
      case 'print-204': openOverlay('204', id); break;
      case 'sitrep': openOverlay('sitrep'); break;
      case 'iap': openOverlay('iap'); break;
      case 'close-briefing': $('#briefing').hidden = true; state.printZone = null; state.print = null; break;
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
        $('#tool-hint').textContent = mode === 'boundary' ? 'Click the map to outline the incident area, then press Finish.' : 'Click the map to outline the division, then press Finish.';
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
  const sel = e.target.closest('[data-select]');
  if (!sel) return;
  try {
    if (sel.dataset.select === 'zone-objective') { await data.updateZone(sel.dataset.id, { objective_id: sel.value || null }); sel.blur(); queueDraw(); }
  } catch (err) { toast(err.message || String(err), true); }
});

function stopDraw() {
  map.cancelDraw();
  state.placeZone = null;
  $('#btn-boundary').classList.remove('on');
  $('#btn-zone').classList.remove('on');
  $('#draw-btns').hidden = true;
  $('#tool-hint').textContent = 'Click a division, a unit or a photo pin to open it.';
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
      await data.updateZone(form.dataset.id, { code: form.code.value.trim().toUpperCase(), name: form.name.value.trim(), structures: Number(form.structures.value) || 0, work_assignment: form.work_assignment.value.trim(), instructions: form.instructions.value.trim(), channel: form.channel.value.trim(), supervisor: form.supervisor.value.trim() });
      toast('Saved');
      if (document.activeElement && form.contains(document.activeElement)) document.activeElement.blur();
      queueDraw();
    } else if (form.dataset.form === 'sitrep-edit') {
      await data.updatePeriod(form.dataset.id, { sitrep: { summary: form.summary.value.trim(), needs: form.needs.value.trim(), outlook: form.outlook.value.trim() } });
      toast('Situation report saved');
      if (document.activeElement && form.contains(document.activeElement)) document.activeElement.blur();
      drawBriefing();
    } else if (form.dataset.form === 'facility-edit') {
      await data.updateFacility(form.dataset.id, { kind: form.kind.value, name: form.name.value.trim(), contact: form.contact.value.trim(), notes: form.notes.value.trim() });
      toast('Saved');
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
    } else if (form.dataset.form === 'incident-edit') {
      await data.setLeadAgency(form.lead_agency.value);
      toast('Saved');
      if (document.activeElement && form.contains(document.activeElement)) document.activeElement.blur();
      queueDraw();
    } else if (form.dataset.form === 'period-edit') {
      await data.updatePeriod(form.dataset.id, { ic_name: form.ic.value.trim(), ops_chief: form.ops.value.trim(), safety_officer: form.safety.value.trim(), notes: form.notes.value.trim(), ends_at: timeToIso(form.ends.value), unified: form.unified.value.trim() });
      toast('Period saved');
      queueDraw();
    } else if (form.dataset.form === 'period-start') {
      const p = await data.startPeriod({ endsAt: timeToIso(form.ends.value), ic: form.ic.value, ops: form.ops.value, safety: form.safety.value, notes: form.notes.value, carry: form.carry.checked });
      if (form.unified.value.trim()) await data.updatePeriod(p.id, { unified: form.unified.value.trim() });
      state.periodNext = false;
      toast('Operational period ' + p.number + ' started');
      queueDraw();
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

boot();
