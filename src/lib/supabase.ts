/**
 * Supabase client — Phase 3 foundation
 *
 * Safe-by-default: if VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are absent
 * the module exports `null` for the client and `false` for IS_SUPABASE_CONFIGURED.
 * Every service checks this flag before firing any query, so the app continues
 * using mock/dummy data without Supabase being configured.
 *
 * Phase 4 will add Clerk JWT as the Supabase auth bearer via:
 *   supabase.auth.setSession({ access_token: clerkToken, refresh_token: "" })
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * True only when both env vars are non-empty strings.
 * Services must check this before running any Supabase query.
 */
export const IS_SUPABASE_CONFIGURED: boolean =
  typeof SUPABASE_URL === "string" &&
  SUPABASE_URL.trim().length > 0 &&
  typeof SUPABASE_ANON_KEY === "string" &&
  SUPABASE_ANON_KEY.trim().length > 0;

/**
 * The Supabase client, or `null` when not configured.
 * Always guard access with `if (!supabase)` or check `IS_SUPABASE_CONFIGURED`.
 *
 * Phase 3: untyped client (avoids complex generic inference from hand-written
 *   Database types).  Services cast results to their typed interfaces manually.
 * Phase 4: run `supabase gen types typescript --project-id <ref>` to generate
 *   a typed Database file and pass it as `createClient<Database>(...)`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: SupabaseClient<any> | null = IS_SUPABASE_CONFIGURED
  ? createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!)
  : null;

// Dev-time diagnostics — never logs in production builds
if (import.meta.env.DEV) {
  if (IS_SUPABASE_CONFIGURED) {
    console.info("[ElectraFlow] Supabase: configured ✓", SUPABASE_URL);
  } else {
    console.info(
      "[ElectraFlow] Supabase: not configured — app will use mock/dummy data.",
      "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env to enable.",
    );
  }
}
