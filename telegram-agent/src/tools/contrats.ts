import { supabase } from '../supabase';
import { ToolDefinition, ToolResult, log } from '../types';

export const definitions: ToolDefinition[] = [
  {
    name: 'get_contrats',
    description: 'Liste les contrats de travail. Peut filtrer par chauffeur.',
    input_schema: {
      type: 'object',
      properties: {
        chauffeur_nom: { type: 'string' },
      },
    },
  },
  {
    name: 'creer_contrat',
    description: 'Cree un contrat de travail pour un chauffeur.',
    input_schema: {
      type: 'object',
      properties: {
        chauffeur_nom: { type: 'string' },
        type: { type: 'string', description: 'CDI, CDD, interim, stage' },
        date_debut: { type: 'string', description: 'Date debut YYYY-MM-DD' },
        date_fin: { type: 'string', description: 'Date fin YYYY-MM-DD (pour CDD)' },
        salaire: { type: 'number', description: 'Salaire mensuel brut' },
        poste: { type: 'string', description: 'Intitule du poste' },
        notes: { type: 'string' },
      },
      required: ['chauffeur_nom', 'type', 'date_debut'],
    },
  },
  {
    name: 'supprimer_contrat',
    description: 'Supprime un contrat par son ID.',
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
      case 'get_contrats': return await getContrats(companyId, input);
      case 'creer_contrat': return await creerContrat(companyId, input);
      case 'supprimer_contrat': return await supprimerContrat(companyId, input);
      default: return { content: `Tool inconnu: ${toolName}`, is_error: true };
    }
  } catch (err) {
    log('error', 'contrats tool error', { toolName, error: String(err) });
    return { content: 'Erreur lors du traitement.', is_error: true };
  }
}

async function getContrats(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  let query = supabase.from('contrats').select('id, chauffeur_nom, type, date_debut, date_fin, salaire, poste').eq('company_id', companyId);
  if (input.chauffeur_nom) query = query.ilike('chauffeur_nom', `%${input.chauffeur_nom}%`);
  const { data, error } = await query.order('date_debut', { ascending: false });
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  if (!data || data.length === 0) return { content: 'Aucun contrat trouve.' };
  const lines = data.map(c => `- ${c.chauffeur_nom}: ${c.type} depuis ${c.date_debut}${c.date_fin ? ` jusqu'au ${c.date_fin}` : ''} | ${c.salaire ?? '?'} EUR | ${c.poste ?? ''}`);
  return { content: `${data.length} contrat(s):\n${lines.join('\n')}` };
}

async function creerContrat(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const row: Record<string, unknown> = { company_id: companyId, chauffeur_nom: input.chauffeur_nom, type: input.type, date_debut: input.date_debut };
  for (const k of ['date_fin', 'salaire', 'poste', 'notes']) { if (input[k] !== undefined) row[k] = input[k]; }
  const { data, error } = await supabase.from('contrats').insert(row).select('id').single();
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Contrat cree (ID: ${data.id}): ${input.type} pour ${input.chauffeur_nom} a partir du ${input.date_debut}` };
}

async function supprimerContrat(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const { error } = await supabase.from('contrats').delete().eq('id', input.id as string).eq('company_id', companyId);
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Contrat ${input.id} supprime.` };
}
