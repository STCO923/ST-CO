import { supabase } from '../supabase';
import { ToolDefinition, ToolResult, log } from '../types';

export const definitions: ToolDefinition[] = [
  {
    name: 'get_tournees',
    description:
      'Recupere les tournees pour une date donnee. Retourne chauffeurs, clients, creneaux, heures et vehicules.',
    input_schema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Date au format YYYY-MM-DD. Par defaut: aujourd\'hui.',
        },
      },
    },
  },
  {
    name: 'search_tournees',
    description:
      'Recherche des tournees par chauffeur, client, ou periode.',
    input_schema: {
      type: 'object',
      properties: {
        chauffeur_nom: { type: 'string', description: 'Nom du chauffeur' },
        client_nom: { type: 'string', description: 'Nom du client' },
        date_debut: { type: 'string', description: 'Date debut YYYY-MM-DD' },
        date_fin: { type: 'string', description: 'Date fin YYYY-MM-DD' },
      },
    },
  },
  {
    name: 'creer_tournee',
    description:
      'Cree une nouvelle tournee. Necessite au minimum: date, chauffeur_nom, client_nom et slot (AM ou PM).',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date YYYY-MM-DD' },
        chauffeur_nom: { type: 'string', description: 'Nom du chauffeur' },
        client_nom: { type: 'string', description: 'Nom du client' },
        slot: {
          type: 'string',
          description: 'Creneau: AM ou PM',
          enum: ['AM', 'PM'],
        },
        heure: { type: 'string', description: 'Heure de debut (ex: 08:00)' },
        vehicule: { type: 'string', description: 'Vehicule assigne' },
        nb_points_estime: { type: 'number', description: 'Nombre de points estimes (pour clients au point)' },
        nb_heures_estime: { type: 'number', description: 'Nombre d\'heures estimees (pour clients a l\'heure)' },
        commentaire: { type: 'string', description: 'Commentaire optionnel' },
      },
      required: ['date', 'chauffeur_nom', 'client_nom', 'slot'],
    },
  },
  {
    name: 'modifier_tournee',
    description:
      'Modifie une tournee existante par son ID. Seuls les champs fournis sont mis a jour.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID de la tournee' },
        date: { type: 'string', description: 'Nouvelle date YYYY-MM-DD' },
        chauffeur_nom: { type: 'string', description: 'Nouveau chauffeur' },
        client_nom: { type: 'string', description: 'Nouveau client' },
        slot: { type: 'string', enum: ['AM', 'PM'] },
        heure: { type: 'string' },
        vehicule: { type: 'string' },
        nb_points_estime: { type: 'number' },
        nb_heures_estime: { type: 'number' },
        nb_points_reel: { type: 'number', description: 'Points reels (apres la tournee)' },
        nb_heures_reel: { type: 'number', description: 'Heures reelles (apres la tournee)' },
        commentaire: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'supprimer_tournee',
    description: 'Supprime une tournee par son ID.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID de la tournee a supprimer' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_validations_penalites',
    description:
      'Liste les validations et penalites des tournees pour un chauffeur et/ou une periode. ' +
      'Retourne le statut (validee/penalisee), le motif, le montant, la date et le client.',
    input_schema: {
      type: 'object',
      properties: {
        chauffeur_nom: { type: 'string', description: 'Nom du chauffeur' },
        date_debut: { type: 'string', description: 'Date debut YYYY-MM-DD' },
        date_fin: { type: 'string', description: 'Date fin YYYY-MM-DD' },
        statut: { type: 'string', description: 'Filtrer: validee, penalisee, ou tous (defaut: tous)' },
      },
    },
  },
  {
    name: 'valider_tournee',
    description: 'Valide une tournee (statut = validee).',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'ID de la tournee' } },
      required: ['id'],
    },
  },
  {
    name: 'penaliser_tournee',
    description: 'Penalise une tournee avec un motif et un montant.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID de la tournee' },
        motif: { type: 'string', description: 'Motif de la penalite' },
        montant: { type: 'number', description: 'Montant de la penalite en EUR' },
      },
      required: ['id', 'motif', 'montant'],
    },
  },
  {
    name: 'reset_validation_tournee',
    description: 'Reinitialise la validation d\'une tournee (supprime validation ou penalite).',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'supprimer_tournees_semaine',
    description: 'Supprime TOUTES les tournees d\'une semaine. ATTENTION: action irreversible.',
    input_schema: {
      type: 'object',
      properties: {
        semaine_debut: { type: 'string', description: 'Date du lundi YYYY-MM-DD' },
      },
      required: ['semaine_debut'],
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
      case 'get_tournees':
        return await getTournees(companyId, input);
      case 'search_tournees':
        return await searchTournees(companyId, input);
      case 'creer_tournee':
        return await creerTournee(companyId, input);
      case 'modifier_tournee':
        return await modifierTournee(companyId, input);
      case 'supprimer_tournee':
        return await supprimerTournee(companyId, input);
      case 'get_validations_penalites':
        return await getValidationsPenalites(companyId, input);
      case 'valider_tournee':
        return await validerTournee(companyId, input);
      case 'penaliser_tournee':
        return await penaliserTournee(companyId, input);
      case 'reset_validation_tournee':
        return await resetValidation(companyId, input);
      case 'supprimer_tournees_semaine':
        return await supprimerSemaine(companyId, input);
      default:
        return { content: `Tool inconnu: ${toolName}`, is_error: true };
    }
  } catch (err) {
    log('error', 'tournees tool error', { toolName, error: String(err) });
    return { content: 'Erreur lors du traitement de la requete.', is_error: true };
  }
}

async function getTournees(
  companyId: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const date =
    (input.date as string) || new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('tournees')
    .select(
      'id, chauffeur_nom, client_nom, slot, heure, vehicule, nb_points_reel, nb_heures_reel'
    )
    .eq('company_id', companyId)
    .eq('date', date)
    .order('slot')
    .order('heure');

  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  if (!data || data.length === 0)
    return { content: `Aucune tournee trouvee pour le ${date}.` };

  const lines = data.map(
    (t) =>
      `- ${t.slot} ${t.heure ?? ''}: ${t.chauffeur_nom} -> ${t.client_nom}` +
      (t.vehicule ? ` [${t.vehicule}]` : '') +
      (t.nb_points_reel ? ` (${t.nb_points_reel} pts)` : '')
  );
  return {
    content: `${data.length} tournee(s) le ${date}:\n${lines.join('\n')}`,
  };
}

async function searchTournees(
  companyId: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  let query = supabase
    .from('tournees')
    .select(
      'id, date, chauffeur_nom, client_nom, slot, heure, vehicule'
    )
    .eq('company_id', companyId);

  if (input.chauffeur_nom)
    query = query.ilike('chauffeur_nom', `%${input.chauffeur_nom}%`);
  if (input.client_nom)
    query = query.ilike('client_nom', `%${input.client_nom}%`);
  if (input.date_debut) query = query.gte('date', input.date_debut as string);
  if (input.date_fin) query = query.lte('date', input.date_fin as string);

  const { data, error } = await query.order('date', { ascending: false }).limit(20);

  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  if (!data || data.length === 0)
    return { content: 'Aucune tournee trouvee avec ces criteres.' };

  const lines = data.map(
    (t) =>
      `- ${t.date} ${t.slot} ${t.heure ?? ''}: ${t.chauffeur_nom} -> ${t.client_nom}` +
      (t.vehicule ? ` [${t.vehicule}]` : '')
  );
  return { content: `${data.length} tournee(s) trouvee(s):\n${lines.join('\n')}` };
}

async function creerTournee(
  companyId: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const row: Record<string, unknown> = {
    company_id: companyId,
    date: input.date,
    chauffeur_nom: input.chauffeur_nom,
    client_nom: input.client_nom,
    slot: input.slot,
    heure: input.heure ?? null,
    vehicule: input.vehicule ?? null,
    commentaire: input.commentaire ?? null,
  };
  if (input.nb_points_estime !== undefined) row.nb_points_estime = input.nb_points_estime;
  if (input.nb_heures_estime !== undefined) row.nb_heures_estime = input.nb_heures_estime;

  const { data, error } = await supabase
    .from('tournees')
    .insert(row)
    .select('id')
    .single();

  if (error) return { content: `Erreur: ${error.message}`, is_error: true };

  let summary =
    `Tournee creee (ID: ${data.id}):\n` +
    `- Date: ${input.date}\n` +
    `- Chauffeur: ${input.chauffeur_nom}\n` +
    `- Client: ${input.client_nom}\n` +
    `- Creneau: ${input.slot}` +
    (input.heure ? ` a ${input.heure}` : '') +
    (input.vehicule ? `\n- Vehicule: ${input.vehicule}` : '');
  if (input.nb_points_estime) summary += `\n- Points estimes: ${input.nb_points_estime}`;
  if (input.nb_heures_estime) summary += `\n- Heures estimees: ${input.nb_heures_estime}`;
  return { content: summary };
}

async function modifierTournee(
  companyId: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const id = input.id as string;
  const updates: Record<string, unknown> = {};

  for (const key of ['date', 'chauffeur_nom', 'client_nom', 'slot', 'heure', 'vehicule', 'nb_points_estime', 'nb_heures_estime', 'nb_points_reel', 'nb_heures_reel', 'commentaire']) {
    if (input[key] !== undefined) updates[key] = input[key];
  }

  if (Object.keys(updates).length === 0)
    return { content: 'Aucun champ a modifier.', is_error: true };

  const { error } = await supabase
    .from('tournees')
    .update(updates)
    .eq('id', id)
    .eq('company_id', companyId);

  if (error) return { content: `Erreur: ${error.message}`, is_error: true };

  const fields = Object.entries(updates)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');
  return { content: `Tournee ${id} modifiee:\n${fields}` };
}

async function supprimerTournee(
  companyId: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const id = input.id as string;

  const { error } = await supabase
    .from('tournees')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId);

  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Tournee ${id} supprimee.` };
}

async function getValidationsPenalites(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  // Join tournee_validations with tournees to get chauffeur/client/date info
  let query = supabase
    .from('tournee_validations')
    .select('tournee_id, statut, motif, montant, updated_at')
    .eq('company_id', companyId);

  if (input.statut && input.statut !== 'tous') {
    query = query.eq('statut', input.statut as string);
  }

  const { data: validations, error: vErr } = await query.order('updated_at', { ascending: false });
  if (vErr) return { content: `Erreur: ${vErr.message}`, is_error: true };
  if (!validations || validations.length === 0) return { content: 'Aucune validation/penalite trouvee.' };

  // Get the related tournees
  const tourneeIds = validations.map(v => v.tournee_id);
  let tQuery = supabase
    .from('tournees')
    .select('id, chauffeur_nom, client_nom, date, slot')
    .eq('company_id', companyId)
    .in('id', tourneeIds);

  if (input.chauffeur_nom) tQuery = tQuery.ilike('chauffeur_nom', `%${input.chauffeur_nom}%`);
  if (input.date_debut) tQuery = tQuery.gte('date', input.date_debut as string);
  if (input.date_fin) tQuery = tQuery.lte('date', input.date_fin as string);

  const { data: tournees, error: tErr } = await tQuery;
  if (tErr) return { content: `Erreur: ${tErr.message}`, is_error: true };

  const tourneeMap = new Map((tournees ?? []).map(t => [t.id, t]));

  // Merge and filter
  const results = validations
    .map(v => {
      const t = tourneeMap.get(v.tournee_id);
      if (!t) return null;
      return { ...v, ...t };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (results.length === 0) return { content: 'Aucune validation/penalite trouvee pour ces criteres.' };

  const penalites = results.filter(r => r.statut === 'penalisee');
  const validees = results.filter(r => r.statut === 'validee');
  const totalPenalites = penalites.reduce((s, p) => s + (p.montant ?? 0), 0);

  const lines = results.map(r => {
    if (r.statut === 'penalisee') {
      return `- ${r.date} ${r.slot}: ${r.chauffeur_nom} -> ${r.client_nom} | PENALITE: ${r.motif} (${r.montant ?? 0} EUR)`;
    }
    return `- ${r.date} ${r.slot}: ${r.chauffeur_nom} -> ${r.client_nom} | VALIDEE`;
  });

  let summary = `${results.length} validation(s)/penalite(s):\n`;
  if (penalites.length > 0) summary += `- ${penalites.length} penalite(s) pour un total de ${totalPenalites.toFixed(2)} EUR\n`;
  if (validees.length > 0) summary += `- ${validees.length} tournee(s) validee(s)\n`;
  summary += `\nDetail:\n${lines.join('\n')}`;

  return { content: summary };
}

async function validerTournee(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const id = input.id as string;
  const { error } = await supabase.from('tournee_validations').upsert({
    company_id: companyId, tournee_id: id, statut: 'validee', updated_at: new Date().toISOString(),
  }, { onConflict: 'tournee_id' });
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Tournee ${id} validee.` };
}

async function penaliserTournee(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const id = input.id as string;
  const { error } = await supabase.from('tournee_validations').upsert({
    company_id: companyId, tournee_id: id, statut: 'penalisee',
    motif: input.motif, montant: input.montant, updated_at: new Date().toISOString(),
  }, { onConflict: 'tournee_id' });
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Tournee ${id} penalisee: ${input.motif} (${input.montant} EUR)` };
}

async function resetValidation(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const { error } = await supabase.from('tournee_validations').delete().eq('tournee_id', input.id as string).eq('company_id', companyId);
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Validation de la tournee ${input.id} reinitalisee.` };
}

async function supprimerSemaine(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const monday = input.semaine_debut as string;
  const d = new Date(monday + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 6);
  const sunday = d.toISOString().split('T')[0];

  const { data: existing } = await supabase.from('tournees').select('id').eq('company_id', companyId).gte('date', monday).lte('date', sunday);
  const count = existing?.length ?? 0;
  if (count === 0) return { content: `Aucune tournee a supprimer pour la semaine du ${monday}.` };

  const { error } = await supabase.from('tournees').delete().eq('company_id', companyId).gte('date', monday).lte('date', sunday);
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `${count} tournee(s) supprimee(s) pour la semaine du ${monday} au ${sunday}.` };
}
