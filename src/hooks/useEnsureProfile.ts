/**
 * useEnsureProfile — Phase 5
 *
 * Returns the current profile bootstrap status from AuthContext.
 * Use this hook to react to the profile state anywhere in the app.
 *
 * Status values:
 *   'ok'        — Profile loaded, JWT wired, real DB ops available.
 *   'loading'   — Bootstrap in progress (spinner shown by ClerkAuthProvider).
 *   'no_org'    — Profile exists but has no organisation (error screen shown).
 *   'not_found' — No profile row; admin must invite user (error screen shown).
 *   'error'     — Technical failure; retry available (error screen shown).
 *   'mock'      — Mock / demo auth mode; no DB access.
 *   'idle'      — Clerk not yet loaded.
 *
 * Note: In Clerk mode, ClerkAuthProvider blocks the entire app with a loading
 * or error screen during 'loading', 'no_org', 'not_found', and 'error' states.
 * Child components will never render during those states — this hook is useful
 * for components that want to branch on 'ok' vs 'mock' without the ClerkProvider
 * needing to render an overlay (e.g. for feature-flag checks).
 *
 * Usage:
 *   const status = useEnsureProfile();
 *   if (status === 'ok') // real DB ops are safe
 *   if (status === 'mock') // demo mode, no DB
 */

import { useAuth, type ProfileStatus } from "@/contexts/auth-context";

export type { ProfileStatus };

export function useEnsureProfile(): ProfileStatus {
  return useAuth().profileStatus;
}
