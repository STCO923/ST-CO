# Edge Function `sync-from-optimum-trans`

Réception de la synchro **Optimum Trans (OT) → T SERVICE & CO (ST CO)**.

## Rôle

- Reçoit un POST au format **payload Supabase Webhook** (`{ type, table, record, old_record }`)
  envoyé par les triggers Postgres côté OT (via `pg_net`).
- Authentifie par clé API maison : header `X-Sync-Api-Key` (déployée avec
  `verify_jwt: false`). La clé est stockée dans `app_secrets` (clé
  `sync_from_ot_api_key`) — **jamais en clair dans le dépôt**.
- Vérifie la source via `X-Sync-Source-Company-Id` contre `tenant_sync_config`.
- Remappe le `company_id` OT → ST CO, puis **UPSERT** (INSERT/UPDATE) ou **DELETE**
  idempotent dans la table cible (clé de conflit `id` par défaut, voir `CONFLICT_KEYS`).
- Journalise chaque opération dans `sync_log` (fire-and-forget).

## Historique des versions

| Version | Changement |
|---------|------------|
| v6 | Comportement initial : un payload contenant une colonne absente côté ST CO **rejetait toute la ligne** (dérive de schéma → table bloquée en silence). |
| v7 | **Tolérance** : retire la colonne inconnue et enregistre quand même la ligne, en journalisant `colonnes ignorées: …`. |
| v8 | **Auto-création** : crée la colonne manquante via `public.sync_add_missing_column` (ADD COLUMN only), puis enregistre la ligne complète. Journalise `colonnes auto-créées: <col>:<type>`. Repli sur v7 si la création échoue. |

> La fonction SQL `sync_add_missing_column` est définie dans
> `sync_add_missing_column_migration.sql` (racine du dépôt). Elle ne sait faire
> qu'`ADD COLUMN IF NOT EXISTS`, avec garde-fous (anti-injection, liste noire de
> tables sensibles, liste blanche de types, `service_role` uniquement).

## Surveiller la dérive de schéma

```sql
-- Colonnes auto-créées ou ignorées récemment
SELECT ts, table_name, error_message
FROM sync_log
WHERE error_message LIKE 'colonnes auto-créées%'
   OR error_message LIKE '%colonnes ignorées%'
ORDER BY ts DESC
LIMIT 50;
```

## Rattrapage manuel (backfill) — côté OT

La synchro temps réel passe par des triggers ; pour re-pousser des données
existantes, OT dispose d'une file (`sync_queue`) :

```sql
-- 1. remplir la file pour des tables précises
SELECT public.sync_enqueue_ms_express(ARRAY['gazole_pleins']);

-- 2. la traiter (50 lignes/appel, 0,2 s entre chaque envoi)
SELECT public.sync_process_queue();

-- (optionnel) le faire tourner en arrière-plan via pg_cron
SELECT cron.schedule('sync_process_queue_job','* * * * *','SELECT public.sync_process_queue()');
-- ... puis l'arrêter une fois la file vidée :
SELECT cron.unschedule('sync_process_queue_job');
```

> ⚠️ Le statut `sent` de `sync_queue` signifie « requête postée via pg_net »,
> **pas** « appliquée côté ST CO » (pg_net est asynchrone). La vraie preuve de
> succès, ce sont les comptes côté ST CO et la table `sync_log`.
