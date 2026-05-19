-- =======================================================================
-- OPTIMUM TRANS — rls_iso_select_user_global_fix.sql
-- Correction RLS globale : SELECT pour admins sous-utilisateurs
--
-- PROBLÈME : 9 tables ont leur policy iso_select qui exige
-- (company_id = auth.uid()), bloquant la lecture pour les sous-utilisateurs
-- (admins/chefs/chauffeurs liés via company_users).
--
-- Symptôme : COMOCO crée un commissionnaire avec succès (INSERT OK
-- depuis le fix précédent), mais ne le voit pas dans la liste pour
-- créer une prestation (SELECT bloqué).
--
-- Tables concernées :
--   chauffeur_avances, commissionnaires, entreprise, factures,
--   monmarche_shifts, penalites_config, planning, points_livraison,
--   tournee_points
--
-- SOLUTION : ajout d'une policy iso_select_user pour chaque table
-- listée, qui résout company_id via company_users (même pattern que
-- les fixes RLS précédents).
-- =======================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    WITH iso AS (
      SELECT tablename, COALESCE(qual,'') AS expr
      FROM pg_policies
      WHERE schemaname='public' AND policyname='iso_select'
    ),
    has_user AS (
      SELECT DISTINCT tablename
      FROM pg_policies
      WHERE schemaname='public' AND cmd='SELECT'
        AND COALESCE(qual,'') ILIKE '%company_users%'
    )
    SELECT iso.tablename
    FROM iso
    LEFT JOIN has_user hu ON hu.tablename = iso.tablename
    WHERE iso.expr ILIKE '%auth.uid()%'
      AND hu.tablename IS NULL
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'iso_select_user', r.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true))',
      'iso_select_user', r.tablename
    );
  END LOOP;
END $$;

-- =======================================================================
-- VÉRIFICATION
--   SELECT tablename, policyname, cmd
--   FROM pg_policies
--   WHERE schemaname='public' AND policyname = 'iso_select_user'
--   ORDER BY tablename;
-- =======================================================================
