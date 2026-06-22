import type { Role } from "@/lib/dummy-data";

export type AppRole = Role;

/**
 * Maps each route path to the set of roles that may access it.
 * A route not listed here is treated as admin-only.
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
  ],
  "/apps": ["Admin"],
  "/ai": ["Admin", "Project Manager", "Senior Electrical Engineer", "Electrical Engineer"],
  "/projects": ["Admin", "Project Manager", "Senior Electrical Engineer", "Electrical Engineer"],
  "/documents": [
    "Admin",
    "Project Manager",
    "Senior Electrical Engineer",
    "Electrical Engineer",
    "QA/QC Engineer",
  ],
  "/submittals": ["Admin", "Senior Electrical Engineer", "Electrical Engineer"],
  "/pm": ["Admin", "Project Manager"],
  "/financials": ["Admin", "Executive"],
  "/resources": ["Admin", "Project Manager"],
  "/workload": ["Admin", "Project Manager"],
  "/hr": ["Admin", "HR"],
  "/executive": ["Admin", "Executive"],
  "/rfi": ["Admin", "Project Manager", "QA/QC Engineer"],
  "/ncr": ["Admin", "Project Manager", "QA/QC Engineer"],
  "/meetings": ["Admin", "Project Manager"],
  "/reports": ["Admin", "Executive"],
  "/client-portal": ["Admin", "Client"],
  "/settings": ["Admin"],
};

/** Returns true if the given role is allowed to access the given pathname. */
export function canAccess(role: AppRole | null, pathname: string): boolean {
  if (!role) return false;
  if (role === "Admin") return true;

  // Match exact or prefix (e.g. /projects/p1 → /projects)
  const base = "/" + pathname.split("/").filter(Boolean)[0] || "/";
  const key = base === "/" ? "/" : base;

  const allowed = ROUTE_PERMISSIONS[key];
  if (!allowed) return false;
  return allowed.includes(role);
}

/** Returns all route paths accessible by a role. */
export function accessibleRoutes(role: AppRole | null): string[] {
  if (!role) return [];
  if (role === "Admin") return Object.keys(ROUTE_PERMISSIONS);
  return Object.entries(ROUTE_PERMISSIONS)
    .filter(([, roles]) => roles.includes(role))
    .map(([path]) => path);
}
