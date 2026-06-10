-- ============================================================
-- ST CO — Auto-ajout des colonnes manquantes lors de la synchro
-- ------------------------------------------------------------
-- But : éviter qu'une dérive de schéma (OT ajoute une colonne que
-- ST CO n'a pas) ne bloque la synchro OT -> ST CO.
--
-- Cette fonction est appelée par l'Edge Function "sync-from-optimum-trans"
-- (v8) quand un UPSERT échoue sur "Could not find the '<col>' column".
-- Elle ne sait faire QU'UNE chose : ADD COLUMN IF NOT EXISTS.
--
-- Garde-fous :
--   * noms validés par regex (anti-injection)
--   * la table doit exister dans public
--   * liste noire des tables sensibles
--   * type sur liste blanche (sinon text)
--   * jamais de DROP / ALTER TYPE / renommage
--   * exécutable uniquement par service_role
-- ============================================================

create or replace function public.sync_add_missing_column(p_table text, p_column text, p_type text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_type text;
  v_exists boolean;
begin
  -- 1. Valider les identifiants (anti-injection)
  if p_table  is null or p_table  !~ '^[a-z_][a-z0-9_]*$' then
    raise exception 'nom de table invalide: %', p_table;
  end if;
  if p_column is null or p_column !~ '^[a-z_][a-z0-9_]*$' then
    raise exception 'nom de colonne invalide: %', p_column;
  end if;

  -- 2. La table doit exister dans le schéma public
  select exists(
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = p_table
  ) into v_exists;
  if not v_exists then
    raise exception 'table inconnue: %', p_table;
  end if;

  -- 3. Liste noire : jamais toucher aux tables sensibles
  if p_table in (
    'sa_companies','saas_subscriptions','session_invalidations',
    'login_attempts','security_events','audit_log','app_secrets',
    'tenant_sync_config','sync_log','sync_queue'
  ) then
    raise exception 'table non autorisée: %', p_table;
  end if;

  -- 4. Type sur liste blanche (sinon text par défaut)
  v_type := case lower(coalesce(p_type,'text'))
    when 'numeric'     then 'numeric'
    when 'integer'     then 'integer'
    when 'bigint'      then 'bigint'
    when 'boolean'     then 'boolean'
    when 'jsonb'       then 'jsonb'
    when 'date'        then 'date'
    when 'timestamptz' then 'timestamptz'
    when 'uuid'        then 'uuid'
    else 'text'
  end;

  -- 5. La SEULE opération autorisée : ajout de colonne (jamais destructif)
  execute format('alter table public.%I add column if not exists %I %s', p_table, p_column, v_type);

  -- 6. Recharger le cache de schéma de l'API REST
  perform pg_notify('pgrst', 'reload schema');

  return true;
end;
$$;

-- Exécutable uniquement par le service_role (l'Edge Function), personne d'autre
revoke all on function public.sync_add_missing_column(text, text, text) from public;
revoke all on function public.sync_add_missing_column(text, text, text) from anon;
revoke all on function public.sync_add_missing_column(text, text, text) from authenticated;
grant execute on function public.sync_add_missing_column(text, text, text) to service_role;
