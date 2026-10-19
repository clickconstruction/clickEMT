// Show me around (v58, shortened and pointed in v60). The first time the base opens an incident on this device, a
// label sits over each part of the screen, numbered in the order a new Operations uses it: the part's own name and
// one short line. The part is tinted and carries the same number at its top right, so a label and its part read as a
// pair; a thin part (a header row) has its label hung right under it with a caret pointing up at it, a tall one (the
// map, the log, the side panel) has its label inside. Click a label and it goes; click through it to the part
// underneath and it goes too (the first click clears, the next one works). Clear all or Escape clears the rest; the
// gear menu's Show me around brings them back. Per device, like the theme: nothing goes to the database and the mock
// needs nothing. The alarm line is never tinted while something is open on it, and main.js clears every label the
// moment an emergency arrives. The labels are placed from the parts' rectangles on every draw, resize and scroll,
// when a part changes size between draws (a ResizeObserver, and a 500 ms tick for a hidden pane, which gets no
// frames); a part scrolled out of the side panel, or not on the panel showing, waits: its label hides until it is in
// view and the pill counts it as out of view. DOM only, no data: main.js wires it.
export const AROUND_KEY = 'ic.base.around';   // '1' once this device has been shown around

const CARD_W = 236;
const THIN = 80;   // a part shorter than this gets its label hung under it, not inside it
// each label: the part it covers (the first found is enough), where its card sits (`x`: a fraction of the part's width
// from its left; `y`: a fraction of a tall part's height; a thin part's card hangs under it), and the words: the part's
// own name, then one line of twelve words at most. `quiet`: tinted only while the alarm line is quiet.
const LABELS = [
  { key: 'head', targets: ['.top-main'], x: 0.02, title: 'The incident line', text: 'Period, units, divisions, hazards. Rest on it for the whole picture.' },
  { key: 'btns', targets: ['.top-btns'], x: 0.4, title: 'The buttons', text: 'Four groups: this period\'s sheets, the boards, the ICS forms, the day.' },
  { key: 'bars', targets: ['#bars'], x: 0.45, quiet: true, title: 'Emergency and alarms', text: 'Red: a crew in trouble. Yellow: a safety message or head count.' },
  { key: 'tools', targets: ['.tools'], x: 0.02, title: 'Draw · Boundary · Division · Layers', text: 'Start here: the boundary, then the divisions inside it.' },
  { key: 'map', targets: ['#map'], x: 0.3, y: 0.42, title: 'The map', text: 'Divisions by status, units, photos with their heading, hazards. Click anything.' },
  { key: 'legend', targets: ['.legend'], x: 0.02, title: 'Legend', text: 'The four statuses are buttons: press one to light those divisions.' },
  { key: 'zones', targets: ['.side-h', '#zones'], x: 0.05, y: 0.3, title: 'Divisions by priority', text: 'Click a row: assign, set priority, print its 204. Hover for more.' },
  { key: 'codes', targets: ['#inc-code'], x: 0, title: 'CEDAR7, the codes', text: 'Phones join with it. Click for the QR, join card, Operations code.' },
  { key: 'log', targets: ['#logbox'], x: 0.55, y: 0.15, title: 'Activity log · ICS 214', text: 'Every report as it happens. Filter, star, print. You only add notes.' },
];

let on = null;   // while showing: { labels, pending (keys still to read), root, onDone, ro, timer }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const aroundOn = () => !!on;
// has this device been shown around? With storage blocked, yes: the labels would come back on every open
export function aroundSeen() { try { return localStorage.getItem(AROUND_KEY) === '1'; } catch (e) { return true; } }
function markSeen() { try { localStorage.setItem(AROUND_KEY, '1'); } catch (e) { /* storage blocked */ } }

// Start from the top (again, from the gear). Labels whose part is not on the page at all are left out, so reading
// every label on the screen is enough to finish.
export function startAround({ onDone } = {}) {
  if (on) end();
  const labels = LABELS.filter((l) => l.targets.some((t) => document.querySelector(t)));
  if (!labels.length) return;
  const root = document.createElement('div');
  root.id = 'around'; root.className = 'around';
  root.innerHTML = labels.map((l, i) => `<button type="button" class="around-zone" data-around-key="${l.key}" aria-label="${esc(l.title)}: click to clear" hidden><span class="n">${i + 1}</span></button>`).join('')
    + labels.map((l, i) => `<button type="button" class="around-card" data-around-key="${l.key}" hidden><span class="n">${i + 1}</span><b>${esc(l.title)}</b><p>${esc(l.text)}</p></button>`).join('')
    + '<div class="around-pill" role="status" title="Click a label, or the part under it, to clear it. Escape clears them all.">Show me around · <span data-around-left></span> <button type="button" class="around-all">Clear all</button></div>';
  document.body.appendChild(root);
  on = { labels, pending: new Set(labels.map((l) => l.key)), root, onDone };
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-around-key]');
    if (b) { clearLabel(b.dataset.aroundKey); return; }
    if (e.target.closest('.around-all')) clearAround('cleared');
  });
  window.addEventListener('resize', layoutAround);
  document.addEventListener('scroll', layoutAround, true);   // the side panel's scroll does not bubble; capture sees it
  if (window.ResizeObserver) {   // a part that grows or shrinks between draws moves everything under it
    on.ro = new ResizeObserver(() => layoutAround());
    for (const sel of ['body', '.top', '.side'].concat(labels.flatMap((l) => l.targets))) { const el = document.querySelector(sel); if (el) on.ro.observe(el); }
  }
  on.timer = setInterval(layoutAround, 500);   // a hidden pane gets no frames, so observers wait with them; this does not (see queueDraw)
  layoutAround();
}

function clearLabel(key) {
  if (!on || !on.pending.has(key)) return;
  on.pending.delete(key);
  for (const el of on.root.querySelectorAll(`[data-around-key="${key}"]`)) el.hidden = true;
  if (on.pending.size === 0) finish('done'); else layoutAround();
}

// Every label at once: Clear all, Escape, or an emergency arriving (main.js). The device is marked shown around.
export function clearAround(reason) { if (on) finish(reason || 'cleared'); }

function end() {
  window.removeEventListener('resize', layoutAround);
  document.removeEventListener('scroll', layoutAround, true);
  if (on.ro) on.ro.disconnect();
  clearInterval(on.timer);
  on.root.remove();
  on = null;
}
function finish(reason) {
  const cb = on.onDone;
  markSeen();
  end();
  if (cb) cb(reason);
}

// Place every label still to read over its part as it is now: called on each draw, resize, scroll and size change.
export function layoutAround() {
  if (!on) return;
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  const side = document.querySelector('.side');
  const sideR = side ? side.getBoundingClientRect() : null;
  const quiet = document.getElementById('bars-quiet');
  const alarmOpen = !!quiet && quiet.hidden;
  const placed = [];
  let away = 0;
  for (const l of on.labels) {
    if (!on.pending.has(l.key)) continue;
    const zone = on.root.querySelector(`.around-zone[data-around-key="${l.key}"]`);
    const card = on.root.querySelector(`.around-card[data-around-key="${l.key}"]`);
    const els = l.targets.map((t) => document.querySelector(t)).filter(Boolean);
    let r = union(els.map((el) => el.getBoundingClientRect()));
    if (r && side && els.some((el) => side.contains(el))) r = clip(r, sideR);   // what the side panel has scrolled away is not on the screen
    if (r) r = clip(r, { left: 0, top: 0, right: vw, bottom: vh });
    if (!r || r.right - r.left < 24 || r.bottom - r.top < 12) { zone.hidden = true; card.hidden = true; away++; continue; }
    const tint = !(l.quiet && alarmOpen);   // the alarm line is never covered while something is open on it
    zone.hidden = !tint;
    zone.classList.toggle('tall', r.bottom - r.top >= THIN);
    if (tint) place(zone, r.left, r.top, r.right - r.left, r.bottom - r.top);
    // the card: under a thin part with a caret up at it, inside a tall one; kept on the screen and off the cards
    // placed before it (below them when there is room, else above, else beside; checked again after each move)
    const thin = r.bottom - r.top < THIN;
    card.classList.toggle('below', thin);
    card.hidden = false;
    const cw = Math.min(CARD_W, vw - 16);
    card.style.width = cw + 'px';
    const ch = card.offsetHeight || 80;
    let x = r.left + (r.right - r.left) * l.x, y = thin ? r.bottom + 7 : r.top + (r.bottom - r.top) * (l.y || 0);
    x = Math.max(8, Math.min(x, vw - cw - 8)); y = Math.max(8, Math.min(y, vh - ch - 8));
    for (let guard = 0; guard < 12; guard++) {
      const p = placed.find((q) => x < q.x + q.w && x + cw > q.x && y < q.y + q.h && y + ch > q.y);
      if (!p) break;
      if (p.y + p.h + 6 <= vh - ch - 8) y = p.y + p.h + 6;
      else if (p.y - ch - 6 >= 8) y = p.y - ch - 6;
      else x = p.x - cw - 8 >= 8 ? p.x - cw - 8 : Math.min(p.x + p.w + 8, vw - cw - 8);
    }
    place(card, x, y, cw, null);
    placed.push({ x, y, w: cw, h: ch });
  }
  const left = on.pending.size;
  on.root.querySelector('[data-around-left]').textContent = (left === 1 ? '1 left' : left + ' left') + (away ? ' · ' + away + ' out of view' : '');
}

function union(rs) { return rs.length ? { left: Math.min(...rs.map((r) => r.left)), top: Math.min(...rs.map((r) => r.top)), right: Math.max(...rs.map((r) => r.right)), bottom: Math.max(...rs.map((r) => r.bottom)) } : null; }
function clip(r, c) { const o = { left: Math.max(r.left, c.left), top: Math.max(r.top, c.top), right: Math.min(r.right, c.right), bottom: Math.min(r.bottom, c.bottom) }; return o.right > o.left && o.bottom > o.top ? o : null; }
function place(el, x, y, w, h) { el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.width = w + 'px'; if (h != null) el.style.height = h + 'px'; }
