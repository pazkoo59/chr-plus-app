/* CHR+ — appli de suivi de la Toyota C-HR+ via Home Assistant (API WebSocket). */
(function () {
  'use strict';

  // ---------- Entités Home Assistant ----------
  const V = 'jtmbbbbd40j018476';
  const E = {
    batt: `sensor.${V}_niveau_de_batterie`,
    range: `sensor.${V}_autonomie_electrique`,
    rangeAc: `sensor.${V}_autonomie_electrique_avec_ac`,
    charge: `sensor.${V}_etat_de_charge`,
    chargeLeft: `sensor.${V}_temps_de_charge_restant`,
    odo: `sensor.${V}_odometre`,
    reported: `sensor.${V}_status_last_reported_by_car`,
    fetched: `sensor.${V}_last_successful_fetch`,
    tracker: `device_tracker.${V}_emplacement_de_stationnement`,
    health: `binary_sensor.${V}_vehicle_health`,
    statDay: `sensor.${V}_statistiques_aujourd_hui`,
    statWeek: `sensor.${V}_statistiques_semaine_en_cours`,
    statMonth: `sensor.${V}_statistiques_mois_en_cours`,
    statYear: `sensor.${V}_statistiques_annee_en_cours`,
    climate: `climate.${V}_climate`,
    refresh: `button.${V}_refresh_vehicle_status`,
    refreshTrips: `button.${V}_refresh_recent_trips`,
    refreshElec: 'button.garage_chr_actualiser_le_statut_electrique_en_temps_reel',
    horn: 'button.garage_chr_declencher_l_avertisseur_sonore',
    hazard: 'switch.garage_chr_feux_de_detresse',
    lock: 'lock.garage_chr_verrouillage_des_portes',
    cabin: 'sensor.garage_chr_cabin_temperature',
    warnings: 'sensor.garage_chr_warning_lights',
    service: 'sensor.garage_chr_last_service',
    speedWeek: 'sensor.garage_chr_average_speed_week',
    wheel: 'switch.garage_chr_chauffage_du_volant',
    seatD: 'select.garage_chr_chauffage_siege_conducteur',
    seatP: 'select.garage_chr_chauffage_siege_passager',
    seatRD: 'select.garage_chr_chauffage_siege_arriere_conducteur',
    seatRP: 'select.garage_chr_chauffage_siege_arriere_passager',
    outside: 'sensor.exterieur_temperature',
    tariff: 'sensor.zlinky_current_price',
    // Planificateur
    planOn: 'input_boolean.pre_chauffage_c_hr',
    depart: 'input_datetime.depart_c_hr',
    lead: 'input_number.chr_avance_prechauffage',
    target: 'input_number.chr_consigne_prechauffage',
    threshold: 'input_number.chr_seuil_temperature_exterieure',
    defrost: 'input_select.chr_degivrage',
    days: 'schedule.chr_jours_de_depart',
    start: 'sensor.chr_demarrage_prechauffage',
    planAuto: 'automation.pre_chauffage_c_hr',
    // Recharge (coûts)
    costLast: 'input_number.c_hr_cout_derniere_recharge',
    kwhLast: 'input_number.c_hr_energie_derniere_recharge',
    costMonth: 'input_number.c_hr_cout_recharges_du_mois',
    kwhMonth: 'input_number.c_hr_energie_recharges_du_mois',
    priceKwh: 'input_number.c_hr_prix_kwh_de_la_charge',
    capacity: 'input_number.capacite_batterie_c_hr',
  };
  const OPENINGS = {
    doorFL: `binary_sensor.${V}_porte_siege_conducteur`,
    doorFR: `binary_sensor.${V}_porte_siege_passager`,
    doorRL: `binary_sensor.${V}_porte_arriere_gauche`,
    doorRR: `binary_sensor.${V}_porte_arriere_droite`,
    winFL: `binary_sensor.${V}_fenetre_siege_conducteur`,
    winFR: `binary_sensor.${V}_fenetre_siege_passager`,
    winRL: `binary_sensor.${V}_fenetre_arriere_gauche`,
    winRR: `binary_sensor.${V}_fenetre_arriere_droite`,
    trunk: `binary_sensor.${V}_coffre`,
    hood: `binary_sensor.${V}_capot`,
  };
  const ALL_IDS = [...Object.values(E), ...Object.values(OPENINGS)];

  const DAYS = [
    ['monday', 'Lu'], ['tuesday', 'Ma'], ['wednesday', 'Me'], ['thursday', 'Je'],
    ['friday', 'Ve'], ['saturday', 'Sa'], ['sunday', 'Di'],
  ];
  const DAY_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const DEFROST = ['Aucun', 'Pare-brise', 'Lunette arrière', 'Avant + arrière'];
  const PRESET_LABEL = { none: 'Aucun', front_defrost: 'Pare-brise', rear_defrost: 'Lunette AR', both_defrost: 'Avant + AR' };
  const SEAT_LABEL = { off: 'Off', low: '1', medium: '2', high: '3' };
  const CHARGE_LABEL = {
    charging: ['En charge', 'g'], plugged: ['Branchée', 'b'], charge_complete: ['Charge terminée', 'g'],
    none: ['Débranchée', ''], unknown: ['Inconnu', ''], unavailable: ['Indisponible', 'r'],
  };

  // ---------- Petits utilitaires ----------
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const st = (id) => STATES[id];
  const val = (id) => (STATES[id] ? STATES[id].state : undefined);
  const attr = (id, a) => (STATES[id] && STATES[id].attributes ? STATES[id].attributes[a] : undefined);
  const has = (id) => { const v = val(id); return v !== undefined && v !== 'unknown' && v !== 'unavailable' && v !== ''; };
  const num = (id, d = null) => { const n = parseFloat(val(id)); return isNaN(n) ? d : n; };
  const fmt = (n, dec = 0) => (n === null || n === undefined || isNaN(n) ? '—' : Number(n).toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec }));
  const hhmm = (d) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const ago = (iso) => {
    if (!iso) return '—';
    const t = new Date(iso).getTime();
    if (isNaN(t)) return '—';
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 0) { const m = Math.round(-s / 60); return m < 60 ? `dans ${m} min` : `dans ${Math.round(m / 60)} h`; }
    if (s < 60) return "à l'instant";
    if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
    if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
    return `il y a ${Math.round(s / 86400)} j`;
  };
  const dateFr = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? esc(iso) : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  let toastTimer;
  function toast(msg, err = false) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (err ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = 'toast'), 2600);
  }

  // ---------- Réglages de connexion ----------
  const cfg = {
    get url() { try { return localStorage.getItem('chr_url') || ''; } catch (e) { return ''; } },
    get token() { try { return localStorage.getItem('chr_token') || ''; } catch (e) { return ''; } },
    save(url, token) { try { localStorage.setItem('chr_url', url); localStorage.setItem('chr_token', token); } catch (e) { } },
    clear() { try { localStorage.removeItem('chr_url'); localStorage.removeItem('chr_token'); } catch (e) { } },
  };
  const cleanUrl = (u) => u.trim().replace(/\/+$/, '').replace(/\/lovelace.*$/, '');

  // ---------- Client WebSocket Home Assistant ----------
  let STATES = {};
  let SCHEDULE = null;
  let ws = null, msgId = 1, pending = {}, retry = 0, retryTimer = null, wantConnected = false;
  let connState = 'idle'; // idle | connecting | ok | ko | auth

  function setConn(s, text) {
    connState = s;
    const d = $('#conn');
    d.className = 'dot' + (s === 'ok' ? ' ok' : (s === 'ko' || s === 'auth') ? ' ko' : '');
    if (text) $('#sync').textContent = text;
  }

  function send(msg) {
    return new Promise((resolve, reject) => {
      if (!ws || ws.readyState !== 1) { reject(new Error('Pas connecté à Home Assistant')); return; }
      const id = msgId++;
      pending[id] = { resolve, reject, sub: !!msg._sub, onEvent: msg._onEvent };
      delete msg._sub; delete msg._onEvent;
      ws.send(JSON.stringify(Object.assign({ id }, msg)));
      if (!pending[id].sub) {
        setTimeout(() => { if (pending[id]) { delete pending[id]; reject(new Error('Pas de réponse de Home Assistant')); } }, 20000);
      }
    });
  }

  function connect() {
    clearTimeout(retryTimer);
    if (!cfg.url || !cfg.token) { setConn('ko', 'Non configurée'); return; }
    wantConnected = true;
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    setConn('connecting', 'Connexion…');
    let sock;
    try {
      sock = new WebSocket(cleanUrl(cfg.url).replace(/^http/i, 'ws') + '/api/websocket');
    } catch (e) {
      setConn('ko', 'Adresse invalide');
      return;
    }
    ws = sock;
    sock.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      const msgs = Array.isArray(m) ? m : [m];
      msgs.forEach(handle);
    };
    sock.onclose = () => {
      if (ws !== sock) return;
      Object.values(pending).forEach((p) => p.reject && p.reject(new Error('Connexion perdue')));
      pending = {};
      ws = null;
      if (connState === 'auth') return;
      setConn('ko', 'Hors ligne · nouvelle tentative…');
      if (wantConnected) {
        const delay = Math.min(30000, 1000 * Math.pow(2, retry++));
        retryTimer = setTimeout(connect, delay);
      }
    };
    sock.onerror = () => { /* onclose suit */ };
  }

  function handle(m) {
    if (m.type === 'auth_required') {
      ws.send(JSON.stringify({ type: 'auth', access_token: cfg.token }));
    } else if (m.type === 'auth_ok') {
      retry = 0;
      setConn('ok', 'Connectée');
      ws.send(JSON.stringify({ id: msgId++, type: 'supported_features', features: { coalesce_messages: 1 } }));
      startSubscriptions();
    } else if (m.type === 'auth_invalid') {
      setConn('auth', 'Jeton refusé');
      wantConnected = false;
      try { ws.close(); } catch (e) { }
      toast('Jeton refusé par Home Assistant : vérifie les réglages.', true);
      if (!$('.setup')) showSetup();
    } else if (m.type === 'result') {
      const p = pending[m.id];
      if (!p) return;
      if (!m.success) { delete pending[m.id]; p.reject(new Error((m.error && m.error.message) || 'Erreur Home Assistant')); return; }
      if (!p.sub) delete pending[m.id];
      p.resolve(m.result);
    } else if (m.type === 'event') {
      const p = pending[m.id];
      if (p && p.onEvent) p.onEvent(m.event);
    }
  }

  function startSubscriptions() {
    STATES = {};
    send({
      type: 'subscribe_entities', entity_ids: ALL_IDS, _sub: true,
      _onEvent: (ev) => { applyEntities(ev); scheduleRender(); },
    }).catch((e) => toast(e.message, true));
    loadSchedule();
    loadCharts();
  }

  // Format compressé de subscribe_entities
  function applyEntities(ev) {
    if (ev.a) {
      for (const [id, s] of Object.entries(ev.a)) {
        STATES[id] = {
          entity_id: id, state: s.s, attributes: s.a || {},
          last_changed: tsIso(s.lc), last_updated: tsIso(s.lu !== undefined ? s.lu : s.lc),
        };
      }
    }
    if (ev.c) {
      for (const [id, diff] of Object.entries(ev.c)) {
        const cur = STATES[id] || { entity_id: id, state: undefined, attributes: {} };
        const plus = diff['+'];
        if (plus) {
          if (plus.s !== undefined) cur.state = plus.s;
          if (plus.a) cur.attributes = Object.assign({}, cur.attributes, plus.a);
          if (plus.lc !== undefined) { cur.last_changed = tsIso(plus.lc); cur.last_updated = cur.last_changed; }
          if (plus.lu !== undefined) cur.last_updated = tsIso(plus.lu);
        }
        const minus = diff['-'];
        if (minus && minus.a) { cur.attributes = Object.assign({}, cur.attributes); minus.a.forEach((k) => delete cur.attributes[k]); }
        STATES[id] = cur;
      }
    }
    if (ev.r) ev.r.forEach((id) => delete STATES[id]);
  }
  const tsIso = (t) => (t === undefined || t === null ? undefined : new Date(t * 1000).toISOString());

  function callService(domain, service, entityId, data, okMsg) {
    return send({ type: 'call_service', domain, service, service_data: data || {}, target: entityId ? { entity_id: entityId } : undefined })
      .then(() => { if (okMsg) toast(okMsg); })
      .catch((e) => toast(e.message, true));
  }

  function loadSchedule() {
    return send({ type: 'schedule/list' }).then((list) => {
      SCHEDULE = (list || []).find((x) => x.id === 'chr_jours_de_depart') || null;
      scheduleRender();
    }).catch(() => { SCHEDULE = null; });
  }

  function toggleDay(day) {
    if (!SCHEDULE) { toast('Jours indisponibles (droits administrateur nécessaires)', true); return; }
    const upd = { type: 'schedule/update', schedule_id: SCHEDULE.id, name: SCHEDULE.name };
    if (SCHEDULE.icon) upd.icon = SCHEDULE.icon;
    DAYS.forEach(([d]) => { upd[d] = (SCHEDULE[d] || []).map((b) => ({ from: b.from.slice(0, 5), to: b.to.slice(0, 5) })); });
    upd[day] = upd[day].length ? [] : [{ from: '00:00', to: '24:00' }];
    SCHEDULE = Object.assign({}, SCHEDULE, { [day]: upd[day] });
    scheduleRender();
    send(upd).then(() => { toast('Jours de départ enregistrés'); loadSchedule(); })
      .catch((e) => { toast(e.message, true); loadSchedule(); });
  }

  // ---------- Graphiques (historique) ----------
  let CHART = { batt: null, km: null, at: 0 };
  function loadCharts(force) {
    if (!force && Date.now() - CHART.at < 5 * 60 * 1000 && CHART.batt) return;
    CHART.at = Date.now();
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    send({
      type: 'history/history_during_period', start_time: weekAgo.toISOString(), end_time: now.toISOString(),
      entity_ids: [E.batt], minimal_response: true, no_attributes: true, significant_changes_only: false,
    }).then((r) => {
      const rows = (r && r[E.batt]) || [];
      CHART.batt = rows.map((x) => ({ t: (x.lu || x.lc) * 1000, v: parseFloat(x.s) })).filter((p) => !isNaN(p.v) && !isNaN(p.t));
      scheduleRender();
    }).catch(() => { });
    const start = new Date(now.getTime() - 30 * 86400000); start.setHours(0, 0, 0, 0);
    send({
      type: 'recorder/statistics_during_period', start_time: start.toISOString(), period: 'day',
      statistic_ids: [E.odo], types: ['change'],
    }).then((r) => {
      const rows = (r && r[E.odo]) || [];
      CHART.km = rows.map((x) => ({ t: typeof x.start === 'number' ? x.start : new Date(x.start).getTime(), v: x.change }))
        .filter((p) => p.v !== null && !isNaN(p.v));
      scheduleRender();
    }).catch(() => { });
  }

  function lineChart(points, opts = {}) {
    if (!points || points.length < 2) return `<div class="muted small center">${points ? 'Pas assez de données pour le graphique' : 'Chargement…'}</div>`;
    const W = 340, H = 150, pl = 28, pr = 6, pt = 8, pb = 20;
    const t0 = points[0].t, t1 = Date.now();
    const min = opts.min ?? 0, max = opts.max ?? 100;
    const x = (t) => pl + ((t - t0) / (t1 - t0 || 1)) * (W - pl - pr);
    const y = (v) => pt + (1 - (v - min) / (max - min || 1)) * (H - pt - pb);
    // escalier : la valeur reste jusqu'au point suivant
    let d = `M${x(points[0].t).toFixed(1)},${y(points[0].v).toFixed(1)}`;
    for (let i = 1; i < points.length; i++) d += ` H${x(points[i].t).toFixed(1)} V${y(points[i].v).toFixed(1)}`;
    d += ` H${x(t1).toFixed(1)}`;
    const area = `${d} V${y(min)} H${x(points[0].t)} Z`;
    let grid = '';
    [0, 50, 100].forEach((g) => { grid += `<line x1="${pl}" x2="${W - pr}" y1="${y(g)}" y2="${y(g)}" stroke="#2A3340"/><text x="2" y="${y(g) + 3}">${g}%</text>`; });
    let days = '';
    for (let i = 0; i <= 7; i++) {
      const dt = new Date(t1 - i * 86400000); dt.setHours(0, 0, 0, 0);
      if (dt.getTime() < t0) continue;
      days += `<text x="${x(dt.getTime()) - 6}" y="${H - 4}">${DAY_NAMES[dt.getDay()].slice(0, 2)}</text>`;
    }
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <defs><linearGradient id="gb" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#3DDC97" stop-opacity=".35"/><stop offset="1" stop-color="#3DDC97" stop-opacity="0"/></linearGradient></defs>
      ${grid}<path d="${area}" fill="url(#gb)"/><path d="${d}" fill="none" stroke="#3DDC97" stroke-width="2"/>${days}</svg>`;
  }

  function barChart(points) {
    if (!points) return '<div class="muted small center">Chargement…</div>';
    if (!points.length) return '<div class="muted small center">Pas encore de statistiques</div>';
    const W = 340, H = 150, pl = 26, pb = 18, pt = 8;
    const max = Math.max(10, ...points.map((p) => p.v)) * 1.1;
    const n = 30, bw = (W - pl) / n;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let bars = '';
    points.forEach((p) => {
      const d = new Date(p.t); d.setHours(0, 0, 0, 0);
      const idx = n - 1 - Math.round((today - d) / 86400000);
      if (idx < 0 || idx >= n) return;
      const h = (p.v / max) * (H - pb - pt);
      bars += `<rect x="${(pl + idx * bw + 1).toFixed(1)}" y="${(H - pb - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${idx === n - 1 ? '#FF8A4C' : '#5AB8FF'}"><title>${Math.round(p.v)} km</title></rect>`;
    });
    const mid = Math.round(max / 2 / 10) * 10;
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <line x1="${pl}" x2="${W}" y1="${H - pb}" y2="${H - pb}" stroke="#2A3340"/>
      <line x1="${pl}" x2="${W}" y1="${H - pb - (mid / max) * (H - pb - pt)}" y2="${H - pb - (mid / max) * (H - pb - pt)}" stroke="#2A3340" stroke-dasharray="3 3"/>
      <text x="0" y="${H - pb - (mid / max) * (H - pb - pt) + 3}">${mid}</text>
      ${bars}<text x="${pl}" y="${H - 4}">il y a 30 j</text><text x="${W - 2}" y="${H - 4}" text-anchor="end">aujourd'hui</text></svg>`;
  }

  // ---------- Rendu ----------
  let tab = 'voiture';
  let renderQueued = false;
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; render(); });
  }

  function render() {
    if ($('.setup')) return;
    const a = document.activeElement;
    // Ne pas écraser un champ en cours de saisie
    if (a && $('#view').contains(a) && a.tagName === 'INPUT' && a.type !== 'checkbox') { setTimeout(scheduleRender, 800); return; }
    const y = window.scrollY;
    const f = { voiture: viewCar, prechauffage: viewHeat, recharge: viewCharge, trajets: viewTrips }[tab];
    $('#view').innerHTML = (connState !== 'ok' && !Object.keys(STATES).length) ? viewWaiting() : f();
    window.scrollTo(0, y);
    const r = st(E.reported);
    $('#sync').textContent = connState === 'ok'
      ? (r && has(E.reported) ? `Vue par la voiture ${ago(r.state)}` : 'Connectée')
      : $('#sync').textContent;
  }

  function viewWaiting() {
    return `<div class="card center"><p class="big">🚗</p><p>${esc($('#sync').textContent)}</p>
      <p class="muted small">Adresse : ${esc(cleanUrl(cfg.url) || '—')}</p>
      <button class="btn" data-act="settings">Réglages de connexion</button></div>`;
  }

  function ring(pct, color) {
    const r = 54, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct || 0));
    return `<svg width="130" height="130" viewBox="0 0 130 130">
      <circle cx="65" cy="65" r="${r}" fill="none" stroke="#2A3340" stroke-width="12"/>
      <circle cx="65" cy="65" r="${r}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round"
        stroke-dasharray="${(c * p / 100).toFixed(1)} ${c.toFixed(1)}"/></svg>`;
  }

  function chargePill() {
    const s = val(E.charge);
    const [l, c] = CHARGE_LABEL[s] || [s || '—', ''];
    return `<span class="pill ${c}">${s === 'charging' ? '⚡ ' : ''}${esc(l)}</span>`;
  }

  function carSvg() {
    const o = (k) => (val(OPENINGS[k]) === 'on' ? ' open' : '');
    return `<svg class="car-svg" width="120" height="210" viewBox="0 0 120 210">
      <rect x="18" y="8" width="84" height="194" rx="30" fill="#1E2530" stroke="#4A5566" stroke-width="1.5"/>
      <path class="part${o('hood')}" d="M26,22 Q60,6 94,22 L92,56 L28,56 Z"/>
      <path class="glass${o('winFL')}" d="M30,62 L58,62 L58,92 L30,96 Z"/>
      <path class="glass${o('winFR')}" d="M62,62 L90,62 L90,96 L62,92 Z"/>
      <path class="glass${o('winRL')}" d="M30,104 L58,100 L58,132 L30,132 Z"/>
      <path class="glass${o('winRR')}" d="M62,100 L90,104 L90,132 L62,132 Z"/>
      <rect class="part${o('doorFL')}" x="10" y="62" width="9" height="40" rx="3"/>
      <rect class="part${o('doorFR')}" x="101" y="62" width="9" height="40" rx="3"/>
      <rect class="part${o('doorRL')}" x="10" y="106" width="9" height="36" rx="3"/>
      <rect class="part${o('doorRR')}" x="101" y="106" width="9" height="36" rx="3"/>
      <path class="part${o('trunk')}" d="M28,150 L92,150 L94,186 Q60,200 26,186 Z"/>
    </svg>`;
  }

  function viewCar() {
    const batt = num(E.batt);
    const locked = val(E.lock) === 'locked';
    const openList = Object.entries(OPENINGS).filter(([, id]) => val(id) === 'on');
    const names = { doorFL: 'Porte conducteur', doorFR: 'Porte passager', doorRL: 'Porte AR gauche', doorRR: 'Porte AR droite',
      winFL: 'Vitre conducteur', winFR: 'Vitre passager', winRL: 'Vitre AR gauche', winRR: 'Vitre AR droite', trunk: 'Coffre', hood: 'Capot' };
    const lat = attr(E.tracker, 'latitude'), lon = attr(E.tracker, 'longitude');
    const where = val(E.tracker) === 'home' ? 'À la maison' : (val(E.tracker) === 'not_home' ? 'Hors de la maison' : (val(E.tracker) || '—'));
    const health = val(E.health);
    const warn = num(E.warnings, 0);
    const battColor = batt === null ? '#4A5566' : batt < 20 ? '#FF5D6C' : batt < 40 ? '#FFC857' : '#3DDC97';
    return `
      <section class="card">
        <div class="hero">
          <div class="ring">${ring(batt, battColor)}<div class="lbl"><div class="pct">${fmt(batt)}%</div><div class="cap">batterie</div></div></div>
          <div>
            <div class="big">${fmt(num(E.range))}<small> km</small></div>
            <div class="muted small">${fmt(num(E.rangeAc))} km avec la clim</div>
            <div style="margin-top:10px">${chargePill()}</div>
          </div>
        </div>
      </section>

      <section class="card">
        <h2>Ouvrants <small>${locked ? '<span class="pill g">🔒 Verrouillée</span>' : '<span class="pill r">🔓 Déverrouillée</span>'}</small></h2>
        <div class="car-wrap">
          ${carSvg()}
          <div class="legend">
            ${openList.length
              ? openList.map(([k]) => `<div class="line"><span class="k">${names[k]}</span><span class="v bad">${k === 'trunk' || k === 'hood' ? 'ouvert' : 'ouverte'}</span></div>`).join('')
              : '<div class="line"><span class="k">Portes, vitres, coffre, capot</span><span class="v ok">tout est fermé</span></div>'}
            <div class="row" style="margin-top:10px">
              <button class="btn" data-act="lock">🔒 Verrouiller</button>
              <button class="btn" data-act="unlock">🔓 Ouvrir</button>
            </div>
          </div>
        </div>
      </section>

      <section class="card">
        <h2>Infos</h2>
        <div class="line"><span class="k">Compteur</span><span class="v">${fmt(num(E.odo))} km</span></div>
        <div class="line"><span class="k">Position</span><span class="v">${esc(where)}${lat ? ` · <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}">carte</a>` : ''}</span></div>
        <div class="line"><span class="k">État du véhicule</span><span class="v">${health === 'off' ? '<span class="pill g">OK</span>' : health === 'on' ? '<span class="pill r">Problème</span>' : '—'}</span></div>
        <div class="line"><span class="k">Voyants d'alerte</span><span class="v">${warn > 0 ? `<span class="pill r">${warn}</span>` : '<span class="pill g">aucun</span>'}</span></div>
        <div class="line"><span class="k">Dernier entretien</span><span class="v">${has(E.service) ? dateFr(val(E.service)) : '—'}</span></div>
        <div class="line"><span class="k">Dernière synchro</span><span class="v">${ago(val(E.fetched))}</span></div>
      </section>

      <section class="card">
        <h2>Commandes</h2>
        <div class="row">
          <button class="btn" data-act="horn">📣 Klaxon</button>
          <button class="btn ${val(E.hazard) === 'on' ? 'warm' : ''}" data-act="hazard">⚠️ Warnings ${val(E.hazard) === 'on' ? 'ON' : ''}</button>
        </div>
      </section>`;
  }

  function nextDepartureText() {
    if (!SCHEDULE) return null;
    const now = new Date();
    const dep = (val(E.depart) || '06:30:00').split(':');
    const startIso = val(E.start);
    for (let i = 0; i < 8; i++) {
      const d = new Date(now); d.setDate(now.getDate() + i);
      const key = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][d.getDay()];
      if (!(SCHEDULE[key] || []).length) continue;
      d.setHours(+dep[0], +dep[1], 0, 0);
      if (i === 0) {
        const s = startIso ? new Date(startIso) : d;
        if (s <= now) continue;
      }
      return i === 0 ? "aujourd'hui" : i === 1 ? 'demain' : `${DAY_NAMES[d.getDay()]} ${d.getDate()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    return 'aucun jour coché';
  }

  function stepper(id, unit, step, min, max) {
    const v = num(id);
    return `<div class="stepper">
      <button data-step="${id}" data-d="${-step}" data-min="${min}" data-max="${max}" aria-label="moins">−</button>
      <span class="val">${fmt(v)}${unit}</span>
      <button data-step="${id}" data-d="${step}" data-min="${min}" data-max="${max}" aria-label="plus">+</button></div>`;
  }

  function seatSeg(id, label) {
    const cur = val(id);
    const opts = attr(id, 'options') || ['off', 'low', 'medium', 'high'];
    return `<div><div class="small muted" style="margin-bottom:4px">${label}</div>
      <div class="seg hot">${opts.map((o) => `<button class="${o === cur ? 'on' : ''}" data-select="${id}" data-opt="${esc(o)}">${SEAT_LABEL[o] || esc(o)}</button>`).join('')}</div></div>`;
  }

  function viewHeat() {
    const cl = st(E.climate);
    const on = cl && cl.state && cl.state !== 'off' && cl.state !== 'unavailable';
    const temp = attr(E.climate, 'temperature');
    const preset = attr(E.climate, 'preset_mode');
    const presets = attr(E.climate, 'preset_modes') || [];
    const planOn = val(E.planOn) === 'on';
    const ext = num(E.outside);
    const seuil = num(E.threshold, 0);
    const startIso = val(E.start);
    const startTxt = startIso && has(E.start) ? hhmm(new Date(startIso)) : '—';
    const depart = (val(E.depart) || '').slice(0, 5);
    const next = nextDepartureText();
    const wouldRun = ext !== null && ext < seuil;
    const lastRun = attr(E.planAuto, 'last_triggered');
    return `
      <section class="card">
        <h2>Clim maintenant ${on ? '<span class="pill o">🔥 En marche</span>' : '<span class="pill">À l\'arrêt</span>'}</h2>
        <div class="grid3" style="margin-bottom:12px">
          <div class="stat"><div class="k">Consigne</div><div class="v">${fmt(temp)}<small>°C</small></div></div>
          <div class="stat"><div class="k">Dehors</div><div class="v">${fmt(ext, 1)}<small>°C</small></div></div>
          <div class="stat"><div class="k">Habitacle</div><div class="v">${has(E.cabin) ? fmt(num(E.cabin), 1) + '<small>°C</small>' : '—'}</div></div>
        </div>
        <div class="row">
          <button class="btn warm" data-act="heat-now">▶ Lancer</button>
          <button class="btn" data-act="heat-stop">■ Arrêter</button>
        </div>
        <div class="setting" style="margin-top:6px">
          <div><div class="k">Température</div><div class="d">Réglage direct de la clim</div></div>
          <div class="stepper" style="gap:6px">
            <button data-clim-temp="-1">−</button><span class="val" style="min-width:56px">${fmt(temp)}°</span><button data-clim-temp="1">+</button>
          </div>
        </div>
        ${presets.length ? `<div style="margin-top:4px"><div class="small muted" style="margin-bottom:4px">Dégivrage</div>
          <div class="seg">${presets.map((p) => `<button class="${p === preset ? 'on' : ''}" data-preset="${esc(p)}">${PRESET_LABEL[p] || esc(p)}</button>`).join('')}</div></div>` : ''}
      </section>

      <section class="card summary ${planOn ? '' : 'off'}">
        <h2>Planificateur de départ
          <label class="switch"><input type="checkbox" data-toggle="${E.planOn}" ${planOn ? 'checked' : ''}><span></span></label></h2>
        ${planOn ? `
          <div class="big">${esc(depart)}<small> départ · ${esc(next || '…')}</small></div>
          <p>Clim lancée à <strong>${startTxt}</strong>, ${fmt(num(E.target))} °C, dégivrage ${esc((val(E.defrost) || '').toLowerCase())}.</p>
          <p>Seulement s'il fait moins de <strong>${fmt(seuil)} °C</strong> dehors — il fait ${fmt(ext, 1)} °C :
            ${wouldRun ? '<strong>ça se lancerait ❄️</strong>' : 'ça ne se lancerait pas.'}</p>`
          : '<p>Désactivé. Active-le pour que la clim chauffe la voiture avant ton départ.</p>'}
        ${lastRun ? `<p class="small">Dernier préchauffage : ${ago(lastRun)}</p>` : ''}
      </section>

      <section class="card">
        <h2>Réglages du départ</h2>
        <div class="setting">
          <div><div class="k">Heure de départ</div></div>
          <input type="time" id="depart-time" value="${esc(depart)}">
        </div>
        <div class="setting" style="display:block">
          <div class="k" style="margin-bottom:8px">Jours de départ</div>
          <div class="chips">${DAYS.map(([d, l]) => `<button class="chip ${SCHEDULE && (SCHEDULE[d] || []).length ? 'on' : ''}" data-day="${d}">${l}</button>`).join('')}</div>
          ${SCHEDULE ? '' : '<div class="d" style="margin-top:6px">Chargement des jours… (nécessite un compte administrateur)</div>'}
        </div>
        <div class="setting"><div><div class="k">Lancer avant</div><div class="d">minutes avant le départ</div></div>${stepper(E.lead, ' min', 5, 5, 30)}</div>
        <div class="setting"><div><div class="k">Température</div></div>${stepper(E.target, '°C', 1, 18, 29)}</div>
        <div class="setting"><div><div class="k">Si dehors moins de</div><div class="d">sinon on ne lance pas</div></div>${stepper(E.threshold, '°C', 1, -10, 25)}</div>
        <div class="setting" style="display:block">
          <div class="k" style="margin-bottom:8px">Dégivrage</div>
          <div class="seg hot">${DEFROST.map((o) => `<button class="${val(E.defrost) === o ? 'on' : ''}" data-select="${E.defrost}" data-opt="${esc(o)}">${esc(o.replace('Lunette arrière', 'Lunette AR').replace('Avant + arrière', 'Avant + AR'))}</button>`).join('')}</div>
        </div>
      </section>

      <section class="card">
        <h2>Sièges & volant</h2>
        <div class="grid2">${seatSeg(E.seatD, 'Conducteur')}${seatSeg(E.seatP, 'Passager')}${seatSeg(E.seatRD, 'Arrière gauche')}${seatSeg(E.seatRP, 'Arrière droit')}</div>
        <div class="setting" style="margin-top:8px;border-top:1px solid var(--line)">
          <div class="k">🔥 Volant chauffant</div>
          <label class="switch"><input type="checkbox" data-toggle="${E.wheel}" ${val(E.wheel) === 'on' ? 'checked' : ''}><span></span></label>
        </div>
      </section>`;
  }

  function viewCharge() {
    const s = val(E.charge);
    const hasSched = attr(E.charge, 'has_charging_schedule');
    const sStart = attr(E.charge, 'scheduled_charging_start'), sEnd = attr(E.charge, 'scheduled_charging_end');
    const left = num(E.chargeLeft);
    const tariff = val(E.tariff);
    const expensive = tariff === 'HP SEMAINE';
    const batt = num(E.batt);
    const cap = num(E.capacity, 77);
    const toFull = batt !== null ? ((100 - batt) / 100 * cap / 0.9) : null;
    return `
      <section class="card">
        <h2>Recharge ${chargePill()}</h2>
        <div class="hero">
          <div class="ring">${ring(batt, s === 'charging' ? '#3DDC97' : '#5AB8FF')}<div class="lbl"><div class="pct">${fmt(batt)}%</div><div class="cap">${fmt(num(E.range))} km</div></div></div>
          <div>
            ${s === 'charging' ? `<div class="big">${left !== null ? (left >= 60 ? `${Math.floor(left / 60)} h ${String(Math.round(left % 60)).padStart(2, '0')}` : `${Math.round(left)} min`) : '—'}</div><div class="muted small">avant la fin</div>` : ''}
            ${hasSched && sStart ? `<div style="margin-top:8px"><div class="small muted">Charge programmée</div><div style="font-weight:700;font-size:18px">${hhmm(new Date(sStart))} → ${sEnd ? hhmm(new Date(sEnd)) : '?'}</div><div class="small muted">${esc(attr(E.charge, 'scheduled_charging_duration') || '')}</div></div>` : '<div class="muted small">Pas de charge programmée dans la voiture</div>'}
          </div>
        </div>
        <div class="line" style="margin-top:10px"><span class="k">Tarif en ce moment</span><span class="v"><span class="pill ${expensive ? 'r' : 'g'}">${esc(tariff || '—')}</span></span></div>
        <div class="line"><span class="k">Pour faire le plein (≈)</span><span class="v">${toFull !== null ? fmt(toFull, 1) + ' kWh' : '—'}</span></div>
        <button class="btn" data-act="refresh-elec" style="margin-top:8px">⟳ Actualiser l'état de charge</button>
      </section>

      <section class="card">
        <h2>Ce que ça coûte</h2>
        <div class="grid2">
          <div class="stat"><div class="k">Ce mois</div><div class="v">${fmt(num(E.costMonth), 2)}<small> €</small></div><div class="small muted">${fmt(num(E.kwhMonth), 1)} kWh</div></div>
          <div class="stat"><div class="k">Dernière recharge</div><div class="v">${fmt(num(E.costLast), 2)}<small> €</small></div><div class="small muted">${fmt(num(E.kwhLast), 1)} kWh</div></div>
        </div>
        <div class="line" style="margin-top:8px"><span class="k">Prix du kWh (dernière charge)</span><span class="v">${fmt(num(E.priceKwh), 4)} €</span></div>
        <p class="small muted" style="margin:6px 0 0">Estimé d'après le % gagné, ${fmt(cap)} kWh de batterie et ~10 % de pertes.</p>
      </section>

      <section class="card">
        <h2>Batterie sur 7 jours</h2>
        ${lineChart(CHART.batt)}
      </section>`;
  }

  function viewTrips() {
    const w = E.statWeek, m = E.statMonth, d = E.statDay;
    const score = (id) => { const s = attr(id, 'Hybrid_score'); return s !== undefined && s !== null ? `${Math.round(s)}/100` : '—'; };
    return `
      <section class="card">
        <h2>Kilomètres <button class="pill" data-act="refresh-trips">⟳</button></h2>
        <div class="grid2">
          <div class="stat"><div class="k">Aujourd'hui</div><div class="v">${fmt(num(d), 1)}<small> km</small></div></div>
          <div class="stat"><div class="k">Cette semaine</div><div class="v">${fmt(num(w), 0)}<small> km</small></div></div>
          <div class="stat"><div class="k">Ce mois</div><div class="v">${fmt(num(m), 0)}<small> km</small></div></div>
          <div class="stat"><div class="k">Cette année</div><div class="v">${fmt(num(E.statYear), 0)}<small> km</small></div></div>
        </div>
      </section>

      <section class="card">
        <h2>Conduite</h2>
        <div class="line"><span class="k">Aujourd'hui</span><span class="v">${esc(attr(d, 'Duration') || '—')} · score ${score(d)}</span></div>
        <div class="line"><span class="k">Semaine</span><span class="v">${esc(attr(w, 'Duration') || '—')} · score ${score(w)}</span></div>
        <div class="line"><span class="k">Mois</span><span class="v">${esc(attr(m, 'Duration') || '—')} · score ${score(m)}</span></div>
        <div class="line"><span class="k">Vitesse moyenne (semaine)</span><span class="v">${fmt(num(E.speedWeek))} km/h</span></div>
        <div class="line"><span class="k">Compteur</span><span class="v">${fmt(num(E.odo))} km</span></div>
      </section>

      <section class="card">
        <h2>Km par jour · 30 jours</h2>
        ${barChart(CHART.km)}
      </section>`;
  }

  // ---------- Écran de configuration ----------
  function showSetup() {
    $('#tabs').style.display = 'none';
    $('#view').innerHTML = `
      <div class="card setup">
        <div class="title">Connexion à Home Assistant</div>
        <label>Adresse de Home Assistant
          <input type="url" id="cfg-url" placeholder="https://xxxxxxxx.ui.nabu.casa" value="${esc(cfg.url)}" autocapitalize="off" autocorrect="off" spellcheck="false">
        </label>
        <div class="help">Ton adresse Nabu Casa (Paramètres → Home Assistant Cloud → Accès à distance). À la maison, l'adresse locale marche aussi.</div>
        <label>Jeton d'accès longue durée
          <input type="password" id="cfg-token" placeholder="eyJ0eXAiOi…" value="${esc(cfg.token)}" autocapitalize="off" autocorrect="off" spellcheck="false">
        </label>
        <div class="help">Dans Home Assistant : ton profil → Sécurité → Jetons d'accès longue durée → Créer. Il reste uniquement sur ce téléphone.</div>
        <button class="btn acc" id="cfg-save">Se connecter</button>
        ${cfg.url ? '<button class="btn" id="cfg-cancel">Annuler</button><button class="btn danger" id="cfg-clear">Effacer la connexion</button>' : ''}
      </div>`;
    $('#cfg-save').onclick = () => {
      const url = cleanUrl($('#cfg-url').value);
      const token = $('#cfg-token').value.trim();
      if (!/^https?:\/\/.+/i.test(url)) { toast("L'adresse doit commencer par https://", true); return; }
      if (token.length < 20) { toast('Colle le jeton complet', true); return; }
      cfg.save(url, token);
      if (ws) { wantConnected = false; try { ws.close(); } catch (e) { } ws = null; }
      connState = 'idle';
      hideSetup();
      connect();
    };
    const c = $('#cfg-cancel'); if (c) c.onclick = hideSetup;
    const x = $('#cfg-clear'); if (x) x.onclick = () => {
      cfg.clear(); wantConnected = false; if (ws) { try { ws.close(); } catch (e) { } } ws = null; STATES = {}; showSetup();
    };
  }
  function hideSetup() { $('#tabs').style.display = ''; $('#view').innerHTML = ''; scheduleRender(); }

  // ---------- Actions ----------
  let lastStepAt = {};
  function onClick(e) {
    const b = e.target.closest('button, [data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'settings') { showSetup(); return; }
    if (act === 'lock') callService('lock', 'lock', E.lock, null, 'Verrouillage envoyé');
    else if (act === 'unlock') { if (confirm('Déverrouiller la C-HR+ ?')) callService('lock', 'unlock', E.lock, null, 'Déverrouillage envoyé'); }
    else if (act === 'horn') { if (confirm('Klaxonner la C-HR+ ?')) callService('button', 'press', E.horn, null, 'Klaxon envoyé'); }
    else if (act === 'hazard') callService('switch', 'toggle', E.hazard, null, 'Warnings envoyés');
    else if (act === 'heat-now') callService('script', 'turn_on', 'script.chr_lancer_prechauffage', null, 'Préchauffage lancé 🔥');
    else if (act === 'heat-stop') callService('script', 'turn_on', 'script.chr_arreter_climatisation', null, 'Arrêt de la clim envoyé');
    else if (act === 'refresh-elec') callService('button', 'press', E.refreshElec, null, 'Actualisation demandée');
    else if (act === 'refresh-trips') { callService('button', 'press', E.refreshTrips, null, 'Actualisation demandée'); loadCharts(true); }

    if (b.dataset.step) {
      const id = b.dataset.step;
      const nv = Math.max(+b.dataset.min, Math.min(+b.dataset.max, (num(id, 0)) + (+b.dataset.d)));
      if (STATES[id]) STATES[id].state = String(nv); // affichage immédiat
      scheduleRender();
      clearTimeout(lastStepAt[id]);
      lastStepAt[id] = setTimeout(() => callService('input_number', 'set_value', id, { value: nv }), 500);
    }
    if (b.dataset.select) {
      const id = b.dataset.select, opt = b.dataset.opt;
      const domain = id.split('.')[0];
      if (STATES[id]) STATES[id].state = opt;
      scheduleRender();
      callService(domain, 'select_option', id, { option: opt });
    }
    if (b.dataset.preset) callService('climate', 'set_preset_mode', E.climate, { preset_mode: b.dataset.preset }, 'Dégivrage envoyé');
    if (b.dataset.climTemp) {
      const t = Math.max(18, Math.min(29, (attr(E.climate, 'temperature') || 22) + (+b.dataset.climTemp)));
      if (STATES[E.climate]) STATES[E.climate].attributes = Object.assign({}, STATES[E.climate].attributes, { temperature: t });
      scheduleRender();
      clearTimeout(lastStepAt.clim);
      lastStepAt.clim = setTimeout(() => callService('climate', 'set_temperature', E.climate, { temperature: t }, `Consigne ${t} °C envoyée`), 600);
    }
    if (b.dataset.day) toggleDay(b.dataset.day);
  }

  function onChange(e) {
    const t = e.target;
    if (t.dataset.toggle) {
      const id = t.dataset.toggle;
      const domain = id.split('.')[0];
      if (STATES[id]) STATES[id].state = t.checked ? 'on' : 'off';
      callService(domain, t.checked ? 'turn_on' : 'turn_off', id, null, t.checked ? 'Activé' : 'Désactivé');
      scheduleRender();
    }
    if (t.id === 'depart-time' && t.value) {
      t.blur();
      callService('input_datetime', 'set_datetime', E.depart, { time: t.value + ':00' }, `Départ réglé à ${t.value}`);
    }
  }

  // ---------- Démarrage ----------
  function init() {
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    $('#btn-settings').onclick = showSetup;
    $('#btn-refresh').onclick = () => {
      const b = $('#btn-refresh');
      b.innerHTML = '<span class="spin">⟳</span>';
      callService('button', 'press', E.refresh, null, 'Actualisation demandée à la voiture').finally(() => setTimeout(() => (b.textContent = '⟳'), 1500));
      loadSchedule(); loadCharts(true);
    };
    $('#tabs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-tab]');
      if (!b) return;
      tab = b.dataset.tab;
      document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
      window.scrollTo(0, 0);
      scheduleRender();
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) window.chrResume(); });
    setInterval(() => { if (connState === 'ok') scheduleRender(); }, 30000);

    if (!cfg.url || !cfg.token) showSetup();
    else { scheduleRender(); connect(); }
  }

  // Appelé par Android quand l'appli revient au premier plan
  window.chrResume = function () {
    if (!cfg.url || !cfg.token || $('.setup')) return;
    if (!ws || ws.readyState > 1) { retry = 0; connect(); } else { loadCharts(); }
  };
  // Bouton retour Android : ferme les réglages au lieu de quitter
  window.chrBack = function () {
    if ($('.setup') && cfg.url && cfg.token) { hideSetup(); return true; }
    if (tab !== 'voiture') { $('#tabs button[data-tab="voiture"]').click(); return true; }
    return false;
  };

  init();
})();
