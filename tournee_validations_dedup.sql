-- =======================================================================
-- OPTIMUM TRANS — tournee_validations_dedup.sql
-- Nettoie les doublons accumulés dans tournee_validations et ajoute la
-- contrainte UNIQUE (company_id, tournee_id) qui rend le
-- `Prefer: resolution=merge-duplicates` fonctionnel.
--
-- PROBLÈME DÉTECTÉ (2026-04-15) :
-- Le GET /rest/v1/tournee_validations retournait toujours exactement 1000
-- lignes = limite par défaut de PostgREST (db-max-rows). Les validations
-- récentes (au-delà de la 1000e ligne) étaient absentes de la réponse → au
-- reload, l'UI affichait "non validée" alors que le POST 201 avait bien
-- inséré la ligne.
--
-- Cause racine : pas de contrainte UNIQUE en place, donc chaque clic
-- Valider/Pénaliser/Reset créait une NOUVELLE ligne au lieu d'upserter.
-- Table gonflée par des centaines de doublons.
--
-- À EXÉCUTER UNE FOIS dans l'éditeur SQL Supabase.
-- Idempotent : peut être relancé sans danger.
-- =======================================================================


-- 1. Dédup : garder la ligne la plus récente par (company_id, tournee_id)
WITH ranked AS (
  SELECT
    ctid,
    row_number() OVER (
      PARTITION BY company_id, tournee_id
      ORDER BY updated_at DESC NULLS LAST, ctid DESC
    ) AS rn
  FROM tournee_validations
)
DELETE FROM tournee_validations t
USING ranked r
WHERE t.ctid = r.ctid
  AND r.rn > 1;


-- 2. Contrainte UNIQUE — prérequis pour que PostgREST fasse un vrai upsert
--    avec Prefer: resolution=merge-duplicates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tournee_validations_company_tournee_uniq'
  ) THEN
    ALTER TABLE tournee_validations
      ADD CONSTRAINT tournee_validations_company_tournee_uniq
      UNIQUE (company_id, tournee_id);
  END IF;
END;
$$;


-- 3. Index explicite sur (company_id, updated_at) pour accélérer les GET
--    triés par date (le load côté client fait order=updated_at.asc)
CREATE INDEX IF NOT EXISTS idx_tv_company_updated
  ON tournee_validations (company_id, updated_at);


-- =======================================================================
-- VÉRIFICATIONS
-- =======================================================================

-- a) Combien de lignes restantes par compagnie (sanity check)
SELECT company_id, COUNT(*) AS nb_validations
FROM tournee_validations
GROUP BY company_id
ORDER BY nb_validations DESC
LIMIT 10;

-- b) Confirmer qu'aucun doublon ne subsiste
SELECT company_id, tournee_id, COUNT(*) AS dup
FROM tournee_validations
GROUP BY company_id, tournee_id
HAVING COUNT(*) > 1;
-- Résultat attendu : 0 ligne

-- c) Vérifier la présence de la contrainte
SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'tournee_validations'::regclass
  AND conname = 'tournee_validations_company_tournee_uniq';
-- Résultat attendu : 1 ligne avec contype = 'u'
