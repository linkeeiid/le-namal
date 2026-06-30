/* ============================================================
   LE NAMAL — logique réservation + effets
   Porté du design Claude (DCLogic) en JS vanille.
   Données stockées en local (localStorage) pour l'instant.
   → Brancher Firebase + Worker + Brevo comme Blade Society (voir notes).
   ============================================================ */
(function () {
  'use strict';

  var STORE = 'lenamal_reservations_v1';
  var ADMIN_PASS = 'namal69';

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- état du formulaire ---------- */
  var form = { nom: '', telephone: '', email: '', date: '', service: '', creneau: '', couverts: '2', demandes: '' };
  var reservations = load();

  /* ---------- helpers données ---------- */
  function load() {
    try { var r = JSON.parse(localStorage.getItem(STORE) || '[]'); return Array.isArray(r) ? r : []; }
    catch (e) { return []; }
  }
  function persist(list) { try { localStorage.setItem(STORE, JSON.stringify(list)); } catch (e) {} }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function fmtDate(dStr) {
    if (!dStr) return '';
    var p = dStr.split('-').map(Number); var d = new Date(p[0], p[1] - 1, p[2]);
    var days = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    var months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    return days[d.getDay()] + ' ' + d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  // Horaires réels : Lun–Jeu midi+soir · Ven midi · Sam fermé · Dim soir
  function dayMeta(dateStr) {
    if (!dateStr) return { valid: false };
    var p = dateStr.split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    if (isNaN(d.getTime())) return { valid: false };
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var isPast = d < today;
    var dow = d.getDay();
    var lunch = false, dinner = false, closed = false;
    if (dow >= 1 && dow <= 4) { lunch = true; dinner = true; }
    else if (dow === 5) { lunch = true; }
    else if (dow === 6) { closed = true; }
    else if (dow === 0) { dinner = true; }
    return { valid: true, isPast: isPast, closed: closed, lunch: lunch, dinner: dinner, dow: dow };
  }

  function slotsFor(service) {
    var out = [];
    function push(sh, sm, eh, em) {
      var t = sh * 60 + sm; var last = eh * 60 + em - 30;
      for (; t <= last; t += 30) {
        var h = Math.floor(t / 60), m = t % 60;
        out.push(String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'));
      }
    }
    if (service === 'dejeuner') push(12, 0, 15, 0);
    else if (service === 'diner') push(19, 0, 22, 30);
    return out;
  }

  function validate() {
    var f = form, e = {};
    if (!f.nom.trim()) e.nom = 'Indiquez votre nom.';
    var tel = (f.telephone || '').replace(/[\s.\-]/g, '');
    if (!f.telephone.trim()) e.telephone = 'Indiquez votre téléphone.';
    else if (!/^(?:\+33|0033|0)[1-9]\d{8}$/.test(tel)) e.telephone = 'Numéro français invalide (ex. 06 12 34 56 78).';
    if (!f.email.trim()) e.email = 'Indiquez votre email.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) e.email = 'Adresse email invalide.';
    var m = dayMeta(f.date);
    if (!f.date) e.date = 'Choisissez une date.';
    else if (!m.valid) e.date = 'Date invalide.';
    else if (m.isPast) e.date = 'Cette date est déjà passée.';
    else if (m.closed) e.date = 'Le restaurant est fermé le samedi.';
    if (f.date && m.valid && !m.isPast && !m.closed) {
      if (!f.service) e.service = 'Choisissez un service.';
      else if (f.service === 'dejeuner' && !m.lunch) e.service = 'Pas de déjeuner ce jour-là.';
      else if (f.service === 'diner' && !m.dinner) e.service = 'Pas de dîner ce jour-là.';
      if (f.service && !e.service && !f.creneau) e.creneau = 'Choisissez un créneau.';
    }
    var c = parseInt(f.couverts, 10);
    if (!f.couverts || isNaN(c)) e.couverts = 'Indiquez le nombre de couverts.';
    else if (c < 1) e.couverts = 'Au moins 1 couvert.';
    else if (c > 12) e.couverts = 'Au-delà de 12 couverts, contactez-nous directement pour les groupes (04 78 52 37 38).';
    return e;
  }

  /* ---------- rendu dynamique du formulaire ---------- */
  var svcBase = 'display:flex; flex-direction:column; gap:3px; align-items:flex-start; text-align:left; padding:15px 18px; border-radius:var(--r-input); font-family:var(--f-body),sans-serif; cursor:pointer; transition:all .15s; flex:1; min-width:150px;';
  function svcStyle(active, avail) {
    if (!avail) return svcBase + 'border:1px solid color-mix(in srgb,var(--c-ink) 10%,transparent); background:color-mix(in srgb,var(--c-ink) 3%,transparent); color:var(--c-faint); cursor:not-allowed;';
    if (active) return svcBase + 'border:1px solid var(--c-ink); background:var(--c-ink); color:var(--c-on-dark);';
    return svcBase + 'border:1px solid color-mix(in srgb,var(--c-ink) 22%,transparent); background:#fff; color:var(--c-text);';
  }
  var chipBase = 'padding:10px 0; width:76px; text-align:center; border-radius:var(--r-input); font-family:var(--f-body),sans-serif; font-size:14px; cursor:pointer; transition:all .15s;';
  function chipStyle(active) {
    if (active) return chipBase + 'border:1px solid var(--c-ink); background:var(--c-ink); color:var(--c-on-dark);';
    return chipBase + 'border:1px solid color-mix(in srgb,var(--c-ink) 20%,transparent); background:#fff; color:var(--c-text);';
  }

  function svcInner(title, hours, unavail) {
    return '<span style="font-family:var(--f-head); font-weight:600; text-transform:uppercase; letter-spacing:.04em; font-size:15px;">' + title + '</span>' +
      '<span style="font-size:12.5px; opacity:.7;">' + hours + '</span>' +
      (unavail ? '<span style="font-size:11px; opacity:.7;">fermé ce jour</span>' : '');
  }

  function render() {
    var f = form;
    var m = dayMeta(f.date);
    var dateChosen = !!f.date;
    var isPast = dateChosen && m.valid && m.isPast;
    var closedDay = dateChosen && m.valid && m.closed;
    var canPick = dateChosen && m.valid && !m.isPast && !m.closed;

    // avertissements jour
    var warn = '';
    if (closedDay) warn = '<div style="margin-top:20px; padding:16px 18px; background:#efe2dd; border-radius:var(--r-input); color:#8a3a2a; font-size:14.5px;">Le restaurant est <strong>fermé le samedi</strong>. Choisissez un autre jour.</div>';
    else if (isPast) warn = '<div style="margin-top:20px; padding:16px 18px; background:#efe2dd; border-radius:var(--r-input); color:#8a3a2a; font-size:14.5px;">Cette date est déjà passée. Choisissez une date à venir.</div>';
    $('dayWarn').innerHTML = warn;

    // bloc service
    $('serviceBlock').hidden = !canPick;
    if (canPick) {
      var bd = $('btn-dej'), bn = $('btn-din');
      bd.setAttribute('style', svcStyle(f.service === 'dejeuner', m.lunch));
      bd.innerHTML = svcInner('Déjeuner', '12:00 – 15:00', !m.lunch);
      bd.disabled = !m.lunch;
      bn.setAttribute('style', svcStyle(f.service === 'diner', m.dinner));
      bn.innerHTML = svcInner('Dîner', '19:00 – 22:30', !m.dinner);
      bn.disabled = !m.dinner;
    }

    // bloc créneaux
    var serviceChosen = !!f.service && canPick && ((f.service === 'dejeuner' && m.lunch) || (f.service === 'diner' && m.dinner));
    $('slotBlock').hidden = !serviceChosen;
    if (serviceChosen) {
      var slots = slotsFor(f.service);
      var html = '';
      slots.forEach(function (t) {
        html += '<button type="button" data-slot="' + t + '" style="' + chipStyle(f.creneau === t) + '">' + t + '</button>';
      });
      $('slots').innerHTML = html;
    }
  }

  function showErrors(e) {
    ['nom', 'tel', 'email', 'date', 'service', 'creneau', 'couverts'].forEach(function (k) {
      var key = k === 'tel' ? 'telephone' : k;
      var el = $('e-' + k);
      if (el) el.textContent = e[key] || '';
    });
  }

  /* ---------- soumission ---------- */
  function submit(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    var e = validate();
    showErrors(e);
    if (Object.keys(e).length) {
      // amène à la première erreur visible
      var first = document.querySelector('.err:not(:empty)');
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    var f = form;
    var res = {
      id: 'R' + Date.now().toString(36).toUpperCase(),
      nom: f.nom.trim(), telephone: f.telephone.trim(), email: f.email.trim(),
      date: f.date, service: f.service, creneau: f.creneau,
      couverts: parseInt(f.couverts, 10), demandes: f.demandes.trim(),
      createdAt: new Date().toISOString()
    };
    reservations = [res].concat(reservations);
    persist(reservations);
    notifyRestaurant(res);
    notifyClient(res);
    notifyWebhook(res);
    showConfirmation(res);
  }

  function showConfirmation(res) {
    var serviceFr = res.service === 'dejeuner' ? 'Déjeuner' : 'Dîner';
    $('resForm').hidden = true;
    var c = $('resConf');
    c.hidden = false;
    c.innerHTML =
      '<div style="text-align:center; animation:fadeUp .4s ease;">' +
        '<div style="width:62px; height:62px; border-radius:50%; background:var(--c-ink); display:flex; align-items:center; justify-content:center; margin:0 auto 18px;">' +
          '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--c-on-dark)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>' +
        '</div>' +
        '<div style="font-family:var(--f-head); font-weight:700; text-transform:uppercase; font-size:24px; color:var(--c-ink);">Demande envoyée</div>' +
        '<p style="font-family:var(--f-serif); font-style:italic; font-size:19px; color:var(--c-muted); margin:8px 0 0;">Merci ' + esc(res.nom) + ', nous revenons vers vous très vite pour confirmer.</p>' +
        '<div style="text-align:left; margin-top:26px; border-radius:var(--r-card); overflow:hidden; background:var(--c-bg);">' +
          '<div style="background:var(--c-ink); color:var(--c-on-dark); padding:13px 20px; display:flex; justify-content:space-between; align-items:center;"><span style="font-family:var(--f-head); letter-spacing:.1em; text-transform:uppercase; font-size:12px;">Récapitulatif</span><span style="font-size:12px; color:var(--c-on-dark-muted);">Réf. ' + res.id + '</span></div>' +
          '<div style="padding:6px 20px;">' +
            row('Date', fmtDate(res.date)) +
            row('Service', serviceFr + ' · ' + res.creneau) +
            row('Couverts', res.couverts) +
            row('Téléphone', esc(res.telephone)) +
            row('Email', esc(res.email)) +
          '</div>' +
        '</div>' +
        '<button id="resetForm" style="margin-top:24px; background:none; border:1px solid var(--c-ink); color:var(--c-ink); font-family:var(--f-head); font-weight:500; letter-spacing:.1em; text-transform:uppercase; font-size:13px; padding:14px 26px; border-radius:var(--r-btn); cursor:pointer;" class="btn-ghost-ink">Nouvelle réservation</button>' +
      '</div>';
    $('resetForm').addEventListener('click', resetForm);
    c.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function row(label, val) {
    return '<div style="display:flex; justify-content:space-between; padding:11px 0;"><span style="color:var(--c-label); font-size:14px;">' + label + '</span><span style="color:var(--c-ink); font-size:15px; font-weight:500;">' + val + '</span></div>';
  }

  function resetForm() {
    form = { nom: '', telephone: '', email: '', date: '', service: '', creneau: '', couverts: '2', demandes: '' };
    $('f-nom').value = ''; $('f-tel').value = ''; $('f-email').value = '';
    $('f-date').value = ''; $('f-couverts').value = '2'; $('f-demandes').value = '';
    showErrors({});
    $('resConf').hidden = true; $('resConf').innerHTML = '';
    $('resForm').hidden = false;
    render();
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ============================================================
     NOTIFICATIONS — placeholders.
     Brancher comme Blade Society :
       A) Email resto + accusé client  → Worker Cloudflare → Brevo
       B) Notification téléphone        → Web Push (PWA) ou Telegram
     ============================================================ */
  function notifyRestaurant(res) {
    // fetch('https://le-namal-push.<compte>.workers.dev/email', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:'contact@lenamal-lyon.fr',type:'restaurant',reservation:res})});
    console.log('[Le Namal] (placeholder) Email RESTAURANT →', res);
  }
  function notifyClient(res) {
    // fetch('https://le-namal-push.<compte>.workers.dev/email', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:res.email,type:'client',reservation:res})});
    console.log('[Le Namal] (placeholder) Accusé EMAIL CLIENT →', res.email);
  }
  function notifyWebhook(res) {
    // Push PWA (cf. Blade Society) ou Telegram. À brancher.
    console.log('[Le Namal] (placeholder) Notification téléphone →', res);
  }

  /* ---------- Espace Ethan (admin) ---------- */
  var authed = false;
  function openAdmin() { $('adminOverlay').hidden = false; if (!authed) { $('adminLock').hidden = false; $('adminPanel').hidden = true; setTimeout(function () { $('adminPass').focus(); }, 50); } }
  function closeAdmin() { $('adminOverlay').hidden = true; $('adminErr').textContent = ''; }
  function checkPass() {
    if ($('adminPass').value === ADMIN_PASS) { authed = true; $('adminLock').hidden = true; $('adminPanel').hidden = false; renderRes(); }
    else { $('adminErr').textContent = 'Code incorrect.'; }
  }
  function del(id) { reservations = reservations.filter(function (r) { return r.id !== id; }); persist(reservations); renderRes(); }

  function renderRes() {
    $('resCount').textContent = reservations.length;
    var list = $('resList');
    if (!reservations.length) {
      list.innerHTML =
        '<div style="text-align:center; padding:46px 22px;">' +
          '<div style="width:74px; height:74px; border-radius:50%; background:var(--c-bg2); display:flex; align-items:center; justify-content:center; margin:0 auto 18px;">' +
            '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--c-label)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="2.5"></rect><path d="M3 9h18M8 2.5v4M16 2.5v4"></path><path d="M8.5 14.5l2.2 2.2 4-4.2"></path></svg>' +
          '</div>' +
          '<div style="font-family:var(--f-head); font-weight:700; text-transform:uppercase; letter-spacing:.05em; font-size:19px; color:var(--c-ink);">Aucune réservation</div>' +
          '<p style="font-family:var(--f-serif); font-style:italic; font-size:18px; color:var(--c-muted); line-height:1.5; max-width:360px; margin:8px auto 0;">Les nouvelles demandes s’afficheront ici automatiquement, dès qu’un client réserve une table.</p>' +
        '</div>';
      return;
    }
    list.innerHTML = reservations.map(function (r) {
      var serviceFr = r.service === 'dejeuner' ? 'Déjeuner' : 'Dîner';
      var ligne2 = fmtDate(r.date) + ' — ' + serviceFr + ' ' + r.creneau;
      return '<div style="background:var(--c-card); border-radius:var(--r-input); padding:18px 20px; box-shadow:0 2px 10px -6px rgba(0,0,0,.3);">' +
        '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:14px;">' +
          '<div>' +
            '<div style="font-family:var(--f-head); font-weight:600; font-size:17px; color:var(--c-ink);">' + esc(r.nom) + ' · ' + r.couverts + ' couv.</div>' +
            '<div style="font-size:14px; color:var(--c-text2); margin-top:3px;">' + ligne2 + '</div>' +
            '<div style="font-size:13px; color:var(--c-muted); margin-top:6px;">' + esc(r.telephone) + ' · ' + esc(r.email) + '</div>' +
            (r.demandes ? '<div style="font-family:var(--f-serif); font-style:italic; font-size:16px; color:var(--c-muted); margin-top:6px;">« ' + esc(r.demandes) + ' »</div>' : '') +
          '</div>' +
          '<div style="text-align:right; flex-shrink:0;">' +
            '<div style="font-size:11px; color:var(--c-label); font-family:var(--f-body),sans-serif;">' + r.id + '</div>' +
            '<button data-del="' + r.id + '" class="btn-del" style="margin-top:8px; background:none; border:1px solid rgba(176,64,46,.4); color:#b0402e; font-size:12px; padding:6px 12px; border-radius:var(--r-btn); cursor:pointer;">Supprimer</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
    Array.prototype.forEach.call(list.querySelectorAll('[data-del]'), function (b) {
      b.addEventListener('click', function () { del(b.getAttribute('data-del')); });
    });
  }

  /* ---------- branchements UI ---------- */
  function setField(k, v) {
    form[k] = v;
    if (k === 'date') {
      var m = dayMeta(v);
      if (form.service === 'dejeuner' && !m.lunch) form.service = '';
      if (form.service === 'diner' && !m.dinner) form.service = '';
      form.creneau = '';
    }
    if (k === 'service') form.creneau = '';
    render();
  }

  function wire() {
    $('f-date').min = todayStr();
    $('f-nom').addEventListener('input', function (e) { setField('nom', e.target.value); });
    $('f-tel').addEventListener('input', function (e) { setField('telephone', e.target.value); });
    $('f-email').addEventListener('input', function (e) { setField('email', e.target.value); });
    $('f-date').addEventListener('change', function (e) { setField('date', e.target.value); });
    $('f-couverts').addEventListener('input', function (e) { setField('couverts', e.target.value); });
    $('f-demandes').addEventListener('input', function (e) { setField('demandes', e.target.value); });
    $('btn-dej').addEventListener('click', function () { setField('service', 'dejeuner'); });
    $('btn-din').addEventListener('click', function () { setField('service', 'diner'); });
    $('slots').addEventListener('click', function (e) {
      var b = e.target.closest('[data-slot]'); if (b) setField('creneau', b.getAttribute('data-slot'));
    });
    $('resForm').addEventListener('submit', submit);

    $('openAdmin').addEventListener('click', openAdmin);
    $('closeAdmin').addEventListener('click', closeAdmin);
    $('adminEnter').addEventListener('click', checkPass);
    $('adminPass').addEventListener('keydown', function (e) { if (e.key === 'Enter') checkPass(); });
    $('adminOverlay').addEventListener('click', function (e) { if (e.target === $('adminOverlay')) closeAdmin(); });

    // menu burger
    var t = $('navToggle'), nl = $('navLinks');
    if (t && nl) {
      t.addEventListener('click', function () {
        var open = nl.classList.toggle('open');
        t.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      nl.addEventListener('click', function (e) { if (e.target.tagName === 'A') nl.classList.remove('open'); });
    }

    render();
  }

  /* ============================================================
     EFFETS DE SCROLL — barre de progression, retour haut,
     apparitions, parallaxe hero, compteurs.
     ============================================================ */
  var bar, btt, hero, io;
  function setupFx() {
    bar = document.createElement('div'); bar.id = 'ln-progress';
    bar.style.cssText = 'position:fixed;top:0;left:0;height:3px;width:0;z-index:60;background:var(--c-ink,#1a1a1a);transition:width .12s linear;pointer-events:none;';
    document.body.appendChild(bar);

    btt = document.createElement('button'); btt.id = 'ln-top'; btt.innerHTML = '↑'; btt.setAttribute('aria-label', 'Revenir en haut');
    btt.style.cssText = 'position:fixed;right:22px;bottom:22px;width:46px;height:46px;border-radius:50%;border:none;cursor:pointer;background:var(--c-ink,#1a1a1a);color:var(--c-on-dark,#ececec);font-size:20px;line-height:1;z-index:60;opacity:0;transform:translateY(12px) scale(.9);transition:opacity .3s,transform .3s;box-shadow:0 12px 28px -12px rgba(0,0,0,.6);';
    btt.onclick = function () { window.scrollTo({ top: 0, behavior: 'smooth' }); };
    document.body.appendChild(btt);

    hero = document.querySelector('#top img');
    if (hero) { hero.style.willChange = 'transform'; hero.style.transformOrigin = 'center'; }

    io = ('IntersectionObserver' in window) ? new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var t = e.target;
        if (e.isIntersecting) {
          if (t.__count) countUp(t);
          else { t.style.opacity = '1'; t.style.transform = 'none'; }
        } else {
          if (t.__count) t.__done = false;
          else { t.style.opacity = '0'; t.style.transform = 'translateY(30px)'; }
        }
      });
    }, { threshold: .14, rootMargin: '0px 0px -8% 0px' }) : null;

    if (io) {
      document.querySelectorAll('body > section').forEach(function (sec) {
        if (sec.id === 'top') return;
        var wrap = sec.querySelector(':scope > div'); if (!wrap) return;
        Array.prototype.forEach.call(wrap.children, function (k, i) {
          var cs = getComputedStyle(k);
          if (cs.position === 'absolute' || cs.position === 'fixed') return;
          k.style.opacity = '0'; k.style.transform = 'translateY(30px)';
          k.style.transition = 'opacity .7s cubic-bezier(.2,.7,.2,1), transform .7s cubic-bezier(.2,.7,.2,1)';
          k.style.transitionDelay = (Math.min(i, 5) * 0.07) + 's';
          io.observe(k);
        });
      });
      document.querySelectorAll('#ln-stats > div > div:first-child').forEach(function (s) {
        var mm = (s.textContent || '').match(/^\s*(\d+)/);
        if (mm) { s.__target = parseInt(mm[1], 10); s.__suffix = (s.textContent || '').replace(/^\s*\d+/, ''); s.__count = true; io.observe(s); }
      });
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
  }
  function countUp(el) {
    if (el.__done) return; el.__done = true;
    var tgt = el.__target || 0, suf = el.__suffix || '', dur = 950, t0 = performance.now();
    function step(t) { var p = Math.min(1, (t - t0) / dur); el.textContent = Math.round(tgt * (1 - Math.pow(1 - p, 3))) + suf; if (p < 1) requestAnimationFrame(step); }
    requestAnimationFrame(step);
  }
  function onScroll() {
    var st = window.pageYOffset || document.documentElement.scrollTop || 0;
    var h = document.documentElement.scrollHeight - window.innerHeight;
    if (bar) bar.style.width = (h > 0 ? Math.min(100, st / h * 100) : 0) + '%';
    if (btt) { var show = st > 520; btt.style.opacity = show ? '1' : '0'; btt.style.transform = show ? 'translateY(0) scale(1)' : 'translateY(12px) scale(.9)'; }
    if (hero && st < window.innerHeight * 1.3) { hero.style.transform = 'translateY(' + (st * 0.08).toFixed(1) + 'px) scale(1.14)'; }
  }

  /* ---------- init ---------- */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  function init() { wire(); setupFx(); }
})();
