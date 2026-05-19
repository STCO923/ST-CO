-- =======================================================================
-- OPTIMUM TRANS - Migration Mon Marché (MS Express)
-- Table : monmarche_shifts — stocke le planning hebdomadaire Mon Marché
-- Chaque ligne = 1 shift avec 14 slots (7 jours × AM/PM)
-- Exécuter dans : Supabase → SQL Editor
-- =======================================================================

-- -----------------------------------------------------------------------
-- ETAPE 1 - Créer la table monmarche_shifts
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS monmarche_shifts (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  semaine_debut DATE NOT NULL,               -- lundi de la semaine (ex: 2026-04-06)
  zone_nom      TEXT NOT NULL DEFAULT 'THIAIS MMP',  -- nom de la zone/dépôt
  ordre         INT  NOT NULL DEFAULT 0,     -- position dans le tableau (0 = première ligne)
  vehicule_id   UUID,                        -- véhicule assigné par MS Express
  slots         JSONB NOT NULL DEFAULT '{}', -- données de chaque créneau
  -- Structure slots JSON :
  -- {
  --   "lun_am": { "chauffeur": null, "debut": "06:45", "fin": "14:00", "tournee_id": null },
  --   "lun_pm": { "chauffeur": null, "debut": "14:00", "fin": "22:00", "tournee_id": null },
  --   "mar_am": { ... }, "mar_pm": { ... },
  --   "mer_am": { ... }, "mer_pm": { ... },
  --   "jeu_am": { ... }, "jeu_pm": { ... },
  --   "ven_am": { ... }, "ven_pm": { ... },
  --   "sam_am": { ... }, "sam_pm": { ... },
  --   "dim_am": { ... }, "dim_pm": { ... }
  -- }
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------
-- ETAPE 2 - Index pour les performances
-- -----------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_monmarche_company
  ON monmarche_shifts(company_id);

CREATE INDEX IF NOT EXISTS idx_monmarche_semaine
  ON monmarche_shifts(company_id, semaine_debut);

CREATE INDEX IF NOT EXISTS idx_monmarche_ordre
  ON monmarche_shifts(company_id, semaine_debut, ordre);

-- -----------------------------------------------------------------------
-- ETAPE 3 - Activer RLS (Row Level Security)
-- -----------------------------------------------------------------------

ALTER TABLE monmarche_shifts ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------
-- ETAPE 4 - Politiques RLS (isolation par company_id)
-- -----------------------------------------------------------------------

DROP POLICY IF EXISTS "iso_select" ON monmarche_shifts;
DROP POLICY IF EXISTS "iso_insert" ON monmarche_shifts;
DROP POLICY IF EXISTS "iso_update" ON monmarche_shifts;
DROP POLICY IF EXISTS "iso_delete" ON monmarche_shifts;

CREATE POLICY "iso_select" ON monmarche_shifts
  FOR SELECT USING (company_id = auth.uid());

CREATE POLICY "iso_insert" ON monmarche_shifts
  FOR INSERT WITH CHECK (company_id = auth.uid());

CREATE POLICY "iso_update" ON monmarche_shifts
  FOR UPDATE USING (company_id = auth.uid());

CREATE POLICY "iso_delete" ON monmarche_shifts
  FOR DELETE USING (company_id = auth.uid());

-- -----------------------------------------------------------------------
-- ETAPE 5 - Trigger updated_at automatique
-- -----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_monmarche_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_monmarche_updated_at ON monmarche_shifts;

CREATE TRIGGER trg_monmarche_updated_at
  BEFORE UPDATE ON monmarche_shifts
  FOR EACH ROW EXECUTE FUNCTION update_monmarche_updated_at();

-- -----------------------------------------------------------------------
-- FIN DU SCRIPT
-- -----------------------------------------------------------------------
-- Note : Le nom du client dans la table tournees sera 'Mon Marché'
-- Assurez-vous que ce client existe dans la table clients avec les taux
-- salaire et facturation correctement configurés avant de synchroniser.
-- =======================================================================
