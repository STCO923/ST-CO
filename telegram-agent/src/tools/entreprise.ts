import { supabase } from '../supabase';
import { ToolDefinition, ToolResult, log } from '../types';

export const definitions: ToolDefinition[] = [
  {
    name: 'get_entreprise',
    description: 'Recupere les informations de l\'entreprise (nom, adresse, SIRET, TVA, etc.).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'modifier_entreprise',
    description: 'Modifie les informations de l\'entreprise.',
    input_schema: {
      type: 'object',
      properties: {
        nom: { type: 'string' },
        adresse: { type: 'string' },
        ville: { type: 'string' },
        code_postal: { type: 'string' },
        pays: { type: 'string' },
        telephone: { type: 'string' },
        email: { type: 'string' },
        siret: { type: 'string' },
        tva_intra: { type: 'string' },
        tva: { type: 'number', description: 'Taux TVA par defaut en % (ex: 20)' },
        iban: { type: 'string' },
        bic: { type: 'string' },
        site: { type: 'string', description: 'Site web' },
        mentions: { type: 'string', description: 'Mentions legales factures' },
        taux_charges_patronales: {
          type: 'number',
          description: 'Taux de charges patronales en % (ex: 82). S\'applique aux salaries uniquement. Cout reel = net + X% charges.',
        },
        charges_fixes_mensuelles: {
          type: 'number',
          description: 'Charges fixes mensuelles en EUR',
        },
      },
    },
  },
  {
    name: 'get_penalites_config',
    description: 'Liste les motifs de penalites configurables et leur ordre.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'modifier_penalite_config',
    description: 'Ajoute ou modifie un motif de penalite.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID existant (pour modification) ou omis (pour creation)' },
        motif: { type: 'string', description: 'Libelle du motif' },
        ordre: { type: 'number', description: 'Ordre d\'affichage' },
      },
      required: ['motif'],
    },
  },
  {
    name: 'supprimer_penalite_config',
    description: 'Supprime un motif de penalite.',
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
      case 'get_entreprise': return await getEntreprise(companyId);
      case 'modifier_entreprise': return await modifierEntreprise(companyId, input);
      case 'get_penalites_config': return await getPenalitesConfig(companyId);
      case 'modifier_penalite_config': return await modifierPenaliteConfig(companyId, input);
      case 'supprimer_penalite_config': return await supprimerPenaliteConfig(companyId, input);
      default: return { content: `Tool inconnu: ${toolName}`, is_error: true };
    }
  } catch (err) {
    log('error', 'entreprise tool error', { toolName, error: String(err) });
    return { content: 'Erreur lors du traitement.', is_error: true };
  }
}

async function getEntreprise(companyId: string): Promise<ToolResult> {
  const { data, error } = await supabase.from('entreprise').select('*').eq('company_id', companyId).single();
  if (error || !data) return { content: 'Aucune information entreprise configuree.' };

  // Convert coefficient_salarie (1.82) to taux de charges (82%)
  const record = data as Record<string, unknown>;
  const coef = record.coefficient_salarie as number | null;
  const tauxCharges = coef != null ? Math.round((coef - 1) * 100) : null;

  const displayMap: Record<string, string> = {
    nom: 'Nom',
    adresse: 'Adresse',
    ville: 'Ville',
    code_postal: 'Code postal',
    pays: 'Pays',
    tel: 'Telephone',
    email: 'Email',
    siret: 'SIRET',
    tva_intra: 'TVA intra.',
    tva: 'Taux TVA',
    iban: 'IBAN',
    bic: 'BIC',
    site: 'Site web',
    mentions: 'Mentions factures',
    charges_fixes_mensuelles: 'Charges fixes/mois',
  };

  const lines: string[] = [];
  for (const [dbKey, label] of Object.entries(displayMap)) {
    const val = record[dbKey];
    if (val != null && val !== '') {
      lines.push(`- ${label}: ${dbKey === 'tva' ? `${val}%` : dbKey === 'charges_fixes_mensuelles' ? `${val} EUR` : val}`);
    }
  }
  if (tauxCharges != null) {
    lines.push(`- Taux charges patronales: ${tauxCharges}% (cout reel salarie = net x ${coef?.toFixed(2)})`);
  }

  return { content: `Informations entreprise:\n${lines.join('\n')}` };
}

async function modifierEntreprise(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const updates: Record<string, unknown> = {};
  for (const k of ['nom', 'adresse', 'ville', 'code_postal', 'pays', 'telephone', 'email', 'siret', 'tva_intra', 'tva', 'iban', 'bic', 'site', 'mentions', 'charges_fixes_mensuelles']) {
    if (input[k] !== undefined) updates[k] = input[k];
  }
  // Map telephone → tel (field name in DB)
  if (input.telephone !== undefined) { updates.tel = input.telephone; delete updates.telephone; }

  // Convert taux_charges_patronales (%) to coefficient_salarie (1 + %/100)
  if (input.taux_charges_patronales !== undefined) {
    const taux = input.taux_charges_patronales as number;
    updates.coefficient_salarie = Math.max(1, 1 + taux / 100);
  }

  if (Object.keys(updates).length === 0) return { content: 'Aucun champ a modifier.', is_error: true };
  updates.company_id = companyId;
  const { error } = await supabase.from('entreprise').upsert(updates, { onConflict: 'company_id' });
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };

  const details: string[] = [];
  if (input.taux_charges_patronales !== undefined) {
    details.push(`Taux charges patronales: ${input.taux_charges_patronales}% (coefficient: ${updates.coefficient_salarie})`);
  }
  for (const [k, v] of Object.entries(updates)) {
    if (k !== 'company_id' && k !== 'coefficient_salarie') details.push(`${k}: ${v}`);
  }
  return { content: `Parametres entreprise mis a jour:\n${details.map(d => `- ${d}`).join('\n')}` };
}

async function getPenalitesConfig(companyId: string): Promise<ToolResult> {
  const { data, error } = await supabase.from('penalites_config').select('id, motif, ordre').eq('company_id', companyId).order('ordre');
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  if (!data || data.length === 0) return { content: 'Aucun motif de penalite configure.' };
  const lines = data.map(p => `${p.ordre}. ${p.motif} (ID: ${p.id})`);
  return { content: `Motifs de penalites:\n${lines.join('\n')}` };
}

async function modifierPenaliteConfig(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  if (input.id) {
    const { error } = await supabase.from('penalites_config').update({ motif: input.motif, ordre: input.ordre }).eq('id', input.id as string).eq('company_id', companyId);
    if (error) return { content: `Erreur: ${error.message}`, is_error: true };
    return { content: `Motif penalite ${input.id} modifie: ${input.motif}` };
  }
  const { data, error } = await supabase.from('penalites_config').insert({ company_id: companyId, motif: input.motif, ordre: input.ordre ?? 0 }).select('id').single();
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Motif penalite cree: ${input.motif} (ID: ${data.id})` };
}

async function supprimerPenaliteConfig(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const { error } = await supabase.from('penalites_config').delete().eq('id', input.id as string).eq('company_id', companyId);
  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  return { content: `Motif penalite ${input.id} supprime.` };
}
