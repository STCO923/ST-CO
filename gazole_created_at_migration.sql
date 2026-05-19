-- =======================================================================
-- OPTIMUM TRANS — Migration : gazole_pleins.created_at
-- Ajoute un horodatage de création (heure exacte) à chaque plein gazole.
-- La colonne `date` ne stocke que la date — pour le journal d'activité
-- de la page Suivi Chauffeurs, on a besoin de l'heure de saisie aussi.
-- Exécuter dans : Supabase → SQL Editor
-- =======================================================================

ALTER TABLE gazole_pleins
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Backfill : pour les anciennes lignes, prend le timestamp `updated_at`
-- s'il existe et est cohérent, sinon laisse NULL (affiché juste comme date).
UPDATE gazole_pleins
   SET created_at = updated_at
 WHERE created_at IS NULL
   AND updated_at IS NOT NULL;

-- Index pour le tri par date de saisie (utilisé par le journal d'activité)
CREATE INDEX IF NOT EXISTS idx_gazole_pleins_company_created
  ON gazole_pleins(company_id, created_at DESC);

-- =======================================================================
-- FIN DE MIGRATION
-- =======================================================================
