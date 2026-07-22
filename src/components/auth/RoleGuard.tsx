import { type ReactNode } from "react";
import { Navigate } from "@tanstack/react-router";
import { useAuth } from "@/contexts/auth-context";
import type { AppRole } from "@/lib/permissions";

interface RoleGuardProps {
  /** Roles allowed to view this content. */
  allowedRoles: AppRole[];
  /** Content to render when the user is authorised. */
  children: ReactNode;
  /**
   * Where to send unauthorised users.
   * Defaults to "/unauthorized". Pass "hide" to silently hide the content
   * without a redirect (useful for conditionally hiding UI sections).
   */
  fallback?: "redirect" | "hide" | ReactNode;
}

/**
 * Reusable role guard.
 *
 * Usage — full-page guard (redirects to /unauthorized):
 *   <RoleGuard allowedRoles={["Admin", "HR"]}>
 *     <HRPage />
 *   </RoleGuard>
 *
 * Usage — silent UI hide:
 *   <RoleGuard allowedRoles={["Admin"]} fallback="hide">
 *     <DeleteButton />
 *   </RoleGuard>
 *
 * Usage — custom fallback:
 *   <RoleGuard allowedRoles={["Admin"]} fallback={<p>Admins only</p>}>
 *     <AdminPanel />
 *   </RoleGuard>
 */
export function RoleGuard({ allowedRoles, children, fallback = "redirect" }: RoleGuardProps) {
  const { role, isLoaded, isSignedIn } = useAuth();

  // Still loading Clerk — render nothing to avoid flash
  if (!isLoaded) return null;

  // Not signed in at all → login
  if (!isSignedIn) {
    return <Navigate to="/login" />;
  }

  // Role is allowed
  if (role && allowedRoles.includes(role)) {
    return <>{children}</>;
  }

  // Not authorised
  if (fallback === "redirect") {
    return <Navigate to="/unauthorized" />;
  }

  if (fallback === "hide") {
    return null;
  }

  // Custom fallback node
  return <>{fallback}</>;
}

/**
 * Convenience guard that only shows children to Admins.
 */
export function AdminOnly({
  children,
  fallback = "hide",
}: {
  children: ReactNode;
  fallback?: RoleGuardProps["fallback"];
}) {
  return (
    <RoleGuard allowedRoles={["Admin"]} fallback={fallback}>
      {children}
    </RoleGuard>
  );
}
