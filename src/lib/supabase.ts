/**
 * Supabase client — Phase 5 (Clerk JWT ↔ Supabase RLS Bridge)
 *
 * Security model:
 *   • Only the anon (public) key is shipped to the browser.
 *   • Service role key MUST NEVER appear as a VITE_ variable.
 *   • All data operations run through RLS; no bypass paths exist.
 *
 * JWT flow:
 *   1. ClerkAuthProvider calls setClerkTokenGetter() with a function that
 *      returns a fresh Clerk JWT signed with the Supabase JWT template.
 *   2. The custom fetch wrapper below injects that token as Authorization
 *      header on every Supabase HTTP request.
 *   3. Supabase verifies the JWT with the JWKS / shared secret configured
 *      in the Supabase Dashboard → Project Settings → API.
 *   4. auth.jwt() ->> 'sub' resolves to the Clerk user ID in SQL.
 *   5. get_my_org_id() and get_my_role() resolve via profiles.clerk_user_id.
 *   6. RLS enforces org isolation and role-based access automatically.
 *
 * IS_JWT_READY lifecycle:
 *   false (default) → project service uses mock/sessionStorage
 *   true            → set by ClerkAuthProvider after profile bootstrap succeeds
 *                     → project service uses real Supabase CRUD
 *   false again     → set on sign-out; service reverts to mock
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// ─── Static configuration flag ────────────────────────────────────────────────

/**
 * True when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are both set.
 * Services check this before running any Supabase query.
 */
export const IS_SUPABASE_CONFIGURED: boolean =
  typeof SUPABASE_URL === "string" &&
  SUPABASE_URL.trim().length > 0 &&
  typeof SUPABASE_ANON_KEY === "string" &&
  SUPABASE_ANON_KEY.trim().length > 0;

// ─── Dynamic JWT readiness ────────────────────────────────────────────────────

/**
 * Module-level flag.  Written by ClerkAuthProvider; read by the project service.
 *
 * false → all DB operations use mock/sessionStorage (safe default)
 * true  → Clerk JWT is set, profile is verified, real Supabase CRUD is enabled
 *
 * NOT a static constant.  Dynamically set at runtime.
 */
let _isJwtReady = false;

/**
 * Called by ClerkAuthProvider after a successful profile bootstrap.
 * Called with false on sign-out or token failure.
 */
export function setJwtReady(value: boolean): void {
  _isJwtReady = value;
}

/**
 * Returns true only when Clerk JWT is wired and DB profile is confirmed.
 * Services call this at request time (not at import time) so they always
 * read the current state.
 */
export function isJwtReady(): boolean {
  return _isJwtReady;
}

// ─── Clerk token getter ───────────────────────────────────────────────────────

type TokenGetter = () => Promise<string | null>;
let _clerkTokenGetter: TokenGetter | null = null;

/**
 * Called by ClerkAuthProvider to wire the Clerk session token into the
 * Supabase client's custom fetch.
 *
 * The getter calls  session.getToken({ template: "supabase" })  which:
 *   • Returns a fresh JWT signed with Clerk's private key.
 *   • Handles Clerk-side token caching and refresh transparently.
 *   • Returns null if no active session exists.
 */
export function setClerkTokenGetter(getter: TokenGetter | null): void {
  _clerkTokenGetter = getter;
}

// ─── Supabase client (anon key + dynamic Clerk JWT injection) ─────────────────

/**
 * The ONLY Supabase client shipped to the browser.
 *
 * The custom fetch wrapper injects the Clerk JWT on every request.
 * When no getter is set (demo / mock mode), requests use the anon key only
 * and RLS restricts all access to public-read-only rows (none in this schema).
 *
 * auth options:
 *   persistSession: false  — Supabase's own session management is disabled.
 *                            Clerk owns the session; we only pass its JWT.
 *   autoRefreshToken: false — Clerk handles token refresh via session.getToken().
 *   detectSessionInUrl: false — Not using Supabase's OAuth magic links.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: SupabaseClient<any> | null = IS_SUPABASE_CONFIGURED
  ? createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      global: {
        fetch: async (url: RequestInfo | URL, options: RequestInit = {}) => {
          const headers = new Headers(options.headers);

          // Inject the Clerk JWT when a getter is available.
          // Called fresh on every request → tokens are always current.
          if (_clerkTokenGetter) {
            try {
              const token = await _clerkTokenGetter();
              if (token) {
                headers.set("Authorization", `Bearer ${token}`);
              }
            } catch {
              // Token fetch failed (e.g. session expired mid-flight).
              // Proceed without the header — RLS will block protected data.
              // ClerkAuthProvider's session listener will set isJwtReady(false)
              // and trigger a re-login via Clerk.
            }
          }

          return fetch(url, { ...options, headers });
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null;

// ─── Realtime JWT auth ────────────────────────────────────────────────────────

/**
 * Called before subscribing to a Supabase Realtime channel.
 * Uses the existing Clerk token getter (already wired by ClerkAuthProvider)
 * to set auth on the WebSocket connection — separate from HTTP fetch headers.
 * Safe to call in mock mode (no-op when supabase is null or no getter is set).
 */
export async function refreshRealtimeAuth(): Promise<void> {
  if (!supabase || !_clerkTokenGetter) return;
  try {
    const token = await _clerkTokenGetter();
    if (token) supabase.realtime.setAuth(token);
  } catch {
    // non-fatal — channel will fallback to anon-key access (RLS blocks protected data)
  }
}

// ─── Dev diagnostics ─────────────────────────────────────────────────────────

if (import.meta.env.DEV) {
  if (!IS_SUPABASE_CONFIGURED) {
    console.info(
      "[ElectraFlow] Supabase: not configured — all data uses mock/demo mode.",
      "Set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in .env to enable.",
    );
  } else {
    console.info(
      "[ElectraFlow] Supabase: configured ✓",
      SUPABASE_URL,
      "— JWT readiness is dynamic (set by ClerkAuthProvider after profile bootstrap).",
    );
  }
}
