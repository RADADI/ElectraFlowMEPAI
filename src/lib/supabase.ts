/**
 * Supabase client — Phase 4.1 (security cleanup)
 *
 * Only the anon key is used client-side.  The service role key MUST NEVER
 * appear as a VITE_ variable — it would be embedded in the browser bundle,
 * bypass Row Level Security, and expose every row in every table to any user
 * who opens DevTools.
 *
 * Current state (Phase 4.1):
 *   IS_JWT_READY = false
 *   → Project service uses mock/sessionStorage data for all operations.
 *   → Supabase client is initialised (so schema/RLS can be tested in SQL
 *     editor) but is NOT queried for protected project data.
 *
 * Phase 5 migration path:
 *   1. Wire Clerk JWT into the Supabase client:
 *        supabase.auth.setSession({ access_token: clerkToken, refresh_token: "" })
 *   2. Set IS_JWT_READY = true (or derive it from clerk.isSignedIn dynamically).
 *   3. The project service will automatically start using real Supabase queries.
 *   4. RLS policies resolve via auth.uid() → the anon key is now safe for CRUD.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

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
 * Phase 4.1: always false — Clerk JWT ↔ Supabase auth is not wired yet.
 *
 * Until this is true, the project service routes ALL data through the
 * mock/sessionStorage layer, regardless of IS_SUPABASE_CONFIGURED.
 * This prevents the anon key from being used without auth.uid() set,
 * which would cause RLS to block queries silently.
 *
 * Phase 5 action: set this to true AFTER wiring Clerk JWT into Supabase auth.
 * The moment it is true the service layer automatically switches to real DB ops.
 */
export const IS_JWT_READY: boolean = false;

// ─── Anon client (the ONLY client shipped to the browser) ────────────────────

/**
 * Supabase anon client.  Safe to use in the browser.
 *
 * In Phase 4.1 this client is only used for:
 *   • Verifying connectivity (dev diagnostics below)
 *   • Future Phase 5 queries once auth.uid() is set via Clerk JWT
 *
 * It is NOT used for project CRUD until IS_JWT_READY = true.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: SupabaseClient<any> | null = IS_SUPABASE_CONFIGURED
  ? createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!)
  : null;

// ─── Dev diagnostics ─────────────────────────────────────────────────────────

if (import.meta.env.DEV) {
  if (!IS_SUPABASE_CONFIGURED) {
    console.info(
      "[ElectraFlow] Supabase: not configured — all data uses mock/demo mode.",
      "Set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in .env to configure.",
    );
  } else if (!IS_JWT_READY) {
    console.info(
      "[ElectraFlow] Supabase: configured ✓ but JWT auth not wired (Phase 4.1).",
      "Project data uses mock/sessionStorage. Phase 5 wires Clerk JWT → real DB.",
      SUPABASE_URL,
    );
  } else {
    console.info("[ElectraFlow] Supabase: configured + JWT ready ✓", SUPABASE_URL);
  }
}
