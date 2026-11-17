/* =====================================================================
   Screens (2/2): one job, chat, printable papers, people, business rules,
   office dashboard, me & settings
   ===================================================================== */
(function (A) {
  'use strict';
  const U = A.UI, { esc, t } = U;
  const Screens = A.Screens, Actions = A.Actions;
  const dispatch = async (type, pid, d, okMsg) => {
    const r = await A.Store.dispatch(type, pid, d);
    if (!r.ok) { U.toast(U.errText(r.err), 'bad'); return false; }
    if (okMsg) U.toast(okMsg, 'ok');
    return r;
  };
  A.dispatchUI = dispatch;

  /* =====================================================================
     one job: header, journey, next step, then tabs
     ===================================================================== */
  Screens.job = ({ S, u, parts }) => {
    const P = S.projects[parts[1]];
    if (!P || !A.canSee(S, u.uid, P)) return { title: t('not_found'), back: '/jobs', body: U.empty('🔒', t('err_access')) };
    const tabs = [['overview', t('tab_overview')]];
    if (A.seesMoney(u.role) && (P.quotes.length || P.schedule)) tabs.push(['money', t('tab_money')]);
    tabs.push(['photos', t('tab_photos')], ['activity', t('tab_activity')], ['chat', t('chat') + (P.chat.length ? ' ' + P.chat.length : '')]);
    const tab = tabs.some(x => x[0] === parts[2]) ? parts[2] : 'overview';
    const myTasks = A.tasksFor(S, u.uid).filter(k => k.pid === P.id);
    const w = A.waitingOn(S, P);
    const canCall = u.role !== 'supplier' && P.lead.phone;
    const directions = U.mapsLink(P.lead.gps, P.lead.address);
    const head = `<section class="card stack">
      <div class="card-head" style="margin:0"><span class="avatar" aria-hidden="true">${U.stageEm(P.stage)}</span><div style="flex:1;min-width:0"><h2>${esc(P.lead.name)}</h2><div class="muted small">${esc(P.lead.building || '')}${P.lead.building && P.lead.area ? ' · ' : ''}${esc(P.lead.area || '')}</div></div></div>
      ${U.rail(P.stage)}
      <div class="row-flex">${U.chip(U.stageName(P.stage), P.stage === 'amc' ? 'ok' : P.stage === 'lost' ? 'bad' : 'info')}${A.OPEN_STAGES.includes(P.stage) ? U.chip(t('since_days', { n: Math.max(0, A.daysBetween(P.since, A.nowISO())) })) : ''}${P.blockers.some(b => b.open) ? U.chip('⚠️ ' + t('has_problem'), 'bad') : ''}${A.onHold(P) ? U.chip('⏸️ ' + t('on_hold'), 'warn') : ''}</div>
      <div class="grid2 no-print">
        ${canCall ? `<a class="btn sm" href="tel:${esc(P.lead.phone)}">📞 ${esc(t('call'))}</a>` : ''}
        ${directions ? `<a class="btn sm" href="${esc(directions)}" target="_blank" rel="noopener">🧭 ${esc(t('directions'))}</a>` : ''}
        <button class="btn sm" type="button" data-a="jobMore" data-v="${esc(P.id)}">⋯ ${esc(t('more'))}</button>
      </div>
    </section>`;
    let next;
    if (myTasks.length) next = `<section class="stack" aria-label="${esc(t('your_turn'))}">${myTasks.map(k => A.taskRow(k, S, { role: u.role })).join('')}</section>`;
    else if (P.stage === 'lost') next = U.banner('❌', `<b>${esc(t('next_lost'))}</b>${esc(t(P.lostReason || 'lr_other'))}${P.lostNote ? ' — ' + esc(P.lostNote) : ''}`, 'bad');
    else if (P.stage === 'amc') next = U.banner('🔑', `<b>${esc(t('next_amc'))}</b>${esc(t('lift_code'))}: <span class="mono">${esc(P.done.liftCode)}</span>`, 'ok');
    else if (w) next = U.banner('⏳', `<b>${esc(t('waiting_for', { who: A.whoFor(S, P, w.task) }))}</b>${esc(U.taskTitle(w.task))}${w.task.late ? ' · ' + esc(t('late_days', { n: w.task.lateDays })) : ''}`, w.task.late ? 'warn' : '');
    else next = U.banner('✓', esc(t('next_none')));
    const hold = A.onHold(P) ? (h => U.banner('⏸️', `<b>${esc(t('on_hold_since', { d: U.fmtD(h.from) }))}</b>${esc(t('hr_' + h.reason))} — ${esc(h.note)}`, 'warn'))(P.holds[P.holds.length - 1]) : '';
    const body = `<div class="stack-l">${head}${hold}${next}
      <div class="tabs no-print" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" aria-selected="${k === tab}" data-a="tab" data-v="${k}">${esc(l)}</button>`).join('')}</div>
      <div role="tabpanel">${TABS[tab](P, S, u)}</div></div>`;
    return { title: P.id, sub: U.stageName(P.stage), back: u.role === 'customer' ? '/home' : '/jobs', body,
      after(root) {
        const f = root.querySelector('#chat-form');
        if (f) f.addEventListener('submit', async e => {
          e.preventDefault();
          const inp = f.querySelector('textarea'); const v = inp.value.trim(); if (!v) return;
          if (await dispatch('MSG_POST', P.id, { text: v })) { const box = document.querySelector('#chat-form textarea'); if (box) box.focus(); }
        });
        const list = root.querySelector('.chat'); if (list) list.lastElementChild && list.lastElementChild.scrollIntoView({ block: 'nearest' });
      } };
  };
  const kv = rows => `<dl class="kv">${rows.filter(r => r && r[1] !== '' && r[1] != null).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
  const person = uid => uid ? esc(U.userName(uid)) : `<span class="muted">${esc(t('not_assigned'))}</span>`;
  const TABS = {
    overview(P, S, u) {
      const L = P.lead, r = P.req;
      const out = [];
      out.push(`<div class="card stack"><h3>📍 ${esc(t('site_details'))}</h3>${kv([
        [t('person_name'), esc(L.name)], [t('phone'), u.role === 'supplier' ? '••••' : `<a href="tel:${esc(L.phone)}">${esc(L.phone)}</a>`], [t('contact_role'), esc(t('cr_' + L.contactRole))],
        [t('address'), esc(L.address)], [t('floors'), L.floors || ''], [t('shaft_ready'), esc(t('sh_' + L.shaft))], [t('notes'), esc(L.notes)],
        [t('gps'), L.gps ? `<a href="${esc(U.mapsLink(L.gps))}" target="_blank" rel="noopener">${L.gps.lat}, ${L.gps.lng}</a>` : ''], [t('added_by'), esc(U.userName(P.createdBy)) + ' · ' + esc(U.fmtD(P.t))]
      ])}${P.returnReason ? U.banner('↩️', `<b>${esc(t('returned_because'))}</b>${esc(t(P.returnReason))}${P.returnNote ? ' — ' + esc(P.returnNote) : ''}`, 'warn') : ''}</div>`);
      if (r) out.push(`<div class="card stack"><h3>📝 ${esc(t('lift_needs'))}</h3>${kv([
        [t('q_type'), esc(t('type_' + r.type))], [t('q_stops'), r.stops], [t('q_cap'), esc(t('cap_n', { n: r.capacity }))], [t('q_finish'), esc(t('fin_' + r.finish))], [t('q_job'), esc(t('job_' + r.job))],
        [t('addons'), esc(['ard', 'curtain', 'premium'].filter(k => r[k]).map(k => t('add_' + k)).join(', ') || '—')], [t('q_use'), esc(t('use_' + r.use))], [t('q_timeline'), esc(t('tl_' + r.timeline))]
      ])}</div>`);
      out.push(`<div class="card stack"><h3>👥 ${esc(t('team'))}</h3>${kv([[t('r_sales'), person(P.sales)], [t('r_qc'), person(P.qc)], [t('r_tech'), person(P.tech)], [t('r_supplier'), person(P.supplier)], [t('r_customer'), P.customer ? person(P.customer) + ' ' + U.chip(t('has_login'), 'ok') : `<span class="muted">${esc(t('no_login'))}</span>`]])}</div>`);
      if (A.stageIdx(P.stage) >= A.stageIdx('site_ok') && P.stage !== 'lost') {
        const st = P.statutory || {}, row = k => { const x = st[k]; return [t('stat_title_' + k), x ? `✅ <span class="mono">${esc(x.no)}</span>${x.expiry ? ' · ' + esc(t('valid_till', { d: U.fmtD(x.expiry) })) : ''}${x.doc ? ` <button type="button" class="link-btn" data-a="viewPhoto" data-v="${esc(x.doc)}">📄</button>` : ''}` : `<span class="muted">${esc(t('not_yet'))}</span>`]; };
        out.push(`<div class="card stack"><h3>⚖️ ${esc(t('stat_papers'))}</h3>${kv([row('permit'), row('licence')])}</div>`);
      }
      if (P.stage === 'installing' || P.sop.length) {
        const n = A.sopNext(P);
        out.push(`<div class="card stack"><div class="card-head"><h3>🔧 ${esc(t('install_progress'))}</h3><span class="chip info">${n}/${A.SOP.length}</span></div><div class="steps-dots" aria-hidden="true">${A.SOP.map((s, i) => `<i class="${P.sop[i] ? 'done' : i === n ? 'on' : ''}"></i>`).join('')}</div>
          <ol class="small" style="margin:0;padding-left:20px">${A.SOP.map(([k, em], i) => `<li style="color:${P.sop[i] ? 'var(--ok)' : 'inherit'}">${em} ${esc(t('sop_' + k))}${P.sop[i] ? ' ✓' + (P.sop[i].reading != null ? ` <span class="muted">(${P.sop[i].reading} ${esc(A.SOP_READ[i].unit)})</span>` : '') : ''}</li>`).join('')}</ol></div>`);
      }
      if (P.corrections.length) out.push(`<div class="card stack"><h3>🛠️ ${esc(t('corrections'))}</h3><div class="list">${P.corrections.map(c => `<div class="row-flex">${c.done ? '✅' : '⬜'} <span>${esc(t(c.k, c.v))}</span><span class="spacer"></span>${c.done ? `<span class="muted tiny">${esc(U.fmtD(c.done.t))}</span>` : ''}</div>`).join('')}</div></div>`);
      if (P.po) out.push(`<div class="card stack"><h3>📦 ${esc(t('material'))} · <span class="mono small">${esc(P.po.no)}</span></h3>${kv([[t('drawing'), esc(P.po.drawing)], [t('need_by'), esc(U.fmtD(P.po.needBy))], [t('dispatch_date'), P.po.accepted ? esc(U.fmtD(P.po.accepted.date)) : ''], [t('vehicle'), P.dispatch ? esc(P.dispatch.vehicle) : ''], [t('arrived_on'), P.arrival ? esc(U.fmtDT(P.arrival.t)) : ''], [t('received_by'), P.mhand ? esc(P.mhand.receiver) : '']])}
        <details class="fold"><summary>${esc(t('material_list'))} (${P.po.items.length})</summary><div class="in"><table class="money">${P.po.items.map(m => `<tr><td>${esc(t(m.k))}</td><td>${m.q}</td></tr>`).join('')}</table></div></details></div>`);
      if (P.blockers.length) out.push(`<div class="card stack"><h3>⚠️ ${esc(t('problems'))}</h3>${P.blockers.slice().reverse().map(b => `<div class="qbox"><div class="row-flex">${b.open ? U.chip(t('open'), 'bad') : U.chip(t('solved'), 'ok')}<b>${esc(t('br_' + b.reason))}</b><span class="spacer"></span><span class="tiny muted">${esc(U.fmtDT(b.t))}</span></div><p>${esc(b.text)}</p>${b.solved ? `<p class="small muted">✓ ${esc(b.solved.note)} — ${esc(U.userName(b.solved.by))}</p>` : ''}</div>`).join('')}</div>`);
      if (P.stage === 'amc') {
        out.push(`<div class="card stack"><h3>🛠️ ${esc(t('amc_visits'))}</h3>${kv([[t('handed_over'), esc(U.fmtD(P.done.t))], [t('warranty_till'), esc(U.fmtD(A.warrantyEnd(P)))], [t('lift_code'), `<span class="mono">${esc(P.done.liftCode)}</span>`]])}
          <div class="list">${A.amcDue(P).map(v => `<div class="row-flex">${v.visit ? '✅' : v.due < A.todayStr() ? '🔴' : '⬜'} <span>${esc(t('visit_n', { n: v.n }))} · ${esc(U.fmtD(v.due))}</span><span class="spacer"></span>${v.visit ? `<span class="tiny muted">${esc(U.userName(v.visit.by))}</span>` : ''}</div>`).join('')}</div></div>`);
        if (P.amc.tickets.length) out.push(`<div class="card stack"><h3>🚨 ${esc(t('tickets'))}</h3>${P.amc.tickets.slice().reverse().map(x => `<div class="qbox"><div class="row-flex">${x.closed ? U.chip(t('closed'), 'ok') : U.chip(t('open'), 'bad')}${U.chip(t('sev_' + x.severity), x.severity === 'routine' ? '' : 'warn')}<span class="spacer"></span><span class="tiny muted">${esc(U.fmtDT(x.t))}</span></div><p>${esc(x.text)}</p><p class="small muted">${esc(t('assigned_to'))}: ${esc(U.userName(x.to))}</p>${x.closed ? `<p class="small">✓ ${esc(t('rc_' + x.closed.cause))} — ${esc(x.closed.note)}</p>` : ''}</div>`).join('')}</div>`);
      }
      return `<div class="stack">${out.join('')}</div>`;
    },
    money(P, S, u) {
      const out = [];
      const q = A.lastQuote(P);
      if (q) {
        const c = q.calc;
        out.push(`<div class="card stack"><div class="card-head"><h3>🧮 ${esc(t('quotation'))} v${q.v}</h3>${q.sent ? U.chip(t('sent'), 'ok') : q.approved ? U.chip(t('approved'), 'ok') : q.rejected ? U.chip(t('rejected'), 'bad') : U.chip(U.stageName(P.stage), 'info')}</div>
          ${quoteTable(c, A.seesMargin(u.role))}
          ${q.sent ? `<p class="small muted">${esc(t('valid_till', { d: U.fmtD(A.quoteValidTill(q, S.config)) }))}</p>` : ''}
          <a class="btn sm" href="#/doc/quote/${esc(P.id)}">🖨️ ${esc(t('view_quote'))}</a></div>`);
        if (P.quotes.length > 1) out.push(`<details class="fold"><summary>🗂️ ${esc(t('older_versions'))} (${P.quotes.length - 1})</summary><div class="in list">${P.quotes.slice(0, -1).reverse().map(x => `<div class="row-flex"><b>v${x.v}</b><span>${U.money(x.calc.total)}</span><span class="muted small">${esc(t('discount'))} ${x.calc.discountPct}%</span><span class="spacer"></span>${x.rejected ? U.chip(t('rejected'), 'bad') : ''}</div>${x.rejected ? `<p class="small muted">${esc(x.rejected.note)}</p>` : ''}`).join('')}</div></details>`);
      }
      if (P.schedule) {
        out.push(`<div class="card stack"><div class="card-head"><h3>💰 ${esc(t('payments'))}</h3><span class="chip gold">${U.money(A.paidTotal(P))} / ${U.money(P.agreement.total)}</span></div>
          <div class="progress" aria-hidden="true"><i style="width:${Math.round(A.paidTotal(P) / P.agreement.total * 100)}%"></i></div>
          <div class="list">${A.PURPOSES.filter(k => P.schedule[k]).map(k => { const p = A.activePay(P, k); return `<div class="row" style="min-height:56px"><span class="ico">${p && p.status === 'confirmed' ? '✅' : p ? '⏳' : A.payOpen(P, k) ? '💰' : '⬜'}</span><span class="body"><span class="title">${esc(t('pay_' + k))}</span><div class="sub">${esc(t('pw_' + k))}</div></span><b class="num">${U.money(P.schedule[k])}</b></div>`; }).join('')}</div>
          ${A.can(S, u.uid, 'PAY_RECORD', P.id) ? A.PURPOSES.filter(k => A.payOpen(P, k)).map(k => `<a class="btn primary block" href="#/flow/PAY_RECORD/${esc(P.id)}?purpose=${k}">💰 ${esc(t('record_x', { x: t('pay_' + k) }))}</a>`).join('') : ''}
          ${P.agreement.signed ? `<a class="btn sm" href="#/doc/agreement/${esc(P.id)}">📄 ${esc(t('view_agreement'))}</a>` : ''}</div>`);
        if (P.payments.length) out.push(`<div class="card stack"><h3>🧾 ${esc(t('payment_records'))}</h3>${P.payments.slice().reverse().map(p => `<div class="qbox"><div class="row-flex"><b>${esc(t('pay_' + p.purpose))}</b><span class="spacer"></span><b class="num">${U.money(p.amount)}</b></div><div class="row-flex small">${U.chip(t('ps_' + p.status), p.status === 'confirmed' ? 'ok' : p.status === 'failed' ? 'bad' : 'warn')}<span>${esc(t('pm_' + p.mode))} · <span class="mono">${esc(p.ref)}</span></span></div><p class="tiny muted">${esc(t('recorded_by', { name: U.userName(p.recordedBy), d: U.fmtDT(p.t) }))}${p.verifiedBy ? ' · ' + esc(t('checked_by', { name: U.userName(p.verifiedBy) })) : ''}${p.note ? ' · ' + esc(p.note) : ''}</p></div>`).join('')}</div>`);
      }
      return `<div class="stack">${out.join('') || U.empty('💰', t('nothing_here'))}</div>`;
    },
    photos(P) {
      const groups = [];
      const add = (title, ids) => { ids = (ids || []).filter(Boolean); if (ids.length) groups.push([title, ids]); };
      add(t('ph_lead'), P.lead.photos);
      add(t('ph_prep'), Object.values(P.prep).map(x => x.photo));
      P.qcSite.forEach((x, i) => add(t('ph_site_qc') + ' ' + (i + 1), x.photos));
      add(t('ph_fixes'), P.corrections.filter(c => c.done).map(c => c.done.photo));
      if (P.dispatch) add(t('ph_dispatch'), P.dispatch.photos);
      if (P.arrival) add(t('ph_arrival'), P.arrival.photos);
      if (P.mhand) add(t('ph_mhand'), P.mhand.photos);
      add(t('ph_safety'), Object.values(P.safety).flatMap(x => Object.values(x.photos)));
      add(t('ph_steps'), P.sop.map(x => x && x.photo));
      P.qcFinal.forEach((x, i) => add(t('ph_final_qc') + ' ' + (i + 1), x.photos));
      add(t('ph_service'), P.amc.visits.map(v => v.photo));
      if (!groups.length) return U.empty('📷', t('no_photos'));
      return `<div class="stack">${groups.map(([title, ids]) => `<div class="card stack"><h3>${esc(title)} <span class="muted small">${ids.length}</span></h3><div class="photos">${ids.map(id => `<button type="button" class="photo-slot filled" data-a="viewPhoto" data-v="${esc(id)}" aria-label="${esc(title)}">${U.imgTag(id, title)}</button>`).join('')}</div></div>`).join('')}</div>`;
    },
    activity(P, S) {
      const items = S.log.filter(x => x.pid === P.id).slice().reverse();
      return `<div class="card"><ol class="timeline">${items.map(x => `<li><div><b>${esc(t('ev_' + x.type))}</b></div><div class="small">${esc(U.userName(x.by))} · ${esc(U.roleName((S.users[x.by] || {}).role || ''))}</div><div class="when">${esc(U.fmtDT(x.t))}</div></li>`).join('')}</ol></div>`;
    },
    chat(P, S, u) {
      return `<div class="stack"><div class="chat" aria-live="polite">${P.chat.map(m => `<div class="bubble ${m.by === u.uid ? 'me' : ''}"><div class="who">${esc(U.userName(m.by))} · ${esc(U.roleName((S.users[m.by] || {}).role || ''))} · ${esc(U.fmtDT(m.t))}</div><div>${esc(m.text)}</div></div>`).join('') || `<p class="muted center">${esc(t('chat_empty'))}</p>`}</div>
        <form id="chat-form" class="card pad-s stack" novalidate>${U.field('', `<textarea maxlength="1000" placeholder="${esc(t('type_message'))}" aria-label="${esc(t('type_message'))}" style="min-height:64px"></textarea>`)}<button class="btn primary block" type="submit">${esc(t('send'))}</button></form></div>`;
    }
  };
  function quoteTable(c, margin) {
    return `<table class="money">${c.lines.map(([k, v]) => `<tr><td>${esc(t(k))}</td><td>${U.money(v)}</td></tr>`).join('')}
      ${c.discount ? `<tr><td>${esc(t('discount'))} (${c.discountPct}%)</td><td>− ${U.money(c.discount)}</td></tr>` : ''}
      <tr><td>${esc(t('price_before_gst'))}</td><td>${U.money(c.price)}</td></tr><tr><td>GST ${c.gstPct}%</td><td>${U.money(c.gst)}</td></tr>
      <tr class="total"><td>${esc(t('total'))}</td><td>${U.money(c.total)}</td></tr></table>
      ${margin ? `<p class="small">${esc(t('margin'))}: <b>${c.margin}%</b> · ${esc(t('cost'))} ${U.money(c.cost)}</p>` : ''}`;
  }
  A.quoteTable = quoteTable;
  Actions.viewPhoto = async el => {
    U.sheet(t('photo'), `<img data-blob="${esc(el.dataset.v)}" alt="" style="width:100%;border-radius:12px">`);
    U.hydrateBlobs(document.getElementById('sheet-host'));
  };
  /* the "more" menu: every action this person may take on this job, from the same rules */
  Actions.jobMore = async el => {
    const S = A.Store.S, uid = A.Session.uid, pid = el.dataset.v, P = S.projects[pid], u = S.users[uid];
    const items = [];
    if (A.can(S, uid, 'BLOCKER_RAISE', pid)) items.push({ v: 'blocker', em: '⚠️', label: t('raise_problem'), sub: t('raise_problem_d') });
    if (A.can(S, uid, 'TICKET_OPEN', pid)) items.push({ v: 'ticket', em: '🚨', label: t('report_problem') });
    if (A.can(S, uid, 'CUSTOMER_LOGIN', pid)) items.push({ v: 'custlogin', em: '🔑', label: t('make_customer_login'), sub: t('make_customer_login_d') });
    if (A.can(S, uid, 'REASSIGN', pid) && A.OPEN_STAGES.concat(['amc']).includes(P.stage)) items.push({ v: 'reassign', em: '🔁', label: t('reassign') });
    if (A.lastQuote(P) && A.seesMoney(u.role)) items.push({ v: 'quote', em: '🖨️', label: t('view_quote') });
    if (P.agreement && P.agreement.signed && A.seesMoney(u.role)) items.push({ v: 'agreement', em: '📄', label: t('view_agreement') });
    if (A.can(S, uid, 'STAT_RECORD', pid)) items.push({ v: 'stat', em: '⚖️', label: t('stat_papers'), sub: t('stat_papers_d') });
    if (A.can(S, uid, 'HOLD_START', pid)) items.push({ v: 'hold', em: '⏸️', label: t('put_on_hold'), sub: t('put_on_hold_d') });
    if (A.can(S, uid, 'HOLD_END', pid)) items.push({ v: 'resume', em: '▶️', label: t('resume_work') });
    if (A.can(S, uid, 'DEAL_LOST', pid)) items.push({ v: 'lost', em: '❌', label: t('mark_lost') });
    if (A.can(S, uid, 'LEAD_REOPEN', pid)) items.push({ v: 'reopen', em: '♻️', label: t('reopen') });
    items.push({ v: 'chat', em: '💬', label: t('chat') });
    const v = await U.choose(t('more'), items);
    if (!v) return;
    if (v === 'blocker') return U.go('/flow/BLOCKER_RAISE/' + pid);
    if (v === 'ticket') return U.go('/flow/TICKET_OPEN/' + pid);
    if (v === 'custlogin') return U.go('/flow/CUSTOMER_LOGIN/' + pid);
    if (v === 'quote') return U.go('/doc/quote/' + pid);
    if (v === 'agreement') return U.go('/doc/agreement/' + pid);
    if (v === 'chat') return U.go('/job/' + pid + '/chat');
    if (v === 'lost') return markLost(pid);
    if (v === 'reopen') return dispatch('LEAD_REOPEN', pid, {}, t('done_title'));
    if (v === 'reassign') return reassign(pid);
    if (v === 'stat') return U.go('/flow/STAT_RECORD/' + pid);
    if (v === 'resume') return dispatch('HOLD_END', pid, {}, t('work_resumed'));
    if (v === 'hold') {
      const out = await U.formSheet(t('put_on_hold'), U.field(t('reason'), `<select data-x="reason">${A.HOLD_REASONS.map(([k, em]) => `<option value="${k}">${em} ${esc(t('hr_' + k))}</option>`).join('')}</select>`, { req: true }) + U.field(t('note'), '<textarea data-x="note" maxlength="500"></textarea>', { req: true, hint: t('hold_note_hint') }), t('put_on_hold'),
        el2 => { const note = el2.querySelector('[data-x=note]').value.trim(); return note ? { reason: el2.querySelector('[data-x=reason]').value, note } : { err: 'err_note' }; });
      if (out) await dispatch('HOLD_START', pid, out, t('held_ok'));
    }
  };
  async function markLost(pid) {
    const out = await U.formSheet(t('mark_lost'), U.field(t('reason'), `<select data-x="reason">${A.LOST_REASONS.map(k => `<option value="${k}">${esc(t(k))}</option>`).join('')}</select>`, { req: true }) + U.field(t('note'), '<textarea data-x="note" maxlength="500"></textarea>'), t('mark_lost'),
      el => ({ reason: el.querySelector('[data-x=reason]').value, note: el.querySelector('[data-x=note]').value }));
    if (out) await dispatch('DEAL_LOST', pid, out, t('marked_lost'));
  }
  A.markLost = markLost;
  async function reassign(pid) {
    const S = A.Store.S, P = S.projects[pid];
    const fields = ['sales', 'qc', 'tech', 'supplier'].filter(f => A.activeUsers(S, f).length && (A.OPEN_STAGES.includes(P.stage) || ['tech', 'qc'].includes(f)));
    if (!fields.length) return U.toast(t('nobody_to_assign'));
    const f = await U.choose(t('reassign'), fields.map(x => ({ v: x, em: A.ROLE_ICON[x], label: U.roleName(x), sub: P[x] ? U.userName(P[x]) : t('not_assigned') })));
    if (!f) return;
    const who = await U.choose(U.roleName(f), A.activeUsers(S, f).map(x => ({ v: x.uid, em: x.uid === P[f] ? '✅' : A.ROLE_ICON[f], label: x.name, sub: t('open_jobs_n', { n: Object.values(S.projects).filter(Q => Q[f] === x.uid && A.OPEN_STAGES.includes(Q.stage)).length }) })));
    if (who) await dispatch('REASSIGN', pid, { field: f, uid: who }, t('saved_item'));
  }

  /* ---------- customer chat inbox ---------- */
  Screens.chat = ({ S, u }) => {
    const Ps = A.visibleProjects(S, u);
    if (Ps.length === 1) return { redirect: '/job/' + Ps[0].id + '/chat' };
    return { title: t('chat'), body: `<div class="list">${Ps.map(P => `<a class="row" href="#/job/${esc(P.id)}/chat"><span class="ico">💬</span><span class="body"><span class="title">${esc(P.id)}</span><div class="sub">${esc(P.chat.length ? P.chat[P.chat.length - 1].text : t('chat_empty'))}</div></span><span class="chev">›</span></a>`).join('') || U.empty('💬', t('chat_empty'))}</div>` };
  };

  /* ---------- printable quotation and agreement ---------- */
  Screens.doc = ({ S, u, parts }) => {
    const kind = parts[1], P = S.projects[parts[2]];
    if (!P || !A.canSee(S, u.uid, P) || !A.seesMoney(u.role)) return { redirect: '/home' };
    const q = kind === 'agreement' && P.agreement ? P.quotes.find(x => x.v === P.agreement.quoteV) : A.lastQuote(P);
    if (!q) return { redirect: '/job/' + P.id };
    const org = S.org.name;
    const head = `<div class="row-flex" style="align-items:flex-start"><div>${A.App.logoSvg(48)}</div><div style="flex:1"><b style="font-size:1.1rem">${esc(org)}</b><div class="small">${esc(t(kind === 'agreement' ? 'agreement' : 'quotation'))} · ${esc(P.id)} · v${q.v}</div><div class="small">${esc(U.fmtD(kind === 'agreement' ? P.agreement.t : q.t))}</div></div></div>`;
    const to = `<p><b>${esc(t('to'))}:</b> ${esc(P.lead.name)}, ${esc(P.lead.building ? P.lead.building + ', ' : '')}${esc(P.lead.address)}</p>`;
    const r = q.req;
    const spec = `<table class="money">${[[t('q_type'), t('type_' + r.type)], [t('q_stops'), r.stops], [t('q_cap'), t('cap_n', { n: r.capacity })], [t('q_finish'), t('fin_' + r.finish)], [t('addons'), ['ard', 'curtain', 'premium'].filter(k => r[k]).map(k => t('add_' + k)).join(', ') || '—']].map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</table>`;
    const sched = P.schedule || A.paySchedule(S.config, q.calc.total);
    const pays = `<table class="money">${A.PURPOSES.filter(k => sched[k]).map(k => `<tr><td>${esc(t('pay_' + k))}<br><span class="small muted">${esc(t('pw_' + k))}</span></td><td>${U.money(sched[k])}</td></tr>`).join('')}</table>`;
    const sig = kind === 'agreement' && P.agreement.signed ? `<div class="stack"><b>${esc(t('signed_by'))}: ${esc(P.agreement.signed.signer)}</b><img class="sig-img" data-blob="${esc(P.agreement.signed.sig)}" alt="${esc(t('signature'))}"><span class="small">${esc(U.fmtDT(P.agreement.signed.t))}</span></div>` : '';
    const body = `<div class="stack-l"><div class="doc stack">${head}<h2>${esc(t(kind === 'agreement' ? 'agreement' : 'quotation'))}</h2>${to}
      <h3>${esc(t('lift_needs'))}</h3>${spec}<h3>${esc(t('price'))}</h3>${quoteTable(q.calc, false)}
      <h3>${esc(t('payment_terms'))}</h3>${pays}
      <p class="small">${esc(t('terms_text', { m: S.config.warrantyMonths, d: S.config.installDays, v: q.validity || S.config.validityDays }))}</p>${sig}</div>
      <div class="row-flex no-print"><button class="btn block" type="button" data-a="print">🖨️ ${esc(t('print'))}</button><button class="btn block" type="button" data-a="shareQuote" data-v="${esc(P.id)}">💬 WhatsApp</button></div></div>`;
    return { title: t(kind === 'agreement' ? 'agreement' : 'quotation'), sub: P.id, back: '/job/' + P.id + '/money', body };
  };
  Actions.print = () => window.print();
  Actions.shareQuote = el => { const P = A.Store.S.projects[el.dataset.v]; window.open(waLink(P), '_blank', 'noopener'); };
  function waLink(P) {
    const q = A.lastQuote(P), S = A.Store.S;
    const msg = t('wa_quote', { name: P.lead.name, org: S.org.name, id: P.id, total: U.money(q.calc.total), till: q.sent ? U.fmtD(A.quoteValidTill(q, S.config)) : U.fmtD(A.addDays(S.config.validityDays)) });
    return 'https://wa.me/91' + P.lead.phone + '?text=' + encodeURIComponent(msg);
  }
  A.waLink = waLink;

  /* =====================================================================
     office: people
     ===================================================================== */
  Screens.people = ({ S, u }) => {
    if (!A.OFFICE.includes(u.role)) return { redirect: '/home' };
    const groups = A.ROLES.map(r => [r, Object.values(S.users).filter(x => x.role === r).sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name))]).filter(g => g[1].length);
    const body = `<div class="stack-l">
      <button class="btn primary block lg" type="button" data-a="addPerson">＋ ${esc(t('add_person'))}</button>
      ${groups.map(([r, list]) => `<section class="stack"><div class="section-title"><h2>${A.ROLE_ICON[r]} ${esc(U.roleName(r))}</h2><span class="count">${list.length}</span></div><div class="list">${list.map(x => `<button class="row" type="button" data-a="editPerson" data-v="${esc(x.uid)}"><span class="ico">${A.ROLE_ICON[x.role]}</span><span class="body"><span class="title">${esc(x.name)}${x.uid === u.uid ? ' · ' + esc(t('you')) : ''}</span><div class="sub">${esc(x.phone || '—')}</div><div class="chips">${x.active ? U.chip(t('active'), 'ok') : U.chip(t('inactive'), '')}${['sales', 'tech', 'qc', 'supplier'].includes(x.role) ? U.chip(t('open_jobs_n', { n: Object.values(S.projects).filter(P => P[x.role] === x.uid && A.OPEN_STAGES.includes(P.stage)).length })) : ''}</div></span><span class="chev">›</span></button>`).join('')}</div></section>`).join('')}
    </div>`;
    return { title: t('nav_people'), sub: t('n_people', { n: Object.values(S.users).filter(x => x.active).length }), body };
  };
  const roleOptions = (u, cur) => A.ROLES.filter(r => r !== 'owner' || u.role === 'owner').map(r => `<option value="${r}" ${r === cur ? 'selected' : ''}>${esc(U.roleName(r))}</option>`).join('');
  const pinField = (lab = t('new_pin')) => U.field(lab, `<input data-x="pin" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password">`, { hint: t('pin_share_note') });
  Actions.addPerson = async () => {
    const S = A.Store.S, u = S.users[A.Session.uid];
    const out = await U.formSheet(t('add_person'),
      U.field(t('person_name'), '<input data-x="name" autocomplete="off">', { req: true }) +
      U.field(t('role'), `<select data-x="role">${roleOptions(u, 'sales').replace('value="customer"', 'value="customer" disabled')}</select>`, { req: true }) +
      U.field(t('phone'), '<input data-x="phone" type="tel" inputmode="numeric" autocomplete="off">') + pinField(),
      t('add_person'), el => {
        const g = k => el.querySelector(`[data-x=${k}]`).value.trim();
        if (!/^\d{4}$/.test(g('pin'))) return { err: 'err_pin_4' };
        return { name: g('name'), role: g('role'), phone: g('phone'), pin: g('pin') };
      });
    if (!out) return;
    const r = await dispatch('USER_ADD', '', { user: Object.assign({ uid: 'u_' + A.rnd(8), name: out.name, role: out.role, phone: out.phone }, A.makePin(out.pin)) });
    if (r) U.toast(t('person_added', { name: out.name }), 'ok');
  };
  Actions.editPerson = async el => {
    const S = A.Store.S, u = S.users[A.Session.uid], x = S.users[el.dataset.v];
    const out = await U.formSheet(x.name,
      U.field(t('person_name'), `<input data-x="name" value="${esc(x.name)}">`) +
      U.field(t('role'), `<select data-x="role" ${x.role === 'customer' ? 'disabled' : ''}>${roleOptions(u, x.role)}</select>`) +
      U.field(t('phone'), `<input data-x="phone" type="tel" inputmode="numeric" value="${esc(x.phone || '')}">`) +
      `<label class="toggle"><input type="checkbox" data-x="active" ${x.active ? 'checked' : ''}> <span>${esc(t('active_can_login'))}</span></label>` +
      pinField(t('reset_pin_optional')),
      t('save'), el2 => {
        const g = k => el2.querySelector(`[data-x=${k}]`);
        const pin = g('pin').value.trim();
        if (pin && !/^\d{4}$/.test(pin)) return { err: 'err_pin_4' };
        const d = { uid: x.uid };
        if (g('name').value.trim() !== x.name) d.name = g('name').value.trim();
        if (x.role !== 'customer' && g('role').value !== x.role) d.role = g('role').value;
        if (g('phone').value.trim() !== (x.phone || '')) d.phone = g('phone').value.trim();
        if (g('active').checked !== x.active) d.active = g('active').checked;
        if (pin) Object.assign(d, A.makePin(pin));
        return d;
      });
    if (!out) return;
    if (Object.keys(out).length === 1) return U.toast(t('no_change'));
    await dispatch('USER_UPDATE', '', out, t('saved_item'));
  };

  /* ---------- business rules (the Owner changes; others read) ---------- */
  Screens.rules = ({ S, u }) => {
    if (!A.OFFICE.includes(u.role)) return { redirect: '/home' };
    const edit = u.role === 'owner';
    const body = `<div class="stack-l">${edit ? '' : U.banner('🔒', esc(t('rules_owner_only')))}
      ${Object.entries(A.RULE_GROUPS).map(([g, keys]) => `<details class="fold" ${g === 'pricing' ? 'open' : ''}><summary>${esc(t('rg_' + g))}</summary><div class="in"><form class="stack" data-rules="${g}" novalidate>
        ${keys.map(k => { const lim = A.CFG_LIMITS[k]; const text = k in A.TEXT_CFG; return U.field(t('cfg_' + k), `<input data-rule="${k}" ${text ? 'type="text"' : 'type="number" inputmode="decimal"'} value="${esc(S.config[k])}" ${lim ? `min="${lim[0]}" max="${lim[1]}"` : ''} ${edit ? '' : 'disabled'}>`, { hint: lim ? t('range', { a: lim[0], b: lim[1] }) : '' }); }).join('')}
        ${edit ? `<button class="btn primary block" type="submit">${esc(t('save'))}</button>` : ''}</form></div></details>`).join('')}
      <div class="card stack"><h3>🧮 ${esc(t('try_price'))}</h3><p class="small muted">${esc(t('try_price_d'))}</p><div id="try-out">${quoteTable(A.calcQuote(S.config, { type: 'auto', stops: 4, capacity: '6', finish: 'ss', job: 'new' }, 0), true)}</div></div>
    </div>`;
    return { title: t('nav_rules'), back: '/me', body,
      after(root) {
        root.querySelectorAll('form[data-rules]').forEach(f => f.addEventListener('submit', async e => {
          e.preventDefault();
          let n = 0;
          for (const inp of f.querySelectorAll('[data-rule]')) {
            const k = inp.dataset.rule; const v = inp.value.trim();
            if (String(A.Store.S.config[k]) === v) continue;
            const r = await A.Store.dispatch('CONFIG_SET', '', { key: k, value: v });
            if (!r.ok) { U.toast(t('cfg_' + k) + ': ' + U.errText(r.err), 'bad'); return; }
            n++;
          }
          U.toast(n ? t('rules_saved', { n }) : t('no_change'), n ? 'ok' : '');
        }));
      } };
  };

  /* ---------- office dashboard ---------- */
  Screens.dash = ({ S, u }) => {
    if (!A.OFFICE.includes(u.role) && u.role !== 'finance') return { redirect: '/home' };
    const d = A.dashboard(S);
    const max = Math.max(1, ...d.byPhase.map(x => x.n));
    const stuck = A.stuckWork(S);
    const pend = Object.values(S.projects).flatMap(P => P.payments.filter(p => p.status === 'pending').map(p => ({ P, p })));
    const lost = Object.values(S.projects).filter(P => P.stage === 'lost');
    const reasons = A.LOST_REASONS.map(k => [k, lost.filter(P => P.lostReason === k).length]).filter(x => x[1]);
    const body = `<div class="stack-l">
      <div class="kpis">
        <div class="kpi"><div class="v">${d.open}</div><div class="l">${esc(t('kpi_open'))}</div></div>
        <div class="kpi"><div class="v">${d.wonCount} · ${U.moneyShort(d.wonValue)}</div><div class="l">${esc(t('kpi_won_month'))}</div></div>
        <div class="kpi"><div class="v">${U.moneyShort(d.received)}</div><div class="l">${esc(t('kpi_received'))}</div></div>
        <div class="kpi"><div class="v">${U.moneyShort(d.pending)}</div><div class="l">${esc(t('kpi_pending'))}</div></div>
        <div class="kpi"><div class="v">${U.moneyShort(d.pipeline)}</div><div class="l">${esc(t('kpi_pipeline'))}</div></div>
        <div class="kpi"><div class="v">${d.winRate}%</div><div class="l">${esc(t('kpi_winrate'))}</div></div>
        <div class="kpi"><div class="v">${d.amc}</div><div class="l">${esc(t('kpi_amc'))}</div></div>
        <div class="kpi"><div class="v" style="color:${d.tickets ? 'var(--bad)' : 'inherit'}">${d.tickets}</div><div class="l">${esc(t('kpi_tickets'))}</div></div>
      </div>
      <div class="card stack"><h3>🛗 ${esc(t('where_jobs_are'))}</h3><div class="bars">${d.byPhase.map(x => `<a class="b" href="#/jobs?f=${A.PHASES.findIndex(p => p[0] === x.ph)}" style="color:inherit;text-decoration:none"><span>${esc(t('ph_' + x.ph))}</span><span class="t"><i style="width:${Math.round(x.n / max * 100)}%"></i></span><b class="num right">${x.n}</b></a>`).join('')}</div></div>
      <section class="stack"><div class="section-title"><h2>⏫ ${esc(t('stuck_work'))}</h2><span class="count">${stuck.length}</span></div>${stuck.length ? `<div class="list">${stuck.slice(0, 20).map(k => A.taskRow(k, S, { showWho: true, role: u.role })).join('')}</div>` : `<div class="card">${U.empty('🎉', t('nothing_stuck'))}</div>`}<p class="muted small">${esc(t('stuck_rule', { n: S.config.escalateDays }))}</p></section>
      ${pend.length ? `<section class="stack"><div class="section-title"><h2>🏦 ${esc(t('payments_to_check'))}</h2><span class="count">${pend.length}</span></div><div class="list">${pend.map(({ P, p }) => `<a class="row" href="#/flow/PAY_VERIFY/${esc(P.id)}?pay=${esc(p.id)}"><span class="ico">🏦</span><span class="body"><span class="title">${U.money(p.amount)} · ${esc(t('pay_' + p.purpose))}</span><div class="sub">${esc(P.id)} · ${esc(P.lead.name)} · ${esc(U.ago(p.t))}</div></span><span class="chev">›</span></a>`).join('')}</div></section>` : ''}
      ${reasons.length ? `<div class="card stack"><h3>❌ ${esc(t('why_lost'))}</h3><div class="bars">${reasons.map(([k, n]) => `<div class="b"><span>${esc(t(k))}</span><span class="t"><i style="width:${Math.round(n / lost.length * 100)}%;background:var(--bad)"></i></span><b class="num right">${n}</b></div>`).join('')}</div></div>` : ''}
    </div>`;
    return { title: t('nav_dash'), sub: S.org.name, body, wide: true };
  };

  /* =====================================================================
     me & settings
     ===================================================================== */
  Screens.me = ({ S, u }) => {
    const th = A.LS.get('aiec.theme', 'auto'), sz = A.LS.get('aiec.size', 'm');
    const office = A.OFFICE.includes(u.role);
    const body = `<div class="stack-l">
      <div class="card"><div class="hello"><span class="avatar" aria-hidden="true">${A.ROLE_ICON[u.role]}</span><div style="flex:1"><h2>${esc(u.name)}</h2><div class="muted small">${esc(U.roleName(u.role))} · ${esc(S.org.name)}</div>${u.phone ? `<div class="muted small">📞 ${esc(u.phone)}</div>` : ''}</div></div></div>
      <section class="card stack"><h3>🌐 ${esc(t('language'))}</h3>${U.seg('lang', U.LANGS.map(([k, n]) => [k, n]), U.getLang(), 'cols3').replace(/data-a="set" data-k="lang"/g, 'data-a="setLang"')}</section>
      <section class="card stack"><h3>🎨 ${esc(t('look'))}</h3>
        ${U.seg('theme', [['auto', t('th_auto'), '🌓'], ['light', t('th_light'), '☀️'], ['dark', t('th_dark'), '🌙'], ['sun', t('th_sun'), '🔆']], th, 'cols2').replace(/data-a="set" data-k="theme"/g, 'data-a="setTheme"')}
        <p class="small muted">${esc(t('th_sun_d'))}</p>
        ${U.seg('size', [['m', t('size_normal')], ['l', t('size_large')]], sz, 'cols2').replace(/data-a="set" data-k="size"/g, 'data-a="setSize"')}
      </section>
      <section class="list">
        ${office ? `<a class="row" href="#/people"><span class="ico">👥</span><span class="body"><span class="title">${esc(t('nav_people'))}</span></span><span class="chev">›</span></a><a class="row" href="#/rules"><span class="ico">⚙️</span><span class="body"><span class="title">${esc(t('nav_rules'))}</span><div class="sub">${esc(t(u.role === 'owner' ? 'rules_d' : 'rules_owner_only'))}</div></span><span class="chev">›</span></a>` : ''}
        <button class="row" type="button" data-a="changePin"><span class="ico">🔐</span><span class="body"><span class="title">${esc(t('change_pin'))}</span></span><span class="chev">›</span></button>
        <button class="row" type="button" data-a="exportData"><span class="ico">📤</span><span class="body"><span class="title">${esc(t('share_data'))}</span><div class="sub">${esc(t('share_data_d'))}</div></span><span class="chev">›</span></button>
        <button class="row" type="button" data-a="importFile"><span class="ico">📂</span><span class="body"><span class="title">${esc(t('open_file'))}</span><div class="sub">${esc(t('open_file_d'))}</div></span><span class="chev">›</span></button>
        ${A.App.canInstall() ? `<button class="row" type="button" data-a="install"><span class="ico">📲</span><span class="body"><span class="title">${esc(t('install_app'))}</span></span><span class="chev">›</span></button>` : ''}
      </section>
      ${A.Store.rejected.length && office ? U.banner('⚠️', esc(t('rejected_records', { n: A.Store.rejected.length })), 'warn') : ''}
      <div class="stack">
        <button class="btn block dark" type="button" data-a="logout">🚪 ${esc(t('logout'))}</button>
        ${A.Store.mode === 'practice' ? `<button class="btn block" type="button" data-a="exitPractice">🎓 ${esc(t('exit_practice'))}</button>` : ''}
      </div>
      <p class="muted tiny center">AIEC Elevator OS · ${esc(t('version'))} 2.1 · ${esc(t('autosaved'))}</p>
    </div>`;
    return { title: t('me'), body };
  };
  Object.assign(Actions, {
    setTheme: el => { A.LS.set('aiec.theme', el.dataset.v); A.App.applyLook(); A.App.render(); },
    setSize: el => { A.LS.set('aiec.size', el.dataset.v); A.App.applyLook(); A.App.render(); },
    logout: () => { A.Session.logout(); U.go('/door', true); },
    install: () => A.App.install(),
    changePin: async () => {
      const out = await U.formSheet(t('change_pin'), U.field(t('old_pin'), '<input data-x="old" type="password" inputmode="numeric" maxlength="4" autocomplete="current-password">') + U.field(t('new_pin'), '<input data-x="p1" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password">') + U.field(t('repeat_pin'), '<input data-x="p2" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password">'), t('save'), el => {
        const g = k => el.querySelector(`[data-x=${k}]`).value.trim();
        if (!A.pinOk(A.Store.S.users[A.Session.uid], g('old'))) return { err: 'err_old_pin' };
        if (!/^\d{4}$/.test(g('p1'))) return { err: 'err_pin_4' };
        if (g('p1') !== g('p2')) return { err: 'pin_mismatch' };
        return A.makePin(g('p1'));
      });
      if (out) await dispatch('PIN_CHANGE', '', out, t('pin_changed'));
    },
    exportData: async () => {
      const f = await A.Store.exportFile();
      const name = `aiec-${A.Store.mode}-${A.todayStr()}.json`;
      U.download(name, JSON.stringify(f));
      U.toast(t('file_saved', { name }), 'ok');
    }
  });
})(window.AIEC);
