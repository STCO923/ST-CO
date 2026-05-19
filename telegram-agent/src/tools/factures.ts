import { supabase } from '../supabase';
import { ToolDefinition, ToolResult, log } from '../types';

export const definitions: ToolDefinition[] = [
  {
    name: 'get_factures',
    description: 'Liste les factures. Peut filtrer par statut (en_attente, payee, impayee) ou par client.',
    input_schema: {
      type: 'object',
      properties: {
        statut: { type: 'string', description: 'Filtrer par statut' },
        client_nom: { type: 'string', description: 'Filtrer par client' },
        limit: { type: 'number', description: 'Nombre max de resultats (defaut: 20)' },
      },
    },
  },
  {
    name: 'generer_facture',
    description:
      'Genere une facture pour un client sur une periode. Calcule le montant a partir des tournees.',
    input_schema: {
      type: 'object',
      properties: {
        client_nom: { type: 'string', description: 'Nom du client' },
        periode_debut: { type: 'string', description: 'Date debut YYYY-MM-DD' },
        periode_fin: { type: 'string', description: 'Date fin YYYY-MM-DD' },
      },
      required: ['client_nom', 'periode_debut', 'periode_fin'],
    },
  },
  {
    name: 'modifier_facture_statut',
    description: 'Change le statut d\'une facture (payee, impayee, annulee).',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID de la facture' },
        statut: { type: 'string', description: 'Nouveau statut' },
      },
      required: ['id', 'statut'],
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
      case 'get_factures': return await getFactures(companyId, input);
      case 'generer_facture': return await genererFacture(companyId, input);
      case 'modifier_facture_statut': return await modifierFactureStatut(companyId, input);
      default: return { content: `Tool inconnu: ${toolName}`, is_error: true };
    }
  } catch (err) {
    log('error', 'factures tool error', { toolName, error: String(err) });
    return { content: 'Erreur lors du traitement.', is_error: true };
  }
}

async function getFactures(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  let query = supabase
    .from('factures')
    .select('id, numero, client_nom, periode_debut, periode_fin, montant_ht, tva, montant_ttc, statut')
    .eq('company_id', companyId);

  if (input.statut) query = query.eq('statut', input.statut as string);
  if (input.client_nom) query = query.ilike('client_nom', `%${input.client_nom}%`);

  const limit = (input.limit as number) ?? 20;
  const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);

  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  if (!data || data.length === 0) return { content: 'Aucune facture trouvee.' };

  const lines = data.map(
    (f) =>
      `- #${f.numero ?? f.id} | ${f.client_nom} | ${f.periode_debut} -> ${f.periode_fin} | ` +
      `${f.montant_ttc ?? '?'} EUR TTC | ${f.statut}`
  );
  return { content: `${data.length} facture(s):\n${lines.join('\n')}` };
}

async function genererFacture(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const clientNom = input.client_nom as string;
  const debut = input.periode_debut as string;
  const fin = input.periode_fin as string;

  // Get client tarif
  const { data: clientData } = await supabase
    .from('clients')
    .select('tarif')
    .eq('company_id', companyId)
    .ilike('nom', clientNom)
    .single();

  const tarif = clientData?.tarif ?? 0;

  // Count tournees in period
  const { data: tournees, error: tError } = await supabase
    .from('tournees')
    .select('id')
    .eq('company_id', companyId)
    .ilike('client_nom', clientNom)
    .gte('date', debut)
    .lte('date', fin);

  if (tError) return { content: `Erreur: ${tError.message}`, is_error: true };

  const nbTournees = tournees?.length ?? 0;
  const montantHt = nbTournees * tarif;
  const tva = montantHt * 0.2;
  const montantTtc = montantHt + tva;

  // Generate numero
  const numero = `F-${Date.now().toString(36).toUpperCase()}`;

  const { data, error } = await supabase
    .from('factures')
    .insert({
      company_id: companyId,
      numero,
      client_nom: clientNom,
      periode_debut: debut,
      periode_fin: fin,
      montant_ht: montantHt,
      tva,
      montant_ttc: montantTtc,
      statut: 'en_attente',
    })
    .select('id, numero')
    .single();

  if (error) return { content: `Erreur: ${error.message}`, is_error: true };

  return {
    content:
      `Facture generee: #${data.numero}\n` +
      `- Client: ${clientNom}\n` +
      `- Periode: ${debut} -> ${fin}\n` +
      `- ${nbTournees} tournee(s) x ${tarif} EUR = ${montantHt.toFixed(2)} EUR HT\n` +
      `- TVA 20%: ${tva.toFixed(2)} EUR\n` +
      `- Total TTC: ${montantTtc.toFixed(2)} EUR`,
  };
}

async function modifierFactureStatut(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const { error } = await supabase
    .from('factures')
    .update({ statut: input.statut })
    .eq('id', input.id as string)
    .eq('company_id', companyId);

  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Facture ${input.id} mise a jour: statut = ${input.statut}` };
}
