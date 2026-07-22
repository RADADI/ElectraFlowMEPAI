import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useDownloadClientDocument } from "@/hooks/api/useClientPortal";
import { ClientEmptyState } from "./ClientEmptyState";
import type { ClientDocumentView } from "@/types/client-portal-view";

export function ClientDocumentTable({
  items,
  loading,
  downloadingId,
}: {
  items: ClientDocumentView[];
  loading?: boolean;
  downloadingId?: string | null;
}) {
  const downloadMut = useDownloadClientDocument();

  async function handleDownload(id: string) {
    const result = await downloadMut.mutateAsync(id);
    if (result.error) {
      toast.error(result.error.message ?? "Download failed.");
      return;
    }
    const payload = result.data;
    if (!payload) return;
    if (payload.is_demo || !payload.signed_url) {
      toast.success("Download logged (demo mode — connect Supabase for file delivery).");
      return;
    }
    window.open(payload.signed_url, "_blank", "noopener,noreferrer");
    toast.success("Download started.");
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <ClientEmptyState
        title="No shared documents"
        description="Documents shared with you by the project team will appear here."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {["Document", "Project", "Version", "Shared", "Status", ""].map((h) => (
              <TableHead key={h || "action"} className="px-3 font-medium whitespace-nowrap">
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="px-3">
                <div className="font-medium">{d.title}</div>
                <div className="text-xs text-muted-foreground">
                  {d.discipline ?? d.document_type}
                </div>
              </TableCell>
              <TableCell className="px-3 text-sm">{d.project_name ?? "—"}</TableCell>
              <TableCell className="px-3 font-mono text-xs">{d.revision ?? "—"}</TableCell>
              <TableCell className="px-3 text-sm whitespace-nowrap">
                {new Date(d.shared_at).toLocaleDateString()}
              </TableCell>
              <TableCell className="px-3">
                <Badge variant="outline">{d.status}</Badge>
              </TableCell>
              <TableCell className="px-3 text-right">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={downloadMut.isPending && downloadingId === d.id}
                  onClick={() => handleDownload(d.id)}
                >
                  {downloadMut.isPending && downloadingId === d.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <Download className="h-3.5 w-3.5 mr-1" />
                      Download
                    </>
                  )}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
