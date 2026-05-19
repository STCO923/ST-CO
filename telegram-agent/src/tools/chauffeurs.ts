import { supabase } from '../supabase';
import { ToolDefinition, ToolResult, log } from '../types';

export const definitions: ToolDefinition[] = [
  {
    name: 'get_chauffeurs',
    description: 'Liste les chauffeurs. Peut filtrer par statut (actif, inactif).',
    input_schema: {
      type: 'object',
      properties: {
        statut: { type: 'string', description: 'Filtrer par statut (actif, inactif, tous). Par defaut: actif.' },
        nom: { type: 'string', description: 'Recherche par nom (partiel)' },
      },
    },
  },
  {
    name: 'creer_chauffeur',
    description: 'Cree un nouveau chauffeur.',
    input_schema: {
      type: 'object',
      properties: {
        nom: { type: 'string', description: 'Nom complet du chauffeur' },
        type: { type: 'string', description: 'Type: salarie ou sous_traitant' },
        tarif: { type: 'number', description: 'Tarif journalier' },
        tel: { type: 'string', description: 'Telephone' },
        email: { type: 'string', description: 'Email' },
      },
      required: ['nom'],
    },
  },
  {
    name: 'modifier_chauffeur',
    description: 'Modifie un chauffeur existant par son ID.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID du chauffeur' },
        nom: { type: 'string' },
        type: { type: 'string' },
        tarif: { type: 'number' },
        tel: { type: 'string' },
        email: { type: 'string' },
        statut: { type: 'string', description: 'actif ou inactif' },
      },
      required: ['id'],
    },
  },
  {
    name: 'supprimer_chauffeur',
    description: 'Supprime un chauffeur par son ID.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID du chauffeur' },
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
      case 'get_chauffeurs': return await getChauffeurs(companyId, input);
      case 'creer_chauffeur': return await creerChauffeur(companyId, input);
      case 'modifier_chauffeur': return await modifierChauffeur(companyId, input);
      case 'supprimer_chauffeur': return await supprimerChauffeur(companyId, input);
      default: return { content: `Tool inconnu: ${toolName}`, is_error: true };
    }
  } catch (err) {
    log('error', 'chauffeurs tool error', { toolName, error: String(err) });
    return { content: 'Erreur lors du traitement.', is_error: true };
  }
}

async function getChauffeurs(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  let query = supabase
    .from('chauffeurs')
    .select('id, nom, type, tarif, tel, email, statut')
    .eq('company_id', companyId);

  const statut = (input.statut as string) ?? 'actif';
  if (statut !== 'tous') query = query.eq('statut', statut);
  if (input.nom) query = query.ilike('nom', `%${input.nom}%`);

  const { data, error } = await query.order('nom');
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  if (!data || data.length === 0) return { content: 'Aucun chauffeur trouve.' };

  const lines = data.map(
    (c) => `- ${c.nom} (${c.type ?? 'N/A'}) | ${c.tel ?? 'pas de tel'} | ${c.statut}`
  );
  return { content: `${data.length} chauffeur(s):\n${lines.join('\n')}` };
}

async function creerChauffeur(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('chauffeurs')
    .insert({
      company_id: companyId,
      nom: input.nom,
      type: input.type ?? null,
      tarif: input.tarif ?? null,
      tel: input.tel ?? null,
      email: input.email ?? null,
      statut: 'actif',
    })
    .select('id, nom')
    .single();

  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Chauffeur cree: ${data.nom} (ID: ${data.id})` };
}

async function modifierChauffeur(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const id = input.id as string;
  const updates: Record<string, unknown> = {};
  for (const key of ['nom', 'type', 'tarif', 'tel', 'email', 'statut']) {
    if (input[key] !== undefined) updates[key] = input[key];
  }
  if (Object.keys(updates).length === 0) return { content: 'Aucun champ a modifier.', is_error: true };

  const { error } = await supabase.from('chauffeurs').update(updates).eq('id', id).eq('company_id', companyId);
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };

  return { content: `Chauffeur ${id} modifie: ${Object.entries(updates).map(([k, v]) => `${k}=${v}`).join(', ')}` };
}

async function supprimerChauffeur(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const { error } = await supabase.from('chauffeurs').delete().eq('id', input.id as string).eq('company_id', companyId);
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Chauffeur ${input.id} supprime.` };
}
