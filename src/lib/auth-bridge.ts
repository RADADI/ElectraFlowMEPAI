/**
 * Auth bridge — Phase 5 (Clerk JWT ↔ Supabase RLS)
 *
 * Provides identity primitives for the service layer.
 *
 * AUTHORITY RULES (Phase 5):
 *   • Clerk proves WHO the user is (authentication).
 *   • The database (profiles table) determines WHAT they can do (authorization).
 *   • profiles.role is the single source of truth — never Clerk metadata,
 *     never localStorage role, never JWT role claims.
 *
 * Profile cache:
 *   • ClerkAuthProvider calls bootstrapProfile() on sign-in.
 *   • On success, setCachedProfile() stores the verified DB values.
 *   • All identity getters prefer the cache (DB-authoritative values).
 *   • clearCachedProfile() is called on sign-out.
 *   • In mock/demo mode the cache is never populated; getters fall back to
 *     localStorage so the demo experience is unchanged.
 *
 * Circular-import note:
 *   Phase 4.1 imported getStoredRole/getStoredUser from auth-context.tsx.
 *   That would create a circular dep now that auth-context.tsx imports from
 *   this file.  Instead, this module reads localStorage directly using the
 *   same stable key strings.
 */

import type { AppRole } from "@/lib/permissions";
import { supabase, IS_SUPABASE_CONFIGURED } from "@/lib/supabase";

// ─── Local localStorage readers (no auth-context import to avoid circular dep) ─

const _ROLE_KEY = "mep-role";
const _USER_KEY = "mep-user";

interface _LocalUser {
  fullName: string;
  email: string;
  company: string;
  id?: string;
  isDemo?: boolean;
}

function _readRole(): AppRole | null {
  if (typeof window === "undefined") return null;
  return (localStorage.getItem(_ROLE_KEY) as AppRole) || null;
}

function _readUser(): _LocalUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(_USER_KEY);
    return raw ? (JSON.parse(raw) as _LocalUser) : null;
  } catch {
    return null;
  }
}

// ─── DB profile cache ─────────────────────────────────────────────────────────

/**
 * Values read from profiles table after successful Clerk sign-in bootstrap.
 * All fields come from the database — never from Clerk metadata (except the
 * clerkUserId which is the auth identity, not an authorization value).
 */
export interface CachedProfile {
  /** auth.jwt() ->> 'sub' — the Clerk user ID. */
  clerkUserId: string;
  /** profiles.organization_id — DB authoritative. */
  organizationId: string;
  /** profiles.role — DB authoritative.  Admin changes this in the database. */
  role: AppRole;
  fullName: string;
  email: string;
}

let _profile: CachedProfile | null = null;

/** Store verified DB profile values.  Called by ClerkAuthProvider only. */
export function setCachedProfile(profile: CachedProfile | null): void {
  _profile = profile;
}

/** Returns the cached profile or null (mock/demo mode or not bootstrapped). */
export function getCachedProfile(): CachedProfile | null {
  return _profile;
}

/** Wipes the profile cache.  Called on sign-out. */
export function clearCachedProfile(): void {
  _profile = null;
}

// ─── Identity primitives ──────────────────────────────────────────────────────

/**
 * Returns the current user's Clerk user ID when signed in via Clerk.
 * Falls back to the mock user's id in demo/normal mock mode.
 */
export function getCurrentUserId(): string | null {
  if (_profile) return _profile.clerkUserId;
  const user = _readUser();
  return user?.id ?? null;
}

/**
 * Returns the organisation ID from the DB profile (Clerk mode) or
 * env/localStorage (mock/demo mode).
 *
 * In Clerk mode this is authoritative — sourced from profiles.organization_id.
 * In mock mode it is used only for demo data filtering; no Supabase query uses it.
 *
 * Production org resolution:
 *   Clerk JWT → Supabase profile bootstrap → profiles.organization_id → cached here.
 *   Direct localStorage reads are only for the mock path.
 */
export function getCurrentOrganizationId(): string | null {
  // DB profile is authoritative when Clerk is active
  if (_profile) return _profile.organizationId;

  // Mock/demo fallback: optional env hint for dev annotations (not for auth)
  const envOrgId = (import.meta.env.VITE_SUPABASE_ORG_ID as string | undefined)?.trim();
  if (envOrgId) return envOrgId;

  try {
    return localStorage.getItem("mep-org-id");
  } catch {
    return null;
  }
}

/**
 * Returns the current role.
 *
 * Clerk mode: profiles.role — DB authoritative.
 *   The ClerkAuthProvider syncs this to localStorage after bootstrap so the
 *   existing RBAC engine (which reads localStorage) stays consistent with the DB.
 *
 * Mock/demo mode: localStorage mep-role.
 *
 * Never trust JWT role claims, Clerk metadata, or client-side values for
 * authorization.  RLS enforces the DB role independently.
 */
export function getCurrentUserRole(): AppRole | null {
  if (_profile) return _profile.role; // DB authoritative
  return _readRole(); // mock fallback
}

// ─── Session state ────────────────────────────────────────────────────────────

/** True when any authenticated session is active (Clerk or mock). */
export function isAuthenticated(): boolean {
  return !!_profile || _readRole() !== null;
}

/**
 * True when the active session was started via the Demo Login path.
 * Demo sessions NEVER hit Supabase — always use mock/sessionStorage.
 */
export function isDemoSession(): boolean {
  const user = _readUser();
  return user?.isDemo === true;
}

// ─── Session context bag ──────────────────────────────────────────────────────

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

// ─── Profile bootstrap ────────────────────────────────────────────────────────

/** Result returned by bootstrapProfile(). */
export interface BootstrapResult {
  ok: boolean;
  profile?: CachedProfile;
  /**
   * Reason for failure (when ok === false):
   *   'no_org'    — profile exists but organization_id is null
   *   'not_found' — profile does not exist and cannot be auto-created
   *   'error'     — network/DB failure
   */
  reason?: "no_org" | "not_found" | "error";
  error?: string;
}

/**
 * Fetches or creates the Supabase profile for the signed-in Clerk user.
 *
 * Called once per sign-in by ClerkAuthProvider.  Must NOT be called for
 * demo/mock sessions.
 *
 * Authority rules (CRITICAL):
 *   • DB profile values are used as-is — role/org_id are NEVER overwritten
 *     from Clerk metadata on subsequent logins.
 *   • Clerk public metadata `organization_id` is ONLY used during the very
 *     first bootstrap (profile creation) and only when no profile exists yet.
 *   • After creation, the database is the sole source of truth.
 */
export async function bootstrapProfile(params: {
  clerkUserId: string;
  email: string;
  fullName: string;
  /** From Clerk public metadata — used ONLY for initial profile creation. */
  orgIdFromMetadata?: string | null;
}): Promise<BootstrapResult> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return { ok: false, reason: "error", error: "Supabase is not configured." };
  }

  const { clerkUserId, email, fullName, orgIdFromMetadata } = params;

  // ── Step 1: Look up existing profile ──────────────────────────────────────
  // The RLS policy "profiles: user can read own profile" allows this query
  // even before the org is known (breaks the chicken-and-egg bootstrap problem).
  const { data: existing, error: fetchErr } = await supabase
    .from("profiles")
    .select("clerk_user_id, organization_id, role, full_name, email")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (fetchErr) {
    return { ok: false, reason: "error", error: fetchErr.message };
  }

  if (existing) {
    if (!existing.organization_id) {
      return { ok: false, reason: "no_org" };
    }
    return {
      ok: true,
      profile: {
        clerkUserId: existing.clerk_user_id as string,
        organizationId: existing.organization_id as string,
        role: existing.role as AppRole,
        fullName: existing.full_name as string,
        email: existing.email as string,
      },
    };
  }

  // ── Step 2: Profile not found — try auto-create (bootstrap-only) ──────────
  // org_id comes from Clerk public metadata (set by Admin in Clerk Dashboard).
  // This is ONLY used here; all subsequent reads come from the DB profile.
  if (!orgIdFromMetadata) {
    return {
      ok: false,
      reason: "not_found",
      error:
        "No profile found. Ask your Admin to invite you or set organization_id in your Clerk user metadata.",
    };
  }

  // Default role is the minimum privilege.  Admin elevates via the database.
  const { data: created, error: createErr } = await supabase
    .from("profiles")
    .insert({
      clerk_user_id: clerkUserId,
      organization_id: orgIdFromMetadata,
      full_name: fullName || email.split("@")[0] || "User",
      email,
      role: "electrical_engineer",
    })
    .select("clerk_user_id, organization_id, role, full_name, email")
    .single();

  if (createErr) {
    return {
      ok: false,
      reason: "error",
      error: `Failed to create profile: ${createErr.message}`,
    };
  }

  if (!created.organization_id) {
    return { ok: false, reason: "no_org" };
  }

  return {
    ok: true,
    profile: {
      clerkUserId: created.clerk_user_id as string,
      organizationId: created.organization_id as string,
      role: created.role as AppRole,
      fullName: created.full_name as string,
      email: created.email as string,
    },
  };
}

// ─── Legacy cache management (org-id only, for mock mode) ─────────────────────

/** @deprecated Only for mock mode.  In Clerk mode, org is from DB profile. */
export function setOrganizationId(orgId: string): void {
  try {
    localStorage.setItem("mep-org-id", orgId);
  } catch {
    // ignore
  }
}

/** Clears the mock org-id cache.  clearAuthStorage() calls this implicitly. */
export function clearOrganizationId(): void {
  try {
    localStorage.removeItem("mep-org-id");
  } catch {
    // ignore
  }
}
