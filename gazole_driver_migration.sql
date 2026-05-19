-- =======================================================================
-- OPTIMUM TRANS — Migration : Onglet Gazole Chauffeur
-- Ajoute les colonnes ticket_photo et saisie_par à la table gazole_pleins
-- Exécuter dans : Supabase → SQL Editor
-- =======================================================================

-- 1. Ajouter la colonne ticket_photo (stockage base64 de la photo du ticket)
ALTER TABLE gazole_pleins
  ADD COLUMN IF NOT EXISTS ticket_photo TEXT;

-- 2. Ajouter la colonne saisie_par (origine de la saisie : 'admin' ou 'chauffeur')
ALTER TABLE gazole_pleins
  ADD COLUMN IF NOT EXISTS saisie_par TEXT DEFAULT 'admin';

-- 3. S'assurer que la table gazole_pleins a RLS activé
ALTER TABLE gazole_pleins ENABLE ROW LEVEL SECURITY;

-- 4. Supprimer les anciennes policies si elles existent
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gazole_pleins'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON gazole_pleins', pol.policyname);
  END LOOP;
END;
$$;

-- 5. Créer les policies d'isolation stricte par company_id
--    (les chauffeurs s'authentifient avec le JWT de l'entreprise,
--     donc auth.uid() = company_id pour admin ET chauffeurs)

CREATE POLICY "gz_iso_select" ON gazole_pleins
  FOR SELECT USING (company_id = auth.uid());

CREATE POLICY "gz_iso_insert" ON gazole_pleins
  FOR INSERT WITH CHECK (company_id = auth.uid());

CREATE POLICY "gz_iso_update" ON gazole_pleins
  FOR UPDATE USING (company_id = auth.uid());

CREATE POLICY "gz_iso_delete" ON gazole_pleins
  FOR DELETE USING (company_id = auth.uid());

-- 6. Index sur company_id pour les performances
CREATE INDEX IF NOT EXISTS idx_gazole_pleins_company
  ON gazole_pleins(company_id);

CREATE INDEX IF NOT EXISTS idx_gazole_pleins_chauffeur
  ON gazole_pleins(company_id, chauffeur);

-- =======================================================================
-- FIN DE MIGRATION
-- Résumé des changements :
--   • gazole_pleins.ticket_photo  TEXT  — photo base64 du ticket gazole
--   • gazole_pleins.saisie_par    TEXT  — 'admin' ou 'chauffeur'
--   • RLS activé et policies iso company_id
-- =======================================================================
