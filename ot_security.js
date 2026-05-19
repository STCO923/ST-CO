// =======================================================================
// OT_SECURITY.JS — Module de sécurité T SERVICE & CO
// v1.0 — Protection non-destructive, compatible avec l'existant
//
// Fonctionnalités :
//   1. Rate limiting login (protection brute force côté client)
//   2. Surveillance intégrité session (détection de falsification localStorage)
//   3. Journalisation des événements suspects (Supabase security_events)
//   4. Journalisation des tentatives de connexion (login_attempts)
//   5. Watermark d'impression confidentiel
//   6. Protection contextuelle des données sensibles
//
// INTÉGRATION : ajouter <script src="/ot_security.js"></script>
//   - Dans index.html  : avant le script inline (rate limiting login)
//   - Dans les autres pages : après ot_session.js (surveillance session)
// =======================================================================

window.OT_SECURITY = (() => {
  'use strict';

  const SB  = 'https://kfdyqcbclueppmvkccdz.supabase.co';
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmZHlxY2JjbHVlcHBtdmtjY2R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMjAxNTQsImV4cCI6MjA5NDc5NjE1NH0.gj0eT27HcdkPw6fTZRBbSflVv5Yh1SPA9o8vAAiX_CU';

  // ── Helpers internes ─────────────────────────────────────────────────

  function _getSession() {
    try {
      const raw = localStorage.getItem('ot_session') || sessionStorage.getItem('ot_session');
      return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
  }

  function _getCompanyId() {
    const s = _getSession();
    if (!s || s.id === 'demo') return null;
    return s.company_id || s.id || null;
  }

  function _getAuthHeaders() {
    const s = _getSession();
    const token = (s && s.token) ? s.token : KEY;
    return { 'Content-Type': 'application/json', 'apikey': KEY, 'Authorization': 'Bearer ' + token };
  }

  // Simple hash non-cryptographique pour détecter des modifications de valeurs
  function _hashFields(fields) {
    const str = fields.join('|');
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return h.toString(16);
  }


  // ══════════════════════════════════════════════════════════════════════
  // 1. RATE LIMITING LOGIN — protection brute force
  // Max 5 tentatives par email sur une fenêtre glissante de 15 minutes.
  // Stocké dans localStorage avec TTL.
  // ══════════════════════════════════════════════════════════════════════

  const LOGIN_MAX     = 5;
  const LOGIN_WINDOW  = 15 * 60 * 1000; // 15 minutes en ms

  function _loginKey(email) {
    // Clé non-réversible basée sur l'email (pas de PII en clair dans la clé)
    return 'ot_lr_' + _hashFields([email.toLowerCase().trim()]);
  }

  function checkLoginRateLimit(email) {
    if (!email) return { allowed: true };
    try {
      const raw  = localStorage.getItem(_loginKey(email));
      const data = raw ? JSON.parse(raw) : { attempts: [] };
      const now  = Date.now();
      const recent = (data.attempts || []).filter(t => now - t < LOGIN_WINDOW);

      if (recent.length >= LOGIN_MAX) {
        const oldestRecent = Math.min(...recent);
        const unlockAt     = oldestRecent + LOGIN_WINDOW;
        const minutes      = Math.ceil((unlockAt - now) / 60000);
        return {
          allowed: false,
          message: 'Trop de tentatives de connexion. Réessayez dans ' + minutes + ' minute(s).',
          unlockAt
        };
      }
      return { allowed: true, remaining: LOGIN_MAX - recent.length };
    } catch(e) {
      return { allowed: true };
    }
  }

  function recordLoginAttempt(email, success) {
    if (!email) return;
    try {
      const key  = _loginKey(email);
      const raw  = localStorage.getItem(key);
      const data = raw ? JSON.parse(raw) : { attempts: [] };
      const now  = Date.now();
      const recent = (data.attempts || []).filter(t => now - t < LOGIN_WINDOW);

      if (!success) {
        recent.push(now);
        localStorage.setItem(key, JSON.stringify({ attempts: recent }));
      } else {
        // Succès : effacer les tentatives échouées
        localStorage.removeItem(key);
      }

      // Journaliser dans Supabase (silencieux, best-effort)
      _logLoginAttempt(email, success).catch(() => {});

    } catch(e) { /* silent */ }
  }

  async function _logLoginAttempt(email, success) {
    const emailHash = _hashFields([email.toLowerCase().trim()]);
    await fetch(SB + '/rest/v1/login_attempts', {
      method: 'POST',
      headers: { ...{ 'Content-Type': 'application/json', 'apikey': KEY, 'Authorization': 'Bearer ' + KEY }, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        email_hash: emailHash,
        success,
        created_at: new Date().toISOString()
      })
    });
  }


  // ══════════════════════════════════════════════════════════════════════
  // 2. SURVEILLANCE INTÉGRITÉ SESSION
  // Détecte si les champs critiques (plan, role, addon) ont été modifiés
  // manuellement dans localStorage APRÈS le refresh serveur.
  // En cas de détection : log + forçage de déconnexion.
  // ══════════════════════════════════════════════════════════════════════

  const INTEGRITY_KEY = '_ot_si'; // ot session integrity
  let _sessionSig     = null;

  function _computeSessionSig(s) {
    return _hashFields([
      String(s.id || ''),
      String(s.company_id || ''),
      String(s.plan || ''),
      String(s.role || ''),
      String(s.addon_route || ''),
      String(s.addon_dispatch || ''),
      String(s.addon_saisie || ''),
      String(s.status || '')
    ]);
  }

  // À appeler après le refresh serveur (valeurs de confiance)
  function sealSession() {
    const s = _getSession();
    if (!s || s.id === 'demo') return;
    _sessionSig = _computeSessionSig(s);
    try { sessionStorage.setItem(INTEGRITY_KEY, _sessionSig); } catch(e) {}
  }

  // Vérifier que la session n'a pas été falsifiée depuis le dernier seal
  function checkSessionIntegrity() {
    const s = _getSession();
    if (!s || s.id === 'demo') return true;

    const storedSig = _sessionSig || sessionStorage.getItem(INTEGRITY_KEY);
    if (!storedSig) return true; // Pas encore scellée, pas de comparaison possible

    const currentSig = _computeSessionSig(s);
    if (currentSig !== storedSig) {
      // Signature différente : falsification détectée
      logSecurityEvent('session_tamper_detected', {
        field_mismatch: true,
        plan: s.plan,
        role: s.role
      });
      return false;
    }
    return true;
  }


  // ══════════════════════════════════════════════════════════════════════
  // 3. JOURNALISATION ÉVÉNEMENTS SUSPECTS
  // Envoie silencieusement dans la table security_events de Supabase.
  // Best-effort : jamais bloquant, jamais visible de l'utilisateur.
  // ══════════════════════════════════════════════════════════════════════

  const _eventQueue  = [];
  let   _flushTimer  = null;

  function logSecurityEvent(eventType, details) {
    const cid = _getCompanyId();
    _eventQueue.push({
      company_id: cid,
      event_type: eventType,
      details:    details || {},
      url:        window.location.pathname,
      user_agent: navigator.userAgent.substring(0, 200),
      created_at: new Date().toISOString()
    });

    // Flush en batch après 2 secondes (anti-spam)
    if (_flushTimer) clearTimeout(_flushTimer);
    _flushTimer = setTimeout(_flushEvents, 2000);
  }

  async function _flushEvents() {
    if (!_eventQueue.length) return;
    const batch = _eventQueue.splice(0, 10); // Max 10 par flush
    try {
      await fetch(SB + '/rest/v1/security_events', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Prefer': 'return=minimal' },
        body:    JSON.stringify(batch.map(e => ({ ...e, details: JSON.stringify(e.details) })))
      });
    } catch(e) {
      // Si échec : remettre dans la queue (max 50 events en tampon)
      if (_eventQueue.length < 50) _eventQueue.unshift(...batch);
    }
  }


  // ══════════════════════════════════════════════════════════════════════
  // 4. SURVEILLANCE DES CHANGEMENTS localStorage
  // Détecte les modifications de session depuis un autre onglet ou
  // par un script malveillant via l'API storage.
  // ══════════════════════════════════════════════════════════════════════

  function _initStorageWatcher() {
    window.addEventListener('storage', function(e) {
      if (e.key !== 'ot_session') return;

      try {
        const oldS = e.oldValue ? JSON.parse(e.oldValue) : null;
        const newS = e.newValue ? JSON.parse(e.newValue) : null;

        if (oldS && newS) {
          const planChanged  = oldS.plan    !== newS.plan;
          const roleChanged  = oldS.role    !== newS.role;
          const addonChanged = oldS.addon_route !== newS.addon_route
                            || oldS.addon_saisie !== newS.addon_saisie;

          if (planChanged || roleChanged || addonChanged) {
            logSecurityEvent('session_modified_external', {
              old_plan:        oldS.plan,
              new_plan:        newS.plan,
              old_role:        oldS.role,
              new_role:        newS.role,
              addon_changed:   addonChanged
            });
          }
        }
      } catch(err) { /* silent */ }
    });
  }


  // ══════════════════════════════════════════════════════════════════════
  // 5. WATERMARK D'IMPRESSION
  // Ajoute automatiquement "CONFIDENTIEL — T SERVICE & CO" en filigrane
  // sur toutes les pages imprimées. Invisible à l'écran.
  // ══════════════════════════════════════════════════════════════════════

  function _initPrintWatermark() {
    const style = document.createElement('style');
    style.id    = 'ot-print-protection';
    style.textContent = [
      '@media print {',
      '  body::before {',
      '    content: "CONFIDENTIEL — T SERVICE & CO";',
      '    position: fixed;',
      '    top: 50%;',
      '    left: 50%;',
      '    transform: translate(-50%, -50%) rotate(-45deg);',
      '    font-size: 64px;',
      '    font-weight: 900;',
      '    color: rgba(0, 0, 0, 0.06);',
      '    white-space: nowrap;',
      '    pointer-events: none;',
      '    z-index: 99999;',
      '    font-family: sans-serif;',
      '    letter-spacing: 4px;',
      '  }',
      '  body::after {',
      '    content: "Document généré par T SERVICE & CO — ' + new Date().toLocaleDateString('fr-FR') + '";',
      '    position: fixed;',
      '    bottom: 10px;',
      '    right: 16px;',
      '    font-size: 10px;',
      '    color: rgba(0,0,0,0.35);',
      '    font-family: sans-serif;',
      '  }',
      '}'
    ].join('\n');

    if (!document.getElementById('ot-print-protection')) {
      document.head.appendChild(style);
    }
  }


  // ══════════════════════════════════════════════════════════════════════
  // 6. PROTECTION FORMULAIRE LOGIN — interception du bouton
  // S'active automatiquement sur la page index.html.
  // Intercepte handleLogin() pour injecter la vérification de rate limit.
  // ══════════════════════════════════════════════════════════════════════

  function _initLoginProtection() {
    const btn = document.getElementById('btn-login');
    if (!btn) return; // Pas sur la page login

    // Conserver le handler original (défini inline dans index.html)
    const _originalOnClick = btn.onclick;

    btn.onclick = function(e) {
      const emailEl = document.getElementById('f-email');
      const email   = emailEl ? (emailEl.value || '').trim() : '';

      const check = checkLoginRateLimit(email);
      if (!check.allowed) {
        // Afficher le message via la fonction showError existante
        if (typeof showError === 'function') {
          showError('🚫 ' + check.message);
        } else {
          const errBox = document.getElementById('error-box');
          if (errBox) { errBox.textContent = '🚫 ' + check.message; errBox.classList.add('show'); }
        }
        return false;
      }
      // Déléguer au handler original
      if (typeof _originalOnClick === 'function') return _originalOnClick.call(this, e);
    };

    // Intercepter aussi la touche Entrée
    document.addEventListener('keydown', function(e) {
      if (e.key !== 'Enter') return;
      const forgotOpen  = document.getElementById('modal-forgot')?.classList.contains('open');
      const contactOpen = document.getElementById('modal-contact')?.classList.contains('open');
      if (forgotOpen || contactOpen) return;

      const emailEl = document.getElementById('f-email');
      const email   = emailEl ? (emailEl.value || '').trim() : '';
      const check   = checkLoginRateLimit(email);

      if (!check.allowed) {
        e.stopImmediatePropagation(); // Bloquer le listener Enter de index.html
        if (typeof showError === 'function') {
          showError('🚫 ' + check.message);
        }
      }
    }, true); // capture = true pour intercepter avant le listener de index.html
  }


  // ══════════════════════════════════════════════════════════════════════
  // 7. AUDIT LOG — actions métier sensibles
  // Appel manuel depuis les pages pour tracer les opérations critiques.
  // Exemple : OT_SECURITY.auditLog('delete_chauffeur', 'chauffeurs', id)
  // ══════════════════════════════════════════════════════════════════════

  async function auditLog(action, tableName, recordId, extraData) {
    const cid = _getCompanyId();
    if (!cid) return; // Pas de log pour mode demo ou non connecté

    try {
      await fetch(SB + '/rest/v1/audit_log', {
        method:  'POST',
        headers: { ..._getAuthHeaders(), 'Prefer': 'return=minimal' },
        body:    JSON.stringify({
          company_id: cid,
          action,
          table_name: tableName || null,
          record_id:  recordId  ? String(recordId) : null,
          new_data:   extraData ? extraData : null,
          user_agent: navigator.userAgent.substring(0, 200),
          created_at: new Date().toISOString()
        })
      });
    } catch(e) { /* silent — ne jamais bloquer l'UX pour un log */ }
  }


  // ══════════════════════════════════════════════════════════════════════
  // INIT AUTOMATIQUE
  // ══════════════════════════════════════════════════════════════════════

  function _init() {
    _initStorageWatcher();
    _initPrintWatermark();
    _initLoginProtection(); // No-op si pas sur index.html
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }


  // ── API publique ─────────────────────────────────────────────────────
  return {
    // Rate limiting login
    checkLoginRateLimit,
    recordLoginAttempt,

    // Intégrité session
    sealSession,
    checkSessionIntegrity,

    // Logging
    logSecurityEvent,
    auditLog,
  };

})();
