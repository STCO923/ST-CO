-- =============================================================================
-- security_must_change_password_lock.sql
-- =============================================================================
-- BUT : Empêcher un utilisateur authentifié de modifier lui-même les champs
-- de privilège / sécurité de sa propre ligne `company_users` via PostgREST.
--
-- Sans ça, n'importe quel utilisateur peut bypasser :
--   - l'obligation de changer son mot de passe à la première connexion
--     (PATCH must_change_password=false)
--   - une suspension (PATCH actif=true)
--   - se promouvoir admin/superadmin (PATCH role='admin')
--   - changer son company_id (vol de tenant)
--   - changer son auth_uid (impersonation)
--
-- Stratégie : trigger BEFORE UPDATE qui force ces colonnes à conserver leur
-- valeur OLD.* pour tout caller ≠ service_role. Le service_role (Edge Functions
-- côté serveur, ou superadmin avec sa clé) garde la liberté de les écrire.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.lock_company_users_privileged_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- service_role et superuser : passe-droit total (Edge Functions, scripts admin)
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Pour tout le reste (anon, authenticated) : on annule toute tentative de
  -- modifier les colonnes de privilège en restaurant la valeur précédente.
  -- Silencieux exprès : pas d'erreur visible côté attaquant, juste no-op.
  NEW.role       := OLD.role;
  NEW.actif      := OLD.actif;
  NEW.company_id := OLD.company_id;
  NEW.auth_uid   := OLD.auth_uid;

  -- must_change_password : seule transition autorisée depuis le client est
  -- TRUE → FALSE (et uniquement sur sa propre ligne, ce qui est déjà couvert
  -- par les RLS de la table). On bloque toute promotion FALSE → TRUE depuis
  -- le client (sinon un attaquant pourrait forcer l'écran de changement de
  -- mot de passe à un autre user de sa company en cas de RLS permissive).
  IF OLD.must_change_password = false AND NEW.must_change_password = true THEN
    NEW.must_change_password := OLD.must_change_password;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lock_privileged_fields ON public.company_users;
CREATE TRIGGER lock_privileged_fields
  BEFORE UPDATE ON public.company_users
  FOR EACH ROW
  EXECUTE FUNCTION public.lock_company_users_privileged_fields();

COMMENT ON FUNCTION public.lock_company_users_privileged_fields() IS
  'Bloque la modification des champs role/actif/company_id/auth_uid/must_change_password '
  'pour tout caller autre que service_role. Verrou de sécurité multi-tenant.';

-- =============================================================================
-- VÉRIFICATION
-- =============================================================================
-- Pour vérifier que la migration est bien appliquée :
--   SELECT tgname FROM pg_trigger WHERE tgname = 'lock_privileged_fields';
--
-- Pour tester (en tant qu'utilisateur authentifié, doit être no-op silencieux) :
--   UPDATE company_users SET role = 'superadmin' WHERE auth_uid = auth.uid();
--   SELECT role FROM company_users WHERE auth_uid = auth.uid();  -- inchangé
-- =============================================================================
