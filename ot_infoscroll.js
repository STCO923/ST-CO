// ═══════════════════════════════════════════════════════════════════
// T SERVICE & CO — ot_infoscroll.js v1.2
// Barre d'informations défilantes + Cloche de notifications
//
// Fonctionnalités :
//   • Barre défilante (météo, prix gazole, alertes véhicules, date)
//   • Cloche de notifications (CT, assurance) dans la topbar
//
// À inclure en bas de toutes les pages authentifiées :
//   <script src="/ot_infoscroll.js"></script>
// ═══════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ─── Constantes ──────────────────────────────────────────────────
  const SB  = 'https://kfdyqcbclueppmvkccdz.supabase.co';
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmZHlxY2JjbHVlcHBtdmtjY2R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMjAxNTQsImV4cCI6MjA5NDc5NjE1NH0.gj0eT27HcdkPw6fTZRBbSflVv5Yh1SPA9o8vAAiX_CU';

  // ─── CSS ─────────────────────────────────────────────────────────
  const CSS = `
    /* ── Barre défilante ─────────────────────────────────── */
    .ot-is-bar {
      height: 28px;
      background: linear-gradient(90deg, #0d1f3e 0%, #0A1628 100%);
      border-bottom: 1px solid rgba(245,166,35,0.18);
      display: flex;
      align-items: stretch;
      overflow: hidden;
      position: sticky;
      top: 60px;
      z-index: 48;
      user-select: none;
      flex-shrink: 0;
    }
    @media (max-width: 768px) {
      .ot-is-bar { position: sticky; top: 52px; z-index: 48; }
    }
    .ot-is-label {
      flex-shrink: 0;
      padding: 0 10px;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 2.5px;
      text-transform: uppercase;
      color: #F5A623;
      border-right: 1px solid rgba(245,166,35,0.2);
      display: flex;
      align-items: center;
      gap: 5px;
      background: rgba(245,166,35,0.07);
      white-space: nowrap;
    }
    .ot-is-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: #F5A623;
      animation: ot-blink 1.6s ease-in-out infinite;
    }
    @keyframes ot-blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
    .ot-is-track {
      flex: 1;
      overflow: hidden;
      display: flex;
      align-items: center;
      mask-image: linear-gradient(to right, transparent 0%, black 2%, black 98%, transparent 100%);
      -webkit-mask-image: linear-gradient(to right, transparent 0%, black 2%, black 98%, transparent 100%);
    }
    .ot-is-inner {
      display: inline-flex;
      align-items: center;
      white-space: nowrap;
      will-change: transform;
      animation: ot-ticker 60s linear infinite;
      font-size: 11px;
      color: #c8d5e8;
    }
    .ot-is-inner:hover { animation-play-state: paused; }
    @keyframes ot-ticker {
      0%   { transform: translateX(0); }
      100% { transform: translateX(-50%); }
    }
    .ot-is-item {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 0 18px;
    }
    .ot-is-item.urgent { color: #fc8181; font-weight: 600; }
    .ot-is-item.warn   { color: #fbbf24; }
    .ot-is-sep { color: rgba(245,166,35,0.4); padding: 0 2px; font-size: 7px; }

    /* ── Cloche ─────────────────────────────────────────── */
    .ot-nb-wrap {
      position: relative;
      display: inline-flex;
      align-items: center;
    }
    .ot-nb-btn {
      width: 36px; height: 36px;
      background: rgba(245,166,35,0.1);
      border: 1px solid rgba(245,166,35,0.3);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 17px;
      transition: border-color .2s, background .2s, transform .15s;
      position: relative;
      -webkit-tap-highlight-color: transparent;
    }
    .ot-nb-btn:hover {
      border-color: rgba(245,166,35,0.65);
      background: rgba(245,166,35,0.18);
      transform: translateY(-1px);
    }
    .ot-nb-badge {
      position: absolute;
      top: -6px; right: -6px;
      background: #E74C3C;
      color: #fff;
      font-size: 9px;
      font-weight: 700;
      min-width: 17px; height: 17px;
      padding: 0 3px;
      border-radius: 9px;
      display: none;
      align-items: center;
      justify-content: center;
      border: 2px solid #0F2040;
      line-height: 1;
    }
    .ot-nb-badge.on { display: flex; }
    .ot-nb-badge.pulse { animation: ot-pulse 2s ease-in-out infinite; }
    @keyframes ot-pulse {
      0%,100% { box-shadow: 0 0 0 0 rgba(231,76,60,0.5); }
      50%      { box-shadow: 0 0 0 5px rgba(231,76,60,0); }
    }

    /* ── Panneau notifications ──────────────────────────── */
    .ot-nb-panel {
      position: absolute;
      top: calc(100% + 10px);
      right: 0;
      width: 330px;
      background: #0F2040;
      border: 1px solid rgba(255,255,255,0.09);
      border-radius: 14px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.6);
      z-index: 500;
      overflow: hidden;
      display: none;
    }
    .ot-nb-panel.open {
      display: block;
      animation: ot-panel-in .15s ease;
    }
    @keyframes ot-panel-in {
      from { opacity:0; transform:translateY(-8px) scale(.97); }
      to   { opacity:1; transform:translateY(0)    scale(1);   }
    }
    .ot-nb-head {
      padding: 13px 16px 10px;
      border-bottom: 1px solid rgba(255,255,255,0.07);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .ot-nb-head-title {
      font-family: 'Bebas Neue', sans-serif;
      font-size: 15px;
      letter-spacing: 2px;
      color: #fff;
    }
    .ot-nb-head-count { font-size: 10px; color: #8A9BB5; }
    .ot-nb-list { max-height: 370px; overflow-y: auto; }
    .ot-nb-list::-webkit-scrollbar { width: 4px; }
    .ot-nb-list::-webkit-scrollbar-track { background: transparent; }
    .ot-nb-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius:2px; }
    .ot-nb-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      cursor: pointer;
      transition: background .18s;
      text-decoration: none;
      color: inherit;
    }
    .ot-nb-item:last-child { border-bottom: none; }
    .ot-nb-item:hover { background: rgba(255,255,255,0.04); }
    .ot-nb-item-icon {
      width: 32px; height: 32px;
      border-radius: 9px;
      display: flex; align-items: center; justify-content: center;
      font-size: 15px; flex-shrink: 0;
    }
    .ot-nb-item-icon.red    { background: rgba(231,76,60,0.18); }
    .ot-nb-item-icon.orange { background: rgba(245,166,35,0.18); }
    .ot-nb-item-body { flex: 1; min-width: 0; }
    .ot-nb-item-title { font-size: 12px; font-weight: 600; color: #e8edf5; line-height: 1.35; }
    .ot-nb-item-sub   { font-size: 10px; color: #8A9BB5; margin-top: 2px; }
    .ot-nb-item-tag {
      font-size: 9px; font-weight: 700;
      padding: 2px 6px; border-radius: 4px;
      white-space: nowrap; flex-shrink: 0; align-self: flex-start; margin-top: 2px;
    }
    .ot-nb-item-tag.red    { background: rgba(231,76,60,0.2);  color: #fc8181; }
    .ot-nb-item-tag.orange { background: rgba(245,166,35,0.2); color: #fbbf24; }
    .ot-nb-empty {
      text-align: center; padding: 28px 16px;
      color: #8A9BB5; font-size: 12px;
    }
    .ot-nb-empty-icon { font-size: 28px; margin-bottom: 6px; }
    .ot-nb-footer {
      padding: 10px 16px;
      border-top: 1px solid rgba(255,255,255,0.07);
      text-align: center;
    }
    .ot-nb-footer a { font-size: 11px; color: #1A4FBF; text-decoration: none; font-weight: 600; }
    .ot-nb-footer a:hover { color: #F5A623; }

    @media (max-width: 768px) {
      .ot-nb-panel { right: -8px; width: calc(100vw - 32px); max-width: 330px; }
    }

    /* ═══════════════════════════════════════════════════════════════
       LAYOUT GLOBAL — Ajustements pour affichage 100% viewport
       Corrige le débordement horizontal sur tous les écrans
    ═══════════════════════════════════════════════════════════════ */

    /* ── Correction fondamentale : les items de grille doivent
          pouvoir rétrécir sous leur contenu naturel ──────────── */
    .kpi-grid > *,
    .kpi-row  > *,
    .two-col  > *,
    .three-col > *,
    .quick-actions > * {
      min-width: 0;
    }

    /* ── Planning : scroll horizontal (toutes tailles d'écran) ─ */
    .planning-wrap {
      overflow-x: auto !important;
      overflow-y: hidden;
    }
    .planning-table {
      min-width: 860px !important;
      width: max-content;
    }

    /* ── Tableaux génériques (toutes tailles d'écran) ─────────── */
    .table-wrap { overflow-x: auto !important; }

    /* ── Topbar-right : ne pas déborder sur small screens ────── */
    .topbar-right {
      overflow-x: auto;
      flex-shrink: 1;
      min-width: 0;
    }

    /* ── Conteneur principal : pas de scroll horizontal page ─── */
    .main {
      max-width: 100%;
      overflow-x: hidden;
    }

    @media (min-width: 769px) {

      /* ── Sidebar plus compacte (240 → 215 px) ─────────────── */
      :root        { --sidebar-w: 215px; }
      .sidebar     { width: 215px !important; }
      .main        { margin-left: 215px !important; overflow-x: hidden; }
      .sidebar-logo  { padding: 16px 14px !important; }
      .logo-name     { font-size: 24px !important; }
      .logo-tag      { font-size: 8px !important; }
      .sidebar-nav   { padding: 12px 8px !important; }
      .sidebar-footer{ padding: 12px 8px !important; }
      .nav-item      { padding: 8px 10px !important; font-size: 12.5px !important; }
      .user-name     { font-size: 11px !important; }
      .user-role     { font-size: 9px  !important; }
      .nav-icon      { font-size: 15px !important; }

      /* ── Topbar & contenu (28 px → 20 px) ─────────────────── */
      .topbar  { padding: 0 20px !important; }
      .content { padding: 20px  !important; }

      /* ── KPI grids → colonnes adaptatives ─────────────────── */
      .kpi-grid,
      .kpi-row {
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)) !important;
        gap: 12px !important;
      }
      .kpi { padding: 14px 16px !important; }

      /* ── Quick actions → adaptatives ──────────────────────── */
      .quick-actions {
        grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)) !important;
        gap: 10px !important;
      }

      /* ── Grilles 2-col / 3-col : réduire les gaps ─────────── */
      .two-col   { gap: 16px !important; }
      .three-col { gap: 16px !important; }

      /* ── Barre infoscroll : repositionnement ───────────────── */
      .ot-is-bar { top: 60px !important; }
    }
  `;

  // ─── Session ──────────────────────────────────────────────────────
  function getSession() {
    try {
      const raw = localStorage.getItem('ot_session') || sessionStorage.getItem('ot_session');
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function authH() {
    const s = getSession();
    const tok = (s && s.token) ? s.token : KEY;
    return { 'apikey': KEY, 'Authorization': 'Bearer ' + tok };
  }
  function isDemo() {
    const s = getSession();
    if (!s) return true;
    const cid = s.company_id || s.id;
    return !cid || cid === 'demo';
  }

  // ─── Inject CSS ────────────────────────────────────────────────
  function injectCSS() {
    if (document.getElementById('ot-is-css')) return;
    const el = document.createElement('style');
    el.id = 'ot-is-css';
    el.textContent = CSS;
    document.head.appendChild(el);
  }

  // ─── Météo — open-meteo.com (gratuit, sans clé) ────────────────
  async function fetchMeteo() {
    try {
      const url = 'https://api.open-meteo.com/v1/forecast' +
        '?latitude=48.85&longitude=2.35' +
        '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation' +
        '&wind_speed_unit=kmh&timezone=Europe%2FParis&forecast_days=1';
      const r = await fetch(url);
      if (!r.ok) return null;
      const d = await r.json();
      const c = d.current;

      const icons = {0:'☀️',1:'🌤',2:'⛅',3:'☁️',45:'🌫',48:'🌫',51:'🌦',53:'🌧',55:'🌧',
        61:'🌧',63:'🌧',65:'🌧',71:'❄️',73:'❄️',75:'❄️',77:'🌨',80:'🌦',81:'🌧',82:'🌧',
        85:'🌨',86:'🌨',95:'⛈',96:'⛈',99:'⛈'};
      const descs = {0:'Dégagé',1:'Peu nuageux',2:'Partiellement nuageux',3:'Couvert',
        45:'Brouillard',48:'Brouillard givrant',51:'Bruine légère',53:'Bruine',55:'Bruine forte',
        61:'Pluie légère',63:'Pluie',65:'Pluie forte',71:'Neige légère',73:'Neige',75:'Neige forte',
        77:'Grésil',80:'Averses',81:'Averses modérées',82:'Averses violentes',
        85:'Averses de neige',86:'Averses de neige fortes',95:'Orage',96:'Orage + grêle',99:'Orage violent'};

      const code = c.weather_code;
      const ico  = icons[code]  || '🌡️';
      const desc = descs[code]  || 'Variable';
      const temp = Math.round(c.temperature_2m);
      const feel = Math.round(c.apparent_temperature);
      const wind = Math.round(c.wind_speed_10m);

      let alert = '', cls = '';
      if (code >= 95)                               { alert = ' — ⚠️ ALERTE ORAGE';          cls = 'urgent'; }
      else if (code >= 71 && code <= 77)            { alert = ' — ⚠️ RISQUE VERGLAS';        cls = 'urgent'; }
      else if (code >= 61 && code <= 65 && c.precipitation > 5) { alert = ' — ⚠️ FORTES PLUIES'; cls = 'warn'; }
      else if (wind > 60)                           { alert = ` — ⚠️ VENT ${wind} km/h`;    cls = 'warn'; }

      return { text: `${ico} Météo Paris : ${temp}°C (ressenti ${feel}°C) · ${desc} · Vent ${wind} km/h${alert}`, cls };
    } catch (e) { return null; }
  }

  // ─── Performance (CA & marge) ─────────────────────────────────────────────
  // Avant le 22 du mois → comparaison hebdomadaire (semaine en cours vs semaine
  // dernière complète) — plus juste en début de mois où le CA est forcément bas.
  // À partir du 22 → comparaison mensuelle classique (mois en cours vs mois précédent).
  async function fetchPerformance() {
    try {
      // Utiliser OT.companyFilter() si disponible (plus fiable que notre isDemo())
      const cf  = (typeof OT !== 'undefined') ? OT.companyFilter() : null;
      const s   = getSession();
      const cid = s && (s.company_id || s.id);
      if (!cid || cid === 'demo' || cf === '') return null;

      const today     = new Date();
      const fmt       = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

      const useWeekly = today.getDate() < 22;
      let curStart, curEnd, prevStart, prevEnd, periodLabel, prevLabel, prevArt;
      if (useWeekly) {
        const dow = today.getDay() === 0 ? 6 : today.getDay() - 1; // 0 = lundi
        const curMon  = new Date(today);  curMon.setDate(today.getDate() - dow);
        const prevMon = new Date(curMon); prevMon.setDate(curMon.getDate() - 7);
        const prevSun = new Date(curMon); prevSun.setDate(curMon.getDate() - 1);
        curStart  = fmt(curMon);
        curEnd    = fmt(today);
        prevStart = fmt(prevMon);
        prevEnd   = fmt(prevSun);
        periodLabel = 'Cette semaine';
        prevLabel   = 'semaine dernière';
        prevArt     = 'la';
      } else {
        const month = today.toLocaleDateString('fr-FR', { month: 'long' });
        curStart  = fmt(new Date(today.getFullYear(), today.getMonth(), 1));
        curEnd    = fmt(today);
        prevStart = fmt(new Date(today.getFullYear(), today.getMonth() - 1, 1));
        prevEnd   = fmt(new Date(today.getFullYear(), today.getMonth(), 0));
        periodLabel = month.charAt(0).toUpperCase() + month.slice(1);
        prevLabel   = 'mois dernier';
        prevArt     = 'le';
      }

      const base = `${SB}/rest/v1`;
      const h    = { headers: authH() };
      const fil  = `company_id=eq.${cid}`;

      // Si OT_FINANCE n'est pas dispo, on ne montre rien plutôt qu'un chiffre faux
      if (!window.OT_FINANCE) return null;

      // On fetche tout ce qu'il faut pour calculer CA + marge avec la MÊME
      // formule que la page Clients & Facturation (chauffeurs, gazole,
      // véhicules, maintenance, charges fixes entreprise).
      const tourneesSelect = 'id,client_nom,chauffeur_nom,date,vehicule,slot,nb_points_estime,nb_heures_estime,nb_points_reel,nb_heures_reel,heure_debut_estime,heure_fin_estime,heure_debut_reel,heure_fin_reel,code_postal_livraison,ville_livraison,zone_lines';
      // Charger OT_ZONE si l'addon zone est actif (sinon le mode 'zone' rend 0)
      if (typeof OT !== 'undefined' && OT.can && OT.can('zone_billing') && window.OT_ZONE) {
        try { await OT_ZONE.load(cid); } catch(e) {}
      }
      const [r1, r2, rC, rCh, rV, rG, rM, rE] = await Promise.all([
        fetch(`${base}/tournees?select=${tourneesSelect}&${fil}&date=gte.${curStart}&date=lte.${curEnd}&limit=5000`, h),
        fetch(`${base}/tournees?select=${tourneesSelect}&${fil}&date=gte.${prevStart}&date=lte.${prevEnd}&limit=5000`, h),
        fetch(`${base}/clients?${fil}&limit=2000`, h),
        fetch(`${base}/chauffeurs?${fil}&select=nom,type&limit=2000`, h),
        fetch(`${base}/vehicules?${fil}&select=immatriculation,assurance_mensuel,type_propriete,tarif_location&limit=2000`, h).catch(()=>({ok:false})),
        fetch(`${base}/gazole_pleins?${fil}&date=gte.${prevStart}&date=lte.${curEnd}&select=vehicule,montant,date&limit=5000`, h).catch(()=>({ok:false})),
        fetch(`${base}/maintenance_vehicules?${fil}&date_maintenance=gte.${prevStart}&date_maintenance=lte.${curEnd}&select=vehicule_immat,cout,date_maintenance&limit=5000`, h).catch(()=>({ok:false})),
        fetch(`${base}/entreprise?${fil}&limit=1`, h).catch(()=>({ok:false})),
      ]);

      if (!r1.ok || !r2.ok || !rC.ok || !rCh.ok) {
        console.warn('[OT perf] API error', r1.status, r2.status, rC.status, rCh.status);
        return null;
      }
      const curT  = await r1.json();
      const prevT = await r2.json();
      const clientsList = await rC.json();
      const chauffeursList = await rCh.json();
      const vehiculesList  = rV.ok ? await rV.json() : [];
      const gazoleAll      = rG.ok ? await rG.json() : [];
      const maintenanceAll = rM.ok ? await rM.json() : [];
      const entrepriseList = rE.ok ? await rE.json() : [];
      const entreprise = (Array.isArray(entrepriseList) && entrepriseList[0]) || {};

      // Filtre les pleins et la maintenance par période (champs de date différents)
      const inRange = (d, start, end) => d >= start && d <= end;
      const curGaz  = gazoleAll.filter(g => inRange(g.date, curStart, curEnd));
      const prevGaz = gazoleAll.filter(g => inRange(g.date, prevStart, prevEnd));
      const curMx   = maintenanceAll.filter(m => inRange(m.date_maintenance, curStart, curEnd));
      const prevMx  = maintenanceAll.filter(m => inRange(m.date_maintenance, prevStart, prevEnd));

      const curRep  = OT_FINANCE.computeReport({ clients:clientsList, tournees:curT,  chauffeurs:chauffeursList, vehicules:vehiculesList, gazole:curGaz,  maintenance:curMx,  entreprise, period:{start:curStart,  end:curEnd}  });
      const prevRep = OT_FINANCE.computeReport({ clients:clientsList, tournees:prevT, chauffeurs:chauffeursList, vehicules:vehiculesList, gazole:prevGaz, maintenance:prevMx, entreprise, period:{start:prevStart, end:prevEnd} });

      const curCA     = curRep.ca;
      const prevCA    = prevRep.ca;
      const curMarge  = curRep.marge;
      const prevMarge = prevRep.marge;

      // Pas de données du tout sur la période en cours
      if (curCA < 1) return null;

      // Période précédente sans données → afficher juste le CA en cours
      if (prevCA < 1) {
        const lbl = useWeekly ? 'cette semaine' : `en cours (${periodLabel})`;
        return { text: `📊 CA ${lbl} : ${curCA.toFixed(0)}€ — ${(curT||[]).length} tournée${(curT||[]).length>1?'s':''} saisies`, cls: '' };
      }

      const diffCA = curCA - prevCA;
      const pctCA  = ((diffCA / prevCA) * 100).toFixed(1);
      const sign   = diffCA >= 0 ? '+' : '';
      const periodWord     = useWeekly ? 'semaine'     : 'mois';
      const periodWordCap  = useWeekly ? 'Semaine'     : 'Mois';
      const thisPeriod     = useWeekly ? 'cette semaine' : 'ce mois';

      if (diffCA >= 0) {
        const msgs = [
          `📈 ${periodLabel} : CA ${curCA.toFixed(0)}€ (${sign}${pctCA}% vs ${prevLabel}) — Excellent, continuez sur cette lancée !`,
          `🚀 Belle ${periodWord} ! CA en hausse de ${sign}${pctCA}% — ${curCA.toFixed(0)}€ facturés jusqu'ici`,
          `💪 Performance en hausse : ${sign}${Math.abs(diffCA).toFixed(0)}€ de CA supplémentaire vs ${prevArt} ${prevLabel} — bravo !`,
          `⭐ Marge ${thisPeriod} : ${curMarge.toFixed(0)}€ vs ${prevMarge.toFixed(0)}€ ${prevArt} ${prevLabel} — belle progression !`,
        ];
        return { text: msgs[today.getDate() % msgs.length], cls: '' };
      } else {
        const msgs = [
          `📉 ${periodLabel} : CA ${curCA.toFixed(0)}€ (${sign}${pctCA}% vs ${prevLabel}) — Analysez vos tournées pour rebondir`,
          `💡 ${periodWordCap} en retrait (${sign}${pctCA}%) — pensez à optimiser vos tournées et relancer vos clients`,
          `⚡ ${Math.abs(diffCA).toFixed(0)}€ de CA en moins vs ${prevArt} ${prevLabel} — une belle opportunité d'optimisation !`,
          `🎯 Marge ${thisPeriod} : ${curMarge.toFixed(0)}€ — on vise ${prevMarge.toFixed(0)}€ pour égaler ${prevArt} ${prevLabel} !`,
        ];
        return { text: msgs[today.getDate() % msgs.length], cls: '' };
      }
    } catch (e) {
      console.warn('[OT perf] exception:', e);
      return null;
    }
  }

  // ─── Trafic IDF — TomTom Traffic Incidents API (retourne incidents bruts) ──
  async function fetchTraficRaw() {
    try {
      const TT_KEY = '0l1ERaX1m3zpA42tFhcxbH2eCKZhvWyo';
      const bbox = '1.80,48.40,3.00,49.10';
      const cats = '1,6,7,8,9';
      const fields = encodeURIComponent(
        '{incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,events{description},from,roadNumbers}}}'
      );
      const url = `https://api.tomtom.com/traffic/services/5/incidentDetails` +
        `?key=${TT_KEY}&bbox=${bbox}&language=fr-FR` +
        `&categoryFilter=${cats}&timeValidityFilter=present&fields=${fields}`;
      const r = await fetch(url);
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        console.warn('[OT trafic] API error', r.status, body.slice(0, 200));
        return null; // null = fallback statique dans formatTrafic
      }
      return (await r.json()).incidents || [];
    } catch (e) {
      console.warn('[OT trafic] exception:', e.message);
      return null;
    }
  }

  // ─── Clients du jour avec coordonnées GPS ─────────────────────────────────
  async function fetchTodayClients() {
    try {
      const s   = getSession();
      const cid = s && (s.company_id || s.id);
      if (!cid || cid === 'demo') return [];
      const _d=new Date();const today = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`;
      const base  = `${SB}/rest/v1`;
      const h     = { headers: authH() };
      const fil   = `company_id=eq.${cid}`;

      const [r1, r2] = await Promise.all([
        fetch(`${base}/tournees?select=client_nom&${fil}&date=eq.${today}&limit=200`, h),
        fetch(`${base}/clients?select=nom,lat,lng&${fil}`, h),
      ]);
      if (!r1.ok || !r2.ok) return [];
      const [tournees, clients] = await Promise.all([r1.json(), r2.json()]);

      const todayNames = new Set((tournees || []).map(t => t.client_nom));
      // Garder uniquement les clients avec une tournée aujourd'hui ET des coordonnées
      return (clients || []).filter(c =>
        todayNames.has(c.nom) && c.lat != null && c.lng != null
      );
    } catch (e) {
      return [];
    }
  }

  // ─── Distance haversine en km ─────────────────────────────────────────────
  function haversine(lat1, lon1, lat2, lon2) {
    const R    = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a    = Math.sin(dLat / 2) ** 2 +
                 Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                 Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ─── Formatage incidents + croisement clients ─────────────────────────────
  function formatTrafic(incidents, todayClients) {
    const iconMap  = { 1:'🚨', 6:'🐌', 7:'⚠️', 8:'🚫', 9:'🔧' };
    const labelMap = { 1:'Accident', 6:'Ralentissement important', 7:'Voie fermée', 8:'Route fermée', 9:'Travaux' };

    // null = API en erreur
    if (incidents === null) {
      return [{ text: '🛣️ Trafic IDF — Consultez Sytadin ou Bison Futé pour les conditions en temps réel', cls: '' }];
    }

    if (!incidents.length) {
      return [{ text: '✅ Trafic IDF fluide — Aucun incident majeur signalé sur le réseau routier', cls: '' }];
    }

    const sorted = [...incidents]
      .filter(i => i && i.properties)
      .sort((a, b) => {
        const score = p => p.iconCategory === 8 ? 10 : p.iconCategory === 1 ? 8 :
                           p.iconCategory === 7 ? 6 : (p.magnitudeOfDelay || 0);
        return score(b.properties) - score(a.properties);
      });

    return sorted.slice(0, 2).map(incident => {
      const p      = incident.properties;
      const icon   = iconMap[p.iconCategory]  || '⚠️';
      const label  = labelMap[p.iconCategory] || 'Incident';
      const road   = (p.roadNumbers && p.roadNumbers[0]) || '';
      const from   = p.from ? p.from.replace(/,.*/, '').trim() : '';
      const desc   = (p.events && p.events[0]) ? p.events[0].description : '';
      const parts  = [road, from, desc].filter(Boolean);
      const isUrgent = p.iconCategory === 8 || (p.iconCategory === 1 && (p.magnitudeOfDelay || 0) >= 3);

      // Croisement avec les clients du jour (seuil 3 km)
      let clientWarning = '';
      if (todayClients.length && incident.geometry && incident.geometry.coordinates) {
        const coords = incident.geometry.coordinates;
        // Échantillonner début, milieu, fin de l'incident
        const sample = [coords[0], coords[Math.floor(coords.length / 2)], coords[coords.length - 1]]
          .filter(Boolean);
        const nearby = todayClients.filter(c =>
          sample.some(([lon, lat]) =>
            haversine(lat, lon, parseFloat(c.lat), parseFloat(c.lng)) < 3
          )
        );
        if (nearby.length) {
          const names = nearby.slice(0, 2).map(c => c.nom).join(', ');
          clientWarning = ` — 📦 Impact tournée : ${names}`;
        }
      }

      return {
        text: `${icon} Trafic IDF — ${label}${parts.length ? ' : ' + parts.join(' · ') : ''}${clientWarning}`,
        cls: isUrgent ? 'urgent' : ''
      };
    });
  }

  // ─── Alertes CT & Assurance ────────────────────────────────────
  async function fetchVehicleAlerts() {
    if (isDemo()) {
      return [
        { lvl:'rouge',  icon:'🔧', title:"AB-123-CD — CT expire AUJOURD'HUI",    sub:'Contrôle technique urgent requis',              tag:"AUJOURD'HUI", link:'optimum_trans_vehicules.html' },
        { lvl:'orange', icon:'🛡️', title:'EF-456-GH — Assurance dans 18 jours', sub:'Échéance : ' + new Date(Date.now()+18*864e5).toLocaleDateString('fr-FR'), tag:'18 J',        link:'optimum_trans_vehicules.html' },
      ];
    }
    try {
      const s = getSession();
      if (!s) return [];
      const cid = s.company_id || s.id;
      if (!cid) return [];

      const r = await fetch(
        `${SB}/rest/v1/vehicules?company_id=eq.${cid}&select=immatriculation,ct_echeance,assurance_echeance&statut=neq.hors service`,
        { headers: authH() }
      );
      if (!r.ok) return [];
      const vehicles = await r.json();
      if (!Array.isArray(vehicles)) return [];

      const today = new Date(); today.setHours(0,0,0,0);
      const diff  = ds => Math.round((new Date(ds) - today) / 864e5);
      const fmt   = ds => new Date(ds).toLocaleDateString('fr-FR');

      const alerts = [];
      for (const v of vehicles) {
        // CT
        if (v.ct_echeance) {
          const j = diff(v.ct_echeance);
          if      (j < 0)   alerts.push({ lvl:'rouge',  icon:'🔧', title:`${v.immatriculation} — CT expiré (${Math.abs(j)}j)`,   sub:'Véhicule non autorisé à circuler !', tag:'EXPIRÉ',       link:'optimum_trans_vehicules.html' });
          else if (j === 0) alerts.push({ lvl:'rouge',  icon:'🔧', title:`${v.immatriculation} — CT expire AUJOURD'HUI`,          sub:'Contrôle technique immédiat requis', tag:"AUJOURD'HUI", link:'optimum_trans_vehicules.html' });
          else if (j <= 7)  alerts.push({ lvl:'rouge',  icon:'🔧', title:`${v.immatriculation} — CT dans ${j} jour(s)`,           sub:`Échéance : ${fmt(v.ct_echeance)}`,   tag:`${j} J`,       link:'optimum_trans_vehicules.html' });
          else if (j <= 30) alerts.push({ lvl:'orange', icon:'🔧', title:`${v.immatriculation} — CT dans ${j} jours`,             sub:`Échéance : ${fmt(v.ct_echeance)}`,   tag:`${j} J`,       link:'optimum_trans_vehicules.html' });
        }
        // Assurance
        if (v.assurance_echeance) {
          const j = diff(v.assurance_echeance);
          if      (j < 0)   alerts.push({ lvl:'rouge',  icon:'🛡️', title:`${v.immatriculation} — Assurance expirée (${Math.abs(j)}j)`, sub:'Véhicule non assuré !',              tag:'EXPIRÉ',       link:'optimum_trans_vehicules.html' });
          else if (j === 0) alerts.push({ lvl:'rouge',  icon:'🛡️', title:`${v.immatriculation} — Assurance expire AUJOURD'HUI`,          sub:'Contacter votre assureur immédiatement', tag:"AUJOURD'HUI", link:'optimum_trans_vehicules.html' });
          else if (j <= 7)  alerts.push({ lvl:'rouge',  icon:'🛡️', title:`${v.immatriculation} — Assurance dans ${j} jour(s)`,           sub:`Échéance : ${fmt(v.assurance_echeance)}`, tag:`${j} J`, link:'optimum_trans_vehicules.html' });
          else if (j <= 30) alerts.push({ lvl:'orange', icon:'🛡️', title:`${v.immatriculation} — Assurance dans ${j} jours`,              sub:`Échéance : ${fmt(v.assurance_echeance)}`, tag:`${j} J`, link:'optimum_trans_vehicules.html' });
        }
      }
      alerts.sort((a, b) => (a.lvl === 'rouge' ? -1 : 1));
      return alerts;
    } catch (e) { return []; }
  }

  // ─── Mise à jour barre défilante ──────────────────────────────
  function setScrollContent(items) {
    const inner = document.getElementById('ot-is-inner');
    if (!inner) return;

    let html = '';
    items.forEach((it, i) => {
      html += `<span class="ot-is-item${it.cls ? ' ' + it.cls : ''}">${it.text}</span>`;
      if (i < items.length - 1) html += '<span class="ot-is-sep">◆</span>';
    });
    // Dupliquer pour boucle sans saut
    inner.innerHTML = html + '<span style="display:inline-block;width:80px"></span>' + html;

    requestAnimationFrame(() => {
      const half = inner.scrollWidth / 2;
      const dur  = Math.max(20, Math.round(half / 85));
      inner.style.animationDuration = dur + 's';
    });
  }

  // ─── Mise à jour panneau cloche ───────────────────────────────
  function setNotifPanel(alerts) {
    const list   = document.getElementById('ot-nb-list');
    const badge  = document.getElementById('ot-nb-badge');
    const hcount = document.getElementById('ot-nb-hcount');
    if (!list) return;

    const rouge = alerts.filter(a => a.lvl === 'rouge').length;
    const total = alerts.length;

    // Badge
    if (badge) {
      if (rouge > 0) {
        badge.textContent = rouge > 9 ? '9+' : String(rouge);
        badge.className = 'ot-nb-badge on pulse';
      } else if (total > 0) {
        badge.textContent = String(total);
        badge.className = 'ot-nb-badge on';
      } else {
        badge.className = 'ot-nb-badge';
      }
    }

    if (hcount) hcount.textContent = total ? `${total} alerte${total > 1 ? 's' : ''}` : 'Tout est en ordre';

    if (!total) {
      list.innerHTML = `<div class="ot-nb-empty">
        <div class="ot-nb-empty-icon">✅</div>
        Aucune alerte en cours<br>
        <span style="font-size:10px;color:#4A5568">CT et assurances à jour</span>
      </div>`;
      return;
    }

    const col = lvl => lvl === 'rouge' ? 'red' : 'orange';
    list.innerHTML = alerts.map(a => `
      <a class="ot-nb-item" href="${a.link || 'optimum_trans_vehicules.html'}">
        <div class="ot-nb-item-icon ${col(a.lvl)}">${a.icon}</div>
        <div class="ot-nb-item-body">
          <div class="ot-nb-item-title">${a.title}</div>
          <div class="ot-nb-item-sub">${a.sub}</div>
        </div>
        <span class="ot-nb-item-tag ${col(a.lvl)}">${a.tag}</span>
      </a>
    `).join('');

    // Badge mobile
    const mobBadge = document.getElementById('ot-nb-mob-badge');
    if (mobBadge && rouge > 0) {
      mobBadge.textContent = rouge > 9 ? '9+' : String(rouge);
      mobBadge.style.display = 'flex';
    }
  }

  // ─── Build DOM ────────────────────────────────────────────────
  function buildBar() {
    const el = document.createElement('div');
    el.id = 'ot-is-bar';
    el.className = 'ot-is-bar';
    el.innerHTML = `
      <div class="ot-is-label"><div class="ot-is-dot"></div>LIVE</div>
      <div class="ot-is-track">
        <div class="ot-is-inner" id="ot-is-inner">
          <span class="ot-is-item">⏳ Chargement des informations…</span>
        </div>
      </div>`;
    return el;
  }

  function buildBell() {
    const wrap = document.createElement('div');
    wrap.className = 'ot-nb-wrap';
    wrap.innerHTML = `
      <div class="ot-nb-btn" id="ot-nb-btn" title="Notifications véhicules">
        🔔<span class="ot-nb-badge" id="ot-nb-badge"></span>
      </div>
      <div class="ot-nb-panel" id="ot-nb-panel">
        <div class="ot-nb-head">
          <span class="ot-nb-head-title">NOTIFICATIONS</span>
          <span class="ot-nb-head-count" id="ot-nb-hcount">Chargement…</span>
        </div>
        <div class="ot-nb-list" id="ot-nb-list">
          <div class="ot-nb-empty"><div class="ot-nb-empty-icon">⏳</div>Vérification en cours…</div>
        </div>
        <div class="ot-nb-footer"><a href="optimum_trans_vehicules.html">Gérer le parc véhicules →</a></div>
      </div>`;
    return wrap;
  }

  function buildMobBell() {
    const btn = document.createElement('div');
    btn.id = 'ot-nb-mob-btn';
    btn.title = 'Notifications';
    btn.style.cssText = 'width:38px;height:38px;background:rgba(245,166,35,0.1);border:1px solid rgba(245,166,35,0.3);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:17px;cursor:pointer;position:relative;-webkit-tap-highlight-color:transparent;flex-shrink:0;';
    btn.innerHTML = '🔔<span id="ot-nb-mob-badge" style="position:absolute;top:-5px;right:-5px;background:#E74C3C;color:#fff;font-size:9px;font-weight:700;min-width:16px;height:16px;padding:0 3px;border-radius:8px;display:none;align-items:center;justify-content:center;border:2px solid #0F2040;"></span>';
    return btn;
  }

  // ─── Injection dans le DOM ────────────────────────────────────
  function inject() {
    const main = document.querySelector('main.main, div.main, .main');
    if (!main) return;

    // 1. Barre défilante
    if (!document.getElementById('ot-is-bar')) {
      // Sur les pages avec mob-topbar (dashboard), on insère après mob-topbar
      // Sur les autres pages, on insère après la topbar
      const anchor = main.querySelector('.mob-topbar') || main.querySelector('.topbar');
      if (anchor) {
        anchor.insertAdjacentElement('afterend', buildBar());
      }
    }

    // 2. Cloche desktop dans topbar-right
    if (!document.getElementById('ot-nb-btn')) {
      const tbRight = main.querySelector('.topbar-right') || document.querySelector('.topbar-right');
      if (tbRight) {
        // Ajouter à la FIN du topbar-right (position la plus naturelle)
        tbRight.appendChild(buildBell());
      }
    }

    // 3. Cloche mobile dans mob-topbar-right
    if (!document.getElementById('ot-nb-mob-btn')) {
      const mobRight = main.querySelector('.mob-topbar-right') || document.querySelector('.mob-topbar-right');
      if (mobRight) {
        mobRight.appendChild(buildMobBell());
      }
    }

    // Toggle panneau
    const panel = document.getElementById('ot-nb-panel');
    if (panel) {
      ['ot-nb-btn', 'ot-nb-mob-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', e => { e.stopPropagation(); panel.classList.toggle('open'); });
      });
      document.addEventListener('click', () => panel.classList.remove('open'));
      panel.addEventListener('click', e => e.stopPropagation());
    }
  }

  // ─── Init ────────────────────────────────────────────────────
  async function init() {
    if (!document.querySelector('.main')) return;

    injectCSS();
    inject();

    // Items de base
    const today  = new Date();
    const dateFr = today.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    const scrollItems = [{ text: `📅 ${dateFr.charAt(0).toUpperCase() + dateFr.slice(1)}`, cls: '' }];

    // Requêtes parallèles (incidents bruts + clients du jour en parallèle)
    const [meteo, perf, rawTrafic, todayClients, alerts] = await Promise.all([
      fetchMeteo(),
      fetchPerformance(),
      fetchTraficRaw(),
      fetchTodayClients(),
      fetchVehicleAlerts()
    ]);

    if (meteo) scrollItems.push(meteo);
    if (perf)  scrollItems.push(perf);
    // Croisement incidents × clients du jour
    formatTrafic(rawTrafic, todayClients).forEach(t => scrollItems.push(t));

    // Alertes urgentes dans la barre (max 3)
    alerts.filter(a => a.lvl === 'rouge').slice(0, 3)
      .forEach(a => scrollItems.push({ text: `🚨 ${a.title}`, cls: 'urgent' }));

    // Actualité réglementaire transport — rotation par jour du mois
    const actus = [
      '📜 Temps de conduite : 9h/jour max (10h autorisé 2×/semaine) — pause 45 min obligatoire après 4h30 de conduite',
      '🔧 Contrôle technique PL : visite annuelle obligatoire — anticipez le rendez-vous pour éviter l\'immobilisation',
      '📡 Chronotachygraphe : téléchargement obligatoire toutes les 28 jours (carte conducteur) et 90 jours (véhicule)',
      '📋 FCO/FCOS : formation continue obligatoire tous les 5 ans pour les conducteurs de transport routier',
      '🚛 Cabotage : 3 opérations maximum en 7 jours consécutifs après un transport international entrant',
      '⚖️ Pesée & surcharge : le dépassement du PTAC expose à une immobilisation immédiate et une amende forfaitaire',
      '📄 Documents de bord obligatoires : carte grise, attestation d\'assurance, licence de transport, lettre de voiture',
      '🕐 Temps de travail chauffeurs : amplitude max 12h/jour, repos journalier minimum 11h consécutives',
    ];
    scrollItems.push({ text: actus[today.getDate() % actus.length], cls: '' });

    setScrollContent(scrollItems);
    setNotifPanel(alerts);
  }

  // Init différé : la barre d'info n'est pas critique pour l'usage de la page.
  // On laisse 1.5s aux fetches métier de la page principale pour récupérer leurs
  // données avant de lancer nos 5-7 appels (météo, trafic, perf, clients, alertes).
  // Évite que la barre sature les 6 connexions HTTP du navigateur.
  function _scheduleInit() { setTimeout(init, 1500); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _scheduleInit);
  } else {
    _scheduleInit();
  }

})();
