/**
 * OT_GPS_PERSISTENT.JS — Suivi GPS persistant cross-pages
 * S'active automatiquement pour les chauffeurs avec addon_tracking.
 * Persiste la localisation entre les navigations de pages.
 *
 * API publique : window.OT_GPS
 *   .start()           — Démarre le suivi GPS
 *   .stop()            — Arrête le suivi + envoie statut "fin"
 *   .isActive()        — Retourne true si le suivi est actif
 *   .setStatut(st)     — Change le statut (en_route, livraison, pause, fin)
 *   .getStatut()       — Retourne le statut courant
 *   .getLastPosition() — Retourne { lat, lng, speed, heading, time } ou null
 *   .onUpdate(cb)      — Enregistre un callback pour les mises à jour de position
 */
(function() {
  'use strict';

  var SB  = 'https://kfdyqcbclueppmvkccdz.supabase.co';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmZHlxY2JjbHVlcHBtdmtjY2R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMjAxNTQsImV4cCI6MjA5NDc5NjE1NH0.gj0eT27HcdkPw6fTZRBbSflVv5Yh1SPA9o8vAAiX_CU';

  var _watchId    = null;
  var _active     = false;
  var _sendTimer  = null;
  var _histCounter = 0;
  var _wakeLock   = null;
  var _lastPos    = null;
  var _callbacks  = [];
  // Compteurs pour le diagnostic (visibles via OT_GPS.diagnose())
  var _sendOk     = 0;
  var _sendErr    = 0;
  var _lastErr    = null;
  var _lastOkAt   = null;
  // ID de la ligne chauffeurs (CRM) — cible de la FK driver_locations.chauffeur_id.
  // On résout une fois au 1er envoi et on met en cache.
  var _chauffeurCrmId = null;

  // ── Helpers session ──
  function _getSession() {
    var raw = localStorage.getItem('ot_session') || sessionStorage.getItem('ot_session');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch(e) { return null; }
  }

  // ── Statut persistant (survit aux navigations) ──
  function _getStatut() {
    return localStorage.getItem('ot_gps_statut') || 'en_route';
  }
  function _setStatut(st) {
    localStorage.setItem('ot_gps_statut', st);
  }

  // ── Flag d'arrêt explicite (sessionStorage = durée de la session navigateur) ──
  function _isExplicitlyStopped() {
    return sessionStorage.getItem('ot_gps_stopped') === '1';
  }
  function _markStopped(v) {
    if (v) sessionStorage.setItem('ot_gps_stopped', '1');
    else sessionStorage.removeItem('ot_gps_stopped');
  }

  // ── Conditions de tracking ──
  function _shouldTrack() {
    var s = _getSession();
    if (!s) return false;
    if (s.role !== 'chauffeur' && s.role !== 'chef_equipe') return false;
    if (s.addon_tracking !== true) return false;
    return true;
  }

  // Retourne la raison précise pour laquelle le tracking n'est pas actif.
  // Utilisé par OT_GPS.diagnose() pour faciliter le debug côté chauffeur.
  function _whyNotTracking() {
    var s = _getSession();
    if (!s) return 'session absente (utilisateur non connecté)';
    if (s.role !== 'chauffeur' && s.role !== 'chef_equipe') {
      return 'rôle non autorisé : "' + (s.role || 'inconnu') + '" (attendu: chauffeur ou chef_equipe)';
    }
    if (s.addon_tracking !== true) {
      return 'addon_tracking désactivé pour cette entreprise — contacter l\'admin';
    }
    if (_isExplicitlyStopped()) return 'GPS arrêté manuellement (cliquer sur "Démarrer" pour relancer)';
    if (!('geolocation' in navigator)) return 'navigateur sans support geolocation';
    return 'OK — devrait tracker';
  }

  // ── Mise à jour des indicateurs visuels (gps-live-dot, nav-gps) ──
  function _updateLiveDot() {
    var dot    = document.getElementById('gps-live-dot');
    var navGps = document.getElementById('nav-gps');
    if (dot) dot.style.display = _active ? 'block' : 'none';
    if (navGps) {
      if (_active) navGps.classList.add('gps-on');
      else navGps.classList.remove('gps-on');
    }
  }

  // Récupère l'id de la ligne `chauffeurs` (CRM) correspondant au chauffeur
  // connecté, pour satisfaire la FK driver_locations.chauffeur_id → chauffeurs.id.
  // Cache pour éviter un lookup à chaque tick. Fallback : auth_uid.
  async function _resolveCrmId(s) {
    if (_chauffeurCrmId) return _chauffeurCrmId;
    if (!s) return null;
    var cid = s.company_id || s.id;
    var nom = s.chauffeur_nom || s.name;
    if (!cid || !nom) return null;
    try {
      var r = await fetch(
        SB + '/rest/v1/chauffeurs?company_id=eq.' + cid +
        '&nom=eq.' + encodeURIComponent(nom) + '&select=id&limit=1',
        { headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + (s.token || KEY) } }
      );
      if (r.ok) {
        var data = await r.json();
        if (Array.isArray(data) && data[0] && data[0].id) {
          _chauffeurCrmId = data[0].id;
          return _chauffeurCrmId;
        }
      }
    } catch(e) { console.warn('[OT_GPS] _resolveCrmId failed:', e); }
    return null;
  }

  // Assure un token JWT frais. Le token expire après 1h, or le GPS tourne
  // potentiellement pendant toute une journée sans reload de page.
  // Sans ce refresh, les upserts retournaient 401 en silence → chauffeur
  // invisible côté admin.
  async function _ensureFreshToken() {
    var s = _getSession();
    if (!s || !s.token_expires_at) return s;
    // Refresh si le token expire dans moins de 5 min
    if (Date.now() + 300000 >= s.token_expires_at) {
      try {
        if (typeof OT !== 'undefined' && OT.refreshSession) {
          await OT.refreshSession();
          return _getSession();
        }
      } catch(e) { console.warn('[OT_GPS] refreshSession failed:', e); }
    }
    return s;
  }

  // ── Envoi de position vers Supabase ──
  async function _sendPosition(lat, lng, spd, hdg) {
    var s = await _ensureFreshToken();
    if (!s) return;
    var cid = s.company_id || s.id;
    // FK driver_locations.chauffeur_id → chauffeurs.id → il faut la CRM id,
    // pas l'auth_uid. _resolveCrmId met en cache et fallback vers auth_uid.
    var crmId = await _resolveCrmId(s);
    var uid = crmId || s.user_id || s.id;
    var nom = s.chauffeur_nom || s.name || 'Chauffeur';
    var statut = _getStatut();
    fetch(SB + '/rest/v1/driver_locations?on_conflict=company_id,chauffeur_id', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': KEY,
        'Authorization': 'Bearer ' + (s.token || KEY),
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({
        company_id: cid, chauffeur_id: uid, chauffeur_nom: nom,
        latitude: lat, longitude: lng, vitesse: spd, cap: hdg,
        statut: statut, updated_at: new Date().toISOString()
      })
    }).then(function(r) {
      if (r && r.ok) { _sendOk++; _lastOkAt = new Date().toISOString(); }
      else {
        _sendErr++;
        _lastErr = { status: r ? r.status : 0, at: new Date().toISOString() };
        if (r) r.text().then(function(t){ _lastErr.body = (t || '').substring(0, 200); }).catch(function(){});
        console.warn('[OT_GPS] upsert driver_locations failed:', _lastErr);
      }
    }).catch(function(e) {
      _sendErr++;
      _lastErr = { networkError: String(e), at: new Date().toISOString() };
      console.warn('[OT_GPS] upsert driver_locations network error:', e);
    });

    // Historique : 1 écriture toutes les 5 positions (~60s)
    _histCounter++;
    if (_histCounter % 5 === 0) {
      _saveHistory(lat, lng, statut);
    }
  }

  async function _saveHistory(lat, lng, statut) {
    var s = await _ensureFreshToken();
    if (!s) return;
    var cid = s.company_id || s.id;
    var crmId = await _resolveCrmId(s);
    var uid = crmId || s.user_id || s.id;
    var nom = s.chauffeur_nom || s.name || 'Chauffeur';
    fetch(SB + '/rest/v1/driver_positions_history', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': KEY,
        'Authorization': 'Bearer ' + (s.token || KEY),
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        company_id: cid, chauffeur_id: uid, chauffeur_nom: nom,
        latitude: lat, longitude: lng, statut: statut
      })
    }).catch(function() {});
  }

  // ── START ──
  function start() {
    if (!navigator.geolocation || _active) return false;
    if (!_shouldTrack()) return false;

    _active = true;
    _markStopped(false);
    _updateLiveDot();

    // Screen Wake Lock
    if ('wakeLock' in navigator) {
      navigator.wakeLock.request('screen').then(function(wl) {
        _wakeLock = wl;
      }).catch(function() {});
    }

    _watchId = navigator.geolocation.watchPosition(
      function(pos) {
        var lat = pos.coords.latitude;
        var lng = pos.coords.longitude;
        var spd = pos.coords.speed != null ? Math.round(pos.coords.speed * 3.6) : 0;
        var hdg = pos.coords.heading != null ? Math.round(pos.coords.heading) : 0;
        _lastPos = { lat: lat, lng: lng, speed: spd, heading: hdg, time: new Date() };

        // Notifier les callbacks UI
        for (var i = 0; i < _callbacks.length; i++) {
          try { _callbacks[i](_lastPos); } catch(e) {}
        }

        // Throttle : 1 envoi toutes les 12s
        if (!_sendTimer) {
          _sendPosition(lat, lng, spd, hdg);
          _sendTimer = setTimeout(function() { _sendTimer = null; }, 12000);
        }
      },
      function(err) {
        console.warn('[OT_GPS] geolocation error:', err && (err.message || err.code));
        _active = false;
        _updateLiveDot();
        for (var i = 0; i < _callbacks.length; i++) {
          try { _callbacks[i](null, err); } catch(e) {}
        }
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );

    return true;
  }

  // ── STOP ──
  function stop(sendFin) {
    if (_watchId !== null) { navigator.geolocation.clearWatch(_watchId); _watchId = null; }
    if (_sendTimer) { clearTimeout(_sendTimer); _sendTimer = null; }
    if (_wakeLock) { _wakeLock.release().catch(function() {}); _wakeLock = null; }
    _histCounter = 0;
    var wasActive = _active;
    _active = false;
    _lastPos = null;
    _updateLiveDot();

    if (sendFin && wasActive) {
      _markStopped(true);
      var s = _getSession();
      if (s) {
        var cid = s.company_id || s.id;
        var uid = s.user_id || s.id;
        var nom = s.chauffeur_nom || s.name || 'Chauffeur';
        fetch(SB + '/rest/v1/driver_locations?on_conflict=company_id,chauffeur_id', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': KEY,
            'Authorization': 'Bearer ' + (s.token || KEY),
            'Prefer': 'resolution=merge-duplicates,return=minimal'
          },
          body: JSON.stringify({
            company_id: cid, chauffeur_id: uid, chauffeur_nom: nom,
            latitude: 0, longitude: 0, vitesse: 0, cap: 0,
            statut: 'fin', updated_at: new Date().toISOString()
          })
        }).catch(function() {});
      }
    }
  }

  // ── Nettoyage à la navigation (pas de "fin") ──
  window.addEventListener('beforeunload', function() {
    if (_watchId !== null) { navigator.geolocation.clearWatch(_watchId); _watchId = null; }
    if (_sendTimer) { clearTimeout(_sendTimer); _sendTimer = null; }
    if (_wakeLock) { _wakeLock.release().catch(function() {}); _wakeLock = null; }
  });

  // ── Auto-démarrage ──
  function _autoInit() {
    if (_active) return;
    if (_isExplicitlyStopped()) {
      console.log('[OT_GPS] auto-init ignoré : GPS explicitement arrêté (localStorage ot_gps_stopped=1)');
      return;
    }
    if (!_shouldTrack()) {
      // Retry une fois après 3s — la session peut ne pas encore avoir addon_tracking
      // (ajouté par refreshSession() qui s'exécute après DOMContentLoaded)
      if (!_autoInit._retried) {
        _autoInit._retried = true;
        setTimeout(_autoInit, 3000);
        return;
      }
      console.warn('[OT_GPS] tracking non démarré — raison :', _whyNotTracking());
      return;
    }
    console.log('[OT_GPS] démarrage automatique…');
    start();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _autoInit);
  } else {
    _autoInit();
  }

  // ── API publique ──
  window.OT_GPS = {
    start: function() {
      _markStopped(false);
      return start();
    },
    stop: function() {
      stop(true);
    },
    isActive: function() {
      return _active;
    },
    setStatut: function(st) {
      _setStatut(st);
      if (_active && _lastPos) {
        _sendPosition(_lastPos.lat, _lastPos.lng, _lastPos.speed, _lastPos.heading);
      }
    },
    getStatut: _getStatut,
    getLastPosition: function() { return _lastPos; },
    onUpdate: function(cb) {
      if (typeof cb === 'function') _callbacks.push(cb);
    },
    // Diagnostic — à appeler depuis la console pour comprendre pourquoi le GPS
    // ne tracke pas. Retourne un objet résumant l'état.
    diagnose: function() {
      var s = _getSession();
      var info = {
        active: _active,
        explicitlyStopped: _isExplicitlyStopped(),
        reason: _whyNotTracking(),
        session: s ? {
          role: s.role,
          addon_tracking: s.addon_tracking,
          company_id: s.company_id,
          chauffeur_nom: s.chauffeur_nom || s.name,
          user_id: s.user_id || s.id,
          token_expires_at: s.token_expires_at ? new Date(s.token_expires_at).toISOString() : null,
          token_expired: s.token_expires_at ? (Date.now() >= s.token_expires_at) : null
        } : null,
        lastPosition: _lastPos,
        statut: _getStatut(),
        uploads: {
          ok: _sendOk,
          err: _sendErr,
          lastOkAt: _lastOkAt,
          lastErr: _lastErr
        },
        chauffeurCrmId: _chauffeurCrmId
      };
      console.log('[OT_GPS] diagnostic :', info);
      return info;
    },
    // Utilisé par OT.logout() pour arrêter proprement
    _cleanup: function() {
      stop(true);
    }
  };

})();
