// ═══════════════════════════════════════════════════════════════════
// T SERVICE & CO — ot_ai_dispatcher.js v2.0
// Module IA — Dispatch automatique des tournées
//
// Le client envoie un besoin SIMPLE (nb tournées AM/PM par semaine).
// L'IA décide : quels jours, quels chauffeurs, quels véhicules,
// quelles heures — en se basant sur l'historique des 3 dernières
// semaines et les ressources disponibles.
//
// Utilise Google Gemini API (Gemini 2.0 Flash)
// Dépend de : ot_session.js (OT.authHeaders, OT.companyFilter, etc.)
// ═══════════════════════════════════════════════════════════════════

const OT_DISPATCH = (() => {
  'use strict';

  // ─── Constantes ──────────────────────────────────────────────────
  const GEMINI_URL    = 'https://kfdyqcbclueppmvkccdz.supabase.co/functions/v1/gemini-proxy';
  const SB            = 'https://kfdyqcbclueppmvkccdz.supabase.co';
  const MAX_DISPATCH_PER_DAY = 5;
  const CACHE_KEY     = 'ot_dispatch_cache';

  const TYPOLOGIES = [
    'VL','VL HAYON','VUL','VUL HAYON',
    'PORTEUR','PORTEUR HAYON','BI-TEMPERATURE','FRIGO',
    'POIDS LOURD','PL HAYON','SEMI','SEMI FRIGO',
    'SEMI BACHE','SEMI PLATEAU','FOURGON','FOURGON HAYON',
    'CAMION BRAS','CAMION GRUE','BENNE','CITERNE',
    'PORTE-CHAR','DOUBLE PLANCHER'
  ];

  // ─── Helpers ─────────────────────────────────────────────────────

  function _getHeaders() { return OT.authHeaders(); }
  function _fmtD(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function _today() { return _fmtD(new Date()); }

  function _mondayOf(date) {
    var d = new Date(date);
    var day = d.getDay();
    var diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }

  function _lastNWeeksRange(n) {
    var now = new Date();
    var monday = _mondayOf(now);
    var start = new Date(monday);
    start.setDate(start.getDate() - (n * 7));
    var end = new Date(monday);
    end.setDate(end.getDate() - 1);
    return { start: _fmtD(start), end: _fmtD(end) };
  }

  function _weekRangeFrom(mondayStr) {
    var mon = new Date(mondayStr + 'T00:00:00');
    var sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return { start: _fmtD(mon), end: _fmtD(sun) };
  }

  var JOURS_SEMAINE = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];

  // ─── Rate limiting ───────────────────────────────────────────────

  function _canDispatch() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return true;
      var cached = JSON.parse(raw);
      if (cached.date !== _today()) return true;
      return (cached.count || 0) < MAX_DISPATCH_PER_DAY;
    } catch (e) { return true; }
  }

  function _markDispatched() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      var cached = raw ? JSON.parse(raw) : {};
      if (cached.date !== _today()) cached = { date: _today(), count: 0 };
      cached.count = (cached.count || 0) + 1;
      localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
    } catch (e) {}
  }

  function getRemainingDispatches() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return MAX_DISPATCH_PER_DAY;
      var cached = JSON.parse(raw);
      if (cached.date !== _today()) return MAX_DISPATCH_PER_DAY;
      return Math.max(0, MAX_DISPATCH_PER_DAY - (cached.count || 0));
    } catch (e) { return MAX_DISPATCH_PER_DAY; }
  }

  // ─── Collecte des données ─────────────────────────────────────

  /**
   * Récupère toutes les données nécessaires au dispatch :
   * clients, chauffeurs actifs, véhicules, historique 3 semaines,
   * ET absences approuvées qui chevauchent la semaine cible.
   */
  async function collectDispatchData(targetMonday) {
    var headers = _getHeaders();
    var cf = OT.companyFilter();
    var hist = _lastNWeeksRange(3);

    // Plage de la semaine cible pour filtrer les absences
    var weekRange = targetMonday ? _weekRangeFrom(targetMonday) : null;
    var absenceFilter = weekRange
      ? '&statut=eq.approuve&date_debut=lte.' + weekRange.end + '&date_fin=gte.' + weekRange.start
      : '&statut=eq.approuve';

    var [clientsR, chauffeursR, vehiculesR, historiqueR, absencesR] = await Promise.all([
      fetch(SB + '/rest/v1/clients?' + cf + '&order=nom', { headers: headers }),
      fetch(SB + '/rest/v1/chauffeurs?' + cf + '&statut=eq.actif&order=nom', { headers: headers }),
      fetch(SB + '/rest/v1/vehicules?' + cf + '&order=immatriculation', { headers: headers }),
      fetch(SB + '/rest/v1/tournees?' + cf + '&date=gte.' + hist.start + '&date=lte.' + hist.end + '&order=date', { headers: headers }),
      fetch(SB + '/rest/v1/absences?' + cf + absenceFilter + '&order=date_debut', { headers: headers })
    ]);

    return {
      clients:    clientsR.ok    ? await clientsR.json()    : [],
      chauffeurs: chauffeursR.ok ? await chauffeursR.json() : [],
      vehicules:  vehiculesR.ok  ? await vehiculesR.json()  : [],
      historique: historiqueR.ok ? await historiqueR.json() : [],
      absences:   absencesR.ok   ? await absencesR.json()   : []
    };
  }

  // ─── Parsing du fichier Excel v2 (matrice simple) ────────────

  /**
   * Parse la matrice simple.
   * Format : Client | Nb AM | Nb PM | Véhicule | Pts/jour moy | Commentaire
   * Le client dit COMBIEN il a besoin, l'IA décide le QUAND/QUI/OÙ.
   */
  function parseExcelBesoins(workbook) {
    var sheet = workbook.Sheets[workbook.SheetNames[0]];
    var rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    var besoins = [];

    rows.forEach(function(row) {
      var clientNom = (row['Client'] || row['client'] || '').toString().trim();
      if (!clientNom) return;

      var nbAM  = parseInt(row['Nb AM']  || row['nb_am']  || row['AM']  || 0) || 0;
      var nbPM  = parseInt(row['Nb PM']  || row['nb_pm']  || row['PM']  || 0) || 0;
      var typo  = (row['Véhicule'] || row['vehicule'] || row['Typologie'] || row['typologie'] || '').toString().trim().toUpperCase();
      var ptsMoy = parseInt(row['Pts/jour'] || row['pts_jour'] || row['Points'] || row['points'] || 0) || 0;
      var hMoy   = parseInt(row['H/jour'] || row['h_jour'] || row['Heures'] || row['heures'] || 0) || 0;
      var comment = (row['Commentaire'] || row['commentaire'] || '').toString().trim();

      if (nbAM === 0 && nbPM === 0) return;

      besoins.push({
        client_nom: clientNom,
        nb_am: nbAM,
        nb_pm: nbPM,
        typologie_vehicule: typo,
        pts_jour_moy: ptsMoy,
        h_jour_moy: hMoy,
        commentaire: comment
      });
    });

    return besoins;
  }

  // ─── Construction du prompt v2 ────────────────────────────────

  function buildDispatchPrompt(data, besoins, targetMonday) {
    var range = _weekRangeFrom(targetMonday);
    var prompt = '';

    prompt += 'Tu es un dispatcher expert en transport et logistique en France.\n';
    prompt += 'On te donne les BESOINS HEBDOMADAIRES de chaque client (combien de tournees AM et PM il veut cette semaine).\n';
    prompt += 'TOI tu decides : quels jours precis, quels chauffeurs, quels vehicules, quelles heures.\n';
    prompt += 'Tu te bases sur l\'historique des 3 dernieres semaines pour reproduire les habitudes.\n\n';
    prompt += 'Semaine cible : ' + range.start + ' au ' + range.end + '\n\n';

    // ── Besoins ──
    prompt += '=== BESOINS CLIENTS POUR LA SEMAINE ===\n';
    besoins.forEach(function(b) {
      prompt += '- ' + b.client_nom + ' : ' + b.nb_am + ' tournee(s) AM + ' + b.nb_pm + ' tournee(s) PM';
      if (b.typologie_vehicule) prompt += ' — vehicule: ' + b.typologie_vehicule;
      if (b.pts_jour_moy) prompt += ' — ~' + b.pts_jour_moy + ' pts/jour';
      if (b.h_jour_moy) prompt += ' — ~' + b.h_jour_moy + 'h/jour';
      if (b.commentaire) prompt += ' — ' + b.commentaire;
      prompt += '\n';
    });
    prompt += '\n';

    // ── Chauffeurs + absences ──
    // Construire un index des jours d'absence par chauffeur
    var absParChauffeur = {};
    var absLabels = { conge_paye:'Congé', maladie:'Maladie', absence_injustifiee:'Absence', jour_ferie:'Férié', formation:'Formation', autre:'Absent', CP:'Congé', RTT:'RTT' };
    if (data.absences && data.absences.length > 0) {
      data.absences.forEach(function(a) {
        if (!absParChauffeur[a.chauffeur_nom]) absParChauffeur[a.chauffeur_nom] = [];
        absParChauffeur[a.chauffeur_nom].push({
          du: a.date_debut,
          au: a.date_fin,
          type: absLabels[a.type] || a.type || 'Absent'
        });
      });
    }

    prompt += '=== CHAUFFEURS ===\n';
    data.chauffeurs.forEach(function(c) {
      var abs = absParChauffeur[c.nom];
      if (abs) {
        // Chauffeur partiellement ou totalement absent
        prompt += '- ' + c.nom + ' (' + (c.type || 'salarie') + ')';
        if (c.vehicule) prompt += ' — vehicule: ' + c.vehicule;
        abs.forEach(function(a) {
          prompt += ' ⛔ INDISPONIBLE du ' + a.du + ' au ' + a.au + ' (' + a.type + ')';
        });
        prompt += '\n';
      } else {
        prompt += '- ' + c.nom + ' (' + (c.type || 'salarie') + ') — DISPONIBLE toute la semaine';
        if (c.vehicule) prompt += ' — vehicule: ' + c.vehicule;
        prompt += '\n';
      }
    });
    prompt += '\n';

    // ── Véhicules ──
    prompt += '=== VEHICULES DISPONIBLES ===\n';
    data.vehicules.forEach(function(v) {
      if (v.statut === 'hors service') return;
      prompt += '- ' + v.immatriculation;
      if (v.typologie) prompt += ' [' + v.typologie + ']';
      if (v.marque) prompt += ' ' + v.marque + (v.modele ? ' ' + v.modele : '');
      prompt += ' — ' + (v.statut || 'disponible');
      if (v.chauffeur_nom) prompt += ' — attitre: ' + v.chauffeur_nom;
      prompt += '\n';
    });
    prompt += '\n';

    // ── Clients (tarifs) ──
    prompt += '=== CLIENTS (tarifs pour info) ===\n';
    data.clients.forEach(function(c) {
      prompt += '- ' + c.nom;
      if (c.type_paiement === 'point') {
        prompt += ' [POINT: AM=' + (c.tarif_point_am||0) + 'EUR/pt, PM=' + (c.tarif_point_pm||0) + 'EUR/pt]';
      } else if (c.type_paiement === 'heure') {
        prompt += ' [HEURE: AM=' + (c.tarif_heure_am||0) + 'EUR/h, PM=' + (c.tarif_heure_pm||0) + 'EUR/h]';
      } else {
        prompt += ' [FIXE: ' + (c.tarif||0) + 'EUR/j]';
      }
      if (c.ville) prompt += ' — ' + c.ville;
      prompt += '\n';
    });
    prompt += '\n';

    // ── Historique + détection nouveautés ──
    var clientsAvecHistorique = {};
    var chauffeursAvecHistorique = {};
    var vehiculesAvecHistorique = {};
    data.historique.forEach(function(t) {
      if (t.client_nom) clientsAvecHistorique[t.client_nom] = true;
      if (t.chauffeur_nom) chauffeursAvecHistorique[t.chauffeur_nom] = true;
      if (t.vehicule) vehiculesAvecHistorique[t.vehicule] = true;
    });

    // Identifier les nouveaux éléments
    var nouveauxClients = besoins.filter(function(b) { return !clientsAvecHistorique[b.client_nom]; }).map(function(b) { return b.client_nom; });
    var nouveauxChauffeurs = data.chauffeurs.filter(function(c) { return !chauffeursAvecHistorique[c.nom]; }).map(function(c) { return c.nom; });
    var nouveauxVehicules = data.vehicules.filter(function(v) { return v.statut !== 'hors service' && !vehiculesAvecHistorique[v.immatriculation]; }).map(function(v) { return v.immatriculation; });

    if (nouveauxClients.length > 0 || nouveauxChauffeurs.length > 0 || nouveauxVehicules.length > 0) {
      prompt += '=== ⚡ NOUVEAUX ELEMENTS (sans historique) ===\n';
      if (nouveauxClients.length > 0) {
        prompt += '🆕 NOUVEAUX CLIENTS (aucune tournee precedente, repartis librement) :\n';
        nouveauxClients.forEach(function(n) { prompt += '  - ' + n + '\n'; });
      }
      if (nouveauxChauffeurs.length > 0) {
        prompt += '🆕 NOUVEAUX CHAUFFEURS (jamais affectes, utilisables pour equilibrer) :\n';
        nouveauxChauffeurs.forEach(function(n) { prompt += '  - ' + n + '\n'; });
      }
      if (nouveauxVehicules.length > 0) {
        prompt += '🆕 NOUVEAUX VEHICULES (jamais utilises) :\n';
        nouveauxVehicules.forEach(function(n) { prompt += '  - ' + n + '\n'; });
      }
      prompt += '\n';
    }

    prompt += '=== HISTORIQUE 3 DERNIERES SEMAINES ===\n';
    prompt += 'Cet historique te montre les habitudes : qui faisait quoi, quels jours, quels horaires.\n';
    prompt += 'REPRODUIS ces schemas autant que possible (memes chauffeurs pour memes clients, memes jours).\n\n';
    if (data.historique.length === 0) {
      prompt += '(Aucun historique — premiere utilisation, repartis librement)\n';
    } else {
      var parSemaine = {};
      data.historique.forEach(function(t) {
        var mon = _mondayOf(t.date);
        var key = _fmtD(mon);
        if (!parSemaine[key]) parSemaine[key] = [];
        parSemaine[key].push(t);
      });
      Object.keys(parSemaine).sort().forEach(function(sem) {
        prompt += 'Semaine du ' + sem + ' :\n';
        parSemaine[sem].forEach(function(t) {
          var d = new Date(t.date + 'T12:00:00');
          var jourNom = JOURS_SEMAINE[d.getDay() === 0 ? 6 : d.getDay() - 1];
          prompt += '  ' + jourNom + ' ' + t.date + ' ' + (t.slot||'AM') + ' — ' + (t.chauffeur_nom||'?') + ' -> ' + (t.client_nom||'?');
          if (t.vehicule) prompt += ' [' + t.vehicule + ']';
          if (t.heure) prompt += ' ' + t.heure;
          if (t.nb_points_estime) prompt += ' (' + t.nb_points_estime + 'pts)';
          prompt += '\n';
        });
        prompt += '\n';
      });
    }

    // ── Règles ──
    prompt += '=== REGLES ===\n';
    prompt += '1. ABSENCES : Ne JAMAIS affecter un chauffeur sur un jour ou il est marque INDISPONIBLE (conge, maladie, etc). C\'est PRIORITAIRE.\n';
    prompt += '2. CONTINUITE : Meme chauffeur pour meme client si possible (base-toi sur l\'historique).\n';
    prompt += '3. JOURS HABITUELS : Reproduis les jours habituels du client (ex: si historique = Lun/Mar/Mer, garde Lun/Mar/Mer).\n';
    prompt += '4. HEURES HABITUELLES : Reproduis les heures de depart habituelles de l\'historique.\n';
    prompt += '5. EQUILIBRE : Repartis equitablement si plusieurs chauffeurs sont necessaires.\n';
    prompt += '6. VEHICULE : Le vehicule du chauffeur attitre en priorite, sinon un vehicule correspondant a la typologie demandee.\n';
    prompt += '7. PAS DE CONFLIT : Un chauffeur ne peut pas avoir 2 missions sur le meme creneau (AM ou PM) le meme jour.\n';
    prompt += '8. SOUS-TRAITANTS : Utilise-les seulement si les salaries ne suffisent pas.\n';
    prompt += '9. REMPLACEMENT : Si le chauffeur habituel est absent, affecte un remplacant du meme type si possible et signale-le en alerte.\n';
    prompt += '10. ALERTES : Signale clairement si tu ne peux pas couvrir un besoin (pas assez de chauffeurs dispos, etc).\n';
    prompt += '11. NOUVEAUTES : Si un client, chauffeur ou vehicule est marque 🆕 (nouveau, sans historique), signale-le dans les alertes. Pour un nouveau client, repartis ses tournees librement sur la semaine. Pour un nouveau chauffeur, integre-le progressivement.\n\n';

    // ── Format réponse ──
    prompt += '=== FORMAT DE REPONSE ===\n';
    prompt += 'Reponds UNIQUEMENT avec un JSON valide, sans texte, sans markdown :\n';
    prompt += '{\n';
    prompt += '  "dispatch": [\n';
    prompt += '    {\n';
    prompt += '      "date": "YYYY-MM-DD",\n';
    prompt += '      "jour": "Lundi",\n';
    prompt += '      "slot": "AM",\n';
    prompt += '      "chauffeur_nom": "Nom Prenom",\n';
    prompt += '      "client_nom": "NOM CLIENT (exactement comme dans la liste)",\n';
    prompt += '      "vehicule": "AB-123-CD",\n';
    prompt += '      "nb_points_estime": 0,\n';
    prompt += '      "nb_heures_estime": 0,\n';
    prompt += '      "heure": "06:00",\n';
    prompt += '      "commentaire": ""\n';
    prompt += '    }\n';
    prompt += '  ],\n';
    prompt += '  "alertes": ["texte alerte si probleme"],\n';
    prompt += '  "resume": "Resume en 2-3 phrases"\n';
    prompt += '}\n\n';
    prompt += 'IMPORTANT:\n';
    prompt += '- Utilise EXACTEMENT les noms de chauffeurs et clients de la liste.\n';
    prompt += '- Utilise EXACTEMENT les immatriculations de la liste vehicules.\n';
    prompt += '- nb_points_estime : uniquement si client au tarif POINT (mets la valeur pts/jour du besoin).\n';
    prompt += '- nb_heures_estime : uniquement si client au tarif HEURE.\n';
    prompt += '- JSON brut, pas de ```json.\n';

    return prompt;
  }

  // ─── Appel Gemini API ─────────────────────────────────────────

  async function callGemini(prompt) {
    var response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, OT.authHeaders()),
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 8192 }
      })
    });

    if (!response.ok) {
      var errText = await response.text();
      throw new Error('Gemini API erreur ' + response.status + ': ' + errText);
    }

    var result = await response.json();
    var text = '';
    if (result.candidates && result.candidates[0] && result.candidates[0].content) {
      var parts = result.candidates[0].content.parts;
      if (parts && parts[0]) text = parts[0].text;
    }
    if (!text) throw new Error('Aucune reponse de Gemini.');

    text = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

    try {
      return JSON.parse(text);
    } catch (e) {
      console.error('[OT_DISPATCH] JSON invalide:', text);
      throw new Error('L\'IA a retourne une reponse non structuree. Reessayez.');
    }
  }

  // ─── Dispatch principal ───────────────────────────────────────

  async function generateDispatch(besoins, targetMonday) {
    if (!_canDispatch()) {
      throw new Error('Limite de dispatch atteinte (' + MAX_DISPATCH_PER_DAY + '/jour). Reessayez demain.');
    }
    if (!besoins || besoins.length === 0) {
      throw new Error('Aucun besoin a dispatcher.');
    }

    var data = await collectDispatchData(targetMonday);
    if (data.chauffeurs.length === 0) {
      throw new Error('Aucun chauffeur actif. Verifiez vos parametres.');
    }

    var prompt = buildDispatchPrompt(data, besoins, targetMonday);
    var result = await callGemini(prompt);

    _markDispatched();
    return result;
  }

  // ─── Synchronisation vers Supabase ────────────────────────────

  async function syncToPlanning(dispatch) {
    if (!dispatch || dispatch.length === 0) return 0;

    var cid = OT.getCompanyId();
    var headers = _getHeaders();
    headers['Content-Type'] = 'application/json';
    headers['Prefer'] = 'return=minimal';

    var payload = dispatch.map(function(d) {
      var obj = {
        company_id:    cid,
        date:          d.date,
        chauffeur_nom: d.chauffeur_nom,
        client_nom:    d.client_nom,
        slot:          d.slot || 'AM',
        heure:         d.heure || '',
        vehicule:      d.vehicule || '',
        commentaire:   (d.commentaire || '') + ' [IA Dispatch]'
      };
      if (d.nb_points_estime) obj.nb_points_estime = d.nb_points_estime;
      if (d.nb_heures_estime) obj.nb_heures_estime = d.nb_heures_estime;
      if (d.heure_debut_estime) obj.heure_debut_estime = d.heure_debut_estime;
      if (d.heure_fin_estime)   obj.heure_fin_estime   = d.heure_fin_estime;
      return obj;
    });

    var response = await fetch(SB + '/rest/v1/tournees', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error('Erreur sync planning: ' + await response.text());
    }
    return payload.length;
  }

  // ─── Template Excel v2 (matrice simple) ───────────────────────

  async function downloadTemplate(targetMonday) {
    var headers = _getHeaders();
    var cf = OT.companyFilter();

    var [clientsR, vehiculesR] = await Promise.all([
      fetch(SB + '/rest/v1/clients?' + cf + '&order=nom&select=nom,type_paiement,ville', { headers: headers }),
      fetch(SB + '/rest/v1/vehicules?' + cf + '&order=immatriculation&select=immatriculation,typologie,statut', { headers: headers })
    ]);

    var clients   = clientsR.ok   ? await clientsR.json()   : [];
    var vehicules = vehiculesR.ok ? await vehiculesR.json() : [];

    // Feuille 1 : Matrice simple — une ligne par client
    var matrice = [['Client', 'Nb AM', 'Nb PM', 'Véhicule', 'Pts/jour', 'H/jour', 'Commentaire']];
    clients.forEach(function(c) {
      matrice.push([
        c.nom,
        '',   // Nb AM à remplir
        '',   // Nb PM à remplir
        '',   // Typologie véhicule
        c.type_paiement === 'point' ? '' : '',
        c.type_paiement === 'heure' ? '' : '',
        ''
      ]);
    });

    // Feuille 2 : Référentiel (pour listes déroulantes dans Excel)
    var refData = [['Typologies Véhicule', 'Immatriculations']];
    var maxRows = Math.max(TYPOLOGIES.length, vehicules.length);
    for (var i = 0; i < maxRows; i++) {
      refData.push([
        i < TYPOLOGIES.length ? TYPOLOGIES[i] : '',
        i < vehicules.length ? vehicules[i].immatriculation + (vehicules[i].typologie ? ' [' + vehicules[i].typologie + ']' : '') : ''
      ]);
    }

    var wb = XLSX.utils.book_new();

    var ws1 = XLSX.utils.aoa_to_sheet(matrice);
    ws1['!cols'] = [{ wch:30 },{ wch:8 },{ wch:8 },{ wch:20 },{ wch:10 },{ wch:8 },{ wch:30 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Besoins Semaine');

    var ws2 = XLSX.utils.aoa_to_sheet(refData);
    ws2['!cols'] = [{ wch:22 },{ wch:35 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Référentiel');

    var range = _weekRangeFrom(targetMonday);
    var fname = 'Matrice_Besoins_' + range.start + '.xlsx';
    XLSX.writeFile(wb, fname);
    return fname;
  }

  // ─── API publique ────────────────────────────────────────────
  return {
    collectDispatchData:    collectDispatchData,
    parseExcelBesoins:      parseExcelBesoins,
    generateDispatch:       generateDispatch,
    syncToPlanning:         syncToPlanning,
    downloadTemplate:       downloadTemplate,
    canDispatch:            _canDispatch,
    getRemainingDispatches: getRemainingDispatches,
    TYPOLOGIES:             TYPOLOGIES
  };

})();
