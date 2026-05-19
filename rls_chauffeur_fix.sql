-- =======================================================================
-- OPTIMUM TRANS — rls_chauffeur_fix.sql
-- Correction RLS : accès chauffeurs et chefs d'équipe
--
-- PROBLÈME : Les policies RLS utilisaient uniquement company_id = auth.uid()
-- ce qui fonctionnait pour les admins (auth.uid() = company_id) mais pas
-- pour les chauffeurs/chefs d'équipe qui ont leur propre auth.uid().
-- Erreur : 42501 (insufficient privilege) sur INSERT gazole_pleins, etc.
--
-- SOLUTION : Ajout de policies alternatives utilisant la table company_users
-- pour résoudre le company_id à partir de auth.uid() du chauffeur.
-- Les policies Supabase sont OR-ées, donc les anciennes restent valides
-- pour les admins.
--
-- Tables corrigées :
--   - gazole_pleins (INSERT + DELETE) → chauffeurs peuvent ajouter des pleins
--   - tournees (INSERT + UPDATE + DELETE) → chef d'équipe peut gérer le planning
--   - affectations_vehicule (SELECT + INSERT + UPDATE + DELETE) → chef d'équipe
--   - tournee_validations (SELECT + INSERT + UPDATE + DELETE) → chef d'équipe
--   - audit_log (INSERT) → traçabilité depuis sessions chauffeur
--   - get_my_company_id() → COALESCE pour fallback admin
--
-- Exécuté le : 2026-04-12
-- =======================================================================


-- 1. Fix get_my_company_id() — ajout COALESCE pour les admins
-- (la version précédente retournait NULL pour les admins sans entrée company_users)
CREATE OR REPLACE FUNCTION get_my_company_id() RETURNS uuid AS $$
  SELECT COALESCE(
    (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() LIMIT 1),
    auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- 2. gazole_pleins — chauffeurs peuvent insérer et supprimer des pleins
CREATE POLICY "gz_insert_user" ON gazole_pleins
  FOR INSERT WITH CHECK (
    company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
  );

CREATE POLICY "gz_delete_user" ON gazole_pleins
  FOR DELETE USING (
    company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
  );


-- 3. tournees — chef d'équipe peut créer/modifier/supprimer des tournées
CREATE POLICY "tournees_insert_user" ON tournees
  FOR INSERT WITH CHECK (
    company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
  );

CREATE POLICY "tournees_update_user" ON tournees
  FOR UPDATE USING (
    company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
  );

CREATE POLICY "tournees_delete_user" ON tournees
  FOR DELETE USING (
    company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
  );


-- 4. affectations_vehicule — chef d'équipe peut gérer les affectations
CREATE POLICY "aff_select_user" ON affectations_vehicule
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
  );

CREATE POLICY "aff_insert_user" ON affectations_vehicule
  FOR INSERT WITH CHECK (
    company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
  );

CREATE POLICY "aff_update_user" ON affectations_vehicule
  FOR UPDATE USING (
    company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
  );

CREATE POLICY "aff_delete_user" ON affectations_vehicule
  FOR DELETE USING (
    company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
  );


-- 5. tournee_validations — chef d'équipe peut valider les tournées
CREATE POLICY "tv_select_user" ON tournee_validations
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
  );

CREATE POLICY "tv_insert_user" ON tournee_validations
  FOR INSERT WITH CHECK (
    company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
  );

CREATE POLICY "tv_update_user" ON tournee_validations
  FOR UPDATE USING (
    company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
  );

CREATE POLICY "tv_delete_user" ON tournee_validations
  FOR DELETE USING (
    company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
  );


-- 6. audit_log — chauffeurs peuvent écrire dans le journal d'audit
CREATE POLICY "audit_insert_user" ON audit_log
  FOR INSERT WITH CHECK (
    company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
  );


-- =======================================================================
-- VÉRIFICATION
-- =======================================================================
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname LIKE '%_user%'
ORDER BY tablename, cmd;

-- Résultat attendu : 15 nouvelles policies _user
--   absences             : 1 (iso_insert_user — déjà existante)
--   affectations_vehicule: 4 (aff_select/insert/update/delete_user)
--   audit_log            : 1 (audit_insert_user)
--   gazole_pleins        : 2 (gz_insert/delete_user)
--   tournee_validations  : 4 (tv_select/insert/update/delete_user)
--   tournees             : 3 (tournees_insert/update/delete_user)
-- =======================================================================
