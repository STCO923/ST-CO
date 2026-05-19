import { supabase } from '../supabase';
import { ToolDefinition, ToolResult, log } from '../types';

export const definitions: ToolDefinition[] = [
  {
    name: 'get_vehicules',
    description: 'Liste les vehicules. Peut filtrer par statut, immatriculation ou chauffeur.',
    input_schema: {
      type: 'object',
      properties: {
        statut: { type: 'string', description: 'disponible, en mission, maintenance, hors service, tous' },
        immatriculation: { type: 'string', description: 'Recherche par immatriculation (partiel)' },
        chauffeur_nom: { type: 'string', description: 'Vehicule assigne a ce chauffeur' },
      },
    },
  },
  {
    name: 'creer_vehicule',
    description: 'Cree un nouveau vehicule dans la flotte.',
    input_schema: {
      type: 'object',
      properties: {
        immatriculation: { type: 'string' },
        marque: { type: 'string' },
        modele: { type: 'string' },
        chauffeur_nom: { type: 'string', description: 'Chauffeur assigne' },
        statut: { type: 'string', description: 'disponible, en mission, maintenance, hors service' },
        kilometrage: { type: 'number' },
        typologie: { type: 'string', description: 'Type de vehicule (ex: fourgon, utilitaire)' },
        ct_echeance: { type: 'string', description: 'Date echeance controle technique YYYY-MM-DD' },
        assurance_echeance: { type: 'string', description: 'Date echeance assurance YYYY-MM-DD' },
      },
      required: ['immatriculation'],
    },
  },
  {
    name: 'modifier_vehicule',
    description: 'Modifie un vehicule par son ID.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        immatriculation: { type: 'string' },
        marque: { type: 'string' },
        modele: { type: 'string' },
        statut: { type: 'string' },
        kilometrage: { type: 'number' },
        chauffeur_nom: { type: 'string' },
        typologie: { type: 'string' },
        ct_echeance: { type: 'string' },
        assurance_echeance: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'supprimer_vehicule',
    description: 'Supprime un vehicule par son ID.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'changer_statut_vehicule',
    description: 'Change le statut d\'un vehicule (disponible -> en mission -> maintenance -> hors service -> disponible).',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        statut: { type: 'string', description: 'disponible, en mission, maintenance, hors service' },
      },
      required: ['id', 'statut'],
    },
  },
  {
    name: 'affecter_vehicule',
    description: 'Affecte un vehicule a un chauffeur pour une date donnee.',
    input_schema: {
      type: 'object',
      properties: {
        chauffeur_nom: { type: 'string' },
        vehicule_id: { type: 'string' },
        date: { type: 'string', description: 'Date YYYY-MM-DD' },
      },
      required: ['chauffeur_nom', 'vehicule_id', 'date'],
    },
  },
  {
    name: 'get_maintenance',
    description: 'Liste les maintenances d\'un vehicule ou de toute la flotte.',
    input_schema: {
      type: 'object',
      properties: {
        vehicule_id: { type: 'string', description: 'Filtrer par vehicule' },
        limit: { type: 'number', description: 'Nombre max (defaut: 20)' },
      },
    },
  },
  {
    name: 'creer_maintenance',
    description: 'Enregistre une maintenance pour un vehicule.',
    input_schema: {
      type: 'object',
      properties: {
        vehicule_id: { type: 'string' },
        type: { type: 'string', description: 'vidange, pneus, freins, revision, autre' },
        date: { type: 'string', description: 'Date YYYY-MM-DD' },
        kilometrage: { type: 'number' },
        cout: { type: 'number', description: 'Cout en EUR' },
        description: { type: 'string' },
        garage: { type: 'string' },
      },
      required: ['vehicule_id', 'type', 'date'],
    },
  },
  {
    name: 'supprimer_maintenance',
    description: 'Supprime un enregistrement de maintenance.',
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
      case 'get_vehicules': return await getVehicules(companyId, input);
      case 'creer_vehicule': return await creerVehicule(companyId, input);
      case 'modifier_vehicule': return await modifierVehicule(companyId, input);
      case 'supprimer_vehicule': return await supprimerVehicule(companyId, input);
      case 'changer_statut_vehicule': return await changerStatut(companyId, input);
      case 'affecter_vehicule': return await affecterVehicule(companyId, input);
      case 'get_maintenance': return await getMaintenance(companyId, input);
      case 'creer_maintenance': return await creerMaintenance(companyId, input);
      case 'supprimer_maintenance': return await supprimerMaintenance(companyId, input);
      default: return { content: `Tool inconnu: ${toolName}`, is_error: true };
    }
  } catch (err) {
    log('error', 'vehicules tool error', { toolName, error: String(err) });
    return { content: 'Erreur lors du traitement.', is_error: true };
  }
}

async function getVehicules(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  let query = supabase.from('vehicules')
    .select('id, immatriculation, marque, modele, chauffeur_nom, statut, kilometrage, typologie, ct_echeance, assurance_echeance')
    .eq('company_id', companyId);
  if (input.statut && input.statut !== 'tous') query = query.eq('statut', input.statut as string);
  if (input.immatriculation) query = query.ilike('immatriculation', `%${input.immatriculation}%`);
  if (input.chauffeur_nom) query = query.ilike('chauffeur_nom', `%${input.chauffeur_nom}%`);
  const { data, error } = await query.order('immatriculation');
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  if (!data || data.length === 0) return { content: 'Aucun vehicule trouve.' };
  const lines = data.map(v =>
    `- ${v.immatriculation} ${v.marque ?? ''} ${v.modele ?? ''} | ${v.statut} | ${v.chauffeur_nom ?? 'non assigne'} | ${v.kilometrage ?? '?'} km` +
    (v.ct_echeance ? ` | CT: ${v.ct_echeance}` : '')
  );
  return { content: `${data.length} vehicule(s):\n${lines.join('\n')}` };
}

async function creerVehicule(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const row: Record<string, unknown> = { company_id: companyId, immatriculation: input.immatriculation, statut: input.statut ?? 'disponible' };
  for (const k of ['marque', 'modele', 'chauffeur_nom', 'kilometrage', 'typologie', 'ct_echeance', 'assurance_echeance']) {
    if (input[k] !== undefined) row[k] = input[k];
  }
  const { data, error } = await supabase.from('vehicules').insert(row).select('id, immatriculation').single();
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Vehicule cree: ${data.immatriculation} (ID: ${data.id})` };
}

async function modifierVehicule(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const id = input.id as string;
  const updates: Record<string, unknown> = {};
  for (const k of ['immatriculation', 'marque', 'modele', 'statut', 'kilometrage', 'chauffeur_nom', 'typologie', 'ct_echeance', 'assurance_echeance']) {
    if (input[k] !== undefined) updates[k] = input[k];
  }
  if (Object.keys(updates).length === 0) return { content: 'Aucun champ a modifier.', is_error: true };
  const { error } = await supabase.from('vehicules').update(updates).eq('id', id).eq('company_id', companyId);
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Vehicule ${id} modifie.` };
}

async function supprimerVehicule(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const { error } = await supabase.from('vehicules').delete().eq('id', input.id as string).eq('company_id', companyId);
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Vehicule ${input.id} supprime.` };
}

async function changerStatut(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const { error } = await supabase.from('vehicules').update({ statut: input.statut }).eq('id', input.id as string).eq('company_id', companyId);
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Vehicule ${input.id}: statut = ${input.statut}` };
}

async function affecterVehicule(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const { error } = await supabase.from('affectations_vehicule').upsert({
    company_id: companyId, chauffeur_nom: input.chauffeur_nom, vehicule_id: input.vehicule_id, date: input.date,
  }, { onConflict: 'company_id,chauffeur_nom,date' });
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Vehicule ${input.vehicule_id} affecte a ${input.chauffeur_nom} le ${input.date}.` };
}

async function getMaintenance(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  let query = supabase.from('maintenance_vehicules')
    .select('id, vehicule_id, type, date, kilometrage, cout, description, garage')
    .eq('company_id', companyId);
  if (input.vehicule_id) query = query.eq('vehicule_id', input.vehicule_id as string);
  const limit = (input.limit as number) ?? 20;
  const { data, error } = await query.order('date', { ascending: false }).limit(limit);
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  if (!data || data.length === 0) return { content: 'Aucune maintenance trouvee.' };
  const total = data.reduce((s, m) => s + (m.cout ?? 0), 0);
  const lines = data.map(m => `- ${m.date}: ${m.type} | ${m.cout ?? '?'} EUR | ${m.garage ?? ''} | ${m.description ?? ''}`);
  return { content: `${data.length} maintenance(s) (total: ${total.toFixed(2)} EUR):\n${lines.join('\n')}` };
}

async function creerMaintenance(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const row: Record<string, unknown> = { company_id: companyId, vehicule_id: input.vehicule_id, type: input.type, date: input.date };
  for (const k of ['kilometrage', 'cout', 'description', 'garage']) { if (input[k] !== undefined) row[k] = input[k]; }
  const { data, error } = await supabase.from('maintenance_vehicules').insert(row).select('id').single();
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Maintenance enregistree (ID: ${data.id}): ${input.type} le ${input.date}${input.cout ? ` — ${input.cout} EUR` : ''}` };
}

async function supprimerMaintenance(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const { error } = await supabase.from('maintenance_vehicules').delete().eq('id', input.id as string).eq('company_id', companyId);
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Maintenance ${input.id} supprimee.` };
}
