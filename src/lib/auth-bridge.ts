/**
 * Auth bridge — Phase 4
 *
 * Translates the active session (mock localStorage or Clerk) into identity
 * primitives the service layer needs.
 *
 * Phase 4 additions:
 *   • getCurrentOrganizationId() now reads from:
 *       1. VITE_SUPABASE_ORG_ID env variable (quickest dev setup)
 *       2. localStorage cache "mep-org-id"  (persisted after async resolution)
 *   • resolveOrganizationId() — async lookup via Supabase profiles by email,
 *       requires VITE_SUPABASE_SERVICE_ROLE_KEY to bypass RLS.
 *
 * Phase 5:
 *   • Replace getCurrentUserId() with clerk.user?.id.
 *   • Wire Clerk JWT into the Supabase client as Bearer token so auth.uid()
 *     resolves correctly in RLS policies.
 *   • resolveOrganizationId() then becomes a JWT claim read, not a DB call.
 */

import type { AppRole } from "@/lib/permissions";
import { getStoredRole, getStoredUser } from "@/contexts/auth-context";
import { IS_SUPABASE_CONFIGURED, serviceClient } from "@/lib/supabase";

// ─── Storage key for cached organisation ID ───────────────────────────────────

const ORG_ID_STORAGE_KEY = "mep-org-id";

// Env-variable shortcut: set VITE_SUPABASE_ORG_ID = <uuid from seed.sql>
// and skip the async profile lookup entirely.
const ENV_ORG_ID = (import.meta.env.VITE_SUPABASE_ORG_ID as string | undefined)?.trim() || null;

// ─── Identity primitives ──────────────────────────────────────────────────────

/**
 * Returns the current user's ID.
 * Phase 4: reads from `id` field written to mep-user at signup/login.
 * Phase 5: Clerk user ID (maps to profiles.id and auth.uid() in RLS).
 */
export function getCurrentUserId(): string | null {
  const user = getStoredUser();
  return user?.id ?? null;
}

/**
 * Synchronous organisation ID read.
 * Priority order:
 *   1. VITE_SUPABASE_ORG_ID env variable (set it in .env for Phase 4 dev)
 *   2. "mep-org-id" in localStorage (written after resolveOrganizationId() succeeds)
 *   3. null — trigger resolveOrganizationId() in the service layer
 */
export function getCurrentOrganizationId(): string | null {
  if (ENV_ORG_ID) return ENV_ORG_ID;
  try {
    return localStorage.getItem(ORG_ID_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Persist the resolved org ID to localStorage. Call after successful lookup. */
export function setOrganizationId(orgId: string): void {
  try {
    localStorage.setItem(ORG_ID_STORAGE_KEY, orgId);
  } catch {
    // Ignore in SSR / storage-disabled environments
  }
}

/**
 * Clear the cached org ID.
 * Call when the user switches accounts or the org context changes.
 * Note: auth-context.clearAuthStorage() does NOT call this yet (auth is untouched).
 * A full org context clear can be done manually: clearOrganizationId() + page reload.
 */
export function clearOrganizationId(): void {
  try {
    localStorage.removeItem(ORG_ID_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Async organisation ID resolver.
 *
 * Call this in the service layer when getCurrentOrganizationId() returns null
 * and Supabase is configured.  On success, caches the result in localStorage
 * so subsequent synchronous calls return immediately.
 *
 * Requires VITE_SUPABASE_SERVICE_ROLE_KEY to bypass RLS on the profiles table.
 * Without the service key, this always returns null (RLS blocks the anon read).
 *
 * Flow:
 *   1. Return cached value if already resolved.
 *   2. Use serviceClient to query profiles.organization_id by user email.
 *   3. Cache and return the result.
 *   4. Return null on any failure (service layer will surface an error to UI).
 */
export async function resolveOrganizationId(): Promise<string | null> {
  // Fast path: already resolved
  const cached = getCurrentOrganizationId();
  if (cached) return cached;

  if (!IS_SUPABASE_CONFIGURED) return null;

  // Without the service key, the anon client can't read profiles (RLS blocks it).
  if (!serviceClient) return null;

  const user = getStoredUser();
  if (!user?.email) return null;

  try {
    const { data, error } = await serviceClient
      .from("profiles")
      .select("organization_id")
      .eq("email", user.email)
      .maybeSingle();

    if (!error && data?.organization_id) {
      setOrganizationId(data.organization_id);
      return data.organization_id as string;
    }
  } catch {
    // Supabase unreachable or profile not found — caller surfaces error to UI
  }

  return null;
}

// ─── Role ─────────────────────────────────────────────────────────────────────

/**
 * Returns the active role for RBAC checks in the service layer.
 * Always matches what auth-context and the permissions system use.
 */
export function getCurrentUserRole(): AppRole | null {
  return getStoredRole();
}

// ─── Session state ────────────────────────────────────────────────────────────

/** True when any authenticated session is active (real account or demo). */
export function isAuthenticated(): boolean {
  return getCurrentUserRole() !== null;
}

/**
 * True when the active session was created via the Demo Login path.
 * Services skip all Supabase queries for demo sessions and return mock data.
 * This ensures demo users never affect or read the real database.
 */
export function isDemoSession(): boolean {
  const user = getStoredUser();
  return user?.isDemo === true;
}

// ─── Session context bag ─────────────────────────────────────────────────────

export interface SessionContext {
  userId: string | null;
  organizationId: string | null;
  role: AppRole | null;
  isAuthenticated: boolean;
  isDemo: boolean;
}

/**
 * Returns the full session context needed by service methods.
 * organizationId is synchronous only — call resolveOrganizationId() first
 * in service functions that need it when Supabase is configured.
 */
export function getSessionContext(): SessionContext {
  return {
    userId: getCurrentUserId(),
    organizationId: getCurrentOrganizationId(),
    role: getCurrentUserRole(),
    isAuthenticated: isAuthenticated(),
    isDemo: isDemoSession(),
  };
}
