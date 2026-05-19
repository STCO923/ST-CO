// ═══════════════════════════════════════════════════════════════════
// T SERVICE & CO — ot_ai_analyst.js v1.0
// Module IA — Analyse business quotidienne & chat intelligent
//
// Utilise Groq API (LLaMA 3.3 70B) pour analyser les données
// financières et opérationnelles de l'entreprise de transport.
//
// Dépend de : ot_session.js (OT.authHeaders, OT.companyFilter, etc.)
// ═══════════════════════════════════════════════════════════════════

const OT_AI = (() => {
  'use strict';

  // ─── Constantes ──────────────────────────────────────────────────
  // Budget Groq gratuit : ~30 req/min, ~1000 req/jour
  // Avec 5 clients : 5 analyses + 50 chats = 55 req/jour max (marge large)
  const GROQ_URL           = 'https://kfdyqcbclueppmvkccdz.supabase.co/functions/v1/groq-proxy';
  const MODEL_ANALYSIS     = 'llama-3.3-70b-versatile';  // Modèle puissant pour l'analyse quotidienne
  const MODEL_CHAT         = 'llama-3.1-8b-instant';     // Modèle léger et rapide pour le chat
  const SB                 = 'https://kfdyqcbclueppmvkccdz.supabase.co';
  const MAX_DAILY_ANALYSES = 1;
  const MAX_CHAT_PER_DAY   = 10;
  const CACHE_KEY          = 'ot_ai_daily_cache';
  const CHAT_COUNT_KEY     = 'ot_ai_chat_count';

  // ─── Historique de conversation (en mémoire) ─────────────────────
  let _chatHistory = [];

  // ─── Helpers ─────────────────────────────────────────────────────

  /** Retourne les headers d'authentification Supabase */
  function _getHeaders() {
    return OT.authHeaders();
  }

  /** Formate une Date en YYYY-MM-DD (timezone locale) */
  function _fmtD(d){
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }

  /** Date du jour au format YYYY-MM-DD */
  function _today() {
    return _fmtD(new Date());
  }

  /** Plage du mois en cours {start, end} */
  function _monthRange() {
    var now = new Date();
    var start = new Date(now.getFullYear(), now.getMonth(), 1);
    var end   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      start: _fmtD(start),
      end:   _fmtD(end)
    };
  }

  /** Plage de la semaine en cours lundi-dimanche {start, end} */
  function _weekRange() {
    var now = new Date();
    var day = now.getDay();
    var diff = day === 0 ? -6 : 1 - day;
    var mon = new Date(now);
    mon.setDate(now.getDate() + diff);
    var sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return {
      start: _fmtD(mon),
      end:   _fmtD(sun)
    };
  }

  /** Plage du mois précédent {start, end} */
  function _lastMonthRange() {
    var now = new Date();
    var start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    var end   = new Date(now.getFullYear(), now.getMonth(), 0);
    return {
      start: _fmtD(start),
      end:   _fmtD(end)
    };
  }

  /** Formate un nombre en euros (format FR) */
  function _fe(n) {
    return Math.round(n).toLocaleString('fr-FR') + ' EUR';
  }

  /** Retourne un pourcentage formaté */
  function _pct(a, b) {
    if (!b || b === 0) return '0%';
    return (((a - b) / b) * 100).toFixed(1) + '%';
  }

  // ─── Rate limiting ───────────────────────────────────────────────

  /** Vérifie si l'analyse quotidienne est encore disponible */
  function _canAnalyze() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return true;
      var cached = JSON.parse(raw);
      if (cached.date !== _today()) return true;
      return cached.count < MAX_DAILY_ANALYSES;
    } catch (e) {
      return true;
    }
  }

  /** Marque l'analyse du jour comme effectuée */
  function _markAnalyzed() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      var cached = raw ? JSON.parse(raw) : {};
      if (cached.date !== _today()) {
        cached = { date: _today(), count: 0, result: null };
      }
      cached.count = (cached.count || 0) + 1;
      localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
    } catch (e) {
      console.warn('[OT_AI] Erreur markAnalyzed:', e);
    }
  }

  /** Vérifie si le quota de messages chat n'est pas atteint */
  function _canChat() {
    try {
      var raw = localStorage.getItem(CHAT_COUNT_KEY);
      if (!raw) return true;
      var data = JSON.parse(raw);
      if (data.date !== _today()) return true;
      return (data.count || 0) < MAX_CHAT_PER_DAY;
    } catch (e) {
      return true;
    }
  }

  /** Incrémente le compteur de messages chat du jour */
  function _incrementChat() {
    try {
      var raw = localStorage.getItem(CHAT_COUNT_KEY);
      var data = raw ? JSON.parse(raw) : {};
      if (data.date !== _today()) {
        data = { date: _today(), count: 0 };
      }
      data.count = (data.count || 0) + 1;
      localStorage.setItem(CHAT_COUNT_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[OT_AI] Erreur incrementChat:', e);
    }
  }

  /** Retourne le nombre de messages chat restants aujourd'hui */
  function _getRemainingChats() {
    try {
      var raw = localStorage.getItem(CHAT_COUNT_KEY);
      if (!raw) return MAX_CHAT_PER_DAY;
      var data = JSON.parse(raw);
      if (data.date !== _today()) return MAX_CHAT_PER_DAY;
      return Math.max(0, MAX_CHAT_PER_DAY - (data.count || 0));
    } catch (e) {
      return MAX_CHAT_PER_DAY;
    }
  }

  // ─── Collecte des données métier ────────────────────────────────

  /**
   * Récupère toutes les données business depuis Supabase
   * et calcule les indicateurs clés (CA, marges, top clients, etc.)
   */
  async function collectBusinessData() {
    var headers = _getHeaders();
    var cf      = OT.companyFilter();
    var month   = _monthRange();
    var lastM   = _lastMonthRange();

    // Requêtes parallèles vers Supabase REST API
    var [
      clientsR, chauffeursR, tourneesR, tourneesLastR,
      gazoleR, vehiculesR, amendesR, entrepriseR, maintenanceR
    ] = await Promise.all([
      fetch(SB + '/rest/v1/clients?' + cf + '&order=nom', { headers: headers }),
      fetch(SB + '/rest/v1/chauffeurs?' + cf + '&order=nom', { headers: headers }),
      fetch(SB + '/rest/v1/tournees?' + cf + '&date=gte.' + month.start + '&date=lte.' + month.end, { headers: headers }),
      fetch(SB + '/rest/v1/tournees?' + cf + '&date=gte.' + lastM.start + '&date=lte.' + lastM.end, { headers: headers }),
      fetch(SB + '/rest/v1/gazole_pleins?' + cf + '&date=gte.' + month.start + '&date=lte.' + month.end, { headers: headers }),
      fetch(SB + '/rest/v1/vehicules?' + cf, { headers: headers }),
      fetch(SB + '/rest/v1/amendes?' + cf + '&order=date_infraction.desc&limit=50', { headers: headers }),
      fetch(SB + '/rest/v1/entreprise?' + cf + '&limit=1', { headers: headers }),
      fetch(SB + '/rest/v1/maintenance_vehicules?' + cf + '&date_maintenance=gte.' + month.start + '&date_maintenance=lte.' + month.end, { headers: headers }).catch(function() { return { ok: false }; })
    ]);

    // Parsing JSON
    var clients       = clientsR.ok       ? await clientsR.json()       : [];
    var chauffeurs    = chauffeursR.ok     ? await chauffeursR.json()    : [];
    var tournees      = tourneesR.ok       ? await tourneesR.json()      : [];
    var tourneesLast  = tourneesLastR.ok   ? await tourneesLastR.json()  : [];
    var gazole        = gazoleR.ok         ? await gazoleR.json()        : [];
    var vehicules     = vehiculesR.ok      ? await vehiculesR.json()     : [];
    var amendes       = amendesR.ok        ? await amendesR.json()       : [];
    var entreprise    = entrepriseR.ok     ? await entrepriseR.json()    : [];
    var maintenance   = maintenanceR.ok    ? await maintenanceR.json()   : [];

    // ── Calcul du CA ce mois ──
    // On crée un index des tarifs clients pour lookup rapide
    var tarifIndex = {};
    clients.forEach(function (c) {
      tarifIndex[c.nom] = parseFloat(c.tarif) || 0;
    });

    var totalCA = 0;
    tournees.forEach(function (t) {
      var tarif = tarifIndex[t.client_nom] || 0;
      totalCA += tarif;
    });

    // ── CA mois précédent ──
    var totalCALast = 0;
    tourneesLast.forEach(function (t) {
      var tarif = tarifIndex[t.client_nom] || 0;
      totalCALast += tarif;
    });

    // ── Croissance CA ──
    var caGrowth = totalCALast > 0 ? ((totalCA - totalCALast) / totalCALast * 100).toFixed(1) : 0;

    // ── Total gazole ──
    var totalGazole = 0;
    gazole.forEach(function (g) {
      totalGazole += parseFloat(g.montant) || 0;
    });

    // ── Statistiques par client (tournées du mois) ──
    var clientStats = {};
    tournees.forEach(function (t) {
      var nom = t.client_nom || 'Inconnu';
      if (!clientStats[nom]) {
        clientStats[nom] = { nom: nom, nbTournees: 0, ca: 0, cout: 0 };
      }
      clientStats[nom].nbTournees += 1;
      clientStats[nom].ca += tarifIndex[nom] || 0;
      clientStats[nom].cout += 70; // Coût moyen par défaut par tournée
    });

    // Calcul des marges
    var clientList = Object.values(clientStats);
    clientList.forEach(function (c) {
      c.marge = c.ca - c.cout;
      c.tauxMarge = c.ca > 0 ? ((c.marge / c.ca) * 100).toFixed(1) : 0;
    });

    // ── Top 5 clients par CA ──
    var topClients = clientList.slice().sort(function (a, b) { return b.ca - a.ca; }).slice(0, 5);

    // ── 5 clients avec la pire marge ──
    var worstMarginClients = clientList.slice().sort(function (a, b) {
      return parseFloat(a.tauxMarge) - parseFloat(b.tauxMarge);
    }).slice(0, 5);

    // ── Chauffeurs avec le plus d'amendes ──
    var amendesParChauffeur = {};
    amendes.forEach(function (a) {
      var nom = a.chauffeur || a.chauffeur_nom || 'Inconnu';
      if (!amendesParChauffeur[nom]) {
        amendesParChauffeur[nom] = { nom: nom, count: 0, total: 0 };
      }
      amendesParChauffeur[nom].count += 1;
      amendesParChauffeur[nom].total += parseFloat(a.montant) || 0;
    });
    var driversWithPenalties = Object.values(amendesParChauffeur).sort(function (a, b) {
      return b.count - a.count;
    });

    // ── Coût carburant moyen par véhicule ──
    var gazoleParVehicule = {};
    gazole.forEach(function (g) {
      var immat = g.immatriculation || g.vehicule || 'Inconnu';
      if (!gazoleParVehicule[immat]) {
        gazoleParVehicule[immat] = { immat: immat, total: 0, count: 0 };
      }
      gazoleParVehicule[immat].total += parseFloat(g.montant) || 0;
      gazoleParVehicule[immat].count += 1;
    });
    var avgFuelPerVehicle = Object.values(gazoleParVehicule).map(function (v) {
      return { immat: v.immat, moyenne: v.count > 0 ? (v.total / v.count).toFixed(2) : 0, total: v.total };
    });

    // ── Coût maintenance par véhicule ──
    var maintenanceParVehicule = {};
    maintenance.forEach(function (m) {
      var immat = m.vehicule_immat || 'Inconnu';
      if (!maintenanceParVehicule[immat]) {
        maintenanceParVehicule[immat] = { immat: immat, total: 0, count: 0 };
      }
      maintenanceParVehicule[immat].total += parseFloat(m.cout) || 0;
      maintenanceParVehicule[immat].count += 1;
    });
    var maintenanceParVehiculeList = Object.values(maintenanceParVehicule);
    var totalMaintenance = maintenance.reduce(function (s, m) { return s + (parseFloat(m.cout) || 0); }, 0);

    return {
      clients:             clients,
      chauffeurs:          chauffeurs,
      tournees:            tournees,
      tourneesLast:        tourneesLast,
      gazole:              gazole,
      vehicules:           vehicules,
      amendes:             amendes,
      entreprise:          entreprise.length > 0 ? entreprise[0] : null,
      // Indicateurs calculés
      totalCA:             totalCA,
      totalCALast:         totalCALast,
      caGrowth:            caGrowth,
      totalGazole:         totalGazole,
      nbTourneesThisMonth: tournees.length,
      nbTourneesLastMonth: tourneesLast.length,
      clientStats:         clientList,
      topClients:          topClients,
      worstMarginClients:  worstMarginClients,
      driversWithPenalties:        driversWithPenalties,
      avgFuelPerVehicle:           avgFuelPerVehicle,
      maintenance:                 maintenance,
      totalMaintenance:            totalMaintenance,
      maintenanceParVehiculeList:  maintenanceParVehiculeList
    };
  }

  // ─── Construction du prompt système ──────────────────────────────

  /**
   * Construit le prompt système avec toutes les données métier
   * pour contextualiser les réponses de l'IA
   */
  function buildSystemPrompt(data) {
    var today = _today();
    var month = _monthRange();

    var prompt = '';
    prompt += 'Tu es un expert business analyst specialise dans le transport et la logistique. ';
    prompt += 'Tu analyses les donnees financieres d\'une entreprise de transport pour fournir des recommandations strategiques, objectives et impartiales.\n\n';

    // Contexte temporel
    prompt += '=== CONTEXTE ===\n';
    prompt += 'Date du jour : ' + today + '\n';
    prompt += 'Periode analysee : ' + month.start + ' au ' + month.end + '\n';
    if (data.entreprise && data.entreprise.nom) {
      prompt += 'Entreprise : ' + data.entreprise.nom + '\n';
    }
    prompt += '\n';

    // Données financières
    prompt += '=== DONNEES FINANCIERES ===\n';
    prompt += 'CA mois en cours : ' + _fe(data.totalCA) + '\n';
    prompt += 'CA mois precedent : ' + _fe(data.totalCALast) + '\n';
    prompt += 'Croissance CA : ' + data.caGrowth + '%\n';
    prompt += 'Total gazole ce mois : ' + _fe(data.totalGazole) + '\n';
    prompt += 'Total maintenance ce mois : ' + _fe(data.totalMaintenance || 0) + '\n';
    prompt += 'Nb tournees ce mois : ' + data.nbTourneesThisMonth + '\n';
    prompt += 'Nb tournees mois precedent : ' + data.nbTourneesLastMonth + '\n';
    prompt += '\n';

    // Clients
    prompt += '=== PARC ===\n';
    prompt += 'Nb clients actifs : ' + data.clients.length + '\n';
    prompt += 'Nb chauffeurs : ' + data.chauffeurs.length + '\n';
    prompt += 'Nb vehicules : ' + data.vehicules.length + '\n';
    prompt += '\n';

    // Top clients
    prompt += '=== TOP 5 CLIENTS PAR CA ===\n';
    data.topClients.forEach(function (c, i) {
      prompt += (i + 1) + '. ' + c.nom + ' — CA: ' + _fe(c.ca) + ', ' + c.nbTournees + ' tournees, marge: ' + c.tauxMarge + '%\n';
    });
    prompt += '\n';

    // Clients à risque (pire marge)
    prompt += '=== 5 CLIENTS AVEC LA PIRE MARGE ===\n';
    data.worstMarginClients.forEach(function (c, i) {
      prompt += (i + 1) + '. ' + c.nom + ' — CA: ' + _fe(c.ca) + ', cout: ' + _fe(c.cout) + ', marge: ' + c.tauxMarge + '%\n';
    });
    prompt += '\n';

    // Amendes / infractions
    if (data.driversWithPenalties.length > 0) {
      prompt += '=== CHAUFFEURS AVEC AMENDES ===\n';
      data.driversWithPenalties.forEach(function (d) {
        prompt += '- ' + d.nom + ' : ' + d.count + ' amendes, total ' + _fe(d.total) + '\n';
      });
      prompt += '\n';
    }

    // Carburant par véhicule
    if (data.avgFuelPerVehicle.length > 0) {
      prompt += '=== COUT CARBURANT PAR VEHICULE ===\n';
      data.avgFuelPerVehicle.forEach(function (v) {
        prompt += '- ' + v.immat + ' : moyenne ' + v.moyenne + ' EUR/plein, total ' + _fe(v.total) + '\n';
      });
      prompt += '\n';
    }

    // Maintenance par véhicule
    if (data.maintenanceParVehiculeList && data.maintenanceParVehiculeList.length > 0) {
      prompt += '=== COUT MAINTENANCE PAR VEHICULE (ce mois) ===\n';
      data.maintenanceParVehiculeList.forEach(function (v) {
        prompt += '- ' + v.immat + ' : ' + v.count + ' intervention(s), total ' + _fe(v.total) + '\n';
      });
      prompt += '\n';
    }

    // Instructions
    prompt += '=== INSTRUCTIONS ===\n';
    prompt += '- Reponds TOUJOURS en francais.\n';
    prompt += '- Sois precis avec les chiffres, cite les montants exacts.\n';
    prompt += '- Donne des recommandations actionnables et concretes.\n';
    prompt += '- Sois honnete sur les clients non rentables, suggere des ajustements tarifaires avec des montants precis.\n';
    prompt += '- Signale les chauffeurs ou sous-traitants problematiques.\n';
    prompt += '- Prends en compte les tendances de cout carburant.\n';
    prompt += '- Prends en compte les couts de maintenance vehicule dans l\'analyse de rentabilite.\n';
    prompt += '- Si maintenance + gazole + assurance depassent un seuil critique par rapport au CA, signale-le avec des chiffres precis et des recommandations concretes (augmenter tarifs, reduire usage d\'un vehicule, planifier remplacement).\n';
    prompt += '- Suggere des strategies d\'optimisation des couts.\n';
    prompt += '- Garde tes reponses concises mais completes (max 500 mots).\n';

    return prompt;
  }

  // ─── Analyse quotidienne ─────────────────────────────────────────

  /**
   * Génère le rapport d'analyse quotidien via Groq API.
   * Limité à MAX_DAILY_ANALYSES par jour, avec cache localStorage.
   */
  async function generateDailyAnalysis() {
    // Vérifier le cache / quota
    if (!_canAnalyze()) {
      try {
        var cached = JSON.parse(localStorage.getItem(CACHE_KEY));
        if (cached && cached.date === _today() && cached.result) {
          return cached.result;
        }
      } catch (e) { /* pas de cache valide */ }
      throw new Error('Limite d\'analyse quotidienne atteinte (max ' + MAX_DAILY_ANALYSES + '/jour).');
    }

    try {
      // Collecter les données
      var data = await collectBusinessData();

      // Construire le prompt système
      var systemPrompt = buildSystemPrompt(data);

      // Appel Groq via proxy Supabase
      var response = await fetch(GROQ_URL, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, _getHeaders()),
        body: JSON.stringify({
          model: MODEL_ANALYSIS,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: 'Genere ton rapport d\'analyse quotidien. Inclus: 1) Resume de la situation financiere du mois en cours vs mois precedent, 2) Top clients rentables et clients a risque, 3) Alertes sur les chauffeurs/sous-traitants problematiques, 4) Suggestions d\'optimisation concretes avec des chiffres, 5) Objectifs recommandes pour le reste du mois.'
            }
          ],
          temperature: 0.3,
          max_tokens: 1200
        })
      });

      if (!response.ok) {
        var errBody = await response.text();
        throw new Error('Groq API erreur ' + response.status + ': ' + errBody);
      }

      var result = await response.json();
      var text = result.choices && result.choices[0] && result.choices[0].message
        ? result.choices[0].message.content
        : 'Aucune reponse generee.';

      // Mettre en cache
      try {
        var cacheData = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
        if (cacheData.date !== _today()) {
          cacheData = { date: _today(), count: 0 };
        }
        cacheData.result = text;
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
      } catch (e) {
        console.warn('[OT_AI] Erreur cache:', e);
      }

      // Marquer l'analyse comme faite
      _markAnalyzed();

      return text;

    } catch (err) {
      console.error('[OT_AI] Erreur generateDailyAnalysis:', err);
      throw err;
    }
  }

  // ─── Chat interactif ────────────────────────────────────────────

  /**
   * Envoie un message au chat IA avec le contexte business.
   * Limité à MAX_CHAT_PER_DAY messages par jour.
   * Retourne {response, remaining}.
   */
  async function chat(userMessage) {
    if (!_canChat()) {
      throw new Error('Limite de messages chat atteinte (' + MAX_CHAT_PER_DAY + '/jour). Reessayez demain.');
    }

    try {
      // Collecter les données
      var data = await collectBusinessData();

      // Construire le prompt système
      var systemPrompt = buildSystemPrompt(data);

      // Préparer les messages : system + historique (max 6 derniers) + nouveau message
      var messages = [{ role: 'system', content: systemPrompt }];

      // Ajouter l'historique récent (max 6 derniers messages)
      var recentHistory = _chatHistory.slice(-6);
      recentHistory.forEach(function (msg) {
        messages.push(msg);
      });

      // Ajouter le nouveau message utilisateur
      messages.push({ role: 'user', content: userMessage });

      // Appel Groq via proxy Supabase
      var response = await fetch(GROQ_URL, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, _getHeaders()),
        body: JSON.stringify({
          model: MODEL_CHAT,
          messages: messages,
          temperature: 0.4,
          max_tokens: 500
        })
      });

      if (!response.ok) {
        var errBody = await response.text();
        throw new Error('Groq API erreur ' + response.status + ': ' + errBody);
      }

      var result = await response.json();
      var text = result.choices && result.choices[0] && result.choices[0].message
        ? result.choices[0].message.content
        : 'Aucune reponse generee.';

      // Incrémenter le compteur
      _incrementChat();

      // Ajouter à l'historique
      _chatHistory.push({ role: 'user', content: userMessage });
      _chatHistory.push({ role: 'assistant', content: text });

      return {
        response:  text,
        remaining: _getRemainingChats()
      };

    } catch (err) {
      console.error('[OT_AI] Erreur chat:', err);
      throw err;
    }
  }

  // ─── Stats rapides (sans IA) ─────────────────────────────────────

  /**
   * Retourne les indicateurs clés calculés sans appeler l'IA.
   * Utile pour afficher un résumé rapide dans le dashboard.
   */
  async function getQuickStats() {
    try {
      var data = await collectBusinessData();

      return {
        nbClients:         data.clients.length,
        nbChauffeurs:      data.chauffeurs.length,
        nbTourneesMois:    data.nbTourneesThisMonth,
        caMois:            data.totalCA,
        caLastMonth:       data.totalCALast,
        caGrowth:          data.caGrowth,
        totalGazole:       data.totalGazole,
        topClient:         data.topClients.length > 0 ? data.topClients[0] : null,
        worstMarginClient: data.worstMarginClients.length > 0 ? data.worstMarginClients[0] : null,
        nbAmendes:         data.amendes.length
      };

    } catch (err) {
      console.error('[OT_AI] Erreur getQuickStats:', err);
      throw err;
    }
  }

  // ─── API publique ────────────────────────────────────────────────
  return {
    generateDailyAnalysis: generateDailyAnalysis,
    chat:                  chat,
    collectBusinessData:   collectBusinessData,
    getQuickStats:         getQuickStats,
    canAnalyze:            _canAnalyze,
    canChat:               _canChat,
    getRemainingChats:     _getRemainingChats
  };

})();
