-- =======================================================================
-- OPTIMUM TRANS — rls_subuser_policies_completion.sql
-- Correction RLS finale : 11 tables restantes pour les sous-utilisateurs
--
-- PROBLÈME : 11 tables ont leurs policies qui filtrent uniquement sur
-- (company_id = auth.uid()), ce qui bloque les admins/chefs/chauffeurs
-- liés via company_users (auth.uid() ≠ sa_companies.id).
--
-- Tables et CMD à fixer :
--   amendes              : SELECT/INSERT/UPDATE/DELETE
--   maintenance_vehicules: SELECT/INSERT/UPDATE/DELETE (policy ALL "company_iso")
--   ai_conversations     : SELECT/INSERT/UPDATE/DELETE (policy ALL "ai_conv_own")
--   bot_conversations    : SELECT/INSERT/UPDATE/DELETE
--   gmail_tokens         : SELECT/INSERT/UPDATE/DELETE
--   audit_log            : SELECT (INSERT déjà OK via audit_insert_user)
--   etats_vehicule       : DELETE (autres OK)
--   messages             : DELETE (autres OK via _user)
--   security_events      : SELECT
--   message_groups       : INSERT/UPDATE/DELETE (SELECT OK via msg_groups_user_read)
--   message_group_members: INSERT/UPDATE/DELETE (SELECT OK via msg_group_members_read)
--
-- SOLUTION : ajout d'une policy <prefix>_<cmd>_user pour chaque cas
-- manquant, résolvant company_id via company_users. Les anciennes
-- policies restent valides (OR-ées) pour les propriétaires legacy.
-- =======================================================================

-- ─────────────────────────────────────────────────────────────
-- amendes — SELECT/INSERT/UPDATE/DELETE
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "amendes_select_user" ON amendes;
DROP POLICY IF EXISTS "amendes_insert_user" ON amendes;
DROP POLICY IF EXISTS "amendes_update_user" ON amendes;
DROP POLICY IF EXISTS "amendes_delete_user" ON amendes;

CREATE POLICY "amendes_select_user" ON amendes FOR SELECT USING (
  company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
);
CREATE POLICY "amendes_insert_user" ON amendes FOR INSERT WITH CHECK (
  company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
);
CREATE POLICY "amendes_update_user" ON amendes FOR UPDATE
  USING      (company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true))
  WITH CHECK (company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true));
CREATE POLICY "amendes_delete_user" ON amendes FOR DELETE USING (
  company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
);

-- ─────────────────────────────────────────────────────────────
-- maintenance_vehicules — SELECT/INSERT/UPDATE/DELETE
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "maint_select_user" ON maintenance_vehicules;
DROP POLICY IF EXISTS "maint_insert_user" ON maintenance_vehicules;
DROP POLICY IF EXISTS "maint_update_user" ON maintenance_vehicules;
DROP POLICY IF EXISTS "maint_delete_user" ON maintenance_vehicules;

CREATE POLICY "maint_select_user" ON maintenance_vehicules FOR SELECT USING (
  company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
);
CREATE POLICY "maint_insert_user" ON maintenance_vehicules FOR INSERT WITH CHECK (
  company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
);
CREATE POLICY "maint_update_user" ON maintenance_vehicules FOR UPDATE
  USING      (company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true))
  WITH CHECK (company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true));
CREATE POLICY "maint_delete_user" ON maintenance_vehicules FOR DELETE USING (
  company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
);

-- ─────────────────────────────────────────────────────────────
-- ai_conversations — SELECT/INSERT/UPDATE/DELETE
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ai_conv_select_user" ON ai_conversations;
DROP POLICY IF EXISTS "ai_conv_insert_user" ON ai_conversations;
DROP POLICY IF EXISTS "ai_conv_update_user" ON ai_conversations;
DROP POLICY IF EXISTS "ai_conv_delete_user" ON ai_conversations;

CREATE POLICY "ai_conv_select_user" ON ai_conversations FOR SELECT USING (
  company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
);
CREATE POLICY "ai_conv_insert_user" ON ai_conversations FOR INSERT WITH CHECK (
  company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
);
CREATE POLICY "ai_conv_update_user" ON ai_conversations FOR UPDATE
  USING      (company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true))
  WITH CHECK (company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true));
CREATE POLICY "ai_conv_delete_user" ON ai_conversations FOR DELETE USING (
  company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
);

-- ─────────────────────────────────────────────────────────────
-- bot_conversations — SELECT/INSERT/UPDATE/DELETE
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "bot_conv_select_user" ON bot_conversations;
DROP POLICY IF EXISTS "bot_conv_insert_user" ON bot_conversations;
DROP POLICY IF EXISTS "bot_conv_update_user" ON bot_conversations;
DROP POLICY IF EXISTS "bot_conv_delete_user" ON bot_conversations;

CREATE POLICY "bot_conv_select_user" ON bot_conversations FOR SELECT USING (
  company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
);
CREATE POLICY "bot_conv_insert_user" ON bot_conversations FOR INSERT WITH CHECK (
  company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
);
CREATE POLICY "bot_conv_update_user" ON bot_conversations FOR UPDATE
  USING      (company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true))
  WITH CHECK (company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true));
CREATE POLICY "bot_conv_delete_user" ON bot_conversations FOR DELETE USING (
  company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
);

-- ─────────────────────────────────────────────────────────────
-- gmail_tokens — SELECT/INSERT/UPDATE/DELETE
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "gmail_tokens_select_user" ON gmail_tokens;
DROP POLICY IF EXISTS "gmail_tokens_insert_user" ON gmail_tokens;
DROP POLICY IF EXISTS "gmail_tokens_update_user" ON gmail_tokens;
DROP POLICY IF EXISTS "gmail_tokens_delete_user" ON gmail_tokens;

CREATE POLICY "gmail_tokens_select_user" ON gmail_tokens FOR SELECT USING (
  company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
);
CREATE POLICY "gmail_tokens_insert_user" ON gmail_tokens FOR INSERT WITH CHECK (
  company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
);
CREATE POLICY "gmail_tokens_update_user" ON gmail_tokens FOR UPDATE
  USING      (company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true))
  WITH CHECK (company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true));
CREATE POLICY "gmail_tokens_delete_user" ON gmail_tokens FOR DELETE USING (
  company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
);

-- ─────────────────────────────────────────────────────────────
-- audit_log — SELECT (INSERT déjà OK)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "audit_select_user" ON audit_log;
CREATE POLICY "audit_select_user" ON audit_log FOR SELECT USING (
  company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
);

-- ─────────────────────────────────────────────────────────────
-- etats_vehicule — DELETE (autres OK)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ev_delete_user" ON etats_vehicule;
CREATE POLICY "ev_delete_user" ON etats_vehicule FOR DELETE USING (
  company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
);

-- ─────────────────────────────────────────────────────────────
-- messages — DELETE (autres OK)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "messages_delete_user" ON messages;
CREATE POLICY "messages_delete_user" ON messages FOR DELETE USING (
  company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
);

-- ─────────────────────────────────────────────────────────────
-- security_events — SELECT (INSERT déjà OK via "true")
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "sec_select_user" ON security_events;
CREATE POLICY "sec_select_user" ON security_events FOR SELECT USING (
  company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
);

-- ─────────────────────────────────────────────────────────────
-- message_groups — INSERT/UPDATE/DELETE (SELECT OK)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "msg_groups_insert_user" ON message_groups;
DROP POLICY IF EXISTS "msg_groups_update_user" ON message_groups;
DROP POLICY IF EXISTS "msg_groups_delete_user" ON message_groups;

CREATE POLICY "msg_groups_insert_user" ON message_groups FOR INSERT WITH CHECK (
  company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
);
CREATE POLICY "msg_groups_update_user" ON message_groups FOR UPDATE
  USING      (company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true))
  WITH CHECK (company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true));
CREATE POLICY "msg_groups_delete_user" ON message_groups FOR DELETE USING (
  company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
);

-- ─────────────────────────────────────────────────────────────
-- message_group_members — INSERT/UPDATE/DELETE (SELECT OK)
-- Filtrage via le group_id : le groupe doit appartenir à une company
-- du sous-utilisateur.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "msg_group_members_insert_user" ON message_group_members;
DROP POLICY IF EXISTS "msg_group_members_update_user" ON message_group_members;
DROP POLICY IF EXISTS "msg_group_members_delete_user" ON message_group_members;

CREATE POLICY "msg_group_members_insert_user" ON message_group_members FOR INSERT WITH CHECK (
  group_id IN (
    SELECT id FROM message_groups
    WHERE company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
  )
);
CREATE POLICY "msg_group_members_update_user" ON message_group_members FOR UPDATE
  USING (
    group_id IN (
      SELECT id FROM message_groups
      WHERE company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
    )
  )
  WITH CHECK (
    group_id IN (
      SELECT id FROM message_groups
      WHERE company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
    )
  );
CREATE POLICY "msg_group_members_delete_user" ON message_group_members FOR DELETE USING (
  group_id IN (
    SELECT id FROM message_groups
    WHERE company_id IN (SELECT company_id FROM company_users WHERE auth_uid = auth.uid() AND actif = true)
  )
);

-- =======================================================================
-- VÉRIFICATION
--   Toutes les tables business doivent désormais avoir une policy
--   _user pour chaque commande accessible aux sub-users.
-- =======================================================================
