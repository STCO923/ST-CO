import { supabase } from '../supabase';
import { ToolDefinition, ToolResult, log } from '../types';

export const definitions: ToolDefinition[] = [
  {
    name: 'get_absences',
    description: 'Liste les absences. Peut filtrer par chauffeur, date, ou statut.',
    input_schema: {
      type: 'object',
      properties: {
        chauffeur_nom: { type: 'string', description: 'Nom du chauffeur' },
        date: { type: 'string', description: 'Date specifique YYYY-MM-DD' },
        statut: { type: 'string', description: 'en_attente, approuve, refuse' },
      },
    },
  },
  {
    name: 'creer_absence',
    description: 'Declare une absence pour un chauffeur.',
    input_schema: {
      type: 'object',
      properties: {
        chauffeur_nom: { type: 'string', description: 'Nom du chauffeur' },
        date_debut: { type: 'string', description: 'Date debut YYYY-MM-DD' },
        date_fin: { type: 'string', description: 'Date fin YYYY-MM-DD' },
        type: {
          type: 'string',
          description: 'Type: maladie, conge, accident, absence_injustifiee, autre',
        },
        note: { type: 'string', description: 'Note optionnelle' },
      },
      required: ['chauffeur_nom', 'date_debut', 'date_fin', 'type'],
    },
  },
  {
    name: 'modifier_absence',
    description: 'Modifie une absence existante par son ID.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID de l\'absence' },
        statut: { type: 'string', description: 'Nouveau statut' },
        date_debut: { type: 'string' },
        date_fin: { type: 'string' },
        type: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'supprimer_absence',
    description: 'Supprime une absence par son ID.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID de l\'absence' },
      },
      required: ['id'],
    },
  },
  {
    name: 'approuver_absence',
    description: 'Approuve une demande d\'absence.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'refuser_absence',
    description: 'Refuse une demande d\'absence.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        motif_refus: { type: 'string', description: 'Motif du refus' },
      },
      required: ['id'],
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
      case 'get_absences': return await getAbsences(companyId, input);
      case 'creer_absence': return await creerAbsence(companyId, input);
      case 'modifier_absence': return await modifierAbsence(companyId, input);
      case 'supprimer_absence': return await supprimerAbsence(companyId, input);
      case 'approuver_absence': return await approuverAbsence(companyId, input);
      case 'refuser_absence': return await refuserAbsence(companyId, input);
      default: return { content: `Tool inconnu: ${toolName}`, is_error: true };
    }
  } catch (err) {
    log('error', 'absences tool error', { toolName, error: String(err) });
    return { content: 'Erreur lors du traitement.', is_error: true };
  }
}

async function getAbsences(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  let query = supabase
    .from('absences')
    .select('id, chauffeur_nom, date_debut, date_fin, type, statut')
    .eq('company_id', companyId);

  if (input.chauffeur_nom) query = query.ilike('chauffeur_nom', `%${input.chauffeur_nom}%`);
  if (input.statut) query = query.eq('statut', input.statut as string);
  if (input.date) {
    query = query.lte('date_debut', input.date as string).gte('date_fin', input.date as string);
  }

  const { data, error } = await query.order('date_debut', { ascending: false }).limit(20);
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  if (!data || data.length === 0) return { content: 'Aucune absence trouvee.' };

  const lines = data.map(
    (a) => `- ${a.chauffeur_nom}: ${a.type} du ${a.date_debut} au ${a.date_fin} (${a.statut})`
  );
  return { content: `${data.length} absence(s):\n${lines.join('\n')}` };
}

async function creerAbsence(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('absences')
    .insert({
      company_id: companyId,
      chauffeur_nom: input.chauffeur_nom,
      date_debut: input.date_debut,
      date_fin: input.date_fin,
      type: input.type,
      statut: 'en_attente',
    })
    .select('id')
    .single();

  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return {
    content:
      `Absence creee (ID: ${data.id}):\n` +
      `- ${input.chauffeur_nom}: ${input.type}\n` +
      `- Du ${input.date_debut} au ${input.date_fin}`,
  };
}

async function modifierAbsence(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const id = input.id as string;
  const updates: Record<string, unknown> = {};
  for (const key of ['statut', 'date_debut', 'date_fin', 'type', 'note']) {
    if (input[key] !== undefined) updates[key] = input[key];
  }
  if (Object.keys(updates).length === 0) return { content: 'Aucun champ a modifier.', is_error: true };

  const { error } = await supabase.from('absences').update(updates).eq('id', id).eq('company_id', companyId);
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Absence ${id} modifiee: ${Object.entries(updates).map(([k, v]) => `${k}=${v}`).join(', ')}` };
}

async function supprimerAbsence(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const { error } = await supabase.from('absences').delete().eq('id', input.id as string).eq('company_id', companyId);
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Absence ${input.id} supprimee.` };
}

async function approuverAbsence(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const { error } = await supabase.from('absences').update({ statut: 'approuve' }).eq('id', input.id as string).eq('company_id', companyId);
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Absence ${input.id} approuvee.` };
}

async function refuserAbsence(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const updates: Record<string, unknown> = { statut: 'refuse' };
  if (input.motif_refus) updates.motif_refus = input.motif_refus;
  const { error } = await supabase.from('absences').update(updates).eq('id', input.id as string).eq('company_id', companyId);
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Absence ${input.id} refusee.${input.motif_refus ? ` Motif: ${input.motif_refus}` : ''}` };
}
