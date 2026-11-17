/* End-to-end: one new job from lead to AMC, done only through the screens, by every role.
   Run: python3 -m http.server 8765 &  then  node tests/e2e.js [baseUrl] [shotsDir] */
'use strict';
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8765/';
const SHOTS = process.argv[3] || '';
let step = 0, fails = 0;
const log = m => console.log('  ' + m);

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  const wait = (ms = 250) => p.waitForTimeout(ms);
  const shot = async name => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/${String(++step).padStart(2, '0')}-${name}.png`, fullPage: true }); };
  const click = async sel => { await p.click(sel); await wait(); };
  const next = () => click('[data-a=flowNext]');
  const fill = async (k, v) => { await p.fill(`#flow [data-k="${k}"]`, String(v)); await wait(80); };
  const photo = async k => { await click(`[data-a=photo][data-k="${k}"]`); await click('[data-cam=practice]'); await wait(300); };
  const camPractice = async () => { await click('[data-cam=practice]'); await wait(400); };
  const sign = () => click('[data-a=sigPractice]');
  const S = (fn, arg) => p.evaluate(fn, arg);
  let who = '';
  async function login(uid) {
    if (who === uid) return;
    await S(() => { AIEC.Session.logout(); AIEC.Flow.active = null; location.hash = '#/door'; });
    await wait(300);
    await click(`[data-a=pickUser][data-v=${uid}]`);
    for (let i = 0; i < 4; i++) await click('[data-a=pinKey][data-v="1"]');
    await wait(300);
    who = uid;
  }
  let pid = '';
  /* open the person's task of this kind on this job, exactly as tapping it in their list would */
  async function task(uid, k) {
    await login(uid);
    const path = await p.evaluate(([pid, k]) => { const x = AIEC.tasksFor(AIEC.Store.S, AIEC.Session.uid).find(t => t.pid === pid && t.k === k); return x ? AIEC.taskPath(x) : null; }, [pid, k]);
    if (!path) { fails++; const has = await p.evaluate(pid => AIEC.tasksFor(AIEC.Store.S, AIEC.Session.uid).filter(t => t.pid === pid).map(t => t.k).join(','), pid); console.error(`✗ ${uid} has no task ${k} (has: ${has || '—'})`); return false; }
    await S(() => { AIEC.Flow.active = null; });
    await p.evaluate(h => { location.hash = '#' + h; AIEC.App.render(); }, path);
    await wait(300);
    return true;
  }
  async function done(name) {
    const ok = await p.$('.success');
    const err = await p.$eval('#flow-err', e => e.textContent).catch(() => '');
    if (!ok) { fails++; console.error(`✗ ${name} did not finish${err ? ': ' + err : ''}`); await shot('FAIL-' + name); return false; }
    log('✓ ' + name);
    return true;
  }
  const stage = () => p.evaluate(pid => AIEC.Store.S.projects[pid].stage, pid);

  await p.goto(BASE); await wait(800);
  await click('[data-a=setLang][data-v=en]');
  await click('[data-a=practice]'); await wait(2500);

  console.log('Lead');
  await login('u_field1');
  await p.evaluate(() => { location.hash = '#/flow/LEAD_CREATE'; }); await wait(300);
  await next();                                          /* without the building photo: refused */
  const e1 = await p.$eval('#flow-err', e => e.textContent);
  if (!e1) { fails++; console.error('✗ step check did not stop a missing photo'); } else log('✓ missing photo is refused: ' + e1);
  await photo('ph.building'); await shot('lead-photos'); await next();
  await fill('lead.name', 'Mr. Test Kulkarni'); await fill('lead.phone', '9822555111'); await shot('lead-contact'); await next();
  await fill('lead.address', 'Plot 7, Model Colony, Pune'); await fill('lead.area', 'Model Colony'); await next();
  await shot('lead-review'); await next();
  await done('field worker adds the site');
  await shot('lead-done');
  pid = await S(() => Object.values(AIEC.Store.S.projects).find(P => P.lead.phone === '9822555111').id);
  log('job ' + pid);

  console.log('Sales');
  await task('u_sales', 'review_lead'); await shot('review-lead'); await next(); await done('sales accepts');
  await task('u_sales', 'call_customer'); await click('[data-a=set][data-k=outcome][data-v=reached]'); await shot('call'); await next(); await done('call logged');
  await task('u_sales', 'write_needs'); await click('[data-a=bump][data-k="req.stops"][data-v="1"]'); await next(); await click('[data-a=toggle][data-k="req.ard"]'); await shot('needs'); await next(); await done('needs written');
  await task('u_sales', 'make_quote'); await fill('discount', '12'); await shot('quote-over-limit'); await fill('discount', '5'); await next(); await done('quotation made');
  if (await stage() !== 'quote_ready') { fails++; console.error('✗ 5% should not need approval'); }
  await task('u_sales', 'send_quote'); await click('[data-a=set][data-k=channel][data-v=inperson]'); await next(); await done('quotation sent');
  await task('u_sales', 'get_decision'); await shot('decision'); await click('[data-a=flowDo][data-v=yes]'); await click('[data-a=sheetOk]'); await wait(300); await done('deal won');
  await task('u_sales', 'prepare_agreement'); await next(); await done('agreement prepared');
  await task('u_sales', 'sign_agreement'); await next();
  const e2 = await p.$eval('#flow-err', e => e.textContent); if (!e2) { fails++; console.error('✗ agreement without "I agree" not refused'); }
  await click('[data-a=toggle][data-k=agree]'); await next(); await sign(); await shot('agreement-sign'); await next(); await done('agreement signed');

  console.log('Money');
  const pay = async (purpose, ref) => {
    await task('u_sales', 'record_payment'); await fill('ref', ref); await next(); await done('payment recorded: ' + purpose);
    await task('u_fin', 'verify_payment'); await shot('verify-' + purpose); await next(); await done('payment confirmed: ' + purpose);
  };
  await pay('token', 'UTR4455661');
  if (await stage() !== 'site_prep') { fails++; console.error('✗ not at site prep after token'); }

  console.log('Site');
  await task('u_sales', 'prepare_site');
  for (let i = 0; i < 6; i++) { await click('[data-a=itemPhoto]'); await camPractice(); }
  await shot('site-prep'); await next(); await done('site prepared, QC asked');
  await task('u_qc', 'inspect_site'); await click('[data-a=flowDo][data-v=allPass]'); await click('[data-a=set][data-k="checks.pit_dry"][data-v=fail]'); await next();
  for (const [k, v] of [['width', 1600], ['depth', 1600], ['pit', 1300], ['head', 3900]]) await fill('meas.' + k, v);
  await next(); await photo('ph.shaft'); await next(); await shot('qc-site-result'); await next(); await done('site inspected: one fix');
  await task('u_sales', 'fix_site'); await click('[data-a=itemPhoto]'); await camPractice(); await next(); await done('fix done, QC asked again');
  await task('u_qc', 'inspect_site'); await click('[data-a=flowDo][data-v=allPass]'); await next();
  for (const [k, v] of [['width', 1600], ['depth', 1600], ['pit', 1300], ['head', 3900]]) await fill('meas.' + k, v);
  await next(); await photo('ph.shaft'); await next(); await next(); await done('site approved');
  await task('u_admin', 'release'); await shot('release'); await next(); await next(); await done('drawings released');
  await task('u_admin', 'record_permit'); await fill('no', 'EP/PUN/2026/415'); await photo('doc'); await shot('permit'); await next(); await done('erection permit recorded');

  console.log('Material');
  await task('u_sup', 'accept_po'); await next(); await done('order accepted');
  /* the office pauses the job for a supplier delay, then resumes it */
  await login('u_admin'); await p.evaluate(h => { location.hash = '#/job/' + h; AIEC.App.render(); }, pid); await wait(300);
  await click('[data-a=jobMore]'); await click('[data-a=sheetPick][data-v=hold]');
  await p.fill('[data-x=note]', 'Controller stock arrives Monday'); await click('[data-sheet-form] button[type=submit]'); await wait(300);
  await shot('job-on-hold');
  if (!(await S(h => AIEC.onHold(AIEC.Store.S.projects[h]), pid))) { fails++; console.error('✗ hold not saved'); } else log('✓ job put on hold');
  await click('[data-a=jobMore]'); await click('[data-a=sheetPick][data-v=resume]'); await wait(300);
  if (await S(h => AIEC.onHold(AIEC.Store.S.projects[h]), pid)) { fails++; console.error('✗ not resumed'); } else log('✓ work resumed');
  await task('u_sup', 'dispatch'); await fill('vehicle', 'MH12XY9876'); await photo('ph.packed'); await next(); await done('material sent');
  const tech = await S(() => Object.values(AIEC.Store.S.projects).find(P => P.lead.phone === '9822555111').tech);
  await task(tech, 'arrival'); await photo('ph.material'); await next(); await done('material arrived');
  await login(tech); await p.evaluate(h => { location.hash = '#/flow/MHAND/' + h; }, pid); await wait(300);
  await shot('mhand-blocked');
  if (!(await p.$('.empty'))) { fails++; console.error('✗ handover not blocked before payment'); } else log('✓ material handover waits for the payment');
  await pay('arrival', 'NEFT7788990');
  await task(tech, 'material_handover'); await click('[data-a=flowDo][data-v=allIn]'); await next(); await photo('ph.stack'); await sign(); await next(); await done('material handed over');

  console.log('Installation');
  await task(tech, 'safety_check'); for (const k of ['ppe', 'scaffold', 'barricade', 'earthing']) await photo('ph.' + k); await shot('safety'); await next(); await done('daily safety check');
  const READ = { 3: 1600, 6: 45, 9: 0.8, 11: 2 };
  for (let i = 0; i < 12; i++) {
    if (i === 5) await pay('cabin', 'UTR3344556');
    if (!(await task(tech, 'install'))) break;
    await photo('photo');
    if (READ[i] != null) { await fill('reading', i === 6 ? 70 : READ[i]); if (i === 6) { await next(); const e = await p.$eval('#flow-err', x => x.textContent); if (!e) { fails++; console.error('✗ bad balance reading accepted'); } else log('✓ out-of-range reading refused'); await fill('reading', READ[i]); } }
    if (i === 3) await shot('sop-step');
    await next(); if (!(await done('installation step ' + (i + 1)))) break;
  }
  await task(tech, 'request_inspection'); await next(); await done('final inspection asked');
  await task('u_qc', 'final_inspect'); await click('[data-a=flowDo][data-v=allPass]'); await next(); await photo('ph.ride'); await next(); await shot('final-result'); await next(); await done('final inspection passed');

  console.log('Handover');
  await pay('final', 'UTR9988776');
  await task(tech, 'sign_handover'); await shot('handover-sign'); await sign(); await next(); await done('customer signs (on technician phone)');
  await task(tech, 'sign_handover'); await sign(); await next(); await done('technician signs');
  await task('u_qc', 'sign_handover'); await sign(); await next(); await done('QC signs');
  await login('u_admin');
  const ks = await S(h => AIEC.tasksFor(AIEC.Store.S, AIEC.Session.uid).filter(t => t.pid === h).map(t => t.k), pid);
  if (ks.includes('complete_handover') || !ks.includes('record_licence')) { fails++; console.error('✗ admin should see record_licence, not complete_handover: ' + ks); } else log('✓ admin is asked for the licence first');
  await p.evaluate(h => { AIEC.Flow.active = null; location.hash = '#/flow/HAND_COMPLETE/' + h; AIEC.App.render(); }, pid); await wait(300); await shot('handover-needs-licence');
  if (!(await p.$('.empty'))) { fails++; console.error('✗ handover not blocked without licence'); } else log('✓ handover waits for the lift licence');
  await task('u_admin', 'record_licence'); await fill('no', 'LIC/PUN/2026/88'); await photo('doc'); await next(); await done('lift licence recorded');
  await task('u_admin', 'complete_handover'); await next(); await done('handover complete'); await shot('handover-done');
  const st = await stage();
  if (st !== 'amc') { fails++; console.error('✗ final stage ' + st); } else log('✓ job is in AMC');

  await p.evaluate(h => { location.hash = '#/job/' + h; }, pid); await wait(400); await shot('job-page');
  await p.evaluate(h => { location.hash = '#/job/' + h + '/money'; }, pid); await wait(400); await shot('job-money');
  await p.evaluate(h => { location.hash = '#/job/' + h + '/activity'; }, pid); await wait(400); await shot('job-history');
  await p.evaluate(() => { location.hash = '#/dash'; }); await wait(400); await shot('dashboard');

  /* the saved log rebuilds to the same state */
  const same = await S(() => { const r = AIEC.replay(AIEC.Store.events); return JSON.stringify(r.S.projects) === JSON.stringify(AIEC.Store.S.projects) && r.rejected.length === 0; });
  if (!same) { fails++; console.error('✗ replay differs'); } else log('✓ replay of all records gives the same state');
  /* reload: data persists on the phone */
  await p.reload(); await wait(1500);
  const after = await S(() => (Object.values(AIEC.Store.S.projects).find(P => P.lead.phone === '9822555111') || {}).stage);
  if (after !== 'amc') { fails++; console.error('✗ not saved after reload: ' + after); } else log('✓ saved after reload');

  for (const lang of ['hi', 'mr']) {
    await S(l => { AIEC.UI.setLang(l); }, lang);
    await login('u_sales'); await S(() => { location.hash = '#/home'; AIEC.App.render(); }); await wait(300); await shot('home-' + lang);
    await p.evaluate(h => { location.hash = '#/flow/LEAD_CREATE'; }); await wait(300); await shot('lead-' + lang);
  }
  const missing = await S(() => [...AIEC.UI.missing]);
  if (missing.length) { fails++; console.error('✗ words missing: ' + missing.join(' ')); } else log('✓ no missing words');
  if (errs.length) { fails++; console.error('✗ browser errors:\n' + errs.join('\n')); } else log('✓ no browser errors');
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
