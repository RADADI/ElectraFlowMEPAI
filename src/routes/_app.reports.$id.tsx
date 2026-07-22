import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ReportRunsTable } from "@/components/reports/ReportRunsTable";
import {
  useSavedReport,
  useRunReport,
  useReportRuns,
  useReportPreview,
  useExportReportCsv,
  useDeleteSavedReport,
} from "@/hooks/api/useReports";
import { arrayToCsv, triggerCsvDownload } from "@/lib/csv-export";
import { ChevronLeft, Loader2, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/reports/$id")({
  head: () => ({ meta: [{ title: "Report Detail — ElectraFlow AI" }] }),
  component: ReportDetailPage,
});

function ReportDetailPage() {
  const { id } = Route.useParams();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const reportQ = useSavedReport(id);
  const runsQ = useReportRuns(id);
  const runMut = useRunReport();
  const exportMut = useExportReportCsv();
  const deleteMut = useDeleteSavedReport();

  const report = reportQ.data?.data;
  const previewQ = useReportPreview(report?.report_type ?? "", report?.columns);

  async function handleRun() {
    if (!report) return;
    setRunning(true);
    try {
      const result = await runMut.mutateAsync({
        saved_report_id: report.id,
        report_type: report.report_type,
        format: "csv",
      });
      if (result.data?.status === "completed")
        toast.success(`Completed (${result.data.row_count} rows).`);
      else if (result.data?.status === "failed")
        toast.error(result.data.error_message ?? "Failed.");
      runsQ.refetch();
    } finally {
      setRunning(false);
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
      triggerCsvDownload(csv, `${report?.name ?? "report"}.csv`);
    } finally {
      setDownloadingId(null);
    }
  }

  if (reportQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (reportQ.data?.error || !report) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-muted-foreground font-medium">Report not found or access denied.</p>
        <Button variant="outline" asChild>
          <Link to="/reports">
            <ChevronLeft className="h-4 w-4 mr-1" /> Back to Reports
          </Link>
        </Button>
      </div>
    );
  }

  const preview = previewQ.data;

  return (
    <>
      <div className="mb-4">
        <Link
          to="/reports"
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <ChevronLeft className="h-4 w-4" /> Back to Reports
        </Link>
      </div>

      <PageHeader
        title={report.name}
        subtitle={report.description ?? undefined}
        actions={
          <div className="flex gap-2">
            <Button onClick={handleRun} disabled={running || report.is_future_type}>
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Play className="h-4 w-4 mr-1" />
              )}
              Run CSV
            </Button>
            <Button
              variant="destructive"
              size="icon"
              onClick={() => {
                if (confirm(`Delete "${report.name}"? This cannot be undone.`)) {
                  deleteMut.mutate(id, {
                    onSuccess: () => {
                      toast.success("Report deleted.");
                      window.history.back();
                    },
                  });
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2 mb-6">
        <Badge variant="secondary" className="capitalize">
          {report.report_type}
        </Badge>
        <Badge variant="outline" className="capitalize">
          {report.report_category}
        </Badge>
        <Badge variant="outline">v{report.version_number}</Badge>
        <Badge variant="outline">{report.visibility.replace("_", " ")}</Badge>
        {report.is_future_type && <Badge variant="destructive">Not configured yet</Badge>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted rounded p-3 overflow-x-auto">
              {JSON.stringify(report.filters, null, 2)}
            </pre>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Columns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1">
              {report.columns.map((c) => (
                <Badge key={c} variant="outline" className="text-xs">
                  {c}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">
            Preview
            {preview?.truncated && (
              <span className="text-xs font-normal text-muted-foreground ml-2">
                (showing {preview.rows.length} of {preview.total_count})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {previewQ.isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
          {previewQ.isError && <p className="text-destructive text-sm">Failed to load preview.</p>}
          {preview && preview.rows.length === 0 && (
            <p className="text-muted-foreground text-sm text-center py-6">
              No data for this report type.
            </p>
          )}
          {preview && preview.rows.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {preview.columns.map((col) => (
                      <TableHead key={col}>{col}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.map((row, i) => (
                    <TableRow key={i}>
                      {preview.columns.map((col) => (
                        <TableCell key={col} className="text-sm">
                          {String(row[col] ?? "")}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run History</CardTitle>
        </CardHeader>
        <CardContent>
          <ReportRunsTable
            runs={runsQ.data?.items ?? []}
            isLoading={runsQ.isLoading}
            onDownload={handleDownload}
            downloadingId={downloadingId}
          />
        </CardContent>
      </Card>
    </>
  );
}
