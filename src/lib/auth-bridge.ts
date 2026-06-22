/**
 * Auth bridge — Phase 6 (Documents, Invites, User Admin)
 *
 * AUTHORITY RULES:
 *   • Clerk proves WHO the user is (authentication).
 *   • The database (profiles table) determines WHAT they can do (authorization).
 *   • profiles.role is the single source of truth — never Clerk metadata,
 *     never localStorage role, never JWT role claims.
 *
 * Phase 6 additions:
 *   • CachedProfile now includes profileId (the UUID PK of profiles row).
 *   • getCurrentUserId() returns the UUID (for DB FK references like created_by).
 *   • getClerkUserId() returns the Clerk text ID (for auth.jwt() ->> 'sub' RLS).
 *   • bootstrapProfile() checks is_active (deactivated user → 'disabled' reason).
 *   • bootstrapProfile() falls back to sessionStorage invite token when no
 *     profile exists and no orgIdFromMetadata is available.
 *   • sha256Hex() is exported for use by invite.service.ts.
 *
 * Circular-import note:
 *   This module reads localStorage directly to avoid circular deps with
 *   auth-context.tsx (which imports from this file).
 */

import type { AppRole } from "@/lib/permissions";
import { supabase, IS_SUPABASE_CONFIGURED } from "@/lib/supabase";

// ─── Crypto utility ───────────────────────────────────────────────────────────

/**
 * Returns the SHA-256 hex digest of a UTF-8 string.
 * Used for hashing invite tokens before storing in the database.
 * The Web Crypto API is available in all modern browsers and Node.js ≥ 15.
 */
export async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Local localStorage readers (avoids circular dep with auth-context.tsx) ──

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
  /** profiles.id — UUID primary key.  Used for all DB FK references (created_by, etc.). */
  profileId: string;
  /** auth.jwt() ->> 'sub' — the Clerk user ID (text, not UUID). */
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
 * Returns the current user's profiles.id UUID.
 * Use this for all DB FK columns (created_by, updated_by, approver_id, etc.).
 *
 * Falls back to the mock user's id string in demo/mock mode
 * (which won't be a UUID, but mock mode never hits Supabase).
 */
export function getCurrentUserId(): string | null {
  if (_profile) return _profile.profileId; // UUID — correct FK reference
  const user = _readUser();
  return user?.id ?? null;
}

/**
 * Returns the Clerk user ID ("user_2abc…").
 * Used only for auth context (auth.jwt() ->> 'sub').
 * Never use for DB FK columns.
 */
export function getClerkUserId(): string | null {
  if (_profile) return _profile.clerkUserId;
  return null;
}

/**
 * Returns the organisation ID from the DB profile (Clerk mode) or
 * env/localStorage (mock/demo mode).
 */
export function getCurrentOrganizationId(): string | null {
  if (_profile) return _profile.organizationId;

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
 * Clerk mode: profiles.role — DB authoritative.
 * Mock/demo mode: localStorage mep-role.
 */
export function getCurrentUserRole(): AppRole | null {
  if (_profile) return _profile.role;
  return _readRole();
}

// ─── Session state ────────────────────────────────────────────────────────────

export function isAuthenticated(): boolean {
  return !!_profile || _readRole() !== null;
}

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
   *   'no_org'        — profile exists but organization_id is null
   *   'not_found'     — no profile and no invite / org metadata available
   *   'disabled'      — profile.is_active === false (Admin deactivated the user)
   *   'email_mismatch'— invite exists but email doesn't match Clerk identity
   *   'error'         — network/DB failure
   */
  reason?: "no_org" | "not_found" | "disabled" | "email_mismatch" | "error";
  error?: string;
}

/**
 * Fetches or creates the Supabase profile for the signed-in Clerk user.
 *
 * Called once per sign-in by ClerkAuthProvider.
 * Must NOT be called for demo/mock sessions.
 *
 * Invite bootstrap (Phase 6):
 *   When a user signs up via an invite link, the invite page stores the raw
 *   token in sessionStorage under "mep_invite_token".  bootstrapProfile reads
 *   this, hashes it, and queries the invitations table to find the matching
 *   invite.  On match, the profile is created with the invite's org + role and
 *   the invite is marked accepted.  The token is cleared from sessionStorage.
 */
export async function bootstrapProfile(params: {
  clerkUserId: string;
  email: string;
  fullName: string;
  /** From Clerk public metadata — ONLY used for initial profile creation. */
  orgIdFromMetadata?: string | null;
}): Promise<BootstrapResult> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return { ok: false, reason: "error", error: "Supabase is not configured." };
  }

  const { clerkUserId, email, fullName, orgIdFromMetadata } = params;

  // ── Step 1: Look up existing profile by clerk_user_id ─────────────────────
  const { data: existing, error: fetchErr } = await supabase
    .from("profiles")
    .select("id, clerk_user_id, organization_id, role, full_name, email, is_active")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (fetchErr) {
    return { ok: false, reason: "error", error: fetchErr.message };
  }

  if (existing) {
    // Check deactivated first
    if (existing.is_active === false) {
      return {
        ok: false,
        reason: "disabled",
        error: "Your account has been deactivated. Please contact your administrator.",
      };
    }

    if (!existing.organization_id) {
      return { ok: false, reason: "no_org" };
    }

    return {
      ok: true,
      profile: {
        profileId: existing.id as string,
        clerkUserId: existing.clerk_user_id as string,
        organizationId: existing.organization_id as string,
        role: existing.role as AppRole,
        fullName: existing.full_name as string,
        email: existing.email as string,
      },
    };
  }

  // ── Step 2: No profile — try invite token from sessionStorage (Phase 6) ───
  const rawToken =
    typeof window !== "undefined" ? sessionStorage.getItem("mep_invite_token") : null;

  if (rawToken) {
    try {
      const tokenHash = await sha256Hex(rawToken);

      const { data: invite } = await supabase
        .from("invitations")
        .select("id, organization_id, role, email")
        .eq("token_hash", tokenHash)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (invite) {
        // Email must match the invite
        if (invite.email.toLowerCase() !== email.toLowerCase()) {
          return {
            ok: false,
            reason: "email_mismatch",
            error: `This invitation was sent to ${invite.email}. Please sign in with that email address.`,
          };
        }

        // Create profile with invite's org + role
        const { data: created, error: createErr } = await supabase
          .from("profiles")
          .insert({
            clerk_user_id: clerkUserId,
            organization_id: invite.organization_id,
            full_name: fullName || email.split("@")[0] || "User",
            email,
            role: invite.role,
          })
          .select("id, clerk_user_id, organization_id, role, full_name, email")
          .single();

        if (createErr) {
          return {
            ok: false,
            reason: "error",
            error: `Failed to create profile from invite: ${createErr.message}`,
          };
        }

        // Mark invite accepted (best-effort, don't fail bootstrap if this errors)
        await supabase
          .from("invitations")
          .update({
            status: "accepted",
            accepted_at: new Date().toISOString(),
            accepted_by_clerk_id: clerkUserId,
          })
          .eq("id", invite.id);

        // Clear invite token
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("mep_invite_token");
        }

        return {
          ok: true,
          profile: {
            profileId: created.id as string,
            clerkUserId: created.clerk_user_id as string,
            organizationId: created.organization_id as string,
            role: created.role as AppRole,
            fullName: created.full_name as string,
            email: created.email as string,
          },
        };
      }
    } catch {
      // Hash failure is non-fatal; fall through to orgIdFromMetadata path
    }
  }

  // ── Step 3: No profile, no invite — try orgIdFromMetadata (Clerk metadata) ─
  if (!orgIdFromMetadata) {
    return {
      ok: false,
      reason: "not_found",
      error: "No profile found and no invitation available. Ask your Admin to invite you.",
    };
  }

  const { data: created, error: createErr } = await supabase
    .from("profiles")
    .insert({
      clerk_user_id: clerkUserId,
      organization_id: orgIdFromMetadata,
      full_name: fullName || email.split("@")[0] || "User",
      email,
      role: "electrical_engineer",
    })
    .select("id, clerk_user_id, organization_id, role, full_name, email")
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
      profileId: created.id as string,
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

export function clearOrganizationId(): void {
  try {
    localStorage.removeItem("mep-org-id");
  } catch {
    // ignore
  }
}
