-- =======================================================================
-- OPTIMUM TRANS — Migration : RLS driver_locations / driver_positions_history
-- pour chauffeurs et chefs d'équipe
--
-- PROBLÈME : Si les policies RLS de driver_locations utilisent
-- company_id = auth.uid(), les chauffeurs ne peuvent PAS écrire leur
-- position (leur auth.uid() n'est pas égal à company_id).
-- Conséquence : les admins voient "aucun chauffeur" dans Suivi Temps Réel
-- même quand le chauffeur a activé le GPS.
--
-- SOLUTION : policies alternatives qui résolvent company_id via company_users
-- (même pattern que rls_chauffeur_fix.sql pour gazole_pleins, tournees, etc.)
-- Exécuter dans : Supabase → SQL Editor
-- =======================================================================

-- Idempotent : drop si existaient déjà
DROP POLICY IF EXISTS "dl_select_user" ON driver_locations;
DROP POLICY IF EXISTS "dl_insert_user" ON driver_locations;
DROP POLICY IF EXISTS "dl_update_user" ON driver_locations;
DROP POLICY IF EXISTS "dl_upsert_user" ON driver_locations;
DROP POLICY IF EXISTS "dph_select_user" ON driver_positions_history;
DROP POLICY IF EXISTS "dph_insert_user" ON driver_positions_history;

-- ── driver_locations (upsert fréquent, SELECT pour admin/chef) ─────
CREATE POLICY "dl_select_user" ON driver_locations
  FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM company_users
      WHERE auth_uid = auth.uid() AND actif = true
    )
  );

CREATE POLICY "dl_insert_user" ON driver_locations
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_users
      WHERE auth_uid = auth.uid() AND actif = true
    )
  );

CREATE POLICY "dl_update_user" ON driver_locations
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

-- ── driver_positions_history (INSERT par chauffeur, SELECT par admin/chef) ──
CREATE POLICY "dph_select_user" ON driver_positions_history
  FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM company_users
      WHERE auth_uid = auth.uid() AND actif = true
    )
  );

CREATE POLICY "dph_insert_user" ON driver_positions_history
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_users
      WHERE auth_uid = auth.uid() AND actif = true
    )
  );

-- =======================================================================
-- VÉRIFICATION — doit afficher les nouvelles policies :
-- SELECT tablename, policyname, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('driver_locations','driver_positions_history')
-- ORDER BY tablename, policyname;
-- =======================================================================
