-- ════════════════════════════════════════════════════════════════════
-- MIGRATION : 5e mode de facturation client « À la zone »
-- ════════════════════════════════════════════════════════════════════
--
-- Cas d'usage : facturer une tournée comme suit :
--   CA = nb_points × tarif/point de la zone correspondant au code postal
--        de livraison saisi sur la tournée.
--
-- Ce mode réutilise les tables existantes du Décompte ST (Delifresh) :
--   - decompte_st_zones        : (company_id, zone TEXT, tarif NUMERIC)
--   - decompte_st_city_zones   : (company_id, ville TEXT NOT NULL,
--                                cp_prefix TEXT, zone INTEGER)
-- Ces tables sont créées idempotement avec EXACTEMENT le schéma utilisé
-- par l'addon Décompte ST en prod, pour permettre à une compagnie qui
-- n'a jamais eu addon_decompte_st d'utiliser addon_zone seul (les deux
-- addons sont indépendants mais partagent les données).
--
-- IMPORTANT — divergences de typage avec le bon sens :
--   `decompte_st_zones.zone` est TEXT mais
--   `decompte_st_city_zones.zone` est INTEGER (héritage de l'addon
--   Décompte ST). Le code JS gère ces 2 types via String(d.zone).
--
-- Idempotent : ALTER … IF NOT EXISTS, CREATE TABLE IF NOT EXISTS,
-- DROP POLICY IF EXISTS avant CREATE POLICY.
--
-- Exécuter dans Supabase → SQL Editor une seule fois.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. Addon flag sur sa_companies ───────────────────────────────────
ALTER TABLE sa_companies
  ADD COLUMN IF NOT EXISTS addon_zone BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN sa_companies.addon_zone IS
  'Addon Facturation par zone (5e mode type_paiement client = ''zone''). Active l''onglet Zones dans Paramètres et l''option ''À la zone'' dans le formulaire client. Réutilise decompte_st_zones / decompte_st_city_zones.';

-- ── 2. Ville + Code postal de livraison sur tournees ───────────────
-- Les 2 sont saisis par tournée pour les clients en mode 'zone'.
-- La ville est PRIORITAIRE pour la résolution de zone car les
-- préfixes CP de plusieurs depts (78, 91, 92, 93, 94) couvrent
-- plusieurs zones — le préfixe seul est ambigu.
ALTER TABLE tournees
  ADD COLUMN IF NOT EXISTS code_postal_livraison TEXT;

COMMENT ON COLUMN tournees.code_postal_livraison IS
  'Code postal de livraison saisi par tournée pour les clients en mode ''zone''. Fallback de résolution si la ville n''est pas mappée.';

ALTER TABLE tournees
  ADD COLUMN IF NOT EXISTS ville_livraison TEXT;

COMMENT ON COLUMN tournees.ville_livraison IS
  '[LEGACY] Ville unique de livraison — remplacé par zone_lines pour les nouvelles tournées multi-villes. Conservé pour rétro-compat des anciennes tournées.';

ALTER TABLE tournees
  ADD COLUMN IF NOT EXISTS zone_lines JSONB;

COMMENT ON COLUMN tournees.zone_lines IS
  'Lignes de zone par tournée (multi-villes). Format : [{ville, nb_points_estime, nb_points_reel}, ...]. Une tournée DELIFRESH peut livrer Argenteuil + Saint-Denis + Eaubonne en un trajet — chaque ville a sa zone et son nb de points. nb_points_estime/reel sur la tournée = somme des lignes (rétro-compat).';

-- ── 3. Tables zone (idempotent — créées si addon_decompte_st absent) ─
-- IMPORTANT : schéma EXACTEMENT aligné avec la prod (Décompte ST).
CREATE TABLE IF NOT EXISTS public.decompte_st_zones (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  zone        TEXT         NOT NULL,
  tarif       NUMERIC      DEFAULT 0,
  created_at  TIMESTAMPTZ  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decompte_st_zones_company
  ON public.decompte_st_zones(company_id);

CREATE TABLE IF NOT EXISTS public.decompte_st_city_zones (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ville       TEXT        NOT NULL,
  cp_prefix   TEXT,
  zone        INTEGER     NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decompte_st_city_zones_company
  ON public.decompte_st_city_zones(company_id);

-- ── 4. RLS — policy unique FOR ALL (alignée sur la prod existante) ──
ALTER TABLE public.decompte_st_zones      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decompte_st_city_zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "decompte_st_zones_company"      ON public.decompte_st_zones;
DROP POLICY IF EXISTS "decompte_st_city_zones_company" ON public.decompte_st_city_zones;

CREATE POLICY "decompte_st_zones_company" ON public.decompte_st_zones
  FOR ALL
  USING      (company_id::text = auth.uid()::text
              OR company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.auth_uid = auth.uid()))
  WITH CHECK (company_id::text = auth.uid()::text
              OR company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.auth_uid = auth.uid()));

CREATE POLICY "decompte_st_city_zones_company" ON public.decompte_st_city_zones
  FOR ALL
  USING      (company_id::text = auth.uid()::text
              OR company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.auth_uid = auth.uid()))
  WITH CHECK (company_id::text = auth.uid()::text
              OR company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.auth_uid = auth.uid()));

-- ════════════════════════════════════════════════════════════════════
-- FIN MIGRATION
-- ════════════════════════════════════════════════════════════════════
