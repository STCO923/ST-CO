-- =======================================================================
-- OPTIMUM TRANS — Migration : Purge automatique driver_positions_history
-- Supprime les positions GPS de plus de 30 jours pour limiter la taille
-- de la table (plan Supabase gratuit = 500 MB de base de données).
-- Exécuter dans : Supabase → SQL Editor
-- =======================================================================

-- Prérequis : extension pg_cron activée (déjà fait pour la messagerie)
--   CREATE EXTENSION IF NOT EXISTS pg_cron;
--   GRANT USAGE ON SCHEMA cron TO postgres;

-- ── 1. INDEX SUR recorded_at POUR UN DELETE RAPIDE ─────────────────
-- Nécessaire si la table est volumineuse (évite un full scan).
CREATE INDEX IF NOT EXISTS idx_driver_positions_history_recorded_at
  ON public.driver_positions_history (recorded_at);

-- ── 2. JOB PG_CRON QUOTIDIEN ───────────────────────────────────────
-- Supprime chaque jour à 03:15 UTC toutes les positions > 30 jours.
-- Si un job du même nom existe déjà, on le supprime avant de le recréer.
DO $$
BEGIN
  PERFORM cron.unschedule('optimum-trans-purge-driver-positions');
EXCEPTION WHEN OTHERS THEN
  -- Le job n'existait pas, rien à faire
  NULL;
END $$;

SELECT cron.schedule(
  'optimum-trans-purge-driver-positions',
  '15 3 * * *',
  $$DELETE FROM public.driver_positions_history
    WHERE recorded_at < NOW() - INTERVAL '30 days'$$
);

-- ── 3. PURGE MANUELLE IMMÉDIATE (optionnel, à exécuter une seule fois) ──
-- Décommenter la ligne ci-dessous pour purger tout de suite l'historique
-- existant de plus de 30 jours.
-- DELETE FROM public.driver_positions_history WHERE recorded_at < NOW() - INTERVAL '30 days';

-- =======================================================================
-- VÉRIFICATION
-- Pour voir le job planifié :
--   SELECT * FROM cron.job WHERE jobname = 'optimum-trans-purge-driver-positions';
-- Pour voir l'historique d'exécution :
--   SELECT * FROM cron.job_run_details
--   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'optimum-trans-purge-driver-positions')
--   ORDER BY start_time DESC LIMIT 10;
-- =======================================================================
