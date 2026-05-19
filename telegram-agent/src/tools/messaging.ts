import { supabase } from '../supabase';
import { ToolDefinition, ToolResult, log } from '../types';

export const definitions: ToolDefinition[] = [
  {
    name: 'envoyer_message',
    description:
      'Envoie un message a un chauffeur ou en broadcast a tous les chauffeurs.',
    input_schema: {
      type: 'object',
      properties: {
        chauffeur_nom: {
          type: 'string',
          description: 'Nom du chauffeur destinataire. Omis = broadcast a tous.',
        },
        content: { type: 'string', description: 'Contenu du message (max 2000 chars)' },
      },
      required: ['content'],
    },
  },
  {
    name: 'get_messages',
    description: 'Recupere les messages recents avec un chauffeur.',
    input_schema: {
      type: 'object',
      properties: {
        chauffeur_nom: { type: 'string', description: 'Nom du chauffeur' },
        limit: { type: 'number', description: 'Nombre de messages (defaut: 10)' },
      },
      required: ['chauffeur_nom'],
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
      case 'envoyer_message': return await envoyerMessage(companyId, input);
      case 'get_messages': return await getMessages(companyId, input);
      default: return { content: `Tool inconnu: ${toolName}`, is_error: true };
    }
  } catch (err) {
    log('error', 'messaging tool error', { toolName, error: String(err) });
    return { content: 'Erreur lors du traitement.', is_error: true };
  }
}

async function envoyerMessage(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const content = (input.content as string).slice(0, 2000);
  const isBroadcast = !input.chauffeur_nom;
  const chauffeurName = isBroadcast ? '_BROADCAST_' : (input.chauffeur_nom as string);

  const { error } = await supabase.from('messages').insert({
    company_id: companyId,
    sender_role: 'admin',
    sender_name: 'Agent IA',
    chauffeur_name: chauffeurName,
    content,
    is_broadcast: isBroadcast,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });

  if (error) return { content: `Erreur: ${error.message}`, is_error: true };

  return {
    content: isBroadcast
      ? `Message broadcast envoye a tous les chauffeurs.`
      : `Message envoye a ${input.chauffeur_nom}.`,
  };
}

async function getMessages(companyId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const chauffeurNom = input.chauffeur_nom as string;
  const limit = (input.limit as number) ?? 10;

  const { data, error } = await supabase
    .from('messages')
    .select('sender_role, sender_name, content, created_at')
    .eq('company_id', companyId)
    .eq('chauffeur_name', chauffeurNom)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return { content: `Erreur: ${error.message}`, is_error: true };
  if (!data || data.length === 0) return { content: `Aucun message avec ${chauffeurNom}.` };

  const lines = data.reverse().map(
    (m) => `[${m.created_at}] ${m.sender_name} (${m.sender_role}): ${m.content}`
  );
  return { content: `Messages avec ${chauffeurNom}:\n${lines.join('\n')}` };
}
