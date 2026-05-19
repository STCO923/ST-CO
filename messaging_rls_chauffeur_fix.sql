-- =======================================================================
-- OPTIMUM TRANS — Migration : RLS messages pour chauffeurs / chefs d'équipe
-- Ajoute des policies SELECT/INSERT/UPDATE sur `messages` qui résolvent
-- le company_id via la table company_users, pour que les chauffeurs
-- (dont auth.uid() ≠ company_id) puissent lire, envoyer et marquer-lu
-- les messages de leur entreprise, y compris via Supabase Realtime (WS).
-- Les anciennes policies "messages_select/insert/update" restent valides
-- pour les admins (auth.uid() = company_id).
-- Exécuter dans : Supabase → SQL Editor
-- =======================================================================

-- On supprime d'abord les policies _user si elles existaient (migration idempotente)
DROP POLICY IF EXISTS "messages_select_user" ON messages;
DROP POLICY IF EXISTS "messages_insert_user" ON messages;
DROP POLICY IF EXISTS "messages_update_user" ON messages;

-- SELECT — chauffeurs et chefs peuvent lire les messages de leur entreprise
CREATE POLICY "messages_select_user" ON messages
  FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM company_users
      WHERE auth_uid = auth.uid() AND actif = true
    )
  );

-- INSERT — chauffeurs et chefs peuvent envoyer des messages dans leur entreprise
CREATE POLICY "messages_insert_user" ON messages
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_users
      WHERE auth_uid = auth.uid() AND actif = true
    )
  );

-- UPDATE — chauffeurs et chefs peuvent marquer leurs messages lus
CREATE POLICY "messages_update_user" ON messages
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

-- =======================================================================
-- VÉRIFICATION — doit afficher les 3 policies _user :
-- SELECT tablename, policyname, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'messages'
-- ORDER BY policyname;
-- =======================================================================
