/* =====================================================================
   Task flows: every task opens one focused, step-by-step screen.
   - one question per step, inline errors, a sticky action bar
   - drafts saved as you type (long forms)
   - the same rule table checks each step and the final record
   - a "done" screen says what happened, who is next, and opens your next task
   ===================================================================== */
(function (A) {
  'use strict';
  const U = A.UI, { esc, t } = U;
  const Screens = A.Screens, Actions = A.Actions;
  const getPath = (o, p) => p.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
  const setPath = (o, p, v) => { const ks = p.split('.'); let x = o; ks.slice(0, -1).forEach(k => { if (x[k] == null || typeof x[k] !== 'object') x[k] = {}; x = x[k]; }); x[ks[ks.length - 1]] = v; };
  const pf = (k, label, val) => `<div class="check-row"><span class="lab">${esc(label)}</span><div class="pf" role="group" aria-label="${esc(label)}"><button type="button" class="p" data-a="set" data-k="${esc(k)}" data-v="pass" aria-pressed="${val === 'pass'}">✓ ${esc(t('pass'))}</button><button type="button" class="f" data-a="set" data-k="${esc(k)}" data-v="fail" aria-pressed="${val === 'fail'}">✗ ${esc(t('fail'))}</button></div></div>`;
  const tick = (k, label, on, sub = '') => `<button type="button" class="tick" role="checkbox" aria-checked="${!!on}" data-a="toggle" data-k="${esc(k)}"><span class="box" aria-hidden="true">${on ? '✓' : ''}</span><span style="flex:1">${esc(label)}${sub ? `<div class="muted small" style="font-weight:500">${esc(sub)}</div>` : ''}</span></button>`;
  const bump = (k, v, min, max, label) => `<div class="field"><span class="label">${esc(label)}</span><div class="row-flex" style="flex-wrap:nowrap"><button type="button" class="btn" data-a="bump" data-k="${esc(k)}" data-v="-1" data-min="${min}" data-max="${max}" aria-label="−">−</button><input data-k="${esc(k)}" type="number" inputmode="numeric" value="${esc(v)}" min="${min}" max="${max}" style="text-align:center;font-weight:800;font-size:1.3rem" aria-label="${esc(label)}"><button type="button" class="btn" data-a="bump" data-k="${esc(k)}" data-v="1" data-min="${min}" data-max="${max}" aria-label="+">+</button></div></div>`;
  const sigBlock = () => `<div class="field"><span class="label req">${esc(t('signature'))}</span><div class="sigpad"><canvas id="sig" aria-label="${esc(t('sign_here'))}"></canvas><span class="base"></span><span class="hint">✍️ ${esc(t('sign_here'))}</span></div><div class="row-flex"><button type="button" class="btn sm" data-a="sigClear">↺ ${esc(t('clear'))}</button>${A.Store.mode === 'practice' ? `<button type="button" class="btn sm" data-a="sigPractice">🎓 ${esc(t('practice_sign'))}</button>` : ''}</div></div>`;
  const kv = rows => `<dl class="kv">${rows.filter(r => r && r[1] !== '' && r[1] != null).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
  const leadCard = P => `<div class="card stack"><div class="card-head" style="margin:0"><span class="avatar s" aria-hidden="true">👤</span><div style="flex:1"><b>${esc(P.lead.name)}</b><div class="muted small">${esc(P.lead.building ? P.lead.building + ' · ' : '')}${esc(P.lead.area || P.lead.address)}</div></div>${P.lead.phone ? `<a class="btn sm" href="tel:${esc(P.lead.phone)}" aria-label="${esc(t('call'))}">📞</a>` : ''}</div></div>`;
  const photosOf = ids => `<div class="thumbs">${(ids || []).filter(Boolean).map(id => U.imgTag(id)).join('')}</div>`;
  const isPractice = () => A.Store.mode === 'practice';

  /* ---------- engine ---------- */
  const Flow = A.Flow = {
    active: null, pad: null,
    key: (name, pid, q) => [A.Store.mode, name, pid || '', JSON.stringify(q || {})].join('|'),
    draftKey: (name, pid) => 'aiec.draft.' + A.Store.mode + '.' + A.Session.uid + '.' + name + '.' + (pid || 'new'),
    saveDraft() { const f = this.active; if (f && f.def.draft && !f.done) A.LS.set(this.draftKey(f.name, f.pid), { ctx: f.ctx, step: f.step, at: Date.now() }); },
    clearDraft() { const f = this.active; if (f) A.LS.del(this.draftKey(f.name, f.pid)); },
    input(el) {
      const f = this.active; if (!f) return;
      let v = el.value;
      if (el.type === 'number') v = el.value === '' ? '' : el.value;
      setPath(f.ctx, el.dataset.k, v);
      f.err = null; const e = document.getElementById('flow-err'); if (e) e.textContent = '';
      if (f.def.live) f.def.live(f.ctx, document.getElementById('flow'), f);
      clearTimeout(this._t); this._t = setTimeout(() => this.saveDraft(), 400);
    },
    rerender() { this.saveDraft(); A.App.render(); }
  };

  Screens.flow = ({ S, u, parts, q }) => {
    const name = parts[1], pid = parts[2] || '';
    const def = FLOWS[name];
    if (!def) return Screens.notfound();
    const P = pid ? S.projects[pid] : null;
    if (pid && (!P || !A.canSee(S, u.uid, P))) return { title: t('not_found'), back: '/home', body: U.empty('🔒', t('err_access')) };
    const key = Flow.key(name, pid, q);
    if (!Flow.active || Flow.active.key !== key) {
      const ctx = def.init ? def.init(P, S, u, q) : {};
      Flow.active = { key, name, pid, q, def, ctx, step: 0, err: null, done: null, resumed: false };
      if (def.draft) {
        const d = A.LS.get(Flow.draftKey(name, pid), null);
        if (d && Date.now() - d.at < 7 * 864e5) { Flow.active.ctx = Object.assign(ctx, d.ctx); Flow.active.step = d.step || 0; Flow.active.resumed = true; }
      }
    }
    const f = Flow.active;
    const back = P ? '/job/' + P.id : '/home';
    const title = def.title(P, f.ctx, S, u);
    if (f.done) return doneView(f, S, u, P, title);
    /* the same guard the save uses: if this person cannot do it now, say why and who can */
    const g = def.type ? A.guard(S, u.uid, def.type, pid) : def.guard ? def.guard(S, u, P, f.ctx) : null;
    if (g) return blockedView(g, P, S, title, back, def);
    const steps = def.steps(P, f.ctx, S, u).filter(Boolean);
    if (f.step >= steps.length) f.step = steps.length - 1;
    const st = steps[f.step];
    const last = f.step === steps.length - 1;
    const dots = steps.length > 1 ? `<div class="steps-dots" aria-hidden="true">${steps.map((s, i) => `<i class="${i < f.step ? 'done' : i === f.step ? 'on' : ''}"></i>`).join('')}</div><div class="tiny muted">${esc(t('step_of', { n: f.step + 1, m: steps.length }))}${st.title ? ' · ' + esc(st.title) : ''}</div>` : '';
    const bar = st.bar ? st.bar(P, f.ctx, S, u) : `<div class="actionbar">
        ${f.step > 0 ? `<button class="btn back" type="button" data-a="flowBack">← ${esc(t('back'))}</button>` : ''}
        <button class="btn ${last ? 'primary' : 'dark'} lg" type="button" data-a="flowNext">${esc(last ? (def.submitLabel ? def.submitLabel(P, f.ctx, S, u) : t('save')) : t('next'))} ${last ? '✓' : '→'}</button></div>`;
    const body = `<div id="flow" class="stack">
      <div class="flow-head">${P ? `<span class="ctx">${esc(P.id)} · ${esc(P.lead.name)}</span>` : ''}${dots}</div>
      ${f.resumed && f.step === 0 ? U.banner('💾', `${esc(t('draft_resumed'))} <button type="button" class="link-btn" data-a="flowRestart">${esc(t('start_again'))}</button>`, 'gold') : ''}
      ${st.render(P, f.ctx, S, u)}
      <p id="flow-err" role="alert" class="err-msg" style="color:var(--bad);font-weight:700;min-height:1px">${f.err ? esc(U.errText(f.err)) : ''}</p>
      ${bar}</div>`;
    return { title, sub: P ? P.id : '', back, body, noNav: false,
      say: [title, st.title || ''].join('. '),
      after(root) {
        const c = root.querySelector('#sig');
        Flow.pad = c ? U.sigPad(c) : null;
        if (st.mount) st.mount(root, P, f.ctx, S, u);
        if (f.err) { const e = root.querySelector('#flow-err'); if (e) e.scrollIntoView({ block: 'center' }); }
      } };
  };

  function blockedView(g, P, S, title, back, def) {
    const k = typeof g === 'object' ? g.k : g;
    const waits = { err_wait_payment: '💰', err_wait_cabin: '💰', err_safety_first: '🦺', err_accept_po_first: '📑', err_prep_first: '🧱', err_fix_first: '🛠️', err_steps_left: '🔧', err_signatures_left: '✍️', err_work_stopped: '⛔', err_quote_expired: '⌛', err_need_licence: '⚖️', err_wait_permit: '⚖️' };
    let extra = '';
    if (k === 'err_safety_first' && P) extra = `<a class="btn primary block lg" href="#/flow/SAFETY/${esc(P.id)}">🦺 ${esc(t('tk_safety_check'))}</a>`;
    if (k === 'err_quote_expired' && P) extra = `<a class="btn primary block lg" href="#/flow/QUOTE_MAKE/${esc(P.id)}">🧮 ${esc(t('tk_make_quote'))}</a>`;
    if ((k === 'err_need_licence' || k === 'err_wait_permit') && P && A.can(S, A.Session.uid, 'STAT_RECORD', P.id)) extra = `<a class="btn primary block lg" href="#/flow/STAT_RECORD/${esc(P.id)}?kind=${k === 'err_need_licence' ? 'licence' : 'permit'}">⚖️ ${esc(t(k === 'err_need_licence' ? 'tk_record_licence' : 'tk_record_permit'))}</a>`;
    if (k === 'err_fix_first' && P) extra = `<a class="btn primary block lg" href="#/flow/FIX/${esc(P.id)}">🛠️ ${esc(t('tk_fix_site'))}</a>`;
    const w = P ? A.waitingOn(S, P) : null;
    return { title, sub: P ? P.id : '', back, body: `<div class="stack-l">${U.empty(waits[k] || '🔒', U.errText(g), w && !['err_stage', 'err_need_licence', 'err_wait_permit'].includes(k) ? t('waiting_for', { who: A.whoFor(S, P, w.task) }) + ' — ' + U.taskTitle(w.task) : '')}${extra}<a class="btn block" href="#${back}">${esc(P ? t('open_project') : t('nav_home'))}</a></div>` };
  }

  function doneView(f, S, u, P0, title) {
    const P = f.pid ? S.projects[f.pid] : (f.done.pid ? S.projects[f.done.pid] : null);
    const mine = A.tasksFor(S, u.uid).filter(k => !k.info);
    const sameJob = P ? mine.find(k => k.pid === P.id) : null;
    const nextK = sameJob || mine[0];
    let nextLine = '';
    if (P) {
      if (P.stage === 'amc') nextLine = t('next_amc');
      else if (P.stage === 'lost') nextLine = t('next_lost');
      else {
        const w = A.waitingOn(S, P);
        if (w) nextLine = A.taskFor(S, u.uid, w.task) ? t('next_you', { task: U.taskTitle(w.task) }) : t('next_who', { who: A.whoFor(S, P, w.task), task: U.taskTitle(w.task) });
        else nextLine = t('next_none');
      }
    }
    const body = `<div class="stack-l"><div class="success" role="status"><div class="big" aria-hidden="true">✓</div><h1>${esc(t('done_title'))}</h1></div>
      <div class="card stack"><h2 class="h3">${esc(t('what_happened'))}</h2><p>${esc(f.done.what || t('saved_item'))}</p>${nextLine ? `<h2 class="h3">${esc(t('what_next'))}</h2><p>${esc(nextLine)}</p>` : ''}</div>
      ${f.done.extra || ''}
      <div class="stack">
        ${nextK ? `<a class="btn primary block lg" href="#${A.taskPath(nextK)}" data-a="flowGoNext" data-v="${esc(A.taskPath(nextK))}">▶ ${esc(U.taskTitle(nextK))}${nextK.pid !== (P && P.id) ? ' · ' + esc(nextK.pid) : ''}</a>` : ''}
        ${P ? `<a class="btn block" href="#/job/${esc(P.id)}">${esc(t('open_project'))}</a>` : ''}
        <a class="btn block ghost" href="#/home">${esc(t('nav_home'))}</a>
      </div></div>`;
    return { title, sub: P ? P.id : '', back: P ? '/job/' + P.id : '/home', body, say: t('done_title') + '. ' + (f.done.what || '') + '. ' + nextLine };
  }

  /* run the step's check, then go on or save */
  async function next() {
    const f = Flow.active; if (!f) return;
    const S = A.Store.S, u = S.users[A.Session.uid], P = f.pid ? S.projects[f.pid] : null;
    const steps = f.def.steps(P, f.ctx, S, u).filter(Boolean);
    const st = steps[f.step];
    if (st.check) {
      const err = await st.check(P, f.ctx, S, u);
      if (err) { f.err = err; A.App.render(); return; }
    }
    if (f.step < steps.length - 1) { f.step++; f.err = null; Flow.rerender(); window.scrollTo(0, 0); return; }
    await submit();
  }
  async function submit(override) {
    const f = Flow.active;
    const S = A.Store.S, u = S.users[A.Session.uid], P = f.pid ? S.projects[f.pid] : null;
    let rec;
    try { rec = override || await f.def.submit(P, f.ctx, S, u); }
    catch (e) { f.err = e.message || String(e); A.App.render(); return; }
    if (!rec) return;
    if (rec.err) { f.err = rec.err; A.App.render(); return; }
    A.App.suspend = true;
    const r = await A.Store.dispatch(rec.type, rec.pid != null ? rec.pid : f.pid, rec.d);
    A.App.suspend = false;
    if (!r.ok) { f.err = r.err; A.App.render(); return; }
    Flow.clearDraft();
    const S2 = A.Store.S, P2 = S2.projects[rec.pid || f.pid];
    f.done = { what: f.def.what ? f.def.what(P2, f.ctx, S2, u, r.ev) : t('saved_item'), pid: rec.pid || f.pid, extra: f.def.doneExtra ? f.def.doneExtra(P2, f.ctx, S2, u) : '' };
    f.err = null;
    A.App.render(); window.scrollTo(0, 0);
  }
  Flow.submit = submit;

  Object.assign(Actions, {
    flowNext: () => next(),
    flowBack: () => { const f = Flow.active; if (f && f.step > 0) { f.step--; f.err = null; Flow.rerender(); } },
    flowRestart: () => { const f = Flow.active; if (!f) return; Flow.clearDraft(); Flow.active = null; A.App.render(); },
    flowGoNext: el => { Flow.active = null; U.go(el.dataset.v); },
    set: el => { const f = Flow.active; if (!f) return; setPath(f.ctx, el.dataset.k, el.dataset.v); f.err = null; Flow.rerender(); },
    toggle: el => { const f = Flow.active; if (!f) return; setPath(f.ctx, el.dataset.k, !getPath(f.ctx, el.dataset.k)); f.err = null; Flow.rerender(); },
    bump: el => {
      const f = Flow.active; if (!f) return;
      const v = Math.max(+el.dataset.min, Math.min(+el.dataset.max, (+getPath(f.ctx, el.dataset.k) || 0) + (+el.dataset.v)));
      setPath(f.ctx, el.dataset.k, v); f.err = null; Flow.rerender();
    },
    photo: async el => {
      const f = Flow.active; if (!f) return;
      const id = await U.takePhoto(el.dataset.label);
      if (!id) return;
      setPath(f.ctx, el.dataset.k, id); f.err = null; Flow.rerender();
    },
    photoDel: el => { const f = Flow.active; if (!f) return; setPath(f.ctx, el.dataset.k, ''); Flow.rerender(); },
    mic: async el => {
      const f = Flow.active; if (!f) return;
      const said = await U.listen();
      if (!said) return U.toast(t('voice_none'));
      const cur = getPath(f.ctx, el.dataset.k) || '';
      setPath(f.ctx, el.dataset.k, (cur ? cur + ' ' : '') + said); Flow.rerender();
    },
    sigClear: () => Flow.pad && Flow.pad.clear(),
    sigPractice: () => Flow.pad && Flow.pad.scribble(),
    gps: async () => {
      const f = Flow.active; if (!f) return;
      U.toast(t('gps_wait'));
      const g = await U.getGPS();
      if (!g) { U.toast(t('gps_fail'), 'bad'); return; }
      setPath(f.ctx, el_k(f), g); Flow.rerender(); U.toast(t('gps_ok', { m: g.acc }), 'ok');
    },
    /* a list item that is saved on its own (site preparation, corrections) */
    itemPhoto: async el => {
      const f = Flow.active; if (!f) return;
      const id = await U.takePhoto(el.dataset.label);
      if (!id) return;
      const d = JSON.parse(el.dataset.d); d[el.dataset.field || 'photo'] = id;
      const r = await A.Store.dispatch(el.dataset.type, f.pid, d);
      if (!r.ok) U.toast(U.errText(r.err), 'bad'); else U.toast(t('saved_item'), 'ok');
    },
    flowDo: async el => { const f = Flow.active; if (!f || !f.def.actions || !f.def.actions[el.dataset.v]) return; await f.def.actions[el.dataset.v](el, f); }
  });
  const el_k = f => f.def.gpsKey || 'gps';
  /* save a signature from the pad as a picture */
  async function sigSave() {
    if (!Flow.pad || Flow.pad.isEmpty()) return null;
    return A.Store.putBlob(Flow.pad.data());
  }
  const sigCheck = () => (!Flow.pad || Flow.pad.isEmpty() ? 'err_signature' : null);
  const one = (type, d, pid) => ({ type, d, pid });
  /* a two-button bar for decide-style tasks */
  const decideBar = (noKey, noLabel, yesLabel) => () => `<div class="actionbar"><button class="btn danger" type="button" data-a="flowDo" data-v="${noKey}">${esc(noLabel)}</button><button class="btn ok lg" type="button" data-a="flowNext">✓ ${esc(yesLabel)}</button></div>`;

  /* =====================================================================
     the flows
     ===================================================================== */
  const FLOWS = A.FLOWS = {};

  /* ---------- add a new site / lead ---------- */
  FLOWS.LEAD_CREATE = {
    type: 'LEAD_CREATE', draft: true,
    title: (P, c, S, u) => t(u.role === 'field' ? 'add_site' : 'nav_new_lead'),
    init: () => ({ lead: { name: '', phone: '', contactRole: 'owner', building: '', address: '', area: '', floors: '', shaft: 'not_sure', notes: '', consent: false, gps: null }, ph: { building: '', shaft: '', more: '' } }),
    gpsKey: 'lead.gps',
    steps: (P, c, S, u) => [
      { title: t('lc_photos'), render: () => `
        ${u.role === 'field' ? U.banner('🏍️', esc(t('ride_safety')), 'warn') : ''}
        <div class="card stack"><h2>📷 ${esc(t('lc_photos_h'))}</h2><p class="muted small">${esc(t('intro2_d'))}</p>
          <div class="photos">${U.photoSlot('ph.building', c.ph.building, t('ph_building') + ' *', '🏢')}${U.photoSlot('ph.shaft', c.ph.shaft, t('ph_shaft'), '🛗')}${U.photoSlot('ph.more', c.ph.more, t('ph_more'), '➕')}</div>
          <p class="small muted">${esc(t('ph_building_hint'))}</p></div>
        <div class="card stack"><h2>📍 ${esc(t('location'))}</h2>${c.lead.gps ? U.banner('✅', esc(t('gps_saved', { a: c.lead.gps.lat, b: c.lead.gps.lng, m: c.lead.gps.acc })), 'ok') : `<p class="muted small">${esc(t('perm_loc_d'))}</p>`}<button type="button" class="btn block" data-a="gps">📍 ${esc(t(c.lead.gps ? 'gps_again' : 'gps_take'))}</button></div>`,
        check: () => (!c.ph.building ? 'err_photo_building' : null) },
      { title: t('lc_contact'), render: () => `<div class="card stack">
          ${U.input('lead.name', c.lead.name, { label: t('person_name'), req: true, auto: 'off', mic: true })}
          ${U.input('lead.phone', c.lead.phone, { label: t('phone'), req: true, type: 'tel', inputmode: 'numeric', pre: '+91', hint: t('phone_hint') })}
          ${U.field(t('contact_role'), U.seg('lead.contactRole', A.CONTACT_ROLES.map(([k, em]) => [k, t('cr_' + k), em]), c.lead.contactRole, 'big cols3'))}
          ${tick('lead.consent', t('consent_call'), c.lead.consent, t('consent_call_d'))}</div>`,
        check: () => {
          if (!A.str(c.lead.name)) return 'err_name';
          if (!A.validPhone(c.lead.phone)) return 'err_phone';
          const dup = Object.values(S.projects).find(Q => A.OPEN_STAGES.includes(Q.stage) && A.phone10(Q.lead.phone) === A.phone10(c.lead.phone));
          return dup ? { k: 'err_dup_phone', v: { id: dup.id } } : null;
        } },
      { title: t('lc_building'), render: () => `<div class="card stack">
          ${U.input('lead.building', c.lead.building, { label: t('building_name'), mic: true })}
          ${U.input('lead.address', c.lead.address, { label: t('address'), textarea: true, mic: true, hint: c.lead.gps ? t('address_optional_gps') : t('address_needed') })}
          ${U.input('lead.area', c.lead.area, { label: t('area'), mic: true })}
          ${bump('lead.floors', c.lead.floors || 2, 1, 60, t('floors'))}
          ${U.field(t('shaft_ready'), U.seg('lead.shaft', A.SHAFT.map(k => [k, t('sh_' + k)]), c.lead.shaft, 'cols3'))}
          ${U.input('lead.notes', c.lead.notes, { label: t('notes') + ' (' + t('optional') + ')', textarea: true, mic: true })}</div>`,
        check: () => (!A.str(c.lead.address) && !c.lead.gps ? 'err_address' : null) },
      { title: t('review'), render: () => `<div class="card stack"><h2>${esc(t('review_send'))}</h2>${photosOf(Object.values(c.ph))}${kv([[t('person_name'), esc(c.lead.name)], [t('phone'), esc(c.lead.phone)], [t('contact_role'), esc(t('cr_' + c.lead.contactRole))], [t('building_name'), esc(c.lead.building)], [t('address'), esc(c.lead.address)], [t('area'), esc(c.lead.area)], [t('floors'), esc(c.lead.floors || 2)], [t('shaft_ready'), esc(t('sh_' + c.lead.shaft))], [t('location'), c.lead.gps ? '✅' : '—']])}</div>
        <p class="muted small">${esc(t(u.role === 'sales' || (A.OFFICE.includes(u.role) && !A.activeUsers(S, 'sales').length) ? 'lc_after_sales' : 'lc_after_field'))}</p>` }
    ],
    submitLabel: () => t('save_site'),
    submit: (P, c, S) => {
      const d = new Date(), pid = (S.org.city || 'PUN') + '-' + String(d.getFullYear()).slice(2) + A.pad(d.getMonth() + 1) + '-' + A.rnd(4);
      return one('LEAD_CREATE', { lead: Object.assign({}, c.lead, { floors: +c.lead.floors || 2, photos: [c.ph.building, c.ph.shaft, c.ph.more].filter(Boolean) }) }, pid);
    },
    what: P => t('what_site_saved', { id: P.id })
  };

  /* ---------- sales checks a new lead ---------- */
  FLOWS.LEAD_ACCEPT = {
    type: 'LEAD_ACCEPT', title: () => t('tk_review_lead'),
    steps: (P, c, S) => [{ render: () => {
      const heat = A.leadHeat(P);
      return `${leadCard(P)}<div class="card stack"><h2 class="h3">📷 ${esc(t('photos'))}</h2><div class="photos">${P.lead.photos.map(id => `<button type="button" class="photo-slot filled" data-a="viewPhoto" data-v="${esc(id)}">${U.imgTag(id)}</button>`).join('')}</div></div>
        <div class="card stack"><div class="card-head"><h2 class="h3">🎯 ${esc(t('lead_score'))}</h2><span class="chip ${heat.n >= 50 ? 'ok' : heat.n >= 30 ? 'info' : ''}">${heat.n}/100</span></div><p class="small muted">${esc(heat.why.map(([n, k]) => '+' + n + ' ' + t(k)).join(' · ') || '—')}</p>
        ${kv([[t('phone'), `<a href="tel:${esc(P.lead.phone)}">${esc(P.lead.phone)}</a>`], [t('contact_role'), esc(t('cr_' + P.lead.contactRole))], [t('address'), esc(P.lead.address)], [t('floors'), P.lead.floors], [t('shaft_ready'), esc(t('sh_' + P.lead.shaft))], [t('location'), P.lead.gps ? `<a href="${esc(U.mapsLink(P.lead.gps))}" target="_blank" rel="noopener">${esc(t('open_map'))}</a>` : '—'], [t('notes'), esc(P.lead.notes)], [t('added_by'), esc(U.userName(P.createdBy))]])}</div>
        <p class="muted small">${esc(t('review_rule'))}</p>`;
    }, bar: decideBar('return', '↩️ ' + t('send_back'), t('accept_lead')) }],
    actions: {
      return: async (el, f) => {
        const out = await U.formSheet(t('send_back'), U.field(t('reason'), `<select data-x="reason">${A.RETURN_REASONS.map(k => `<option value="${k}">${esc(t(k))}</option>`).join('')}</select>`, { req: true }) + U.field(t('note'), '<textarea data-x="note" maxlength="500"></textarea>'), t('send_back'), el2 => ({ reason: el2.querySelector('[data-x=reason]').value, note: el2.querySelector('[data-x=note]').value }));
        if (!out) return;
        f.def = Object.assign({}, f.def, { what: P => t('what_lead_returned', { id: P.id }) });
        await submit(one('LEAD_RETURN', out));
      }
    },
    submit: () => one('LEAD_ACCEPT', {}),
    what: P => t('what_lead_accepted', { id: P.id })
  };

  /* ---------- the person who added it fixes a returned lead ---------- */
  FLOWS.LEAD_FIX = {
    type: 'LEAD_FIX', title: () => t('tk_fix_lead'),
    init: P => ({ lead: { name: P.lead.name, phone: P.lead.phone, address: P.lead.address, area: P.lead.area, building: P.lead.building, notes: P.lead.notes }, more: '' }),
    steps: (P, c) => [{ render: () => `${U.banner('↩️', `<b>${esc(t('returned_because'))}</b>${esc(t(P.returnReason || 'rr_other'))}${P.returnNote ? ' — ' + esc(P.returnNote) : ''}`, 'warn')}
      <div class="card stack">${U.input('lead.name', c.lead.name, { label: t('person_name'), req: true })}${U.input('lead.phone', c.lead.phone, { label: t('phone'), type: 'tel', inputmode: 'numeric', pre: '+91', req: true })}${U.input('lead.building', c.lead.building, { label: t('building_name') })}${U.input('lead.address', c.lead.address, { label: t('address'), textarea: true })}${U.input('lead.area', c.lead.area, { label: t('area') })}${U.input('lead.notes', c.lead.notes, { label: t('notes'), textarea: true })}</div>
      <div class="card stack"><h2 class="h3">📷 ${esc(t('add_photo'))}</h2><div class="photos">${U.photoSlot('more', c.more, t('ph_more'))}</div></div>`,
      check: () => (!A.validPhone(c.lead.phone) ? 'err_phone' : !A.str(c.lead.name) ? 'err_name' : P.returnReason === 'rr_photo' && !c.more ? 'err_photo' : null) }],
    submitLabel: () => t('send_again'),
    submit: (P, c) => one('LEAD_FIX', { lead: Object.assign({}, c.lead, { photos: c.more ? [c.more] : [] }) }),
    what: P => t('what_resubmitted', { id: P.id })
  };

  /* ---------- call the customer ---------- */
  FLOWS.CALL_LOG = {
    type: 'CALL_LOG', title: () => t('tk_call_customer'),
    init: () => ({ outcome: '', note: '', followUp: '' }),
    steps: (P, c) => [{ render: () => {
      const calls = (P.calls || []).slice(-3).reverse();
      return `<div class="card stack center"><span class="avatar" style="margin:0 auto" aria-hidden="true">📞</span><h2>${esc(P.lead.name)}</h2><p class="muted">${esc(t('cr_' + P.lead.contactRole))} · ${esc(P.lead.area || P.lead.address)}</p>
        <a class="btn primary block lg" href="tel:${esc(P.lead.phone)}">📞 ${esc(t('call'))} ${esc(P.lead.phone)}</a>
        <a class="btn block" href="https://wa.me/91${esc(P.lead.phone)}" target="_blank" rel="noopener">💬 WhatsApp</a>
        ${!P.lead.consent ? `<p class="small" style="color:var(--warn)">⚠️ ${esc(t('no_consent'))}</p>` : ''}</div>
        <div class="card stack"><h2 class="h3">${esc(t('call_result'))}</h2>${U.seg('outcome', A.CALL_OUTCOMES.map(([k, em]) => [k, t('co_' + k), em]), c.outcome, 'big cols2')}
        ${U.input('note', c.note, { label: t('note') + ' (' + t('optional') + ')', textarea: true, mic: true })}
        ${c.outcome && c.outcome !== 'reached' ? U.input('followUp', c.followUp, { label: t('follow_up_on'), type: 'date', min: A.todayStr(), req: c.outcome === 'callback' }) : ''}</div>
        ${calls.length ? `<details class="fold"><summary>🕑 ${esc(t('earlier_calls'))} (${(P.calls || []).length})</summary><div class="in list">${calls.map(x => `<div class="small">${esc(U.fmtDT(x.t))} · <b>${esc(t('co_' + x.outcome))}</b>${x.note ? ' — ' + esc(x.note) : ''}</div>`).join('')}</div></details>` : ''}`;
    }, check: () => (!c.outcome ? 'err_outcome' : c.outcome === 'callback' && !c.followUp ? 'err_followup' : null) }],
    submitLabel: () => t('save_call'),
    submit: (P, c) => one('CALL_LOG', { outcome: c.outcome, note: c.note, followUp: c.outcome !== 'reached' ? c.followUp : '' }),
    what: (P, c) => t(c.outcome === 'reached' ? 'what_call_reached' : 'what_call_logged', { id: P.id })
  };

  /* ---------- write what lift the customer needs ---------- */
  FLOWS.NEEDS_SAVE = {
    type: 'NEEDS_SAVE', draft: true, title: () => t('tk_write_needs'),
    init: P => ({ req: Object.assign({ type: 'auto', stops: Math.max(2, Math.min(40, P.lead.floors || 2)), capacity: '6', finish: 'ss', job: 'new', ard: false, curtain: false, premium: false, use: P.lead.contactRole === 'builder' ? 'society' : 'home', timeline: '3m', note: '' }, P.req || {}) }),
    steps: (P, c, S, u) => [
      { title: t('the_lift'), render: () => `<div class="card stack">
        ${U.field(t('q_type'), U.seg('req.type', A.LIFT_TYPES.map(k => [k, t('type_' + k), k === 'auto' ? '🚪' : '↔️']), c.req.type, 'big cols2'))}
        ${bump('req.stops', c.req.stops, 2, 40, t('q_stops'))}<p class="small muted">${esc(t('stops_hint'))}</p>
        ${U.field(t('q_cap'), U.seg('req.capacity', A.CAPACITIES.map(k => [k, t('cap_n', { n: k })]), c.req.capacity, 'cols3'))}
        ${U.field(t('q_finish'), U.seg('req.finish', A.FINISHES.map(k => [k, t('fin_' + k)]), c.req.finish, 'cols2'))}
        ${U.field(t('q_job'), U.seg('req.job', A.JOB_KINDS.map(k => [k, t('job_' + k)]), c.req.job, 'cols2'))}</div>`,
        check: () => (!(+c.req.stops >= 2 && +c.req.stops <= 40) ? 'err_stops' : null) },
      { title: t('extras'), render: () => `<div class="card stack"><h2 class="h3">${esc(t('addons'))}</h2>
        ${['ard', 'curtain', 'premium'].map(k => tick('req.' + k, t('add_' + k), c.req[k], t('add_' + k + '_d'))).join('')}</div>
        <div class="card stack">${U.field(t('q_use'), U.seg('req.use', A.USES.map(k => [k, t('use_' + k)]), c.req.use, 'cols3'))}${U.field(t('q_timeline'), U.seg('req.timeline', A.TIMELINES.map(k => [k, t('tl_' + k)]), c.req.timeline, 'cols2'))}${U.input('req.note', c.req.note, { label: t('note') + ' (' + t('optional') + ')', textarea: true, mic: true })}</div>
        ${A.seesMoney(u.role) ? `<div class="banner gold"><span class="em">🧮</span><div><b>${esc(t('estimate'))}: ${U.money(A.calcQuote(S.config, Object.assign({}, c.req, { stops: +c.req.stops }), 0).total)}</b>${esc(t('estimate_d'))}</div></div>` : ''}` }
    ],
    submitLabel: () => t('save_needs'),
    submit: (P, c) => one('NEEDS_SAVE', { req: Object.assign({}, c.req, { stops: +c.req.stops }) }),
    what: P => t('what_needs_saved', { id: P.id })
  };

  /* ---------- make the quotation (live maths) ---------- */
  const quoteLive = (S, P, c, u) => {
    const q = A.calcQuote(S.config, P.req, +c.discount || 0);
    const who = q.why.includes('below_floor') || q.why.includes('over_admin') ? t('r_owner_short') : t('admin_or_hq');
    return `${A.quoteTable(q, A.seesMargin(u.role))}${q.needsApproval ? U.banner('⏳', `<b>${esc(t('needs_approval_by', { who }))}</b>${esc(q.why.map(w => t('why_' + w)).join(' · '))}`, 'warn') : U.banner('✅', esc(t('no_approval_needed')), 'ok')}`;
  };
  FLOWS.QUOTE_MAKE = {
    type: 'QUOTE_MAKE', title: () => t('tk_make_quote'),
    init: P => ({ discount: P.quotes.length ? String(A.lastQuote(P).calc.discountPct) : '0', note: '' }),
    live: (c, root) => { const box = root.querySelector('#q-live'); if (!box) return; root.querySelectorAll('[data-a=set][data-k=discount]').forEach(x => x.setAttribute('aria-pressed', String(+x.dataset.v === +c.discount && String(c.discount).trim() !== ''))); const S = A.Store.S, P = S.projects[Flow.active.pid], u = S.users[A.Session.uid]; box.innerHTML = quoteLive(S, P, c, u); },
    steps: (P, c, S, u) => [{ render: () => `<div class="card stack"><h2 class="h3">📝 ${esc(t('lift_needs'))}</h2><p class="small">${esc(t('type_' + P.req.type))} · ${esc(t('q_stops'))} ${P.req.stops} · ${esc(t('cap_n', { n: P.req.capacity }))} · ${esc(t('fin_' + P.req.finish))}</p><a class="link-btn" href="#/flow/NEEDS_SAVE/${esc(P.id)}">✏️ ${esc(t('change_needs'))}</a></div>
      <div class="card stack">${U.input('discount', c.discount, { label: t('discount_pct'), type: 'number', inputmode: 'decimal', min: 0, max: 90, step: '0.5', hint: t('discount_limit', { n: S.config.salesDiscountLimit }) })}
        <div class="seg">${[0, 2, 5, S.config.salesDiscountLimit].filter((x, i, a) => a.indexOf(x) === i).map(n => `<button type="button" data-a="set" data-k="discount" data-v="${n}" aria-pressed="${+c.discount === n}">${n}%</button>`).join('')}</div>
        <div id="q-live">${quoteLive(S, P, c, u)}</div>${U.input('note', c.note, { label: t('note_for_approver'), textarea: true })}</div>`,
      check: () => (!(+c.discount >= 0 && +c.discount <= 90) || String(c.discount).trim() === '' ? 'err_discount' : null) }],
    submitLabel: () => t('make_quote_btn'),
    submit: (P, c) => one('QUOTE_MAKE', { discountPct: +c.discount, note: c.note }),
    what: P => { const q = A.lastQuote(P); return t(P.stage === 'quote_approval' ? 'what_quote_pending' : 'what_quote_ready', { v: q.v }); }
  };

  /* ---------- the office approves a price ---------- */
  FLOWS.QUOTE_APPROVE = {
    type: 'QUOTE_APPROVE', title: () => t('tk_approve_quote'),
    steps: (P, c, S, u) => [{ render: () => { const q = A.lastQuote(P); return `${leadCard(P)}<div class="card stack"><div class="card-head"><h2 class="h3">🧮 ${esc(t('quotation'))} v${q.v}</h2>${q.calc.why.map(w => U.chip(t('why_' + w), 'warn')).join('')}</div>${A.quoteTable(q.calc, true)}${kv([[t('made_by'), esc(U.userName(q.by))], [t('note'), esc(q.note)]])}</div>`; }, bar: decideBar('reject', '✗ ' + t('reject'), t('approve')) }],
    actions: {
      reject: async (el, f) => {
        const out = await U.formSheet(t('reject'), U.field(t('reason_for_sales'), '<textarea data-x="note" maxlength="500"></textarea>', { req: true }), t('reject'), el2 => { const v = el2.querySelector('[data-x=note]').value.trim(); return v ? { note: v } : { err: 'err_note' }; });
        if (!out) return;
        f.def = Object.assign({}, f.def, { what: () => t('what_quote_rejected') });
        await submit(one('QUOTE_REJECT', out));
      }
    },
    submit: () => one('QUOTE_APPROVE', {}),
    what: () => t('what_quote_approved')
  };

  /* ---------- send the quotation ---------- */
  FLOWS.QUOTE_SEND = {
    type: 'QUOTE_SEND', title: () => t('tk_send_quote'),
    init: () => ({ channel: 'whatsapp' }),
    steps: (P, c, S) => [{ render: () => { const q = A.lastQuote(P); return `${leadCard(P)}<div class="card stack center"><span class="muted">${esc(t('total'))}</span><div style="font-size:2rem;font-weight:800" class="num">${U.money(q.calc.total)}</div><span class="small muted">${esc(t('valid_days', { n: S.config.validityDays }))}</span><a class="btn sm" href="#/doc/quote/${esc(P.id)}">👁️ ${esc(t('view_quote'))}</a></div>
      <div class="card stack"><h2 class="h3">${esc(t('how_sent'))}</h2>${U.seg('channel', [['whatsapp', 'WhatsApp', '💬'], ['print', t('ch_print'), '🖨️'], ['inperson', t('ch_inperson'), '🤝']], c.channel, 'big cols3')}
      ${c.channel === 'whatsapp' ? `<a class="btn block" href="${esc(A.waLink(P))}" target="_blank" rel="noopener">💬 ${esc(t('open_whatsapp'))}</a>` : c.channel === 'print' ? `<a class="btn block" href="#/doc/quote/${esc(P.id)}">🖨️ ${esc(t('print'))}</a>` : ''}
      <p class="small muted">${esc(t('send_quote_note'))}</p></div>`; } }],
    submitLabel: () => t('mark_sent'),
    submit: (P, c) => one('QUOTE_SEND', { channel: c.channel }),
    what: () => t('what_quote_sent')
  };

  /* ---------- get the customer's decision ---------- */
  FLOWS.DECISION = {
    title: () => t('tk_get_decision'),
    guard: (S, u, P) => (P.stage !== 'quoted' ? 'err_stage' : A.guard(S, u.uid, 'CALL_LOG', P.id)),
    steps: (P, c, S) => [{ render: () => {
      const q = A.lastQuote(P), till = A.quoteValidTill(q, S.config), exp = A.quoteExpired(q, S.config);
      return `${leadCard(P)}<div class="card stack"><div class="row-flex"><span class="muted">${esc(t('total'))}</span><span class="spacer"></span><b class="num" style="font-size:1.3rem">${U.money(q.calc.total)}</b></div>
        ${exp ? U.banner('⌛', esc(t('quote_expired_on', { d: U.fmtD(till) })), 'bad') : U.banner('🗓️', esc(t('valid_till', { d: U.fmtD(till) })) + (P.followUp ? ' · ' + esc(t('follow_up_on')) + ': ' + esc(U.fmtD(P.followUp.due)) : ''))}</div>
        <div class="list">
          <button class="row" type="button" data-a="flowDo" data-v="yes" ${exp ? 'disabled aria-disabled="true"' : ''}><span class="ico">✅</span><span class="body"><span class="title">${esc(t('dec_yes'))}</span><div class="sub">${esc(t('dec_yes_d'))}</div></span><span class="chev">›</span></button>
          <a class="row" href="#/flow/CALL_LOG/${esc(P.id)}"><span class="ico">📞</span><span class="body"><span class="title">${esc(t('dec_call'))}</span><div class="sub">${esc(t('dec_call_d'))}</div></span><span class="chev">›</span></a>
          <a class="row" href="#/flow/NEEDS_SAVE/${esc(P.id)}"><span class="ico">🔁</span><span class="body"><span class="title">${esc(t('dec_change'))}</span><div class="sub">${esc(t('dec_change_d'))}</div></span><span class="chev">›</span></a>
          <button class="row" type="button" data-a="flowDo" data-v="no"><span class="ico">❌</span><span class="body"><span class="title">${esc(t('dec_no'))}</span><div class="sub">${esc(t('dec_no_d'))}</div></span><span class="chev">›</span></button>
        </div>`;
    }, bar: () => '' }],
    actions: {
      yes: async (el, f) => { if (!(await U.confirmSheet(t('dec_yes'), t('dec_yes_confirm'), t('dec_yes'), 'ok'))) return; await submit(one('DEAL_WON', {})); },
      no: async () => { await A.markLost(Flow.active.pid); }
    },
    what: P => (P.stage === 'won' ? t('what_won', { id: P.id }) : t('saved_item'))
  };

  /* ---------- agreement ---------- */
  FLOWS.AGREE_PREPARE = {
    type: 'AGREE_PREPARE', title: () => t('tk_prepare_agreement'),
    steps: (P, c, S) => [{ render: () => { const q = A.lastQuote(P), s = A.paySchedule(S.config, q.calc.total); return `${leadCard(P)}<div class="card stack"><h2 class="h3">💰 ${esc(t('payment_terms'))}</h2><table class="money">${A.PURPOSES.filter(k => s[k]).map(k => `<tr><td>${esc(t('pay_' + k))}<br><span class="small muted">${esc(t('pw_' + k))}</span></td><td>${U.money(s[k])}</td></tr>`).join('')}<tr class="total"><td>${esc(t('total'))}</td><td>${U.money(q.calc.total)}</td></tr></table></div>
      <div class="card"><p class="small">${esc(t('terms_text', { m: S.config.warrantyMonths, d: S.config.installDays, v: S.config.validityDays }))}</p></div>`; } }],
    submitLabel: () => t('prepare_agreement_btn'),
    submit: () => one('AGREE_PREPARE', {}),
    what: P => t('what_agreement_ready', { id: P.id })
  };
  FLOWS.AGREE_SIGN = {
    type: 'AGREE_SIGN', title: () => t('tk_sign_agreement'),
    init: P => ({ agree: false, signer: P.lead.name }),
    steps: (P, c, S, u) => [
      { title: t('read'), render: () => `<div class="doc stack"><h2>${esc(t('agreement'))}</h2><p>${esc(t('agree_between', { org: S.org.name, name: P.lead.name }))}</p>
        <table class="money">${A.PURPOSES.filter(k => P.schedule[k]).map(k => `<tr><td>${esc(t('pay_' + k))}<br><span class="small muted">${esc(t('pw_' + k))}</span></td><td>${U.money(P.schedule[k])}</td></tr>`).join('')}<tr class="total"><td>${esc(t('total'))}</td><td>${U.money(P.agreement.total)}</td></tr></table>
        <p class="small">${esc(t('terms_text', { m: S.config.warrantyMonths, d: S.config.installDays, v: S.config.validityDays }))}</p></div>
        ${tick('agree', t('i_agree'), c.agree)}`, check: () => (!c.agree ? 'err_agree_terms' : null) },
      { title: t('sign'), render: () => `${u.role !== 'customer' ? U.banner('🤝', esc(t('hand_phone_customer')), 'gold') : ''}<div class="card stack">${U.input('signer', c.signer, { label: t('signer_name'), req: true })}${sigBlock()}</div>`, check: () => (!A.str(c.signer) ? 'err_name' : sigCheck()) }
    ],
    submitLabel: () => t('sign_agreement_btn'),
    submit: async (P, c) => { const sig = await sigSave(); return sig ? one('AGREE_SIGN', { sig, signer: c.signer, agree: c.agree }) : { err: 'err_signature' }; },
    what: P => t('what_signed', { id: P.id })
  };

  /* ---------- customer payment ---------- */
  FLOWS.PAY_RECORD = {
    type: 'PAY_RECORD', title: (P, c) => t('record_x', { x: t('pay_' + (c.purpose || 'token')) }),
    init: (P, S, u, q) => ({ purpose: q.purpose && A.PURPOSES.includes(q.purpose) ? q.purpose : A.PURPOSES.find(k => A.payOpen(P, k)) || 'token', mode: 'upi', ref: '', proof: '' }),
    steps: (P, c, S, u) => [{ render: () => {
      const due = A.dueOf(P, c.purpose), cfg = S.config;
      if (!A.payOpen(P, c.purpose)) return U.banner('ℹ️', esc(t('err_not_due')), 'warn');
      const upi = cfg.payUpi ? `upi://pay?pa=${encodeURIComponent(cfg.payUpi)}&pn=${encodeURIComponent(cfg.payName || S.org.name)}&am=${due}&cu=INR&tn=${encodeURIComponent(P.id + ' ' + c.purpose)}` : '';
      const refLab = c.mode === 'cash' ? t('receipt_no') : c.mode === 'cheque' ? t('cheque_no') : t('utr_no');
      return `<div class="card stack center"><span class="muted">${esc(t('pay_' + c.purpose))}</span><div style="font-size:2.1rem;font-weight:800" class="num">${U.money(due)}</div><span class="small muted">${esc(t('pw_' + c.purpose))}</span></div>
        ${u.role === 'customer' ? `<div class="card stack"><h2 class="h3">${esc(t('how_to_pay'))}</h2>${upi ? `<a class="btn primary block lg" href="${esc(upi)}">📱 ${esc(t('pay_upi_app'))}</a><p class="small muted center">UPI: <span class="mono">${esc(cfg.payUpi)}</span></p>` : `<p class="small muted">${esc(t('pay_ask_sales'))}</p>`}<p class="small">${esc(t('pay_company_only'))}</p></div>` : ''}
        <div class="card stack"><h2 class="h3">${esc(t(u.role === 'customer' ? 'after_paying' : 'payment_details'))}</h2>
          ${U.field(t('pay_mode'), U.seg('mode', A.PAY_MODES.map(([k, em]) => [k, t('pm_' + k), em]), c.mode, 'cols2'))}
          ${U.input('ref', c.ref, { label: refLab, req: true, hint: t('ref_hint') })}
          <div class="photos">${U.photoSlot('proof', c.proof, t('proof_photo'), '🧾')}</div></div>
        <p class="small muted">🏦 ${esc(t('finance_checks'))}</p>`;
    }, check: () => (!A.payOpen(P, c.purpose) ? 'err_not_due' : A.str(c.ref).length < 4 ? 'err_ref' : null) }],
    submitLabel: () => t('save_payment'),
    submit: (P, c) => one('PAY_RECORD', { purpose: c.purpose, amount: A.dueOf(P, c.purpose), mode: c.mode, ref: c.ref, proof: c.proof }),
    what: (P, c) => t('what_pay_recorded', { n: U.money(A.dueOf(P, c.purpose)) })
  };
  FLOWS.PAY_VERIFY = {
    type: 'PAY_VERIFY', title: () => t('tk_verify_payment'),
    init: (P, S, u, q) => ({ payId: q.pay || ((P.payments.find(p => p.status === 'pending') || {}).id) }),
    steps: (P, c, S) => [{ render: () => { const p = P.payments.find(x => x.id === c.payId); if (!p || p.status !== 'pending') return U.banner('ℹ️', esc(t('err_payment'))); return `${leadCard(P)}<div class="card stack center"><span class="muted">${esc(t('pay_' + p.purpose))}</span><div style="font-size:2rem;font-weight:800" class="num">${U.money(p.amount)}</div></div>
      <div class="card stack">${kv([[t('pay_mode'), esc(t('pm_' + p.mode))], [t('reference'), `<span class="mono">${esc(p.ref)}</span>`], [t('recorded_by_lab'), esc(U.userName(p.recordedBy))], [t('when'), esc(U.fmtDT(p.t))]])}${p.proof ? `<div class="photos"><button type="button" class="photo-slot filled" data-a="viewPhoto" data-v="${esc(p.proof)}">${U.imgTag(p.proof)}</button></div>` : ''}</div>
      <p class="small muted">🏦 ${esc(t('verify_rule'))}</p>`; }, bar: decideBar('fail', '✗ ' + t('not_in_bank'), t('found_in_bank')) }],
    actions: {
      fail: async (el, f) => {
        const out = await U.formSheet(t('not_in_bank'), U.field(t('what_wrong'), '<textarea data-x="note" maxlength="500"></textarea>', { req: true }), t('save'), el2 => { const v = el2.querySelector('[data-x=note]').value.trim(); return v ? { note: v } : { err: 'err_note' }; });
        if (!out) return;
        f.def = Object.assign({}, f.def, { what: () => t('what_pay_failed') });
        await submit(one('PAY_VERIFY', { payId: f.ctx.payId, ok: false, note: out.note }));
      }
    },
    submit: (P, c) => one('PAY_VERIFY', { payId: c.payId, ok: true }),
    what: () => t('what_pay_ok')
  };

  /* ---------- customer prepares the site (each item saved on its own) ---------- */
  FLOWS.PREP = {
    title: () => t('tk_prepare_site'),
    steps: (P, c, S, u) => [{ render: () => {
      const done = A.PREP_ITEMS.filter(([k]) => P.prep[k]).length;
      return `${U.banner('🧱', esc(t('prep_intro')), 'gold')}<div class="row-flex"><b>${done}/${A.PREP_ITEMS.length}</b><div class="progress" style="flex:1"><i style="width:${Math.round(done / A.PREP_ITEMS.length * 100)}%"></i></div></div>
        <div class="list">${A.PREP_ITEMS.map(([k, em]) => { const x = P.prep[k]; return `<div class="card stack"><div class="card-head" style="margin:0"><span class="avatar s" aria-hidden="true">${x ? '✅' : em}</span><h2 class="h3">${esc(t('prep_' + k))}</h2></div><p class="small muted">${esc(t('prep_' + k + '_d'))}</p>${x ? `<div class="row-flex">${U.imgTag(x.photo) ? `<div class="thumbs">${U.imgTag(x.photo)}</div>` : ''}<span class="small muted">${esc(t('done_on', { d: U.fmtD(x.t) }))}</span></div>` : `<button type="button" class="btn dark block" data-a="itemPhoto" data-type="PREP_TICK" data-label="${esc(t('prep_' + k))}" data-d='${JSON.stringify({ item: k })}'>📷 ${esc(t('done_take_photo'))}</button>`}</div>`; }).join('')}</div>`;
    }, bar: (P2) => A.prepDone(P2) ? `<div class="actionbar"><button class="btn primary lg" type="button" data-a="flowNext">🔍 ${esc(t('tk_request_qc'))}</button></div>` : '' }],
    submit: () => one('QC_REQUEST', {}),
    what: () => t('what_qc_requested')
  };
  FLOWS.QC_REQUEST = {
    type: 'QC_REQUEST', title: () => t('tk_request_qc'),
    steps: P => [{ render: () => `${leadCard(P)}${U.banner('🔍', esc(t('qc_request_d')), 'gold')}` }],
    submitLabel: () => t('tk_request_qc'), submit: () => one('QC_REQUEST', {}), what: () => t('what_qc_requested')
  };

  /* ---------- QC checks the site ---------- */
  const tolOf = (S, m) => S.config[{ width: 'tolWidth', depth: 'tolDepth', pit: 'tolPit', head: 'tolHead' }[m]];
  FLOWS.QC_SITE = {
    type: 'QC_SITE', draft: true, title: () => t('tk_inspect_site'),
    init: () => ({ checks: {}, meas: { width: '', depth: '', pit: '', head: '' }, ph: { shaft: '', pit: '', power: '' }, note: '' }),
    steps: (P, c, S) => [
      { title: t('checks'), render: () => `${leadCard(P)}<div class="card">${A.QC_SITE_CHECKS.map(k => pf('checks.' + k, t('qcs_' + k), c.checks[k])).join('')}</div><button type="button" class="link-btn" data-a="flowDo" data-v="allPass">✓ ${esc(t('all_pass'))}</button>`,
        check: () => (!A.QC_SITE_CHECKS.every(k => c.checks[k]) ? 'err_all_checks' : null) },
      { title: t('measurements'), render: () => `<div class="card stack"><p class="small muted">${esc(t('meas_hint'))}</p>${A.QC_SITE_MEAS.map(m => { const v = +c.meas[m], low = v > 0 && v < tolOf(S, m); return U.input('meas.' + m, c.meas[m], { label: t('m_' + m) + ' (mm)', type: 'number', inputmode: 'numeric', min: 0, hint: t('min_mm', { n: tolOf(S, m) }), err: low ? { k: 'meas_low', v: { n: tolOf(S, m) } } : null }); }).join('')}</div>`,
        check: () => (!A.QC_SITE_MEAS.every(m => +c.meas[m] > 0) ? 'err_meas' : null) },
      { title: t('photos'), render: () => `<div class="card stack"><div class="photos">${U.photoSlot('ph.shaft', c.ph.shaft, t('ph_shaft') + ' *')}${U.photoSlot('ph.pit', c.ph.pit, t('m_pit'))}${U.photoSlot('ph.power', c.ph.power, t('qcs_power3'))}</div>${U.input('note', c.note, { label: t('note') + ' (' + t('optional') + ')', textarea: true, mic: true })}</div>`,
        check: () => (!c.ph.shaft ? 'err_photo' : null) },
      { title: t('result'), render: () => {
        const fails = A.QC_SITE_CHECKS.filter(k => c.checks[k] === 'fail'), low = A.QC_SITE_MEAS.filter(m => +c.meas[m] < tolOf(S, m));
        return fails.length || low.length ? U.banner('🛠️', `<b>${esc(t('site_needs_fixes', { n: fails.length + low.length }))}</b><ul style="margin:6px 0 0;padding-left:18px">${fails.map(k => `<li>${esc(t('qcs_fix_' + k))}</li>`).join('')}${low.map(m => `<li>${esc(t('meas_fix_' + m, { n: tolOf(S, m) }))}</li>`).join('')}</ul>`, 'warn') : U.banner('✅', `<b>${esc(t('site_ok_result'))}</b>${esc(t('site_ok_next'))}`, 'ok');
      } }
    ],
    actions: { allPass: (el, f) => { A.QC_SITE_CHECKS.forEach(k => { f.ctx.checks[k] = 'pass'; }); Flow.rerender(); } },
    submitLabel: () => t('save_inspection'),
    submit: (P, c) => one('QC_SITE', { checks: c.checks, meas: Object.fromEntries(A.QC_SITE_MEAS.map(m => [m, +c.meas[m]])), photos: Object.values(c.ph).filter(Boolean), note: c.note }),
    what: P => t(P.stage === 'site_ok' ? 'what_site_ok' : 'what_site_fix', { n: A.openCorr(P, 'site').length })
  };

  /* ---------- corrections (site or installation) ---------- */
  FLOWS.FIX = {
    title: P => t(P.stage === 'site_fix' ? 'tk_fix_site' : 'tk_fix_install'),
    guard: (S, u, P) => {
      if (P.stage === 'site_fix') return A.actsAs(S, u, ['customer', 'sales']) && (u.role !== 'customer' || P.customer === u.uid) && (u.role !== 'sales' || !P.sales || P.sales === u.uid) ? null : 'err_role_not_allowed';
      if (P.stage === 'install_fix' || (P.stage === 'installing' && A.openCorr(P, 'install').length)) return A.actsAs(S, u, ['tech']) && (u.role !== 'tech' || P.tech === u.uid) ? null : 'err_role_not_allowed';
      return 'err_stage';
    },
    steps: P => [{ render: () => {
      const scope = P.stage === 'site_fix' ? 'site' : 'install', open = A.openCorr(P, scope), done = P.corrections.filter(x => x.scope === scope && x.done);
      return `${U.banner('🛠️', esc(t(scope === 'site' ? 'fix_site_intro' : 'fix_install_intro')), 'warn')}
        <div class="list">${open.map(x => `<div class="card stack"><h2 class="h3">⬜ ${esc(t(x.k, x.v))}</h2><button type="button" class="btn dark block" data-a="itemPhoto" data-type="CORR_DONE" data-label="${esc(t(x.k, x.v))}" data-d='${JSON.stringify({ cid: x.id })}'>📷 ${esc(t('fixed_take_photo'))}</button></div>`).join('')}
        ${done.map(x => `<div class="card pad-s row-flex">✅ <span>${esc(t(x.k, x.v))}</span><span class="spacer"></span><span class="tiny muted">${esc(U.fmtD(x.done.t))}</span></div>`).join('')}</div>`;
    }, bar: P2 => { const scope = P2.stage === 'site_fix' ? 'site' : 'install'; return !A.openCorr(P2, scope).length ? `<div class="actionbar"><button class="btn primary lg" type="button" data-a="flowNext">${esc(t(scope === 'site' ? 'tk_request_qc' : 'tk_request_inspection'))} →</button></div>` : ''; } }],
    submit: P => one(P.stage === 'site_fix' ? 'QC_REQUEST' : 'INSPECT_REQUEST', {}),
    what: P => t(P.stage === 'qc_site' ? 'what_qc_requested' : 'what_inspection_requested')
  };

  /* ---------- the office releases drawings and picks the team ---------- */
  const loadOf = (S, uid, f) => Object.values(S.projects).filter(Q => Q[f] === uid && A.OPEN_STAGES.includes(Q.stage)).length;
  FLOWS.RELEASE = {
    type: 'RELEASE', title: () => t('tk_release'),
    init: (P, S) => ({ tech: P.tech || (A.activeUsers(S, 'tech').sort((x, y) => loadOf(S, x.uid, 'tech') - loadOf(S, y.uid, 'tech') || x.name.localeCompare(y.name))[0] || {}).uid || '', supplier: P.supplier || A.firstActive(S, 'supplier'), drawing: 'DWG-' + P.id.split('-').pop() + '-R1', needBy: A.addDays(7) }),
    steps: (P, c, S) => [
      { title: t('team'), render: () => `<div class="card stack"><h2 class="h3">🔧 ${esc(t('pick_tech'))}</h2>${A.activeUsers(S, 'tech').length ? U.seg('tech', A.activeUsers(S, 'tech').map(x => [x.uid, x.name + ' · ' + t('open_jobs_n', { n: loadOf(S, x.uid, 'tech') })]), c.tech, 'cols2') : U.banner('⚠️', esc(t('no_tech_yet')), 'warn')}</div>
        <div class="card stack"><h2 class="h3">🏭 ${esc(t('pick_supplier'))}</h2>${A.activeUsers(S, 'supplier').length ? U.seg('supplier', A.activeUsers(S, 'supplier').map(x => [x.uid, x.name]), c.supplier, 'cols2') : U.banner('⚠️', esc(t('no_supplier_yet')), 'warn')}</div>`,
        check: () => (!c.tech ? 'err_pick_tech' : !c.supplier ? 'err_pick_supplier' : null) },
      { title: t('material'), render: () => `<div class="card stack">${U.input('drawing', c.drawing, { label: t('drawing_ref'), req: true })}${U.input('needBy', c.needBy, { label: t('need_by'), type: 'date', min: A.todayStr(), req: true })}</div>
        <details class="fold" open><summary>📦 ${esc(t('material_list'))}</summary><div class="in"><table class="money">${A.materialList(P.req).map(m => `<tr><td>${esc(t(m.k))}</td><td>${m.q}</td></tr>`).join('')}</table></div></details>`,
        check: () => (!A.str(c.drawing) ? 'err_drawing' : !c.needBy || c.needBy < A.todayStr() ? 'err_date_past' : null) }
    ],
    submitLabel: () => t('release_btn'),
    submit: (P, c) => one('RELEASE', c),
    what: (P, c, S) => t('what_released', { tech: U.userName(P.tech), sup: U.userName(P.supplier) })
  };

  /* ---------- supplier ---------- */
  FLOWS.PO_ACCEPT = {
    type: 'PO_ACCEPT', title: () => t('tk_accept_po'),
    init: P => ({ date: P.po.needBy > A.todayStr() ? P.po.needBy : A.addDays(3) }),
    steps: (P, c) => [{ render: () => `<div class="card stack"><h2 class="h3">📑 ${esc(P.po.no)}</h2>${kv([[t('drawing'), esc(P.po.drawing)], [t('need_by'), esc(U.fmtD(P.po.needBy))], [t('site'), esc(P.lead.area || P.lead.address)]])}<table class="money">${P.po.items.map(m => `<tr><td>${esc(t(m.k))}</td><td>${m.q}</td></tr>`).join('')}</table></div>
      <div class="card stack">${U.input('date', c.date, { label: t('dispatch_date'), type: 'date', min: A.todayStr(), req: true })}</div>`,
      check: () => (!c.date || c.date < A.todayStr() ? 'err_date_past' : null) }],
    submitLabel: () => t('accept_po_btn'), submit: (P, c) => one('PO_ACCEPT', { date: c.date }), what: (P, c) => t('what_po_accepted', { d: U.fmtD(c.date) })
  };
  FLOWS.DISPATCH = {
    type: 'DISPATCH', draft: true, title: () => t('tk_dispatch'),
    init: () => ({ vehicle: '', driver: '', ph: { packed: '', seal: '' } }),
    steps: (P, c) => [{ render: () => `<div class="card stack">${U.input('vehicle', c.vehicle, { label: t('vehicle'), req: true, ph: 'MH12AB1234' })}${U.input('driver', c.driver, { label: t('driver') + ' (' + t('optional') + ')' })}</div>
      <div class="card stack"><p class="small muted">${esc(t('ph_dispatch_hint'))}</p><div class="photos">${U.photoSlot('ph.packed', c.ph.packed, t('ph_packed') + ' *', '📦')}${U.photoSlot('ph.seal', c.ph.seal, t('ph_seal'), '🔒')}</div></div>`,
      check: () => (!A.str(c.vehicle) ? 'err_vehicle' : !c.ph.packed ? 'err_photo' : null) }],
    submitLabel: () => t('dispatch_btn'), submit: (P, c) => one('DISPATCH', { vehicle: c.vehicle, driver: c.driver, photos: Object.values(c.ph).filter(Boolean) }), what: () => t('what_dispatched')
  };

  /* ---------- at the site ---------- */
  FLOWS.ARRIVAL = {
    type: 'ARRIVAL', title: () => t('tk_arrival'),
    init: () => ({ ph: { material: '', seal: '' }, sealOk: true, note: '', gps: null }),
    steps: (P, c) => [{ render: () => `${P.dispatch ? `<div class="card">${kv([[t('vehicle'), esc(P.dispatch.vehicle)], [t('driver'), esc(P.dispatch.driver)], [t('sent_on'), esc(U.fmtDT(P.dispatch.t))]])}</div>` : ''}
      <div class="card stack"><div class="photos">${U.photoSlot('ph.material', c.ph.material, t('ph_material') + ' *', '📦')}${U.photoSlot('ph.seal', c.ph.seal, t('ph_seal'), '🔒')}</div>${tick('sealOk', t('seal_ok'), c.sealOk)}${U.input('note', c.note, { label: t('note') + ' (' + t('optional') + ')', textarea: true, mic: true })}</div>`,
      check: () => (!c.ph.material ? 'err_photo' : !c.sealOk && !A.str(c.note) ? 'err_seal_note' : null) }],
    submitLabel: () => t('save'), submit: async (P, c) => one('ARRIVAL', { photos: Object.values(c.ph).filter(Boolean), sealOk: c.sealOk, note: c.note, gps: await U.getGPS(4000) }), what: () => t('what_arrived')
  };
  FLOWS.MHAND = {
    type: 'MHAND', title: () => t('tk_material_handover'),
    init: P => ({ checked: {}, ph: { stack: '' }, receiver: P.lead.name, note: '' }),
    steps: (P, c, S, u) => [
      { title: t('count_material'), render: () => `<div class="row-flex"><b>${P.po.items.filter(m => c.checked[m.k]).length}/${P.po.items.length}</b><span class="spacer"></span><button type="button" class="btn sm" data-a="flowDo" data-v="allIn">✓ ${esc(t('all_received'))}</button></div><div class="list">${P.po.items.map(m => tick('checked.' + m.k, t(m.k) + ' × ' + m.q, c.checked[m.k])).join('')}</div>`,
        check: () => (!P.po.items.every(m => c.checked[m.k]) ? 'err_check_all' : null) },
      { title: t('sign'), render: () => `<div class="card stack"><div class="photos">${U.photoSlot('ph.stack', c.ph.stack, t('ph_mhand') + ' *', '📦')}</div></div>${U.banner('🤝', esc(t('hand_phone_receiver')), 'gold')}<div class="card stack">${U.input('receiver', c.receiver, { label: t('receiver_name'), req: true })}${sigBlock()}</div>`,
        check: () => (!c.ph.stack ? 'err_photo' : !A.str(c.receiver) ? 'err_name' : sigCheck()) }
    ],
    actions: { allIn: (el, f) => { A.Store.S.projects[f.pid].po.items.forEach(m => { f.ctx.checked[m.k] = true; }); Flow.rerender(); } },
    submitLabel: () => t('mhand_btn'),
    submit: async (P, c) => { const sig = await sigSave(); return sig ? one('MHAND', { checked: c.checked, photos: [c.ph.stack], sig, receiver: c.receiver, note: c.note }) : { err: 'err_signature' }; },
    what: () => t('what_mhand')
  };

  /* ---------- installation ---------- */
  FLOWS.SAFETY = {
    type: 'SAFETY', title: () => t('tk_safety_check'),
    init: () => ({ ph: {} }),
    steps: (P, c) => [{ render: () => `${U.banner('🦺', esc(t('safety_intro')), 'warn')}<div class="list">${A.SAFETY_ITEMS.map(([k, em]) => `<div class="card stack"><div class="card-head" style="margin:0"><span class="avatar s" aria-hidden="true">${em}</span><div><h2 class="h3">${esc(t('safe_' + k))}</h2><p class="small muted">${esc(t('safe_' + k + '_d'))}</p></div></div><div class="photos">${U.photoSlot('ph.' + k, c.ph[k], t('safe_' + k), em)}</div></div>`).join('')}</div>`,
      check: () => (!A.SAFETY_ITEMS.every(([k]) => c.ph[k]) ? 'err_safety_photos' : null) }],
    submitLabel: () => t('safety_btn'), submit: (P, c) => one('SAFETY', { photos: c.ph }), what: () => t('what_safety')
  };
  FLOWS.SOP_STEP = {
    type: 'SOP_STEP', title: P => t('step_of', { n: Math.min(A.sopNext(P), A.SOP.length - 1) + 1, m: A.SOP.length }),
    init: P => ({ i: A.sopNext(P), photo: '', note: '', reading: '' }),
    steps: (P, c) => [{ render: () => {
      const [k, em] = A.SOP[c.i] || A.SOP[A.SOP.length - 1], rd = A.SOP_READ[c.i];
      return `<div class="steps-dots" aria-hidden="true">${A.SOP.map((s, j) => `<i class="${P.sop[j] ? 'done' : j === c.i ? 'on' : ''}"></i>`).join('')}</div>
        <div class="card stack"><div class="card-head" style="margin:0"><span class="avatar" aria-hidden="true">${em}</span><div><div class="tiny muted">${esc(t('step_of', { n: c.i + 1, m: A.SOP.length }))}</div><h2>${esc(t('sop_' + k))}</h2></div></div><p>${esc(t('sop_' + k + '_d'))}</p></div>
        ${U.banner('⛑️', esc(t('sop_safety')), 'warn')}
        ${rd ? `<div class="card stack">${U.input('reading', c.reading, { label: t('rd_' + rd.k) + ' (' + rd.unit + ')', type: 'number', inputmode: 'decimal', step: 'any', req: true, hint: t('rd_range', { a: rd.min, b: rd.max, u: rd.unit }) })}</div>` : ''}
        <div class="card stack"><div class="photos">${U.photoSlot('photo', c.photo, t('ph_step') + ' *')}</div>${U.input('note', c.note, { label: t('note') + ' (' + t('optional') + ')', textarea: true, mic: true })}</div>
        <p class="tiny muted">${esc(t('sop_disclaimer'))}</p>`;
    }, check: () => { if (!c.photo) return 'err_photo'; const rd = A.SOP_READ[c.i]; if (rd) { const v = +c.reading; if (String(c.reading).trim() === '' || !isFinite(v) || v < rd.min || v > rd.max) return { k: 'err_reading', v: { a: rd.min, b: rd.max, u: rd.unit } }; } return null; } }],
    submitLabel: () => t('step_done_btn'),
    submit: (P, c) => one('SOP_STEP', { i: c.i, photo: c.photo, note: c.note, reading: A.SOP_READ[c.i] ? +c.reading : undefined }),
    what: (P, c) => t('what_step', { n: c.i + 1, m: A.SOP.length })
  };
  FLOWS.INSPECT_REQUEST = {
    type: 'INSPECT_REQUEST', title: () => t('tk_request_inspection'),
    steps: P => [{ render: () => `${leadCard(P)}${U.banner('🔍', esc(t('inspection_request_d')), 'gold')}<div class="steps-dots">${A.SOP.map(() => '<i class="done"></i>').join('')}</div>` }],
    submitLabel: () => t('tk_request_inspection'), submit: () => one('INSPECT_REQUEST', {}), what: () => t('what_inspection_requested')
  };
  FLOWS.QC_FINAL = {
    type: 'QC_FINAL', draft: true, title: () => t('tk_final_inspect'),
    init: () => ({ checks: {}, ph: { ride: '', panel: '' }, note: '' }),
    steps: (P, c) => [
      { title: t('checks'), render: () => `${leadCard(P)}<div class="card">${A.QC_FINAL_CHECKS.map(k => pf('checks.' + k, t('qcf_' + k), c.checks[k])).join('')}</div><button type="button" class="link-btn" data-a="flowDo" data-v="allPass">✓ ${esc(t('all_pass'))}</button>`, check: () => (!A.QC_FINAL_CHECKS.every(k => c.checks[k]) ? 'err_all_checks' : null) },
      { title: t('photos'), render: () => `<div class="card stack"><div class="photos">${U.photoSlot('ph.ride', c.ph.ride, t('ph_final_qc') + ' *')}${U.photoSlot('ph.panel', c.ph.panel, t('ph_panel'))}</div>${U.input('note', c.note, { label: t('note') + ' (' + t('optional') + ')', textarea: true, mic: true })}</div>`, check: () => (!c.ph.ride ? 'err_photo' : null) },
      { title: t('result'), render: () => { const fails = A.QC_FINAL_CHECKS.filter(k => c.checks[k] === 'fail'); return fails.length ? U.banner('🛠️', `<b>${esc(t('install_needs_fixes', { n: fails.length }))}</b><ul style="margin:6px 0 0;padding-left:18px">${fails.map(k => `<li>${esc(t('qcf_fix_' + k))}</li>`).join('')}</ul>`, 'warn') : U.banner('✅', `<b>${esc(t('final_ok_result'))}</b>${esc(t('final_ok_next'))}`, 'ok'); } }
    ],
    actions: { allPass: (el, f) => { A.QC_FINAL_CHECKS.forEach(k => { f.ctx.checks[k] = 'pass'; }); Flow.rerender(); } },
    submitLabel: () => t('save_inspection'),
    submit: (P, c) => one('QC_FINAL', { checks: c.checks, photos: Object.values(c.ph).filter(Boolean), note: c.note }),
    what: P => t(P.stage === 'install_fix' ? 'what_final_fix' : 'what_final_ok')
  };

  /* ---------- handover ---------- */
  FLOWS.HAND_SIGN = {
    type: 'HAND_SIGN', title: (P, c) => t('sign_as', { who: t('slot_' + c.slot) }),
    init: (P, S, u, q) => ({ slot: ['customer', 'tech', 'qc'].includes(q.slot) ? q.slot : 'customer', name: (q.slot || 'customer') === 'customer' ? P.lead.name : u.name }),
    steps: (P, c, S, u) => [{ render: () => `${leadCard(P)}<div class="card stack"><h2 class="h3">✍️ ${esc(t('handover_title'))}</h2><p class="small">${esc(t('handover_say_' + c.slot))}</p>
      <div class="row-flex">${['customer', 'tech', 'qc'].map(s => U.chip((P.hand[s] ? '✅ ' : '⬜ ') + t('slot_' + s), P.hand[s] ? 'ok' : '')).join('')}</div></div>
      ${c.slot === 'customer' && u.role !== 'customer' ? U.banner('🤝', esc(t('hand_phone_customer')), 'gold') : ''}
      <div class="card stack">${U.input('name', c.name, { label: t('signer_name'), req: true })}${sigBlock()}</div>`, check: () => (!A.str(c.name) ? 'err_name' : sigCheck()) }],
    submitLabel: () => t('sign'),
    submit: async (P, c) => { const sig = await sigSave(); return sig ? one('HAND_SIGN', { slot: c.slot, sig, name: c.name }) : { err: 'err_signature' }; },
    what: (P, c) => t('what_hand_signed', { who: t('slot_' + c.slot) })
  };
  FLOWS.HAND_COMPLETE = {
    type: 'HAND_COMPLETE', title: () => t('tk_complete_handover'),
    steps: (P, c, S) => [{ render: () => `${leadCard(P)}<div class="card stack"><h2 class="h3">✍️ ${esc(t('signatures'))}</h2>${['customer', 'tech', 'qc'].map(s => `<div class="row-flex"><b style="min-width:110px">${esc(t('slot_' + s))}</b><img class="sig-img" data-blob="${esc(P.hand[s].sig)}" alt="${esc(t('signature'))}" style="flex:1;max-width:220px"><span class="small">${esc(P.hand[s].name)}</span></div>`).join('')}</div>
      <div class="card">${kv([[t('warranty'), esc(t('months_n', { n: S.config.warrantyMonths }))], [t('amc_visits'), esc(t('per_year', { n: S.config.amcVisits }))], [t('paid_of_total'), P.agreement ? `${U.money(A.paidTotal(P))} / ${U.money(P.agreement.total)}` : '']])}</div>` }],
    submitLabel: () => t('complete_btn'), submit: () => one('HAND_COMPLETE', {}),
    what: P => t('what_handover_done', { code: P.done.liftCode }),
    doneExtra: P => `<div class="card center stack"><span class="muted">${esc(t('lift_code'))}</span><div class="mono" style="font-size:1.6rem;font-weight:800">${esc(P.done.liftCode)}</div><span class="small muted">${esc(t('lift_code_d'))}</span></div>`
  };

  /* ---------- after handover ---------- */
  FLOWS.AMC_VISIT = {
    type: 'AMC_VISIT', title: () => t('tk_amc_visit'),
    init: () => ({ checks: {}, photo: '', note: '' }),
    steps: (P, c) => [{ render: () => { const v = A.nextAmc(P); return `${leadCard(P)}${v ? U.banner('🗓️', esc(t('visit_n', { n: v.n }) + ' · ' + U.fmtD(v.due))) : ''}<div class="card">${A.AMC_CHECKS.map(k => pf('checks.' + k, t('amc_' + k), c.checks[k])).join('')}</div><button type="button" class="link-btn" data-a="flowDo" data-v="allPass">✓ ${esc(t('all_pass'))}</button><div class="card stack"><div class="photos">${U.photoSlot('photo', c.photo, t('ph_service') + ' *')}</div>${U.input('note', c.note, { label: t('note') + ' (' + t('optional') + ')', textarea: true, mic: true })}</div>`; },
      check: () => (!A.AMC_CHECKS.every(k => c.checks[k]) ? 'err_all_checks' : !c.photo ? 'err_photo' : null) }],
    actions: { allPass: (el, f) => { A.AMC_CHECKS.forEach(k => { f.ctx.checks[k] = 'pass'; }); Flow.rerender(); } },
    submitLabel: () => t('save_visit'), submit: (P, c) => one('AMC_VISIT', c), what: () => t('what_visit')
  };
  FLOWS.TICKET_OPEN = {
    type: 'TICKET_OPEN', title: () => t('report_problem'),
    init: () => ({ kind: 'breakdown', severity: 'breakdown', text: '' }),
    steps: (P, c, S) => [{ render: () => `${c.severity === 'trapped' ? U.banner('🆘', `<b>${esc(t('trapped_now'))}</b>${S.config.officePhone ? `<a class="btn danger block" style="margin-top:8px" href="tel:${esc(S.config.officePhone)}">📞 ${esc(t('call_office'))}</a>` : ''}`, 'bad') : ''}
      <div class="card stack">${U.field(t('what_kind'), U.seg('kind', A.TICKET_KINDS.map(([k, em]) => [k, t('tkind_' + k), em]), c.kind, 'big cols3'))}${U.field(t('how_serious'), U.seg('severity', A.SEVERITIES.map(([k, em]) => [k, t('sev_' + k), em]), c.severity, 'cols2'))}${U.input('text', c.text, { label: t('what_happened_q'), textarea: true, mic: true, req: true })}</div>`,
      check: () => (!A.str(c.text) ? 'err_note' : null) }],
    submitLabel: () => t('send'), submit: (P, c) => one('TICKET_OPEN', c), what: (P) => t('what_ticket', { who: U.userName(P.tech) })
  };
  FLOWS.TICKET_CLOSE = {
    title: () => t('tk_close_ticket'),
    init: (P, S, u, q) => ({ tid: q.tid || ((P.amc.tickets.find(x => !x.closed) || {}).id), cause: '', note: '', photo: '' }),
    steps: (P, c, S, u) => [{ render: () => { const x = P.amc.tickets.find(k => k.id === c.tid); if (!x || x.closed) return U.banner('ℹ️', esc(t('err_ticket'))); return `${leadCard(P)}<div class="card stack"><div class="row-flex">${U.chip(t('tkind_' + x.kind), 'info')}${U.chip(t('sev_' + x.severity), x.severity === 'routine' ? '' : 'warn')}<span class="spacer"></span><span class="tiny muted">${esc(U.ago(x.t))}</span></div><p>${esc(x.text)}</p><p class="small muted">${esc(t('assigned_to'))}: ${esc(U.userName(x.to))}</p>${A.can(S, u.uid, 'TICKET_ASSIGN', P.id) ? `<button type="button" class="btn sm" data-a="flowDo" data-v="assign">🔁 ${esc(t('give_to_other'))}</button>` : ''}</div>
      <div class="card stack">${U.field(t('root_cause'), U.seg('cause', A.ROOT_CAUSES.map(([k, em]) => [k, t('rc_' + k), em]), c.cause, 'cols2'))}${U.input('note', c.note, { label: t('what_fixed'), textarea: true, mic: true, req: true })}<div class="photos">${U.photoSlot('photo', c.photo, t('ph_after_fix'))}</div></div>`; },
      check: () => (!c.cause ? 'err_cause' : !A.str(c.note) ? 'err_note' : null) }],
    actions: {
      assign: async (el, f) => {
        const S = A.Store.S, P = S.projects[f.pid];
        const who = await U.choose(t('give_to_other'), A.activeUsers(S).filter(x => ['tech', 'qc'].includes(x.role)).map(x => ({ v: x.uid, em: A.ROLE_ICON[x.role], label: x.name, sub: U.roleName(x.role) })));
        if (!who) return;
        const r = await A.Store.dispatch('TICKET_ASSIGN', P.id, { tid: f.ctx.tid, uid: who });
        U.toast(r.ok ? t('saved_item') : U.errText(r.err), r.ok ? 'ok' : 'bad');
      }
    },
    submitLabel: () => t('close_ticket_btn'), submit: (P, c) => one('TICKET_CLOSE', c), what: () => t('what_ticket_closed')
  };

  /* ---------- problems that stop work ---------- */
  FLOWS.BLOCKER_RAISE = {
    type: 'BLOCKER_RAISE', title: () => t('raise_problem'),
    init: () => ({ reason: '', text: '', photo: '' }),
    steps: (P, c) => [{ render: () => `<div class="card stack">${U.field(t('what_problem'), U.seg('reason', A.BLOCK_REASONS.map(([k, em]) => [k, t('br_' + k), em]), c.reason, 'big cols2'))}${c.reason ? `<p class="small muted">${esc(t('br_goes_to', { who: U.roleName((A.BLOCK_REASONS.find(x => x[0] === c.reason) || [])[2]) }))}</p>` : ''}${U.input('text', c.text, { label: t('describe'), textarea: true, mic: true, req: true })}<div class="photos">${U.photoSlot('photo', c.photo, t('ph_problem'))}</div></div>${c.reason === 'safety' ? U.banner('⛔', esc(t('safety_stops_work')), 'bad') : ''}`,
      check: () => (!c.reason ? 'err_reason' : !A.str(c.text) ? 'err_note' : null) }],
    submitLabel: () => t('send'), submit: (P, c) => one('BLOCKER_RAISE', c), what: () => t('what_blocker')
  };
  FLOWS.BLOCKER_RESOLVE = {
    title: () => t('tk_resolve_blocker'),
    init: (P, S, u, q) => ({ bid: q.bid || ((P.blockers.find(b => b.open) || {}).id), note: '' }),
    steps: (P, c) => [{ render: () => { const b = P.blockers.find(x => x.id === c.bid); if (!b || !b.open) return U.banner('ℹ️', esc(t('err_item'))); return `<div class="card stack"><div class="row-flex">${U.chip(t('br_' + b.reason), 'bad')}<span class="spacer"></span><span class="tiny muted">${esc(U.userName(b.by))} · ${esc(U.ago(b.t))}</span></div><p>${esc(b.text)}</p>${b.photo ? `<div class="thumbs">${U.imgTag(b.photo)}</div>` : ''}</div><div class="card stack">${U.input('note', c.note, { label: t('how_solved'), textarea: true, mic: true, req: true })}</div>`; },
      check: () => (!A.str(c.note) ? 'err_note' : null) }],
    submitLabel: () => t('mark_solved'), submit: (P, c) => one('BLOCKER_RESOLVE', c), what: () => t('what_blocker_solved')
  };

  /* ---------- statutory records: erection permit, lift licence ---------- */
  FLOWS.STAT_RECORD = {
    type: 'STAT_RECORD', title: (P, c) => t('stat_title_' + c.kind),
    init: (P, S, u, q) => ({ kind: A.STAT_KINDS.includes(q.kind) ? q.kind : (A.STAT_STAGES.permit.includes(P.stage) && !P.statutory.permit ? 'permit' : 'licence'), no: '', date: A.todayStr(), expiry: A.addDays(365), authority: '', doc: '' }),
    steps: (P, c) => [{ render: () => `${leadCard(P)}${U.banner('⚖️', esc(t('stat_why_' + c.kind)), 'gold')}
      <div class="card stack">${U.input('no', c.no, { label: t('stat_no_' + c.kind), req: true })}${U.input('authority', c.authority, { label: t('stat_authority') + ' (' + t('optional') + ')' })}
      ${U.input('date', c.date, { label: t('stat_date'), type: 'date', max: A.todayStr(), req: true })}${c.kind === 'licence' ? U.input('expiry', c.expiry, { label: t('stat_expiry'), type: 'date', min: A.addDays(1), req: true }) : ''}
      <div class="photos">${U.photoSlot('doc', c.doc, t('stat_doc') + ' *', '📄')}</div></div>`,
      check: () => (A.str(c.no).length < 3 ? 'err_stat_no' : !c.date || c.date > A.todayStr() ? 'err_stat_date' : c.kind === 'licence' && (!c.expiry || c.expiry <= A.todayStr()) ? 'err_stat_expiry' : !c.doc ? 'err_photo' : null) }],
    submitLabel: () => t('save'), submit: (P, c) => one('STAT_RECORD', { kind: c.kind, no: c.no, date: c.date, expiry: c.kind === 'licence' ? c.expiry : '', authority: c.authority, doc: c.doc }),
    what: (P, c) => t('what_stat_' + c.kind)
  };

  /* ---------- work pay: approve a finished week, then pay it ---------- */
  const payItems = w => `<div class="card stack"><div class="row-flex"><span class="avatar s" aria-hidden="true">${A.ROLE_ICON[(A.Store.S.users[w.uid] || {}).role] || '👤'}</span><div style="flex:1"><b>${esc(U.userName(w.uid))}</b><div class="small muted">${esc(t('week_of', { d: U.fmtD(w.week) }))}</div></div><b class="num" style="font-size:1.3rem">${U.money(w.approved ? w.approved.amount : w.total)}</b></div>
    <table class="money">${w.items.map(x => `<tr><td>${esc(t('earn_' + x.kind, { n: x.n }))}<br><span class="small muted">${esc(x.pid)} · ${esc(U.fmtD(x.t))}</span></td><td>${U.money(x.amount)}</td></tr>`).join('')}</table></div>`;
  FLOWS.PAY_APPROVE = {
    type: 'PAY_WEEK_APPROVE', title: () => t('tk_approve_pay'),
    init: (P, S, u, q) => ({ uid: q.uid, week: q.week }),
    steps: (P, c, S) => [{ render: () => `${payItems(A.payWeek(S, c.uid, c.week))}<p class="small muted">🧾 ${esc(t('approve_pay_rule'))}</p>` }],
    submitLabel: () => t('approve'), submit: (P, c) => one('PAY_WEEK_APPROVE', { uid: c.uid, week: c.week }, ''),
    what: (P, c) => t('what_pay_approved', { name: U.userName(c.uid) })
  };
  FLOWS.PAY_PAID = {
    type: 'PAY_WEEK_PAID', title: () => t('tk_pay_week'),
    init: (P, S, u, q) => ({ uid: q.uid, week: q.week, ref: '' }),
    steps: (P, c, S) => [{ render: () => `${payItems(A.payWeek(S, c.uid, c.week))}<div class="card stack">${U.input('ref', c.ref, { label: t('utr_no'), req: true, hint: t('ref_hint') })}</div>`,
      check: () => (A.str(c.ref).length < 4 ? 'err_ref' : null) }],
    submitLabel: () => t('mark_paid'), submit: (P, c) => one('PAY_WEEK_PAID', { uid: c.uid, week: c.week, ref: c.ref }, ''),
    what: (P, c) => t('what_week_paid', { name: U.userName(c.uid) })
  };

  /* ---------- a login for the customer ---------- */
  FLOWS.CUSTOMER_LOGIN = {
    type: 'CUSTOMER_LOGIN', title: () => t('make_customer_login'),
    init: () => ({ pin: '' }),
    steps: (P, c) => [{ render: () => `${leadCard(P)}<div class="card stack"><p>${esc(t('cust_login_d'))}</p>${U.input('pin', c.pin, { label: t('cust_pin'), type: 'password', inputmode: 'numeric', req: true, max: 4, hint: t('pin_share_note') })}</div>`,
      check: () => (!/^\d{4}$/.test(c.pin) ? 'err_pin_4' : null) }],
    submitLabel: () => t('make_login_btn'), submit: (P, c) => one('CUSTOMER_LOGIN', Object.assign({ uid: 'u_' + A.rnd(8) }, A.makePin(c.pin))),
    what: P => t('what_cust_login', { name: P.lead.name })
  };

  /* a guard for flows without one action type of their own */
  FLOWS.PREP.guard = (S, u, P) => (P.stage !== 'site_prep' ? 'err_stage' : A.prepDone(P) ? A.guard(S, u.uid, 'QC_REQUEST', P.id) : A.guard(S, u.uid, 'PREP_TICK', P.id));
  FLOWS.TICKET_CLOSE.guard = (S, u, P) => (P.stage !== 'amc' ? 'err_stage' : A.actsAs(S, u, ['tech', 'qc', 'admin', 'owner']) ? null : 'err_role_not_allowed');
  FLOWS.BLOCKER_RESOLVE.guard = (S, u, P) => (A.actsAs(S, u, ['admin', 'owner', 'sales', 'supplier']) ? null : 'err_role_not_allowed');
})(window.AIEC);
