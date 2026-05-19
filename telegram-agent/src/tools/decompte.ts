import { supabase } from '../supabase';
import { ToolDefinition, ToolResult, log } from '../types';

// French public holidays for a given year
function getJoursFeries(year: number): Set<string> {
  const feries = new Set<string>();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const add = (m: number, d: number) => feries.add(`${year}-${pad(m)}-${pad(d)}`);

  add(1, 1);   // Jour de l'an
  add(5, 1);   // Fete du travail
  add(5, 8);   // Victoire 1945
  add(7, 14);  // Fete nationale
  add(8, 15);  // Assomption
  add(11, 1);  // Toussaint
  add(11, 11); // Armistice
  add(12, 25); // Noel

  // Paques (algorithm)
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = new Date(year, month - 1, day);

  // Lundi de Paques
  const lundiPaques = new Date(easter);
  lundiPaques.setDate(easter.getDate() + 1);
  feries.add(lundiPaques.toISOString().split('T')[0]);

  // Ascension (jeudi, 39 jours apres Paques)
  const ascension = new Date(easter);
  ascension.setDate(easter.getDate() + 39);
  feries.add(ascension.toISOString().split('T')[0]);

  // Lundi de Pentecote (50 jours apres Paques)
  const pentecote = new Date(easter);
  pentecote.setDate(easter.getDate() + 50);
  feries.add(pentecote.toISOString().split('T')[0]);

  return feries;
}

function getDayType(dateStr: string, feries: Set<string>): 'semaine' | 'dimanche' | 'ferie' {
  if (feries.has(dateStr)) return 'ferie';
  const dow = new Date(dateStr + 'T12:00:00').getDay();
  return dow === 0 ? 'dimanche' : 'semaine';
}

interface ClientRow {
  nom: string;
  tarif: number | null;
  type_paiement: string | null;
  salaire_ch_sem: number | null;
  salaire_ch_dim: number | null;
  salaire_ch_ferie: number | null;
  salaire_st_sem: number | null;
  salaire_st_dim: number | null;
  salaire_st_ferie: number | null;
}

function getTarifChauffeur(client: ClientRow | undefined, driverType: string, dayType: string): number {
  if (!client) return 0;
  if (driverType === 'salarié' || driverType === 'salarie') {
    if (dayType === 'ferie') return client.salaire_ch_ferie ?? 0;
    if (dayType === 'dimanche') return client.salaire_ch_dim ?? 0;
    return client.salaire_ch_sem ?? 0;
  }
  // sous_traitant
  if (dayType === 'ferie') return client.salaire_st_ferie ?? 0;
  if (dayType === 'dimanche') return client.salaire_st_dim ?? 0;
  return client.salaire_st_sem ?? 0;
}

export const definitions: ToolDefinition[] = [
  {
    name: 'calculer_salaire_chauffeur',
    description:
      'Calcule le montant NET a verser a un chauffeur pour un mois donne. ' +
      'Tous les tarifs dans le systeme sont declares en NET. ' +
      'Pour un salarie: total net (somme tarifs) - avance + prime - penalites = net reste a verser. ' +
      'Pour un sous-traitant: total net (somme tarifs ST) - penalites = net a payer. ' +
      'Prend en compte les tarifs semaine/dimanche/ferie de chaque client.',
    input_schema: {
      type: 'object',
      properties: {
        chauffeur_nom: { type: 'string', description: 'Nom du chauffeur' },
        annee: { type: 'number', description: 'Annee (defaut: en cours)' },
        mois: { type: 'number', description: 'Mois 1-12 (defaut: en cours)' },
      },
      required: ['chauffeur_nom'],
    },
  },
  {
    name: 'calculer_salaires_tous',
    description:
      'Calcule le montant NET a verser pour TOUS les chauffeurs d\'un mois. ' +
      'Tous les montants sont en NET. Retourne un resume par chauffeur avec total net, avance, prime, penalites, reste.',
    input_schema: {
      type: 'object',
      properties: {
        annee: { type: 'number' },
        mois: { type: 'number' },
        type: { type: 'string', description: 'Filtrer: salarie, sous_traitant, ou tous (defaut: tous)' },
      },
    },
  },
];

export async function handleTool(companyId: string, toolName: string, input: Record<string, unknown>): Promise<ToolResult> {
  try {
    switch (toolName) {
      case 'calculer_salaire_chauffeur': return await calculerSalaire(companyId, input);
      case 'calculer_salaires_tous': return await calculerTous(companyId, input);
      default: return { content: `Tool inconnu: ${toolName}`, is_error: true };
    }
  } catch (err) {
    log('error', 'decompte tool error', { toolName, error: String(err) });
    return { content: 'Erreur lors du traitement.', is_error: true };
  }
}

async function calculerSalaire(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const now = new Date();
  const annee = (input.annee as number) ?? now.getFullYear();
  const mois = (input.mois as number) ?? (now.getMonth() + 1);
  const chauffeurNom = input.chauffeur_nom as string;

  const dateDebut = `${annee}-${mois.toString().padStart(2, '0')}-01`;
  const lastDay = new Date(annee, mois, 0).getDate();
  const dateFin = `${annee}-${mois.toString().padStart(2, '0')}-${lastDay}`;
  const feries = getJoursFeries(annee);

  // Get chauffeur
  const { data: chauffeur } = await supabase.from('chauffeurs').select('nom, type').eq('company_id', companyId).ilike('nom', `%${chauffeurNom}%`).single();
  if (!chauffeur) return { content: `Chauffeur "${chauffeurNom}" introuvable.`, is_error: true };

  // Get clients with tarifs
  const { data: clientsData } = await supabase.from('clients')
    .select('nom, tarif, type_paiement, salaire_ch_sem, salaire_ch_dim, salaire_ch_ferie, salaire_st_sem, salaire_st_dim, salaire_st_ferie')
    .eq('company_id', companyId);
  const clientMap = new Map((clientsData ?? []).map(c => [c.nom, c as ClientRow]));

  // Get tournees
  const { data: tournees } = await supabase.from('tournees').select('id, client_nom, date, slot, nb_points_reel')
    .eq('company_id', companyId).eq('chauffeur_nom', chauffeur.nom).gte('date', dateDebut).lte('date', dateFin);

  // Get validations/penalties
  const tourneeIds = (tournees ?? []).map(t => t.id);
  let penalitesTotal = 0;
  const penDetails: string[] = [];
  if (tourneeIds.length > 0) {
    const { data: validations } = await supabase.from('tournee_validations').select('tournee_id, statut, motif, montant').eq('company_id', companyId).in('tournee_id', tourneeIds);
    for (const v of validations ?? []) {
      if (v.statut === 'penalisee') {
        penalitesTotal += v.montant ?? 0;
        penDetails.push(`${v.motif}: ${v.montant ?? 0} EUR`);
      }
    }
  }

  // Get avance/prime
  const { data: avanceData } = await supabase.from('chauffeur_avances').select('avance, prime')
    .eq('company_id', companyId).eq('chauffeur_nom', chauffeur.nom).eq('annee', annee).eq('mois', mois).single();
  const avance = avanceData?.avance ?? 0;
  const prime = avanceData?.prime ?? 0;

  // Calculate brut
  let brut = 0;
  const detailParClient = new Map<string, { count: number; total: number }>();
  for (const t of tournees ?? []) {
    const client = clientMap.get(t.client_nom);
    const dayType = getDayType(t.date, feries);
    const tarif = getTarifChauffeur(client, chauffeur.type, dayType);
    brut += tarif;
    const entry = detailParClient.get(t.client_nom) ?? { count: 0, total: 0 };
    entry.count++;
    entry.total += tarif;
    detailParClient.set(t.client_nom, entry);
  }

  const nbTournees = tournees?.length ?? 0;
  const reste = brut - avance + prime - penalitesTotal;
  const isST = chauffeur.type === 'sous_traitant';

  let result = `Decompte ${chauffeur.nom} — ${mois}/${annee}:\n`;
  result += `Type: ${isST ? 'Sous-traitant' : 'Salarie'}\n`;
  result += `Tournees: ${nbTournees}\n`;
  result += `(Tous les montants sont en NET)\n\n`;

  // Detail par client
  if (detailParClient.size > 0) {
    result += 'Par client:\n';
    for (const [nom, d] of detailParClient) {
      result += `  - ${nom}: ${d.count} tournee(s) = ${d.total.toFixed(2)} EUR net\n`;
    }
    result += '\n';
  }

  result += `Total net: ${brut.toFixed(2)} EUR\n`;
  if (penalitesTotal > 0) {
    result += `Penalites: -${penalitesTotal.toFixed(2)} EUR (${penDetails.join(', ')})\n`;
  }
  if (!isST) {
    if (avance > 0) result += `Avance deja versee: -${avance.toFixed(2)} EUR\n`;
    if (prime > 0) result += `Prime: +${prime.toFixed(2)} EUR\n`;
  }
  result += `\n${isST ? 'NET A PAYER' : 'NET RESTE A VERSER'}: ${reste.toFixed(2)} EUR`;

  return { content: result };
}

async function calculerTous(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const now = new Date();
  const annee = (input.annee as number) ?? now.getFullYear();
  const mois = (input.mois as number) ?? (now.getMonth() + 1);
  const filterType = input.type as string | undefined;

  const dateDebut = `${annee}-${mois.toString().padStart(2, '0')}-01`;
  const lastDay = new Date(annee, mois, 0).getDate();
  const dateFin = `${annee}-${mois.toString().padStart(2, '0')}-${lastDay}`;
  const feries = getJoursFeries(annee);

  // Get all data
  const [chRes, clRes, tRes, avRes] = await Promise.all([
    supabase.from('chauffeurs').select('nom, type').eq('company_id', companyId).eq('statut', 'actif'),
    supabase.from('clients').select('nom, tarif, type_paiement, salaire_ch_sem, salaire_ch_dim, salaire_ch_ferie, salaire_st_sem, salaire_st_dim, salaire_st_ferie').eq('company_id', companyId),
    supabase.from('tournees').select('id, chauffeur_nom, client_nom, date').eq('company_id', companyId).gte('date', dateDebut).lte('date', dateFin),
    supabase.from('chauffeur_avances').select('chauffeur_nom, avance, prime').eq('company_id', companyId).eq('annee', annee).eq('mois', mois),
  ]);

  const chauffeurs = chRes.data ?? [];
  const clientMap = new Map((clRes.data ?? []).map(c => [c.nom, c as ClientRow]));
  const tournees = tRes.data ?? [];
  const avancesMap = new Map((avRes.data ?? []).map(a => [a.chauffeur_nom, a]));

  // Get all validations for the month's tournees
  const tIds = tournees.map(t => t.id);
  let penMap = new Map<string, number>();
  if (tIds.length > 0) {
    const { data: vals } = await supabase.from('tournee_validations').select('tournee_id, statut, montant').eq('company_id', companyId).in('tournee_id', tIds);
    for (const v of vals ?? []) {
      if (v.statut === 'penalisee') {
        const t = tournees.find(t2 => t2.id === v.tournee_id);
        if (t) penMap.set(t.chauffeur_nom, (penMap.get(t.chauffeur_nom) ?? 0) + (v.montant ?? 0));
      }
    }
  }

  // Calculate per chauffeur
  const results: Array<{ nom: string; type: string; nb: number; brut: number; avance: number; prime: number; pen: number; reste: number }> = [];

  for (const ch of chauffeurs) {
    if (filterType && filterType !== 'tous') {
      if (filterType === 'salarie' && ch.type === 'sous_traitant') continue;
      if (filterType === 'sous_traitant' && ch.type !== 'sous_traitant') continue;
    }

    const chTournees = tournees.filter(t => t.chauffeur_nom === ch.nom);
    if (chTournees.length === 0) continue;

    let brut = 0;
    for (const t of chTournees) {
      const client = clientMap.get(t.client_nom);
      const dayType = getDayType(t.date, feries);
      brut += getTarifChauffeur(client, ch.type, dayType);
    }

    const av = avancesMap.get(ch.nom);
    const avance = av?.avance ?? 0;
    const prime = av?.prime ?? 0;
    const pen = penMap.get(ch.nom) ?? 0;
    const reste = brut - avance + prime - pen;

    results.push({ nom: ch.nom, type: ch.type, nb: chTournees.length, brut, avance, prime, pen, reste });
  }

  results.sort((a, b) => b.reste - a.reste);

  if (results.length === 0) return { content: `Aucun chauffeur avec des tournees en ${mois}/${annee}.` };

  const salaries = results.filter(r => r.type !== 'sous_traitant');
  const sts = results.filter(r => r.type === 'sous_traitant');
  const totalSal = salaries.reduce((s, r) => s + r.reste, 0);
  const totalST = sts.reduce((s, r) => s + r.reste, 0);

  let output = `Decompte ${mois}/${annee} (montants NET):\n\n`;

  if (salaries.length > 0) {
    output += `SALARIES (${salaries.length}):\n`;
    for (const r of salaries) {
      output += `- ${r.nom}: ${r.nb} t. | net ${r.brut.toFixed(0)}`;
      if (r.avance) output += ` | av -${r.avance.toFixed(0)}`;
      if (r.prime) output += ` | pr +${r.prime.toFixed(0)}`;
      if (r.pen) output += ` | pen -${r.pen.toFixed(0)}`;
      output += ` = ${r.reste.toFixed(0)} EUR\n`;
    }
    output += `Total net salaries: ${totalSal.toFixed(2)} EUR\n\n`;
  }

  if (sts.length > 0) {
    output += `SOUS-TRAITANTS (${sts.length}):\n`;
    for (const r of sts) {
      output += `- ${r.nom}: ${r.nb} t. | net ${r.brut.toFixed(0)}`;
      if (r.pen) output += ` | pen -${r.pen.toFixed(0)}`;
      output += ` = ${r.reste.toFixed(0)} EUR\n`;
    }
    output += `Total net sous-traitants: ${totalST.toFixed(2)} EUR\n\n`;
  }

  output += `TOTAL NET A VERSER: ${(totalSal + totalST).toFixed(2)} EUR`;

  return { content: output };
}
