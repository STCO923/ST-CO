import { supabase } from './supabase';
import { TelegramAgent, ActivationCode, SaCompany, log } from './types';

// === Auth Cache (TTL 5 min) ===

interface AuthCacheEntry {
  companyId: string;
  role: string;
  expiresAt: number;
}

const authCache = new Map<number, AuthCacheEntry>();
const CACHE_TTL = 5 * 60 * 1000;

// === Rate Limiting (5 req/60s sliding window) ===

const rateLimits = new Map<number, number[]>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 5;

export function checkRateLimit(userId: number): boolean {
  const now = Date.now();
  let timestamps = rateLimits.get(userId) ?? [];
  timestamps = timestamps.filter((t) => now - t < RATE_WINDOW_MS);

  if (timestamps.length >= RATE_MAX_REQUESTS) {
    rateLimits.set(userId, timestamps);
    return false;
  }

  timestamps.push(now);
  rateLimits.set(userId, timestamps);
  return true;
}

// === Resolve company_id from telegram_user_id ===

export async function resolveCompanyId(
  telegramUserId: number
): Promise<string | null> {
  const cached = authCache.get(telegramUserId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.companyId;
  }

  const { data, error } = await supabase
    .from('telegram_agents')
    .select('company_id, role')
    .eq('telegram_user_id', telegramUserId)
    .eq('actif', true)
    .single<Pick<TelegramAgent, 'company_id' | 'role'>>();

  if (error || !data) {
    authCache.delete(telegramUserId);
    return null;
  }

  authCache.set(telegramUserId, {
    companyId: data.company_id,
    role: data.role,
    expiresAt: Date.now() + CACHE_TTL,
  });

  return data.company_id;
}

// === Check addon_agent is enabled ===

export async function checkAddonAgent(companyId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('sa_companies')
    .select('addon_agent')
    .eq('id', companyId)
    .single<Pick<SaCompany, 'addon_agent'>>();

  if (error || !data) return false;
  return data.addon_agent === true;
}

// === Activate a Telegram user with a code ===

interface ActivationResult {
  success: boolean;
  companyName?: string;
  error?: string;
}

export async function activateCode(
  telegramUserId: number,
  code: string,
  displayName?: string
): Promise<ActivationResult> {
  // 1. Find unused, non-expired code
  const { data: codeData, error: codeError } = await supabase
    .from('activation_codes')
    .select('code, company_id, used, expires_at')
    .eq('code', code.toUpperCase().trim())
    .eq('used', false)
    .single<ActivationCode>();

  if (codeError || !codeData) {
    return { success: false, error: 'Code invalide ou deja utilise.' };
  }

  if (new Date(codeData.expires_at) < new Date()) {
    return { success: false, error: 'Ce code a expire.' };
  }

  // 2. Check addon_agent is enabled for that company
  const addonOk = await checkAddonAgent(codeData.company_id);
  if (!addonOk) {
    return {
      success: false,
      error: "L'addon Agent IA n'est pas active pour cette entreprise.",
    };
  }

  // 3. Get company name
  const { data: company } = await supabase
    .from('sa_companies')
    .select('name')
    .eq('id', codeData.company_id)
    .single<Pick<SaCompany, 'name'>>();

  // 4. Upsert telegram_agents
  const { error: upsertError } = await supabase
    .from('telegram_agents')
    .upsert(
      {
        telegram_user_id: telegramUserId,
        company_id: codeData.company_id,
        role: 'admin',
        actif: true,
        display_name: displayName ?? null,
      },
      { onConflict: 'telegram_user_id' }
    );

  if (upsertError) {
    log('error', 'Failed to upsert telegram_agents', {
      error: upsertError.message,
    });
    return { success: false, error: 'Erreur lors de l\'activation.' };
  }

  // 5. Mark code as used
  await supabase
    .from('activation_codes')
    .update({ used: true, used_by: telegramUserId })
    .eq('code', codeData.code);

  // 6. Clear cache
  authCache.delete(telegramUserId);

  log('info', 'User activated', {
    telegramUserId,
    companyId: codeData.company_id,
  });

  return {
    success: true,
    companyName: company?.name ?? 'Votre entreprise',
  };
}
