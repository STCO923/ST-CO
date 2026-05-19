import { supabase } from '../supabase';
import { ToolDefinition, ToolResult, log } from '../types';

const JOURS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS_FR = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];

export const definitions: ToolDefinition[] = [
  {
    name: 'envoyer_planning_whatsapp',
    description:
      'Genere un lien WhatsApp cliquable avec le planning du jour ou de la semaine pour un chauffeur. ' +
      'Le lien ouvre WhatsApp avec le message pre-tape, pret a envoyer.',
    input_schema: {
      type: 'object',
      properties: {
        chauffeur_nom: { type: 'string', description: 'Nom du chauffeur' },
        date: { type: 'string', description: 'Date YYYY-MM-DD (par defaut: aujourd\'hui)' },
        semaine: {
          type: 'boolean',
          description: 'Si true, envoie le planning de toute la semaine au lieu du jour',
        },
      },
      required: ['chauffeur_nom'],
    },
  },
  {
    name: 'envoyer_planning_whatsapp_tous',
    description:
      'Genere les liens WhatsApp pour TOUS les chauffeurs ayant des tournees ce jour ou cette semaine. ' +
      'Chaque lien ouvre WhatsApp avec le planning pre-tape pour ce chauffeur.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date YYYY-MM-DD (par defaut: aujourd\'hui)' },
        semaine: { type: 'boolean', description: 'Si true, planning semaine' },
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
      case 'envoyer_planning_whatsapp':
        return await envoyerPlanningWA(companyId, input);
      case 'envoyer_planning_whatsapp_tous':
        return await envoyerPlanningWATous(companyId, input);
      default:
        return { content: `Tool inconnu: ${toolName}`, is_error: true };
    }
  } catch (err) {
    log('error', 'whatsapp tool error', { toolName, error: String(err) });
    return { content: 'Erreur lors du traitement.', is_error: true };
  }
}

// Get company name
async function getCompanyName(companyId: string): Promise<string> {
  const { data } = await supabase
    .from('sa_companies')
    .select('name')
    .eq('id', companyId)
    .single();
  return data?.name ?? 'OPTIMUM TRANS';
}

// Get Monday of a week
function getMonday(dateStr: string): Date {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function fmtDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function fmtDateFR(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${JOURS_FR[d.getDay()]} ${d.getDate()} ${MOIS_FR[d.getMonth()]}`;
}

// Build day message (same format as web app buildMsg)
function buildDayMsg(
  companyName: string,
  chauffeurNom: string,
  dateStr: string,
  tournees: Array<{ client_nom: string; slot: string; heure: string | null }>,
  vehicule: string | null
): string {
  const dateF = fmtDateFR(dateStr);
  let msg = `🚐 *${companyName} — Planning*\nBonjour ${chauffeurNom},\n\n📅 *${dateF}*\n`;
  if (vehicule) msg += `🚐 Vehicule : ${vehicule}\n`;
  msg += '\n';
  tournees.forEach((t, i) => {
    msg += `${i + 1}. *${t.client_nom}*\n   🕐 ${t.heure ?? '—'} · ${t.slot}\n\n`;
  });
  msg += `✅ Bonne journee !\n_${companyName}_`;
  return msg;
}

// Build week message (same format as web app buildWeekMsg)
function buildWeekMsg(
  companyName: string,
  chauffeurNom: string,
  monday: Date,
  tourneesByDate: Map<string, Array<{ client_nom: string; slot: string; heure: string | null }>>
): string {
  const sunday = addDays(monday, 6);
  const dateDebut = `${monday.getDate()} ${MOIS_FR[monday.getMonth()]}`;
  const dateFin = `${sunday.getDate()} ${MOIS_FR[sunday.getMonth()]} ${sunday.getFullYear()}`;

  let msg = `🚐 *${companyName} — Planning Semaine*\nBonjour ${chauffeurNom},\n\n📅 *Du ${dateDebut} au ${dateFin}*\n\n`;

  for (let d = 0; d < 7; d++) {
    const date = addDays(monday, d);
    const dateStr = fmtDate(date);
    const tours = tourneesByDate.get(dateStr);
    if (!tours || tours.length === 0) continue;

    msg += `*${JOURS_FR[date.getDay()]} ${date.getDate()} ${MOIS_FR[date.getMonth()]}*\n`;
    for (const t of tours) {
      msg += `  • ${t.client_nom} — ${t.slot}${t.heure ? ' a ' + t.heure : ''}\n`;
    }
    msg += '\n';
  }

  msg += `✅ Bonne semaine !\n_${companyName}_`;
  return msg;
}

function normalizePhone(tel: string): string {
  let p = tel.replace(/[\s\-\.\(\)]/g, '');
  if (p.startsWith('+')) p = p.substring(1);
  else if (p.startsWith('00')) p = p.substring(2);
  else if (p.startsWith('0') && p.length === 10) p = '33' + p.substring(1);
  return p.replace(/[^0-9]/g, '');
}

function makeWALink(phone: string, message: string): string {
  const cleanPhone = normalizePhone(phone);
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

async function envoyerPlanningWA(
  companyId: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const chauffeurNom = input.chauffeur_nom as string;
  const date = (input.date as string) ?? new Date().toISOString().split('T')[0];
  const semaine = input.semaine === true;

  // Get chauffeur phone
  const { data: chauffeur } = await supabase
    .from('chauffeurs')
    .select('nom, tel')
    .eq('company_id', companyId)
    .ilike('nom', `%${chauffeurNom}%`)
    .single();

  if (!chauffeur) return { content: `Chauffeur "${chauffeurNom}" introuvable.`, is_error: true };
  if (!chauffeur.tel) return { content: `${chauffeur.nom} n'a pas de numero de telephone.`, is_error: true };

  const companyName = await getCompanyName(companyId);

  if (semaine) {
    const monday = getMonday(date);
    const sunday = addDays(monday, 6);

    const { data: tournees } = await supabase
      .from('tournees')
      .select('date, client_nom, slot, heure')
      .eq('company_id', companyId)
      .eq('chauffeur_nom', chauffeur.nom)
      .gte('date', fmtDate(monday))
      .lte('date', fmtDate(sunday))
      .order('date')
      .order('heure');

    if (!tournees || tournees.length === 0)
      return { content: `Aucune tournee cette semaine pour ${chauffeur.nom}.` };

    const byDate = new Map<string, Array<{ client_nom: string; slot: string; heure: string | null }>>();
    for (const t of tournees) {
      const list = byDate.get(t.date) ?? [];
      list.push(t);
      byDate.set(t.date, list);
    }

    const msg = buildWeekMsg(companyName, chauffeur.nom, monday, byDate);
    const link = makeWALink(chauffeur.tel, msg);

    return {
      content:
        `Planning semaine pret pour ${chauffeur.nom} (${tournees.length} tournee(s)).\n\n` +
        `Cliquez pour envoyer via WhatsApp:\n${link}`,
    };
  } else {
    const { data: tournees } = await supabase
      .from('tournees')
      .select('client_nom, slot, heure')
      .eq('company_id', companyId)
      .eq('chauffeur_nom', chauffeur.nom)
      .eq('date', date)
      .order('heure');

    if (!tournees || tournees.length === 0)
      return { content: `Aucune tournee le ${date} pour ${chauffeur.nom}.` };

    // Get vehicle
    const { data: affectation } = await supabase
      .from('affectations_vehicule')
      .select('vehicule_id')
      .eq('company_id', companyId)
      .eq('chauffeur_nom', chauffeur.nom)
      .eq('date', date)
      .single();

    let vehiculeLabel: string | null = null;
    if (affectation?.vehicule_id) {
      const { data: veh } = await supabase
        .from('vehicules')
        .select('immatriculation, marque')
        .eq('id', affectation.vehicule_id)
        .single();
      if (veh) vehiculeLabel = `${veh.immatriculation}${veh.marque ? ' · ' + veh.marque : ''}`;
    }

    const msg = buildDayMsg(companyName, chauffeur.nom, date, tournees, vehiculeLabel);
    const link = makeWALink(chauffeur.tel, msg);

    return {
      content:
        `Planning du ${fmtDateFR(date)} pret pour ${chauffeur.nom} (${tournees.length} tournee(s)).\n\n` +
        `Cliquez pour envoyer via WhatsApp:\n${link}`,
    };
  }
}

async function envoyerPlanningWATous(
  companyId: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const date = (input.date as string) ?? new Date().toISOString().split('T')[0];
  const semaine = input.semaine === true;

  let dateDebut = date;
  let dateFin = date;
  if (semaine) {
    const monday = getMonday(date);
    dateDebut = fmtDate(monday);
    dateFin = fmtDate(addDays(monday, 6));
  }

  // Get all tournees for the period
  const { data: tournees } = await supabase
    .from('tournees')
    .select('chauffeur_nom, date, client_nom, slot, heure')
    .eq('company_id', companyId)
    .gte('date', dateDebut)
    .lte('date', dateFin)
    .order('date')
    .order('heure');

  if (!tournees || tournees.length === 0)
    return { content: `Aucune tournee pour la periode.` };

  // Get all chauffeurs with phone numbers
  const chauffeurNoms = [...new Set(tournees.map((t) => t.chauffeur_nom))];
  const { data: chauffeurs } = await supabase
    .from('chauffeurs')
    .select('nom, tel')
    .eq('company_id', companyId)
    .in('nom', chauffeurNoms);

  if (!chauffeurs) return { content: 'Erreur lors de la recuperation des chauffeurs.', is_error: true };

  const companyName = await getCompanyName(companyId);
  const lines: string[] = [];
  let sentCount = 0;
  let noPhoneCount = 0;

  for (const ch of chauffeurs) {
    if (!ch.tel) {
      noPhoneCount++;
      lines.push(`- ${ch.nom}: pas de numero`);
      continue;
    }

    const chTournees = tournees.filter((t) => t.chauffeur_nom === ch.nom);
    if (chTournees.length === 0) continue;

    let msg: string;
    if (semaine) {
      const monday = getMonday(dateDebut);
      const byDate = new Map<string, Array<{ client_nom: string; slot: string; heure: string | null }>>();
      for (const t of chTournees) {
        const list = byDate.get(t.date) ?? [];
        list.push(t);
        byDate.set(t.date, list);
      }
      msg = buildWeekMsg(companyName, ch.nom, monday, byDate);
    } else {
      msg = buildDayMsg(companyName, ch.nom, date, chTournees, null);
    }

    const link = makeWALink(ch.tel, msg);
    lines.push(`- ${ch.nom} (${chTournees.length} tournee(s)): ${link}`);
    sentCount++;
  }

  return {
    content:
      `${sentCount} lien(s) WhatsApp genere(s):\n\n` +
      lines.join('\n\n') +
      (noPhoneCount > 0 ? `\n\n${noPhoneCount} chauffeur(s) sans numero.` : ''),
  };
}
