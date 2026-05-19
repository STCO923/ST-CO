-- =======================================================================
-- OPTIMUM TRANS — Fix : RLS récursion infinie sur message_groups
--
-- Bug : la policy `msg_groups_member_read` sur message_groups référence
-- message_group_members (via JOIN). La policy `msg_group_members_read`
-- sur message_group_members re-référence message_groups (sous-requête).
-- Résultat : « infinite recursion detected in policy for relation
-- "message_groups" » → tout INSERT (avec Prefer: return=representation)
-- échoue car PostgREST fait INSERT + SELECT en une opération, et le
-- SELECT déclenche toutes les policies USING.
--
-- Fix : remplacer les policies récursives par des appels à des fonctions
-- SECURITY DEFINER qui contournent RLS, ce qui casse la boucle.
--
-- Bonus : élargir la contrainte CHECK sur messages.sender_role pour
-- accepter `chef_equipe` (le code JS l'envoie déjà).
--
-- Exécuter dans : Supabase → SQL Editor
-- =======================================================================

-- ── 1. Helpers SECURITY DEFINER ────────────────────────────────────
CREATE OR REPLACE FUNCTION public._ot_msg_user_company_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT company_id
  FROM company_users
  WHERE auth_uid = auth.uid()
    AND actif = true;
$$;

CREATE OR REPLACE FUNCTION public._ot_msg_user_can_see_group(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM message_groups mg
    WHERE mg.id = p_group_id
      AND (
        mg.company_id = auth.uid()
        OR mg.company_id IN (
          SELECT company_id FROM company_users
          WHERE auth_uid = auth.uid() AND actif = true
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public._ot_msg_user_company_ids() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public._ot_msg_user_can_see_group(uuid) TO authenticated, anon;

-- ── 2. Réécriture des policies sur message_groups ──────────────────
DROP POLICY IF EXISTS "msg_groups_member_read" ON message_groups;
DROP POLICY IF EXISTS "msg_groups_chef_read"   ON message_groups;

-- Lecture pour les chefs/chauffeurs : leur entreprise (via fonction)
CREATE POLICY "msg_groups_user_read" ON message_groups
  FOR SELECT
  USING (company_id IN (SELECT public._ot_msg_user_company_ids()));

-- ── 3. Réécriture de la policy sur message_group_members ───────────
DROP POLICY IF EXISTS "msg_group_members_read" ON message_group_members;

CREATE POLICY "msg_group_members_read" ON message_group_members
  FOR SELECT
  USING (public._ot_msg_user_can_see_group(group_id));

-- ── 4. Élargir le CHECK sender_role pour chef_equipe ───────────────
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_role_check;
ALTER TABLE messages ADD CONSTRAINT messages_sender_role_check
  CHECK (sender_role IN ('admin', 'chauffeur', 'chef_equipe'));

-- =======================================================================
-- VÉRIFICATION
--   SELECT policyname, cmd FROM pg_policies
--   WHERE tablename IN ('message_groups','message_group_members')
--   ORDER BY tablename, policyname;
-- =======================================================================
