// Show me around (v58). The first time the base opens an incident on this device, a label sits over each part of
// the screen, numbered in the order a new Operations uses it: what it is called, what it is for, what to do there
// first. Click a label and it goes; click through it to the part underneath and it goes too (the first click
// clears, the next one works). Clear all or Escape clears the rest; Settings → Show me around brings them back.
// Per device, like the theme: nothing goes to the database and the mock needs nothing. The alarm line is never
// tinted while something is open on it, and main.js clears every label the moment an emergency arrives.
// The labels are placed from the parts' rectangles on every draw, resize and scroll, and whenever a part changes
// size without a draw (the header losing a row as "connecting" becomes "live", a font arriving); a part scrolled
// out of the side panel, or not on the panel showing, waits: its label hides until it is in view and the pill counts it as
// out of view. DOM only, no data: main.js wires it (the first open, the Settings button, Escape, the emergency).
export const AROUND_KEY = 'ic.base.around';   // '1' once this device has been shown around

const CARD_W = 272;
// each label: the parts it covers (the first found is enough), where its card sits in the part (fractions of the
// part's width and height; past 1 is below it), and the words. `quiet`: tinted only while the alarm line is quiet.
const LABELS = [
  { key: 'head', targets: ['.top-main'], at: [0.14, 0], title: 'The incident in one line', text: 'Command, the operational period, the units in, how far the search has got, what is open. Read it first whenever you come back. Find a person looks up a responder, a family or a band.' },
  { key: 'btns', targets: ['.top-btns'], at: [0.5, 0], title: 'The sheets, the boards and the forms', text: 'Period and Briefing are this period\'s sheet and the shift briefing. People, Transports and Public are boards. Org chart, Sitrep and IAP are the ICS forms, filled in from the map. Replay plays the day back. At the row\'s end: the join code, whether the base is live, and the clock, which a click swaps to UTC.' },
  { key: 'bars', targets: ['#bars'], at: [0, 1.1], quiet: true, title: 'The alarm line', text: 'Red when a crew presses Need help now, yellow for a safety message or a head count still waiting on an answer. Quiet is good. Click the page once so the base can ring.' },
  { key: 'tools', targets: ['.tools'], at: [0.35, 1.1], title: 'Start here', text: 'Draw the incident boundary, then the divisions inside it: click points on the map, Finish closes the shape. Layers swaps the map underneath and shows imagery.' },
  { key: 'map', targets: ['#map'], at: [0.3, 0.42], title: 'The map is the truth', text: 'Divisions coloured by status, units where their phones say they are, photo pins facing the way the camera did, hazards as triangles, facilities as letters. Click anything to open it; right-click a division for its card.' },
  { key: 'legend', targets: ['.legend'], at: [0.1, 0], title: 'What the marks mean', text: 'The four status entries are buttons: press one to light the divisions in that status and dim the rest.' },
  { key: 'zones', targets: ['.side-h', '#zones'], at: [0.05, 0.3], title: 'Divisions, most urgent first', text: 'Priority, who is on it, structures searched of how many. Click a row to assign a unit, set its priority or write its assignment; its 204 prints from there.' },
  { key: 'join', targets: ['[data-around="join"]'], at: [0.05, 0.02], title: 'How phones get in', text: 'A unit scans this code or types it in the field app with its unit name. Print a join card for staging. Invited members only turns the code off for strangers; Print bands makes the wristbands.' },
  { key: 'ops', targets: ['[data-around="ops"]'], at: [0.05, 0.1], title: 'The other code', text: 'Whoever joins with this one is Operations too: a relief chief, a second screen. Give it by radio or phone, never on paper.' },
  { key: 'log', targets: ['#logbox'], at: [0.55, 0.15], title: 'The 214 writes itself', text: 'Every report, assignment, message and head count as it happens, with who and when. Filter by where a line came from, star what is notable, Print 214 at the period\'s end. You only add notes.' },
];

let on = null;   // while showing: { labels, pending (keys still to read), root, onDone }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const aroundOn = () => !!on;
// has this device been shown around? With storage blocked, yes: the labels would come back on every open
export function aroundSeen() { try { return localStorage.getItem(AROUND_KEY) === '1'; } catch (e) { return true; } }
function markSeen() { try { localStorage.setItem(AROUND_KEY, '1'); } catch (e) { /* storage blocked */ } }

// Start from the top (again, from Settings). Labels whose part is not on the page at all (the Operations code for a
// unit's screen) are left out, so reading every label on the screen is enough to finish.
export function startAround({ onDone } = {}) {
  if (on) end();
  const labels = LABELS.filter((l) => l.targets.some((t) => document.querySelector(t)));
  if (!labels.length) return;
  const root = document.createElement('div');
  root.id = 'around'; root.className = 'around';
  root.innerHTML = labels.map((l) => `<button type="button" class="around-zone" data-around-key="${l.key}" aria-label="${esc(l.title)}: click to clear" hidden></button>`).join('')
    + labels.map((l, i) => `<button type="button" class="around-card" data-around-key="${l.key}" hidden><span class="n">${i + 1}</span><b>${esc(l.title)}</b><p>${esc(l.text)}</p><small>Click to clear</small></button>`).join('')
    + '<div class="around-pill" role="status">Showing you around · <span data-around-left></span> <button type="button" class="around-all">Clear all</button><span class="esc">Esc</span></div>';
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

// Place every label still to read over its part as it is now: called on each draw, resize and scroll.
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
    if (tint) place(zone, r.left, r.top, r.right - r.left, r.bottom - r.top);
    // the card: at its place in the part, kept on the screen, and moved off any card placed before it
    card.hidden = false;
    const cw = Math.min(CARD_W, vw - 16);
    card.style.width = cw + 'px';
    const ch = card.offsetHeight || 140;
    let x = r.left + (r.right - r.left) * l.at[0], y = r.top + (r.bottom - r.top) * l.at[1];
    x = Math.max(8, Math.min(x, vw - cw - 8)); y = Math.max(8, Math.min(y, vh - ch - 8));
    // off any card placed before it: below it when there is room, else above, else beside it; checked again after each move
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
  on.root.querySelector('[data-around-left]').textContent = (left === 1 ? '1 to read' : left + ' to read') + (away ? ' · ' + away + ' out of view' : '');
}

function union(rs) { return rs.length ? { left: Math.min(...rs.map((r) => r.left)), top: Math.min(...rs.map((r) => r.top)), right: Math.max(...rs.map((r) => r.right)), bottom: Math.max(...rs.map((r) => r.bottom)) } : null; }
function clip(r, c) { const o = { left: Math.max(r.left, c.left), top: Math.max(r.top, c.top), right: Math.min(r.right, c.right), bottom: Math.min(r.bottom, c.bottom) }; return o.right > o.left && o.bottom > o.top ? o : null; }
function place(el, x, y, w, h) { el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.width = w + 'px'; if (h != null) el.style.height = h + 'px'; }
