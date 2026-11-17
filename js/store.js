/* =====================================================================
   Store: the event log on this phone (IndexedDB, falling back to memory),
   photos/signatures as separate blobs, and the only way to change data.
   Real company data and practice data live in separate databases.
   ===================================================================== */
(function (A) {
  'use strict';
  const listeners = new Set();
  const memDb = () => ({ events: new Map(), blobs: new Map() });

  function idbOpen(name) {
    return new Promise((res, rej) => {
      if (!('indexedDB' in window)) return rej(new Error('no idb'));
      const rq = indexedDB.open(name, 1);
      rq.onupgradeneeded = () => {
        const db = rq.result;
        if (!db.objectStoreNames.contains('events')) db.createObjectStore('events', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
      };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
  }
  const tx = (db, store, mode, fn) => new Promise((res, rej) => {
    const t = db.transaction(store, mode), s = t.objectStore(store);
    let out; const r = fn(s);
    if (r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('abort'));
  });

  const Store = {
    mode: 'real', db: null, mem: null, events: [], S: A.initState(), rejected: [], lastT: '', ready: false,

    async open(mode) {
      this.mode = mode; this.ready = false;
      try { this.db = await idbOpen('aiec-os-' + mode); this.mem = null; }
      catch (e) { this.db = null; this.mem = memDb(); }
      this.events = this.db ? await tx(this.db, 'events', 'readonly', s => s.getAll()) : [...this.mem.events.values()];
      this.rebuild();
      this.ready = true;
      return this;
    },
    rebuild() {
      const r = A.replay(this.events);
      this.S = r.S; this.rejected = r.rejected;
      this.lastT = this.events.reduce((m, e) => (e.t > m ? e.t : m), '');
      this.emit();
    },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    emit() { listeners.forEach(fn => { try { fn(this.S); } catch (e) { console.error(e); } }); },

    /* make a record, check it against the one rule table, save it, then update state */
    async dispatch(type, pid, d, by) {
      const uid = by || (A.Session && A.Session.uid);
      let t = A.nowISO();
      if (t <= this.lastT) t = new Date(Date.parse(this.lastT) + 1).toISOString();
      const ev = { id: A.rnd(12), type, by: uid, t, pid: pid || '', d: d || {}, v: 1 };
      const why = A.validate(this.S, ev);
      if (why) return { ok: false, err: why };
      await this.put(ev);
      A.apply(this.S, ev);
      this.events.push(ev); this.lastT = t;
      this.emit();
      return { ok: true, ev };
    },
    async put(ev) {
      if (this.db) await tx(this.db, 'events', 'readwrite', s => s.put(ev));
      else this.mem.events.set(ev.id, ev);
    },
    /* photos and signatures: small JPEG/PNG data URLs, saved apart from the records */
    async putBlob(dataUrl) {
      const id = 'b_' + A.rnd(14);
      if (this.db) await tx(this.db, 'blobs', 'readwrite', s => s.put(dataUrl, id));
      else this.mem.blobs.set(id, dataUrl);
      blobCache.set(id, dataUrl);
      return id;
    },
    async getBlob(id) {
      if (!id) return null;
      if (blobCache.has(id)) return blobCache.get(id);
      const v = this.db ? await tx(this.db, 'blobs', 'readonly', s => s.get(id)) : this.mem.blobs.get(id);
      if (v) blobCache.set(id, v);
      return v || null;
    },
    async allBlobs() {
      if (!this.db) return Object.fromEntries(this.mem.blobs);
      const keys = await tx(this.db, 'blobs', 'readonly', s => s.getAllKeys());
      const out = {};
      for (const k of keys) out[k] = await this.getBlob(k);
      return out;
    },
    async wipe() {
      if (this.db) { await tx(this.db, 'events', 'readwrite', s => s.clear()); await tx(this.db, 'blobs', 'readwrite', s => s.clear()); }
      else this.mem = memDb();
      blobCache.clear();
      this.events = []; this.rebuild();
    },

    /* ---- sharing between phones: a data file with every record and photo ---- */
    async exportFile() {
      return { app: 'aiec-elevator-os', format: 2, mode: this.mode, made: A.nowISO(), by: A.Session && A.Session.uid, org: this.S.org && this.S.org.name, events: this.events, blobs: await this.allBlobs() };
    },
    /* every record from a file passes the same rules; records already here are skipped */
    async importFile(file) {
      if (!file || file.app !== 'aiec-elevator-os' || !Array.isArray(file.events)) return { ok: false, err: 'err_bad_file' };
      if (this.S.org && file.org && file.org !== this.S.org.name) return { ok: false, err: 'err_other_company' };
      const have = new Set(this.events.map(e => e.id));
      const fresh = file.events.filter(e => e && e.id && !have.has(e.id));
      const r = A.replay(this.events.concat(fresh));
      const bad = new Set(r.rejected.map(x => x.ev.id));
      const good = fresh.filter(e => !bad.has(e.id));
      for (const e of good) await this.put(e);
      for (const [id, v] of Object.entries(file.blobs || {})) if (typeof v === 'string' && /^data:image\//.test(v)) {
        if (this.db) await tx(this.db, 'blobs', 'readwrite', s => s.put(v, id)); else this.mem.blobs.set(id, v);
      }
      this.events = this.events.concat(good);
      this.rebuild();
      return { ok: true, added: good.length, skipped: fresh.length - good.length };
    }
  };
  const blobCache = new Map();

  /* ---- who is signed in on this phone; PIN tries; idle lock ---- */
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode: keep going */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };
  const IDLE_MS = 15 * 60e3, MAX_TRIES = 5, LOCK_MS = 60e3;
  const Session = {
    uid: '', lastActive: 0,
    key() { return 'aiec.session.' + Store.mode; },
    load() {
      const s = LS.get(this.key(), null);
      if (s && Store.S.users[s.uid] && Store.S.users[s.uid].active && Date.now() - s.at < IDLE_MS) { this.uid = s.uid; this.touch(); }
      else this.uid = '';
      return this.uid;
    },
    touch() { this.lastActive = Date.now(); if (this.uid) LS.set(this.key(), { uid: this.uid, at: this.lastActive }); },
    idle() { return !!this.uid && Date.now() - this.lastActive > IDLE_MS; },
    lockedFor(uid) { const x = LS.get('aiec.tries.' + uid, null); return x && x.until > Date.now() ? Math.ceil((x.until - Date.now()) / 1000) : 0; },
    login(uid, pin) {
      const u = Store.S.users[uid];
      if (!u || !u.active) return { ok: false, err: 'err_user' };
      const wait = this.lockedFor(uid); if (wait) return { ok: false, err: { k: 'locked', v: { n: wait } } };
      if (!A.pinOk(u, pin)) {
        const x = LS.get('aiec.tries.' + uid, { n: 0 }); x.n = (x.n || 0) + 1;
        if (x.n >= MAX_TRIES) { x.until = Date.now() + LOCK_MS; x.n = 0; }
        LS.set('aiec.tries.' + uid, x);
        return { ok: false, err: x.until > Date.now() ? { k: 'locked', v: { n: LOCK_MS / 1000 } } : { k: 'wrong_pin', v: { n: MAX_TRIES - x.n } } };
      }
      LS.del('aiec.tries.' + uid);
      this.uid = uid; this.touch();
      return { ok: true };
    },
    logout() { this.uid = ''; LS.del(this.key()); }
  };

  A.Store = Store; A.Session = Session; A.LS = LS;
})(window.AIEC);
