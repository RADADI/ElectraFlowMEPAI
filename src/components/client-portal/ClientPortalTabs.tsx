import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { CLIENT_PORTAL_TABS } from "@/types/client-portal-view";

export function ClientPortalTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="flex gap-1 overflow-x-auto pb-1 mb-4 -mx-1 px-1">
      {CLIENT_PORTAL_TABS.map((tab) => {
        const active =
          tab.href === "/client-portal"
            ? pathname === "/client-portal"
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.key}
            to={tab.href}
            className={cn(
              "shrink-0 px-3 py-1.5 text-sm rounded-md transition-colors",
              active
                ? "bg-primary text-primary-foreground font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
