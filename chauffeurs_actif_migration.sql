-- MIGRATION : Statut actif/inactif sur les chauffeurs
-- Permet de masquer un chauffeur dans le planning sans supprimer son historique.
-- Exécuter dans Supabase SQL Editor.

ALTER TABLE chauffeurs
  ADD COLUMN IF NOT EXISTS actif BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN chauffeurs.actif IS
  'Faux = chauffeur archivé (masqué dans le planning) mais conservé pour l''historique (salaires, tournées passées).';

-- Backfill : tout chauffeur existant est actif par défaut
UPDATE chauffeurs SET actif = true WHERE actif IS NULL;

-- Index pour filtrer rapidement les chauffeurs actifs par société
CREATE INDEX IF NOT EXISTS chauffeurs_company_actif
  ON chauffeurs (company_id, actif);
