import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  AppWindow,
  FolderKanban,
  FileText,
  FileCheck2,
  BarChart3,
  Wallet,
  Users,
  CalendarClock,
  UserCog,
  Briefcase,
  Sparkles,
  MessageSquare,
  AlertTriangle,
  ClipboardList,
  FileBarChart,
  UserSquare2,
  Settings,
  Zap,
  Clock,
  CalendarOff,
  Activity,
  Shield,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { canAccess } from "@/lib/permissions";

export const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/apps", label: "App Store", icon: AppWindow },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/documents", label: "Documents", icon: FileText },
  { to: "/submittals", label: "Submittal Reviewer", icon: FileCheck2 },
  { to: "/pm", label: "PM Dashboard", icon: BarChart3 },
  { to: "/financials", label: "Financials", icon: Wallet },
  { to: "/resources", label: "Resources", icon: Users },
  { to: "/workload", label: "Workload", icon: CalendarClock },
  { to: "/timesheets", label: "Timesheets", icon: Clock },
  { to: "/leave", label: "Leave", icon: CalendarOff },
  { to: "/hr", label: "HR", icon: UserCog },
  { to: "/executive", label: "Executive", icon: Briefcase },
  { to: "/ai", label: "AI Assistant", icon: Sparkles },
  { to: "/rfi", label: "RFI", icon: MessageSquare },
  { to: "/ncr", label: "NCR", icon: AlertTriangle },
  { to: "/meetings", label: "Meetings", icon: ClipboardList },
  { to: "/electrical", label: "Electrical", icon: Zap },
  { to: "/reports", label: "Reports", icon: FileBarChart },
  { to: "/audit", label: "Audit Explorer", icon: Shield },
  { to: "/client-portal", label: "Client Portal", icon: UserSquare2 },
  { to: "/users", label: "Users", icon: UserCog },
  { to: "/activity", label: "Activity Center", icon: Activity },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function SidebarBrand() {
  return (
    <div className="h-14 flex items-center gap-2 px-4 border-b border-sidebar-border shrink-0">
      <div className="h-8 w-8 rounded-md bg-sidebar-primary grid place-items-center text-sidebar-primary-foreground">
        <Zap className="h-5 w-5" />
      </div>
      <div className="leading-tight">
        <div className="font-semibold text-sm">ElectraFlow AI</div>
        <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60">
          Enterprise
        </div>
      </div>
    </div>
  );
}

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { role } = useAuth();

  // Filter nav items to only those the current role can access
  const visibleItems = navItems.filter((item) => canAccess(role, item.to));

  return (
    <nav className="flex-1 overflow-y-auto py-2">
      {visibleItems.map(({ to, label, icon: Icon }) => {
        const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            onClick={onNavigate}
            className={`flex items-center gap-3 px-4 py-2 text-sm transition-colors border-l-2 ${
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground border-sidebar-primary"
                : "border-transparent text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function SidebarFooter() {
  return (
    <div className="p-3 border-t border-sidebar-border text-[11px] text-sidebar-foreground/60">
      v2.0 · © ElectraFlow
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden lg:flex w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <SidebarBrand />
      <NavLinks />
      <SidebarFooter />
    </aside>
  );
}
