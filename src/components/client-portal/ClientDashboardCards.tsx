import { StatCard } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText,
  MessageSquare,
  FileCheck2,
  Receipt,
  Activity,
  CalendarClock,
  Download,
} from "lucide-react";
import type { ClientPortalCounts } from "@/types/client-portal-view";

export function ClientDashboardCards({
  counts,
  loading,
}: {
  counts?: ClientPortalCounts;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 mb-6">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  const c = counts ?? {
    documents: 0,
    rfis: 0,
    submittals: 0,
    invoices: 0,
    activity: 0,
    meetings: 0,
    downloads: 0,
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 mb-6">
      <StatCard label="Documents" value={c.documents} icon={FileText} intent="info" />
      <StatCard label="RFIs" value={c.rfis} icon={MessageSquare} />
      <StatCard label="Submittals" value={c.submittals} icon={FileCheck2} intent="success" />
      <StatCard label="Invoices" value={c.invoices} icon={Receipt} intent="warning" />
      <StatCard label="Activity" value={c.activity} icon={Activity} />
      <StatCard label="Meetings" value={c.meetings} icon={CalendarClock} />
      <StatCard label="Downloads" value={c.downloads} icon={Download} />
    </div>
  );
}
