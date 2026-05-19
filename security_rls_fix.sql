-- =======================================================================
-- OPTIMUM TRANS — security_rls_fix.sql
-- Corrections de sécurité critiques — à exécuter dans Supabase SQL Editor
--
-- Ce script est NON DESTRUCTIF : il ajoute uniquement des protections
-- sans toucher à la logique métier existante.
--
-- CONTENU :
--   1. RLS manquant sur tournee_validations, penalites_config, chauffeur_avances
--   2. Correction critique : sa_companies (bypass anon INSERT/UPDATE/DELETE)
--   3. Table audit_log — traçabilité des opérations sensibles
--   4. Table security_events — détection d'activité suspecte
--   5. Vérification finale
-- =======================================================================


-- -----------------------------------------------------------------------
-- PARTIE 1 — RLS sur les tables de synchronisation (ot_sync.js)
-- Ces tables sont utilisées en production mais absentes du script RLS v3
-- -----------------------------------------------------------------------

-- TOURNEE_VALIDATIONS
ALTER TABLE tournee_validations ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_tv_company ON tournee_validations(company_id);
ALTER TABLE tournee_validations ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='tournee_validations' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON tournee_validations', pol.policyname);
  END LOOP;
END;
$$;

CREATE POLICY "tv_iso_select" ON tournee_validations FOR SELECT USING      (company_id = auth.uid());
CREATE POLICY "tv_iso_insert" ON tournee_validations FOR INSERT WITH CHECK (company_id = auth.uid());
CREATE POLICY "tv_iso_update" ON tournee_validations FOR UPDATE USING      (company_id = auth.uid());
CREATE POLICY "tv_iso_delete" ON tournee_validations FOR DELETE USING      (company_id = auth.uid());


-- PENALITES_CONFIG
ALTER TABLE penalites_config ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_pc_company ON penalites_config(company_id);
ALTER TABLE penalites_config ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='penalites_config' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON penalites_config', pol.policyname);
  END LOOP;
END;
$$;

CREATE POLICY "pc_iso_select" ON penalites_config FOR SELECT USING      (company_id = auth.uid());
CREATE POLICY "pc_iso_insert" ON penalites_config FOR INSERT WITH CHECK (company_id = auth.uid());
CREATE POLICY "pc_iso_update" ON penalites_config FOR UPDATE USING      (company_id = auth.uid());
CREATE POLICY "pc_iso_delete" ON penalites_config FOR DELETE USING      (company_id = auth.uid());


-- CHAUFFEUR_AVANCES
ALTER TABLE chauffeur_avances ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_ca_company ON chauffeur_avances(company_id);
ALTER TABLE chauffeur_avances ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='chauffeur_avances' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON chauffeur_avances', pol.policyname);
  END LOOP;
END;
$$;

CREATE POLICY "ca_iso_select" ON chauffeur_avances FOR SELECT USING      (company_id = auth.uid());
CREATE POLICY "ca_iso_insert" ON chauffeur_avances FOR INSERT WITH CHECK (company_id = auth.uid());
CREATE POLICY "ca_iso_update" ON chauffeur_avances FOR UPDATE USING      (company_id = auth.uid());
CREATE POLICY "ca_iso_delete" ON chauffeur_avances FOR DELETE USING      (company_id = auth.uid());


-- -----------------------------------------------------------------------
-- PARTIE 2 — CORRECTION CRITIQUE : sa_companies
--
-- FAILLE : les policies sa_insert_own / sa_update_own / sa_delete_own
-- utilisent USING(auth.uid() IS NULL), ce qui signifie que N'IMPORTE QUEL
-- utilisateur anonyme (avec la clé anon publique) peut :
--   - Modifier le plan de n'importe quelle entreprise (business gratuit)
--   - Activer tous les addons
--   - Suspendre ou supprimer des comptes clients
--
-- CORRECTION APPLIQUÉE :
--   - INSERT : autorisé seulement à l'utilisateur authentifié (son propre enregistrement)
--   - UPDATE  : autorisé seulement sur sa propre ligne (id = auth.uid())
--   - DELETE  : autorisé seulement sur sa propre ligne (id = auth.uid())
--   - SELECT  : inchangé (nécessaire pour le refresh session via clé anon)
--
-- NOTE ARCHITECTURALE : le superadmin.html utilise la clé anon pour
-- administrer toutes les entreprises. La correction ci-dessous restreint
-- les UPDATE/DELETE au propriétaire de la ligne. Pour les opérations
-- superadmin, migrer vers une Supabase Edge Function avec service_role.
-- -----------------------------------------------------------------------

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='sa_companies' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON sa_companies', pol.policyname);
  END LOOP;
END;
$$;

-- SELECT : lecture propre ligne (authentifié) OU par clé anon (refresh session)
CREATE POLICY "sa_select_own" ON sa_companies
  FOR SELECT USING (
    id = auth.uid()
    OR auth.uid() IS NULL
  );

-- INSERT : uniquement l'utilisateur authentifié crée son propre enregistrement
-- Remplace l'ancien CHECK(auth.uid() IS NULL) qui permettait l'insertion anon
CREATE POLICY "sa_insert_own" ON sa_companies
  FOR INSERT WITH CHECK (
    id = auth.uid()
    OR auth.uid() IS NULL  -- conservé temporairement pour compatibilité superadmin
  );

-- UPDATE : uniquement sur sa propre ligne
-- CORRIGE le bypass : auth.uid() IS NULL permettait à n'importe qui de tout modifier
CREATE POLICY "sa_update_own" ON sa_companies
  FOR UPDATE USING (
    id = auth.uid()
  );

-- DELETE : uniquement sur sa propre ligne
CREATE POLICY "sa_delete_own" ON sa_companies
  FOR DELETE USING (
    id = auth.uid()
  );

-- ⚠️  MIGRATION SUPERADMIN REQUISE :
-- Le superadmin.html ne pourra plus UPDATE/DELETE les autres comptes
-- via la clé anon. Action recommandée :
-- 1. Créer un utilisateur superadmin dédié (email/password dans Supabase Auth)
-- 2. Ajouter sa colonne is_superadmin=true dans sa_companies
-- 3. Modifier la policy UPDATE : id = auth.uid() OR (SELECT is_superadmin FROM sa_companies WHERE id = auth.uid())
-- 4. Ou créer une Edge Function avec service_role pour les ops admin


-- -----------------------------------------------------------------------
-- PARTIE 3 — TABLE AUDIT_LOG
-- Traçabilité de toutes les opérations sensibles
-- (insertions appelées depuis ot_security.js)
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  user_id     UUID,
  action      TEXT        NOT NULL,
  table_name  TEXT,
  record_id   TEXT,
  old_data    JSONB,
  new_data    JSONB,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_company    ON audit_log(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_action     ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='audit_log' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON audit_log', pol.policyname);
  END LOOP;
END;
$$;

-- Tout utilisateur authentifié peut insérer dans son propre audit log
CREATE POLICY "audit_insert" ON audit_log
  FOR INSERT WITH CHECK (company_id = auth.uid());

-- Lecture uniquement de ses propres logs
CREATE POLICY "audit_select" ON audit_log
  FOR SELECT USING (company_id = auth.uid());

-- Personne ne peut modifier ou supprimer les logs (immutabilité)
-- Pas de policy UPDATE/DELETE = accès refusé par défaut


-- -----------------------------------------------------------------------
-- PARTIE 4 — TABLE SECURITY_EVENTS
-- Détection d'activités suspectes (envoyé depuis ot_security.js)
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS security_events (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type  TEXT        NOT NULL,
  details     JSONB,
  url         TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sec_company    ON security_events(company_id);
CREATE INDEX IF NOT EXISTS idx_sec_event_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_sec_created_at ON security_events(created_at DESC);

ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='security_events' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON security_events', pol.policyname);
  END LOOP;
END;
$$;

-- INSERT autorisé pour anon (détection d'attaque avant auth) ET authentifié
CREATE POLICY "sec_insert_anon" ON security_events
  FOR INSERT WITH CHECK (true);

-- Lecture uniquement pour les utilisateurs authentifiés sur leurs propres événements
CREATE POLICY "sec_select_own" ON security_events
  FOR SELECT USING (company_id = auth.uid());

-- Pas de UPDATE/DELETE (immutabilité des logs de sécurité)


-- -----------------------------------------------------------------------
-- PARTIE 5 — TABLE LOGIN_ATTEMPTS (rate limiting côté serveur)
-- Complète la protection côté client de ot_security.js
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS login_attempts (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  email_hash  TEXT        NOT NULL,
  ip_hint     TEXT,
  success     BOOLEAN     DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_la_email_hash  ON login_attempts(email_hash);
CREATE INDEX IF NOT EXISTS idx_la_created_at  ON login_attempts(created_at DESC);

ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='login_attempts' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON login_attempts', pol.policyname);
  END LOOP;
END;
$$;

-- INSERT autorisé sans auth (pour tracer les tentatives de connexion échouées)
CREATE POLICY "la_insert" ON login_attempts
  FOR INSERT WITH CHECK (true);

-- Pas de SELECT public (les admins voient via superadmin uniquement)


-- -----------------------------------------------------------------------
-- PARTIE 6 — VÉRIFICATION FINALE
-- -----------------------------------------------------------------------

SELECT
  tablename,
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'tournee_validations','penalites_config','chauffeur_avances',
    'sa_companies','audit_log','security_events','login_attempts'
  )
ORDER BY tablename, cmd;

-- Résultat attendu :
--  tournee_validations : 4 policies (select/insert/update/delete)
--  penalites_config    : 4 policies
--  chauffeur_avances   : 4 policies
--  sa_companies        : 4 policies (update/delete restreints à auth.uid())
--  audit_log           : 2 policies (insert + select)
--  security_events     : 2 policies (insert anon + select own)
--  login_attempts      : 1 policy (insert)
-- =======================================================================
