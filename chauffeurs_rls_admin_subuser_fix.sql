-- =======================================================================
-- OPTIMUM TRANS — chauffeurs_rls_admin_subuser_fix.sql
-- Correction RLS : INSERT/UPDATE/DELETE chauffeurs pour admins sous-utilisateurs
--
-- PROBLÈME : Les policies iso_insert/iso_update/iso_delete sur la table
-- `chauffeurs` exigent (company_id = auth.uid()). Cela bloque tous les
-- utilisateurs dont l'auth.uid() ≠ sa_companies.id, c'est-à-dire les
-- comptes admins créés via company_users (cas réel : COMOCO).
--
-- Reproduction :
--   - sa_companies.id        = e936bc56-73d2-49d7-b2b3-9eccb47ecdc3 (COMOCO)
--   - company_users.auth_uid = a8b890ca-e4ea-4827-b7ca-c8b0c398ceb8 (admin)
--   - INSERT chauffeurs avec company_id=e936bc56... → 42501
--     "new row violates row-level security policy for table chauffeurs"
--
-- SOLUTION : ajout des policies _user qui résolvent company_id via
-- company_users (même pattern que rls_chauffeur_fix.sql pour tournees,
-- gazole_pleins, affectations_vehicule, etc.).
-- Les policies Supabase étant OR-ées, les anciennes iso_* restent valides
-- pour les propriétaires (auth.uid() = company_id).
-- =======================================================================

-- Idempotent
DROP POLICY IF EXISTS "iso_insert_user" ON chauffeurs;
DROP POLICY IF EXISTS "iso_update_user" ON chauffeurs;
DROP POLICY IF EXISTS "iso_delete_user" ON chauffeurs;

CREATE POLICY "iso_insert_user" ON chauffeurs
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_users
      WHERE auth_uid = auth.uid() AND actif = true
    )
  );

CREATE POLICY "iso_update_user" ON chauffeurs
  FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM company_users
      WHERE auth_uid = auth.uid() AND actif = true
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_users
      WHERE auth_uid = auth.uid() AND actif = true
    )
  );

CREATE POLICY "iso_delete_user" ON chauffeurs
  FOR DELETE
  USING (
    company_id IN (
      SELECT company_id FROM company_users
      WHERE auth_uid = auth.uid() AND actif = true
    )
  );

-- =======================================================================
-- VÉRIFICATION
-- SELECT tablename, policyname, cmd
-- FROM pg_policies
-- WHERE schemaname='public' AND tablename='chauffeurs'
-- ORDER BY policyname;
--
-- Résultat attendu : 7 policies
--   iso_select, iso_insert, iso_update, iso_delete  (existantes)
--   iso_insert_user, iso_update_user, iso_delete_user  (nouvelles)
-- =======================================================================
