/* =====================================================================
   Screens (1/2): front door, login, company setup, home, tasks, jobs
   ===================================================================== */
(function (A) {
  'use strict';
  const U = A.UI, { esc, t } = U;
  const Screens = A.Screens, Actions = A.Actions;

  /* ---------- shared pieces ---------- */
  /* where a task opens: every task goes straight to the screen where it is done */
  function taskPath(k) {
    const p = k.pid;
    if (k.info) return '/job/' + p;
    switch (k.k) {
      case 'get_decision': return '/flow/DECISION/' + p;
      case 'prepare_site': return '/flow/PREP/' + p;
      case 'fix_site': case 'fix_install': return '/flow/FIX/' + p;
      case 'record_payment': return '/flow/PAY_RECORD/' + p + '?purpose=' + k.purpose;
      case 'verify_payment': return '/flow/PAY_VERIFY/' + p + '?pay=' + k.payId;
      case 'sign_handover': return '/flow/HAND_SIGN/' + p + '?slot=' + k.slot;
      case 'close_ticket': return '/flow/TICKET_CLOSE/' + p + '?tid=' + k.tid;
      case 'resolve_blocker': return '/flow/BLOCKER_RESOLVE/' + p + '?bid=' + k.bid;
      default: return '/flow/' + k.type + '/' + p;
    }
  }
  A.taskPath = taskPath;
  const TASK_EM = { review_lead: '🆕', fix_lead: '↩️', call_customer: '📞', write_needs: '📝', make_quote: '🧮', approve_quote: '⏳', send_quote: '📤', get_decision: '🤝', prepare_agreement: '📄', sign_agreement: '✍️', record_payment: '💰', verify_payment: '🏦', prepare_site: '🧱', request_qc: '🔍', inspect_site: '🔍', fix_site: '🛠️', release: '📐', accept_po: '📑', dispatch: '🚚', arrival: '📍', material_handover: '📦', wait_payment: '⏳', wait_cabin_pay: '⏳', safety_check: '🦺', install: '🔧', request_inspection: '🙋', final_inspect: '🔍', fix_install: '🛠️', sign_handover: '✍️', complete_handover: '🔑', amc_visit: '🛠️', close_ticket: '🚨', resolve_blocker: '⚠️' };
  const taskEm = k => TASK_EM[k.k] || '•';
  const custLabel = P => P.lead.name + (P.lead.area ? ' · ' + P.lead.area : P.lead.building ? ' · ' + P.lead.building : '');
  function dueChip(k) {
    if (k.info) return U.chip(t('waiting'), '');
    if (k.late) return U.chip(t('late_days', { n: k.lateDays }), 'bad');
    if (k.urgent) return U.chip(t('urgent'), 'warn');
    if (k.dueDay === A.todayStr()) return U.chip(t('due_today'), 'gold');
    if (k.dueDay) return U.chip(t('due_on', { d: U.fmtD(k.dueDay) }), '');
    return '';
  }
  function taskRow(k, S, opts = {}) {
    const P = S.projects[k.pid];
    const who = opts.showWho ? whoFor(S, P, k) : '';
    return `<a class="row ${k.info ? 'info-row' : k.late ? 'urgent' : k.urgent ? 'late' : ''}" href="#${taskPath(k)}">
      <span class="ico" aria-hidden="true">${taskEm(k)}</span>
      <span class="body"><span class="title">${esc(U.taskTitle(k))}</span>
        <div class="sub">${esc(P.id)} · ${esc(custLabel(P))}</div>
        <div class="chips">${dueChip(k)}${who ? U.chip('👤 ' + who, 'info') : ''}${k.purpose && A.seesMoney(opts.role) ? U.chip(U.money(A.dueOf(P, k.purpose)), 'gold') : ''}</div></span>
      <span class="chev" aria-hidden="true">›</span></a>`;
  }
  /* names of the people a step waits for, or their role */
  function whoFor(S, P, k) {
    if (k.uid && S.users[k.uid]) return S.users[k.uid].name;
    if (k.field && P[k.field] && S.users[P[k.field]]) return S.users[P[k.field]].name;
    return k.roles.filter(r => r !== 'owner' || !k.roles.includes('admin')).map(U.roleName).join(' / ');
  }
  A.whoFor = whoFor;
  function projRow(P, S, u) {
    const myTask = A.tasksFor(S, u.uid).find(k => k.pid === P.id && !k.info);
    const w = A.waitingOn(S, P);
    const late = A.needs(S, P).some(k => k.late && !k.info);
    const value = A.seesMoney(u.role) && (P.agreement ? P.agreement.total : A.lastQuote(P) ? A.lastQuote(P).calc.total : 0);
    return `<a class="row ${late && A.OPEN_STAGES.includes(P.stage) ? 'late' : ''}" href="#/job/${esc(P.id)}" data-search="${esc((P.id + ' ' + P.lead.name + ' ' + P.lead.phone + ' ' + P.lead.area + ' ' + P.lead.building + ' ' + P.lead.address).toLowerCase())}">
      <span class="ico" aria-hidden="true">${U.stageEm(P.stage)}</span>
      <span class="body"><span class="title">${esc(P.lead.name)}</span>
      <div class="sub">${esc(P.id)}${P.lead.area ? ' · ' + esc(P.lead.area) : ''}</div>
      <div class="chips">${U.chip(U.stageName(P.stage), P.stage === 'amc' ? 'ok' : P.stage === 'lost' ? '' : 'info')}${myTask ? U.chip(t('your_turn'), 'gold') : w && A.OPEN_STAGES.includes(P.stage) ? U.chip('⏳ ' + whoFor(S, P, w.task), '') : ''}${late && A.OPEN_STAGES.includes(P.stage) ? U.chip(t('late'), 'bad') : ''}${value ? U.chip(U.moneyShort(value), '') : ''}</div></span>
      <span class="chev" aria-hidden="true">›</span></a>`;
  }
  A.projRow = projRow; A.taskRow = taskRow; A.custLabel = custLabel;
  const visibleProjects = (S, u) => Object.values(S.projects).filter(P => A.canSee(S, u.uid, P));
  A.visibleProjects = visibleProjects;
  const lastTouch = P => (P.history.length ? P.history[P.history.length - 1].t : P.t);
  A.lastTouch = lastTouch;

  /* =====================================================================
     front door (nobody signed in on this phone)
     ===================================================================== */
  Screens.door = ({ S }) => {
    const practice = A.Store.mode === 'practice';
    const people = Object.values(S.users).filter(x => x.active).sort((a, b) => A.ROLES.indexOf(a.role) - A.ROLES.indexOf(b.role) || a.name.localeCompare(b.name));
    const top = `<div class="top">
      <div class="logo">${A.App.logoSvg(84)}</div>
      <div class="brand">${esc(S.org ? S.org.name : 'AIEC Elevator OS')}</div>
      <div class="tag">${esc(S.org ? 'AIEC Elevator OS' : t('company'))}</div>
      <div class="lang-pick" style="margin-top:16px" role="group" aria-label="${esc(t('language'))}">${U.LANGS.map(([k, n]) => `<button type="button" data-a="setLang" data-v="${k}" aria-pressed="${U.getLang() === k}" lang="${k}">${n}</button>`).join('')}<button type="button" data-a="sayPage" aria-label="${esc(t('listen'))}">🔊</button></div>
    </div>`;
    let inner;
    if (S.org) {
      inner = `<div class="stack-l">
        <div class="stack"><h2>${esc(t('who_are_you'))}</h2>
        ${people.length > 10 ? U.field('', `<input type="search" data-filter="people" placeholder="${esc(t('search'))}" aria-label="${esc(t('search'))}" autocomplete="off">`) : ''}
        <div class="people" id="people">${people.map(p => `<button type="button" class="person" data-a="pickUser" data-v="${esc(p.uid)}" data-name="${esc(p.name.toLowerCase())}"><span class="avatar s" aria-hidden="true">${A.ROLE_ICON[p.role]}</span><span><b>${esc(p.name)}</b><span>${esc(U.roleName(p.role))}</span></span></button>`).join('')}</div>
        ${practice ? U.banner('🎓', `<b>${esc(t('practice_pin'))}</b>${esc(t('practice_hint'))}`, 'gold') : ''}
        </div>
        <div class="stack">
          ${practice ? `<button class="btn block" type="button" data-a="resetPractice">🔄 ${esc(t('reset_practice'))}</button><button class="btn block dark" type="button" data-a="exitPractice">🚪 ${esc(t('exit_practice'))}</button>`
          : `<button class="btn block" type="button" data-a="importFile">📂 ${esc(t('open_file'))}</button><button class="btn block ghost" type="button" data-a="practice">🎓 ${esc(t('setup_practice'))}</button>`}
        </div>
        <p class="muted small center">${esc(t('role_note'))}</p>
      </div>`;
    } else {
      inner = `<div class="stack-l">
        <div class="stack"><h2>${esc(t('setup_title'))}</h2>
        <button class="door-card" type="button" data-a="go" data-v="/setup"><span class="em" aria-hidden="true">👑</span><span><b>${esc(t('setup_new'))}</b><span>${esc(t('setup_new_d'))}</span></span></button>
        <button class="door-card" type="button" data-a="importFile"><span class="em" aria-hidden="true">📂</span><span><b>${esc(t('setup_join'))}</b><span>${esc(t('setup_join_d'))}</span></span></button>
        <button class="door-card" type="button" data-a="practice"><span class="em" aria-hidden="true">🎓</span><span><b>${esc(t('setup_practice'))}</b><span>${esc(t('setup_practice_d'))}</span></span></button>
        </div>
        <details class="fold"><summary>❓ ${esc(t('how_it_works'))}</summary><div class="in stack">
          ${[['intro1', '☝️'], ['intro2', '📷'], ['intro3', '🔊'], ['intro4', '🔐']].map(([k, em]) => `<div class="row-flex" style="align-items:flex-start"><span style="font-size:1.4rem">${em}</span><div><b>${esc(t(k + '_t'))}</b><p class="muted small">${esc(t(k + '_d'))}</p></div></div>`).join('')}
          <p class="muted small">${esc(t('welcome_note'))}</p>
        </div></details>
      </div>`;
    }
    return { raw: true, body: `<div class="door">${top}<div class="sheet-in">${inner}</div></div>`, say: t('welcome_say'),
      after(root) {
        const s = root.querySelector('[data-filter="people"]');
        if (s) s.addEventListener('input', () => { const q = s.value.trim().toLowerCase(); root.querySelectorAll('#people .person').forEach(b => { b.hidden = q && !b.dataset.name.includes(q); }); });
      } };
  };
  Object.assign(Actions, {
    pickUser: el => { document.getElementById('toast-host').innerHTML = ''; U.go('/login/' + el.dataset.v); },
    practice: () => A.App.switchMode('practice'),
    exitPractice: () => A.App.switchMode('real'),
    resetPractice: async () => {
      if (!(await U.confirmSheet(t('reset_practice'), t('reset_practice_d'), t('reset_practice')))) return;
      await A.Store.wipe(); await A.Demo.seed(); A.Session.logout(); U.toast(t('practice_ready'), 'ok'); U.go('/door', true);
    },
    importFile: async () => {
      const txt = await U.pickFile(); if (!txt) return;
      let file; try { file = JSON.parse(txt); } catch (e) { return U.toast(t('err_bad_file'), 'bad'); }
      if (file && file.mode === 'practice' && A.Store.mode !== 'practice') return U.toast(t('err_practice_file'), 'bad');
      const r = await A.Store.importFile(file);
      if (!r.ok) return U.toast(U.errText(r.err), 'bad');
      U.toast(t('import_done', { n: r.added, m: r.skipped }), 'ok');
      A.App.render();
    }
  });

  /* ---------- PIN login ---------- */
  let pinBuf = '';
  Screens.login = ({ S, parts }) => {
    const p = S.users[parts[1]];
    if (!p || !p.active) return { redirect: '/door' };
    const wait = A.Session.lockedFor(p.uid);
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok'];
    return { raw: true, body: `<div class="door"><div class="top"><div class="logo">${A.App.logoSvg(64)}</div><div class="brand">${esc(S.org.name)}</div></div>
      <div class="sheet-in"><div class="stack-l" style="text-align:center">
        <div class="stack" style="align-items:center"><span class="avatar" aria-hidden="true">${A.ROLE_ICON[p.role]}</span><h2>${esc(p.name)}</h2><span class="muted">${esc(U.roleName(p.role))}</span></div>
        <div><h3 id="pin-lab">${esc(t('enter_pin'))}</h3><div class="pin-dots" id="pin-dots" aria-live="polite" aria-labelledby="pin-lab">${'<i></i>'.repeat(4)}</div>
        <p id="pin-msg" class="small" role="alert" style="min-height:1.5em;color:var(--bad);font-weight:650">${wait ? esc(t('locked', { n: wait })) : ''}</p></div>
        <div class="keypad" role="group" aria-label="${esc(t('enter_pin'))}">${keys.map(k => k === 'back' ? `<button type="button" class="fn" data-a="pinKey" data-v="back" aria-label="${esc(t('delete'))}">⌫</button>` : k === 'ok' ? `<button type="button" class="fn" data-a="go" data-v="/door">${esc(t('not_me'))}</button>` : `<button type="button" data-a="pinKey" data-v="${k}">${k}</button>`).join('')}</div>
        ${A.Store.mode === 'practice' ? `<p class="muted small">🎓 ${esc(t('practice_pin'))}</p>` : ''}
      </div></div></div>`,
      after() {
        pinBuf = '';
        const onKey = e => { if (!document.getElementById('pin-dots')) { document.removeEventListener('keydown', onKey); return; } if (/^\d$/.test(e.key)) pinPress(e.key); else if (e.key === 'Backspace') pinPress('back'); };
        document.addEventListener('keydown', onKey);
      } };
  };
  function pinPress(k) {
    const uid = U.parseHash().parts[1];
    if (k === 'back') pinBuf = pinBuf.slice(0, -1); else if (pinBuf.length < 4) pinBuf += k;
    const dots = document.getElementById('pin-dots');
    if (!dots) return;
    dots.innerHTML = [0, 1, 2, 3].map(i => `<i class="${i < pinBuf.length ? 'on' : ''}"></i>`).join('');
    if (pinBuf.length === 4) {
      const r = A.Session.login(uid, pinBuf);
      pinBuf = '';
      if (r.ok) { U.go('/home', true); return; }
      dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake');
      setTimeout(() => { dots.innerHTML = '<i></i>'.repeat(4); }, 350);
      document.getElementById('pin-msg').textContent = U.errText(r.err);
    }
  }
  Actions.pinKey = el => pinPress(el.dataset.v);

  /* ---------- new company (Head Quarter) ---------- */
  Screens.setup = ({ S }) => {
    if (S.org) return { redirect: '/door' };
    return { title: t('setup_new'), back: '/door', body: `<form class="stack-l" id="setup-form" novalidate>
      ${U.banner('👑', esc(t('s_new_org')), 'gold')}
      <div class="card stack">
        ${U.input('company', '', { label: t('company_name'), req: true, auto: 'organization' })}
        ${U.input('city', 'PUN', { label: t('city_code'), hint: t('city_code_d'), max: 3 })}
        ${U.input('name', '', { label: t('your_name'), req: true, auto: 'name' })}
        ${U.input('phone', '', { label: t('phone'), type: 'tel', inputmode: 'numeric', pre: '+91', auto: 'tel-national' })}
      </div>
      <div class="card stack">
        ${U.input('pin1', '', { label: t('new_pin'), type: 'password', inputmode: 'numeric', req: true, max: 4, auto: 'new-password' })}
        ${U.input('pin2', '', { label: t('repeat_pin'), type: 'password', inputmode: 'numeric', req: true, max: 4, auto: 'new-password' })}
        <p class="muted small">🔐 ${esc(t('pin_note'))}</p>
      </div>
      <p id="setup-err" role="alert" style="color:var(--bad);font-weight:650"></p>
      <button class="btn primary block lg" type="submit">${esc(t('create_company'))}</button>
    </form>`, noNav: true,
    after(root) {
      const f = root.querySelector('#setup-form');
      f.querySelectorAll('input[type=password]').forEach(i => i.setAttribute('maxlength', '4'));
      f.addEventListener('submit', async e => {
        e.preventDefault();
        const v = k => (f.querySelector(`[data-k="${k}"]`).value || '').trim();
        const err = m => { f.querySelector('#setup-err').textContent = U.errText(m); };
        if (!/^\d{4}$/.test(v('pin1'))) return err('err_pin_4');
        if (v('pin1') !== v('pin2')) return err('pin_mismatch');
        if (v('phone') && !A.validPhone(v('phone'))) return err('err_phone');
        const uid = 'u_' + A.rnd(8);
        const r = await A.Store.dispatch('ORG_CREATE', '', { org: { name: v('company'), city: v('city') }, user: Object.assign({ uid, name: v('name'), phone: v('phone') }, A.makePin(v('pin1'))) }, uid);
        if (!r.ok) return err(r.err);
        A.Session.login(uid, v('pin1'));
        U.toast(t('company_created'), 'ok');
        U.go('/home', true);
      });
    } };
  };

  /* =====================================================================
     home: the one next thing, then the rest in order
     ===================================================================== */
  Screens.home = ctx => (ctx.u.role === 'customer' ? customerHome(ctx) : staffHome(ctx));
  function hello(u, S) {
    return `<div class="hello"><span class="avatar" aria-hidden="true">${A.ROLE_ICON[u.role]}</span><div><h1 style="font-size:1.25rem">${esc(t('hello', { name: /\.$/.test(u.name.split(' ')[0]) ? u.name : u.name.split(' ')[0] }))}</h1><div class="muted small">${esc(U.roleName(u.role))} · ${esc(S.org.name)}</div></div></div>`;
  }
  function hero(k, S, u) {
    if (!k) {
      const field = u.role === 'field' || (u.role === 'sales');
      return `<section class="hero done" aria-labelledby="hero-t"><div class="eyebrow">✓ ${esc(t('all_clear'))}</div><h2 id="hero-t">${esc(t('no_tasks'))}</h2><p class="meta">${esc(t(field ? 'no_tasks_field' : 'no_tasks_other'))}</p>
        ${A.can(S, u.uid, 'LEAD_CREATE') ? `<a class="btn primary block lg" href="#/flow/LEAD_CREATE">＋ ${esc(t(u.role === 'field' ? 'add_site' : 'nav_new_lead'))}</a>` : ''}</section>`;
    }
    const P = S.projects[k.pid];
    return `<section class="hero" aria-labelledby="hero-t">
      <div class="eyebrow">${k.late ? '🔴 ' + esc(t('late_days', { n: k.lateDays })) : k.urgent ? '⚡ ' + esc(t('urgent')) : '▶ ' + esc(t('next_for_you'))}</div>
      <h2 id="hero-t">${taskEm(k)} ${esc(U.taskTitle(k))}</h2>
      <p class="meta">${esc(P.id)} · ${esc(custLabel(P))}${k.dueDay && !k.late ? ' · ' + esc(k.dueDay === A.todayStr() ? t('due_today') : t('due_on', { d: U.fmtD(k.dueDay) })) : ''}</p>
      <a class="btn primary block lg" href="#${taskPath(k)}">${esc(t('start_now'))} →</a>
    </section>`;
  }
  function staffHome({ S, u }) {
    const tasks = A.tasksFor(S, u.uid);
    const act = tasks.filter(k => !k.info), info = tasks.filter(k => k.info);
    const office = A.OFFICE.includes(u.role);
    const parts = [hello(u, S)];
    if (office || u.role === 'finance') {
      const d = A.dashboard(S);
      parts.push(`<div class="kpis">
        <a class="kpi" href="#/jobs" style="text-decoration:none;color:inherit"><div class="v">${d.open}</div><div class="l">${esc(t('kpi_open'))}</div></a>
        <div class="kpi"><div class="v">${d.wonCount}</div><div class="l">${esc(t('kpi_won_month'))}</div></div>
        <div class="kpi"><div class="v">${U.moneyShort(d.received)}</div><div class="l">${esc(t('kpi_received'))}</div></div>
        <a class="kpi" href="#/dash" style="text-decoration:none;color:inherit"><div class="v" style="color:${d.stuck ? 'var(--bad)' : 'inherit'}">${d.stuck}</div><div class="l">${esc(t('kpi_stuck'))}</div></a></div>`);
    }
    parts.push(hero(act[0], S, u));
    if (act.length > 1) {
      const rest = act.slice(1, 6);
      parts.push(`<section class="stack"><div class="section-title"><h2>${esc(t('up_next'))}</h2><span class="count">${act.length - 1}</span><span class="spacer"></span>${act.length > 6 ? `<a class="link-btn" href="#/tasks">${esc(t('see_all'))}</a>` : ''}</div><div class="list">${rest.map(k => taskRow(k, S, { role: u.role })).join('')}</div></section>`);
    }
    if (office) {
      const stuck = A.stuckWork(S).filter(k => !A.taskFor(S, u.uid, k)).slice(0, 3);
      if (stuck.length) parts.push(`<section class="stack"><div class="section-title"><h2>⏫ ${esc(t('stuck_work'))}</h2><span class="spacer"></span><a class="link-btn" href="#/dash">${esc(t('see_all'))}</a></div><div class="list">${stuck.map(k => taskRow(k, S, { showWho: true, role: u.role })).join('')}</div></section>`);
    }
    if (info.length) parts.push(`<section class="stack"><div class="section-title"><h2>⏳ ${esc(t('waiting_title'))}</h2></div><div class="list">${info.map(k => taskRow(k, S, { role: u.role })).join('')}</div></section>`);
    /* jobs I am part of where the next step is someone else's */
    if (!office && u.role !== 'finance') {
      const mine = visibleProjects(S, u).filter(P => A.OPEN_STAGES.includes(P.stage) && !tasks.some(k => k.pid === P.id)).sort((a, b) => lastTouch(b).localeCompare(lastTouch(a))).slice(0, 5);
      if (mine.length) parts.push(`<section class="stack"><div class="section-title"><h2>${esc(t('with_others'))}</h2><span class="spacer"></span><a class="link-btn" href="#/jobs">${esc(t('see_all'))}</a></div><div class="list">${mine.map(P => projRow(P, S, u)).join('')}</div></section>`);
    }
    if (u.role === 'field') {
      const month = A.todayStr().slice(0, 7);
      const minePs = Object.values(S.projects).filter(P => P.createdBy === u.uid && P.t.slice(0, 7) === month);
      const ok = minePs.filter(P => !['new', 'returned'].includes(P.stage)).length;
      parts.push(`<div class="card"><div class="card-head"><h3>🏆 ${esc(t('my_month'))}</h3></div><div class="grid3 center"><div><div class="kpi-v" style="font-size:1.5rem;font-weight:800">${minePs.length}</div><div class="muted small">${esc(t('sites_added'))}</div></div><div><div style="font-size:1.5rem;font-weight:800;color:var(--ok)">${ok}</div><div class="muted small">${esc(t('valid_leads'))}</div></div><div><div style="font-size:1.5rem;font-weight:800;color:var(--warn)">${minePs.filter(P => P.stage === 'returned').length}</div><div class="muted small">${esc(t('to_fix'))}</div></div></div><p class="muted small" style="margin-top:10px">🏍️ ${esc(t('ride_safety'))}</p></div>`);
    }
    if (A.Store.mode === 'practice' && !A.LS.get('aiec.tip.practice', false)) parts.splice(1, 0, `<div class="banner gold"><span class="em">🎓</span><div><b>${esc(t('practice_tip_t'))}</b>${esc(t('practice_tip_d'))}<div style="margin-top:8px"><button class="btn sm" type="button" data-a="hideTip" data-v="practice">${esc(t('got_it'))}</button></div></div></div>`);
    const say = act.length ? t('say_home_tasks', { n: act.length, first: U.taskTitle(act[0]) }) : t('no_tasks');
    return { title: t('nav_home'), sub: S.org.name, body: `<div class="stack-l">${parts.join('')}</div>`, say };
  }
  Actions.hideTip = el => { A.LS.set('aiec.tip.' + el.dataset.v, true); A.App.render(); };

  /* the customer sees their lift, what happens next, and what to pay */
  function customerHome({ S, u }) {
    const Ps = visibleProjects(S, u);
    const tasks = A.tasksFor(S, u.uid);
    const cards = Ps.map(P => {
      const k = tasks.find(x => x.pid === P.id);
      const w = A.waitingOn(S, P);
      const total = P.agreement ? P.agreement.total : 0, paid = A.paidTotal(P);
      const due = A.PURPOSES.find(p => A.payOpen(P, p));
      const nextLine = P.stage === 'amc' ? t('next_amc') : k ? '' : w ? t('next_who', { who: w.task.roles.includes('sales') ? t('r_sales') : U.roleName(w.task.roles[0]), task: U.taskTitle(w.task) }) : t('next_none');
      const amc = P.stage === 'amc' ? A.nextAmc(P) : null;
      return `<section class="card stack" aria-labelledby="lift-${esc(P.id)}">
        <div class="card-head"><span class="avatar s" aria-hidden="true">🛗</span><div style="flex:1"><h2 id="lift-${esc(P.id)}">${esc(t('my_lift'))}</h2><div class="muted small">${esc(P.lead.building || P.lead.address)} · ${esc(P.id)}</div></div></div>
        ${U.rail(P.stage)}
        <div class="row-flex">${U.chip(U.stageEm(P.stage) + ' ' + U.stageName(P.stage), P.stage === 'amc' ? 'ok' : 'info')}</div>
        ${k ? `<div class="hero" style="padding:16px"><div class="eyebrow">▶ ${esc(t('your_turn'))}</div><h2>${taskEm(k)} ${esc(U.taskTitle(k))}</h2><a class="btn primary block" href="#${taskPath(k)}">${esc(t('start_now'))} →</a></div>` : `<p>${esc(nextLine)}</p>`}
        ${total ? `<div class="qbox stack"><div class="row-flex"><span class="muted">${esc(t('paid_of_total'))}</span><span class="spacer"></span><b class="num">${U.money(paid)} / ${U.money(total)}</b></div><div class="progress" aria-hidden="true"><i style="width:${Math.min(100, Math.round(paid / total * 100))}%"></i></div>
          ${due && !k ? `<a class="btn primary block" href="#/flow/PAY_RECORD/${esc(P.id)}?purpose=${due}">💰 ${esc(t('pay_now_amount', { n: U.money(A.dueOf(P, due)) }))}</a>` : ''}</div>` : ''}
        ${amc ? `<div class="kv"><dt>${esc(t('warranty_till'))}</dt><dd>${esc(U.fmtD(A.warrantyEnd(P)))}</dd><dt>${esc(t('next_service'))}</dt><dd>${esc(U.fmtD(amc.due))}</dd><dt>${esc(t('lift_code'))}</dt><dd class="mono">${esc(P.done.liftCode)}</dd></div>` : ''}
        <div class="grid2">
          <a class="btn" href="#/job/${esc(P.id)}/chat">💬 ${esc(t('ask_question'))}</a>
          ${P.stage === 'amc' ? `<a class="btn danger" href="#/flow/TICKET_OPEN/${esc(P.id)}">🚨 ${esc(t('report_problem'))}</a>` : `<a class="btn" href="#/job/${esc(P.id)}">📄 ${esc(t('details'))}</a>`}
        </div>
        ${S.users[P.sales] && S.users[P.sales].phone ? `<a class="btn ghost block" href="tel:${esc(S.users[P.sales].phone)}">📞 ${esc(t('call_person', { name: S.users[P.sales].name }))}</a>` : S.config.officePhone ? `<a class="btn ghost block" href="tel:${esc(S.config.officePhone)}">📞 ${esc(t('call_office'))}</a>` : ''}
      </section>`;
    });
    return { title: t('nav_home'), sub: S.org.name, body: `<div class="stack-l">${hello(u, S)}${cards.join('') || U.empty('🛗', t('no_project'), t('no_project_d'))}</div>`,
      say: Ps.length ? t('cust_say', { stage: U.stageName(Ps[0].stage), next: '' }) : t('no_project') };
  }

  /* ---------- all my tasks ---------- */
  Screens.tasks = ({ S, u }) => {
    const tasks = A.tasksFor(S, u.uid);
    const now = tasks.filter(k => !k.info && (k.late || k.urgent)), later = tasks.filter(k => !k.info && !k.late && !k.urgent), wait = tasks.filter(k => k.info);
    const sec = (title, list) => list.length ? `<section class="stack"><div class="section-title"><h2>${esc(title)}</h2><span class="count">${list.length}</span></div><div class="list">${list.map(k => taskRow(k, S, { role: u.role })).join('')}</div></section>` : '';
    const body = tasks.length ? `<div class="stack-l">${sec('⚡ ' + t('do_first'), now)}${sec('📋 ' + t('then'), later)}${sec('⏳ ' + t('waiting_title'), wait)}</div>` : U.empty('✅', t('no_tasks'), t('no_tasks_other'));
    return { title: t('nav_tasks'), sub: t('n_tasks', { n: tasks.filter(k => !k.info).length }), body };
  };

  /* ---------- jobs list with search and phase filter ---------- */
  Screens.jobs = ({ S, u, q }) => {
    const f = q.f || A.LS.get('aiec.jobs.f', 'open');
    const all = visibleProjects(S, u);
    const filters = [['open', t('f_open')], ['mine', t('f_mine')]].concat(A.PHASES.map(([ph], i) => [String(i), t('ph_' + ph)])).concat([['amc', t('f_amc')], ['lost', t('f_lost')], ['all', t('all')]]);
    const myIds = new Set(A.tasksFor(S, u.uid).map(k => k.pid));
    const inF = (k, P) => k === 'all' ? true : k === 'open' ? A.OPEN_STAGES.includes(P.stage) : k === 'mine' ? myIds.has(P.id) : k === 'amc' ? P.stage === 'amc' : k === 'lost' ? P.stage === 'lost' : A.STAGES[P.stage][0] === +k && A.OPEN_STAGES.includes(P.stage);
    const list = all.filter(P => inF(f, P)).sort((a, b) => (myIds.has(b.id) - myIds.has(a.id)) || lastTouch(b).localeCompare(lastTouch(a)));
    const count = k => all.filter(P => inF(k, P)).length;
    const body = `<div class="stack">
      <div class="row-flex">
        <div style="flex:1">${U.field('', `<input type="search" id="job-search" placeholder="${esc(t('search_jobs'))}" aria-label="${esc(t('search_jobs'))}" autocomplete="off">`)}</div>
        ${A.can(S, u.uid, 'LEAD_CREATE') ? `<a class="btn primary" href="#/flow/LEAD_CREATE" aria-label="${esc(t('nav_new_lead'))}">＋</a>` : ''}
      </div>
      <div class="tabs" role="tablist" style="top:60px">${filters.map(([k, l]) => { const n = count(k); return n || k === f || ['open', 'all'].includes(k) ? `<button type="button" role="tab" aria-selected="${k === f}" data-a="jobFilter" data-v="${k}">${esc(l)} <span class="muted">${n}</span></button>` : ''; }).join('')}</div>
      <div class="list" id="job-list">${list.map(P => projRow(P, S, u)).join('') || U.empty('📭', t('nothing_here'))}</div>
      <p id="job-none" class="muted center" hidden>${esc(t('no_match'))}</p>
    </div>`;
    return { title: t(u.role === 'field' ? 'nav_sites' : 'nav_jobs'), sub: t('n_jobs', { n: list.length }), body, keepFocus: false,
      after(root) {
        const s = root.querySelector('#job-search'); if (!s) return;
        const memo = A.LS.get('aiec.jobs.q', ''); s.value = memo;
        const run = () => { const v = s.value.trim().toLowerCase(); A.LS.set('aiec.jobs.q', v); let shown = 0; root.querySelectorAll('#job-list [data-search]').forEach(r => { r.hidden = v && !r.dataset.search.includes(v); if (!r.hidden) shown++; }); root.querySelector('#job-none').hidden = !(v && !shown); };
        s.addEventListener('input', run); run();
      } };
  };
  Actions.jobFilter = el => { A.LS.set('aiec.jobs.f', el.dataset.v); U.go('/jobs', true); };

  Screens.notfound = () => ({ title: t('not_found'), back: '/home', body: U.empty('🧭', t('not_found'), '', `<a class="btn" href="#/home">${esc(t('nav_home'))}</a>`) });
})(window.AIEC);
