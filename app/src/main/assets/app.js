/* CHR+ — suivi d'une Toyota électrique via Home Assistant (API WebSocket).
 * Version générique : la voiture est trouvée automatiquement grâce à l'intégration
 * « Toyota EU community » (identifiants internes indépendants de la langue). */
(function () {
  'use strict';

  // ---------- Correspondance identifiant interne Toyota -> rôle dans l'appli ----------
  const TK = {
    battery_level: 'batt', battery_range: 'range', battery_range_ac: 'rangeAc', charging_status: 'charge',
    remaining_charge_time: 'chargeLeft', odometer: 'odo', status_last_reported: 'reported',
    last_successful_fetch: 'fetched', parking_location: 'tracker', vehicle_health: 'health',
    current_day_statistics: 'statDay', current_week_statistics: 'statWeek', current_month_statistics: 'statMonth',
    current_year_statistics: 'statYear', climate: 'climate', refresh_vehicle_status: 'refresh',
    refresh_recent_trips: 'refreshTrips', refresh_electric_realtime_status: 'refreshElec', sound_buzzer: 'horn',
    hazard_lights: 'hazard', door_lock: 'lock', cabin_temperature: 'cabin', warning_lights: 'warnings',
    last_service: 'service', average_speed_week: 'speedWeek', steering_heater: 'wheel',
    seat_heater_driver: 'seatD', seat_heater_passenger: 'seatP', seat_heater_rear_driver: 'seatRD',
    seat_heater_rear_passenger: 'seatRP', fuel_level: 'fuel', fuel_range: 'fuelRange', vin: 'vin',
    driverseat_door: 'doorFL', passengerseat_door: 'doorFR', leftrearseat_door: 'doorRL', rightrearseat_door: 'doorRR',
    driverseat_window: 'winFL', passengerseat_window: 'winFR', leftrearseat_window: 'winRL', rightrearseat_window: 'winRR',
    trunk_door: 'trunk', hood: 'hood',
  };
  const OPEN_ROLES = ['doorFL', 'doorFR', 'doorRL', 'doorRR', 'winFL', 'winFR', 'winRL', 'winRR', 'trunk', 'hood'];
  const OPEN_NAMES = { doorFL: 'Porte conducteur', doorFR: 'Porte passager', doorRL: 'Porte AR gauche', doorRR: 'Porte AR droite',
    winFL: 'Vitre conducteur', winFR: 'Vitre passager', winRL: 'Vitre AR gauche', winRR: 'Vitre AR droite', trunk: 'Coffre', hood: 'Capot' };

  // Aides Home Assistant : d'abord celles que l'appli installe (chrplus_*), puis d'anciens noms reconnus.
  const HELPERS = {
    planOn: ['input_boolean.chrplus_prechauffage_actif', 'input_boolean.pre_chauffage_c_hr'],
    depart: ['input_datetime.chrplus_heure_de_depart', 'input_datetime.depart_c_hr'],
    lead: ['input_number.chrplus_avance_prechauffage', 'input_number.chr_avance_prechauffage'],
    target: ['input_number.chrplus_consigne_prechauffage', 'input_number.chr_consigne_prechauffage'],
    threshold: ['input_number.chrplus_seuil_temperature_exterieure', 'input_number.chr_seuil_temperature_exterieure'],
    defrost: ['input_select.chrplus_degivrage', 'input_select.chr_degivrage'],
    days: ['schedule.chrplus_jours_de_depart', 'schedule.chr_jours_de_depart'],
    planAuto: ['automation.chrplus_prechauffage', 'automation.pre_chauffage_c_hr'],
    costLast: ['input_number.chrplus_cout_derniere_recharge', 'input_number.c_hr_cout_derniere_recharge'],
    kwhLast: ['input_number.chrplus_energie_derniere_recharge', 'input_number.c_hr_energie_derniere_recharge'],
    costMonth: ['input_number.chrplus_cout_recharges_du_mois', 'input_number.c_hr_cout_recharges_du_mois'],
    kwhMonth: ['input_number.chrplus_energie_recharges_du_mois', 'input_number.c_hr_energie_recharges_du_mois'],
    priceKwh: ['input_number.chrplus_prix_du_kwh', 'input_number.c_hr_prix_kwh_de_la_charge'],
    capacity: ['input_number.chrplus_capacite_batterie', 'input_number.capacite_batterie_c_hr'],
    costAuto: ['automation.chrplus_suivi_des_couts', 'automation.c_hr_suivi_du_cout_des_recharges'],
    battStart: ['input_number.chrplus_batterie_debut_de_charge', 'input_number.c_hr_batterie_debut_de_charge'],
    hot: ['input_number.chrplus_seuil_chaleur'],
    summer: ['input_number.chrplus_consigne_ete'],
    priceHc: ['input_number.chrplus_prix_du_kwh_hc'],
    savings: ['input_number.chrplus_economies_du_mois'],
    chargePrice: ['input_number.chrplus_prix_de_la_charge'],
    alertsAuto: ['automation.chrplus_alertes'],
  };
  const PLAN_ROLES = ['planOn', 'depart', 'lead', 'target', 'threshold', 'defrost', 'days', 'planAuto'];
  const COST_ROLES = ['costLast', 'kwhLast', 'costMonth', 'kwhMonth', 'priceKwh', 'capacity', 'costAuto'];
  // Capteurs « maison » proposés par défaut s'ils existent
  const OUTSIDE_GUESS = ['sensor.exterieur_temperature', 'sensor.outdoor_temperature', 'sensor.temperature_exterieure'];
  const TARIFF_GUESS = ['sensor.zlinky_current_price', 'sensor.linky_ptec', 'sensor.zlinky_ptec'];

  const DAYS = [['monday', 'Lu'], ['tuesday', 'Ma'], ['wednesday', 'Me'], ['thursday', 'Je'], ['friday', 'Ve'], ['saturday', 'Sa'], ['sunday', 'Di']];
  const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const DAY_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const DEFROST = ['Auto', 'Aucun', 'Pare-brise', 'Lunette arrière', 'Avant + arrière'];
  const HC_REGEX = 'HC|creuse|off.?peak';
  const DEFROST_PRESET = { 'Aucun': 'none', 'Pare-brise': 'front_defrost', 'Lunette arrière': 'rear_defrost', 'Avant + arrière': 'both_defrost' };
  const PRESET_LABEL = { none: 'Aucun', front_defrost: 'Pare-brise', rear_defrost: 'Lunette AR', both_defrost: 'Avant + AR' };
  const SEAT_LABEL = { off: 'Off', low: '1', medium: '2', high: '3' };
  const CHARGE_LABEL = {
    charging: ['En charge', 'g'], plugged: ['Branchée', 'b'], charge_complete: ['Charge terminée', 'g'],
    none: ['Débranchée', ''], unknown: ['Inconnu', ''], unavailable: ['Indisponible', 'r'],
  };

  // ---------- Utilitaires ----------
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let STATES = {};
  let E = {};          // rôle -> entity_id résolu
  const st = (r) => (E[r] ? STATES[E[r]] : undefined);
  const val = (r) => { const s = st(r); return s ? s.state : undefined; };
  const attr = (r, a) => { const s = st(r); return s && s.attributes ? s.attributes[a] : undefined; };
  const has = (r) => { const v = val(r); return v !== undefined && v !== 'unknown' && v !== 'unavailable' && v !== ''; };
  const num = (r, d = null) => { const n = parseFloat(val(r)); return isNaN(n) ? d : n; };
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
  const dateFr = (iso) => { const d = new Date(iso); return isNaN(d) ? esc(iso) : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); };
  // Température extérieure : capteur (état) ou entité météo (attribut temperature)
  const outsideTemp = () => {
    if (!E.outside) return null;
    const s = STATES[E.outside];
    if (!s) return null;
    const v = E.outside.startsWith('weather.') ? s.attributes && s.attributes.temperature : s.state;
    const n = parseFloat(v); return isNaN(n) ? null : n;
  };

  let toastTimer;
  function toast(msg, err = false) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (err ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = 'toast'), 2800);
  }

  // ---------- Réglages enregistrés sur le téléphone ----------
  const LS = {
    get(k, d = '') { try { const v = localStorage.getItem('chr_' + k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { if (v === null || v === undefined) localStorage.removeItem('chr_' + k); else localStorage.setItem('chr_' + k, v); } catch (e) { } },
  };
  const cfg = {
    get url() { return LS.get('url'); }, get token() { return LS.get('token'); },
    save(url, token) { LS.set('url', url); LS.set('token', token); },
    clear() { ['url', 'token', 'car', 'outside', 'tariff', 'cache', 'sessions', 'alerts'].forEach((k) => LS.set(k, null)); },
  };
  const cleanUrl = (u) => u.trim().replace(/\/+$/, '').replace(/\/lovelace.*$/, '');

  // ---------- Pont Android (widget, raccourcis, empreinte) ----------
  const A = () => window.ChrAndroid || null;
  function pushWidgetConfig() {
    const a = A(); if (!a || !CAR) return;
    try {
      a.saveWidgetConfig(JSON.stringify({ url: cleanUrl(cfg.url), token: cfg.token, batt: E.batt || '', range: E.range || E.fuelRange || '',
        charge: E.charge || '', lock: E.lock || '', climate: E.climate || '', target: E.target || '', defrost: E.defrost || '',
        presets: hasPresets(), hvacOn: E.climate ? hvacOn() : 'heat_cool', refresh: E.refresh || '' }));
    } catch (e) { }
  }
  function pushWidget() {
    const a = A(); if (!a || !CAR) return;
    try {
      a.pushSnapshot(JSON.stringify({ name: carName(CAR), batt: val('batt') || val('fuel') || '', range: val('range') || val('fuelRange') || '',
        charge: val('charge') || '', lock: val('lock') || '', t: Date.now() }));
    } catch (e) { }
  }
  const authCbs = {}; let authSeq = 0;
  window.chrAuthResult = (id, res) => { const f = authCbs[id]; delete authCbs[id]; if (f) f(res); };
  /** Empreinte / code du téléphone si disponible, sinon simple confirmation. */
  function confirmSecure(title, cb) {
    const a = A();
    if (LS.get('bio', '1') === '1' && a && a.canAuthenticate()) {
      const id = 'a' + (++authSeq);
      authCbs[id] = (res) => { if (res === 'ok') cb(); else if (res === 'unavailable') { if (confirm(title + ' ?')) cb(); } else toast('Annulé'); };
      a.authenticate(title, id);
    } else if (confirm(title + ' ?')) cb();
  }

  // ---------- Ouverture instantanée : dernières valeurs gardées sur le téléphone ----------
  let cacheTimer = null, fromCache = 0;
  function saveCache() {
    clearTimeout(cacheTimer);
    cacheTimer = setTimeout(() => {
      if (!CAR || fromCache) return;
      const keep = {};
      Object.values(E).forEach((id) => { if (id && STATES[id]) keep[id] = STATES[id]; });
      try { localStorage.setItem('chr_cache', JSON.stringify({ t: Date.now(), E, roles: CAR.roles, di: CAR.di, admin: IS_ADMIN, states: keep })); } catch (e) { }
      pushWidget();
    }, 3000);
  }
  function loadCache() {
    try {
      const c = JSON.parse(localStorage.getItem('chr_cache') || 'null');
      if (!c || !c.states || !c.roles) return false;
      STATES = c.states; E = c.E || {}; CAR = { di: c.di, roles: c.roles }; CARS = [CAR]; IS_ADMIN = !!c.admin;
      discovered = true; fromCache = c.t || Date.now();
      return true;
    } catch (e) { return false; }
  }

  // ---------- Client WebSocket ----------
  let ws = null, msgId = 1, pending = {}, retry = 0, retryTimer = null, wantConnected = false;
  let connState = 'idle';
  let IS_ADMIN = false, REGISTRY = null, CARS = [], CAR = null, SCHEDULE = null, discovered = false, PHONES = null, pendingShortcut = null;

  function setConn(s, text) {
    connState = s;
    $('#conn').className = 'dot' + (s === 'ok' ? ' ok' : (s === 'ko' || s === 'auth') ? ' ko' : '');
    if (text) $('#sync').textContent = text;
  }

  function send(msg) {
    return new Promise((resolve, reject) => {
      if (!ws || ws.readyState !== 1) { reject(new Error('Pas connecté à Home Assistant')); return; }
      const id = msgId++;
      pending[id] = { resolve, reject, sub: !!msg._sub, onEvent: msg._onEvent };
      delete msg._sub; delete msg._onEvent;
      ws.send(JSON.stringify(Object.assign({ id }, msg)));
      if (!pending[id].sub) setTimeout(() => { if (pending[id]) { delete pending[id]; reject(new Error('Pas de réponse de Home Assistant')); } }, 20000);
    });
  }

  function connect() {
    clearTimeout(retryTimer);
    if (!cfg.url || !cfg.token) { setConn('ko', 'Non configurée'); return; }
    wantConnected = true;
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    setConn('connecting', 'Connexion…');
    let sock;
    try { sock = new WebSocket(cleanUrl(cfg.url).replace(/^http/i, 'ws') + '/api/websocket'); }
    catch (e) { setConn('ko', 'Adresse invalide'); return; }
    ws = sock;
    sock.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } (Array.isArray(m) ? m : [m]).forEach(handle); };
    sock.onclose = () => {
      if (ws !== sock) return;
      Object.values(pending).forEach((p) => p.reject && p.reject(new Error('Connexion perdue')));
      pending = {}; ws = null;
      if (connState === 'auth') return;
      setConn('ko', 'Hors ligne · nouvelle tentative…');
      scheduleRender();
      if (wantConnected) retryTimer = setTimeout(connect, Math.min(30000, 1000 * Math.pow(2, retry++)));
    };
  }

  function handle(m) {
    if (m.type === 'auth_required') ws.send(JSON.stringify({ type: 'auth', access_token: cfg.token }));
    else if (m.type === 'auth_ok') {
      retry = 0; setConn('ok', 'Connectée');
      ws.send(JSON.stringify({ id: msgId++, type: 'supported_features', features: { coalesce_messages: 1 } }));
      discover();
    } else if (m.type === 'auth_invalid') {
      setConn('auth', 'Jeton refusé'); wantConnected = false;
      try { ws.close(); } catch (e) { }
      toast('Jeton refusé par Home Assistant : vérifie les réglages.', true);
      if (!$('.setup')) showSetup();
    } else if (m.type === 'result') {
      const p = pending[m.id]; if (!p) return;
      if (!m.success) { delete pending[m.id]; p.reject(new Error((m.error && m.error.message) || 'Erreur Home Assistant')); return; }
      if (!p.sub) delete pending[m.id];
      p.resolve(m.result);
    } else if (m.type === 'event') {
      const p = pending[m.id]; if (p && p.onEvent) p.onEvent(m.event);
    }
  }

  // ---------- Découverte de la voiture et des aides ----------
  async function discover() {
    try { const u = await send({ type: 'auth/current_user' }); IS_ADMIN = !!(u && u.is_admin); } catch (e) { IS_ADMIN = false; }
    let reg;
    try { reg = await send({ type: 'config/entity_registry/list_for_display' }); }
    catch (e) { toast('Impossible de lire la liste des entités : ' + e.message, true); return; }
    REGISTRY = new Set();
    const byDevice = {};
    (reg.entities || []).forEach((x) => {
      REGISTRY.add(x.ei);
      if (x.pl === 'toyota' && x.tk && TK[x.tk]) {
        const d = x.di || 'sans-appareil';
        (byDevice[d] = byDevice[d] || {})[TK[x.tk]] = x.ei;
      }
    });
    CARS = Object.entries(byDevice).map(([di, roles]) => ({ di, roles })).filter((c) => c.roles.batt || c.roles.charge || c.roles.lock || c.roles.odo);
    CAR = CARS.find((c) => c.di === LS.get('car')) || CARS[0] || null;
    resolveRoles();
    discovered = true;
    fromCache = 0;
    subscribe();
    loadSchedule();
    loadCharts(true);
    loadSessions();
    if (IS_ADMIN) loadPhones().then(scheduleRender);
    scheduleRender();
    setTimeout(pushWidgetConfig, 2500);
    if (pendingShortcut) setTimeout(() => window.chrShortcut(pendingShortcut), 1500);
  }

  function resolveRoles() {
    E = Object.assign({}, CAR ? CAR.roles : {});
    for (const [role, cands] of Object.entries(HELPERS)) {
      const found = cands.find((id) => REGISTRY.has(id));
      if (found) E[role] = found;
    }
    const savedOut = LS.get('outside', null);
    if (savedOut) E.outside = savedOut;
    else if (savedOut === null) {
      E.outside = OUTSIDE_GUESS.find((id) => REGISTRY.has(id)) || [...REGISTRY].find((id) => id.startsWith('weather.')) || undefined;
    }
    const savedTar = LS.get('tariff', null);
    if (savedTar) E.tariff = savedTar;
    else if (savedTar === null) E.tariff = TARIFF_GUESS.find((id) => REGISTRY.has(id));
  }
  const planReady = () => PLAN_ROLES.every((r) => E[r]);
  const costReady = () => COST_ROLES.every((r) => E[r]);

  let subPromise = null, subId = null;
  function subscribe() {
    if (subId) { send({ type: 'unsubscribe_events', subscription: subId }).catch(() => { }); delete pending[subId]; }
    const ids = [...new Set(Object.values(E).filter(Boolean))];
    if (!ids.length) return;
    const myId = msgId; // id attribué par send()
    subPromise = send({ type: 'subscribe_entities', entity_ids: ids, _sub: true, _onEvent: (ev) => { applyEntities(ev); scheduleRender(); saveCache(); } })
      .catch((e) => toast(e.message, true));
    subId = myId;
  }

  function applyEntities(ev) {
    if (ev.a) for (const [id, s] of Object.entries(ev.a)) {
      STATES[id] = { entity_id: id, state: s.s, attributes: s.a || {}, last_changed: tsIso(s.lc), last_updated: tsIso(s.lu !== undefined ? s.lu : s.lc) };
    }
    if (ev.c) for (const [id, diff] of Object.entries(ev.c)) {
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
    if (ev.r) ev.r.forEach((id) => delete STATES[id]);
  }
  const tsIso = (t) => (t === undefined || t === null ? undefined : new Date(t * 1000).toISOString());

  function callService(domain, service, entityId, data, okMsg) {
    return send({ type: 'call_service', domain, service, service_data: data || {}, target: entityId ? { entity_id: entityId } : undefined })
      .then(() => { if (okMsg) toast(okMsg); })
      .catch((e) => { toast(e.message, true); throw e; });
  }
  const quiet = (p) => p.catch(() => { });

  // ---------- Jours de départ (aide « planning ») ----------
  function loadSchedule() {
    if (!E.days || !IS_ADMIN) { SCHEDULE = null; return Promise.resolve(); }
    const sid = E.days.split('.')[1];
    return send({ type: 'schedule/list' }).then((list) => {
      SCHEDULE = (list || []).find((x) => x.id === sid) || null; scheduleRender();
    }).catch(() => { SCHEDULE = null; });
  }
  function toggleDay(day) {
    if (!SCHEDULE) { toast('Il faut un compte administrateur Home Assistant pour changer les jours', true); return; }
    const upd = { type: 'schedule/update', schedule_id: SCHEDULE.id, name: SCHEDULE.name };
    if (SCHEDULE.icon) upd.icon = SCHEDULE.icon;
    DAYS.forEach(([d]) => { upd[d] = (SCHEDULE[d] || []).map((b) => ({ from: b.from.slice(0, 5), to: b.to.slice(0, 5) })); });
    upd[day] = upd[day].length ? [] : [{ from: '00:00', to: '24:00' }];
    SCHEDULE = Object.assign({}, SCHEDULE, { [day]: upd[day] });
    scheduleRender();
    send(upd).then(() => { toast('Jours de départ enregistrés'); loadSchedule(); }).catch((e) => { toast(e.message, true); loadSchedule(); });
  }

  // ---------- Installation dans Home Assistant ----------
  async function rest(method, path, body) {
    const r = await fetch(cleanUrl(cfg.url) + path, {
      method, headers: { Authorization: 'Bearer ' + cfg.token, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) throw new Error(`Home Assistant a refusé (${r.status}) ${path}`);
    return r.json().catch(() => ({}));
  }
  async function createHelper(role, domain, fields) {
    if (E[role]) return E[role];
    const res = await send(Object.assign({ type: `${domain}/create` }, fields));
    const id = `${domain}.${res.id}`;
    E[role] = id; REGISTRY.add(id);
    return id;
  }
  const hvacOn = () => (attr('climate', 'hvac_modes') || ['heat_cool']).find((m) => m !== 'off') || 'heat_cool';
  const hasPresets = () => (attr('climate', 'preset_modes') || []).length > 0;

  const PRESET_MAP = JSON.stringify({ 'Aucun': 'none', 'Pare-brise': 'front_defrost', 'Lunette arrière': 'rear_defrost', 'Avant + arrière': 'both_defrost' });
  const extTpl = () => (E.outside ? (E.outside.startsWith('weather.') ? `state_attr('${E.outside}', 'temperature')` : `states('${E.outside}')`) : null);

  /** Automatisation du préchauffage : froid -> chauffe (+ dégivrage, « Auto » s'il gèle) ; chaud -> rafraîchit. */
  function plannerConfig(alias) {
    const w = E.outside && E.outside.startsWith('weather.');
    const conditions = [
      { condition: 'state', entity_id: E.planOn, state: 'on' },
      { condition: 'state', entity_id: E.days, state: 'on' },
      { condition: 'time', before: E.depart },
    ];
    if (E.outside) {
      const cold = { condition: 'numeric_state', entity_id: E.outside, below: E.threshold };
      if (w) cold.attribute = 'temperature';
      if (E.hot) {
        const hot = { condition: 'numeric_state', entity_id: E.outside, above: E.hot };
        if (w) hot.attribute = 'temperature';
        conditions.push({ condition: 'or', conditions: [cold, hot] });
      } else conditions.push(cold);
    }
    const climate = { entity_id: E.climate };
    const coldActions = [{ action: 'climate.set_temperature', target: climate, data: { temperature: `{{ states('${E.target}') | int(21) }}` } }];
    if (hasPresets()) coldActions.push({ action: 'climate.set_preset_mode', target: climate, continue_on_error: true, data: {
      preset_mode: `{% set d = states('${E.defrost}') %}{% if d == 'Auto' %}{{ 'both_defrost' if ext <= 1 else 'none' }}{% else %}{{ ${PRESET_MAP}.get(d, 'none') }}{% endif %}` } });
    const actions = [{ variables: { ext: E.outside ? `{{ ${extTpl()} | float(10) }}` : '{{ 10 }}' } }];
    if (E.outside && E.hot && E.summer) {
      const hotActions = [{ action: 'climate.set_temperature', target: climate, data: { temperature: `{{ states('${E.summer}') | int(20) }}` } }];
      if (hasPresets()) hotActions.push({ action: 'climate.set_preset_mode', target: climate, continue_on_error: true, data: { preset_mode: 'none' } });
      actions.push({ if: [{ condition: 'template', value_template: `{{ ext >= states('${E.hot}') | float(99) }}` }], then: hotActions, else: coldActions });
    } else actions.push(...coldActions);
    actions.push({ action: 'climate.set_hvac_mode', target: climate, data: { hvac_mode: hvacOn() } });
    const phone = alertsPrefs().phone || defaultPhone();
    if (phone) actions.push({ action: `notify.${phone}`, continue_on_error: true, data: {
      title: `🚗 ${carName(CAR)} : clim lancée`,
      message: `Il fait {{ ext }} °C dehors : clim lancée pour un départ à {{ states('${E.depart}')[:5] }}.`,
      data: { tag: 'chrplus_prechauffage' } } });
    return {
      alias,
      description: "Créée par l'appli CHR+. Les jours cochés, lance la clim X min avant le départ : chauffe et dégivre s'il fait froid, rafraîchit s'il fait chaud. Réglages dans l'appli.",
      triggers: [{ trigger: 'template', value_template: `{{ now() >= today_at(states('${E.depart}')) - timedelta(minutes=states('${E.lead}') | int(15)) }}` }],
      conditions, actions, mode: 'single',
    };
  }

  /** Crée l'aide si elle manque et lui donne une valeur de départ. */
  async function helperWithValue(role, domain, fields, service, data) {
    const existed = !!E[role];
    const id = await createHelper(role, domain, fields);
    if (!existed && service) await quiet(callService(domain, service, id, data));
    return id;
  }
  async function summerHelpers() {
    if (!E.outside) return;
    await helperWithValue('hot', 'input_number', { name: 'CHRplus seuil chaleur', min: 20, max: 40, step: 1, unit_of_measurement: '°C', mode: 'slider', icon: 'mdi:sun-thermometer' }, 'set_value', { value: 27 });
    await helperWithValue('summer', 'input_number', { name: 'CHRplus consigne été', min: 16, max: 24, step: 1, unit_of_measurement: '°C', mode: 'slider', icon: 'mdi:snowflake' }, 'set_value', { value: 20 });
  }

  async function installPlanner() {
    if (!E.climate) { toast("Cette voiture n'a pas de clim pilotable", true); return; }
    toast('Installation du planificateur…');
    try {
      await loadPhones();
      const full = [{ from: '00:00', to: '24:00' }];
      await helperWithValue('planOn', 'input_boolean', { name: 'CHRplus préchauffage actif', icon: 'mdi:car-clock' });
      await helperWithValue('depart', 'input_datetime', { name: 'CHRplus heure de départ', has_time: true, has_date: false, icon: 'mdi:clock-outline' }, 'set_datetime', { time: '07:30:00' });
      await helperWithValue('lead', 'input_number', { name: 'CHRplus avance préchauffage', min: 5, max: 30, step: 5, unit_of_measurement: 'min', mode: 'slider', icon: 'mdi:timer-play-outline' }, 'set_value', { value: 15 });
      await helperWithValue('target', 'input_number', { name: 'CHRplus consigne préchauffage', min: 18, max: 29, step: 1, unit_of_measurement: '°C', mode: 'slider', icon: 'mdi:thermometer-auto' }, 'set_value', { value: 21 });
      await helperWithValue('threshold', 'input_number', { name: 'CHRplus seuil température extérieure', min: -10, max: 25, step: 1, unit_of_measurement: '°C', mode: 'slider', icon: 'mdi:snowflake-thermometer' }, 'set_value', { value: 5 });
      await helperWithValue('defrost', 'input_select', { name: 'CHRplus dégivrage', options: DEFROST, icon: 'mdi:car-defrost-front' });
      await helperWithValue('days', 'schedule', { name: 'CHRplus jours de départ', icon: 'mdi:calendar-week', monday: full, tuesday: full, wednesday: full, thursday: full, friday: full, saturday: [], sunday: [] });
      await summerHelpers();
      await rest('POST', '/api/config/automation/config/chrplus_prechauffage', plannerConfig('CHRplus préchauffage'));
      toast('Planificateur installé ✅');
      setTimeout(discover, 1500);
    } catch (e) {
      toast('Installation interrompue : ' + e.message, true);
      setTimeout(discover, 800);
    }
  }

  /** Ajoute le mode été et le dégivrage « Auto » à un planificateur existant (y compris un ancien). */
  async function upgradePlanner() {
    toast('Mise à jour du planificateur…');
    try {
      await loadPhones();
      await summerHelpers();
      const opts = attr('defrost', 'options') || [];
      if (!opts.includes('Auto')) {
        await send({ type: 'input_select/update', input_select_id: E.defrost.split('.')[1],
          name: attr('defrost', 'friendly_name') || 'CHRplus dégivrage', options: ['Auto', ...opts] });
      }
      const autoId = attr('planAuto', 'id') || 'chrplus_prechauffage';
      await rest('POST', `/api/config/automation/config/${encodeURIComponent(autoId)}`, plannerConfig(attr('planAuto', 'friendly_name') || 'CHRplus préchauffage'));
      toast('Préchauffage malin activé ✅');
      setTimeout(discover, 1500);
    } catch (e) {
      toast('Mise à jour interrompue : ' + e.message, true);
      setTimeout(discover, 800);
    }
  }
  const needsPlannerUpgrade = () => planReady() && E.outside && hasPresets() &&
    (!E.hot || !E.summer || !(attr('defrost', 'options') || []).includes('Auto'));

  /** Suivi des coûts : prix unique, ou heures pleines / creuses si un capteur de tarif est choisi. */
  async function installCosts() {
    if (!E.charge || !E.batt) { toast("L'état de charge de la voiture n'est pas disponible", true); return; }
    if (E.costAuto && !E.costAuto.includes('chrplus')) { toast('Ton suivi des coûts actuel est conservé', true); return; }
    toast('Installation du suivi des coûts…');
    try {
      const box = (name, min, max, step, unit, icon) => ({ name, min, max, step, unit_of_measurement: unit, mode: 'box', icon });
      const cap = await helperWithValue('capacity', 'input_number', box('CHRplus capacité batterie', 10, 150, 0.1, 'kWh', 'mdi:car-battery'), 'set_value', { value: 60 });
      const price = await helperWithValue('priceKwh', 'input_number', box('CHRplus prix du kWh', 0, 2, 0.0001, '€/kWh', 'mdi:currency-eur'), 'set_value', { value: 0.25 });
      const start = await createHelper('battStart', 'input_number', box('CHRplus batterie début de charge', 0, 100, 1, '%', 'mdi:battery-arrow-up'));
      const cPrice = await createHelper('chargePrice', 'input_number', box('CHRplus prix de la charge', 0, 2, 0.0001, '€/kWh', 'mdi:cash-clock'));
      const cLast = await createHelper('costLast', 'input_number', box('CHRplus coût dernière recharge', 0, 1000, 0.01, '€', 'mdi:cash'));
      const kLast = await createHelper('kwhLast', 'input_number', box('CHRplus énergie dernière recharge', 0, 300, 0.01, 'kWh', 'mdi:lightning-bolt-outline'));
      const cMonth = await createHelper('costMonth', 'input_number', box('CHRplus coût recharges du mois', 0, 10000, 0.01, '€', 'mdi:cash-multiple'));
      const kMonth = await createHelper('kwhMonth', 'input_number', box('CHRplus énergie recharges du mois', 0, 10000, 0.01, 'kWh', 'mdi:lightning-bolt'));
      let hc = null, sav = null;
      if (E.tariff) {
        hc = await helperWithValue('priceHc', 'input_number', box('CHRplus prix du kWh HC', 0, 2, 0.0001, '€/kWh', 'mdi:weather-night'), 'set_value', { value: 0.2 });
        sav = await createHelper('savings', 'input_number', box('CHRplus économies du mois', 0, 10000, 0.01, '€', 'mdi:piggy-bank'));
      }
      const B = E.batt, C = E.charge;
      const add = (id, v) => ({ action: 'input_number.set_value', target: { entity_id: id }, data: { value: `{{ (states('${id}') | float(0) + ${v}) | round(2) }}` } });
      const priceTpl = hc
        ? `{{ states('${hc}') if states('${E.tariff}') is search('${HC_REGEX}', ignorecase=True) else states('${price}') }}`
        : `{{ states('${price}') }}`;
      const endSeq = [
        { action: 'input_number.set_value', target: { entity_id: kLast }, data: { value: '{{ kwh }}' } },
        { action: 'input_number.set_value', target: { entity_id: cLast }, data: { value: '{{ cout }}' } },
        add(kMonth, 'kwh'), add(cMonth, 'cout'),
      ];
      if (sav) endSeq.push(add(sav, `([states('${price}') | float(0) - states('${cPrice}') | float(0), 0] | max) * kwh`));
      await rest('POST', '/api/config/automation/config/chrplus_suivi_des_couts', {
        alias: 'CHRplus suivi des coûts',
        description: "Créée par l'appli CHR+. Estime l'énergie et le prix de chaque recharge (% gagné × capacité, ~10 % de pertes), au tarif en cours au début de la charge. Cumule sur le mois.",
        triggers: [
          { trigger: 'state', entity_id: C, to: 'charging', id: 'debut' },
          { trigger: 'state', entity_id: C, from: 'charging', not_to: ['unavailable', 'unknown'], id: 'fin' },
          { trigger: 'time', at: '00:00:05', id: 'minuit' },
        ],
        conditions: [],
        actions: [{ choose: [
          { conditions: [{ condition: 'trigger', id: 'debut' }], sequence: [
            { action: 'input_number.set_value', target: { entity_id: start }, data: { value: `{{ states('${B}') | int(0) }}` } },
            { action: 'input_number.set_value', target: { entity_id: cPrice }, data: { value: priceTpl } },
          ] },
          { conditions: [{ condition: 'trigger', id: 'fin' }], sequence: [
            { variables: { gain: `{{ [states('${B}') | int(0) - states('${start}') | int(0), 0] | max }}` } },
            { variables: { kwh: `{{ (gain / 100 * states('${cap}') | float(0) / 0.9) | round(2) }}` } },
            { variables: { cout: `{{ (kwh * states('${cPrice}') | float(0)) | round(2) }}` } },
            { if: [{ condition: 'template', value_template: '{{ gain > 0 }}' }], then: endSeq },
          ] },
          { conditions: [{ condition: 'trigger', id: 'minuit' }, { condition: 'template', value_template: '{{ now().day == 1 }}' }],
            sequence: [{ action: 'input_number.set_value', target: { entity_id: [kMonth, cMonth].concat(sav ? [sav] : []) }, data: { value: 0 } }] },
        ] }],
        mode: 'queued',
      });
      toast('Suivi des coûts installé ✅ — règle la capacité et les prix');
      setTimeout(discover, 1500);
    } catch (e) {
      toast('Installation interrompue : ' + e.message, true);
      setTimeout(discover, 800);
    }
  }
  const needsCostUpgrade = () => costReady() && E.costAuto.includes('chrplus') && (!E.chargePrice || (E.tariff && !E.priceHc));

  // ---------- Historique des recharges (gardé sur le téléphone, complété à chaque ouverture) ----------
  const sessions = () => { try { return JSON.parse(LS.get('sessions', '[]')); } catch (e) { return []; } };
  function loadSessions() {
    if (!E.costLast || !E.kwhLast) return;
    const now = new Date();
    send({ type: 'history/history_during_period', start_time: new Date(now.getTime() - 30 * 86400000).toISOString(), end_time: now.toISOString(),
      entity_ids: [E.costLast, E.kwhLast], minimal_response: true, no_attributes: true, significant_changes_only: false })
      .then((r) => {
        const pts = (id) => ((r && r[id]) || []).map((x) => ({ t: (x.lu || x.lc) * 1000, v: parseFloat(x.s) })).filter((q) => !isNaN(q.v) && !isNaN(q.t) && q.v > 0);
        const cost = pts(E.costLast), kwh = pts(E.kwhLast);
        let list = sessions();
        cost.forEach((c) => {
          let best = null, d = 10 * 60000;
          kwh.forEach((k) => { const dd = Math.abs(k.t - c.t); if (dd < d) { d = dd; best = k; } });
          if (best && !list.some((x) => Math.abs(x.t - c.t) < 5 * 60000)) list.push({ t: c.t, eur: c.v, kwh: best.v });
        });
        list.sort((a, b) => b.t - a.t);
        LS.set('sessions', JSON.stringify(list.slice(0, 300)));
        scheduleRender();
      }).catch(() => { });
  }
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function historyCard() {
    if (!E.costLast) return '';
    const list = sessions();
    if (!list.length) return '<section class="card"><h2>Historique des recharges</h2><p class="muted small">Tes recharges apparaîtront ici au fil du temps.</p></section>';
    const months = {};
    list.forEach((x) => {
      const d = new Date(x.t), k = d.getFullYear() * 100 + d.getMonth();
      const m = months[k] = months[k] || { y: d.getFullYear(), m: d.getMonth(), kwh: 0, eur: 0, n: 0 };
      m.kwh += x.kwh; m.eur += x.eur; m.n++;
    });
    const mrows = Object.keys(months).sort().reverse().slice(0, 6).map((k) => { const m = months[k];
      return line(`${MONTHS[m.m]} ${m.y}`, `${m.n} recharge${m.n > 1 ? 's' : ''} · ${fmt(m.kwh, 0)} kWh · ${fmt(m.eur, 2)} €`); }).join('');
    const rows = list.slice(0, 12).map((x) => { const d = new Date(x.t);
      return `<div class="line"><span class="k">${d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} · ${hhmm(d)}</span><span class="v">${fmt(x.kwh, 1)} kWh · ${fmt(x.eur, 2)} €</span></div>`; }).join('');
    return `<section class="card"><h2>Historique des recharges</h2>${rows}
      <div style="margin-top:10px" class="small muted">PAR MOIS</div>${mrows}
      <p class="small muted" style="margin:6px 0 0">Depuis le ${new Date(list[list.length - 1].t).toLocaleDateString('fr-FR')}.</p></section>`;
  }

  // ---------- Graphiques ----------
  let CHART = { batt: null, km: null, at: 0 };
  function loadCharts(force) {
    if (!discovered) return;
    if (!force && Date.now() - CHART.at < 5 * 60 * 1000) return;
    CHART.at = Date.now();
    const now = new Date();
    if (E.batt) send({
      type: 'history/history_during_period', start_time: new Date(now.getTime() - 7 * 86400000).toISOString(), end_time: now.toISOString(),
      entity_ids: [E.batt], minimal_response: true, no_attributes: true, significant_changes_only: false,
    }).then((r) => {
      CHART.batt = ((r && r[E.batt]) || []).map((x) => ({ t: (x.lu || x.lc) * 1000, v: parseFloat(x.s) })).filter((p) => !isNaN(p.v) && !isNaN(p.t));
      scheduleRender();
    }).catch(() => { CHART.batt = []; });
    if (E.odo) {
      const start = new Date(now.getTime() - 30 * 86400000); start.setHours(0, 0, 0, 0);
      send({ type: 'recorder/statistics_during_period', start_time: start.toISOString(), period: 'day', statistic_ids: [E.odo], types: ['change'] })
        .then((r) => {
          CHART.km = ((r && r[E.odo]) || []).map((x) => ({ t: typeof x.start === 'number' ? x.start : new Date(x.start).getTime(), v: x.change }))
            .filter((p) => p.v !== null && p.v !== undefined && !isNaN(p.v));
          scheduleRender();
        }).catch(() => { CHART.km = []; });
    }
  }

  function lineChart(points) {
    if (!points || points.length < 2) return `<div class="muted small center">${points ? 'Pas assez de données pour le graphique' : 'Chargement…'}</div>`;
    const W = 340, H = 150, pl = 28, pr = 6, pt = 8, pb = 20, min = 0, max = 100;
    const t0 = points[0].t, t1 = Date.now();
    const x = (t) => pl + ((t - t0) / (t1 - t0 || 1)) * (W - pl - pr);
    const y = (v) => pt + (1 - (v - min) / (max - min)) * (H - pt - pb);
    let d = `M${x(points[0].t).toFixed(1)},${y(points[0].v).toFixed(1)}`;
    for (let i = 1; i < points.length; i++) d += ` H${x(points[i].t).toFixed(1)} V${y(points[i].v).toFixed(1)}`;
    d += ` H${x(t1).toFixed(1)}`;
    const area = `${d} V${y(min)} H${x(points[0].t)} Z`;
    let grid = '';
    [0, 50, 100].forEach((g) => { grid += `<line x1="${pl}" x2="${W - pr}" y1="${y(g)}" y2="${y(g)}" style="stroke:var(--line)"/><text x="2" y="${y(g) + 3}">${g}%</text>`; });
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
    const W = 340, H = 150, pl = 26, pb = 18, pt = 8, n = 30, bw = (W - pl) / n;
    const max = Math.max(10, ...points.map((p) => p.v)) * 1.1;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let bars = '';
    points.forEach((p) => {
      const d = new Date(p.t); d.setHours(0, 0, 0, 0);
      const idx = n - 1 - Math.round((today - d) / 86400000);
      if (idx < 0 || idx >= n) return;
      const h = (Math.max(0, p.v) / max) * (H - pb - pt);
      bars += `<rect x="${(pl + idx * bw + 1).toFixed(1)}" y="${(H - pb - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${idx === n - 1 ? '#FF8A4C' : '#5AB8FF'}"/>`;
    });
    const mid = Math.max(10, Math.round(max / 2 / 10) * 10);
    const ym = H - pb - (mid / max) * (H - pb - pt);
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <line x1="${pl}" x2="${W}" y1="${H - pb}" y2="${H - pb}" style="stroke:var(--line)"/>
      <line x1="${pl}" x2="${W}" y1="${ym}" y2="${ym}" style="stroke:var(--line)" stroke-dasharray="3 3"/><text x="0" y="${ym + 3}">${mid}</text>
      ${bars}<text x="${pl}" y="${H - 4}">il y a 30 j</text><text x="${W - 2}" y="${H - 4}" text-anchor="end">aujourd'hui</text></svg>`;
  }

  // ---------- Rendu ----------
  let tab = 'voiture', renderQueued = false;
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; render(); });
  }
  function render() {
    if ($('.setup')) return;
    const a = document.activeElement;
    if (a && $('#view').contains(a) && (a.tagName === 'SELECT' || (a.tagName === 'INPUT' && a.type !== 'checkbox'))) { setTimeout(scheduleRender, 800); return; }
    const y = window.scrollY;
    let html;
    if (!discovered) html = viewWaiting();
    else if (!CAR) html = viewNoCar();
    else html = { voiture: viewCar, prechauffage: viewHeat, recharge: viewCharge, trajets: viewTrips }[tab]();
    $('#view').innerHTML = html;
    window.scrollTo(0, y);
    if (connState === 'ok' && !fromCache) $('#sync').textContent = has('reported') ? `Vue par la voiture ${ago(val('reported'))}` : 'Connectée';
    else if (fromCache) $('#sync').textContent = (connState === 'connecting' ? 'Connexion… · ' : 'Hors ligne · ') + `données de ${hhmm(new Date(fromCache))}`;
    $('#car-name').textContent = carName(CAR);
  }
  function carName(c) {
    if (!c) return 'CHR+';
    if (c === CAR && LS.get('carName')) return LS.get('carName');
    const s = c.roles.vin && STATES[c.roles.vin];
    const fn = STATES[c.roles.batt || c.roles.lock || c.roles.odo];
    const n = fn && fn.attributes && fn.attributes.friendly_name ? fn.attributes.friendly_name.split(' ')[0] : '';
    return n && n.length > 1 && n.length < 16 ? n : (s && s.state && s.state.length > 6 ? 'VIN …' + s.state.slice(-6) : 'Ma Toyota');
  }

  function viewWaiting() {
    return `<div class="card center"><p class="big">🚗</p><p>${esc($('#sync').textContent)}</p>
      <p class="muted small">Adresse : ${esc(cleanUrl(cfg.url) || '—')}</p>
      <button class="btn" data-act="settings">Réglages de connexion</button></div>`;
  }
  function viewNoCar() {
    return `<div class="card"><h2>Aucune voiture trouvée</h2>
      <p>CHR+ s'appuie sur l'intégration <strong>Toyota EU community</strong> de Home Assistant, et aucune voiture n'y a été trouvée.</p>
      <p class="muted small">Installe-la depuis le Marketplace (ou HACS), connecte ton compte MyToyota, puis rouvre l'appli.</p>
      <button class="btn" data-act="rediscover">⟳ Chercher à nouveau</button></div>`;
  }

  function ring(pct, color) {
    const r = 54, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct || 0));
    return `<svg width="130" height="130" viewBox="0 0 130 130"><circle cx="65" cy="65" r="${r}" fill="none" style="stroke:var(--line)" stroke-width="12"/>
      <circle cx="65" cy="65" r="${r}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${(c * p / 100).toFixed(1)} ${c.toFixed(1)}"/></svg>`;
  }
  function chargePill() {
    if (!E.charge) return '';
    const s = val('charge');
    const [l, c] = CHARGE_LABEL[s] || [s || '—', ''];
    return `<span class="pill ${c}">${s === 'charging' ? '⚡ ' : ''}${esc(l)}</span>`;
  }
  function carSvg() {
    const o = (k) => (val(k) === 'on' ? ' open' : '');
    return `<svg class="car-svg" width="120" height="210" viewBox="0 0 120 210">
      <rect x="18" y="8" width="84" height="194" rx="30" style="fill:var(--card2);stroke:var(--mut)" stroke-width="1.5"/>
      <path class="part${o('hood')}" d="M26,22 Q60,6 94,22 L92,56 L28,56 Z"/>
      <path class="glass${o('winFL')}" d="M30,62 L58,62 L58,92 L30,96 Z"/><path class="glass${o('winFR')}" d="M62,62 L90,62 L90,96 L62,92 Z"/>
      <path class="glass${o('winRL')}" d="M30,104 L58,100 L58,132 L30,132 Z"/><path class="glass${o('winRR')}" d="M62,100 L90,104 L90,132 L62,132 Z"/>
      <rect class="part${o('doorFL')}" x="10" y="62" width="9" height="40" rx="3"/><rect class="part${o('doorFR')}" x="101" y="62" width="9" height="40" rx="3"/>
      <rect class="part${o('doorRL')}" x="10" y="106" width="9" height="36" rx="3"/><rect class="part${o('doorRR')}" x="101" y="106" width="9" height="36" rx="3"/>
      <path class="part${o('trunk')}" d="M28,150 L92,150 L94,186 Q60,200 26,186 Z"/></svg>`;
  }
  const line = (k, v) => `<div class="line"><span class="k">${k}</span><span class="v">${v}</span></div>`;


  // Illustration originale (SUV compact générique) affichée tant qu'aucune photo n'est choisie
  const ILLUSTRATION = `<svg viewBox="0 0 400 225" preserveAspectRatio="xMidYMid slice" class="photo-ill">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22324a"/><stop offset=".62" stop-color="#3a3550"/><stop offset=".63" stop-color="#151a21"/><stop offset="1" stop-color="#0e1116"/></linearGradient>
      <radialGradient id="sun" cx="0.72" cy="0.58" r="0.35"><stop offset="0" stop-color="#ff8a4c" stop-opacity=".55"/><stop offset="1" stop-color="#ff8a4c" stop-opacity="0"/></radialGradient>
      <linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9eef5"/><stop offset=".55" stop-color="#b9c3d0"/><stop offset="1" stop-color="#7d8898"/></linearGradient>
      <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a6a8c"/><stop offset="1" stop-color="#151a21"/></linearGradient>
      <linearGradient id="road" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3ddc97" stop-opacity=".0"/><stop offset="1" stop-color="#3ddc97" stop-opacity=".18"/></linearGradient>
    </defs>
    <rect width="400" height="225" fill="url(#sky)"/>
    <rect width="400" height="225" fill="url(#sun)"/>
    <path d="M0,141 L60,128 L110,136 L170,120 L230,134 L300,118 L360,130 L400,124 L400,141 Z" fill="#1a2230"/>
    <rect y="141" width="400" height="84" fill="url(#road)"/>
    <ellipse cx="207" cy="192" rx="160" ry="9" fill="#000" opacity=".45"/>
    <!-- carrosserie (crossover haut sur roues) -->
    <path d="M60,160 C58,148 64,140 78,137 L118,131 C134,112 156,98 186,94 L254,92 C280,92 300,104 318,122 L336,127 C350,130 358,140 358,152 L358,160 C358,164 355,167 351,167 L68,167 C63,167 60,164 60,160 Z" fill="url(#body)"/>
    <!-- protections noires de passages de roues et bas de caisse -->
    <path d="M78,167 L80,158 A30,30 0 0 1 138,158 L140,167 Z M274,167 L276,158 A30,30 0 0 1 334,158 L336,167 Z" fill="#202733"/>
    <rect x="138" y="160" width="138" height="9" rx="3" fill="#202733"/>
    <path d="M60,158 L80,158 L80,167 L68,167 C63,167 60,164 60,160 Z M334,158 L358,158 L358,160 C358,164 355,167 351,167 L334,167 Z" fill="#202733"/>
    <!-- vitres -->
    <path d="M132,128 C146,113 164,103 188,100 L214,99 L212,128 Z" fill="url(#glass)"/>
    <path d="M220,99 L254,98 C272,98 288,107 302,122 L302,128 L218,128 Z" fill="url(#glass)"/>
    <path d="M114,132 L340,132" stroke="#7d8898" stroke-width="1.2" opacity=".7"/>
    <!-- barres de toit -->
    <path d="M170,93 L262,90" stroke="#4a5566" stroke-width="3" stroke-linecap="round"/>
    <!-- feux -->
    <path d="M330,134 L354,138 L353,143 L328,140 Z" fill="#e9f6ff"/>
    <path d="M354,139 L398,130 L398,152 Z" fill="#e9f6ff" opacity=".08"/>
    <path d="M62,140 L82,137 L82,142 L62,145 Z" fill="#ff5d6c"/>
    <!-- poignées -->
    <rect x="176" y="137" width="14" height="3" rx="1.5" fill="#7d8898"/><rect x="250" y="137" width="14" height="3" rx="1.5" fill="#7d8898"/>
    <!-- roues -->
    <g><circle cx="109" cy="170" r="24" fill="#151a21"/><circle cx="109" cy="170" r="14" fill="#4a5566"/><circle cx="109" cy="170" r="5" fill="#b9c3d0"/></g>
    <g><circle cx="305" cy="170" r="24" fill="#151a21"/><circle cx="305" cy="170" r="14" fill="#4a5566"/><circle cx="305" cy="170" r="5" fill="#b9c3d0"/></g>
    <!-- éclair électrique -->
    <path d="M240,112 L232,122 L237,122 L234,130 L244,118 L239,118 Z" fill="#3ddc97"/>
  </svg>`;

  function photoCard() {
    const photo = LS.get('photo');
    const b = num('batt');
    return `<section class="photo-card">
      ${photo ? `<img src="${photo}" alt="Ma voiture" style="object-position:center ${esc(LS.get('photoY', '55'))}%">` : ILLUSTRATION}
      <div class="photo-shade"></div>
      <button class="photo-btn" data-act="photo" aria-label="Changer la photo">📷</button>
      <div class="photo-cap">
        <div class="photo-name">${esc(carName(CAR))}</div>
        <div class="photo-sub">${b !== null ? `${fmt(b)} % · ${fmt(num('range') ?? num('fuelRange'))} km` : ''}${E.lock ? ` · ${val('lock') === 'locked' ? '🔒' : '🔓'}` : ''}</div>
      </div>
      ${photo ? '' : '<div class="photo-hint">Touche 📷 pour mettre la photo de ta voiture</div>'}
    </section>`;
  }

  // Réduit la photo choisie (1280 px, JPEG) avant de la garder sur le téléphone
  function onPhotoPicked(file) {
    if (!file) return;
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const W = Math.min(1280, img.naturalWidth), H = Math.round(img.naturalHeight * W / img.naturalWidth);
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        c.getContext('2d').drawImage(img, 0, 0, W, H);
        let q = 0.82, data = c.toDataURL('image/jpeg', q);
        while (data.length > 900000 && q > 0.4) { q -= 0.1; data = c.toDataURL('image/jpeg', q); }
        try { localStorage.setItem('chr_photo', data); toast('Photo enregistrée 📸'); }
        catch (e) { toast('Photo trop lourde, essaie une autre', true); }
        scheduleRender();
      };
      img.onerror = () => toast("Impossible de lire cette image", true);
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  }

  function viewCar() {
    const batt = num('batt');
    const openList = OPEN_ROLES.filter((r) => E[r] && val(r) === 'on');
    const knownOpenings = OPEN_ROLES.some((r) => E[r]);
    const lat = attr('tracker', 'latitude'), lon = attr('tracker', 'longitude');
    const tr = val('tracker');
    const where = tr === 'home' ? 'À la maison' : tr === 'not_home' ? 'Hors de la maison' : (tr || '—');
    const warn = num('warnings', 0);
    const battColor = batt === null ? '#4A5566' : batt < 20 ? '#FF5D6C' : batt < 40 ? '#FFC857' : '#3DDC97';
    const fuel = has('fuel') ? num('fuel') : null;
    return `${photoCard()}
      <section class="card"><div class="hero">
        <div class="ring">${ring(batt ?? fuel, battColor)}<div class="lbl"><div class="pct">${fmt(batt ?? fuel)}%</div><div class="cap">${batt !== null ? 'batterie' : 'carburant'}</div></div></div>
        <div>
          <div class="big">${fmt(num('range') ?? num('fuelRange'))}<small> km</small></div>
          ${E.rangeAc ? `<div class="muted small">${fmt(num('rangeAc'))} km avec la clim</div>` : ''}
          <div style="margin-top:10px">${chargePill()}</div>
        </div></div></section>

      ${knownOpenings || E.lock ? `<section class="card">
        <h2>Ouvrants <small>${E.lock ? (val('lock') === 'locked' ? '<span class="pill g">🔒 Verrouillée</span>' : '<span class="pill r">🔓 Déverrouillée</span>') : ''}</small></h2>
        <div class="car-wrap">${carSvg()}<div class="legend">
          ${knownOpenings ? (openList.length
            ? openList.map((k) => `<div class="line"><span class="k">${OPEN_NAMES[k]}</span><span class="v bad">${k === 'trunk' || k === 'hood' ? 'ouvert' : 'ouverte'}</span></div>`).join('')
            : '<div class="line"><span class="k">Portes, vitres, coffre, capot</span><span class="v ok">tout est fermé</span></div>') : ''}
          ${E.lock ? `<div class="row" style="margin-top:10px"><button class="btn" data-act="lock">🔒 Verrouiller</button><button class="btn" data-act="unlock">🔓 Ouvrir</button></div>` : ''}
        </div></div></section>` : ''}

      <section class="card"><h2>Infos</h2>
        ${E.odo ? line('Compteur', `${fmt(num('odo'))} km`) : ''}
        ${fuel !== null && batt !== null ? line('Carburant', `${fmt(fuel)} % · ${fmt(num('fuelRange'))} km`) : ''}
        ${E.tracker && typeof lat !== 'number' ? line('Position', esc(where)) : ''}
        ${E.health ? line('État du véhicule', val('health') === 'off' ? '<span class="pill g">OK</span>' : val('health') === 'on' ? '<span class="pill r">Problème</span>' : '—') : ''}
        ${E.warnings ? line("Voyants d'alerte", warn > 0 ? `<span class="pill r">${warn}</span>` : '<span class="pill g">aucun</span>') : ''}
        ${E.service ? line('Dernier entretien', has('service') ? dateFr(val('service')) : '—') : ''}
        ${E.fetched ? line('Dernière synchro', ago(val('fetched'))) : ''}
      </section>

      ${mapCard()}
      ${E.horn || E.hazard ? `<section class="card"><h2>Commandes</h2><div class="row">
        ${E.horn ? '<button class="btn" data-act="horn">📣 Klaxon</button>' : ''}
        ${E.hazard ? `<button class="btn ${val('hazard') === 'on' ? 'warm' : ''}" data-act="hazard">⚠️ Warnings ${val('hazard') === 'on' ? 'ON' : ''}</button>` : ''}
      </div></section>` : ''}
      ${alertsCard()}`;
  }

  // Carte intégrée (tuiles OpenStreetMap / CARTO), la touche ouvre l'itinéraire
  function mapCard() {
    const lat = attr('tracker', 'latitude'), lon = attr('tracker', 'longitude');
    if (typeof lat !== 'number' || typeof lon !== 'number') return '';
    const z = 16, n = Math.pow(2, z);
    const xt = (lon + 180) / 360 * n;
    const r = lat * Math.PI / 180;
    const yt = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n;
    const xi = Math.floor(xt), yi = Math.floor(yt);
    const style = window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light_all' : 'dark_all';
    let tiles = '';
    for (let dx = -2; dx <= 2; dx++) for (let dy = -1; dy <= 1; dy++) {
      const x = xi + dx, y = yi + dy;
      tiles += `<img class="tile" alt="" onerror="this.style.visibility='hidden'" src="https://${'abcd'[(x + y) & 3]}.basemaps.cartocdn.com/${style}/${z}/${x}/${y}@2x.png" style="left:calc(50% + ${((x - xt) * 256).toFixed(1)}px);top:calc(50% + ${((y - yt) * 256).toFixed(1)}px)">`;
    }
    const tr = val('tracker');
    const where = tr === 'home' ? 'À la maison' : tr === 'not_home' ? 'Hors de la maison' : (tr || '');
    return `<section class="card"><h2>Où est-elle ? <small>${esc(where)}</small></h2>
      <a class="map" href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}">${tiles}<span class="pin">📍</span></a>
      <div class="attrib">© OpenStreetMap · © CARTO — touche la carte pour l'itinéraire</div></section>`;
  }

  // ---------- Alertes (automatisation « CHRplus alertes » dans Home Assistant) ----------
  const ALERTS = [['lock', '🔒 Pas verrouillée le soir (22 h)'], ['open', '🚪 Portière, vitre ou coffre ouvert 10 min'],
    ['charged', '✅ Recharge terminée'], ['low', '🪫 Batterie sous 20 %']];
  function alertsPrefs() {
    const d = { lock: true, open: true, charged: true, low: true, phone: '' };
    try { return Object.assign(d, JSON.parse(LS.get('alerts', '{}'))); } catch (e) { return d; }
  }
  function setAlertsPref(k, v) { const p = alertsPrefs(); p[k] = v; LS.set('alerts', JSON.stringify(p)); }
  function loadPhones() {
    if (PHONES) return Promise.resolve(PHONES);
    return send({ type: 'get_services' }).then((s) => {
      PHONES = Object.keys((s && s.notify) || {}).filter((k) => k.startsWith('mobile_app_'));
      return PHONES;
    }).catch(() => (PHONES = []));
  }
  const defaultPhone = () => (PHONES || []).find((p) => !/watch/i.test(p)) || (PHONES || [])[0] || '';
  const phoneName = (p) => p.replace(/^mobile_app_/, '').replace(/_/g, ' ');
  function alertsCard() {
    const installed = !!E.alertsAuto;
    if (!IS_ADMIN) return installed ? '<section class="card"><h2>Alertes <span class="pill g">actives</span></h2><p class="muted small">Gérées dans Home Assistant.</p></section>' : '';
    const p = alertsPrefs();
    const phone = p.phone || defaultPhone();
    return `<section class="card"><h2>Alertes sur ton téléphone ${installed ? '<span class="pill g">actives</span>' : ''}</h2>
      ${ALERTS.map(([k, l]) => `<div class="setting"><div class="k" style="font-weight:500">${l}</div><label class="switch"><input type="checkbox" data-alert="${k}" ${p[k] ? 'checked' : ''}><span></span></label></div>`).join('')}
      <div class="setting"><div class="k">Téléphone</div>
        ${PHONES === null ? '<span class="muted small">recherche…</span>' : PHONES.length ? `<select id="alert-phone">${PHONES.map((x) => `<option value="${esc(x)}" ${x === phone ? 'selected' : ''}>${esc(phoneName(x))}</option>`).join('')}</select>` : '<span class="muted small">aucun</span>'}</div>
      ${PHONES && !PHONES.length ? "<p class=\"small muted\">Installe l'appli Home Assistant (Companion) sur ton téléphone pour recevoir les alertes.</p>" : ''}
      <button class="btn warm" data-act="install-alerts" ${PHONES && PHONES.length ? '' : 'disabled'}>${installed ? 'Mettre à jour les alertes' : 'Activer les alertes'}</button>
      <p class="small muted" style="margin:8px 0 0">Elles partent de Home Assistant, même appli fermée.</p></section>`;
  }
  async function installAlerts() {
    await loadPhones();
    const p = alertsPrefs();
    const phone = p.phone || defaultPhone();
    if (!phone) { toast('Aucun téléphone trouvé', true); return; }
    const n = carName(CAR);
    const rangeTxt = E.range ? `, {{ states('${E.range}') | int(0) }} km` : '';
    const notify = (tag, title, message) => ({ action: `notify.${phone}`, data: { title, message, data: { tag: 'chrplus_' + tag } } });
    const triggers = [], branches = [];
    if (p.lock && E.lock) {
      triggers.push({ trigger: 'time', at: '22:00:00', id: 'nuit' });
      branches.push({ conditions: [{ condition: 'trigger', id: 'nuit' }, { condition: 'state', entity_id: E.lock, state: 'unlocked' }],
        sequence: [notify('nuit', `🔓 ${n} pas verrouillée`, 'Elle est toujours ouverte. Ouvre CHR+ pour la verrouiller.')] });
    }
    const opens = OPEN_ROLES.map((r) => E[r]).filter(Boolean);
    if (p.open && opens.length) {
      triggers.push({ trigger: 'state', entity_id: opens, to: 'on', for: { minutes: 10 }, id: 'ouvert' });
      branches.push({ conditions: [{ condition: 'trigger', id: 'ouvert' }],
        sequence: [notify('ouvert', `🚪 ${n} : quelque chose est ouvert`, "{{ state_attr(trigger.entity_id, 'friendly_name') }} : ouvert depuis 10 minutes.")] });
    }
    if (p.charged && E.charge && E.batt) {
      triggers.push({ trigger: 'state', entity_id: E.charge, from: 'charging', to: ['charge_complete', 'plugged'], id: 'charge' });
      branches.push({ conditions: [{ condition: 'trigger', id: 'charge' }],
        sequence: [notify('charge', '✅ Recharge terminée', `${n} : {{ states('${E.batt}') }} %${rangeTxt}.`)] });
    }
    if (p.low && E.batt) {
      triggers.push({ trigger: 'numeric_state', entity_id: E.batt, below: 20, id: 'basse' });
      branches.push({ conditions: [{ condition: 'trigger', id: 'basse' },
        { condition: 'template', value_template: "{{ trigger.from_state is not none and trigger.from_state.state not in ['unavailable', 'unknown'] }}" }],
        sequence: [notify('basse', '🪫 Batterie faible', `${n} : {{ states('${E.batt}') }} %${rangeTxt}.`)] });
    }
    if (!triggers.length) { toast('Coche au moins une alerte', true); return; }
    toast('Enregistrement des alertes…');
    try {
      await rest('POST', '/api/config/automation/config/chrplus_alertes', {
        alias: 'CHRplus alertes',
        description: "Créée par l'appli CHR+ : alertes de la voiture envoyées sur le téléphone. Réglages dans l'appli.",
        triggers, conditions: [], actions: [{ choose: branches }], mode: 'queued',
      });
      setAlertsPref('phone', phone);
      toast('Alertes actives ✅');
      setTimeout(discover, 1500);
    } catch (e) { toast('Échec : ' + e.message, true); }
  }

  function nextDeparture() {
    if (!SCHEDULE) return null;
    const now = new Date();
    const dep = (val('depart') || '07:30:00').split(':');
    const lead = num('lead', 15);
    for (let i = 0; i < 8; i++) {
      const d = new Date(now); d.setDate(now.getDate() + i);
      if (!(SCHEDULE[DAY_KEYS[d.getDay()]] || []).length) continue;
      d.setHours(+dep[0], +dep[1], 0, 0);
      if (i === 0 && new Date(d.getTime() - lead * 60000) <= now) continue;
      return i === 0 ? "aujourd'hui" : i === 1 ? 'demain' : `${DAY_NAMES[d.getDay()]} ${d.getDate()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    return 'aucun jour coché';
  }
  function stepper(role, unit, step, min, max, dec = 0) {
    return `<div class="stepper">
      <button data-step="${role}" data-d="${-step}" data-min="${min}" data-max="${max}" aria-label="moins">−</button>
      <span class="val">${fmt(num(role), dec)}${unit}</span>
      <button data-step="${role}" data-d="${step}" data-min="${min}" data-max="${max}" aria-label="plus">+</button></div>`;
  }
  function seatSeg(role, label) {
    if (!E[role]) return '';
    const cur = val(role);
    const opts = attr(role, 'options') || ['off', 'low', 'medium', 'high'];
    return `<div><div class="small muted" style="margin-bottom:4px">${label}</div>
      <div class="seg hot">${opts.map((o) => `<button class="${o === cur ? 'on' : ''}" data-select="${role}" data-opt="${esc(o)}">${SEAT_LABEL[o] || esc(o)}</button>`).join('')}</div></div>`;
  }
  function installCard(title, text, act) {
    return `<section class="card summary off"><h2>${title}</h2><p>${text}</p>
      ${IS_ADMIN ? `<button class="btn warm" data-act="${act}" style="margin-top:10px">Installer dans Home Assistant</button>
        <p class="small">Crée quelques réglages et une automatisation dans ton Home Assistant (tout commence par « CHRplus »).</p>`
        : '<p class="small">Il faut te connecter avec un compte <strong>administrateur</strong> de Home Assistant pour l\'installer.</p>'}</section>`;
  }

  function viewHeat() {
    if (!E.climate) return '<section class="card"><h2>Préchauffage</h2><p>La clim de cette voiture n\'est pas pilotable depuis Home Assistant.</p></section>';
    const on = val('climate') && val('climate') !== 'off' && val('climate') !== 'unavailable';
    const temp = attr('climate', 'temperature');
    const preset = attr('climate', 'preset_mode');
    const presets = attr('climate', 'preset_modes') || [];
    const ext = outsideTemp();
    const seats = ['seatD', 'seatP', 'seatRD', 'seatRP'].some((r) => E[r]);
    let plan;
    if (!planReady()) {
      plan = installCard('Planificateur de départ', "Programme l'heure de départ et les jours : la clim se lance toute seule avant que tu partes, seulement s'il fait froid. Ça tourne dans Home Assistant, même téléphone éteint.", 'install-plan');
    } else {
      const planOn = val('planOn') === 'on';
      const seuil = num('threshold', 0);
      const depart = (val('depart') || '').slice(0, 5);
      let startTxt = '—';
      if (depart) { const d = new Date(); const [h, m] = depart.split(':'); d.setHours(+h, +m - num('lead', 15), 0, 0); startTxt = hhmm(d); }
      const hot = E.hot ? num('hot', 99) : null;
      const wouldRun = ext !== null && (ext < seuil || (hot !== null && ext >= hot));
      const lastRun = attr('planAuto', 'last_triggered');
      plan = `
      <section class="card summary ${planOn ? '' : 'off'}">
        <h2>Planificateur de départ <label class="switch"><input type="checkbox" data-toggle="planOn" ${planOn ? 'checked' : ''}><span></span></label></h2>
        ${planOn ? `<div class="big">${esc(depart)}<small> départ · ${esc(nextDeparture() || '…')}</small></div>
          <p>Clim lancée à <strong>${startTxt}</strong>, ${fmt(num('target'))} °C, dégivrage ${esc((val('defrost') || '').toLowerCase())}.</p>
          ${E.outside ? `<p>Seulement s'il fait moins de <strong>${fmt(seuil)} °C</strong>${hot !== null ? ` ou plus de <strong>${fmt(hot)} °C</strong> (clim à ${fmt(num('summer'))} °C)` : ''} dehors — il fait ${fmt(ext, 1)} °C : ${wouldRun ? '<strong>ça se lancerait</strong>' : 'ça ne se lancerait pas.'}</p>` : '<p>Se lance à chaque départ programmé (aucune température extérieure choisie).</p>'}`
        : '<p>Désactivé. Active-le pour que la clim chauffe la voiture avant ton départ.</p>'}
        ${lastRun ? `<p class="small">Dernier préchauffage : ${ago(lastRun)}</p>` : ''}
      </section>
      <section class="card"><h2>Réglages du départ</h2>
        <div class="setting"><div><div class="k">Heure de départ</div></div><input type="time" id="depart-time" value="${esc(depart)}"></div>
        <div class="setting" style="display:block"><div class="k" style="margin-bottom:8px">Jours de départ</div>
          <div class="chips">${DAYS.map(([d, l]) => `<button class="chip ${SCHEDULE && (SCHEDULE[d] || []).length ? 'on' : ''}" data-day="${d}">${l}</button>`).join('')}</div>
          ${SCHEDULE ? '' : `<div class="d" style="margin-top:6px">${IS_ADMIN ? 'Chargement des jours…' : 'Modifiable avec un compte administrateur Home Assistant.'}</div>`}</div>
        <div class="setting"><div><div class="k">Lancer avant</div><div class="d">minutes avant le départ</div></div>${stepper('lead', ' min', 5, 5, 30)}</div>
        <div class="setting"><div><div class="k">Température</div></div>${stepper('target', '°C', 1, 18, 29)}</div>
        ${E.outside ? `<div class="setting"><div><div class="k">Chauffer si dehors moins de</div><div class="d">sinon on ne chauffe pas</div></div>${stepper('threshold', '°C', 1, -10, 25)}</div>` : ''}
        ${E.hot ? `<div class="setting"><div><div class="k">Rafraîchir si plus de</div><div class="d">l'été</div></div>${stepper('hot', '°C', 1, 20, 40)}</div>` : ''}
        ${E.summer ? `<div class="setting"><div><div class="k">Température en été</div></div>${stepper('summer', '°C', 1, 16, 24)}</div>` : ''}
        ${hasPresets() ? `<div class="setting" style="display:block"><div class="k" style="margin-bottom:8px">Dégivrage</div>
          <div class="seg hot">${(attr('defrost', 'options') || DEFROST).map((o) => `<button class="${val('defrost') === o ? 'on' : ''}" data-select="defrost" data-opt="${esc(o)}">${esc(o.replace('Lunette arrière', 'Lunette AR').replace('Avant + arrière', 'Avant + AR'))}</button>`).join('')}</div></div>` : ''}
      </section>
      ${needsPlannerUpgrade() && IS_ADMIN ? `<section class="card summary off"><h2>Préchauffage malin</h2>
        <p>Ajoute le <strong>mode été</strong> (clim fraîche s'il fait chaud) et le <strong>dégivrage « Auto »</strong> (seulement s'il gèle).</p>
        <button class="btn warm" data-act="upgrade-plan" style="margin-top:10px">Activer</button>
        <p class="small">Met à jour ton automatisation de préchauffage dans Home Assistant, en gardant tes réglages.${defaultPhone() || alertsPrefs().phone ? ` Notification sur ${esc(phoneName(alertsPrefs().phone || defaultPhone()))}.` : ''}</p></section>` : ''}`;
    }
    return `
      <section class="card">
        <h2>Clim maintenant ${on ? '<span class="pill o">🔥 En marche</span>' : '<span class="pill">À l\'arrêt</span>'}</h2>
        <div class="grid3" style="margin-bottom:12px">
          <div class="stat"><div class="k">Consigne</div><div class="v">${fmt(temp)}<small>°C</small></div></div>
          <div class="stat"><div class="k">Dehors</div><div class="v">${ext !== null ? fmt(ext, 1) + '<small>°C</small>' : '—'}</div></div>
          <div class="stat"><div class="k">Habitacle</div><div class="v">${has('cabin') ? fmt(num('cabin'), 1) + '<small>°C</small>' : '—'}</div></div>
        </div>
        <div class="row"><button class="btn warm" data-act="heat-now">▶ Lancer</button><button class="btn" data-act="heat-stop">■ Arrêter</button></div>
        <div class="setting" style="margin-top:6px"><div><div class="k">Température</div><div class="d">Réglage direct de la clim</div></div>
          <div class="stepper" style="gap:6px"><button data-clim-temp="-1">−</button><span class="val" style="min-width:56px">${fmt(temp)}°</span><button data-clim-temp="1">+</button></div></div>
        ${presets.length ? `<div style="margin-top:4px"><div class="small muted" style="margin-bottom:4px">Dégivrage</div>
          <div class="seg">${presets.map((p) => `<button class="${p === preset ? 'on' : ''}" data-preset="${esc(p)}">${PRESET_LABEL[p] || esc(p)}</button>`).join('')}</div></div>` : ''}
      </section>
      ${plan}
      ${seats || E.wheel ? `<section class="card"><h2>Sièges & volant</h2>
        <div class="grid2">${seatSeg('seatD', 'Conducteur')}${seatSeg('seatP', 'Passager')}${seatSeg('seatRD', 'Arrière gauche')}${seatSeg('seatRP', 'Arrière droit')}</div>
        ${E.wheel ? `<div class="setting" style="margin-top:8px;border-top:1px solid var(--line)"><div class="k">🔥 Volant chauffant</div>
          <label class="switch"><input type="checkbox" data-toggle="wheel" ${val('wheel') === 'on' ? 'checked' : ''}><span></span></label></div>` : ''}
      </section>` : ''}`;
  }

  function viewCharge() {
    const s = val('charge');
    const hasSched = attr('charge', 'has_charging_schedule');
    const sStart = attr('charge', 'scheduled_charging_start'), sEnd = attr('charge', 'scheduled_charging_end');
    const left = num('chargeLeft');
    const batt = num('batt');
    const cap = num('capacity');
    const toFull = batt !== null && cap ? ((100 - batt) / 100 * cap / 0.9) : null;
    const tariff = E.tariff && STATES[E.tariff] ? STATES[E.tariff].state : null;
    const km = num('statMonth');
    const conso = km !== null && km >= 20 && num('kwhMonth', 0) > 0 ? num('kwhMonth') / km * 100 : null;
    const eur100 = km !== null && km >= 20 && num('costMonth', 0) > 0 ? num('costMonth') / km * 100 : null;
    const editablePrice = E.priceKwh && E.priceKwh.includes('chrplus');
    const costs = costReady() ? `
      <section class="card"><h2>Ce que ça coûte</h2>
        <div class="grid2">
          <div class="stat"><div class="k">Ce mois</div><div class="v">${fmt(num('costMonth'), 2)}<small> €</small></div><div class="small muted">${fmt(num('kwhMonth'), 1)} kWh</div></div>
          <div class="stat"><div class="k">Dernière recharge</div><div class="v">${fmt(num('costLast'), 2)}<small> €</small></div><div class="small muted">${fmt(num('kwhLast'), 1)} kWh</div></div>
          ${conso !== null ? `<div class="stat"><div class="k">Consommation</div><div class="v">${fmt(conso, 1)}<small> kWh/100</small></div><div class="small muted">ce mois, à la prise</div></div>` : ''}
          ${eur100 !== null ? `<div class="stat"><div class="k">Coût aux 100 km</div><div class="v">${fmt(eur100, 2)}<small> €</small></div><div class="small muted">${fmt(km)} km ce mois</div></div>` : ''}
          ${E.savings ? `<div class="stat" style="grid-column:1/-1"><div class="k">Économisé en heures creuses ce mois</div><div class="v" style="color:var(--acc)">${fmt(num('savings'), 2)}<small> €</small></div></div>` : ''}
        </div>
        ${editablePrice
          ? (E.priceHc
            ? `<div class="setting" style="margin-top:6px"><div><div class="k">Prix heures pleines</div><div class="d">€/kWh</div></div>${stepper('priceKwh', ' €', 0.01, 0, 2, 2)}</div>
               <div class="setting"><div><div class="k">Prix heures creuses</div><div class="d">€/kWh</div></div>${stepper('priceHc', ' €', 0.01, 0, 2, 2)}</div>`
            : `<div class="setting" style="margin-top:6px"><div><div class="k">Prix du kWh</div><div class="d">ton tarif de recharge</div></div>${stepper('priceKwh', ' €', 0.01, 0, 2, 2)}</div>`)
          : line('Prix du kWh (dernière charge)', `${fmt(num('priceKwh'), 4)} €`)}
        <div class="setting"><div><div class="k">Capacité batterie</div><div class="d">utile, en kWh</div></div>${stepper('capacity', '', 1, 10, 150)}</div>
        ${needsCostUpgrade() && IS_ADMIN ? `<button class="btn warm" data-act="install-costs" style="margin-top:8px">${E.tariff && !E.priceHc ? 'Activer les prix heures pleines / creuses' : 'Mettre à jour le suivi des coûts'}</button>` : ''}
        <p class="small muted" style="margin:6px 0 0">Estimé d'après le % gagné et ~10 % de pertes.</p>
      </section>` : installCard('Suivi des coûts', "Calcule l'énergie et le prix de chaque recharge, le total du mois et ta consommation aux 100 km." + (E.tariff ? ' Avec tes prix heures pleines / creuses.' : ''), 'install-costs');
    return `
      <section class="card"><h2>Recharge ${chargePill()}</h2>
        <div class="hero">
          <div class="ring">${ring(batt, s === 'charging' ? '#3DDC97' : '#5AB8FF')}<div class="lbl"><div class="pct">${fmt(batt)}%</div><div class="cap">${fmt(num('range'))} km</div></div></div>
          <div>
            ${s === 'charging' ? `<div class="big">${left !== null ? (left >= 60 ? `${Math.floor(left / 60)} h ${String(Math.round(left % 60)).padStart(2, '0')}` : `${Math.round(left)} min`) : '—'}</div><div class="muted small">avant la fin</div>` : ''}
            ${hasSched && sStart ? `<div style="margin-top:8px"><div class="small muted">Charge programmée</div><div style="font-weight:700;font-size:18px">${hhmm(new Date(sStart))} → ${sEnd ? hhmm(new Date(sEnd)) : '?'}</div><div class="small muted">${esc(attr('charge', 'scheduled_charging_duration') || '')}</div></div>` : '<div class="muted small">Pas de charge programmée dans la voiture</div>'}
          </div></div>
        ${tariff ? line('Tarif en ce moment', `<span class="pill ${new RegExp(HC_REGEX, 'i').test(tariff) ? 'g' : 'r'}">${esc(tariff)}</span>`) : ''}
        ${toFull !== null ? line('Pour faire le plein (≈)', `${fmt(toFull, 1)} kWh`) : ''}
        ${E.refreshElec ? '<button class="btn" data-act="refresh-elec" style="margin-top:8px">⟳ Actualiser l\'état de charge</button>' : ''}
      </section>
      ${costs}
      ${historyCard()}
      <section class="card"><h2>Batterie sur 7 jours</h2>${lineChart(CHART.batt)}</section>`;
  }

  function viewTrips() {
    const score = (r) => { const s = attr(r, 'Hybrid_score'); return s !== undefined && s !== null ? `${Math.round(s)}/100` : '—'; };
    const dur = (r) => esc(attr(r, 'Duration') || '—');
    return `
      <section class="card"><h2>Kilomètres ${E.refreshTrips ? '<button class="pill" data-act="refresh-trips">⟳</button>' : ''}</h2>
        <div class="grid2">
          <div class="stat"><div class="k">Aujourd'hui</div><div class="v">${fmt(num('statDay'), 1)}<small> km</small></div></div>
          <div class="stat"><div class="k">Cette semaine</div><div class="v">${fmt(num('statWeek'))}<small> km</small></div></div>
          <div class="stat"><div class="k">Ce mois</div><div class="v">${fmt(num('statMonth'))}<small> km</small></div></div>
          <div class="stat"><div class="k">Cette année</div><div class="v">${fmt(num('statYear'))}<small> km</small></div></div>
        </div></section>
      <section class="card"><h2>Conduite</h2>
        ${line("Aujourd'hui", `${dur('statDay')} · score ${score('statDay')}`)}
        ${line('Semaine', `${dur('statWeek')} · score ${score('statWeek')}`)}
        ${line('Mois', `${dur('statMonth')} · score ${score('statMonth')}`)}
        ${E.speedWeek ? line('Vitesse moyenne (semaine)', `${fmt(num('speedWeek'))} km/h`) : ''}
        ${E.odo ? line('Compteur', `${fmt(num('odo'))} km`) : ''}
      </section>
      <section class="card"><h2>Km par jour · 30 jours</h2>${barChart(CHART.km)}</section>`;
  }

  // ---------- Réglages ----------
  async function showSetup() {
    $('#tabs').style.display = 'none';
    const connected = connState === 'ok' && discovered;
    $('#view').innerHTML = `
      <div class="card setup">
        <div class="title">Connexion à Home Assistant</div>
        <label>Adresse de Home Assistant
          <input type="url" id="cfg-url" placeholder="https://xxxxxxxx.ui.nabu.casa" value="${esc(cfg.url)}" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
        <div class="help">Adresse Nabu Casa (Paramètres → Home Assistant Cloud) ou ta propre adresse. À la maison, l'adresse locale marche aussi.</div>
        <label>Jeton d'accès longue durée
          <input type="password" id="cfg-token" placeholder="eyJ0eXAiOi…" value="${esc(cfg.token)}" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
        <div class="help">Dans Home Assistant : ton profil → Sécurité → Jetons d'accès longue durée → Créer. Il reste uniquement sur ce téléphone.</div>
        <button class="btn acc" id="cfg-save">${cfg.url ? 'Enregistrer' : 'Se connecter'}</button>
      </div>
      ${connected ? `<div class="card setup" id="cfg-more"><div class="title">Ma voiture et ma maison</div><div class="help">Chargement…</div></div>` : ''}
      ${cfg.url ? `<div class="card setup">${cfg.url && connected ? '' : ''}<button class="btn" id="cfg-cancel">Retour</button>
        <button class="btn danger" id="cfg-clear">Effacer la connexion</button>
        <div class="help center">CHR+ · appli non officielle, sans lien avec Toyota</div></div>` : ''}`;
    $('#cfg-save').onclick = saveSetup;
    const c = $('#cfg-cancel'); if (c) c.onclick = hideSetup;
    const x = $('#cfg-clear'); if (x) x.onclick = () => { cfg.clear(); wantConnected = false; if (ws) { try { ws.close(); } catch (e) { } } ws = null; STATES = {}; discovered = false; CAR = null; showSetup(); };
    if (connected) fillMoreSettings();
  }
  async function fillMoreSettings() {
    let states = [];
    try { states = await send({ type: 'get_states' }); } catch (e) { }
    const temps = states.filter((s) => s.entity_id.startsWith('weather.') || (s.entity_id.startsWith('sensor.') && s.attributes && s.attributes.device_class === 'temperature'))
      .map((s) => [s.entity_id, (s.attributes.friendly_name || s.entity_id) + (s.entity_id.startsWith('weather.') ? ' (météo)' : ` (${s.state} °C)`)]);
    const textSensors = states.filter((s) => s.entity_id.startsWith('sensor.') && isNaN(parseFloat(s.state)) && !['unknown', 'unavailable'].includes(s.state)
      && /tarif|price|prix|ptec|ltarf|period|hc|hp|tempo/i.test(s.entity_id + ' ' + (s.attributes.friendly_name || '')))
      .map((s) => [s.entity_id, `${s.attributes.friendly_name || s.entity_id} (${s.state})`]);
    const opt = (list, cur, none) => `<option value="">${none}</option>` + list.map(([id, l]) => `<option value="${esc(id)}" ${id === cur ? 'selected' : ''}>${esc(l)}</option>`).join('');
    const box = $('#cfg-more'); if (!box) return;
    box.innerHTML = `<div class="title">Ma voiture et ma maison</div>
      ${CARS.length > 1 ? `<label>Voiture<select id="cfg-car">${CARS.map((c, i) => `<option value="${esc(c.di)}" ${c === CAR ? 'selected' : ''}>${esc(carName(c))} (${i + 1})</option>`).join('')}</select></label>` : `<div class="help">Voiture : <strong>${esc(carName(CAR))}</strong>${CAR ? '' : ' — aucune trouvée'}</div>`}
      <label>Nom de la voiture<input type="text" id="cfg-carname" maxlength="20" placeholder="${esc(carName(CAR))}" value="${esc(LS.get('carName'))}"></label>
      <div class="row"><button class="btn" data-act="photo">📷 Changer la photo</button>${LS.get('photo') ? '<button class="btn danger" data-act="photo-remove">Retirer</button>' : ''}</div>
      ${LS.get('photo') ? '<div class="row"><button class="btn" data-act="photo-up">▲ Cadrer plus haut</button><button class="btn" data-act="photo-down">▼ Plus bas</button></div>' : ''}
      ${A() && A().canAuthenticate() ? `<div class="setting"><div><div class="k">Empreinte avant de déverrouiller</div><div class="d">ou le code du téléphone</div></div>
        <label class="switch"><input type="checkbox" id="cfg-bio" ${LS.get('bio', '1') === '1' ? 'checked' : ''}><span></span></label></div>` : ''}
      <label>Température extérieure<select id="cfg-outside">${opt(temps, E.outside, '— aucune —')}</select></label>
      <div class="help">Sert au planificateur : la clim ne se lance que s'il fait plus froid que le seuil.</div>
      <label>Tarif électrique en cours (facultatif)<select id="cfg-tariff">${opt(textSensors, E.tariff, '— aucun —')}</select></label>
      <div class="help">Par ex. heures pleines / heures creuses d'un capteur Linky.</div>
      <button class="btn acc" id="cfg-more-save">Enregistrer</button>
      ${!IS_ADMIN ? '<div class="help">Connecté avec un compte non administrateur : l\'installation du planificateur et du suivi des coûts n\'est pas possible.</div>' : ''}`;
    $('#cfg-more-save').onclick = () => {
      const car = $('#cfg-car'); if (car) LS.set('car', car.value);
      LS.set('carName', $('#cfg-carname').value.trim() || null);
      const bio = $('#cfg-bio'); if (bio) LS.set('bio', bio.checked ? '1' : '0');
      LS.set('outside', $('#cfg-outside').value || '');
      LS.set('tariff', $('#cfg-tariff').value || '');
      CAR = CARS.find((c) => c.di === LS.get('car')) || CARS[0] || null;
      resolveRoles(); subscribe(); loadSchedule(); loadCharts(true); pushWidgetConfig(); pushWidget();
      toast('Réglages enregistrés'); hideSetup();
    };
  }
  function saveSetup() {
    const url = cleanUrl($('#cfg-url').value);
    const token = $('#cfg-token').value.trim();
    if (!/^https?:\/\/.+/i.test(url)) { toast("L'adresse doit commencer par https://", true); return; }
    if (token.length < 20) { toast('Colle le jeton complet', true); return; }
    const changed = url !== cfg.url || token !== cfg.token;
    cfg.save(url, token);
    hideSetup();
    if (changed || connState !== 'ok') {
      if (ws) { wantConnected = false; const old = ws; ws = null; try { old.close(); } catch (e) { } }
      connState = 'idle'; discovered = false; STATES = {};
      connect();
    }
  }
  function hideSetup() { $('#tabs').style.display = ''; $('#view').innerHTML = ''; scheduleRender(); }

  // ---------- Réveil de la voiture (coûte de la batterie 12 V) ----------
  // Un seul quota pour TOUS les boutons d'actualisation (état, charge, trajets) : au plus un réveil toutes les 30 min.
  const WAKE_COOLDOWN = 30 * 60000;
  const WAKE_ROLES = ['refresh', 'refreshElec', 'refreshTrips'];
  let lastWakeLocal = 0;
  function lastWakeAt() {
    // L'état d'un bouton = date du dernier appui (appli, HA ou automatisation) ; on garde le plus récent de tous.
    return WAKE_ROLES.reduce((m, r) => { const t = E[r] ? Date.parse(val(r) || '') : NaN; return isNaN(t) ? m : Math.max(m, t); }, lastWakeLocal);
  }
  function wakeCar(role) {
    if (!E[role]) return Promise.resolve();
    const ago = Date.now() - lastWakeAt();
    if (ago < WAKE_COOLDOWN) {
      toast(`Voiture déjà interrogée il y a ${Math.max(1, Math.round(ago / 60000))} min : pas de nouveau réveil (batterie 12 V)`);
      return Promise.resolve();
    }
    lastWakeLocal = Date.now();                       // bloque aussi les doubles appuis avant le retour de HA
    return quiet(callService('button', 'press', E[role], null, 'Actualisation demandée à la voiture'));
  }

  // ---------- Actions ----------
  const timers = {};
  function heatNow() {
    const ext = outsideTemp();
    const summer = E.hot && E.summer && ext !== null && ext >= num('hot', 99);
    const t = summer ? num('summer', 20) : (E.target ? num('target', 21) : (attr('climate', 'temperature') || 21));
    const p = [callService('climate', 'set_temperature', E.climate, { temperature: t })];
    if (hasPresets() && (E.defrost || summer)) {
      const d = val('defrost');
      const preset = summer ? 'none' : d === 'Auto' ? (ext !== null && ext <= 1 ? 'both_defrost' : 'none') : (DEFROST_PRESET[d] || 'none');
      p.push(quiet(callService('climate', 'set_preset_mode', E.climate, { preset_mode: preset })));
    }
    Promise.all(p).then(() => callService('climate', 'set_hvac_mode', E.climate, { hvac_mode: hvacOn() },
      summer ? `Clim lancée à ${t} °C ❄️` : 'Préchauffage lancé 🔥')).catch(() => { });
  }
  function onClick(e) {
    const b = e.target.closest('button, [data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const q = (p) => quiet(p);
    if (act === 'settings') { showSetup(); return; }
    if (act === 'rediscover') { discover(); return; }
    if (act === 'photo') { $('#photo-input').value = ''; $('#photo-input').click(); return; }
    if (act === 'photo-remove') { LS.set('photo', null); toast('Photo retirée'); scheduleRender(); return; }
    if (act === 'photo-up' || act === 'photo-down') {
      const y = Math.max(0, Math.min(100, (+LS.get('photoY', '55')) + (act === 'photo-up' ? -10 : 10)));
      LS.set('photoY', String(y)); toast('Cadrage ajusté'); return;
    }
    if (act === 'lock') q(callService('lock', 'lock', E.lock, null, 'Verrouillage envoyé'));
    else if (act === 'unlock') confirmSecure('Déverrouiller la voiture', () => q(callService('lock', 'unlock', E.lock, null, 'Déverrouillage envoyé')));
    else if (act === 'horn') { if (confirm('Klaxonner ?')) q(callService('button', 'press', E.horn, null, 'Klaxon envoyé')); }
    else if (act === 'hazard') q(callService('switch', 'toggle', E.hazard, null, 'Warnings envoyés'));
    else if (act === 'heat-now') heatNow();
    else if (act === 'heat-stop') q(callService('climate', 'set_hvac_mode', E.climate, { hvac_mode: 'off' }, 'Arrêt de la clim envoyé'));
    else if (act === 'refresh-elec') wakeCar('refreshElec');
    else if (act === 'refresh-trips') { wakeCar('refreshTrips'); loadCharts(true); }
    else if (act === 'install-plan') { b.disabled = true; installPlanner(); }
    else if (act === 'install-costs') { b.disabled = true; installCosts(); }
    else if (act === 'install-alerts') { b.disabled = true; installAlerts().finally(() => { b.disabled = false; }); }
    else if (act === 'upgrade-plan') { b.disabled = true; upgradePlanner(); }

    if (b.dataset.step) {
      const role = b.dataset.step, id = E[role];
      const stepv = +b.dataset.d;
      const dec = Math.abs(stepv) < 1 ? 4 : 0;
      const nv = +Math.max(+b.dataset.min, Math.min(+b.dataset.max, num(role, 0) + stepv)).toFixed(dec);
      if (STATES[id]) STATES[id].state = String(nv);
      scheduleRender();
      clearTimeout(timers[role]);
      timers[role] = setTimeout(() => q(callService('input_number', 'set_value', id, { value: nv })), 500);
    }
    if (b.dataset.select) {
      const role = b.dataset.select, id = E[role], opt = b.dataset.opt;
      if (STATES[id]) STATES[id].state = opt;
      scheduleRender();
      q(callService(id.split('.')[0], 'select_option', id, { option: opt }));
    }
    if (b.dataset.preset) q(callService('climate', 'set_preset_mode', E.climate, { preset_mode: b.dataset.preset }, 'Dégivrage envoyé'));
    if (b.dataset.climTemp) {
      const t = Math.max(18, Math.min(29, (attr('climate', 'temperature') || 21) + (+b.dataset.climTemp)));
      const s = STATES[E.climate]; if (s) s.attributes = Object.assign({}, s.attributes, { temperature: t });
      scheduleRender();
      clearTimeout(timers.clim);
      timers.clim = setTimeout(() => q(callService('climate', 'set_temperature', E.climate, { temperature: t }, `Consigne ${t} °C envoyée`)), 600);
    }
    if (b.dataset.day) toggleDay(b.dataset.day);
  }
  function onChange(e) {
    const t = e.target;
    if (t.dataset.toggle) {
      const id = E[t.dataset.toggle];
      if (STATES[id]) STATES[id].state = t.checked ? 'on' : 'off';
      quiet(callService(id.split('.')[0], t.checked ? 'turn_on' : 'turn_off', id, null, t.checked ? 'Activé' : 'Désactivé'));
      scheduleRender();
    }
    if (t.dataset.alert) setAlertsPref(t.dataset.alert, t.checked);
    if (t.id === 'alert-phone') setAlertsPref('phone', t.value);
    if (t.id === 'depart-time' && t.value) {
      t.blur();
      quiet(callService('input_datetime', 'set_datetime', E.depart, { time: t.value + ':00' }, `Départ réglé à ${t.value}`));
    }
  }

  // ---------- Démarrage ----------
  function init() {
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    $('#btn-settings').onclick = showSetup;
    $('#photo-input').addEventListener('change', (e) => onPhotoPicked(e.target.files && e.target.files[0]));
    $('#btn-refresh').onclick = () => {
      const b = $('#btn-refresh');
      b.innerHTML = '<span class="spin">⟳</span>';
      wakeCar('refresh').finally(() => setTimeout(() => (b.textContent = '⟳'), 1500));
      loadSchedule(); loadCharts(true);
    };
    $('#tabs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-tab]'); if (!b) return;
      setTab(b.dataset.tab);
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) window.chrResume(); });
    setInterval(() => { if (connState === 'ok') scheduleRender(); }, 30000);
    try { const pa = A() && A().takePendingAction(); if (pa) pendingShortcut = pa; } catch (e) { }
    if (!cfg.url || !cfg.token) showSetup(); else { loadCache(); scheduleRender(); connect(); }
  }
  function setTab(t) {
    tab = t;
    document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x.dataset.tab === t));
    window.scrollTo(0, 0); scheduleRender();
  }
  // Raccourcis (appui long sur l'icône) : chrplus://heat, lock, refresh
  window.chrShortcut = function (action) {
    if (connState !== 'ok' || !discovered || fromCache || !REGISTRY) { pendingShortcut = action; return; }
    pendingShortcut = null;
    if (action === 'heat' && E.climate) { setTab('prechauffage'); heatNow(); }
    else if (action === 'lock' && E.lock) quiet(callService('lock', 'lock', E.lock, null, 'Verrouillage envoyé 🔒'));
    else if (action === 'refresh') $('#btn-refresh').click();
  };
  window.chrResume = function () {
    if (!cfg.url || !cfg.token || $('.setup')) return;
    if (!ws || ws.readyState > 1) { retry = 0; connect(); } else loadCharts();
  };
  window.chrBack = function () {
    if ($('.setup') && cfg.url && cfg.token) { hideSetup(); return true; }
    if (tab !== 'voiture') { $('#tabs button[data-tab="voiture"]').click(); return true; }
    return false;
  };
  init();
})();
