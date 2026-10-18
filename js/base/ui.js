// The base sidebar and log: plain HTML strings from the data, with data-action attributes that
// main.js listens for. Nothing here talks to Supabase.
import { divisionMapHtml } from './print-map.js';
import { hiddenOverlays, boundsText, availableLayers, storedLayer, googleKey } from '../shared/layers.js';
import { joinUrl, qrSvg } from '../shared/qr.js';
import { licenceExpired, licenceTail } from '../shared/licence.js';
import { hoursRows, hoursTotals, hoursCsv } from '../shared/hours.js';
import { sortHazards, sceneStart, stintText, revisitWords, sceneOver, peopleOverScene, sceneLine, sceneText, sinceSummary, hazardUrgent, whenText, dateText, periodLine, periodState, overdueText, compass, hhmm, ago, pct, unitLabel, unitWithKind, kindText, unitKind, unitsForRequest, kindsAsked, commandLines, centroid, zoneStatusText, latLngText, zoneAt, periodLabel, structureSummary, waterText, facilityKind, facilityLabel, commandText, agenciesOn, agencyLine, urgencyLabel, REQUEST_KINDS, REQUEST_STATUS, requestLine, URGENCY, qualLabel, qualsText, personOn, onSceneText, crewNames, peopleMatch, STATUS_LABEL, OOS_REASONS, STRUCTURE_STATUS, OCCUPANTS, WATER, DAMAGE, FACILITY_KINDS, QUALIFICATIONS, UNIT_KINDS, identityGiven, NO_ID_TEXT, NEEDS, LEFT_CHOICES, PERSON_PLACES, evacueeWho, evacueeWhere, evacueeFrom, evacueeMatch, whereValue, needsText, placeCounts, needsTotalsText, bedsText, peopleShelteredLine, placeWordsOf, profileReady, waterState, unitsInWater, rotationText, durationText, parAnswerText, HEAD_COUNT_UNKNOWN } from '../shared/rules.js';
import { orgTree, orgLines, deputyAdvice, agencyReps, agencyRepLines, hurtText, deploymentLines, whoToAsk, onSceneLine, SPAN_MAX } from '../shared/briefings.js';

export function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
// "live" is right for a position; for something sent, say "just now".
const since = (iso) => { const a = ago(iso); return a === 'live' ? 'just now' : a; };

function assignedLabel(data, z) { return z.assigned_to ? unitLabel(data.member(z.assigned_to)) : ''; }

export function zonesHtml(data, state) {
  const sel = state.selected || {};
  const zones = data.zones();
  if (!zones.length) return '<p class="muted" style="padding:8px 14px">No divisions yet. Press Draw division and click the map to outline one.</p>';
  return zones.map((z) => `
    <button class="zr${sel.type === 'zone' && sel.id === z.id ? ' sel' : ''}${state.highlight ? (z.status === state.highlight ? ' hl' : ' dim') : ''}" data-action="select-zone" data-id="${z.id}">
      <span class="pb p${z.priority}">${z.priority}</span>
      <span class="zr-main">
        <span class="zr-top"><span class="zr-id">${esc(z.code)}</span><span class="zr-name">${esc(z.name)}</span></span>
        <span class="zr-sub">${esc(zoneStatusText(z, assignedLabel(data, z), data.zoneAccepted(z)))}${z.objective_id && data.objective(z.objective_id) ? ' · objective ' + data.objective(z.objective_id).number : ''}</span>
      </span>
      <span class="sdot ${z.status}"></span>
    </button>`).join('');
}

export function panelHtml(data, state) {
  const sel = state.selected || {};
  if (sel.type === 'newzone') return newZoneHtml(data, state);
  if (sel.type === 'period') return periodHtml(data, state);
  if (sel.type === 'zone') { const z = data.zone(sel.id); if (z) return zoneHtml(data, z, state); }
  if (sel.type === 'photo') { const p = data.photo(sel.id); if (p) return photoHtml(data, p); }
  if (sel.type === 'structure') { const s = data.structure(sel.id); if (s) return structureHtml(data, s); }
  if (sel.type === 'facility') { const f = data.facility(sel.id); if (f) return facilityHtml(data, f, state); }
  if (sel.type === 'unit') { const m = data.member(sel.id); if (m) return unitHtml(data, m, state); }
  return homeHtml(data, state);
}

function statusDetail(data, m) {
  const zone = data.zones().find((z) => z.assigned_to === m.user_id && z.status === 'active') || data.zones().find((z) => z.assigned_to === m.user_id);
  if (m.status === 'assigned') return zone ? 'Assigned to ' + esc(zone.code) : 'Assigned';
  if (m.status === 'available') return 'Available' + (zone ? ', last in ' + esc(zone.code) : '');
  if (m.status === 'out_of_service') return 'Out of service' + (m.status_note ? ': ' + esc(m.status_note) : '');
  return 'Checked out' + (m.checked_out_at ? ' at ' + hhmm(m.checked_out_at) : '');
}

// The names on a unit: its people on record (checked out ones too, so a checked-out unit still
// says who was on it), else the crew as typed at check-in.
function unitNames(data, m) {
  const rows = data.unitPeople(m.user_id);
  return rows.length ? rows.map((p) => p.name).join(', ') : (m.crew || '');
}
// "Ramirez, Lt. · swift water, EMT": one person on a line of a report
function personLine(p) { const q = qualsText(p.qualifications); return p.name + (p.role ? ', ' + p.role : '') + (q ? ' · ' + q : ''); }
// the people of a unit as indented report lines, under the unit's own line
function personLines(data, m) { return data.unitPeople(m.user_id).map((p) => '  ' + personLine(p) + (p.checked_out_at ? ' · checked out ' + hhmm(p.checked_out_at) : '')); }

function unitRowHtml(data, m, now) {
  const pos = data.position(m.user_id);
  const sos = data.alerts().some((a) => a.user_id === m.user_id);
  const where = m.status === 'checked_out' ? '' : (pos ? ' · ' + ago(pos.at, now) + (pos.heading != null ? ', ' + compass(pos.heading) : '') : ' · no position yet');
  const dot = sos ? 'sos' : (m.status === 'checked_out' || !pos || now - new Date(pos.at).getTime() > 180000 ? 'off' : '');
  return `<button class="ur" data-action="select-unit" data-id="${m.user_id}">
      <span class="udot2 ${dot}"></span>
      <span class="ur-main"><span class="ur-name">${esc(unitLabel(m))}${kindText(m.kind) ? `<span class="ur-kind">, ${esc(kindText(m.kind))}</span>` : ''} <span style="font-weight:400;color:var(--muted)">${esc(unitNames(data, m))}${m.crew_count != null && m.status !== 'checked_out' ? ' · ' + m.crew_count : m.status !== 'checked_out' ? ` · <span class="hc-unknown" title="No names and no count given at check-in: ask the unit, or name them on the People board">${HEAD_COUNT_UNKNOWN}</span>` : ''}</span>${(() => { const p = data.profileOf(m.user_id); return p ? ` <span class="who${p.verified_at ? ' ok' : ''}" title="${p.verified_at ? 'Identity verified' : identityGiven(p) ? 'Identity not verified yet' : 'No licence given: check who this is in person'}">${esc(p.full_name)}${p.verified_at ? ' ✓' : identityGiven(p) ? '' : ' · no ID'}</span>` : ''; })()}</span>
      <span class="ur-sub">${statusDetail(data, m)}${m.status_at ? ' since ' + hhmm(m.status_at) : ''}${where}${waterSpan(data, m, now)}</span></span>
    </button>`;
}
// " · in the water 38 min", orange past the rotation, "probably left running" past three (v28)
function waterSpan(data, m, now) {
  const ws = m.in_water_since && m.status !== 'checked_out' ? waterState(m.in_water_since, data.rotationMinutes(), now) : null;
  return ws ? ` · <span class="water${ws.overdue ? ' over' : ''}" title="${ws.rotation ? 'Rotation every ' + ws.rotation + ' minutes' : 'No rotation set for the period'}">${esc(ws.text)}</span>` : '';
}

// The resources board: units by what they are (engines, boat crews ...: what a request asks for),
// with the units asked for and not on scene, or by status, the ICS T-card rack in a list.
export function resourcesHtml(data, state) {
  const units = data.units();
  if (!units.length) return '<p class="muted">No units have joined yet.</p>';
  const now = Date.now();
  const mode = (state && state.board) || 'kind';
  const head = `<div class="d-row"><span class="muted" style="font-size:12.5px;flex:1">${data.peopleInField()} people in the field on ${data.activeUnits().length} unit${data.activeUnits().length === 1 ? '' : 's'}</span>
    <span class="chips board-mode"><button class="chip${mode === 'kind' ? ' on' : ''}" data-action="board-mode" data-mode="kind" aria-pressed="${mode === 'kind'}">By kind</button><button class="chip${mode === 'status' ? ' on' : ''}" data-action="board-mode" data-mode="status" aria-pressed="${mode === 'status'}">By status</button></span>
    <button class="btn sm" data-action="people" title="Everyone on scene by name, with qualifications, status and hours">People board</button></div>`;
  if (mode === 'status') {
    return head + ['assigned', 'available', 'out_of_service', 'checked_out'].map((s) => {
      const rows = units.filter((u) => u.status === s);
      if (!rows.length) return '';
      return `<div class="grp"><span class="badge st-${s}">${STATUS_LABEL[s]}</span><span class="muted">${rows.length}</span></div>` + rows.map((m) => unitRowHtml(data, m, now)).join('');
    }).join('');
  }
  const on = units.filter((u) => u.status !== 'checked_out'), out = units.filter((u) => u.status === 'checked_out');
  const asked = data.openRequests().map((r) => ({ r, kinds: kindsAsked(r) })).filter((x) => x.kinds.length);
  const groups = UNIT_KINDS.map(([k, , plural]) => ({ key: k, label: plural, rows: on.filter((u) => u.kind === k), asks: asked.filter((x) => x.kinds.includes(k)) })).filter((g) => g.rows.length || g.asks.length);
  const unknown = on.filter((u) => !unitKind(u.kind));
  if (unknown.length) groups.push({ key: '', label: 'Kind not set', rows: unknown, asks: [] });
  return head + groups.map((g) => `<div class="grp"><span class="badge kind">${esc(g.label)}</span> <span class="muted">${g.rows.length}${g.asks.length ? ` · ${g.asks.length} asked${g.asks.some((x) => x.r.status === 'ordered') ? ', ' + (g.asks.filter((x) => x.r.status === 'ordered').length === g.asks.length ? 'ordered' : 'some ordered') : ''}` : ''}</span></div>` +
      (g.rows.length ? g.rows.map((m) => unitRowHtml(data, m, now)).join('') : `<div class="muted" style="font-size:12.5px;padding:0 0 6px">none on scene · ${g.asks.map((x) => requestLine(x.r) + ' ' + (REQUEST_STATUS[x.r.status] || x.r.status).toLowerCase()).join(' · ')}</div>`)).join('') +
    (out.length ? `<div class="grp"><span class="badge st-checked_out">Checked out</span><span class="muted">${out.length}</span></div>` + out.map((m) => unitRowHtml(data, m, now)).join('') : '');
}

// The PAR: who has answered the latest one, and with what.
export function parHtml(data) {
  const par = data.lastPar();
  const head = `<div class="d-row"><span class="k" style="width:auto;flex:1">Accountability (PAR)</span><button class="btn sm" data-action="start-par" data-target="all">Start PAR</button></div>`;
  if (!par) return head + '<div class="muted" style="font-size:12.5px">A PAR asks every unit for a head count. Each unit answers with one tap.</div>';
  const waiting = data.waitingOn(par);
  const rows = (par.to_users || []).map((u) => {
    const a = data.ack(par.id, u);
    const cls = a ? (a.reply === 'Missing someone' ? 'bad' : 'ok') : 'wait';
    return `<div class="par-row ${cls}"><span>${esc(unitLabel(data.member(u)))}</span><span>${a ? esc(parAnswerText(a)) + ' · ' + hhmm(a.acked_at) : 'waiting, sent ' + since(par.created_at)}</span></div>`;
  }).join('');
  return head + `<div class="muted" style="font-size:12.5px">Started ${hhmm(par.created_at)} to ${esc(par.to_label || 'everyone')} · ${waiting.length ? waiting.length + ' still to answer' : 'everyone answered'}</div>${rows}`;
}

function homeHtml(data, state) {
  const inc = data.incident;
  return `
    <div class="k">Join code for field phones</div>
    <div class="join-box">
      <div class="qr-box">${qrSvg(fieldJoinUrl(inc.code), { label: 'QR code to join ' + inc.name })}</div>
      <div style="display:flex;flex-direction:column;gap:6px;min-width:0">
        <div class="d-row"><span class="code-big mono">${esc(inc.code)}</span><button class="btn sm" data-action="copy-code">Copy</button></div>
        <div class="muted" style="font-size:12.5px">A unit scans this with its phone, or opens the field app and types the code with its unit name.</div>
        <div class="d-row"><button class="btn sm" data-action="print-join">Print a join card</button><button class="btn sm" data-action="copy-join-link">Copy the link</button></div>
      </div>
    </div>
    ${opsCodeHtml(data)}
    <div class="k" style="margin-top:6px">Resources</div>
    ${resourcesHtml(data, state)}
    ${parHtml(data)}
    ${requestsHtml(data)}
    ${hazardsHtml(data)}
    <div class="k" style="margin-top:6px">Message the field</div>
    ${composerHtml(data, 'all')}
    <div class="k" style="margin-top:6px">Messages</div>
    ${messagesHtml(data, null, 8)}
    ${facilitiesHtml(data)}
    ${shelteredHtml(data, state)}
    ${channelsHtml(data)}
    ${agenciesHtml(data)}
    ${publicHtml(data)}
    ${imageryHtml(data)}
    <div class="k" style="margin-top:6px">Incident</div>
    <div class="kv">
      <span class="k">Period</span><span>${esc(inc.period || 'not set')}</span>
      <span class="k">Base</span><span>${esc(inc.base_name || 'not set')}</span>
      <span class="k">Opened</span><span>${esc(whenText(inc.created_at))}</span>
      <span class="k">Zones</span><span>${data.zones().length} · ${data.zones().filter((z) => z.status === 'cleared').length} cleared</span>
    </div>
    <form class="inline-form" data-form="incident-edit">
      <label>Lead agency <input name="lead_agency" value="${esc(inc.lead_agency || '')}" placeholder="Cedar Fork Fire Department" maxlength="120"></label>
      <div class="row-btns"><button class="btn sm" type="submit">Save</button></div>
    </form>
    ${inc.status === 'closed'
      ? `<div class="d-row"><span class="badge haz">Closed</span><span class="muted" style="font-size:12.5px;flex:1">${inc.personal_cleared_at ? 'Personal records cleared ' + esc(dateText(inc.personal_cleared_at)) + ' by rule.' : inc.clear_personal_at ? 'Personal records clear by rule on ' + esc(dateText(inc.clear_personal_at)) + '; Clear now and Keep 30 more days are on the incident picker.' : ''}</span><button class="btn sm" data-action="reopen-incident">Reopen incident</button></div>`
      : `<div class="d-row"><span class="muted" style="font-size:12.5px;flex:1">Closing ends the incident for every phone and starts the 30 days after which its personal records clear by rule.</span><button class="btn sm" data-action="close-incident">Close incident</button></div>`}`;
}

// The Operations code (migration 0019): joining with it makes someone Operations, so it is read here
// alone, said by radio or phone, never printed and never on the join card. New code retires one that leaked.
function opsCodeHtml(data) {
  const me = data.me();
  if (!me || me.role !== 'ops') return '';
  const code = data.opsCode();
  return `
    <div class="k" style="margin-top:6px">Operations code</div>
    <div class="ops-code">
      <div class="d-row"><span class="code-big mono" data-ops-code>${code ? esc(code) : '—'}</span>${code ? '<button class="btn sm" data-action="copy-ops-code">Copy</button>' : ''}<button class="btn sm" data-action="new-ops-code" title="Retire this code: the old one no longer joins">New code</button></div>
      <div class="muted" style="font-size:12.5px">${code ? 'Whoever joins with this code is Operations and can run the incident. Give it by radio or phone, never on paper; the join card carries the units\' code only. The Members tab on the People board shows who holds which role.' : 'No Operations code on record yet. Press New code to make one.'}</div>
    </div>`;
}

// The Layers panel under the tools bar: the map underneath on one side, the imagery over it on the other.
export function layersPopHtml(data, state) {
  const cur = storedLayer() || 'streets';
  const hidden = hiddenOverlays();
  const active = data.overlays();
  return `
    <div class="lp-col">
      <div class="k">Map underneath</div>
      ${availableLayers().map((l) => `<label class="lp-row"><input type="radio" name="base-layer" value="${l.id}" data-action="layer-pick" data-layer="${l.id}"${cur === l.id ? ' checked' : ''}><span class="lp-name">${esc(l.name)}</span><span class="muted">${esc(l.source || '')}</span></label>`).join('')}
      ${googleKey() ? '' : '<div class="muted lp-note">Google Maps streets and satellite appear here once a Map Tiles API key is set in config.js.</div>'}
    </div>
    <div class="lp-col">
      <div class="k">Overlays</div>
      ${active.length ? active.map((o) => `<div class="lp-ovl"><label class="lp-row"><input type="checkbox" data-action="overlay-toggle" data-id="${o.id}"${hidden.has(o.id) ? '' : ' checked'}><span class="lp-name">${esc(o.name || 'Imagery')}</span><span class="muted">${o.taken_at ? 'taken ' + hhmm(o.taken_at) : 'added ' + hhmm(o.created_at)}</span></label><input type="range" class="lp-range" min="0" max="1" step="0.05" value="${Number(o.opacity)}" data-range="overlay-opacity" data-id="${o.id}" aria-label="Opacity of ${esc(o.name || 'the imagery')}"></div>`).join('') : '<div class="muted lp-note">No imagery over the map yet.</div>'}
      ${state.layersUpload ? overlayFormHtml() : '<button class="btn sm" data-action="layers-upload">Upload aerial photography</button>'}
      <div class="muted lp-note">Hiding is for this screen; opacity and the upload are for everyone. Remove or put back under Map imagery on the home panel.</div>
    </div>`;
}

// Custom imagery over the map: fresh aerial or satellite pictures by their corner coordinates.
// The upload form for a picture over the map: the corners come from the map's view (main.js fills them).
export function overlayFormHtml() {
  return `    <form class="inline-form" data-form="overlay-add">
      <label>Picture (PNG or JPEG, up to 50 MB) <input name="file" type="file" accept="image/png,image/jpeg,image/webp" required></label>
      <div class="row-2">
        <label>Name <input name="name" placeholder="Aerial 06:40, Civil Air Patrol" maxlength="120"></label>
        <label>Taken at <input name="taken" type="datetime-local"></label>
      </div>
      <div class="row-2">
        <label>South edge, latitude <input name="south" type="number" step="any" required></label>
        <label>West edge, longitude <input name="west" type="number" step="any" required></label>
      </div>
      <div class="row-2">
        <label>North edge, latitude <input name="north" type="number" step="any" required></label>
        <label>East edge, longitude <input name="east" type="number" step="any" required></label>
      </div>
      <div class="row-2">
        <label>Opacity <input name="opacity" type="range" min="0" max="1" step="0.05" value="0.8"></label>
        <button class="btn sm" type="button" data-action="overlay-view-bounds" title="Fill the corners with what the map shows now">Use the map's view</button>
      </div>
      <div class="row-btns"><button class="btn pri sm" type="submit">Put it on the map</button></div>
    </form>`;
}

export function imageryHtml(data) {
  const hidden = hiddenOverlays();
  const active = data.overlays(), gone = data.overlays(true).filter((o) => o.archived_at);
  const row = (o) => `
    <div class="ovl-row" data-overlay="${o.id}">
      <div class="ovl-top"><span class="ur-name">${esc(o.name || 'Imagery')}</span><span class="muted">${o.taken_at ? 'taken ' + hhmm(o.taken_at) + ' · ' : ''}added ${hhmm(o.created_at)}</span></div>
      <div class="muted mono" style="font-size:11.5px">${esc(boundsText(o.bounds))}</div>
      <div class="ovl-ctl">
        <label class="ovl-op">Opacity <input type="range" min="0" max="1" step="0.05" value="${Number(o.opacity)}" data-range="overlay-opacity" data-id="${o.id}" aria-label="Opacity"></label>
        ${hidden.has(o.id) ? `<button class="btn sm" data-action="overlay-show" data-id="${o.id}" title="Hidden on this screen only">Show</button>` : `<button class="btn sm" data-action="overlay-hide" data-id="${o.id}" title="Hides it on this screen only">Hide</button>`}
        <button class="btn sm" data-action="overlay-remove" data-id="${o.id}" title="Takes it off the map for everyone; it is kept">Remove</button>
      </div>
    </div>`;
  return `
    <div class="k" style="margin-top:6px">Map imagery</div>
    <div class="muted" style="font-size:12.5px">A picture laid over the map for every screen: fresh aerial or satellite imagery, a drone mosaic, a scanned plan. Give its corner coordinates; the map's view fills them in.</div>
    ${active.length ? active.map(row).join('') : ''}
    ${gone.length ? `<div class="muted" style="font-size:12px">${gone.length} removed: ${gone.map((o) => `${esc(o.name || 'imagery')} <button class="plink" data-action="overlay-restore" data-id="${o.id}">put back</button>`).join(', ')}</div>` : ''}
    ${overlayFormHtml()}`;
}

// The field app's address, for the join link the QR carries.
export function fieldJoinUrl(code) { return joinUrl(code, new URL('field/', document.baseURI)); }

// The join card is the deployment briefing: ICS-100's six lines (the incident, where to check in,
// the assignment, when to report, how to get there, the radio) and what to bring, drawn from the
// incident, around the code a unit scans. A page for the wall of the command post or an email ahead.
export function joinCardSections(data) {
  const inc = data.incident, p = data.currentPeriod();
  const now = new Date();
  return [
    { title: 'Deployment briefing', lines: deploymentLines(data, now).map(([k, v]) => k + ': ' + v) },
    { title: 'Who to ask for', lines: [whoToAsk(data)] },
    { title: 'Check in with your phone', lines: [inc.name + (inc.base_name ? ' · base: ' + inc.base_name : ''), p ? periodLine(p) : '', 'Join code ' + inc.code, 'Scan the code, or open ' + fieldJoinUrl(inc.code).replace(/\?.*$/, '') + ' and type it.', 'Say who you are (name, phone, licence), name your unit, what it is and the people on it, then press Check in. Your briefing opens after check-in; everything you send keeps until there is signal.', 'Anyone with this code can join as a unit. Keep it to the people who should.'].filter(Boolean) },
    { title: 'Printed', lines: [whenText(now) + ' · the lines above are the incident as it was then'] }
  ];
}
export function joinCardHtml(data) {
  const inc = data.incident;
  const url = fieldJoinUrl(inc.code);
  return `<div class="join-card">
    <div class="join-card-qr">${qrSvg(url, { label: 'QR code to join ' + inc.name })}</div>
    <div class="join-card-code mono">${esc(inc.code)}</div>
    <div class="join-card-url mono">${esc(url)}</div>
  </div>` + sectionsHtml(joinCardSections(data));
}
export function joinCardText(data) { return sectionsText(joinCardSections(data)) + '\n\n' + fieldJoinUrl(data.incident.code); }

// Who is on scene from where (ICS 203): the command, then units and head counts by agency.
export function agenciesHtml(data) {
  const rows = agenciesOn(data.activeUnits());
  const cmd = commandText(data.incident, data.currentPeriod());
  return `
    <div class="k" style="margin-top:6px">Agencies on scene</div>
    ${cmd ? `<div style="font-size:13px">${esc(cmd)}</div>` : '<div class="muted" style="font-size:12.5px">No lead agency named yet. Name it under Incident below; the period names the unified command.</div>'}
    ${rows.length ? rows.map((r) => { const rep = data.periodAgencies().find((a) => a.agency === r.agency); return `<div class="agency-row"><span>${esc(r.agency || 'No agency named')}${rep && (rep.name || rep.phone) ? `<span class="muted"> · ${esc(rep.name || 'representative')}${rep.phone ? ', ' + esc(rep.phone) : ''}</span>` : ''}</span><span class="muted">${r.units} unit${r.units === 1 ? '' : 's'}${r.people ? ' · ' + r.people + ' people' : ''}</span></div>`; }).join('') : ''}
    <div class="muted" style="font-size:12px">Each agency's representative and phone are kept on the period, under Period.</div>`;
}

// The Public Information Officer's set: photos Operations has cleared. Nothing is public by default.
export function publicHtml(data) {
  const pub = data.publicPhotos(), set = data.publicSet();
  return `
    <div class="k" style="margin-top:6px">Public information</div>
    <div class="muted" style="font-size:12.5px">${pub.length ? pub.length + ' photo' + (pub.length === 1 ? '' : 's') + ' cleared for the public, ' + set.length + ' checked (no face, no plate, no house number). Only checked photos leave in the public set; open a photo to write its public caption and check it.' : 'No photo is cleared for the public. Open a photo to clear it for the Public Information Officer.'}</div>
    ${pub.length ? `<div class="d-row"><button class="btn sm" data-action="download-public" title="One zip: every checked photo named by its time and place, its public caption written into the file, and captions.txt with the time, the place and the caption. No coordinates, no unit's note. Cleared photos not yet checked are listed as missing.">Download the public set</button><span class="muted" style="font-size:12px">${set.length} of ${pub.length}; the rest wait for a check.</span></div>` : ''}
    ${pub.slice(0, 6).map((p) => `<button class="plink" data-action="select-photo" data-id="${p.id}">${hhmm(p.taken_at)} · ${esc(unitLabel(data.member(p.user_id)))}${p.zone_id && data.zone(p.zone_id) ? ' · ' + esc(data.zone(p.zone_id).code) : ''} · ${p.public_checked_at ? 'checked' : 'not checked'}${p.public_caption ? ' · ' + esc(p.public_caption) : ' · no public caption'}</button>`).join('')}`;
}

function zoneHtml(data, z, state) {
  const units = data.units();
  const photos = data.photos().filter((p) => p.zone_id === z.id);
  const hazards = data.hazards().filter((h) => h.zone_id === z.id);
  const marking = z.marking || null;
  const statusCls = z.status === 'cleared' ? 'cleared' : z.status === 'primary' ? 'primary' : (z.status === 'active' ? 'active' : '');
  const structs = data.structures(z.id);
  return `
    <button class="back" data-action="close-panel">Back to units</button>
    <div class="title">Division ${esc(z.code)} <span>${esc(z.name)}</span></div>
    <div class="d-row"><span class="badge ${statusCls}">${esc(zoneStatusText(z, assignedLabel(data, z), data.zoneAccepted(z)))}</span>${z.channel ? `<span class="badge">Radio ${esc(z.channel)}</span>` : ''}${z.supervisor ? `<span class="muted" style="font-size:12px">Supervisor ${esc(z.supervisor)}</span>` : ''}${z.branch ? `<span class="muted" style="font-size:12px">Branch ${esc(z.branch)}</span>` : ''}</div>
    ${sortHazards(hazards).map((h) => `<div class="hazline">Hazard · ${esc(h.kind)}${h.note ? ' · ' + esc(h.note) : ''}${h.urgency ? ` <span class="badge urg-${esc(h.urgency)}">${esc(urgencyLabel(h.urgency))}</span>` : ''} · ${esc(unitLabel(data.member(h.user_id)))} at ${hhmm(h.created_at)}<button class="btn sm" data-action="resolve-hazard" data-id="${h.id}">Resolved</button></div>`).join('')}
    <div class="d-row"><span class="k">Priority</span>
      ${[1, 2, 3].map((p) => `<button class="btn sm${z.priority === p ? ' on' : ''}" data-action="set-priority" data-id="${z.id}" data-p="${p}">Priority ${p}</button>`).join('')}
    </div>
    <div class="d-row"><span class="k">Serves objective</span>
      <select class="sel" data-select="zone-objective" data-id="${z.id}" aria-label="Objective this zone serves">
        <option value="">none</option>
        ${data.objectives().map((o) => `<option value="${o.id}"${z.objective_id === o.id ? ' selected' : ''}>${o.number}. ${esc(o.text)}</option>`).join('')}
      </select>
    </div>
    <div class="d-row"><span class="k">Assigned to</span>
      ${units.length ? units.map((u) => `<button class="btn sm${z.assigned_to === u.user_id ? ' on' : ''}" data-action="assign" data-id="${z.id}" data-user="${u.user_id}">${esc(unitLabel(u))}</button>`).join('') : '<span class="muted">No units have joined yet</span>'}
    </div>
    <form class="inline-form" data-form="zone-edit" data-id="${z.id}">
      <div class="row-2">
        <label>Code <input name="code" value="${esc(z.code)}" required></label>
        <label>Structures <input name="structures" type="number" min="0" value="${z.structures}"></label>
      </div>
      <label>Name <input name="name" value="${esc(z.name)}" placeholder="What is here"></label>
      <label>Work assignment <textarea name="work_assignment" rows="2" placeholder="What the unit is to do here, in words">${esc(z.work_assignment || '')}</textarea></label>
      <label>Special instructions <textarea name="instructions" rows="2" placeholder="Hazards, access, what to watch for">${esc(z.instructions || '')}</textarea></label>
      <div class="row-2">
        <label>Radio channel <input name="channel" value="${esc(z.channel || '')}" placeholder="TAC 2"></label>
        <label>Division supervisor <input name="supervisor" value="${esc(z.supervisor || '')}" placeholder="Name"></label>
      </div>
      <div class="row-2">
        <label>Branch <input name="branch" value="${esc(z.branch || '')}" placeholder="North of the river" list="branches" maxlength="60"></label>
        <span class="muted" style="font-size:12px;align-self:end;padding-bottom:8px">A word that groups divisions on the 207 and the 203 when Operations has more than ${SPAN_MAX} reporting to it. Empty is fine.</span>
      </div>
      <datalist id="branches">${[...new Set(data.zones().map((x) => (x.branch || '').trim()).filter(Boolean))].map((b) => `<option value="${esc(b)}"></option>`).join('')}</datalist>
      <div class="row-btns"><button class="btn sm" type="button" data-action="print-204" data-id="${z.id}">Print the 204</button><button class="btn sm" type="submit">Save</button></div>
    </form>
    <div class="k">Structures searched</div>
    <div class="bar"><div class="bar-fill" style="width:${pct(z)}%"></div></div>
    <div class="muted" style="font-size:12.5px">${z.structures ? z.cleared + ' of ' + z.structures : 'No structure count yet'}</div>
    ${marking ? `<div class="k">Search marking painted</div><div class="muted" style="font-size:12.5px">Team ${esc(marking.team)} · out at ${esc(marking.out)} · hazards ${esc(marking.haz)} · people found ${esc(marking.victims)}</div>` : ''}
    <div class="d-row">
      <button class="btn sm" data-action="zoom-zone" data-id="${z.id}">Zoom to division</button>
      ${z.assigned_to ? `<button class="btn sm" data-action="start-par" data-target="zone:${z.id}">PAR</button>` : ''}
      ${z.status === 'cleared' ? `<button class="btn sm" data-action="reopen-zone" data-id="${z.id}">Reopen</button>`
        : z.status === 'primary' ? `<button class="btn sm green" data-action="finish-pass" data-id="${z.id}" data-pass="secondary">Secondary done, clear</button><button class="btn sm" data-action="reopen-zone" data-id="${z.id}">Reopen</button>`
        : `<button class="btn sm green" data-action="finish-pass" data-id="${z.id}" data-pass="primary">Primary search done</button><button class="btn sm" data-action="finish-pass" data-id="${z.id}" data-pass="secondary">Mark cleared</button>`}
    </div>
    <div class="d-row"><span class="k" style="width:auto;flex:1">Structures on record · ${structs.length}</span><button class="btn sm" data-action="place-structures" data-id="${z.id}">Place structures</button></div>
    ${structs.length ? structs.slice(-8).reverse().map((s) => `<button class="plink" data-action="select-structure" data-id="${s.id}">${esc(s.label || 'Structure')} · ${STRUCTURE_STATUS[s.status] || s.status}${structureSummary(s) ? ' · ' + esc(structureSummary(s)) : ''}${s.searched_at ? ' · ' + hhmm(s.searched_at) : ''}${s.revisit_at ? ' · revisit ' + revisitWords(s.revisit_at).text + (revisitWords(s.revisit_at).due ? ' (due)' : '') : ''}</button>`).join('') : '<div class="muted" style="font-size:12.5px">None yet. The field adds one with every address it clears; you can place the ones you know in advance.</div>'}
    <div class="k">Photos from this zone</div>
    ${photos.length ? photos.map((p) => `<button class="plink" data-action="select-photo" data-id="${p.id}">${hhmm(p.taken_at)} · ${esc(unitLabel(data.member(p.user_id)))}${p.heading != null ? ' · facing ' + compass(p.heading) : ''}${p.note ? ' · ' + esc(p.note) : ''}${p.public_ok ? ' · public' : ''}</button>`).join('') : '<div class="muted" style="font-size:12.5px">None yet</div>'}
    ${z.assigned_to ? `<div class="k">Message ${esc(unitLabel(data.member(z.assigned_to)))} in ${esc(z.code)}</div>${composerHtml(data, 'zone:' + z.id)}${messagesHtml(data, (m) => m.to_zone === z.id, 4)}` : ''}`;
}

function photoHtml(data, p) {
  const z = p.zone_id ? data.zone(p.zone_id) : null;
  return `
    <button class="back" data-action="close-panel">Back to units</button>
    <div class="title">Photo <span>${esc(unitLabel(data.member(p.user_id)))} · ${hhmm(p.taken_at)}</span>${p.public_ok ? ' <span class="badge pub">Public</span>' : ''}</div>
    <div class="photo-box" data-photo-box="${esc(p.storage_path)}">
      <img alt="Field photo${p.note ? ': ' + esc(p.note) : ''}" hidden>
      <div class="muted" style="padding:40px 12px;text-align:center" data-photo-wait>Loading photo…</div>
      ${p.heading != null ? `<div class="facing"><svg viewBox="0 0 16 16" aria-hidden="true" style="transform:rotate(${Math.round(p.heading)}deg)"><path d="M8,1 L12,13 L8,10 L4,13 Z" fill="#fff"></path></svg>Facing ${compass(p.heading)}</div>` : ''}
    </div>
    <div class="kv">
      <span class="k">Taken by</span><span>${esc(unitLabel(data.member(p.user_id)))}</span>
      <span class="k">Time</span><span>${esc(whenText(p.taken_at))}</span>
      <span class="k">Zone</span><span>${z ? esc(z.code + ' · ' + z.name) : 'outside any zone'}</span>
      <span class="k">Facing</span><span>${p.heading != null ? compass(p.heading) : 'unknown'}</span>
      <span class="k">Position</span><span class="mono">${esc(latLngText(p.lat, p.lng)) || 'unknown'}</span>
      <span class="k">Note</span><span>${esc(p.note) || '—'}</span>
      <span class="k">Public</span><span>${p.public_ok ? 'Cleared for public information' + (p.public_checked_at ? ' · checked ' + hhmm(p.public_checked_at) + ' (no face, no plate, no house number)' : ' · not checked yet, so not in the public set') : 'Not public'}</span>
    </div>
    ${p.public_ok ? `<form class="inline-form" data-form="photo-public" data-id="${p.id}">
      <label>Public caption · what the public reads, never the unit's note or a house number <textarea name="caption" rows="2" maxlength="300" placeholder="Floodwater over Mill Street at the bridge, Saturday morning">${esc(p.public_caption || '')}</textarea></label>
      <div class="row-btns"><button class="btn sm${p.public_checked_at ? '' : ' green'}" type="button" data-action="photo-check" data-id="${p.id}" data-ok="${p.public_checked_at ? '0' : '1'}" title="You have looked: no face, no licence plate, no house number in the frame">${p.public_checked_at ? 'Withdraw the check' : 'Checked: no face, no plate, no house number'}</button><button class="btn sm" type="submit">Save caption</button></div>
    </form>` : ''}
    <div class="d-row">
      <button class="btn sm" data-action="pan-to" data-lat="${p.lat}" data-lng="${p.lng}">Show on map</button>
      <a class="btn sm" data-photo-link target="_blank" rel="noopener" hidden>Open full size</a>
      <button class="btn sm${p.public_ok ? '' : ' green'}" data-action="photo-public" data-id="${p.id}" data-ok="${p.public_ok ? '0' : '1'}" title="Nothing is public until Operations clears it. The Public Information Officer takes only cleared photos.">${p.public_ok ? 'Withdraw from public' : 'Clear for public information'}</button>
    </div>`;
}

// The right-click card for a division: its rank among the divisions, its priority (changeable
// here), and the facts at a glance. Left-click still opens the full panel.
export function zoneModalHtml(data, z) {
  const zones = data.zones();
  const rank = zones.findIndex((x) => x.id === z.id) + 1;
  const unit = z.assigned_to ? data.member(z.assigned_to) : null;
  const o = z.objective_id ? data.objective(z.objective_id) : null;
  const hazards = data.hazards().filter((h) => h.zone_id === z.id);
  const photos = data.photos().filter((p) => p.zone_id === z.id);
  const structs = data.structures(z.id);
  const help = structs.reduce((n, s) => n + (s.people_needing_help || 0), 0);
  const last = data.events().find((e) => e.ref_table === 'ic_zones' && e.ref_id === z.id);
  const statusCls = z.status === 'cleared' ? 'cleared' : z.status === 'primary' ? 'primary' : (z.status === 'active' ? 'active' : '');
  return `
    <div class="zm-head">
      <div class="zm-name"><div class="k">Division</div><div class="zm-title">${esc(z.code)} <span>${esc(z.name)}</span></div>
        <div class="d-row" style="margin-top:6px"><span class="badge ${statusCls}">${esc(zoneStatusText(z, assignedLabel(data, z), data.zoneAccepted(z)))}</span>${z.hazard ? '<span class="badge haz">Hazard</span>' : ''}</div></div>
      <div class="zm-rank"><div class="k">Rank</div><div class="zm-big">${rank}<span class="zm-of">of ${zones.length}</span></div><div class="muted zm-note">by priority, then code</div></div>
      <div class="zm-rank"><div class="k">Priority</div><div class="zm-big"><span class="pb p${z.priority} zm-pb">${z.priority}</span></div>
        <div class="zm-pri">${[1, 2, 3].map((p) => `<button class="btn sm${z.priority === p ? ' on' : ''}" data-action="set-priority" data-id="${z.id}" data-p="${p}" aria-label="Priority ${p}">${p}</button>`).join('')}</div></div>
    </div>
    <div class="bar"><div class="bar-fill" style="width:${pct(z)}%"></div></div>
    <div class="kv zm-kv">
      <span class="k">Assigned to</span><span>${unit ? esc(unitLabel(unit)) + (unit.crew ? ' · ' + esc(unit.crew) : '') : 'nobody yet'}</span>
      <span class="k">Structures</span><span>${z.cleared} of ${z.structures} cleared${structs.length ? ' · ' + structs.length + ' on record' : ''}${help ? ' · <strong>' + help + ' people needing help</strong>' : ''}</span>
      <span class="k">Objective</span><span>${o ? o.number + '. ' + esc(o.text) : 'none'}</span>
      <span class="k">Supervisor</span><span>${esc(z.supervisor) || 'not named'}</span>
      <span class="k">Radio</span><span>${esc(z.channel) || 'not set'}</span>
      <span class="k">Hazards</span><span>${hazards.length ? hazards.map((h) => esc(h.kind) + (h.note ? ' (' + esc(h.note) + ')' : '')).join(', ') : 'none open'}</span>
      <span class="k">Photos</span><span>${photos.length}${photos.length ? ', last ' + hhmm(photos[0].taken_at) : ''}</span>
      ${z.work_assignment ? `<span class="k">Work</span><span>${esc(z.work_assignment)}</span>` : ''}
      ${z.instructions ? `<span class="k">Instructions</span><span>${esc(z.instructions)}</span>` : ''}
      <span class="k">Last activity</span><span>${last ? hhmm(last.at) + ' · ' + esc(last.text) : 'nothing yet'}</span>
    </div>
    <div class="row-btns">
      <button class="btn sm" data-action="zoom-zone" data-id="${z.id}">Zoom to it</button>
      <button class="btn sm" data-action="print-204" data-id="${z.id}">Print 204</button>
      <button class="btn pri sm" data-action="zone-modal-open" data-id="${z.id}">Open in the panel</button>
      <button class="btn sm" data-action="zone-modal-close">Close</button>
    </div>`;
}

// ---- people: a record per responder, riding with a unit

function qualBadges(p) { return (p.qualifications || []).length ? `<span class="pp-quals">${QUALIFICATIONS.filter(([q]) => p.qualifications.includes(q)).map(([q, label]) => `<span class="badge q q-${q}">${esc(label)}</span>`).join('')}</span>` : '<span class="pp-quals muted">no qualifications listed</span>'; }

// One person: who, what they are qualified for, where they stand, and what Operations can do about it.
// Compact rows (the unit panel) leave out the unit and buddy pickers.
export function personRowHtml(data, p, { compact, now } = {}) {
  const ops = !!data.me() && data.me().role === 'ops';
  const unit = data.member(p.user_id);
  const unitOut = unit && unit.status === 'checked_out';
  const buddy = p.buddy_id ? data.person(p.buddy_id) : null;
  const miss = data.missingPerson(p.id), pos = miss && unit ? data.position(unit.user_id) : null;
  const over = !miss && !p.archived_at && !p.checked_out_at && !unitOut && sceneOver(p, data.sceneHours(), now);   // past the period's hours on scene (v47)
  const state = miss ? 'MISSING since ' + hhmm(miss.ack.acked_at) + (pos ? ' · ' + unitLabel(unit) + ' last at ' + latLngText(pos.lat, pos.lng) + ', ' + ago(pos.at, now) : ' · no position from ' + unitLabel(unit))
    : p.archived_at ? 'Removed ' + hhmm(p.archived_at)
    : p.checked_out_at ? 'Checked out ' + hhmm(p.checked_out_at) + ' · ' + onSceneText(p) + ' on scene'
    : (unitOut ? 'Unit checked out · ' : 'On scene ') + stintText(p, now) + ', since ' + hhmm(sceneStart(p)) + (p.stint_at ? ' · back in' : '') + (over ? ' · past ' + data.sceneHours() + ' h' : '');   // the current stretch since v48
  const mates = compact ? [] : data.unitPeople(p.user_id).filter((x) => x.id !== p.id);
  const units = compact ? [] : data.members().filter((m) => m.status !== 'checked_out' || m.user_id === p.user_id).sort((a, b) => (a.role === 'ops') - (b.role === 'ops') || (a.unit_name || '').localeCompare(b.unit_name || ''));
  return `
    <div class="pp-row${p.checked_out_at || unitOut ? ' out' : ''}${p.archived_at ? ' gone' : ''}${miss ? ' missing' : ''}${over ? ' over' : ''}" data-person="${p.id}">
      <span class="pp-who"><span class="pp-name">${esc(p.name)}</span>${p.role ? `<span class="muted"> ${esc(p.role)}</span>` : ''}${p.agency && (!unit || p.agency !== unit.agency) ? `<span class="pp-agency muted">${esc(p.agency)}</span>` : ''}${p.notes ? `<span class="pp-agency muted">${esc(p.notes)}</span>` : ''}</span>
      ${qualBadges(p)}
      <span class="pp-state">${esc(state)}${buddy && compact ? `<span class="muted"> · with ${esc(buddy.name)}</span>` : ''}</span>
      <span class="pp-act">${ops && !p.archived_at ? `
        ${compact ? '' : `<select class="sel" data-select="person-unit" data-id="${p.id}" aria-label="Unit" title="Move to another unit">${units.map((u) => `<option value="${u.user_id}"${u.user_id === p.user_id ? ' selected' : ''}>${esc(unitLabel(u))}</option>`).join('')}</select>
        <select class="sel" data-select="person-buddy" data-id="${p.id}" aria-label="Buddy" title="Who this person pairs with"><option value="">No buddy</option>${mates.map((x) => `<option value="${x.id}"${p.buddy_id === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`}
        ${p.checked_out_at ? `<button class="btn sm" data-action="person-in" data-id="${p.id}">Back in</button>` : `<button class="btn sm" data-action="person-out" data-id="${p.id}">Check out</button>`}
        ${compact ? '' : `<button class="btn sm" data-action="person-edit" data-id="${p.id}" title="Correct the name, rank or role, agency, qualifications or notes">Edit</button><button class="btn sm" data-action="person-remove" data-id="${p.id}" title="Takes the person off the roster; the record is kept">Remove</button>`}` : ops && p.archived_at ? `<button class="btn sm" data-action="person-restore" data-id="${p.id}">Put back</button>` : ''}</span>
    </div>`;
}

// The unit panel's people: who is on it now, and the names as typed when nobody is on record.
function unitPeopleHtml(data, m) {
  const rows = data.unitPeople(m.user_id);
  const on = rows.filter((p) => !p.checked_out_at);
  return `
    <div class="d-row"><span class="k" style="width:auto;flex:1">People on the unit · ${on.length}${rows.length > on.length ? ` <span style="font-weight:400">(${rows.length - on.length} checked out)</span>` : ''}</span><button class="btn sm" data-action="people">People board</button></div>
    ${rows.length ? `<div class="pp-list compact">${rows.map((p) => personRowHtml(data, p, { compact: true })).join('')}</div>`
      : `<div class="muted" style="font-size:12.5px">No names on record${m.crew ? `: crew "${esc(m.crew)}"${m.crew_count != null ? ', ' + m.crew_count + ' people' : ''} as typed at check-in` : ''}. The unit adds its people from its menu; you can add them on the People board.</div>`}`;
}

// The chips in the board's bar: every qualification with how many people on scene carry it.
export function peopleChipsHtml(data, state) {
  const on = data.peopleOn();
  const cur = (state.people && state.people.quals) || new Set();
  return QUALIFICATIONS.map(([q, label]) => `<button class="chip${cur.has(q) ? ' on' : ''}" data-action="people-qual" data-q="${q}" aria-pressed="${cur.has(q)}">${esc(label)} <span class="n">${on.filter((p) => (p.qualifications || []).includes(q)).length}</span></button>`).join('');
}

// The People board: everyone by unit, with the find box and the chips narrowing the list.
// What the base knows about who is behind a member: for the Members tab and the unit panel.
export function identityState(data, m) {
  const p = data.profileOf(m.user_id);
  if (!p || !profileReady(p)) return { cls: 'haz', text: 'Nothing given' };
  if (p.verified_at) return { cls: 'cleared', text: 'Verified ' + hhmm(p.verified_at) };
  if (identityGiven(p)) return { cls: 'st-available', text: 'Licence on file, not verified' };
  return { cls: 'haz', text: 'Name and phone only' };
}

// The Members tab: who is on the incident, in which role, with what identity; Operations changes
// roles and removes or restores members. The person who opened the incident is always Operations.
function membersHtml(data) {
  const me = data.me(), ops = !!me && me.role === 'ops', inc = data.incident;
  const members = data.members().sort((a, b) => (b.role === 'ops') - (a.role === 'ops') || (a.unit_name || '').localeCompare(b.unit_name || ''));
  const removed = data.removedMembers();
  const row = (m) => {
    const p = data.profileOf(m.user_id), id = identityState(data, m), opener = m.user_id === inc.created_by, self = !!me && m.user_id === me.user_id;
    const zone = data.zones().find((z) => z.assigned_to === m.user_id && z.status === 'active');
    return `
      <div class="mb-row${m.removed_at ? ' gone' : ''}" data-member="${m.user_id}">
        <span class="mb-who">${esc(unitWithKind(m))}${p && p.full_name ? `<span> · ${esc(p.full_name)}</span>` : ''}${p && p.phone ? `<span> · ${esc(p.phone)}</span>` : ''}</span>
        <span class="muted">${esc(m.agency || 'agency not set')}${zone ? ' · in ' + esc(zone.code) : ''}</span>
        <span><span class="badge ${m.role === 'ops' ? 'cleared' : 'st-assigned'}">${m.role === 'ops' ? 'Operations' : 'Unit'}</span>${opener ? '<span class="muted"> · opened the incident</span>' : ''}</span>
        <span>${m.removed_at ? `<span class="badge haz">Removed ${hhmm(m.removed_at)}</span>` : `<span class="badge ${id.cls}">${esc(id.text)}</span> <span class="muted">${esc(STATUS_LABEL[m.status] || m.status)}</span>`}</span>
        <span class="mb-act">${m.removed_at
          ? (ops ? `<button class="btn sm" data-action="member-restore" data-id="${m.user_id}">Restore</button>` : '')
          : `${m.role === 'unit' ? `<button class="btn sm" data-action="select-unit" data-id="${m.user_id}">Open</button>` : ''}
             ${ops && !opener ? (m.role === 'ops'
               ? `<button class="btn sm" data-action="member-role" data-id="${m.user_id}" data-role="unit" title="A unit again: it checks in on a phone and holds divisions">Make a unit</button>`
               : `<button class="btn sm" data-action="member-role" data-id="${m.user_id}" data-role="ops" title="Can run the incident from the base">Make Operations</button>`) : ''}
             ${ops && !opener && !self ? `<button class="btn sm" data-action="member-remove" data-id="${m.user_id}" title="Takes them off the incident; what they sent stays, and they can be put back">Remove</button>` : ''}`}</span>
      </div>`;
  };
  return `
    <div class="pp-top"><span class="pp-count">${members.length} member${members.length === 1 ? '' : 's'} · ${members.filter((m) => m.role === 'ops').length} Operations${removed.length ? ' · ' + removed.length + ' removed' : ''}</span></div>
    <p class="muted" style="font-size:12.5px;margin:0 0 8px">The six-letter join code makes a unit; the Operations code on the home panel makes Operations. Removing a member keeps everything they sent and can be undone here.</p>
    <div class="mb-list">${members.map(row).join('')}</div>
    ${removed.length ? `<div class="k">Removed · kept, never deleted</div><div class="mb-list">${removed.map(row).join('')}</div>` : ''}`;
}

export function peopleBoardHtml(data, state) {
  const ps = state.people || {};
  const tabs = `<div class="pp-tabs chips"><button class="chip${ps.tab === 'members' ? '' : ' on'}" data-action="people-tab" data-tab="people" aria-pressed="${ps.tab !== 'members'}">People</button><button class="chip${ps.tab === 'members' ? ' on' : ''}" data-action="people-tab" data-tab="members" aria-pressed="${ps.tab === 'members'}">Members</button></div>`;
  if (ps.tab === 'members') return tabs + membersHtml(data);
  const all = data.people();
  const on = data.peopleOn();
  const ops = !!data.me() && data.me().role === 'ops';
  const unitOf = (uid) => unitLabel(data.member(uid));
  const shown = peopleMatch(all, { q: ps.q, quals: ps.quals, unitLabelOf: unitOf });
  const members = data.members().sort((a, b) => (a.role === 'ops') - (b.role === 'ops') || (a.status === 'checked_out') - (b.status === 'checked_out') || (a.unit_name || '').localeCompare(b.unit_name || ''));
  const want = [...(ps.quals || [])];
  const overScene = peopleOverScene(on, data.members(), data.sceneHours());   // v47
  const narrowed = want.length || (ps.q || '').trim();
  const count = narrowed ? `${shown.length} of ${all.length} ${all.length === 1 ? 'person' : 'people'}${want.length ? ' with ' + want.map(qualLabel).join(' and ') : ''}${(ps.q || '').trim() ? ' matching "' + esc(ps.q.trim()) + '"' : ''}`
    : `${on.length} on scene on ${data.activeUnits().length} unit${data.activeUnits().length === 1 ? '' : 's'}${all.length > on.length ? ' · ' + (all.length - on.length) + ' checked out' : ''}${overScene.length ? ' · <span class="pp-over">' + overScene.length + ' past ' + data.sceneHours() + ' h on scene</span>' : ''}`;
  const now = Date.now();
  const editing = ops && ps.edit ? data.person(ps.edit) : null;   // Edit on a row opens the same form, filled in (v29)
  const addForm = ops && (ps.add || editing) ? `
    <form class="inline-form pp-form" data-form="${editing ? 'person-edit' : 'person-add'}"${editing ? ` data-id="${editing.id}"` : ''}>
      ${editing ? `<div class="k">Edit ${esc(editing.name)} · ${esc(unitLabel(data.member(editing.user_id)))}</div>` : ''}
      <div class="row-2">
        ${editing ? '' : `<label>Unit <select name="unit" class="sel">${members.filter((m) => m.status !== 'checked_out').map((m) => `<option value="${m.user_id}"${ps.addUnit === m.user_id ? ' selected' : ''}>${esc(unitLabel(m))}</option>`).join('')}</select></label>`}
        <label>Name <input name="name" required maxlength="80" placeholder="Surname, or the full name" autocomplete="off" value="${esc(editing ? editing.name : '')}"></label>
        ${editing ? `<label>Notes <input name="notes" maxlength="200" placeholder="Anything the next shift should know" value="${esc(editing.notes || '')}"></label>` : ''}
      </div>
      <div class="row-2">
        <label>Rank or role <input name="role" maxlength="60" placeholder="Lt., Paramedic, Boat operator" value="${esc(editing ? editing.role || '' : '')}"></label>
        <label>Agency <input name="agency" maxlength="120" placeholder="The unit's, unless different" value="${esc(editing && data.member(editing.user_id) && editing.agency !== data.member(editing.user_id).agency ? editing.agency || '' : '')}"></label>
      </div>
      <div class="chips">${QUALIFICATIONS.map(([q, label]) => `<label class="chip" style="min-height:34px;padding:4px 10px"><input type="checkbox" name="q" value="${q}"${editing && (editing.qualifications || []).includes(q) ? ' checked' : ''}> ${esc(label)}</label>`).join('')}</div>
      <div class="row-btns"><button class="btn sm" type="button" data-action="${editing ? 'person-edit-cancel' : 'people-add-toggle'}">Cancel</button><button class="btn pri sm" type="submit">${editing ? 'Save' : 'Add to the unit'}</button></div>
    </form>` : '';
  const groups = members.map((m) => {
    const rows = shown.filter((p) => p.user_id === m.user_id);
    if (!rows.length) return '';
    const zone = data.zones().find((z) => z.assigned_to === m.user_id && z.status === 'active');
    const mine = data.unitPeople(m.user_id);
    return `
      <div class="pp-grp" data-unit="${m.user_id}">
        <button class="pp-grp-h" data-action="select-unit" data-id="${m.user_id}" title="Open the unit">
          <span class="ur-name">${esc(unitLabel(m))}</span>
          <span class="badge st-${esc(m.status)}">${STATUS_LABEL[m.status] || m.status}</span>
          <span class="muted">${[m.agency, zone ? 'in ' + zone.code : '', `${mine.filter((p) => !p.checked_out_at).length} on the unit${mine.length > mine.filter((p) => !p.checked_out_at).length ? ', ' + (mine.length - mine.filter((p) => !p.checked_out_at).length) + ' checked out' : ''}`].filter(Boolean).map(esc).join(' · ')}</span>
        </button>
        <div class="pp-list">${rows.map((p) => personRowHtml(data, p, { now })).join('')}</div>
      </div>`;
  }).join('');
  const noNames = data.units().filter((u) => u.status !== 'checked_out' && !data.unitPeople(u.user_id).length);
  return tabs + `
    <div class="pp-top">
      <span class="pp-count">${count}</span>
      ${ops && !ps.add ? '<button class="btn sm" data-action="people-add-toggle">Add a person</button>' : ''}
    </div>
    ${addForm}
    ${all.length ? (groups || '<p class="muted">Nobody matches. Clear the chips or the find box.</p>') : '<p class="muted">No people on record yet. A unit adds its people by name when it checks in on the phone, or you add them here.</p>'}
    ${noNames.length ? `<p class="muted" style="font-size:12.5px">No names on record for ${noNames.map((u) => esc(unitLabel(u)) + (u.crew ? ' (crew "' + esc(u.crew) + '"' + (u.crew_count != null ? ', ' + u.crew_count : '') + ')' : u.crew_count != null ? ' (' + u.crew_count + ' counted)' : ` (<span class="hc-unknown">${HEAD_COUNT_UNKNOWN}</span>)`)).join(', ')}. Name them for the PAR: a PAR by name says who is missing, not just how many.</p>` : ''}`;
}

// The check-in list, ICS 211: everyone who checked in, by unit, with when and for how long.
export function form211Sections(data) {
  const inc = data.incident, p = data.currentPeriod();
  const all = data.people();
  const S = [];
  S.push({ title: 'Check-in list, ICS 211', lines: [
    inc.name + (inc.base_name ? ' · base: ' + inc.base_name : ''),
    periodLine(p),
    commandText(inc, p) || null,
    'Prepared by Operations, ' + whenText(new Date())
  ].filter(Boolean) });
  const members = data.members().sort((a, b) => (a.role === 'ops') - (b.role === 'ops') || (a.unit_name || '').localeCompare(b.unit_name || '')).filter((m) => m.role === 'unit' || data.unitPeople(m.user_id).length);
  for (const m of members) {
    const rows = data.unitPeople(m.user_id);
    const zone = data.zones().find((z) => z.assigned_to === m.user_id && z.status === 'active');
    S.push({ title: `${unitWithKind(m)}${m.agency ? ' · ' + m.agency : ''} · ${STATUS_LABEL[m.status] || m.status}${zone ? ' · ' + zone.code : ''}${m.status === 'checked_out' && m.checked_out_at ? ' ' + hhmm(m.checked_out_at) : ''}`,
      lines: [(() => { const p = data.profileOf(m.user_id); return p ? `Checked in by ${p.full_name}${p.phone ? ', ' + p.phone : ''}${p.licence_number ? ', licence ' + p.licence_state + ' ' + licenceTail(p.licence_number) : ''}${identityGiven(p) ? (p.verified_at ? ', verified' : ', not verified') : ', ' + NO_ID_TEXT + (p.verified_at ? ', verified in person' : ', not verified')}` : 'Checked in by an account with no identity given'; })(), (m.status === 'checked_out' && m.demob && Array.isArray(m.demob.open) && m.demob.open.length ? 'At check-out, not done: ' + m.demob.open.join(', ') + (m.demob.note ? ' · for the next crew: ' + m.demob.note : '') : null)].filter(Boolean).concat(rows.length ? rows.map((px) => {
        const buddy = px.buddy_id ? data.person(px.buddy_id) : null;
        return `${personLine(px)}${px.agency && px.agency !== m.agency ? ' · ' + px.agency : ''} · checked in ${hhmm(px.checked_in_at)} · ${px.checked_out_at ? 'checked out ' + hhmm(px.checked_out_at) : 'on scene ' + onSceneText(px)}${buddy ? ' · with ' + buddy.name : ''}${px.notes ? ' · ' + px.notes : ''}`;
      }) : [m.crew ? `No names on record · crew as typed: ${m.crew}${m.crew_count != null ? ' · ' + m.crew_count + ' people' : ''} · checked in ${hhmm(m.joined_at)}` : `No names on record · checked in ${hhmm(m.joined_at)}`]) });
  }
  const on = data.peopleOn();
  const byAgency = new Map();
  for (const px of all) byAgency.set(px.agency || 'No agency named', (byAgency.get(px.agency || 'No agency named') || 0) + 1);
  const quals = QUALIFICATIONS.map(([q, label]) => [label, on.filter((px) => (px.qualifications || []).includes(q)).length]).filter((x) => x[1] > 0);
  S.push({ title: 'Totals', lines: [
    `${all.length} ${all.length === 1 ? 'person' : 'people'} checked in on ${data.units().length} unit${data.units().length === 1 ? '' : 's'} · ${on.length} on scene · ${all.length - on.length} checked out`,
    all.length ? 'By agency: ' + [...byAgency.entries()].sort((a, b) => b[1] - a[1]).map(([a, n]) => `${a} ${n}`).join(' · ') : null,
    quals.length ? 'On scene by qualification: ' + quals.map(([l, n]) => `${l} ${n}`).join(' · ') : null
  ].filter(Boolean) });
  return S;
}

// ---- facilities and the communications plan

export function facilitiesHtml(data) {
  const open = data.facilities(), closed = data.facilities(true).filter((f) => f.closed_at);
  return `
    <div class="d-row" style="margin-top:6px"><span class="k" style="width:auto;flex:1">Facilities</span>
      <select class="sel" id="facility-kind" aria-label="Kind of facility to place">${FACILITY_KINDS.map(([v, label]) => `<option value="${v}"${v === 'staging' ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select>
      <button class="btn sm" data-action="place-facility">Place</button>
    </div>
    ${open.length ? open.map((f) => `<button class="ur" data-action="select-facility" data-id="${f.id}"><span class="fmark fmark-${esc(f.kind)} inline">${esc(facilityKind(f.kind)[2])}</span><span class="ur-main"><span class="ur-name">${esc(f.name || facilityKind(f.kind)[1])}</span><span class="ur-sub">${esc(facilityKind(f.kind)[1])}${f.contact ? ' · ' + esc(f.contact) : ''}</span></span></button>`).join('') : '<div class="muted" style="font-size:12.5px">None yet. Pick a kind and press Place, then click the map.</div>'}
    ${closed.length ? `<div class="muted" style="font-size:12px">${closed.length} closed</div>` : ''}`;
}

export function channelsHtml(data) {
  const ch = data.channels();
  return `
    <div class="k" style="margin-top:6px">Communications plan (ICS 205)</div>
    ${ch.length ? ch.map((c, i) => `<div class="chan"><span class="chan-use">${esc(c.use)}</span><span class="mono chan-ch">${esc(c.channel)}</span>${c.notes ? `<span class="muted">${esc(c.notes)}</span>` : ''}<button class="btn sm" data-action="channel-remove" data-i="${i}" aria-label="Remove">×</button></div>`).join('') : '<div class="muted" style="font-size:12.5px">No channels yet. Command, one tactical per division, and emergency traffic is the usual set.</div>'}
    <form class="composer" data-form="channel-add"><div class="composer-row"><input name="use" placeholder="Use, e.g. Tactical, Division A" required maxlength="60"><input name="channel" placeholder="Channel" required maxlength="24" style="flex:0 1 110px"><button class="btn pri sm" type="submit">Add</button></div></form>`;
}

function facilityHtml(data, f, state) {
  const k = facilityKind(f.kind);
  const shelter = f.kind === 'shelter', people = PERSON_PLACES.includes(f.kind);
  const c = people ? placeCounts(data.evacuees(), f.id) : null;
  return `
    <button class="back" data-action="close-panel">Back to units</button>
    <div class="title">${esc(f.name || k[1])} <span>${esc(k[1])}${f.closed_at ? ' · closed ' + hhmm(f.closed_at) : ''}</span></div>
    ${f.notes ? `<div class="d-sub">${esc(f.notes)}</div>` : ''}
    <div class="d-row">${f.closed_at ? `<span class="badge">Closed ${hhmm(f.closed_at)}</span><button class="btn sm" data-action="reopen-facility" data-id="${f.id}" title="Open again: back on the field's Nearby card and the map">Reopen</button>` : `<span class="badge cleared">Open</span><button class="btn sm" data-action="close-facility" data-id="${f.id}" title="The facility itself has closed: it leaves the field's Nearby card and is drawn faded on the map. Logged; Reopen brings it back.">Mark closed</button>`}</div>
    <div class="kv">
      <span class="k">Contact</span><span>${esc(f.contact) || 'not set'}</span>
      ${shelter ? `<span class="k">Beds</span><span><strong>${esc(bedsText(c.people, f.beds))}</strong>${f.beds == null ? ' <span class="muted">· capacity not set: Beds, below</span>' : ''}</span>
      <span class="k">Expected</span><span>${f.expected ? esc(f.expected) + ' · ' : ''}<span class="ev-coming${c.arriving.length ? ' on' : ''}">${c.arrivingPeople} on ${c.arrivingPeople === 1 ? 'the' : 'their'} way from crews</span> <span class="muted">(live: records a crew sent here, not yet signed in at the desk)</span></span>
      <span class="k">Needs here</span><span>${c.needs.length ? esc(needsTotalsText(c.needs)) : 'none listed'}</span>
      <span class="k">Desk</span><span>${esc(data.units().filter((u) => u.kind === 'shelter_desk' && u.facility_id === f.id && u.status !== 'checked_out').map((u) => unitLabel(u)).join(', ') || 'no shelter desk checked in here yet')}</span>` : ''}
      <span class="k">Address</span><span>${esc(f.address) || 'not set'}</span>
      <span class="k">Position</span><span class="mono">${esc(latLngText(f.lat, f.lng))}</span>
      <span class="k">Opened</span><span>${esc(whenText(f.created_at))}</span>
    </div>
    <form class="inline-form" data-form="facility-edit" data-id="${f.id}">
      <div class="row-2">
        <label>Kind <select name="kind" class="sel">${FACILITY_KINDS.map(([v, label]) => `<option value="${v}"${v === f.kind ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select></label>
        <label>Name <input name="name" value="${esc(f.name)}" placeholder="Where it is"></label>
      </div>
      <label>Street address <input name="address" value="${esc(f.address || '')}" placeholder="1200 Mill St, east lot" maxlength="160"></label>
      <div class="muted" style="font-size:12px;margin-top:-6px">Getting there on the join card and the 204's Where to go read it before the coordinates (v48).</div>
      <label>Contact <input name="contact" value="${esc(f.contact)}" placeholder="A channel or a phone number"></label>
      <label>Notes <input name="notes" value="${esc(f.notes)}" placeholder="What the field should know"></label>
      ${shelter ? `<div class="row-2">
        <label>Beds <input name="beds" type="number" min="0" max="100000" inputmode="numeric" value="${f.beds == null ? '' : f.beds}" placeholder="Capacity"></label>
        <label>Expected <input name="expected" value="${esc(f.expected || '')}" placeholder="Bus 2 from Pecan Park, 12 people, 17:30" maxlength="200"></label>
      </div>` : ''}
      <div class="row-btns">
        <button class="btn sm" type="button" data-action="pan-to" data-lat="${f.lat}" data-lng="${f.lng}">Show on map</button>
        <button class="btn sm" type="button" data-action="close-panel" title="Close this card; the facility stays open">Close</button>
        <button class="btn pri sm" type="submit">Save</button>
      </div>
    </form>
    ${people ? placePeopleHtml(data, f, c, state) : ''}`;
}

// ---- people sheltered and moved (v26): one record per person or family, on the shelter's or the
// hospital's card, findable by name from the header; counts only on anything that leaves the incident.
const evFrom = (data, e) => evacueeFrom(e, { structureOf: (id) => data.structure(id), zoneOf: (id) => data.zone(id) });
const facilityOf = (data) => (id) => data.facility(id);
// how the record came to be: "brought out by Unit 3 at 14:05", "signed in by Gym desk 14:22"
function evOrigin(data, e) {
  if (e.structure_id || (e.logged_by && data.member(e.logged_by) && data.member(e.logged_by).role === 'unit' && data.member(e.logged_by).kind !== 'shelter_desk')) return `brought out by ${unitLabel(data.member(e.logged_by))} at ${hhmm(e.created_at)}`;
  return e.signed_in_by ? `signed in by ${unitLabel(data.member(e.signed_in_by))} ${hhmm(e.signed_in_at)}` : `logged by ${unitLabel(data.member(e.logged_by))} ${hhmm(e.created_at)}`;
}
// Where now, as a select: this place, the other shelters and the hospitals, or gone from them.
function whereSelectHtml(data, e, attrs) {
  const places = data.facilities(true).filter((x) => (PERSON_PLACES.includes(x.kind) && !x.closed_at) || x.id === e.facility_id);
  const cur = whereValue(e);
  return `<select class="sel" ${attrs} aria-label="Where now" title="Where now: a record is moved, never removed">${places.map((x) => `<option value="f:${x.id}"${cur === 'f:' + x.id ? ' selected' : ''}>${esc(x.name || facilityKind(x.kind)[1])}${e.status === 'on_the_way' && cur === 'f:' + x.id ? ' (on the way)' : ''}</option>`).join('')}${LEFT_CHOICES.map(([v, label]) => `<option value="${v}"${cur === v ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
}
function evRowHtml(data, e, f) {
  const away = !(e.facility_id === f.id && (e.status === 'here' || e.status === 'moved'));
  return `<div class="ev-r${away ? ' away' : ''}" data-ev="${e.id}">
    <span class="ev-who"><strong>${esc(evacueeWho(e))}</strong>${e.note ? `<span class="muted"> · ${esc(e.note)}</span>` : ''}</span>
    <span class="muted">${evFrom(data, e) ? 'from ' + esc(evFrom(data, e)) : ''}</span>
    <span class="${away ? 'ev-moved' : ''}">${away ? esc(evacueeWhere(e, facilityOf(data))) : esc(needsText(e.needs)) || '<span class="muted">—</span>'}</span>
    <span class="muted">${esc(evOrigin(data, e))}</span>
    ${whereSelectHtml(data, e, `data-select="ev-where" data-id="${e.id}"`)}
  </div>`;
}
function placePeopleHtml(data, f, c, state) {
  const adding = state && state.evAdd === f.id;
  const hospital = f.kind !== 'shelter';
  return `
    ${c.arriving.length ? `<div class="ev-box arriving"><div class="d-row"><span class="k" style="width:auto;flex:1">On the way from crews · ${c.arrivingPeople} ${c.arrivingPeople === 1 ? 'person' : 'people'}</span></div>
      ${c.arriving.map((e) => `<div class="ev-r" data-ev="${e.id}"><span class="ev-who"><strong>${esc(evacueeWho(e))}</strong>${e.note ? `<span class="muted"> · ${esc(e.note)}</span>` : ''}</span><span class="muted">${evFrom(data, e) ? 'from ' + esc(evFrom(data, e)) : ''}</span><span>${esc(needsText(e.needs))}</span><span class="muted">${esc(evOrigin(data, e))}</span><button class="btn sm" data-action="ev-sign-in" data-id="${e.id}" data-facility="${f.id}" title="They have arrived: sign them in here (the desk usually does this)">Signed in</button></div>`).join('')}</div>` : ''}
    <div class="ev-box"><div class="d-row"><span class="k" style="width:auto;flex:1">${hospital ? 'People sent here' : 'People here'} · ${c.people} in ${c.here.length} record${c.here.length === 1 ? '' : 's'}</span><span class="muted" style="font-size:12px">newest first</span></div>
      ${c.here.length ? `<div class="ev-grid">${c.here.map((e) => evRowHtml(data, e, f)).join('')}</div>` : '<div class="muted" style="font-size:12.5px">Nobody signed in yet.</div>'}
      ${c.left.length ? `<div class="k" style="margin-top:4px">Left here</div><div class="ev-grid">${c.left.map((e) => evRowHtml(data, e, f)).join('')}</div>` : ''}
      ${adding ? evAddFormHtml(f) : ''}
      <div class="d-row">${adding ? '' : `<button class="btn sm" data-action="ev-add-toggle" data-id="${f.id}">Sign in a person</button>`}<button class="btn sm" data-action="print-shelter" data-id="${f.id}">Print the list</button><span class="muted" style="font-size:12px">A record is moved, never removed: moved to, left with family, unknown.</span></div>
    </div>`;
}
function evAddFormHtml(f) {
  return `<form class="inline-form ev-add" data-form="evacuee-add" data-facility="${f.id}">
      <div class="row-2"><label>Who <input name="label" required maxlength="120" placeholder="a name, or &quot;family of 4, Nguyen&quot;" autocomplete="off"></label><label>How many <input name="count" type="number" min="1" max="999" value="1"></label></div>
      <div class="chips">${NEEDS.map(([k, label]) => `<label class="chip" style="min-height:34px;padding:4px 10px"><input type="checkbox" name="need" value="${k}"> ${esc(label)}</label>`).join('')}</div>
      <div class="row-2"><label>From <input name="from" maxlength="120" placeholder="address or division" autocomplete="off"></label><label>Note <input name="note" maxlength="300" placeholder="on oxygen, stable" autocomplete="off"></label></div>
      <div class="row-btns"><button class="btn sm" type="button" data-action="ev-add-toggle" data-id="">Cancel</button><button class="btn pri sm" type="submit">Sign in here</button></div>
    </form>`;
}
// The home panel's line per shelter and hospital, and the find box (the header has one too).
export function shelteredHtml(data, state) {
  const places = data.facilities().filter((f) => PERSON_PLACES.includes(f.kind));
  const all = data.evacuees();
  if (!places.length && !all.length) return '';
  const q = (state && state.find && state.find.home) || '';
  return `
    <div class="k" style="margin-top:6px">People sheltered and moved</div>
    ${places.map((f) => { const c = placeCounts(all, f.id); return `<button class="ur" data-action="select-facility" data-id="${f.id}"><span class="fmark fmark-${esc(f.kind)} inline">${esc(facilityKind(f.kind)[2])}</span><span class="ur-main"><span class="ur-name">${esc(f.name || facilityKind(f.kind)[1])}</span><span class="ur-sub">${f.kind === 'shelter' ? esc(bedsText(c.people, f.beds)) + (f.beds != null ? ' beds' : '') + (c.arriving.length ? ` · <span class="ev-coming on">${c.arrivingPeople} on the way</span>` : '') + (c.needs.length ? ' · ' + esc(needsTotalsText(c.needs)) : '') : c.people + ' sent here'}</span></span></button>`; }).join('')}
    <div class="find-home"><input class="log-search" data-find="home" type="search" value="${esc(q)}" placeholder="Find a person: a name, a street" aria-label="Find a person" autocomplete="off"><div data-find-results="home">${q.trim() ? findPersonHtml(data, q) : ''}</div></div>`;
}
// Find a person: where they are now and since when, from every shelter, hospital and crew record, and the
// responders on the People board.
export function findPersonHtml(data, q) {
  const hits = evacueeMatch(data.evacuees(true), q, { facilityOf: facilityOf(data), structureOf: (id) => data.structure(id), zoneOf: (id) => data.zone(id) }).slice(0, 12);
  const crew = (q || '').trim() ? peopleMatch(data.people(), { q, unitLabelOf: (uid) => unitLabel(data.member(uid)) }).slice(0, 6) : [];
  const rows = hits.map((e) => { const place = e.facility_id || e.prev_facility_id; return `<div class="find-row"><span class="find-who"><strong>${esc(evacueeWho(e))}</strong>${e.needs.length ? ' · ' + esc(needsText(e.needs)) : ''}</span><span class="find-where">${esc(evacueeWhere(e, facilityOf(data)))}</span><span class="muted find-from">${esc([evFrom(data, e) ? 'from ' + evFrom(data, e) : '', evOrigin(data, e)].filter(Boolean).join(' · '))}</span>${place ? `<button class="btn sm" data-action="select-facility" data-id="${place}">Open</button>` : ''}</div>`; }).join('');
  const crewRows = crew.map((p) => { const u = data.member(p.user_id); return `<div class="find-row"><span class="find-who"><strong>${esc(p.name)}</strong>${p.role ? ' · ' + esc(p.role) : ''}</span><span class="find-where">responder on ${esc(unitLabel(u))}${p.checked_out_at ? ', checked out ' + hhmm(p.checked_out_at) : ', on scene since ' + hhmm(p.checked_in_at)}</span><span class="muted find-from"></span><button class="btn sm" data-action="select-unit" data-id="${p.user_id}">Open</button></div>`; }).join('');
  if (!rows && !crewRows) return `<div class="find-none muted">Nobody on record matches "${esc(q.trim())}". Records come from the shelter desks, the crews' house records and Operations; a desk's "Not listed?" asks you to look.</div>`;
  return rows + (crewRows ? `<div class="k find-k">Responders</div>${crewRows}` : '');
}
// A shelter desk's shelter, on its unit panel; Operations can move the desk.
function deskPlaceHtml(data, m) {
  const shelters = data.facilities().filter((f) => f.kind === 'shelter');
  return `<div class="d-row"><span class="k">Shelter desk at</span><select class="sel" data-select="unit-facility" data-id="${m.user_id}" aria-label="The shelter this desk works at"><option value=""${m.facility_id ? '' : ' selected'}>Not chosen yet</option>${shelters.map((f) => `<option value="${f.id}"${m.facility_id === f.id ? ' selected' : ''}>${esc(f.name || 'Shelter')}</option>`).join('')}</select>${m.facility_id ? `<button class="btn sm" data-action="select-facility" data-id="${m.facility_id}">Open the shelter</button>` : ''}</div>`;
}
// Print the list: the people at a shelter or a hospital, for the desk's clipboard. Names stay inside the incident.
export function placeListSections(data, f) {
  const c = placeCounts(data.evacuees(), f.id), inc = data.incident;
  const line = (e) => `${hhmm(e.signed_in_at || e.status_at)}  ${evacueeWho(e)}${evFrom(data, e) ? ' · from ' + evFrom(data, e) : ''}${e.needs.length ? ' · needs ' + needsText(e.needs) : ''}${e.note ? ' · ' + e.note : ''}`;
  return [
    { title: `People at ${f.name || facilityKind(f.kind)[1]}, ${facilityKind(f.kind)[1].toLowerCase()}`, lines: [
      inc.name + (inc.base_name ? ' · base: ' + inc.base_name : ''),
      f.kind === 'shelter' ? `Beds: ${bedsText(c.people, f.beds)}${f.beds != null ? ' taken' : ''} · ${c.here.length} record${c.here.length === 1 ? '' : 's'}` : `${c.people} sent here in ${c.here.length} record${c.here.length === 1 ? '' : 's'}`,
      f.kind === 'shelter' ? `Expected: ${f.expected || 'nothing typed'} · ${c.arrivingPeople} on the way from crews` : null,
      c.needs.length ? 'Needs: ' + needsTotalsText(c.needs) : null,
      'Printed ' + whenText(new Date()) + '. Names are for this incident only, never for public release.'
    ].filter(Boolean) },
    { title: `${f.kind === 'shelter' ? 'Here now' : 'Sent here'}, newest first`, lines: c.here.length ? c.here.map(line) : ['Nobody signed in'] },
    { title: 'On the way from crews', lines: c.arriving.length ? c.arriving.map((e) => `${evacueeWho(e)}${evFrom(data, e) ? ' · from ' + evFrom(data, e) : ''} · ${evOrigin(data, e)}${e.needs.length ? ' · needs ' + needsText(e.needs) : ''}`) : ['None'] },
    { title: 'Left here', lines: c.left.length ? c.left.map((e) => `${evacueeWho(e)} · ${evacueeWhere(e, facilityOf(data))}`) : ['None'] }
  ];
}
export function placeListHtml(data, f) { return sectionsHtml(placeListSections(data, f)); }
export function placeListText(data, f) { return sectionsText(placeListSections(data, f)); }
// The sitrep's line: counts only, never a name.
export function peopleLine(data) {
  return peopleShelteredLine({ evacuees: data.evacuees(), facilities: data.facilities(true), placeWords: placeWordsOf({ zones: data.zones(), structures: data.structures(), facilities: data.facilities(true) }) });
}

function structureHtml(data, s) {
  const z = s.zone_id ? data.zone(s.zone_id) : null;
  const opt = (list, v) => list.map(([val, label]) => `<option value="${val}"${String(val) === String(v) ? ' selected' : ''}>${esc(label)}</option>`).join('');
  const water = s.water_cm == null ? '' : String(WATER.reduce((best, w) => (Math.abs(w[0] - s.water_cm) < Math.abs(best - s.water_cm) ? w[0] : best), WATER[0][0]));
  return `
    <button class="back" data-action="${z ? 'select-zone' : 'close-panel'}"${z ? ` data-id="${z.id}"` : ''}>${z ? 'Back to ' + esc(z.code) : 'Back to units'}</button>
    <div class="title">${esc(s.label || 'Structure')} <span>${z ? esc(z.code) : 'outside the divisions'}</span></div>
    <div class="d-row"><span class="badge ${s.status === 'searched' ? 'cleared' : s.status === 'in_progress' ? 'active' : ''}">${STRUCTURE_STATUS[s.status] || s.status}${s.searched_at ? ' ' + hhmm(s.searched_at) : ''}</span>${s.people_needing_help > 0 ? `<span class="badge" style="background:var(--danger);color:#fff">${s.people_needing_help} need help</span>` : ''}</div>
    ${structureSummary(s) ? `<div class="d-sub">${esc(structureSummary(s))}</div>` : ''}
    <div class="kv">
      <span class="k">Searched by</span><span>${s.searched_by ? esc(unitLabel(data.member(s.searched_by))) : 'nobody yet'}</span>
      <span class="k">Position</span><span class="mono">${esc(latLngText(s.lat, s.lng)) || 'unknown'}</span>
      ${s.marking ? `<span class="k">Marking</span><span>team ${esc(s.marking.team)} · out ${esc(s.marking.out)} · hazards ${esc(s.marking.haz)} · people ${esc(s.marking.victims)}</span>` : ''}
      ${s.revisit_at ? `<span class="k">Revisit at</span><span>${esc(revisitWords(s.revisit_at).text)}${revisitWords(s.revisit_at).due ? ' · due' : ''}</span>` : ''}
      ${s.notes ? `<span class="k">Notes</span><span>${esc(s.notes)}</span>` : ''}
    </div>
    <form class="inline-form" data-form="structure-edit" data-id="${s.id}">
      <label>Label <input name="label" value="${esc(s.label)}" placeholder="Address or what it is"></label>
      <div class="row-2">
        <label>Status <select name="status" class="sel">${opt(Object.entries(STRUCTURE_STATUS), s.status)}</select></label>
        <label>Occupants <select name="occupants" class="sel">${opt(OCCUPANTS, s.occupants)}</select></label>
      </div>
      <div class="row-2">
        <label>People needing help <input name="people" type="number" min="0" max="999" value="${s.people_needing_help}"></label>
        <label>Water <select name="water" class="sel"><option value=""${water === '' ? ' selected' : ''}>Not noted</option>${opt(WATER, water)}</select></label>
      </div>
      <div class="row-2">
        <label>Damage <select name="damage" class="sel">${opt(DAMAGE, s.damage)}</select></label>
        <label>Hazards <input name="hazards" value="${esc(s.hazards)}" placeholder="ELEC GAS"></label>
      </div>
      <label>Notes <input name="notes" value="${esc(s.notes)}"></label>
      <div class="row-btns">${s.lat != null ? `<button class="btn sm" type="button" data-action="pan-to" data-lat="${s.lat}" data-lng="${s.lng}">Show on map</button>` : ''}<button class="btn pri sm" type="submit">Save</button></div>
    </form>`;
}

// How a unit checked out: what it ticked, what it left undone, the note for the next crew.
export function demobHtml(m) {
  if (m.status !== 'checked_out' || !m.demob) return '';
  const open = Array.isArray(m.demob.open) ? m.demob.open : [];
  return `<div class="ident demob"><div class="k">Checked out ${m.checked_out_at ? hhmm(m.checked_out_at) : ''}</div>
    ${open.length ? `<div class="hazline" style="display:block">Not done: ${esc(open.join(' · '))}</div>` : '<div class="muted" style="font-size:12.5px">Everything on the list ticked</div>'}
    ${m.demob.note ? `<div style="font-size:13px">For the next crew: ${esc(m.demob.note)}</div>` : ''}
  </div>`;
}

// Resource requests (ICS 213RR): a card per request with the step Operations can take next.
const REQ_NEXT = { asked: [['approved', 'Approve'], ['declined', 'Can\'t fill']], approved: [['ordered', 'Mark ordered'], ['declined', 'Can\'t fill']], ordered: [['filled', 'Arrived, filled'], ['declined', 'Can\'t fill']], filled: [], declined: [['asked', 'Ask again']] };
const URG_RANK = { now: 0, nightfall: 1, tomorrow: 2, blocking: 0, '': 3 };
export function requestCardHtml(data, r) {
  const who = unitLabel(data.member(r.user_id));
  const z = r.zone_id ? data.zone(r.zone_id) : null;
  const next = REQ_NEXT[r.status] || [];
  return `<div class="req req-${esc(r.status)} urg-${esc(r.urgency || 'none')}" data-request="${r.id}">
    <div class="req-top">${r.urgency ? `<span class="badge urg-${esc(r.urgency)}">${esc(urgencyLabel(r.urgency))}</span>` : ''}<span class="badge st-req-${esc(r.status)}">${esc(REQUEST_STATUS[r.status] || r.status)}</span><span class="muted">${hhmm(r.created_at)} · ${esc(who)}${z ? ' · ' + esc(z.code) : ''}</span></div>
    <div class="req-line">${esc(requestLine(r))}</div>
    ${r.note ? `<div class="muted" style="font-size:12.5px">${esc(r.note)}</div>` : ''}
    ${(() => { if (!['asked', 'approved', 'ordered'].includes(r.status)) return ''; const m = unitsForRequest(r, { units: data.units(), zones: data.zones(), positions: data.positions() }); return m.length ? `<div class="req-onscene"><strong>On scene now:</strong> ${esc(onSceneLine(m))}${m.length > 3 ? ' · and ' + (m.length - 3) + ' more' : ''}. Open a division and press the unit's name to reassign it.</div>` : ''; })()}
    ${r.answer ? `<div style="font-size:12.5px">${esc(r.answer)}${r.status_at ? ' · ' + hhmm(r.status_at) : ''}</div>` : ''}
    ${next.length ? `<form class="req-answer" data-form="request-answer" data-id="${r.id}"><input name="answer" placeholder="${r.status === 'approved' ? 'Who is coming and when' : 'A word for the unit (optional)'}" maxlength="200" autocomplete="off">${next.map(([st, label]) => `<button class="btn sm${st === 'filled' ? ' green' : st === 'declined' ? '' : ' pri'}" name="status" value="${st}">${label}</button>`).join('')}</form>` : ''}
    ${r.lat != null && r.lng != null ? `<button class="plink" data-action="pan-to" data-lat="${r.lat}" data-lng="${r.lng}">Show on map</button>` : ''}
  </div>`;
}
export function requestsHtml(data) {
  const open = data.openRequests().sort((a, b) => (URG_RANK[a.urgency] ?? 3) - (URG_RANK[b.urgency] ?? 3) || (a.created_at < b.created_at ? -1 : 1));
  const done = data.requests().filter((r) => r.status === 'filled' || r.status === 'declined').slice(0, 4);
  const now = open.filter((r) => r.urgency === 'now' || r.urgency === 'blocking').length;
  return `
    <div class="d-row" style="margin-top:6px"><span class="k" style="width:auto;flex:1">Resource requests (ICS 213RR)</span>${now ? `<span class="badge urg-now">${now} to act on now</span>` : ''}<span class="muted">${open.length} open</span></div>
    ${open.length ? open.map((r) => requestCardHtml(data, r)).join('') : '<div class="muted" style="font-size:12.5px">Nothing open. The field asks from its inbox; Operations asks below.</div>'}
    ${done.length ? `<details class="muted" style="font-size:12.5px"><summary>${done.length} filled or declined lately</summary>${done.map((r) => requestCardHtml(data, r)).join('')}</details>` : ''}
    <form class="inline-form" data-form="request-add">
      <div class="row-2">
        <label>What <input name="what" placeholder="fuel truck, diesel" required maxlength="120"></label>
        <label>How many <input name="quantity" type="number" min="1" max="9999" value="1"></label>
      </div>
      <div class="row-2">
        <label>Kind <select name="kind" class="sel">${REQUEST_KINDS.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></label>
        <label>By when <select name="urgency" class="sel"><option value="">No rush</option>${URGENCY.filter(([v]) => v !== 'blocking').map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></label>
      </div>
      <div class="row-2">
        <label>For <select name="zone" class="sel"><option value="">Staging or the base</option>${data.zones().map((z) => `<option value="${z.id}">${esc(z.code)} ${esc(z.name)}</option>`).join('')}</select></label>
        <label>Why <input name="note" placeholder="in a few words" maxlength="300"></label>
      </div>
      <div class="row-btns"><button class="btn pri sm" type="submit">Ask Logistics</button></div>
    </form>`;
}
export function unitRequestsHtml(data, m) {
  const mine = data.requests().filter((r) => r.user_id === m.user_id).slice(0, 5);
  if (!mine.length) return '';
  return `<div class="k">Requests from ${esc(unitLabel(m))}</div>${mine.map((r) => requestCardHtml(data, r)).join('')}`;
}

// Hours on scene, for Finance: the table and the CSV, for one period or the whole incident.
export function hoursPeriod(data, state) { return state.hoursPeriod === 'all' ? null : (state.hoursPeriod && data.period(state.hoursPeriod)) || data.currentPeriod(); }
export function hoursHtml(data, state) {
  const period = hoursPeriod(data, state);
  const rows = hoursRows({ people: data.people(), members: data.members(), period });
  const t = hoursTotals(rows);
  const inc = data.incident;
  const fmt = (iso) => (iso ? hhmm(iso) : '');
  return `
    <div class="inline-form no-print" style="margin-bottom:14px"><div class="d-row">
      <label style="flex-direction:row;align-items:center;gap:6px">Period <select class="sel" data-select="hours-period">${data.periods().map((p) => `<option value="${p.id}"${period && period.id === p.id ? ' selected' : ''}>Operational period ${p.number} · ${hhmm(p.starts_at)}${p.closed_at ? ' to ' + hhmm(p.closed_at) : ', open'}</option>`).join('')}<option value="all"${!period ? ' selected' : ''}>Whole incident</option></select></label>
      <button class="btn pri sm" data-action="hours-csv">Export CSV</button>
    </div></div>
    <section><h2>Hours on scene</h2>
      <p>${esc(inc.name)} · ${period ? 'Operational period ' + period.number + ', ' + hhmm(period.starts_at) + (period.closed_at ? ' to ' + hhmm(period.closed_at) : ', still open') : 'the whole incident so far'} · prepared ${whenText(new Date())}</p>
      <p>People hours <strong>${t.peopleHours}</strong> across ${t.people} ${t.people === 1 ? 'person' : 'people'}, ${t.peopleOn} still on scene · unit hours <strong>${t.unitHours}</strong> across ${t.units} unit${t.units === 1 ? '' : 's'}</p>
      <p>By agency: ${t.byAgency.map(([a, h]) => esc(a) + ' ' + h).join(' · ') || 'nobody yet'}</p>
      ${t.inferred ? `<p class="hazline" style="display:block">${t.inferred} row${t.inferred === 1 ? '' : 's'} counted to now, the period's end or the unit's check-out because nobody pressed check out: marked in the note.</p>` : ''}
    </section>
    <section><h2>People</h2>
      <div style="overflow-x:auto"><table class="hours-table"><thead><tr><th>Person</th><th>Unit</th><th>Agency</th><th>Role</th><th>In</th><th>Out</th><th style="text-align:right">Hours</th><th>Note</th></tr></thead><tbody>
      ${rows.filter((r) => r.kind === 'person').map((r) => `<tr><td><strong>${esc(r.name)}</strong></td><td>${esc(r.unit)}</td><td>${esc(r.agency)}</td><td>${esc(r.role)}</td><td class="mono">${fmt(r.in)}</td><td class="mono${r.out ? '' : ' muted'}">${r.out ? fmt(r.out) : 'on scene'}</td><td class="mono" style="text-align:right">${r.hours.toFixed(2)}</td><td class="muted${r.inferred ? ' inferred' : ''}">${esc(r.note)}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">No people listed yet</td></tr>'}
      </tbody></table></div>
    </section>
    <section><h2>Units</h2>
      <div style="overflow-x:auto"><table class="hours-table"><thead><tr><th>Unit</th><th>Agency</th><th>In</th><th>Out</th><th style="text-align:right">Hours</th><th>Note</th></tr></thead><tbody>
      ${rows.filter((r) => r.kind === 'unit').map((r) => `<tr><td><strong>${esc(r.name)}</strong></td><td>${esc(r.agency)}</td><td class="mono">${fmt(r.in)}</td><td class="mono${r.out ? '' : ' muted'}">${r.out ? fmt(r.out) : 'on scene'}</td><td class="mono" style="text-align:right">${r.hours.toFixed(2)}</td><td class="muted">${esc(r.note)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No units yet</td></tr>'}
      </tbody></table></div>
    </section>`;
}
export function hoursCsvText(data, state) {
  const period = hoursPeriod(data, state);
  return hoursCsv(hoursRows({ people: data.people(), members: data.members(), period }), data.incident.name, period ? 'OP ' + period.number : 'whole incident');
}

// Who is behind an account: the profile given at check-in, and Operations' verdict on it.
export function identityHtml(data, m) {
  const p = data.profileOf(m.user_id);
  if (!p) return `<div class="ident"><div class="k">Identity</div><div class="muted" style="font-size:12.5px">Nothing given yet${m.role === 'unit' ? ' · a unit cannot check in without one' : ''}</div></div>`;
  const expired = p.licence_expires && licenceExpired(p.licence_expires);
  const source = { scan: 'read from the barcode', photo: 'front photographed', typed: 'typed' }[p.id_source] || 'on file';
  const given = identityGiven(p);
  return `<div class="ident${given ? '' : ' noid'}">
    <div class="d-row"><span class="k" style="width:auto;flex:1">Identity</span>${given ? '' : `<span class="badge haz">${NO_ID_TEXT[0].toUpperCase() + NO_ID_TEXT.slice(1)}</span>`}${p.verified_at ? `<span class="badge cleared">Verified ${hhmm(p.verified_at)}</span>` : '<span class="badge haz">Not verified</span>'}</div>
    ${given ? '' : `<div style="font-size:12.5px">${p.verified_at ? 'Checked in with a name and a phone, no licence; verified in person.' : 'Checked in with a name and a phone, no licence. Check who this is in person (an agency card, someone who knows them, a call to the number), then Mark verified.'}</div>`}
    <div class="kv">
      <span class="k">Name</span><span><strong>${esc(p.full_name) || '—'}</strong></span>
      <span class="k">Phone</span><span>${p.phone ? `<a href="tel:${esc(p.phone.replace(/\s+/g, ''))}">${esc(p.phone)}</a>` : '—'}</span>
      ${given ? `<span class="k">Licence</span><span>${p.licence_number ? `${esc(p.licence_state)} ${esc(licenceTail(p.licence_number))}${p.licence_expires ? ' · expires ' + esc(p.licence_expires) : ''}${expired ? ' <strong style="color:var(--danger)">expired</strong>' : ''}` : 'number not read'} · ${source}</span>` : ''}
      ${p.date_of_birth ? `<span class="k">Born</span><span>${esc(p.date_of_birth)}</span>` : ''}
      ${p.address ? `<span class="k">Address</span><span>${esc(p.address)}</span>` : ''}
    </div>
    ${p.photo_path ? `<div class="photo-box id-box" data-id-photo="${esc(p.photo_path)}"><img alt="The front of ${esc(p.full_name)}'s licence" hidden><div class="muted" style="padding:28px 12px;text-align:center" data-photo-wait>Loading the licence…</div></div>` : given ? '<div class="muted" style="font-size:12.5px">No photo of the licence</div>' : ''}
    <div class="d-row">${p.verified_at ? `<button class="btn sm" data-action="unverify-profile" data-id="${m.user_id}">Withdraw verification</button>` : `<button class="btn sm green" data-action="verify-profile" data-id="${m.user_id}" title="${given ? 'You have looked at the licence and it is this person' : 'You have checked in person who this is'}">Mark verified</button>`}</div>
  </div>`;
}

function unitHtml(data, m, state) {
  const pos = data.position(m.user_id);
  const zone = data.zones().find((z) => z.assigned_to === m.user_id);
  const here = pos ? zoneAt(data.zones(), pos.lat, pos.lng) : null;
  const photos = data.photos().filter((p) => p.user_id === m.user_id);
  const alert = data.alerts().find((a) => a.user_id === m.user_id);
  const oos = state && state.oosFor === m.user_id;
  return `
    <button class="back" data-action="close-panel">Back to units</button>
    <div class="title">${esc(unitWithKind(m))} <span>${esc(m.crew || '')}</span></div>
    ${m.removed_at ? `<div class="d-row"><span class="badge haz">Removed from the incident ${hhmm(m.removed_at)} by Operations</span>${data.me() && data.me().role === 'ops' ? `<button class="btn sm" data-action="member-restore" data-id="${m.user_id}">Restore</button>` : ''}<button class="btn sm" data-action="people" data-tab="members">Members</button></div>` : ''}
    ${alert ? `<div class="badge" style="background:var(--danger);color:#fff">EMERGENCY · needs help${alert.acknowledged_at ? ' · acknowledged ' + hhmm(alert.acknowledged_at) : ''}</div>` : ''}
    <div class="d-row"><span class="badge st-${esc(m.status)}">${statusDetail(data, m)}</span><span class="muted" style="font-size:12px">since ${hhmm(m.status_at)}</span></div>
    ${m.kind === 'shelter_desk' ? deskPlaceHtml(data, m) : ''}
    ${identityHtml(data, m)}
    ${demobHtml(m)}
    ${unitRequestsHtml(data, m)}
    ${m.role === 'unit' && !m.removed_at && m.status !== 'checked_out' ? (() => { const ws = m.in_water_since ? waterState(m.in_water_since, data.rotationMinutes()) : null; return `<div class="d-row"><span class="k">In the water</span>${ws ? `<span class="badge ${ws.overdue ? 'haz' : 'st-assigned'}">${esc(ws.text)} · since ${hhmm(m.in_water_since)}</span>` : '<span class="muted" style="font-size:12.5px">not in the water</span>'}<button class="btn sm" data-action="unit-water" data-id="${m.user_id}" data-on="${ws ? '0' : '1'}">${ws ? 'Out of the water' : 'In the water'}</button><span class="muted" style="font-size:12px">rotation ${data.rotationMinutes() || 'off'}${data.rotationMinutes() ? ' min' : ''}</span></div>`; })() : ''}
    ${m.removed_at ? '' : `<div class="d-row"><span class="k">Set status</span>
      <button class="btn sm${m.status === 'available' ? ' on' : ''}" data-action="set-status" data-id="${m.user_id}" data-status="available">Available</button>
      <button class="btn sm${m.status === 'out_of_service' ? ' on' : ''}" data-action="set-status" data-id="${m.user_id}" data-status="out_of_service">Out of service</button>
      ${m.status === 'checked_out' ? `<button class="btn sm" data-action="set-status" data-id="${m.user_id}" data-status="available">Check back in</button>` : `<button class="btn sm" data-action="check-out" data-id="${m.user_id}">Check out</button>`}
      <button class="btn sm" data-action="start-par" data-target="user:${m.user_id}">PAR</button>
    </div>`}
    ${oos ? `<form class="inline-form" data-form="oos" data-id="${m.user_id}"><div class="chips">${OOS_REASONS.map((r, i) => `<label class="chip" style="min-height:34px;padding:4px 10px"><input type="radio" name="reason" value="${esc(r)}"${i === 0 ? ' checked' : ''}> ${esc(r)}</label>`).join('')}</div><div class="row-btns"><button class="btn sm" type="button" data-action="oos-cancel">Cancel</button><button class="btn pri sm" type="submit">Out of service</button></div></form>` : ''}
    <div class="kv">
      <span class="k">Agency</span><span>${esc(m.agency) || 'not set'}</span>
      <span class="k">Head count</span><span>${m.crew_count != null ? m.crew_count + (m.unnamed_count ? ' (' + m.unnamed_count + ' not named)' : '') : `<span class="hc-unknown">${HEAD_COUNT_UNKNOWN}</span> · name them for the PAR`}</span>
      <span class="k">Assigned</span><span>${zone ? esc(zone.code + ' · ' + zone.name) : 'nothing yet'}</span>
      <span class="k">Standing in</span><span>${here ? esc(here.code) : 'no zone'}</span>
      <span class="k">Position</span><span class="mono">${pos ? esc(latLngText(pos.lat, pos.lng)) : 'none yet'}</span>
      <span class="k">Heading</span><span>${pos && pos.heading != null ? compass(pos.heading) : 'unknown'}</span>
      <span class="k">Last report</span><span>${pos ? esc(ago(pos.at)) + (pos.accuracy ? ' · ±' + Math.round(pos.accuracy) + ' m' : '') : 'never'}</span>
      <span class="k">Photos</span><span>${photos.length}</span>
      <span class="k">Joined</span><span>${esc(whenText(m.joined_at))}</span>
    </div>
    ${m.role === 'unit' ? `<div class="d-row"><span class="k">Kind · what Operations asks for and Logistics fills</span><span class="chips kind-chips">${UNIT_KINDS.map(([k, label]) => `<button class="chip${m.kind === k ? ' on' : ''}" data-action="set-kind" data-id="${m.user_id}" data-kind="${m.kind === k ? '' : k}" aria-pressed="${m.kind === k}">${esc(label)}</button>`).join('')}</span></div>` : ''}
    <div class="d-row">
      ${pos ? `<button class="btn sm" data-action="pan-to" data-lat="${pos.lat}" data-lng="${pos.lng}">Show on map</button>` : ''}
      ${alert && !alert.acknowledged_at ? `<button class="btn sm danger" data-action="ack-alert" data-id="${alert.id}">Acknowledge</button>` : ''}
    </div>
    <div class="muted" style="font-size:12.5px">To send this unit somewhere, open a zone and press its name under Assigned to.</div>
    ${unitPeopleHtml(data, m)}
    <div class="k">Message ${esc(unitLabel(m))}</div>
    ${composerHtml(data, 'user:' + m.user_id)}
    ${messagesHtml(data, (x) => x.from_user === m.user_id || (x.to_users || []).includes(m.user_id), 6)}`;
}

function newZoneHtml(data, state) {
  const d = state.newZone || {};
  return `
    <div class="title">New division</div>
    <form class="inline-form" data-form="new-zone">
      <div class="row-2">
        <label>Code <input name="code" value="${esc(d.code || '')}" required placeholder="A-1"></label>
        <label>Structures <input name="structures" type="number" min="0" value="0"></label>
      </div>
      <label>Name <input name="name" placeholder="What is here, e.g. Pecan Mobile Home Park"></label>
      <div class="d-row"><span class="k">Priority</span>
        ${[1, 2, 3].map((p) => `<label class="chip" style="min-height:36px;padding:6px 12px"><input type="radio" name="priority" value="${p}"${p === 2 ? ' checked' : ''}> ${p}</label>`).join('')}
      </div>
      <div class="row-btns"><button class="btn sm" type="button" data-action="newzone-discard">Discard</button><button class="btn pri sm" type="submit">Save division</button></div>
    </form>`;
}

// ---- the operational period (ICS 202) and the shift-change briefing

function timeValue(iso) { if (!iso) return ''; const d = new Date(iso); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }

function periodFormHtml(data, p, next, state) {
  const d = next ? { ic: p ? p.ic_name : '', ops: p ? p.ops_chief : '', safety: p ? p.safety_officer : '', notes: '', ends: timeValue(new Date(Date.now() + 12 * 3600000).toISOString()), unified: p ? p.unified || '' : '' } : { ic: p.ic_name, ops: p.ops_chief, safety: p.safety_officer, notes: p.notes, ends: timeValue(p.ends_at), unified: p.unified || '' };
  d.planning = p ? p.planning_chief || '' : ''; d.logistics = p ? p.logistics_chief || '' : ''; d.finance = p ? p.finance_chief || '' : '';
  d.pio = p ? p.pio || '' : ''; d.liaison = p ? p.liaison || '' : ''; d.deputy = p ? p.deputy || '' : ''; d.bring = p ? p.bring || '' : '';
  d.rotation = p && p.rotation_minutes != null ? p.rotation_minutes : data.rotationMinutes();
  d.scene = p && p.scene_hours != null ? p.scene_hours : data.sceneHours();   // v47
  const reps = next ? [] : agencyReps(data, p);
  return `
    <form class="inline-form" data-form="${next ? 'period-start' : 'period-edit'}"${p && !next ? ` data-id="${p.id}"` : ''}>
      <div class="row-2">
        <label>Incident Commander <input name="ic" value="${esc(d.ic)}"></label>
        <label>Deputy Incident Commander <input name="deputy" value="${esc(d.deputy)}" placeholder="ICS-100's remedy for a span past seven" maxlength="120"></label>
      </div>
      <div class="row-2">
        <label>Operations Section Chief <input name="ops" value="${esc(d.ops)}"></label>
        <label>Safety Officer <input name="safety" value="${esc(d.safety)}"></label>
      </div>
      <div class="row-2">
        <label>Planned end <input name="ends" type="time" value="${esc(d.ends)}"></label>
        <span class="muted" style="font-size:12px;align-self:end;padding-bottom:8px">The deputy prints on the 203 and sits under the IC on the 207, which points at the seat when a span passes seven.</span>
      </div>
      <div class="row-2">
        <label>Planning Section Chief <input name="planning" value="${esc(d.planning)}"></label>
        <label>Logistics Section Chief <input name="logistics" value="${esc(d.logistics)}"></label>
      </div>
      <div class="row-2">
        <label>Finance / Admin Section Chief <input name="finance" value="${esc(d.finance)}"></label>
        <span class="muted" style="font-size:12px;align-self:end;padding-bottom:8px">Empty seats print as "not set". The names carry into the next period.</span>
      </div>
      <div class="row-2">
        <label>Rotation in the water, minutes (0 = off) <input name="rotation" type="number" min="0" max="600" step="5" value="${esc(String(d.rotation))}"></label>
        <label>Hours on scene before Safety is told (0 = off) <input name="scene" type="number" min="0" max="72" step="1" value="${esc(String(d.scene))}"></label>
      </div>
      <div class="muted" style="font-size:12px;margin-top:-6px">Safety's two lines. Past the rotation a crew's phone nudges them out and the base shows the time in orange. Past the hours a person's time on scene is orange on the People board and the unit panel, and the briefing and the situation report name them. Both carry into the next period and print on the 204 and the 208.</div>
      <div class="row-2">
        <label>Public Information Officer <input name="pio" value="${esc(d.pio)}" placeholder="Who the cleared photos go to"></label>
        <label>Liaison Officer <input name="liaison" value="${esc(d.liaison)}" placeholder="The other agencies' contact"></label>
      </div>
      <label>Unified command <input name="unified" value="${esc(d.unified)}" placeholder="The other agencies' Incident Commanders, if more than one agency is in charge" maxlength="200"></label>
      ${next ? '<div class="muted" style="font-size:12px">The agency representatives carry over with the seats.</div>' : `
      <div class="k">Agency representatives · for the Liaison Officer</div>
      ${reps.length ? `<div class="reps">${reps.map((r) => `<div class="rep-row"><span class="rep-agency">${esc(r.agency)}<span class="muted"> · ${r.units ? r.units + ' unit' + (r.units === 1 ? '' : 's') : 'no unit on scene now'}</span></span>${r.lead ? '<span class="muted">lead agency · the IC</span><span class="muted">—</span>' : `<input data-rep="name" data-agency="${esc(r.agency)}" value="${esc(r.name)}" placeholder="Representative" aria-label="${esc(r.agency)} representative" maxlength="80"><input data-rep="phone" data-agency="${esc(r.agency)}" value="${esc(r.phone)}" placeholder="Phone" aria-label="${esc(r.agency)} phone" type="tel" maxlength="30">`}</div>`).join('')}</div>` : '<div class="muted" style="font-size:12px">An agency with a unit on scene appears here on its own (the agency is on the unit at check-in).</div>'}
      <div class="muted" style="font-size:12px">One row per agency on scene, drawn from the units. The name and phone are kept with the period and printed on the 203.</div>`}
      <label>Safety message and notes for the period <textarea name="notes" rows="2">${esc(d.notes)}</textarea></label>
      <label>What to bring <input name="bring" value="${esc(d.bring)}" maxlength="300" placeholder="PFDs, dry bags, a radio each, water for the day"></label>
      <div class="muted" style="font-size:12px;margin-top:-6px">The join card's Bring line; it carries into the next period like the seats.</div>
      ${next ? `<label class="chk"><input type="checkbox" name="carry" checked> Carry open objectives and assignments into the new period</label>` : ''}
      <div class="row-btns">${next ? '<button class="btn sm" type="button" data-action="period-next-cancel">Cancel</button>' : ''}<button class="btn pri sm" type="submit">${next ? 'Start period ' + ((p ? p.number : 0) + 1) : 'Save'}</button></div>
    </form>`;
}

export function periodHtml(data, state) {
  const p = data.currentPeriod();
  const objectives = p ? data.objectives(p.id) : [];
  const zonesFor = (o) => data.zones().filter((z) => z.objective_id === o.id);
  const earlier = data.periods().filter((x) => !p || x.id !== p.id);
  return `
    <button class="back" data-action="close-panel">Back to units</button>
    <div class="title">${p ? 'Operational period ' + p.number : 'No operational period yet'} <span>${p ? esc(periodLabel(p)).replace('OP ' + p.number + ' · ', '') : ''}</span></div>
    ${p && periodState(p).state === 'overdue' ? `<div class="period-overdue" style="background:var(--tint-orange);color:var(--hazard-ink);border-radius:8px;padding:6px 10px;font-size:12.5px;margin:6px 0">The planned end ${hhmm(p.ends_at)} passed ${esc(durationText(periodState(p).overMin))} ago and the period is still open. Start period ${p.number + 1}, or move the planned end below.</div>` : ''}
    ${p ? periodFormHtml(data, p, false, state) : '<div class="muted" style="font-size:12.5px">An incident runs in operational periods, usually 12 hours, each with its objectives and its command names.</div>'}
    ${commandsHtml(data)}
    ${p ? `
    <div class="k">Objectives (ICS 202)</div>
    ${objectives.length ? objectives.map((o) => `
      <div class="obj${o.done_at ? ' done' : ''}">
        <button class="obj-tick" data-action="${o.done_at ? 'objective-undo' : 'objective-done'}" data-id="${o.id}" aria-label="${o.done_at ? 'Reopen' : 'Done'}">${o.done_at ? '✓' : ''}</button>
        <span class="obj-text"><strong>${o.number}.</strong> ${esc(o.text)}${o.done_at ? ` <span class="muted">done ${hhmm(o.done_at)}</span>` : ''}${zonesFor(o).length ? ` <span class="muted">· ${zonesFor(o).map((z) => esc(z.code)).join(', ')}</span>` : ''}</span>
      </div>`).join('') : '<div class="muted" style="font-size:12.5px">None yet. What must be true by the end of the period?</div>'}
    <form class="composer" data-form="objective"><div class="composer-row"><input name="text" placeholder="Add an objective" required maxlength="300" autocomplete="off"><button class="btn pri sm" type="submit">Add</button></div></form>` : ''}
    <div class="k">Shift change</div>
    <div class="d-row"><button class="btn sm" data-action="briefing">Briefing</button>${state.periodNext ? '' : `<button class="btn sm${p && periodState(p).state === 'overdue' ? ' pri' : ''}" data-action="period-next">Start period ${(p ? p.number : 0) + 1}</button>`}</div>
    ${state.periodNext ? periodFormHtml(data, p, true, state) : ''}
    ${earlier.length ? `<div class="k">Earlier periods</div>${earlier.map((x) => `<div class="muted" style="font-size:12.5px">${esc(periodLabel(x))}${x.ic_name ? ' · IC ' + esc(x.ic_name) : ''}</div>`).join('')}` : ''}`;
}

// Who has held command: the open row is the Incident Commander now, the rest the history the 203
// and the 214 print. Changing the IC's name on the form asks whether it is a handover.
function commandsHtml(data) {
  const rows = data.commands();
  if (!rows.length) return '';
  return `<div class="k">Command</div><div class="muted" style="font-size:12.5px">${commandLines(rows).reverse().map(esc).join('<br>')}</div><div class="muted" style="font-size:12px">A different name in the Incident Commander seat asks whether command is being transferred; a transfer tells every unit and is a notable line on the 214.</div>`;
}
// The sheet that asks before a handover: what ICS-100 requires, each a tick.
export function transferDialogHtml(data, t) {
  const p = data.currentPeriod() || {};
  const units = data.recipientsFor('all').toUsers.length;
  return `
    <h2 class="td-title">Transfer command${t.from ? ' from ' + esc(t.from) : ''} to ${esc(t.to)}?</h2>
    <p class="muted" style="margin:0;font-size:13px">ICS-100: a transfer of command always requires a full briefing for the incoming Incident Commander and notification to all personnel. Both happen here.</p>
    <label class="td-opt"><input type="checkbox" name="notify" checked${units ? '' : ' disabled'}><span><strong>Tell everyone in the field.</strong> A message to ${units ? 'every unit (' + units + ')' : 'every unit (none on scene now)'}, acknowledged one tap each, like a safety message: "${esc(t.preview)}"</span></label>
    <label class="td-opt"><input type="checkbox" name="briefing" checked><span><strong>Open the briefing for the handover.</strong> The shift-change briefing, assembled from the data, for the incoming IC to read with the outgoing one: situation, divisions, units, hazards, open requests, the safety message.</span></label>
    ${t.mode === 'start' ? `<label class="td-opt"><input type="checkbox" name="period" checked disabled><span><strong>Start operational period ${(p.number || 0) + 1}</strong> with ${esc(t.to)} as Incident Commander, as the form says.</span></label>`
      : `<label class="td-opt"><input type="checkbox" name="period"><span><strong>Start a new operational period now.</strong> Off by default: a transfer mid-period keeps the period and its objectives.</span></label>`}
    <div class="row-btns" style="justify-content:space-between;margin-top:6px"><button class="btn sm" type="button" data-action="transfer-rename" title="A typo: the name changes and the log says the period was updated, not that command moved">Just change the name</button><span style="display:flex;gap:8px"><button class="btn sm" type="button" data-action="transfer-cancel">Cancel</button><button class="btn pri sm" type="button" data-action="transfer-go">Transfer command</button></span></div>`;
}

// The organization chart (ICS 207): drawn from the seats, the divisions and their supervisors, the
// units and their people. The count on a box is its span of control; past SPAN_MAX it turns orange.
export function orgChartHtml(data) {
  const t = orgTree(data);
  const span = (n, over, label) => `<span class="org-span${over ? ' over' : ''}" title="${esc(label || 'span of control')}">1 : ${n}</span>`;
  const box = (seat, name, extra, cls) => `<div class="org-box${cls ? ' ' + cls : ''}${name ? '' : ' empty'}"><div class="org-seat">${esc(seat)}</div><div class="org-name">${esc(name || 'not set')}</div>${extra || ''}</div>`;
  const division = (d) => `<div class="org-div st-${esc(d.zone.status)}${d.over ? ' over' : ''}">
      <div class="org-div-top"><strong>${esc(d.zone.code)}${d.zone.name ? ' ' + esc(d.zone.name) : ''}</strong>${d.cleared ? '<span class="muted">cleared</span>' : d.unit ? span(d.count, d.over, 'the supervisor over the unit\'s people') : '<span class="muted">not started</span>'}</div>
      <div class="muted">${d.cleared ? 'released' : (d.zone.supervisor ? 'supervisor ' + esc(d.zone.supervisor) : 'no supervisor') + ' · ' + (d.unit ? esc(unitWithKind(d.unit)) + (d.people.length ? ' · ' + esc(d.people.join(', ')) : d.unit.crew ? ' · ' + esc(d.unit.crew) : '') : 'no unit')}</div>
    </div>`;
  const general = t.general.map((g) => `<div class="org-box general${g.over ? ' over' : ''}${g.name ? '' : ' empty'}"><div class="org-seat-row"><span class="org-seat">${esc(g.seat)}</span>${g.key === 'ops' ? span(g.count, g.over, 'Operations over its branches and divisions') : ''}</div><div class="org-name">${esc(g.name || 'not set')}</div><div class="muted">${esc(g.note)}</div></div>`).join('');
  const branches = t.branches.map((b) => `<div class="org-branch${b.over ? ' over' : ''}"><div class="org-branch-h"><strong>Branch ${esc(b.name)}</strong>${span(b.count, b.over, 'the branch over its divisions')}</div><div class="org-grid">${b.divisions.map(division).join('')}</div></div>`).join('');
  return `<div class="org">
    ${t.warnings.length ? `<div class="org-warn">${t.warnings.map((w) => `<div><strong>Span of control:</strong> ${esc(w)}. ICS-100 recommends one supervisor to five, three to seven at most. ${/^Operations/.test(w) ? 'Group the divisions into branches (a word on each division), or seat a deputy.' + esc(deputyAdvice(t)).replace('add a deputy', '<button class="link" data-action="org-period">add a deputy</button>') : /^Branch/.test(w) ? 'Split the branch, or seat a deputy.' + esc(deputyAdvice(t)).replace('add a deputy', '<button class="link" data-action="org-period">add a deputy</button>') : 'Split the unit, or name a second supervisor.'}</div>`).join('')}</div>` : ''}
    <div class="org-col">
      ${box('Incident Commander', t.ic.name, `<div class="org-sub">${esc(t.ic.agency || '')}${t.ic.unified ? (t.ic.agency ? ' · ' : '') + 'unified command with ' + esc(t.ic.unified) : ''}</div>`, 'ic')}
      <div class="org-line"></div>
      <div class="org-row">${box('Deputy Incident Commander', t.ic.deputy, t.ic.deputy ? '' : `<div class="org-sub">${t.warnings.length ? 'add a deputy: the span of control is past seven' : 'the seat is on the Period sheet'}</div>`, 'deputy' + (!t.ic.deputy && t.warnings.length ? ' over' : ''))}</div>
      <div class="org-line"></div>
      <div class="org-row">${t.staff.map((s) => box(s.seat, s.name, '', 'staff')).join('')}</div>
      <div class="org-line"></div>
      <div class="org-grid general-row">${general}</div>
      <div class="org-line left"></div>
      ${branches}
      ${t.loose.length ? `${t.branches.length ? '<div class="org-branch-h"><strong>Reporting to Operations</strong></div>' : ''}<div class="org-grid">${t.loose.map(division).join('')}</div>` : (t.branches.length ? '' : '<p class="muted">No divisions drawn yet.</p>')}
    </div>
  </div>`;
}
// chartOnly: the standalone 207 page prints the chart without the lines above it (v30); the IAP and the text copies keep them
export function orgSections(data, { chartOnly } = {}) {
  const inc = data.incident, p = data.currentPeriod();
  return [{ title: 'Organization chart, ICS 207', lines: [
    inc.name + (inc.base_name ? ' · base: ' + inc.base_name : ''),
    periodLine(p),
    'Drawn from the period\'s seats, the divisions and their supervisors, the units and their people · prepared ' + whenText(new Date())
  ].concat(chartOnly ? [] : orgLines(data)), figure: orgChartHtml(data) }];
}
export function orgHtml(data) { return sectionsHtml(orgSections(data, { chartOnly: true })); }
export function orgText(data) { return sectionsText(orgSections(data)); }

// The briefing is built once as sections of lines, then shown as a page or copied as text.
export function briefingSections(data) {
  const inc = data.incident, p = data.currentPeriod();
  const zones = data.zones();
  const units = data.units();
  const objectives = p ? data.objectives(p.id) : [];
  const hazards = data.hazards();
  const alerts = data.alerts();
  const waiting = data.openSafety();
  const S = [];
  S.push({ title: 'Incident', lines: [
    inc.name + (inc.base_name ? ' · base: ' + inc.base_name : ''),
    periodLine(p),
    p && (p.ic_name || p.ops_chief || p.safety_officer) ? ['Incident Commander ' + (p.ic_name || 'not set'), 'Deputy ' + (p.deputy || 'not set'), 'Operations ' + (p.ops_chief || 'not set'), 'Planning ' + (p.planning_chief || 'not set'), 'Logistics ' + (p.logistics_chief || 'not set'), 'Finance ' + (p.finance_chief || 'not set'), 'Safety ' + (p.safety_officer || 'not set'), 'PIO ' + (p.pio || 'not set'), 'Liaison ' + (p.liaison || 'not set')].join(' · ') : null,
    commandText(inc, p) || null,
    transferLine(data, p),
    agencyRepLines(data, p).length ? 'Agency representatives: ' + agencyRepLines(data, p).join(' · ') : null,
    'Briefing made ' + whenText(new Date())
  ].filter(Boolean) });
  if (p && p.notes) S.push({ title: 'Safety message and notes', lines: [p.notes] });
  S.push({ title: 'Objectives', lines: objectives.length ? objectives.map((o) => `${o.number}. ${o.text}${o.done_at ? ' (done ' + hhmm(o.done_at) + ')' : ' (open)'}`) : ['None set'] });
  const cleared = zones.filter((z) => z.status === 'cleared').length, primary = zones.filter((z) => z.status === 'primary').length, active = zones.filter((z) => z.status === 'active').length, open = zones.filter((z) => z.status === 'open').length;
  const structs = data.structures();
  const help = structs.reduce((n, s) => n + (s.people_needing_help || 0), 0);
  S.push({ title: 'Divisions', lines: [`${zones.length} divisions: ${cleared} cleared, ${primary} primary search done, ${active} in progress, ${open} not started`, `${structs.filter((s) => s.status === 'searched').length} of ${structs.length} structures on record searched${help ? ', ' + help + ' people needing help' : ''}`].concat(zones.map((z) => {
    const o = z.objective_id ? data.objective(z.objective_id) : null;
    return `${z.code} ${z.name ? z.name + ' ' : ''}· priority ${z.priority} · ${zoneStatusText(z, z.assigned_to ? unitLabel(data.member(z.assigned_to)) : '', data.zoneAccepted(z))}${o ? ' · objective ' + o.number : ''}`;
  })) });
  S.push({ title: 'Resources', lines: [`${data.peopleInField()} people in the field on ${data.activeUnits().length} units`].concat(agenciesOn(data.activeUnits()).map(agencyLine), units.flatMap((m) => {
    const zone = zones.find((z) => z.assigned_to === m.user_id && z.status === 'active');
    return [`${unitWithKind(m)}${m.crew ? ' (' + m.crew + ')' : ''}${m.crew_count != null ? ' · ' + m.crew_count + ' people' : ''}${m.agency ? ' · ' + m.agency : ''} · ${STATUS_LABEL[m.status] || m.status}${m.status_note ? ': ' + m.status_note : ''}${zone ? ' · ' + zone.code : ''}`].concat(personLines(data, m));
  })) });
  S.push({ title: 'Hazards still open', lines: hazards.length ? hazards.map((h) => `${h.kind}${h.note ? ' (' + h.note + ')' : ''} · ${h.zone_id && data.zone(h.zone_id) ? data.zone(h.zone_id).code : 'outside the zones'} · reported ${hhmm(h.created_at)} by ${unitLabel(data.member(h.user_id))}`) : ['None'] });
  const facilities = data.facilities();
  S.push({ title: 'Facilities', lines: facilities.length ? facilities.map((f) => { const c = f.kind === 'shelter' ? placeCounts(data.evacuees(), f.id) : null; return `${facilityLabel(f)}${c ? ' · ' + bedsText(c.people, f.beds) + (f.beds != null ? ' beds' : '') + (c.arrivingPeople ? ', ' + c.arrivingPeople + ' on the way' : '') + (f.expected ? ', expecting ' + f.expected : '') : ''}${f.contact ? ' · ' + f.contact : ''}${f.notes ? ' · ' + f.notes : ''}`; }) : ['None set'] });
  if (data.evacuees().length) S[S.length - 1].lines.push(peopleLine(data));
  const channels = data.channels();
  S.push({ title: 'Communications (ICS 205)', lines: channels.length ? channels.map((c) => `${c.use}: ${c.channel}${c.notes ? ' · ' + c.notes : ''}`) : ['No plan set'] });
  const attention = alerts.map((a) => `EMERGENCY from ${unitLabel(data.member(a.user_id))} at ${hhmm(a.created_at)}${a.acknowledged_at ? ', acknowledged' : ', NOT acknowledged'}`)
    .concat(waiting.map((m) => `${m.kind === 'par' ? 'PAR' : 'Safety message'} from ${hhmm(m.created_at)} still waiting on ${data.waitingOn(m).map((u) => unitLabel(data.member(u))).join(', ')}`))
    .concat(orgTree(data).warnings.map((w) => `${w}: past the span of control ICS-100 recommends (one to ${SPAN_MAX} at most). See the organization chart.`))
    .concat(sceneLines(data));   // who is on scene too long (v47)
  S.push({ title: 'Needs attention', lines: attention.length ? attention : ['Nothing outstanding'] });
  const log = data.eventsIn(p).slice(0, 40);
  S.push({ title: p ? 'Log of this period, newest first' : 'Log, newest first', lines: log.length ? log.map((e) => `${hhmm(e.at)}  ${e.text}`) : ['Nothing yet'] });
  if (waterLines(data).length) S.push({ title: 'In the water', lines: waterLines(data) });
  return S;
}

// The Division assignment, ICS 204, for one zone: what paper goes in the truck.
export function form204Sections(data, z) {
  const inc = data.incident, p = data.currentPeriod();
  const unit = z.assigned_to ? data.member(z.assigned_to) : null;
  const o = z.objective_id ? data.objective(z.objective_id) : null;
  const hazards = data.hazards().filter((h) => h.zone_id === z.id);
  const S = [];
  S.push({ title: 'Assignment list, ICS 204', lines: [
    inc.name + (inc.base_name ? ' · base: ' + inc.base_name : ''),
    periodLine(p),
    (z.branch ? 'Branch ' + z.branch + ' · ' : '') + 'Division ' + z.code + (z.name ? ' · ' + z.name : '') + ' · priority ' + z.priority + (o ? ' · objective ' + o.number + ': ' + o.text : ''),
    'Division supervisor: ' + (z.supervisor || 'not named') + (p && p.ops_chief ? ' · Operations Section Chief: ' + p.ops_chief : ''),
    'Radio channel: ' + (z.channel || 'not set')
  ], figure: divisionMapHtml(data, z) });
  S.push({ title: 'Resources assigned', lines: unit ? [`${unitWithKind(unit)}${unit.crew ? ' (' + unit.crew + ')' : ''}${unit.crew_count != null ? ' · ' + unit.crew_count + ' people' : ''}${unit.agency ? ' · ' + unit.agency : ''} · ${STATUS_LABEL[unit.status] || unit.status}`].concat(personLines(data, unit)) : ['None yet'] });
  S.push({ title: 'Work assignment', lines: [z.work_assignment || 'Not written yet'] });
  S.push({ title: 'Special instructions', lines: [z.instructions || 'None'].concat(p && p.notes ? ['Period safety message: ' + p.notes] : []).concat(p && p.rotation_minutes > 0 ? ['Time in the water: ' + rotationText(p.rotation_minutes)] : []).concat(p && p.scene_hours > 0 ? ['Hours on scene: ' + sceneText(p.scene_hours)] : []) });
  S.push({ title: 'Known hazards', lines: hazards.length ? hazards.map((h) => `${h.kind}${h.note ? ' (' + h.note + ')' : ''} · reported ${hhmm(h.created_at)} by ${unitLabel(data.member(h.user_id))}`) : ['None reported'] });
  const plan = data.channels();
  S.push({ title: 'Communications', lines: ['Division channel: ' + (z.channel || 'not set')].concat(plan.length ? plan.map((c) => `${c.use}: ${c.channel}`) : ['No incident plan set']) });
  S.push({ title: 'Medical, ICS 206 · if someone is hurt', lines: hurtText(data, { unit, at: centroid(z.polygon) }).map((l, i) => (l.startsWith('! ') ? '! ' : '') + (i + 1) + '. ' + l.replace(/^! /, '')) });
  const places = data.facilities().filter((f) => ['staging', 'shelter', 'hospital', 'icp'].includes(f.kind));
  S.push({ title: 'Where to go', lines: places.length ? places.map((f) => `${facilityLabel(f)}${f.address ? ' · ' + f.address : ''}${f.contact ? ' · ' + f.contact : ''}`) : ['No facilities set'] });   // the street address since v48
  S.push({ title: 'Progress', lines: [zoneStatusText(z, unit ? unitLabel(unit) : '', data.zoneAccepted(z))].concat(z.marking ? [`Marking painted: team ${z.marking.team}, out ${z.marking.out}, hazards ${z.marking.haz}, people found ${z.marking.victims}`] : []) });
  const revisits = data.structures(z.id).filter((s) => s.revisit_at).sort((a, b) => (a.revisit_at < b.revisit_at ? -1 : 1));   // v46: the next crew's revisits
  if (revisits.length) S.push({ title: 'Revisits', lines: revisits.map((s) => `${s.label || 'A structure'} at ${revisitWords(s.revisit_at).text}${revisitWords(s.revisit_at).due ? ' (due)' : ''}${s.notes ? ' · ' + s.notes : ''}`) });
  S.push({ title: 'Prepared', lines: ['By Operations, ' + whenText(new Date())] });
  return S;
}

// Who is on scene past the period's hours (v47), as warning lines, longest first
export function sceneLines(data) {
  const h = data.sceneHours();
  return peopleOverScene(data.people(), data.members(), h).map((x) => '! ' + sceneLine(x, h));
}
// Who is in the water now, as report lines (v28): the unit, how long, orange words past the rotation
export function waterLines(data) {
  const rot = data.rotationMinutes();
  return unitsInWater(data.units(), rot).map((x) => `${x.state.overdue ? '! ' : ''}${unitLabel(x.unit)} ${x.state.text}${x.state.overdue && !x.state.lost ? ', past the ' + rot + '-minute rotation' : ''}${x.unit.crew ? ' · ' + x.unit.crew : ''}`);
}

// The situation report, ICS 209: counts from the data, words from Operations on the period.
export function sitrepSections(data) {
  const inc = data.incident, p = data.currentPeriod();
  const sr = (p && p.sitrep) || {};
  const zones = data.zones(), units = data.units(), structs = data.structures();
  const help = structs.reduce((n, s) => n + (s.people_needing_help || 0), 0);
  const refused = structs.filter((s) => s.occupants === 'refused').length, sheltering = structs.filter((s) => s.occupants === 'sheltering').length;
  const damaged = { major: structs.filter((s) => s.damage === 'major').length, destroyed: structs.filter((s) => s.damage === 'destroyed').length };
  const S = [];
  S.push({ title: 'Incident status summary, ICS 209', lines: [
    inc.name + (inc.base_name ? ' · base: ' + inc.base_name : ''),
    periodLine(p),
    p && p.ic_name ? 'Incident Commander ' + p.ic_name : null,
    commandText(inc, p) || null,
    transferLine(data, p),
    'Prepared by Operations, ' + whenText(new Date())
  ].filter(Boolean) });
  S.push({ title: 'Situation', lines: [sr.summary || 'Not written yet'] });
  S.push({ title: 'Progress', lines: [
    `${zones.length} divisions: ${zones.filter((z) => z.status === 'cleared').length} cleared, ${zones.filter((z) => z.status === 'primary').length} primary search done, ${zones.filter((z) => z.status === 'active').length} in progress, ${zones.filter((z) => z.status === 'open').length} not started`,
    `${structs.filter((s) => s.status === 'searched').length} of ${structs.length} structures on record searched`,
    `People: ${help} needing help, ${sheltering} sheltering in place, ${refused} refused to leave`,
    peopleLine(data),
    `Damage: ${damaged.major} major, ${damaged.destroyed} destroyed`,
    `Hazards open: ${data.hazards().length} · emergencies open: ${data.alerts().length}`
  ] });
  S.push({ title: 'Objectives', lines: (p ? data.objectives(p.id) : []).map((o) => `${o.number}. ${o.text}${o.done_at ? ' (done)' : ' (open)'}`).concat([]).length ? data.objectives(p && p.id).map((o) => `${o.number}. ${o.text}${o.done_at ? ' (done)' : ' (open)'}`) : ['None set'] });
  S.push({ title: 'Resources', lines: [`${units.length} units checked in, ${data.activeUnits().length} on the incident, ${data.peopleInField()} people in the field`].concat(
    ['assigned', 'available', 'out_of_service', 'checked_out'].map((st) => `${STATUS_LABEL[st]}: ${units.filter((u) => u.status === st).length}`),
    agenciesOn(units).map(agencyLine)) });
  S.push({ title: 'Resources needed', lines: data.openRequests().map((r) => `${requestLine(r)}${r.zone_id && data.zone(r.zone_id) ? ' for ' + data.zone(r.zone_id).code : ''}${r.urgency ? ', ' + urgencyLabel(r.urgency).toLowerCase() : ''} · ${REQUEST_STATUS[r.status].toLowerCase()}${r.answer ? ', ' + r.answer : ''}`).concat(sr.needs ? [sr.needs] : []).concat(data.openRequests().length || sr.needs ? [] : ['None stated']) });
  S.push({ title: 'Outlook for the next period', lines: [sr.outlook || 'Not written yet'] });
  S.push({ title: 'Facilities', lines: data.facilities().length ? data.facilities().map((f) => facilityLabel(f)) : ['None set'] });
  const pub = data.publicPhotos().length, checked = data.publicSet().length;
  S.push({ title: 'Public information', lines: [(pub ? `${pub} photo${pub === 1 ? '' : 's'} cleared for public release, ${checked} checked (no face, no plate, no house number)` : 'No photos cleared for public release') + (p && p.pio ? `, to ${p.pio} (PIO)` : ' · no Public Information Officer seated') + '. Nothing is public by default; only checked photos leave in the public set.'] });
  if (waterLines(data).length) S.push({ title: 'In the water', lines: waterLines(data) });
  if (sceneLines(data).length) S.push({ title: 'On scene too long', lines: sceneLines(data) });   // v47
  return S;
}
// "Command transferred at 14:20 from Dana Ruiz to Marcus Bell", when it happened in this period
function transferLine(data, p) {
  const c = data.currentCommand();
  if (!c || !p || !c.from_name || c.started_at < p.starts_at) return null;
  return `Command transferred at ${hhmm(c.started_at)} from ${c.from_name} to ${c.ic_name}`;
}

// The Incident Action Plan: the forms stitched together for the briefing and the truck.
export function iapSections(data) {
  const inc = data.incident, p = data.currentPeriod();
  const S = [];
  S.push({ title: 'Incident Action Plan', lines: [
    inc.name + (inc.base_name ? ' · base: ' + inc.base_name : ''),
    periodLine(p),
    'Prepared ' + whenText(new Date()),
    'Prepared by (Planning Section Chief): ' + ((p && p.planning_chief) || '______________________') + ' · signature ______________________',
    'Approved by (Incident Commander): ' + ((p && p.ic_name) || '______________________') + ' · signature ______________________ · date and time ______________________'
  ] });
  S.push({ title: 'Objectives, ICS 202', lines: (p ? data.objectives(p.id) : []).length ? data.objectives(p.id).map((o) => `${o.number}. ${o.text}${o.done_at ? ' (done ' + hhmm(o.done_at) + ')' : ''}`) : ['None set'] });
  const cmd = data.currentCommand(), earlier = data.commands().filter((c) => c.ended_at);
  const reps = agencyRepLines(data, p);
  const byBranch = new Map();
  for (const z of data.zones()) { const b = (z.branch || '').trim(); if (!byBranch.has(b)) byBranch.set(b, []); byBranch.get(b).push(z); }
  const divLine = (z) => `Division ${z.code} supervisor: ${z.supervisor || 'not named'}${z.assigned_to ? ' · ' + unitWithKind(data.member(z.assigned_to)) : ' · no unit'}${z.status === 'cleared' ? ' · cleared' : ''}`;
  S.push({ title: 'Organization, ICS 203', lines: [
    'Command: ' + (commandText(inc, p) || 'lead agency not set'),
    'Incident Commander: ' + ((p && p.ic_name) || 'not set') + (cmd ? ' · since ' + hhmm(cmd.started_at) + (cmd.from_name ? ', from ' + cmd.from_name : '') : ''),
    earlier.length ? 'Held command earlier: ' + commandLines(earlier).join('; ') : null,
    'Command staff',
    '  Deputy Incident Commander: ' + ((p && p.deputy) || 'not set'),
    '  Safety Officer: ' + ((p && p.safety_officer) || 'not set'),
    '  Public Information Officer: ' + ((p && p.pio) || 'not set'),
    '  Liaison Officer: ' + ((p && p.liaison) || 'not set'),
    'Agency representatives' + (reps.length ? '' : ': none on scene besides the lead agency')
  ].concat(reps.map((l) => '  ' + l), [
    'General staff',
    '  Operations Section Chief: ' + ((p && p.ops_chief) || 'not set'),
    '  Planning Section Chief: ' + ((p && p.planning_chief) || 'not set'),
    '  Logistics Section Chief: ' + ((p && p.logistics_chief) || 'not set'),
    '  Finance / Administration Section Chief: ' + ((p && p.finance_chief) || 'not set'),
    'Operations'
  ], [...byBranch.entries()].flatMap(([b, zs]) => (b ? [`  Branch ${b}`].concat(zs.map((z) => '    ' + divLine(z))) : zs.map((z) => '  ' + divLine(z)))),
    ['Resources'], data.units().filter((u) => u.status !== 'checked_out').flatMap((u) => [`  ${unitWithKind(u)}${u.crew ? ' (' + u.crew + ')' : ''}${u.crew_count != null ? ' · ' + u.crew_count + ' people' : ''}${u.agency ? ' · ' + u.agency : ''}`].concat(personLines(data, u).map((l) => '  ' + l)))).filter(Boolean) });
  S.push(orgSections(data)[0]);
  for (const z of data.zones()) {
    const unit = z.assigned_to ? data.member(z.assigned_to) : null;
    const o = z.objective_id ? data.objective(z.objective_id) : null;
    S.push({ title: `Assignment, ICS 204 · ${z.branch ? 'Branch ' + z.branch + ' · ' : ''}Division ${z.code}${z.name ? ' · ' + z.name : ''}`, lines: [
      `Priority ${z.priority}${o ? ' · objective ' + o.number : ''} · supervisor ${z.supervisor || 'not named'} · channel ${z.channel || 'not set'}`,
      'Resources: ' + (unit ? unitWithKind(unit) + (unit.crew ? ' (' + unit.crew + ')' : '') + (unit.crew_count != null ? ' · ' + unit.crew_count + ' people' : '') : 'none yet')
    ].concat(unit ? personLines(data, unit) : [], [
      'Work assignment: ' + (z.work_assignment || 'not written yet'),
      'Special instructions: ' + (z.instructions || 'none'),
      'Status: ' + zoneStatusText(z, unit ? unitLabel(unit) : '', data.zoneAccepted(z)),
      'If someone is hurt: ' + hurtText(data, { unit, at: centroid(z.polygon) }).map((l) => l.replace(/^! /, '')).slice(0, 3).join(' ')
    ]), figure: divisionMapHtml(data, z) });
  }
  const ch = data.channels();
  S.push({ title: 'Communications, ICS 205', lines: ch.length ? ch.map((c) => `${c.use}: ${c.channel}${c.notes ? ' · ' + c.notes : ''}`) : ['No plan set'] });
  const med = data.facilities().filter((f) => f.kind === 'hospital');
  S.push({ title: 'Medical, ICS 206', lines: (med.length ? med.map((f) => `${f.name || 'Hospital'}${f.contact ? ' · ' + f.contact : ''}${f.notes ? ' · ' + f.notes : ''}`) : ['No hospital set']).concat(['Emergency traffic: ' + ((ch.find((c) => /emergency/i.test(c.use)) || {}).channel || 'not set') + '. A unit in trouble presses Need help now; Operations acknowledges.']) });
  S.push({ title: 'Safety message, ICS 208', lines: [(p && p.notes) || 'Not written yet'].concat(p && p.rotation_minutes > 0 ? ['Time in the water: ' + rotationText(p.rotation_minutes)] : []).concat(waterLines(data)).concat(p && p.scene_hours > 0 ? ['Hours on scene: ' + sceneText(p.scene_hours)] : []).concat(sceneLines(data)) });
  S.push({ title: 'Facilities', lines: data.facilities().length ? data.facilities().map((f) => `${facilityLabel(f)}${f.contact ? ' · ' + f.contact : ''}`) : ['None set'] });
  return S;
}

// A section is its title and lines; one may also carry a figure (the division's map, already
// HTML), which the page draws after the lines and the text leaves out.
// A line that starts with two spaces is drawn indented under the line before (a person under a unit).
// A line that starts with "! " is a warning (something missing), drawn orange; the text keeps the mark.
function sectionsHtml(S) { return S.map((s) => `<section${s.figure ? ' class="has-map"' : ''}><h2>${esc(s.title)}</h2>${s.lines.map((l) => { const depth = (/^( *)/.exec(l)[1].length / 2) | 0; return `<p${l.startsWith('! ') ? ' class="warn"' : depth >= 2 ? ' class="sub sub2"' : depth === 1 ? ' class="sub"' : ''}>${esc(l.trim().replace(/^! /, ''))}</p>`; }).join('')}${s.figure || ''}</section>`).join(''); }
function sectionsText(S) { return S.map((s) => s.title.toUpperCase() + '\n' + s.lines.map((l) => '  ' + l).join('\n')).join('\n\n'); }

export function briefingHtml(data) { return sectionsHtml(briefingSections(data)); }
export function briefingText(data) { return sectionsText(briefingSections(data)); }
export function form204Html(data, z) { return sectionsHtml(form204Sections(data, z)); }
export function form204Text(data, z) { return sectionsText(form204Sections(data, z)); }
export function sitrepHtml(data) { return sectionsHtml(sitrepSections(data)); }
export function sitrepText(data) { return sectionsText(sitrepSections(data)); }
export function iapHtml(data) { return sectionsHtml(iapSections(data)); }
export function iapText(data) { return sectionsText(iapSections(data)); }
export function form211Html(data) { return sectionsHtml(form211Sections(data)); }
export function form211Text(data) { return sectionsText(form211Sections(data)); }

// The words of the situation report, edited above the report itself.
export function sitrepFormHtml(data) {
  const p = data.currentPeriod();
  if (!p) return '<p class="muted">Start an operational period to write a situation report.</p>';
  const sr = p.sitrep || {};
  return `
    <form class="inline-form no-print" data-form="sitrep-edit" data-id="${p.id}">
      <label>Situation, what happened and where it stands <textarea name="summary" rows="2">${esc(sr.summary || '')}</textarea></label>
      <label>Resources needed <textarea name="needs" rows="2">${esc(sr.needs || '')}</textarea></label>
      <label>Outlook for the next period <textarea name="outlook" rows="2">${esc(sr.outlook || '')}</textarea></label>
      <div class="row-btns"><button class="btn pri sm" type="submit">Save the words</button></div>
    </form>`;
}

// ---- the activity log (ICS 214): folded or open, filtered by where a line came from (or to the
// lines Operations marked notable), searched, with the hours marked and every line linked to the
// thing it is about.
export const LOG_GROUPS = [['all', 'All'], ['new', 'Since you looked'], ['notable', 'Notable'], ['field', 'From the field'], ['msg', 'Messages'], ['ops', 'Operations'], ['note', 'Notes']];   // 'new' is the lines since state.log.sinceAt (v45)
const GROUP_OF = { shelter: 'field', request: 'field', photo: 'field', clear: 'field', hazard: 'field', help: 'field', msg: 'msg', safety: 'msg', par: 'msg', ops: 'ops', status: 'ops', note: 'note' };
export function logGroupOf(kind) { return GROUP_OF[kind] || 'ops'; }
const inGroup = (e, g, sinceAt) => !g || g === 'all' || (g === 'notable' ? !!e.notable : g === 'new' ? !!sinceAt && e.at > sinceAt : logGroupOf(e.kind) === g);
export function logFilter(events, { group, q, sinceAt } = {}) {
  const needle = (q || '').trim().toLowerCase();
  const rows = events.filter((e) => inGroup(e, group, sinceAt) && (!needle || String(e.text).toLowerCase().includes(needle)));
  return group === 'new' ? rows.filter((e) => e.notable).concat(rows.filter((e) => !e.notable)) : rows;   // the notable ones first when catching up
}
// Since you last looked (v45): one line above the log with what came in since the mark, Show them and Seen.
export function logSinceHtml(data, state) {
  const since = state && state.log ? state.log.sinceAt : null;
  if (!since) return '';
  const news = data.events().filter((e) => e.at > since);
  if (!news.length) return '';
  return `<div class="log-since"><span class="x"><strong>Since you last looked (${hhmm(since)}):</strong> ${esc(sinceSummary(news))}</span><button class="btn sm" data-action="log-group" data-group="new">Show them</button><button class="btn sm" data-action="log-since-seen" title="Marks now as the last look">Seen</button></div>`;
}
function logLink(e) {
  if (!e.ref_id) return '';
  const id = esc(e.ref_id);
  switch (e.ref_table) {
    case 'ic_photos': return `<button class="llink" data-action="select-photo" data-id="${id}">View photo</button>`;
    case 'ic_zones': return `<button class="llink" data-action="select-zone" data-id="${id}">Open division</button>`;
    case 'ic_structures': return `<button class="llink" data-action="select-structure" data-id="${id}">Open structure</button>`;
    case 'ic_facilities': return `<button class="llink" data-action="select-facility" data-id="${id}">Open facility</button>`;
    case 'ic_objectives': return `<button class="llink" data-action="period">Open period</button>`;
    case 'ic_people': return `<button class="llink" data-action="people">Open people</button>`;
    case 'ic_evacuees': return `<button class="llink" data-action="select-evacuee" data-id="${id}">Where now</button>`;
    default: return '';
  }
}
export function logFiltersHtml(data, state) {
  const events = data.events(), cur = (state.log && state.log.group) || 'all', sinceAt = state.log && state.log.sinceAt;
  return LOG_GROUPS.filter(([g]) => g !== 'new' || (sinceAt && events.some((e) => e.at > sinceAt))).map(([g, label]) => {
    const n = events.filter((e) => inGroup(e, g, sinceAt)).length;
    return `<button class="chip${cur === g ? ' on' : ''}" data-action="log-group" data-group="${g}">${label} <span class="n">${n}</span></button>`;
  }).join('');
}
export function logHtml(data, state) {
  const all = data.events();
  if (!all.length) return '<p class="muted" style="padding:4px 12px">Nothing yet.</p>';
  const events = logFilter(all, (state && state.log) || {});
  if (!events.length) return '<p class="muted" style="padding:4px 12px">Nothing matches.</p>';
  const seenAt = state && state.log ? state.log.seenAt : null;
  const ops = !!data.me() && data.me().role === 'ops';   // only Operations marks a line; everyone sees the mark
  const out = [];
  let lastHour = null;
  for (const e of events) {
    const h = new Date(e.at).getHours();
    if (lastHour !== null && h !== lastHour) out.push(`<div class="log-sep">${String(h).padStart(2, '0')}:00 to ${String(h).padStart(2, '0')}:59</div>`);
    lastHour = h;
    const mark = ops
      ? `<button class="nmark${e.notable ? ' on' : ''}" data-action="log-notable" data-id="${esc(e.id)}" data-on="${e.notable ? '0' : '1'}" aria-pressed="${e.notable ? 'true' : 'false'}" aria-label="Notable" title="${e.notable ? 'Notable: it leads the printed 214. Click to unmark' : 'Mark as notable: it leads the printed 214'}"></button>`
      : e.notable ? '<span class="nmark on" title="Notable"></span>' : '';
    out.push(`
    <div class="log-row log-${esc(e.kind)}${seenAt && e.at > seenAt ? ' new' : ''}${e.notable ? ' notable' : ''}" data-event="${esc(e.id)}">
      <span class="t mono">${hhmm(e.at)}</span>
      ${mark}
      <span class="x">${esc(e.text)}</span>
      ${logLink(e)}
    </div>`);
  }
  return out.join('');
}

// The whole log of the period on paper, oldest first: the ICS 214 the Documentation Unit keeps.
// The lines Operations marked notable come first under their own heading (the form's notable
// activities), then the full log with the same lines starred in place.
export function form214Sections(data) {
  const inc = data.incident, p = data.currentPeriod();
  const rows = data.eventsIn(p).slice().reverse();
  const notable = rows.filter((e) => e.notable);
  const line = (e) => `${hhmm(e.at)}  ${e.notable ? '★ ' : ''}${e.text}`;
  return [
    { title: 'Activity log, ICS 214', lines: [
      inc.name + (inc.base_name ? ' · base: ' + inc.base_name : ''),
      periodLine(p),
      p && p.ic_name ? 'Incident Commander ' + p.ic_name + (data.commands().length > 1 ? ' · ' + commandLines(data.commands()).join('; ') : '') : null,
      'Prepared by Operations, ' + whenText(new Date())
    ].filter(Boolean) },
    { title: notable.length ? `${notable.length} notable ${notable.length === 1 ? 'entry' : 'entries'}` : 'Notable entries', lines: notable.length ? notable.map(line) : ['None marked'] },
    { title: `${rows.length} entries, oldest first`, lines: rows.length ? rows.map(line) : ['Nothing yet'] }
  ];
}
export function form214Html(data) { return sectionsHtml(form214Sections(data)); }
export function form214Text(data) { return sectionsText(form214Sections(data)); }

export function maydayHtml(data) {
  const alerts = data.alerts();
  if (!alerts.length) return '';
  return alerts.map((a) => {
    const who = unitLabel(data.member(a.user_id));
    const zone = a.zone_id ? data.zone(a.zone_id) : null;
    return barItem(`EMERGENCY · ${who} needs help${zone ? ' in ' + zone.code : ''} · sent ${hhmm(a.created_at)}${a.acknowledged_at ? ' · acknowledged ' + hhmm(a.acknowledged_at) : ''}`, '',
      (a.acknowledged_at ? '' : `<button class="btn sm" data-action="ack-alert" data-id="${a.id}">Acknowledge</button>`) +
      `<button class="btn sm" data-action="select-unit" data-id="${a.user_id}">Show unit</button>`);
  }).join('');
}
// One thing on the bars' slot: its words on one line, cut short on screen and whole on hover, its buttons
// beside them. The slot above the map is always one row tall, so a bar appearing moves nothing below it.
function barItem(words, cls, buttons, title) {
  const i = words.indexOf(' · ');
  const head = i > 0 ? words.slice(0, i) : words, rest = i > 0 ? words.slice(i) : '';
  return `<span class="bar-item${cls ? ' ' + cls : ''}" title="${esc(title || words)}"><span class="bar-text"><strong>${esc(head)}</strong>${esc(rest)}</span>${buttons || ''}</span>`;
}

// ---- messages (ICS 213)

// The composer: who it goes to, the words, and whether it is a safety message.
export function composerHtml(data, target, placeholder) {
  const units = data.units().filter((u) => u.status !== 'checked_out');
  const zones = data.zones().filter((z) => z.assigned_to);
  const opt = (v, label) => `<option value="${v}"${v === target ? ' selected' : ''}>${esc(label)}</option>`;
  return `
    <form class="composer" data-form="message">
      <div class="composer-row">
        <select name="to" aria-label="To">
          ${opt('all', 'Everyone in the field')}
          ${zones.map((z) => opt('zone:' + z.id, z.code + ' · ' + unitLabel(data.member(z.assigned_to)))).join('')}
          ${units.map((u) => opt('user:' + u.user_id, unitLabel(u))).join('')}
        </select>
        <label class="safety-toggle" title="A safety message stays up on every phone until it is acknowledged"><input type="checkbox" name="safety"> Safety</label>
      </div>
      <div class="composer-row">
        <input name="text" placeholder="${esc(placeholder || 'Message')}" autocomplete="off" required maxlength="500">
        <button class="btn pri sm" type="submit">Send</button>
      </div>
      <div class="chips msg-chips">${messageChips(data).map((c) => `<button class="chip" type="button" data-action="msg-chip" data-text="${esc(c.text)}" title="${esc(c.text)}">${esc(c.label)}</button>`).join('')}</div>
    </form>`;
}
// The words Operations sends most, one tap each; "You are released" is demobilization's base side.
export function messageChips(data) {
  const staging = data.facilities().find((f) => f.kind === 'staging');
  return [
    { label: 'Hold where you are', text: 'Hold where you are and stand by for Operations.' },
    { label: 'Return to staging', text: `Return to staging${staging ? ', ' + (staging.name || 'the staging area') : ''} and report in.` },
    { label: 'PAR', text: 'PAR: head count to Operations, everyone accounted for or not.' },
    { label: 'You are released', text: `You are released. Return to staging${staging ? ', ' + (staging.name || 'the staging area') : ''}, return the radio to Logistics, and check out on your phone. Thank you.` }
  ];
}

export function messageRowHtml(data, m) {
  const me = data.user ? data.user.id : null;
  const to = m.to_users || [];
  const waiting = data.waitingOn(m);
  const acks = data.acksFor(m.id);
  const mine = me && to.includes(me) && !data.ack(m.id, me);
  const closedBy = m.superseded_by ? data.message(m.superseded_by) : null;
  const state = !to.length ? '' : m.superseded_by
    ? `<span class="ack">Closed by the PAR started ${closedBy ? hhmm(closedBy.created_at) : 'later'}${waiting.length ? ' · ' + waiting.map((u) => esc(unitLabel(data.member(u)))).join(', ') + ' never answered' : ''}</span>`
    : waiting.length === 0
    ? `<span class="ack ok">All ${to.length} acknowledged</span>`
    : `<span class="ack wait">Waiting on ${waiting.map((u) => esc(unitLabel(data.member(u)))).join(', ')}</span>`;
  const replies = acks.filter((a) => a.reply && a.reply !== 'Copy').map((a) => `${esc(unitLabel(data.member(a.user_id)))}: ${esc(a.reply)}${a.count != null ? ' (' + a.count + ')' : ''}`).join(' · ');
  return `
    <div class="mrow ${esc(m.kind)}" data-message="${m.id}">
      <div class="mrow-top"><span class="t mono">${hhmm(m.created_at)}</span><span class="who">${esc(unitLabel(data.member(m.from_user)))}</span><span class="muted">to ${esc(m.to_label || 'everyone')}</span>${m.kind === 'safety' ? '<span class="badge haz">Safety</span>' : ''}${m.kind === 'par' ? '<span class="badge">PAR</span>' : ''}${m.urgency ? `<span class="badge urg-${esc(m.urgency)}">${esc(urgencyLabel(m.urgency))}</span>` : ''}</div>
      <div class="mrow-text">${esc(m.text)}</div>
      <div class="mrow-state">${state}${replies ? `<span class="muted">${replies}</span>` : ''}${mine ? `<button class="btn sm" data-action="ack-message" data-id="${m.id}" data-reply="Copy">Acknowledge</button>` : ''}${m.lat != null && m.lng != null ? `<button class="btn sm" data-action="pan-to" data-lat="${m.lat}" data-lng="${m.lng}" title="${esc(latLngText(m.lat, m.lng))}">Show on map</button>` : ''}</div>
    </div>`;
}

export function messagesHtml(data, filter, limit) {
  const rows = data.messages().filter(filter || (() => true)).slice(0, limit || 10);
  return rows.length ? rows.map((m) => messageRowHtml(data, m)).join('') : '<div class="muted" style="font-size:12.5px">No messages yet</div>';
}

// Hazards open (v41): where Safety looks. Kind and words, division, when, who, the urgency word; Resolved and
// Show on map on each; an act-on-now hazard waits on the bar above until Operations acknowledges it.
export function hazardsHtml(data) {
  const open = sortHazards(data.hazards());   // act on now first, then blocks further operations, before nightfall, can wait (v48)
  const row = (h) => `<div class="haz-row${hazardUrgent(h) ? ' urgent' : ''}" data-hazard="${h.id}">
      <div class="haz-top"><span class="t mono">${hhmm(h.created_at)}</span><strong>${esc(h.kind)}</strong>${h.note ? `<span class="muted">${esc(h.note)}</span>` : ''}${h.urgency ? `<span class="badge urg-${esc(h.urgency)}">${esc(urgencyLabel(h.urgency))}</span>` : ''}</div>
      <div class="haz-foot"><span class="muted">${h.zone_id && data.zone(h.zone_id) ? esc(data.zone(h.zone_id).code) + ' · ' : ''}${esc(unitLabel(data.member(h.user_id)))}${h.acked_at ? ' · acknowledged ' + hhmm(h.acked_at) : ''}</span>${hazardUrgent(h) ? `<button class="btn sm" data-action="ack-hazard" data-id="${h.id}">Acknowledge</button>` : ''}${h.lat != null && h.lng != null ? `<button class="btn sm" data-action="pan-to" data-lat="${h.lat}" data-lng="${h.lng}">Show on map</button>` : ''}<button class="btn sm" data-action="resolve-hazard" data-id="${h.id}">Resolved</button></div>
    </div>`;
  return `<div class="k" style="margin-top:6px">Hazards open · ${open.length}</div>` + (open.length ? open.map(row).join('') : '<div class="muted" style="font-size:12.5px">None reported. A crew\'s Report hazard lands here, on the map and in the log; an act-on-now hazard waits on the bar until acknowledged.</div>');
}

// The yellow bar: safety messages and PARs still waiting on someone, anyone reporting a missing person, and
// act-on-now hazards not yet acknowledged (v41).
export function safetyHtml(data) {
  const parts = [];
  for (const h of data.urgentHazards()) parts.push(barItem(`HAZARD · ${h.kind}${h.note ? ', ' + h.note : ''} · ${h.zone_id && data.zone(h.zone_id) ? data.zone(h.zone_id).code + ' · ' : ''}${hhmm(h.created_at)} · ${unitLabel(data.member(h.user_id))}`, 'hazard',
    `<button class="btn sm" data-action="ack-hazard" data-id="${h.id}">Acknowledge</button>` + (h.lat != null && h.lng != null ? `<button class="btn sm" data-action="pan-to" data-lat="${h.lat}" data-lng="${h.lng}">Show on map</button>` : '')));
  // who has not answered comes first: on one row it is what is cut last
  for (const m of data.openSafety()) {   // the message's own words first; the waiting list is a count, the names on hover (v28)
    const names = data.waitingOn(m).map((u) => unitLabel(data.member(u)));
    const waiting = names.length === 1 ? names[0] : names.length + ' units';
    if (m.kind === 'safety') parts.push(barItem(`SAFETY · ${m.text} · waiting on ${waiting} · sent ${hhmm(m.created_at)} by ${unitLabel(data.member(m.from_user))}`, '', '', `SAFETY · ${m.text} · waiting on ${names.join(', ')} · sent ${hhmm(m.created_at)} by ${unitLabel(data.member(m.from_user))}`));
    else if (m.kind === 'par') parts.push(barItem(`PAR · ${data.acksFor(m.id).length} of ${(m.to_users || []).length} answered · waiting on ${waiting} · started ${hhmm(m.created_at)} to ${m.to_label || 'everyone'} (${since(m.created_at)})`, '', '', `PAR · ${data.acksFor(m.id).length} of ${(m.to_users || []).length} answered · waiting on ${names.join(', ')} · started ${hhmm(m.created_at)} to ${m.to_label || 'everyone'}`));
  }
  const par = data.lastPar();
  for (const x of data.missingNow().slice().reverse()) parts.unshift(barItem(x.name ? `MISSING · ${x.name} (${unitLabel(x.unit)}) · ${hhmm(x.ack.acked_at)}${x.ack.count != null ? ' · ' + x.ack.count + ' accounted for' : ''}` : `MISSING · ${unitLabel(x.unit)} reports someone missing${x.ack.count != null ? ', ' + x.ack.count + ' accounted for' : ''} · ${hhmm(x.ack.acked_at)}`, 'missing',
    `<button class="btn sm" data-action="mark-found" data-message="${x.ack.message_id}" data-user="${x.ack.user_id}" data-person="${x.id || ''}" data-name="${esc(x.name || '')}" title="${esc((x.name || 'The missing person') + ' is found: clears this line, logged as notable')}">Found</button>` + (data.missingNow().filter((y) => y.ack === x.ack).length > 1 ? `<button class="btn sm" data-action="mark-all-found" data-message="${x.ack.message_id}" data-user="${x.ack.user_id}" title="Everyone ${esc(unitLabel(x.unit))} reported missing is found: one line in the log">They're all found</button>` : '')));   // by name since v29, Found since v38, all found since v48
  return parts.join('');
}

// Incident settings (v28): the Google Maps browser key, how long personal records are kept after the
// close, the default rotation in the water. Operations writes them; they carry into the next incident
// this account opens. The log says a key was set, never the key.
export function settingsDialogHtml(data) {
  const st = data.settings();
  const days = Number(st.retention_days) || 30;
  return `
    <form class="inline-form settings-form" data-form="settings">
      <div class="title">Incident settings <span>${esc(data.incident.name)}</span></div>
      <div class="muted" style="font-size:12.5px">Operations' settings for this incident. They carry into the next incident this account opens.</div>
      <label>Google Maps browser key <input name="maps_key" value="${esc(st.maps_key || '')}" autocomplete="off" spellcheck="false" placeholder="AIza…" maxlength="80"></label>
      <div class="muted" style="font-size:12px">Every member's browser reads it, so in Google Cloud restrict it to this site's address and to the Map Tiles API. The log says a key was set, never the key. Leave it empty for Streets and Satellite alone.</div>
      <div class="d-row"><button type="button" class="btn sm" data-action="settings-test">Test the key</button><span class="muted" style="font-size:12.5px" data-settings-test></span></div>
      <label>Personal records clear by rule <select name="retention_days" class="sel">${[30, 60, 90].map((d) => `<option value="${d}"${days === d ? ' selected' : ''}>${d} days after the close</option>`).join('')}</select></label>
      <div class="muted" style="font-size:12px">Licences, dates of birth, addresses, licence photos and the names of people sheltered; the names, the log and the forms stay.</div>
      <label>Default rotation in the water, minutes (0 = off) <input name="rotation_minutes" type="number" min="0" max="600" step="5" value="${esc(String(st.rotation_minutes ?? 45))}"></label>
      <label>EOC email address <input name="eoc_email" type="email" value="${esc(st.eoc_email || '')}" autocomplete="off" placeholder="eoc@county.gov" maxlength="120"></label>
      <div class="muted" style="font-size:12px">Send by email on the situation report and the other papers goes to it in one tap; leave it empty to pick the address in the mail app.</div>
      <div class="muted" style="font-size:12px">The first period of a new incident starts with it; each period's own rotation is on the Period sheet.</div>
      <div class="row-btns"><button type="button" class="btn sm" data-action="settings-close">Cancel</button><button class="btn pri sm" type="submit">Save</button></div>
    </form>`;
}
