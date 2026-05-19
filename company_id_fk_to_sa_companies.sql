-- =======================================================================
-- OPTIMUM TRANS — company_id_fk_to_sa_companies.sql
-- Migration : 29 FK company_id passent de auth.users(id) à sa_companies(id)
--
-- PROBLÈME : Les 29 tables multi-tenant avaient leur FK
--   FOREIGN KEY (company_id) REFERENCES auth.users(id)
-- héritée du modèle initial où sa_companies.id = auth.uid() du propriétaire.
-- Depuis l'ajout de company_users (sous-utilisateurs), les nouvelles
-- companies (COMOCO, DELIFRESH, TCM TRANS) ont un sa_companies.id distinct
-- de tout auth.users.id → tout INSERT/UPDATE échouait avec :
--   ERROR: insert or update on table "X" violates foreign key constraint
--          "X_company_id_fkey"
--
-- Symptôme déclencheur : COMOCO ne pouvait pas créer de chauffeur
-- (après le fix RLS chauffeurs_rls_admin_subuser_fix.sql, la FK bloquait
-- toujours l'insert).
--
-- SOLUTION : faire pointer toutes les FK company_id vers sa_companies(id),
-- qui est la table légitimement référencée. ON DELETE CASCADE/SET NULL
-- préservé selon l'existant.
--
-- Préalable : nettoyage de quelques rows orphelines (legacy) qui
-- empêcheraient la création de la nouvelle FK :
--   - entreprise : remappe COMOCO/TCM TRANS via company_users.auth_uid
--   - entreprise : supprime le doublon MS EXPRESS (l'autre row est correcte)
--   - penalites_config : supprime 6 rows legacy contenant les valeurs par
--     défaut (Retard 20€, Absence 0€, Absence non justifiée 50€)
-- =======================================================================

BEGIN;

-- ── 1) Drop d'abord toutes les FK *_company_id_fkey qui pointent vers
--       auth.users — sinon le remap des données ci-dessous échoue ──
DO $$
DECLARE
  con RECORD;
BEGIN
  FOR con IN
    SELECT cl.relname AS tname, c.conname
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    WHERE ns.nspname = 'public'
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) ILIKE '%REFERENCES auth.users%'
      AND c.conname LIKE '%\_company\_id\_fkey' ESCAPE '\'
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I',
                   con.tname, con.conname);
  END LOOP;
END $$;

-- ── 2) Remap des company_id legacy vers leur sa_companies.id ──
-- Pour chaque row dont company_id est un auth_uid présent dans company_users,
-- remplacer par le vrai company_id de la company.
UPDATE entreprise
   SET company_id = cu.company_id
  FROM company_users cu
 WHERE cu.auth_uid = entreprise.company_id
   AND entreprise.company_id IS NOT NULL
   AND entreprise.company_id NOT IN (SELECT id FROM sa_companies);

-- ── 3) Supprimer les rows orphelines restantes (legacy non rattachables) ──
DELETE FROM entreprise
 WHERE company_id IS NOT NULL
   AND company_id NOT IN (SELECT id FROM sa_companies);

DELETE FROM penalites_config
 WHERE company_id IS NOT NULL
   AND company_id NOT IN (SELECT id FROM sa_companies);

-- ── 4) Recreate les FK vers sa_companies(id) ──
-- ON DELETE CASCADE pour toutes sauf audit_log/security_events (SET NULL)
DO $$
DECLARE
  tbl TEXT;
  cascade_tables TEXT[] := ARRAY[
    'activation_codes','affectations_vehicule','ai_conversations','amendes',
    'bot_conversations','chauffeur_avances','chauffeurs','clients',
    'commissionnaires','driver_locations','driver_positions_history','entreprise',
    'factures','gazole_pleins','gmail_tokens','maintenance_vehicules',
    'message_groups','messages','monmarche_shifts','penalites_config','planning',
    'points_livraison','telegram_agents','tournee_points','tournee_validations',
    'tournees','vehicules'
  ];
  setnull_tables TEXT[] := ARRAY['audit_log','security_events'];
BEGIN
  FOREACH tbl IN ARRAY cascade_tables LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (company_id) REFERENCES sa_companies(id) ON DELETE CASCADE',
      tbl, tbl || '_company_id_fkey'
    );
  END LOOP;
  FOREACH tbl IN ARRAY setnull_tables LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (company_id) REFERENCES sa_companies(id) ON DELETE SET NULL',
      tbl, tbl || '_company_id_fkey'
    );
  END LOOP;
END $$;

COMMIT;

-- =======================================================================
-- VÉRIFICATION
--   SELECT conrelid::regclass AS t, conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE contype='f' AND conname LIKE '%_company_id_fkey'
--   ORDER BY t;
--
-- Toutes les FK doivent désormais référencer sa_companies(id),
-- aucune ne doit plus référencer auth.users.
-- =======================================================================
