// The one place both views talk to Supabase. Holds the open incident's rows in memory, keeps them
// fresh through Realtime, and offers the writes the views need. Views never call window.sb directly.

const LIVE_TABLES = ['ic_members', 'ic_zones', 'ic_positions', 'ic_photos', 'ic_hazards', 'ic_alerts', 'ic_events', 'ic_messages', 'ic_message_acks'];
const BUCKET = 'ic-photos';
const EVENTS_LIMIT = 400;
const MESSAGES_LIMIT = 300;

function fresh() {
  return { incident: null, members: new Map(), zones: new Map(), positions: new Map(), photos: new Map(), hazards: new Map(), alerts: new Map(), events: new Map(), messages: new Map(), message_acks: new Map() };
}

function keyOf(table, row) {
  if (table === 'ic_message_acks') return row.message_id + ':' + row.user_id;
  return (table === 'ic_positions' || table === 'ic_members') ? row.user_id : row.id;
}

function mapFor(store, table) {
  return store[table.replace('ic_', '')];
}

export class Data {
  constructor(sb) {
    this.sb = sb;
    this.user = null;
    this.store = fresh();
    this.subs = new Set();
    this.channel = null;
    this.urlCache = new Map();
    this.realtime = 'off';
  }

  on(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
  emit(what, detail) { for (const fn of this.subs) { try { fn(what, detail); } catch (e) { console.error(e); } } }

  // ---- auth
  async init() {
    const { data } = await this.sb.auth.getSession();
    this.user = data.session ? data.session.user : null;
    this.sb.auth.onAuthStateChange((_event, session) => {
      const was = this.user && this.user.id;
      this.user = session ? session.user : null;
      if ((this.user && this.user.id) !== was) this.emit('auth');
    });
    return this.user;
  }
  async signIn(email, password) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }
  async signUp(email, password) {
    const { data, error } = await this.sb.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  }
  async signOut() { this.close(); await this.sb.auth.signOut(); }

  // ---- incidents
  async myIncidents() {
    const { data, error } = await this.sb.from('ic_members').select('role, unit_name, crew, joined_at, incident:ic_incidents(*)').order('joined_at', { ascending: false });
    if (error) throw error;
    return (data || []).filter((r) => r.incident).map((r) => ({ ...r.incident, role: r.role, unit_name: r.unit_name, crew: r.crew }));
  }
  async createIncident({ name, period, base, lat, lng, zoom }) {
    const { data, error } = await this.sb.rpc('ic_create_incident', { p_name: name, p_period: period || null, p_base_name: base || null, p_lat: lat ?? null, p_lng: lng ?? null, p_zoom: zoom || 14 });
    if (error) throw error;
    return data;
  }
  async join(code, role, unitName, crew) {
    const { data, error } = await this.sb.rpc('ic_join', { p_code: code, p_role: role, p_unit_name: unitName || null, p_crew: crew || null });
    if (error) throw error;
    return data;
  }
  async closeIncident() {
    if (!this.store.incident) return;
    const { error } = await this.sb.from('ic_incidents').update({ status: 'closed' }).eq('id', this.store.incident.id);
    if (error) throw error;
  }

  // ---- open one incident: load everything, then follow changes
  async open(incidentId) {
    this.close();
    this.store = fresh();
    await this.load(incidentId);
    this.subscribe(incidentId);
    this.emit('open');
    return this.store.incident;
  }
  close() {
    if (this.channel) { this.sb.removeChannel(this.channel); this.channel = null; }
    this.realtime = 'off';
  }
  async load(id) {
    const q = (t) => this.sb.from(t).select('*').eq('incident_id', id);
    const [inc, members, zones, positions, photos, hazards, alerts, events, messages, acks] = await Promise.all([
      this.sb.from('ic_incidents').select('*').eq('id', id).single(),
      q('ic_members'),
      q('ic_zones').order('code'),
      q('ic_positions'),
      q('ic_photos').order('taken_at', { ascending: false }),
      q('ic_hazards').order('created_at', { ascending: false }),
      q('ic_alerts').order('created_at', { ascending: false }),
      q('ic_events').order('at', { ascending: false }).limit(EVENTS_LIMIT),
      q('ic_messages').order('created_at', { ascending: false }).limit(MESSAGES_LIMIT),
      q('ic_message_acks')
    ]);
    for (const r of [inc, members, zones, positions, photos, hazards, alerts, events, messages, acks]) if (r.error) throw r.error;
    this.store.incident = inc.data;
    const put = (table, rows) => { const m = mapFor(this.store, table); for (const row of rows || []) m.set(keyOf(table, row), row); };
    put('ic_members', members.data); put('ic_zones', zones.data); put('ic_positions', positions.data);
    put('ic_photos', photos.data); put('ic_hazards', hazards.data); put('ic_alerts', alerts.data); put('ic_events', events.data);
    put('ic_messages', messages.data); put('ic_message_acks', acks.data);
  }
  subscribe(id) {
    const ch = this.sb.channel('ic-' + id);
    for (const table of LIVE_TABLES) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: 'incident_id=eq.' + id }, (p) => this.apply(table, p));
    }
    ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ic_incidents', filter: 'id=eq.' + id }, (p) => {
      this.store.incident = p.new; this.emit('change', { table: 'ic_incidents', row: p.new });
    });
    ch.subscribe((status) => { this.realtime = status; this.emit('realtime', status); });
    this.channel = ch;
  }
  apply(table, payload) {
    const m = mapFor(this.store, table);
    if (!m) return;
    const type = payload.eventType || payload.type;
    if (type === 'DELETE') {
      const old = payload.old || {};
      const key = keyOf(table, old);
      if (key != null) m.delete(key);
    } else {
      const row = payload.new;
      if (!row) return;
      m.set(keyOf(table, row), row);
      if (table === 'ic_events' && m.size > EVENTS_LIMIT * 2) this.trimEvents();
    }
    this.emit('change', { table, row: payload.new || payload.old, type });
  }
  trimEvents() {
    const rows = this.events().slice(0, EVENTS_LIMIT);
    this.store.events = new Map(rows.map((r) => [r.id, r]));
  }
  // The views keep their own copy fresh after a write without waiting for the echo from Realtime.
  local(table, row) { if (row) this.apply(table, { eventType: 'UPDATE', new: row }); }

  // ---- reads (arrays, sorted the way the views show them)
  get incident() { return this.store.incident; }
  me() { return this.user ? this.store.members.get(this.user.id) || null : null; }
  member(userId) { return this.store.members.get(userId) || null; }
  members() { return [...this.store.members.values()]; }
  units() { return this.members().filter((m) => m.role === 'unit').sort((a, b) => (a.unit_name || '').localeCompare(b.unit_name || '')); }
  zones() { return [...this.store.zones.values()].sort((a, b) => a.priority - b.priority || a.code.localeCompare(b.code)); }
  zone(id) { return this.store.zones.get(id) || null; }
  zoneByCode(code) { return this.zones().find((z) => z.code === code) || null; }
  positions() { return [...this.store.positions.values()]; }
  position(userId) { return this.store.positions.get(userId) || null; }
  photos() { return [...this.store.photos.values()].sort((a, b) => (a.taken_at < b.taken_at ? 1 : -1)); }
  photo(id) { return this.store.photos.get(id) || null; }
  hazards(all) { return [...this.store.hazards.values()].filter((h) => all || !h.resolved_at).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)); }
  alerts(all) { return [...this.store.alerts.values()].filter((a) => all || !a.stood_down_at).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)); }
  events() { return [...this.store.events.values()].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : b.id - a.id)); }
  myZones() { return this.user ? this.zones().filter((z) => z.assigned_to === this.user.id) : []; }

  // ---- messages (ICS 213): who was addressed is fixed on the message; acks are one row per recipient
  messages() { return [...this.store.messages.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)); }
  message(id) { return this.store.messages.get(id) || null; }
  acksFor(messageId) { return [...this.store.message_acks.values()].filter((a) => a.message_id === messageId); }
  ack(messageId, userId) { return this.store.message_acks.get(messageId + ':' + userId) || null; }
  // recipients who have not answered yet
  waitingOn(message) { return (message.to_users || []).filter((u) => !this.ack(message.id, u)); }
  myInbox() { return this.user ? this.messages().filter((m) => (m.to_users || []).includes(this.user.id)) : []; }
  myUnanswered() { return this.myInbox().filter((m) => !this.ack(m.id, this.user.id)); }
  // safety messages and PARs still waiting on someone: the base keeps them up until everyone has answered
  openSafety() { return this.messages().filter((m) => m.kind !== 'message' && this.waitingOn(m).length > 0); }
  // who a message goes to: 'all' (every unit), 'ops' (Operations), 'zone:<id>' (the unit assigned there), 'user:<id>'
  recipientsFor(target) {
    const me = this.user ? this.user.id : null;
    const units = this.units().filter((u) => u.user_id !== me && u.status !== 'checked_out');
    if (target === 'all') return { toUsers: units.map((u) => u.user_id), toLabel: 'everyone', toZone: null };
    if (target === 'ops') return { toUsers: this.members().filter((m) => m.role === 'ops' && m.user_id !== me).map((m) => m.user_id), toLabel: 'Operations', toZone: null };
    if (target.startsWith('zone:')) {
      const z = this.zone(target.slice(5));
      const who = z && z.assigned_to ? [z.assigned_to] : [];
      return { toUsers: who, toLabel: z ? z.code : '', toZone: z ? z.id : null };
    }
    if (target.startsWith('user:')) {
      const m = this.member(target.slice(5));
      return { toUsers: m ? [m.user_id] : [], toLabel: m ? (m.role === 'ops' ? 'Operations' : (m.unit_name || 'a unit')) : '', toZone: null };
    }
    return { toUsers: [], toLabel: '', toZone: null };
  }

  // ---- writes
  async setBoundary(polygon) {
    const { data, error } = await this.sb.from('ic_incidents').update({ boundary: polygon }).eq('id', this.store.incident.id).select().single();
    if (error) throw error;
    this.store.incident = data; this.emit('change', { table: 'ic_incidents', row: data });
    return data;
  }
  async addZone({ code, name, priority, polygon, structures }) {
    const { data, error } = await this.sb.from('ic_zones').insert({ incident_id: this.store.incident.id, code, name: name || '', priority: priority || 2, polygon, structures: structures || 0 }).select().single();
    if (error) throw error;
    this.local('ic_zones', data);
    return data;
  }
  async updateZone(id, patch) {
    const { data, error } = await this.sb.from('ic_zones').update(patch).eq('id', id).select().single();
    if (error) throw error;
    this.local('ic_zones', data);
    return data;
  }
  async assignZone(id, userId) {
    const z = this.zone(id);
    const status = z && z.status === 'cleared' ? 'cleared' : (userId ? 'active' : 'open');
    return this.updateZone(id, { assigned_to: userId, status });
  }
  async upsertPosition({ lat, lng, heading, accuracy }) {
    const row = { incident_id: this.store.incident.id, user_id: this.user.id, lat, lng, heading: heading ?? null, accuracy: accuracy ?? null, at: new Date().toISOString() };
    const { error } = await this.sb.from('ic_positions').upsert(row, { onConflict: 'incident_id,user_id' });
    if (error) throw error;
    this.local('ic_positions', row);
  }
  photoPath(photoId) { return this.store.incident.id + '/' + this.user.id + '/' + photoId + '.jpg'; }
  async addPhoto(id, blob, { lat, lng, heading, note, zoneId, takenAt }) {
    const path = this.photoPath(id);
    const up = await this.sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: true });
    if (up.error) throw up.error;
    const row = { id, incident_id: this.store.incident.id, user_id: this.user.id, zone_id: zoneId || null, lat: lat ?? null, lng: lng ?? null, heading: heading ?? null, note: note || '', storage_path: path, taken_at: takenAt || new Date().toISOString() };
    const { data, error } = await this.sb.from('ic_photos').insert(row).select().single();
    if (error && error.code !== '23505') throw error;
    this.local('ic_photos', data || row);
    return data || row;
  }
  async photoUrl(path) {
    const hit = this.urlCache.get(path);
    if (hit && hit.until > Date.now()) return hit.url;
    const { data, error } = await this.sb.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error) throw error;
    this.urlCache.set(path, { url: data.signedUrl, until: Date.now() + 50 * 60 * 1000 });
    return data.signedUrl;
  }
  async addHazard(id, { kind, note, lat, lng, zoneId }) {
    const row = { id, incident_id: this.store.incident.id, user_id: this.user.id, zone_id: zoneId || null, kind, note: note || '', lat: lat ?? null, lng: lng ?? null };
    const { data, error } = await this.sb.from('ic_hazards').insert(row).select().single();
    if (error && error.code !== '23505') throw error;
    this.local('ic_hazards', data || row);
    return data || row;
  }
  async resolveHazard(id) {
    const { data, error } = await this.sb.from('ic_hazards').update({ resolved_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    this.local('ic_hazards', data);
    return data;
  }
  async raiseAlert(id, { lat, lng, zoneId }) {
    const row = { id, incident_id: this.store.incident.id, user_id: this.user.id, zone_id: zoneId || null, lat: lat ?? null, lng: lng ?? null };
    const { data, error } = await this.sb.from('ic_alerts').insert(row).select().single();
    if (error && error.code !== '23505') throw error;
    this.local('ic_alerts', data || row);
    return data || row;
  }
  async ackAlert(id) {
    const { data, error } = await this.sb.from('ic_alerts').update({ acknowledged_at: new Date().toISOString(), acknowledged_by: this.user.id }).eq('id', id).select().single();
    if (error) throw error;
    this.local('ic_alerts', data);
    return data;
  }
  async standDown(id) {
    const { data, error } = await this.sb.from('ic_alerts').update({ stood_down_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    this.local('ic_alerts', data);
    return data;
  }
  async addNote(text) {
    const { data, error } = await this.sb.from('ic_events').insert({ incident_id: this.store.incident.id, user_id: this.user.id, kind: 'note', text }).select().single();
    if (error) throw error;
    this.local('ic_events', data);
    return data;
  }
  async sendMessage(id, { toUsers, toLabel, toZone, kind, text }) {
    if (!toUsers || !toUsers.length) throw new Error('Nobody to send that to');
    const row = { id: id || (crypto.randomUUID ? crypto.randomUUID() : undefined), incident_id: this.store.incident.id, from_user: this.user.id, to_users: toUsers, to_label: toLabel || '', to_zone: toZone || null, kind: kind || 'message', text };
    const { data, error } = await this.sb.from('ic_messages').insert(row).select().single();
    if (error && error.code !== '23505') throw error;
    this.local('ic_messages', data || row);
    return data || row;
  }
  async ackMessage(messageId, reply, count) {
    const row = { message_id: messageId, incident_id: this.store.incident.id, user_id: this.user.id, reply: reply || '', count: count ?? null };
    const { data, error } = await this.sb.from('ic_message_acks').insert(row).select().single();
    if (error && error.code !== '23505') throw error;
    this.local('ic_message_acks', data || { ...row, acked_at: new Date().toISOString() });
    return data || row;
  }
  async updateMe(patch) {
    const { data, error } = await this.sb.from('ic_members').update(patch).eq('incident_id', this.store.incident.id).eq('user_id', this.user.id).select().single();
    if (error) throw error;
    this.local('ic_members', data);
    return data;
  }
}
