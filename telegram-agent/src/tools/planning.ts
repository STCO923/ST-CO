import { supabase } from '../supabase';
import { ToolDefinition, ToolResult, log } from '../types';

export const definitions: ToolDefinition[] = [
  {
    name: 'get_planning',
    description:
      'Recupere le planning pour une date ou une semaine. Affiche les affectations chauffeur/client/creneau.',
    input_schema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: "Date YYYY-MM-DD (par defaut: aujourd'hui)",
        },
        semaine: {
          type: 'boolean',
          description: 'Si true, affiche toute la semaine contenant la date',
        },
      },
    },
  },
  {
    name: 'get_stats',
    description:
      'Statistiques sur une periode: nombre de tournees, repartition par chauffeur/client, CA estime.',
    input_schema: {
      type: 'object',
      properties: {
        date_debut: { type: 'string', description: 'Date debut YYYY-MM-DD' },
        date_fin: { type: 'string', description: 'Date fin YYYY-MM-DD' },
      },
      required: ['date_debut', 'date_fin'],
    },
  },
  {
    name: 'creer_planning_semaine',
    description:
      'Cree le planning complet d\'une semaine en une seule fois. ' +
      'Accepte une liste d\'entrees avec chauffeur, client, jour, creneau, heure et vehicule.',
    input_schema: {
      type: 'object',
      properties: {
        semaine_debut: {
          type: 'string',
          description: 'Date du lundi YYYY-MM-DD',
        },
        entrees: {
          type: 'array',
          description:
            'Liste des entrees du planning. Chaque entree: { chauffeur_nom, client_nom, jour (lundi-dimanche), slot (AM/PM), heure?, vehicule? }',
          items: {
            type: 'object',
            properties: {
              chauffeur_nom: { type: 'string' },
              client_nom: { type: 'string' },
              jour: {
                type: 'string',
                description: 'lundi, mardi, mercredi, jeudi, vendredi, samedi, dimanche',
              },
              slot: { type: 'string', enum: ['AM', 'PM'] },
              heure: { type: 'string', description: 'Heure debut ex: 06:00' },
              vehicule: { type: 'string' },
            },
            required: ['chauffeur_nom', 'client_nom', 'jour', 'slot'],
          },
        },
      },
      required: ['semaine_debut', 'entrees'],
    },
  },
  {
    name: 'dupliquer_semaine',
    description:
      'Duplique toutes les tournees d\'une semaine vers une autre semaine. ' +
      'Gere les doublons automatiquement (meme chauffeur+date+slot+client = ignore). ' +
      'Inclut les affectations vehicules.',
    input_schema: {
      type: 'object',
      properties: {
        semaine_source: {
          type: 'string',
          description: 'Date du lundi source YYYY-MM-DD',
        },
        semaine_cible: {
          type: 'string',
          description: 'Date du lundi cible YYYY-MM-DD',
        },
        inclure_vehicules: {
          type: 'boolean',
          description: 'Inclure les affectations vehicules (defaut: true)',
        },
      },
      required: ['semaine_source', 'semaine_cible'],
    },
  },
  {
    name: 'dupliquer_chauffeur_semaines',
    description:
      'Duplique les tournees d\'UN chauffeur specifique sur plusieurs semaines suivantes. ' +
      'Exemple: "Duplique Ahmed sur les 3 prochaines semaines" → copie ses tournees de la semaine source vers semaine+1, semaine+2, semaine+3. ' +
      'Gere les doublons et inclut les affectations vehicules.',
    input_schema: {
      type: 'object',
      properties: {
        chauffeur_nom: { type: 'string', description: 'Nom du chauffeur' },
        semaine_source: {
          type: 'string',
          description: 'Date du lundi source YYYY-MM-DD',
        },
        nombre_semaines: {
          type: 'number',
          description: 'Nombre de semaines a dupliquer (ex: 3 = les 3 semaines suivantes)',
        },
        inclure_vehicules: {
          type: 'boolean',
          description: 'Inclure les affectations vehicules (defaut: true)',
        },
      },
      required: ['chauffeur_nom', 'semaine_source', 'nombre_semaines'],
    },
  },
  {
    name: 'audit_planning_semaine',
    description:
      'Audit complet d\'une semaine: resume du planning + detection de TOUS les problemes. ' +
      'Detecte: saisies manquantes (points ou heures non remplis), chauffeurs sans vehicule, ' +
      'tournees sans chauffeur, conflits (chauffeur en absence avec tournee planifiee), ' +
      'chauffeurs actifs sans tournee, jours vides. ' +
      'Utilise cette commande quand l\'utilisateur demande un resume, un bilan ou une verification du planning.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Une date dans la semaine YYYY-MM-DD (defaut: cette semaine)' },
      },
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
      case 'get_planning':
        return await getPlanning(companyId, input);
      case 'get_stats':
        return await getStats(companyId, input);
      case 'creer_planning_semaine':
        return await creerPlanningSemaine(companyId, input);
      case 'dupliquer_semaine':
        return await dupliquerSemaine(companyId, input);
      case 'dupliquer_chauffeur_semaines':
        return await dupliquerChauffeurSemaines(companyId, input);
      case 'audit_planning_semaine':
        return await auditPlanning(companyId, input);
      default:
        return { content: `Tool inconnu: ${toolName}`, is_error: true };
    }
  } catch (err) {
    log('error', 'planning tool error', { toolName, error: String(err) });
    return { content: 'Erreur lors du traitement.', is_error: true };
  }
}

// === Helpers ===

const JOURS_MAP: Record<string, number> = {
  lundi: 0, mardi: 1, mercredi: 2, jeudi: 3, vendredi: 4, samedi: 5, dimanche: 6,
};

function getMonday(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  return d.toISOString().split('T')[0];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function sundayOf(mondayStr: string): string {
  return addDays(mondayStr, 6);
}

// === Tools ===

async function getPlanning(
  companyId: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const date =
    (input.date as string) || new Date().toISOString().split('T')[0];
  const showWeek = input.semaine === true;

  let dateDebut = date;
  let dateFin = date;
  if (showWeek) {
    dateDebut = getMonday(date);
    dateFin = addDays(dateDebut, 6);
  }

  const { data, error } = await supabase
    .from('tournees')
    .select(
      'id, chauffeur_nom, date, slot, client_nom, heure, vehicule'
    )
    .eq('company_id', companyId)
    .gte('date', dateDebut)
    .lte('date', dateFin)
    .order('date')
    .order('slot')
    .order('heure');

  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  if (!data || data.length === 0)
    return {
      content: `Aucun planning pour ${showWeek ? `la semaine du ${dateDebut}` : `le ${date}`}.`,
    };

  const byDate = new Map<string, string[]>();
  for (const p of data) {
    const key = p.date;
    const line =
      `  - ${p.slot} ${p.heure ?? ''}: ${p.chauffeur_nom} -> ${p.client_nom}` +
      (p.vehicule ? ` [${p.vehicule}]` : '');
    const existing = byDate.get(key) ?? [];
    existing.push(line);
    byDate.set(key, existing);
  }

  const sections: string[] = [];
  for (const [d, lines] of byDate) {
    sections.push(`${d}:\n${lines.join('\n')}`);
  }

  return {
    content: `Planning${showWeek ? ` semaine ${dateDebut}` : ` ${date}`} (${data.length} tournee(s)):\n\n${sections.join('\n\n')}`,
  };
}

async function getStats(
  companyId: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const debut = input.date_debut as string;
  const fin = input.date_fin as string;

  const { data, error } = await supabase
    .from('tournees')
    .select('chauffeur_nom, client_nom, nb_points_reel, nb_heures_reel')
    .eq('company_id', companyId)
    .gte('date', debut)
    .lte('date', fin);

  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  if (!data || data.length === 0)
    return { content: `Aucune donnee pour la periode ${debut} -> ${fin}.` };

  const nbTournees = data.length;
  const totalPoints = data.reduce((s, t) => s + (t.nb_points_reel ?? 0), 0);
  const totalHeures = data.reduce((s, t) => s + (t.nb_heures_reel ?? 0), 0);

  const parChauffeur = new Map<string, number>();
  for (const t of data) {
    parChauffeur.set(
      t.chauffeur_nom,
      (parChauffeur.get(t.chauffeur_nom) ?? 0) + 1
    );
  }

  const parClient = new Map<string, number>();
  for (const t of data) {
    parClient.set(
      t.client_nom,
      (parClient.get(t.client_nom) ?? 0) + 1
    );
  }

  const chauffeurLines = [...parChauffeur.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([nom, count]) => `  - ${nom}: ${count} tournee(s)`);

  const clientLines = [...parClient.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([nom, count]) => `  - ${nom}: ${count} tournee(s)`);

  return {
    content:
      `Stats ${debut} -> ${fin}:\n` +
      `- Total: ${nbTournees} tournee(s)\n` +
      `- Points livres: ${totalPoints}\n` +
      `- Heures totales: ${totalHeures}h\n\n` +
      `Par chauffeur:\n${chauffeurLines.join('\n')}\n\n` +
      `Par client:\n${clientLines.join('\n')}`,
  };
}

// === Créer planning semaine complet ===

interface PlanningEntry {
  chauffeur_nom: string;
  client_nom: string;
  jour: string;
  slot: string;
  heure?: string;
  vehicule?: string;
}

async function creerPlanningSemaine(
  companyId: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const semaineDebut = input.semaine_debut as string;
  const entrees = input.entrees as PlanningEntry[];

  if (!entrees || entrees.length === 0) {
    return { content: 'Aucune entree fournie.', is_error: true };
  }

  const tournees: Array<Record<string, unknown>> = [];
  const affectations: Array<Record<string, unknown>> = [];

  for (const e of entrees) {
    const jourOffset = JOURS_MAP[e.jour.toLowerCase()];
    if (jourOffset === undefined) {
      return {
        content: `Jour invalide: "${e.jour}". Utilisez: lundi, mardi, mercredi, jeudi, vendredi, samedi, dimanche.`,
        is_error: true,
      };
    }

    const dateStr = addDays(semaineDebut, jourOffset);

    tournees.push({
      company_id: companyId,
      chauffeur_nom: e.chauffeur_nom,
      client_nom: e.client_nom,
      date: dateStr,
      slot: e.slot,
      heure: e.heure ?? null,
      vehicule: e.vehicule ?? null,
    });

    if (e.vehicule) {
      affectations.push({
        company_id: companyId,
        chauffeur_nom: e.chauffeur_nom,
        date: dateStr,
        vehicule_id: e.vehicule,
      });
    }
  }

  const { error } = await supabase.from('tournees').insert(tournees);
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };

  // Insert vehicle affectations
  if (affectations.length > 0) {
    await supabase
      .from('affectations_vehicule')
      .upsert(affectations, {
        onConflict: 'company_id,chauffeur_nom,date',
      });
  }

  const chauffeurs = [...new Set(entrees.map((e) => e.chauffeur_nom))];
  const clients = [...new Set(entrees.map((e) => e.client_nom))];

  return {
    content:
      `Planning semaine du ${semaineDebut} cree:\n` +
      `- ${tournees.length} tournee(s)\n` +
      `- ${chauffeurs.length} chauffeur(s): ${chauffeurs.join(', ')}\n` +
      `- ${clients.length} client(s): ${clients.join(', ')}` +
      (affectations.length > 0
        ? `\n- ${affectations.length} affectation(s) vehicule`
        : ''),
  };
}

// === Dupliquer semaine entière ===

async function dupliquerSemaine(
  companyId: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const srcMonday = input.semaine_source as string;
  const tgtMonday = input.semaine_cible as string;
  const inclureVehicules = input.inclure_vehicules !== false;

  if (srcMonday === tgtMonday) {
    return {
      content: 'La semaine source et cible sont identiques.',
      is_error: true,
    };
  }

  const srcSunday = sundayOf(srcMonday);
  const tgtSunday = sundayOf(tgtMonday);

  // 1. Load source tournees
  const { data: srcTournees, error: srcErr } = await supabase
    .from('tournees')
    .select(
      'chauffeur_nom, client_nom, date, slot, heure, vehicule, commentaire'
    )
    .eq('company_id', companyId)
    .gte('date', srcMonday)
    .lte('date', srcSunday);

  if (srcErr)
    return { content: `Erreur: ${srcErr.message}`, is_error: true };
  if (!srcTournees || srcTournees.length === 0)
    return {
      content: `Aucune tournee dans la semaine source (${srcMonday}).`,
    };

  // 2. Remap dates
  const newTournees = srcTournees.map((t) => {
    const srcDate = new Date(t.date + 'T12:00:00Z');
    const srcMon = new Date(srcMonday + 'T12:00:00Z');
    const dayOffset = Math.round(
      (srcDate.getTime() - srcMon.getTime()) / 86400000
    );
    const tgtDate = addDays(tgtMonday, dayOffset);
    return {
      company_id: companyId,
      chauffeur_nom: t.chauffeur_nom,
      client_nom: t.client_nom,
      date: tgtDate,
      slot: t.slot,
      heure: t.heure,
      vehicule: t.vehicule,
      commentaire: t.commentaire,
    };
  });

  // 3. Deduplicate — check existing in target week
  const { data: existingTournees } = await supabase
    .from('tournees')
    .select('chauffeur_nom, date, slot, client_nom')
    .eq('company_id', companyId)
    .gte('date', tgtMonday)
    .lte('date', tgtSunday);

  const existingKeys = new Set(
    (existingTournees ?? []).map(
      (t) => `${t.chauffeur_nom}|${t.date}|${t.slot}|${t.client_nom}`
    )
  );

  const toInsert = newTournees.filter(
    (t) =>
      !existingKeys.has(
        `${t.chauffeur_nom}|${t.date}|${t.slot}|${t.client_nom}`
      )
  );
  const skipped = newTournees.length - toInsert.length;

  if (toInsert.length === 0) {
    return {
      content: `Toutes les ${newTournees.length} tournees existent deja sur la semaine cible. Aucune duplication necessaire.`,
    };
  }

  // 4. Insert
  const { error: insertErr } = await supabase
    .from('tournees')
    .insert(toInsert);
  if (insertErr)
    return { content: `Erreur insertion: ${insertErr.message}`, is_error: true };

  // 5. Copy vehicle affectations
  let affCount = 0;
  if (inclureVehicules) {
    const { data: srcAff } = await supabase
      .from('affectations_vehicule')
      .select('chauffeur_nom, date, vehicule_id')
      .eq('company_id', companyId)
      .gte('date', srcMonday)
      .lte('date', srcSunday);

    if (srcAff && srcAff.length > 0) {
      const srcMon = new Date(srcMonday + 'T12:00:00Z');
      const newAff = srcAff.map((a) => {
        const srcDate = new Date(a.date + 'T12:00:00Z');
        const dayOffset = Math.round(
          (srcDate.getTime() - srcMon.getTime()) / 86400000
        );
        return {
          company_id: companyId,
          chauffeur_nom: a.chauffeur_nom,
          date: addDays(tgtMonday, dayOffset),
          vehicule_id: a.vehicule_id,
        };
      });

      await supabase
        .from('affectations_vehicule')
        .upsert(newAff, {
          onConflict: 'company_id,chauffeur_nom,date',
        });
      affCount = newAff.length;
    }
  }

  log('info', 'Week duplicated', {
    companyId,
    src: srcMonday,
    tgt: tgtMonday,
    inserted: toInsert.length,
    skipped,
  });

  return {
    content:
      `Duplication reussie: semaine ${srcMonday} -> ${tgtMonday}\n` +
      `- ${toInsert.length} tournee(s) dupliquee(s)\n` +
      (skipped > 0 ? `- ${skipped} doublon(s) ignore(s)\n` : '') +
      (affCount > 0 ? `- ${affCount} affectation(s) vehicule copiee(s)` : ''),
  };
}

// === Dupliquer chauffeur sur N semaines ===

async function dupliquerChauffeurSemaines(
  companyId: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const chauffeurNom = input.chauffeur_nom as string;
  const srcMonday = input.semaine_source as string;
  const nbSemaines = input.nombre_semaines as number;
  const inclureVehicules = input.inclure_vehicules !== false;

  if (nbSemaines < 1 || nbSemaines > 12) {
    return {
      content: 'Le nombre de semaines doit etre entre 1 et 12.',
      is_error: true,
    };
  }

  const srcSunday = sundayOf(srcMonday);

  // 1. Load source tournees for this chauffeur
  const { data: srcTournees, error: srcErr } = await supabase
    .from('tournees')
    .select(
      'chauffeur_nom, client_nom, date, slot, heure, vehicule, commentaire'
    )
    .eq('company_id', companyId)
    .eq('chauffeur_nom', chauffeurNom)
    .gte('date', srcMonday)
    .lte('date', srcSunday);

  if (srcErr)
    return { content: `Erreur: ${srcErr.message}`, is_error: true };
  if (!srcTournees || srcTournees.length === 0)
    return {
      content: `Aucune tournee pour ${chauffeurNom} la semaine du ${srcMonday}.`,
    };

  // 2. Generate tournees for each target week
  const srcMon = new Date(srcMonday + 'T12:00:00Z');
  const allNew: Array<Record<string, unknown>> = [];
  const targetWeeks: string[] = [];

  for (let w = 1; w <= nbSemaines; w++) {
    const tgtMonday = addDays(srcMonday, w * 7);
    targetWeeks.push(tgtMonday);

    for (const t of srcTournees) {
      const srcDate = new Date(t.date + 'T12:00:00Z');
      const dayOffset = Math.round(
        (srcDate.getTime() - srcMon.getTime()) / 86400000
      );
      allNew.push({
        company_id: companyId,
        chauffeur_nom: t.chauffeur_nom,
        client_nom: t.client_nom,
        date: addDays(tgtMonday, dayOffset),
        slot: t.slot,
        heure: t.heure,
        vehicule: t.vehicule,
        commentaire: t.commentaire,
      });
    }
  }

  // 3. Deduplicate
  const firstTgt = targetWeeks[0];
  const lastTgtSunday = sundayOf(targetWeeks[targetWeeks.length - 1]);

  const { data: existing } = await supabase
    .from('tournees')
    .select('chauffeur_nom, date, slot, client_nom')
    .eq('company_id', companyId)
    .eq('chauffeur_nom', chauffeurNom)
    .gte('date', firstTgt)
    .lte('date', lastTgtSunday);

  const existingKeys = new Set(
    (existing ?? []).map(
      (t) => `${t.chauffeur_nom}|${t.date}|${t.slot}|${t.client_nom}`
    )
  );

  const toInsert = allNew.filter(
    (t) =>
      !existingKeys.has(
        `${t.chauffeur_nom}|${t.date}|${t.slot}|${t.client_nom}`
      )
  );
  const skipped = allNew.length - toInsert.length;

  if (toInsert.length === 0) {
    return {
      content: `Toutes les tournees de ${chauffeurNom} existent deja sur les ${nbSemaines} semaines cibles.`,
    };
  }

  // 4. Insert
  const { error: insertErr } = await supabase
    .from('tournees')
    .insert(toInsert);
  if (insertErr)
    return { content: `Erreur: ${insertErr.message}`, is_error: true };

  // 5. Copy vehicle affectations
  let affCount = 0;
  if (inclureVehicules) {
    const { data: srcAff } = await supabase
      .from('affectations_vehicule')
      .select('chauffeur_nom, date, vehicule_id')
      .eq('company_id', companyId)
      .eq('chauffeur_nom', chauffeurNom)
      .gte('date', srcMonday)
      .lte('date', srcSunday);

    if (srcAff && srcAff.length > 0) {
      const allNewAff: Array<Record<string, unknown>> = [];
      for (let w = 1; w <= nbSemaines; w++) {
        const tgtMonday = addDays(srcMonday, w * 7);
        for (const a of srcAff) {
          const srcDate = new Date(a.date + 'T12:00:00Z');
          const dayOffset = Math.round(
            (srcDate.getTime() - srcMon.getTime()) / 86400000
          );
          allNewAff.push({
            company_id: companyId,
            chauffeur_nom: a.chauffeur_nom,
            date: addDays(tgtMonday, dayOffset),
            vehicule_id: a.vehicule_id,
          });
        }
      }
      if (allNewAff.length > 0) {
        await supabase
          .from('affectations_vehicule')
          .upsert(allNewAff, {
            onConflict: 'company_id,chauffeur_nom,date',
          });
        affCount = allNewAff.length;
      }
    }
  }

  log('info', 'Chauffeur weeks duplicated', {
    companyId,
    chauffeur: chauffeurNom,
    src: srcMonday,
    weeks: nbSemaines,
    inserted: toInsert.length,
  });

  return {
    content:
      `Duplication de ${chauffeurNom} reussie:\n` +
      `- Source: semaine du ${srcMonday} (${srcTournees.length} tournee(s))\n` +
      `- Duplique sur ${nbSemaines} semaine(s): ${targetWeeks.join(', ')}\n` +
      `- ${toInsert.length} tournee(s) creee(s)\n` +
      (skipped > 0 ? `- ${skipped} doublon(s) ignore(s)\n` : '') +
      (affCount > 0
        ? `- ${affCount} affectation(s) vehicule copiee(s)`
        : ''),
  };
}

// === Audit Planning ===

async function auditPlanning(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const date = (input.date as string) || new Date().toISOString().split('T')[0];
  const mondayStr = getMonday(date);
  const sundayStr = addDays(mondayStr, 6);

  // Load all data in parallel
  const [tRes, chRes, clRes, absRes, affRes, vRes] = await Promise.all([
    supabase.from('tournees')
      .select('id, chauffeur_nom, client_nom, date, slot, heure, vehicule, nb_points_estime, nb_points_reel, nb_heures_estime, nb_heures_reel')
      .eq('company_id', companyId).gte('date', mondayStr).lte('date', sundayStr),
    supabase.from('chauffeurs').select('nom, type, statut').eq('company_id', companyId).eq('statut', 'actif'),
    supabase.from('clients').select('nom, type_paiement').eq('company_id', companyId),
    supabase.from('absences').select('chauffeur_nom, date_debut, date_fin, type, statut')
      .eq('company_id', companyId).eq('statut', 'approuve').lte('date_debut', sundayStr).gte('date_fin', mondayStr),
    supabase.from('affectations_vehicule').select('chauffeur_nom, date, vehicule_id')
      .eq('company_id', companyId).gte('date', mondayStr).lte('date', sundayStr),
    supabase.from('vehicules').select('id, immatriculation, statut').eq('company_id', companyId),
  ]);

  const tournees = tRes.data ?? [];
  const chauffeurs = chRes.data ?? [];
  const clients = clRes.data ?? [];
  const absences = absRes.data ?? [];
  const affectations = affRes.data ?? [];
  const vehicules = vRes.data ?? [];

  const clientMap = new Map(clients.map(c => [c.nom, c]));
  const affSet = new Set(affectations.map(a => `${a.chauffeur_nom}|${a.date}`));
  const vehMap = new Map(vehicules.map(v => [v.id, v]));

  const problemes: string[] = [];
  const infos: string[] = [];

  // --- Résumé ---
  const nbTournees = tournees.length;
  const chauffeursUtilises = new Set(tournees.map(t => t.chauffeur_nom));
  const clientsUtilises = new Set(tournees.map(t => t.client_nom));
  const joursActifs = new Set(tournees.map(t => t.date));

  infos.push(`${nbTournees} tournee(s) sur ${joursActifs.size} jour(s)`);
  infos.push(`${chauffeursUtilises.size} chauffeur(s) mobilise(s), ${clientsUtilises.size} client(s)`);

  // --- Saisies manquantes (points/heures) ---
  const saisiesManquantes: string[] = [];
  for (const t of tournees) {
    const cl = clientMap.get(t.client_nom);
    if (!cl) continue;
    if (cl.type_paiement === 'point') {
      if (t.nb_points_reel == null && t.nb_points_estime == null) {
        saisiesManquantes.push(`${t.date} ${t.slot}: ${t.chauffeur_nom} -> ${t.client_nom} (points manquants)`);
      }
    } else if (cl.type_paiement === 'heure') {
      if (t.nb_heures_reel == null && t.nb_heures_estime == null) {
        saisiesManquantes.push(`${t.date} ${t.slot}: ${t.chauffeur_nom} -> ${t.client_nom} (heures manquantes)`);
      }
    }
  }
  if (saisiesManquantes.length > 0) {
    problemes.push(`SAISIES MANQUANTES (${saisiesManquantes.length}):\n${saisiesManquantes.map(s => `  - ${s}`).join('\n')}`);
  }

  // --- Tournées sans véhicule ---
  const sansVehicule: string[] = [];
  for (const t of tournees) {
    if (!t.vehicule && !affSet.has(`${t.chauffeur_nom}|${t.date}`)) {
      sansVehicule.push(`${t.date} ${t.slot}: ${t.chauffeur_nom} -> ${t.client_nom}`);
    }
  }
  if (sansVehicule.length > 0) {
    problemes.push(`SANS VEHICULE (${sansVehicule.length}):\n${sansVehicule.map(s => `  - ${s}`).join('\n')}`);
  }

  // --- Conflits absences ---
  const conflits: string[] = [];
  for (const t of tournees) {
    for (const abs of absences) {
      if (abs.chauffeur_nom === t.chauffeur_nom && t.date >= abs.date_debut && t.date <= abs.date_fin) {
        conflits.push(`${t.chauffeur_nom} est en ${abs.type} le ${t.date} mais a une tournee planifiee (${t.client_nom} ${t.slot})`);
      }
    }
  }
  if (conflits.length > 0) {
    problemes.push(`CONFLITS ABSENCES (${conflits.length}):\n${conflits.map(s => `  - ${s}`).join('\n')}`);
  }

  // --- Chauffeurs actifs sans tournée ---
  const sansTournee = chauffeurs.filter(c => !chauffeursUtilises.has(c.nom));
  if (sansTournee.length > 0) {
    infos.push(`Chauffeurs sans tournee cette semaine: ${sansTournee.map(c => c.nom).join(', ')}`);
  }

  // --- Jours vides ---
  const joursSemaine = [];
  for (let i = 0; i < 7; i++) joursSemaine.push(addDays(mondayStr, i));
  const joursVides = joursSemaine.filter(j => !joursActifs.has(j));
  if (joursVides.length > 0 && joursVides.length < 7) {
    infos.push(`Jour(s) sans tournee: ${joursVides.join(', ')}`);
  }

  // --- Véhicules en maintenance/hors service ---
  const vehProbleme = vehicules.filter(v => v.statut === 'maintenance' || v.statut === 'hors service');
  if (vehProbleme.length > 0) {
    infos.push(`Vehicule(s) indisponible(s): ${vehProbleme.map(v => `${v.immatriculation} (${v.statut})`).join(', ')}`);
  }

  // --- Build result ---
  let result = `Audit planning semaine du ${mondayStr} au ${sundayStr}:\n\n`;
  result += `RESUME:\n${infos.map(i => `- ${i}`).join('\n')}\n\n`;

  if (problemes.length > 0) {
    result += `PROBLEMES DETECTES:\n\n${problemes.join('\n\n')}\n`;
  } else {
    result += `Aucun probleme detecte. Le planning est complet.`;
  }

  return { content: result };
}
