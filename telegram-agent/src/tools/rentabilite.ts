import { supabase } from '../supabase';
import { ToolDefinition, ToolResult, log } from '../types';

// French public holidays
function getJoursFeries(year: number): Set<string> {
  const feries = new Set<string>();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const add = (m: number, d: number) => feries.add(`${year}-${pad(m)}-${pad(d)}`);
  add(1, 1); add(5, 1); add(5, 8); add(7, 14); add(8, 15); add(11, 1); add(11, 11); add(12, 25);
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = new Date(year, month - 1, day);
  const lp = new Date(easter); lp.setDate(easter.getDate() + 1); feries.add(lp.toISOString().split('T')[0]);
  const asc = new Date(easter); asc.setDate(easter.getDate() + 39); feries.add(asc.toISOString().split('T')[0]);
  const pen = new Date(easter); pen.setDate(easter.getDate() + 50); feries.add(pen.toISOString().split('T')[0]);
  return feries;
}

function getDayType(dateStr: string, feries: Set<string>): string {
  if (feries.has(dateStr)) return 'ferie';
  const dow = new Date(dateStr + 'T12:00:00').getDay();
  return dow === 0 ? 'dimanche' : 'semaine';
}

interface ClientRow {
  nom: string;
  tarif: number | null;
  tarif_dim: number | null;
  tarif_ferie: number | null;
  tarif_point_am: number | null;
  tarif_point_pm: number | null;
  tarif_heure_am: number | null;
  tarif_heure_pm: number | null;
  type_paiement: string | null;
  salaire_ch_sem: number | null;
  salaire_ch_dim: number | null;
  salaire_ch_ferie: number | null;
  salaire_st_sem: number | null;
  salaire_st_dim: number | null;
  salaire_st_ferie: number | null;
}

interface TourneeRow {
  id: string;
  client_nom: string;
  chauffeur_nom: string;
  date: string;
  slot: string;
  vehicule: string | null;
  nb_points_reel: number | null;
  nb_points_estime: number | null;
  nb_heures_reel: number | null;
  nb_heures_estime: number | null;
}

function getTarifClient(cl: ClientRow, dayType: string, t: TourneeRow): number {
  if (cl.type_paiement === 'point') {
    const pts = t.nb_points_reel ?? t.nb_points_estime ?? 0;
    const pu = t.slot === 'PM' ? (cl.tarif_point_pm ?? 0) : (cl.tarif_point_am ?? 0);
    return pts * pu;
  }
  if (cl.type_paiement === 'heure') {
    const hrs = t.nb_heures_reel ?? t.nb_heures_estime ?? 0;
    const pu = t.slot === 'PM' ? (cl.tarif_heure_pm ?? 0) : (cl.tarif_heure_am ?? 0);
    return hrs * pu;
  }
  if (dayType === 'ferie') return cl.tarif_ferie ?? 0;
  if (dayType === 'dimanche') return cl.tarif_dim ?? 0;
  return cl.tarif ?? 0;
}

function getTarifCh(cl: ClientRow, driverType: string, dayType: string): number {
  if (driverType === 'salarié' || driverType === 'salarie') {
    if (dayType === 'ferie') return cl.salaire_ch_ferie ?? 0;
    if (dayType === 'dimanche') return cl.salaire_ch_dim ?? 0;
    return cl.salaire_ch_sem ?? 0;
  }
  if (dayType === 'ferie') return cl.salaire_st_ferie ?? 0;
  if (dayType === 'dimanche') return cl.salaire_st_dim ?? 0;
  return cl.salaire_st_sem ?? 0;
}

export const definitions: ToolDefinition[] = [
  {
    name: 'calculer_rentabilite_client',
    description:
      'Calcule la rentabilite d\'un client sur un mois: CA, cout total (chauffeurs + charges patronales + gazole + maintenance), marge nette et taux de marge. ' +
      'Repond a "est-ce que ce client est rentable ?" ou "quelle est ma marge sur ce client ?".',
    input_schema: {
      type: 'object',
      properties: {
        client_nom: { type: 'string', description: 'Nom du client' },
        annee: { type: 'number' },
        mois: { type: 'number', description: '1-12' },
      },
      required: ['client_nom'],
    },
  },
  {
    name: 'calculer_rentabilite_tous_clients',
    description:
      'Calcule la rentabilite de TOUS les clients sur un mois: CA, cout, marge, taux. ' +
      'Classe les clients du plus rentable au moins rentable.',
    input_schema: {
      type: 'object',
      properties: {
        annee: { type: 'number' },
        mois: { type: 'number' },
      },
    },
  },
];

export async function handleTool(companyId: string, toolName: string, input: Record<string, unknown>): Promise<ToolResult> {
  try {
    switch (toolName) {
      case 'calculer_rentabilite_client': return await rentabiliteClient(companyId, input);
      case 'calculer_rentabilite_tous_clients': return await rentabiliteTous(companyId, input);
      default: return { content: `Tool inconnu: ${toolName}`, is_error: true };
    }
  } catch (err) {
    log('error', 'rentabilite tool error', { toolName, error: String(err) });
    return { content: 'Erreur lors du traitement.', is_error: true };
  }
}

async function loadData(companyId: string, dateDebut: string, dateFin: string) {
  const [clRes, chRes, tRes, entRes, gRes, mRes] = await Promise.all([
    supabase.from('clients').select('nom, tarif, tarif_dim, tarif_ferie, tarif_point_am, tarif_point_pm, tarif_heure_am, tarif_heure_pm, type_paiement, salaire_ch_sem, salaire_ch_dim, salaire_ch_ferie, salaire_st_sem, salaire_st_dim, salaire_st_ferie').eq('company_id', companyId),
    supabase.from('chauffeurs').select('nom, type').eq('company_id', companyId),
    supabase.from('tournees').select('id, client_nom, chauffeur_nom, date, slot, vehicule, nb_points_reel, nb_points_estime, nb_heures_reel, nb_heures_estime').eq('company_id', companyId).gte('date', dateDebut).lte('date', dateFin),
    supabase.from('entreprise').select('coefficient_salarie, charges_fixes_mensuelles').eq('company_id', companyId).single(),
    supabase.from('gazole_pleins').select('vehicule, montant').eq('company_id', companyId).gte('date', dateDebut).lte('date', dateFin),
    supabase.from('maintenance_vehicules').select('vehicule_id, cout').eq('company_id', companyId).gte('date', dateDebut).lte('date', dateFin),
  ]);
  return {
    clients: (clRes.data ?? []) as ClientRow[],
    chauffeurs: chRes.data ?? [],
    tournees: (tRes.data ?? []) as TourneeRow[],
    coefSalarie: Math.max(1, entRes.data?.coefficient_salarie ?? 1.82),
    chargesFixes: entRes.data?.charges_fixes_mensuelles ?? 0,
    gazole: gRes.data ?? [],
    maintenance: mRes.data ?? [],
  };
}

function computeClientRentabilite(
  clientNom: string,
  data: Awaited<ReturnType<typeof loadData>>,
  feries: Set<string>,
  nbMois: number
) {
  const cl = data.clients.find(c => c.nom === clientNom);
  if (!cl) return null;

  const chMap = new Map(data.chauffeurs.map(c => [c.nom, c]));
  const tournees = data.tournees.filter(t => t.client_nom === clientNom);
  if (tournees.length === 0) return { client: cl, nb: 0, ca: 0, cout: 0, marge: 0, taux: 0, detail: null };

  // CA
  let ca = 0;
  tournees.forEach(t => { ca += getTarifClient(cl, getDayType(t.date, feries), t); });

  // Cout chauffeurs
  let coutChauffeur = 0;
  tournees.forEach(t => {
    const ch = chMap.get(t.chauffeur_nom);
    const isSalarie = !ch || ch.type === 'salarié';
    const dayType = getDayType(t.date, feries);
    const tarifCh = getTarifCh(cl, isSalarie ? 'salarié' : 'sous-traitant', dayType);
    coutChauffeur += isSalarie ? tarifCh * data.coefSalarie : tarifCh;
  });

  // Gazole pro-rate
  const tourneesByTruck = new Map<string, number>();
  const allTourneesByTruck = new Map<string, number>();
  tournees.forEach(t => { if (t.vehicule) tourneesByTruck.set(t.vehicule, (tourneesByTruck.get(t.vehicule) ?? 0) + 1); });
  data.tournees.forEach(t => { if (t.vehicule) allTourneesByTruck.set(t.vehicule, (allTourneesByTruck.get(t.vehicule) ?? 0) + 1); });

  const gazoleByTruck = new Map<string, number>();
  data.gazole.forEach(g => { if (g.vehicule) gazoleByTruck.set(g.vehicule, (gazoleByTruck.get(g.vehicule) ?? 0) + (g.montant ?? 0)); });

  const maintByTruck = new Map<string, number>();
  data.maintenance.forEach(m => { if (m.vehicule_id) maintByTruck.set(m.vehicule_id, (maintByTruck.get(m.vehicule_id) ?? 0) + (m.cout ?? 0)); });

  let coutGazole = 0;
  let coutMaintenance = 0;
  for (const [immat, nbClient] of tourneesByTruck) {
    const total = allTourneesByTruck.get(immat) ?? nbClient;
    const proRata = total > 0 ? nbClient / total : 0;
    coutGazole += (gazoleByTruck.get(immat) ?? 0) * proRata;
    coutMaintenance += (maintByTruck.get(immat) ?? 0) * proRata;
  }

  const cout = coutChauffeur + coutGazole + coutMaintenance;
  const marge = ca - cout;
  const taux = ca > 0 ? Math.round(marge / ca * 100) : 0;

  return {
    client: cl,
    nb: tournees.length,
    ca,
    cout,
    coutChauffeur,
    coutGazole,
    coutMaintenance,
    marge,
    taux,
  };
}

async function rentabiliteClient(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const now = new Date();
  const annee = (input.annee as number) ?? now.getFullYear();
  const mois = (input.mois as number) ?? (now.getMonth() + 1);
  const clientNom = input.client_nom as string;

  const dateDebut = `${annee}-${mois.toString().padStart(2, '0')}-01`;
  const lastDay = new Date(annee, mois, 0).getDate();
  const dateFin = `${annee}-${mois.toString().padStart(2, '0')}-${lastDay}`;
  const feries = getJoursFeries(annee);

  const data = await loadData(companyId, dateDebut, dateFin);
  const result = computeClientRentabilite(clientNom, data, feries, 1);

  if (!result) return { content: `Client "${clientNom}" introuvable.`, is_error: true };
  if (result.nb === 0) return { content: `Aucune tournee pour ${clientNom} en ${mois}/${annee}.` };

  const rentable = result.marge > 0;
  const emoji = result.taux >= 50 ? 'Excellente' : result.taux >= 30 ? 'Bonne' : result.taux >= 0 ? 'Faible' : 'NEGATIVE';

  return {
    content:
      `Rentabilite ${clientNom} — ${mois}/${annee}:\n\n` +
      `Tournees: ${result.nb}\n` +
      `CA: ${result.ca.toFixed(2)} EUR\n\n` +
      `Couts:\n` +
      `- Chauffeurs (net + charges): ${result.coutChauffeur?.toFixed(2)} EUR\n` +
      `- Gazole (proratise): ${result.coutGazole?.toFixed(2)} EUR\n` +
      `- Maintenance (proratise): ${result.coutMaintenance?.toFixed(2)} EUR\n` +
      `- TOTAL COUT: ${result.cout.toFixed(2)} EUR\n\n` +
      `MARGE NETTE: ${result.marge.toFixed(2)} EUR (${result.taux}%)\n` +
      `${rentable ? 'OUI, ce client est rentable.' : 'NON, ce client n\'est PAS rentable.'} Marge: ${emoji}`,
  };
}

async function rentabiliteTous(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const now = new Date();
  const annee = (input.annee as number) ?? now.getFullYear();
  const mois = (input.mois as number) ?? (now.getMonth() + 1);

  const dateDebut = `${annee}-${mois.toString().padStart(2, '0')}-01`;
  const lastDay = new Date(annee, mois, 0).getDate();
  const dateFin = `${annee}-${mois.toString().padStart(2, '0')}-${lastDay}`;
  const feries = getJoursFeries(annee);

  const data = await loadData(companyId, dateDebut, dateFin);
  const clientNoms = [...new Set(data.tournees.map(t => t.client_nom))];

  const results = clientNoms
    .map(nom => computeClientRentabilite(nom, data, feries, 1))
    .filter((r): r is NonNullable<typeof r> => r !== null && r.nb > 0)
    .sort((a, b) => b.marge - a.marge);

  if (results.length === 0) return { content: `Aucune donnee pour ${mois}/${annee}.` };

  const totalCA = results.reduce((s, r) => s + r.ca, 0);
  const totalCout = results.reduce((s, r) => s + r.cout, 0);
  const totalMarge = totalCA - totalCout;
  const totalTaux = totalCA > 0 ? Math.round(totalMarge / totalCA * 100) : 0;

  const lines = results.map(r => {
    const emoji = r.taux >= 50 ? '+' : r.taux >= 30 ? '~' : r.taux >= 0 ? '!' : 'X';
    return `[${emoji}] ${r.client?.nom}: ${r.nb} t. | CA ${r.ca.toFixed(0)} | cout ${r.cout.toFixed(0)} | marge ${r.marge.toFixed(0)} (${r.taux}%)`;
  });

  return {
    content:
      `Rentabilite tous clients — ${mois}/${annee}:\n\n` +
      lines.join('\n') +
      `\n\nTOTAL:\n` +
      `- CA: ${totalCA.toFixed(2)} EUR\n` +
      `- Cout: ${totalCout.toFixed(2)} EUR\n` +
      `- MARGE NETTE: ${totalMarge.toFixed(2)} EUR (${totalTaux}%)\n\n` +
      `Legende: [+] >=50% | [~] 30-50% | [!] 0-30% | [X] negative`,
  };
}
