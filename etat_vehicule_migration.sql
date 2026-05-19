-- MIGRATION : Addon État des Lieux Véhicules
-- Exécuter dans Supabase SQL Editor

-- 1. Table principale
CREATE TABLE IF NOT EXISTS etats_vehicule (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id       uuid NOT NULL,
  chauffeur_id     uuid,
  chauffeur_nom    text NOT NULL,
  vehicule_immat   text,
  type             text NOT NULL CHECK (type IN ('depart','retour')),
  date_heure       timestamptz DEFAULT now(),
  km               integer,
  gps_lat          double precision,
  gps_lng          double precision,
  gps_adresse      text,
  photo_avant      text,
  photo_arriere    text,
  photo_gauche     text,
  photo_droite     text,
  photo_interieur  text,
  notes            text,
  ia_analyse       jsonb,
  created_at       timestamptz DEFAULT now()
);

-- 2. RLS
ALTER TABLE etats_vehicule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ev_select" ON etats_vehicule
  FOR SELECT USING (company_id = auth.uid() OR
    EXISTS (SELECT 1 FROM company_users WHERE auth_uid = auth.uid() AND company_id = etats_vehicule.company_id AND actif = true));

CREATE POLICY "ev_insert" ON etats_vehicule
  FOR INSERT WITH CHECK (company_id = auth.uid() OR
    EXISTS (SELECT 1 FROM company_users WHERE auth_uid = auth.uid() AND company_id = etats_vehicule.company_id AND actif = true));

CREATE POLICY "ev_update" ON etats_vehicule
  FOR UPDATE USING (company_id = auth.uid() OR
    EXISTS (SELECT 1 FROM company_users WHERE auth_uid = auth.uid() AND company_id = etats_vehicule.company_id AND actif = true));

CREATE POLICY "ev_delete" ON etats_vehicule
  FOR DELETE USING (company_id = auth.uid());

-- Index
CREATE INDEX IF NOT EXISTS etats_vehicule_company_date ON etats_vehicule (company_id, date_heure DESC);
CREATE INDEX IF NOT EXISTS etats_vehicule_chauffeur ON etats_vehicule (company_id, chauffeur_nom);

-- 3. Colonne addon sur sa_companies
ALTER TABLE sa_companies ADD COLUMN IF NOT EXISTS addon_etat_vehicule BOOLEAN DEFAULT false;
COMMENT ON COLUMN sa_companies.addon_etat_vehicule IS 'Addon État des Lieux Véhicules — photos horodatées départ/retour (+19,99€/mois)';

-- 4. Colonne api_key_claude (stockage clé IA — chiffrée côté app)
ALTER TABLE sa_companies ADD COLUMN IF NOT EXISTS api_key_claude text;
COMMENT ON COLUMN sa_companies.api_key_claude IS 'Clé API Claude pour analyse IA des dommages';
