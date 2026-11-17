/* WCAG 2.1 AA + best-practice audit (axe-core) of the main screens, every role, three themes.
   Needs: npm install (dev dependency axe-core). Run: node tests/a11y.e2e.js [baseUrl] */
'use strict';
const { chromium } = require('playwright'); const fs=require('fs');
const AXE=fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8');
const BASE=process.argv[2]||'http://localhost:8765/';
(async()=>{
 const b=await chromium.launch(); const p=await (await b.newContext({bypassCSP:true,viewport:{width:400,height:860}})).newPage();
 await p.goto(BASE); await p.waitForTimeout(800);
 await p.click('[data-a=setLang][data-v=en]'); await p.click('[data-a=practice]'); await p.waitForTimeout(2500);
 const all={};
 async function audit(name){ await p.addScriptTag({content:AXE}); const r=await p.evaluate(async()=>{const x=await axe.run(document,{runOnly:['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice']}); return x.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,n:v.nodes.length,ex:v.nodes.slice(0,2).map(n=>n.target.join(' ')+' :: '+(n.failureSummary||'').split('\n').slice(1,2).join(''))}));}); for(const v of r){ const k=v.id; all[k]=all[k]||{impact:v.impact,help:v.help,screens:[],ex:v.ex}; all[k].screens.push(name+'('+v.n+')'); } }
 await audit('door');
 const login=async uid=>{await p.evaluate(()=>{AIEC.Session.logout();location.hash='#/door'}); await p.waitForTimeout(300); await p.click(`[data-a=pickUser][data-v=${uid}]`); await p.waitForTimeout(200); await audit('login'); for(let i=0;i<4;i++) await p.click('[data-a=pinKey][data-v="1"]'); await p.waitForTimeout(400);};
 const go=async (h,name)=>{await p.evaluate(h=>{location.hash=h;AIEC.App.render()},h); await p.waitForTimeout(400); await audit(name);};
 await login('u_hq'); await audit('home-hq'); await go('#/jobs','jobs'); await go('#/job/PUN-P014','job'); await go('#/job/PUN-P014/money','job-money'); await go('#/job/PUN-P007/chat','chat'); await go('#/dash','dash'); await go('#/people','people'); await go('#/rules','rules'); await go('#/me','me'); await go('#/pay','pay-office'); await go('#/pay/u_tech1','pay-person'); await go('#/flow/RELEASE/PUN-P011','flow-release'); await go('#/doc/quote/PUN-P006','doc');
 await login('u_field1'); await go('#/flow/LEAD_CREATE','flow-lead');
 await login('u_qc'); await go('#/flow/QC_SITE/PUN-P010','flow-qc'); await go('#/pay','my-pay');
 await login('u_cust1'); await audit('home-cust'); await go('#/flow/AGREE_SIGN/PUN-P007','flow-agree');
 for(const th of ['dark','sun']){ await p.evaluate(t=>{localStorage.setItem('aiec.theme',JSON.stringify(t));AIEC.App.applyLook();AIEC.App.render()},th); await p.waitForTimeout(300); await audit('home-cust-'+th); }
 for(const [k,v] of Object.entries(all)) console.log(`[${v.impact}] ${k}: ${v.help}\n   on: ${v.screens.join(', ')}\n   e.g. ${v.ex.join('\n        ')}`);
 await b.close();
 if(!Object.keys(all).length) { console.log('NO VIOLATIONS'); process.exit(0); } process.exit(1);
})();
