/* =====================================================================
   UI toolkit: words, formatting, rendering, router, sheets, toast,
   camera (time + place stamped), signature pad, read-aloud, voice input.
   ===================================================================== */
(function (A) {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- words (English, हिंदी, मराठी) ---------- */
  const LANGS = [['mr', 'मराठी'], ['hi', 'हिंदी'], ['en', 'English']];
  const LI = { en: 0, hi: 1, mr: 2 };
  const BCP = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN' };
  let lang = A.LS.get('aiec.lang', '') || ((navigator.language || '').startsWith('hi') ? 'hi' : (navigator.language || '').startsWith('mr') ? 'mr' : 'en');
  const missing = new Set();
  function t(key, vars) {
    if (key && typeof key === 'object') return t(key.k, key.v);
    const row = A.WORDS && A.WORDS[key];
    let s = row ? (row[LI[lang]] || row[0]) : null;
    if (s == null) { missing.add(key); s = String(key); }
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
    return s;
  }
  const hasWord = k => !!(A.WORDS && A.WORDS[k]);
  const setLang = l => { if (LI[l] == null) return; lang = l; A.LS.set('aiec.lang', l); document.documentElement.lang = l; };
  const getLang = () => lang;

  /* ---------- formatting ---------- */
  const nf = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
  const money = n => '₹' + nf.format(Math.round(+n || 0));
  const moneyShort = n => { n = +n || 0; return n >= 1e7 ? '₹' + (n / 1e7).toFixed(2).replace(/\.?0+$/, '') + ' Cr' : n >= 1e5 ? '₹' + (n / 1e5).toFixed(1).replace(/\.0$/, '') + ' L' : money(n); };
  const locale = () => BCP[lang];
  const fmtD = iso => { if (!iso) return '—'; const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso); return d.toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' }); };
  const fmtDT = iso => { if (!iso) return '—'; const d = new Date(iso); return d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }); };
  const ago = iso => {
    const m = Math.round((Date.now() - Date.parse(iso)) / 60e3);
    if (m < 1) return t('just_now');
    if (m < 60) return t('mins_ago', { n: m });
    const h = Math.round(m / 60); if (h < 24) return t('hours_ago', { n: h });
    return t('days_ago', { n: Math.round(h / 24) });
  };
  const userName = uid => { const u = A.Store.S.users[uid]; return u ? u.name : (uid ? t('someone') : '—'); };
  const roleName = r => t(r === 'owner' ? 'r_owner_short' : 'r_' + r);
  const stageName = s => t('st_' + s);
  const stageEm = s => (A.STAGES[s] || [0, '•'])[1];
  const taskTitle = k => t('tk_' + k.k, { step: k.step != null ? k.step + 1 : '', purpose: k.purpose ? t('pay_' + k.purpose) : '' });
  const errText = e => (typeof e === 'object' && e ? t(e.k, e.v) : t(e));

  /* ---------- toast + live region ---------- */
  let toastTimer = null;
  function toast(msg, kind = '', ms = 3200) {
    const host = $('#toast-host'); if (!host) return;
    clearTimeout(toastTimer);
    host.innerHTML = `<div class="toast ${kind}" role="${kind === 'bad' ? 'alert' : 'status'}"><span>${kind === 'bad' ? '⚠️' : kind === 'ok' ? '✅' : 'ℹ️'}</span><span>${esc(msg)}</span><button type="button" aria-label="${esc(t('close'))}" data-a="toastClose">✕</button></div>`;
    if (kind !== 'bad') toastTimer = setTimeout(() => { host.innerHTML = ''; }, ms);
  }

  /* ---------- sheets (bottom on phones, centred on desktop) ---------- */
  let sheetResolve = null, lastFocus = null;
  function sheet(title, bodyHtml, opts = {}) {
    closeSheet(null);
    lastFocus = document.activeElement;
    const host = $('#sheet-host');
    host.innerHTML = `<div class="scrim" data-a="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-t">
      <div class="grab" aria-hidden="true"></div>
      <div class="sheet-head"><h2 id="sheet-t">${esc(title)}</h2><button class="btn ghost sm" type="button" data-a="sheetClose" aria-label="${esc(t('close'))}">✕</button></div>
      <div class="sheet-body">${bodyHtml}</div></div></div>`;
    const first = $('.sheet input, .sheet select, .sheet textarea, .sheet button:not([data-a="sheetClose"])', host);
    setTimeout(() => (first || $('.sheet', host)).focus && (first || $('.sheet', host)).focus(), 30);
    if (opts.onMount) opts.onMount($('.sheet', host));
    return new Promise(res => { sheetResolve = res; });
  }
  function closeSheet(value) {
    const host = $('#sheet-host'); if (host) host.innerHTML = '';
    const r = sheetResolve; sheetResolve = null;
    if (r) r(value);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { /* gone */ } }
  }
  function confirmSheet(title, text, okLabel, kind = 'primary') {
    return sheet(title, `<div class="stack"><p>${esc(text)}</p><div class="row-flex"><button class="btn block" type="button" data-a="sheetClose">${esc(t('cancel'))}</button><button class="btn block ${kind}" type="button" data-a="sheetOk">${esc(okLabel || t('ok'))}</button></div></div>`);
  }
  /* a choice list in a sheet: resolves with the chosen value */
  function choose(title, items, note) {
    return sheet(title, `<div class="stack">${note ? `<p class="muted">${esc(note)}</p>` : ''}<div class="list">${items.map(it => `<button class="row" type="button" data-a="sheetPick" data-v="${esc(it.v)}"><span class="ico">${it.em || '•'}</span><span class="body"><span class="title">${esc(it.label)}</span>${it.sub ? `<div class="sub">${esc(it.sub)}</div>` : ''}</span><span class="chev">›</span></button>`).join('')}</div></div>`);
  }
  /* a small form in a sheet (reason + note, PIN, etc.) */
  function formSheet(title, fieldsHtml, okLabel, read) {
    return sheet(title, `<form class="stack" data-sheet-form novalidate>${fieldsHtml}<div class="err-msg" role="alert" id="sheet-err" style="color:var(--bad);font-weight:650"></div><button class="btn primary block" type="submit">${esc(okLabel)}</button></form>`, {
      onMount(el) {
        el.querySelector('form').addEventListener('submit', e => {
          e.preventDefault();
          const out = read(el);
          if (out && out.err) { el.querySelector('#sheet-err').textContent = errText(out.err); return; }
          closeSheet(out);
        });
      }
    });
  }

  /* ---------- read aloud + speech input ---------- */
  function say(text) {
    if (!('speechSynthesis' in window) || !text) return false;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text).replace(/[\u{1F300}-\u{1FAFF}☀-➿]/gu, ''));
    u.lang = locale(); u.rate = .95;
    const v = speechSynthesis.getVoices().find(x => x.lang === u.lang) || speechSynthesis.getVoices().find(x => x.lang && x.lang.startsWith(lang));
    if (v) u.voice = v;
    speechSynthesis.speak(u); return true;
  }
  const canListen = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  function listen() {
    return new Promise(res => {
      const R = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!R) return res('');
      const r = new R(); r.lang = locale(); r.interimResults = false; r.maxAlternatives = 1;
      let got = '';
      r.onresult = e => { got = e.results[0][0].transcript; };
      r.onerror = () => res(got); r.onend = () => res(got);
      try { r.start(); toast(t('listening')); } catch (e) { res(''); }
    });
  }

  /* ---------- GPS (only when the person presses a button or a step asks) ---------- */
  function getGPS(timeout = 9000) {
    return new Promise(res => {
      if (!navigator.geolocation) return res(null);
      let done = false;
      const fin = v => { if (!done) { done = true; res(v); } };
      setTimeout(() => fin(null), timeout + 500);
      navigator.geolocation.getCurrentPosition(p => fin({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy) }), () => fin(null), { enableHighAccuracy: true, timeout, maximumAge: 60000 });
    });
  }
  const mapsLink = (gps, address) => gps ? `https://www.google.com/maps/dir/?api=1&destination=${gps.lat},${gps.lng}` : address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : '';

  /* ---------- camera: in-app capture, stamped with time and place, saved small ---------- */
  async function shrinkStamp(src, label) {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const max = 1280, k = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.round(img.width * k), h = Math.round(img.height * k);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h);
    const gps = await getGPS(4000);
    const line = [new Date().toLocaleString('en-IN'), gps ? `${gps.lat}, ${gps.lng} ±${gps.acc}m` : 'GPS —', label || ''].filter(Boolean).join('  ·  ');
    const fs = Math.max(14, Math.round(w / 42));
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, h - fs * 1.9, w, fs * 1.9);
    g.fillStyle = '#fff'; g.font = `600 ${fs}px system-ui, sans-serif`; g.fillText(line, fs * .6, h - fs * .65, w - fs * 1.2);
    return c.toDataURL('image/jpeg', 0.7);
  }
  /* a stand-in picture for practice mode (no camera needed) */
  function practicePhoto(label) {
    const c = document.createElement('canvas'); c.width = 640; c.height = 480;
    const g = c.getContext('2d');
    const hue = [...String(label || 'x')].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 360;
    const gr = g.createLinearGradient(0, 0, 640, 480); gr.addColorStop(0, `hsl(${hue},45%,62%)`); gr.addColorStop(1, `hsl(${(hue + 40) % 360},50%,38%)`);
    g.fillStyle = gr; g.fillRect(0, 0, 640, 480);
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 10; g.strokeRect(250, 110, 140, 230); g.beginPath(); g.moveTo(320, 110); g.lineTo(320, 340); g.stroke();
    g.fillStyle = '#fff'; g.font = '700 30px system-ui, sans-serif'; g.textAlign = 'center';
    g.fillText('🎓 ' + t('practice_photo'), 320, 400); g.font = '500 22px system-ui, sans-serif'; g.fillText(String(label || '').slice(0, 40), 320, 440);
    return c.toDataURL('image/jpeg', 0.6);
  }
  function takePhoto(label) {
    return new Promise(resolve => {
      const host = $('#cam-host');
      let stream = null;
      const finish = async dataUrl => {
        if (stream) stream.getTracks().forEach(tr => tr.stop());
        host.innerHTML = '';
        if (!dataUrl) return resolve(null);
        resolve(await A.Store.putBlob(dataUrl));
      };
      const fileFallback = () => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*'; inp.setAttribute('capture', 'environment');
        inp.onchange = async () => {
          const f = inp.files && inp.files[0]; if (!f) return finish(null);
          const rd = new FileReader();
          rd.onload = async () => { try { finish(await shrinkStamp(rd.result, label)); } catch (e) { toast(t('err_photo_read'), 'bad'); finish(null); } };
          rd.readAsDataURL(f);
        };
        inp.click();
      };
      const practice = A.Store.mode === 'practice';
      host.innerHTML = `<div class="cam" role="dialog" aria-modal="true" aria-label="${esc(t('camera'))}">
        <video playsinline muted autoplay></video>
        <div class="lab">📷 ${esc(label || t('photo'))}</div>
        <div class="bar">
          <button class="cbtn" type="button" data-cam="cancel">✕ ${esc(t('cancel'))}</button>
          <button class="shutter" type="button" data-cam="shot" aria-label="${esc(t('take_photo'))}"></button>
          ${practice ? `<button class="cbtn" type="button" data-cam="practice">🎓 ${esc(t('practice_photo'))}</button>` : `<button class="cbtn" type="button" data-cam="file">🖼️</button>`}
        </div></div>`;
      const video = $('video', host);
      host.onclick = async e => {
        const b = e.target.closest('[data-cam]'); if (!b) return;
        const k = b.dataset.cam;
        if (k === 'cancel') return finish(null);
        if (k === 'practice') return finish(practicePhoto(label));
        if (k === 'file') { if (stream) stream.getTracks().forEach(tr => tr.stop()); host.innerHTML = ''; return fileFallback(); }
        if (k === 'shot') {
          if (!stream || !video.videoWidth) { if (practice) return finish(practicePhoto(label)); host.innerHTML = ''; return fileFallback(); }
          const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
          c.getContext('2d').drawImage(video, 0, 0);
          b.disabled = true;
          finish(await shrinkStamp(c.toDataURL('image/jpeg', 0.92), label));
        }
      };
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext) {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false })
          .then(s => { stream = s; video.srcObject = s; })
          .catch(() => { if (!practice) { host.innerHTML = ''; fileFallback(); } });
      } else if (!practice) { host.innerHTML = ''; fileFallback(); }
    });
  }
  /* load blob images into <img data-blob> after a render */
  async function hydrateBlobs(root = document) {
    for (const img of $$('img[data-blob]', root)) {
      if (img.dataset.done) continue;
      img.dataset.done = '1';
      const v = await A.Store.getBlob(img.dataset.blob);
      if (v) img.src = v; else img.alt = '—';
    }
  }
  const imgTag = (id, alt = '') => id ? `<img data-blob="${esc(id)}" alt="${esc(alt)}" loading="lazy">` : '';

  /* ---------- signature pad ---------- */
  function sigPad(canvas) {
    const g = canvas.getContext('2d');
    let drawing = false, dirty = false, last = null;
    const fit = () => {
      const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr));
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.lineWidth = 2.6; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#111';
    };
    fit();
    const pos = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    canvas.addEventListener('pointerdown', e => { drawing = true; last = pos(e); canvas.setPointerCapture(e.pointerId); g.beginPath(); g.arc(last.x, last.y, 1.2, 0, 7); g.fillStyle = '#111'; g.fill(); dirty = true; });
    canvas.addEventListener('pointermove', e => { if (!drawing) return; const p = pos(e); g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(p.x, p.y); g.stroke(); last = p; dirty = true; });
    const up = () => { drawing = false; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    return {
      clear() { g.clearRect(0, 0, canvas.width, canvas.height); dirty = false; },
      isEmpty: () => !dirty,
      data: () => (dirty ? canvas.toDataURL('image/png') : null),
      /* for automated tests and practice: a scribble */
      scribble() { g.beginPath(); g.moveTo(20, 120); for (let x = 20; x < 260; x += 12) g.lineTo(x, 100 + Math.sin(x / 9) * 26); g.stroke(); dirty = true; }
    };
  }

  /* ---------- router (hash) ---------- */
  function parseHash() {
    const h = (location.hash || '#/').slice(1);
    const [path, qs] = h.split('?');
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
    const q = Object.fromEntries(new URLSearchParams(qs || ''));
    return { parts, q, path: '/' + parts.join('/') };
  }
  const go = (path, replace) => { const h = '#' + path; if (replace) history.replaceState(null, '', h); else if (location.hash !== h) location.hash = h; A.App && A.App.render(); };
  const back = fallback => { if (history.length > 1 && A.App && A.App.navDepth > 0) history.back(); else go(fallback || '/home', true); };

  /* ---------- small building blocks ---------- */
  const chip = (text, kind = '') => `<span class="chip ${kind}">${esc(text)}</span>`;
  const seg = (k, options, value, cls = '') => `<div class="seg ${cls}" role="group">${options.map(([v, label, em]) => `<button type="button" data-a="set" data-k="${esc(k)}" data-v="${esc(v)}" aria-pressed="${String(value) === String(v)}">${em ? `<span class="em" aria-hidden="true">${em}</span>` : ''}<span>${esc(label)}</span></button>`).join('')}</div>`;
  const field = (label, inner, o = {}) => `<div class="field ${o.err ? 'has-err' : ''}">${label ? `<label ${o.id ? `for="${o.id}"` : ''} class="${o.req ? 'req' : ''}">${esc(label)}</label>` : ''}${o.hint ? `<div class="hint">${esc(o.hint)}</div>` : ''}${inner}${o.err ? `<div class="err-msg" role="alert">${esc(errText(o.err))}</div>` : ''}</div>`;
  const input = (k, value, o = {}) => {
    const id = 'f_' + k.replace(/\W/g, '_');
    const mic = o.mic && canListen() ? `<button type="button" class="btn ghost sm mic" data-a="mic" data-k="${esc(k)}" aria-label="${esc(t('speak'))}">🎤</button>` : '';
    const tag = o.textarea ? `<textarea id="${id}" data-k="${esc(k)}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} maxlength="${o.max || 1000}">${esc(value)}</textarea>`
      : `<input id="${id}" data-k="${esc(k)}" type="${o.type || 'text'}" value="${esc(value)}" ${o.inputmode ? `inputmode="${o.inputmode}"` : ''} ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} ${o.min != null ? `min="${o.min}"` : ''} ${o.max != null && o.type !== 'text' ? `max="${o.max}"` : ''} ${o.auto ? `autocomplete="${o.auto}"` : 'autocomplete="off"'} ${o.step ? `step="${o.step}"` : ''} ${mic ? 'class="with-mic"' : ''}>`;
    return field(o.label, o.pre || mic ? `<div class="input-wrap">${o.pre ? `<span class="pre">${esc(o.pre)}</span>` : ''}${tag}${mic}</div>` : tag, Object.assign({ id }, o));
  };
  const photoSlot = (k, id, label, em = '📷') => id
    ? `<div class="photo-slot filled">${imgTag(id, label)}<span class="ok-mark">✓ ${esc(label)}</span><button type="button" class="x" data-a="photoDel" data-k="${esc(k)}" aria-label="${esc(t('remove'))}">✕</button></div>`
    : `<button type="button" class="photo-slot" data-a="photo" data-k="${esc(k)}" data-label="${esc(label)}"><span class="em" aria-hidden="true">${em}</span><span>${esc(label)}</span></button>`;
  const rail = stage => {
    const cur = A.STAGES[stage] ? A.STAGES[stage][0] : -1;
    const amc = stage === 'amc';
    return `<div class="rail" role="img" aria-label="${esc(stageName(stage))}">${A.PHASES.map(([ph, em], i) => `<div class="ph ${amc || i < cur ? 'done' : i === cur ? 'now' : ''}"><span class="em" aria-hidden="true">${em}</span><span class="bar"></span><span class="lab">${esc(t('ph_' + ph))}</span></div>`).join('')}</div>`;
  };
  const empty = (em, title, sub = '', action = '') => `<div class="empty"><div class="em" aria-hidden="true">${em}</div><b>${esc(title)}</b>${sub ? `<p>${esc(sub)}</p>` : ''}${action ? `<div style="margin-top:14px">${action}</div>` : ''}</div>`;
  const banner = (em, html, kind = '') => `<div class="banner ${kind}"><span class="em" aria-hidden="true">${em}</span><div>${html}</div></div>`;

  /* download a file the person keeps (backups, data files) */
  function download(name, text, type = 'application/json') {
    const blob = new Blob([text], { type });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function pickFile(accept = '.json,application/json') {
    return new Promise(res => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = accept;
      inp.onchange = () => { const f = inp.files && inp.files[0]; if (!f) return res(null); const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsText(f); };
      inp.click();
    });
  }

  A.UI = { $, $$, esc, t, hasWord, missing, LANGS, setLang, getLang, money, moneyShort, fmtD, fmtDT, ago, userName, roleName, stageName, stageEm, taskTitle, errText,
    toast, sheet, closeSheet, confirmSheet, choose, formSheet, say, canListen, listen, getGPS, mapsLink, takePhoto, practicePhoto, hydrateBlobs, imgTag, sigPad,
    parseHash, go, back, chip, seg, field, input, photoSlot, rail, empty, banner, download, pickFile };
  A.t = t;
})(window.AIEC);
