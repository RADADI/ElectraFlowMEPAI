/**
 * Development-only auth bridge diagnostics.
 * Logs the Clerk → Supabase JWT wiring state without exposing tokens.
 */

import { IS_SUPABASE_CONFIGURED } from "@/lib/supabase";
import { getCachedProfile } from "@/lib/auth-bridge";

const PREFIX = "[ElectraFlow Auth]";

export const IS_CLERK_CONFIGURED = !!(
  typeof import.meta !== "undefined" &&
  typeof import.meta.env?.VITE_CLERK_PUBLISHABLE_KEY === "string" &&
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY.trim().length > 0
);

export interface AuthDiagnosticSnapshot {
  supabaseConfigured: boolean;
  clerkPublishableKeyPresent: boolean;
  clerkSessionPresent: boolean;
  supabaseJwtAcquired: boolean;
  authBridgeReady: boolean;
  profileBootstrapOk: boolean;
  detail?: string;
}

function logSnapshot(label: string, snapshot: AuthDiagnosticSnapshot): void {
  if (!import.meta.env.DEV) return;
  console.info(`${PREFIX} ${label}`, snapshot);
}

/** Log static env configuration once at startup (dev only). */
export function logAuthEnvDiagnostics(): void {
  if (!import.meta.env.DEV) return;

  logSnapshot("Environment", {
    supabaseConfigured: IS_SUPABASE_CONFIGURED,
    clerkPublishableKeyPresent: IS_CLERK_CONFIGURED,
    clerkSessionPresent: false,
    supabaseJwtAcquired: false,
    authBridgeReady: false,
    profileBootstrapOk: false,
    detail: !IS_CLERK_CONFIGURED
      ? "VITE_CLERK_PUBLISHABLE_KEY is missing — ClerkAuthProvider disabled; JWT bridge cannot run."
      : !IS_SUPABASE_CONFIGURED
        ? "Supabase env vars missing — app uses mock data only."
        : "Supabase + Clerk env vars present — waiting for Clerk session.",
  });
}

export function logClerkSessionDiagnostics(hasSession: boolean): void {
  logSnapshot("Clerk session", {
    supabaseConfigured: IS_SUPABASE_CONFIGURED,
    clerkPublishableKeyPresent: IS_CLERK_CONFIGURED,
    clerkSessionPresent: hasSession,
    supabaseJwtAcquired: false,
    authBridgeReady: false,
    profileBootstrapOk: false,
    detail: hasSession ? "Clerk session active." : "No Clerk session (signed out or mock auth).",
  });
}

export function logSupabaseJwtDiagnostics(acquired: boolean, detail?: string): void {
  logSnapshot("Supabase JWT", {
    supabaseConfigured: IS_SUPABASE_CONFIGURED,
    clerkPublishableKeyPresent: IS_CLERK_CONFIGURED,
    clerkSessionPresent: true,
    supabaseJwtAcquired: acquired,
    authBridgeReady: false,
    profileBootstrapOk: false,
    detail:
      detail ??
      (acquired
        ? "session.getToken({ template: 'supabase' }) returned a token."
        : "No JWT from Clerk — verify the 'supabase' JWT template exists in Clerk Dashboard."),
  });
}

export function logProfileBootstrapResult(ok: boolean, reason?: string, error?: string): void {
  const profile = getCachedProfile();
  logSnapshot(ok ? "Profile bootstrap: success" : "Profile bootstrap: failure", {
    supabaseConfigured: IS_SUPABASE_CONFIGURED,
    clerkPublishableKeyPresent: IS_CLERK_CONFIGURED,
    clerkSessionPresent: true,
    supabaseJwtAcquired: true,
    authBridgeReady: ok,
    profileBootstrapOk: ok,
    detail: ok
      ? `profileId=${profile?.profileId ?? "unknown"} org=${profile?.organizationId ?? "unknown"}`
      : [reason, error].filter(Boolean).join(" — ") || "Unknown bootstrap failure.",
  });
}

export function logAuthBridgeReady(): void {
  const profile = getCachedProfile();
  logSnapshot("Auth bridge ready", {
    supabaseConfigured: IS_SUPABASE_CONFIGURED,
    clerkPublishableKeyPresent: IS_CLERK_CONFIGURED,
    clerkSessionPresent: true,
    supabaseJwtAcquired: true,
    authBridgeReady: true,
    profileBootstrapOk: true,
    detail: `RLS requests will use Clerk JWT for ${profile?.email ?? "signed-in user"}.`,
  });
}

export function logBootstrapProfileStarted(clerkUserId: string, email: string): void {
  if (!import.meta.env.DEV) return;
  console.info(`${PREFIX} Bootstrap profile started`, { clerkUserId, email });
}

export function logBootstrapProfileFound(profileId: string, organizationId: string): void {
  if (!import.meta.env.DEV) return;
  console.info(`${PREFIX} Profile found`, { profileId, organizationId });
}

export function logBootstrapProfileMissing(clerkUserId: string): void {
  if (!import.meta.env.DEV) return;
  console.info(`${PREFIX} Profile missing`, { clerkUserId });
}

export function logBootstrapFirstUserStarted(companyName: string, role: string): void {
  if (!import.meta.env.DEV) return;
  console.info(`${PREFIX} First-user bootstrap started`, { companyName, role });
}

export function logBootstrapFirstUserCreated(details: {
  profileId: string;
  organizationId: string;
  created: boolean;
  organizationCreated: boolean;
}): void {
  if (!import.meta.env.DEV) return;
  console.info(`${PREFIX} First-user bootstrap succeeded`, details);
}

export function logBootstrapFirstUserFailed(error: string): void {
  if (!import.meta.env.DEV) return;
  console.error(`${PREFIX} First-user bootstrap failed`, { error });
}
