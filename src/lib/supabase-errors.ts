/**
 * Translates raw Supabase/PostgREST failures into messages that say what to do.
 *
 * Without this, a missing migration surfaces in the UI as "TypeError: Failed to
 * fetch" or a bare PostgREST code, which gives the operator nothing to act on.
 */

/** Shape shared by PostgREST errors and thrown fetch failures. */
interface SupabaseErrorLike {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
}

/** PostgREST: no function matched the name/signature in the schema cache. */
const MISSING_FUNCTION_CODES = new Set(["PGRST202", "42883"]);
/** Postgres: relation does not exist — schema was never applied. */
const UNDEFINED_TABLE_CODE = "42P01";
/** Postgres: RLS or grant rejected the statement. */
const INSUFFICIENT_PRIVILEGE_CODE = "42501";

function asErrorLike(err: unknown): SupabaseErrorLike {
  if (err && typeof err === "object") return err as SupabaseErrorLike;
  if (typeof err === "string") return { message: err };
  return {};
}

/** True when the request never reached the server (DNS, CORS, offline, blocked). */
export function isNetworkFailure(err: unknown): boolean {
  const { message } = asErrorLike(err);
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("fetch failed") ||
    m.includes("load failed") ||
    m.includes("err_network") ||
    m.includes("err_connection")
  );
}

/** True when the RPC exists in code but not in the database. */
export function isMissingFunction(err: unknown): boolean {
  const { code, message } = asErrorLike(err);
  if (code && MISSING_FUNCTION_CODES.has(code)) return true;
  const m = (message ?? "").toLowerCase();
  return m.includes("could not find the function") || m.includes("does not exist");
}

export interface ExplainOptions {
  /**
   * SQL file to run when a required function or table is absent, relative to
   * the repo root. Surfaced verbatim so the operator can copy it.
   */
  missingObjectPatch?: string;
}

/**
 * Returns an actionable message for a Supabase failure, falling back to the
 * original message when the cause is not one we recognise.
 */
export function explainSupabaseError(err: unknown, options: ExplainOptions = {}): string {
  const { message, code } = asErrorLike(err);
  const fallback = message?.trim() || "Unknown database error.";

  if (isNetworkFailure(err)) {
    return (
      "Cannot reach the Supabase project. Check that VITE_SUPABASE_URL and " +
      "VITE_SUPABASE_ANON_KEY are correct, that the project is not paused, and that " +
      "no ad blocker or firewall is blocking the request."
    );
  }

  if (isMissingFunction(err)) {
    const patch = options.missingObjectPatch;
    return patch
      ? `Database setup is incomplete — a required function is missing. Run ${patch} in the Supabase SQL editor, then retry.`
      : `Database setup is incomplete — a required function is missing (${fallback}).`;
  }

  if (code === UNDEFINED_TABLE_CODE) {
    return (
      "Database schema is not applied — a required table is missing. Run " +
      "supabase/manual/PRODUCTION_BOOTSTRAP_FULL_SCHEMA.sql in the Supabase SQL editor."
    );
  }

  if (code === INSUFFICIENT_PRIVILEGE_CODE) {
    return `Row Level Security blocked this request (${fallback}). Confirm the Clerk JWT template named "supabase" is configured and that your profile row exists.`;
  }

  return fallback;
}
