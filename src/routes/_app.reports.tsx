import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SavedReportsTable } from "@/components/reports/SavedReportsTable";
import { ReportRunsTable } from "@/components/reports/ReportRunsTable";
import { ReportBuilder } from "@/components/reports/ReportBuilder";
import {
  useSavedReports,
  useCreateSavedReport,
  useDeleteSavedReport,
  useRunReport,
  useReportRuns,
  useExportReportCsv,
} from "@/hooks/api/useReports";
import { arrayToCsv, triggerCsvDownload } from "@/lib/csv-export";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { ReportType } from "@/types/database";

export const Route = createFileRoute("/_app/reports")({
  head: () => ({ meta: [{ title: "Reports — ElectraFlow AI" }] }),
  component: ReportsPage,
});

type Tab = "saved" | "runs" | "create" | "history";

function ReportsPage() {
  const [tab, setTab] = useState<Tab>("saved");
  const [runningId, setRunningId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const savedQ = useSavedReports();
  const runsQ = useReportRuns();
  const createMut = useCreateSavedReport();
  const deleteMut = useDeleteSavedReport();
  const runMut = useRunReport();
  const exportMut = useExportReportCsv();

  const reports = savedQ.data?.items ?? [];
  const runs = runsQ.data?.items ?? [];

  async function handleRun(reportId: string, reportType: string) {
    setRunningId(reportId);
    try {
      const result = await runMut.mutateAsync({
        saved_report_id: reportId,
        report_type: reportType as ReportType,
        format: "csv",
      });
      if (result.error) {
        toast.error(result.error.message);
      } else if (result.data?.status === "completed") {
        toast.success(
          `Report completed (${result.data.row_count} rows). Download from Run History.`,
        );
      } else if (result.data?.status === "failed") {
        toast.error(result.data.error_message ?? "Report failed.");
      }
      runsQ.refetch();
    } finally {
      setRunningId(null);
    }
  }

  async function handleDownload(runId: string) {
    setDownloadingId(runId);
    try {
      const result = await exportMut.mutateAsync(runId);
      if (result.error || !result.data) {
        toast.error(result.error?.message ?? "Download failed.");
        return;
      }
      const csv = arrayToCsv(result.data.rows, result.data.columns);
      const ok = triggerCsvDownload(csv, `report-${runId}.csv`);
      if (!ok) toast.error("Browser does not support file download.");
      else toast.success("CSV downloaded.");
    } finally {
      setDownloadingId(null);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "saved", label: "Saved Reports" },
    { id: "runs", label: "Report Runs" },
    { id: "create", label: "Create Report" },
    { id: "history", label: "Export History" },
  ];

  return (
    <>
      <PageHeader title="Reports" subtitle="Build, run, and export organizational reports." />

      <div className="flex gap-1 border-b mb-6 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors",
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {savedQ.isError && (
        <div className="text-destructive text-sm mb-4">
          Failed to load reports.{" "}
          <button className="underline" onClick={() => savedQ.refetch()}>
            Retry
          </button>
        </div>
      )}

      {tab === "saved" && (
        <SavedReportsTable
          reports={reports}
          isLoading={savedQ.isLoading}
          onRun={handleRun}
          onDelete={(id) =>
            deleteMut.mutate(id, { onSuccess: () => toast.success("Report deleted.") })
          }
          runningId={runningId}
        />
      )}

      {tab === "runs" && (
        <ReportRunsTable
          runs={runs}
          isLoading={runsQ.isLoading}
          onDownload={handleDownload}
          downloadingId={downloadingId}
          onLoadMore={() => runsQ.fetchNextPage()}
          hasMore={runsQ.hasNextPage}
          isFetchingMore={runsQ.isFetchingNextPage}
        />
      )}

      {tab === "create" && (
        <ReportBuilder
          isPending={createMut.isPending}
          onSubmit={async (input) => {
            const result = await createMut.mutateAsync(input);
            if (result.error) toast.error(result.error.message);
            else {
              toast.success("Report saved.");
              setTab("saved");
            }
          }}
        />
      )}

      {tab === "history" && (
        <ReportRunsTable
          runs={runs}
          isLoading={runsQ.isLoading}
          onDownload={handleDownload}
          downloadingId={downloadingId}
          onLoadMore={() => runsQ.fetchNextPage()}
          hasMore={runsQ.hasNextPage}
          isFetchingMore={runsQ.isFetchingNextPage}
        />
      )}
    </>
  );
}
