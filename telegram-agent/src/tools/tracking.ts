import { supabase } from '../supabase';
import { ToolDefinition, ToolResult, log } from '../types';

export const definitions: ToolDefinition[] = [
  {
    name: 'get_driver_location',
    description:
      'Recupere la position d\'un ou tous les chauffeurs avec l\'adresse complete (rue, ville). ' +
      'Retourne aussi vitesse, statut et fraicheur de la position.',
    input_schema: {
      type: 'object',
      properties: {
        chauffeur_nom: {
          type: 'string',
          description: 'Nom du chauffeur. Si omis, retourne tous les chauffeurs.',
        },
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
    if (toolName === 'get_driver_location') {
      return await getDriverLocation(companyId, input);
    }
    return { content: `Tool inconnu: ${toolName}`, is_error: true };
  } catch (err) {
    log('error', 'tracking tool error', { toolName, error: String(err) });
    return { content: 'Erreur lors du traitement.', is_error: true };
  }
}

// Reverse geocoding via Nominatim (OpenStreetMap, free, no API key)
async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=fr&zoom=18`,
      { headers: { 'User-Agent': 'OptimumTransBot/1.0' } }
    );
    if (!res.ok) return `${lat}, ${lon}`;
    const data = (await res.json()) as {
      address?: {
        road?: string;
        house_number?: string;
        city?: string;
        town?: string;
        village?: string;
        postcode?: string;
        suburb?: string;
      };
      display_name?: string;
    };
    if (!data.address) return `${lat}, ${lon}`;

    const a = data.address;
    const rue = [a.house_number, a.road].filter(Boolean).join(' ');
    const ville = a.city ?? a.town ?? a.village ?? '';
    const cp = a.postcode ?? '';
    const quartier = a.suburb ?? '';

    const parts = [rue, quartier, `${cp} ${ville}`.trim()].filter(Boolean);
    return parts.join(', ') || data.display_name || `${lat}, ${lon}`;
  } catch {
    return `${lat}, ${lon}`;
  }
}

async function getDriverLocation(
  companyId: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  let query = supabase
    .from('driver_locations')
    .select('chauffeur_nom, latitude, longitude, vitesse, statut, updated_at')
    .eq('company_id', companyId);

  if (input.chauffeur_nom) {
    query = query.ilike('chauffeur_nom', `%${input.chauffeur_nom}%`);
  }

  const { data, error } = await query.order('updated_at', { ascending: false });

  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  if (!data || data.length === 0)
    return { content: 'Aucune position GPS trouvee.' };

  const now = new Date();

  // Reverse geocode all positions in parallel
  const locations = await Promise.all(
    data.map(async (d) => {
      const updatedAt = new Date(d.updated_at);
      const diffMin = Math.round((now.getTime() - updatedAt.getTime()) / 60000);
      const freshness = diffMin < 2 ? 'en direct' : diffMin < 60 ? `il y a ${diffMin} min` : `il y a ${Math.round(diffMin / 60)}h`;
      const adresse = await reverseGeocode(d.latitude, d.longitude);

      return (
        `- ${d.chauffeur_nom}: ${d.statut ?? 'inconnu'}\n` +
        `  ${adresse}\n` +
        `  Vitesse: ${d.vitesse ?? 0} km/h | ${freshness}`
      );
    })
  );

  return { content: `Position(s):\n\n${locations.join('\n\n')}` };
}
