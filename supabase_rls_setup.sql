-- =======================================================================
-- OPTIMUM TRANS - Script RLS v3 (Row Level Security) Supabase
-- Supprime les policies permissives heritees + corrige iso_insert
-- Tables : planning, tournees, vehicules, chauffeurs, clients,
--          entreprise, factures, points_livraison, tournee_points, sa_companies
-- Executer dans : Supabase -> SQL Editor
-- =======================================================================

-- -----------------------------------------------------------------------
-- ETAPE 1 - Ajouter la colonne company_id sur chaque table
-- (ignore si la colonne existe deja)
-- -----------------------------------------------------------------------

ALTER TABLE planning         ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE tournees         ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE vehicules        ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE chauffeurs       ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE clients          ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE entreprise       ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE factures         ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE points_livraison ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE tournee_points   ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- -----------------------------------------------------------------------
-- ETAPE 2 - Index sur company_id (performances)
-- -----------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_planning_company         ON planning(company_id);
CREATE INDEX IF NOT EXISTS idx_tournees_company         ON tournees(company_id);
CREATE INDEX IF NOT EXISTS idx_vehicules_company        ON vehicules(company_id);
CREATE INDEX IF NOT EXISTS idx_chauffeurs_company       ON chauffeurs(company_id);
CREATE INDEX IF NOT EXISTS idx_clients_company          ON clients(company_id);
CREATE INDEX IF NOT EXISTS idx_entreprise_company       ON entreprise(company_id);
CREATE INDEX IF NOT EXISTS idx_factures_company         ON factures(company_id);
CREATE INDEX IF NOT EXISTS idx_points_livraison_company ON points_livraison(company_id);
CREATE INDEX IF NOT EXISTS idx_tournee_points_company   ON tournee_points(company_id);

-- -----------------------------------------------------------------------
-- ETAPE 3 - Activer RLS sur toutes les tables
-- -----------------------------------------------------------------------

ALTER TABLE planning         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournees         ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicules        ENABLE ROW LEVEL SECURITY;
ALTER TABLE chauffeurs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients          ENABLE ROW LEVEL SECURITY;
ALTER TABLE entreprise       ENABLE ROW LEVEL SECURITY;
ALTER TABLE factures         ENABLE ROW LEVEL SECURITY;
ALTER TABLE points_livraison ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournee_points   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sa_companies     ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------
-- ETAPE 4 - Supprimer TOUTES les policies existantes (y compris heritees)
-- CRITIQUE : "Acces libre*" / "public_all*" / "anon_all" avec USING(true)
-- neutralisent le RLS car les policies sont ORees dans Supabase
-- -----------------------------------------------------------------------

DO $$
DECLARE
  tables TEXT[] := ARRAY[
    'planning','tournees','vehicules','chauffeurs','clients',
    'entreprise','factures','points_livraison','tournee_points'
  ];
  t TEXT;
  pol RECORD;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, t);
    END LOOP;
  END LOOP;
END;
$$;

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sa_companies'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON sa_companies', pol.policyname);
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------
-- ETAPE 5 - Creer les policies d'isolation stricte par company_id
-- SELECT / UPDATE / DELETE : USING (company_id = auth.uid())
-- INSERT                   : WITH CHECK (company_id = auth.uid())
-- -----------------------------------------------------------------------

-- PLANNING
CREATE POLICY "iso_select" ON planning FOR SELECT USING       (company_id = auth.uid());
CREATE POLICY "iso_insert" ON planning FOR INSERT WITH CHECK  (company_id = auth.uid());
CREATE POLICY "iso_update" ON planning FOR UPDATE USING       (company_id = auth.uid());
CREATE POLICY "iso_delete" ON planning FOR DELETE USING       (company_id = auth.uid());

-- TOURNEES
CREATE POLICY "iso_select" ON tournees FOR SELECT USING       (company_id = auth.uid());
CREATE POLICY "iso_insert" ON tournees FOR INSERT WITH CHECK  (company_id = auth.uid());
CREATE POLICY "iso_update" ON tournees FOR UPDATE USING       (company_id = auth.uid());
CREATE POLICY "iso_delete" ON tournees FOR DELETE USING       (company_id = auth.uid());

-- VEHICULES
CREATE POLICY "iso_select" ON vehicules FOR SELECT USING      (company_id = auth.uid());
CREATE POLICY "iso_insert" ON vehicules FOR INSERT WITH CHECK (company_id = auth.uid());
CREATE POLICY "iso_update" ON vehicules FOR UPDATE USING      (company_id = auth.uid());
CREATE POLICY "iso_delete" ON vehicules FOR DELETE USING      (company_id = auth.uid());

-- CHAUFFEURS
CREATE POLICY "iso_select" ON chauffeurs FOR SELECT USING      (company_id = auth.uid());
CREATE POLICY "iso_insert" ON chauffeurs FOR INSERT WITH CHECK (company_id = auth.uid());
CREATE POLICY "iso_update" ON chauffeurs FOR UPDATE USING      (company_id = auth.uid());
CREATE POLICY "iso_delete" ON chauffeurs FOR DELETE USING      (company_id = auth.uid());

-- CLIENTS
CREATE POLICY "iso_select" ON clients FOR SELECT USING       (company_id = auth.uid());
CREATE POLICY "iso_insert" ON clients FOR INSERT WITH CHECK  (company_id = auth.uid());
CREATE POLICY "iso_update" ON clients FOR UPDATE USING       (company_id = auth.uid());
CREATE POLICY "iso_delete" ON clients FOR DELETE USING       (company_id = auth.uid());

-- ENTREPRISE
CREATE POLICY "iso_select" ON entreprise FOR SELECT USING      (company_id = auth.uid());
CREATE POLICY "iso_insert" ON entreprise FOR INSERT WITH CHECK (company_id = auth.uid());
CREATE POLICY "iso_update" ON entreprise FOR UPDATE USING      (company_id = auth.uid());
CREATE POLICY "iso_delete" ON entreprise FOR DELETE USING      (company_id = auth.uid());

-- FACTURES
CREATE POLICY "iso_select" ON factures FOR SELECT USING       (company_id = auth.uid());
CREATE POLICY "iso_insert" ON factures FOR INSERT WITH CHECK  (company_id = auth.uid());
CREATE POLICY "iso_update" ON factures FOR UPDATE USING       (company_id = auth.uid());
CREATE POLICY "iso_delete" ON factures FOR DELETE USING       (company_id = auth.uid());

-- POINTS_LIVRAISON
CREATE POLICY "iso_select" ON points_livraison FOR SELECT USING      (company_id = auth.uid());
CREATE POLICY "iso_insert" ON points_livraison FOR INSERT WITH CHECK (company_id = auth.uid());
CREATE POLICY "iso_update" ON points_livraison FOR UPDATE USING      (company_id = auth.uid());
CREATE POLICY "iso_delete" ON points_livraison FOR DELETE USING      (company_id = auth.uid());

-- TOURNEE_POINTS
CREATE POLICY "iso_select" ON tournee_points FOR SELECT USING      (company_id = auth.uid());
CREATE POLICY "iso_insert" ON tournee_points FOR INSERT WITH CHECK (company_id = auth.uid());
CREATE POLICY "iso_update" ON tournee_points FOR UPDATE USING      (company_id = auth.uid());
CREATE POLICY "iso_delete" ON tournee_points FOR DELETE USING      (company_id = auth.uid());

-- SA_COMPANIES
-- SELECT : client lit sa propre ligne OU requete anon (refresh session + superadmin)
-- INSERT/UPDATE/DELETE : uniquement via cle anon (superadmin.html)
CREATE POLICY "iso_select" ON sa_companies
  FOR SELECT USING (
    id = auth.uid()
    OR auth.uid() IS NULL
  );

CREATE POLICY "sa_insert_own" ON sa_companies
  FOR INSERT WITH CHECK (auth.uid() IS NULL);

CREATE POLICY "sa_update_own" ON sa_companies
  FOR UPDATE USING (auth.uid() IS NULL);

CREATE POLICY "sa_delete_own" ON sa_companies
  FOR DELETE USING (auth.uid() IS NULL);

-- -----------------------------------------------------------------------
-- ETAPE 6 - Migrer les donnees existantes (a executer une seule fois)
-- Remplacer VOTRE-UUID-ICI par l'UUID de votre compte admin
-- Pour trouver votre UUID : SELECT id FROM auth.users WHERE email = 'votre@email.com';
-- Decommenter le bloc ci-dessous APRES avoir remplace l'UUID
-- -----------------------------------------------------------------------

/*
DO $$
DECLARE admin_uid UUID := 'VOTRE-UUID-ICI';
BEGIN
  UPDATE planning         SET company_id = admin_uid WHERE company_id IS NULL;
  UPDATE tournees         SET company_id = admin_uid WHERE company_id IS NULL;
  UPDATE vehicules        SET company_id = admin_uid WHERE company_id IS NULL;
  UPDATE chauffeurs       SET company_id = admin_uid WHERE company_id IS NULL;
  UPDATE clients          SET company_id = admin_uid WHERE company_id IS NULL;
  UPDATE entreprise       SET company_id = admin_uid WHERE company_id IS NULL;
  UPDATE factures         SET company_id = admin_uid WHERE company_id IS NULL;
  UPDATE points_livraison SET company_id = admin_uid WHERE company_id IS NULL;
  UPDATE tournee_points   SET company_id = admin_uid WHERE company_id IS NULL;
END;
$$;
*/

-- -----------------------------------------------------------------------
-- ETAPE 7 - Tarification client enrichie (salaires par client, par type de jour)
-- Remplace l'ancien modèle "tarif unique par chauffeur"
-- -----------------------------------------------------------------------
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tarif_ferie      NUMERIC DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS salaire_ch_sem   NUMERIC DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS salaire_ch_dim   NUMERIC DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS salaire_ch_ferie NUMERIC DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS salaire_st_sem   NUMERIC DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS salaire_st_dim   NUMERIC DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS salaire_st_ferie NUMERIC DEFAULT 0;

-- -----------------------------------------------------------------------
-- ETAPE 7 - Verification : doit retourner exactement 40 policies
-- 9 tables x 4 policies = 36  +  sa_companies 4 policies = 40 total
-- Aucune ligne ne doit avoir qual = 'true' ou contenir 'libre'/'public'/'anon'
-- -----------------------------------------------------------------------

SELECT
  tablename,
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;
