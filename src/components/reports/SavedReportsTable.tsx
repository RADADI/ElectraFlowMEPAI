/**
 * SavedReportsTable
 */

import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Play, Eye, Trash2, Loader2 } from "lucide-react";
import type { SavedReportView } from "@/types/report-view";

interface SavedReportsTableProps {
  reports: SavedReportView[];
  isLoading?: boolean;
  onRun: (id: string, type: string) => void;
  onDelete: (id: string) => void;
  runningId?: string | null;
}

export function SavedReportsTable({
  reports,
  isLoading,
  onRun,
  onDelete,
  runningId,
}: SavedReportsTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-12 bg-muted animate-pulse rounded" />
        ))}
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="font-medium">No saved reports yet</p>
        <p className="text-sm mt-1">Create your first report using the Create Report tab.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Visibility</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Last Run</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reports.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">
                <Link to="/reports/$id" params={{ id: r.id }} className="hover:underline">
                  {r.name}
                </Link>
                {r.is_future_type && (
                  <Badge variant="outline" className="ml-2 text-[10px]">
                    Future
                  </Badge>
                )}
              </TableCell>
              <TableCell className="capitalize">{r.report_type}</TableCell>
              <TableCell className="capitalize">{r.report_category}</TableCell>
              <TableCell>
                <Badge variant="secondary" className="text-[10px]">
                  {r.visibility.replace("_", " ")}
                </Badge>
              </TableCell>
              <TableCell>v{r.version_number}</TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {r.last_run_at ? new Date(r.last_run_at).toLocaleDateString() : "Never"}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={runningId === r.id || r.is_future_type}
                    onClick={() => onRun(r.id, r.report_type)}
                    title="Run CSV export"
                  >
                    {runningId === r.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                    <Link to="/reports/$id" params={{ id: r.id }}>
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => {
                      if (confirm(`Delete report "${r.name}"? This cannot be undone.`)) {
                        onDelete(r.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
