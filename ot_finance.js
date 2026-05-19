// ════════════════════════════════════════════════════════════════════
// ot_finance.js — Source unique pour CA, coûts et marge
//
// Référence : la page Clients & Facturation. Tous les autres écrans
// (Dashboard, barre d'info, etc.) DOIVENT utiliser ce module pour
// rester cohérents — sinon les chiffres divergent.
//
// API publique :
//   OT_FINANCE.getDayType(dateStr)
//   OT_FINANCE.getTarifClient(client, dayType, tournee)
//   OT_FINANCE.getTarifCh(client, driverType, dayType)
//   OT_FINANCE.computeReport({clients, tournees, chauffeurs,
//                              vehicules, gazole, maintenance,
//                              entreprise, period:{start,end}})
//     → { ca, cout, marge, taux, byClient[], byChauffeur[] }
// ════════════════════════════════════════════════════════════════════
(function(){
  'use strict';

  // ── Jours fériés (France) — calcul Pâques + fixes ─────────────────
  const _JF = {};
  function _getJF(y){
    if(_JF[y]) return _JF[y];
    const fixes=[`${y}-01-01`,`${y}-05-01`,`${y}-05-08`,`${y}-07-14`,`${y}-08-15`,`${y}-11-01`,`${y}-11-11`,`${y}-12-25`];
    const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,ff=Math.floor((b+8)/25),g=Math.floor((b-ff+1)/3),h=(19*a+b-d-g+15)%30;
    const i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
    const mo=Math.floor((h+l-7*m+114)/31),dy=((h+l-7*m+114)%31)+1;
    const ea=new Date(y,mo-1,dy);
    const ad=(dt,n)=>{const r=new Date(dt);r.setDate(r.getDate()+n);return `${r.getFullYear()}-${String(r.getMonth()+1).padStart(2,'0')}-${String(r.getDate()).padStart(2,'0')}`;};
    return _JF[y] = new Set([...fixes, ad(ea,1), ad(ea,39), ad(ea,49), ad(ea,50)]);
  }

  function getDayType(dateStr){
    if(!dateStr) return 'semaine';
    const s = dateStr.substring(0,10);
    const y = parseInt(s);
    if(_getJF(y).has(s)) return 'ferie';
    const dow = new Date(s+'T12:00:00').getDay();
    return dow===0 ? 'dimanche' : 'semaine';
  }

  // ── Helpers forfait ───────────────────────────────────────────────
  function _forfaitMinutes(cl,slot,dayType){
    if(!cl) return 0;
    const isPM = slot==='PM';
    if(dayType==='ferie'){ const v=isPM?cl.forfait_minutes_ferie_pm:cl.forfait_minutes_ferie_am; if(v) return v; }
    if(dayType==='dimanche'){ const v=isPM?cl.forfait_minutes_dim_pm:cl.forfait_minutes_dim_am; if(v) return v; }
    return (isPM?cl.forfait_minutes_pm:cl.forfait_minutes_am)||0;
  }
  function _forfaitMontant(cl,slot,dayType){
    if(!cl) return 0;
    const isPM = slot==='PM';
    if(dayType==='ferie'){ const v=parseFloat(isPM?cl.forfait_montant_ferie_pm:cl.forfait_montant_ferie_am)||0; if(v>0) return v; }
    if(dayType==='dimanche'){ const v=parseFloat(isPM?cl.forfait_montant_dim_pm:cl.forfait_montant_dim_am)||0; if(v>0) return v; }
    return parseFloat(isPM?cl.forfait_montant_pm:cl.forfait_montant_am)||0;
  }
  function _forfaitTarifMin(cl,slot,dayType){
    if(!cl) return 0;
    const isPM = slot==='PM';
    if(dayType==='ferie'){ const v=parseFloat(isPM?cl.tarif_minute_depass_ferie_pm:cl.tarif_minute_depass_ferie_am)||0; if(v>0) return v; }
    if(dayType==='dimanche'){ const v=parseFloat(isPM?cl.tarif_minute_depass_dim_pm:cl.tarif_minute_depass_dim_am)||0; if(v>0) return v; }
    return parseFloat(isPM?cl.tarif_minute_depass_pm:cl.tarif_minute_depass_am)||0;
  }
  function _dureeMin(debut,fin){
    if(!debut||!fin) return 0;
    const [hd,md] = String(debut).split(':').map(n=>parseInt(n,10)||0);
    const [hf,mf] = String(fin).split(':').map(n=>parseInt(n,10)||0);
    let d = (hf*60+mf) - (hd*60+md);
    if(d<0) d += 24*60;
    return d;
  }

  // ── Tarif facturé au client pour une tournée ──────────────────────
  function getTarifClient(cl, dayType, tournee, ptCountByTournee){
    if(!cl) return 0;
    const isPM = tournee?.slot==='PM';
    if(cl.type_paiement==='point'){
      const pts = tournee
        ? (tournee.nb_points_reel!=null ? parseFloat(tournee.nb_points_reel)
          : (tournee.nb_points_estime!=null ? parseFloat(tournee.nb_points_estime)
            : (ptCountByTournee && ptCountByTournee[tournee.id] || 0)))
        : 0;
      let pu;
      if(dayType==='ferie') pu = isPM?(parseFloat(cl.tarif_point_pm_ferie)||parseFloat(cl.tarif_point_pm)||0):(parseFloat(cl.tarif_point_am_ferie)||parseFloat(cl.tarif_point_am)||0);
      else pu = isPM?(parseFloat(cl.tarif_point_pm)||0):(parseFloat(cl.tarif_point_am)||0);
      return pts*pu;
    }
    if(cl.type_paiement==='heure'){
      const hrs = tournee
        ? (tournee.nb_heures_reel!=null ? parseFloat(tournee.nb_heures_reel) : (tournee.nb_heures_estime!=null ? parseFloat(tournee.nb_heures_estime) : 0))
        : 0;
      let pu;
      if(dayType==='ferie') pu = isPM?(parseFloat(cl.tarif_heure_pm_ferie)||parseFloat(cl.tarif_heure_pm)||0):(parseFloat(cl.tarif_heure_am_ferie)||parseFloat(cl.tarif_heure_am)||0);
      else pu = isPM?(parseFloat(cl.tarif_heure_pm)||0):(parseFloat(cl.tarif_heure_am)||0);
      return hrs*pu;
    }
    if(cl.type_paiement==='forfait_heures'){
      const slot = tournee?.slot||'AM';
      const forfait = _forfaitMontant(cl,slot,dayType);
      const minutesIncl = _forfaitMinutes(cl,slot,dayType);
      const tmin = _forfaitTarifMin(cl,slot,dayType);
      const dReel = (tournee?.heure_debut_reel && tournee?.heure_fin_reel) ? _dureeMin(tournee.heure_debut_reel,tournee.heure_fin_reel) : null;
      const dEst  = (tournee?.heure_debut_estime && tournee?.heure_fin_estime) ? _dureeMin(tournee.heure_debut_estime,tournee.heure_fin_estime) : null;
      const duree = dReel!=null ? dReel : dEst;
      const depassMin = (duree!=null && minutesIncl>0) ? Math.max(0, duree-minutesIncl) : 0;
      return forfait + depassMin*tmin;
    }
    if(cl.type_paiement==='zone'){
      if(!window.OT_ZONE || !tournee) return 0;
      if(Array.isArray(tournee.zone_lines) && tournee.zone_lines.length>0) return OT_ZONE.computeLinesCA(tournee.zone_lines).total;
      const cp = tournee.code_postal_livraison || '';
      const zone = OT_ZONE.findZone(tournee.ville_livraison || cl.ville || '', cp);
      const pts = tournee.nb_points_reel!=null ? parseFloat(tournee.nb_points_reel) : (tournee.nb_points_estime!=null ? parseFloat(tournee.nb_points_estime) : 0);
      return (pts||0) * OT_ZONE.tarifPoint(zone);
    }
    // fixe
    if(dayType==='ferie') return parseFloat(cl.tarif_ferie)||0;
    if(dayType==='dimanche') return parseFloat(cl.tarif_dim)||0;
    return parseFloat(cl.tarif)||0;
  }

  // ── Tarif (= coût) chauffeur facial par tournée ───────────────────
  function getTarifCh(cl, driverType, dayType){
    if(!cl) return 0;
    if(driverType==='salarié'){
      if(dayType==='ferie') return parseFloat(cl.salaire_ch_ferie)||0;
      if(dayType==='dimanche') return parseFloat(cl.salaire_ch_dim)||0;
      return parseFloat(cl.salaire_ch_sem)||0;
    } else {
      if(dayType==='ferie') return parseFloat(cl.salaire_st_ferie)||0;
      if(dayType==='dimanche') return parseFloat(cl.salaire_st_dim)||0;
      return parseFloat(cl.salaire_st_sem)||0;
    }
  }

  // ── Rapport financier complet sur une période ─────────────────────
  //
  // Réplique exactement le calcul de la page Clients & Facturation :
  //   coût = coûtChauffeur (avec coef employeur sur salariés)
  //        + gazole pro-raté par camion
  //        + assurance pro-ratée
  //        + location pro-ratée
  //        + maintenance pro-ratée
  //        + charges fixes mensuelles pro-ratées au CA
  //
  function computeReport(input){
    const clients    = input.clients   || [];
    const tournees   = input.tournees  || [];
    const chauffeurs = input.chauffeurs|| [];
    const vehicules  = input.vehicules || [];
    const gazole     = input.gazole    || [];
    const maintenance= input.maintenance|| [];
    const entreprise = input.entreprise|| {};
    const period     = input.period    || null; // {start, end} en YYYY-MM-DD

    const chMap = {};
    chauffeurs.forEach(c => { chMap[c.nom] = c; });
    const vehMap = {};
    vehicules.forEach(v => { vehMap[v.immatriculation] = v; });

    const coefSalarie = Math.max(1, (function(v){ return isNaN(v)?1.82:v; })(parseFloat(entreprise.coefficient_salarie)));
    const chargesFixes = parseFloat(entreprise.charges_fixes_mensuelles)||0;

    let nbMois = 1;
    if(period && period.start && period.end){
      const days = Math.round((new Date(period.end+'T12:00:00') - new Date(period.start+'T12:00:00'))/86400000) + 1;
      nbMois = days / 30.437;
    }

    // Index : gazole, maintenance et nombre total de tournées par camion
    const gazoleByTruck = {}, maintenanceByTruck = {}, tourneesByTruck = {};
    gazole.forEach(g => { if(g.vehicule) gazoleByTruck[g.vehicule] = (gazoleByTruck[g.vehicule]||0) + (parseFloat(g.montant)||0); });
    maintenance.forEach(m => { if(m.vehicule_immat) maintenanceByTruck[m.vehicule_immat] = (maintenanceByTruck[m.vehicule_immat]||0) + (parseFloat(m.cout)||0); });
    tournees.forEach(t => { if(t.vehicule) tourneesByTruck[t.vehicule] = (tourneesByTruck[t.vehicule]||0) + 1; });

    // Regroupe les tournées par client
    const byClientList = {};
    tournees.forEach(t => { if(!byClientList[t.client_nom]) byClientList[t.client_nom] = []; byClientList[t.client_nom].push(t); });

    const byClient = clients.map(cl => {
      const list = byClientList[cl.nom] || [];
      const nb = list.length;
      // CA
      let ca = 0;
      list.forEach(t => { ca += getTarifClient(cl, getDayType(t.date), t); });
      // Coût chauffeur (avec coefficient employeur pour les salariés)
      let coutChauffeur = 0;
      list.forEach(t => {
        const ch = chMap[t.chauffeur_nom];
        const isSal = !ch || ch.type==='salarié';
        const tarifCh = getTarifCh(cl, isSal?'salarié':'sous-traitant', getDayType(t.date));
        coutChauffeur += isSal ? tarifCh * coefSalarie : tarifCh;
      });
      // Coûts camion pro-ratés
      const truckCount = {};
      list.forEach(t => { if(t.vehicule) truckCount[t.vehicule] = (truckCount[t.vehicule]||0) + 1; });
      let coutGazole=0, coutAssurance=0, coutLocation=0, coutMaintenance=0;
      Object.entries(truckCount).forEach(([immat, nbT]) => {
        const totT = tourneesByTruck[immat] || nbT;
        const pro = totT>0 ? nbT/totT : 0;
        const v = vehMap[immat] || {};
        coutGazole      += (gazoleByTruck[immat]||0) * pro;
        coutAssurance   += (parseFloat(v.assurance_mensuel)||0) * nbMois * pro;
        coutLocation    += (v.type_propriete==='location' ? (parseFloat(v.tarif_location)||0) : 0) * nbMois * pro;
        coutMaintenance += (maintenanceByTruck[immat]||0) * pro;
      });
      const cout = coutChauffeur + coutGazole + coutAssurance + coutLocation + coutMaintenance;
      return { ...cl, tournees:nb, ca, cout, coutChauffeur, coutGazole, coutAssurance, coutLocation, coutMaintenance, marge:ca-cout, taux: ca>0 ? Math.round((ca-cout)/ca*100) : 0, list };
    });

    // Amortir les charges fixes au prorata du CA
    const chargesFixesPeriode = chargesFixes * nbMois;
    if(chargesFixesPeriode > 0){
      const caTotal = byClient.reduce((s,c) => s+c.ca, 0);
      if(caTotal > 0){
        byClient.forEach(c => {
          const part = chargesFixesPeriode * (c.ca / caTotal);
          c.coutChargesFixes = part;
          c.cout += part;
          c.marge = c.ca - c.cout;
          c.taux  = c.ca>0 ? Math.round(c.marge/c.ca*100) : 0;
        });
      }
    }

    // Vue par chauffeur — CA, salaire brut, coût employeur, marge
    const byChauffeurMap = {};
    tournees.forEach(t => {
      const ch = chMap[t.chauffeur_nom];
      const isSal = !ch || ch.type==='salarié';
      const cl = clients.find(c => c.nom===t.client_nom);
      const dayType = getDayType(t.date);
      const caT = getTarifClient(cl, dayType, t);
      const tarifCh = getTarifCh(cl, isSal?'salarié':'sous-traitant', dayType);
      const coutT = isSal ? tarifCh * coefSalarie : tarifCh;
      if(!byChauffeurMap[t.chauffeur_nom]){
        byChauffeurMap[t.chauffeur_nom] = { nom: t.chauffeur_nom, type: isSal?'salarié':'sous-traitant', tournees: 0, ca: 0, brut: 0, cout: 0 };
      }
      const e = byChauffeurMap[t.chauffeur_nom];
      e.tournees++;
      e.ca   += caT;
      e.brut += tarifCh;
      e.cout += coutT;
    });
    const byChauffeur = Object.values(byChauffeurMap).map(e => ({ ...e, marge: e.ca - e.cout, taux: e.ca>0 ? Math.round((e.ca-e.cout)/e.ca*100) : 0 }));

    const ca    = byClient.reduce((s,c) => s+c.ca, 0);
    const cout  = byClient.reduce((s,c) => s+c.cout, 0);
    const marge = ca - cout;
    const taux  = ca>0 ? Math.round(marge/ca*100) : 0;

    return { ca, cout, marge, taux, byClient, byChauffeur };
  }

  window.OT_FINANCE = {
    getDayType, getTarifClient, getTarifCh, computeReport
  };
})();
