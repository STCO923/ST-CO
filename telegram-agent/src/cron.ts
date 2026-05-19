import { supabase } from './supabase';
import { log } from './types';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DAILY_AUDIT_HOUR = parseInt(process.env.DAILY_AUDIT_HOUR || '7', 10);

const JOURS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

// === Telegram send ===

async function sendTelegram(chatId: number, text: string): Promise<void> {
  const chunks = text.length > 4096 ? [text.slice(0, 4096)] : [text];
  for (const chunk of chunks) {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: chunk }),
      }
    );
  }
}

// === Helpers ===

function getMonday(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  return d.toISOString().split('T')[0];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

// === Audit complet d'une entreprise ===

interface AuditProbleme {
  type: 'urgent' | 'warning' | 'info' | 'initiative';
  message: string;
  suggestion: string;
}

async function auditCompany(companyId: string, today: string): Promise<{
  problemes: AuditProbleme[];
  stats: { tournees: number; chauffeurs: number; clients: number };
}> {
  const monday = getMonday(today);
  const sunday = addDays(monday, 6);
  const isMonday = new Date(today + 'T12:00:00').getUTCDay() === 1;
  const in7d = addDays(today, 7);

  const [tRes, chRes, clRes, absRes, vRes, facRes, absAttRes] = await Promise.all([
    supabase.from('tournees')
      .select('id, chauffeur_nom, client_nom, date, slot, vehicule, nb_points_estime, nb_points_reel, nb_heures_estime, nb_heures_reel')
      .eq('company_id', companyId).gte('date', monday).lte('date', sunday),
    supabase.from('chauffeurs').select('nom, type, statut').eq('company_id', companyId).eq('statut', 'actif'),
    supabase.from('clients').select('nom, type_paiement').eq('company_id', companyId),
    supabase.from('absences').select('chauffeur_nom, date_debut, date_fin, type')
      .eq('company_id', companyId).eq('statut', 'approuve').lte('date_debut', sunday).gte('date_fin', monday),
    supabase.from('vehicules').select('immatriculation, statut, ct_echeance, assurance_echeance').eq('company_id', companyId),
    supabase.from('factures').select('id, client_nom, montant_ttc, numero').eq('company_id', companyId).eq('statut', 'impayee'),
    supabase.from('absences').select('id, chauffeur_nom, type').eq('company_id', companyId).eq('statut', 'en_attente'),
  ]);

  const tournees = tRes.data ?? [];
  const chauffeurs = chRes.data ?? [];
  const clients = clRes.data ?? [];
  const absences = absRes.data ?? [];
  const vehicules = vRes.data ?? [];
  const facturesImpayees = facRes.data ?? [];
  const absEnAttente = absAttRes.data ?? [];
  const clientMap = new Map(clients.map(c => [c.nom, c]));
  const chauffeursUtilises = new Set(tournees.map(t => t.chauffeur_nom));
  const problemes: AuditProbleme[] = [];

  // --- URGENT: Conflits absences ---
  const conflits: string[] = [];
  for (const t of tournees) {
    for (const abs of absences) {
      if (abs.chauffeur_nom === t.chauffeur_nom && t.date >= abs.date_debut && t.date <= abs.date_fin) {
        conflits.push(`${t.chauffeur_nom} (${abs.type}) le ${t.date} — tournee ${t.client_nom} ${t.slot}`);
        break;
      }
    }
  }
  if (conflits.length > 0) {
    problemes.push({
      type: 'urgent',
      message: `${conflits.length} chauffeur(s) en absence avec tournee planifiee:\n${conflits.map(c => `  - ${c}`).join('\n')}`,
      suggestion: 'Je peux reassigner ces tournees a des chauffeurs disponibles.',
    });
  }

  // --- URGENT: Véhicules expirés ---
  for (const v of vehicules) {
    if (v.ct_echeance && v.ct_echeance < today) {
      problemes.push({
        type: 'urgent',
        message: `CT EXPIRE: ${v.immatriculation} depuis le ${v.ct_echeance}`,
        suggestion: 'Ce vehicule ne doit plus rouler. Je peux le passer en "hors service".',
      });
    }
    if (v.assurance_echeance && v.assurance_echeance < today) {
      problemes.push({
        type: 'urgent',
        message: `ASSURANCE EXPIREE: ${v.immatriculation} depuis le ${v.assurance_echeance}`,
        suggestion: 'Ce vehicule ne doit plus rouler. Je peux le passer en "hors service".',
      });
    }
  }

  // --- WARNING: Saisies manquantes ---
  const saisiesManquantes: string[] = [];
  for (const t of tournees) {
    const cl = clientMap.get(t.client_nom);
    if (!cl) continue;
    if (cl.type_paiement === 'point' && t.nb_points_reel == null && t.nb_points_estime == null) {
      saisiesManquantes.push(`${t.date} ${t.slot}: ${t.chauffeur_nom} -> ${t.client_nom} (points)`);
    }
    if (cl.type_paiement === 'heure' && t.nb_heures_reel == null && t.nb_heures_estime == null) {
      saisiesManquantes.push(`${t.date} ${t.slot}: ${t.chauffeur_nom} -> ${t.client_nom} (heures)`);
    }
  }
  if (saisiesManquantes.length > 0) {
    problemes.push({
      type: 'warning',
      message: `${saisiesManquantes.length} tournee(s) sans saisie (points/heures):\n${saisiesManquantes.slice(0, 5).map(s => `  - ${s}`).join('\n')}${saisiesManquantes.length > 5 ? `\n  ... et ${saisiesManquantes.length - 5} autre(s)` : ''}`,
      suggestion: 'Dites-moi les valeurs et je complete les saisies.',
    });
  }

  // --- WARNING: Sans véhicule ---
  const sansVehicule = tournees.filter(t => !t.vehicule).length;
  if (sansVehicule > 0) {
    problemes.push({
      type: 'warning',
      message: `${sansVehicule} tournee(s) sans vehicule assigne`,
      suggestion: 'Je peux affecter les vehicules habituels automatiquement.',
    });
  }

  // --- WARNING: Echeances dans 7 jours ---
  for (const v of vehicules) {
    if (v.ct_echeance && v.ct_echeance >= today && v.ct_echeance <= in7d) {
      problemes.push({
        type: 'warning',
        message: `CT ${v.immatriculation} expire le ${v.ct_echeance}`,
        suggestion: 'Pensez a planifier le controle technique.',
      });
    }
    if (v.assurance_echeance && v.assurance_echeance >= today && v.assurance_echeance <= in7d) {
      problemes.push({
        type: 'warning',
        message: `Assurance ${v.immatriculation} expire le ${v.assurance_echeance}`,
        suggestion: 'Pensez a renouveler l\'assurance.',
      });
    }
  }

  // --- WARNING: Factures impayées ---
  if (facturesImpayees.length > 0) {
    const total = facturesImpayees.reduce((s, f) => s + (f.montant_ttc ?? 0), 0);
    problemes.push({
      type: 'warning',
      message: `${facturesImpayees.length} facture(s) impayee(s) (${total.toFixed(2)} EUR)`,
      suggestion: 'Je peux lister le detail par client.',
    });
  }

  // --- INFO: Absences en attente ---
  if (absEnAttente.length > 0) {
    problemes.push({
      type: 'info',
      message: `${absEnAttente.length} demande(s) d'absence en attente: ${absEnAttente.map(a => `${a.chauffeur_nom} (${a.type})`).join(', ')}`,
      suggestion: 'Repondez "approuve" ou "refuse" pour chaque demande.',
    });
  }

  // --- INFO (lundi): Chauffeurs sans tournée ---
  if (isMonday) {
    const sansTournee = chauffeurs.filter(c => !chauffeursUtilises.has(c.nom));
    if (sansTournee.length > 0) {
      problemes.push({
        type: 'info',
        message: `${sansTournee.length} chauffeur(s) sans tournee cette semaine: ${sansTournee.map(c => c.nom).join(', ')}`,
        suggestion: 'Je peux leur assigner des tournees si besoin.',
      });
    }

    // Jours vides
    const joursActifs = new Set(tournees.map(t => t.date));
    const joursVides: string[] = [];
    for (let i = 0; i < 6; i++) { // lun-sam
      const jour = addDays(monday, i);
      if (!joursActifs.has(jour)) joursVides.push(JOURS_FR[new Date(jour + 'T12:00:00').getUTCDay()]);
    }
    if (joursVides.length > 0 && joursVides.length < 6) {
      problemes.push({
        type: 'info',
        message: `Jour(s) sans tournee: ${joursVides.join(', ')}`,
        suggestion: 'Normal si c\'est prevu, sinon dites-moi quoi planifier.',
      });
    }
  }

  // === INITIATIVES BUSINESS (lundi uniquement) ===
  if (isMonday) {
    const initiatives = await analyseBusinessIntelligence(companyId, today, monday, sunday);
    problemes.push(...initiatives);
  }

  return {
    problemes,
    stats: {
      tournees: tournees.length,
      chauffeurs: chauffeursUtilises.size,
      clients: new Set(tournees.map(t => t.client_nom)).size,
    },
  };
}

// === Business Intelligence ===

async function analyseBusinessIntelligence(
  companyId: string,
  today: string,
  monday: string,
  sunday: string
): Promise<AuditProbleme[]> {
  const initiatives: AuditProbleme[] = [];

  // Load last month data for comparison
  const lastMonthEnd = new Date(today + 'T12:00:00Z');
  lastMonthEnd.setUTCDate(0); // last day of previous month
  const lastMonthStart = new Date(lastMonthEnd);
  lastMonthStart.setUTCDate(1);
  const lmStart = lastMonthStart.toISOString().split('T')[0];
  const lmEnd = lastMonthEnd.toISOString().split('T')[0];

  const thisMonthStart = `${today.substring(0, 7)}-01`;

  const [clRes, chRes, tThisRes, tLastRes, entRes, penRes] = await Promise.all([
    supabase.from('clients')
      .select('nom, tarif, tarif_dim, tarif_ferie, tarif_point_am, tarif_point_pm, tarif_heure_am, tarif_heure_pm, type_paiement, salaire_ch_sem, salaire_ch_dim, salaire_ch_ferie, salaire_st_sem, salaire_st_dim, salaire_st_ferie')
      .eq('company_id', companyId),
    supabase.from('chauffeurs').select('nom, type').eq('company_id', companyId).eq('statut', 'actif'),
    supabase.from('tournees').select('chauffeur_nom, client_nom, date, slot, vehicule, nb_points_reel, nb_points_estime, nb_heures_reel, nb_heures_estime')
      .eq('company_id', companyId).gte('date', thisMonthStart).lte('date', today),
    supabase.from('tournees').select('chauffeur_nom, client_nom, date, slot')
      .eq('company_id', companyId).gte('date', lmStart).lte('date', lmEnd),
    supabase.from('entreprise').select('coefficient_salarie').eq('company_id', companyId).single(),
    supabase.from('tournee_validations').select('tournee_id, statut, montant').eq('company_id', companyId).eq('statut', 'penalisee'),
  ]);

  const clients = clRes.data ?? [];
  const chauffeurs = chRes.data ?? [];
  const tourneesThisMonth = tThisRes.data ?? [];
  const tourneesLastMonth = tLastRes.data ?? [];
  const coefSalarie = Math.max(1, entRes.data?.coefficient_salarie ?? 1.82);
  const clientMap = new Map(clients.map(c => [c.nom, c]));
  const chMap = new Map(chauffeurs.map(c => [c.nom, c]));

  // --- 1. Rentabilité par client (marges faibles ou négatives) ---
  const clientNoms = [...new Set(tourneesThisMonth.map(t => t.client_nom))];
  for (const nom of clientNoms) {
    const cl = clientMap.get(nom);
    if (!cl) continue;

    const tours = tourneesThisMonth.filter(t => t.client_nom === nom);
    let ca = 0;
    let cout = 0;

    for (const t of tours) {
      // CA
      const tp = cl.type_paiement ?? 'fixe';
      if (tp === 'point') {
        const pts = t.nb_points_reel ?? t.nb_points_estime ?? 0;
        const pu = t.slot === 'PM' ? (cl.tarif_point_pm ?? 0) : (cl.tarif_point_am ?? 0);
        ca += pts * pu;
      } else if (tp === 'heure') {
        const hrs = t.nb_heures_reel ?? t.nb_heures_estime ?? 0;
        const pu = t.slot === 'PM' ? (cl.tarif_heure_pm ?? 0) : (cl.tarif_heure_am ?? 0);
        ca += hrs * pu;
      } else {
        ca += cl.tarif ?? 0;
      }

      // Cout
      const ch = chMap.get(t.chauffeur_nom);
      const isSalarie = !ch || ch.type === 'salarié';
      const tarifCh = isSalarie ? (cl.salaire_ch_sem ?? 0) : (cl.salaire_st_sem ?? 0);
      cout += isSalarie ? tarifCh * coefSalarie : tarifCh;
    }

    const marge = ca - cout;
    const taux = ca > 0 ? Math.round(marge / ca * 100) : 0;

    if (marge < 0) {
      initiatives.push({
        type: 'initiative',
        message: `Client ${nom}: MARGE NEGATIVE ce mois (${marge.toFixed(0)} EUR, ${taux}%). CA: ${ca.toFixed(0)} EUR, cout: ${cout.toFixed(0)} EUR sur ${tours.length} tournee(s).`,
        suggestion: `Vous perdez de l'argent sur ${nom}. Je recommande d'augmenter vos tarifs ou de renegrader les conditions. Voulez-vous que je calcule le tarif minimum pour etre rentable ?`,
      });
    } else if (taux < 20 && tours.length >= 5) {
      initiatives.push({
        type: 'initiative',
        message: `Client ${nom}: marge faible (${taux}%, ${marge.toFixed(0)} EUR). CA: ${ca.toFixed(0)} EUR sur ${tours.length} tournee(s).`,
        suggestion: `La marge est en dessous de 20%. Une augmentation de tarif de ${Math.ceil((cout * 1.3 - ca) / tours.length)} EUR/tournee vous amenerait a 30%.`,
      });
    }
  }

  // --- 2. Volume: comparaison mois en cours vs mois précédent ---
  const nbThisMonth = tourneesThisMonth.length;
  const nbLastMonth = tourneesLastMonth.length;
  if (nbLastMonth > 0) {
    // Prorata au nombre de jours
    const daysThisMonth = Math.max(1, Math.round((new Date(today).getTime() - new Date(thisMonthStart).getTime()) / 86400000) + 1);
    const daysLastMonth = Math.max(1, Math.round((new Date(lmEnd).getTime() - new Date(lmStart).getTime()) / 86400000) + 1);
    const projectionThisMonth = Math.round(nbThisMonth / daysThisMonth * 30);
    const diff = projectionThisMonth - nbLastMonth;
    const pct = Math.round((diff / nbLastMonth) * 100);

    if (pct < -15) {
      initiatives.push({
        type: 'initiative',
        message: `Volume en baisse: ${nbThisMonth} tournees en ${daysThisMonth}j ce mois (projection: ~${projectionThisMonth}) vs ${nbLastMonth} le mois dernier (${pct}%).`,
        suggestion: 'Faut-il relancer certains clients ou prospecter de nouveaux contrats ?',
      });
    } else if (pct > 20) {
      initiatives.push({
        type: 'initiative',
        message: `Volume en hausse: ${nbThisMonth} tournees en ${daysThisMonth}j ce mois (projection: ~${projectionThisMonth}) vs ${nbLastMonth} le mois dernier (+${pct}%).`,
        suggestion: 'Bonne dynamique ! Verifiez que vous avez assez de chauffeurs et vehicules pour absorber la charge.',
      });
    }
  }

  // --- 3. Chauffeurs avec beaucoup de pénalités ---
  const penDriverMap = new Map<string, { count: number; total: number }>();
  const { data: tIds } = await supabase.from('tournees').select('id, chauffeur_nom')
    .eq('company_id', companyId).gte('date', thisMonthStart).lte('date', today);

  if (tIds && tIds.length > 0) {
    const tIdMap = new Map(tIds.map(t => [t.id, t.chauffeur_nom]));
    const penalites = penRes.data ?? [];
    for (const p of penalites) {
      const driver = tIdMap.get(p.tournee_id);
      if (!driver) continue;
      const entry = penDriverMap.get(driver) ?? { count: 0, total: 0 };
      entry.count++;
      entry.total += p.montant ?? 0;
      penDriverMap.set(driver, entry);
    }
  }

  for (const [driver, pen] of penDriverMap) {
    if (pen.count >= 3) {
      initiatives.push({
        type: 'initiative',
        message: `${driver}: ${pen.count} penalite(s) ce mois pour ${pen.total.toFixed(0)} EUR.`,
        suggestion: `Ce chauffeur accumule les penalites. Un recadrage ou un entretien pourrait etre necessaire.`,
      });
    }
  }

  // --- 4. Chauffeurs sous-utilisés ---
  const driverTournees = new Map<string, number>();
  for (const t of tourneesThisMonth) {
    driverTournees.set(t.chauffeur_nom, (driverTournees.get(t.chauffeur_nom) ?? 0) + 1);
  }
  const avgTournees = tourneesThisMonth.length / Math.max(1, chauffeurs.length);

  for (const ch of chauffeurs) {
    const nb = driverTournees.get(ch.nom) ?? 0;
    if (nb > 0 && nb < avgTournees * 0.4 && avgTournees > 5) {
      initiatives.push({
        type: 'initiative',
        message: `${ch.nom} (${ch.type}): seulement ${nb} tournee(s) ce mois (moyenne: ${Math.round(avgTournees)}).`,
        suggestion: ch.type === 'sous_traitant'
          ? `Sous-traitant peu utilise. Vaut-il la peine de le garder ou faut-il redistribuer ses tournees ?`
          : `Salarie sous-utilise. Il pourrait prendre plus de tournees pour optimiser le cout salarial.`,
      });
    }
  }

  return initiatives;
}

// === Build message ===

function buildMessage(companyName: string, today: string, audit: Awaited<ReturnType<typeof auditCompany>>): string {
  const isMonday = new Date(today + 'T12:00:00').getUTCDay() === 1;
  const jourFr = JOURS_FR[new Date(today + 'T12:00:00').getUTCDay()];
  const dateLabel = `${jourFr} ${today.split('-')[2]}/${today.split('-')[1]}`;

  let msg = isMonday
    ? `Bonjour ! Bilan de la semaine pour ${companyName}:\n\n`
    : `Bonjour ! Rapport du ${dateLabel} — ${companyName}:\n\n`;

  msg += `${audit.stats.tournees} tournee(s) | ${audit.stats.chauffeurs} chauffeur(s) | ${audit.stats.clients} client(s)\n\n`;

  const urgents = audit.problemes.filter(p => p.type === 'urgent');
  const warnings = audit.problemes.filter(p => p.type === 'warning');
  const infos = audit.problemes.filter(p => p.type === 'info');
  const initiatives = audit.problemes.filter(p => p.type === 'initiative');

  if (urgents.length > 0) {
    msg += `URGENT:\n`;
    for (const p of urgents) {
      msg += `${p.message}\n→ ${p.suggestion}\n\n`;
    }
  }

  if (warnings.length > 0) {
    msg += `A TRAITER:\n`;
    for (const p of warnings) {
      msg += `${p.message}\n→ ${p.suggestion}\n\n`;
    }
  }

  if (initiatives.length > 0) {
    msg += `RECOMMANDATIONS:\n`;
    for (const p of initiatives) {
      msg += `${p.message}\n→ ${p.suggestion}\n\n`;
    }
  }

  if (infos.length > 0) {
    msg += `INFO:\n`;
    for (const p of infos) {
      msg += `${p.message}\n→ ${p.suggestion}\n\n`;
    }
  }

  msg += `Repondez pour traiter un probleme ou "tout va bien" pour ignorer.`;
  return msg;
}

// === Daily cron ===

async function runDailyAudit(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  log('info', 'Running daily audit cron', { today });

  const { data: agents, error } = await supabase
    .from('telegram_agents')
    .select('telegram_user_id, company_id')
    .eq('actif', true);

  if (error || !agents || agents.length === 0) {
    log('info', 'No active agents for daily audit');
    return;
  }

  // Group by company
  const companyAgents = new Map<string, number[]>();
  for (const agent of agents) {
    const list = companyAgents.get(agent.company_id) ?? [];
    list.push(agent.telegram_user_id);
    companyAgents.set(agent.company_id, list);
  }

  for (const [companyId, userIds] of companyAgents) {
    try {
      const { data: company } = await supabase
        .from('sa_companies')
        .select('addon_agent, name')
        .eq('id', companyId)
        .single();

      if (!company?.addon_agent) continue;

      const audit = await auditCompany(companyId, today);

      // Pas de problème = pas de message (sauf le lundi → résumé quand même)
      const isMonday = new Date(today + 'T12:00:00').getUTCDay() === 1;
      if (audit.problemes.length === 0 && !isMonday) continue;

      if (audit.problemes.length === 0) {
        for (const userId of userIds) {
          await sendTelegram(userId,
            `Bonjour ! Bilan de la semaine pour ${company.name ?? ''}:\n\n` +
            `${audit.stats.tournees} tournee(s) | ${audit.stats.chauffeurs} chauffeur(s) | ${audit.stats.clients} client(s)\n\n` +
            `Aucun probleme detecte. Bonne semaine !`
          );
        }
        continue;
      }

      const message = buildMessage(company.name ?? '', today, audit);
      for (const userId of userIds) {
        await sendTelegram(userId, message);
      }

      log('info', 'Daily audit sent', { companyId, problems: audit.problemes.length, users: userIds.length });
    } catch (err) {
      log('error', 'Daily audit failed for company', { companyId, error: String(err) });
    }
  }
}

// === Schedule ===

export function startCron(): void {
  let lastRunDate = '';

  setInterval(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    if (now.getHours() === DAILY_AUDIT_HOUR && lastRunDate !== todayStr) {
      lastRunDate = todayStr;
      runDailyAudit().catch(err => {
        log('error', 'Daily audit cron failed', { error: String(err) });
      });
    }
  }, 60_000);

  log('info', `Daily audit cron scheduled at ${DAILY_AUDIT_HOUR}h00`);
}
