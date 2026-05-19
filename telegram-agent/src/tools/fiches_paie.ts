import { supabase } from '../supabase';
import { ToolDefinition, ToolResult, log } from '../types';

export const definitions: ToolDefinition[] = [
  {
    name: 'get_fiches_paie',
    description: 'Liste les fiches de paie. Peut filtrer par chauffeur et/ou periode.',
    input_schema: {
      type: 'object',
      properties: {
        chauffeur_nom: { type: 'string' },
        annee: { type: 'number' },
        mois: { type: 'number', description: '1-12' },
      },
    },
  },
  {
    name: 'creer_fiche_paie',
    description: 'Cree une fiche de paie pour un chauffeur.',
    input_schema: {
      type: 'object',
      properties: {
        chauffeur_nom: { type: 'string' },
        annee: { type: 'number' },
        mois: { type: 'number' },
        salaire_brut: { type: 'number' },
        salaire_net: { type: 'number' },
        heures: { type: 'number' },
        primes: { type: 'number' },
        notes: { type: 'string' },
      },
      required: ['chauffeur_nom', 'annee', 'mois'],
    },
  },
  {
    name: 'supprimer_fiche_paie',
    description: 'Supprime une fiche de paie par son ID.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
];

export async function handleTool(companyId: string, toolName: string, input: Record<string, unknown>): Promise<ToolResult> {
  try {
    switch (toolName) {
      case 'get_fiches_paie': return await getFiches(companyId, input);
      case 'creer_fiche_paie': return await creerFiche(companyId, input);
      case 'supprimer_fiche_paie': return await supprimerFiche(companyId, input);
      default: return { content: `Tool inconnu: ${toolName}`, is_error: true };
    }
  } catch (err) {
    log('error', 'fiches_paie tool error', { toolName, error: String(err) });
    return { content: 'Erreur lors du traitement.', is_error: true };
  }
}

async function getFiches(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  let query = supabase.from('fiches_paie').select('id, chauffeur_nom, annee, mois, salaire_brut, salaire_net, heures, primes').eq('company_id', companyId);
  if (input.chauffeur_nom) query = query.ilike('chauffeur_nom', `%${input.chauffeur_nom}%`);
  if (input.annee) query = query.eq('annee', input.annee as number);
  if (input.mois) query = query.eq('mois', input.mois as number);
  const { data, error } = await query.order('annee', { ascending: false }).order('mois', { ascending: false }).limit(20);
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  if (!data || data.length === 0) return { content: 'Aucune fiche de paie trouvee.' };
  const lines = data.map(f => `- ${f.chauffeur_nom} ${f.mois}/${f.annee}: brut ${f.salaire_brut ?? '?'} EUR | net ${f.salaire_net ?? '?'} EUR | ${f.heures ?? '?'}h`);
  return { content: `${data.length} fiche(s) de paie:\n${lines.join('\n')}` };
}

async function creerFiche(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const row: Record<string, unknown> = { company_id: companyId, chauffeur_nom: input.chauffeur_nom, annee: input.annee, mois: input.mois };
  for (const k of ['salaire_brut', 'salaire_net', 'heures', 'primes', 'notes']) { if (input[k] !== undefined) row[k] = input[k]; }
  const { data, error } = await supabase.from('fiches_paie').insert(row).select('id').single();
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Fiche de paie creee (ID: ${data.id}): ${input.chauffeur_nom} ${input.mois}/${input.annee}` };
}

async function supprimerFiche(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const { error } = await supabase.from('fiches_paie').delete().eq('id', input.id as string).eq('company_id', companyId);
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Fiche de paie ${input.id} supprimee.` };
}
