import { supabase } from '../supabase';
import { ToolDefinition, ToolResult, log } from '../types';

export const definitions: ToolDefinition[] = [
  {
    name: 'get_commissionnaires',
    description: 'Liste les commissionnaires de transport.',
    input_schema: {
      type: 'object',
      properties: {
        nom: { type: 'string', description: 'Recherche par nom' },
      },
    },
  },
  {
    name: 'creer_commissionnaire',
    description: 'Cree un nouveau commissionnaire.',
    input_schema: {
      type: 'object',
      properties: {
        nom: { type: 'string' },
        contact: { type: 'string' },
        email: { type: 'string' },
        telephone: { type: 'string' },
        adresse: { type: 'string' },
        commission: { type: 'number', description: 'Taux de commission en %' },
      },
      required: ['nom'],
    },
  },
  {
    name: 'modifier_commissionnaire',
    description: 'Modifie un commissionnaire par son ID.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        nom: { type: 'string' },
        contact: { type: 'string' },
        email: { type: 'string' },
        telephone: { type: 'string' },
        adresse: { type: 'string' },
        commission: { type: 'number' },
      },
      required: ['id'],
    },
  },
  {
    name: 'supprimer_commissionnaire',
    description: 'Supprime un commissionnaire par son ID.',
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
      case 'get_commissionnaires': return await getCommissionnaires(companyId, input);
      case 'creer_commissionnaire': return await creerCommissionnaire(companyId, input);
      case 'modifier_commissionnaire': return await modifierCommissionnaire(companyId, input);
      case 'supprimer_commissionnaire': return await supprimerCommissionnaire(companyId, input);
      default: return { content: `Tool inconnu: ${toolName}`, is_error: true };
    }
  } catch (err) {
    log('error', 'commissionnaires tool error', { toolName, error: String(err) });
    return { content: 'Erreur lors du traitement.', is_error: true };
  }
}

async function getCommissionnaires(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  let query = supabase.from('commissionnaires').select('id, nom, contact, email, telephone, commission').eq('company_id', companyId);
  if (input.nom) query = query.ilike('nom', `%${input.nom}%`);
  const { data, error } = await query.order('nom');
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  if (!data || data.length === 0) return { content: 'Aucun commissionnaire trouve.' };
  const lines = data.map(c => `- ${c.nom} | ${c.contact ?? ''} | ${c.email ?? ''} | commission: ${c.commission ?? '?'}%`);
  return { content: `${data.length} commissionnaire(s):\n${lines.join('\n')}` };
}

async function creerCommissionnaire(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const row: Record<string, unknown> = { company_id: companyId, nom: input.nom };
  for (const k of ['contact', 'email', 'telephone', 'adresse', 'commission']) { if (input[k] !== undefined) row[k] = input[k]; }
  const { data, error } = await supabase.from('commissionnaires').insert(row).select('id, nom').single();
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Commissionnaire cree: ${data.nom} (ID: ${data.id})` };
}

async function modifierCommissionnaire(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const id = input.id as string;
  const updates: Record<string, unknown> = {};
  for (const k of ['nom', 'contact', 'email', 'telephone', 'adresse', 'commission']) { if (input[k] !== undefined) updates[k] = input[k]; }
  if (Object.keys(updates).length === 0) return { content: 'Aucun champ a modifier.', is_error: true };
  const { error } = await supabase.from('commissionnaires').update(updates).eq('id', id).eq('company_id', companyId);
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Commissionnaire ${id} modifie.` };
}

async function supprimerCommissionnaire(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const { error } = await supabase.from('commissionnaires').delete().eq('id', input.id as string).eq('company_id', companyId);
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Commissionnaire ${input.id} supprime.` };
}
