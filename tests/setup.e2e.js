/* A real company from nothing: Head Quarter setup, add a person, log in as them, wrong-PIN handling, settings.
   Run with the app served at the given url: node tests/setup.e2e.js [baseUrl] [shotsDir] */
'use strict';
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8765/', SHOTS = process.argv[3] || '';
let fails = 0;
const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { fails++; console.error('✗ ' + m); } };
(async () => {
  const b = await chromium.launch();
  for (const vp of [{ width: 400, height: 860, name: 'phone' }, { width: 1280, height: 860, name: 'desktop' }]) {
    const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height } });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    const w = (ms = 250) => p.waitForTimeout(ms);
    const shot = async n => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/setup-${vp.name}-${n}.png` }); };
    console.log(vp.name);
    await p.goto(BASE); await w(800);
    await p.click('[data-a=setLang][data-v=en]'); await w();
    await shot('door');
    await p.click('[data-a=go][data-v="/setup"]'); await w();
    await p.fill('[data-k=company]', 'Shree Lifts'); await p.fill('[data-k=name]', 'Owner One'); await p.fill('[data-k=phone]', '9811111111');
    await p.fill('[data-k=pin1]', '2468'); await p.fill('[data-k=pin2]', '2460');
    await p.click('#setup-form button[type=submit]'); await w();
    ok((await p.textContent('#setup-err')).length > 0, 'mismatched PIN refused');
    await p.fill('[data-k=pin2]', '2468'); await shot('setup');
    await p.click('#setup-form button[type=submit]'); await w(600);
    ok(await p.evaluate(() => !!AIEC.Store.S.org && AIEC.Session.uid !== ''), 'company created and Head Quarter signed in');
    await shot('home-empty');
    await p.evaluate(() => { location.hash = '#/people'; }); await w();
    await p.click('[data-a=addPerson]'); await w();
    await p.fill('[data-x=name]', 'Seema Sales'); await p.selectOption('[data-x=role]', 'sales'); await p.fill('[data-x=pin]', '1357');
    await shot('add-person');
    await p.click('[data-sheet-form] button[type=submit]'); await w(500);
    const sid = await p.evaluate(() => Object.values(AIEC.Store.S.users).find(u => u.name === 'Seema Sales').uid);
    ok(!!sid, 'person added');
    await shot('people');
    await p.evaluate(() => { location.hash = '#/rules'; }); await w(); await shot('rules');
    await p.evaluate(() => { AIEC.Session.logout(); location.hash = '#/door'; }); await w(400);
    await p.click(`[data-a=pickUser][data-v=${sid}]`); await w();
    for (const d of '9999') await p.click(`[data-a=pinKey][data-v="${d}"]`);
    await w(500);
    ok((await p.textContent('#pin-msg')).includes('4'), 'wrong PIN shows tries left');
    await shot('wrong-pin');
    for (const d of '1357') await p.click(`[data-a=pinKey][data-v="${d}"]`);
    await w(600);
    ok(await p.evaluate(id => AIEC.Session.uid === id, sid), 'sales person signed in with their PIN');
    await shot('sales-home');
    await p.evaluate(() => { location.hash = '#/me'; }); await w();
    await p.click('[data-a=setTheme][data-v=dark]'); await w(); await shot('me-dark');
    ok(await p.evaluate(() => document.documentElement.dataset.theme === 'dark'), 'dark theme applies');
    await p.click('[data-a=setTheme][data-v=sun]'); await w(); await shot('me-sun');
    await p.click('[data-a=setTheme][data-v=auto]'); await w();
    ok(!errs.length, 'no browser errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
    await p.evaluate(() => AIEC.Store.wipe()); await ctx.close();
  }
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
