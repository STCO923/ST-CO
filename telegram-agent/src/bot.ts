import express from 'express';
import { TelegramUpdate, log } from './types';
import { resolveCompanyId, checkAddonAgent, activateCode, checkRateLimit } from './auth';
import { processMessage, clearConversation } from './agent';
import { transcribeVoice } from './transcription';
import { getPendingFile } from './tools/export';
import { startCron } from './cron';

// === Environment ===

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const PORT = parseInt(process.env.PORT || '3000', 10);

if (!TELEGRAM_BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN is required');
}

// === Telegram API Helpers ===

async function sendMessage(chatId: number, text: string): Promise<void> {
  // Telegram limit: 4096 chars per message
  const chunks = splitText(text, 4096);
  for (const chunk of chunks) {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: chunk,
          parse_mode: 'Markdown',
        }),
      }
    );

    // If Markdown fails, retry without parse_mode
    if (!res.ok) {
      await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: chunk,
          }),
        }
      );
    }
  }
}

function splitText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    // Try to split at newline
    let splitAt = remaining.lastIndexOf('\n', maxLen);
    if (splitAt < maxLen / 2) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  return chunks;
}

async function sendDocument(
  chatId: number,
  buffer: Buffer,
  filename: string,
  caption?: string
): Promise<void> {
  const formData = new FormData();
  formData.append('chat_id', chatId.toString());
  formData.append('document', new Blob([buffer]), filename);
  if (caption) formData.append('caption', caption.slice(0, 1024));

  await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`,
    { method: 'POST', body: formData }
  );
}

async function sendTyping(chatId: number): Promise<void> {
  await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendChatAction`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
    }
  ).catch(() => {});
}

// === Command Handlers ===

const WELCOME_MSG =
  'Bienvenue sur Optimum Trans !\n\n' +
  'Pour activer votre compte, envoyez votre code d\'activation.\n' +
  'Ce code vous a ete fourni par votre administrateur Optimum Trans.';

const HELP_MSG =
  'Commandes disponibles:\n' +
  '- /start - Demarrer / activer le bot\n' +
  '- /aide - Afficher cette aide\n' +
  '- /reset - Reinitialiser la conversation\n\n' +
  'Vous pouvez me poser des questions en langage naturel:\n' +
  '- "Quelles sont les tournees d\'aujourd\'hui ?"\n' +
  '- "Ou est Ahmed ?"\n' +
  '- "Liste les factures impayees"\n' +
  '- "Cree une tournee pour Karim demain matin chez Auchan"\n' +
  '- "Declare Ahmed en maladie du 10 au 15 avril"\n\n' +
  'Vous pouvez aussi envoyer un message vocal.';

// === Update Handler ===

async function handleUpdate(update: TelegramUpdate): Promise<void> {
  const message = update.message;
  if (!message) return;

  const chatId = message.chat.id;
  const userId = message.from?.id;
  if (!userId) return;

  const text = message.text?.trim() ?? '';
  const displayName = [message.from?.first_name, message.from?.last_name]
    .filter(Boolean)
    .join(' ');

  log('info', 'Incoming message', {
    userId,
    chatId,
    text: text.slice(0, 50),
    hasVoice: !!message.voice,
  });

  // /start command - always accessible
  if (text === '/start') {
    await sendMessage(chatId, WELCOME_MSG);
    return;
  }

  // Rate limit check
  if (!checkRateLimit(userId)) {
    await sendMessage(chatId, 'Trop de messages. Patientez 1 minute.');
    return;
  }

  // Auth check
  const companyId = await resolveCompanyId(userId);

  if (!companyId) {
    // Not authenticated - check if this is an activation code
    const codeCandidate = text.toUpperCase().trim();
    if (codeCandidate.length >= 4 && codeCandidate.length <= 12 && /^[A-Z0-9]+$/.test(codeCandidate)) {
      const result = await activateCode(userId, codeCandidate, displayName);
      if (result.success) {
        await sendMessage(
          chatId,
          `Compte active pour ${result.companyName} !\n\nVous pouvez maintenant poser vos questions. Tapez /aide pour voir les exemples.`
        );
      } else {
        await sendMessage(chatId, result.error ?? 'Code invalide.');
      }
      return;
    }

    await sendMessage(
      chatId,
      'Vous n\'etes pas encore active. Envoyez votre code d\'activation ou tapez /start.'
    );
    return;
  }

  // Addon check
  const hasAddon = await checkAddonAgent(companyId);
  if (!hasAddon) {
    await sendMessage(
      chatId,
      'L\'addon Agent IA n\'est pas active pour votre entreprise. Contactez votre administrateur Optimum Trans.'
    );
    return;
  }

  // /aide command
  if (text === '/aide' || text === '/help') {
    await sendMessage(chatId, HELP_MSG);
    return;
  }

  // /reset command
  if (text === '/reset') {
    clearConversation(userId);
    await sendMessage(chatId, 'Conversation reinitalisee.');
    return;
  }

  // Voice message
  if (message.voice) {
    await sendTyping(chatId);
    try {
      const transcript = await transcribeVoice(message.voice.file_id);
      if (!transcript || transcript.trim().length === 0) {
        await sendMessage(chatId, 'Je n\'ai pas pu transcrire le message vocal. Reessayez.');
        return;
      }
      log('info', 'Voice transcribed', { userId, text: transcript.slice(0, 50) });
      await processAndReply(chatId, userId, companyId, transcript);
    } catch (err) {
      log('error', 'Voice transcription failed', { error: String(err) });
      await sendMessage(chatId, 'Erreur lors de la transcription du message vocal.');
    }
    return;
  }

  // Text message → Claude agent
  if (text) {
    await processAndReply(chatId, userId, companyId, text);
  }
}

async function processAndReply(
  chatId: number,
  userId: number,
  companyId: string,
  userText: string
): Promise<void> {
  await sendTyping(chatId);

  // Keep sending typing every 4 seconds
  const typingInterval = setInterval(() => sendTyping(chatId), 4000);

  try {
    const response = await Promise.race([
      processMessage(companyId, userId, userText),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), 30000)
      ),
    ]);

    clearInterval(typingInterval);

    // Check if response contains a file to send
    const fileMatch = response.match(/__EXCEL_FILE__:(\S+)/);
    if (fileMatch) {
      const fileKey = fileMatch[1];
      const file = getPendingFile(fileKey);
      if (file) {
        const textPart = response.replace(/__EXCEL_FILE__:\S+\n?/, '').trim();
        await sendDocument(chatId, file.buffer, file.filename, textPart);
      } else {
        await sendMessage(chatId, response.replace(/__EXCEL_FILE__:\S+\n?/, ''));
      }
    } else {
      await sendMessage(chatId, response);
    }
  } catch (err) {
    clearInterval(typingInterval);
    const errMsg = String(err);

    if (errMsg.includes('TIMEOUT')) {
      await sendMessage(
        chatId,
        'La requete a pris trop de temps. Essayez une question plus simple.'
      );
    } else if (errMsg.includes('429')) {
      await sendMessage(
        chatId,
        'Service temporairement surcharge. Reessayez dans quelques secondes.'
      );
    } else {
      log('error', 'Agent processing failed', { userId, error: errMsg });
      await sendMessage(
        chatId,
        'Une erreur est survenue. Reessayez ou tapez /reset pour reinitialiser.'
      );
    }
  }
}

// === Webhook Setup ===

async function setWebhook(): Promise<void> {
  if (!WEBHOOK_URL) {
    log('warn', 'WEBHOOK_URL not set, skipping webhook registration');
    return;
  }

  const url = `${WEBHOOK_URL}/webhook`;
  const res = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }
  );
  const data = await res.json();
  log('info', 'Webhook set', { url, result: data });
}

// === Express Server ===

const app = express();
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Telegram webhook
app.post('/webhook', (req, res) => {
  // Respond 200 immediately to avoid Telegram retries
  res.sendStatus(200);

  const update = req.body as TelegramUpdate;
  handleUpdate(update).catch((err) => {
    log('error', 'Unhandled error in handleUpdate', { error: String(err) });
  });
});

// Start server
app.listen(PORT, () => {
  log('info', `Bot server running on port ${PORT}`);
  setWebhook();
  startCron();
});
