import { supabase } from '../supabase';
import { ToolDefinition, ToolResult, log } from '../types';

export const definitions: ToolDefinition[] = [
  {
    name: 'get_pleins_gazole',
    description: 'Liste les pleins de gazole. Peut filtrer par chauffeur, vehicule ou periode.',
    input_schema: {
      type: 'object',
      properties: {
        chauffeur_nom: { type: 'string' },
        vehicule: { type: 'string', description: 'Immatriculation' },
        date_debut: { type: 'string' },
        date_fin: { type: 'string' },
        limit: { type: 'number', description: 'Defaut: 20' },
      },
    },
  },
  {
    name: 'ajouter_plein',
    description: 'Enregistre un plein de gazole.',
    input_schema: {
      type: 'object',
      properties: {
        chauffeur_nom: { type: 'string' },
        date: { type: 'string' },
        litres: { type: 'number' },
        montant: { type: 'number', description: 'Montant en EUR' },
        vehicule: { type: 'string', description: 'Immatriculation' },
        station: { type: 'string' },
        kilometrage: { type: 'number' },
      },
      required: ['chauffeur_nom', 'date', 'litres', 'montant'],
    },
  },
  {
    name: 'modifier_plein',
    description: 'Modifie un plein de gazole par son ID.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        chauffeur_nom: { type: 'string' },
        date: { type: 'string' },
        litres: { type: 'number' },
        montant: { type: 'number' },
        vehicule: { type: 'string' },
        station: { type: 'string' },
        kilometrage: { type: 'number' },
      },
      required: ['id'],
    },
  },
  {
    name: 'supprimer_plein',
    description: 'Supprime un plein de gazole par son ID.',
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
      case 'get_pleins_gazole': return await getPleins(companyId, input);
      case 'ajouter_plein': return await ajouterPlein(companyId, input);
      case 'modifier_plein': return await modifierPlein(companyId, input);
      case 'supprimer_plein': return await supprimerPlein(companyId, input);
      default: return { content: `Tool inconnu: ${toolName}`, is_error: true };
    }
  } catch (err) {
    log('error', 'gazole tool error', { toolName, error: String(err) });
    return { content: 'Erreur lors du traitement.', is_error: true };
  }
}

async function getPleins(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  let query = supabase.from('gazole_pleins').select('id, chauffeur_nom, date, litres, montant, vehicule, station, kilometrage').eq('company_id', companyId);
  if (input.chauffeur_nom) query = query.ilike('chauffeur_nom', `%${input.chauffeur_nom}%`);
  if (input.vehicule) query = query.ilike('vehicule', `%${input.vehicule}%`);
  if (input.date_debut) query = query.gte('date', input.date_debut as string);
  if (input.date_fin) query = query.lte('date', input.date_fin as string);
  const { data, error } = await query.order('date', { ascending: false }).limit((input.limit as number) ?? 20);
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  if (!data || data.length === 0) return { content: 'Aucun plein gazole trouve.' };
  const total = data.reduce((s, p) => s + (p.montant ?? 0), 0);
  const totalL = data.reduce((s, p) => s + (p.litres ?? 0), 0);
  const lines = data.map(p => `- ${p.date}: ${p.chauffeur_nom} | ${p.litres}L | ${p.montant} EUR | ${p.vehicule ?? ''} | ${p.station ?? ''}`);
  return { content: `${data.length} plein(s) (${totalL.toFixed(0)}L, ${total.toFixed(2)} EUR):\n${lines.join('\n')}` };
}

async function ajouterPlein(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const row: Record<string, unknown> = { company_id: companyId, chauffeur_nom: input.chauffeur_nom, date: input.date, litres: input.litres, montant: input.montant };
  for (const k of ['vehicule', 'station', 'kilometrage']) { if (input[k] !== undefined) row[k] = input[k]; }
  const { data, error } = await supabase.from('gazole_pleins').insert(row).select('id').single();
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Plein enregistre (ID: ${data.id}): ${input.chauffeur_nom} le ${input.date} — ${input.litres}L, ${input.montant} EUR` };
}

async function modifierPlein(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const id = input.id as string;
  const updates: Record<string, unknown> = {};
  for (const k of ['chauffeur_nom', 'date', 'litres', 'montant', 'vehicule', 'station', 'kilometrage']) { if (input[k] !== undefined) updates[k] = input[k]; }
  if (Object.keys(updates).length === 0) return { content: 'Aucun champ a modifier.', is_error: true };
  const { error } = await supabase.from('gazole_pleins').update(updates).eq('id', id).eq('company_id', companyId);
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Plein ${id} modifie.` };
}

async function supprimerPlein(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const { error } = await supabase.from('gazole_pleins').delete().eq('id', input.id as string).eq('company_id', companyId);
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Plein ${input.id} supprime.` };
}
