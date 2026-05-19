-- =======================================================================
-- OPTIMUM TRANS — rls_iso_user_policies_global_fix.sql
-- Correction RLS globale : INSERT/UPDATE/DELETE pour admins sous-utilisateurs
--
-- PROBLÈME : 14 tables ont leurs policies iso_insert/update/delete qui
-- exigent (company_id = auth.uid()), bloquant tous les sous-utilisateurs
-- (admins/chefs/chauffeurs liés via company_users) dont auth.uid() diffère
-- de sa_companies.id.
--
-- Symptôme : COMOCO obtient l'erreur 42501 sur la page Parc Véhicules
-- (et toute autre page utilisant ces tables).
--
-- Tables concernées :
--   absences, chauffeur_avances, clients, commissionnaires, contrats,
--   entreprise, factures, monmarche_shifts, penalites_config, planning,
--   points_livraison, soldes_conges, tournee_points, vehicules
--
-- SOLUTION : ajout d'une policy iso_<cmd>_user pour chaque (table, cmd)
-- manquante, qui résout company_id via company_users (même pattern que
-- chauffeurs_rls_admin_subuser_fix.sql).
-- =======================================================================

DO $$
DECLARE
  r RECORD;
  pol_name TEXT;
BEGIN
  FOR r IN
    WITH iso AS (
      SELECT tablename, cmd,
             COALESCE(qual,'') || ' ' || COALESCE(with_check,'') AS expr
      FROM pg_policies
      WHERE schemaname='public'
        AND policyname IN ('iso_insert','iso_update','iso_delete')
    ),
    has_user_policy AS (
      SELECT DISTINCT tablename, cmd
      FROM pg_policies
      WHERE schemaname='public'
        AND COALESCE(qual,'') || ' ' || COALESCE(with_check,'') ILIKE '%company_users%'
    )
    SELECT iso.tablename, iso.cmd
    FROM iso
    LEFT JOIN has_user_policy hu
      ON hu.tablename = iso.tablename AND hu.cmd = iso.cmd
    WHERE iso.expr ILIKE '%auth.uid()%'
      AND hu.tablename IS NULL
  LOOP
    pol_name := 'iso_' || lower(r.cmd) || '_user';

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol_name, r.tablename);

    IF r.cmd = 'INSERT' THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR INSERT WITH CHECK (company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true))',
        pol_name, r.tablename
      );
    ELSIF r.cmd = 'UPDATE' THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR UPDATE USING (company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)) WITH CHECK (company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true))',
        pol_name, r.tablename
      );
    ELSIF r.cmd = 'DELETE' THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR DELETE USING (company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true))',
        pol_name, r.tablename
      );
    END IF;
  END LOOP;
END $$;

-- =======================================================================
-- VÉRIFICATION
--   SELECT tablename, policyname, cmd
--   FROM pg_policies
--   WHERE schemaname='public' AND policyname LIKE 'iso\_%\_user' ESCAPE '\'
--   ORDER BY tablename, cmd;
-- =======================================================================
