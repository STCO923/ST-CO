-- ════════════════════════════════════════════════════════════════════
-- MIGRATION : Mode de facturation « Forfait + Dépassement à la minute »
-- ════════════════════════════════════════════════════════════════════
--
-- Cas d'usage : tournées fixes avec forfait garanti pour X heures.
--   - Si la tournée se termine AVANT la durée du forfait → forfait complet
--     (le forfait est garanti, le chauffeur ne peut pas sous-facturer).
--   - Si la tournée DÉPASSE la durée du forfait → forfait + (minutes
--     supplémentaires × tarif/min). Pas de tolérance.
--
-- Triple grille de tarifs : semaine / dimanche / férié, AM ≠ PM.
-- Les heures incluses sont stockées en MINUTES (integer) pour la précision.
--
-- Exécuter cette migration une seule fois sur la base Supabase de
-- production (les ALTER … IF NOT EXISTS la rendent idempotente).
-- ════════════════════════════════════════════════════════════════════

-- ── 1. Colonnes sur la table clients ─────────────────────────────────
-- Forfait € (semaine)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS forfait_montant_am          NUMERIC(10,2);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS forfait_montant_pm          NUMERIC(10,2);
-- Forfait € (dimanche)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS forfait_montant_dim_am      NUMERIC(10,2);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS forfait_montant_dim_pm      NUMERIC(10,2);
-- Forfait € (férié)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS forfait_montant_ferie_am    NUMERIC(10,2);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS forfait_montant_ferie_pm    NUMERIC(10,2);

-- Heures incluses (stockées en minutes pour précision : 6h00 = 360, 4h30 = 270)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS forfait_minutes_am          INTEGER;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS forfait_minutes_pm          INTEGER;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS forfait_minutes_dim_am      INTEGER;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS forfait_minutes_dim_pm      INTEGER;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS forfait_minutes_ferie_am    INTEGER;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS forfait_minutes_ferie_pm    INTEGER;

-- Tarif € / minute de dépassement
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tarif_minute_depass_am          NUMERIC(8,4);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tarif_minute_depass_pm          NUMERIC(8,4);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tarif_minute_depass_dim_am      NUMERIC(8,4);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tarif_minute_depass_dim_pm      NUMERIC(8,4);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tarif_minute_depass_ferie_am    NUMERIC(8,4);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tarif_minute_depass_ferie_pm    NUMERIC(8,4);

-- ── 2. Colonnes sur la table tournees ────────────────────────────────
-- La colonne `heure` existante = heure de début estimée historique. On
-- ajoute des colonnes dédiées au mode forfait pour ne pas mélanger.
ALTER TABLE tournees ADD COLUMN IF NOT EXISTS heure_debut_estime  TIME;
ALTER TABLE tournees ADD COLUMN IF NOT EXISTS heure_fin_estime    TIME;
ALTER TABLE tournees ADD COLUMN IF NOT EXISTS heure_debut_reel    TIME;
ALTER TABLE tournees ADD COLUMN IF NOT EXISTS heure_fin_reel      TIME;

-- ── 3. RPC : saisie chauffeur des heures début/fin réelles ───────────
-- Le chauffeur ne peut pas modifier après avoir saisi (cohérent avec
-- update_tournee_real_value pour points/heures). L'admin pourra
-- modifier via PATCH classique sur la table.
CREATE OR REPLACE FUNCTION update_tournee_real_hours(
  p_tournee_id UUID,
  p_company_id UUID,
  p_debut      TIME,
  p_fin        TIME
)
RETURNS tournees
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row tournees;
  v_existing_debut TIME;
  v_existing_fin   TIME;
BEGIN
  -- Vérification d'appartenance + lecture de l'état actuel
  SELECT heure_debut_reel, heure_fin_reel
    INTO v_existing_debut, v_existing_fin
    FROM tournees
   WHERE id = p_tournee_id
     AND company_id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournée introuvable';
  END IF;

  -- Une fois saisi, le chauffeur ne peut plus modifier (admin uniquement)
  IF v_existing_debut IS NOT NULL OR v_existing_fin IS NOT NULL THEN
    RAISE EXCEPTION 'Heures réelles déjà saisies, contactez votre admin pour modifier';
  END IF;

  IF p_debut IS NULL OR p_fin IS NULL THEN
    RAISE EXCEPTION 'Heure début et heure fin requises';
  END IF;

  UPDATE tournees
     SET heure_debut_reel = p_debut,
         heure_fin_reel   = p_fin
   WHERE id = p_tournee_id
     AND company_id = p_company_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION update_tournee_real_hours(UUID, UUID, TIME, TIME) TO authenticated, anon;

-- ════════════════════════════════════════════════════════════════════
-- FIN MIGRATION
-- ════════════════════════════════════════════════════════════════════
