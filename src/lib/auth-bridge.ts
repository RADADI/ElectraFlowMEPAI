/**
 * Auth bridge — Phase 4.1 (security cleanup)
 *
 * Translates the active session (mock localStorage or Clerk) into the identity
 * primitives the service layer needs.
 *
 * Phase 4.1 state:
 *   • getCurrentOrganizationId() reads from the env/localStorage ONLY for mock
 *     data context (role filtering on dummy data). It is NOT used to authenticate
 *     Supabase queries — that requires Clerk JWT (Phase 5).
 *   • resolveOrganizationId() has been removed. It depended on the service role
 *     client which was removed for security in Phase 4.1.
 *
 * Phase 5 migration:
 *   1. Wire Clerk token into supabase.auth.setSession().
 *   2. Replace getCurrentOrganizationId() with a read from the Clerk JWT claim
 *      "organization_id" (set in Clerk's session metadata on sign-in).
 *   3. Production org resolution happens after Clerk JWT → Supabase profile mapping.
 */

import type { AppRole } from "@/lib/permissions";
import { getStoredRole, getStoredUser } from "@/contexts/auth-context";

// ─── Organisation ID — mock context only ─────────────────────────────────────

const ORG_ID_STORAGE_KEY = "mep-org-id";

// Optional env shortcut for development annotation.
// This is NOT used for Supabase authentication — only for mock org context.
const ENV_ORG_ID = (import.meta.env.VITE_SUPABASE_ORG_ID as string | undefined)?.trim() || null;

/**
 * Returns the cached/configured org ID.
 *
 * ⚠️  Phase 4.1 usage: MOCK ONLY.
 * This value is used solely for mock data filtering (e.g. role-based project
 * filtering in dummy data). It does NOT authenticate any Supabase query.
 *
 * Production org resolution happens after Clerk JWT → Supabase profile mapping
 * (Phase 5). At that point, this function is replaced by a JWT claim read.
 */
export function getCurrentOrganizationId(): string | null {
  if (ENV_ORG_ID) return ENV_ORG_ID;
  try {
    return localStorage.getItem(ORG_ID_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Persist an org ID to localStorage.
 * Called externally during development setup (e.g. first-run wizard, Phase 5+).
 */
export function setOrganizationId(orgId: string): void {
  try {
    localStorage.setItem(ORG_ID_STORAGE_KEY, orgId);
  } catch {
    // Ignore in SSR / storage-disabled environments
  }
}

/**
 * Clear the cached org ID.
 * Called by clearAuthStorage() in auth-context.tsx so the cache is wiped on
 * sign-out — preventing the next user from inheriting a stale org context.
 */
export function clearOrganizationId(): void {
  try {
    localStorage.removeItem(ORG_ID_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

// ─── User identity ────────────────────────────────────────────────────────────

/**
 * Returns the current user's ID from the active mock session.
 * Phase 5: replaced by Clerk user ID (maps to profiles.id and auth.uid()).
 */
export function getCurrentUserId(): string | null {
  const user = getStoredUser();
  return user?.id ?? null;
}

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
 *
 * Services skip ALL Supabase queries for demo sessions and return mock data.
 * This ensures demo users never read from or write to the real database,
 * even when Supabase is configured.
 */
export function isDemoSession(): boolean {
  const user = getStoredUser();
  return user?.isDemo === true;
}

// ─── Session context bag ─────────────────────────────────────────────────────

export interface SessionContext {
  userId: string | null;
  /** Mock-only org context. NOT used for Supabase auth in Phase 4.1. */
  organizationId: string | null;
  role: AppRole | null;
  isAuthenticated: boolean;
  isDemo: boolean;
}

export function getSessionContext(): SessionContext {
  return {
    userId: getCurrentUserId(),
    organizationId: getCurrentOrganizationId(),
    role: getCurrentUserRole(),
    isAuthenticated: isAuthenticated(),
    isDemo: isDemoSession(),
  };
}
