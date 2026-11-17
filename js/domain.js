/* =====================================================================
   AIEC Elevator OS — domain core
   Pure functions only (no DOM). Loaded by the browser and by node tests.
   Every change to data is an event. One rule table (ACTIONS) decides:
     - who may do what, at which stage (guard)      -> buttons + tasks
     - whether the data is complete (check)        -> form validation
     - how state changes (apply)                   -> the reducer
   ===================================================================== */
(function (root) {
  'use strict';

  /* ---------- small helpers ---------- */
  const DAY = 864e5;
  /* a fixed "now" while a stored record is checked against the rules of its own day (and for tests) */
  let NOW_AT = null;
  const nowMs = () => (NOW_AT == null ? Date.now() : NOW_AT);
  const now = () => new Date(nowMs());
  const nowISO = () => now().toISOString();
  const setNow = ms => { NOW_AT = ms == null ? null : +ms; };
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const todayStr = (d = now()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dayOf = iso => todayStr(new Date(iso));
  const addDays = (n, from = now()) => todayStr(new Date(new Date(from).getTime() + n * DAY));
  const daysBetween = (a, b) => Math.floor((new Date(b).getTime() - new Date(a).getTime()) / DAY);
  const sum = a => a.reduce((x, y) => x + (+y || 0), 0);
  const uniq = a => [...new Set(a.filter(Boolean))];
  const digits = s => String(s || '').replace(/\D/g, '');
  const phone10 = s => digits(s).slice(-10);
  const validPhone = s => /^[6-9]\d{9}$/.test(phone10(s));
  const ALPH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const rnd = n => {
    const c = root.crypto && root.crypto.getRandomValues ? root.crypto.getRandomValues(new Uint8Array(n)) : Array.from({ length: n }, () => Math.floor(Math.random() * 256));
    return Array.from(c, b => ALPH[b % ALPH.length]).join('');
  };
  const clone = o => JSON.parse(JSON.stringify(o));
  const str = v => String(v == null ? '' : v).trim();

  /* ---------- SHA-256 (sync, for PINs; same result on every phone) ---------- */
  function sha256(ascii) {
    const rr = (v, a) => (v >>> a) | (v << (32 - a));
    const K = [], H = [];
    let p = 2;
    for (let i = 0; i < 64; p++) {
      let prime = true;
      for (let d = 2; d * d <= p; d++) if (p % d === 0) { prime = false; break; }
      if (prime) { if (i < 8) H[i] = (Math.pow(p, 1 / 2) * 2 ** 32) | 0; K[i++] = (Math.pow(p, 1 / 3) * 2 ** 32) | 0; }
    }
    const bytes = Array.from(unescape(encodeURIComponent(ascii)), c => c.charCodeAt(0));
    const bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (let i = 7; i >= 0; i--) bytes.push(i > 3 ? 0 : (bitLen >>> (i * 8)) & 255);
    const h = H.slice();
    for (let j = 0; j < bytes.length; j += 64) {
      const w = [];
      for (let i = 0; i < 16; i++) w[i] = (bytes[j + i * 4] << 24) | (bytes[j + i * 4 + 1] << 16) | (bytes[j + i * 4 + 2] << 8) | bytes[j + i * 4 + 3];
      for (let i = 16; i < 64; i++) {
        const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, hh] = h;
      for (let i = 0; i < 64; i++) {
        const t1 = (hh + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }
    return h.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }
  const pinHash = (pin, salt) => sha256('aiec|' + salt + '|' + pin);
  const makePin = pin => { const salt = rnd(10); return { salt, pinHash: pinHash(pin, salt) }; };
  const pinOk = (u, pin) => !!u && !!u.pinHash && pinHash(pin, u.salt) === u.pinHash;

  /* ---------- domain constants ---------- */
  const ROLES = ['owner', 'admin', 'field', 'sales', 'finance', 'qc', 'supplier', 'tech', 'customer'];
  const STAFF_ROLES = ROLES.filter(r => r !== 'customer');
  const OFFICE = ['owner', 'admin'];
  const ROLE_ICON = { owner: '🏛️', admin: '🛡️', field: '🏍️', sales: '🤝', finance: '💰', qc: '🔍', supplier: '🏭', tech: '🔧', customer: '🏠' };
  const PHASES = [['lead', '📍'], ['sales', '🤝'], ['agree', '✍️'], ['site', '🏗️'], ['material', '🚚'], ['install', '🔧'], ['handover', '🔑']];
  const STAGES = {
    new: [0, '🆕'], returned: [0, '↩️'], accepted: [1, '✅'], contacted: [1, '📞'], requirements: [1, '📝'],
    quote_approval: [1, '⏳'], quote_ready: [1, '📄'], quoted: [1, '💬'], won: [2, '🎉'], agreement: [2, '✍️'],
    signed: [2, '💰'], site_prep: [3, '🧱'], qc_site: [3, '🔍'], site_fix: [3, '🛠️'], site_ok: [3, '✅'],
    material_order: [4, '📦'], dispatched: [4, '🚚'], arrived: [4, '📍'], installing: [5, '🔧'], qc_final: [5, '🔍'],
    install_fix: [5, '🛠️'], final_pay: [6, '💰'], handover: [6, '✍️'], amc: [7, '🔑'], lost: [-1, '❌']
  };
  const STAGE_ORDER = Object.keys(STAGES);
  const stageIdx = s => STAGE_ORDER.indexOf(s);
  const PRE_WON = ['new', 'returned', 'accepted', 'contacted', 'requirements', 'quote_approval', 'quote_ready', 'quoted'];
  const LOSABLE = PRE_WON.concat(['won', 'agreement']);
  const OPEN_STAGES = STAGE_ORDER.filter(s => s !== 'lost' && s !== 'amc');
  /* days each stage may take before the work is late (installing uses the rule installDays) */
  const SLA = { new: 1, returned: 2, accepted: 1, contacted: 2, requirements: 3, quote_approval: 1, quote_ready: 1, quoted: 7, won: 2, agreement: 3, signed: 3, site_prep: 21, qc_site: 3, site_fix: 14, site_ok: 2, material_order: 7, dispatched: 3, arrived: 2, qc_final: 3, install_fix: 5, final_pay: 5, handover: 3 };

  const CONTACT_ROLES = [['owner', '🏠'], ['builder', '🏗️'], ['manager', '🧑‍💼'], ['watchman', '💂'], ['other', '👤']];
  const SHAFT = ['yes', 'no', 'not_sure'];
  const LOST_REASONS = ['lr_price', 'lr_competitor', 'lr_postponed', 'lr_no_space', 'lr_no_response', 'lr_other'];
  const RETURN_REASONS = ['rr_photo', 'rr_phone', 'rr_address', 'rr_duplicate', 'rr_other'];
  const CALL_OUTCOMES = [['reached', '✅'], ['no_answer', '📵'], ['busy', '⏳'], ['callback', '🔁']];
  const PREP_ITEMS = [['shaft', '🧱'], ['pit', '⬇️'], ['power', '⚡'], ['clean', '🧹'], ['light', '💡'], ['barricade', '🚧']];
  const QC_SITE_CHECKS = ['plumb', 'pit_dry', 'power3', 'barricade', 'access'];
  const QC_SITE_MEAS = ['width', 'depth', 'pit', 'head'];
  const QC_FINAL_CHECKS = ['ride', 'level', 'doors', 'alarm', 'plate', 'safetydev', 'wiring'];
  const SOP = [['sitesafe', '🦺'], ['plumb', '📏'], ['brackets', '🔩'], ['rails', '🛤️'], ['machine', '⚙️'], ['car', '🛗'], ['cwt', '🧱'], ['ropes', '🪢'], ['doors', '🚪'], ['wiring', '🔌'], ['safetydev', '🛡️'], ['test', '▶️']];
  const CABIN_STEP = 5;
  /* readings asked at some installation steps, with their safe limits */
  const SOP_READ = {
    3: { k: 'rail_gauge', unit: 'mm', min: 1, max: 5000 },
    6: { k: 'balance', unit: '%', min: 40, max: 50 },
    9: { k: 'earth', unit: 'Ω', min: 0.01, max: 2 },
    11: { k: 'level', unit: 'mm', min: 0, max: 10 }
  };
  const SAFETY_ITEMS = [['ppe', '⛑️'], ['scaffold', '🪜'], ['barricade', '🚧'], ['earthing', '⚡']];
  const BLOCK_REASONS = [['material', '📦', 'supplier'], ['site', '🏗️', 'sales'], ['power', '⚡', 'sales'], ['help', '🙋', 'admin'], ['safety', '⚠️', 'admin']];
  const AMC_CHECKS = ['ride', 'doors', 'alarm', 'brake', 'ropes', 'oil', 'pit'];
  const TICKET_KINDS = [['breakdown', '🚨'], ['complaint', '😟'], ['request', '🙋']];
  const SEVERITIES = [['trapped', '🆘'], ['unsafe', '⚠️'], ['breakdown', '🚨'], ['routine', '🔧']];
  const ROOT_CAUSES = [['door', '🚪'], ['controller', '🎛️'], ['power', '⚡'], ['brake', '🛑'], ['rope', '🪢'], ['sensor', '📡'], ['misuse', '🙅'], ['other', '❔']];
  const PAY_MODES = [['upi', '📱'], ['bank', '🏦'], ['cheque', '🧾'], ['cash', '💵']];
  const LIFT_TYPES = ['auto', 'manual'];
  const CAPACITIES = ['4', '6', '8', '10', '13'];
  const FINISHES = ['ms', 'ss'];
  const JOB_KINDS = ['new', 'replace'];
  const USES = ['home', 'society', 'shop', 'hospital', 'office'];
  const TIMELINES = ['1m', '3m', '6m', 'later'];
  const PURPOSES = ['token', 'arrival', 'cabin', 'final'];
  const PAY_STAGE = { token: ['signed'], arrival: ['arrived'], cabin: ['arrived', 'installing'], final: ['final_pay'] };

  const DEFAULT_CONFIG = {
    costAuto: 300000, costManual: 220000, costPerStop: 40000, costSS: 50000, costDismantle: 30000,
    cap4: 0, cap6: 20000, cap8: 40000, cap10: 60000, cap13: 90000,
    costArd: 35000, costCurtain: 12000, costPremium: 150000,
    install: 60000, transport: 15000, gst: 18,
    targetMargin: 60, salesDiscountLimit: 8, adminDiscountLimit: 18, minMargin: 20,
    token: 10000, arrivalPct: 70, cabinPct: 20,
    installDays: 14, warrantyMonths: 12, amcVisits: 4, validityDays: 30,
    tolWidth: 1500, tolDepth: 1500, tolPit: 1200, tolHead: 3800,
    dailySafety: 1, escalateDays: 2, slaTicketHours: 24, amcPrice: 15000,
    payUpi: '', payName: '', officePhone: ''
  };
  /* the lowest and highest value each rule may take (checked by the rule, not only the input box) */
  const CFG_LIMITS = {
    costAuto: [10000, 1e7], costManual: [10000, 1e7], costPerStop: [0, 5e6], costSS: [0, 5e6], costDismantle: [0, 5e6],
    cap4: [0, 5e6], cap6: [0, 5e6], cap8: [0, 5e6], cap10: [0, 5e6], cap13: [0, 5e6], costArd: [0, 5e6], costCurtain: [0, 5e6], costPremium: [0, 5e6],
    install: [0, 5e6], transport: [0, 5e6], gst: [0, 28], targetMargin: [1, 90], salesDiscountLimit: [0, 50], adminDiscountLimit: [0, 50], minMargin: [0, 90],
    token: [0, 500000], arrivalPct: [0, 100], cabinPct: [0, 100], installDays: [1, 180], warrantyMonths: [0, 120], amcVisits: [0, 24], validityDays: [1, 365],
    tolWidth: [300, 10000], tolDepth: [300, 10000], tolPit: [300, 10000], tolHead: [300, 10000], dailySafety: [0, 1], escalateDays: [1, 30], slaTicketHours: [1, 720], amcPrice: [0, 2e6]
  };
  const TEXT_CFG = { payUpi: /^$|^[\w.\-]{2,}@[a-zA-Z]{2,}$/, payName: /^[^<>]{0,60}$/, officePhone: /^$|^[6-9]\d{9}$/ };
  const RULE_GROUPS = {
    pricing: ['costAuto', 'costManual', 'costPerStop', 'costSS', 'costDismantle', 'cap6', 'cap8', 'cap10', 'cap13', 'costArd', 'costCurtain', 'costPremium', 'install', 'transport', 'gst'],
    margins: ['targetMargin', 'salesDiscountLimit', 'adminDiscountLimit', 'minMargin'],
    payments: ['token', 'arrivalPct', 'cabinPct', 'payUpi', 'payName'],
    work: ['installDays', 'validityDays', 'dailySafety', 'escalateDays'],
    quality: ['tolWidth', 'tolDepth', 'tolPit', 'tolHead'],
    service: ['warrantyMonths', 'amcVisits', 'amcPrice', 'slaTicketHours', 'officePhone']
  };

  /* ---------- money + quotation maths (deterministic) ---------- */
  const r100 = n => Math.round(n / 100) * 100;
  function calcQuote(cfg, req, discountPct) {
    const d = Math.max(0, Math.min(90, +discountPct || 0));
    const base = req.type === 'manual' ? cfg.costManual : cfg.costAuto;
    const parts = [
      ['ql_lift', base],
      ['ql_stops', Math.max(0, (+req.stops || 2) - 2) * cfg.costPerStop],
      ['ql_cap', +cfg['cap' + req.capacity] || 0],
      ['ql_finish', req.finish === 'ss' ? cfg.costSS : 0],
      ['ql_ard', req.ard ? cfg.costArd : 0],
      ['ql_curtain', req.curtain ? cfg.costCurtain : 0],
      ['ql_premium', req.premium ? cfg.costPremium : 0],
      ['ql_dismantle', req.job === 'replace' ? cfg.costDismantle : 0],
      ['ql_install', cfg.install],
      ['ql_transport', cfg.transport]
    ];
    const cost = sum(parts.map(p => p[1]));
    const k = 1 / (1 - cfg.targetMargin / 100);
    const lines = parts.filter(p => p[1] > 0).map(p => [p[0], r100(p[1] * k)]);
    const list = sum(lines.map(l => l[1]));
    const discount = r100(list * d / 100);
    const price = list - discount;
    const gst = Math.round(price * cfg.gst / 100);
    const total = price + gst;
    const margin = price > 0 ? Math.round((price - cost) / price * 1000) / 10 : 0;
    const why = [];
    if (d > cfg.salesDiscountLimit) why.push('over_limit');
    if (d > cfg.adminDiscountLimit) why.push('over_admin');
    if (margin < cfg.minMargin) why.push('below_floor');
    return { lines, cost, list, discountPct: d, discount, price, gstPct: cfg.gst, gst, total, margin, why, needsApproval: why.length > 0 };
  }
  /* token, then arrival % (less the token), the cabin %, and the rest at handover */
  function paySchedule(cfg, total) {
    const token = Math.min(+cfg.token || 0, total);
    const arrival = Math.max(0, Math.round(total * cfg.arrivalPct / 100) - token);
    const cabin = +cfg.cabinPct > 0 ? Math.round(total * cfg.cabinPct / 100) : 0;
    const out = { token, arrival, final: Math.max(0, total - token - arrival - cabin) };
    if (cabin) out.cabin = cabin;
    return out;
  }
  function materialList(req) {
    const st = +req.stops || 2;
    return [['m_machine', 1], ['m_controller', 1], ['m_rails', st * 2], ['m_cabin', 1], ['m_landing', st], ['m_cardoor', 1],
      ['m_cwt', 1], ['m_ropes', 1], ['m_buffers', 1], ['m_governor', 1], ['m_wiring', 1], ['m_buttons', st + 1]].map(([k, q]) => ({ k, q }));
  }
  const lastQuote = P => P.quotes[P.quotes.length - 1];
  const quoteValidTill = (q, cfg) => q && q.sent ? addDays(q.validity || cfg.validityDays, new Date(q.sent.t)) : null;
  const quoteExpired = (q, cfg, at) => !!q && !!q.sent && quoteValidTill(q, cfg) < dayOf(at || nowISO());
  const activePay = (P, purpose) => [...P.payments].reverse().find(p => p.purpose === purpose && p.status !== 'failed');
  const payConfirmed = (P, purpose) => { const p = activePay(P, purpose); return !!p && p.status === 'confirmed'; };
  const paidTotal = P => sum(P.payments.filter(p => p.status === 'confirmed').map(p => p.amount));
  const dueOf = (P, purpose) => P.schedule ? +P.schedule[purpose] || 0 : 0;
  const payOpen = (P, purpose) => !!P.schedule && dueOf(P, purpose) > 0 && PAY_STAGE[purpose].includes(P.stage) && !activePay(P, purpose);
  const sopNext = P => { let i = 0; while (i < SOP.length && P.sop[i]) i++; return i; };
  const prepDone = P => PREP_ITEMS.every(([k]) => P.prep[k]);
  const openCorr = (P, scope) => P.corrections.filter(c => c.scope === scope && !c.done);
  const safetyToday = (P, at) => !!P.safety[dayOf(at || nowISO())];
  const leadHeat = P => {
    const why = []; let n = 0; const add = (v, k) => { n += v; why.push([v, k]); };
    const r = P.req || {};
    if (validPhone(P.lead.phone)) add(10, 'ls_phone');
    if (P.lead.consent) add(5, 'ls_consent');
    if (['owner', 'builder'].includes(P.lead.contactRole)) add(15, 'ls_decider');
    if (P.lead.shaft === 'yes') add(20, 'ls_shaft');
    if (P.lead.floors || r.stops) add(5, 'ls_floors');
    if (r.timeline === '1m') add(20, 'ls_soon'); else if (r.timeline === '3m') add(10, 'ls_3m');
    if (P.quotes.some(q => q.sent)) add(10, 'ls_quoted');
    return { n: Math.min(100, n), why };
  };
  const warrantyEnd = P => P.done ? addDays((P.done.warrantyMonths || 12) * 30, new Date(P.done.t)) : null;
  /* AMC visits are spread evenly over the year after handover */
  function amcDue(P) {
    if (!P.done || !(+P.done.amcVisits > 0)) return [];
    const every = Math.round(365 / P.done.amcVisits);
    return Array.from({ length: P.done.amcVisits }, (_, i) => ({ n: i + 1, due: addDays(every * (i + 1), new Date(P.done.t)), visit: P.amc.visits[i] || null }));
  }
  const nextAmc = P => amcDue(P).find(v => !v.visit) || null;

  /* ---------- state ---------- */
  const initState = () => ({ org: null, config: clone(DEFAULT_CONFIG), users: {}, projects: {}, log: [] });
  const newProject = (id, ev) => ({
    id, t: ev.t, createdBy: ev.by, stage: 'new', since: ev.t, lead: {}, sales: '', qc: '', tech: '', supplier: '', customer: '',
    req: null, quotes: [], agreement: null, schedule: null, payments: [], prep: {}, qcSite: [], corrections: [], po: null,
    dispatch: null, arrival: null, mhand: null, sop: [], safety: {}, qcFinal: [], hand: {}, done: null,
    amc: { visits: [], tickets: [] }, blockers: [], chat: [], history: [], followUp: null, returnReason: '', lostReason: ''
  });
  const activeUsers = (S, role) => Object.values(S.users).filter(u => u.active && (!role || u.role === role));
  const firstActive = (S, role) => { const a = activeUsers(S, role).sort((x, y) => x.name.localeCompare(y.name)); return a.length ? a[0].uid : ''; };
  /* the person of a role with the fewest open jobs (new leads, inspections) */
  function leastBusy(S, role, field) {
    const a = activeUsers(S, role);
    if (!a.length) return '';
    const load = uid => Object.values(S.projects).filter(P => P[field] === uid && OPEN_STAGES.includes(P.stage)).length;
    return a.sort((x, y) => load(x.uid) - load(y.uid) || x.name.localeCompare(y.name))[0].uid;
  }

  /* ---------- who can see a project ---------- */
  function canSee(S, uid, P) {
    const u = S.users[uid]; if (!u || !u.active || !P) return false;
    switch (u.role) {
      case 'owner': case 'admin': case 'finance': return true;
      case 'sales': return P.sales === uid || P.createdBy === uid || !P.sales;
      case 'field': return P.createdBy === uid;
      case 'qc': return P.qc === uid || (!P.qc && ['qc_site', 'qc_final', 'handover'].includes(P.stage)) || P.stage === 'amc';
      case 'tech': return P.tech === uid || (P.stage === 'amc' && P.amc.tickets.some(x => x.to === uid));
      case 'supplier': return P.supplier === uid;
      case 'customer': return P.customer === uid;
    }
    return false;
  }
  /* prices, costs and margins are for office roles only */
  const seesMargin = role => ['owner', 'admin', 'finance'].includes(role);
  const seesMoney = role => ['owner', 'admin', 'finance', 'sales', 'customer'].includes(role);

  /* may this user act in one of these roles? The office (Owner/Admin) covers a role nobody holds, so a small company is never stuck */
  function actsAs(S, u, roles) {
    if (!u || !u.active) return false;
    if (roles.includes(u.role)) return true;
    if (u.role === 'owner' && roles.includes('admin')) return true;
    if (OFFICE.includes(u.role)) {
      const staff = roles.filter(r => r !== 'customer' && !OFFICE.includes(r));
      return staff.length > 0 && staff.every(r => !activeUsers(S, r).length);
    }
    return false;
  }

  /* ---------- the rule table ---------- */
  const E = (k, v) => (v ? { k, v } : k);
  const photos = a => Array.isArray(a) && a.filter(Boolean).length > 0;
  const setStage = (P, stage, ev) => { if (P.stage !== stage) { P.history.push({ from: P.stage, to: stage, t: ev.t, by: ev.by }); P.stage = stage; P.since = ev.t; } };

  const ACTIONS = {
    ORG_CREATE: {
      guard: S => (S.org ? 'err_org_exists' : null),
      check: (S, d) => (!str(d.org && d.org.name) ? 'err_company_name' : !str(d.user && d.user.name) ? 'err_name' : !(d.user && d.user.pinHash) ? 'err_pin' : null),
      apply: (S, ev) => {
        S.org = { name: str(ev.d.org.name), t: ev.t, city: str(ev.d.org.city || 'PUN').toUpperCase().slice(0, 3) || 'PUN' };
        const u = ev.d.user; S.users[u.uid] = { uid: u.uid, name: str(u.name), role: 'owner', phone: phone10(u.phone), pinHash: u.pinHash, salt: u.salt, active: true, t: ev.t };
      }
    },
    USER_ADD: {
      roles: OFFICE, noProject: true,
      check: (S, d, P, u) => {
        const x = d.user || {};
        if (!str(x.name)) return 'err_name';
        if (!ROLES.includes(x.role)) return 'err_role';
        if (x.role === 'owner' && u.role !== 'owner') return 'err_owner_only';
        if (S.users[x.uid]) return 'err_user_exists';
        if (x.phone && !validPhone(x.phone)) return 'err_phone';
        if (!x.pinHash) return 'err_pin';
        if (x.role === 'customer' && x.pid && !S.projects[x.pid]) return 'err_project';
        return null;
      },
      apply: (S, ev) => {
        const x = ev.d.user;
        S.users[x.uid] = { uid: x.uid, name: str(x.name), role: x.role, phone: phone10(x.phone), pinHash: x.pinHash, salt: x.salt, active: true, t: ev.t, by: ev.by };
        if (x.role === 'customer' && x.pid && S.projects[x.pid]) S.projects[x.pid].customer = x.uid;
      }
    },
    USER_UPDATE: {
      roles: OFFICE, noProject: true,
      check: (S, d, P, u) => {
        const x = S.users[d.uid]; if (!x) return 'err_user';
        if (x.role === 'owner' && u.role !== 'owner') return 'err_owner_only';
        if (d.role && !ROLES.includes(d.role)) return 'err_role';
        if (d.role === 'owner' && u.role !== 'owner') return 'err_owner_only';
        if (x.role === 'owner' && (d.active === false || (d.role && d.role !== 'owner')) && activeUsers(S, 'owner').length < 2) return 'err_last_owner';
        if (d.uid === u.uid && d.active === false) return 'err_self';
        if (d.phone && !validPhone(d.phone)) return 'err_phone';
        if (d.name != null && !str(d.name)) return 'err_name';
        return null;
      },
      apply: (S, ev) => {
        const x = S.users[ev.d.uid];
        for (const k of ['name', 'role', 'active', 'pinHash', 'salt']) if (ev.d[k] != null) x[k] = k === 'name' ? str(ev.d[k]) : ev.d[k];
        if (ev.d.phone != null) x.phone = phone10(ev.d.phone);
      }
    },
    PIN_CHANGE: {
      roles: ROLES, noProject: true,
      check: (S, d) => (!d.pinHash ? 'err_pin' : null),
      apply: (S, ev) => { const x = S.users[ev.by]; x.pinHash = ev.d.pinHash; x.salt = ev.d.salt; }
    },
    CONFIG_SET: {
      roles: ['owner'], noProject: true,
      check: (S, d) => {
        if (!(d.key in DEFAULT_CONFIG)) return 'err_rule';
        if (d.key in TEXT_CFG) return TEXT_CFG[d.key].test(str(d.value)) ? null : 'err_rule_value';
        const v = +d.value, lim = CFG_LIMITS[d.key];
        if (!isFinite(v) || String(d.value).trim() === '' || v < lim[0] || v > lim[1]) return E('err_rule_range', { a: lim[0], b: lim[1] });
        const c = Object.assign({}, S.config, { [d.key]: v });
        if (c.minMargin > c.targetMargin) return 'err_rule_margin';
        if (c.salesDiscountLimit > c.adminDiscountLimit) return 'err_rule_disc';
        if (c.arrivalPct + c.cabinPct > 100) return 'err_rule_pct';
        return null;
      },
      apply: (S, ev) => { S.config[ev.d.key] = ev.d.key in TEXT_CFG ? str(ev.d.value) : +ev.d.value; }
    },

    /* ----- lead ----- */
    LEAD_CREATE: {
      roles: ['field', 'sales', 'admin', 'owner'], newProject: true,
      check: (S, d, P, u, ev) => {
        const l = d.lead || {};
        if (!ev.pid || S.projects[ev.pid]) return 'err_project';
        if (!str(l.name)) return 'err_name';
        if (!validPhone(l.phone)) return 'err_phone';
        if (!str(l.address) && !l.gps) return 'err_address';
        if (!photos(l.photos)) return 'err_photo';
        const dup = Object.values(S.projects).find(Q => OPEN_STAGES.includes(Q.stage) && phone10(Q.lead.phone) === phone10(l.phone));
        if (dup) return E('err_dup_phone', { id: dup.id });
        return null;
      },
      apply: (S, ev) => {
        const P = newProject(ev.pid, ev), u = S.users[ev.by], l = ev.d.lead;
        P.lead = { name: str(l.name), phone: phone10(l.phone), contactRole: l.contactRole || 'owner', building: str(l.building), address: str(l.address), area: str(l.area), floors: +l.floors || 0, shaft: SHAFT.includes(l.shaft) ? l.shaft : 'not_sure', notes: str(l.notes), gps: l.gps || null, consent: !!l.consent, photos: l.photos.filter(Boolean) };
        P.sales = u.role === 'sales' ? u.uid : leastBusy(S, 'sales', 'sales');
        if (u.role === 'sales' || (OFFICE.includes(u.role) && !P.sales)) { P.stage = 'accepted'; P.history.push({ from: 'new', to: 'accepted', t: ev.t, by: ev.by }); }
        S.projects[P.id] = P;
      }
    },
    LEAD_ACCEPT: { roles: ['sales'], stages: ['new'], who: 'sales', apply: (S, ev, P) => { if (!P.sales || S.users[ev.by].role === 'sales') P.sales = P.sales || ev.by; setStage(P, 'accepted', ev); } },
    LEAD_RETURN: {
      roles: ['sales'], stages: ['new'], who: 'sales',
      check: (S, d) => (!RETURN_REASONS.includes(d.reason) ? 'err_reason' : d.reason === 'rr_other' && !str(d.note) ? 'err_note' : null),
      apply: (S, ev, P) => { P.returnReason = ev.d.reason; P.returnNote = str(ev.d.note); setStage(P, 'returned', ev); }
    },
    LEAD_FIX: {
      roles: ['field', 'sales', 'admin', 'owner'], stages: ['returned'],
      guard: (S, u, P) => (P.createdBy === u.uid || OFFICE.includes(u.role) ? null : 'err_not_yours'),
      check: (S, d) => {
        const l = d.lead || {};
        if (l.phone != null && !validPhone(l.phone)) return 'err_phone';
        if (l.name != null && !str(l.name)) return 'err_name';
        return null;
      },
      apply: (S, ev, P) => {
        const l = ev.d.lead || {};
        for (const k of ['name', 'building', 'address', 'area', 'notes']) if (l[k] != null) P.lead[k] = str(l[k]);
        if (l.phone != null) P.lead.phone = phone10(l.phone);
        if (l.floors != null) P.lead.floors = +l.floors || 0;
        if (l.gps) P.lead.gps = l.gps;
        if (photos(l.photos)) P.lead.photos = P.lead.photos.concat(l.photos.filter(Boolean));
        P.returnReason = ''; P.returnNote = '';
        setStage(P, 'new', ev);
      }
    },
    CALL_LOG: {
      roles: ['sales'], stages: ['accepted', 'contacted', 'requirements', 'quote_ready', 'quoted'], who: 'sales',
      check: (S, d) => (!CALL_OUTCOMES.some(([k]) => k === d.outcome) ? 'err_outcome' : d.followUp && d.followUp < todayStr() ? 'err_date_past' : (d.outcome === 'callback' && !d.followUp) ? 'err_followup' : null),
      apply: (S, ev, P) => {
        P.calls = (P.calls || []).concat([{ outcome: ev.d.outcome, note: str(ev.d.note), t: ev.t, by: ev.by }]);
        P.followUp = ev.d.followUp ? { due: ev.d.followUp, t: ev.t } : (ev.d.outcome === 'reached' ? null : P.followUp);
        if (ev.d.outcome === 'reached' && P.stage === 'accepted') setStage(P, 'contacted', ev);
      }
    },
    NEEDS_SAVE: {
      roles: ['sales'], stages: ['contacted', 'requirements', 'quote_ready', 'quoted'], who: 'sales',
      check: (S, d) => {
        const r = d.req || {};
        if (!LIFT_TYPES.includes(r.type)) return 'err_lift_type';
        if (!(+r.stops >= 2 && +r.stops <= 40)) return 'err_stops';
        if (!CAPACITIES.includes(String(r.capacity))) return 'err_capacity';
        if (!FINISHES.includes(r.finish)) return 'err_finish';
        if (!JOB_KINDS.includes(r.job)) return 'err_job';
        if (r.use && !USES.includes(r.use)) return 'err_use';
        if (r.timeline && !TIMELINES.includes(r.timeline)) return 'err_timeline';
        return null;
      },
      apply: (S, ev, P) => {
        const r = ev.d.req;
        P.req = { type: r.type, stops: +r.stops, capacity: String(r.capacity), finish: r.finish, job: r.job, ard: !!r.ard, curtain: !!r.curtain, premium: !!r.premium, use: r.use || 'home', timeline: r.timeline || '3m', note: str(r.note) };
        setStage(P, 'requirements', ev);
      }
    },
    QUOTE_MAKE: {
      roles: ['sales'], stages: ['requirements', 'quote_ready', 'quoted'], who: 'sales',
      guard: (S, u, P) => (!P.req ? 'err_needs_first' : null),
      check: (S, d) => (!(d.discountPct >= 0 && d.discountPct <= 90) ? 'err_discount' : null),
      apply: (S, ev, P) => {
        const c = calcQuote(S.config, P.req, ev.d.discountPct);
        P.quotes.push({ v: P.quotes.length + 1, req: clone(P.req), calc: c, by: ev.by, t: ev.t, validity: S.config.validityDays, note: str(ev.d.note) });
        setStage(P, c.needsApproval ? 'quote_approval' : 'quote_ready', ev);
      }
    },
    QUOTE_APPROVE: {
      roles: OFFICE, stages: ['quote_approval'],
      guard: (S, u, P) => approverWhyNot(S, u, P),
      apply: (S, ev, P) => { lastQuote(P).approved = { t: ev.t, by: ev.by }; setStage(P, 'quote_ready', ev); }
    },
    QUOTE_REJECT: {
      roles: OFFICE, stages: ['quote_approval'],
      guard: (S, u, P) => approverWhyNot(S, u, P),
      check: (S, d) => (!str(d.note) ? 'err_note' : null),
      apply: (S, ev, P) => { lastQuote(P).rejected = { t: ev.t, by: ev.by, note: str(ev.d.note) }; setStage(P, 'requirements', ev); }
    },
    QUOTE_SEND: {
      roles: ['sales'], stages: ['quote_ready'], who: 'sales',
      check: (S, d) => (!['whatsapp', 'print', 'inperson'].includes(d.channel) ? 'err_channel' : null),
      apply: (S, ev, P) => { lastQuote(P).sent = { t: ev.t, by: ev.by, channel: ev.d.channel }; P.followUp = { due: addDays(3, new Date(ev.t)), t: ev.t }; setStage(P, 'quoted', ev); }
    },
    DEAL_WON: {
      roles: ['sales'], stages: ['quoted'], who: 'sales',
      guard: (S, u, P) => (quoteExpired(lastQuote(P), S.config) ? 'err_quote_expired' : null),
      apply: (S, ev, P) => { P.wonAt = ev.t; P.followUp = null; setStage(P, 'won', ev); }
    },
    DEAL_LOST: {
      roles: ['sales', 'admin', 'owner'], stages: LOSABLE, who: 'sales',
      check: (S, d) => (!LOST_REASONS.includes(d.reason) ? 'err_reason' : d.reason === 'lr_other' && !str(d.note) ? 'err_note' : null),
      apply: (S, ev, P) => { P.lostReason = ev.d.reason; P.lostNote = str(ev.d.note); P.followUp = null; setStage(P, 'lost', ev); }
    },
    LEAD_REOPEN: { roles: OFFICE, stages: ['lost'], apply: (S, ev, P) => { P.lostReason = ''; P.lostNote = ''; setStage(P, P.req ? 'requirements' : 'accepted', ev); } },
    REASSIGN: {
      roles: OFFICE,
      check: (S, d, P) => {
        if (!['sales', 'qc', 'tech', 'supplier'].includes(d.field)) return 'err_role';
        const x = S.users[d.uid]; if (!x || !x.active || x.role !== d.field) return 'err_user';
        return OPEN_STAGES.includes(P.stage) || (P.stage === 'amc' && ['tech', 'qc'].includes(d.field)) ? null : 'err_stage';
      },
      apply: (S, ev, P) => { P[ev.d.field] = ev.d.uid; }
    },

    /* ----- deal ----- */
    AGREE_PREPARE: {
      roles: ['sales'], stages: ['won'], who: 'sales',
      apply: (S, ev, P) => { const q = lastQuote(P); P.agreement = { quoteV: q.v, total: q.calc.total, t: ev.t, by: ev.by }; P.schedule = paySchedule(S.config, q.calc.total); setStage(P, 'agreement', ev); }
    },
    AGREE_SIGN: {
      roles: ['customer', 'sales'], stages: ['agreement'], who: 'sales',
      check: (S, d) => (!d.sig ? 'err_signature' : !str(d.signer) ? 'err_name' : !d.agree ? 'err_agree_terms' : null),
      apply: (S, ev, P) => { P.agreement.signed = { t: ev.t, by: ev.by, sig: ev.d.sig, signer: str(ev.d.signer) }; setStage(P, 'signed', ev); }
    },
    CUSTOMER_LOGIN: {
      roles: ['sales'], who: 'sales',
      guard: (S, u, P) => (P.customer ? 'err_has_customer' : P.stage === 'lost' || stageIdx(P.stage) < stageIdx('accepted') ? 'err_stage' : null),
      check: (S, d, P) => (!d.uid || S.users[d.uid] ? 'err_user' : !d.pinHash ? 'err_pin' : null),
      apply: (S, ev, P) => { S.users[ev.d.uid] = { uid: ev.d.uid, name: P.lead.name, role: 'customer', phone: P.lead.phone, pinHash: ev.d.pinHash, salt: ev.d.salt, active: true, t: ev.t, by: ev.by }; P.customer = ev.d.uid; }
    },

    /* ----- money ----- */
    PAY_RECORD: {
      roles: ['sales', 'finance', 'customer'], who: 'customer',
      guard: (S, u, P) => (PURPOSES.some(k => payOpen(P, k)) ? null : 'err_nothing_due'),
      check: (S, d, P) => {
        if (!PURPOSES.includes(d.purpose) || !payOpen(P, d.purpose)) return 'err_not_due';
        if (+d.amount !== dueOf(P, d.purpose)) return E('err_amount', { n: dueOf(P, d.purpose) });
        if (!PAY_MODES.some(([k]) => k === d.mode)) return 'err_mode';
        if (!str(d.ref) || str(d.ref).length < 4) return 'err_ref';
        return null;
      },
      apply: (S, ev, P) => { P.payments.push({ id: ev.id, purpose: ev.d.purpose, amount: +ev.d.amount, mode: ev.d.mode, ref: str(ev.d.ref), proof: ev.d.proof || '', status: 'pending', recordedBy: ev.by, t: ev.t }); }
    },
    PAY_VERIFY: {
      roles: ['finance', 'owner'],
      guard: (S, u, P) => (P.payments.some(p => p.status === 'pending') ? null : 'err_nothing_pending'),
      check: (S, d, P, u) => {
        const p = P.payments.find(x => x.id === d.payId);
        if (!p || p.status !== 'pending') return 'err_payment';
        if (p.recordedBy === u.uid && Object.values(S.users).some(x => x.active && x.uid !== u.uid && actsAs(S, x, ['finance']))) return 'err_own_payment';
        if (!d.ok && !str(d.note)) return 'err_note';
        return null;
      },
      apply: (S, ev, P) => {
        const p = P.payments.find(x => x.id === ev.d.payId);
        p.status = ev.d.ok ? 'confirmed' : 'failed'; p.verifiedBy = ev.by; p.vt = ev.t; p.note = str(ev.d.note);
        if (!ev.d.ok) return;
        if (p.purpose === 'token' && P.stage === 'signed') setStage(P, 'site_prep', ev);
        if (p.purpose === 'final' && P.stage === 'final_pay') setStage(P, 'handover', ev);
      }
    },

    /* ----- site ----- */
    PREP_TICK: {
      roles: ['customer', 'sales'], stages: ['site_prep'], who: 'customer',
      check: (S, d) => (!PREP_ITEMS.some(([k]) => k === d.item) ? 'err_item' : !d.photo ? 'err_photo' : null),
      apply: (S, ev, P) => { P.prep[ev.d.item] = { t: ev.t, by: ev.by, photo: ev.d.photo }; }
    },
    QC_REQUEST: {
      roles: ['customer', 'sales'], stages: ['site_prep', 'site_fix'], who: 'customer',
      guard: (S, u, P) => (P.stage === 'site_prep' && !prepDone(P) ? 'err_prep_first' : P.stage === 'site_fix' && openCorr(P, 'site').length ? 'err_fix_first' : null),
      apply: (S, ev, P) => { if (!P.qc) P.qc = leastBusy(S, 'qc', 'qc'); setStage(P, 'qc_site', ev); }
    },
    QC_SITE: {
      roles: ['qc'], stages: ['qc_site'], who: 'qc',
      check: (S, d) => {
        if (!QC_SITE_CHECKS.every(k => ['pass', 'fail'].includes((d.checks || {})[k]))) return 'err_all_checks';
        if (!QC_SITE_MEAS.every(k => +(d.meas || {})[k] > 0)) return 'err_meas';
        if (!photos(d.photos)) return 'err_photo';
        return null;
      },
      apply: (S, ev, P) => {
        const d = ev.d, c = S.config, low = QC_SITE_MEAS.filter(m => +d.meas[m] < +c[{ width: 'tolWidth', depth: 'tolDepth', pit: 'tolPit', head: 'tolHead' }[m]]);
        const fails = QC_SITE_CHECKS.filter(k => d.checks[k] === 'fail');
        const ok = !fails.length && !low.length;
        P.qcSite.push({ checks: d.checks, meas: d.meas, low, photos: d.photos, note: str(d.note), outcome: ok ? 'approved' : 'fix', t: ev.t, by: ev.by });
        if (ok) { setStage(P, 'site_ok', ev); return; }
        fails.forEach((k, i) => P.corrections.push({ id: ev.id + 's' + i, scope: 'site', k: 'qcs_fix_' + k, t: ev.t, done: null }));
        low.forEach((k, i) => P.corrections.push({ id: ev.id + 'm' + i, scope: 'site', k: 'meas_fix_' + k, v: { n: c[{ width: 'tolWidth', depth: 'tolDepth', pit: 'tolPit', head: 'tolHead' }[k]] }, t: ev.t, done: null }));
        setStage(P, 'site_fix', ev);
      }
    },
    CORR_DONE: {
      roles: ['customer', 'sales', 'tech'],
      check: (S, d, P, u) => {
        const c = P.corrections.find(x => x.id === d.cid);
        if (!c || c.done) return 'err_item';
        if (c.scope === 'site' && !(P.stage === 'site_fix' && actsAs(S, u, ['customer', 'sales']))) return 'err_access';
        if (c.scope === 'install' && !(['installing', 'install_fix'].includes(P.stage) && actsAs(S, u, ['tech']))) return 'err_access';
        return !d.photo ? 'err_photo' : null;
      },
      apply: (S, ev, P) => { P.corrections.find(x => x.id === ev.d.cid).done = { t: ev.t, by: ev.by, photo: ev.d.photo }; }
    },
    RELEASE: {
      roles: OFFICE, stages: ['site_ok'],
      check: (S, d) => {
        const tch = S.users[d.tech], sup = S.users[d.supplier];
        if (!tch || !tch.active || tch.role !== 'tech') return 'err_pick_tech';
        if (!sup || !sup.active || sup.role !== 'supplier') return 'err_pick_supplier';
        if (!str(d.drawing)) return 'err_drawing';
        if (!d.needBy || d.needBy < todayStr()) return 'err_date_past';
        return null;
      },
      apply: (S, ev, P) => {
        P.tech = ev.d.tech; P.supplier = ev.d.supplier;
        P.po = { no: 'PO-' + P.id, t: ev.t, by: ev.by, drawing: str(ev.d.drawing), needBy: ev.d.needBy, items: materialList(P.req), accepted: null };
        setStage(P, 'material_order', ev);
      }
    },
    PO_ACCEPT: {
      roles: ['supplier'], stages: ['material_order'], who: 'supplier',
      guard: (S, u, P) => (P.po && P.po.accepted ? 'err_done_already' : null),
      check: (S, d) => (!d.date || d.date < todayStr() ? 'err_date_past' : null),
      apply: (S, ev, P) => { P.po.accepted = { t: ev.t, by: ev.by, date: ev.d.date }; }
    },
    DISPATCH: {
      roles: ['supplier'], stages: ['material_order'], who: 'supplier',
      guard: (S, u, P) => (!P.po || !P.po.accepted ? 'err_accept_po_first' : null),
      check: (S, d) => (!str(d.vehicle) ? 'err_vehicle' : !photos(d.photos) ? 'err_photo' : null),
      apply: (S, ev, P) => { P.dispatch = { t: ev.t, by: ev.by, vehicle: str(ev.d.vehicle).toUpperCase(), driver: str(ev.d.driver), photos: ev.d.photos }; setStage(P, 'dispatched', ev); }
    },
    ARRIVAL: {
      roles: ['tech', 'supplier'], stages: ['dispatched'], who: 'tech',
      check: (S, d) => (!photos(d.photos) ? 'err_photo' : null),
      apply: (S, ev, P) => { P.arrival = { t: ev.t, by: ev.by, photos: ev.d.photos, gps: ev.d.gps || null, sealOk: !!ev.d.sealOk, note: str(ev.d.note) }; setStage(P, 'arrived', ev); }
    },
    MHAND: {
      roles: ['tech'], stages: ['arrived'], who: 'tech',
      guard: (S, u, P) => (!payConfirmed(P, 'arrival') ? 'err_wait_payment' : null),
      check: (S, d, P) => {
        if (!P.po.items.every(m => (d.checked || {})[m.k])) return 'err_check_all';
        if (!photos(d.photos)) return 'err_photo';
        if (!d.sig || !str(d.receiver)) return 'err_signature';
        return null;
      },
      apply: (S, ev, P) => { P.mhand = { t: ev.t, by: ev.by, photos: ev.d.photos, sig: ev.d.sig, receiver: str(ev.d.receiver), note: str(ev.d.note) }; setStage(P, 'installing', ev); }
    },

    /* ----- installation ----- */
    SAFETY: {
      roles: ['tech'], stages: ['installing', 'install_fix'], who: 'tech',
      guard: (S, u, P, ev) => (safetyToday(P, ev && ev.t) ? 'err_done_already' : null),
      check: (S, d) => (!SAFETY_ITEMS.every(([k]) => (d.photos || {})[k]) ? 'err_safety_photos' : null),
      apply: (S, ev, P) => { P.safety[dayOf(ev.t)] = { t: ev.t, by: ev.by, photos: ev.d.photos }; }
    },
    SOP_STEP: {
      roles: ['tech'], stages: ['installing'], who: 'tech',
      guard: (S, u, P, ev) => {
        if (sopNext(P) >= SOP.length) return 'err_all_steps_done';
        if (P.blockers.some(b => b.open && b.reason === 'safety')) return 'err_work_stopped';
        if (+S.config.dailySafety && !safetyToday(P, ev && ev.t)) return 'err_safety_first';
        if (P.schedule && P.schedule.cabin && sopNext(P) >= CABIN_STEP && !payConfirmed(P, 'cabin')) return 'err_wait_cabin';
        return null;
      },
      check: (S, d, P) => {
        if (d.i !== sopNext(P)) return 'err_step_order';
        if (!d.photo) return 'err_photo';
        const r = SOP_READ[d.i];
        if (r) { const v = +d.reading; if (String(d.reading == null ? '' : d.reading).trim() === '' || !isFinite(v) || v < r.min || v > r.max) return E('err_reading', { a: r.min, b: r.max, u: r.unit }); }
        return null;
      },
      apply: (S, ev, P) => { P.sop[ev.d.i] = { t: ev.t, by: ev.by, photo: ev.d.photo, note: str(ev.d.note), reading: SOP_READ[ev.d.i] ? +ev.d.reading : undefined }; }
    },
    INSPECT_REQUEST: {
      roles: ['tech'], stages: ['installing', 'install_fix'], who: 'tech',
      guard: (S, u, P) => (sopNext(P) < SOP.length ? 'err_steps_left' : openCorr(P, 'install').length ? 'err_fix_first' : null),
      apply: (S, ev, P) => { if (!P.qc) P.qc = leastBusy(S, 'qc', 'qc'); setStage(P, 'qc_final', ev); }
    },
    QC_FINAL: {
      roles: ['qc'], stages: ['qc_final'], who: 'qc',
      check: (S, d) => (!QC_FINAL_CHECKS.every(k => ['pass', 'fail'].includes((d.checks || {})[k])) ? 'err_all_checks' : !photos(d.photos) ? 'err_photo' : null),
      apply: (S, ev, P) => {
        const fails = QC_FINAL_CHECKS.filter(k => ev.d.checks[k] === 'fail');
        P.qcFinal.push({ checks: ev.d.checks, photos: ev.d.photos, note: str(ev.d.note), outcome: fails.length ? 'fix' : 'passed', t: ev.t, by: ev.by });
        if (!fails.length) { setStage(P, P.schedule && P.schedule.final > 0 ? 'final_pay' : 'handover', ev); return; }
        fails.forEach((k, i) => P.corrections.push({ id: ev.id + 'f' + i, scope: 'install', k: 'qcf_fix_' + k, t: ev.t, done: null }));
        setStage(P, 'install_fix', ev);
      }
    },
    HAND_SIGN: {
      roles: ['customer', 'tech', 'qc'], stages: ['handover'],
      check: (S, d, P, u) => {
        if (!['customer', 'tech', 'qc'].includes(d.slot)) return 'err_slot';
        if (P.hand[d.slot]) return 'err_done_already';
        const may = d.slot === 'customer' ? actsAs(S, u, ['customer', 'tech']) && (u.role !== 'customer' || u.uid === P.customer)
          : d.slot === 'tech' ? actsAs(S, u, ['tech']) && (u.role !== 'tech' || u.uid === P.tech)
          : actsAs(S, u, ['qc']) && (u.role !== 'qc' || !P.qc || u.uid === P.qc);
        if (!may) return 'err_access';
        return !d.sig || !str(d.name) ? 'err_signature' : null;
      },
      apply: (S, ev, P) => { P.hand[ev.d.slot] = { t: ev.t, by: ev.by, sig: ev.d.sig, name: str(ev.d.name) }; }
    },
    HAND_COMPLETE: {
      roles: ['admin', 'owner', 'qc'], stages: ['handover'],
      guard: (S, u, P) => (!['customer', 'tech', 'qc'].every(s => P.hand[s]) ? 'err_signatures_left' : null),
      apply: (S, ev, P) => {
        P.done = { t: ev.t, by: ev.by, warrantyMonths: +S.config.warrantyMonths, amcVisits: +S.config.amcVisits, liftCode: 'L-' + P.id.split('-').pop() + '-' + sha256(ev.id).slice(0, 4).toUpperCase() };
        setStage(P, 'amc', ev);
      }
    },

    /* ----- after handover ----- */
    AMC_VISIT: {
      roles: ['tech', 'qc'], stages: ['amc'],
      guard: (S, u, P) => (!nextAmc(P) ? 'err_no_visit_due' : null),
      check: (S, d) => (!AMC_CHECKS.every(k => ['pass', 'fail'].includes((d.checks || {})[k])) ? 'err_all_checks' : !d.photo ? 'err_photo' : null),
      apply: (S, ev, P) => { P.amc.visits.push({ t: ev.t, by: ev.by, checks: ev.d.checks, photo: ev.d.photo, note: str(ev.d.note) }); }
    },
    TICKET_OPEN: {
      roles: ['customer', 'sales', 'admin', 'owner', 'tech', 'qc'], stages: ['amc'],
      check: (S, d) => (!TICKET_KINDS.some(([k]) => k === d.kind) ? 'err_kind' : !SEVERITIES.some(([k]) => k === d.severity) ? 'err_severity' : !str(d.text) ? 'err_note' : null),
      apply: (S, ev, P) => { P.amc.tickets.push({ id: ev.id, kind: ev.d.kind, severity: ev.d.severity, text: str(ev.d.text), t: ev.t, by: ev.by, to: P.tech || '', closed: null }); }
    },
    TICKET_ASSIGN: {
      roles: ['admin', 'owner', 'qc'], stages: ['amc'],
      check: (S, d, P) => { const x = P.amc.tickets.find(k => k.id === d.tid); const tch = S.users[d.uid]; return !x || x.closed ? 'err_ticket' : !tch || !tch.active || !['tech', 'qc'].includes(tch.role) ? 'err_pick_tech' : null; },
      apply: (S, ev, P) => { P.amc.tickets.find(k => k.id === ev.d.tid).to = ev.d.uid; }
    },
    TICKET_CLOSE: {
      roles: ['tech', 'qc', 'admin', 'owner'], stages: ['amc'],
      check: (S, d, P, u) => {
        const x = P.amc.tickets.find(k => k.id === d.tid);
        if (!x || x.closed) return 'err_ticket';
        if (u.role === 'tech' && x.to !== u.uid) return 'err_not_yours';
        if (!ROOT_CAUSES.some(([k]) => k === d.cause)) return 'err_cause';
        return !str(d.note) ? 'err_note' : null;
      },
      apply: (S, ev, P) => { P.amc.tickets.find(k => k.id === ev.d.tid).closed = { t: ev.t, by: ev.by, cause: ev.d.cause, note: str(ev.d.note), photo: ev.d.photo || '' }; }
    },

    /* ----- problems and messages ----- */
    BLOCKER_RAISE: {
      roles: ['sales', 'tech', 'supplier', 'qc', 'customer', 'field', 'admin', 'owner'], stages: OPEN_STAGES,
      check: (S, d) => (!BLOCK_REASONS.some(([k]) => k === d.reason) ? 'err_reason' : !str(d.text) ? 'err_note' : null),
      apply: (S, ev, P) => { P.blockers.push({ id: ev.id, reason: ev.d.reason, text: str(ev.d.text), photo: ev.d.photo || '', t: ev.t, by: ev.by, open: true }); }
    },
    BLOCKER_RESOLVE: {
      roles: ['admin', 'owner', 'sales', 'supplier'],
      check: (S, d, P, u) => {
        const b = P.blockers.find(x => x.id === d.bid);
        if (!b || !b.open) return 'err_item';
        const owner = (BLOCK_REASONS.find(x => x[0] === b.reason) || [])[2];
        if (!OFFICE.includes(u.role) && u.role !== owner) return 'err_access';
        return !str(d.note) ? 'err_note' : null;
      },
      apply: (S, ev, P) => { const b = P.blockers.find(x => x.id === ev.d.bid); b.open = false; b.solved = { t: ev.t, by: ev.by, note: str(ev.d.note) }; }
    },
    MSG_POST: {
      roles: ROLES,
      check: (S, d) => (!str(d.text) ? 'err_note' : str(d.text).length > 1000 ? 'err_too_long' : null),
      apply: (S, ev, P) => { P.chat.push({ id: ev.id, t: ev.t, by: ev.by, text: str(ev.d.text) }); }
    }
  };
  /* an approver who is not the quote maker; below the floor or above the Admin limit needs the Owner */
  function approverWhyNot(S, u, P) {
    const q = lastQuote(P); if (!q) return 'err_no_quote';
    const ownerOnly = q.calc.why.includes('below_floor') || q.calc.why.includes('over_admin');
    if (ownerOnly && u.role !== 'owner') return 'err_owner_only';
    if (q.by === u.uid) {
      const others = activeUsers(S).filter(x => x.uid !== u.uid && (ownerOnly ? x.role === 'owner' : OFFICE.includes(x.role)));
      if (others.length) return 'err_own_quote';
    }
    return null;
  }

  /* the one guard used by buttons, task lists and saving: role, assignment, stage, visibility */
  function guard(S, uid, type, pid, ev) {
    const A = ACTIONS[type]; if (!A) return 'err_action';
    if (type === 'ORG_CREATE') return A.guard(S);
    const u = S.users[uid];
    if (!u || !u.active) return 'err_access';
    if (A.roles && !actsAs(S, u, A.roles)) return 'err_role_not_allowed';
    if (A.noProject || A.newProject) return A.guard ? A.guard(S, u, null, ev) : null;
    const P = S.projects[pid];
    if (!P) return 'err_project';
    if (!canSee(S, uid, P)) return 'err_access';
    if (A.stages && !A.stages.includes(P.stage)) return 'err_stage';
    if (A.who && u.role === A.who && P[A.who] && P[A.who] !== uid) return 'err_not_yours';
    return A.guard ? A.guard(S, u, P, ev) : null;
  }
  const can = (S, uid, type, pid) => !guard(S, uid, type, pid);
  function validate(S, ev) {
    if (!ev || !ev.id || !ev.type || !ev.t || !ev.by) return 'err_bad_record';
    const g = guard(S, ev.by, ev.type, ev.pid, ev); if (g) return g;
    const A = ACTIONS[ev.type];
    if (!A.check) return null;
    return A.check(S, ev.d || {}, ev.pid ? S.projects[ev.pid] : null, S.users[ev.by], ev);
  }
  /* apply an already-validated event */
  function apply(S, ev) {
    const A = ACTIONS[ev.type];
    const P = ev.pid ? S.projects[ev.pid] : null;
    A.apply(S, ev, P, S.users[ev.by]);
    S.log.push({ id: ev.id, type: ev.type, by: ev.by, t: ev.t, pid: ev.pid || '' });
  }
  /* rebuild state from events; invalid records are kept aside, never applied */
  function replay(events) {
    const S = initState(), rejected = [];
    const seen = new Set();
    for (const ev of events.slice().sort(evOrder)) {
      if (seen.has(ev.id)) continue; seen.add(ev.id);
      const why = validateAt(S, ev);
      if (why) { rejected.push({ ev, why }); continue; }
      apply(S, ev);
    }
    return { S, rejected };
  }
  const evOrder = (a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : (a.n || 0) - (b.n || 0) || (a.id < b.id ? -1 : 1));
  /* validate as of the record's own time (rules about "today" use the record date, not the replay date) */
  function validateAt(S, ev) {
    const keep = NOW_AT;
    try { const at = Date.parse(ev.t); if (!isFinite(at)) return 'err_bad_record'; NOW_AT = at; return validate(S, ev); }
    catch (e) { return 'err_bad_record'; }
    finally { NOW_AT = keep; }
  }

  /* ---------- what must happen next (single task engine) ---------- */
  function needs(S, P) {
    const out = [], add = (k, roles, o = {}) => out.push(Object.assign({ k, roles, pid: P.id, since: P.since }, o));
    const c = S.config, q = lastQuote(P);
    const payNeed = purpose => {
      const p = activePay(P, purpose);
      if (!p) { add('record_payment', ['sales', 'finance', 'customer'], { field: 'sales', purpose, type: 'PAY_RECORD' }); return false; }
      if (p.status === 'pending') add('verify_payment', ['finance'], { purpose, payId: p.id, not: p.recordedBy, type: 'PAY_VERIFY', since: p.t, urgent: true });
      return p.status === 'confirmed';
    };
    switch (P.stage) {
      case 'new': add('review_lead', ['sales'], { field: 'sales', type: 'LEAD_ACCEPT' }); break;
      case 'returned': add('fix_lead', ['field', 'sales', 'admin', 'owner'], { uid: P.createdBy, type: 'LEAD_FIX' }); break;
      case 'accepted': add('call_customer', ['sales'], { field: 'sales', type: 'CALL_LOG' }); break;
      case 'contacted': add('write_needs', ['sales'], { field: 'sales', type: 'NEEDS_SAVE' }); break;
      case 'requirements': add('make_quote', ['sales'], { field: 'sales', type: 'QUOTE_MAKE' }); break;
      case 'quote_approval': add('approve_quote', ['admin', 'owner'], { type: 'QUOTE_APPROVE', urgent: true }); break;
      case 'quote_ready': add('send_quote', ['sales'], { field: 'sales', type: 'QUOTE_SEND' }); break;
      case 'quoted': add('get_decision', ['sales'], { field: 'sales', type: 'DEAL_WON', due: P.followUp && P.followUp.due, till: quoteValidTill(q, c), urgent: quoteExpired(q, c) }); break;
      case 'won': add('prepare_agreement', ['sales'], { field: 'sales', type: 'AGREE_PREPARE' }); break;
      case 'agreement': add('sign_agreement', ['customer', 'sales'], { field: 'sales', type: 'AGREE_SIGN' }); break;
      case 'signed': payNeed('token'); break;
      case 'site_prep': add(prepDone(P) ? 'request_qc' : 'prepare_site', ['customer', 'sales'], { field: 'sales', type: prepDone(P) ? 'QC_REQUEST' : 'PREP_TICK' }); break;
      case 'qc_site': add('inspect_site', ['qc'], { field: 'qc', type: 'QC_SITE' }); break;
      case 'site_fix': add(openCorr(P, 'site').length ? 'fix_site' : 'request_qc', ['customer', 'sales'], { field: 'sales', type: openCorr(P, 'site').length ? 'CORR_DONE' : 'QC_REQUEST' }); break;
      case 'site_ok': add('release', ['admin', 'owner'], { type: 'RELEASE' }); break;
      case 'material_order': add(P.po && P.po.accepted ? 'dispatch' : 'accept_po', ['supplier'], { field: 'supplier', type: P.po && P.po.accepted ? 'DISPATCH' : 'PO_ACCEPT', urgent: !!(P.po && P.po.accepted && P.po.accepted.date < todayStr()) }); break;
      case 'dispatched': add('arrival', ['tech', 'supplier'], { field: 'tech', type: 'ARRIVAL' }); break;
      case 'arrived':
        if (payNeed('arrival')) add('material_handover', ['tech'], { field: 'tech', type: 'MHAND' });
        else add('wait_payment', ['tech'], { field: 'tech', info: true });
        break;
      case 'installing': {
        const n = sopNext(P);
        if (P.schedule && P.schedule.cabin && !payConfirmed(P, 'cabin')) {
          const ok = payNeed('cabin');
          if (!ok && n >= CABIN_STEP && n < SOP.length) { add('wait_cabin_pay', ['tech'], { field: 'tech', info: true }); break; }
        }
        if (n >= SOP.length) { add(openCorr(P, 'install').length ? 'fix_install' : 'request_inspection', ['tech'], { field: 'tech', type: openCorr(P, 'install').length ? 'CORR_DONE' : 'INSPECT_REQUEST' }); break; }
        if (+c.dailySafety && !safetyToday(P)) add('safety_check', ['tech'], { field: 'tech', type: 'SAFETY', urgent: true, since: todayStr() + 'T00:00:00' });
        else add('install', ['tech'], { field: 'tech', type: 'SOP_STEP', step: n });
        break;
      }
      case 'qc_final': add('final_inspect', ['qc'], { field: 'qc', type: 'QC_FINAL' }); break;
      case 'install_fix':
        if (openCorr(P, 'install').length) add('fix_install', ['tech'], { field: 'tech', type: 'CORR_DONE' });
        else add('request_inspection', ['tech'], { field: 'tech', type: 'INSPECT_REQUEST' });
        break;
      case 'final_pay': payNeed('final'); break;
      case 'handover':
        if (['customer', 'tech', 'qc'].every(s => P.hand[s])) add('complete_handover', ['admin', 'owner', 'qc'], { type: 'HAND_COMPLETE' });
        else {
          if (!P.hand.customer) add('sign_handover', ['customer', 'tech'], { field: P.customer ? 'customer' : 'tech', slot: 'customer', type: 'HAND_SIGN' });
          if (!P.hand.tech) add('sign_handover', ['tech'], { field: 'tech', slot: 'tech', type: 'HAND_SIGN' });
          if (!P.hand.qc) add('sign_handover', ['qc'], { field: 'qc', slot: 'qc', type: 'HAND_SIGN' });
        }
        break;
      case 'amc': {
        const v = nextAmc(P);
        if (v && v.due <= addDays(7)) add('amc_visit', ['tech', 'qc'], { field: 'tech', type: 'AMC_VISIT', due: v.due, since: v.due + 'T00:00:00', urgent: v.due < todayStr() });
        for (const tk of P.amc.tickets) if (!tk.closed) add('close_ticket', ['tech', 'qc', 'admin', 'owner'], { uid: tk.to, tid: tk.id, type: 'TICKET_CLOSE', since: tk.t, urgent: ['trapped', 'unsafe'].includes(tk.severity) });
        break;
      }
    }
    if (P.stage === 'quoted' && P.followUp && P.followUp.due <= todayStr()) { const g = out.find(x => x.k === 'get_decision'); if (g) g.urgent = true; }
    for (const b of P.blockers) if (b.open) add('resolve_blocker', uniq([(BLOCK_REASONS.find(x => x[0] === b.reason) || [])[2], 'admin', 'owner']), { bid: b.id, type: 'BLOCKER_RESOLVE', since: b.t, urgent: true });
    return out.map(x => Object.assign(x, lateness(S, P, x)));
  }
  /* due date and whether it is late; late work is shown to the office as "stuck" after escalateDays */
  function lateness(S, P, task) {
    const c = S.config;
    let due = task.due || null;
    if (!due && task.k === 'safety_check') due = todayStr();
    if (!due && task.since && !task.info) {
      const days = P.stage === 'installing' && task.k === 'install' && P.mhand ? +c.installDays : SLA[P.stage];
      if (days != null) due = addDays(days, new Date(P.stage === 'installing' && P.mhand ? P.mhand.t : task.since));
    }
    const today = todayStr();
    const lateDays = due && due < today ? daysBetween(due + 'T00:00:00', today + 'T00:00:00') : 0;
    return { dueDay: due, lateDays, late: lateDays > 0, stuck: lateDays >= +c.escalateDays };
  }
  /* is this task for this person? Their role, and the job is theirs (or nobody's) */
  function taskFor(S, uid, task) {
    const u = S.users[uid], P = S.projects[task.pid];
    if (!u || !canSee(S, uid, P) || task.info && !task.roles.includes(u.role)) return false;
    if (task.uid && task.uid !== uid && !(OFFICE.includes(u.role) && !S.users[task.uid])) return false;
    if (task.not === uid && Object.values(S.users).some(x => x.active && x.uid !== uid && actsAs(S, x, task.roles))) return false;
    if (task.type && !task.info && guard(S, uid, task.type, task.pid)) return false;
    if (!actsAs(S, u, task.roles)) return false;
    if (u.role === 'customer') return P.customer === uid;
    const f = task.field;
    if (f && P[f] && u.role === f && P[f] !== uid) return false;
    return true;
  }
  function tasksFor(S, uid) {
    const out = [];
    for (const P of Object.values(S.projects)) if (canSee(S, uid, P)) for (const k of needs(S, P)) if (taskFor(S, uid, k)) out.push(k);
    const rank = x => (x.urgent || x.late ? 0 : 1) * 1e9 - (x.lateDays || 0) * 1e3 + (x.info ? 2e9 : 0);
    return out.sort((a, b) => rank(a) - rank(b) || String(a.dueDay || '9').localeCompare(String(b.dueDay || '9')) || String(a.since).localeCompare(String(b.since)));
  }
  /* for the office: work that is late and sitting with someone else */
  function stuckWork(S) {
    const out = [];
    for (const P of Object.values(S.projects)) for (const k of needs(S, P)) if (k.stuck && !k.info) out.push(k);
    return out.sort((a, b) => b.lateDays - a.lateDays);
  }
  /* who is the next step waiting for (names), for "waiting for" lines */
  function waitingOn(S, P) {
    const ns = needs(S, P).filter(x => !x.info);
    if (!ns.length) return null;
    const k = ns[0];
    const ids = k.uid ? [k.uid] : k.field && P[k.field] ? [P[k.field]] : [];
    return { task: k, people: ids.map(id => S.users[id]).filter(Boolean), roles: k.roles };
  }

  /* ---------- numbers for the office dashboard ---------- */
  function dashboard(S) {
    const Ps = Object.values(S.projects);
    const open = Ps.filter(P => OPEN_STAGES.includes(P.stage));
    const month = todayStr().slice(0, 7);
    const won = Ps.filter(P => P.wonAt && P.wonAt.slice(0, 7) === month && P.stage !== 'lost');
    const pipeline = sum(Ps.filter(P => ['quoted', 'quote_ready', 'quote_approval'].includes(P.stage)).map(P => (lastQuote(P) || { calc: { total: 0 } }).calc.total));
    const received = sum(Ps.flatMap(P => P.payments.filter(p => p.status === 'confirmed' && p.vt && p.vt.slice(0, 7) === month).map(p => p.amount)));
    const pending = sum(Ps.flatMap(P => P.payments.filter(p => p.status === 'pending').map(p => p.amount)));
    const byPhase = PHASES.map(([ph], i) => ({ ph, n: open.filter(P => STAGES[P.stage][0] === i).length }));
    const leads = Ps.filter(P => P.t.slice(0, 7) === month).length;
    const decided = Ps.filter(P => P.stage === 'lost' || P.wonAt);
    const winRate = decided.length ? Math.round(Ps.filter(P => P.wonAt).length / decided.length * 100) : 0;
    const tickets = Ps.flatMap(P => P.amc.tickets.filter(x => !x.closed));
    return { open: open.length, wonCount: won.length, wonValue: sum(won.map(P => P.agreement ? P.agreement.total : (lastQuote(P) || { calc: { total: 0 } }).calc.total)), pipeline, received, pending, byPhase, leads, winRate, amc: Ps.filter(P => P.stage === 'amc').length, tickets: tickets.length, stuck: stuckWork(S).length };
  }

  root.AIEC = Object.assign(root.AIEC || {}, {
    DAY, now, nowISO, setNow, pad, todayStr, dayOf, addDays, daysBetween, sum, uniq, digits, phone10, validPhone, rnd, clone, str,
    sha256, pinHash, makePin, pinOk,
    ROLES, STAFF_ROLES, OFFICE, ROLE_ICON, PHASES, STAGES, STAGE_ORDER, stageIdx, PRE_WON, LOSABLE, OPEN_STAGES, SLA,
    CONTACT_ROLES, SHAFT, LOST_REASONS, RETURN_REASONS, CALL_OUTCOMES, PREP_ITEMS, QC_SITE_CHECKS, QC_SITE_MEAS, QC_FINAL_CHECKS,
    SOP, CABIN_STEP, SOP_READ, SAFETY_ITEMS, BLOCK_REASONS, AMC_CHECKS, TICKET_KINDS, SEVERITIES, ROOT_CAUSES, PAY_MODES,
    LIFT_TYPES, CAPACITIES, FINISHES, JOB_KINDS, USES, TIMELINES, PURPOSES, PAY_STAGE,
    DEFAULT_CONFIG, CFG_LIMITS, TEXT_CFG, RULE_GROUPS,
    calcQuote, paySchedule, materialList, lastQuote, quoteValidTill, quoteExpired, activePay, payConfirmed, paidTotal, dueOf, payOpen,
    sopNext, prepDone, openCorr, safetyToday, leadHeat, warrantyEnd, amcDue, nextAmc,
    initState, activeUsers, firstActive, canSee, seesMargin, seesMoney, actsAs,
    ACTIONS, guard, can, validate, validateAt, apply, replay, evOrder, needs, tasksFor, taskFor, stuckWork, waitingOn, dashboard
  });
})(typeof window !== 'undefined' ? window : globalThis);
