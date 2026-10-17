// An outbox for the field: writes that must never be lost when there is no signal. Each entry is a
// kind, a payload and an optional blob (the photo), kept in IndexedDB until its handler succeeds.
// Entries are sent in order; the first failure stops the pass and the next pass retries it.
// Ids are made on the phone before queueing, so a retry after a half-sent write is harmless.

const DB_NAME = 'incident-map';
const STORE = 'outbox';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const out = fn(store);
    t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export class Outbox {
  constructor(handlers, onChange) {
    this.handlers = handlers;
    this.onChange = onChange || (() => {});
    this.flushing = false;
    this.lastError = null;
    window.addEventListener('online', () => this.flush());
    this.timer = setInterval(() => this.flush(), 30000);
  }
  async add(kind, payload, blob) {
    const db = await openDb();
    await tx(db, 'readwrite', (s) => s.add({ kind, payload, blob: blob || null, at: Date.now() }));
    db.close();
    await this.report();
    this.flush();
  }
  async all() {
    const db = await openDb();
    const rows = await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return rows;
  }
  async count() { return (await this.all()).length; }
  async report() { this.onChange(await this.count(), this.lastError); }
  async flush() {
    if (this.flushing || !navigator.onLine) return;
    this.flushing = true;
    try {
      const rows = await this.all();
      for (const row of rows) {
        const handler = this.handlers[row.kind];
        if (!handler) { await this.remove(row.id); continue; }
        try {
          await handler(row.payload, row.blob, row.at ? new Date(row.at).toISOString() : null);   // when it was queued: a removed phone's backlog is stamped before the removal
          await this.remove(row.id);
          this.lastError = null;
        } catch (e) {
          this.lastError = e;
          break;
        }
      }
    } finally {
      this.flushing = false;
      await this.report();
    }
  }
  async remove(id) {
    const db = await openDb();
    await tx(db, 'readwrite', (s) => s.delete(id));
    db.close();
  }
}
