import { log } from './types';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
// Groq is free. Fallback to OpenAI if GROQ_API_KEY not set.
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function transcribeVoice(fileId: string): Promise<string> {
  if (!TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN missing');

  // 1. Get file path from Telegram
  const fileInfoRes = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`
  );
  const fileInfo = (await fileInfoRes.json()) as {
    ok: boolean;
    result?: { file_path: string };
  };

  if (!fileInfo.ok || !fileInfo.result?.file_path) {
    throw new Error('Failed to get file info from Telegram');
  }

  const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileInfo.result.file_path}`;

  // 2. Download the audio file
  const audioRes = await fetch(fileUrl);
  if (!audioRes.ok) throw new Error('Failed to download audio file');
  const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

  log('info', 'Voice file downloaded', {
    fileId,
    size: audioBuffer.length,
    path: fileInfo.result.file_path,
  });

  // 3. Transcribe — prefer Groq (free), fallback to OpenAI
  if (GROQ_API_KEY) {
    return await transcribeWithGroq(audioBuffer);
  }
  if (OPENAI_API_KEY) {
    return await transcribeWithOpenAI(audioBuffer);
  }
  throw new Error('Aucune cle API de transcription configuree. Ajoutez GROQ_API_KEY (gratuit) ou OPENAI_API_KEY.');
}

async function transcribeWithGroq(audioBuffer: Buffer): Promise<string> {
  const formData = new FormData();
  formData.append(
    'file',
    new Blob([audioBuffer], { type: 'audio/ogg' }),
    'voice.ogg'
  );
  formData.append('model', 'whisper-large-v3');
  formData.append('language', 'fr');

  const res = await fetch(
    'https://api.groq.com/openai/v1/audio/transcriptions',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: formData,
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    log('error', 'Groq Whisper error', { status: res.status, body: errText });
    throw new Error(`Groq Whisper error: ${res.status}`);
  }

  const result = (await res.json()) as { text: string };
  log('info', 'Voice transcribed (Groq)', { text: result.text.slice(0, 100) });
  return result.text;
}

async function transcribeWithOpenAI(audioBuffer: Buffer): Promise<string> {
  const formData = new FormData();
  formData.append(
    'file',
    new Blob([audioBuffer], { type: 'audio/ogg' }),
    'voice.ogg'
  );
  formData.append('model', 'whisper-1');
  formData.append('language', 'fr');

  const res = await fetch(
    'https://api.openai.com/v1/audio/transcriptions',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: formData,
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    log('error', 'OpenAI Whisper error', { status: res.status, body: errText });
    throw new Error(`OpenAI Whisper error: ${res.status}`);
  }

  const result = (await res.json()) as { text: string };
  log('info', 'Voice transcribed (OpenAI)', { text: result.text.slice(0, 100) });
  return result.text;
}
