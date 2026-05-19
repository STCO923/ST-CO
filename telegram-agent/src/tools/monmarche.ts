import { supabase } from '../supabase';
import { ToolDefinition, ToolResult, log } from '../types';

const JOURS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
const JOURS_FULL = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

export const definitions: ToolDefinition[] = [
  {
    name: 'get_shifts',
    description:
      'Recupere les shifts Mon Marche pour une semaine donnee. ' +
      'Montre les zones, les creneaux (AM/PM) avec chauffeurs et heures assignes.',
    input_schema: {
      type: 'object',
      properties: {
        semaine_debut: {
          type: 'string',
          description: 'Date du lundi de la semaine YYYY-MM-DD',
        },
        zone_nom: { type: 'string', description: 'Filtrer par zone' },
      },
      required: ['semaine_debut'],
    },
  },
  {
    name: 'creer_shift',
    description: 'Cree une nouvelle ligne (zone) dans les shifts Mon Marche.',
    input_schema: {
      type: 'object',
      properties: {
        semaine_debut: { type: 'string', description: 'Date du lundi YYYY-MM-DD' },
        zone_nom: { type: 'string', description: 'Nom de la zone' },
        ordre: { type: 'number', description: 'Ordre d\'affichage' },
      },
      required: ['semaine_debut', 'zone_nom'],
    },
  },
  {
    name: 'assigner_chauffeur_shift',
    description:
      'Assigne un chauffeur (et optionnellement un vehicule) a un creneau specifique d\'un shift Mon Marche. ' +
      'Exemple: "Mets Ahmed sur la zone THIAIS le lundi AM de 06:00 a 14:00".',
    input_schema: {
      type: 'object',
      properties: {
        shift_id: { type: 'string', description: 'ID du shift (zone)' },
        jour: {
          type: 'string',
          description: 'Jour: lun, mar, mer, jeu, ven, sam, dim (ou lundi, mardi, etc.)',
        },
        creneau: { type: 'string', description: 'am ou pm', enum: ['am', 'pm'] },
        chauffeur_nom: { type: 'string', description: 'Nom du chauffeur a assigner' },
        debut: { type: 'string', description: 'Heure debut (ex: 06:00)' },
        fin: { type: 'string', description: 'Heure fin (ex: 14:00)' },
        vehicule: { type: 'string', description: 'Vehicule assigne (optionnel)' },
      },
      required: ['shift_id', 'jour', 'creneau', 'chauffeur_nom'],
    },
  },
  {
    name: 'modifier_shift',
    description: 'Modifie les infos generales d\'un shift (zone_nom, ordre, vehicule_id).',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID du shift' },
        zone_nom: { type: 'string' },
        ordre: { type: 'number' },
        vehicule_id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'sync_shifts_to_planning',
    description:
      'Synchronise les shifts Mon Marche vers le planning et les tournees. ' +
      'Pour chaque creneau avec un chauffeur assigne, cree une entree dans le planning et une tournee.',
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
      case 'get_shifts': return await getShifts(companyId, input);
      case 'creer_shift': return await creerShift(companyId, input);
      case 'assigner_chauffeur_shift': return await assignerChauffeur(companyId, input);
      case 'modifier_shift': return await modifierShift(companyId, input);
      case 'sync_shifts_to_planning': return await syncToPlanning(companyId, input);
      default: return { content: `Tool inconnu: ${toolName}`, is_error: true };
    }
  } catch (err) {
    log('error', 'monmarche tool error', { toolName, error: String(err) });
    return { content: 'Erreur lors du traitement.', is_error: true };
  }
}

function normalizeJour(jour: string): string {
  const j = jour.toLowerCase().trim();
  const idx = JOURS_FULL.indexOf(j);
  if (idx >= 0) return JOURS[idx];
  if (JOURS.includes(j)) return j;
  // Partial match
  const found = JOURS.find((_, i) => JOURS_FULL[i].startsWith(j));
  return found ?? j;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

interface SlotData {
  chauffeur?: string;
  debut?: string;
  fin?: string;
  vehicule?: string;
}

async function getShifts(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  let query = supabase
    .from('monmarche_shifts')
    .select('id, zone_nom, ordre, vehicule_id, slots')
    .eq('company_id', companyId)
    .eq('semaine_debut', input.semaine_debut as string);

  if (input.zone_nom) query = query.ilike('zone_nom', `%${input.zone_nom}%`);

  const { data, error } = await query.order('ordre');
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  if (!data || data.length === 0)
    return { content: `Aucun shift pour la semaine du ${input.semaine_debut}.` };

  const lines: string[] = [];
  for (const shift of data) {
    const slots = (shift.slots ?? {}) as Record<string, SlotData>;
    lines.push(`Zone: ${shift.zone_nom} (ID: ${shift.id})`);

    for (let d = 0; d < 7; d++) {
      const amSlot = slots[`${JOURS[d]}_am`];
      const pmSlot = slots[`${JOURS[d]}_pm`];
      if (amSlot?.chauffeur || amSlot?.debut || pmSlot?.chauffeur || pmSlot?.debut) {
        const amStr = amSlot?.chauffeur
          ? `AM: ${amSlot.chauffeur} ${amSlot.debut ?? ''}-${amSlot.fin ?? ''}`
          : amSlot?.debut ? `AM: ? ${amSlot.debut}-${amSlot.fin ?? ''}` : '';
        const pmStr = pmSlot?.chauffeur
          ? `PM: ${pmSlot.chauffeur} ${pmSlot.debut ?? ''}-${pmSlot.fin ?? ''}`
          : pmSlot?.debut ? `PM: ? ${pmSlot.debut}-${pmSlot.fin ?? ''}` : '';
        lines.push(`  ${JOURS_FULL[d]}: ${[amStr, pmStr].filter(Boolean).join(' | ')}`);
      }
    }
    lines.push('');
  }

  return { content: `Shifts semaine ${input.semaine_debut}:\n\n${lines.join('\n')}` };
}

async function creerShift(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('monmarche_shifts')
    .insert({
      company_id: companyId,
      semaine_debut: input.semaine_debut,
      zone_nom: input.zone_nom,
      ordre: input.ordre ?? 0,
      slots: {},
    })
    .select('id, zone_nom')
    .single();

  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Zone "${data.zone_nom}" creee (ID: ${data.id}) pour la semaine du ${input.semaine_debut}.` };
}

async function assignerChauffeur(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const shiftId = input.shift_id as string;
  const jour = normalizeJour(input.jour as string);
  const creneau = input.creneau as string;
  const slotKey = `${jour}_${creneau}`;

  // Fetch current shift
  const { data: shift, error: fetchErr } = await supabase
    .from('monmarche_shifts')
    .select('slots')
    .eq('id', shiftId)
    .eq('company_id', companyId)
    .single();

  if (fetchErr || !shift) return { content: `Shift ${shiftId} introuvable.`, is_error: true };

  const slots = (shift.slots ?? {}) as Record<string, SlotData>;
  slots[slotKey] = {
    chauffeur: input.chauffeur_nom as string,
    debut: (input.debut as string) ?? slots[slotKey]?.debut,
    fin: (input.fin as string) ?? slots[slotKey]?.fin,
    vehicule: (input.vehicule as string) ?? slots[slotKey]?.vehicule,
  };

  const { error } = await supabase
    .from('monmarche_shifts')
    .update({ slots })
    .eq('id', shiftId)
    .eq('company_id', companyId);

  if (error) return { content: `Erreur: ${error.message}`, is_error: true };

  const jourFull = JOURS_FULL[JOURS.indexOf(jour)] ?? jour;
  return {
    content:
      `${input.chauffeur_nom} assigne sur le shift ${shiftId} — ` +
      `${jourFull} ${creneau.toUpperCase()}` +
      (input.debut ? ` de ${input.debut} a ${input.fin ?? '?'}` : '') +
      (input.vehicule ? ` avec ${input.vehicule}` : ''),
  };
}

async function modifierShift(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const id = input.id as string;
  const updates: Record<string, unknown> = {};
  for (const key of ['zone_nom', 'ordre', 'vehicule_id']) {
    if (input[key] !== undefined) updates[key] = input[key];
  }
  if (Object.keys(updates).length === 0) return { content: 'Aucun champ a modifier.', is_error: true };

  const { error } = await supabase
    .from('monmarche_shifts')
    .update(updates)
    .eq('id', id)
    .eq('company_id', companyId);

  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Shift ${id} modifie.` };
}

async function syncToPlanning(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const semaineDebut = input.semaine_debut as string;

  // 1. Fetch all shifts for the week
  const { data: shifts, error: fetchErr } = await supabase
    .from('monmarche_shifts')
    .select('zone_nom, slots')
    .eq('company_id', companyId)
    .eq('semaine_debut', semaineDebut);

  if (fetchErr) return { content: `Erreur: ${fetchErr.message}`, is_error: true };
  if (!shifts || shifts.length === 0)
    return { content: `Aucun shift a synchroniser pour la semaine du ${semaineDebut}.` };

  // 2. Build planning + tournees entries from assigned slots
  const planningEntries: Array<Record<string, unknown>> = [];
  const tourneeEntries: Array<Record<string, unknown>> = [];
  let assignedCount = 0;
  let skippedCount = 0;

  for (const shift of shifts) {
    const slots = (shift.slots ?? {}) as Record<string, SlotData>;

    for (let d = 0; d < 7; d++) {
      for (const creneau of ['am', 'pm']) {
        const slotKey = `${JOURS[d]}_${creneau}`;
        const slot = slots[slotKey];
        if (!slot?.chauffeur) {
          if (slot?.debut) skippedCount++;
          continue;
        }

        const dateStr = addDays(semaineDebut, d);
        const slotLabel = creneau.toUpperCase();

        planningEntries.push({
          company_id: companyId,
          chauffeur_nom: slot.chauffeur,
          date: dateStr,
          slot: slotLabel,
          client_nom: `Mon Marche - ${shift.zone_nom}`,
          heure: slot.debut ?? null,
        });

        tourneeEntries.push({
          company_id: companyId,
          chauffeur_nom: slot.chauffeur,
          date: dateStr,
          slot: slotLabel,
          client_nom: `Mon Marche - ${shift.zone_nom}`,
          heure: slot.debut ?? null,
          vehicule: slot.vehicule ?? null,
        });

        assignedCount++;
      }
    }
  }

  if (assignedCount === 0) {
    return {
      content:
        `Aucun chauffeur assigne dans les shifts de la semaine du ${semaineDebut}.\n` +
        `${skippedCount} creneau(x) avec horaires mais sans chauffeur.\n` +
        `Assignez d'abord les chauffeurs avec assigner_chauffeur_shift.`,
    };
  }

  // 3. Insert into planning
  const { error: planErr } = await supabase.from('planning').insert(planningEntries);
  if (planErr) {
    log('error', 'sync planning insert error', { error: planErr.message });
    return { content: `Erreur insertion planning: ${planErr.message}`, is_error: true };
  }

  // 4. Insert into tournees
  const { error: tourErr } = await supabase.from('tournees').insert(tourneeEntries);
  if (tourErr) {
    log('error', 'sync tournees insert error', { error: tourErr.message });
    return { content: `Erreur insertion tournees: ${tourErr.message}`, is_error: true };
  }

  log('info', 'Shifts synced to planning', {
    companyId,
    semaineDebut,
    assigned: assignedCount,
  });

  // 5. Summary
  const chauffeurSet = new Set(planningEntries.map((p) => p.chauffeur_nom as string));
  const chauffeurList = [...chauffeurSet].join(', ');

  return {
    content:
      `Synchronisation reussie pour la semaine du ${semaineDebut}:\n` +
      `- ${assignedCount} creneau(x) synchronise(s)\n` +
      `- ${chauffeurSet.size} chauffeur(s): ${chauffeurList}\n` +
      `- Entrees creees dans le planning ET les tournees\n` +
      (skippedCount > 0
        ? `- ${skippedCount} creneau(x) ignore(s) (horaires sans chauffeur)`
        : ''),
  };
}
