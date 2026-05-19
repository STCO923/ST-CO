import { supabase } from '../supabase';
import { ToolDefinition, ToolResult, log } from '../types';

export const definitions: ToolDefinition[] = [
  {
    name: 'import_google_sheet',
    description:
      'Importe les besoins Mon Marche depuis un Google Sheet. ' +
      'Le sheet doit etre partage avec le compte de service Google. ' +
      'Chaque ligne = une zone, colonnes = jours (lun AM/PM, mar AM/PM, etc.) avec heures debut/fin.',
    input_schema: {
      type: 'object',
      properties: {
        spreadsheet_id: {
          type: 'string',
          description: 'ID du Google Spreadsheet (la partie entre /d/ et /edit dans l\'URL)',
        },
        sheet_name: {
          type: 'string',
          description: 'Nom exact de l\'onglet a importer (ex: "Semaine 17")',
        },
        semaine_debut: {
          type: 'string',
          description: 'Date du lundi de la semaine YYYY-MM-DD',
        },
      },
      required: ['spreadsheet_id', 'semaine_debut'],
    },
  },
];

export async function handleTool(
  companyId: string,
  toolName: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  try {
    if (toolName === 'import_google_sheet') {
      return await importSheet(companyId, input);
    }
    return { content: `Tool inconnu: ${toolName}`, is_error: true };
  } catch (err) {
    log('error', 'sheets tool error', { toolName, error: String(err) });
    return { content: `Erreur lors de l'import: ${String(err)}`, is_error: true };
  }
}

// Google Sheets API v4 — OAuth2 with service account
async function getAccessToken(credentials: ServiceAccountCredentials): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({
      iss: credentials.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  );

  // Sign JWT with RSA private key
  const crypto = await import('crypto');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(credentials.private_key, 'base64url');

  const jwt = `${header}.${payload}.${signature}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) {
    throw new Error(`Google OAuth error: ${await tokenRes.text()}`);
  }

  const tokenData = (await tokenRes.json()) as { access_token: string };
  return tokenData.access_token;
}

interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
}

interface SheetData {
  values?: string[][];
}

const JOURS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];

async function importSheet(
  companyId: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    return {
      content: 'Import Google Sheets non configure. La variable GOOGLE_SERVICE_ACCOUNT_JSON est manquante.',
      is_error: true,
    };
  }

  const credentials = JSON.parse(serviceAccountJson) as ServiceAccountCredentials;
  const spreadsheetId = input.spreadsheet_id as string;
  const sheetName = (input.sheet_name as string) ?? 'Sheet1';
  const semaineDebut = input.semaine_debut as string;

  // 1. Get OAuth2 token
  const accessToken = await getAccessToken(credentials);

  // 2. Fetch sheet data
  const range = encodeURIComponent(`${sheetName}!A1:Z100`);
  const sheetsUrl =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;

  const sheetRes = await fetch(sheetsUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!sheetRes.ok) {
    const errText = await sheetRes.text();
    log('error', 'Google Sheets API error', { status: sheetRes.status, body: errText });
    return {
      content: `Erreur Google Sheets: ${sheetRes.status}. Verifiez que le sheet est partage avec ${credentials.client_email}`,
      is_error: true,
    };
  }

  const sheetData = (await sheetRes.json()) as SheetData;
  const rows = sheetData.values;

  if (!rows || rows.length < 2) {
    return { content: 'Le sheet est vide ou ne contient que l\'en-tete.', is_error: true };
  }

  // 3. Parse rows into monmarche_shifts
  // Expected format: Zone | Lun AM debut | Lun AM fin | Lun PM debut | Lun PM fin | Mar AM debut | ...
  // Or simplified: Zone | Lun AM | Lun PM | Mar AM | Mar PM | ...
  const header = rows[0];
  const dataRows = rows.slice(1).filter((r) => r[0]?.trim());

  const shifts: Array<{
    company_id: string;
    semaine_debut: string;
    zone_nom: string;
    ordre: number;
    slots: Record<string, { chauffeur?: string; debut?: string; fin?: string }>;
  }> = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const zoneNom = row[0]?.trim();
    if (!zoneNom) continue;

    const slots: Record<string, { chauffeur?: string; debut?: string; fin?: string }> = {};

    // Try to map columns to slots based on header
    for (let col = 1; col < header.length; col++) {
      const headerVal = (header[col] ?? '').toLowerCase().trim();
      const cellVal = (row[col] ?? '').trim();
      if (!cellVal) continue;

      // Try to match header to jour_slot pattern
      for (let d = 0; d < JOURS.length; d++) {
        const jour = JOURS[d];
        const jourFull = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'][d];
        if (
          headerVal.includes(jour) ||
          headerVal.includes(jourFull)
        ) {
          const isAm = headerVal.includes('am') || headerVal.includes('matin');
          const isPm = headerVal.includes('pm') || headerVal.includes('aprem') || headerVal.includes('apres');
          const slotKey = `${jour}_${isAm ? 'am' : isPm ? 'pm' : 'am'}`;

          // Cell could be a time range "06:00-14:00" or just hours
          if (cellVal.includes('-')) {
            const [debut, fin] = cellVal.split('-').map((s) => s.trim());
            slots[slotKey] = { ...(slots[slotKey] ?? {}), debut, fin };
          } else {
            // Assume it's a start time
            slots[slotKey] = { ...(slots[slotKey] ?? {}), debut: cellVal };
          }
          break;
        }
      }
    }

    shifts.push({
      company_id: companyId,
      semaine_debut: semaineDebut,
      zone_nom: zoneNom,
      ordre: i,
      slots,
    });
  }

  if (shifts.length === 0) {
    return { content: 'Aucune donnee exploitable trouvee dans le sheet.', is_error: true };
  }

  // 4. Delete existing shifts for this week and insert new ones
  await supabase
    .from('monmarche_shifts')
    .delete()
    .eq('company_id', companyId)
    .eq('semaine_debut', semaineDebut);

  const { error } = await supabase.from('monmarche_shifts').insert(shifts);

  if (error) return { content: `Erreur insertion: ${error.message}`, is_error: true };

  log('info', 'Google Sheet imported', {
    companyId,
    semaineDebut,
    zones: shifts.length,
  });

  const zoneList = shifts.map((s) => `- ${s.zone_nom}`).join('\n');
  return {
    content:
      `Import reussi pour la semaine du ${semaineDebut}:\n` +
      `${shifts.length} zone(s) importee(s):\n${zoneList}\n\n` +
      `Les chauffeurs et vehicules ne sont pas encore assignes. ` +
      `Dites-moi quel chauffeur affecter a quelle zone et quel jour.`,
  };
}
