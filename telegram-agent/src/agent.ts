import { ToolDefinition, ToolResult, ToolModule, log } from './types';

// Import all tool modules
import * as tournees from './tools/tournees';
import * as chauffeurs from './tools/chauffeurs';
import * as clients from './tools/clients';
import * as vehicules from './tools/vehicules';
import * as factures from './tools/factures';
import * as absences from './tools/absences';
import * as planning from './tools/planning';
import * as tracking from './tools/tracking';
import * as messaging from './tools/messaging';
import * as rh from './tools/rh';
import * as gazole from './tools/gazole';
import * as amendes from './tools/amendes';
import * as monmarche from './tools/monmarche';
import * as sheets from './tools/sheets';
import * as whatsapp from './tools/whatsapp';
import * as exportTools from './tools/export';
import * as entreprise from './tools/entreprise';
import * as dashboard from './tools/dashboard';
import * as contrats from './tools/contrats';
import * as fichesPaie from './tools/fiches_paie';
import * as commissionnaires from './tools/commissionnaires';
import * as decompte from './tools/decompte';
import * as rentabilite from './tools/rentabilite';

// === Tool Registry ===

const toolModules: ToolModule[] = [
  tournees, chauffeurs, clients, vehicules, factures, absences,
  planning, tracking, messaging, rh, gazole, amendes, monmarche,
  sheets, whatsapp, exportTools, entreprise, dashboard, contrats,
  fichesPaie, commissionnaires, decompte, rentabilite,
];

const ALL_TOOLS: ToolDefinition[] = toolModules.flatMap((m) => m.definitions);

const toolNameToModule = new Map<string, ToolModule>();
for (const mod of toolModules) {
  for (const def of mod.definitions) {
    toolNameToModule.set(def.name, mod);
  }
}

// === LLM Provider Config ===
// GROQ = gratuit (défaut), ANTHROPIC = payant (meilleur)

const LLM_PROVIDER = (process.env.LLM_PROVIDER ?? 'groq').toLowerCase();
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001';

// === System Prompt ===

const SYSTEM_PROMPT = `Tu es l'assistant IA d'Optimum Trans, une plateforme de gestion de transport.
Tu aides les gestionnaires de flotte a consulter et gerer leurs operations via Telegram.
Tu es un EXPERT metier du transport — tu connais les besoins operationnels et tu anticipes.

REGLES:
- Reponds TOUJOURS en francais.
- Sois concis et direct (messages Telegram = petits ecrans).
- Utilise les outils disponibles pour repondre avec des donnees reelles.
- Ne fabrique JAMAIS de donnees. Si tu n'as pas l'info, dis-le.
- Formate les montants en EUR (ex: 1 250,00 EUR).
- Formate les dates en format francais (ex: lundi 9 avril 2026).
- Pour les listes, utilise des tirets simples.
- Maximum 4000 caracteres par reponse.
- Si l'utilisateur pose une question hors-sujet, redirige poliment vers le transport/logistique.

INTELLIGENCE METIER — C'EST CRITIQUE:
Quand l'utilisateur demande une action, tu dois REFLECHIR comme un gestionnaire de flotte.
Tu ne fais JAMAIS mot pour mot ce qu'on te dit. Tu reflechis, tu verifies, tu completes.
Avant d'executer, verifie ce qui manque et ce qui est coherent.

POUR CHAQUE TYPE D'ENTITE, voici les infos a demander si manquantes:

TOURNEE ("ajoute X sur Y / mets X chez Y"):
   - Creneau AM ou PM ? Heure de debut ?
   - Vehicule ? (cherche le vehicule habituel du chauffeur via get_vehicules)
   - IMPORTANT — TYPE DE PAIEMENT DU CLIENT:
     Chaque client a un type_paiement (affiche dans get_clients): "fixe", "point" ou "heure".
     * Si type_paiement = "point" → DEMANDE OBLIGATOIRE: "Combien de points estimes ?" (nb_points_estime)
     * Si type_paiement = "heure" → DEMANDE OBLIGATOIRE: "Combien d'heures estimees ?" (nb_heures_estime)
     * Si type_paiement = "fixe" → pas besoin de demander points/heures
     Exemple: "Le client Vinted est au point. Combien de points estimes pour cette tournee ?"
   Verifie: le chauffeur existe et est actif, le client existe, pas de conflit (deja une tournee ce jour, en absence).

CHAUFFEUR ("cree le chauffeur X / ajoute le chauffeur X"):
   - Type: salarie ou sous-traitant ?
   - Tarif journalier ?
   - Numero de telephone ?
   - Email ?
   Verifie: le chauffeur n'existe pas deja (get_chauffeurs avec ce nom).

CLIENT ("ajoute le client X / nouveau client X"):
   - Tarif par tournee ?
   - Nom du contact ?
   - Email ?
   - Adresse ?
   Verifie: le client n'existe pas deja (get_clients avec ce nom).

VEHICULE (modification/affectation):
   - Immatriculation ?
   - Marque et modele ?
   - Kilometrage actuel ?

ABSENCE ("X est absent / X est malade"):
   - Date de debut et date de fin ?
   - Type: maladie, conge, accident, absence_injustifiee, autre ?
   Verifie: le chauffeur existe, pas de tournees deja planifiees sur cette periode (previens si conflit).

FACTURE ("facture pour X"):
   - Periode (debut et fin) ?
   Verifie: le client existe, il y a bien des tournees sur la periode.

AMENDE / GAZOLE / AVANCE:
   - Demande tous les details necessaires (montant, date, chauffeur, motif...).

VERIFICATION AUTOMATIQUE (pour TOUTE action):
   Utilise les outils de lecture AVANT toute ecriture pour verifier la coherence.
   Si tu detectes un probleme (doublon, conflit, chauffeur inexistant), PREVIENS l'utilisateur.

SUGGESTIONS INTELLIGENTES:
   Quand tu as les infos dans la base, propose des valeurs par defaut:
   - "Hichem est habituellement sur le Renault AB-123-CD, je mets ce vehicule ?"
   - "Vinted a en moyenne 45 points par tournee, je mets 45 ?"
   - "Muhammad Junaid — je mets en salarie ou sous-traitant ?"

RESUME COMPLET AVANT CONFIRMATION:
   Montre TOUJOURS un resume avec TOUS les champs avant d'executer:
   "Je vais creer ce chauffeur:
   - Nom: Muhammad Junaid
   - Type: salarie
   - Tarif: 150 EUR/jour
   - Tel: 06 12 34 56 78
   - Email: m.junaid@email.com
   Je confirme ?"

SECURITE:
- JAMAIS d'action d'ecriture (creation, modification, suppression) sans confirmation explicite de l'utilisateur.
- L'utilisateur doit repondre "oui", "ok", "confirme" ou equivalent AVANT que tu executes.
- Si l'utilisateur dit "non" ou modifie un detail, ajuste et re-confirme.

Date du jour: ${new Date().toISOString().split('T')[0]}`;

// === Conversation History (OpenAI-compatible format, works for both providers) ===

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

interface ConversationState {
  history: ChatMessage[];
  lastActivity: number;
}

const conversations = new Map<number, ConversationState>();
const CONVERSATION_TTL = 30 * 60 * 1000;
const MAX_HISTORY = 20;

function getConversation(userId: number): ChatMessage[] {
  const state = conversations.get(userId);
  if (state && Date.now() - state.lastActivity < CONVERSATION_TTL) {
    return state.history;
  }
  return [];
}

function saveConversation(userId: number, history: ChatMessage[]): void {
  const trimmed =
    history.length > MAX_HISTORY
      ? history.slice(history.length - MAX_HISTORY)
      : history;
  conversations.set(userId, { history: trimmed, lastActivity: Date.now() });
}

export function clearConversation(userId: number): void {
  conversations.delete(userId);
}

setInterval(() => {
  const now = Date.now();
  for (const [userId, state] of conversations) {
    if (now - state.lastActivity > CONVERSATION_TTL) {
      conversations.delete(userId);
    }
  }
}, 5 * 60 * 1000);

// === Tool Routing (select relevant tools per message) ===

const TOOL_CATEGORIES: Record<string, string[]> = {
  planning: ['get_planning', 'get_stats', 'creer_planning_semaine', 'dupliquer_semaine', 'dupliquer_chauffeur_semaines', 'audit_planning_semaine'],
  tournees: ['get_tournees', 'search_tournees', 'creer_tournee', 'modifier_tournee', 'supprimer_tournee', 'valider_tournee', 'penaliser_tournee', 'reset_validation_tournee', 'supprimer_tournees_semaine', 'get_validations_penalites'],
  chauffeurs: ['get_chauffeurs', 'creer_chauffeur', 'modifier_chauffeur', 'supprimer_chauffeur'],
  clients: ['get_clients', 'creer_client', 'modifier_client', 'supprimer_client'],
  vehicules: ['get_vehicules', 'creer_vehicule', 'modifier_vehicule', 'supprimer_vehicule', 'changer_statut_vehicule', 'affecter_vehicule', 'get_maintenance', 'creer_maintenance', 'supprimer_maintenance'],
  factures: ['get_factures', 'generer_facture', 'modifier_facture_statut'],
  absences: ['get_absences', 'creer_absence', 'modifier_absence', 'supprimer_absence', 'approuver_absence', 'refuser_absence'],
  tracking: ['get_driver_location'],
  messaging: ['envoyer_message', 'get_messages'],
  whatsapp: ['envoyer_planning_whatsapp', 'envoyer_planning_whatsapp_tous'],
  rh: ['get_avances', 'modifier_avance', 'get_contrats', 'creer_contrat', 'supprimer_contrat', 'get_fiches_paie', 'creer_fiche_paie', 'supprimer_fiche_paie'],
  gazole: ['get_pleins_gazole', 'ajouter_plein', 'modifier_plein', 'supprimer_plein'],
  amendes: ['get_amendes', 'ajouter_amende', 'modifier_amende', 'supprimer_amende', 'identifier_chauffeur_vehicule'],
  monmarche: ['get_shifts', 'creer_shift', 'assigner_chauffeur_shift', 'modifier_shift', 'sync_shifts_to_planning', 'import_google_sheet'],
  finance: ['calculer_salaire_chauffeur', 'calculer_salaires_tous', 'calculer_rentabilite_client', 'calculer_rentabilite_tous_clients'],
  entreprise: ['get_entreprise', 'modifier_entreprise', 'get_penalites_config', 'modifier_penalite_config', 'supprimer_penalite_config'],
  dashboard: ['get_dashboard', 'get_alertes'],
  commissionnaires: ['get_commissionnaires', 'creer_commissionnaire', 'modifier_commissionnaire', 'supprimer_commissionnaire'],
  export: ['export_planning_excel'],
};

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  planning: ['planning', 'semaine', 'dupliqu', 'audit', 'bilan', 'resume', 'probleme'],
  tournees: ['tournee', 'tournée', 'livraison', 'valider', 'penali', 'saisie', 'point'],
  chauffeurs: ['chauffeur', 'conducteur', 'driver', 'salari', 'sous-traitant'],
  clients: ['client', 'tarif'],
  vehicules: ['vehicule', 'véhicule', 'camion', 'immatriculation', 'maintenance', 'ct ', 'assurance'],
  factures: ['facture', 'facturation', 'impayee', 'impayée'],
  absences: ['absence', 'absent', 'conge', 'congé', 'maladie', 'arret', 'arrêt', 'approuv', 'refus'],
  tracking: ['position', 'gps', 'localisation', 'ou est', 'où est', 'situe'],
  messaging: ['message', 'envoyer', 'dire a', 'dire à', 'prevenir', 'prévenir'],
  whatsapp: ['whatsapp', 'wa '],
  rh: ['salaire', 'avance', 'prime', 'contrat', 'fiche de paie', 'paie', 'paye'],
  gazole: ['gazole', 'gasoil', 'carburant', 'plein', 'essence', 'fuel'],
  amendes: ['amende', 'infraction', 'pv ', 'contravention', 'conduisait', 'qui conduisait'],
  monmarche: ['monmarche', 'mon marche', 'mon marché', 'shift', 'zone'],
  finance: ['ca ', 'chiffre', 'marge', 'rentab', 'cout', 'coût', 'decompte', 'décompte', 'combien je dois', 'verser', 'payer'],
  entreprise: ['entreprise', 'parametre', 'paramètre', 'taux', 'charge', 'siret', 'tva'],
  dashboard: ['dashboard', 'tableau de bord', 'kpi', 'alerte', 'resume general', 'résumé général'],
  commissionnaires: ['commissionnaire'],
  export: ['excel', 'export', 'telecharger', 'télécharger'],
};

// Always include these base tools
const BASE_TOOLS = ['get_planning', 'get_tournees', 'get_chauffeurs', 'get_clients', 'get_vehicules', 'get_dashboard'];

function selectToolsForMessage(message: string): ToolDefinition[] {
  const msg = message.toLowerCase();
  const selectedNames = new Set<string>(BASE_TOOLS);

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => msg.includes(kw))) {
      const toolNames = TOOL_CATEGORIES[category] ?? [];
      for (const name of toolNames) selectedNames.add(name);
    }
  }

  // If nothing specific matched, include common categories
  if (selectedNames.size <= BASE_TOOLS.length) {
    for (const name of TOOL_CATEGORIES.tournees) selectedNames.add(name);
    for (const name of TOOL_CATEGORIES.planning) selectedNames.add(name);
    for (const name of TOOL_CATEGORIES.absences) selectedNames.add(name);
    for (const name of TOOL_CATEGORIES.dashboard) selectedNames.add(name);
  }

  return ALL_TOOLS.filter((t) => selectedNames.has(t.name));
}

// === Tool Execution ===

async function executeTool(
  companyId: string,
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<ToolResult> {
  const mod = toolNameToModule.get(toolName);
  if (!mod) return { content: `Tool inconnu: ${toolName}`, is_error: true };
  log('info', 'Executing tool', { toolName, companyId });
  return mod.handleTool(companyId, toolName, toolInput);
}

// === OpenAI-format tools (used by both Groq and Anthropic-via-conversion) ===

function getOpenAITools(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

// === Groq Provider (FREE) ===

interface GroqChoice {
  message: {
    role: string;
    content: string | null;
    tool_calls?: Array<{
      id: string;
      type: string;
      function: { name: string; arguments: string };
    }>;
  };
  finish_reason: string;
}

async function callGroq(messages: ChatMessage[], tools: ToolDefinition[]): Promise<{
  text: string | null;
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
  finishReason: string;
  rawMessage: ChatMessage;
}> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      tools: getOpenAITools(tools),
      tool_choice: 'auto',
      max_tokens: 1024,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    log('error', 'Groq API error', { status: res.status, body: err });
    throw new Error(`Groq API error: ${res.status}`);
  }

  const data = (await res.json()) as { choices: GroqChoice[] };
  const choice = data.choices[0];
  const msg = choice.message;

  const toolCalls = (msg.tool_calls ?? []).map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: tc.function.arguments,
  }));

  return {
    text: msg.content,
    toolCalls,
    finishReason: choice.finish_reason,
    rawMessage: {
      role: 'assistant',
      content: msg.content,
      tool_calls: msg.tool_calls as ChatMessage['tool_calls'],
    },
  };
}

// === Anthropic Provider (PAID, better quality) ===

async function callAnthropic(messages: ChatMessage[], tools: ToolDefinition[]): Promise<{
  text: string | null;
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
  finishReason: string;
  rawMessage: ChatMessage;
}> {
  // Convert OpenAI messages to Anthropic format
  const anthropicMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
      if (m.role === 'tool') {
        return {
          role: 'user' as const,
          content: [
            {
              type: 'tool_result' as const,
              tool_use_id: m.tool_call_id ?? '',
              content: m.content ?? '',
            },
          ],
        };
      }
      if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
        const content: Array<Record<string, unknown>> = [];
        if (m.content) content.push({ type: 'text', text: m.content });
        for (const tc of m.tool_calls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments),
          });
        }
        return { role: 'assistant' as const, content };
      }
      return { role: m.role as 'user' | 'assistant', content: m.content ?? '' };
    });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      })),
      messages: anthropicMessages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    log('error', 'Anthropic API error', { status: res.status, body: err });
    throw new Error(`Anthropic API error: ${res.status}`);
  }

  const data = (await res.json()) as {
    content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
    stop_reason: string;
  };

  const text = data.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n') || null;
  const toolCalls = data.content
    .filter((b) => b.type === 'tool_use')
    .map((b) => ({
      id: b.id ?? `tool_${Date.now()}`,
      name: b.name ?? '',
      arguments: JSON.stringify(b.input ?? {}),
    }));

  // Convert back to OpenAI format for history
  const rawMessage: ChatMessage = {
    role: 'assistant',
    content: text,
    tool_calls: toolCalls.length > 0
      ? toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.arguments },
        }))
      : undefined,
  };

  return { text, toolCalls, finishReason: data.stop_reason, rawMessage };
}

// === Main Agent Function ===

export async function processMessage(
  companyId: string,
  userId: number,
  userMessage: string
): Promise<string> {
  const history = getConversation(userId);
  history.push({ role: 'user', content: userMessage });

  const useAnthropic = LLM_PROVIDER === 'anthropic' && ANTHROPIC_API_KEY;
  if (!useAnthropic && !GROQ_API_KEY) {
    throw new Error('Aucune cle API LLM configuree. Ajoutez GROQ_API_KEY (gratuit) ou ANTHROPIC_API_KEY.');
  }

  const callLLM = useAnthropic ? callAnthropic : callGroq;
  const selectedTools = selectToolsForMessage(userMessage);
  log('info', 'Tools selected', { count: selectedTools.length, names: selectedTools.map(t => t.name) });

  let iterations = 0;
  const MAX_ITERATIONS = 5;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await callLLM(history, selectedTools);
    history.push(response.rawMessage);

    // No tool calls → return text
    if (response.toolCalls.length === 0) {
      const finalText = response.text ?? 'Je n\'ai pas pu traiter votre demande.';
      saveConversation(userId, history);
      return finalText;
    }

    // Execute tools
    for (const tc of response.toolCalls) {
      let input: Record<string, unknown>;
      try {
        input = JSON.parse(tc.arguments);
      } catch {
        input = {};
      }

      const result = await executeTool(companyId, tc.name, input);

      history.push({
        role: 'tool',
        tool_call_id: tc.id,
        name: tc.name,
        content: result.content,
      });
    }
  }

  saveConversation(userId, history);
  return 'Desole, la requete est trop complexe. Essayez de reformuler plus simplement.';
}
