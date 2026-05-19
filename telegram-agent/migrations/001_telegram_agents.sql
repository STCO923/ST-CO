-- Migration 001 : Tables pour le bot Telegram IA
-- Exécuter sur Supabase project zmoqurdxsayqsfyoujhu

-- 1. Table d'authentification Telegram → company_id
CREATE TABLE IF NOT EXISTS telegram_agents (
  telegram_user_id  BIGINT      PRIMARY KEY,
  company_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role              TEXT        NOT NULL DEFAULT 'admin',
  actif             BOOLEAN     NOT NULL DEFAULT TRUE,
  display_name      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_agents_company ON telegram_agents(company_id);

-- 2. Codes d'activation one-time
CREATE TABLE IF NOT EXISTS activation_codes (
  code        TEXT        PRIMARY KEY,
  company_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  used        BOOLEAN     NOT NULL DEFAULT FALSE,
  used_by     BIGINT,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '72 hours'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activation_codes_company ON activation_codes(company_id);

-- 3. Addon agent sur sa_companies
ALTER TABLE sa_companies ADD COLUMN IF NOT EXISTS addon_agent BOOLEAN DEFAULT false;

-- 4. Trigger updated_at sur telegram_agents
CREATE OR REPLACE FUNCTION update_telegram_agents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_telegram_agents_updated_at
  BEFORE UPDATE ON telegram_agents
  FOR EACH ROW EXECUTE FUNCTION update_telegram_agents_updated_at();
