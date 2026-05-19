import { supabase } from '../supabase';
import { ToolDefinition, ToolResult, log } from '../types';

export const definitions: ToolDefinition[] = [
  {
    name: 'get_dashboard',
    description:
      'KPIs du tableau de bord: tournees du jour, CA estime, chauffeurs actifs, vehicules, absences, alertes. ' +
      'Donne une vue d\'ensemble de l\'activite.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date YYYY-MM-DD (defaut: aujourd\'hui)' },
      },
    },
  },
  {
    name: 'get_alertes',
    description: 'Liste les alertes actives: echeances vehicules (CT, assurance), factures impayees, absences en attente.',
    input_schema: { type: 'object', properties: {} },
  },
];

export async function handleTool(companyId: string, toolName: string, input: Record<string, unknown>): Promise<ToolResult> {
  try {
    switch (toolName) {
      case 'get_dashboard': return await getDashboard(companyId, input);
      case 'get_alertes': return await getAlertes(companyId);
      default: return { content: `Tool inconnu: ${toolName}`, is_error: true };
    }
  } catch (err) {
    log('error', 'dashboard tool error', { toolName, error: String(err) });
    return { content: 'Erreur lors du traitement.', is_error: true };
  }
}

async function getDashboard(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const today = (input.date as string) ?? new Date().toISOString().split('T')[0];

  // Get Monday of current week
  const d = new Date(today + 'T12:00:00Z');
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  const monday = d.toISOString().split('T')[0];
  d.setUTCDate(d.getUTCDate() + 6);
  const sunday = d.toISOString().split('T')[0];

  const [tourneesRes, chauffeursRes, vehiculesRes, absencesRes, weekRes] = await Promise.all([
    supabase.from('tournees').select('id').eq('company_id', companyId).eq('date', today),
    supabase.from('chauffeurs').select('id').eq('company_id', companyId).eq('statut', 'actif'),
    supabase.from('vehicules').select('id, statut').eq('company_id', companyId),
    supabase.from('absences').select('id').eq('company_id', companyId).lte('date_debut', today).gte('date_fin', today).eq('statut', 'approuve'),
    supabase.from('tournees').select('id').eq('company_id', companyId).gte('date', monday).lte('date', sunday),
  ]);

  const tourneesJour = tourneesRes.data?.length ?? 0;
  const tourneesSemaine = weekRes.data?.length ?? 0;
  const chauffeursActifs = chauffeursRes.data?.length ?? 0;
  const vehiculesTotal = vehiculesRes.data?.length ?? 0;
  const vehiculesEnService = vehiculesRes.data?.filter(v => v.statut === 'disponible' || v.statut === 'en mission').length ?? 0;
  const absencesJour = absencesRes.data?.length ?? 0;

  return {
    content:
      `Dashboard du ${today}:\n\n` +
      `Aujourd'hui:\n` +
      `- ${tourneesJour} tournee(s) planifiee(s)\n` +
      `- ${absencesJour} absence(s)\n\n` +
      `Cette semaine (${monday} -> ${sunday}):\n` +
      `- ${tourneesSemaine} tournee(s) au total\n\n` +
      `Flotte:\n` +
      `- ${chauffeursActifs} chauffeur(s) actif(s)\n` +
      `- ${vehiculesEnService}/${vehiculesTotal} vehicule(s) en service`,
  };
}

async function getAlertes(companyId: string): Promise<ToolResult> {
  const today = new Date().toISOString().split('T')[0];
  const in30d = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
  const alertes: string[] = [];

  // CT/assurance echeances
  const { data: vehicules } = await supabase.from('vehicules').select('immatriculation, ct_echeance, assurance_echeance').eq('company_id', companyId);
  for (const v of vehicules ?? []) {
    if (v.ct_echeance && v.ct_echeance <= in30d) alertes.push(`- CT ${v.immatriculation}: echeance ${v.ct_echeance}${v.ct_echeance < today ? ' (EXPIREE)' : ''}`);
    if (v.assurance_echeance && v.assurance_echeance <= in30d) alertes.push(`- Assurance ${v.immatriculation}: echeance ${v.assurance_echeance}${v.assurance_echeance < today ? ' (EXPIREE)' : ''}`);
  }

  // Factures impayees
  const { data: factures } = await supabase.from('factures').select('numero, client_nom, montant_ttc').eq('company_id', companyId).eq('statut', 'impayee');
  for (const f of factures ?? []) {
    alertes.push(`- Facture impayee #${f.numero ?? '?'}: ${f.client_nom} — ${f.montant_ttc ?? '?'} EUR`);
  }

  // Absences en attente
  const { data: absences } = await supabase.from('absences').select('chauffeur_nom, type, date_debut').eq('company_id', companyId).eq('statut', 'en_attente');
  for (const a of absences ?? []) {
    alertes.push(`- Absence en attente: ${a.chauffeur_nom} (${a.type}) depuis le ${a.date_debut}`);
  }

  if (alertes.length === 0) return { content: 'Aucune alerte active.' };
  return { content: `${alertes.length} alerte(s):\n${alertes.join('\n')}` };
}
