-- Migration : Prix personnalisé par client (override du prix forfait)
-- Permet au superadmin de fixer un prix manuel pour un client donné,
-- indépendamment du prix calculé du forfait + addons.
--
-- Quand `custom_price` IS NULL → utiliser le prix calculé `price`.
-- Quand `custom_price` IS NOT NULL → ce montant remplace `price` pour
-- l'affichage MRR, la liste entreprises et la facturation.

ALTER TABLE public.sa_companies
  ADD COLUMN IF NOT EXISTS custom_price NUMERIC(10,2) NULL;

COMMENT ON COLUMN public.sa_companies.custom_price IS
  'Prix mensuel personnalisé (override) — même base que la colonne price. NULL = utiliser le prix calculé du plan + addons.';
