import ExcelJS from 'exceljs';
import { supabase } from '../supabase';
import { ToolDefinition, ToolResult, log } from '../types';

const JOURS_FULL = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE'];
const MOIS_FR = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];

export const definitions: ToolDefinition[] = [
  {
    name: 'export_planning_excel',
    description:
      'Genere un fichier Excel du planning de la semaine et l\'envoie directement dans Telegram. ' +
      'Le fichier contient les chauffeurs, vehicules, tournees par jour avec mise en forme.',
    input_schema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Une date dans la semaine souhaitee YYYY-MM-DD (par defaut: cette semaine)',
        },
      },
    },
  },
];

// Store generated files for bot.ts to pick up and send
const pendingFiles = new Map<string, { buffer: Buffer; filename: string }>();

export function getPendingFile(key: string): { buffer: Buffer; filename: string } | undefined {
  const file = pendingFiles.get(key);
  if (file) pendingFiles.delete(key);
  return file;
}

export async function handleTool(
  companyId: string,
  toolName: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  try {
    if (toolName === 'export_planning_excel') {
      return await exportExcel(companyId, input);
    }
    return { content: `Tool inconnu: ${toolName}`, is_error: true };
  } catch (err) {
    log('error', 'export tool error', { toolName, error: String(err) });
    return { content: `Erreur lors de l'export: ${String(err)}`, is_error: true };
  }
}

function getMonday(dateStr: string): Date {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  return d;
}

function fmtDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function getWeekNum(d: Date): number {
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

async function exportExcel(
  companyId: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const date = (input.date as string) || new Date().toISOString().split('T')[0];
  const monday = getMonday(date);
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    dates.push(d);
  }
  const start = fmtDate(dates[0]);
  const end = fmtDate(dates[6]);
  const weekNum = getWeekNum(monday);
  const year = monday.getUTCFullYear();

  // Get company name
  const { data: company } = await supabase
    .from('sa_companies')
    .select('name')
    .eq('id', companyId)
    .single();
  const companyName = company?.name ?? 'OPTIMUM TRANS';

  // Get tournees
  const { data: tournees, error: tErr } = await supabase
    .from('tournees')
    .select('chauffeur_nom, client_nom, date, slot, heure, vehicule, nb_points_estime, nb_points_reel')
    .eq('company_id', companyId)
    .gte('date', start)
    .lte('date', end)
    .order('date')
    .order('heure');

  if (tErr) return { content: `Erreur: ${tErr.message}`, is_error: true };
  if (!tournees || tournees.length === 0)
    return { content: `Aucune tournee pour la semaine du ${start}. Rien a exporter.` };

  // Get chauffeurs
  const { data: chauffeurs } = await supabase
    .from('chauffeurs')
    .select('nom, type')
    .eq('company_id', companyId)
    .eq('statut', 'actif')
    .order('nom');

  // Get vehicle affectations
  const { data: affectations } = await supabase
    .from('affectations_vehicule')
    .select('chauffeur_nom, date, vehicule_id')
    .eq('company_id', companyId)
    .gte('date', start)
    .lte('date', end);

  const { data: vehicules } = await supabase
    .from('vehicules')
    .select('id, immatriculation')
    .eq('company_id', companyId);

  const vehMap = new Map((vehicules ?? []).map((v) => [v.id, v.immatriculation]));

  // Build Excel
  const wb = new ExcelJS.Workbook();
  wb.creator = 'OPTIMUM TRANS';
  wb.created = new Date();

  const ws = wb.addWorksheet(`Planning S${weekNum}`, {
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
    },
  });

  // Columns: Chauffeur | Type | Véhicule | Lun-Dim | Total
  ws.columns = [
    { width: 24 }, { width: 10 }, { width: 14 },
    { width: 21 }, { width: 21 }, { width: 21 }, { width: 21 }, { width: 21 }, { width: 16 }, { width: 16 },
    { width: 8 },
  ];

  const fill = (color: string): ExcelJS.Fill => ({
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: color },
  });
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFc8d4e8' } },
    bottom: { style: 'thin', color: { argb: 'FFc8d4e8' } },
    left: { style: 'thin', color: { argb: 'FFc8d4e8' } },
    right: { style: 'thin', color: { argb: 'FFc8d4e8' } },
  };

  // Row 1: Title
  ws.addRow([`PLANNING — SEMAINE ${weekNum}  ·  ${year}  ·  ${companyName.toUpperCase()}`]);
  ws.mergeCells('A1:K1');
  const titleCell = ws.getCell('A1');
  titleCell.font = { name: 'Calibri', bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = fill('FF0f2b5b');
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 34;

  // Row 2: Dates
  ws.addRow([
    `Du ${dates[0].getUTCDate()} ${MOIS_FR[dates[0].getUTCMonth()]} au ${dates[6].getUTCDate()} ${MOIS_FR[dates[6].getUTCMonth()]} ${year}`,
  ]);
  ws.mergeCells('A2:K2');
  const subCell = ws.getCell('A2');
  subCell.font = { name: 'Calibri', size: 10, color: { argb: 'FF8eb4e3' }, italic: true };
  subCell.fill = fill('FF0a1e3d');
  subCell.alignment = { vertical: 'middle', horizontal: 'center' };

  // Row 3: spacer
  ws.addRow([]);
  ws.getRow(3).height = 4;

  // Row 4: Headers
  const headers = [
    'CHAUFFEUR', 'TYPE', 'VEHICULE',
    ...dates.map((d, i) => `${JOURS_FULL[i]}\n${d.getUTCDate()}/${d.getUTCMonth() + 1}`),
    'TOT.',
  ];
  const headerRow = ws.addRow(headers);
  headerRow.height = 40;
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = fill('FF1a4fbf');
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder;
  });

  // Data rows per chauffeur
  const chauffeurNoms = [
    ...new Set([
      ...(chauffeurs ?? []).map((c) => c.nom),
      ...tournees.map((t) => t.chauffeur_nom),
    ]),
  ].sort();

  let grandTotal = 0;
  const dayTotals = new Array(7).fill(0);

  for (const nom of chauffeurNoms) {
    const ch = (chauffeurs ?? []).find((c) => c.nom === nom);
    const chType = ch?.type === 'sous_traitant' ? 'S/T' : 'Sal.';
    const chTournees = tournees.filter((t) => t.chauffeur_nom === nom);
    if (chTournees.length === 0) continue;

    // Vehicle — most common affectation this week
    const chAff = (affectations ?? []).find((a) => a.chauffeur_nom === nom);
    const vehLabel = chAff ? vehMap.get(chAff.vehicule_id) ?? '' : '';

    const rowData: (string | number)[] = [nom, chType, vehLabel];
    let rowTotal = 0;

    for (let d = 0; d < 7; d++) {
      const dateStr = fmtDate(dates[d]);
      const dayTours = chTournees.filter((t) => t.date === dateStr);
      if (dayTours.length === 0) {
        rowData.push('');
      } else {
        const cellLines = dayTours.map(
          (t) => `${t.client_nom}\n${t.slot} ${t.heure ?? ''}`
        );
        rowData.push(cellLines.join('\n'));
        rowTotal += dayTours.length;
        dayTotals[d] += dayTours.length;
      }
    }
    rowData.push(rowTotal);
    grandTotal += rowTotal;

    const dataRow = ws.addRow(rowData);
    dataRow.eachCell((cell, colNumber) => {
      cell.font = { name: 'Calibri', size: 9 };
      cell.alignment = { vertical: 'middle', horizontal: colNumber <= 3 ? 'left' : 'center', wrapText: true };
      cell.border = thinBorder;
      if (chType === 'S/T') cell.fill = fill('FFfff8f0');
      else cell.fill = fill('FFf0f6ff');
    });
    dataRow.height = Math.max(28, chTournees.length * 14);
  }

  // Total row
  const totData: (string | number)[] = ['TOTAL TOURNEES', '', '', ...dayTotals, grandTotal];
  const totRow = ws.addRow(totData);
  totRow.eachCell((cell) => {
    cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = fill('FF0f2b5b');
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = thinBorder;
  });

  // Generate buffer
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const filename = `planning_S${weekNum}_${year}_${companyName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;

  // Store for bot.ts to pick up
  const fileKey = `${companyId}_${Date.now()}`;
  pendingFiles.set(fileKey, { buffer, filename });

  // Auto-cleanup after 60s
  setTimeout(() => pendingFiles.delete(fileKey), 60000);

  log('info', 'Excel generated', { companyId, weekNum, year, chauffeurs: chauffeurNoms.length, tournees: tournees.length });

  return {
    content:
      `__EXCEL_FILE__:${fileKey}\n` +
      `Export Excel genere: ${filename}\n` +
      `- Semaine ${weekNum} (${start} -> ${end})\n` +
      `- ${chauffeurNoms.length} chauffeur(s), ${tournees.length} tournee(s)\n` +
      `Le fichier va etre envoye dans la conversation.`,
  };
}
