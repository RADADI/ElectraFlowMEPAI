import {
  createFileRoute,
  Navigate,
  Outlet,
  redirect,
  useRouterState,
} from "@tanstack/react-router";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { useAuth } from "@/contexts/auth-context";
import { canAccess } from "@/lib/permissions";

export const Route = createFileRoute("/_app")({
  beforeLoad: () => {
    // Client-side auth gate: redirect to /login if no role stored.
    // Phase 3+ will replace this with a server-side Clerk session check.
    if (typeof window !== "undefined" && !localStorage.getItem("mep-role")) {
      throw redirect({ to: "/login" });
    }
  },
  component: AppShell,
});

function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { role, isLoaded, isSignedIn } = useAuth();

  // Derive the base segment for matching against the permissions map
  const base = pathname === "/" ? "/" : "/" + pathname.split("/").filter(Boolean)[0];

  // While Clerk is still loading, render nothing to avoid flash
  if (!isLoaded) return null;

  // No session — sign-out clears the stored role and this layout re-renders
  // before beforeLoad can run again, so route here rather than falling through
  // to the RBAC check below, which would read as "denied" and show /unauthorized.
  if (!isSignedIn || !role) {
    return <Navigate to="/login" />;
  }

  // Route-level RBAC (authenticated app layout only — auth pages are separate routes)
  if (!canAccess(role, base)) {
    return <Navigate to="/unauthorized" />;
  }

  return (
    <div className="flex h-screen w-full bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1600px] p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
