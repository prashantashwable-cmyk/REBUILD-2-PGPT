/* Unit + lifecycle tests for the domain core. Run: node tests/domain.test.js */
'use strict';
require('../js/domain.js');
const A = globalThis.AIEC;
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.error('✗', msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a).slice(0, 200)} want ${JSON.stringify(b).slice(0, 200)}`);

/* ---- maths ---- */
{
  const c = A.DEFAULT_CONFIG;
  const q = A.calcQuote(c, { type: 'auto', stops: 4, capacity: '6', finish: 'ss', job: 'new' }, 0);
  /* cost = 300000 + 2*40000 + 20000 + 50000 + 60000 + 15000 = 525000; list = cost/0.4 rounded per line */
  eq(q.cost, 525000, 'quote cost');
  eq(q.list, 1312500, 'quote list');
  eq(q.gst, Math.round(1312500 * 0.18), 'gst');
  eq(q.margin, 60, 'margin at target');
  ok(!q.needsApproval, 'no approval at 0%');
  const q2 = A.calcQuote(c, { type: 'auto', stops: 4, capacity: '6', finish: 'ss', job: 'new' }, 10);
  eq(q2.why, ['over_limit'], 'over sales limit');
  const q3 = A.calcQuote(c, { type: 'auto', stops: 4, capacity: '6', finish: 'ss', job: 'new' }, 60);
  ok(q3.why.includes('below_floor') && q3.why.includes('over_admin'), 'below floor');
  const s = A.paySchedule(c, 1000000);
  eq(s, { token: 10000, arrival: 690000, final: 100000, cabin: 200000 }, 'pay schedule');
  eq(A.sum(Object.values(s)), 1000000, 'schedule adds to total');
  ok(A.validPhone('9876543210') && !A.validPhone('1234567890') && A.validPhone('+91 98765 43210'), 'phone check');
  eq(A.sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'sha256');
}

/* ---- a full job through every role ---- */
const LOG = [];
let S = A.initState(), n = 0, clock = Date.parse('2026-11-02T04:30:00Z');
const tick = (mins = 7) => { clock += mins * 60e3; return new Date(clock).toISOString(); };
function act(by, type, pid, d, expectTask) {
  const t = tick();
  A.setNow(clock);
  if (expectTask) {
    const ts = A.tasksFor(S, by).filter(x => x.pid === pid && x.type === type);
    ok(ts.length > 0, `${S.users[by] ? S.users[by].name : by} should have task ${type} on ${pid} at ${pid && S.projects[pid] ? S.projects[pid].stage : ''}; has ${A.tasksFor(S, by).map(x => x.k + '@' + x.pid).join(',')}`);
  }
  const ev = { id: 'E' + (++n), type, by, t, pid, d: d || {} };
  const why = A.validate(S, ev);
  A.setNow(null);
  if (why) { fail++; console.error('✗ refused', type, JSON.stringify(why)); return false; }
  A.apply(S, ev); LOG.push(ev); pass++; return ev;
}
function refuse(by, type, pid, d, want) {
  A.setNow(clock);
  const why = A.validate(S, { id: 'X' + (++n), type, by, t: new Date(clock).toISOString(), pid, d: d || {} });
  A.setNow(null);
  ok(why && (!want || (why.k || why) === want), `${type} by ${by} should be refused (${want}); got ${JSON.stringify(why)}`);
}
const pin = A.makePin('1111');
act('u_own', 'ORG_CREATE', '', { org: { name: 'Test Lifts' }, user: Object.assign({ uid: 'u_own', name: 'Owner' }, pin) });
refuse('u_own', 'ORG_CREATE', '', { org: { name: 'x' }, user: { uid: 'y', name: 'y', pinHash: 'z' } }, 'err_org_exists');
for (const [uid, role] of [['u_adm', 'admin'], ['u_fld', 'field'], ['u_sal', 'sales'], ['u_fin', 'finance'], ['u_qc', 'qc'], ['u_sup', 'supplier'], ['u_tch', 'tech']])
  act('u_own', 'USER_ADD', '', { user: Object.assign({ uid, name: role.toUpperCase(), role }, pin) });
refuse('u_adm', 'USER_ADD', '', { user: Object.assign({ uid: 'u_o2', name: 'x', role: 'owner' }, pin) }, 'err_owner_only');
refuse('u_own', 'USER_UPDATE', '', { uid: 'u_own', active: false }, 'err_last_owner');
refuse('u_adm', 'CONFIG_SET', '', { key: 'gst', value: 12 }, 'err_role_not_allowed');
refuse('u_own', 'CONFIG_SET', '', { key: 'gst', value: 99 }, 'err_rule_range');
refuse('u_own', 'CONFIG_SET', '', { key: 'minMargin', value: 70 }, 'err_rule_margin');

const pid = 'PUN-2611-AAAA';
refuse('u_fld', 'LEAD_CREATE', pid, { lead: { name: 'Mr. Patil', phone: '12345', address: 'Kothrud', photos: ['p1'] } }, 'err_phone');
refuse('u_fld', 'LEAD_CREATE', pid, { lead: { name: 'Mr. Patil', phone: '9876543210', address: 'Kothrud', photos: [] } }, 'err_photo');
act('u_fld', 'LEAD_CREATE', pid, { lead: { name: 'Mr. Patil', phone: '9876543210', address: 'Kothrud, Pune', floors: 4, shaft: 'yes', contactRole: 'owner', photos: ['p1'], consent: true } });
refuse('u_fld', 'LEAD_CREATE', 'PUN-2611-BBBB', { lead: { name: 'Dup', phone: '9876543210', address: 'x', photos: ['p'] } }, 'err_dup_phone');
eq(S.projects[pid].stage, 'new', 'lead is new');
eq(S.projects[pid].sales, 'u_sal', 'sales assigned');
refuse('u_fld', 'LEAD_ACCEPT', pid, {}, 'err_role_not_allowed');
act('u_sal', 'LEAD_RETURN', pid, { reason: 'rr_photo' }, false);
act('u_fld', 'LEAD_FIX', pid, { lead: { photos: ['p2'] } }, true);
act('u_sal', 'LEAD_ACCEPT', pid, {}, true);
act('u_sal', 'CALL_LOG', pid, { outcome: 'reached', note: 'wants 4 stops' }, true);
eq(S.projects[pid].stage, 'contacted', 'contacted');
refuse('u_sal', 'QUOTE_MAKE', pid, { discountPct: 0 }, 'err_stage');
act('u_sal', 'NEEDS_SAVE', pid, { req: { type: 'auto', stops: 4, capacity: '6', finish: 'ss', job: 'new', ard: true, use: 'home', timeline: '1m' } }, true);
act('u_sal', 'QUOTE_MAKE', pid, { discountPct: 12 }, true);
eq(S.projects[pid].stage, 'quote_approval', 'needs approval');
refuse('u_sal', 'QUOTE_APPROVE', pid, {}, 'err_role_not_allowed');
refuse('u_adm', 'QUOTE_REJECT', pid, { note: '' }, 'err_note');
act('u_adm', 'QUOTE_REJECT', pid, { note: 'Too much discount' }, false);
eq(S.projects[pid].stage, 'requirements', 'back to requirements');
act('u_sal', 'QUOTE_MAKE', pid, { discountPct: 10 }, true);
act('u_adm', 'QUOTE_APPROVE', pid, {}, true);
act('u_sal', 'QUOTE_SEND', pid, { channel: 'whatsapp' }, true);
act('u_sal', 'DEAL_WON', pid, {}, true);
act('u_sal', 'AGREE_PREPARE', pid, {}, true);
const P = S.projects[pid];
eq(A.sum(Object.values(P.schedule)), A.lastQuote(P).calc.total, 'schedule = total');
act('u_sal', 'CUSTOMER_LOGIN', pid, Object.assign({ uid: 'u_cus' }, pin));
eq(P.customer, 'u_cus', 'customer linked');
refuse('u_cus', 'AGREE_SIGN', pid, { sig: 's', signer: 'Mr. Patil' }, 'err_agree_terms');
act('u_cus', 'AGREE_SIGN', pid, { sig: 's1', signer: 'Mr. Patil', agree: true }, true);
refuse('u_cus', 'PAY_RECORD', pid, { purpose: 'token', amount: 5, mode: 'upi', ref: 'UTR12345' }, 'err_amount');
act('u_cus', 'PAY_RECORD', pid, { purpose: 'token', amount: P.schedule.token, mode: 'upi', ref: 'UTR12345' }, true);
const pay1 = P.payments[0].id;
act('u_fin', 'PAY_VERIFY', pid, { payId: pay1, ok: true }, true);
eq(P.stage, 'site_prep', 'site prep after token');
for (const [k] of A.PREP_ITEMS) act('u_cus', 'PREP_TICK', pid, { item: k, photo: 'ph_' + k }, true);
act('u_cus', 'QC_REQUEST', pid, {}, true);
eq(P.qc, 'u_qc', 'qc assigned');
const checks = Object.fromEntries(A.QC_SITE_CHECKS.map(k => [k, 'pass']));
act('u_qc', 'QC_SITE', pid, { checks: Object.assign({}, checks, { pit_dry: 'fail' }), meas: { width: 1600, depth: 1600, pit: 1300, head: 3900 }, photos: ['q1'] }, true);
eq(P.stage, 'site_fix', 'site fix');
act('u_cus', 'CORR_DONE', pid, { cid: A.openCorr(P, 'site')[0].id, photo: 'fx' }, true);
act('u_sal', 'QC_REQUEST', pid, {}, true);
act('u_qc', 'QC_SITE', pid, { checks, meas: { width: 1600, depth: 1600, pit: 1300, head: 3900 }, photos: ['q2'] }, true);
eq(P.stage, 'site_ok', 'site ok');
refuse('u_adm', 'RELEASE', pid, { tech: 'u_sal', supplier: 'u_sup', drawing: 'D1', needBy: '2026-12-01' }, 'err_pick_tech');
act('u_adm', 'RELEASE', pid, { tech: 'u_tch', supplier: 'u_sup', drawing: 'DWG-1', needBy: '2026-11-20' }, true);
refuse('u_sup', 'DISPATCH', pid, { vehicle: 'MH12', photos: ['d'] }, 'err_accept_po_first');
act('u_sup', 'PO_ACCEPT', pid, { date: '2026-11-10' }, true);
act('u_sup', 'DISPATCH', pid, { vehicle: 'MH12AB1234', photos: ['d1'] }, true);
refuse('u_sup', 'BILL_SUBMIT', pid, { no: 'KV-77', amount: 0, doc: 'b' }, 'err_bill_amount');
act('u_sup', 'BILL_SUBMIT', pid, { no: 'KV-77', amount: 420000, doc: 'bill' }, true);
refuse('u_sup', 'BILL_SUBMIT', pid, { no: 'KV-78', amount: 1000, doc: 'b' }, 'err_bill_exists');
refuse('u_sup', 'BILL_DECIDE', pid, { bid: P.bills[0].id, ok: true }, 'err_role_not_allowed');
refuse('u_adm', 'BILL_DECIDE', pid, { bid: P.bills[0].id, ok: true, deduction: 5000 }, 'err_note');
act('u_adm', 'BILL_DECIDE', pid, { bid: P.bills[0].id, ok: true, deduction: 5000, note: 'One landing door scratched' }, true);
eq(P.bills[0].payable, 415000, 'bill payable after deduction');
ok(!A.tasksFor(S, 'u_fin').some(x => x.k === 'pay_bill'), 'no bill to pay before the customer material money');
refuse('u_fin', 'BILL_PAY', pid, { bid: P.bills[0].id, ref: 'NEFT0001' }, 'err_bill_wait_customer');
act('u_tch', 'ARRIVAL', pid, { photos: ['a1'], sealOk: true }, true);
refuse('u_tch', 'MHAND', pid, {}, 'err_wait_payment');
ok(A.tasksFor(S, 'u_tch').some(x => x.k === 'wait_payment'), 'tech sees waiting info');
act('u_sal', 'PAY_RECORD', pid, { purpose: 'arrival', amount: P.schedule.arrival, mode: 'bank', ref: 'NEFT998877' }, true);
act('u_fin', 'PAY_VERIFY', pid, { payId: P.payments[1].id, ok: false, note: 'Not in bank' }, true);
act('u_sal', 'PAY_RECORD', pid, { purpose: 'arrival', amount: P.schedule.arrival, mode: 'bank', ref: 'NEFT998878' }, true);
act('u_fin', 'PAY_VERIFY', pid, { payId: P.payments[2].id, ok: true }, true);
act('u_fin', 'BILL_PAY', pid, { bid: P.bills[0].id, ref: 'NEFT0001' }, true);
eq(A.billsOut(P), 415000, 'money out to the supplier');
const all = Object.fromEntries(P.po.items.map(m => [m.k, true]));
act('u_tch', 'MHAND', pid, { checked: all, photos: ['m1'], sig: 'sg', receiver: 'Mr. Patil' }, true);
eq(P.stage, 'installing', 'installing');
refuse('u_tch', 'SOP_STEP', pid, { i: 0, photo: 'x' }, 'err_wait_permit');
ok(A.tasksFor(S, 'u_tch').some(x => x.k === 'wait_permit' && x.info), 'tech sees it waits for the permit');
refuse('u_adm', 'STAT_RECORD', pid, { kind: 'permit', no: 'EP', date: '2026-11-02', doc: 'd' }, 'err_stat_no');
refuse('u_tch', 'STAT_RECORD', pid, { kind: 'permit', no: 'EP/77', date: '2026-11-02', doc: 'd' }, 'err_role_not_allowed');
act('u_adm', 'STAT_RECORD', pid, { kind: 'permit', no: 'EP/PUN/2026/77', date: '2026-11-02', authority: 'Lift Inspector Pune', doc: 'perm' }, true);
refuse('u_tch', 'SOP_STEP', pid, { i: 0, photo: 'x' }, 'err_safety_first');
act('u_tch', 'SAFETY', pid, { photos: Object.fromEntries(A.SAFETY_ITEMS.map(([k]) => [k, 'sf'])) }, true);
for (let i = 0; i < A.CABIN_STEP; i++) act('u_tch', 'SOP_STEP', pid, { i, photo: 's' + i, reading: A.SOP_READ[i] ? A.SOP_READ[i].min : undefined }, true);
refuse('u_tch', 'SOP_STEP', pid, { i: A.CABIN_STEP, photo: 'x' }, 'err_wait_cabin');
act('u_sal', 'PAY_RECORD', pid, { purpose: 'cabin', amount: P.schedule.cabin, mode: 'upi', ref: 'UTR55555' }, true);
act('u_fin', 'PAY_VERIFY', pid, { payId: P.payments[3].id, ok: true }, true);
refuse('u_tch', 'SOP_STEP', pid, { i: 6, photo: 's', reading: 45 }, 'err_step_order');
refuse('u_tch', 'SOP_STEP', pid, { i: 5, photo: '' }, 'err_photo');
act('u_tch', 'SOP_STEP', pid, { i: 5, photo: 's5' }, true);
refuse('u_tch', 'SOP_STEP', pid, { i: 6, photo: 's', reading: 70 }, 'err_reading');
clock += 864e5; /* next work day: a new safety check is needed */
refuse('u_tch', 'SOP_STEP', pid, { i: 6, photo: 's6', reading: 45 }, 'err_safety_first');
act('u_tch', 'SAFETY', pid, { photos: Object.fromEntries(A.SAFETY_ITEMS.map(([k]) => [k, 'sf2'])) }, true);
for (let i = 6; i < A.SOP.length; i++) act('u_tch', 'SOP_STEP', pid, { i, photo: 's' + i, reading: A.SOP_READ[i] ? A.SOP_READ[i].min : undefined }, true);
act('u_tch', 'INSPECT_REQUEST', pid, {}, true);
const fchecks = Object.fromEntries(A.QC_FINAL_CHECKS.map(k => [k, 'pass']));
act('u_qc', 'QC_FINAL', pid, { checks: Object.assign({}, fchecks, { doors: 'fail' }), photos: ['f1'] }, true);
eq(P.stage, 'install_fix', 'install fix');
act('u_tch', 'CORR_DONE', pid, { cid: A.openCorr(P, 'install')[0].id, photo: 'fx2' }, true);
act('u_tch', 'INSPECT_REQUEST', pid, {}, true);
act('u_qc', 'QC_FINAL', pid, { checks: fchecks, photos: ['f2'] }, true);
eq(P.stage, 'final_pay', 'final pay');
act('u_cus', 'PAY_RECORD', pid, { purpose: 'final', amount: P.schedule.final, mode: 'upi', ref: 'UTR77777' }, true);
act('u_fin', 'PAY_VERIFY', pid, { payId: P.payments[4].id, ok: true }, true);
eq(P.stage, 'handover', 'handover');
eq(A.paidTotal(P), A.lastQuote(P).calc.total, 'fully paid');
refuse('u_adm', 'HAND_COMPLETE', pid, {}, 'err_signatures_left');
act('u_cus', 'HAND_SIGN', pid, { slot: 'customer', sig: 'c', name: 'Mr. Patil' }, true);
refuse('u_cus', 'HAND_SIGN', pid, { slot: 'tech', sig: 'c', name: 'x' }, 'err_access');
act('u_tch', 'HAND_SIGN', pid, { slot: 'tech', sig: 't', name: 'TECH' }, true);
act('u_qc', 'HAND_SIGN', pid, { slot: 'qc', sig: 'q', name: 'QC' }, true);
refuse('u_adm', 'HAND_COMPLETE', pid, {}, 'err_need_licence');
refuse('u_adm', 'STAT_RECORD', pid, { kind: 'licence', no: 'LIC/9', date: '2026-11-03', expiry: '2026-11-01', doc: 'l' }, 'err_stat_expiry');
act('u_adm', 'STAT_RECORD', pid, { kind: 'licence', no: 'LIC/PUN/2026/9', date: '2026-11-03', expiry: '2027-11-03', doc: 'lic' }, true);
act('u_adm', 'HAND_COMPLETE', pid, {}, true);
eq(P.stage, 'amc', 'amc');
ok(A.amcDue(P).length === 4, 'four amc visits');
refuse('u_tch', 'AMC_VISIT', pid, { checks: {}, photo: 'x' }, 'err_all_checks');
act('u_cus', 'TICKET_OPEN', pid, { kind: 'breakdown', severity: 'breakdown', text: 'Door not closing' });
ok(A.tasksFor(S, 'u_tch').some(x => x.k === 'close_ticket'), 'tech gets ticket');
act('u_tch', 'TICKET_CLOSE', pid, { tid: P.amc.tickets[0].id, cause: 'door', note: 'Adjusted door sensor' }, true);

/* ---- work pay: earned per step/visit/inspection, approved by the office for a finished week, paid by Finance ---- */
{
  const wk = A.weekOf(LOG.find(e => e.type === 'SOP_STEP').t);
  const w = A.payWeek(S, 'u_tch', wk);
  eq(w.items.filter(x => x.kind === 'step').length, 12, 'twelve paid steps');
  eq(w.total, 12 * A.DEFAULT_CONFIG.paySopStep, 'step pay total');
  eq(A.payWeek(S, 'u_qc', wk).items.length, 4, 'four paid QC inspections');
  refuse('u_adm', 'PAY_WEEK_APPROVE', '', { uid: 'u_tch', week: wk }, 'err_week_open');
  clock += 8 * 864e5;
  ok(A.tasksFor(S, 'u_adm').some(x => x.k === 'approve_pay' && x.who === 'u_tch'), 'admin asked to approve the finished week');
  ok(!A.tasksFor(S, 'u_tch').some(x => x.k === 'approve_pay'), 'nobody approves their own pay');
  refuse('u_tch', 'PAY_WEEK_APPROVE', '', { uid: 'u_tch', week: wk }, 'err_role_not_allowed');
  refuse('u_fin', 'PAY_WEEK_PAID', '', { uid: 'u_tch', week: wk, ref: 'NEFT1234' }, 'err_pay_not_approved');
  act('u_adm', 'PAY_WEEK_APPROVE', '', { uid: 'u_tch', week: wk });
  refuse('u_adm', 'PAY_WEEK_APPROVE', '', { uid: 'u_tch', week: wk }, 'err_done_already');
  ok(A.tasksFor(S, 'u_fin').some(x => x.k === 'pay_week' && x.who === 'u_tch'), 'finance asked to pay');
  refuse('u_fin', 'PAY_WEEK_PAID', '', { uid: 'u_tch', week: wk, ref: 'x' }, 'err_ref');
  act('u_fin', 'PAY_WEEK_PAID', '', { uid: 'u_tch', week: wk, ref: 'NEFT556677' });
  eq(A.payWeek(S, 'u_tch', wk).paid.ref, 'NEFT556677', 'week marked paid');
  act('u_own', 'CONFIG_SET', '', { key: 'paySopStep', value: 2000 });
  eq(A.payWeek(S, 'u_tch', wk).total, 12 * A.DEFAULT_CONFIG.paySopStep, 'a rate change does not change past work');
}

/* ---- bank statement matching (suggestions only) ---- */
{
  const fake = { projects: { X: { id: 'X', payments: [
    { id: 'a', status: 'pending', amount: 10000, ref: 'UTR4455661' },
    { id: 'b', status: 'pending', amount: 250000, ref: 'NEFT-1' },
    { id: 'c', status: 'pending', amount: 999, ref: 'ZZZZ' },
    { id: 'd', status: 'confirmed', amount: 10000, ref: 'UTR4455661' } ] } } };
  const text = '17/11/2026, UPI/UTR4455661/AIEC PAYMENT, 10,000.00 Cr\n16/11/2026\tNEFT IN SHAH\t2,50,000.00\n15/11/2026; RENT; 45000\n14/11/2026, UPI/OTHER, 10000';
  eq(A.parseBank(text).map(l => l.amount), [10000, 250000, 45000, 10000], 'bank lines parsed (Indian commas, Cr)');
  const m = A.bankMatch(fake, text);
  eq(m.matches.map(x => x.payId + (x.sure ? '!' : '?')), ['a!', 'b?'], 'sure match by reference, likely match by unique amount');
  eq(m.unmatched.length, 2, 'unmatched lines listed');
}

/* ---- separation of duties ---- */
{
  const p2 = 'PUN-2611-CCCC';
  act('u_sal', 'LEAD_CREATE', p2, { lead: { name: 'Mrs. Joshi', phone: '9822000000', address: 'Baner', photos: ['x'] } });
  eq(S.projects[p2].stage, 'accepted', 'sales lead starts accepted');
  act('u_sal', 'CALL_LOG', p2, { outcome: 'reached' });
  act('u_sal', 'NEEDS_SAVE', p2, { req: { type: 'manual', stops: 2, capacity: '4', finish: 'ms', job: 'new' } });
  act('u_sal', 'QUOTE_MAKE', p2, { discountPct: 60 });
  refuse('u_adm', 'QUOTE_APPROVE', p2, {}, 'err_owner_only');
  ok(!A.tasksFor(S, 'u_adm').some(x => x.pid === p2 && x.k === 'approve_quote'), 'admin has no owner-only approval task');
  ok(A.tasksFor(S, 'u_own').some(x => x.pid === p2 && x.k === 'approve_quote'), 'owner gets approval');
  refuse('u_adm', 'STAT_RECORD', p2, { kind: 'licence', no: 'LIC-1', date: '2026-11-03', expiry: '2027-11-03', doc: 'd' }, 'err_stage');
  refuse('u_sal', 'HOLD_START', p2, { reason: 'customer', note: 'x' }, 'err_role_not_allowed');
  act('u_adm', 'HOLD_START', p2, { reason: 'customer', note: 'Customer travelling for 2 weeks' });
  refuse('u_adm', 'HOLD_START', p2, { reason: 'weather', note: 'x' }, 'err_on_hold');
  clock += 20 * 864e5; A.setNow(clock);
  ok(A.needs(S, S.projects[p2]).every(k => !k.late), 'work on hold is never late');
  A.setNow(null);
  act('u_own', 'HOLD_END', p2, {});
  refuse('u_own', 'HOLD_END', p2, {}, 'err_not_on_hold');
  act('u_sal', 'DEAL_LOST', p2, { reason: 'lr_price' });
  refuse('u_fld', 'MSG_POST', p2, { text: 'hi' }, 'err_access');
}
/* ---- replay gives the same state, and invalid records are set aside ---- */
{
  const r = A.replay([{ id: 'a', type: 'MSG_POST', by: 'nobody', t: '2026-11-01T00:00:00Z', pid: 'x', d: { text: 'hi' } }].concat(LOG.slice().reverse()));
  eq(JSON.stringify(r.S.projects), JSON.stringify(S.projects), 'replay (any order) rebuilds the same projects');
  eq(JSON.stringify(r.S.users), JSON.stringify(S.users), 'replay rebuilds the same users');
  eq(r.rejected.length, 1, 'bad record rejected');
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
