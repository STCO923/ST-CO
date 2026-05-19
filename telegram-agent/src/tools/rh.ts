import { supabase } from '../supabase';
import { ToolDefinition, ToolResult, log } from '../types';

export const definitions: ToolDefinition[] = [
  {
    name: 'get_avances',
    description: 'Liste les avances et primes des chauffeurs pour un mois donne.',
    input_schema: {
      type: 'object',
      properties: {
        chauffeur_nom: { type: 'string', description: 'Filtrer par chauffeur' },
        annee: { type: 'number', description: 'Annee (defaut: annee en cours)' },
        mois: { type: 'number', description: 'Mois 1-12 (defaut: mois en cours)' },
      },
    },
  },
  {
    name: 'modifier_avance',
    description: 'Modifie ou cree une avance/prime pour un chauffeur sur un mois.',
    input_schema: {
      type: 'object',
      properties: {
        chauffeur_nom: { type: 'string', description: 'Nom du chauffeur' },
        annee: { type: 'number', description: 'Annee' },
        mois: { type: 'number', description: 'Mois 1-12' },
        avance: { type: 'number', description: 'Montant avance en EUR' },
        prime: { type: 'number', description: 'Montant prime en EUR' },
        notes: { type: 'string', description: 'Notes' },
      },
      required: ['chauffeur_nom', 'annee', 'mois'],
    },
  },
];

export async function handleTool(
  companyId: string,
  toolName: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  try {
    switch (toolName) {
      case 'get_avances': return await getAvances(companyId, input);
      case 'modifier_avance': return await modifierAvance(companyId, input);
      default: return { content: `Tool inconnu: ${toolName}`, is_error: true };
    }
  } catch (err) {
    log('error', 'rh tool error', { toolName, error: String(err) });
    return { content: 'Erreur lors du traitement.', is_error: true };
  }
}

async function getAvances(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const now = new Date();
  const annee = (input.annee as number) ?? now.getFullYear();
  const mois = (input.mois as number) ?? now.getMonth() + 1;

  let query = supabase
    .from('chauffeur_avances')
    .select('chauffeur_nom, annee, mois, avance, prime, notes')
    .eq('company_id', companyId)
    .eq('annee', annee)
    .eq('mois', mois);

  if (input.chauffeur_nom) query = query.ilike('chauffeur_nom', `%${input.chauffeur_nom}%`);

  const { data, error } = await query.order('chauffeur_nom');
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  if (!data || data.length === 0) return { content: `Aucune avance/prime pour ${mois}/${annee}.` };

  const lines = data.map(
    (a) =>
      `- ${a.chauffeur_nom}: avance ${a.avance ?? 0} EUR, prime ${a.prime ?? 0} EUR` +
      (a.notes ? ` (${a.notes})` : '')
  );
  return { content: `Avances/primes ${mois}/${annee}:\n${lines.join('\n')}` };
}

async function modifierAvance(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const row: Record<string, unknown> = {
    company_id: companyId,
    chauffeur_nom: input.chauffeur_nom,
    annee: input.annee,
    mois: input.mois,
  };
  if (input.avance !== undefined) row.avance = input.avance;
  if (input.prime !== undefined) row.prime = input.prime;
  if (input.notes !== undefined) row.notes = input.notes;

  const { error } = await supabase
    .from('chauffeur_avances')
    .upsert(row, { onConflict: 'company_id,chauffeur_nom,annee,mois' });

  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return {
    content:
      `Avance/prime mise a jour pour ${input.chauffeur_nom} (${input.mois}/${input.annee}):` +
      (input.avance !== undefined ? ` avance=${input.avance} EUR` : '') +
      (input.prime !== undefined ? ` prime=${input.prime} EUR` : ''),
  };
}
