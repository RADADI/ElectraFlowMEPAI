import type { Role } from "@/lib/dummy-data";
import { ROLES } from "@/lib/dummy-data";
import type { UserRole } from "@/types/database";

export type AppRole = Role;

/** Maps DB `user_role` enum values to UI `AppRole` labels. */
const DB_ROLE_TO_APP_ROLE: Record<string, AppRole> = {
  admin: "Admin",
  project_manager: "Project Manager",
  senior_electrical_engineer: "Senior Electrical Engineer",
  electrical_engineer: "Electrical Engineer",
  qa_qc_engineer: "QA/QC Engineer",
  hr: "HR",
  executive: "Executive",
  client: "Client",
};

/** Maps UI `AppRole` labels to DB `user_role` enum values. */
const APP_ROLE_TO_DB_ROLE: Record<AppRole, UserRole> = {
  Admin: "admin",
  "Project Manager": "project_manager",
  "Senior Electrical Engineer": "senior_electrical_engineer",
  "Electrical Engineer": "electrical_engineer",
  "QA/QC Engineer": "qa_qc_engineer",
  HR: "hr",
  Executive: "executive",
  Client: "client",
};

const DISPLAY_ROLE_SET = new Set<string>(ROLES);

const DB_ROLE_SET = new Set<string>(Object.keys(DB_ROLE_TO_APP_ROLE));

/**
 * Accepts either UI role labels ("Electrical Engineer") or DB enum values
 * ("electrical_engineer") and returns a canonical AppRole for RBAC checks.
 */
export function normalizeAppRole(role: string | null | undefined): AppRole | null {
  if (!role) return null;
  const trimmed = role.trim();
  if (DISPLAY_ROLE_SET.has(trimmed)) return trimmed as AppRole;
  const fromDb = DB_ROLE_TO_APP_ROLE[trimmed.toLowerCase()];
  if (fromDb) return fromDb;
  const snake = trimmed.toLowerCase().replace(/[\s/]+/g, "_");
  return DB_ROLE_TO_APP_ROLE[snake] ?? null;
}

/**
 * Converts UI or DB role strings to the Postgres `user_role` enum value.
 */
export function appRoleToDbRole(role: string | null | undefined): UserRole {
  if (!role) return "electrical_engineer";
  const trimmed = role.trim();
  if (DB_ROLE_SET.has(trimmed.toLowerCase())) {
    return trimmed.toLowerCase() as UserRole;
  }
  const normalized = normalizeAppRole(trimmed);
  if (normalized) return APP_ROLE_TO_DB_ROLE[normalized];
  return "electrical_engineer";
}

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
 * Client             → /, /client-portal/*, /profile
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
  "/ai": [
    "Admin",
    "Project Manager",
    "Senior Electrical Engineer",
    "Electrical Engineer",
    "QA/QC Engineer",
    "Executive",
  ],
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
  "/meetings": [
    "Admin",
    "Project Manager",
    "Senior Electrical Engineer",
    "Electrical Engineer",
    "QA/QC Engineer",
    "HR",
    "Executive",
  ],
  "/electrical": [
    "Admin",
    "Project Manager",
    "Senior Electrical Engineer",
    "Electrical Engineer",
    "QA/QC Engineer",
    "Executive",
  ],
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
  /** Phase 12.5: Profile — all authenticated users */
  "/profile": [
    "Admin",
    "Project Manager",
    "Senior Electrical Engineer",
    "Electrical Engineer",
    "QA/QC Engineer",
    "HR",
    "Executive",
    "Client",
  ],
  /** Phase 11: Timesheets — all staff except Client */
  "/timesheets": [
    "Admin",
    "Project Manager",
    "Senior Electrical Engineer",
    "Electrical Engineer",
    "QA/QC Engineer",
    "HR",
    "Executive",
  ],
  /** Phase 11: Leave Management — all staff except Client */
  "/leave": [
    "Admin",
    "Project Manager",
    "Senior Electrical Engineer",
    "Electrical Engineer",
    "QA/QC Engineer",
    "HR",
    "Executive",
  ],
  /** Phase 13: Activity Center — internal staff only (clients use portal activity) */
  "/activity": [
    "Admin",
    "Project Manager",
    "Senior Electrical Engineer",
    "Electrical Engineer",
    "QA/QC Engineer",
    "HR",
    "Executive",
  ],
  /** Phase 14: Audit Explorer — Admin only */
  "/audit": ["Admin"],
};

/**
 * Returns true if the given role may access the given pathname.
 * Admin bypasses all checks. Handles nested paths (e.g. /projects/p1 → /projects).
 */
export function canAccess(role: AppRole | null, pathname: string): boolean {
  const normalized = normalizeAppRole(role);
  if (!normalized) return false;
  if (normalized === "Admin") return true;

  // Derive the top-level segment: "/" stays "/", "/projects/p1" → "/projects"
  const segments = pathname.split("/").filter(Boolean);
  const key = segments.length === 0 ? "/" : `/${segments[0]}`;

  const allowed = ROUTE_PERMISSIONS[key];
  if (!allowed) return false;
  return allowed.includes(normalized);
}

/** Returns all route paths the role can access. */
export function accessibleRoutes(role: AppRole | null): string[] {
  const normalized = normalizeAppRole(role);
  if (!normalized) return [];
  if (normalized === "Admin") return Object.keys(ROUTE_PERMISSIONS);
  return Object.entries(ROUTE_PERMISSIONS)
    .filter(([, roles]) => roles.includes(normalized))
    .map(([path]) => path);
}

/**
 * Returns the ideal landing page for a role after login.
 * Falls back to "/" (Dashboard) which every authenticated role can access.
 */
export function getDefaultRoute(role: AppRole | null): string {
  const normalized = normalizeAppRole(role);
  switch (normalized) {
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
