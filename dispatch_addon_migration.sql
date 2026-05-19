-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: Addon IA Dispatch — colonne addon_dispatch
-- Exécuter dans Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- Ajouter la colonne addon_dispatch à la table sa_companies
ALTER TABLE sa_companies 
  ADD COLUMN IF NOT EXISTS addon_dispatch BOOLEAN DEFAULT FALSE;

-- Commentaire descriptif
COMMENT ON COLUMN sa_companies.addon_dispatch IS 'Addon IA Dispatch automatique des tournées (+49,99€/mois)';
