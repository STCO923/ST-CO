-- ============================================================
-- OPTIMUM TRANS — NETTOYAGE DONNÉES DÉMO
-- Supprime tout ce qu'a inséré demo_seed.sql
-- Colle dans Supabase SQL Editor et clique Run
-- ============================================================

-- 1. Supprimer les tournées démo
DELETE FROM tournees
WHERE client_nom IN ('BIOCOOP ILE-DE-FRANCE','NATURALIA PARIS','COLIS PRIVÉ','DARTY LOGISTIQUE');

-- 2. Supprimer les clients démo
DELETE FROM clients
WHERE nom IN ('BIOCOOP ILE-DE-FRANCE','NATURALIA PARIS','COLIS PRIVÉ','DARTY LOGISTIQUE');

-- 3. Supprimer les commissionnaires démo
DELETE FROM commissionnaires
WHERE nom IN ('COGEPART','ID LOGISTICS');

-- 4. Remettre entreprise à ses valeurs d'origine
UPDATE entreprise
SET coefficient_salarie      = 1.82,
    charges_fixes_mensuelles = 0;
