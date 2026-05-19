// ════════════════════════════════════════════════════════════════════
// ot_zone.js — Helper partagé pour la facturation par zone (addon_zone)
//
// Réutilise les tables Décompte ST (Delifresh) :
//   - decompte_st_zones         : tarifs €/point par zone
//   - decompte_st_city_zones    : mapping ville/cp_prefix → zone
//
// API publique :
//   OT_ZONE.normalize(v)       → normalise un nom de ville (UPPER, sans accents)
//   OT_ZONE.findZone(ville,cp) → résout la zone (string) ou '' si non trouvée
//   OT_ZONE.tarifPoint(zone)   → tarif €/point pour la zone donnée
//   OT_ZONE.computeCA(cl,t)    → CA d'une tournée client en mode 'zone'
//   await OT_ZONE.load(companyId) → charge rates + cityMap depuis Supabase
// ════════════════════════════════════════════════════════════════════

(function(){
  const SB  = 'https://kfdyqcbclueppmvkccdz.supabase.co';
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmZHlxY2JjbHVlcHBtdmtjY2R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMjAxNTQsImV4cCI6MjA5NDc5NjE1NH0.gj0eT27HcdkPw6fTZRBbSflVv5Yh1SPA9o8vAAiX_CU';

  function _headers(){
    // OT est déclaré avec const dans les pages → n'est PAS sur window. typeof évite le piège.
    if(typeof OT !== 'undefined' && typeof OT.authHeaders === 'function') return OT.authHeaders();
    return { 'Content-Type':'application/json', 'apikey':KEY, 'Authorization':'Bearer '+KEY };
  }

  const ZONE = {
    rates:    {},   // { '1': 1.50, '2': 1.20, ... }
    cityMap:  {},   // { 'NORM_VILLE': '1', ... }
    cpMap:    {},   // { '75': '1', '92': '2', ... }
    loadedFor: null, // company_id chargée (cache lazy)

    normalize(v){
      if(v == null) return '';
      return v.toString().toUpperCase().trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
        .replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
    },

    findZone(ville, cp){
      return this.findZoneVerbose(ville, cp).zone;
    },

    // Retourne {zone, source} où source ∈ 'exact_ville' | 'fuzzy_ville' | 'cp_prefix' | 'default' | ''
    // Permet à l'UI d'avertir l'admin si le match n'est pas exact (ambiguïté sur 78/91/92/93/94).
    findZoneVerbose(ville, cp){
      const norm = this.normalize(ville);
      if(norm && this.cityMap[norm]) return { zone: String(this.cityMap[norm]), source: 'exact_ville' };
      if(norm){
        const keys = Object.keys(this.cityMap);
        for(const k of keys){
          if(!k) continue;
          if(norm.includes(k) || k.includes(norm)) return { zone: String(this.cityMap[k]), source: 'fuzzy_ville' };
        }
      }
      const cpStr = (cp == null ? '' : String(cp)).trim();
      if(cpStr.length >= 2){
        const dept = cpStr.substring(0,2);
        if(this.cpMap[dept]) return { zone: String(this.cpMap[dept]), source: 'cp_prefix' };
        // Fallbacks Delifresh hardcodés (depts IDF non couverts par le mapping)
        if(dept === '75') return { zone: '1', source: 'default' };
        if(dept === '92' || dept === '93' || dept === '94') return { zone: '2', source: 'default' };
      }
      // Aucun match : zone par défaut = la plus chère de la grille (sécurité côté facturation)
      // Cohérent avec optimum_trans_decompte_st.html ligne 393 qui hardcode '4'.
      const zoneKeys = Object.keys(this.rates || {});
      if(zoneKeys.length > 0){
        // Prendre la zone numérique max (Z1..Z4 → 4) ; sinon la dernière clé
        const numeric = zoneKeys.filter(z => !isNaN(parseInt(z, 10))).map(z => parseInt(z, 10));
        const fallback = numeric.length ? String(Math.max(...numeric)) : zoneKeys[zoneKeys.length - 1];
        return { zone: fallback, source: 'default' };
      }
      return { zone: '', source: '' };
    },

    tarifPoint(zone){
      if(!zone) return 0;
      const v = this.rates[String(zone)];
      const n = parseFloat(v);
      return isNaN(n) ? 0 : n;
    },

    // Calcule le CA pour une liste de lignes [{ville, nb_points_estime, nb_points_reel?}, ...]
    // Si nb_points_reel est défini, il prime sur nb_points_estime (idem mode point).
    // Retourne {total, lines: [{ville, zone, source, pts, tarif, ca}, ...]}.
    computeLinesCA(zoneLines){
      const out = { total: 0, lines: [] };
      if(!Array.isArray(zoneLines)) return out;
      for(const l of zoneLines){
        const r = this.findZoneVerbose(l && l.ville || '', '');
        const tarif = this.tarifPoint(r.zone);
        const reel = parseFloat(l && l.nb_points_reel);
        const est  = parseFloat(l && l.nb_points_estime);
        const pts  = !isNaN(reel) ? reel : (!isNaN(est) ? est : 0);
        const ca   = pts * tarif;
        out.lines.push({ ville: l && l.ville || '', zone: r.zone, source: r.source, pts, tarif, ca });
        out.total += ca;
      }
      return out;
    },

    // Somme des nb_points (estime ou reel) d'une liste de lignes, pour rétro-compat
    // avec les pages qui lisent t.nb_points_estime / t.nb_points_reel.
    sumLinesPoints(zoneLines, field){
      if(!Array.isArray(zoneLines)) return 0;
      return zoneLines.reduce((s, l) => {
        const v = parseFloat(l && l[field]);
        return s + (isNaN(v) ? 0 : v);
      }, 0);
    },

    computeCA(client, tournee){
      if(!client || client.type_paiement !== 'zone') return 0;
      const cp   = (tournee && tournee.code_postal_livraison) || '';
      const zone = this.findZone(client.ville || '', cp);
      let pts    = 0;
      if(tournee){
        const r = parseFloat(tournee.nb_points_reel);
        const e = parseFloat(tournee.nb_points_estime);
        pts = !isNaN(r) ? r : (!isNaN(e) ? e : 0);
      }
      return pts * this.tarifPoint(zone);
    },

    async load(companyId){
      if(!companyId) return;
      // Si déjà chargé pour cette compagnie, no-op
      if(this.loadedFor === companyId) return;

      // Mode démo : utiliser DEMO_ZONES / DEMO_ZONE_CITIES (pas de fetch Supabase)
      const sess = (typeof OT !== 'undefined' && typeof OT.getSession === 'function') ? OT.getSession() : null;
      if(sess && sess.id === 'demo' && Array.isArray(window.DEMO_ZONES)){
        const rates = {};
        const cityMap = {};
        const cpMap = {};
        (window.DEMO_ZONES || []).forEach(d => { rates[String(d.zone)] = parseFloat(d.tarif) || 0; });
        (window.DEMO_ZONE_CITIES || []).forEach(d => {
          if(d.ville) cityMap[ZONE.normalize(d.ville)] = String(d.zone);
          if(d.cp_prefix) cpMap[String(d.cp_prefix).trim()] = String(d.zone);
        });
        this.rates    = rates;
        this.cityMap  = cityMap;
        this.cpMap    = cpMap;
        this.loadedFor = companyId;
        return;
      }

      try {
        const [rRates, rCities] = await Promise.all([
          fetch(SB + '/rest/v1/decompte_st_zones?company_id=eq.' + companyId, { headers:_headers() }),
          fetch(SB + '/rest/v1/decompte_st_city_zones?company_id=eq.' + companyId + '&select=ville,cp_prefix,zone&limit=5000', { headers:_headers() })
        ]);
        const rates = {};
        const cityMap = {};
        const cpMap = {};
        if(rRates.ok){
          const data = await rRates.json();
          (data || []).forEach(d => { rates[String(d.zone)] = parseFloat(d.tarif) || 0; });
        }
        if(rCities.ok){
          const data = await rCities.json();
          (data || []).forEach(d => {
            if(d.ville) cityMap[ZONE.normalize(d.ville)] = String(d.zone);
            if(d.cp_prefix) cpMap[String(d.cp_prefix).trim()] = String(d.zone);
          });
        }
        this.rates    = rates;
        this.cityMap  = cityMap;
        this.cpMap    = cpMap;
        this.loadedFor = companyId;
      } catch(e){
        // En mode dégradé, on laisse les maps vides → CA = 0 pour les tournées zone.
        // L'admin verra "Zone : —" et pourra remplir les zones plus tard.
      }
    },

    // Force un rechargement (utilisé après save dans Paramètres → Zones)
    invalidate(){ this.loadedFor = null; }
  };

  window.OT_ZONE = ZONE;
})();
