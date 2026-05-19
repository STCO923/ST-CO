-- ═══════════════════════════════════════════════════════════════════════════
-- AUDIT — Lignes potentiellement affectées par le bug de décalage de date
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Contexte : avant le correctif, le code front-end pré-remplissait les champs
-- date des formulaires avec `new Date().toISOString().split('T')[0]`, ce qui
-- renvoie la date UTC. Pour un utilisateur en France (Europe/Paris, UTC+1/+2)
-- qui saisissait entre ~00h00 et ~02h00 heure locale, la date stockée était
-- celle de la veille au lieu du jour courant.
--
-- Ce script DÉTECTE (SELECT uniquement, aucun UPDATE) les lignes suspectes :
--   - date locale Paris du `created_at` = date stockée + 1 jour
--   - ET heure locale Paris du `created_at` < 03h00
--
-- Types des colonnes `created_at` (vérifié via information_schema) :
--   - tournees              → timestamp without time zone  (stocké en UTC)
--   - gazole_pleins         → timestamp with time zone
--   - maintenance_vehicules → timestamp with time zone
--   - affectations_vehicule → timestamp without time zone  (stocké en UTC)
--
-- À exécuter dans l'éditeur SQL Supabase. Lecture seule, 100% safe.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. TOURNÉES suspectes (timestamp sans TZ → stocké en UTC)
-- ───────────────────────────────────────────────────────────────────────────
SELECT
  'tournees'                                                           AS source,
  id,
  company_id,
  chauffeur_nom,
  client_nom,
  slot,
  date                                                                 AS date_stockee,
  (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris')::date    AS date_locale_creation,
  to_char(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris',
          'YYYY-MM-DD HH24:MI:SS')                                     AS creation_locale_paris,
  created_at                                                           AS creation_utc
FROM tournees
WHERE (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris')::date - date = 1
  AND EXTRACT(HOUR FROM (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris')) < 3
ORDER BY created_at DESC;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. PLEINS GAZOLE suspects (timestamptz)
-- ───────────────────────────────────────────────────────────────────────────
SELECT
  'gazole_pleins'                                                      AS source,
  id,
  company_id,
  vehicule,
  chauffeur,
  montant,
  litres,
  date                                                                 AS date_stockee,
  (created_at AT TIME ZONE 'Europe/Paris')::date                       AS date_locale_creation,
  to_char(created_at AT TIME ZONE 'Europe/Paris',
          'YYYY-MM-DD HH24:MI:SS')                                     AS creation_locale_paris,
  saisie_par,
  created_at                                                           AS creation_utc
FROM gazole_pleins
WHERE (created_at AT TIME ZONE 'Europe/Paris')::date - date = 1
  AND EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Europe/Paris')) < 3
ORDER BY created_at DESC;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. MAINTENANCES VÉHICULES suspectes (timestamptz)
-- ───────────────────────────────────────────────────────────────────────────
SELECT
  'maintenance_vehicules'                                              AS source,
  id,
  company_id,
  vehicule_immat,
  type_maintenance,
  cout,
  date_maintenance                                                     AS date_stockee,
  (created_at AT TIME ZONE 'Europe/Paris')::date                       AS date_locale_creation,
  to_char(created_at AT TIME ZONE 'Europe/Paris',
          'YYYY-MM-DD HH24:MI:SS')                                     AS creation_locale_paris,
  created_at                                                           AS creation_utc
FROM maintenance_vehicules
WHERE (created_at AT TIME ZONE 'Europe/Paris')::date - date_maintenance = 1
  AND EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Europe/Paris')) < 3
ORDER BY created_at DESC;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. AFFECTATIONS VÉHICULES suspectes (timestamp sans TZ → stocké en UTC)
-- ───────────────────────────────────────────────────────────────────────────
SELECT
  'affectations_vehicule'                                              AS source,
  id,
  company_id,
  chauffeur_nom,
  vehicule_id,
  date                                                                 AS date_stockee,
  (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris')::date    AS date_locale_creation,
  to_char(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris',
          'YYYY-MM-DD HH24:MI:SS')                                     AS creation_locale_paris,
  created_at                                                           AS creation_utc
FROM affectations_vehicule
WHERE (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris')::date - date = 1
  AND EXTRACT(HOUR FROM (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris')) < 3
ORDER BY created_at DESC;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. RÉSUMÉ — nombre de lignes suspectes par société et par table
-- ───────────────────────────────────────────────────────────────────────────
WITH suspects AS (
  SELECT 'tournees' AS src, company_id, created_at AT TIME ZONE 'UTC' AS created_utc,
         (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris')::date AS d_local
  FROM tournees
  WHERE (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris')::date - date = 1
    AND EXTRACT(HOUR FROM (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris')) < 3
  UNION ALL
  SELECT 'gazole_pleins', company_id, created_at,
         (created_at AT TIME ZONE 'Europe/Paris')::date
  FROM gazole_pleins
  WHERE (created_at AT TIME ZONE 'Europe/Paris')::date - date = 1
    AND EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Europe/Paris')) < 3
  UNION ALL
  SELECT 'maintenance_vehicules', company_id, created_at,
         (created_at AT TIME ZONE 'Europe/Paris')::date
  FROM maintenance_vehicules
  WHERE (created_at AT TIME ZONE 'Europe/Paris')::date - date_maintenance = 1
    AND EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Europe/Paris')) < 3
  UNION ALL
  SELECT 'affectations_vehicule', company_id, created_at AT TIME ZONE 'UTC',
         (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris')::date
  FROM affectations_vehicule
  WHERE (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris')::date - date = 1
    AND EXTRACT(HOUR FROM (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris')) < 3
)
SELECT
  src                                    AS table_source,
  company_id,
  COUNT(*)                               AS nb_lignes_suspectes,
  MIN(created_utc)                       AS premiere_occurrence,
  MAX(created_utc)                       AS derniere_occurrence
FROM suspects
GROUP BY src, company_id
ORDER BY nb_lignes_suspectes DESC, src;

-- ═══════════════════════════════════════════════════════════════════════════
-- REMÉDIATION (⚠️ à exécuter UNIQUEMENT après validation manuelle)
-- ═══════════════════════════════════════════════════════════════════════════
-- Rappel : toutes les lignes retournées ne sont pas nécessairement à corriger
-- — certaines peuvent être des saisies rétroactives volontaires (ex : chauffeur
-- qui saisit à 00h30 son plein "pour hier"). Il faut valider ligne par ligne
-- ou au moins par échantillon avant d'appliquer en masse.
--
-- Correction au cas par cas (adapter l'id) :
--
-- UPDATE tournees              SET date             = date             + 1 WHERE id = '<id>';
-- UPDATE gazole_pleins         SET date             = date             + 1 WHERE id = '<id>';
-- UPDATE maintenance_vehicules SET date_maintenance = date_maintenance + 1 WHERE id = '<id>';
-- UPDATE affectations_vehicule SET date             = date             + 1 WHERE id = '<id>';
--
-- Correction en masse (⚠️ après BACKUP, dans une transaction pour pouvoir rollback) :
--
-- BEGIN;
--   UPDATE tournees SET date = date + 1
--     WHERE (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris')::date - date = 1
--       AND EXTRACT(HOUR FROM (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris')) < 3;
--   UPDATE gazole_pleins SET date = date + 1
--     WHERE (created_at AT TIME ZONE 'Europe/Paris')::date - date = 1
--       AND EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Europe/Paris')) < 3;
--   UPDATE maintenance_vehicules SET date_maintenance = date_maintenance + 1
--     WHERE (created_at AT TIME ZONE 'Europe/Paris')::date - date_maintenance = 1
--       AND EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Europe/Paris')) < 3;
--   UPDATE affectations_vehicule SET date = date + 1
--     WHERE (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris')::date - date = 1
--       AND EXTRACT(HOUR FROM (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris')) < 3;
--   -- Vérifier le nombre de lignes modifiées avant de committer
-- ROLLBACK;  -- ou COMMIT; après inspection
-- ═══════════════════════════════════════════════════════════════════════════
