// ═══════════════════════════════════════════════════════════════
// T SERVICE & CO — PWA Register v1.0
// À inclure dans TOUTES les pages : <script src="/pwa-register.js"></script>
// Juste avant </body>
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // ── 1. Enregistrement du Service Worker ─────────────────────
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(function (reg) {
          // Vérifier les mises à jour au plus 1 fois toutes les 10 minutes
          // (au lieu de chaque chargement de page) — gain de latence.
          try {
            var THROTTLE_MS = 10 * 60 * 1000;
            var lastCheck = parseInt(localStorage.getItem('ot_last_sw_check') || '0', 10);
            if (!lastCheck || Date.now() - lastCheck > THROTTLE_MS) {
              localStorage.setItem('ot_last_sw_check', String(Date.now()));
              reg.update();
            }
          } catch (e) { reg.update(); }
          // Écoute les mises à jour disponibles
          reg.addEventListener('updatefound', function () {
            var nw = reg.installing;
            nw.addEventListener('statechange', function () {
              if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                _showUpdateToast();
              }
            });
          });
        })
        .catch(function (err) {
          console.warn('[PWA] SW non enregistré :', err);
        });

      // Rechargement auto après activation d'une nouvelle version
      var refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (!refreshing) { refreshing = true; window.location.reload(); }
      });
    });
  }

  // ── 2. Bannière "Installer l'app" ────────────────────────────
  var _deferred = null;

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    _deferred = e;
    _showInstallBanner();
  });

  window.addEventListener('appinstalled', function () {
    _deferred = null;
    _hideInstallBanner();
  });

  function _showInstallBanner() {
    // Ne pas afficher si déjà installée (mode standalone)
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if (window.navigator.standalone === true) return;
    // Ne pas afficher si refusée il y a moins de 7 jours
    var dismissed = localStorage.getItem('ot_pwa_dismissed');
    if (dismissed && Date.now() - parseInt(dismissed) < 7 * 86400000) return;
    // Ne pas afficher si déjà présente
    if (document.getElementById('ot-install-banner')) return;

    var el = document.createElement('div');
    el.id = 'ot-install-banner';
    el.innerHTML = [
      '<style>',
      '@keyframes _otSlideUp{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}',
      '#ot-install-banner{',
      '  position:fixed;bottom:72px;left:12px;right:12px;',
      '  background:#0F2040;border:1px solid rgba(245,166,35,0.35);border-radius:14px;',
      '  padding:14px 16px;display:flex;align-items:center;gap:12px;',
      '  z-index:9990;box-shadow:0 8px 32px rgba(0,0,0,0.5);',
      '  animation:_otSlideUp 0.3s ease;font-family:Outfit,sans-serif;',
      '}',
      '</style>',
      '<span style="font-size:26px;flex-shrink:0">🚐</span>',
      '<div style="flex:1;min-width:0">',
      '  <div style="font-family:\'Bebas Neue\',sans-serif;font-size:15px;color:#fff;letter-spacing:1px">T SERVICE & CO</div>',
      '  <div style="font-size:11px;color:#8A9BB5;margin-top:1px">Installer sur votre téléphone</div>',
      '</div>',
      '<button id="ot-install-btn" style="',
      '  background:linear-gradient(135deg,#F5A623,#FF6B35);border:none;border-radius:8px;',
      '  padding:8px 14px;font-family:Outfit,sans-serif;font-size:12px;font-weight:700;',
      '  color:#0A1628;cursor:pointer;white-space:nowrap;flex-shrink:0',
      '">Installer</button>',
      '<button id="ot-dismiss-btn" style="',
      '  background:none;border:none;color:#8A9BB5;font-size:18px;',
      '  cursor:pointer;padding:4px;flex-shrink:0;line-height:1',
      '">✕</button>',
    ].join('');

    document.body.appendChild(el);

    document.getElementById('ot-install-btn').addEventListener('click', function () {
      if (_deferred) {
        _deferred.prompt();
        _deferred.userChoice.then(function () { _deferred = null; _hideInstallBanner(); });
      }
    });
    document.getElementById('ot-dismiss-btn').addEventListener('click', function () {
      localStorage.setItem('ot_pwa_dismissed', String(Date.now()));
      _hideInstallBanner();
    });
  }

  function _hideInstallBanner() {
    var el = document.getElementById('ot-install-banner');
    if (el) {
      el.style.transition = 'all 0.2s ease';
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px)';
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
    }
  }

  // ── 3. Toast "Nouvelle version disponible" ──────────────────
  function _showUpdateToast() {
    if (document.getElementById('ot-update-toast')) return;
    var t = document.createElement('div');
    t.id = 'ot-update-toast';
    t.style.cssText = [
      'position:fixed;bottom:80px;left:12px;right:12px;',
      'background:#142952;border:1px solid rgba(26,79,191,0.4);border-radius:12px;',
      'padding:12px 16px;display:flex;align-items:center;gap:10px;',
      'z-index:9991;font-family:Outfit,sans-serif;font-size:13px;color:#E8EDF5;',
      'box-shadow:0 4px 20px rgba(0,0,0,0.4);',
    ].join('');
    t.innerHTML = [
      '<span style="font-size:20px">🔄</span>',
      '<span style="flex:1">Nouvelle version disponible</span>',
      '<button onclick="window.location.reload()" style="',
      '  background:#1A4FBF;border:none;border-radius:7px;padding:6px 12px;',
      '  color:#fff;font-family:Outfit,sans-serif;font-size:12px;font-weight:600;cursor:pointer',
      '">Mettre à jour</button>',
    ].join('');
    document.body.appendChild(t);
    // Auto-disparaît après 12 secondes
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 12000);
  }

  // ── 4. Badge hors-connexion ──────────────────────────────────
  function _updateOnline() {
    var existing = document.getElementById('ot-offline-badge');
    if (!navigator.onLine) {
      if (!existing) {
        var b = document.createElement('div');
        b.id = 'ot-offline-badge';
        b.style.cssText = [
          'position:fixed;top:8px;left:50%;transform:translateX(-50%);',
          'background:#E74C3C;color:#fff;',
          'font-family:Outfit,sans-serif;font-size:11px;font-weight:700;',
          'padding:4px 16px;border-radius:20px;z-index:9992;letter-spacing:0.5px;',
          'box-shadow:0 2px 12px rgba(231,76,60,0.4);',
        ].join('');
        b.textContent = '📵 Hors connexion';
        document.body.appendChild(b);
      }
    } else {
      if (existing) existing.parentNode.removeChild(existing);
    }
  }

  window.addEventListener('online',  _updateOnline);
  window.addEventListener('offline', _updateOnline);
  _updateOnline();

}());
