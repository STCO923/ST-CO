/**
 * OT_MOBILE_NAV.JS v3.0 — Navigation mobile T SERVICE & CO
 * - 4 onglets principaux + bouton "Plus" (menu overlay)
 * - Icônes 24px, labels 10px — thumb-friendly
 * - Injection automatique de optimum_trans_mobile.css
 * - Auto-hide au scroll vers le bas, réapparaît au scroll vers le haut
 * - Respecte les permissions OT.can() (plan + addons)
 * - Feedback haptique léger au tap
 */
(function () {
  'use strict';

  var NAV_ID     = 'ot-mob-nav';
  var MORE_ID    = 'ot-mob-more';
  var OVERLAY_ID = 'ot-mob-overlay';
  var CSS_ID     = 'ot-mob-nav-css';

  /* ── CSS injecté ─────────────────────────────────────────────── */
  var CSS = [
    /* Barre principale */
    '#ot-mob-nav{',
      'position:fixed;bottom:0;left:0;right:0;',
      'height:70px;',
      'background:rgba(10,18,35,0.97);',
      'border-top:1px solid rgba(255,255,255,0.06);',
      'z-index:9000;',
      'padding-bottom:env(safe-area-inset-bottom,0px);',
      'box-shadow:0 -4px 24px rgba(0,0,0,0.5);',
      'transform:translateY(100%);',
      'transition:transform .3s cubic-bezier(.4,0,.2,1);',
      'display:none;',
      'backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);',
    '}',
    '#ot-mob-nav.omn-visible{transform:translateY(0);}',
    /* Inner flex — 5 colonnes égales */
    '#ot-mob-nav .omn-inner{',
      'display:flex;align-items:center;height:62px;',
      'padding:0 4px;gap:2px;',
    '}',
    /* Item de nav */
    '#ot-mob-nav .omn-item{',
      'display:flex;flex-direction:column;align-items:center;justify-content:center;',
      'gap:3px;flex:1;min-width:0;height:56px;',
      'cursor:pointer;text-decoration:none;',
      'color:rgba(255,255,255,0.42);',
      'border-radius:14px;padding:4px 6px;',
      '-webkit-tap-highlight-color:transparent;user-select:none;',
      'transition:color .15s,background .15s,transform .1s;',
      'font-family:Outfit,system-ui,sans-serif;',
    '}',
    '#ot-mob-nav .omn-item:active{transform:scale(.90);}',
    /* État actif */
    '#ot-mob-nav .omn-item.omn-active{',
      'color:#4F91FF;',
      'background:rgba(79,145,255,0.14);',
    '}',
    '#ot-mob-nav .omn-item.omn-active .omn-icon{transform:translateY(-1px);}',
    /* Bouton Plus actif (page secondaire) */
    '#ot-mob-nav .omn-more-btn.omn-more-active{color:#4F91FF;}',
    /* Icône & label */
    '#ot-mob-nav .omn-icon{font-size:24px;line-height:1;transition:transform .15s;}',
    '#ot-mob-nav .omn-label{',
      'font-size:10px;font-weight:700;letter-spacing:.3px;',
      'text-transform:uppercase;white-space:nowrap;',
      'overflow:hidden;text-overflow:ellipsis;max-width:100%;',
    '}',

    /* ── Menu "Plus" ── */
    '#ot-mob-more{',
      'display:none;position:fixed;',
      'bottom:78px;left:8px;right:8px;',
      'background:rgba(12,28,60,0.98);',
      'border:1px solid rgba(255,255,255,0.1);',
      'border-radius:22px;padding:14px;',
      'z-index:8999;',
      'box-shadow:0 -8px 40px rgba(0,0,0,0.65);',
      'grid-template-columns:repeat(3,1fr);gap:8px;',
      'backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);',
    '}',
    '#ot-mob-more.omn-more-open{display:grid;}',
    /* Items dans le menu Plus */
    '.omn-more-item{',
      'display:flex;flex-direction:column;align-items:center;gap:6px;',
      'padding:16px 8px;border-radius:16px;min-height:76px;',
      'text-decoration:none;color:#fff;',
      'background:rgba(255,255,255,0.04);',
      'border:1px solid rgba(255,255,255,0.07);',
      'font-size:11px;font-weight:700;font-family:Outfit,sans-serif;',
      'text-transform:uppercase;letter-spacing:.4px;',
      'cursor:pointer;-webkit-tap-highlight-color:transparent;',
      'transition:background .15s,transform .1s;',
      'text-align:center;',
    '}',
    '.omn-more-item:active{background:rgba(26,79,191,0.28);transform:scale(.95);}',
    '.omn-more-item.omn-more-active-item{',
      'background:rgba(79,145,255,0.18);',
      'border-color:rgba(79,145,255,0.3);',
      'color:#4F91FF;',
    '}',
    '.omn-more-icon{font-size:26px;line-height:1;}',

    /* ── Overlay sombre derrière le menu Plus ── */
    /* pointer-events:none évite le bug iOS où backdrop-filter bloque les taps même caché */
    '#ot-mob-overlay{',
      'display:none;pointer-events:none;position:fixed;inset:0;',
      'z-index:8998;',
      'background:rgba(0,0,0,0.45);',
      'backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);',
    '}',
    '#ot-mob-overlay.omn-overlay-open{display:block;pointer-events:auto;}',

    /* ── Masquer les anciennes navbars ── */
    '.mobile-navbar{display:none!important;}',
    '.mob-more-menu{display:none!important;}',
    '.mob-overlay{display:none!important;}',

    /* ── Règles mobile ── */
    '@media(max-width:768px){',
      '#ot-mob-nav{display:block;}',
      '.main,.main-content,main{padding-bottom:max(90px,calc(72px + env(safe-area-inset-bottom,16px)))!important;}',
      '.sidebar{display:none!important;}',
      '.main,.content{margin-left:0!important;}',
    '}',
  ].join('');

  /* ── Données de navigation ──────────────────────────────────── */
  var ALL_ITEMS = [
    { href:'optimum_trans_dashboard.html',     icon:'🏠', label:'Accueil',    feature:null            },
    { href:'optimum_trans_planning.html',      icon:'📆', label:'Planning',   feature:'planning'      },
    { href:'optimum_trans_clients.html',       icon:'📊', label:'Clients',    feature:'clients'       },
    { href:'optimum_trans_chauffeurs.html',    icon:'👷', label:'Chauffeurs', feature:'chauffeurs'    },
    { href:'optimum_trans_saisie.html',        icon:'📝', label:'Saisie',     feature:'saisie'        },
    { href:'optimum_trans_feuille_route.html', icon:'🗺️', label:'Route',      feature:'feuille_route' },
    { href:'optimum_trans_rh.html',            icon:'👔', label:'RH',         feature:null            },
    { href:'optimum_trans_gazole.html',        icon:'⛽', label:'Gazole',     feature:'gazole'        },
    { href:'optimum_trans_vehicules.html',     icon:'🚐', label:'Véhicules',  feature:'vehicules'     },
    { href:'amende.html',                      icon:'🚔', label:'Amendes',    feature:null            },
    { href:'optimum_trans_ia.html',            icon:'🤖', label:'IA Analyst', feature:null            },
    { href:'optimum_trans_dispatch.html',     icon:'🧠', label:'Dispatch',   feature:'dispatch'      },
    { href:'optimum_trans_parametres.html',    icon:'⚙️', label:'Params',     feature:'parametres'    },
  ];

  var CHEF_ITEMS = [
    { href:'optimum_trans_planning.html',      icon:'📆', label:'Planning'   },
    { href:'optimum_trans_gazole.html',        icon:'⛽', label:'Gazole'     },
    { href:'optimum_trans_vehicules.html',     icon:'🚐', label:'Véhicules'  },
    { href:'optimum_trans_chauffeur_vue.html', icon:'👤', label:'Mon profil' },
  ];

  var CHEF_BLOCKED = [
    'optimum_trans_dashboard.html','optimum_trans_dashboard_chef_mobile.html',
    'optimum_trans_chef_mobile.html',
    'optimum_trans_clients.html','optimum_trans_chauffeurs.html',
    'optimum_trans_feuille_route.html','optimum_trans_parametres.html',
    'optimum_trans_saisie.html','optimum_trans_rh.html',
    'amende.html','optimum_trans_ia.html','optimum_trans_dispatch.html',
  ];

  var CHAUFFEUR_BLOCKED = [
    'optimum_trans_dashboard.html','optimum_trans_planning.html',
    'optimum_trans_clients.html','optimum_trans_chauffeurs.html',
    'optimum_trans_vehicules.html','optimum_trans_gazole.html',
    'optimum_trans_feuille_route.html','optimum_trans_rh.html',
    'optimum_trans_parametres.html','optimum_trans_saisie.html',
    'optimum_trans_ia.html','optimum_trans_dispatch.html',
  ];

  /* ── Helpers ─────────────────────────────────────────────────── */
  function _getRole() {
    try {
      var raw = localStorage.getItem('ot_session') || sessionStorage.getItem('ot_session');
      if (!raw) return null;
      return JSON.parse(raw).role || 'admin';
    } catch(e) { return null; }
  }

  function _roleGuard() {
    var role = _getRole();
    if (!role) return false;
    var page = location.pathname.split('/').pop() || '';
    if (role === 'chauffeur' && CHAUFFEUR_BLOCKED.indexOf(page) >= 0) {
      window.location.href = 'optimum_trans_chauffeur_vue.html';
      return true;
    }
    if (role === 'chef_equipe' && CHEF_BLOCKED.indexOf(page) >= 0) {
      window.location.href = 'optimum_trans_planning.html';
      return true;
    }
    return false;
  }

  function _can(feature) {
    if (typeof OT !== 'undefined' && typeof OT.can === 'function') return OT.can(feature);
    try {
      var raw = localStorage.getItem('ot_session') || sessionStorage.getItem('ot_session');
      if (!raw) return true;
      var s = JSON.parse(raw);
      if (s.id === 'demo') return true;
      var PLAN = {
        starter:  {planning:1,clients:1,parametres:1,rh:1,vehicules:1,saisie:0,gazole:0,chauffeurs:0,feuille_route:0},
        pro:      {planning:1,clients:1,parametres:1,rh:1,vehicules:1,saisie:1,gazole:0,chauffeurs:1,feuille_route:0},
        business: {planning:1,clients:1,parametres:1,rh:1,vehicules:1,saisie:1,gazole:1,chauffeurs:1,feuille_route:0},
      };
      if (feature === 'feuille_route') return s.addon_route === true;
      if (feature === 'dispatch')      return s.addon_dispatch === true;
      if (feature === 'saisie')        return s.addon_saisie === true;
      return !!((PLAN[s.plan] || PLAN.starter)[feature]);
    } catch(e) { return true; }
  }

  function _haptic(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms || 8); } catch(e) {}
  }

  /* ── Construction de la nav ─────────────────────────────────── */
  function _build() {
    var page = location.pathname.split('/').pop() || 'optimum_trans_dashboard.html';
    var role = _getRole();

    var items;
    if (role === 'chef_equipe') {
      items = CHEF_ITEMS;
    } else {
      items = ALL_ITEMS.filter(function(it) {
        return !it.feature || _can(it.feature);
      });
    }

    /* 4 onglets principaux + bouton Plus pour le reste */
    var MAX_PRIMARY = 4;
    var primaryItems   = items.slice(0, MAX_PRIMARY);
    var secondaryItems = items.slice(MAX_PRIMARY);
    var isSecondaryPage = secondaryItems.some(function(it) { return it.href === page; });

    /* ── Barre principale ── */
    var navHtml = '<div class="omn-inner">';
    primaryItems.forEach(function(it) {
      var active = (page === it.href) ? ' omn-active' : '';
      navHtml += '<a class="omn-item' + active + '" href="' + it.href + '">';
      navHtml += '<span class="omn-icon">' + it.icon + '</span>';
      navHtml += '<span class="omn-label">' + it.label + '</span>';
      navHtml += '</a>';
    });

    if (secondaryItems.length > 0) {
      var moreActive = isSecondaryPage ? ' omn-more-active' : '';
      navHtml += '<div class="omn-item omn-more-btn' + moreActive + '" id="omn-more-trigger" onclick="_otMobToggleMore()" role="button" aria-label="Plus de pages">';
      navHtml += '<span class="omn-icon">⋯</span>';
      navHtml += '<span class="omn-label">Plus</span>';
      navHtml += '</div>';
    } else {
      /* Tous les items tiennent dans la barre → ajouter déconnexion */
      navHtml += '<div class="omn-item" style="color:rgba(248,113,113,0.8);" onclick="_otMobLogout()">';
      navHtml += '<span class="omn-icon">🚪</span><span class="omn-label">Sortir</span>';
      navHtml += '</div>';
    }
    navHtml += '</div>';

    var nav = document.getElementById(NAV_ID);
    if (!nav) {
      nav = document.createElement('div');
      nav.id = NAV_ID;
      document.body.appendChild(nav);
    }
    nav.innerHTML = navHtml;

    /* ── Menu "Plus" ── */
    var more = document.getElementById(MORE_ID);
    if (!more) {
      more = document.createElement('div');
      more.id = MORE_ID;
      document.body.appendChild(more);
    }
    var moreHtml = '';
    secondaryItems.forEach(function(it) {
      var activeClass = (page === it.href) ? ' omn-more-active-item' : '';
      moreHtml += '<a class="omn-more-item' + activeClass + '" href="' + it.href + '">';
      moreHtml += '<span class="omn-more-icon">' + it.icon + '</span>';
      moreHtml += it.label;
      moreHtml += '</a>';
    });
    /* Déconnexion en bas du menu Plus */
    moreHtml += '<div class="omn-more-item" onclick="_otMobLogout()" style="color:rgba(248,113,113,0.85);border-color:rgba(248,113,113,0.18);background:rgba(248,113,113,0.06);">';
    moreHtml += '<span class="omn-more-icon">🚪</span>Sortir';
    moreHtml += '</div>';
    more.innerHTML = moreHtml;

    /* ── Overlay ── */
    var overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = OVERLAY_ID;
      overlay.onclick = window._otMobCloseMore;
      document.body.appendChild(overlay);
    }

    /* Afficher avec animation */
    setTimeout(function() { nav.classList.add('omn-visible'); }, 100);

    /* Supprimer les anciennes navbars */
    document.querySelectorAll('.mobile-navbar,.mob-more-menu,.mob-overlay').forEach(function(el) {
      el.style.display = 'none';
    });
  }

  /* ── Toggle menu Plus ────────────────────────────────────────── */
  window._otMobToggleMore = function() {
    var more    = document.getElementById(MORE_ID);
    var overlay = document.getElementById(OVERLAY_ID);
    if (!more) return;
    var isOpen = more.classList.contains('omn-more-open');
    if (isOpen) {
      window._otMobCloseMore();
    } else {
      more.classList.add('omn-more-open');
      if (overlay) overlay.classList.add('omn-overlay-open');
      _haptic(8);
    }
  };

  window._otMobCloseMore = function() {
    var more    = document.getElementById(MORE_ID);
    var overlay = document.getElementById(OVERLAY_ID);
    if (more)    more.classList.remove('omn-more-open');
    if (overlay) overlay.classList.remove('omn-overlay-open');
  };

  /* ── Auto-hide au scroll ─────────────────────────────────────── */
  function _initScroll() {
    var nav = document.getElementById(NAV_ID);
    if (!nav) return;
    var lastY   = window.scrollY || window.pageYOffset;
    var ticking = false;

    window.addEventListener('scroll', function() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function() {
        var y       = window.scrollY || window.pageYOffset;
        var atBottom = (window.innerHeight + y) >= (document.documentElement.scrollHeight - 20);
        var atTop    = y < 60;

        if (atTop || atBottom || y < lastY) {
          nav.classList.add('omn-visible');
        } else {
          nav.classList.remove('omn-visible');
          window._otMobCloseMore();
        }
        lastY   = y;
        ticking = false;
      });
    }, { passive: true });
  }

  /* ── Injection CSS ───────────────────────────────────────────── */
  function _injectCSS() {
    /* CSS nav inline */
    if (!document.getElementById(CSS_ID)) {
      var s = document.createElement('style');
      s.id = CSS_ID;
      s.textContent = CSS;
      document.head.appendChild(s);
    }
    /* Feuille de style mobile complète */
    if (!document.querySelector('link[href*="optimum_trans_mobile.css"]')) {
      var link = document.createElement('link');
      link.rel  = 'stylesheet';
      link.href = 'optimum_trans_mobile.css';
      document.head.appendChild(link);
    }
  }

  /* ── Déconnexion ─────────────────────────────────────────────── */
  window._otMobLogout = function() {
    window._otMobCloseMore();
    if (typeof OT !== 'undefined' && typeof OT.logout === 'function') {
      OT.logout();
    } else {
      if (!confirm('Se déconnecter ?')) return;
      ['ot_session','ot_logged','ot_email'].forEach(function(k) {
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
      });
      window.location.href = '/index.html';
    }
  };

  /* ── Bouton ⏻ déconnexion (sidebar desktop) ──────────────────── */
  function _initUserCardDropdown() {
    var card = document.querySelector('.sidebar-footer .user-card');
    if (!card || card.querySelector('.ot-logout-btn')) return;

    var oldBtn = card.querySelector('button');
    if (oldBtn) oldBtn.remove();

    var btn = document.createElement('button');
    btn.className = 'ot-logout-btn';
    btn.title = 'Se déconnecter';
    btn.textContent = '⏻';
    btn.style.cssText = [
      'background:rgba(231,76,60,0.12);',
      'border:1px solid rgba(231,76,60,0.2);',
      'border-radius:8px;',
      'padding:5px 9px;',
      'cursor:pointer;',
      'font-size:16px;',
      'color:#FC8181;',
      'line-height:1;',
      'flex-shrink:0;',
      'min-width:36px;min-height:36px;',
      'display:inline-flex;align-items:center;justify-content:center;',
      'transition:background .2s;',
    ].join('');
    btn.onmouseover = function() { this.style.background = 'rgba(231,76,60,0.25)'; };
    btn.onmouseout  = function() { this.style.background = 'rgba(231,76,60,0.12)'; };
    btn.onclick = function(e) { e.stopPropagation(); window._otMobLogout(); };
    card.appendChild(btn);
  }

  /* ── Bandeau impersonation superadmin ────────────────────────── */
  function _checkImpersonation() {
    var saBackup  = localStorage.getItem('ot_sa_backup');
    var saCompany = localStorage.getItem('ot_sa_company');
    if (!saBackup || document.getElementById('ot-impersonate-banner')) return;

    var banner = document.createElement('div');
    banner.id = 'ot-impersonate-banner';
    banner.style.cssText = [
      'position:fixed;top:0;left:0;right:0;z-index:9999;',
      'background:linear-gradient(135deg,#5B21B6,#4F46E5);',
      'color:#fff;padding:10px 20px;',
      'display:flex;align-items:center;justify-content:space-between;',
      'font-family:Outfit,sans-serif;font-size:13px;font-weight:600;',
      'border-bottom:2px solid rgba(255,255,255,0.2);',
      'box-shadow:0 4px 20px rgba(79,70,229,0.5);',
    ].join('');
    banner.innerHTML = '<div style="display:flex;align-items:center;gap:8px">'
      + '<span style="font-size:16px">👔</span>'
      + '<span>Vous accédez au compte de <strong>' + (saCompany || 'client') + '</strong></span>'
      + '</div>'
      + '<button onclick="window._otReturnToSuperadmin()" style="background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.3);border-radius:8px;padding:6px 14px;color:#fff;cursor:pointer;font-family:Outfit,sans-serif;font-size:12px;font-weight:700;min-height:36px;">⬅ Retour superadmin</button>';
    document.body.prepend(banner);

    var main = document.querySelector('.main');
    if (main) main.style.marginTop = (parseInt(main.style.marginTop || '0') + 44) + 'px';
  }

  window._otReturnToSuperadmin = function() {
    var saBackup = localStorage.getItem('ot_sa_backup');
    if (saBackup) {
      localStorage.setItem('ot_session', saBackup);
      localStorage.setItem('ot_logged', '1');
    }
    localStorage.removeItem('ot_sa_backup');
    localStorage.removeItem('ot_sa_company');
    window.location.href = 'optimum_trans_superadmin.html';
  };

  /* ── Initialisation ──────────────────────────────────────────── */
  function _init() {
    if (_roleGuard()) return;
    _injectCSS();
    _build();
    _initScroll();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _checkImpersonation);
      document.addEventListener('DOMContentLoaded', _initUserCardDropdown);
    } else {
      _checkImpersonation();
      _initUserCardDropdown();
    }
    /* Rebuild après session refresh asynchrone */
    setTimeout(_build, 900);
  }

  window.addEventListener('storage', function(e) {
    if (e.key === 'ot_session') setTimeout(_build, 100);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

})();
