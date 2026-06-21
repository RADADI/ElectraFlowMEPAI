import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles, FolderKanban, FileCheck2, FileText, Users, CalendarClock,
  BarChart3, Wallet, Briefcase, UserCog, FileBarChart, Settings,
} from "lucide-react";

export const Route = createFileRoute("/_app/apps")({
  head: () => ({ meta: [{ title: "App Store — MEPFlow AI" }] }),
  component: AppsPage,
});

const apps = [
  { to: "/ai", name: "AI Assistant", desc: "Project-aware chat, document Q&A, generation.", icon: Sparkles, tag: "AI", color: "from-violet-500/20 to-fuchsia-500/10" },
  { to: "/projects", name: "Project Management", desc: "Track projects, milestones and teams.", icon: FolderKanban, tag: "Core", color: "from-blue-500/20 to-sky-500/10" },
  { to: "/submittals", name: "Submittal Reviewer", desc: "AI compare spec vs. contractor submittal.", icon: FileCheck2, tag: "AI", color: "from-emerald-500/20 to-teal-500/10" },
  { to: "/documents", name: "Document Center", desc: "Versioned drawings, specs and packages.", icon: FileText, tag: "Core", color: "from-amber-500/20 to-orange-500/10" },
  { to: "/resources", name: "Resource Allocation", desc: "Engineer availability and utilization.", icon: Users, tag: "Ops", color: "from-cyan-500/20 to-blue-500/10" },
  { to: "/workload", name: "Workload Projection", desc: "6–12 month hiring & capacity planner.", icon: CalendarClock, tag: "Ops", color: "from-indigo-500/20 to-violet-500/10" },
  { to: "/pm", name: "PM Dashboard", desc: "Live KPIs, cost, schedule and risk.", icon: BarChart3, tag: "Insights", color: "from-rose-500/20 to-pink-500/10" },
  { to: "/financials", name: "Financial Dashboard", desc: "Revenue, AR, cash flow and forecast.", icon: Wallet, tag: "Insights", color: "from-green-500/20 to-emerald-500/10" },
  { to: "/executive", name: "Executive Dashboard", desc: "Board-level view across the company.", icon: Briefcase, tag: "Insights", color: "from-yellow-500/20 to-amber-500/10" },
  { to: "/hr", name: "HR Dashboard", desc: "Skills matrix, training and attendance.", icon: UserCog, tag: "People", color: "from-pink-500/20 to-rose-500/10" },
  { to: "/reports", name: "Reports", desc: "Generate PDF, DOCX and Excel reports.", icon: FileBarChart, tag: "Tools", color: "from-slate-500/20 to-zinc-500/10" },
  { to: "/settings", name: "Settings", desc: "Users, roles, templates and audit.", icon: Settings, tag: "Admin", color: "from-neutral-500/20 to-stone-500/10" },
];

function AppsPage() {
  return (
    <>
      <PageHeader title="App Store" subtitle="Launch the modules your team needs." />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {apps.map(a => (
          <Link key={a.to} to={a.to}>
            <Card className="group p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer border bg-card overflow-hidden relative h-full">
              <div className={`absolute inset-0 bg-gradient-to-br ${a.color} opacity-50 group-hover:opacity-80 transition-opacity pointer-events-none`} />
              <div className="relative flex flex-col gap-3 h-full">
                <div className="flex items-start justify-between">
                  <div className="h-11 w-11 rounded-lg bg-card border grid place-items-center"><a.icon className="h-5 w-5 text-primary" /></div>
                  <Badge variant="outline">{a.tag}</Badge>
                </div>
                <div>
                  <div className="font-semibold">{a.name}</div>
                  <div className="text-sm text-muted-foreground mt-1">{a.desc}</div>
                </div>
                <div className="mt-auto text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">Open module →</div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
