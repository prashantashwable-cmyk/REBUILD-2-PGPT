/* =====================================================================
   App shell: boot, layout, role navigation, routing, event delegation.
   ===================================================================== */
(function (A) {
  'use strict';
  const U = A.UI, { esc, t } = U;
  const Screens = A.Screens = A.Screens || {};
  const Actions = A.Actions = A.Actions || {};

  /* ---------- who sees which menu ---------- */
  function navFor(u) {
    const S = A.Store.S;
    const n = A.tasksFor(S, u.uid).filter(x => !x.info).length;
    const canLead = A.can(S, u.uid, 'LEAD_CREATE');
    const items = { home: ['/home', '🏠', 'nav_home'], jobs: ['/jobs', '📋', u.role === 'field' ? 'nav_sites' : 'nav_jobs'], add: ['/flow/LEAD_CREATE', '＋', u.role === 'field' ? 'add_site' : 'nav_new_lead'], tasks: ['/tasks', '✅', 'nav_tasks', n], dash: ['/dash', '📊', 'nav_dash'], people: ['/people', '👥', 'nav_people'], me: ['/me', '👤', 'me'], chat: ['/chat', '💬', 'chat'] };
    let keys;
    if (A.OFFICE.includes(u.role)) keys = ['home', 'jobs', 'dash', 'people', 'me'];
    else if (u.role === 'customer') keys = ['home', 'chat', 'me'];
    else if (u.role === 'finance') keys = ['home', 'jobs', 'tasks', 'dash', 'me'];
    else keys = canLead ? ['home', 'jobs', 'add', 'tasks', 'me'] : ['home', 'jobs', 'tasks', 'me'];
    return keys.map(k => Object.assign({ key: k }, { path: items[k][0], em: items[k][1], label: items[k][2], dot: items[k][3] || 0 }));
  }
  function navHtml(u, path) {
    return `<nav class="nav" aria-label="${esc(t('menu'))}">${navFor(u).map(it => {
      const cur = path === it.path || (it.key === 'jobs' && path.startsWith('/job')) || (it.key === 'home' && path === '/');
      return `<a href="#${it.path}" class="${it.key === 'add' ? 'fab-slot' : ''}" ${cur ? 'aria-current="page"' : ''}><span class="ico" aria-hidden="true">${it.em}</span><span>${esc(t(it.label))}</span>${it.dot ? `<span class="dot">${it.dot > 99 ? '99+' : it.dot}</span>` : ''}</a>`;
    }).join('')}</nav>`;
  }

  /* ---------- render ---------- */
  const App = A.App = { navDepth: 0, lastPath: '', scrollMemo: {} };
  App.render = function () {
    const root = document.getElementById('app');
    if (!A.Store.ready) return;
    const S = A.Store.S, r = U.parseHash();
    if (A.Session.uid && (!S.users[A.Session.uid] || !S.users[A.Session.uid].active)) A.Session.logout();
    if (A.Session.idle()) { A.Session.logout(); U.toast(t('locked_idle')); }
    const u = S.users[A.Session.uid];
    let name = r.parts[0] || (u ? 'home' : 'door');
    if (!u && !['door', 'login', 'setup', 'join'].includes(name)) name = 'door';
    if (u && ['door', 'login', 'setup', 'join'].includes(name)) name = 'home';
    const screen = Screens[name] || Screens.notfound;
    let view;
    try { view = screen({ S, u, parts: r.parts, q: r.q, path: r.path }); }
    catch (e) { console.error(e); view = { title: t('error_title'), body: U.empty('⚠️', t('error_title'), String(e && e.message || e), `<button class="btn" data-a="goHome">${esc(t('nav_home'))}</button>`) }; }
    if (view.redirect) { U.go(view.redirect, true); return; }
    const practice = A.Store.mode === 'practice';
    const samePath = App.lastPath === r.path;
    if (!samePath) App.scrollMemo[App.lastPath] = window.scrollY;
    if (view.raw) root.innerHTML = (practice ? `<div class="practice-band" role="note">🎓 ${esc(t('practice_banner'))}</div>` : '') + view.body;
    else {
      const n = u ? A.tasksFor(S, u.uid).filter(x => !x.info).length : 0;
      root.innerHTML = `<div class="app ${u && !view.noNav ? 'has-nav' : ''}">
        ${practice ? `<div class="practice-band" role="note">🎓 ${esc(t('practice_banner'))}</div>` : ''}
        <header class="topbar">
          ${view.back ? `<button class="icon-btn" type="button" data-a="back" data-v="${esc(view.back)}" aria-label="${esc(t('back'))}">←</button>` : `<span class="icon-btn" aria-hidden="true" style="border:0;background:none;padding:0">${logoSvg(36)}</span>`}
          <h1>${esc(view.title || '')}${view.sub ? `<span class="sub">${esc(view.sub)}</span>` : ''}</h1>
          <button class="icon-btn" type="button" data-a="sayPage" aria-label="${esc(t('listen'))}" title="${esc(t('listen'))}">🔊</button>
          ${u && !view.noNav && u.role !== 'customer' ? `<a class="icon-btn" href="#/tasks" aria-label="${esc(t('nav_tasks'))}: ${n}">🔔${n ? `<span class="dot">${n > 99 ? '99+' : n}</span>` : ''}</a>` : ''}
        </header>
        <main class="main ${view.wide ? 'wide' : ''}" id="main" tabindex="-1">${view.body}</main>
        ${u && !view.noNav ? navHtml(u, r.path) : ''}
      </div>`;
    }
    App.view = view;
    if (view.after) { try { view.after(root); } catch (e) { console.error(e); } }
    U.hydrateBlobs(root);
    if (!samePath) {
      window.scrollTo(0, App.scrollMemo[r.path] || 0);
      const m = document.getElementById('main'); if (m && !view.keepFocus) m.focus({ preventScroll: true });
      document.title = (view.title ? view.title + ' · ' : '') + 'AIEC Elevator OS';
    }
    App.lastPath = r.path;
  };
  const logoSvg = (s = 64) => `<svg width="${s}" height="${s}" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#23262f"/><rect x="19" y="12" width="26" height="40" rx="3" fill="none" stroke="#c9a227" stroke-width="4"/><path d="M32 12v40" stroke="#c9a227" stroke-width="3"/><path d="M24 26l4-5 4 5M32 38l4 5 4-5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  App.logoSvg = logoSvg;

  /* ---------- theme + size ---------- */
  App.applyLook = function () {
    const th = A.LS.get('aiec.theme', 'auto'), sz = A.LS.get('aiec.size', 'm');
    const html = document.documentElement;
    if (th === 'auto') html.removeAttribute('data-theme'); else html.setAttribute('data-theme', th);
    html.setAttribute('data-size', sz);
    const dark = th === 'dark' || (th === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = th === 'sun' ? '#000000' : dark ? '#0d0f14' : '#23262f';
  };

  /* ---------- one place for clicks, inputs and forms ---------- */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-a]');
    if (!el) return;
    const a = el.dataset.a;
    if (a === 'scrim' && e.target !== el) return;
    const fn = Actions[a];
    if (!fn) return;
    e.preventDefault();
    A.Session.touch();
    Promise.resolve(fn(el, e)).catch(err => { console.error(err); U.toast(String(err && err.message || err), 'bad'); });
  });
  document.addEventListener('input', e => {
    const el = e.target.closest('[data-k]');
    if (el && A.Flow && A.Flow.active && el.closest('#flow')) A.Flow.input(el);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.querySelector('#sheet-host .scrim')) U.closeSheet(null);
  });
  ['pointerdown', 'keydown'].forEach(n => document.addEventListener(n, () => A.Session.touch(), { passive: true }));

  Object.assign(Actions, {
    toastClose: () => { document.getElementById('toast-host').innerHTML = ''; },
    scrim: () => U.closeSheet(null),
    sheetClose: () => U.closeSheet(null),
    sheetOk: () => U.closeSheet(true),
    sheetPick: el => U.closeSheet(el.dataset.v),
    back: el => U.back(el.dataset.v),
    goHome: () => U.go('/home'),
    go: el => U.go(el.dataset.v),
    sayPage: () => {
      const main = document.getElementById('main') || document.getElementById('app');
      const text = (App.view && App.view.say) || (main ? main.innerText.split('\n').filter(Boolean).slice(0, 14).join('. ') : '');
      if (!U.say(text)) U.toast(t('no_voice'));
    },
    setLang: el => { U.setLang(el.dataset.v); App.render(); },
    call: el => { location.href = 'tel:' + el.dataset.v; },
    tab: el => { const r = U.parseHash(); const p = r.parts.slice(0, 2).concat([el.dataset.v]).join('/'); U.go('/' + p, true); }
  });

  /* ---------- boot ---------- */
  App.boot = async function (mode) {
    App.applyLook();
    document.documentElement.lang = U.getLang();
    const m = mode || A.LS.get('aiec.mode', 'real');
    await A.Store.open(m);
    if (m === 'practice' && !A.Store.S.org) await A.Demo.seed();
    A.Session.load();
    App.render();
  };
  App.switchMode = async function (mode) {
    A.LS.set('aiec.mode', mode);
    A.Session.logout();
    document.getElementById('app').innerHTML = `<div class="empty" style="padding-top:30vh"><div class="em">🛗</div><b>${esc(t(mode === 'practice' ? 'practice_loading' : 'loading'))}</b></div>`;
    await A.Store.open(mode);
    if (mode === 'practice' && !A.Store.S.org) await A.Demo.seed();
    U.go('/door', true);
  };

  window.addEventListener('hashchange', () => { App.navDepth++; App.render(); });
  A.Store.on(() => { if (App.lastPath && !App.suspend) App.render(); });
  setInterval(() => { if (A.Session.idle()) App.render(); }, 30000);
  window.addEventListener('DOMContentLoaded', () => App.boot().catch(e => {
    console.error(e);
    document.getElementById('app').innerHTML = `<div class="empty"><div class="em">⚠️</div><b>App could not start</b><p>${esc(e && e.message || e)}</p></div>`;
  }));
  matchMedia('(prefers-color-scheme: dark)').addEventListener && matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => App.applyLook());
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* offline cache is optional */ }));
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
  App.install = async () => { if (!installEvt) return false; installEvt.prompt(); await installEvt.userChoice; installEvt = null; return true; };
  App.canInstall = () => !!installEvt;
})(window.AIEC);
