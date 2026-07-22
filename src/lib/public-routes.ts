/**
 * Public auth routes — never wrapped by `_app` layout or RBAC guards.
 *
 * Route verification checklist (manual QA):
 * - [ ] `/login` loads without redirect (signed out)
 * - [ ] `/signup` loads without redirect (signed out)
 * - [ ] Login → "Create one" navigates to `/signup` (not `/unauthorized`)
 * - [ ] `/signup` loads when `mep-role` exists in localStorage (partial Clerk session)
 * - [ ] Unauthenticated `/projects` → `/login`
 * - [ ] Authenticated Admin `/projects` → allowed
 * - [ ] `/unauthorized` loads when navigated directly (shows role, no app shell)
 */

/** Paths that must remain accessible without `_app` RBAC checks. */
export const PUBLIC_AUTH_PATHS = ["/login", "/signup", "/unauthorized", "/onboarding"] as const;

export function isPublicAuthRoute(pathname: string): boolean {
  if ((PUBLIC_AUTH_PATHS as readonly string[]).includes(pathname)) return true;
  if (pathname.startsWith("/invite/")) return true;
  return false;
}
