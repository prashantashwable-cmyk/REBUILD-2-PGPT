/* =====================================================================
   Practice company: people of every role and jobs at every stage.
   Every practice record goes through the same rules as real work,
   so what you practise is exactly what happens for real.
   Every PIN is 1111.
   ===================================================================== */
(function (A) {
  'use strict';
  const PEOPLE = [
    ['u_hq', 'Anil Deshmukh', 'owner', '9800000001'], ['u_admin', 'Sunita Patil', 'admin', '9800000002'],
    ['u_field1', 'Ramesh Jadhav', 'field', '9800000003'], ['u_field2', 'Sachin More', 'field', '9800000004'],
    ['u_sales', 'Priya Kulkarni', 'sales', '9800000005'], ['u_fin', 'Meena Joshi', 'finance', '9800000006'],
    ['u_qc', 'Vijay Shinde', 'qc', '9800000007'], ['u_sup', 'Kaveri Lift Supply', 'supplier', '9800000008'],
    ['u_tech1', 'Ganesh Kale', 'tech', '9800000009'], ['u_tech2', 'Mahesh Shinde', 'tech', '9800000010']
  ];
  /* [customer, phone, area, building, floors, target stage, days ago it started, options] */
  const JOBS = [
    ['Mr. Gaikwad', '9822100001', 'Kothrud', 'Shanti Niwas', 4, 'new', 0, { by: 'u_field1' }],
    ['Mr. Pawar', '9822100002', 'Aundh', 'Pawar Bungalow', 3, 'returned', 1, { by: 'u_field2' }],
    ['Mrs. Kulkarni', '9822100003', 'Baner', 'Sai Heights', 6, 'accepted', 2, { by: 'u_field1' }],
    ['Mr. Bhosale', '9822100004', 'Hadapsar', 'Bhosale Plaza', 5, 'requirements', 3, {}],
    ['Mr. Joshi', '9822100005', 'Wakad', 'Joshi Residency', 4, 'quote_approval', 1, { disc: 12 }],
    ['Mrs. Deshpande', '9822100006', 'Shivajinagar', 'Deshpande Wada', 3, 'quoted', 9, {}],
    ['Mrs. Kale', '9822100007', 'Karve Nagar', 'Kale Sadan', 4, 'agreement', 1, { cust: 'u_cust1' }],
    ['Mr. Shah', '9822100008', 'Camp', 'Shah Towers', 8, 'signed', 2, { pendingToken: true }],
    ['Dr. Rao', '9822100009', 'Viman Nagar', 'Rao Clinic', 3, 'site_prep', 6, { prepDone: 3, cust: 'u_cust2' }],
    ['Mr. Iyer', '9822100010', 'Kalyani Nagar', 'Iyer House', 4, 'qc_site', 2, {}],
    ['Mr. Naik', '9822100011', 'Pashan', 'Naik Enclave', 5, 'site_ok', 4, {}],
    ['Mrs. Mehta', '9822100012', 'Kondhwa', 'Mehta Apartments', 6, 'material_order', 3, { hold: true }],
    ['Mr. Sawant', '9822100013', 'Warje', 'Sawant Niwas', 4, 'arrived', 2, {}],
    ['Mr. Kadam', '9822100014', 'Sinhagad Road', 'Kadam Heights', 5, 'installing', 3, { steps: 4, tech: 'u_tech1' }],
    ['Mr. Patwardhan', '9822100015', 'Erandwane', 'Patwardhan Wada', 3, 'qc_final', 1, { tech: 'u_tech2' }],
    ['Mrs. Gokhale', '9822100016', 'Deccan', 'Gokhale Mansion', 4, 'handover', 1, { tech: 'u_tech1', signed: ['tech'] }],
    ['Mr. Apte', '9822100017', 'Sadashiv Peth', 'Apte Residency', 4, 'amc', 40, { tech: 'u_tech1', ticket: true, cust: 'u_cust3' }],
    ['Mr. Lele', '9822100018', 'Bibwewadi', 'Lele Bungalow', 2, 'lost', 12, {}]
  ];
  const REQ = (floors, i) => ({ type: i % 4 === 3 ? 'manual' : 'auto', stops: Math.max(2, floors), capacity: ['4', '6', '8', '6'][i % 4], finish: i % 2 ? 'ss' : 'ms', job: i % 5 === 4 ? 'replace' : 'new', ard: i % 3 === 0, curtain: i % 2 === 0, premium: false, use: floors > 4 ? 'society' : 'home', timeline: ['1m', '3m', '1m', '6m'][i % 4] });

  async function seed() {
    const U = A.UI, photo = [], sig = [];
    for (const lab of ['building', 'shaft', 'site', 'material', 'step', 'check']) photo.push(await A.Store.putBlob(U.practicePhoto(lab)));
    { const c = document.createElement('canvas'); c.width = 300; c.height = 120; const g = c.getContext('2d'); g.lineWidth = 3; g.beginPath(); g.moveTo(20, 80); for (let x = 20; x < 280; x += 10) g.lineTo(x, 60 + Math.sin(x / 11) * 22); g.stroke(); sig.push(await A.Store.putBlob(c.toDataURL('image/png'))); }
    const P0 = photo[0], PS = sig[0];
    const pin = A.makePin('1111');
    let S = A.initState();
    const evs = [];
    let clock = 0;
    const run = (by, type, pid, d) => {
      const t = new Date(clock).toISOString();
      const ev = { id: A.rnd(12), type, by, t, pid: pid || '', d: d || {}, v: 1 };
      A.setNow(clock);
      clock += 4 * 60e3;
      const why = A.validate(S, ev);
      A.setNow(null);
      if (why) { console.warn('practice record refused', type, pid, why); return false; }
      A.apply(S, ev); evs.push(ev); return ev;
    };
    const dayStart = n => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(9, 30, 0, 0); return Math.min(d.getTime(), Date.now() - 5 * 3600e3 - (n === 0 ? 0 : 0)); };
    clock = dayStart(45);
    run('u_hq', 'ORG_CREATE', '', { org: { name: 'AIEC (Practice)', city: 'PUN' }, user: Object.assign({ uid: 'u_hq', name: PEOPLE[0][1], phone: PEOPLE[0][3] }, pin) });
    for (const [uid, name, role, phone] of PEOPLE.slice(1)) run('u_hq', 'USER_ADD', '', { user: Object.assign({ uid, name, role, phone }, pin) });
    run('u_hq', 'CONFIG_SET', '', { key: 'payUpi', value: 'aiec.practice@upi' });
    run('u_hq', 'CONFIG_SET', '', { key: 'payName', value: 'AIEC Practice' });
    run('u_hq', 'CONFIG_SET', '', { key: 'officePhone', value: '9800000002' });

    JOBS.forEach(([name, phone, area, building, floors, target, ago, o], i) => {
      clock = dayStart(ago) + i * 60e3;
      const pid = 'PUN-P' + String(i + 1).padStart(3, '0');
      const by = o.by || 'u_sales';
      run(by, 'LEAD_CREATE', pid, { lead: { name, phone, area, building, address: building + ', ' + area + ', Pune', floors, shaft: i % 3 ? 'yes' : 'not_sure', contactRole: floors > 5 ? 'builder' : 'owner', consent: true, photos: [P0, photo[1]], notes: '' } });
      const P = () => S.projects[pid];
      if (target === 'returned') { run('u_sales', 'LEAD_RETURN', pid, { reason: 'rr_photo', note: 'Shaft photo is dark — please take again in daylight.' }); return; }
      if (target === 'lost') { run('u_sales', 'CALL_LOG', pid, { outcome: 'reached' }); run('u_sales', 'DEAL_LOST', pid, { reason: 'lr_price', note: 'Chose a cheaper local fitter.' }); return; }
      const partial = () => {
        const p = P();
        if (target === 'agreement' && o.cust && !p.customer) run('u_sales', 'CUSTOMER_LOGIN', pid, Object.assign({ uid: o.cust }, pin));
        if (target === 'signed' && o.pendingToken) run('u_sales', 'PAY_RECORD', pid, { purpose: 'token', amount: p.schedule.token, mode: 'upi', ref: 'UTR' + (500100 + i) });
        if (target === 'site_prep') A.PREP_ITEMS.slice(0, o.prepDone || 0).forEach(([k]) => run(o.cust || 'u_sales', 'PREP_TICK', pid, { item: k, photo: photo[2] }));
        if (target === 'installing' && o.steps) {
          run(p.tech, 'SAFETY', pid, { photos: Object.fromEntries(A.SAFETY_ITEMS.map(([k]) => [k, photo[5]])) });
          for (let n = 0; n < o.steps; n++) { const rd = A.SOP_READ[n]; run(p.tech, 'SOP_STEP', pid, { i: n, photo: photo[4], reading: rd ? +((rd.min + rd.max) / 2).toFixed(2) : undefined }); }
        }
        if (target === 'handover') for (const s of (o.signed || [])) run(s === 'customer' ? (p.customer || p.tech) : s === 'tech' ? p.tech : 'u_qc', 'HAND_SIGN', pid, { slot: s, sig: PS, name: s === 'customer' ? name : s === 'tech' ? (S.users[p.tech] || {}).name : 'Vijay Shinde' });
      };
      let guard = 0;
      while (guard++ < 120) {
        const p = P(), st = p.stage;
        if (st === target) { partial(); break; }
        if (st === 'new') run('u_sales', 'LEAD_ACCEPT', pid);
        else if (st === 'accepted') run('u_sales', 'CALL_LOG', pid, { outcome: 'reached', note: 'Interested, wants a quotation.' });
        else if (st === 'contacted') run('u_sales', 'NEEDS_SAVE', pid, { req: REQ(floors, i) });
        else if (st === 'requirements') run('u_sales', 'QUOTE_MAKE', pid, { discountPct: o.disc || (i % 3 === 0 ? 5 : 3) });
        else if (st === 'quote_approval') run('u_admin', 'QUOTE_APPROVE', pid);
        else if (st === 'quote_ready') run('u_sales', 'QUOTE_SEND', pid, { channel: 'whatsapp' });
        else if (st === 'quoted') run('u_sales', 'DEAL_WON', pid);
        else if (st === 'won') run('u_sales', 'AGREE_PREPARE', pid);
        else if (st === 'agreement') {
          if (o.cust && !p.customer) run('u_sales', 'CUSTOMER_LOGIN', pid, Object.assign({ uid: o.cust }, pin));
          run(o.cust || 'u_sales', 'AGREE_SIGN', pid, { sig: PS, signer: name, agree: true });
        } else if (st === 'signed') {
          if (!A.activePay(p, 'token')) run('u_sales', 'PAY_RECORD', pid, { purpose: 'token', amount: p.schedule.token, mode: 'upi', ref: 'UTR' + (500100 + i) });
          else run('u_fin', 'PAY_VERIFY', pid, { payId: A.activePay(p, 'token').id, ok: true });
        } else if (st === 'site_prep') {
          A.PREP_ITEMS.forEach(([k]) => { if (!P().prep[k]) run(o.cust || 'u_sales', 'PREP_TICK', pid, { item: k, photo: photo[2] }); });
          run('u_sales', 'QC_REQUEST', pid);
        } else if (st === 'qc_site') run('u_qc', 'QC_SITE', pid, { checks: Object.fromEntries(A.QC_SITE_CHECKS.map(k => [k, 'pass'])), meas: { width: 1650, depth: 1600, pit: 1400, head: 4000 }, photos: [photo[2]] });
        else if (st === 'site_ok') { if (!p.statutory.permit) run('u_admin', 'STAT_RECORD', pid, { kind: 'permit', no: 'EP/PUN/26/' + (100 + i), date: A.todayStr(new Date(clock)), authority: 'Lift Inspector, Pune', doc: photo[2] }); run('u_admin', 'RELEASE', pid, { tech: o.tech || (i % 2 ? 'u_tech2' : 'u_tech1'), supplier: 'u_sup', drawing: 'DWG-P' + (i + 1) + '-R1', needBy: A.addDays(10, new Date(clock)) }); }
        else if (st === 'material_order') {
          if (!p.po.accepted) run('u_sup', 'PO_ACCEPT', pid, { date: A.addDays(2, new Date(clock)) });
          else run('u_sup', 'DISPATCH', pid, { vehicle: 'MH12AB' + (1000 + i), driver: 'Rajesh', photos: [photo[3]] });
        } else if (st === 'dispatched') run(p.tech, 'ARRIVAL', pid, { photos: [photo[3]], sealOk: true });
        else if (st === 'arrived') {
          if (!A.activePay(p, 'arrival')) run('u_sales', 'PAY_RECORD', pid, { purpose: 'arrival', amount: p.schedule.arrival, mode: 'bank', ref: 'NEFT' + (700100 + i) });
          else if (!A.payConfirmed(p, 'arrival')) run('u_fin', 'PAY_VERIFY', pid, { payId: A.activePay(p, 'arrival').id, ok: true });
          else run(p.tech, 'MHAND', pid, { checked: Object.fromEntries(p.po.items.map(m => [m.k, true])), photos: [photo[3]], sig: PS, receiver: name });
        } else if (st === 'installing') {
          if (!A.safetyToday(p, new Date(clock).toISOString())) { run(p.tech, 'SAFETY', pid, { photos: Object.fromEntries(A.SAFETY_ITEMS.map(([k]) => [k, photo[5]])) }); continue; }
          const n = A.sopNext(p);
          if (n >= A.SOP.length) { run(p.tech, 'INSPECT_REQUEST', pid); continue; }
          if (n >= A.CABIN_STEP && p.schedule.cabin && !A.payConfirmed(p, 'cabin')) {
            if (!A.activePay(p, 'cabin')) run('u_sales', 'PAY_RECORD', pid, { purpose: 'cabin', amount: p.schedule.cabin, mode: 'upi', ref: 'UTR' + (800100 + i) });
            else run('u_fin', 'PAY_VERIFY', pid, { payId: A.activePay(p, 'cabin').id, ok: true });
            continue;
          }
          const rd = A.SOP_READ[n];
          run(p.tech, 'SOP_STEP', pid, { i: n, photo: photo[4], reading: rd ? +((rd.min + rd.max) / 2).toFixed(2) : undefined });
        } else if (st === 'qc_final') run('u_qc', 'QC_FINAL', pid, { checks: Object.fromEntries(A.QC_FINAL_CHECKS.map(k => [k, 'pass'])), photos: [photo[5]] });
        else if (st === 'final_pay') {
          if (!A.activePay(p, 'final')) run('u_sales', 'PAY_RECORD', pid, { purpose: 'final', amount: p.schedule.final, mode: 'upi', ref: 'UTR' + (900100 + i) });
          else run('u_fin', 'PAY_VERIFY', pid, { payId: A.activePay(p, 'final').id, ok: true });
        } else if (st === 'handover') {
          for (const s of ['customer', 'tech', 'qc']) if (!P().hand[s]) run(s === 'customer' ? (p.customer || p.tech) : s === 'tech' ? p.tech : 'u_qc', 'HAND_SIGN', pid, { slot: s, sig: PS, name: s === 'customer' ? name : s === 'tech' ? (S.users[p.tech] || {}).name : 'Vijay Shinde' });
          if (!A.licenceOk(P(), new Date(clock).toISOString())) run('u_admin', 'STAT_RECORD', pid, { kind: 'licence', no: 'LIC/PUN/26/' + (500 + i), date: A.todayStr(new Date(clock)), expiry: A.addDays(365, new Date(clock)), authority: 'Lift Inspector, Pune', doc: photo[2] });
          run('u_admin', 'HAND_COMPLETE', pid);
        } else break;
      }
      if (o.hold) run('u_admin', 'HOLD_START', pid, { reason: 'supplier', note: 'Controller panel stock arrives next week.' });
      if (o.ticket) { clock = Date.now() - 3 * 3600e3; run(o.cust || 'u_sales', 'TICKET_OPEN', pid, { kind: 'breakdown', severity: 'breakdown', text: 'Lift door does not close fully on 2nd floor.' }); }
    });
    /* pay: weeks before last are approved and paid; last week waits for the office */
    clock = Date.now() - 3 * 3600e3;
    const lastWeek = A.weekOf(new Date(Date.now() - 7 * 864e5).toISOString());
    for (const uid of ['u_tech1', 'u_tech2', 'u_qc']) for (const w of A.payWeeks(S, uid)) if (w.week < lastWeek && w.total) {
      run('u_admin', 'PAY_WEEK_APPROVE', '', { uid, week: w.week });
      run('u_fin', 'PAY_WEEK_PAID', '', { uid, week: w.week, ref: 'NEFT' + w.week.replace(/-/g, '') });
    }
    /* a little conversation, so chat is not empty */
    clock = Date.now() - 2 * 3600e3;
    run('u_cust1', 'MSG_POST', 'PUN-P007', { text: 'Namaste, can the cabin be stainless steel?' });
    run('u_sales', 'MSG_POST', 'PUN-P007', { text: 'Yes Madam, the quotation already has stainless steel finish.' });
    run('u_tech1', 'BLOCKER_RAISE', 'PUN-P014', { reason: 'power', text: 'No 3-phase power at site today; electrician coming tomorrow.' });
    for (const ev of evs) await A.Store.put(ev);
    A.Store.events = A.Store.events.concat(evs);
    A.Store.rebuild();
    return evs.length;
  }
  A.Demo = { seed, PEOPLE };
})(window.AIEC);
