import { supabase } from '../supabase';
import { ToolDefinition, ToolResult, log } from '../types';

export const definitions: ToolDefinition[] = [
  {
    name: 'get_clients',
    description: 'Liste les clients de l\'entreprise. Peut filtrer par nom.',
    input_schema: {
      type: 'object',
      properties: {
        nom: { type: 'string', description: 'Recherche par nom (partiel)' },
      },
    },
  },
  {
    name: 'creer_client',
    description: 'Cree un nouveau client.',
    input_schema: {
      type: 'object',
      properties: {
        nom: { type: 'string', description: 'Nom du client' },
        tarif: { type: 'number', description: 'Tarif' },
        contact: { type: 'string', description: 'Nom du contact' },
        email: { type: 'string', description: 'Email' },
        adresse: { type: 'string', description: 'Adresse' },
      },
      required: ['nom'],
    },
  },
  {
    name: 'modifier_client',
    description: 'Modifie un client existant par son ID.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID du client' },
        nom: { type: 'string' },
        tarif: { type: 'number' },
        contact: { type: 'string' },
        email: { type: 'string' },
        adresse: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'supprimer_client',
    description: 'Supprime un client par son ID.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID du client' },
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
      case 'get_clients': return await getClients(companyId, input);
      case 'creer_client': return await creerClient(companyId, input);
      case 'modifier_client': return await modifierClient(companyId, input);
      case 'supprimer_client': return await supprimerClient(companyId, input);
      default: return { content: `Tool inconnu: ${toolName}`, is_error: true };
    }
  } catch (err) {
    log('error', 'clients tool error', { toolName, error: String(err) });
    return { content: 'Erreur lors du traitement.', is_error: true };
  }
}

async function getClients(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  let query = supabase
    .from('clients')
    .select('id, nom, tarif, contact, email, adresse, type_paiement')
    .eq('company_id', companyId);

  if (input.nom) query = query.ilike('nom', `%${input.nom}%`);

  const { data, error } = await query.order('nom');
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  if (!data || data.length === 0) return { content: 'Aucun client trouve.' };

  const lines = data.map(
    (c) => {
      const tp = c.type_paiement ?? 'fixe';
      const paiementLabel = tp === 'point' ? 'au point' : tp === 'heure' ? 'a l\'heure' : 'forfait fixe';
      return `- ${c.nom} | tarif: ${c.tarif ?? 'N/A'} | paiement: ${paiementLabel} | ${c.email ?? 'pas d\'email'}`;
    }
  );
  return { content: `${data.length} client(s):\n${lines.join('\n')}` };
}

async function creerClient(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('clients')
    .insert({
      company_id: companyId,
      nom: input.nom,
      tarif: input.tarif ?? null,
      contact: input.contact ?? null,
      email: input.email ?? null,
      adresse: input.adresse ?? null,
    })
    .select('id, nom')
    .single();

  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Client cree: ${data.nom} (ID: ${data.id})` };
}

async function modifierClient(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const id = input.id as string;
  const updates: Record<string, unknown> = {};
  for (const key of ['nom', 'tarif', 'contact', 'email', 'adresse']) {
    if (input[key] !== undefined) updates[key] = input[key];
  }
  if (Object.keys(updates).length === 0) return { content: 'Aucun champ a modifier.', is_error: true };

  const { error } = await supabase.from('clients').update(updates).eq('id', id).eq('company_id', companyId);
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Client ${id} modifie: ${Object.entries(updates).map(([k, v]) => `${k}=${v}`).join(', ')}` };
}

async function supprimerClient(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const { error } = await supabase.from('clients').delete().eq('id', input.id as string).eq('company_id', companyId);
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Client ${input.id} supprime.` };
}
