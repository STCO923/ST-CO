// ═══════════════════════════════════════════════════════════════════
// T SERVICE & CO — ot_sync.js v1.0
// Synchronisation complète multi-appareils via Supabase
//
// Remplace TOUT le localStorage pour :
//   - Validations tournées  (ot_validations)
//   - Pénalités du mois     (ot_pen_YYYY_M)
//   - Config pénalités      (ot_penalites)
//   - Avances & primes      (avances_YYYY_M)
//
// À inclure dans TOUTES les pages juste après pwa-register.js :
//   <script src="/ot_sync.js"></script>
// ═══════════════════════════════════════════════════════════════════

window.OT_SYNC = (() => {
  'use strict';

  const SB  = 'https://kfdyqcbclueppmvkccdz.supabase.co';
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmZHlxY2JjbHVlcHBtdmtjY2R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMjAxNTQsImV4cCI6MjA5NDc5NjE1NH0.gj0eT27HcdkPw6fTZRBbSflVv5Yh1SPA9o8vAAiX_CU';

  // ── Helpers ─────────────────────────────────────────────────────
  function _h() {
    try {
      const raw = localStorage.getItem('ot_session') || sessionStorage.getItem('ot_session');
      const token = raw ? JSON.parse(raw).token : null;
      return { 'Content-Type': 'application/json', 'apikey': KEY, 'Authorization': 'Bearer ' + (token || KEY) };
    } catch(e) { return { 'Content-Type': 'application/json', 'apikey': KEY, 'Authorization': 'Bearer ' + KEY }; }
  }

  function _cid() {
    try {
      const raw = localStorage.getItem('ot_session') || sessionStorage.getItem('ot_session');
      if (!raw) return null;
      const s = JSON.parse(raw);
      return s.company_id || s.id || null;
    } catch(e) { return null; }
  }

  function _isDemo() { return _cid() === 'demo'; }

  // ══════════════════════════════════════════════════════════════
  // 1. VALIDATIONS TOURNÉES
  // ══════════════════════════════════════════════════════════════
  let _valCache = null;

  // Charger les validations depuis Supabase via pagination.
  // Par défaut : les 3 derniers mois (fenêtre glissante sur updated_at).
  // Options :
  //   { since: Date|ISO } → borne basse custom
  //   { until: Date|ISO } → borne haute custom
  //   { full: true }      → charge tout (utilisé en secours/migration)
  //
  // Le cache est MERGÉ (n'est plus réinitialisé à chaque appel), ce qui
  // permet d'accumuler plusieurs fenêtres de dates via `loadValidationsForPeriod`.
  // Les mutations locales (validate/penalize/reset) maintiennent le cache à jour.
  async function loadValidations(options) {
    const cid = _cid();
    if (!cid || _isDemo()) return _valFromLS();
    try {
      const PAGE_SIZE       = 1000;
      const WARN_THRESHOLD  = 50000;
      const HARD_LIMIT      = 1000000;
      const opts = options || {};
      let sinceIso = null;
      let untilIso = null;
      if (!opts.full) {
        if (opts.since) {
          sinceIso = opts.since instanceof Date ? opts.since.toISOString() : opts.since;
        } else {
          // Défaut : fenêtre glissante des 3 derniers mois
          const def = new Date();
          def.setMonth(def.getMonth() - 3);
          sinceIso = def.toISOString();
        }
        if (opts.until) {
          untilIso = opts.until instanceof Date ? opts.until.toISOString() : opts.until;
        }
      }
      if (!_valCache) _valCache = _valFromLS();
      let offset = 0;
      let warned = false;
      while (true) {
        let url = `${SB}/rest/v1/tournee_validations`
          + `?company_id=eq.${cid}`;
        if (sinceIso) url += `&updated_at=gte.${encodeURIComponent(sinceIso)}`;
        if (untilIso) url += `&updated_at=lte.${encodeURIComponent(untilIso)}`;
        url += `&select=tournee_id,statut,motif,motif_id,montant,updated_at`
          + `&order=updated_at.asc`
          + `&offset=${offset}&limit=${PAGE_SIZE}`;
        const r = await fetch(url, { headers: _h() });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        data.forEach(v => { _valCache[v.tournee_id] = { statut: v.statut, motif: v.motif, motif_id: v.motif_id, montant: Number(v.montant) || 0 }; });
        if (data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
        if (offset >= WARN_THRESHOLD && !warned) {
          warned = true;
          console.warn('[OT_SYNC] tournee_validations dépasse ' + WARN_THRESHOLD + ' lignes dans cette fenêtre pour company_id=' + cid);
          _reportLargeTable(cid, offset).catch(() => {});
        }
        if (offset >= HARD_LIMIT) {
          console.error('[OT_SYNC] HARD_LIMIT ' + HARD_LIMIT + ' atteint — chargement interrompu.');
          break;
        }
      }
      _syncValToLS();
      return _valCache;
    } catch(e) {
      console.warn('[OT_SYNC] loadValidations fallback:', e.message);
      return _valFromLS();
    }
  }

  // Charge les validations susceptibles de correspondre aux tournées d'une période.
  // Buffer -7j / +30j sur `updated_at` pour attraper les validations anticipées
  // ou effectuées a posteriori (ex: clôture mensuelle de la paie).
  // start / end : Date ou string ISO (YYYY-MM-DD accepté).
  async function loadValidationsForPeriod(start, end) {
    const s = start instanceof Date ? new Date(start) : new Date(start + 'T00:00:00');
    const e = end instanceof Date ? new Date(end) : new Date(end + 'T23:59:59');
    s.setDate(s.getDate() - 7);
    e.setDate(e.getDate() + 30);
    return loadValidations({ since: s, until: e });
  }

  // Remonte un événement de sécurité/monitoring côté Supabase pour qu'on
  // voie qu'une compagnie approche de la limite, même sans console ouverte.
  // Best-effort : n'importe quelle erreur est silencieusement ignorée.
  async function _reportLargeTable(cid, approxRows) {
    try {
      await fetch(`${SB}/rest/v1/security_events`, {
        method: 'POST',
        headers: { ..._h(), 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          company_id: cid,
          event_type: 'tournee_validations_large_table',
          details: { approx_rows: approxRows, threshold: 50000 },
          url: (typeof location !== 'undefined' ? location.href : null),
          user_agent: (typeof navigator !== 'undefined' ? navigator.userAgent : null)
        })
      });
    } catch(e) { /* silent */ }
  }

  function getValidationMap() {
    if (_valCache) return { ..._valCache };
    return _valFromLS();
  }

  async function validateTournee(tourneeId, chauffeurNom) {
    const entry = { statut: 'validee', motif: null, motif_id: null, montant: 0 };
    if (!_valCache) _valCache = _valFromLS();
    _valCache[tourneeId] = entry;
    _syncValToLS();
    const cid = _cid();
    if (!cid || _isDemo()) return;
    try {
      const r = await fetch(`${SB}/rest/v1/tournee_validations?on_conflict=company_id,tournee_id`, {
        method: 'POST',
        headers: { ..._h(), 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({ company_id: cid, tournee_id: tourneeId, chauffeur_nom: chauffeurNom, statut: 'validee', motif: null, motif_id: null, montant: 0, updated_at: new Date().toISOString() })
      });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()));
    } catch(e) { console.warn('[OT_SYNC] validateTournee:', e.message); throw e; }
  }

  async function penalizeTournee(tourneeId, chauffeurNom, motif, motifId, montant) {
    const entry = { statut: 'penalisee', motif, motif_id: motifId, montant: Number(montant) || 0 };
    if (!_valCache) _valCache = _valFromLS();
    _valCache[tourneeId] = entry;
    _syncValToLS();
    _savePenLS(chauffeurNom, tourneeId, motif, montant); // compatibilité page salaires
    const cid = _cid();
    if (!cid || _isDemo()) return;
    try {
      const r = await fetch(`${SB}/rest/v1/tournee_validations?on_conflict=company_id,tournee_id`, {
        method: 'POST',
        headers: { ..._h(), 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({ company_id: cid, tournee_id: tourneeId, chauffeur_nom: chauffeurNom, statut: 'penalisee', motif, motif_id: motifId, montant: Number(montant) || 0, updated_at: new Date().toISOString() })
      });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()));
    } catch(e) { console.warn('[OT_SYNC] penalizeTournee:', e.message); throw e; }
  }

  async function resetValidation(tourneeId, chauffeurNom) {
    if (!_valCache) _valCache = _valFromLS();
    delete _valCache[tourneeId];
    _syncValToLS();
    _removePenLS(chauffeurNom, tourneeId);
    const cid = _cid();
    if (!cid || _isDemo()) return;
    try {
      await fetch(`${SB}/rest/v1/tournee_validations?company_id=eq.${cid}&tournee_id=eq.${tourneeId}`, { method: 'DELETE', headers: _h() });
    } catch(e) { console.warn('[OT_SYNC] resetValidation:', e.message); }
  }

  function _valFromLS() {
    try { return JSON.parse(localStorage.getItem('ot_validations') || '{}'); } catch(e) { return {}; }
  }
  function _syncValToLS() {
    try { localStorage.setItem('ot_validations', JSON.stringify(_valCache || {})); } catch(e) {}
  }

  // ══════════════════════════════════════════════════════════════
  // 2. CONFIG PÉNALITÉS (motifs personnalisables)
  // ══════════════════════════════════════════════════════════════
  const _defaultPenalites = [
    { id: 'retard',      label: 'Retard',                icon: '⏰', montant: 20 },
    { id: 'absence_nj',  label: 'Absence non justifiée', icon: '🚫', montant: 50 },
    { id: 'absence',     label: 'Absence',               icon: '📋', montant: 0  }
  ];

  async function loadPenalitesConfig() {
    const cid = _cid();
    if (!cid || _isDemo()) return _penConfigFromLS();
    try {
      const r = await fetch(`${SB}/rest/v1/penalites_config?company_id=eq.${cid}&order=ordre`, { headers: _h() });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      if (!data.length) {
        // Première fois : sauvegarder les défauts dans Supabase
        await savePenalitesConfig(_defaultPenalites);
        return _defaultPenalites;
      }
      const config = data.map(p => ({ id: p.motif_id, label: p.label, icon: p.icon, montant: Number(p.montant) || 0 }));
      localStorage.setItem('ot_penalites', JSON.stringify(config));
      return config;
    } catch(e) {
      console.warn('[OT_SYNC] loadPenalitesConfig fallback:', e.message);
      return _penConfigFromLS();
    }
  }

  async function savePenalitesConfig(list) {
    localStorage.setItem('ot_penalites', JSON.stringify(list));
    const cid = _cid();
    if (!cid || _isDemo()) return;
    try {
      // Supprimer puis réinsérer
      await fetch(`${SB}/rest/v1/penalites_config?company_id=eq.${cid}`, { method: 'DELETE', headers: _h() });
      const rows = list.map((p, i) => ({ company_id: cid, motif_id: p.id, label: p.label, icon: p.icon, montant: Number(p.montant) || 0, ordre: i }));
      await fetch(`${SB}/rest/v1/penalites_config`, {
        method: 'POST',
        headers: { ..._h(), 'Prefer': 'return=minimal' },
        body: JSON.stringify(rows)
      });
    } catch(e) { console.warn('[OT_SYNC] savePenalitesConfig:', e.message); }
  }

  function _penConfigFromLS() {
    try {
      const raw = localStorage.getItem('ot_penalites');
      return raw ? JSON.parse(raw) : _defaultPenalites;
    } catch(e) { return _defaultPenalites; }
  }

  // ══════════════════════════════════════════════════════════════
  // 3. AVANCES & PRIMES MENSUELLES
  // ══════════════════════════════════════════════════════════════

  async function loadAvances(year, month) {
    const cid = _cid();
    if (!cid || _isDemo()) return _avancesFromLS(year, month);
    try {
      const r = await fetch(`${SB}/rest/v1/chauffeur_avances?company_id=eq.${cid}&annee=eq.${year}&mois=eq.${month}&select=chauffeur_nom,avance,prime,notes`, { headers: _h() });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      const map = {};
      data.forEach(a => { map[a.chauffeur_nom] = { avance: Number(a.avance) || 0, prime: Number(a.prime) || 0, notes: a.notes || '' }; });
      // sync vers localStorage
      localStorage.setItem(`avances_${year}_${month}`, JSON.stringify(map));
      return map;
    } catch(e) {
      console.warn('[OT_SYNC] loadAvances fallback:', e.message);
      return _avancesFromLS(year, month);
    }
  }

  async function saveAvance(chauffeurNom, year, month, avance, prime, notes) {
    const cid = _cid();
    // Mettre à jour localStorage immédiatement
    const map = _avancesFromLS(year, month);
    map[chauffeurNom] = { avance: Number(avance) || 0, prime: Number(prime) || 0, notes: notes || '' };
    localStorage.setItem(`avances_${year}_${month}`, JSON.stringify(map));
    if (!cid || _isDemo()) return;
    try {
      const r = await fetch(`${SB}/rest/v1/chauffeur_avances?on_conflict=company_id,chauffeur_nom,annee,mois`, {
        method: 'POST',
        headers: { ..._h(), 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({ company_id: cid, chauffeur_nom: chauffeurNom, annee: year, mois: month, avance: Number(avance) || 0, prime: Number(prime) || 0, notes: notes || '', updated_at: new Date().toISOString() })
      });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()));
    } catch(e) { console.warn('[OT_SYNC] saveAvance:', e.message); throw e; }
  }

  function _avancesFromLS(year, month) {
    try { return JSON.parse(localStorage.getItem(`avances_${year}_${month}`) || '{}'); } catch(e) { return {}; }
  }

  // ══════════════════════════════════════════════════════════════
  // 4. PÉNALITÉS DU MOIS (pour calcul salaires)
  // ══════════════════════════════════════════════════════════════

  async function getPenalitesMois(year, month) {
    const cid = _cid();
    if (!cid || _isDemo()) return _penMoisFromLS(year, month);
    try {
      const r = await fetch(`${SB}/rest/v1/tournee_validations?company_id=eq.${cid}&statut=eq.penalisee&select=chauffeur_nom,tournee_id,motif,montant`, { headers: _h() });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      const result = {};
      data.forEach(v => {
        if (!result[v.chauffeur_nom]) result[v.chauffeur_nom] = [];
        result[v.chauffeur_nom].push({ tournee_id: v.tournee_id, motif: v.motif, montant: Number(v.montant) || 0 });
      });
      return result;
    } catch(e) {
      console.warn('[OT_SYNC] getPenalitesMois fallback:', e.message);
      return _penMoisFromLS(year, month);
    }
  }

  function _penMoisFromLS(year, month) {
    try { return JSON.parse(localStorage.getItem(`ot_pen_${year}_${month}`) || '{}'); } catch(e) { return {}; }
  }

  // ── Helpers pénalités localStorage (compatibilité) ───────────
  function _savePenLS(chauffeurNom, tourneeId, motif, montant) {
    if (!chauffeurNom) return;
    const now = new Date();
    const key = `ot_pen_${now.getFullYear()}_${now.getMonth()}`;
    let data = {};
    try { data = JSON.parse(localStorage.getItem(key) || '{}'); } catch(e) {}
    if (!data[chauffeurNom]) data[chauffeurNom] = [];
    data[chauffeurNom] = data[chauffeurNom].filter(x => x.tournee_id !== tourneeId);
    if (motif !== null && Number(montant) > 0) data[chauffeurNom].push({ tournee_id: tourneeId, motif, montant: Number(montant), ts: Date.now() });
    try { localStorage.setItem(key, JSON.stringify(data)); } catch(e) {}
  }

  function _removePenLS(chauffeurNom, tourneeId) {
    const now = new Date();
    const key = `ot_pen_${now.getFullYear()}_${now.getMonth()}`;
    let data = {};
    try { data = JSON.parse(localStorage.getItem(key) || '{}'); } catch(e) {}
    Object.keys(data).forEach(nom => { data[nom] = data[nom].filter(x => x.tournee_id !== tourneeId); });
    try { localStorage.setItem(key, JSON.stringify(data)); } catch(e) {}
  }

  // ══════════════════════════════════════════════════════════════
  // API PUBLIQUE
  // ══════════════════════════════════════════════════════════════
  return {
    // Validations
    loadValidations,
    loadValidationsForPeriod,
    getValidationMap,
    validateTournee,
    penalizeTournee,
    resetValidation,
    // Config pénalités
    loadPenalitesConfig,
    savePenalitesConfig,
    // Avances
    loadAvances,
    saveAvance,
    // Pénalités mois (salaires)
    getPenalitesMois,
  };

})();

// ─── Alias rétrocompatibilité ────────────────────────────────────
// Les pages existantes qui appellent encore getValidationMap() ou
// getPenalitesMois() directement continueront de fonctionner.
if (typeof window !== 'undefined') {
  window._OT_getValidationMap    = () => OT_SYNC.getValidationMap();
  window._OT_getPenalitesMois    = (y, m) => OT_SYNC.getPenalitesMois(y, m);
  window._OT_loadPenalites       = () => OT_SYNC.loadPenalitesConfig();
}
