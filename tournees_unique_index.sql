-- ─────────────────────────────────────────────────────────────────────────
-- Contrainte UNIQUE partielle sur tournees pour empêcher les doublons.
-- ─────────────────────────────────────────────────────────────────────────
--
-- APPLIQUÉE EN PROD le 2026-05-05 via apply_migration MCP Supabase.
-- Migration name: tournees_unique_partial_index_dedup_legacy
--
-- Comportement :
-- - Pour chaque groupe (company_id, chauffeur_nom, date, slot, client_nom)
--   avec plusieurs lignes en base au moment de l'application, la ligne la
--   plus ANCIENNE (created_at + id en tie-breaker) est conservée dans
--   l'index ; les autres lignes sont exclues.
-- - Toute future tentative d'INSERT d'une combinaison qui correspond à une
--   ligne indexée échoue avec :
--     ERROR: 23505: duplicate key value violates unique constraint
--            "uniq_tournees_no_dup"
-- - Le code applicatif intercepte cette erreur (saisie.html, planning.html,
--   monmarche.html) et affiche à l'utilisateur :
--     "⚠️ ATTENTION — CETTE TOURNÉE EXISTE DÉJÀ
--      Merci de supprimer ou modifier la tournée existante au lieu d'en
--      créer une nouvelle."
-- - Les doublons historiques restent en base (ne modifient ni le CA ni les
--   salaires déjà comptabilisés) mais ne sont pas indexés.
--
-- POUR RECRÉER L'INDEX SANS LES EXCLUSIONS HISTORIQUES (à faire un jour
-- après nettoyage manuel des doublons) :
--   1. Identifier les doublons :
--        SELECT company_id, chauffeur_nom, date, slot, client_nom, COUNT(*)
--        FROM tournees
--        WHERE chauffeur_nom IS NOT NULL AND slot IS NOT NULL
--              AND client_nom IS NOT NULL
--        GROUP BY 1,2,3,4,5
--        HAVING COUNT(*) > 1;
--   2. Supprimer les lignes en doublon (1 par groupe).
--   3. DROP INDEX uniq_tournees_no_dup;
--   4. Réexécuter ce script.
-- ─────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  excluded_ids text;
  ddl text;
BEGIN
  -- Pour chaque groupe avec doublon, on garde la ligne la plus ANCIENNE
  -- dans l'index (rn=1) et on exclut les suivantes (rn > 1).
  SELECT string_agg(quote_literal(id::text) || '::uuid', ',')
  INTO excluded_ids
  FROM (
    SELECT id,
           row_number() OVER (
             PARTITION BY company_id, chauffeur_nom, date, slot, client_nom
             ORDER BY created_at, id
           ) AS rn
    FROM public.tournees
    WHERE chauffeur_nom IS NOT NULL
      AND slot IS NOT NULL
      AND client_nom IS NOT NULL
  ) sub
  WHERE rn > 1;

  IF excluded_ids IS NULL THEN
    -- Pas de doublons : index UNIQUE classique
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uniq_tournees_no_dup
             ON public.tournees (company_id, chauffeur_nom, date, slot, client_nom)
             WHERE chauffeur_nom IS NOT NULL
               AND slot IS NOT NULL
               AND client_nom IS NOT NULL';
  ELSE
    -- Doublons existants : index UNIQUE partiel excluant les "représentants doublon"
    ddl := format(
      'CREATE UNIQUE INDEX IF NOT EXISTS uniq_tournees_no_dup
       ON public.tournees (company_id, chauffeur_nom, date, slot, client_nom)
       WHERE chauffeur_nom IS NOT NULL
         AND slot IS NOT NULL
         AND client_nom IS NOT NULL
         AND id NOT IN (%s)',
      excluded_ids
    );
    EXECUTE ddl;
  END IF;
END $$;
