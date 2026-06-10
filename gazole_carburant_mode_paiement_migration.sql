-- ============================================================
-- ST CO — Alignement schéma gazole_pleins sur Optimum Trans
-- ------------------------------------------------------------
-- Contexte : OT a ajouté deux colonnes à gazole_pleins (carburant,
-- mode_paiement) après le clonage de ST CO. La synchro OT -> ST CO
-- rejetait alors toutes les lignes ("Could not find the 'carburant'
-- column ... in the schema cache"), bloquant juin 2026.
-- Ce script remet ST CO à l'identique d'OT.
-- ============================================================

ALTER TABLE gazole_pleins ADD COLUMN IF NOT EXISTS carburant     text DEFAULT 'gazole';
ALTER TABLE gazole_pleins ADD COLUMN IF NOT EXISTS mode_paiement text DEFAULT 'carte';

-- Recharge le cache de schéma de l'API REST (sinon l'Edge Function
-- ne "voit" pas les nouvelles colonnes tout de suite).
NOTIFY pgrst, 'reload schema';
