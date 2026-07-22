/**
 * AuditExplorerTable — Admin audit log with filters and pagination.
 */

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { useAuditEvents } from "@/hooks/api/useAuditExplorer";
import { AuditMetadataViewer } from "@/components/audit/AuditMetadataViewer";
import { getAuditEntityRoute } from "@/services/audit-explorer.service";
import type { AuditLog } from "@/types/database";

export function AuditExplorerTable() {
  const [action, setAction] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    useAuditEvents({
      action: action || undefined,
      resource_type: resourceType || undefined,
      search: search || undefined,
    });

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search action, type, ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Input
          placeholder="Filter action"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="max-w-[160px]"
        />
        <Input
          placeholder="Resource type"
          value={resourceType}
          onChange={(e) => setResourceType(e.target.value)}
          className="max-w-[160px]"
        />
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-3 w-3 mr-1" /> Refresh
        </Button>
      </div>

      {data?.isMockData && (
        <p className="text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-md text-center">
          Demo audit events
        </p>
      )}

      {isLoading && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 bg-muted animate-pulse rounded" />
          ))}
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center gap-2 py-8 text-destructive">
          <AlertTriangle className="h-6 w-6" />
          <p className="text-sm">Failed to load audit events</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="font-medium">No audit events found</p>
          <p className="text-sm mt-1">Try adjusting your filters.</p>
        </div>
      )}

      {!isLoading && !isError && items.length > 0 && (
        <div className="overflow-x-auto border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((ev) => {
                const route = getAuditEntityRoute(ev.resource_type, ev.resource_id);
                return (
                  <TableRow
                    key={ev.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelected(ev)}
                  >
                    <TableCell className="text-sm whitespace-nowrap">
                      {new Date(ev.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm">{ev.user_id}</TableCell>
                    <TableCell className="font-mono text-xs">{ev.action}</TableCell>
                    <TableCell className="capitalize">{ev.resource_type}</TableCell>
                    <TableCell>
                      {route ? (
                        <Link
                          to={route}
                          className="text-primary hover:underline text-xs font-mono"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {ev.resource_id}
                        </Link>
                      ) : (
                        <span className="text-xs font-mono text-muted-foreground">
                          {ev.resource_id ?? "—"}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            Load more
          </Button>
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">{selected?.action}</DialogTitle>
          </DialogHeader>
          {selected && <AuditMetadataViewer event={selected} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
