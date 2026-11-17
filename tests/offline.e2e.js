/* The installed app opens and works with no network. Run: node tests/offline.e2e.js [baseUrl] [shotsDir] */
'use strict';
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8765/', SHOTS = process.argv[3] || '';
let fails = 0;
const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { fails++; console.error('✗ ' + m); } };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE); await p.waitForTimeout(800);
  await p.click('[data-a=setLang][data-v=en]');
  await p.click('[data-a=practice]'); await p.waitForTimeout(2500);
  const sw = await p.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
  ok(sw, 'service worker active');
  await p.reload(); await p.waitForTimeout(1000);          /* let the worker take control and fill the cache */
  ok(await p.evaluate(() => !!navigator.serviceWorker.controller), 'page controlled by the service worker');
  await ctx.setOffline(true);
  await p.reload(); await p.waitForTimeout(1500);
  const people = await p.$$eval('[data-a=pickUser]', x => x.length);
  ok(people >= 10, 'opens offline with the practice company (' + people + ' people)');
  await p.click('[data-a=pickUser][data-v=u_tech1]');
  for (let i = 0; i < 4; i++) await p.click('[data-a=pinKey][data-v="1"]');
  await p.waitForTimeout(600);
  ok(await p.$('.hero') !== null, 'technician home works offline');
  if (SHOTS) await p.screenshot({ path: SHOTS + '/offline-home.png' });
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
