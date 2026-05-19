// =======================================================================
// OT_VISIBILITY_PAUSE.JS — Mise en pause des timers de polling quand
// l'onglet n'est pas visible (économie de charge sur la base de données).
//
// API :
//   const t = OT_VIS.setManagedInterval(fn, ms);
//   t.clear();
//
// Comportement :
//   - Onglet visible       : se comporte exactement comme setInterval.
//   - Onglet caché         : le timer est arrêté.
//   - Retour à visible     : fn() est exécutée immédiatement (pour avoir
//                            des données fraîches), puis le timer reprend.
//   - Création onglet caché: le timer est créé en pause (pas de fn() initial).
//
// Sécurité d'usage : si ce script n'est pas chargé, les appelants doivent
// fallback sur setInterval natif (voir ot_messaging.js).
// =======================================================================

window.OT_VIS = (() => {
  'use strict';

  const _timers = new Set();
  let _hidden = (typeof document !== 'undefined') && document.visibilityState === 'hidden';

  function setManagedInterval(fn, ms) {
    const entry = { fn, ms, id: null };

    entry._start = function() {
      if (entry.id != null) return;
      entry.id = setInterval(entry.fn, entry.ms);
    };
    entry._stop = function() {
      if (entry.id != null) { clearInterval(entry.id); entry.id = null; }
    };
    entry.clear = function() {
      entry._stop();
      _timers.delete(entry);
    };

    _timers.add(entry);
    if (!_hidden) entry._start();
    return entry;
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', () => {
      const nowHidden = document.visibilityState === 'hidden';
      if (nowHidden === _hidden) return;
      _hidden = nowHidden;
      if (_hidden) {
        _timers.forEach(t => t._stop());
      } else {
        _timers.forEach(t => {
          try { t.fn(); } catch(e) {}
          t._start();
        });
      }
    });
  }

  return { setManagedInterval };
})();
