-- ═══════════════════════════════════════════════════════════════════
-- OPTIMUM TRANS — Messagerie Admin ↔ Chauffeurs
-- Migration v1.0
--
-- À exécuter dans le SQL Editor de Supabase
-- Les messages sont auto-supprimés après 24 heures via pg_cron
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. TABLE MESSAGES ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_role   TEXT        NOT NULL CHECK (sender_role IN ('admin', 'chauffeur')),
  sender_name   TEXT        NOT NULL,
  chauffeur_name TEXT       NOT NULL,   -- nom du chauffeur de la conversation
  content       TEXT        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  is_broadcast  BOOLEAN     NOT NULL DEFAULT FALSE,  -- TRUE = envoyé à tous les chauffeurs
  read_at       TIMESTAMPTZ,                          -- NULL = non lu
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

-- ── 2. INDEX ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_messages_company_chauffeur
  ON messages (company_id, chauffeur_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_expires_at
  ON messages (expires_at);

CREATE INDEX IF NOT EXISTS idx_messages_broadcast
  ON messages (company_id, is_broadcast, created_at DESC);

-- ── 3. ROW LEVEL SECURITY ───────────────────────────────────────────
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Lecture : uniquement les messages de sa propre entreprise
CREATE POLICY "messages_select" ON messages
  FOR SELECT
  USING (company_id = auth.uid());

-- Insertion : uniquement pour sa propre entreprise
CREATE POLICY "messages_insert" ON messages
  FOR INSERT
  WITH CHECK (company_id = auth.uid());

-- Mise à jour (marquer lu) : uniquement ses propres messages
CREATE POLICY "messages_update" ON messages
  FOR UPDATE
  USING (company_id = auth.uid())
  WITH CHECK (company_id = auth.uid());

-- Suppression : uniquement ses propres messages
CREATE POLICY "messages_delete" ON messages
  FOR DELETE
  USING (company_id = auth.uid());

-- ── 4. AUTO-SUPPRESSION 24H VIA PG_CRON ────────────────────────────
-- Active l'extension pg_cron si ce n'est pas déjà fait :
--   CREATE EXTENSION IF NOT EXISTS pg_cron;
--   GRANT USAGE ON SCHEMA cron TO postgres;

-- Job qui s'exécute toutes les heures et supprime les messages expirés
SELECT cron.schedule(
  'optimum-trans-delete-expired-messages',
  '0 * * * *',
  $$DELETE FROM public.messages WHERE expires_at < NOW()$$
);

-- ── 5. FONCTION UTILITAIRE (optionnel) ─────────────────────────────
-- Retourne le nombre de messages non lus pour un chauffeur donné
CREATE OR REPLACE FUNCTION get_unread_count(p_company_id UUID, p_chauffeur_name TEXT)
RETURNS INTEGER
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::INTEGER
  FROM messages
  WHERE company_id = p_company_id
    AND (chauffeur_name = p_chauffeur_name OR is_broadcast = TRUE)
    AND sender_role = 'admin'
    AND read_at IS NULL
    AND expires_at > NOW();
$$;

-- ═══════════════════════════════════════════════════════════════════
-- NOTES :
-- • pg_cron doit être activé sur votre projet Supabase
--   (disponible sur les plans Pro+)
-- • Si pg_cron n'est pas disponible, créer une Edge Function avec
--   un cron trigger Supabase pour faire le nettoyage
-- • expires_at est automatiquement NOW() + 24h à l'insertion
-- ═══════════════════════════════════════════════════════════════════
