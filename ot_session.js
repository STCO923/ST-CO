// OT_SESSION.JS - Gestionnaire de session T SERVICE & CO
// v3.0 - Fix addon_saisie : refresh bloquant, pas de throttle, company_id correct

const OT = (() => {

  const SB  = 'https://kfdyqcbclueppmvkccdz.supabase.co';
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmZHlxY2JjbHVlcHBtdmtjY2R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMjAxNTQsImV4cCI6MjA5NDc5NjE1NH0.gj0eT27HcdkPw6fTZRBbSflVv5Yh1SPA9o8vAAiX_CU';

  const PUBLIC_PAGES    = ['index.html', 'optimum_trans_legal.html'];
  const SUPERADMIN_PAGE = 'optimum_trans_superadmin.html';

  function getSession() {
    const raw = localStorage.getItem('ot_session') || sessionStorage.getItem('ot_session');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch(e) { return null; }
  }

  function authHeaders() {
    const s = getSession();
    const token = (s && s.token) ? s.token : KEY;
    return { 'Content-Type':'application/json', 'apikey':KEY, 'Authorization':'Bearer '+token };
  }

  function anonHeaders() {
    return { 'Content-Type':'application/json', 'apikey':KEY, 'Authorization':'Bearer '+KEY };
  }

  const PLAN_MODULES = {
    starter:  { planning:true, saisie:true,  dashboard:true, clients:true, parametres:true, rh:true, vehicules:true,  whatsapp:false, whatsapp_recap:false, facturation:false, chauffeurs:false, gazole:false, feuille_route:false },
    pro:      { planning:true, saisie:true,  dashboard:true, clients:true, parametres:true, rh:true, vehicules:true,  whatsapp:true,  whatsapp_recap:false, facturation:true,  chauffeurs:true,  gazole:false, feuille_route:false },
    business: { planning:true, saisie:true,  dashboard:true, clients:true, parametres:true, rh:true, vehicules:true,  whatsapp:true,  whatsapp_recap:true,  facturation:true,  chauffeurs:true,  gazole:true,  feuille_route:false }
  };

  function can(feature) {
    const s = getSession();
    if (!s) return false;
    if (s.id === 'demo') { if (feature === 'saisie' || feature === 'feuille_route' || feature === 'tracking' || feature === 'monmarche') return false; return true; }
    if (feature === 'feuille_route') return s.addon_route === true;
    if (feature === 'monmarche') return s.addon_monmarche === true;
    if (feature === 'dispatch') return s.addon_dispatch === true;
    if (feature === 'tracking') return s.addon_tracking === true;
    if (feature === 'decompte_st') return s.addon_decompte_st === true;
    if (feature === 'zone_billing') return s.addon_zone === true;
    if (feature === 'etat_vehicule') return s.addon_etat_vehicule === true;
    // addon_saisie : false en base = désactivé, tout autre valeur = activé
    if (feature === 'saisie') return s.addon_saisie === true;
    return (PLAN_MODULES[s.plan] || PLAN_MODULES.starter)[feature] === true;
  }

  function applyPlanRestrictions() {
    const s = getSession();
    if (!s) return;

    document.querySelectorAll('a[href="' + SUPERADMIN_PAGE + '"]').forEach(function(el) {
      el.style.display = 'none';
    });

    var rules = [
      { href: 'optimum_trans_feuille_route.html',       feature: 'feuille_route' },
      { href: 'optimum_trans_vehicules.html',            feature: 'vehicules'     },
      { href: 'optimum_trans_chauffeurs.html',           feature: 'chauffeurs'    },
      { href: 'optimum_trans_gazole.html',               feature: 'gazole'        },
      { href: 'optimum_trans_saisie.html',               feature: 'saisie'        },
      { href: 'monmarche.html',                          feature: 'monmarche'     },
      { href: 'optimum_trans_dispatch.html',             feature: 'dispatch'      },
      { href: 'optimum_trans_suivi_chauffeurs.html',     feature: 'tracking'      },
      { href: 'optimum_trans_gps_chauffeur.html',        feature: 'tracking'      },
      { href: 'optimum_trans_decompte_st.html',          feature: 'decompte_st'   },
      { href: 'optimum_trans_etat_vehicule.html',        feature: 'etat_vehicule' },
    ];

    rules.forEach(function(rule) {
      document.querySelectorAll('a[href="' + rule.href + '"]').forEach(function(el) {
        el.style.display = can(rule.feature) ? '' : 'none';
      });
    });

    // Mon GPS (Chauffeur) : visible uniquement pour le rôle chauffeur
    var userRole = s.role || 'admin';
    document.querySelectorAll('a[href="optimum_trans_gps_chauffeur.html"]').forEach(function(el) {
      el.style.display = (can('tracking') && userRole === 'chauffeur') ? '' : 'none';
    });

    // Suivi Temps Réel : visible pour admin et chef_equipe uniquement (pas chauffeur)
    document.querySelectorAll('a[href="optimum_trans_suivi_chauffeurs.html"]').forEach(function(el) {
      el.style.display = (can('tracking') && userRole !== 'chauffeur') ? '' : 'none';
    });

    // IA pages : admin only (chef_equipe et chauffeur n'y ont pas accès)
    var userRole = s.role || 'admin';
    if (userRole === 'chef_equipe' || userRole === 'chauffeur') {
      ['optimum_trans_ia.html','optimum_trans_dispatch.html'].forEach(function(href) {
        document.querySelectorAll('a[href="' + href + '"]').forEach(function(el) { el.style.display = 'none'; });
      });
    }

    if (!can('whatsapp')) {
      document.querySelectorAll('.btn-wa').forEach(function(el) { el.style.display = 'none'; });
      var waBanner = document.getElementById('wa-banner');
      if (waBanner) waBanner.style.display = 'none';
      document.querySelectorAll('button, a').forEach(function(el) {
        var txt = (el.textContent || '').toLowerCase();
        var oc  = (el.getAttribute('onclick') || '').toLowerCase();
        if (txt.indexOf('whatsapp') >= 0 || oc.indexOf('whatsapp') >= 0 || oc.indexOf('wa.me') >= 0 || oc.indexOf('sendwa') >= 0 || oc.indexOf('sendallwa') >= 0) {
          el.style.display = 'none';
        }
      });
    }

    var avatarEl = document.querySelector('.user-avatar');
    var nameEl   = document.querySelector('.user-card > div > div:first-child');
    var planEl   = document.querySelector('.user-card > div > div:last-child');
    if (avatarEl && s.name) avatarEl.textContent = s.name.substring(0, 2).toUpperCase();
    if (nameEl && s.name) nameEl.textContent = s.name.length > 18 ? s.name.substring(0, 16) + '...' : s.name;
    if (planEl && s.plan) {
      var labels = { starter:'Essentiel', pro:'Pro', business:'Business' };
      var colors = { starter:'var(--gray)', pro:'#60A5FA', business:'#F5A623' };
      planEl.textContent = labels[s.plan] || s.plan;
      planEl.style.color = colors[s.plan] || 'var(--gray)';
    }

    if (s.status === 'suspended') _showSuspendedBanner();
  }

  function _showSuspendedBanner() {
    if (document.getElementById('ot-suspended-banner')) return;
    var banner = document.createElement('div');
    banner.id = 'ot-suspended-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:linear-gradient(135deg,#7f1d1d,#991b1b);color:#fecaca;padding:12px 24px;display:flex;align-items:center;justify-content:space-between;font-family:Outfit,sans-serif;font-size:13px;font-weight:600;border-bottom:2px solid #ef4444;';
    banner.innerHTML = '<div>Compte suspendu — Contactez votre administrateur.</div><button onclick="OT.logout()" style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);border-radius:8px;padding:6px 14px;color:#fff;cursor:pointer;font-family:Outfit,sans-serif;font-size:12px;">Se déconnecter</button>';
    document.body.prepend(banner);
    var main = document.querySelector('.main');
    if (main) main.style.marginTop = '52px';
  }

  function requireLogin() {
    var logged = localStorage.getItem('ot_logged') || sessionStorage.getItem('ot_logged');
    var session = getSession();
    if (!logged || !session) {
      var currentPage = window.location.pathname.split('/').pop() || 'index.html';
      var isPublic = PUBLIC_PAGES.some(function(p) { return currentPage.indexOf(p) >= 0; });
      if (!isPublic) {
        var hash = window.location.hash;
        if (hash && hash.indexOf('access_token') >= 0) return true;
        window.location.href = window.location.origin + '/index.html';
      }
      return false;
    }
    return true;
  }

  function requireAddon(feature) {
    if (!can(feature)) {
      var labels = {
        feuille_route: 'Feuille de Route (Addon +59,99EUR/mois)',
        dispatch:      'IA Dispatch (Addon +59,99EUR/mois)',
        tracking:      'Suivi Chauffeurs Temps Réel (Addon +29,99EUR/mois)',
        vehicules:     'Parc Véhicules (Plan Pro ou supérieur)',
        chauffeurs:    'Chauffeurs & Salaires (Plan Business)',
        gazole:        'Suivi Gazole (Plan Business)',
        whatsapp:      'Envoi WhatsApp (Plan Pro ou supérieur)',
        saisie:        'Saisie Tournées (désactivé par votre administrateur)',
        decompte_st:   'Décompte Sous-Traitants (Addon)',
        etat_vehicule: 'État des Lieux Véhicules (Addon +19,99EUR/mois)',
      };
      _showAccessDenied(labels[feature] || feature);
      return false;
    }
    return true;
  }

  function _showAccessDenied(featureLabel) {
    document.body.innerHTML = '<div style="font-family:Outfit,sans-serif;background:#0A1628;color:#E8EDF5;min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;"><div style="max-width:440px"><div style="font-size:64px;margin-bottom:20px">&#128274;</div><div style="font-family:\'Bebas Neue\',sans-serif;font-size:28px;color:#fff;letter-spacing:2px;margin-bottom:10px">ACCÈS RESTREINT</div><div style="font-size:14px;color:#8A9BB5;margin-bottom:8px">Cette fonctionnalité n\'est pas incluse dans votre forfait actuel.</div><div style="background:rgba(245,166,35,0.1);border:1px solid rgba(245,166,35,0.3);border-radius:10px;padding:12px 16px;margin:16px 0;font-size:13px;color:#F5A623;font-weight:600">&#128275; ' + featureLabel + '</div><button onclick="window.history.back()" style="background:linear-gradient(135deg,#1A4FBF,#2563EB);color:#fff;border:none;border-radius:10px;padding:12px 28px;font-family:Outfit,sans-serif;font-size:14px;font-weight:600;cursor:pointer;margin-right:8px">Retour</button><button onclick="window.location.href=\'optimum_trans_dashboard.html\'" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#E8EDF5;border-radius:10px;padding:12px 28px;font-family:Outfit,sans-serif;font-size:14px;font-weight:600;cursor:pointer">Dashboard</button></div></div>';
  }

  // REFRESH SESSION — sans throttle, bloquant, récupère addon_saisie
  async function refreshSession() {
    var s = getSession();
    if (!s || !s.id || s.id === 'demo') return;

    // Refresh JWT token if expired or expiring within 5 minutes
    var now = Date.now();
    if (s.refresh_token && (!s.token_expires_at || now + 900000 >= s.token_expires_at)) {
      try {
        var refR = await fetch(SB + '/auth/v1/token?grant_type=refresh_token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': KEY },
          body: JSON.stringify({ refresh_token: s.refresh_token })
        });
        if (refR.ok) {
          var refData = await refR.json();
          if (refData.access_token) {
            s = Object.assign({}, s, {
              token: refData.access_token,
              refresh_token: refData.refresh_token || s.refresh_token,
              token_expires_at: now + (refData.expires_in || 3600) * 1000
            });
            var store0 = localStorage.getItem('ot_session') ? localStorage : sessionStorage;
            store0.setItem('ot_session', JSON.stringify(s));
          }
        }
      } catch(e) { /* ignore token refresh errors */ }
    }

    try {
      var controller = new AbortController();
      var timeout = setTimeout(function() { controller.abort(); }, 4000);

      // Utiliser company_id (peut différer de id pour les sous-utilisateurs)
      var cid = s.company_id || s.id;

      var r = await fetch(SB + '/rest/v1/sa_companies?id=eq.' + cid + '&select=plan,addon_route,addon_saisie,addon_monmarche,addon_dispatch,addon_tracking,addon_decompte_st,addon_zone,addon_etat_vehicule,addon_stt,status,max_users,name', {
        headers: authHeaders(),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!r.ok) return;

      var data = await r.json();
      if (!Array.isArray(data) || !data[0]) return;

      var co = data[0];
      var updated = Object.assign({}, s, {
        plan:             co.plan             || s.plan,
        addon_route:      co.addon_route      === true,
        addon_monmarche:  co.addon_monmarche  === true,
        addon_dispatch:   co.addon_dispatch   === true,
        addon_tracking:   co.addon_tracking   === true,
        addon_decompte_st:   co.addon_decompte_st    === true,
        addon_zone:          co.addon_zone           === true,
        addon_etat_vehicule: co.addon_etat_vehicule  === true,
        addon_stt:           co.addon_stt            === true,
        // CRITIQUE : addon_saisie = true SEULEMENT si explicitement true en base
        addon_saisie:     co.addon_saisie     === true,
        status:           co.status           || s.status,
        max_users:        co.max_users        || s.max_users,
        name:             co.name             || s.name,
      });

      // Rôle chef_equipe : fixe via superadmin. Re-check de la promotion
      // temporaire "chef du jour" (table chef_equipe_jour) à chaque refresh
      // pour gérer le cas où la session traverse minuit (le chauffeur perd
      // automatiquement ses droits chef le lendemain sans avoir à se
      // reconnecter).
      var _baseRole = s.base_role || s.role;
      if (_baseRole === 'chauffeur' && s.chauffeur_nom) {
        try {
          var _today = new Date();
          var _todayStr = _today.getFullYear()+'-'+String(_today.getMonth()+1).padStart(2,'0')+'-'+String(_today.getDate()).padStart(2,'0');
          var _cid2 = s.company_id || s.id;
          var _cdjR2 = await fetch(
            SB + '/rest/v1/chef_equipe_jour?company_id=eq.' + _cid2 +
            '&date=eq.' + _todayStr +
            '&chauffeur_nom=eq.' + encodeURIComponent(s.chauffeur_nom) +
            '&limit=1',
            { headers: authHeaders() }
          );
          if (_cdjR2.ok) {
            var _cdjD2 = await _cdjR2.json();
            updated.role = (Array.isArray(_cdjD2) && _cdjD2.length > 0) ? 'chef_equipe' : _baseRole;
            updated.base_role = _baseRole;
          }
        } catch(e2) { /* ignore */ }
      }

      var store = localStorage.getItem('ot_session') ? localStorage : sessionStorage;
      store.setItem('ot_session', JSON.stringify(updated));

    } catch(e) {
      console.warn('[OT] refreshSession skipped:', e.name);
    }
  }

  async function logout() {
    if (!confirm('Se déconnecter ?')) return;
    // Arrêter le GPS persistant et envoyer statut "fin" avant de supprimer la session
    if (typeof OT_GPS !== 'undefined' && OT_GPS._cleanup) {
      try { OT_GPS._cleanup(); } catch(e) {}
    }
    // Nettoyer les flags GPS
    localStorage.removeItem('ot_gps_statut');
    sessionStorage.removeItem('ot_gps_stopped');
    var s = getSession();
    if (s && s.token) {
      try {
        await fetch(SB + '/auth/v1/logout', {
          method: 'POST',
          headers: { 'Content-Type':'application/json', 'apikey':KEY, 'Authorization':'Bearer '+s.token }
        });
      } catch(e) {}
    }
    ['ot_session','ot_logged','ot_email'].forEach(function(k) {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    });
    window.location.href = window.location.origin + '/index.html';
  }

  function companyFilter() {
    var s = getSession();
    if (!s || s.id === 'demo') return '';
    var cid = s.company_id || s.id;
    return 'company_id=eq.' + cid;
  }

  function getCompanyId() {
    var s = getSession();
    if (!s) return null;
    return s.company_id || s.id;
  }

  function getRole() {
    var s = getSession();
    return s ? (s.role || 'admin') : null;
  }

  function getChauffeurNom() {
    var s = getSession();
    return s ? s.chauffeur_nom : null;
  }

  // INIT — affichage immédiat avec session en cache, refresh en arrière-plan
  // Le lien Saisie est caché par défaut via CSS inline dans chaque page
  document.addEventListener('DOMContentLoaded', async function() {
    var currentPage = window.location.pathname.split('/').pop() || 'index.html';
    var isPublic = PUBLIC_PAGES.some(function(p) { return currentPage.indexOf(p) >= 0; });
    if (isPublic) return;
    if (!requireLogin()) return;

    // 1. Appliquer les restrictions immédiatement avec la session en cache
    //    (page utilisable instantanément, pas d'attente réseau).
    applyPlanRestrictions();

    // 2. Rafraîchir la session en arrière-plan, puis re-appliquer si le plan a changé
    refreshSession().then(function() {
      if (typeof OT_SECURITY !== 'undefined') OT_SECURITY.sealSession();
      applyPlanRestrictions();
    }).catch(function() {});

    // 3. Si on est sur la page saisie mais qu'elle est désactivée → rediriger
    if (currentPage.indexOf('saisie') >= 0 && !can('saisie')) {
      window.location.href = 'optimum_trans_dashboard.html';
    }
    // 4. Si on est sur la page monmarche mais sans addon → rediriger
    if (currentPage.indexOf('monmarche') >= 0 && !can('monmarche')) {
      window.location.href = 'optimum_trans_dashboard.html';
    }
  });

  return {
    getSession:     getSession,
    authHeaders:    authHeaders,
    anonHeaders:    anonHeaders,
    can:            can,
    logout:         logout,
    requireLogin:   requireLogin,
    requireAddon:   requireAddon,
    companyFilter:  companyFilter,
    getCompanyId:   getCompanyId,
    refreshSession: refreshSession,
    getRole:        getRole,
    getChauffeurNom:getChauffeurNom,
  };

})();

function logout() { OT.logout(); }

// ── Raccourci superadmin Ctrl+Shift+A (toutes les pages) ─────
document.addEventListener('keydown', function(e) {
  if (e.ctrlKey && e.shiftKey && e.key === 'S') {
    var _r = localStorage.getItem('ot_session') || sessionStorage.getItem('ot_session');
    var _s = null;
    try { _s = JSON.parse(_r || ''); } catch(_) {}
    if (_s && _s.id === 'f38392d8-984b-4124-ac07-b6fbda633b2d') {
      window.location.href = 'optimum_trans_superadmin.html';
    }
  }
});

// ── Détection mise à jour SW ──────────────────────────────────
function _showSwBanner() {
  if (document.getElementById('sw-update-banner')) return;
  var b = document.createElement('div');
  b.id = 'sw-update-banner';
  b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#27AE60;color:#fff;text-align:center;padding:10px 16px;font-family:Outfit,sans-serif;font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:12px;box-shadow:0 2px 8px rgba(0,0,0,0.3)';
  b.innerHTML = '🔄 Nouvelle version disponible <button onclick="otSwUpdate()" style="background:#fff;color:#27AE60;border:none;border-radius:6px;padding:5px 14px;font-weight:700;cursor:pointer;font-family:inherit;font-size:12px">Actualiser</button>';
  document.body.prepend(b);
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready.then(function(reg) {
    // Vérifier la mise à jour au plus 1 fois toutes les 10 min
    try {
      var THROTTLE_MS = 10 * 60 * 1000;
      var lastCheck = parseInt(localStorage.getItem('ot_last_sw_check') || '0', 10);
      if (!lastCheck || Date.now() - lastCheck > THROTTLE_MS) {
        localStorage.setItem('ot_last_sw_check', String(Date.now()));
        reg.update();
      }
    } catch(e) { reg.update(); }
    if (reg.waiting) { _showSwBanner(); }
    reg.addEventListener('updatefound', function() {
      var nw = reg.installing;
      nw.addEventListener('statechange', function() {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          _showSwBanner();
        }
      });
    });
  });
}
function otSwUpdate() {
  navigator.serviceWorker.ready.then(function(reg) {
    if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING');
    else window.location.reload();
  });
}
