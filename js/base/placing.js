// Placing a picture on the map by its corners (v67). The picture lands over the view with handles on it: one at
// each corner, a round Turn handle above its top edge, and the picture itself drags to move. Arrows nudge it a
// pixel (main.js), Undo steps back one drag. main.js opens this when a file is chosen or Adjust is pressed, reads
// corners() on Save and calls end(). The handles are markers, so they follow the map's pan and zoom.
import { cornersImage, quadConvex } from '../shared/layers.js';

const TURN_PX = 34;     // the Turn handle sits this far outside the top edge
const HIST_MAX = 60;    // drags Undo can step back through

export function placePicture(lmap, { url, corners, opacity, onChange }) {
  if (!lmap.getPane('placing')) lmap.createPane('placing').style.zIndex = 260;   // over the saved imagery, under everything drawn
  const layer = new (cornersImage())(url, corners, { opacity: opacity == null ? 0.5 : Number(opacity), pane: 'placing', className: 'imagery placing' }).addTo(lmap);
  let cur = corners.map((c) => [Number(c[0]), Number(c[1])]);
  const hist = [];
  const px = (c) => c.map((p) => { const q = lmap.latLngToLayerPoint(L.latLng(p[0], p[1])); return [q.x, q.y]; });
  const ll = (pts) => pts.map((q) => { const g = lmap.layerPointToLatLng(L.point(q[0], q[1])); return [g.lat, g.lng]; });
  const hdl = (cls, i) => L.marker([0, 0], { icon: L.divIcon({ className: 'hdl ' + cls + ' ' + cls[0] + i, iconSize: cls === 'turn' ? [20, 20] : [16, 16] }), draggable: true, keyboard: false, zIndexOffset: 2000 + i, title: cls === 'turn' ? 'Drag to turn the picture' : 'Drag the corner where it belongs' });
  const handles = [0, 1, 2, 3].map((i) => hdl('corner', i));
  const turn = hdl('turn', 0);
  const centre = (p) => [p.reduce((a, q) => a + q[0], 0) / 4, p.reduce((a, q) => a + q[1], 0) / 4];
  const turnPoint = () => {
    const p = px(cur), m = [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2], c = centre(p), v = [m[0] - c[0], m[1] - c[1]], n = Math.hypot(v[0], v[1]) || 1;
    return L.point(m[0] + v[0] / n * TURN_PX, m[1] + v[1] / n * TURN_PX);
  };
  let api = null;
  const changed = () => { if (onChange) onChange(api); };
  const place = (skip) => {
    handles.forEach((m, i) => { if (!m._map) m.addTo(lmap); if (m !== skip) m.setLatLng(cur[i]); });
    if (!turn._map) turn.addTo(lmap);
    if (turn !== skip) turn.setLatLng(lmap.layerPointToLatLng(turnPoint()));
  };
  const set = (c, skip) => { cur = c.map((p) => [p[0], p[1]]); layer.setCorners(cur); place(skip); changed(); };
  const remember = () => { hist.push(cur.map((p) => [p[0], p[1]])); if (hist.length > HIST_MAX) hist.shift(); };
  // a corner goes where it is dragged, unless that folds the picture
  handles.forEach((m, i) => {
    m.on('dragstart', remember);
    m.on('drag', () => { const g = m.getLatLng(), c = cur.map((p) => [p[0], p[1]]); c[i] = [g.lat, g.lng]; if (quadConvex(px(c))) set(c, m); });
    m.on('dragend', () => { place(); changed(); });
  });
  // the Turn handle: the picture turns about its centre, shape kept
  let turning = null;
  turn.on('dragstart', () => { remember(); const p = px(cur), c = centre(p), t = turnPoint(); turning = { p, c, a0: Math.atan2(t.y - c[1], t.x - c[0]) }; });
  turn.on('drag', () => {
    const q = lmap.latLngToLayerPoint(turn.getLatLng()), { p, c, a0 } = turning, a = Math.atan2(q.y - c[1], q.x - c[0]) - a0;
    set(ll(p.map((r) => { const x = r[0] - c[0], y = r[1] - c[1]; return [c[0] + x * Math.cos(a) - y * Math.sin(a), c[1] + x * Math.sin(a) + y * Math.cos(a)]; })), turn);
  });
  turn.on('dragend', () => { place(); changed(); });
  // the picture itself: drag to move; the map does not pan or open anything under it
  const img = layer.getElement();
  L.DomEvent.disableClickPropagation(img);
  L.DomEvent.on(img, 'pointerdown', L.DomEvent.stopPropagation);
  const onDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); img.setPointerCapture(e.pointerId); remember();
    const x0 = e.clientX, y0 = e.clientY, start = px(cur);
    const move = (ev) => set(ll(start.map((q) => [q[0] + ev.clientX - x0, q[1] + ev.clientY - y0])));
    const up = () => { img.removeEventListener('pointermove', move); img.removeEventListener('pointerup', up); img.removeEventListener('pointercancel', up); place(); changed(); };
    img.addEventListener('pointermove', move); img.addEventListener('pointerup', up); img.addEventListener('pointercancel', up);
  };
  img.addEventListener('pointerdown', onDown);
  place();
  api = {
    layer,
    corners: () => cur.map((p) => [p[0], p[1]]),
    setCorners: (c) => { remember(); set(c); },
    setOpacity: (v) => layer.setOpacity(v),
    nudge: (dx, dy) => { remember(); set(ll(px(cur).map((q) => [q[0] + dx, q[1] + dy]))); },
    undo: () => { if (!hist.length) return false; set(hist.pop()); return true; },
    canUndo: () => hist.length > 0,
    end: () => { img.removeEventListener('pointerdown', onDown); for (const m of handles.concat([turn])) m.remove(); lmap.removeLayer(layer); }
  };
  return api;
}
