import { supabase } from '../supabase';
import { ToolDefinition, ToolResult, log } from '../types';

export const definitions: ToolDefinition[] = [
  {
    name: 'identifier_chauffeur_vehicule',
    description:
      'Identifie quel chauffeur conduisait un vehicule a une date donnee. ' +
      'Cherche dans les affectations vehicule et les tournees. ' +
      'Utile pour savoir qui etait au volant lors d\'une amende.',
    input_schema: {
      type: 'object',
      properties: {
        immatriculation: { type: 'string', description: 'Immatriculation du vehicule (meme partielle)' },
        date: { type: 'string', description: 'Date de l\'infraction YYYY-MM-DD' },
      },
      required: ['immatriculation', 'date'],
    },
  },
  {
    name: 'get_amendes',
    description: 'Liste les amendes. Peut filtrer par chauffeur, vehicule ou periode.',
    input_schema: {
      type: 'object',
      properties: {
        chauffeur_nom: { type: 'string' },
        vehicule: { type: 'string', description: 'Immatriculation' },
        date_debut: { type: 'string' },
        date_fin: { type: 'string' },
      },
    },
  },
  {
    name: 'ajouter_amende',
    description: 'Enregistre une amende.',
    input_schema: {
      type: 'object',
      properties: {
        chauffeur_nom: { type: 'string' },
        date: { type: 'string' },
        montant: { type: 'number' },
        motif: { type: 'string' },
        vehicule: { type: 'string', description: 'Immatriculation' },
        lieu: { type: 'string' },
        reference: { type: 'string', description: 'Numero de reference de l\'amende' },
        statut: { type: 'string', description: 'a_payer, payee, contestee' },
      },
      required: ['chauffeur_nom', 'date', 'montant'],
    },
  },
  {
    name: 'modifier_amende',
    description: 'Modifie une amende par son ID.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        chauffeur_nom: { type: 'string' },
        date: { type: 'string' },
        montant: { type: 'number' },
        motif: { type: 'string' },
        vehicule: { type: 'string' },
        lieu: { type: 'string' },
        reference: { type: 'string' },
        statut: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'supprimer_amende',
    description: 'Supprime une amende par son ID.',
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
      case 'identifier_chauffeur_vehicule': return await identifierChauffeur(companyId, input);
      case 'get_amendes': return await getAmendes(companyId, input);
      case 'ajouter_amende': return await ajouterAmende(companyId, input);
      case 'modifier_amende': return await modifierAmende(companyId, input);
      case 'supprimer_amende': return await supprimerAmende(companyId, input);
      default: return { content: `Tool inconnu: ${toolName}`, is_error: true };
    }
  } catch (err) {
    log('error', 'amendes tool error', { toolName, error: String(err) });
    return { content: 'Erreur lors du traitement.', is_error: true };
  }
}

async function identifierChauffeur(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const immat = input.immatriculation as string;
  const date = input.date as string;

  // 1. Find the vehicle
  const { data: vehicules } = await supabase.from('vehicules')
    .select('id, immatriculation, chauffeur_nom')
    .eq('company_id', companyId)
    .ilike('immatriculation', `%${immat}%`);

  if (!vehicules || vehicules.length === 0) {
    return { content: `Aucun vehicule trouve avec l'immatriculation "${immat}".`, is_error: true };
  }

  const veh = vehicules[0];
  const results: string[] = [];
  results.push(`Vehicule: ${veh.immatriculation}`);

  // 2. Check affectations_vehicule for that date
  const { data: affectations } = await supabase.from('affectations_vehicule')
    .select('chauffeur_nom, date')
    .eq('company_id', companyId)
    .eq('vehicule_id', veh.id)
    .eq('date', date);

  if (affectations && affectations.length > 0) {
    results.push(`Affectation le ${date}: ${affectations[0].chauffeur_nom}`);
  }

  // 3. Check tournees with this vehicle on that date
  const { data: tournees } = await supabase.from('tournees')
    .select('chauffeur_nom, client_nom, slot, heure')
    .eq('company_id', companyId)
    .eq('vehicule', veh.immatriculation)
    .eq('date', date);

  if (tournees && tournees.length > 0) {
    const chauffeurs = [...new Set(tournees.map(t => t.chauffeur_nom))];
    const tourneesDetail = tournees.map(t => `  - ${t.slot} ${t.heure ?? ''}: ${t.chauffeur_nom} -> ${t.client_nom}`);
    results.push(`Tournee(s) le ${date} avec ce vehicule:\n${tourneesDetail.join('\n')}`);
    results.push(`\nChauffeur(s) identifie(s): ${chauffeurs.join(', ')}`);
  } else if (!affectations || affectations.length === 0) {
    // 4. Fallback: check default driver assigned to vehicle
    if (veh.chauffeur_nom) {
      results.push(`Chauffeur par defaut du vehicule: ${veh.chauffeur_nom}`);
      results.push(`(Aucune tournee/affectation specifique trouvee pour le ${date})`);
    } else {
      results.push(`Aucun chauffeur identifie pour ce vehicule le ${date}.`);
    }
  }

  return { content: results.join('\n') };
}

async function getAmendes(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  let query = supabase.from('amendes').select('id, chauffeur_nom, date, montant, motif, vehicule, lieu, reference, statut').eq('company_id', companyId);
  if (input.chauffeur_nom) query = query.ilike('chauffeur_nom', `%${input.chauffeur_nom}%`);
  if (input.vehicule) query = query.ilike('vehicule', `%${input.vehicule}%`);
  if (input.date_debut) query = query.gte('date', input.date_debut as string);
  if (input.date_fin) query = query.lte('date', input.date_fin as string);
  const { data, error } = await query.order('date', { ascending: false }).limit(20);
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  if (!data || data.length === 0) return { content: 'Aucune amende trouvee.' };
  const total = data.reduce((s, a) => s + (a.montant ?? 0), 0);
  const lines = data.map(a => `- ${a.date}: ${a.chauffeur_nom} | ${a.montant} EUR | ${a.motif ?? 'sans motif'} | ${a.statut ?? 'a_payer'} | ${a.vehicule ?? ''}`);
  return { content: `${data.length} amende(s) (total: ${total.toFixed(2)} EUR):\n${lines.join('\n')}` };
}

async function ajouterAmende(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const row: Record<string, unknown> = { company_id: companyId, chauffeur_nom: input.chauffeur_nom, date: input.date, montant: input.montant };
  for (const k of ['motif', 'vehicule', 'lieu', 'reference', 'statut']) { if (input[k] !== undefined) row[k] = input[k]; }
  if (!row.statut) row.statut = 'a_payer';
  const { data, error } = await supabase.from('amendes').insert(row).select('id').single();
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Amende enregistree (ID: ${data.id}): ${input.chauffeur_nom} le ${input.date} — ${input.montant} EUR${input.motif ? ` (${input.motif})` : ''}` };
}

async function modifierAmende(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const id = input.id as string;
  const updates: Record<string, unknown> = {};
  for (const k of ['chauffeur_nom', 'date', 'montant', 'motif', 'vehicule', 'lieu', 'reference', 'statut']) { if (input[k] !== undefined) updates[k] = input[k]; }
  if (Object.keys(updates).length === 0) return { content: 'Aucun champ a modifier.', is_error: true };
  const { error } = await supabase.from('amendes').update(updates).eq('id', id).eq('company_id', companyId);
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Amende ${id} modifiee.` };
}

async function supprimerAmende(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const { error } = await supabase.from('amendes').delete().eq('id', input.id as string).eq('company_id', companyId);
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Amende ${input.id} supprimee.` };
}
