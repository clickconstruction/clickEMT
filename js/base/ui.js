// The base sidebar and log: plain HTML strings from the data, with data-action attributes that
// main.js listens for. Nothing here talks to Supabase.
import { divisionMapHtml } from './print-map.js';
import { hiddenOverlays, boundsText, availableLayers, storedLayer, googleKey } from '../shared/layers.js';
import { joinUrl, qrSvg } from '../shared/qr.js';
import { licenceExpired, licenceTail } from '../shared/licence.js';
import { hoursRows, hoursTotals, hoursCsv } from '../shared/hours.js';
import { compass, hhmm, ago, pct, unitLabel, zoneStatusText, latLngText, zoneAt, periodLabel, structureSummary, waterText, facilityKind, facilityLabel, commandText, agenciesOn, agencyLine, urgencyLabel, REQUEST_KINDS, REQUEST_STATUS, requestLine, URGENCY, qualLabel, qualsText, personOn, onSceneText, crewNames, peopleMatch, STATUS_LABEL, OOS_REASONS, STRUCTURE_STATUS, OCCUPANTS, WATER, DAMAGE, FACILITY_KINDS, QUALIFICATIONS } from '../shared/rules.js';

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
        <span class="zr-sub">${esc(zoneStatusText(z, assignedLabel(data, z)))}${z.objective_id && data.objective(z.objective_id) ? ' · objective ' + data.objective(z.objective_id).number : ''}</span>
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
  if (sel.type === 'facility') { const f = data.facility(sel.id); if (f) return facilityHtml(data, f); }
  if (sel.type === 'unit') { const m = data.member(sel.id); if (m) return unitHtml(data, m, state); }
  return homeHtml(data);
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
      <span class="ur-main"><span class="ur-name">${esc(unitLabel(m))} <span style="font-weight:400;color:var(--muted)">${esc(unitNames(data, m))}${m.crew_count != null && m.status !== 'checked_out' ? ' · ' + m.crew_count : ''}</span>${(() => { const p = data.profileOf(m.user_id); return p ? ` <span class="who${p.verified_at ? ' ok' : ''}" title="${p.verified_at ? 'Identity verified' : 'Identity not verified yet'}">${esc(p.full_name)}${p.verified_at ? ' ✓' : ''}</span>` : ''; })()}</span>
      <span class="ur-sub">${statusDetail(data, m)}${m.status_at ? ' since ' + hhmm(m.status_at) : ''}${where}</span></span>
    </button>`;
}

// The resources board: units by status, the ICS T-card rack in a list.
export function resourcesHtml(data) {
  const units = data.units();
  if (!units.length) return '<p class="muted">No units have joined yet.</p>';
  const now = Date.now();
  const groups = ['assigned', 'available', 'out_of_service', 'checked_out'];
  return `<div class="d-row"><span class="muted" style="font-size:12.5px;flex:1">${data.peopleInField()} people in the field on ${data.activeUnits().length} unit${data.activeUnits().length === 1 ? '' : 's'}</span><button class="btn sm" data-action="people" title="Everyone on scene by name, with qualifications, status and hours">People board</button></div>` +
    groups.map((s) => {
      const rows = units.filter((u) => u.status === s);
      if (!rows.length) return '';
      return `<div class="grp"><span class="badge st-${s}">${STATUS_LABEL[s]}</span><span class="muted">${rows.length}</span></div>` + rows.map((m) => unitRowHtml(data, m, now)).join('');
    }).join('');
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
    return `<div class="par-row ${cls}"><span>${esc(unitLabel(data.member(u)))}</span><span>${a ? esc(a.reply) + (a.count != null ? ' (' + a.count + ')' : '') + ' · ' + hhmm(a.acked_at) : 'waiting, sent ' + since(par.created_at)}</span></div>`;
  }).join('');
  return head + `<div class="muted" style="font-size:12.5px">Started ${hhmm(par.created_at)} to ${esc(par.to_label || 'everyone')} · ${waiting.length ? waiting.length + ' still to answer' : 'everyone answered'}</div>${rows}`;
}

function homeHtml(data) {
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
    <div class="k" style="margin-top:6px">Resources</div>
    ${resourcesHtml(data)}
    ${parHtml(data)}
    ${requestsHtml(data)}
    <div class="k" style="margin-top:6px">Message the field</div>
    ${composerHtml(data, 'all')}
    <div class="k" style="margin-top:6px">Messages</div>
    ${messagesHtml(data, null, 8)}
    ${facilitiesHtml(data)}
    ${channelsHtml(data)}
    ${agenciesHtml(data)}
    ${publicHtml(data)}
    ${imageryHtml(data)}
    <div class="k" style="margin-top:6px">Incident</div>
    <div class="kv">
      <span class="k">Period</span><span>${esc(inc.period || 'not set')}</span>
      <span class="k">Base</span><span>${esc(inc.base_name || 'not set')}</span>
      <span class="k">Opened</span><span>${esc(new Date(inc.created_at).toLocaleString())}</span>
      <span class="k">Zones</span><span>${data.zones().length} · ${data.zones().filter((z) => z.status === 'cleared').length} cleared</span>
    </div>
    <form class="inline-form" data-form="incident-edit">
      <label>Lead agency <input name="lead_agency" value="${esc(inc.lead_agency || '')}" placeholder="Cedar Fork Fire Department" maxlength="120"></label>
      <div class="row-btns"><button class="btn sm" type="submit">Save</button></div>
    </form>`;
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

// The join card: a page for the wall of the command post or a unit's dashboard.
export function joinCardSections(data) {
  const inc = data.incident, p = data.currentPeriod();
  return [
    { title: 'Check in with your phone', lines: [inc.name + (inc.base_name ? ' · base: ' + inc.base_name : ''), p ? 'Operational period ' + p.number + ', ' + hhmm(p.starts_at) + (p.ends_at ? ' to ' + hhmm(p.ends_at) : '') : ''].filter(Boolean) },
    { title: 'Join code', lines: [inc.code] },
    { title: 'How', lines: ['Scan the code, or open ' + fieldJoinUrl(inc.code).replace(/\?.*$/, '') + ' and type it.', 'Sign in with the account your agency gave you, name your unit and the people on it, then press Check in.', 'Anyone with this code can join as a unit. Keep it to the people who should.'] }
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
    ${rows.length ? rows.map((r) => `<div class="agency-row"><span>${esc(r.agency || 'No agency named')}</span><span class="muted">${r.units} unit${r.units === 1 ? '' : 's'}${r.people ? ' · ' + r.people + ' people' : ''}</span></div>`).join('') : ''}`;
}

// The Public Information Officer's set: photos Operations has cleared. Nothing is public by default.
export function publicHtml(data) {
  const pub = data.publicPhotos();
  return `
    <div class="k" style="margin-top:6px">Public information</div>
    <div class="muted" style="font-size:12.5px">${pub.length ? pub.length + ' photo' + (pub.length === 1 ? '' : 's') + ' cleared for the public. Open a photo to clear or withdraw it.' : 'No photo is cleared for the public. Open a photo to clear it for the Public Information Officer.'}</div>
    ${pub.slice(0, 6).map((p) => `<button class="plink" data-action="select-photo" data-id="${p.id}">${hhmm(p.taken_at)} · ${esc(unitLabel(data.member(p.user_id)))}${p.zone_id && data.zone(p.zone_id) ? ' · ' + esc(data.zone(p.zone_id).code) : ''}${p.note ? ' · ' + esc(p.note) : ''}</button>`).join('')}`;
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
    <div class="d-row"><span class="badge ${statusCls}">${esc(zoneStatusText(z, assignedLabel(data, z)))}</span>${z.channel ? `<span class="badge">Radio ${esc(z.channel)}</span>` : ''}${z.supervisor ? `<span class="muted" style="font-size:12px">Supervisor ${esc(z.supervisor)}</span>` : ''}</div>
    ${hazards.map((h) => `<div class="hazline">Hazard · ${esc(h.kind)}${h.note ? ' · ' + esc(h.note) : ''} · ${esc(unitLabel(data.member(h.user_id)))} at ${hhmm(h.created_at)}<button class="btn sm" data-action="resolve-hazard" data-id="${h.id}">Resolved</button></div>`).join('')}
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
    ${structs.length ? structs.slice(-8).reverse().map((s) => `<button class="plink" data-action="select-structure" data-id="${s.id}">${esc(s.label || 'Structure')} · ${STRUCTURE_STATUS[s.status] || s.status}${structureSummary(s) ? ' · ' + esc(structureSummary(s)) : ''}${s.searched_at ? ' · ' + hhmm(s.searched_at) : ''}</button>`).join('') : '<div class="muted" style="font-size:12.5px">None yet. The field adds one with every address it clears; you can place the ones you know in advance.</div>'}
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
      <span class="k">Time</span><span>${esc(new Date(p.taken_at).toLocaleString())}</span>
      <span class="k">Zone</span><span>${z ? esc(z.code + ' · ' + z.name) : 'outside any zone'}</span>
      <span class="k">Facing</span><span>${p.heading != null ? compass(p.heading) : 'unknown'}</span>
      <span class="k">Position</span><span class="mono">${esc(latLngText(p.lat, p.lng)) || 'unknown'}</span>
      <span class="k">Note</span><span>${esc(p.note) || '—'}</span>
      <span class="k">Public</span><span>${p.public_ok ? 'Cleared for public information' : 'Not public'}</span>
    </div>
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
        <div class="d-row" style="margin-top:6px"><span class="badge ${statusCls}">${esc(zoneStatusText(z, assignedLabel(data, z)))}</span>${z.hazard ? '<span class="badge haz">Hazard</span>' : ''}</div></div>
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
  const state = p.archived_at ? 'Removed ' + hhmm(p.archived_at)
    : p.checked_out_at ? 'Checked out ' + hhmm(p.checked_out_at) + ' · ' + onSceneText(p) + ' on scene'
    : (unitOut ? 'Unit checked out · ' : 'On scene ') + onSceneText(p, now) + ', since ' + hhmm(p.checked_in_at);
  const mates = compact ? [] : data.unitPeople(p.user_id).filter((x) => x.id !== p.id);
  const units = compact ? [] : data.members().filter((m) => m.status !== 'checked_out' || m.user_id === p.user_id).sort((a, b) => (a.role === 'ops') - (b.role === 'ops') || (a.unit_name || '').localeCompare(b.unit_name || ''));
  return `
    <div class="pp-row${p.checked_out_at || unitOut ? ' out' : ''}${p.archived_at ? ' gone' : ''}" data-person="${p.id}">
      <span class="pp-who"><span class="pp-name">${esc(p.name)}</span>${p.role ? `<span class="muted"> ${esc(p.role)}</span>` : ''}${p.agency && (!unit || p.agency !== unit.agency) ? `<span class="pp-agency muted">${esc(p.agency)}</span>` : ''}${p.notes ? `<span class="pp-agency muted">${esc(p.notes)}</span>` : ''}</span>
      ${qualBadges(p)}
      <span class="pp-state">${esc(state)}${buddy && compact ? `<span class="muted"> · with ${esc(buddy.name)}</span>` : ''}</span>
      <span class="pp-act">${ops && !p.archived_at ? `
        ${compact ? '' : `<select class="sel" data-select="person-unit" data-id="${p.id}" aria-label="Unit" title="Move to another unit">${units.map((u) => `<option value="${u.user_id}"${u.user_id === p.user_id ? ' selected' : ''}>${esc(unitLabel(u))}</option>`).join('')}</select>
        <select class="sel" data-select="person-buddy" data-id="${p.id}" aria-label="Buddy" title="Who this person pairs with"><option value="">No buddy</option>${mates.map((x) => `<option value="${x.id}"${p.buddy_id === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`}
        ${p.checked_out_at ? `<button class="btn sm" data-action="person-in" data-id="${p.id}">Back in</button>` : `<button class="btn sm" data-action="person-out" data-id="${p.id}">Check out</button>`}
        ${compact ? '' : `<button class="btn sm" data-action="person-remove" data-id="${p.id}" title="Takes the person off the roster; the record is kept">Remove</button>`}` : ops && p.archived_at ? `<button class="btn sm" data-action="person-restore" data-id="${p.id}">Put back</button>` : ''}</span>
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
export function peopleBoardHtml(data, state) {
  const ps = state.people || {};
  const all = data.people();
  const on = data.peopleOn();
  const ops = !!data.me() && data.me().role === 'ops';
  const unitOf = (uid) => unitLabel(data.member(uid));
  const shown = peopleMatch(all, { q: ps.q, quals: ps.quals, unitLabelOf: unitOf });
  const members = data.members().sort((a, b) => (a.role === 'ops') - (b.role === 'ops') || (a.status === 'checked_out') - (b.status === 'checked_out') || (a.unit_name || '').localeCompare(b.unit_name || ''));
  const want = [...(ps.quals || [])];
  const narrowed = want.length || (ps.q || '').trim();
  const count = narrowed ? `${shown.length} of ${all.length} ${all.length === 1 ? 'person' : 'people'}${want.length ? ' with ' + want.map(qualLabel).join(' and ') : ''}${(ps.q || '').trim() ? ' matching "' + esc(ps.q.trim()) + '"' : ''}`
    : `${on.length} on scene on ${data.activeUnits().length} unit${data.activeUnits().length === 1 ? '' : 's'}${all.length > on.length ? ' · ' + (all.length - on.length) + ' checked out' : ''}`;
  const now = Date.now();
  const addForm = ops && ps.add ? `
    <form class="inline-form pp-form" data-form="person-add">
      <div class="row-2">
        <label>Unit <select name="unit" class="sel">${members.filter((m) => m.status !== 'checked_out').map((m) => `<option value="${m.user_id}"${ps.addUnit === m.user_id ? ' selected' : ''}>${esc(unitLabel(m))}</option>`).join('')}</select></label>
        <label>Name <input name="name" required maxlength="80" placeholder="Surname, or the full name" autocomplete="off"></label>
      </div>
      <div class="row-2">
        <label>Rank or role <input name="role" maxlength="60" placeholder="Lt., Paramedic, Boat operator"></label>
        <label>Agency <input name="agency" maxlength="120" placeholder="The unit's, unless different"></label>
      </div>
      <div class="chips">${QUALIFICATIONS.map(([q, label]) => `<label class="chip" style="min-height:34px;padding:4px 10px"><input type="checkbox" name="q" value="${q}"> ${esc(label)}</label>`).join('')}</div>
      <div class="row-btns"><button class="btn sm" type="button" data-action="people-add-toggle">Cancel</button><button class="btn pri sm" type="submit">Add to the unit</button></div>
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
  return `
    <div class="pp-top">
      <span class="pp-count">${count}</span>
      ${ops && !ps.add ? '<button class="btn sm" data-action="people-add-toggle">Add a person</button>' : ''}
    </div>
    ${addForm}
    ${all.length ? (groups || '<p class="muted">Nobody matches. Clear the chips or the find box.</p>') : '<p class="muted">No people on record yet. A unit adds its people by name when it checks in on the phone, or you add them here.</p>'}
    ${noNames.length ? `<p class="muted" style="font-size:12.5px">No names on record for ${noNames.map((u) => esc(unitLabel(u)) + (u.crew ? ' (crew "' + esc(u.crew) + '"' + (u.crew_count != null ? ', ' + u.crew_count : '') + ')' : '')).join(', ')}.</p>` : ''}`;
}

// The check-in list, ICS 211: everyone who checked in, by unit, with when and for how long.
export function form211Sections(data) {
  const inc = data.incident, p = data.currentPeriod();
  const all = data.people();
  const S = [];
  S.push({ title: 'Check-in list, ICS 211', lines: [
    inc.name + (inc.base_name ? ' · base: ' + inc.base_name : ''),
    p ? 'Operational period ' + p.number + ', ' + hhmm(p.starts_at) + (p.ends_at ? ' to ' + hhmm(p.ends_at) : '') : 'No operational period set',
    commandText(inc, p) || null,
    'Prepared by Operations, ' + new Date().toLocaleString()
  ].filter(Boolean) });
  const members = data.members().sort((a, b) => (a.role === 'ops') - (b.role === 'ops') || (a.unit_name || '').localeCompare(b.unit_name || '')).filter((m) => m.role === 'unit' || data.unitPeople(m.user_id).length);
  for (const m of members) {
    const rows = data.unitPeople(m.user_id);
    const zone = data.zones().find((z) => z.assigned_to === m.user_id && z.status === 'active');
    S.push({ title: `${unitLabel(m)}${m.agency ? ' · ' + m.agency : ''} · ${STATUS_LABEL[m.status] || m.status}${zone ? ' · ' + zone.code : ''}${m.status === 'checked_out' && m.checked_out_at ? ' ' + hhmm(m.checked_out_at) : ''}`,
      lines: [(() => { const p = data.profileOf(m.user_id); return p ? `Checked in by ${p.full_name}${p.phone ? ', ' + p.phone : ''}${p.licence_number ? ', licence ' + p.licence_state + ' ' + licenceTail(p.licence_number) : ''}${p.verified_at ? ', verified' : ', not verified'}` : 'Checked in by an account with no identity given'; })(), (m.status === 'checked_out' && m.demob && Array.isArray(m.demob.open) && m.demob.open.length ? 'At check-out, not done: ' + m.demob.open.join(', ') + (m.demob.note ? ' · for the next crew: ' + m.demob.note : '') : null)].filter(Boolean).concat(rows.length ? rows.map((px) => {
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

function facilityHtml(data, f) {
  const k = facilityKind(f.kind);
  return `
    <button class="back" data-action="close-panel">Back to units</button>
    <div class="title">${esc(f.name || k[1])} <span>${esc(k[1])}${f.closed_at ? ' · closed ' + hhmm(f.closed_at) : ''}</span></div>
    ${f.notes ? `<div class="d-sub">${esc(f.notes)}</div>` : ''}
    <div class="kv">
      <span class="k">Contact</span><span>${esc(f.contact) || 'not set'}</span>
      <span class="k">Position</span><span class="mono">${esc(latLngText(f.lat, f.lng))}</span>
      <span class="k">Opened</span><span>${esc(new Date(f.created_at).toLocaleString())}</span>
    </div>
    <form class="inline-form" data-form="facility-edit" data-id="${f.id}">
      <div class="row-2">
        <label>Kind <select name="kind" class="sel">${FACILITY_KINDS.map(([v, label]) => `<option value="${v}"${v === f.kind ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select></label>
        <label>Name <input name="name" value="${esc(f.name)}" placeholder="Where it is"></label>
      </div>
      <label>Contact <input name="contact" value="${esc(f.contact)}" placeholder="A channel or a phone number"></label>
      <label>Notes <input name="notes" value="${esc(f.notes)}" placeholder="What the field should know"></label>
      <div class="row-btns">
        <button class="btn sm" type="button" data-action="pan-to" data-lat="${f.lat}" data-lng="${f.lng}">Show on map</button>
        ${f.closed_at ? `<button class="btn sm" type="button" data-action="reopen-facility" data-id="${f.id}">Reopen</button>` : `<button class="btn sm" type="button" data-action="close-facility" data-id="${f.id}">Close</button>`}
        <button class="btn pri sm" type="submit">Save</button>
      </div>
    </form>`;
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
      <p>${esc(inc.name)} · ${period ? 'Operational period ' + period.number + ', ' + hhmm(period.starts_at) + (period.closed_at ? ' to ' + hhmm(period.closed_at) : ', still open') : 'the whole incident so far'} · prepared ${new Date().toLocaleString()}</p>
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
  return `<div class="ident">
    <div class="d-row"><span class="k" style="width:auto;flex:1">Identity</span>${p.verified_at ? `<span class="badge cleared">Verified ${hhmm(p.verified_at)}</span>` : '<span class="badge haz">Not verified</span>'}</div>
    <div class="kv">
      <span class="k">Name</span><span><strong>${esc(p.full_name) || '—'}</strong></span>
      <span class="k">Phone</span><span>${p.phone ? `<a href="tel:${esc(p.phone.replace(/\s+/g, ''))}">${esc(p.phone)}</a>` : '—'}</span>
      <span class="k">Licence</span><span>${p.licence_number ? `${esc(p.licence_state)} ${esc(licenceTail(p.licence_number))}${p.licence_expires ? ' · expires ' + esc(p.licence_expires) : ''}${expired ? ' <strong style="color:var(--danger)">expired</strong>' : ''}` : 'number not read'} · ${source}</span>
      ${p.date_of_birth ? `<span class="k">Born</span><span>${esc(p.date_of_birth)}</span>` : ''}
      ${p.address ? `<span class="k">Address</span><span>${esc(p.address)}</span>` : ''}
    </div>
    ${p.photo_path ? `<div class="photo-box id-box" data-id-photo="${esc(p.photo_path)}"><img alt="The front of ${esc(p.full_name)}'s licence" hidden><div class="muted" style="padding:28px 12px;text-align:center" data-photo-wait>Loading the licence…</div></div>` : '<div class="muted" style="font-size:12.5px">No photo of the licence</div>'}
    <div class="d-row">${p.verified_at ? `<button class="btn sm" data-action="unverify-profile" data-id="${m.user_id}">Withdraw verification</button>` : `<button class="btn sm green" data-action="verify-profile" data-id="${m.user_id}" title="You have looked at the licence and it is this person">Mark verified</button>`}</div>
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
    <div class="title">${esc(unitLabel(m))} <span>${esc(m.crew || '')}</span></div>
    ${alert ? `<div class="badge" style="background:var(--danger);color:#fff">EMERGENCY · needs help${alert.acknowledged_at ? ' · acknowledged ' + hhmm(alert.acknowledged_at) : ''}</div>` : ''}
    <div class="d-row"><span class="badge st-${esc(m.status)}">${statusDetail(data, m)}</span><span class="muted" style="font-size:12px">since ${hhmm(m.status_at)}</span></div>
    ${identityHtml(data, m)}
    ${demobHtml(m)}
    ${unitRequestsHtml(data, m)}
    <div class="d-row"><span class="k">Set status</span>
      <button class="btn sm${m.status === 'available' ? ' on' : ''}" data-action="set-status" data-id="${m.user_id}" data-status="available">Available</button>
      <button class="btn sm${m.status === 'out_of_service' ? ' on' : ''}" data-action="set-status" data-id="${m.user_id}" data-status="out_of_service">Out of service</button>
      ${m.status === 'checked_out' ? `<button class="btn sm" data-action="set-status" data-id="${m.user_id}" data-status="available">Check back in</button>` : `<button class="btn sm" data-action="check-out" data-id="${m.user_id}">Check out</button>`}
      <button class="btn sm" data-action="start-par" data-target="user:${m.user_id}">PAR</button>
    </div>
    ${oos ? `<form class="inline-form" data-form="oos" data-id="${m.user_id}"><div class="chips">${OOS_REASONS.map((r, i) => `<label class="chip" style="min-height:34px;padding:4px 10px"><input type="radio" name="reason" value="${esc(r)}"${i === 0 ? ' checked' : ''}> ${esc(r)}</label>`).join('')}</div><div class="row-btns"><button class="btn sm" type="button" data-action="oos-cancel">Cancel</button><button class="btn pri sm" type="submit">Out of service</button></div></form>` : ''}
    <div class="kv">
      <span class="k">Agency</span><span>${esc(m.agency) || 'not set'}</span>
      <span class="k">Head count</span><span>${m.crew_count != null ? m.crew_count : 'not set'}</span>
      <span class="k">Assigned</span><span>${zone ? esc(zone.code + ' · ' + zone.name) : 'nothing yet'}</span>
      <span class="k">Standing in</span><span>${here ? esc(here.code) : 'no zone'}</span>
      <span class="k">Position</span><span class="mono">${pos ? esc(latLngText(pos.lat, pos.lng)) : 'none yet'}</span>
      <span class="k">Heading</span><span>${pos && pos.heading != null ? compass(pos.heading) : 'unknown'}</span>
      <span class="k">Last report</span><span>${pos ? esc(ago(pos.at)) + (pos.accuracy ? ' · ±' + Math.round(pos.accuracy) + ' m' : '') : 'never'}</span>
      <span class="k">Photos</span><span>${photos.length}</span>
      <span class="k">Joined</span><span>${esc(new Date(m.joined_at).toLocaleString())}</span>
    </div>
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

function periodFormHtml(p, next, state) {
  const d = next ? { ic: p ? p.ic_name : '', ops: p ? p.ops_chief : '', safety: p ? p.safety_officer : '', notes: '', ends: timeValue(new Date(Date.now() + 12 * 3600000).toISOString()), unified: p ? p.unified || '' : '' } : { ic: p.ic_name, ops: p.ops_chief, safety: p.safety_officer, notes: p.notes, ends: timeValue(p.ends_at), unified: p.unified || '' };
  d.planning = p ? p.planning_chief || '' : ''; d.logistics = p ? p.logistics_chief || '' : ''; d.finance = p ? p.finance_chief || '' : '';
  return `
    <form class="inline-form" data-form="${next ? 'period-start' : 'period-edit'}"${p && !next ? ` data-id="${p.id}"` : ''}>
      <div class="row-2">
        <label>Incident Commander <input name="ic" value="${esc(d.ic)}"></label>
        <label>Operations Section Chief <input name="ops" value="${esc(d.ops)}"></label>
      </div>
      <div class="row-2">
        <label>Safety Officer <input name="safety" value="${esc(d.safety)}"></label>
        <label>Planned end <input name="ends" type="time" value="${esc(d.ends)}"></label>
      </div>
      <div class="row-2">
        <label>Planning Section Chief <input name="planning" value="${esc(d.planning)}"></label>
        <label>Logistics Section Chief <input name="logistics" value="${esc(d.logistics)}"></label>
      </div>
      <div class="row-2">
        <label>Finance / Admin Section Chief <input name="finance" value="${esc(d.finance)}"></label>
        <span class="muted" style="font-size:12px;align-self:end;padding-bottom:8px">Empty seats print as "not set". The names carry into the next period.</span>
      </div>
      <label>Unified command <input name="unified" value="${esc(d.unified)}" placeholder="The other agencies' Incident Commanders, if more than one agency is in charge" maxlength="200"></label>
      <label>Safety message and notes for the period <textarea name="notes" rows="2">${esc(d.notes)}</textarea></label>
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
    ${p ? periodFormHtml(p, false, state) : '<div class="muted" style="font-size:12.5px">An incident runs in operational periods, usually 12 hours, each with its objectives and its command names.</div>'}
    ${p ? `
    <div class="k">Objectives (ICS 202)</div>
    ${objectives.length ? objectives.map((o) => `
      <div class="obj${o.done_at ? ' done' : ''}">
        <button class="obj-tick" data-action="${o.done_at ? 'objective-undo' : 'objective-done'}" data-id="${o.id}" aria-label="${o.done_at ? 'Reopen' : 'Done'}">${o.done_at ? '✓' : ''}</button>
        <span class="obj-text"><strong>${o.number}.</strong> ${esc(o.text)}${o.done_at ? ` <span class="muted">done ${hhmm(o.done_at)}</span>` : ''}${zonesFor(o).length ? ` <span class="muted">· ${zonesFor(o).map((z) => esc(z.code)).join(', ')}</span>` : ''}</span>
      </div>`).join('') : '<div class="muted" style="font-size:12.5px">None yet. What must be true by the end of the period?</div>'}
    <form class="composer" data-form="objective"><div class="composer-row"><input name="text" placeholder="Add an objective" required maxlength="300" autocomplete="off"><button class="btn pri sm" type="submit">Add</button></div></form>` : ''}
    <div class="k">Shift change</div>
    <div class="d-row"><button class="btn sm" data-action="briefing">Briefing</button>${state.periodNext ? '' : `<button class="btn sm" data-action="period-next">Start period ${(p ? p.number : 0) + 1}</button>`}</div>
    ${state.periodNext ? periodFormHtml(p, true, state) : ''}
    ${earlier.length ? `<div class="k">Earlier periods</div>${earlier.map((x) => `<div class="muted" style="font-size:12.5px">${esc(periodLabel(x))}${x.ic_name ? ' · IC ' + esc(x.ic_name) : ''}</div>`).join('')}` : ''}`;
}

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
    p ? 'Operational period ' + p.number + ', ' + hhmm(p.starts_at) + (p.ends_at ? ' to ' + hhmm(p.ends_at) : '') : 'No operational period set',
    p && (p.ic_name || p.ops_chief || p.safety_officer) ? ['Incident Commander ' + (p.ic_name || 'not set'), 'Operations ' + (p.ops_chief || 'not set'), 'Planning ' + (p.planning_chief || 'not set'), 'Logistics ' + (p.logistics_chief || 'not set'), 'Finance ' + (p.finance_chief || 'not set'), 'Safety ' + (p.safety_officer || 'not set')].join(' · ') : null,
    commandText(inc, p) || null,
    'Briefing made ' + new Date().toLocaleString()
  ].filter(Boolean) });
  if (p && p.notes) S.push({ title: 'Safety message and notes', lines: [p.notes] });
  S.push({ title: 'Objectives', lines: objectives.length ? objectives.map((o) => `${o.number}. ${o.text}${o.done_at ? ' (done ' + hhmm(o.done_at) + ')' : ' (open)'}`) : ['None set'] });
  const cleared = zones.filter((z) => z.status === 'cleared').length, primary = zones.filter((z) => z.status === 'primary').length, active = zones.filter((z) => z.status === 'active').length, open = zones.filter((z) => z.status === 'open').length;
  const structs = data.structures();
  const help = structs.reduce((n, s) => n + (s.people_needing_help || 0), 0);
  S.push({ title: 'Divisions', lines: [`${zones.length} divisions: ${cleared} cleared, ${primary} primary search done, ${active} in progress, ${open} not started`, `${structs.filter((s) => s.status === 'searched').length} of ${structs.length} structures on record searched${help ? ', ' + help + ' people needing help' : ''}`].concat(zones.map((z) => {
    const o = z.objective_id ? data.objective(z.objective_id) : null;
    return `${z.code} ${z.name ? z.name + ' ' : ''}· priority ${z.priority} · ${zoneStatusText(z, z.assigned_to ? unitLabel(data.member(z.assigned_to)) : '')}${o ? ' · objective ' + o.number : ''}`;
  })) });
  S.push({ title: 'Resources', lines: [`${data.peopleInField()} people in the field on ${data.activeUnits().length} units`].concat(agenciesOn(data.activeUnits()).map(agencyLine), units.flatMap((m) => {
    const zone = zones.find((z) => z.assigned_to === m.user_id && z.status === 'active');
    return [`${unitLabel(m)}${m.crew ? ' (' + m.crew + ')' : ''}${m.crew_count != null ? ' · ' + m.crew_count + ' people' : ''}${m.agency ? ' · ' + m.agency : ''} · ${STATUS_LABEL[m.status] || m.status}${m.status_note ? ': ' + m.status_note : ''}${zone ? ' · ' + zone.code : ''}`].concat(personLines(data, m));
  })) });
  S.push({ title: 'Hazards still open', lines: hazards.length ? hazards.map((h) => `${h.kind}${h.note ? ' (' + h.note + ')' : ''} · ${h.zone_id && data.zone(h.zone_id) ? data.zone(h.zone_id).code : 'outside the zones'} · reported ${hhmm(h.created_at)} by ${unitLabel(data.member(h.user_id))}`) : ['None'] });
  const facilities = data.facilities();
  S.push({ title: 'Facilities', lines: facilities.length ? facilities.map((f) => `${facilityLabel(f)}${f.contact ? ' · ' + f.contact : ''}${f.notes ? ' · ' + f.notes : ''}`) : ['None set'] });
  const channels = data.channels();
  S.push({ title: 'Communications (ICS 205)', lines: channels.length ? channels.map((c) => `${c.use}: ${c.channel}${c.notes ? ' · ' + c.notes : ''}`) : ['No plan set'] });
  const attention = alerts.map((a) => `EMERGENCY from ${unitLabel(data.member(a.user_id))} at ${hhmm(a.created_at)}${a.acknowledged_at ? ', acknowledged' : ', NOT acknowledged'}`)
    .concat(waiting.map((m) => `${m.kind === 'par' ? 'PAR' : 'Safety message'} from ${hhmm(m.created_at)} still waiting on ${data.waitingOn(m).map((u) => unitLabel(data.member(u))).join(', ')}`));
  S.push({ title: 'Needs attention', lines: attention.length ? attention : ['Nothing outstanding'] });
  const log = data.eventsIn(p).slice(0, 40);
  S.push({ title: p ? 'Log of this period, newest first' : 'Log, newest first', lines: log.length ? log.map((e) => `${hhmm(e.at)}  ${e.text}`) : ['Nothing yet'] });
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
    p ? 'Operational period ' + p.number + ', ' + hhmm(p.starts_at) + (p.ends_at ? ' to ' + hhmm(p.ends_at) : '') : 'No operational period set',
    'Division ' + z.code + (z.name ? ' · ' + z.name : '') + ' · priority ' + z.priority + (o ? ' · objective ' + o.number + ': ' + o.text : ''),
    'Division supervisor: ' + (z.supervisor || 'not named'),
    'Radio channel: ' + (z.channel || 'not set')
  ], figure: divisionMapHtml(data, z) });
  S.push({ title: 'Resources assigned', lines: unit ? [`${unitLabel(unit)}${unit.crew ? ' (' + unit.crew + ')' : ''}${unit.crew_count != null ? ' · ' + unit.crew_count + ' people' : ''}${unit.agency ? ' · ' + unit.agency : ''} · ${STATUS_LABEL[unit.status] || unit.status}`].concat(personLines(data, unit)) : ['None yet'] });
  S.push({ title: 'Work assignment', lines: [z.work_assignment || 'Not written yet'] });
  S.push({ title: 'Special instructions', lines: [z.instructions || 'None'].concat(p && p.notes ? ['Period safety message: ' + p.notes] : []) });
  S.push({ title: 'Known hazards', lines: hazards.length ? hazards.map((h) => `${h.kind}${h.note ? ' (' + h.note + ')' : ''} · reported ${hhmm(h.created_at)} by ${unitLabel(data.member(h.user_id))}`) : ['None reported'] });
  const plan = data.channels();
  S.push({ title: 'Communications', lines: ['Division channel: ' + (z.channel || 'not set')].concat(plan.length ? plan.map((c) => `${c.use}: ${c.channel}`) : ['No incident plan set']) });
  const places = data.facilities().filter((f) => ['staging', 'shelter', 'hospital', 'icp'].includes(f.kind));
  S.push({ title: 'Where to go', lines: places.length ? places.map((f) => `${facilityLabel(f)}${f.contact ? ' · ' + f.contact : ''}`) : ['No facilities set'] });
  S.push({ title: 'Progress', lines: [zoneStatusText(z, unit ? unitLabel(unit) : '')].concat(z.marking ? [`Marking painted: team ${z.marking.team}, out ${z.marking.out}, hazards ${z.marking.haz}, people found ${z.marking.victims}`] : []) });
  S.push({ title: 'Prepared', lines: ['By Operations, ' + new Date().toLocaleString()] });
  return S;
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
    p ? 'Operational period ' + p.number + ', ' + hhmm(p.starts_at) + (p.ends_at ? ' to ' + hhmm(p.ends_at) : '') : 'No operational period set',
    p && p.ic_name ? 'Incident Commander ' + p.ic_name : null,
    commandText(inc, p) || null,
    'Prepared by Operations, ' + new Date().toLocaleString()
  ].filter(Boolean) });
  S.push({ title: 'Situation', lines: [sr.summary || 'Not written yet'] });
  S.push({ title: 'Progress', lines: [
    `${zones.length} divisions: ${zones.filter((z) => z.status === 'cleared').length} cleared, ${zones.filter((z) => z.status === 'primary').length} primary search done, ${zones.filter((z) => z.status === 'active').length} in progress, ${zones.filter((z) => z.status === 'open').length} not started`,
    `${structs.filter((s) => s.status === 'searched').length} of ${structs.length} structures on record searched`,
    `People: ${help} needing help, ${sheltering} sheltering in place, ${refused} refused to leave`,
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
  const pub = data.publicPhotos().length;
  S.push({ title: 'Public information', lines: [pub ? `${pub} photo${pub === 1 ? '' : 's'} cleared for public release` : 'No photos cleared for public release'] });
  return S;
}

// The Incident Action Plan: the forms stitched together for the briefing and the truck.
export function iapSections(data) {
  const inc = data.incident, p = data.currentPeriod();
  const S = [];
  S.push({ title: 'Incident Action Plan', lines: [
    inc.name + (inc.base_name ? ' · base: ' + inc.base_name : ''),
    p ? 'Operational period ' + p.number + ', ' + hhmm(p.starts_at) + (p.ends_at ? ' to ' + hhmm(p.ends_at) : '') : 'No operational period set',
    'Prepared ' + new Date().toLocaleString()
  ] });
  S.push({ title: 'Objectives, ICS 202', lines: (p ? data.objectives(p.id) : []).length ? data.objectives(p.id).map((o) => `${o.number}. ${o.text}${o.done_at ? ' (done ' + hhmm(o.done_at) + ')' : ''}`) : ['None set'] });
  S.push({ title: 'Organization, ICS 203', lines: [
    'Command: ' + (commandText(inc, p) || 'lead agency not set'),
    'Incident Commander: ' + ((p && p.ic_name) || 'not set'),
    'Operations Section Chief: ' + ((p && p.ops_chief) || 'not set'),
    'Planning Section Chief: ' + ((p && p.planning_chief) || 'not set'),
    'Logistics Section Chief: ' + ((p && p.logistics_chief) || 'not set'),
    'Finance / Administration Section Chief: ' + ((p && p.finance_chief) || 'not set'),
    'Safety Officer: ' + ((p && p.safety_officer) || 'not set')
  ].concat(data.zones().filter((z) => z.supervisor).map((z) => `Division ${z.code} supervisor: ${z.supervisor}`), data.units().filter((u) => u.status !== 'checked_out').flatMap((u) => [`${unitLabel(u)}${u.crew ? ' (' + u.crew + ')' : ''}${u.crew_count != null ? ' · ' + u.crew_count + ' people' : ''}${u.agency ? ' · ' + u.agency : ''}`].concat(personLines(data, u)))) });
  for (const z of data.zones()) {
    const unit = z.assigned_to ? data.member(z.assigned_to) : null;
    const o = z.objective_id ? data.objective(z.objective_id) : null;
    S.push({ title: `Assignment, ICS 204 · Division ${z.code}${z.name ? ' · ' + z.name : ''}`, lines: [
      `Priority ${z.priority}${o ? ' · objective ' + o.number : ''} · supervisor ${z.supervisor || 'not named'} · channel ${z.channel || 'not set'}`,
      'Resources: ' + (unit ? unitLabel(unit) + (unit.crew ? ' (' + unit.crew + ')' : '') + (unit.crew_count != null ? ' · ' + unit.crew_count + ' people' : '') : 'none yet')
    ].concat(unit ? personLines(data, unit) : [], [
      'Work assignment: ' + (z.work_assignment || 'not written yet'),
      'Special instructions: ' + (z.instructions || 'none'),
      'Status: ' + zoneStatusText(z, unit ? unitLabel(unit) : '')
    ]), figure: divisionMapHtml(data, z) });
  }
  const ch = data.channels();
  S.push({ title: 'Communications, ICS 205', lines: ch.length ? ch.map((c) => `${c.use}: ${c.channel}${c.notes ? ' · ' + c.notes : ''}`) : ['No plan set'] });
  const med = data.facilities().filter((f) => f.kind === 'hospital');
  S.push({ title: 'Medical, ICS 206', lines: (med.length ? med.map((f) => `${f.name || 'Hospital'}${f.contact ? ' · ' + f.contact : ''}${f.notes ? ' · ' + f.notes : ''}`) : ['No hospital set']).concat(['Emergency traffic: ' + ((ch.find((c) => /emergency/i.test(c.use)) || {}).channel || 'not set') + '. A unit in trouble presses Need help now; Operations acknowledges.']) });
  S.push({ title: 'Safety message, ICS 208', lines: [(p && p.notes) || 'Not written yet'] });
  S.push({ title: 'Facilities', lines: data.facilities().length ? data.facilities().map((f) => `${facilityLabel(f)}${f.contact ? ' · ' + f.contact : ''}`) : ['None set'] });
  return S;
}

// A section is its title and lines; one may also carry a figure (the division's map, already
// HTML), which the page draws after the lines and the text leaves out.
// A line that starts with two spaces is drawn indented under the line before (a person under a unit).
function sectionsHtml(S) { return S.map((s) => `<section${s.figure ? ' class="has-map"' : ''}><h2>${esc(s.title)}</h2>${s.lines.map((l) => `<p${l.startsWith('  ') ? ' class="sub"' : ''}>${esc(l.trim())}</p>`).join('')}${s.figure || ''}</section>`).join(''); }
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
export const LOG_GROUPS = [['all', 'All'], ['notable', 'Notable'], ['field', 'From the field'], ['msg', 'Messages'], ['ops', 'Operations'], ['note', 'Notes']];
const GROUP_OF = { request: 'field', photo: 'field', clear: 'field', hazard: 'field', help: 'field', msg: 'msg', safety: 'msg', par: 'msg', ops: 'ops', status: 'ops', note: 'note' };
export function logGroupOf(kind) { return GROUP_OF[kind] || 'ops'; }
const inGroup = (e, g) => !g || g === 'all' || (g === 'notable' ? !!e.notable : logGroupOf(e.kind) === g);
export function logFilter(events, { group, q } = {}) {
  const needle = (q || '').trim().toLowerCase();
  return events.filter((e) => inGroup(e, group) && (!needle || String(e.text).toLowerCase().includes(needle)));
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
    default: return '';
  }
}
export function logFiltersHtml(data, state) {
  const events = data.events(), cur = (state.log && state.log.group) || 'all';
  return LOG_GROUPS.map(([g, label]) => {
    const n = events.filter((e) => inGroup(e, g)).length;
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
      p ? 'Operational period ' + p.number + ', ' + hhmm(p.starts_at) + (p.ends_at ? ' to ' + hhmm(p.ends_at) : '') : 'No operational period set',
      p && p.ic_name ? 'Incident Commander ' + p.ic_name : null,
      'Prepared by Operations, ' + new Date().toLocaleString()
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
    return `<span>EMERGENCY · ${esc(who)} needs help${zone ? ' in ' + esc(zone.code) : ''} · sent ${hhmm(a.created_at)}${a.acknowledged_at ? ' · acknowledged ' + hhmm(a.acknowledged_at) : ''}</span>` +
      (a.acknowledged_at ? '' : `<button class="btn sm" data-action="ack-alert" data-id="${a.id}">Acknowledge</button>`) +
      `<button class="btn sm" data-action="select-unit" data-id="${a.user_id}">Show unit</button>`;
  }).join('<span style="flex-basis:100%"></span>');
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
    </form>`;
}

export function messageRowHtml(data, m) {
  const me = data.user ? data.user.id : null;
  const to = m.to_users || [];
  const waiting = data.waitingOn(m);
  const acks = data.acksFor(m.id);
  const mine = me && to.includes(me) && !data.ack(m.id, me);
  const state = !to.length ? '' : waiting.length === 0
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

// The yellow bar: safety messages and PARs still waiting on someone, and anyone reporting a missing person.
export function safetyHtml(data) {
  const parts = [];
  for (const m of data.openSafety()) {
    const waiting = data.waitingOn(m).map((u) => esc(unitLabel(data.member(u)))).join(', ');
    if (m.kind === 'safety') parts.push(`<span><strong>SAFETY</strong> · ${esc(m.text)} · sent ${hhmm(m.created_at)} by ${esc(unitLabel(data.member(m.from_user)))} · waiting on ${waiting}</span>`);
    else if (m.kind === 'par') parts.push(`<span><strong>PAR</strong> · started ${hhmm(m.created_at)} to ${esc(m.to_label || 'everyone')} · ${data.acksFor(m.id).length} of ${(m.to_users || []).length} answered · waiting on ${waiting} (${esc(since(m.created_at))})</span>`);
  }
  const par = data.lastPar();
  if (par) for (const a of data.acksFor(par.id)) if (a.reply === 'Missing someone') parts.push(`<span class="missing"><strong>MISSING</strong> · ${esc(unitLabel(data.member(a.user_id)))} reports someone missing${a.count != null ? ', ' + a.count + ' accounted for' : ''} · ${hhmm(a.acked_at)}</span>`);
  return parts.join('<span style="flex-basis:100%"></span>');
}
