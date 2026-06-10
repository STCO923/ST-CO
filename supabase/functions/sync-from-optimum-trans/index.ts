// ============================================================
// ST CO — Edge Function "sync-from-optimum-trans" (v8)
// ------------------------------------------------------------
// Reçoit les changements de données d'Optimum Trans (payload de type
// Supabase Webhook), authentifie par clé API maison, remappe le
// company_id OT -> ST CO, puis UPSERT/DELETE dans la table cible.
//
// v7 : tolérance aux colonnes inconnues (ne casse plus la synchro).
// v8 : AUTO-CRÉATION des colonnes manquantes via la fonction protégée
//      public.sync_add_missing_column (ADD COLUMN only). Si la création
//      échoue, on retombe sur le filet v7 (retirer la colonne).
//
// Déployée avec verify_jwt: false (auth maison par X-Sync-Api-Key).
// ============================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const EXCLUDED_TABLES = new Set([
  "sa_companies",
  "saas_subscriptions",
  "session_invalidations",
  "login_attempts",
  "security_events",
  "audit_log",
  "app_secrets",
  "tenant_sync_config",
  "sync_log",
]);

const DUAL_COMPANY_TABLES = new Set(["stt_orders", "stt_relationships"]);

const CONFLICT_KEYS: Record<string, string[]> = {
  bot_conversations: ["user_id"],
  gmail_tokens:      ["company_id"],
  telegram_agents:   ["telegram_user_id"],
  penalites_config:  ["company_id", "motif_id"],
};

function getConflictKey(table: string): string[] {
  return CONFLICT_KEYS[table] || ["id"];
}

// ---- Module-level singletons & caches ----
let _admin: SupabaseClient | null = null;
function admin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { "x-application-name": "sync-from-ot" } },
    });
  }
  return _admin;
}

// Cache rafraîchi paresseusement, TTL 60s
const CACHE_TTL_MS = 60_000;
let _apiKey: string | null = null;
let _apiKeyFetchedAt = 0;
async function getApiKey(): Promise<string | null> {
  const now = Date.now();
  if (_apiKey && now - _apiKeyFetchedAt < CACHE_TTL_MS) return _apiKey;
  const { data } = await admin()
    .from("app_secrets")
    .select("value")
    .eq("key", "sync_from_ot_api_key")
    .maybeSingle();
  _apiKey = data?.value || null;
  _apiKeyFetchedAt = now;
  return _apiKey;
}

// Cache source -> target uuid, TTL 60s
const _tenantMap = new Map<string, { target: string; active: boolean; at: number }>();
async function getTenantTarget(sourceId: string): Promise<{ target: string; active: boolean } | null> {
  const now = Date.now();
  const cached = _tenantMap.get(sourceId);
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return { target: cached.target, active: cached.active };
  }
  const { data } = await admin()
    .from("tenant_sync_config")
    .select("target_company_id, active")
    .eq("source_company_id", sourceId)
    .maybeSingle();
  if (!data) return null;
  _tenantMap.set(sourceId, { target: data.target_company_id, active: data.active, at: now });
  return { target: data.target_company_id, active: data.active };
}

// ---- Helpers ----
function cors(extra: Record<string, string> = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, x-sync-api-key, x-sync-source-company-id, authorization, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    ...extra,
  };
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: cors() });
}

function remapCompanyId(
  table: string,
  row: Record<string, unknown> | null,
  sourceId: string,
  targetId: string,
): Record<string, unknown> | null {
  if (!row) return row;
  const out = { ...row };
  if (DUAL_COMPANY_TABLES.has(table)) {
    if (out.donor_company_id === sourceId) out.donor_company_id = targetId;
    if (out.receiver_company_id === sourceId) out.receiver_company_id = targetId;
  } else if (out.company_id === sourceId) {
    out.company_id = targetId;
  }
  return out;
}

// Devine un type Postgres sûr à partir de la valeur envoyée par OT.
// Conservateur : nombre -> numeric, booléen -> boolean, objet -> jsonb, sinon text.
function inferPgType(v: unknown): string {
  if (typeof v === "number") return Number.isInteger(v) ? "numeric" : "numeric";
  if (typeof v === "boolean") return "boolean";
  if (v !== null && typeof v === "object") return "jsonb";
  return "text";
}

function truncateErr(s: string | null | undefined): string | null {
  if (!s) return null;
  const max = 500;
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function logFireAndForget(row: Record<string, unknown>) {
  // Non bloquant : laisse le runtime envoyer l'INSERT en arrière-plan
  admin().from("sync_log").insert(row).then(
    () => {},
    () => {}, // log silencieux : on n'attend pas et on ignore les erreurs
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors() });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const apiKey = req.headers.get("x-sync-api-key") || "";
  const sourceCompanyId = req.headers.get("x-sync-source-company-id") || "";

  // 1. Auth (cache 60s)
  const expected = await getApiKey();
  if (!expected || apiKey !== expected) {
    return json(401, { error: "invalid_api_key" });
  }

  if (!sourceCompanyId) {
    return json(400, { error: "missing_source_company_id" });
  }

  // 2. Tenant lookup (cache 60s)
  const tenant = await getTenantTarget(sourceCompanyId);
  if (!tenant || !tenant.active) {
    return json(403, { error: "unauthorized_source_company" });
  }
  const targetCompanyId = tenant.target;

  // 3. Parse payload
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const opType = String(payload?.type || "").toUpperCase();
  const table = String(payload?.table || "");
  const record = payload?.record || null;
  const oldRecord = payload?.old_record || null;

  if (!table || !opType) {
    return json(400, { error: "missing_type_or_table" });
  }

  if (EXCLUDED_TABLES.has(table)) {
    return json(200, { skipped: true, reason: "excluded_table", table });
  }

  const conflictCols = getConflictKey(table);
  const onConflict = conflictCols.join(",");

  const refRecord = record || oldRecord;
  const recordKey: Record<string, unknown> = {};
  if (refRecord) {
    for (const c of conflictCols) {
      if (c in (refRecord as object)) recordKey[c] = (refRecord as any)[c];
    }
  }
  const recordIdForLog = refRecord && "id" in (refRecord as object)
    ? String((refRecord as any).id)
    : (Object.keys(recordKey).length ? JSON.stringify(recordKey) : null);

  let success = false;
  let errorMessage: string | null = null;
  let httpStatus = 200;
  // Dérive de schéma : colonnes envoyées par OT mais absentes de ST CO.
  // v8 : on les CRÉE automatiquement (ADD COLUMN via RPC protégée). Si la création
  // échoue, on retombe sur le filet v7 (retirer la colonne) pour ne jamais bloquer.
  const addedColumns: string[] = [];
  const droppedColumns: string[] = [];

  try {
    if (opType === "INSERT" || opType === "UPDATE") {
      const mapped = remapCompanyId(table, record, sourceCompanyId, targetCompanyId);
      if (!mapped) throw new Error("missing_record");
      for (const c of conflictCols) {
        if (!(c in mapped)) throw new Error(`missing_conflict_column:${c}`);
      }
      const ddlTried = new Set<string>(); // colonnes pour lesquelles on a déjà tenté un ADD COLUMN
      let attempts = 0;
      while (true) {
        const { error } = await admin().from(table).upsert(mapped as any, { onConflict });
        if (!error) { success = true; break; }
        const miss = error.message?.match(/Could not find the '([^']+)' column/);
        if (miss && attempts < 20 && (miss[1] in mapped)) {
          const col = miss[1];
          attempts++;
          // Ne jamais toucher à une colonne de conflit (clé d'upsert)
          if (conflictCols.includes(col)) throw error;
          if (!ddlTried.has(col)) {
            // Tentative d'auto-création de la colonne manquante (ADD COLUMN only)
            ddlTried.add(col);
            const pgType = inferPgType((mapped as any)[col]);
            const { error: ddlErr } = await admin().rpc("sync_add_missing_column", {
              p_table: table, p_column: col, p_type: pgType,
            });
            if (!ddlErr) {
              addedColumns.push(`${col}:${pgType}`);
              // laisser le cache PostgREST se recharger avant de réessayer
              await new Promise((r) => setTimeout(r, 400));
              continue;
            }
            // échec de création -> filet v7 : on retire la colonne
          }
          // soit création échouée, soit déjà tentée sans succès -> on retire la colonne
          delete (mapped as any)[col];
          droppedColumns.push(col);
          continue;
        }
        throw error;
      }
    } else if (opType === "DELETE") {
      if (Object.keys(recordKey).length === 0) throw new Error("missing_record_key");
      let query = admin().from(table).delete();
      for (const [col, val] of Object.entries(recordKey)) {
        let v: unknown = val;
        if ((col === "company_id" || col === "donor_company_id" || col === "receiver_company_id") && v === sourceCompanyId) {
          v = targetCompanyId;
        }
        query = query.eq(col, v as any);
      }
      const { error } = await query;
      if (error && !/no rows/i.test(error.message)) throw error;
      success = true;
    } else {
      throw new Error(`unknown_op_type:${opType}`);
    }
  } catch (e: any) {
    success = false;
    errorMessage = truncateErr(e?.message || String(e));
    httpStatus = 500;
  }

  // Avertissement non bloquant : la ligne est passée, mais le schéma a bougé.
  if (success && !errorMessage) {
    const notes: string[] = [];
    if (addedColumns.length)   notes.push(`colonnes auto-créées: ${addedColumns.join(", ")}`);
    if (droppedColumns.length) notes.push(`colonnes ignorées: ${droppedColumns.join(", ")}`);
    if (notes.length) errorMessage = notes.join(" | ");
  }

  // 4. Log fire-and-forget (non bloquant)
  logFireAndForget({
    source_company_id: sourceCompanyId,
    target_company_id: targetCompanyId,
    table_name: table,
    op: opType,
    record_id: recordIdForLog,
    success,
    error_message: errorMessage,
    payload_excerpt: refRecord
      ? {
          key: recordKey,
          ...(addedColumns.length ? { added_columns: addedColumns } : {}),
          ...(droppedColumns.length ? { dropped_columns: droppedColumns } : {}),
        }
      : null,
  });

  return json(httpStatus, { success, table, op: opType, record_id: recordIdForLog, conflict_key: onConflict, added_columns: addedColumns, dropped_columns: droppedColumns, error: errorMessage });
});
