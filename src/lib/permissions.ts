import type { Role } from "@/lib/dummy-data";

export type AppRole = Role;

/**
 * Route → allowed roles.
 * Every route under /_app must have an entry here.
 * Omitted routes default to Admin-only via canAccess().
 *
 * Source of truth for Phase 2 (mock role data — no DB).
 *
 * Required access matrix (from product spec):
 *
 * Admin              → all pages
 * Project Manager    → /, /projects, /documents, /submittals, /rfi, /ncr, /pm, /financials, /resources, /workload, /reports
 * Senior Elec. Eng.  → /, /projects, /documents, /submittals, /rfi, /ncr, /reports
 * Electrical Eng.    → /, /projects, /documents, /submittals, /rfi
 * QA/QC Engineer     → /, /documents, /submittals, /rfi, /ncr, /reports
 * HR                 → /, /hr, /resources, /workload
 * Executive          → /, /executive, /pm, /financials, /resources, /workload, /reports
 * Client             → /, /client-portal, /documents
 */
export const ROUTE_PERMISSIONS: Record<string, AppRole[]> = {
  "/": [
    "Admin",
    "Project Manager",
    "Senior Electrical Engineer",
    "Electrical Engineer",
    "QA/QC Engineer",
    "HR",
    "Executive",
    "Client",
  ],
  "/apps": ["Admin"],
  "/ai": ["Admin", "Project Manager", "Senior Electrical Engineer", "Electrical Engineer"],
  "/projects": [
    "Admin",
    "Project Manager",
    "Senior Electrical Engineer",
    "Electrical Engineer",
    "Executive",
  ],
  "/documents": [
    "Admin",
    "Project Manager",
    "Senior Electrical Engineer",
    "Electrical Engineer",
    "QA/QC Engineer",
    "Client",
  ],
  "/submittals": [
    "Admin",
    "Project Manager",
    "Senior Electrical Engineer",
    "Electrical Engineer",
    "QA/QC Engineer",
  ],
  "/pm": ["Admin", "Project Manager", "Executive"],
  "/financials": ["Admin", "Project Manager", "Executive"],
  "/resources": [
    "Admin",
    "Project Manager",
    "HR",
    "Executive",
    "Senior Electrical Engineer",
    "Electrical Engineer",
    "QA/QC Engineer",
  ],
  "/workload": ["Admin", "Project Manager", "HR", "Executive"],
  "/hr": ["Admin", "HR"],
  "/executive": ["Admin", "Executive"],
  "/rfi": [
    "Admin",
    "Project Manager",
    "Senior Electrical Engineer",
    "Electrical Engineer",
    "QA/QC Engineer",
    "Executive",
  ],
  "/ncr": ["Admin", "Project Manager", "Senior Electrical Engineer", "QA/QC Engineer"],
  "/meetings": ["Admin", "Project Manager"],
  "/reports": [
    "Admin",
    "Project Manager",
    "Senior Electrical Engineer",
    "QA/QC Engineer",
    "Executive",
  ],
  "/client-portal": ["Admin", "Client"],
  "/settings": ["Admin"],
  /** Phase 6: user management — Admin only. */
  "/users": ["Admin"],
};

/**
 * Returns true if the given role may access the given pathname.
 * Admin bypasses all checks. Handles nested paths (e.g. /projects/p1 → /projects).
 */
export function canAccess(role: AppRole | null, pathname: string): boolean {
  if (!role) return false;
  if (role === "Admin") return true;

  // Derive the top-level segment: "/" stays "/", "/projects/p1" → "/projects"
  const segments = pathname.split("/").filter(Boolean);
  const key = segments.length === 0 ? "/" : `/${segments[0]}`;

  const allowed = ROUTE_PERMISSIONS[key];
  if (!allowed) return false;
  return allowed.includes(role);
}

/** Returns all route paths the role can access. */
export function accessibleRoutes(role: AppRole | null): string[] {
  if (!role) return [];
  if (role === "Admin") return Object.keys(ROUTE_PERMISSIONS);
  return Object.entries(ROUTE_PERMISSIONS)
    .filter(([, roles]) => roles.includes(role))
    .map(([path]) => path);
}

/**
 * Returns the ideal landing page for a role after login.
 * Falls back to "/" (Dashboard) which every authenticated role can access.
 */
export function getDefaultRoute(role: AppRole | null): string {
  switch (role) {
    case "Client":
      return "/client-portal";
    case "HR":
      return "/hr";
    case "Executive":
      return "/executive";
    default:
      return "/";
  }
}
