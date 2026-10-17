// The one place both views talk to Supabase. Holds the open incident's rows in memory, keeps them
// fresh through Realtime, and offers the writes the views need. Views never call window.sb directly.

const LIVE_TABLES = ['ic_members', 'ic_zones', 'ic_positions', 'ic_photos', 'ic_hazards', 'ic_alerts', 'ic_events', 'ic_messages', 'ic_message_acks', 'ic_periods', 'ic_objectives', 'ic_structures', 'ic_facilities', 'ic_overlays', 'ic_people', 'ic_requests', 'ic_period_agencies', 'ic_commands'];
const BUCKET = 'ic-photos';
const OVERLAY_BUCKET = 'ic-overlays';
const ID_BUCKET = 'ic-ids';
const EVENTS_LIMIT = 400;
const MESSAGES_LIMIT = 300;

function fresh() {
  return { incident: null, members: new Map(), zones: new Map(), positions: new Map(), photos: new Map(), hazards: new Map(), alerts: new Map(), events: new Map(), messages: new Map(), message_acks: new Map(), periods: new Map(), objectives: new Map(), structures: new Map(), facilities: new Map(), overlays: new Map(), people: new Map(), profiles: new Map(), requests: new Map(), period_agencies: new Map(), commands: new Map() };
}

function keyOf(table, row) {
  if (table === 'ic_message_acks') return row.message_id + ':' + row.user_id;
  if (table === 'ic_profiles') return row.user_id;
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
    this.profile = null;   // who this account is (ic_profiles), loaded by myProfile()
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
    if (!this.user) return [];
    const { data, error } = await this.sb.from('ic_members').select('role, unit_name, crew, joined_at, incident:ic_incidents(*)').eq('user_id', this.user.id).order('joined_at', { ascending: false });
    if (error) throw error;
    return (data || []).filter((r) => r.incident).map((r) => ({ ...r.incident, role: r.role, unit_name: r.unit_name, crew: r.crew }));
  }
  async createIncident({ name, period, base, lat, lng, zoom }) {
    const { data, error } = await this.sb.rpc('ic_create_incident', { p_name: name, p_period: period || null, p_base_name: base || null, p_lat: lat ?? null, p_lng: lng ?? null, p_zoom: zoom || 14 });
    if (error) throw error;
    return data;
  }
  // people is a list of { name, role, qualifications, notes }: the unit's roster, checked in with it;
  // kind is what the unit is (UNIT_KINDS in rules.js), kept from the last check-in when not given
  async join(code, role, unitName, crew, crewCount, agency, people, kind) {
    const { data, error } = await this.sb.rpc('ic_join', { p_code: code, p_role: role, p_unit_name: unitName || null, p_crew: crew || null, p_crew_count: crewCount == null || crewCount === '' ? null : Number(crewCount), p_agency: agency || null, p_people: Array.isArray(people) ? people : null, p_kind: kind || null });
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
    const [inc, members, zones, positions, photos, hazards, alerts, events, messages, acks, periods, objectives, structures, facilities, overlays, people] = await Promise.all([
      this.sb.from('ic_incidents').select('*').eq('id', id).single(),
      q('ic_members'),
      q('ic_zones').order('code'),
      q('ic_positions'),
      q('ic_photos').order('taken_at', { ascending: false }),
      q('ic_hazards').order('created_at', { ascending: false }),
      q('ic_alerts').order('created_at', { ascending: false }),
      q('ic_events').order('at', { ascending: false }).limit(EVENTS_LIMIT),
      q('ic_messages').order('created_at', { ascending: false }).limit(MESSAGES_LIMIT),
      q('ic_message_acks'),
      q('ic_periods').order('number'),
      q('ic_objectives').order('number'),
      q('ic_structures'),
      q('ic_facilities'),
      q('ic_overlays'),
      q('ic_people').order('checked_in_at')
    ]);
    for (const r of [inc, members, zones, positions, photos, hazards, alerts, events, messages, acks, periods, objectives, structures, facilities, overlays, people]) if (r.error) throw r.error;
    this.store.incident = inc.data;
    const put = (table, rows) => { const m = mapFor(this.store, table); for (const row of rows || []) m.set(keyOf(table, row), row); };
    put('ic_members', members.data); put('ic_zones', zones.data); put('ic_positions', positions.data);
    put('ic_photos', photos.data); put('ic_hazards', hazards.data); put('ic_alerts', alerts.data); put('ic_events', events.data);
    put('ic_messages', messages.data); put('ic_message_acks', acks.data);
    put('ic_periods', periods.data); put('ic_objectives', objectives.data); put('ic_structures', structures.data); put('ic_facilities', facilities.data); put('ic_overlays', overlays.data); put('ic_people', people.data);
    try { const { data: reqs } = await q('ic_requests').order('created_at', { ascending: false }); put('ic_requests', reqs); } catch (e) { /* a client without the table */ }
    try {   // the command staff's agency representatives and who has held command (migration 0016)
      const [ag, cm] = await Promise.all([q('ic_period_agencies'), q('ic_commands').order('started_at')]);
      put('ic_period_agencies', ag.data); put('ic_commands', cm.data);
    } catch (e) { /* a client without the tables */ }
    try {   // the profiles of the incident's members: Operations sees every one, a unit its own
      const ids = (members.data || []).map((m) => m.user_id);
      const { data: profs } = ids.length ? await this.sb.from('ic_profiles').select('*').in('user_id', ids) : { data: [] };
      put('ic_profiles', profs);
    } catch (e) { /* a client without the table */ }
  }
  subscribe(id) {
    const ch = this.sb.channel('ic-' + id);
    for (const table of LIVE_TABLES) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: 'incident_id=eq.' + id }, (p) => this.apply(table, p));
    }
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'ic_profiles' }, (p) => { if (p.new && this.store.members.has(p.new.user_id)) this.apply('ic_profiles', p); });   // no incident column: RLS limits what arrives
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
      if (table === 'ic_members' && !this.store.profiles.has(row.user_id)) {   // a new member: fetch who they are, if we may see it
        this.sb.from('ic_profiles').select('*').eq('user_id', row.user_id).maybeSingle().then(({ data: p }) => { if (p && !this.store.profiles.has(p.user_id)) this.apply('ic_profiles', { eventType: 'INSERT', new: p }); }).catch(() => {});
      }
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
  // units still on the incident: everyone but the checked out
  activeUnits() { return this.units().filter((u) => u.status !== 'checked_out'); }
  // people in the field: the head counts of units that are assigned or available
  peopleInField() { return this.activeUnits().filter((u) => u.status !== 'out_of_service').reduce((n, u) => n + (u.crew_count || 0), 0); }
  // the PAR still waiting on someone, newest first
  openPars() { return this.messages().filter((m) => m.kind === 'par' && this.waitingOn(m).length > 0); }
  lastPar() { return this.messages().find((m) => m.kind === 'par') || null; }
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

  // ---- structures: one record per address the field touches
  structures(zoneId) { return [...this.store.structures.values()].filter((s) => !zoneId || s.zone_id === zoneId).sort((a, b) => (a.created_at < b.created_at ? -1 : 1)); }
  structure(id) { return this.store.structures.get(id) || null; }
  async addStructure(id, fields) {
    const row = Object.assign({ id, incident_id: this.store.incident.id, created_by: this.user.id }, fields);
    if (row.status === 'searched') { row.searched_by = row.searched_by || this.user.id; row.searched_at = row.searched_at || new Date().toISOString(); }
    const { data, error } = await this.sb.from('ic_structures').insert(row).select().single();
    if (error && error.code !== '23505') throw error;
    this.local('ic_structures', data || row);
    return data || row;
  }
  async updateStructure(id, patch) {
    const { data, error } = await this.sb.from('ic_structures').update(patch).eq('id', id).select().single();
    if (error) throw error;
    this.local('ic_structures', data);
    return data;
  }
  // the search pass the field has finished: primary leaves the zone 'primary', secondary makes it 'cleared'
  async finishPass(zoneId, pass, { marking, hazard } = {}) {
    const z = this.zone(zoneId);
    const patch = { status: pass === 'secondary' ? 'cleared' : 'primary', marking: marking || null, hazard: !!(z && z.hazard) || !!hazard };
    if (z && this.structures(zoneId).length === 0) patch.cleared = Math.max(z.structures, z.cleared);
    return this.updateZone(zoneId, patch);
  }

  // ---- people: a record per responder, riding with a unit. Checked-out people stay on the roster;
  // archived ones are gone from every list but the history (all = true).
  people(all) { return [...this.store.people.values()].filter((p) => all || !p.archived_at).sort((a, b) => (a.checked_in_at < b.checked_in_at ? -1 : a.checked_in_at > b.checked_in_at ? 1 : a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.name.localeCompare(b.name))); }
  person(id) { return this.store.people.get(id) || null; }
  unitPeople(userId, all) { return this.people(all).filter((p) => p.user_id === userId); }
  // the people on scene: checked in, on a unit that has not checked out
  peopleOn() { const out = new Set(this.units().filter((u) => u.status !== 'checked_out').map((u) => u.user_id)); return this.people().filter((p) => !p.checked_out_at && out.has(p.user_id)); }
  async addPerson(id, { userId, name, role, agency, qualifications, buddyId, notes }) {
    const row = { id, incident_id: this.store.incident.id, user_id: userId || this.user.id, name: (name || '').trim(), role: role || '', agency: agency || '', qualifications: qualifications || [], buddy_id: buddyId || null, notes: notes || '' };
    const { data, error } = await this.sb.from('ic_people').insert(row).select().single();
    if (error && error.code !== '23505') throw error;
    this.local('ic_people', data || Object.assign({ checked_in_at: new Date().toISOString(), checked_out_at: null, archived_at: null }, row));
    return data || row;
  }
  async updatePerson(id, patch) {
    const { data, error } = await this.sb.from('ic_people').update(patch).eq('id', id).select().single();
    if (error) throw error;
    this.local('ic_people', data);
    return data;
  }
  async checkOutPerson(id) { return this.updatePerson(id, { checked_out_at: new Date().toISOString() }); }
  async checkInPerson(id) { return this.updatePerson(id, { checked_out_at: null }); }
  async archivePerson(id) { return this.updatePerson(id, { archived_at: new Date().toISOString() }); }

  // ---- facilities (ICS 205 and 206, light) and the communications plan
  facilities(all) { return [...this.store.facilities.values()].filter((f) => all || !f.closed_at).sort((a, b) => (a.created_at < b.created_at ? -1 : 1)); }
  facility(id) { return this.store.facilities.get(id) || null; }
  channels() { const inc = this.store.incident; return Array.isArray(inc && inc.channels) ? inc.channels : []; }
  async addFacility({ kind, name, lat, lng, notes, contact }) {
    const { data, error } = await this.sb.from('ic_facilities').insert({ incident_id: this.store.incident.id, kind, name: name || '', lat, lng, notes: notes || '', contact: contact || '', created_by: this.user.id }).select().single();
    if (error) throw error;
    this.local('ic_facilities', data);
    return data;
  }
  async updateFacility(id, patch) {
    const { data, error } = await this.sb.from('ic_facilities').update(patch).eq('id', id).select().single();
    if (error) throw error;
    this.local('ic_facilities', data);
    return data;
  }
  async setChannels(channels) { return this.updateIncident({ channels }); }
  // the agency in charge (ICS 203); a period names the others under unified command
  async setLeadAgency(leadAgency) { return this.updateIncident({ lead_agency: (leadAgency || '').trim() }); }
  async updateIncident(patch) {
    const { data, error } = await this.sb.from('ic_incidents').update(patch).eq('id', this.store.incident.id).select().single();
    if (error) throw error;
    this.store.incident = data; this.emit('change', { table: 'ic_incidents', row: data });
    return data;
  }

  // ---- who an account is (ic_profiles): name, phone and licence, once per account
  profileOf(userId) { return this.store.profiles.get(userId) || (this.profile && this.profile.user_id === userId ? this.profile : null); }
  async myProfile() {
    if (!this.user) return null;
    const { data, error } = await this.sb.from('ic_profiles').select('*').eq('user_id', this.user.id).maybeSingle();
    if (error) throw error;
    this.profile = data || null;
    return this.profile;
  }
  profileComplete(p) { const x = p || this.profile; return !!(x && x.full_name && x.phone && (x.photo_path || x.licence_number)); }
  async saveProfile(fields) {
    const row = Object.assign({ user_id: this.user.id }, fields);
    const { data, error } = await this.sb.from('ic_profiles').upsert(row, { onConflict: 'user_id' }).select().single();
    if (error) throw error;
    this.profile = data;
    if (this.store.incident) this.local('ic_profiles', data);
    return data;
  }
  idPhotoPath() { return this.user.id + '/licence.jpg'; }
  async uploadIdPhoto(blob) {
    const path = this.idPhotoPath();
    const up = await this.sb.storage.from(ID_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: true });
    if (up.error) throw up.error;
    this.urlCache.delete(ID_BUCKET + '/' + path);
    return path;
  }
  async idPhotoUrl(path) { return this.signedUrl(ID_BUCKET, path); }
  // Operations looks at the licence and says so; withdrawing it is the same call with false
  async verifyProfile(userId, ok) {
    const { data, error } = await this.sb.rpc('ic_verify_profile', { p_incident: this.store.incident.id, p_user: userId, p_ok: !!ok });
    if (error) throw error;
    this.local('ic_profiles', data);
    return data;
  }

  // ---- resource requests (ICS 213RR): the field or the base asks, Operations works it to filled or declined
  requests(all) { return [...this.store.requests.values()].filter((r) => all || !r.archived_at).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)); }
  request(id) { return this.store.requests.get(id) || null; }
  openRequests() { return this.requests().filter((r) => r.status === 'asked' || r.status === 'approved' || r.status === 'ordered'); }
  myRequests() { return this.user ? this.requests().filter((r) => r.user_id === this.user.id) : []; }
  async addRequest({ id, kind, what, quantity, urgency, note, zoneId, lat, lng }) {
    const row = { id: id || crypto.randomUUID(), incident_id: this.store.incident.id, user_id: this.user.id, zone_id: zoneId || null, kind: kind || 'other', what: (what || '').trim(), quantity: Math.max(1, Number(quantity) || 1), urgency: urgency || '', note: (note || '').trim(), lat: lat ?? null, lng: lng ?? null };
    const { data, error } = await this.sb.from('ic_requests').insert(row).select().single();
    if (error && error.code !== '23505') throw error;
    this.local('ic_requests', data || row);
    return data || row;
  }
  async updateRequest(id, patch) {
    const { data, error } = await this.sb.from('ic_requests').update(patch).eq('id', id).select().single();
    if (error) throw error;
    this.local('ic_requests', data);
    return data;
  }
  async answerRequest(id, status, answer) { return this.updateRequest(id, { status, answer: (answer || '').trim() }); }
  async withdrawRequest(id) { return this.updateRequest(id, { archived_at: new Date().toISOString() }); }

  // ---- checking out with the list of what was done and what was not (ic_members.demob)
  async checkOut(demob) {
    const { data, error } = await this.sb.rpc('ic_check_out', { p_incident: this.store.incident.id, p_demob: demob || null });
    if (error) throw error;
    this.local('ic_members', data);
    return data;
  }

  // ---- custom imagery (ic_overlays): a picture over the map by its corner coordinates, ops only
  overlays(all) { return [...this.store.overlays.values()].filter((o) => all || !o.archived_at).sort((a, b) => (a.created_at < b.created_at ? -1 : 1)); }
  overlay(id) { return this.store.overlays.get(id) || null; }
  async addOverlay(file, { name, bounds, opacity, takenAt }) {
    const id = crypto.randomUUID();
    const ext = (/\.(png|jpe?g|webp|gif)$/i.exec(file.name || '') || ['', 'png'])[1].toLowerCase().replace('jpeg', 'jpg');
    const path = this.store.incident.id + '/' + id + '.' + ext;
    const up = await this.sb.storage.from(OVERLAY_BUCKET).upload(path, file, { contentType: file.type || 'image/png', upsert: false });
    if (up.error) throw up.error;
    const row = { id, incident_id: this.store.incident.id, name: name || '', storage_path: path, bounds, opacity: opacity == null ? 0.8 : Number(opacity), taken_at: takenAt || null, created_by: this.user.id };
    const { data, error } = await this.sb.from('ic_overlays').insert(row).select().single();
    if (error) throw error;
    this.local('ic_overlays', data);
    return data;
  }
  async updateOverlay(id, patch) {
    const { data, error } = await this.sb.from('ic_overlays').update(patch).eq('id', id).select().single();
    if (error) throw error;
    this.local('ic_overlays', data);
    return data;
  }
  async archiveOverlay(id) { return this.updateOverlay(id, { archived_at: new Date().toISOString() }); }
  async overlayUrl(path) { return this.signedUrl(OVERLAY_BUCKET, path); }

  // ---- operational periods and objectives (ICS 202)
  periods() { return [...this.store.periods.values()].sort((a, b) => a.number - b.number); }
  period(id) { return this.store.periods.get(id) || null; }
  currentPeriod() {
    const inc = this.store.incident;
    const cur = inc && inc.current_period_id ? this.period(inc.current_period_id) : null;
    return cur || this.periods().filter((p) => !p.closed_at).slice(-1)[0] || null;
  }
  objectives(periodId) {
    const pid = periodId || (this.currentPeriod() && this.currentPeriod().id);
    return [...this.store.objectives.values()].filter((o) => o.period_id === pid).sort((a, b) => a.number - b.number);
  }
  objective(id) { return this.store.objectives.get(id) || null; }
  // the events that fall inside a period
  eventsIn(period) {
    if (!period) return this.events();
    const from = period.starts_at, to = period.closed_at || null;
    return this.events().filter((e) => e.at >= from && (!to || e.at <= to));
  }
  async startPeriod({ endsAt, ic, ops, safety, notes, carry, planning, logistics, finance, unified, pio, liaison }) {
    const { data, error } = await this.sb.rpc('ic_start_period', { p_incident: this.store.incident.id, p_ends_at: endsAt || null, p_ic: ic || '', p_ops: ops || '', p_safety: safety || '', p_notes: notes || '', p_carry: carry !== false, p_planning: planning || '', p_logistics: logistics || '', p_finance: finance || '', p_unified: unified || '', p_pio: pio || '', p_liaison: liaison || '' });
    if (error) throw error;
    this.local('ic_periods', data);
    return data;
  }
  async updatePeriod(id, patch) {
    const { data, error } = await this.sb.from('ic_periods').update(patch).eq('id', id).select().single();
    if (error) throw error;
    this.local('ic_periods', data);
    return data;
  }
  // ---- the command staff's agency representatives (ic_period_agencies): one per agency per period, for the Liaison Officer
  periodAgencies(periodId) {
    const pid = periodId || (this.currentPeriod() && this.currentPeriod().id);
    return [...this.store.period_agencies.values()].filter((a) => a.period_id === pid && !a.archived_at).sort((a, b) => a.agency.localeCompare(b.agency));
  }
  async savePeriodAgency({ periodId, agency, name, phone }) {
    const pid = periodId || this.currentPeriod().id;
    const existing = this.periodAgencies(pid).find((a) => a.agency === agency);
    const row = { incident_id: this.store.incident.id, period_id: pid, agency, name: (name || '').trim(), phone: (phone || '').trim() };
    const { data, error } = existing
      ? await this.sb.from('ic_period_agencies').update({ name: row.name, phone: row.phone }).eq('id', existing.id).select().single()
      : await this.sb.from('ic_period_agencies').insert(row).select().single();
    if (error) throw error;
    this.local('ic_period_agencies', data);
    return data;
  }

  // ---- who holds command (ic_commands): the open row is the Incident Commander now; a transfer
  // closes it, opens the next, writes the notable line and tells every unit (ic_transfer_command)
  commands() { return [...this.store.commands.values()].sort((a, b) => (a.started_at < b.started_at ? -1 : 1)); }
  currentCommand() { return this.commands().filter((c) => !c.ended_at).slice(-1)[0] || null; }
  // ops is the Operations Section Chief under the incoming IC (the form's value); left out, the period's stays
  async transferCommand(to, { notify = true, at = '', ops = null } = {}) {
    const { data, error } = await this.sb.rpc('ic_transfer_command', { p_incident: this.store.incident.id, p_to: to, p_notify: notify !== false, p_at: at || '', p_ops: ops == null ? null : String(ops) });
    if (error) throw error;
    this.local('ic_commands', data);
    const p = this.currentPeriod();
    if (p) this.local('ic_periods', Object.assign({}, p, { ic_name: data.ic_name, ops_chief: data.ops_chief }));
    return data;
  }

  async addObjective(text) {
    const p = this.currentPeriod();
    if (!p) throw new Error('Start an operational period first');
    const number = this.objectives(p.id).reduce((n, o) => Math.max(n, o.number), 0) + 1;
    const { data, error } = await this.sb.from('ic_objectives').insert({ incident_id: this.store.incident.id, period_id: p.id, number, text }).select().single();
    if (error) throw error;
    this.local('ic_objectives', data);
    return data;
  }
  async updateObjective(id, patch) {
    const { data, error } = await this.sb.from('ic_objectives').update(patch).eq('id', id).select().single();
    if (error) throw error;
    this.local('ic_objectives', data);
    return data;
  }

  // ---- replay: the position history (ic_tracks) between two moments, one sample per unit per
  // `every` seconds, in one read. Not kept in the store: the base asks when the slider opens.
  async replay(fromIso, toIso, every = 60) {
    const { data, error } = await this.sb.rpc('ic_replay', { p_incident: this.store.incident.id, p_from: fromIso, p_to: toIso, p_every: every });
    if (error) throw error;
    return data || [];
  }

  // ---- messages (ICS 213): who was addressed is fixed on the message; acks are one row per recipient
  messages() { return [...this.store.messages.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)); }
  message(id) { return this.store.messages.get(id) || null; }
  acksFor(messageId) { return [...this.store.message_acks.values()].filter((a) => a.message_id === messageId); }
  ack(messageId, userId) { return this.store.message_acks.get(messageId + ':' + userId) || null; }
  // recipients who have not answered yet
  waitingOn(message) { return (message.to_users || []).filter((u) => !this.ack(message.id, u)); }
  myInbox() { return this.user ? this.messages().filter((m) => (m.to_users || []).includes(this.user.id)) : []; }
  myUnanswered() { return this.myInbox().filter((m) => !this.ack(m.id, this.user.id)); }
  // messages that carry a spot and still matter: waiting on someone, or sent in the last two hours
  placedMessages() {
    const since = Date.now() - 2 * 3600000;
    return this.messages().filter((m) => m.lat != null && m.lng != null && (this.waitingOn(m).length > 0 || new Date(m.created_at).getTime() > since));
  }
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
  async setBoundary(polygon) { return this.updateIncident({ boundary: polygon }); }
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
  // the photos Operations has cleared for public information (the PIO's set), newest first
  publicPhotos() { return this.photos().filter((p) => p.public_ok); }
  async setPhotoPublic(id, ok) {
    const { data, error } = await this.sb.from('ic_photos').update({ public_ok: !!ok }).eq('id', id).select().single();
    if (error) throw error;
    this.local('ic_photos', data);
    return data;
  }
  async photoUrl(path) { return this.signedUrl(BUCKET, path); }
  async signedUrl(bucket, path) {
    const key = bucket + '/' + path;
    const hit = this.urlCache.get(key);
    if (hit && hit.until > Date.now()) return hit.url;
    const { data, error } = await this.sb.storage.from(bucket).createSignedUrl(path, 3600);
    if (error) throw error;
    this.urlCache.set(key, { url: data.signedUrl, until: Date.now() + 50 * 60 * 1000 });
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
  // Operations marks a log line as notable (it leads the printed 214); the only change a line ever takes
  async setNotable(id, on) {
    const { data, error } = await this.sb.from('ic_events').update({ notable: !!on }).eq('id', id).select().single();
    if (error) throw error;
    this.local('ic_events', data);
    return data;
  }
  // urgency is one of URGENCY in rules.js or ''; lat/lng is the spot the message is about, when attached
  async sendMessage(id, { toUsers, toLabel, toZone, kind, text, urgency, lat, lng }) {
    if (!toUsers || !toUsers.length) throw new Error('Nobody to send that to');
    const row = { id: id || (crypto.randomUUID ? crypto.randomUUID() : undefined), incident_id: this.store.incident.id, from_user: this.user.id, to_users: toUsers, to_label: toLabel || '', to_zone: toZone || null, kind: kind || 'message', text, urgency: urgency || '', lat: lat ?? null, lng: lng ?? null };
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
  async updateMe(patch) { return this.updateMember(this.user.id, patch); }
  async updateMember(userId, patch) {
    const { data, error } = await this.sb.from('ic_members').update(patch).eq('incident_id', this.store.incident.id).eq('user_id', userId).select().single();
    if (error) throw error;
    this.local('ic_members', data);
    return data;
  }
  // resource status, as ICS names it: assigned, available, out_of_service (with a reason), checked_out
  async setStatus(userId, status, note) { return this.updateMember(userId, { status, status_note: note || '' }); }
  // what a unit is: one of UNIT_KINDS in rules.js, or '' for not said
  async setKind(userId, kind) { return this.updateMember(userId, { kind: kind || '' }); }
  // the PAR: a message of kind 'par'; each unit answers with a head count, or that someone is missing
  async startPar(target, text) {
    const r = this.recipientsFor(target || 'all');
    return this.sendMessage(null, { toUsers: r.toUsers, toLabel: r.toLabel, toZone: r.toZone, kind: 'par', text: text || 'PAR: is everyone accounted for?' });
  }
  async answerPar(messageId, allAccounted, count) { return this.ackMessage(messageId, allAccounted ? 'All accounted for' : 'Missing someone', count); }
}
