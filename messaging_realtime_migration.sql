-- =======================================================================
-- OPTIMUM TRANS — Migration : Active Supabase Realtime sur `messages`
-- Nécessaire pour que le WebSocket reçoive les INSERT/UPDATE/DELETE.
-- Sans cette migration, le polling de secours (30s) assure toujours la
-- livraison, mais les messages n'arrivent pas en temps réel.
-- Exécuter dans : Supabase → SQL Editor
-- =======================================================================

-- Ajoute la table `messages` à la publication `supabase_realtime`.
-- Si elle y est déjà, la commande échoue silencieusement (DO block).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN
  -- Déjà dans la publication, rien à faire
  NULL;
END $$;

-- =======================================================================
-- VÉRIFICATION
-- Lister les tables incluses dans la publication realtime :
--   SELECT schemaname, tablename
--   FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime'
--   ORDER BY schemaname, tablename;
-- =======================================================================
