/**
 * Auth bridge — Phase 3
 *
 * Single place that translates the current active session (mock localStorage
 * or Clerk, whichever is active) into the identity primitives the service
 * layer needs.
 *
 * Phase 3:  reads from mep-user / mep-role in localStorage.
 * Phase 4:  replace getCurrentUserId() with clerk.user?.id and wire the
 *           Clerk JWT into the Supabase client as a Bearer token so RLS
 *           policies resolve via auth.uid().
 */

import type { AppRole } from "@/lib/permissions";
import { getStoredRole, getStoredUser } from "@/contexts/auth-context";

// ─── Identity primitives ──────────────────────────────────────────────────────

/**
 * Returns the current user's ID.
 *
 * Phase 3:  the `id` field written to mep-user at signup/login.
 * Phase 4:  Clerk user ID (maps to profiles.id and auth.uid() in RLS).
 */
export function getCurrentUserId(): string | null {
  const user = getStoredUser();
  return user?.id ?? null;
}

/**
 * Returns the organisation ID associated with the current session.
 *
 * Phase 3:  returns null — organisations are not yet in localStorage.
 *           Services fall back to org-less dummy data.
 * Phase 4:  look up profiles.organization_id from Supabase once auth is wired.
 */
export function getCurrentOrganizationId(): string | null {
  // Placeholder — Phase 4 will resolve this from the Supabase profiles table.
  return null;
}

/**
 * Returns the active role for RBAC checks in the service layer.
 * This always matches what auth-context and the permissions system use.
 */
export function getCurrentUserRole(): AppRole | null {
  return getStoredRole();
}

// ─── Session state helpers ─────────────────────────────────────────────────────

/** True when any authenticated session is active (real account or demo). */
export function isAuthenticated(): boolean {
  return getCurrentUserRole() !== null;
}

/**
 * True when the active session was created via the Demo Login path.
 * Services can use this to skip Supabase queries entirely and always
 * return mock data for demo users.
 */
export function isDemoSession(): boolean {
  const user = getStoredUser();
  return user?.isDemo === true;
}

/**
 * Returns the full session context needed by service methods.
 * Services destructure this instead of calling each helper individually.
 */
export interface SessionContext {
  userId: string | null;
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
