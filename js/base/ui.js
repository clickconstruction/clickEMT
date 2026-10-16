// The base sidebar and log: plain HTML strings from the data, with data-action attributes that
// main.js listens for. Nothing here talks to Supabase.
import { compass, hhmm, ago, pct, unitLabel, zoneStatusText, latLngText, zoneAt } from '../shared/rules.js';

export function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function assignedLabel(data, z) { return z.assigned_to ? unitLabel(data.member(z.assigned_to)) : ''; }

export function zonesHtml(data, state) {
  const sel = state.selected || {};
  const zones = data.zones();
  if (!zones.length) return '<p class="muted" style="padding:8px 14px">No zones yet. Press Draw zone and click the map to outline one.</p>';
  return zones.map((z) => `
    <button class="zr${sel.type === 'zone' && sel.id === z.id ? ' sel' : ''}" data-action="select-zone" data-id="${z.id}">
      <span class="pb p${z.priority}">${z.priority}</span>
      <span class="zr-main">
        <span class="zr-top"><span class="zr-id">${esc(z.code)}</span><span class="zr-name">${esc(z.name)}</span></span>
        <span class="zr-sub">${esc(zoneStatusText(z, assignedLabel(data, z)))}</span>
      </span>
      <span class="sdot ${z.status}"></span>
    </button>`).join('');
}

export function panelHtml(data, state) {
  const sel = state.selected || {};
  if (sel.type === 'newzone') return newZoneHtml(data, state);
  if (sel.type === 'zone') { const z = data.zone(sel.id); if (z) return zoneHtml(data, z, state); }
  if (sel.type === 'photo') { const p = data.photo(sel.id); if (p) return photoHtml(data, p); }
  if (sel.type === 'unit') { const m = data.member(sel.id); if (m) return unitHtml(data, m); }
  return homeHtml(data);
}

function homeHtml(data) {
  const inc = data.incident;
  const units = data.units();
  const alerts = data.alerts();
  const now = Date.now();
  const unitRows = units.map((m) => {
    const pos = data.position(m.user_id);
    const zone = data.zones().find((z) => z.assigned_to === m.user_id);
    const sos = alerts.some((a) => a.user_id === m.user_id);
    const where = pos ? ago(pos.at, now) + (pos.heading != null ? ', ' + compass(pos.heading) : '') : 'no position yet';
    const dot = sos ? 'sos' : (!pos || now - new Date(pos.at).getTime() > 180000 ? 'off' : '');
    return `<button class="ur" data-action="select-unit" data-id="${m.user_id}">
      <span class="udot2 ${dot}"></span>
      <span class="ur-main"><span class="ur-name">${esc(unitLabel(m))} <span style="font-weight:400;color:var(--muted)">${esc(m.crew || '')}</span></span>
      <span class="ur-sub">${zone ? 'Assigned to ' + esc(zone.code) : 'No assignment'} · ${esc(where)}</span></span>
    </button>`;
  }).join('');
  return `
    <div class="k">Join code for field phones</div>
    <div class="d-row"><span class="code-big mono">${esc(inc.code)}</span><button class="btn sm" data-action="copy-code">Copy</button></div>
    <div class="muted" style="font-size:12.5px">A unit opens the field app, signs in, and types this code with its unit name.</div>
    <div class="k" style="margin-top:6px">Units</div>
    ${unitRows || '<p class="muted">No units have joined yet.</p>'}
    <div class="k" style="margin-top:6px">Message the field</div>
    ${composerHtml(data, 'all')}
    <div class="k" style="margin-top:6px">Messages</div>
    ${messagesHtml(data, null, 8)}
    <div class="k" style="margin-top:6px">Incident</div>
    <div class="kv">
      <span class="k">Period</span><span>${esc(inc.period || 'not set')}</span>
      <span class="k">Base</span><span>${esc(inc.base_name || 'not set')}</span>
      <span class="k">Opened</span><span>${esc(new Date(inc.created_at).toLocaleString())}</span>
      <span class="k">Zones</span><span>${data.zones().length} · ${data.zones().filter((z) => z.status === 'cleared').length} cleared</span>
    </div>`;
}

function zoneHtml(data, z, state) {
  const units = data.units();
  const photos = data.photos().filter((p) => p.zone_id === z.id);
  const hazards = data.hazards().filter((h) => h.zone_id === z.id);
  const marking = z.marking || null;
  const statusCls = z.status === 'cleared' ? 'cleared' : (z.status === 'active' ? 'active' : '');
  return `
    <button class="back" data-action="close-panel">Back to units</button>
    <div class="title">${esc(z.code)} <span>${esc(z.name)}</span></div>
    <div class="d-row"><span class="badge ${statusCls}">${esc(zoneStatusText(z, assignedLabel(data, z)))}</span></div>
    ${hazards.map((h) => `<div class="hazline">Hazard · ${esc(h.kind)}${h.note ? ' · ' + esc(h.note) : ''} · ${esc(unitLabel(data.member(h.user_id)))} at ${hhmm(h.created_at)}<button class="btn sm" data-action="resolve-hazard" data-id="${h.id}">Resolved</button></div>`).join('')}
    <div class="d-row"><span class="k">Priority</span>
      ${[1, 2, 3].map((p) => `<button class="btn sm${z.priority === p ? ' on' : ''}" data-action="set-priority" data-id="${z.id}" data-p="${p}">Priority ${p}</button>`).join('')}
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
      <div class="row-btns"><button class="btn sm" type="submit">Save</button></div>
    </form>
    <div class="k">Structures searched</div>
    <div class="bar"><div class="bar-fill" style="width:${pct(z)}%"></div></div>
    <div class="muted" style="font-size:12.5px">${z.structures ? z.cleared + ' of ' + z.structures : 'No structure count yet'}</div>
    ${marking ? `<div class="k">Search marking painted</div><div class="muted" style="font-size:12.5px">Team ${esc(marking.team)} · out at ${esc(marking.out)} · hazards ${esc(marking.haz)} · people found ${esc(marking.victims)}</div>` : ''}
    <div class="d-row">
      <button class="btn sm" data-action="zoom-zone" data-id="${z.id}">Zoom to zone</button>
      ${z.status === 'cleared' ? `<button class="btn sm" data-action="reopen-zone" data-id="${z.id}">Reopen</button>` : `<button class="btn sm green" data-action="clear-zone" data-id="${z.id}">Mark cleared from base</button>`}
    </div>
    <div class="k">Photos from this zone</div>
    ${photos.length ? photos.map((p) => `<button class="plink" data-action="select-photo" data-id="${p.id}">${hhmm(p.taken_at)} · ${esc(unitLabel(data.member(p.user_id)))}${p.heading != null ? ' · facing ' + compass(p.heading) : ''}${p.note ? ' · ' + esc(p.note) : ''}</button>`).join('') : '<div class="muted" style="font-size:12.5px">None yet</div>'}
    ${z.assigned_to ? `<div class="k">Message ${esc(unitLabel(data.member(z.assigned_to)))} in ${esc(z.code)}</div>${composerHtml(data, 'zone:' + z.id)}${messagesHtml(data, (m) => m.to_zone === z.id, 4)}` : ''}`;
}

function photoHtml(data, p) {
  const z = p.zone_id ? data.zone(p.zone_id) : null;
  return `
    <button class="back" data-action="close-panel">Back to units</button>
    <div class="title">Photo <span>${esc(unitLabel(data.member(p.user_id)))} · ${hhmm(p.taken_at)}</span></div>
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
    </div>
    <div class="d-row">
      <button class="btn sm" data-action="pan-to" data-lat="${p.lat}" data-lng="${p.lng}">Show on map</button>
      <a class="btn sm" data-photo-link target="_blank" rel="noopener" hidden>Open full size</a>
    </div>`;
}

function unitHtml(data, m) {
  const pos = data.position(m.user_id);
  const zone = data.zones().find((z) => z.assigned_to === m.user_id);
  const here = pos ? zoneAt(data.zones(), pos.lat, pos.lng) : null;
  const photos = data.photos().filter((p) => p.user_id === m.user_id);
  const alert = data.alerts().find((a) => a.user_id === m.user_id);
  return `
    <button class="back" data-action="close-panel">Back to units</button>
    <div class="title">${esc(unitLabel(m))} <span>${esc(m.crew || '')}</span></div>
    ${alert ? `<div class="badge" style="background:var(--danger);color:#fff">EMERGENCY · needs help${alert.acknowledged_at ? ' · acknowledged ' + hhmm(alert.acknowledged_at) : ''}</div>` : ''}
    <div class="kv">
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
    <div class="k">Message ${esc(unitLabel(m))}</div>
    ${composerHtml(data, 'user:' + m.user_id)}
    ${messagesHtml(data, (x) => x.from_user === m.user_id || (x.to_users || []).includes(m.user_id), 6)}`;
}

function newZoneHtml(data, state) {
  const d = state.newZone || {};
  return `
    <div class="title">New zone</div>
    <form class="inline-form" data-form="new-zone">
      <div class="row-2">
        <label>Code <input name="code" value="${esc(d.code || '')}" required placeholder="A-1"></label>
        <label>Structures <input name="structures" type="number" min="0" value="0"></label>
      </div>
      <label>Name <input name="name" placeholder="What is here, e.g. Pecan Mobile Home Park"></label>
      <div class="d-row"><span class="k">Priority</span>
        ${[1, 2, 3].map((p) => `<label class="chip" style="min-height:36px;padding:6px 12px"><input type="radio" name="priority" value="${p}"${p === 2 ? ' checked' : ''}> ${p}</label>`).join('')}
      </div>
      <div class="row-btns"><button class="btn sm" type="button" data-action="newzone-discard">Discard</button><button class="btn pri sm" type="submit">Save zone</button></div>
    </form>`;
}

export function logHtml(data) {
  const events = data.events();
  if (!events.length) return '<p class="muted" style="padding:4px 12px">Nothing yet.</p>';
  return events.map((e) => `
    <div class="log-row log-${esc(e.kind)}">
      <span class="t mono">${hhmm(e.at)}</span>
      <span>${esc(e.text)}</span>
      ${e.ref_table === 'ic_photos' ? `<button class="llink" data-action="select-photo" data-id="${esc(e.ref_id)}">View photo</button>` : ''}
      ${e.ref_table === 'ic_zones' ? `<button class="llink" data-action="select-zone" data-id="${esc(e.ref_id)}">Open zone</button>` : ''}
    </div>`).join('');
}

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
      <div class="mrow-top"><span class="t mono">${hhmm(m.created_at)}</span><span class="who">${esc(unitLabel(data.member(m.from_user)))}</span><span class="muted">to ${esc(m.to_label || 'everyone')}</span>${m.kind === 'safety' ? '<span class="badge haz">Safety</span>' : ''}${m.kind === 'par' ? '<span class="badge">PAR</span>' : ''}</div>
      <div class="mrow-text">${esc(m.text)}</div>
      <div class="mrow-state">${state}${replies ? `<span class="muted">${replies}</span>` : ''}${mine ? `<button class="btn sm" data-action="ack-message" data-id="${m.id}" data-reply="Copy">Acknowledge</button>` : ''}</div>
    </div>`;
}

export function messagesHtml(data, filter, limit) {
  const rows = data.messages().filter(filter || (() => true)).slice(0, limit || 10);
  return rows.length ? rows.map((m) => messageRowHtml(data, m)).join('') : '<div class="muted" style="font-size:12.5px">No messages yet</div>';
}

// The yellow bar: safety messages still waiting on someone.
export function safetyHtml(data) {
  const open = data.openSafety().filter((m) => m.kind === 'safety');
  return open.map((m) => `<span><strong>SAFETY</strong> · ${esc(m.text)} · sent ${hhmm(m.created_at)} by ${esc(unitLabel(data.member(m.from_user)))} · waiting on ${data.waitingOn(m).map((u) => esc(unitLabel(data.member(u)))).join(', ')}</span>`).join('<span style="flex-basis:100%"></span>');
}
