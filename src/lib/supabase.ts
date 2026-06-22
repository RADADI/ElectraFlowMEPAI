/**
 * Supabase clients — Phase 4
 *
 * Two clients are exported:
 *
 *   supabase      — anon key, respects RLS.  For reads once JWT auth is wired.
 *   serviceClient — service role key, bypasses RLS.
 *                   DEV ONLY until Clerk JWT integration (Phase 5).
 *                   Set VITE_SUPABASE_SERVICE_ROLE_KEY in .env.local (never commit it).
 *
 * Guard rules in services:
 *   • Always check IS_SUPABASE_CONFIGURED before any query.
 *   • For Phase 4 write/read ops, prefer serviceClient when available.
 *   • Demo sessions must use mock data regardless of Supabase config.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY as
  | string
  | undefined;

// ─── Flags ────────────────────────────────────────────────────────────────────

/**
 * True when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are both set.
 * Services check this before running any Supabase query.
 */
export const IS_SUPABASE_CONFIGURED: boolean =
  typeof SUPABASE_URL === "string" &&
  SUPABASE_URL.trim().length > 0 &&
  typeof SUPABASE_ANON_KEY === "string" &&
  SUPABASE_ANON_KEY.trim().length > 0;

/**
 * True when VITE_SUPABASE_SERVICE_ROLE_KEY is also set.
 * This key bypasses RLS — required for Phase 4 CRUD before JWT is wired (Phase 5).
 *
 * ⚠️  NEVER ship the service role key to production. Set it only in .env.local.
 */
export const HAS_SERVICE_KEY: boolean =
  IS_SUPABASE_CONFIGURED &&
  typeof SUPABASE_SERVICE_ROLE_KEY === "string" &&
  SUPABASE_SERVICE_ROLE_KEY.trim().length > 0;

// ─── Clients ──────────────────────────────────────────────────────────────────

/**
 * Anon client — respects Row Level Security.
 * Safe for production reads once Clerk JWT is set as the Bearer token.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: SupabaseClient<any> | null = IS_SUPABASE_CONFIGURED
  ? createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!)
  : null;

/**
 * Service role client — bypasses Row Level Security.
 *
 * DEV ONLY. Used in Phase 4 so CRUD works before Clerk JWT integration.
 * Phase 5 will remove this and wire the Clerk token into the anon client via
 *   supabase.auth.setSession({ access_token: clerkToken, refresh_token: "" })
 * after which all RLS policies resolve correctly.
 *
 * Set VITE_SUPABASE_SERVICE_ROLE_KEY in .env.local (never .env, never commit).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const serviceClient: SupabaseClient<any> | null = HAS_SERVICE_KEY
  ? createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!.trim(), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

// ─── Dev diagnostics ─────────────────────────────────────────────────────────

if (import.meta.env.DEV) {
  if (!IS_SUPABASE_CONFIGURED) {
    console.info(
      "[ElectraFlow] Supabase: not configured — app will use mock/demo data.",
      "Set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in .env to enable.",
    );
  } else if (!HAS_SERVICE_KEY) {
    console.warn(
      "[ElectraFlow] Supabase: anon client only (no service key). " +
        "CRUD operations will fail unless Clerk JWT is wired. " +
        "Set VITE_SUPABASE_SERVICE_ROLE_KEY in .env.local for Phase 4 dev testing.",
    );
  } else {
    console.info(
      "[ElectraFlow] Supabase: configured with service key ✓ (Phase 4 dev mode).",
      SUPABASE_URL,
    );
  }
}
