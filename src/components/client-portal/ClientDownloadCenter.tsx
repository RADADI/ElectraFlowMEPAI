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
import type { ClientDownloadView } from "@/types/client-portal-view";

export function ClientDownloadCenter({
  items,
  loading,
}: {
  items: ClientDownloadView[];
  loading?: boolean;
}) {
  const downloadMut = useDownloadClientDocument();

  async function handleDownload(entityId: string) {
    const result = await downloadMut.mutateAsync(entityId);
    if (result.error) {
      toast.error(result.error.message ?? "Download failed.");
      return;
    }
    const payload = result.data;
    if (!payload) return;
    if (payload.is_demo || !payload.signed_url) {
      toast.success("Download logged (demo mode).");
      return;
    }
    window.open(payload.signed_url, "_blank", "noopener,noreferrer");
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
        title="No downloads available"
        description="Shared documents with files attached will appear here."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {["File", "Type", "Project", "Last downloaded", ""].map((h) => (
              <TableHead key={h || "action"} className="px-3 font-medium whitespace-nowrap">
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="px-3 font-medium">{d.title}</TableCell>
              <TableCell className="px-3 capitalize text-sm">{d.entity_type}</TableCell>
              <TableCell className="px-3 text-sm">{d.project_name ?? "—"}</TableCell>
              <TableCell className="px-3 text-sm whitespace-nowrap">
                {d.downloaded_at
                  ? new Date(d.downloaded_at).toLocaleString()
                  : "Not yet downloaded"}
              </TableCell>
              <TableCell className="px-3 text-right">
                {d.can_download && d.entity_type === "document" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={downloadMut.isPending}
                    onClick={() => handleDownload(d.entity_id)}
                  >
                    {downloadMut.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <Download className="h-3.5 w-3.5 mr-1" />
                        Download
                      </>
                    )}
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">No file</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
