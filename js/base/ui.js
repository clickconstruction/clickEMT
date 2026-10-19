// The base sidebar and log: plain HTML strings from the data, with data-action attributes that
// main.js listens for. Nothing here talks to Supabase.
import { divisionMapHtml } from './print-map.js';
import { incidentFacts } from '../shared/rules.js';   // the incident line's card (v76)
import { hiddenOverlays, boundsText, availableLayers, storedLayer, googleKey, runsShown } from '../shared/layers.js';
import { joinUrl, qrSvg } from '../shared/qr.js';
import { licenceExpired, licenceTail } from '../shared/licence.js';
import { hoursRows, hoursTotals, hoursCsv } from '../shared/hours.js';
import { hazardWords, alertWords, sortHazards, sceneStart, stintText, revisitWords, sceneOver, peopleOverScene, sceneLine, sceneText, sinceSummary, hazardUrgent, whenText, dateText, periodLine, periodState, overdueText, compass, hhmm, ago, pct, unitLabel, unitWithKind, kindText, unitKind, unitsForRequest, kindsAsked, commandLines, centroid, zoneStatusText, latLngText, zoneAt, periodLabel, structureSummary, waterText, facilityKind, facilityLabel, commandText, agenciesOn, agencyLine, urgencyLabel, REQUEST_KINDS, REQUEST_STATUS, requestLine, URGENCY_STEPS, stepLabel, STUCK_WORDS, urgencyWords, stepRank, actNow, qualLabel, qualsText, personOn, onSceneText, crewNames, peopleMatch, STATUS_LABEL, OOS_REASONS, STRUCTURE_STATUS, OCCUPANTS, WATER, DAMAGE, FACILITY_KINDS, QUALIFICATIONS, UNIT_KINDS, identityGiven, NO_ID_TEXT, NEEDS, LEFT_CHOICES, PERSON_PLACES, evacueeWho, evacueeWhere, evacueeFrom, evacueeMatch, whereValue, needsText, placeCounts, needsTotalsText, bedsText, peopleShelteredLine, placeWordsOf, profileReady, waterState, unitsInWater, rotationText, durationText, parAnswerText, HEAD_COUNT_UNKNOWN, TRANSPORT_KINDS, TRANSPORT_STATUS, transportNext, transportLabel, transportKindText, transportFrom, transportOnBoard, aboardText, capacityText, transportLate, transportTimes, sortTransports, runsTo, runCard, foldRuns, transportsLine, bandLabel, bandNumber, bandUrl, tagOf, lastSeen, lastSeenText, seenStale, seenWords, inviteState, INVITE_STATE } from '../shared/rules.js';
import { incidentKindText, starterFor, placeFirst, expectedUnits, kindOptions } from '../shared/rules.js';   // incident kinds and starter periods (v77)
import { orgTree, orgLines, deputyAdvice, agencyReps, agencyRepLines, hurtText, deploymentLines, whoToAsk, onSceneLine, SPAN_MAX } from '../shared/briefings.js';
import { personQuals, qualChipText, qualsTextWith, credentialLabel, credentialExpired, credentialText } from '../shared/rules.js';   // claim a band, submit licences, Operations confirms (v69)

export function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
// "live" is right for a position; for something sent, say "just now".
const since = (iso) => { const a = ago(iso); return a === 'live' ? 'just now' : a; };

function assignedLabel(data, z) { return z.assigned_to ? unitLabel(data.member(z.assigned_to)) : ''; }

export function zonesHtml(data, state) {
  const sel = state.selected || {};
  const zones = data.zones();
  if (!zones.length) return `<p class="muted" data-empty style="padding:8px 14px">${data.incident && data.incident.boundary ? 'Boundary drawn. Now a division: an area for one unit.' : 'Nothing here yet. Draw the boundary, then divisions inside it.'}</p>`;   // v80: the next thing to do, in order
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
  const dot = sos ? 'sos' : (m.status === 'checked_out' || !pos || now - new Date(pos.at).getTime() > 180000 ? 'off' : '');
  const p = data.profileOf(m.user_id);
  const out = m.status === 'checked_out';
  const facts = [
    esc(unitNames(data, m)),
    out ? '' : m.crew_count != null ? String(m.crew_count) : `<span class="hc-unknown" title="No names and no count given at check-in: ask the unit, or name them on the People board">${HEAD_COUNT_UNKNOWN}</span>`,
    p ? `<span class="who${p.verified_at ? ' ok' : ''}" title="${p.verified_at ? 'Identity verified' : identityGiven(p) ? 'Identity not verified yet' : 'No licence given: check who this is in person'}">${esc(p.full_name)}${p.verified_at ? ' ✓' : identityGiven(p) ? '' : ' · no ID'}</span>` : '',
    m.status_at ? 'since ' + hhmm(m.status_at) : '',
    out ? '' : pos ? ago(pos.at, now) + (pos.heading != null ? ', ' + compass(pos.heading) : '') : 'no position yet',
    waterSpan(data, m, now).replace(/^ · /, ''),
  ].filter(Boolean);
  return `<button class="ur" data-action="select-unit" data-id="${m.user_id}">
      <span class="udot2 ${dot}"></span>
      <span class="ur-main">
        <span class="ur-top"><span class="ur-name">${esc(unitLabel(m))}${kindText(m.kind) ? `<span class="ur-kind">, ${esc(kindText(m.kind))}</span>` : ''}</span>${wherePill(data, m)}</span>
        <span class="ur-sub">${facts.join(' · ')}</span>
      </span>
    </button>`;
}
// where a unit is, at the right of its row (v61): the division for an assigned unit, else its status
function wherePill(data, m) {
  const zone = data.zones().find((z) => z.assigned_to === m.user_id && z.status === 'active') || data.zones().find((z) => z.assigned_to === m.user_id);
  if (m.status === 'assigned') return `<span class="ur-where" title="Assigned to ${zone ? esc(zone.code) : 'a division'}${m.status_at ? ' since ' + hhmm(m.status_at) : ''}">${zone ? esc(zone.code) : 'Assigned'}</span>`;
  if (m.status === 'available') return `<span class="ur-where avail" title="Available${zone ? ', last in ' + esc(zone.code) : ''}">Available</span>`;
  if (m.status === 'out_of_service') return `<span class="ur-where oos">Out of service${m.status_note ? ': ' + esc(m.status_note) : ''}</span>`;
  return `<span class="ur-where out">Checked out${m.checked_out_at ? ' ' + hhmm(m.checked_out_at) : ''}</span>`;
}
// " · in the water 38m", orange past the rotation, "probably left running" past three (v28)
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
  const head = `<div class="d-row rs-head" data-home><span class="k" style="width:auto;flex:1">Units · ${data.peopleInField()} people in the field on ${data.activeUnits().length} unit${data.activeUnits().length === 1 ? '' : 's'}</span>
    <span class="seg board-mode" role="group" aria-label="Group the units by"><button class="${mode === 'kind' ? 'on' : ''}" data-action="board-mode" data-mode="kind" aria-pressed="${mode === 'kind'}">Kind</button><button class="${mode === 'status' ? 'on' : ''}" data-action="board-mode" data-mode="status" aria-pressed="${mode === 'status'}">Status</button></span>
    <button class="btn sm" data-action="people" title="Everyone on scene by name, with qualifications, status and hours">People board</button></div>`;
  if (mode === 'status') {
    return head + ['assigned', 'available', 'out_of_service', 'checked_out'].map((s) => {
      const rows = units.filter((u) => u.status === s);
      if (!rows.length) return '';
      return `<div class="grp"><span class="rs-g">${STATUS_LABEL[s]} · ${rows.length}</span></div>` + rows.map((m) => unitRowHtml(data, m, now)).join('');
    }).join('');
  }
  const on = units.filter((u) => u.status !== 'checked_out'), out = units.filter((u) => u.status === 'checked_out');
  const asked = data.openRequests().map((r) => ({ r, kinds: kindsAsked(r) })).filter((x) => x.kinds.length);
  const groups = UNIT_KINDS.map(([k, , plural]) => ({ key: k, label: plural, rows: on.filter((u) => u.kind === k), asks: asked.filter((x) => x.kinds.includes(k)) })).filter((g) => g.rows.length || g.asks.length);
  const unknown = on.filter((u) => !unitKind(u.kind));
  if (unknown.length) groups.push({ key: '', label: 'Kind not set', rows: unknown, asks: [] });
  return head + groups.map((g) => `<div class="grp"><span class="rs-g">${esc(g.label)} · ${g.rows.length}${g.asks.length ? ` · ${g.asks.length} asked${g.asks.some((x) => x.r.status === 'ordered') ? ', ' + (g.asks.filter((x) => x.r.status === 'ordered').length === g.asks.length ? 'ordered' : 'some ordered') : ''}` : ''}</span></div>` +
      (g.rows.length ? g.rows.map((m) => unitRowHtml(data, m, now)).join('') : `<div class="muted" style="font-size:12.5px;padding:0 0 6px">none on scene · ${g.asks.map((x) => requestLine(x.r) + ' ' + (REQUEST_STATUS[x.r.status] || x.r.status).toLowerCase()).join(' · ')}</div>`)).join('') +
    (out.length ? `<div class="grp"><span class="rs-g">Checked out · ${out.length}</span></div>` + out.map((m) => unitRowHtml(data, m, now)).join('') : '');
}

// The PAR: who has answered the latest one, and with what.
export function parHtml(data) {
  const par = data.lastPar();
  const head = `<div class="d-row" style="margin-top:14px"><span class="k" style="width:auto;flex:1">Head count (PAR)</span><button class="btn sm" data-action="start-par" data-target="all">Start PAR</button></div>`;
  if (!par) return head + '<div class="muted" style="font-size:12.5px">Asks every unit for a head count; each answers with one tap.</div>';
  const waiting = data.waitingOn(par);
  const acks = (par.to_users || []).map((u) => ({ u, a: data.ack(par.id, u) }));
  const allCounted = acks.length > 0 && acks.every((x) => x.a && x.a.count != null && x.a.reply !== 'Missing someone');
  const last = acks.reduce((t, x) => (x.a && x.a.acked_at > t ? x.a.acked_at : t), '');
  const line = waiting.length ? `${waiting.length} still to answer` : allCounted ? `all ${acks.reduce((n, x) => n + x.a.count, 0)} accounted for by ${hhmm(last)}` : 'everyone answered';
  const chips = acks.map(({ u, a }) => `<span class="par-chip ${a ? (a.reply === 'Missing someone' ? 'bad' : 'ok') : 'wait'}">${esc(unitLabel(data.member(u)))}${a ? ' · ' + esc(parAnswerText(a)) + (a.scanned != null ? ' · ' + a.scanned + ' scanned' : '') + ' · ' + hhmm(a.acked_at) : ' · waiting'}</span>`).join('');
  return head + `<div class="muted" style="font-size:12.5px;margin:2px 0 6px">${hhmm(par.created_at)} to ${esc(par.to_label || 'everyone')} · ${line}</div><div class="par-chips">${chips}</div>`;
}

// A fresh incident starts emptier (v80): until the first phone joins, the codes' card leads the panel (the join code
// with its QR, the join card, the bands), since getting phones in is the next thing after the boundary; the units
// take over when one joins and the codes go back behind the CEDAR7 pill. A section with nothing in it waits for its
// first row (Messages, Transports, Public information with the first photo, Map imagery; the PAR, Message the field and
// Agencies for the first unit);
// Hazards stays, since Safety looks there, and so do the sections whose only way in is their own form.
function homeHtml(data, state) {
  const inc = data.incident;
  const fresh = !data.units().length;
  return `
    ${fresh ? codesPopHtml(data, state) : resourcesHtml(data, state)}
    ${fresh ? '' : parHtml(data)}
    ${toConfirmHtml(data)}
    ${requestsHtml(data)}
    ${hazardsHtml(data)}
    ${fresh ? '' : `<div class="k" style="margin-top:6px">Message the field</div>${composerHtml(data, 'all')}`}
    ${data.messages().length ? `<div class="k" style="margin-top:6px">Messages</div>${messagesHtml(data, null, 8)}` : ''}
    ${facilitiesHtml(data)}
    ${shelteredHtml(data, state)}
    ${data.transports().length ? transportsHtml(data) : ''}
    ${channelsHtml(data)}
    ${fresh ? '' : agenciesHtml(data)}
    ${data.photos().length ? publicHtml(data) : ''}
    ${data.overlays(true).length ? imageryHtml(data) : ''}
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
function opsCodeHtml(data, state) {
  const me = data.me();
  if (!me || me.role !== 'ops') return '';
  const code = data.opsCode();
  const shown = !!(state && state.opsShown);
  return `
    <div class="k" style="margin-top:12px">Operations code</div>
    <div class="ops-code">
      <div class="d-row"><span class="code-big mono" data-ops-code>${code ? (shown ? esc(code) : '••••••••') : '—'}</span>${code ? `<button class="btn sm" data-action="ops-show">${shown ? 'Hide' : 'Show'}</button><button class="btn sm" data-action="copy-ops-code">Copy</button>` : ''}<button class="btn sm" data-action="new-ops-code" title="Retire this code: the old one no longer joins">${code ? 'New code' : 'Make one'}</button></div>
      <div class="muted" style="font-size:12.5px">${code ? 'Makes a second Operations. Say it by radio, never on paper; the join card carries the units\' code only.' : 'No Operations code yet. Press Make one.'}</div>
    </div>`;
}

// The codes' card (v60), under the header's join-code pill: the QR, the code, Invited members only, the join card,
// the link and the bands, then the Operations code as dots until Show is pressed, so it is never on a screen
// someone walks past. Drawn on every draw and shown by main.js while state.codesOpen.
export function codesPopHtml(data, state) {
  const inc = data.incident;
  return `
    <div class="k">Join code for field phones</div>
    <div class="join-box">
      <div class="qr-box">${qrSvg(fieldJoinUrl(inc.code), { label: 'QR code to join ' + inc.name })}</div>
      <div style="display:flex;flex-direction:column;gap:6px;min-width:0">
        <div class="d-row"><span class="code-big mono">${esc(inc.code)}</span><button class="btn sm" data-action="copy-code">Copy</button></div>
        <div class="muted" style="font-size:12.5px">Units scan this, or type it with their unit name.</div>
        <label class="chk inv-only" title="Invited members only: the join code stops working for anyone not yet on the incident; the door says the incident is by invitation. Members, the Operations code and invitations go on working."><input type="checkbox" data-check="invite-only"${inc.invite_only ? ' checked' : ''}> Invited members only${inc.invite_only ? ' <span class="muted">· the join code is off; invite from the People board\'s Members tab</span>' : ''}</label>
        <div class="d-row"><button class="btn sm" data-action="print-join">Print a join card</button><button class="btn sm" data-action="copy-join-link">Copy the link</button><button class="btn sm" data-action="print-bands" title="A sheet of 24 wristbands with a QR code each: a number and nothing else. A unit gives one to each person by scanning it; the desk gives one to each family.">Print bands</button></div>
      </div>
    </div>
    ${opsCodeHtml(data, state)}
`;
}

// The Layers panel under the tools bar: the map underneath on one side, the imagery over it on the other.
export function layersPopHtml(data, state) {
  const cur = storedLayer() || 'streets';
  const hidden = hiddenOverlays();
  const active = data.overlays();
  const runs = data.mapRuns ? data.mapRuns().length : 0;   // v75: the open runs, drawn unless this device's box is off
  return `
    <div class="lp-col">
      <div class="k">Overlays</div>
      ${active.length ? active.map((o) => `<div class="lp-ovl"><label class="lp-row"><input type="checkbox" data-action="overlay-toggle" data-id="${o.id}"${hidden.has(o.id) ? '' : ' checked'}><span class="lp-name">${esc(o.name || 'Imagery')}</span><span class="muted">${o.taken_at ? 'taken ' + hhmm(o.taken_at) : 'added ' + hhmm(o.created_at)}</span></label><input type="range" class="lp-range" min="0" max="1" step="0.05" value="${Number(o.opacity)}" data-range="overlay-opacity" data-id="${o.id}" aria-label="Opacity of ${esc(o.name || 'the imagery')}"></div>`).join('') : '<div class="muted lp-note">No imagery over the map yet.</div>'}
      ${overlayPickHtml()}
      <div class="muted lp-note">A picture lands on the map; drag it into place. Hiding is for this screen; opacity and the picture are for everyone. Adjust, remove or put back under Map imagery on the home panel.</div>
      <label class="lp-row lp-runs" title="Takes every run off this screen only; Show on map puts them back"><input type="checkbox" data-action="runs-toggle"${runsShown() ? ' checked' : ''}><span class="lp-name">Transport runs</span><span class="muted">${runs ? runs + ' open' : 'none open'}</span></label>
    </div>    <div class="lp-col">
      <div class="k">Map underneath</div>
      ${availableLayers().map((l) => `<label class="lp-row"><input type="radio" name="base-layer" value="${l.id}" data-action="layer-pick" data-layer="${l.id}"${cur === l.id ? ' checked' : ''}><span class="lp-name">${esc(l.name)}</span><span class="muted">${esc(l.source || '')}</span></label>`).join('')}
      ${googleKey() ? '' : '<div class="muted lp-note">Google Maps streets and satellite appear here once a Map Tiles API key is pasted into Incident settings, under the gear (Test the key is beside the box).</div>'}
    </div>`;
}

// Custom imagery over the map (v67): a picture is added with one button, lands over the map's view and is dragged
// into place by its corners (js/base/placing.js); the card over the map asks its name and when it was taken.
export function overlayPickHtml() {
  return `<label class="btn sm pick-btn" title="PNG or JPEG, up to 50 MB. It lands on the map; drag it into place.">Add a picture<input type="file" data-file="overlay" accept="image/png,image/jpeg,image/webp" hidden></label>`;
}
// the card over the map while a picture is placed (#place-card): the file, Name, Taken at, Opacity, the buttons
export function placeCardHtml(p) {
  return `
    <div class="pc-top"><b title="${esc(p.fileName)}">${esc(p.fileName)}</b><span class="muted">${Number(p.width)} × ${Number(p.height)}</span></div>
    <label class="f">Name <input id="place-name" value="${esc(p.name || '')}" placeholder="Aerial 06:40, Civil Air Patrol" maxlength="120"></label>
    <label class="f">Taken at <input id="place-taken" type="datetime-local" value="${esc(p.taken || '')}"></label>
    <label class="f">Opacity · <span id="place-op-v">${Math.round(Number(p.opacity) * 100)}%</span><input type="range" id="place-op" data-range="place-opacity" min="0.1" max="1" step="0.05" value="${Number(p.opacity)}" aria-label="Opacity"></label>
    <p class="muted pc-hint">Drag the picture to move it, a corner to stretch it, the round handle to turn it. Zoom in to line the roads up. Arrows nudge; Escape cancels.</p>
    <div class="pc-btns"><button class="btn pri sm" data-action="place-save">Save</button><button class="btn sm" data-action="place-undo" disabled>Undo</button><button class="btn sm" data-action="place-cancel">Cancel</button></div>`;
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
        <button class="btn sm" data-action="overlay-adjust" data-id="${o.id}" title="Drag it into place again, for everyone">Adjust</button>
        ${hidden.has(o.id) ? `<button class="btn sm" data-action="overlay-show" data-id="${o.id}" title="Hidden on this screen only">Show</button>` : `<button class="btn sm" data-action="overlay-hide" data-id="${o.id}" title="Hides it on this screen only">Hide</button>`}
        <button class="btn sm" data-action="overlay-remove" data-id="${o.id}" title="Takes it off the map for everyone; it is kept">Remove</button>
      </div>
    </div>`;
  return `
    <div class="k" style="margin-top:6px">Map imagery</div>
    <div class="muted" style="font-size:12.5px">A picture laid over the map for every screen: fresh aerial or satellite imagery, a drone mosaic, a scanned plan. Add one; it lands on the map; drag it into place.</div>
    ${active.length ? active.map(row).join('') : ''}
    ${gone.length ? `<div class="muted" style="font-size:12px">${gone.length} removed: ${gone.map((o) => `${esc(o.name || 'imagery')} <button class="plink" data-action="overlay-restore" data-id="${o.id}">put back</button>`).join(', ')}</div>` : ''}
    ${overlayPickHtml()}`;
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
// A sheet of bands (v55): a QR per band with the field app's link and the band's code, its number and the incident's
// name, no name of anyone. Printed from the base; a band is given by scanning it.
export function bandsSheetHtml(data, ids) {
  const tags = (ids && ids.length ? ids.map((id) => data.tag(id)).filter(Boolean) : data.tags().filter((t) => !t.person_id && !t.evacuee_id)).sort((a, b) => a.number - b.number);
  const field = new URL('field/', document.baseURI);
  const live = data.tags(true);
  return `<section><h2>Bands to print · ${tags.length}</h2>
    <p>Wristbands or cards, one per person. A band is an id and nothing else: a lost one tells nobody anything. A unit gives one to each of its people by scanning it (or types its number at check-in); the desk gives one to each family it signs in. ${live.length} printed on this incident, ${live.filter((t) => t.person_id || t.evacuee_id).length} on someone, ${live.filter((t) => t.voided_at).length} voided.</p></section>
    <div class="band-sheet">${tags.map((t) => `<div class="band"><div class="band-qr">${qrSvg(bandUrl(t.code, field), { margin: 1, label: bandLabel(t) })}</div><div class="band-n">${esc(bandLabel(t))}</div><div class="band-inc">${esc(data.incident.name)}</div><div class="band-code mono">${esc(t.code)}</div></div>`).join('')}</div>`;
}
export function bandsSheetText(data, ids) {
  const tags = (ids && ids.length ? ids.map((id) => data.tag(id)).filter(Boolean) : data.tags()).sort((a, b) => a.number - b.number);
  return 'BANDS · ' + data.incident.name + '\n' + tags.map((t) => '  ' + bandLabel(t) + '  ' + t.code).join('\n');
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
// The Public page (v52): the PIO's own screen from the header, with what the home panel's section says and every
// cleared photo, so the PIO is not sent 4,000 px down Operations' panel. Clearing stays Operations' call; the check and
// the caption are on each photo's panel, a press away from a row.
export function publicPageHtml(data) {
  const p = data.currentPeriod(), pub = data.publicPhotos(), set = data.publicSet();
  const rows = pub.slice().sort((a, b) => (a.taken_at < b.taken_at ? 1 : -1));
  return `
    <section><h2>Public information</h2>
      <p>${p && p.pio ? 'Public Information Officer: ' + esc(p.pio) : 'No Public Information Officer seated; the seat is on the Period sheet.'}</p>
      <p>${pub.length ? `${pub.length} photo${pub.length === 1 ? '' : 's'} cleared for the public, ${set.length} checked (no face, no plate, no house number). Only checked photos leave in the public set.` : 'No photo is cleared for the public. Operations clears a photo from its panel; nothing is public by default.'}</p>
      <p class="muted">Clearing is Operations' call; the public caption and the check are yours, on each photo. A caption names the division, never the coordinates or the unit's note.</p>
    </section>
    <section><h2>Cleared photos · ${pub.length}</h2>
      ${rows.length ? rows.map((x) => `<div class="pub-row"><button class="plink" data-action="select-photo" data-id="${x.id}">${hhmm(x.taken_at)} · ${esc(unitLabel(data.member(x.user_id)))}${x.zone_id && data.zone(x.zone_id) ? ' · ' + esc(data.zone(x.zone_id).code) : ''} · <strong>${x.public_checked_at ? 'checked ' + hhmm(x.public_checked_at) : 'not checked'}</strong> · ${x.public_caption ? esc(x.public_caption) : 'no public caption yet'}</button></div>`).join('') : '<p class="muted">None yet.</p>'}
    </section>
    <section><h2>The public set</h2>
      <p>${set.length} of ${pub.length} ready to download${pub.length - set.length > 0 ? '; ' + (pub.length - set.length) + ' cleared but not yet checked, listed as missing in captions.txt' : ''}.</p>
    </section>`;
}
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
      ${units.length ? units.map((u) => `<button class="btn sm${z.assigned_to === u.user_id ? ' on' : ''}" data-action="assign" data-id="${z.id}" data-user="${u.user_id}">${esc(unitLabel(u))}</button>`).join('') : `<span class="muted">No units yet. Phones join with ${esc(data.incident.code)}.</span>`}
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

// A person's chips (v69): the lead's typed words plain; for a person with their own account on the row, each kind's credential
// as "EMT ✓" (confirmed by Operations), "EMT · pending" or "EMT ✗" (not accepted, the reason in the title)
function qualChip(x) { const c = x.cred; const title = x.state === 'confirmed' ? 'confirmed by Operations ' + hhmm(c.confirmed_at) : x.state === 'pending' ? 'submitted ' + hhmm(c.created_at) + ', not yet confirmed' : x.state === 'rejected' ? 'not accepted' + (c.reason ? ': ' + c.reason : '') : 'the lead\'s word, no credential on record'; return `<span class="badge q q-${x.kind}${x.state === 'plain' ? '' : ' cred-' + x.state}" title="${esc(title)}">${esc(qualChipText(x))}</span>`; }
function qualBadges(data, p) { const qs = personQuals(p, data.credentials()); return qs.length ? `<span class="pp-quals">${qs.map(qualChip).join('')}</span>` : '<span class="pp-quals muted">no qualifications listed</span>'; }

// One person: who, what they are qualified for, where they stand, and what Operations can do about it.
// Compact rows (the unit panel) leave out the unit and buddy pickers.
export function personRowHtml(data, p, { compact, now = Date.now() } = {}) {
  const ops = !!data.me() && data.me().role === 'ops';
  const unit = data.member(p.user_id);
  const unitOut = unit && unit.status === 'checked_out';
  const buddy = p.buddy_id ? data.person(p.buddy_id) : null;
  const miss = data.missingPerson(p.id), pos = miss && unit ? data.position(unit.user_id) : null;
  const over = !miss && !p.archived_at && !p.checked_out_at && !unitOut && sceneOver(p, data.sceneHours(), now);   // past the period's hours on scene (v47)
  const state = miss ? 'MISSING since ' + hhmm(miss.ack.acked_at) + (pos ? ' · ' + unitLabel(unit) + ' last at ' + latLngText(pos.lat, pos.lng) + ', ' + ago(pos.at, now) : ' · no position from ' + unitLabel(unit))
    : p.archived_at ? 'Removed ' + hhmm(p.archived_at)
    : p.checked_out_at ? 'Checked out ' + hhmm(p.checked_out_at) + ' · ' + onSceneText(p) + ' on scene'
    : (unitOut ? 'Unit checked out · ' : 'On scene ') + stintText(p, now) + ', since ' + hhmm(sceneStart(p)) + (p.stint_at ? ' · back in' : '') + (over ? ' · past ' + data.sceneHours() + 'h' : '');   // the current stretch since v48
  const tag = tagOf(data.tags(true), { personId: p.id }), seen = tag ? lastSeen(data.seen(), [tag.id]) : null, stale = seenStale(seen, now);   // the band and its last scan (v55)
  const seenHtml = tag ? `<span class="pp-seen${stale ? ' stale' : ''}">${esc(bandLabel(tag))} · ${esc(lastSeenText(seen, seenOpts(data)))}${stale ? ' (' + esc(durationText(Math.round((now - new Date(seen.at).getTime()) / 60000))) + ' ago)' : ''}</span>` : '<span class="pp-seen muted">no band</span>';
  const mates = compact ? [] : data.unitPeople(p.user_id).filter((x) => x.id !== p.id);
  const units = compact ? [] : data.members().filter((m) => !m.rides_with && (m.status !== 'checked_out' || m.user_id === p.user_id)).sort((a, b) => (a.role === 'ops') - (b.role === 'ops') || (a.unit_name || '').localeCompare(b.unit_name || ''));
  return `
    <div class="pp-row${p.checked_out_at || unitOut ? ' out' : ''}${p.archived_at ? ' gone' : ''}${miss ? ' missing' : ''}${over ? ' over' : ''}" data-person="${p.id}">
      <span class="pp-who"><span class="pp-name">${esc(p.name)}</span>${p.role ? `<span class="muted"> ${esc(p.role)}</span>` : ''}${p.agency && (!unit || p.agency !== unit.agency) ? `<span class="pp-agency muted">${esc(p.agency)}</span>` : ''}${p.notes ? `<span class="pp-agency muted">${esc(p.notes)}</span>` : ''}</span>
      ${qualBadges(data, p)}
      <span class="pp-state">${esc(state)}${buddy && compact ? `<span class="muted"> · with ${esc(buddy.name)}</span>` : ''}${seenHtml}${p.claimed_by ? (() => { const id = identityState(data, { user_id: p.claimed_by }); return `<span class="pp-seen pp-id">own account · <span class="badge ${id.cls}">${esc(id.text)}</span></span>`; })() : ''}</span>
      <span class="pp-act">${ops && !p.archived_at && tag ? `<button class="btn sm" data-action="band-void" data-id="${tag.id}" title="A lost band: voided, never reused; give a new one by scanning it">Void band</button>` : ''}${ops && !p.archived_at ? `
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

// To confirm (v69): every member's pending credentials, oldest first, each with its photo (a signed link) or the number's tail,
// who submitted it from which unit, what it is, the expiry as the base reads it, Confirm and Not accepted (which asks why).
export function toConfirmHtml(data, { always } = {}) {
  const ops = !!data.me() && data.me().role === 'ops';
  if (!ops) return '';
  const rows = data.pendingCredentials();
  if (!rows.length && !always) return '';
  const now = Date.now();
  const row = (c) => {
    const m = data.member(c.user_id), p = data.profileOf(c.user_id);
    const expired = credentialExpired(c, now);
    return `<div class="cq-row" data-cred="${c.id}">
      ${c.photo_path ? `<div class="cq-thumb photo" data-cred-photo="${esc(c.photo_path)}" title="The photo, from a signed link"><img alt="The card" hidden><span>photo</span></div>` : `<div class="cq-thumb num" title="Typed, no photo">${c.number ? '···' + esc(c.number.slice(-4)) : 'typed'}</div>`}
      <div class="cq-who">${esc((p && p.full_name) || 'A member')} <span class="muted">· ${esc(unitLabel(m))}${m && m.rides_with ? ' · own account' : ''}</span></div>
      <div class="cq-what"><b>${esc(credentialLabel(c))}</b>${c.issuer ? ' · ' + esc(c.issuer) : ''}${c.number ? ' · ' + esc(c.number) : ''}${c.expires_at ? ' · expires ' + esc(c.expires_at) + (expired ? ' <span class="warn">· expired</span>' : '') : ''} · ${hhmm(c.created_at)}</div>
      <div class="cq-acts"><button class="btn sm green" data-action="cred-confirm" data-id="${c.id}" title="You have looked at it and it is this person's, in date">Confirm</button><button class="btn sm" data-action="cred-reject" data-id="${c.id}" title="Says why on their phone; they may submit again">Not accepted…</button>${c.photo_path ? `<a class="btn sm" data-cred-open="${esc(c.photo_path)}" href="#" target="_blank" rel="noopener" title="The photo, full size">Open the photo</a>` : ''}</div>
    </div>`;
  };
  return `<div class="d-row" style="margin-top:14px"><span class="k" style="width:auto;flex:1">To confirm${rows.length ? ' · ' + rows.length : ''}</span></div>
    ${rows.length ? `<div class="cq-list">${rows.map(row).join('')}</div>` : '<div class="muted" style="font-size:12.5px">Nothing to confirm. A licence a person adds from their phone shows here with its photo or number.</div>'}
    ${rows.length ? '<div class="muted" style="font-size:12px;margin-top:4px">Confirm: you have looked at the card and it is this person\'s, in date. Not accepted: the reason goes to their phone, and they may submit again. Each is one 214 line.</div>' : ''}`;
}

// The chips in the board's bar: every qualification with how many people on scene carry it.
export function peopleChipsHtml(data, state) {
  const on = data.peopleOn();
  const cur = (state.people && state.people.quals) || new Set();
  return QUALIFICATIONS.map(([q, label]) => `<button class="chip${cur.has(q) ? ' on' : ''}" data-action="people-qual" data-q="${q}" aria-pressed="${cur.has(q)}">${esc(label)} <span class="n">${on.filter((p) => (p.qualifications || []).includes(q)).length}</span></button>`).join('');
}

// What the base knows about who is behind a member (v65): the Members tab's Identity column. ok: the licence was
// checked, or the person was when none was given; part: a licence or its photo is on file, not yet checked (Check opens
// the unit's panel, where Mark verified is); warn: no licence, so Check in person does what Mark verified does there.
export function identityState(data, m) {
  const p = data.profileOf(m.user_id);
  if (!p || !profileReady(p)) return { cls: 'warn', text: 'Nothing given', action: '' };
  if (p.verified_at) return { cls: 'ok', text: (identityGiven(p) ? 'ID checked ✓ ' : 'ID checked in person ✓ ') + hhmm(p.verified_at), action: '' };
  if (identityGiven(p)) return { cls: 'part', text: 'ID given, not checked', action: 'check' };
  return { cls: 'warn', text: 'No ID', action: 'person' };
}

// The Members tab: who is on the incident, in which role, with what identity; Operations changes
// roles and removes or restores members. The person who opened the incident is always Operations.
// Invite by email (v56): the box, the invited list with Resend and Withdraw, the accepted ones, and the roster
function invitesHtml(data, state) {
  const me = data.me(), ops = !!me && me.role === 'ops';
  if (!ops) return '';
  const all = data.invites(true), now = Date.now();
  const by = (v) => { const p = data.profileOf(v.invited_by); return (p && p.full_name) || unitLabel(data.member(v.invited_by)); };
  const what = (v) => (v.role === 'ops' ? 'Operations' : 'Unit' + (v.unit_name ? ' · ' + v.unit_name : ''));
  const row = (v) => { const st = inviteState(v, now); return `<div class="inv-row st-${st}" data-invite="${v.id}">
      <span class="inv-who"><strong>${esc(v.email)}</strong> · ${esc(what(v))}</span>
      <span class="muted">${st === 'accepted' ? 'accepted ' + hhmm(v.accepted_at) + (v.accepted_by && data.member(v.accepted_by) ? ' as ' + esc(unitLabel(data.member(v.accepted_by))) : '') : st === 'withdrawn' ? 'withdrawn ' + hhmm(v.withdrawn_at) : (v.sent_at ? 'sent ' + hhmm(v.sent_at) + (v.sends > 1 ? ' (' + v.sends + ' times)' : '') : 'not sent') + ' by ' + esc(by(v)) + (st === 'expired' ? ' · <span class="inv-bad">expired</span>' : '')}${v.last_error ? ` · <span class="inv-bad">could not be sent: ${esc(v.last_error)}</span>` : ''}</span>
      <span class="inv-act">${st === 'pending' || st === 'expired' || st === 'unsent' ? `<button class="btn sm" data-action="invite-resend" data-id="${v.id}" title="A new link by email; the old one stops working">${v.sent_at ? 'Resend' : 'Send'}</button><button class="btn sm" data-action="invite-withdraw" data-id="${v.id}" title="The link stops working; kept on record">Withdraw</button>` : ''}</span>
    </div>`; };
  const pending = all.filter((v) => ['pending', 'expired', 'unsent'].includes(inviteState(v, now))), accepted = all.filter((v) => inviteState(v, now) === 'accepted'), gone = all.filter((v) => inviteState(v, now) === 'withdrawn');
  const roster = (state && state.roster) || [];
  return `
    <div class="k">Invite by email</div>
    <form class="inline-form inv-form" data-form="invite-send">
      <div class="row-3">
        <label>Email <input name="email" type="email" required maxlength="120" placeholder="name@agency.gov" autocomplete="off"></label>
        <label>Role <select name="role" class="sel"><option value="unit">Unit</option><option value="ops">Operations</option></select></label>
        <label>Unit name <input name="unit" maxlength="60" placeholder="Unit 4 (optional)" autocomplete="off"></label>
      </div>
      <div class="row-btns"><button class="btn pri sm" type="submit">Send the invitation</button><span class="muted" style="font-size:12.5px;flex:1">One link in one email. It signs the person in (no password: a code to the address does, next time) and lands them in this incident as the role you chose; their name and phone are asked as today. The link works for seven days, once.</span></div>
    </form>
    ${pending.length ? `<div class="k">Invited, not yet in · ${pending.length}</div><div class="inv-list">${pending.map(row).join('')}</div>` : ''}
    ${accepted.length ? `<div class="k">Accepted · ${accepted.length}</div><div class="inv-list">${accepted.map(row).join('')}</div>` : ''}
    ${gone.length ? `<div class="k">Withdrawn · ${gone.length}</div><div class="inv-list">${gone.map(row).join('')}</div>` : ''}
    <div class="k">The roster</div>
    <div class="d-row"><span class="muted" style="font-size:12.5px;flex:1">${roster.length ? `${roster.length} address${roster.length === 1 ? '' : 'es'} you invited on earlier incidents, not yet here: ${roster.slice(0, 6).map((r) => esc(r.email)).join(', ')}${roster.length > 6 ? ' and ' + (roster.length - 6) + ' more' : ''}.` : 'Everyone you invited on earlier incidents is here or invited already. The invitations you send double as the season\'s roster.'}</span>${roster.length ? `<button class="btn sm" data-action="invite-roster" title="One email each, as the role and unit they had last time">Invite the roster · ${roster.length}</button>` : ''}</div>`;
}
function membersHtml(data, state) {
  const me = data.me(), ops = !!me && me.role === 'ops', inc = data.incident, ps = state.people || {};
  const live = data.members(), removed = data.removedMembers();
  const opsRows = live.filter((m) => m.role === 'ops').sort((a, b) => (b.user_id === inc.created_by) - (a.user_id === inc.created_by) || (a.joined_at || '').localeCompare(b.joined_at || ''));
  const unitRows = live.filter((m) => m.role === 'unit').sort((a, b) => (a.status === 'checked_out') - (b.status === 'checked_out') || (a.unit_name || '').localeCompare(b.unit_name || ''));
  // two groups (v65): who, the facts, the Identity column with its action in place, Open and a ··· menu that asks with the
  // app's own dialog; the opener's row has nothing to press; the menu is drawn for every row and shown while state says so
  const row = (m) => {
    const p = data.profileOf(m.user_id), id = identityState(data, m), opener = m.user_id === inc.created_by, self = !!me && m.user_id === me.user_id;
    const zone = data.zones().find((z) => z.assigned_to === m.user_id && z.status === 'active') || data.zones().find((z) => z.assigned_to === m.user_id);
    const who = m.rides_with   // riding with a unit (v69): by name, with the unit
      ? `${esc((p && p.full_name) || 'A member')}<span> · with ${esc(unitLabel(data.member(m.rides_with)))}</span> <span class="badge st-assigned">Crew, by band</span>`
      : m.role === 'unit'
      ? `${esc(unitWithKind(m))} <span class="badge st-${esc(m.status)}">${STATUS_LABEL[m.status] || m.status}</span>${zone && m.status === 'assigned' ? ` <span class="pp-div">${esc(zone.code)}</span>` : ''}`
      : `${esc((p && p.full_name) || unitLabel(m))}<span> · ${opener ? 'opened the incident' : 'since ' + hhmm(m.joined_at)}</span>`;
    const facts = (m.role === 'unit' && !m.rides_with ? [p && p.full_name, p && p.phone, m.agency] : [p && p.phone, m.agency]).filter(Boolean).map(esc).join(' · ') || 'agency not set';
    const ident = m.removed_at ? `<span class="idc">Removed ${hhmm(m.removed_at)}</span>`
      : `<span class="idc ${id.cls}">${esc(id.text)}</span>${ops && id.action === 'check' ? `<button type="button" class="btn sm" data-action="member-check" data-id="${m.user_id}" title="Opens the licence and the photo on the unit's panel, with Mark verified">Check</button>` : ''}${ops && id.action === 'person' ? `<button type="button" class="btn sm" data-action="verify-profile" data-id="${m.user_id}" title="You have checked in person who this is: an agency card, someone who knows them, a call to the number">Check in person</button>` : ''}`;
    const menu = ops && !opener && !m.removed_at ? `<button type="button" class="btn sm more" data-action="member-menu" data-id="${m.user_id}" aria-expanded="${ps.menu === m.user_id}" aria-haspopup="menu" aria-label="More for ${esc(unitLabel(m))}" title="${m.role === 'unit' ? 'Make Operations, remove' : 'Make a unit, remove'}">···</button>
          <div class="mb-menu" role="menu"${ps.menu === m.user_id ? '' : ' hidden'}>${m.role === 'unit'
            ? `<button type="button" class="menu-item" role="menuitem" data-action="member-role" data-id="${m.user_id}" data-role="ops">Make Operations…</button>`
            : `<button type="button" class="menu-item" role="menuitem" data-action="member-role" data-id="${m.user_id}" data-role="unit">Make a unit…</button>`}${self ? '' : `<hr><button type="button" class="menu-item" role="menuitem" data-action="member-remove" data-id="${m.user_id}">Remove <span class="muted">· kept on record</span></button>`}</div>` : '';
    return `
      <div class="mb-row${m.removed_at ? ' gone' : ''}" data-member="${m.user_id}">
        <span class="mb-who">${who}</span>
        <span class="muted mb-facts">${facts}</span>
        <span class="mb-id">${ident}</span>
        <span class="mb-act">${m.removed_at
          ? (ops ? `<button type="button" class="btn sm" data-action="member-restore" data-id="${m.user_id}">Restore</button>` : '')
          : `${m.role === 'unit' ? `<button type="button" class="btn sm" data-action="select-unit" data-id="${m.rides_with || m.user_id}" title="${m.rides_with ? 'The unit they ride with: its panel' : 'The unit\'s panel: where it is, its people, its identity'}">Open</button>` : ''}${menu}`}</span>
      </div>`;
  };
  return `
    <div class="pp-top"><span class="pp-count">${live.length} member${live.length === 1 ? '' : 's'} · ${opsRows.length} Operations${removed.length ? ' · ' + removed.length + ' removed' : ''}</span></div>
    <p class="muted pp-note">The join code makes a unit, the Operations code makes Operations, an invitation by email makes either. Removing keeps what they sent; Restore puts them back.</p>
    <div class="k">Operations · ${opsRows.length}</div><div class="mb-list">${opsRows.map(row).join('')}</div>
    <div class="k">Units · ${unitRows.length}</div><div class="mb-list">${unitRows.map(row).join('') || '<div class="mb-row"><span class="muted">No units yet.</span></div>'}</div>
    ${removed.length ? `<div class="k">Removed · kept, never deleted</div><div class="mb-list">${removed.map(row).join('')}</div>` : ''}
    ${invitesHtml(data, state)}`;
}

// ---- The People tab (v65; try/mockups/people.html, direction C): a card per unit, a line per person, and a drawer
// beside the cards for the person pressed, with the facts, every action spelled out and their lines from the 214.
const seenOptsOf = (data) => ({ zoneOf: (id) => data.zone(id), facilityOf: (id) => data.facility(id), transportOf: (id) => data.transport(id) });
const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// what a line and the drawer say about a person: the time on scene (orange past the period's hours), where they were
// last seen (orange when the scan is stale), red for MISSING
function personFacts(data, p, now) {
  const unit = data.member(p.user_id), unitOut = !!unit && unit.status === 'checked_out';
  const miss = data.missingPerson(p.id), pos = miss && unit ? data.position(unit.user_id) : null;
  const hours = data.sceneHours();
  const over = !miss && !p.archived_at && !p.checked_out_at && !unitOut && sceneOver(p, hours, now);
  const tag = tagOf(data.tags(true), { personId: p.id }), seen = tag ? lastSeen(data.seen(), [tag.id]) : null, stale = seenStale(seen, now);
  const agoText = seen ? durationText(Math.round((now - new Date(seen.at).getTime()) / 60000)) + ' ago' : '';
  const where = seen ? seenWords(seen, seenOptsOf(data)) + ' ' + hhmm(seen.at) + (stale ? ' · ' + agoText : '') : '';
  const band = tag ? bandLabel(tag) : '';
  const short = miss ? 'MISSING since ' + hhmm(miss.ack.acked_at)
    : p.archived_at ? 'removed ' + hhmm(p.archived_at)
    : p.checked_out_at ? 'out ' + hhmm(p.checked_out_at)
    : unitOut ? 'unit checked out'
    : stintText(p, now) + (over ? ' · past ' + hours + 'h' : '') + (p.stint_at ? ' · back in' : '');
  const long = miss ? 'MISSING since ' + hhmm(miss.ack.acked_at) + (pos ? ' · ' + unitLabel(unit) + ' last at ' + latLngText(pos.lat, pos.lng) + ', ' + ago(pos.at, now) : ' · no position from ' + unitLabel(unit))
    : p.archived_at ? 'Removed ' + hhmm(p.archived_at)
    : p.checked_out_at ? 'Checked out ' + hhmm(p.checked_out_at) + ' · ' + onSceneText(p) + ' on scene'
    : (unitOut ? 'Unit checked out · ' : '') + stintText(p, now) + ', since ' + hhmm(sceneStart(p)) + (p.stint_at ? ' · back in' : '') + (over ? ' · past ' + hours + 'h' : '');
  const seenShort = !tag ? 'no band' : !seen ? band + ' · not scanned yet' : band + ' · ' + where;
  const seenLong = !tag ? 'no band' : !seen ? 'not scanned yet · ' + band.toLowerCase() : where + ', by ' + unitLabel(data.member(seen.seen_by)) + ' · ' + band.toLowerCase();
  return { unit, unitOut, miss, over, tag, seen, stale, short, long, seenShort, seenLong };
}
// one line on a unit's card: who, the time on scene at the right, the band and its last scan, the qualifications
function personLineHtml(data, p, ps, now) {
  const f = personFacts(data, p, now), sel = ps.open === p.id;
  const cls = ['pp-line', f.over ? 'over' : '', p.checked_out_at || f.unitOut ? 'out' : '', p.archived_at ? 'gone' : '', f.miss ? 'missing' : '', sel ? 'sel' : ''].filter(Boolean).join(' ');
  return `<button type="button" class="${cls}" data-person="${p.id}" data-action="person-open" data-id="${p.id}" aria-pressed="${sel}" title="Everything about ${esc(p.name)}, and what you can do">
      <span class="pp-l-who"><span class="pp-name">${esc(p.name)}</span>${p.role ? ` <span class="muted">${esc(p.role)}</span>` : ''}</span><span class="pp-l-on${f.over ? ' over' : ''}${f.miss ? ' miss' : ''}">${esc(f.short)}</span>
      <span class="pp-seen${f.stale ? ' stale' : ''}${f.tag ? '' : ' muted'}">${esc(f.seenShort)}${p.claimed_by ? ' <span class="pp-own" title="Their own account is on the row: they claimed a band, and their licences are theirs to submit">· own account</span>' : ''}</span><span class="pp-l-q">${personQuals(p, data.credentials()).length ? qualBadges(data, p) : ''}</span>
    </button>`;
}
// a unit's card: the header (unit, status, division, agency · kind · n on the unit), its lines, Add a person at the foot
function unitCardHtml(data, m, lines, ps, now) {
  const ops = !!data.me() && data.me().role === 'ops';
  const zone = data.zones().find((z) => z.assigned_to === m.user_id && z.status === 'active') || data.zones().find((z) => z.assigned_to === m.user_id);
  const mine = data.unitPeople(m.user_id), on = mine.filter((p) => !p.checked_out_at).length;
  const facts = [m.agency, kindText(m.kind), mine.length ? `${on} on the unit${mine.length > on ? ', ' + (mine.length - on) + ' checked out' : ''}` : ''].filter(Boolean).map(esc).join(' · ');
  const body = lines.length ? lines.map((p) => personLineHtml(data, p, ps, now)).join('')
    : data.unitPeople(m.user_id, true).length ? '<p class="muted pp-none">Nobody matches here.</p>'
    : `<p class="muted pp-none">No names on record${m.crew ? `: crew "${esc(m.crew)}"${m.crew_count != null ? ', ' + m.crew_count + ' people' : ''} as typed at check-in` : m.crew_count != null ? ': ' + m.crew_count + ' counted' : `, <span class="hc-unknown">${HEAD_COUNT_UNKNOWN}</span>`}. Name them for the PAR: a PAR by name says who is missing, not just how many.</p>`;
  return `
      <div class="pp-card${m.status === 'checked_out' ? ' out' : ''}" data-unit="${m.user_id}">
        <div class="pp-card-h">
          <div class="pp-card-t"><button type="button" class="ulink" data-action="select-unit" data-id="${m.user_id}" title="Open ${esc(unitLabel(m))}: where it is, its panel">${esc(unitLabel(m))}</button><span class="badge st-${esc(m.status)}">${STATUS_LABEL[m.status] || m.status}</span>${zone && m.status === 'assigned' ? `<span class="pp-div">${esc(zone.code)}</span>` : ''}</div>
          ${facts ? `<div class="muted pp-card-s">${facts}</div>` : ''}
        </div>
        ${body}
        ${ops && m.status !== 'checked_out' ? `<button type="button" class="btn link sm pp-addto" data-action="people-add-to" data-id="${m.user_id}">Add a person</button>` : ''}
      </div>`;
}
// the add or edit form (the same fields as before v65), drawn in the drawer; a card's Add a person fixes the unit
function personFormHtml(data, { editing, unitId, fixed } = {}) {
  const members = data.members().filter((m) => m.status !== 'checked_out' && !m.rides_with).sort((a, b) => (a.role === 'ops') - (b.role === 'ops') || (a.unit_name || '').localeCompare(b.unit_name || ''));
  const unit = editing ? data.member(editing.user_id) : data.member(unitId) || members[0] || null;
  const uid = unit ? unit.user_id : '';
  return `
    <form class="inline-form pp-form" data-form="${editing ? 'person-edit' : 'person-add'}"${editing ? ` data-id="${editing.id}"` : ''}>
      <div class="pp-dr-h"><div class="k" style="align-self:center">${editing ? `Edit ${esc(editing.name)} · ${esc(unitLabel(unit))}` : fixed && unit ? `Add a person to ${esc(unitLabel(unit))}` : 'Add a person'}</div><button class="btn sm" type="button" data-action="${editing ? 'person-edit-cancel' : 'people-add-toggle'}">Cancel</button></div>
      ${editing ? '' : fixed && unit ? `<input type="hidden" name="unit" value="${uid}">` : `<label>Unit <select name="unit" class="sel">${members.map((m) => `<option value="${m.user_id}"${uid === m.user_id ? ' selected' : ''}>${esc(unitLabel(m))}</option>`).join('')}</select></label>`}
      <label>Name <input name="name" required maxlength="80" placeholder="Surname, or the full name" autocomplete="off" value="${esc(editing ? editing.name : '')}"></label>
      <label>Rank or role <input name="role" maxlength="60" placeholder="Lt., Paramedic, Boat operator" value="${esc(editing ? editing.role || '' : '')}"></label>
      <label>Agency <input name="agency" maxlength="120" placeholder="The unit's, unless different" value="${esc(editing && unit && editing.agency !== unit.agency ? editing.agency || '' : '')}"></label>
      ${editing ? `<label>Notes <input name="notes" maxlength="200" placeholder="Anything the next shift should know" value="${esc(editing.notes || '')}"></label>` : ''}
      <div class="chips">${QUALIFICATIONS.map(([q, label]) => `<label class="chip" style="min-height:34px;padding:4px 10px"><input type="checkbox" name="q" value="${q}"${editing && (editing.qualifications || []).includes(q) ? ' checked' : ''}> ${esc(label)}</label>`).join('')}</div>
      <div class="row-btns"><button class="btn sm" type="button" data-action="${editing ? 'person-edit-cancel' : 'people-add-toggle'}">Cancel</button><button class="btn pri sm" type="submit">${editing ? 'Save' : 'Add to the unit'}</button></div>
    </form>`;
}
// the drawer: the form while adding or editing, else the person pressed: the facts as a kv, the actions as full-width
// buttons and selects, each saying what is kept, and their lines from the 214 (by name in the text, newest first, six)
function personDrawerHtml(data, ps, now) {
  const ops = !!data.me() && data.me().role === 'ops';
  if (ops && ps.add) return `<aside class="pp-drawer" data-form="person-add">${personFormHtml(data, { unitId: ps.addUnit, fixed: !!ps.addFixed })}</aside>`;
  const p = ps.open ? data.person(ps.open) : null;
  if (!p) return '';
  if (ops && ps.edit === p.id) return `<aside class="pp-drawer" data-person="${p.id}">${personFormHtml(data, { editing: p })}</aside>`;
  const f = personFacts(data, p, now), unit = f.unit;
  const buddy = p.buddy_id ? data.person(p.buddy_id) : null;
  const zone = unit ? data.zones().find((z) => z.assigned_to === unit.user_id && z.status === 'active') : null;
  const mates = data.unitPeople(p.user_id).filter((x) => x.id !== p.id && (!x.checked_out_at || x.id === p.buddy_id));
  const others = data.members().filter((m) => m.user_id !== p.user_id && m.status !== 'checked_out' && !m.rides_with).sort((a, b) => (a.role === 'ops') - (b.role === 'ops') || (a.unit_name || '').localeCompare(b.unit_name || ''));
  const re = new RegExp('(^|[^\\p{L}\\p{N}])' + escRe(p.name) + '(?![\\p{L}\\p{N}])', 'iu');
  const lines = data.events().filter((e) => re.test(e.text || '')).slice(0, 6);
  return `<aside class="pp-drawer" data-person="${p.id}">
      <div class="pp-dr-h"><div><b class="pp-dr-name">${esc(p.name)}</b>${p.role ? ` <span class="muted">${esc(p.role)}</span>` : ''}<div class="muted pp-dr-sub">${esc(unitLabel(unit))}${zone ? ' · ' + esc(zone.code) : ''}${p.agency || (unit && unit.agency) ? ' · ' + esc(p.agency || unit.agency) : ''}</div></div><button type="button" class="btn sm" data-action="person-close">Close</button></div>
      <div class="kv pp-kv">
        <span class="k">On scene</span><span class="${f.miss ? 'pp-miss' : f.over ? 'pp-over' : ''}">${esc(f.long)}</span>
        <span class="k">Last seen</span><span class="${f.stale ? 'pp-over' : ''}">${esc(f.seenLong)}</span>
        <span class="k">With</span><span>${buddy && !buddy.archived_at ? esc(buddy.name) + (buddy.checked_out_at ? ' <span class="muted">· checked out</span>' : '') : '<span class="muted">nobody</span>'}</span>
        <span class="k">Qualified</span><span>${personQuals(p, data.credentials()).length ? qualBadges(data, p) : '<span class="muted">nothing listed</span>'}</span>
        ${p.claimed_by ? (() => { const id = identityState(data, { user_id: p.claimed_by }), ops2 = ops && !p.archived_at; return `<span class="k">Identity</span><span class="pp-own-id">own account · <span class="idc ${id.cls}">${esc(id.text)}</span>${ops2 && id.action === 'check' ? ` <button type="button" class="btn sm" data-action="member-check" data-id="${p.claimed_by}" title="Opens the licence and the photo on their panel, with Mark verified">Check</button>` : ''}${ops2 && id.action === 'person' ? ` <button type="button" class="btn sm" data-action="verify-profile" data-id="${p.claimed_by}" title="You have checked in person who this is">Check in person</button>` : ''}</span>`; })() : ''}
        ${p.notes ? `<span class="k">Notes</span><span>${esc(p.notes)}</span>` : ''}
      </div>
      ${ops ? `<div class="pp-dr-acts">${p.archived_at ? `<button type="button" class="btn" data-action="person-restore" data-id="${p.id}">Put back</button><span class="muted pp-dr-why">Back on the roster, checked in now.</span>` : `
        ${p.checked_out_at ? `<button type="button" class="btn" data-action="person-in" data-id="${p.id}">Back in</button>` : `<button type="button" class="btn" data-action="person-out" data-id="${p.id}">Check out</button>`}
        <select class="sel" data-select="person-unit" data-id="${p.id}" aria-label="Move to another unit" title="Move to another unit: logged, both units recounted"><option value="">Move to…</option>${others.map((u) => `<option value="${u.user_id}">${esc(unitLabel(u))}</option>`).join('')}</select>
        <select class="sel" data-select="person-buddy" data-id="${p.id}" aria-label="Pair with" title="Who this person pairs with"><option value="">${p.buddy_id ? 'No buddy' : 'Pair with…'}</option>${mates.map((x) => `<option value="${x.id}"${p.buddy_id === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
        <button type="button" class="btn" data-action="person-edit" data-id="${p.id}" title="Correct the name, rank or role, agency, qualifications or notes">Edit</button>
        ${f.tag ? `<button type="button" class="btn" data-action="band-void" data-id="${f.tag.id}">Void ${esc(f.tag ? bandLabel(f.tag).toLowerCase() : '')}</button><span class="muted pp-dr-why">Never reused; kept on record.</span>` : ''}
        <button type="button" class="btn" data-action="person-remove" data-id="${p.id}">Remove</button><span class="muted pp-dr-why">Off the roster; kept on record, Put back undoes it.</span>`}</div>` : ''}
      <div class="k pp-dr-log">In the log</div>
      <div class="pp-loglines">${lines.map((e) => `<div><span class="mono muted">${hhmm(e.at)}</span> ${esc(e.text)}</div>`).join('') || '<div class="muted">Nothing yet.</div>'}</div>
    </aside>`;
}

export function peopleBoardHtml(data, state) {
  const ps = state.people || {};
  if (ps.tab === 'members') return membersHtml(data, state);
  const all = data.people(), on = data.peopleOn(), now = Date.now();
  const unitOf = (uid) => unitLabel(data.member(uid));
  const shown = peopleMatch(data.people(true), { q: ps.q, quals: ps.quals, unitLabelOf: unitOf });   // a removed person stays on the card, greyed, with Put back
  const want = [...(ps.quals || [])], narrowed = want.length || (ps.q || '').trim();
  const overScene = peopleOverScene(on, data.members(), data.sceneHours());   // v47
  const count = narrowed ? `${shown.filter((p) => !p.archived_at).length} of ${all.length} ${all.length === 1 ? 'person' : 'people'}${want.length ? ' with ' + want.map(qualLabel).join(' and ') : ''}${(ps.q || '').trim() ? ' matching "' + esc(ps.q.trim()) + '"' : ''}`
    : `${on.length} on scene on ${data.activeUnits().length} unit${data.activeUnits().length === 1 ? '' : 's'}${all.length > on.length ? ' · ' + (all.length - on.length) + ' checked out' : ''}${overScene.length ? ' · <span class="pp-over">' + overScene.length + ' past ' + data.sceneHours() + 'h on scene</span>' : ''}`;
  // a card for every unit on the incident, and for a member of any role or status with people on record
  const members = data.members().filter((m) => !m.rides_with && ((m.role === 'unit' && m.status !== 'checked_out') || data.unitPeople(m.user_id, true).length))   // a rider (v69) is on the unit's roster, not a card
    .sort((a, b) => (a.role === 'ops') - (b.role === 'ops') || (a.status === 'checked_out') - (b.status === 'checked_out') || (a.unit_name || '').localeCompare(b.unit_name || ''));
  const cards = members.map((m) => unitCardHtml(data, m, shown.filter((p) => p.user_id === m.user_id).sort((a, b) => !!a.archived_at - !!b.archived_at), ps, now)).join('');
  const drawer = personDrawerHtml(data, ps, now);
  return toConfirmHtml(data, { always: true }) + `
    <div class="pp-top"><span class="pp-count">${count}</span></div>
    <div class="pp-body${drawer ? ' open' : ''}">
      <div class="pp-cards">${cards || '<p class="muted">No units have checked in yet. A unit adds its people by name when it checks in on the phone.</p>'}</div>
      ${drawer}
    </div>`;
}

// The check-in list, ICS 211: everyone who checked in, by unit, with when and for how long.
// v72 (mock-up panel 10; v71 was a first cut): a form is a table. On the page and the paper each section is a figure (figureOnly): the head as a grid of
// facts, each unit a one-line header and a table (Name · Rank · Qualifications · Checked in · On scene · Band · last
// seen · Out), the totals two small tables. The lines stay for the text report (Copy as text, Send by email), which
// a phone's mail cannot show as a table.
export function form211Sections(data) {
  const inc = data.incident, p = data.currentPeriod(), now = Date.now();
  const all = data.people();
  const S = [];
  const cap = (s) => s ? s[0].toUpperCase() + s.slice(1) : s;
  const head = [
    ['Incident', inc.name + (inc.base_name ? ' · base: ' + inc.base_name : '')],
    ['Period', periodLine(p)],
    ['Command', commandText(inc, p) || ''],
    ['Prepared by', 'Operations, ' + whenText(new Date(now))]
  ].filter((x) => x[1]);
  S.push({ title: 'Check-in list, ICS 211', lines: head.map(([k, v]) => k === 'Prepared by' ? 'Prepared by ' + v : v), figureOnly: true,
    figure: `<h2>Check-in list, ICS 211</h2><div class="f211-head">${head.map(([k, v]) => `<span class="k">${esc(k)}</span><span>${esc(v)}</span>`).join('')}</div>` });
  const creds = data.credentials();
  const members = data.members().sort((a, b) => (a.role === 'ops') - (b.role === 'ops') || (a.unit_name || '').localeCompare(b.unit_name || '')).filter((m) => !m.rides_with && (m.role === 'unit' || data.unitPeople(m.user_id).length));
  const personLine211 = (px) => { const q = qualsTextWith(px, creds); return px.name + (px.role ? ', ' + px.role : '') + (q ? ' · ' + q : '') + (px.claimed_by ? ' · own account' : ''); };
  const TH = '<thead><tr><th>Name</th><th>Rank</th><th>Qualifications</th><th>Checked in</th><th>On scene</th><th>Band · last seen</th><th>Out</th></tr></thead>';
  for (const m of members) {
    const rows = data.unitPeople(m.user_id);
    const zone = data.zones().find((z) => z.assigned_to === m.user_id && z.status === 'active');
    const prof = data.profileOf(m.user_id);
    const by = prof ? `Checked in by ${prof.full_name}${prof.phone ? ', ' + prof.phone : ''}${prof.licence_number ? ', licence ' + prof.licence_state + ' ' + licenceTail(prof.licence_number) : ''}${identityGiven(prof) ? (prof.verified_at ? ', verified' : ', not verified') : ', ' + NO_ID_TEXT + (prof.verified_at ? ', verified in person' : ', not verified')}` : 'Checked in by an account with no identity given';
    const undone = m.status === 'checked_out' && m.demob && Array.isArray(m.demob.open) && m.demob.open.length ? 'At check-out, not done: ' + m.demob.open.join(', ') + (m.demob.note ? ' · for the next crew: ' + m.demob.note : '') : null;
    const noNames = m.crew ? `No names on record · crew as typed: ${m.crew}${m.crew_count != null ? ' · ' + m.crew_count + ' people' : ''} · checked in ${hhmm(m.joined_at)}` : `No names on record · checked in ${hhmm(m.joined_at)}`;
    const facts = rows.map((px) => {
      const buddy = px.buddy_id ? data.person(px.buddy_id) : null;
      const tg = tagOf(data.tags(true), { personId: px.id }), sn = tg ? lastSeen(data.seen(), [tg.id]) : null;   // v55
      return { px, buddy, tg, sn, stale: seenStale(sn, now) };
    });
    const pill = zone ? zone.code : (STATUS_LABEL[m.status] || m.status) + (m.status === 'checked_out' && m.checked_out_at ? ' ' + hhmm(m.checked_out_at) : '');
    const body = facts.length ? facts.map(({ px, buddy, tg, sn, stale }) => {
      const under = [px.claimed_by ? 'own account' : '', buddy ? 'with ' + buddy.name : '', px.agency && px.agency !== m.agency ? px.agency : '', px.notes || ''].filter(Boolean).join(' · ');
      const band = !tg ? 'no band' : bandNumber(tg.number) + (sn ? ' · ' + seenWords(sn, seenOpts(data)) + ' ' + hhmm(sn.at) + (stale ? ' · ' + durationText(Math.round((now - new Date(sn.at).getTime()) / 60000)) + ' ago' : '') : ' · not scanned yet');
      return `<tr><td><b>${esc(px.name)}</b>${under ? `<div class="sub">${esc(under)}</div>` : ''}</td><td>${esc(px.role || '')}</td><td>${esc(cap(qualsTextWith(px, creds)))}</td><td>${hhmm(px.checked_in_at)}</td><td>${esc(onSceneText(px, now))}</td><td class="${stale ? 'stale' : tg ? '' : 'muted'}">${esc(band)}</td><td>${px.checked_out_at ? hhmm(px.checked_out_at) : ''}</td></tr>`;
    }).join('') : `<tr><td colspan="7" class="muted">${esc(noNames)}</td></tr>`;
    S.push({ title: `${unitWithKind(m)}${m.agency ? ' · ' + m.agency : ''} · ${STATUS_LABEL[m.status] || m.status}${zone ? ' · ' + zone.code : ''}${m.status === 'checked_out' && m.checked_out_at ? ' ' + hhmm(m.checked_out_at) : ''}`,
      lines: [by, undone].filter(Boolean).concat(facts.length ? facts.map(({ px, buddy, tg, sn }) =>
        `${personLine211(px)}${px.agency && px.agency !== m.agency ? ' · ' + px.agency : ''} · checked in ${hhmm(px.checked_in_at)} · ${px.checked_out_at ? 'checked out ' + hhmm(px.checked_out_at) : 'on scene ' + onSceneText(px, now)}${buddy ? ' · with ' + buddy.name : ''}${tg ? ' · band ' + bandNumber(tg.number) + (sn ? ', ' + lastSeenText(sn, seenOpts(data)) : '') : ''}${px.notes ? ' · ' + px.notes : ''}`) : [noNames]),
      figureOnly: true,
      figure: `<div class="uh"><b>${esc(unitWithKind(m))}</b> <span class="sub">${m.agency ? esc(m.agency) + ' · ' : ''}${esc(by[0].toLowerCase() + by.slice(1))}</span> <span class="div${zone ? '' : ' st'}">${esc(pill)}</span></div>
        <table class="t211">${TH}<tbody>${body}</tbody>${undone ? `<tfoot><tr><td colspan="7">${esc(undone)}</td></tr></tfoot>` : ''}</table>` });
  }
  const on = data.peopleOn();
  const byAgency = new Map();
  for (const px of all) byAgency.set(px.agency || 'No agency named', (byAgency.get(px.agency || 'No agency named') || 0) + 1);
  const agencies = [...byAgency.entries()].sort((a, b) => b[1] - a[1]);
  const quals = QUALIFICATIONS.map(([q, label]) => [label, on.filter((px) => (px.qualifications || []).includes(q)).length]).filter((x) => x[1] > 0);
  const total = `${all.length} ${all.length === 1 ? 'person' : 'people'} checked in on ${data.units().length} unit${data.units().length === 1 ? '' : 's'} · ${on.length} on scene · ${all.length - on.length} checked out`;
  const legend = all.some((px) => px.claimed_by) ? '✓ confirmed by Operations · (pending) submitted, not yet confirmed · (not accepted) refused, the reason on the person\'s card · a plain word is the lead\'s' : null;
  const small = (title, rows) => rows.length ? `<table class="t211"><thead><tr><th>${esc(title)}</th><th class="n">People</th></tr></thead><tbody>${rows.map(([a, n]) => `<tr><td>${esc(a)}</td><td class="n">${n}</td></tr>`).join('')}</tbody></table>` : '';
  S.push({ title: 'Totals', lines: [
    total,
    all.length ? 'By agency: ' + agencies.map(([a, n]) => `${a} ${n}`).join(' · ') : null,
    quals.length ? 'On scene by qualification: ' + quals.map(([l, n]) => `${l} ${n}`).join(' · ') : null,
    legend
  ].filter(Boolean), figureOnly: true,
    figure: `<div class="uh"><b>Totals</b> <span class="sub">${esc(total)}</span></div>
      <div class="tot">${small('By agency', all.length ? agencies : [])}${small('On scene by qualification', quals)}</div>${legend ? `<p class="f211-legend">${esc(legend)}</p>` : ''}` });
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
      <span class="k">Expected</span><span>${runsTo(data.transports(), f.id).length ? `${runsTo(data.transports(), f.id).length} run${runsTo(data.transports(), f.id).length === 1 ? '' : 's'} coming here (below)` : f.expected ? esc(f.expected) + ' · ' : ''}${runsTo(data.transports(), f.id).length ? ' · ' : ''}<span class="ev-coming${c.arriving.length ? ' on' : ''}">${c.arrivingPeople} on ${c.arrivingPeople === 1 ? 'the' : 'their'} way from crews</span> <span class="muted">(live: records a crew sent here, not yet signed in at the desk)</span></span>
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
        ${runsTo(data.transports(), f.id).length ? `<label>Expected <span class="muted" style="font-size:12.5px;padding-top:8px">The runs on the Transports board say who is coming (v54)${f.expected ? '; the typed line "' + esc(f.expected) + '" gave way' : ''}.</span></label>` : `<label>Expected <input name="expected" value="${esc(f.expected || '')}" placeholder="Bus 2 from Pecan Park, 12 people, 17:30" maxlength="200"></label>`}
      </div>` : ''}
      <div class="row-btns">
        <button class="btn sm" type="button" data-action="pan-to" data-lat="${f.lat}" data-lng="${f.lng}">Show on map</button>
        <button class="btn sm" type="button" data-action="close-panel" title="Close this card; the facility stays open">Close</button>
        <button class="btn pri sm" type="submit">Save</button>
      </div>
    </form>
    ${people ? comingRunsHtml(data, f) + placePeopleHtml(data, f, c, state) : ''}`;
}

// ---- people sheltered and moved (v26): one record per person or family, on the shelter's or the
// hospital's card, findable by name from the header; counts only on anything that leaves the incident.
const evFrom = (data, e) => evacueeFrom(e, { structureOf: (id) => data.structure(id), zoneOf: (id) => data.zone(id) });
const facilityOf = (data) => (id) => data.facility(id);
// the band on a record and its last scan (v55): " · band 207, seen at High school gym 18:12"
const seenOpts = (data) => ({ zoneOf: (id) => data.zone(id), facilityOf: (id) => data.facility(id), transportOf: (id) => data.transport(id) });
function evBand(data, e) {
  const tag = tagOf(data.tags(true), { evacueeId: e.id });
  if (!tag) return '';
  const sn = lastSeen(data.seen(), [tag.id]);
  return `<span class="muted"> · band ${bandNumber(tag.number)}${sn ? ', ' + esc(lastSeenText(sn, seenOpts(data))) : ''}</span>`;
}
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
    <span class="ev-who"><strong>${esc(evacueeWho(e))}</strong>${e.note ? `<span class="muted"> · ${esc(e.note)}</span>` : ''}${evBand(data, e)}</span>
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
      ${c.arriving.map((e) => { const chips = runChipsHtml(data, e, f, state); return `<div class="ev-r${chips ? ' runs' : ''}" data-ev="${e.id}"><span class="ev-who"><strong>${esc(evacueeWho(e))}</strong>${e.note ? `<span class="muted"> · ${esc(e.note)}</span>` : ''}</span><span class="muted">${evFrom(data, e) ? 'from ' + esc(evFrom(data, e)) : ''}</span><span>${esc(needsText(e.needs))}</span><span class="muted">${esc(evOrigin(data, e))}</span><span class="ev-on">${chips}<button class="btn sm" data-action="ev-sign-in" data-id="${e.id}" data-facility="${f.id}" title="They have arrived: sign them in here (the desk usually does this)">Signed in</button></span></div>`; }).join('')}</div>` : ''}
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
  const rows = hits.map((e) => { const place = e.facility_id || e.prev_facility_id; return `<div class="find-row"><span class="find-who"><strong>${esc(evacueeWho(e))}</strong>${e.needs.length ? ' · ' + esc(needsText(e.needs)) : ''}${evBand(data, e)}</span><span class="find-where">${esc(evacueeWhere(e, facilityOf(data)))}</span><span class="muted find-from">${esc([evFrom(data, e) ? 'from ' + evFrom(data, e) : '', evOrigin(data, e)].filter(Boolean).join(' · '))}</span>${place ? `<button class="btn sm" data-action="select-facility" data-id="${place}">Open</button>` : ''}</div>`; }).join('');
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
  return peopleShelteredLine({ evacuees: data.evacuees(), facilities: data.facilities(true), placeWords: placeWordsOf({ zones: data.zones(), structures: data.structures(), facilities: data.facilities(true) }), transports: data.transports() });
}

// ---- a transport board (v54): a run is a vehicle from a pickup to a facility, with evacuee records on it.
// The board is its own overlay (#transports, like #people); the shelter's card lists the runs coming to it; the
// arriving rows put a record on a run; the sitrep and the briefing count people in transit.
const trFrom = (data, t) => transportFrom(t, { facilityOf: facilityOf(data), zoneOf: (id) => data.zone(id) });
const trTo = (data, t) => { const f = data.facility(t.to_facility_id); return f ? (f.name || facilityKind(f.kind)[1]) : 'a facility'; };
function trDriver(data, t) { return t.driver_user_id ? unitLabel(data.member(t.driver_user_id)) : t.driver_text || 'driver not named'; }
function runBadge(t) { return `<span class="badge tr-${esc(t.status)}">${TRANSPORT_STATUS[t.status] || t.status}</span>`; }
// Show on map (v70): the run lit on the map and brought into view; a done or withdrawn run is not on the map
function runShowBtn(t) { return t.archived_at || t.status === 'done' ? '' : `<button class="btn sm" data-action="tr-show" data-id="${t.id}" title="Light this run on the map and bring it into view">Show on map</button>`; }
// the next step as one button: Loading, Leaving, Arrived, Done
function runStepBtn(t, cls = 'btn sm') { const n = transportNext(t.status); return n && !t.archived_at ? `<button class="${cls}" data-action="tr-step" data-id="${t.id}" data-status="${n[0]}">${n[1]}</button>` : ''; }
// the runs a record on its way to this facility can be put on, as cards (v66): Not on a run first, then each run
// coming here as the phone draws it, folded past three until "N more" is pressed (state.runsOpen)
function runChipsHtml(data, e, f, state) {
  const runs = runsTo(data.transports(), f.id);
  if (!runs.length) return '';
  const ev = data.evacuees(), { shown, hidden } = foldRuns(runs, e.transport_id, !!(state && state.runsOpen && state.runsOpen.has(e.id)));
  return `<span class="chips runs" role="group" aria-label="On which run" title="On which run: the record rides with it and the desk sees it under the run"><button class="rcard sm${e.transport_id ? '' : ' on'}" data-action="ev-transport" data-id="${e.id}" data-run="">Not on a run</button>${shown.map((t) => { const c = runCard(t, ev, { facilityOf: facilityOf(data), zoneOf: (id) => data.zone(id) }); return `<button class="rcard sm${e.transport_id === t.id ? ' on' : ''}${transportLate(t) ? ' late' : ''}" data-action="ev-transport" data-id="${e.id}" data-run="${t.id}" title="${esc(c.title)}"><span class="l1"><strong>${esc(c.label)}</strong> → ${esc(c.to)}</span><span class="l2">${esc(c.sub)}</span></button>`; }).join('')}${hidden ? `<button class="rcard sm more" data-action="ev-runs-more" data-id="${e.id}">${hidden} more</button>` : ''}</span>`;
}
// Coming here, on a shelter's or a hospital's card: a row per run with who is on it and the next step
function comingRunsHtml(data, f) {
  const runs = runsTo(data.transports(), f.id);
  if (!runs.length) return '';
  const ev = data.evacuees();
  return `<div class="ev-box coming"><div class="d-row"><span class="k" style="width:auto;flex:1">Coming here · ${runs.length} run${runs.length === 1 ? '' : 's'}</span><button class="btn sm" data-action="transports" data-id="${runs[0].id}">Open the board</button></div>
    ${runs.map((t) => { const b = transportOnBoard(ev, t); return `<div class="tr-c${transportLate(t) ? ' late' : ''}" data-tr="${t.id}"><span><strong>${esc(transportLabel(t))}</strong> from ${esc(trFrom(data, t))} · ${esc(trDriver(data, t))}</span><span>${runBadge(t)} ${esc(transportTimes(t))}${transportLate(t) ? ' <span class="tr-late">late</span>' : ''}</span><span class="tr-c-btn">${runStepBtn(t)}</span><span class="muted tr-c-who">${b.on.length ? esc(aboardText(b.people, b.on.length)) + ': ' + b.on.map((e) => esc(evacueeWho(e)) + (b.signedIn.includes(e) ? ' (signed in)' : '')).join(', ') : 'nobody listed on it yet'}</span></div>`; }).join('')}</div>`;
}
// The home panel's section: the count line, the runs under way and planned, New run
export function transportsHtml(data) {
  const live = sortTransports(data.transports()), ev = data.evacuees();
  const shown = live.filter((t) => t.status !== 'done').slice(0, 6);
  return `
    <div class="d-row" style="margin-top:6px"><span class="k" style="width:auto;flex:1">Transports</span><button class="btn sm" data-action="transports">Open the board</button><button class="btn sm" data-action="tr-new">New run</button></div>
    <div class="muted" style="font-size:12.5px">${esc(transportsLine(live, ev))}</div>
    ${shown.map((t) => { const b = transportOnBoard(ev, t); return `<div class="tr-home"><button class="ur" data-action="transports" data-id="${t.id}"><span class="ur-main"><span class="ur-name">${esc(transportLabel(t))} · ${esc(trFrom(data, t))} → ${esc(trTo(data, t))}</span><span class="ur-sub">${esc(TRANSPORT_STATUS[t.status])} · ${esc(transportTimes(t))} · ${esc(capacityText(b.people, t.capacity))} aboard${transportLate(t) ? ' · <span class="tr-late">late</span>' : ''}</span></span></button>${runShowBtn(t)}</div>`; }).join('')}
    ${!live.length ? '<div class="muted" style="font-size:12.5px">None yet. New run plans a bus, a van, an ambulance or a boat run from a pickup to a shelter or a hospital; crews put their people on it from the house record, and the desk sees the whole run coming.</div>' : ''}`;
}
// hh:mm typed on the form, as the next such moment: today, or tomorrow when it is well past
function timeIso(hhmmText) {
  if (!hhmmText) return null;
  const [h, m] = String(hhmmText).split(':').map(Number);
  if (!(h >= 0 && h < 24 && m >= 0 && m < 60)) return null;
  const d = new Date(); d.setHours(h, m, 0, 0);
  if (d.getTime() < Date.now() - 6 * 3600000) d.setDate(d.getDate() + 1);
  return d.toISOString();
}
// what the form says, as a row: the fields the board's New run and Edit share
export function transportFormFields(form) {
  const from = form.from.value, driver = form.driver.value;
  return {
    kind: form.kind.value, label: form.label.value.trim(), capacity: form.capacity.value === '' ? null : Math.min(999, Math.max(1, Math.round(Number(form.capacity.value)) || 1)),
    from_facility_id: from.startsWith('f:') ? from.slice(2) : null, from_zone_id: from.startsWith('z:') ? from.slice(2) : null, from_text: from ? '' : form.from_text.value.trim(),
    to_facility_id: form.to.value, leaves_at: timeIso(form.leaves.value), expected_at: timeIso(form.expected.value),
    driver_user_id: driver || null, driver_text: driver ? '' : form.driver_text.value.trim(), notes: form.notes.value.trim()
  };
}
function transportFormHtml(data, t) {
  const places = data.facilities(), zones = data.zones(), units = data.units().filter((u) => u.status !== 'checked_out');
  const dest = places.filter((f) => PERSON_PLACES.includes(f.kind)).sort((a, b) => PERSON_PLACES.indexOf(a.kind) - PERSON_PLACES.indexOf(b.kind)).concat(places.filter((f) => !PERSON_PLACES.includes(f.kind)));   // shelters first, then hospitals, then the rest
  const fromVal = t ? (t.from_facility_id ? 'f:' + t.from_facility_id : t.from_zone_id ? 'z:' + t.from_zone_id : '') : '';
  return `<form class="inline-form tr-form" data-form="${t ? 'transport-edit' : 'transport-add'}"${t ? ` data-id="${t.id}"` : ''}>
    <div class="k">${t ? 'Edit ' + esc(transportLabel(t)) : 'New run'}</div>
    <div class="row-3">
      <label>Kind <select name="kind" class="sel">${TRANSPORT_KINDS.map(([v, label]) => `<option value="${v}"${(t ? t.kind : 'bus') === v ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select></label>
      <label>Label <input name="label" maxlength="60" placeholder="Bus 4" value="${esc(t ? t.label : '')}" autocomplete="off"></label>
      <label>Seats <input name="capacity" type="number" min="1" max="999" inputmode="numeric" placeholder="40" value="${t && t.capacity != null ? t.capacity : ''}"></label>
    </div>
    <div class="row-2">
      <label>From <select name="from" class="sel"><option value=""${fromVal === '' ? ' selected' : ''}>Somewhere else (type it)</option>${places.map((f) => `<option value="f:${f.id}"${fromVal === 'f:' + f.id ? ' selected' : ''}>${esc(f.name || facilityKind(f.kind)[1])}</option>`).join('')}${zones.map((z) => `<option value="z:${z.id}"${fromVal === 'z:' + z.id ? ' selected' : ''}>${esc(z.code)}${z.name ? ' ' + esc(z.name) : ''}</option>`).join('')}</select></label>
      <label>Pickup, in words <input name="from_text" maxlength="120" placeholder="Pecan Park pickup" value="${esc(t ? t.from_text : '')}" autocomplete="off"></label>
    </div>
    <div class="row-3">
      <label>To <select name="to" class="sel" required>${dest.map((f) => `<option value="${f.id}"${(t ? t.to_facility_id : (dest[0] || {}).id) === f.id ? ' selected' : ''}>${esc(f.name || facilityKind(f.kind)[1])} (${esc(facilityKind(f.kind)[1].toLowerCase())})</option>`).join('')}</select></label>
      <label>Leaves <input name="leaves" type="time" value="${t ? timeValue(t.leaves_at) : ''}"></label>
      <label>Expected <input name="expected" type="time" value="${t ? timeValue(t.expected_at) : ''}"></label>
    </div>
    <div class="row-2">
      <label>Driver <select name="driver" class="sel"><option value=""${t && t.driver_user_id ? '' : ' selected'}>Not in the app (name and phone)</option>${units.map((u) => `<option value="${u.user_id}"${t && t.driver_user_id === u.user_id ? ' selected' : ''}>${esc(unitWithKind(u))}</option>`).join('')}</select></label>
      <label>Name and phone <input name="driver_text" maxlength="120" placeholder="Travis ISD, 512 555 0177" value="${esc(t ? t.driver_text : '')}" autocomplete="off"></label>
    </div>
    <label>Notes <input name="notes" maxlength="200" placeholder="Wheelchair lift; pets in crates" value="${esc(t ? t.notes : '')}" autocomplete="off"></label>
    <div class="row-btns"><button class="btn sm" type="button" data-action="tr-edit-cancel">Cancel</button>${t && !t.archived_at ? `<button class="btn sm" type="button" data-action="tr-withdraw" data-id="${t.id}" title="Withdrawn, never removed: it stays in the history and can be put back">Withdraw</button>` : ''}<button class="btn pri sm" type="submit">${t ? 'Save' : 'Save the run'}</button></div>
    ${dest.length ? '' : '<div class="muted" style="font-size:12.5px">No facility to go to yet: place a shelter or a hospital first.</div>'}
  </form>`;
}
export function transportsPageHtml(data, state) {
  const ts = state.tr || {}, ev = data.evacuees();
  const live = sortTransports(data.transports()), gone = data.transports(true).filter((t) => t.archived_at);
  const editing = ts.edit ? data.transport(ts.edit) : null;
  const row = (t) => {
    const b = transportOnBoard(ev, t), late = transportLate(t), open = ts.open === t.id;
    return `<div class="tr-row st-${esc(t.status)}${late ? ' late' : ''}${t.archived_at ? ' gone' : ''}${open ? ' open' : ''}" data-id="${t.id}">
      <span class="tr-run"><strong>${esc(transportLabel(t))}</strong><span class="muted">${esc(transportKindText(t.kind))} · ${esc(trDriver(data, t))}</span></span>
      <span class="tr-route">${esc(trFrom(data, t))} → ${esc(trTo(data, t))}${t.notes ? `<span class="muted"> · ${esc(t.notes)}</span>` : ''}</span>
      <span class="tr-aboard"><strong>${esc(capacityText(b.people, t.capacity))}</strong><span class="muted">${b.on.length ? b.on.length + (b.on.length === 1 ? ' record' : ' records') + (b.signedIn.length ? ', ' + b.signedInPeople + ' signed in' : '') : 'nobody listed'}</span></span>
      <span class="tr-times">${esc(transportTimes(t))}${late ? ' <span class="tr-late">late</span>' : ''}</span>
      ${runBadge(t)}
      <span class="tr-btns">${t.archived_at ? `<button class="btn sm" data-action="tr-restore" data-id="${t.id}">Put back</button>` : runStepBtn(t) + `<button class="btn sm" data-action="tr-edit" data-id="${t.id}">Edit</button>`}${runShowBtn(t)}<button class="btn sm" data-action="tr-open" data-id="${t.id}" aria-expanded="${open}">${open ? 'Hide' : 'Who is on it'}</button></span>
      ${open ? `<div class="tr-on">${b.on.length ? b.on.map((e) => `<div class="tr-on-row"><span><strong>${esc(evacueeWho(e))}</strong>${evFrom(data, e) ? ' · from ' + esc(evFrom(data, e)) : ''}${e.needs.length ? ' · ' + esc(needsText(e.needs)) : ''}${e.note ? ` · <span class="muted">${esc(e.note)}</span>` : ''}</span><span class="muted">${esc(evacueeWhere(e, facilityOf(data)))}</span>${!t.archived_at && !b.signedIn.includes(e) ? `<button class="btn sm" data-action="tr-take-off" data-id="${e.id}" title="Off this run; the record stays where it says">Take off</button>` : ''}</div>`).join('') : '<div class="muted" style="font-size:12.5px">Nobody on it yet. A crew puts its people on from the house record; Operations from the shelter card\'s arriving rows.</div>'}</div>` : ''}
    </div>`;
  };
  const under = live.filter((t) => t.status === 'loading' || t.status === 'en_route');
  return `
    <div class="pp-top"><span class="pp-count">${esc(transportsLine(live, ev))}${under.length ? '' : ''}</span>${ts.add || editing ? '' : '<button class="btn sm" data-action="tr-add-toggle">New run</button>'}</div>
    ${ts.add || editing ? transportFormHtml(data, editing) : ''}
    ${live.length ? live.map(row).join('') : '<p class="muted">No run on record yet. New run plans a bus, a van, an ambulance or a boat run from a pickup to a shelter or a hospital. A crew at the pickup puts its people on it from the house record; the desk at the destination sees the whole run under Arriving and signs it in as one; the 214 has every step.</p>'}
    ${gone.length ? `<div class="d-row" style="margin-top:8px"><button class="btn sm" data-action="tr-gone-toggle">${ts.gone ? 'Hide withdrawn' : gone.length + ' withdrawn'}</button></div>${ts.gone ? gone.map(row).join('') : ''}` : ''}`;
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
export function requestCardHtml(data, r) {
  const who = unitLabel(data.member(r.user_id));
  const z = r.zone_id ? data.zone(r.zone_id) : null;
  const next = REQ_NEXT[r.status] || [];
  return `<div class="req req-${esc(r.status)} urg-${esc(r.urgency || 'none')}" data-request="${r.id}">
    <div class="req-top">${r.urgency ? `<span class="badge urg-${esc(r.urgency)}">${esc(stepLabel(r.urgency))}</span>` : ''}${r.blocking ? `<span class="badge stuck">${esc(STUCK_WORDS.badge)}</span>` : ''}<span class="badge st-req-${esc(r.status)}">${esc(REQUEST_STATUS[r.status] || r.status)}</span><span class="muted">${hhmm(r.created_at)} · ${esc(who)}${z ? ' · ' + esc(z.code) : ''}</span></div>
    <div class="req-line">${esc(requestLine(r))}</div>
    ${r.note ? `<div class="muted" style="font-size:12.5px">${esc(r.note)}</div>` : ''}
    ${(() => { if (!['asked', 'approved', 'ordered'].includes(r.status)) return ''; const m = unitsForRequest(r, { units: data.units(), zones: data.zones(), positions: data.positions() }); return m.length ? `<div class="req-onscene"><strong>On scene now:</strong> ${esc(onSceneLine(m))}${m.length > 3 ? ' · and ' + (m.length - 3) + ' more' : ''}. Open a division and press the unit's name to reassign it.</div>` : ''; })()}
    ${r.answer ? `<div style="font-size:12.5px">${esc(r.answer)}${r.status_at ? ' · ' + hhmm(r.status_at) : ''}</div>` : ''}
    ${next.length ? `<form class="req-answer" data-form="request-answer" data-id="${r.id}"><input name="answer" placeholder="${r.status === 'approved' ? 'Who is coming and when' : 'A word for the unit (optional)'}" maxlength="200" autocomplete="off">${next.map(([st, label]) => `<button class="btn sm${st === 'filled' ? ' green' : st === 'declined' ? '' : ' pri'}" name="status" value="${st}">${label}</button>`).join('')}</form>` : ''}
    ${r.lat != null && r.lng != null ? `<button class="plink" data-action="pan-to" data-lat="${r.lat}" data-lng="${r.lng}">Show on map</button>` : ''}
  </div>`;
}
export function requestsHtml(data) {
  const open = data.openRequests().sort((a, b) => stepRank(a) - stepRank(b) || (a.created_at < b.created_at ? -1 : 1));   // by step, the stuck ones first among equals (v74)
  const done = data.requests().filter((r) => r.status === 'filled' || r.status === 'declined').slice(0, 4);
  const now = open.filter(actNow).length;
  return `
    <div class="d-row" style="margin-top:14px"><span class="k" style="width:auto;flex:1">Requests (213RR) · ${open.length} open</span>${now ? `<span class="badge urg-now">${now} to act on now</span>` : ''}</div>
    ${open.length ? open.map((r) => requestCardHtml(data, r)).join('') : '<div class="muted" style="font-size:12.5px">Nothing open. The field asks from its inbox; Operations asks below.</div>'}
    ${done.length ? `<details class="muted" style="font-size:12.5px"><summary>${done.length} filled or declined lately</summary>${done.map((r) => requestCardHtml(data, r)).join('')}</details>` : ''}
    <form class="inline-form" data-form="request-add">
      <div class="row-2">
        <label>What <input name="what" placeholder="fuel truck, diesel" required maxlength="120"></label>
        <label>How many <input name="quantity" type="number" min="1" max="9999" value="1"></label>
      </div>
      <div class="row-2">
        <label>Kind <select name="kind" class="sel">${REQUEST_KINDS.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></label>
        <label>By when <select name="urgency" class="sel"><option value="">No rush</option>${URGENCY_STEPS.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></label>
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
export function identityHtml(data, m, { open } = {}) {
  const p = data.profileOf(m.user_id);
  if (!p) return `<div class="ident"><div class="k">Identity</div><div class="muted" style="font-size:12.5px">Nothing given yet${m.role === 'unit' ? ' · a unit cannot check in without one' : ''}</div></div>`;
  const expired = p.licence_expires && licenceExpired(p.licence_expires);
  const source = { scan: 'read from the barcode', photo: 'front photographed', typed: 'typed' }[p.id_source] || 'on file';
  const given = identityGiven(p);
  // a licence on file folds to one line (v50): the name, the phone and the licence tail; the expiry, the date of birth, the
  // address and the photo are a press away. A name-and-phone check-in stays open: nothing there needs hiding, and the words
  // for the in-person check and Mark verified are what Operations needs.
  if (given && !open) {
    return `<div class="ident folded">
    <div class="d-row"><span class="k" style="width:auto">Identity</span>${p.verified_at ? `<span class="badge cleared">Verified ${hhmm(p.verified_at)}</span>` : '<span class="badge haz">Not verified</span>'}<span class="ident-line"><strong>${esc(p.full_name) || '—'}</strong> · ${esc(p.phone) || '—'} · ${p.licence_number ? 'licence ' + esc(p.licence_state) + ' ' + esc(licenceTail(p.licence_number)) : 'licence photographed'}${expired ? ' · <strong style="color:var(--danger)">expired</strong>' : ''}</span><button class="btn sm" data-action="ident-toggle" data-id="${m.user_id}" title="The expiry, the date of birth, the address and the photo of the licence">Details</button>${p.verified_at ? '' : `<button class="btn sm green" data-action="verify-profile" data-id="${m.user_id}" title="You have looked at the licence and it is this person">Mark verified</button>`}</div>
  </div>`;
  }
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
    <div class="d-row">${p.verified_at ? `<button class="btn sm" data-action="unverify-profile" data-id="${m.user_id}">Withdraw verification</button>` : `<button class="btn sm green" data-action="verify-profile" data-id="${m.user_id}" title="${given ? 'You have looked at the licence and it is this person' : 'You have checked in person who this is'}">Mark verified</button>`}${given ? `<button class="btn sm" data-action="ident-toggle" data-id="${m.user_id}">Fold</button>` : ''}</div>
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
    ${alert ? `<div class="badge" style="background:var(--danger);color:#fff">EMERGENCY · ${esc(alertWords(alert) || 'needs help')}${alert.acknowledged_at ? ' · acknowledged ' + hhmm(alert.acknowledged_at) : ''}</div>` : ''}
    <div class="d-row"><span class="badge st-${esc(m.status)}">${statusDetail(data, m)}</span><span class="muted" style="font-size:12px">since ${hhmm(m.status_at)}</span></div>
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
    <div class="d-row">
      ${pos ? `<button class="btn sm" data-action="pan-to" data-lat="${pos.lat}" data-lng="${pos.lng}">Show on map</button>` : ''}
      ${alert && !alert.acknowledged_at ? `<button class="btn sm danger" data-action="ack-alert" data-id="${alert.id}">Acknowledge</button>` : ''}
    </div>
    ${m.kind === 'shelter_desk' ? deskPlaceHtml(data, m) : ''}
    ${identityHtml(data, m, { open: !!state && state.identOpen === m.user_id })}
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
    ${m.role === 'unit' ? `<div class="d-row"><span class="k">Kind · what Operations asks for and Logistics fills</span><span class="chips kind-chips">${UNIT_KINDS.map(([k, label]) => `<button class="chip${m.kind === k ? ' on' : ''}" data-action="set-kind" data-id="${m.user_id}" data-kind="${m.kind === k ? '' : k}" aria-pressed="${m.kind === k}">${esc(label)}</button>`).join('')}</span></div>` : ''}
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
  // the starter (v77): where period 1's lines came from, the facilities still to place, the unit kinds to expect
  const st = data.starter() ? starterFor(data.starter()) : null, chips = placeFirst(data.kind(), data.facilities()), expect = p && p.number === 1 ? expectedUnits(data.kind()) : '';
  return `
    <button class="back" data-action="close-panel">Back to units</button>
    <div class="title">${p ? 'Operational period ' + p.number : 'No operational period yet'} <span>${p ? esc(periodLabel(p)).replace('OP ' + p.number + ' · ', '') : ''}</span></div>
    ${p && p.number === 1 && st && st.from ? `<div class="from-starter">From the ${esc(st.from)} starter. Edit any line; × removes an objective.</div>` : ''}
    ${p && periodState(p).state === 'overdue' ? `<div class="period-overdue" style="background:var(--tint-orange);color:var(--hazard-ink);border-radius:8px;padding:6px 10px;font-size:12.5px;margin:6px 0">The planned end ${hhmm(p.ends_at)} passed ${esc(durationText(periodState(p).overMin))} ago and the period is still open. Start period ${p.number + 1}, or move the planned end below.</div>` : ''}
    ${p ? periodFormHtml(data, p, false, state) : '<div class="muted" style="font-size:12.5px">An incident runs in operational periods, usually 12 hours, each with its objectives and its command names.</div>'}
    ${commandsHtml(data)}
    ${chips.length ? `<div class="k">Place first</div><div class="d-row">${chips.map(([v, label, letters]) => `<button class="btn sm place-first" data-action="place-facility" data-kind="${v}" title="Then click the map where the ${esc(label.toLowerCase())} is"><span class="fmark fmark-${v} inline">${esc(letters)}</span>${esc(label)}</button>`).join('')}</div><div class="muted" style="font-size:12px">A press, then a click on the map; each goes once one of its kind is placed.</div>` : ''}
    ${expect ? `<div class="k">Units to expect</div><div class="muted" style="font-size:12.5px">${esc(expect)} · what to ask for on a 213RR</div>` : ''}
    ${p ? `
    <div class="k">Objectives (ICS 202)</div>
    ${objectives.length ? objectives.map((o) => `
      <div class="obj${o.done_at ? ' done' : ''}">
        <button class="obj-tick" data-action="${o.done_at ? 'objective-undo' : 'objective-done'}" data-id="${o.id}" aria-label="${o.done_at ? 'Reopen' : 'Done'}">${o.done_at ? '✓' : ''}</button>
        <span class="obj-text"><strong>${o.number}.</strong> ${esc(o.text)}${o.done_at ? ` <span class="muted">done ${hhmm(o.done_at)}</span>` : ''}${zonesFor(o).length ? ` <span class="muted">· ${zonesFor(o).map((z) => esc(z.code)).join(', ')}</span>` : ''}</span>
        <button class="obj-x" data-action="objective-remove" data-id="${o.id}" title="Remove this objective: it leaves every list and carries into no period; the 214 keeps a line" aria-label="Remove objective ${o.number}">×</button>
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
  if (data.transports(true).length) S[S.length - 1].lines.push(transportsLine(data.transports(), data.evacuees()));   // v54
  const channels = data.channels();
  S.push({ title: 'Communications (ICS 205)', lines: channels.length ? channels.map((c) => `${c.use}: ${c.channel}${c.notes ? ' · ' + c.notes : ''}`) : ['No plan set'] });
  const attention = alerts.map((a) => `EMERGENCY from ${unitLabel(data.member(a.user_id))} at ${hhmm(a.created_at)}${alertWords(a) ? ': ' + alertWords(a) : ''}${a.acknowledged_at ? ', acknowledged' : ', NOT acknowledged'}`)
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
    transportsLine(data.transports(), data.evacuees()),   // v54
    `Damage: ${damaged.major} major, ${damaged.destroyed} destroyed`,
    `Hazards open: ${data.hazards().length} · emergencies open: ${data.alerts().length}`
  ] });
  S.push({ title: 'Objectives', lines: (p ? data.objectives(p.id) : []).map((o) => `${o.number}. ${o.text}${o.done_at ? ' (done)' : ' (open)'}`).concat([]).length ? data.objectives(p && p.id).map((o) => `${o.number}. ${o.text}${o.done_at ? ' (done)' : ' (open)'}`) : ['None set'] });
  S.push({ title: 'Resources', lines: [`${units.length} units checked in, ${data.activeUnits().length} on the incident, ${data.peopleInField()} people in the field`].concat(
    ['assigned', 'available', 'out_of_service', 'checked_out'].map((st) => `${STATUS_LABEL[st]}: ${units.filter((u) => u.status === st).length}`),
    agenciesOn(units).map(agencyLine)) });
  S.push({ title: 'Resources needed', lines: data.openRequests().map((r) => `${requestLine(r)}${r.zone_id && data.zone(r.zone_id) ? ' for ' + data.zone(r.zone_id).code : ''}${r.urgency || r.blocking ? ', ' + urgencyWords(r.urgency, r.blocking) : ''} · ${REQUEST_STATUS[r.status].toLowerCase()}${r.answer ? ', ' + r.answer : ''}`).concat(sr.needs ? [sr.needs] : []).concat(data.openRequests().length || sr.needs ? [] : ['None stated']) });
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
// HTML), which the page draws after the lines and the text leaves out. A section with figureOnly (the 211's
// tables, v71 and v72) is its figure alone on the page, title included; the title and lines are the text report's.
// A line that starts with two spaces is drawn indented under the line before (a person under a unit).
// A line that starts with "! " is a warning (something missing), drawn orange; the text keeps the mark.
function sectionsHtml(S) { return S.map((s) => s.figureOnly ? `<section class="figure-only">${s.figure}</section>` : `<section${s.figure ? ' class="has-map"' : ''}><h2>${esc(s.title)}</h2>${s.lines.map((l) => { const depth = (/^( *)/.exec(l)[1].length / 2) | 0; return `<p${l.startsWith('! ') ? ' class="warn"' : depth >= 2 ? ' class="sub sub2"' : depth === 1 ? ' class="sub"' : ''}>${esc(l.trim().replace(/^! /, ''))}</p>`; }).join('')}${s.figure || ''}</section>`).join(''); }
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
const GROUP_OF = { shelter: 'field', transport: 'field', seen: 'field', request: 'field', photo: 'field', clear: 'field', hazard: 'field', help: 'field', msg: 'msg', safety: 'msg', par: 'msg', ops: 'ops', status: 'ops', note: 'note' };
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
    case 'ic_transports': return `<button class="llink" data-action="transports" data-id="${id}">Open the board</button>`;
    case 'ic_tags': case 'ic_seen': return `<button class="llink" data-action="people">Open people</button>`;
    case 'ic_invites': return `<button class="llink" data-action="people" data-tab="members">Open members</button>`;
    default: return '';
  }
}
export function logFiltersHtml(data, state) {
  const events = data.events(), cur = (state.log && state.log.group) || 'all', sinceAt = state.log && state.log.sinceAt;
  return LOG_GROUPS.filter(([g]) => g !== 'new' || (sinceAt && events.some((e) => e.at > sinceAt))).map(([g, label]) => {
    const n = events.filter((e) => inGroup(e, g, sinceAt)).length;
    if (!n && g !== 'all' && g !== cur) return '';   // v80: a chip with nothing behind it waits for its first line
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
    const words = alertWords(a);   // what's wrong, what you need, the PAR's note (v68)
    return barItem(`EMERGENCY · ${who} needs help${zone ? ' in ' + zone.code : ''}${words ? ' · ' + words : ''} · sent ${hhmm(a.created_at)}${a.acknowledged_at ? ' · acknowledged ' + hhmm(a.acknowledged_at) : ''}`, '',
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
      <div class="mrow-top"><span class="t mono">${hhmm(m.created_at)}</span><span class="who">${esc(unitLabel(data.member(m.from_user)))}</span><span class="muted">to ${esc(m.to_label || 'everyone')}</span>${m.kind === 'safety' ? '<span class="badge haz">Safety</span>' : ''}${m.kind === 'par' ? '<span class="badge">PAR</span>' : ''}${m.urgency ? `<span class="badge urg-${esc(m.urgency)}">${esc(stepLabel(m.urgency))}</span>` : ''}${m.blocking ? `<span class="badge stuck">${esc(STUCK_WORDS.badge)}</span>` : ''}</div>
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
  for (const h of data.urgentHazards()) parts.push(barItem(`HAZARD · ${hazardWords(h)} · ${h.zone_id && data.zone(h.zone_id) ? data.zone(h.zone_id).code + ' · ' : ''}${hhmm(h.created_at)} · ${unitLabel(data.member(h.user_id))}`, 'hazard',
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
      <label>Kind <select name="kind" class="sel">${kindOptions().map(([v, l]) => `<option value="${v}"${(st.kind || '') === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <div class="muted" style="font-size:12px">Said on the incident's card, the picker and the phone's briefing; changing it rewrites no period (v77).</div>
      <div class="k" style="margin-top:4px">Bands</div>
      <div class="muted" style="font-size:12px">${data.tags(true).length} printed, ${data.tags(true).filter((t) => t.person_id || t.evacuee_id).length} on someone, ${data.tags(true).filter((t) => t.voided_at).length} voided. Print bands from the home panel's join box or the People board; a lost band is voided from its person's row on the People board and a new one given by scanning it. A sheltered person's band is voided with their name when the personal records clear.</div>
      <div class="row-btns"><button type="button" class="btn sm" data-action="settings-close">Cancel</button><button class="btn pri sm" type="submit">Save</button></div>
    </form>`;
}

// A division's hover card (v60): rest on its row for half a second. How many people are tasked to it against how
// many are in it now (the units whose phones reported inside its outline in the last five minutes), the search,
// the hazards open, the last report, the objective's words. Orange when fewer are in it than tasked.
export function zoneHoverHtml(data, z, now = Date.now()) {
  const units = data.activeUnits();
  const tasked = z.assigned_to ? units.filter((u) => u.user_id === z.assigned_to) : [];
  const inside = units.filter((u) => { const p = data.position(u.user_id); return p && now - new Date(p.at).getTime() < 5 * 60000 && !!zoneAt([z], p.lat, p.lng); });
  const count = (list) => list.reduce((n, u) => n + (u.crew_count || 0), 0);
  const haz = data.hazards().filter((h) => h.zone_id === z.id);
  const last = Math.max(0, ...[...tasked, ...inside].map((u) => { const p = data.position(u.user_id); return p ? new Date(p.at).getTime() : 0; }));
  const o = z.objective_id ? data.objective(z.objective_id) : null;
  const low = tasked.length > 0 && count(inside) < count(tasked);
  return `
    <div><b>${esc(z.code)} ${esc(z.name)}</b> <span class="muted">· priority ${z.priority} · ${esc(zoneStatusText(z, assignedLabel(data, z), data.zoneAccepted(z)))}</span></div>
    <div class="zh-two">
      <div class="zh-big">${count(tasked)}<small>tasked${tasked.length ? ' · ' + tasked.map(unitLabel).join(', ') : ''}</small></div>
      <div class="zh-big${low ? ' low' : ''}">${count(inside)}<small>in it now${inside.length ? ' · ' + inside.map(unitLabel).join(', ') : ''}</small></div>
    </div>
    <div class="zh-row"><span>Searched</span><b>${z.cleared} of ${z.structures}</b></div>
    <div class="zh-row"><span>Hazards open</span><b${haz.length ? ' class="warn"' : ''}>${haz.length ? haz.length + ' · ' + esc(hazardWords(haz[0])) : 'none'}</b></div>
    <div class="zh-row"><span>Last report</span><b>${last ? esc(ago(new Date(last).toISOString(), now)) : 'none'}</b></div>
    ${o ? `<div class="zh-row"><span>Objective ${o.number}</span><span>${esc(o.text)}</span></div>` : ''}
    ${(() => { const ppl = tasked.flatMap((u) => data.unitPeople(u.user_id).filter((p) => !p.checked_out_at)); return ppl.length ? `<div class="zh-ql">${ppl.map((p) => `<span class="muted">${esc(p.name)}</span><span class="pp-quals">${personQuals(p, data.credentials()).map(qualChip).join('') || '<span class="muted">—</span>'}</span>`).join('')}</div>` : ''; })()}
    <div class="muted" style="font-size:11.5px;margin-top:6px">Click for the division; right-click for its card.</div>`;
}

// The head count beside Find a person (v60): people in the field, on how many units, and how many are past the
// hours-on-scene threshold; it opens the People board.
export function headCountHtml(data) {
  const n = data.peopleInField(), units = data.activeUnits().filter((u) => u.status !== 'out_of_service').length;
  const hours = data.sceneHours(), over = peopleOverScene(data.people(), data.members(), hours).length;
  const html = `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="5.5" cy="4.5" r="2.5"/><circle cx="11" cy="5" r="2"/><path d="M1 13c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4z"/><path d="M9.5 9.4c.5-.3 1-.4 1.5-.4 2 0 3.5 1.2 3.5 3.3V13h-3.6c0-1.6-.5-2.8-1.4-3.6z"/></svg><b>${n}</b> <span class="muted">on ${units} unit${units === 1 ? '' : 's'}</span>${over ? ` <span class="over">· ${over} past ${hours} h</span>` : ''}`;
  const title = `${n} ${n === 1 ? 'person' : 'people'} in the field on ${units} unit${units === 1 ? '' : 's'}${over ? `; ${over} past ${hours} h on scene` : ''}. Opens the People board.`;
  return { html, title };
}

// The connection's card (v60), under the header's dot: is what I am looking at current? Connected since when, the
// last update and what it was, each phone's last report (quiet past five minutes, in orange), this base's version.
export function liveHtml(data, state, now = Date.now()) {
  const ok = data.realtime === 'SUBSCRIBED';
  const units = data.activeUnits();
  const rows = units.map((u) => { const p = data.position(u.user_id); const age = p ? now - new Date(p.at).getTime() : null; const quiet = age == null || age > 5 * 60000; return `<div class="lv-row"><span>${esc(unitLabel(u))}</span><span${quiet ? ' class="warn"' : ''}>${p ? esc(ago(p.at, now)) + (quiet ? ' · quiet' : '') : 'no position yet'}</span></div>`; }).join('');
  const lu = state.lastUpdate;
  return `
    <div class="lv-row"><span>Connection</span><b class="${ok ? 'ok' : 'warn'}">${ok ? 'Live' + (state.liveSince ? ' since ' + hhmm(state.liveSince) : '') : (state.liveSeen ? 'Not connected' : 'Connecting')}</b></div>
    <div class="lv-row"><span>Last update</span><span>${lu ? esc(ago(new Date(lu.at).toISOString(), now)) + ' · ' + esc(lu.what) : 'none yet'}</span></div>
    ${rows}
    <div class="lv-row"><span>This base</span><span>${state.version ? esc(state.version) : 'version unknown'}${state.updateReady ? ' · <b class="warn">new version ready</b>' : ''}</span></div>
    <div class="d-row" style="margin-top:8px"><button class="btn sm" data-action="reconnect">Reconnect</button></div>`;
}

// The incident's card (v76): the header's line broken out as four tiles, one number each (how long overdue or left,
// the units, the divisions with a bar of the search, the hazards open), each tile the button to where it is worked;
// the one action, Start the next period, at the top while the period is overdue; the names in one quiet line at the
// foot, the command line opening the org chart. Four numbers, not six sentences. Opened by a rest on the line or a click.
export function incidentPopHtml(data, state) {
  const f = incidentFacts({ incident: data.incident, period: data.currentPeriod(), units: data.activeUnits(), zones: data.zones(), hazards: data.hazards(), memberOf: (id) => data.member(id), zoneOf: (id) => data.zone(id) });
  const p = f.period, c = f.command, d = f.divisions.counts, h = f.hazards;
  const tile = (action, big, word, small, cls = '') => `<button type="button" class="ic-tile${cls ? ' ' + cls : ''}" data-action="${action}"><span class="ic-big">${big}</span><span class="ic-word">${word}</span><span class="ic-sm">${small}</span></button>`;
  const periodSmall = p ? `Period ${p.number} · ${esc(p.started)}${p.plannedTo ? ' to ' + esc(p.plannedTo) : ''}` : '';
  const periodTile = !p ? tile('period', '—', 'no period', 'set one on the Period sheet', 'quiet')
    : p.overdue ? tile('period', esc(p.overdue), 'overdue', periodSmall, 'alarm')
    : p.closed ? tile('period', 'closed', 'period ' + p.number, `${esc(p.started)} to ${esc(p.closed)}`, 'quiet')
    : tile('period', p.left ? esc(p.left) : '—', p.left ? 'left' : 'no end set', periodSmall);
  const segs = [['cleared', d.cleared, 'cleared'], ['primary', d.primary, 'primary search done'], ['active', d.active, 'in progress'], ['open', d.open, 'not started']].filter((x) => x[1]);
  const bar = segs.length ? `<span class="ic-bar">${segs.map(([k, n]) => `<i class="seg ${k}" style="flex:${n}"></i>`).join('')}</span>` : '';
  return `
    <div class="ic-head"><b>${esc(f.name)}</b>${data.kind() ? `<span class="muted">${esc(incidentKindText(data.kind()))}</span>` : ''}${f.opened ? `<span class="muted">since ${esc(f.opened)}</span>` : ''}${p && p.overdue ? `<button type="button" class="btn sm pri" data-action="period-next">Start period ${p.number + 1}</button>` : ''}</div>
    <div class="ic-tiles">
      ${periodTile}
      ${tile('people', String(f.units.n), f.units.n === 1 ? 'unit' : 'units', f.units.statusWords ? esc(f.units.statusWords) : 'none on scene', f.units.n ? '' : 'quiet')}
      ${tile('inc-divisions', String(f.divisions.n), f.divisions.n === 1 ? 'division' : 'divisions', bar + (segs.length ? segs.map(([, n, w]) => n + ' ' + w).join(' · ') : 'none drawn yet'), f.divisions.n ? '' : 'quiet')}
      ${h.length ? tile('inc-hazards', String(h.length), h.length === 1 ? 'hazard open' : 'hazards open', esc(h[0].kind) + (h[0].zone ? ' · ' + esc(h[0].zone) : '') + (h.length > 1 ? ' · and ' + (h.length - 1) + ' more' : '')) : tile('inc-hazards', '0', 'hazards', 'none open', 'quiet')}
    </div>
    <div class="ic-foot">${c ? `<button type="button" class="ic-link" data-action="org">${[c.ic ? 'IC ' + esc(c.ic) : 'No IC named', c.ops ? 'Operations ' + esc(c.ops) : '', c.safety ? 'Safety ' + esc(c.safety) : ''].filter(Boolean).join(' · ')}</button>` : ''}${f.base || f.agency ? `<span class="ic-base">${[f.base ? esc(f.base) : '', f.agency ? esc(f.agency) + ' leads' : ''].filter(Boolean).join(' · ')}</span>` : ''}</div>`;
}
