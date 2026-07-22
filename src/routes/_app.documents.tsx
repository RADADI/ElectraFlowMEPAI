import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { useDocuments } from "@/hooks/api/useDocuments";
import { DocumentUploadModal } from "@/components/documents/DocumentUploadModal";
import type { DocumentView, DocumentFilterInput } from "@/types/document-view";
import type { DocumentStatus } from "@/types/database";
import { Upload, FileText, Search, RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/documents")({
  head: () => ({ meta: [{ title: "Documents — ElectraFlow AI" }] }),
  component: DocumentsPage,
});

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: "Draft",
  under_review: "In Review",
  approved: "Approved",
  rejected: "Rejected",
  superseded: "Superseded",
  archived: "Archived",
};

const STATUS_COLORS: Record<DocumentStatus, string> = {
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  under_review: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  approved: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  superseded: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
  archived: "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400",
};

function statusBadge(status: DocumentStatus) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function DocumentsTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_80px] px-4 py-3 gap-4">
          {["", "", "", "", "", ""].map((_, i) => (
            <div key={i} className="h-3.5 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_80px] px-4 py-4 gap-4 border-b border-border last:border-0"
        >
          <div className="h-4 animate-pulse rounded bg-muted" />
          <div className="h-4 animate-pulse rounded bg-muted" style={{ width: "70%" }} />
          <div className="h-4 animate-pulse rounded bg-muted" style={{ width: "60%" }} />
          <div className="h-4 animate-pulse rounded bg-muted" style={{ width: "80%" }} />
          <div className="h-4 animate-pulse rounded bg-muted" style={{ width: "50%" }} />
          <div className="h-4 animate-pulse rounded bg-muted" style={{ width: "60%" }} />
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

const STATUS_OPTIONS: Array<{ value: DocumentStatus | "all"; label: string }> = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "under_review", label: "In Review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "archived", label: "Archived" },
];

// Roles that can upload documents
const UPLOAD_ROLES = [
  "Admin",
  "Project Manager",
  "Senior Electrical Engineer",
  "Electrical Engineer",
];

function DocumentsPage() {
  const { role, isJwtReady } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | "all">("all");
  const [page, setPage] = useState(0);
  const [uploadOpen, setUploadOpen] = useState(false);

  const filters: DocumentFilterInput = useMemo(
    () => ({
      search: search.trim() || undefined,
      status: statusFilter !== "all" ? statusFilter : undefined,
    }),
    [search, statusFilter],
  );

  const { data: docs = [], isLoading, isError, error, refetch } = useDocuments(filters);

  const canUpload = role && UPLOAD_ROLES.includes(role);
  const isMockMode = !isJwtReady;

  // Client-side pagination
  const totalPages = Math.max(1, Math.ceil(docs.length / PAGE_SIZE));
  const pageDocs = docs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function handleUploadClose(success?: boolean) {
    setUploadOpen(false);
    if (success) toast.success("Document uploaded successfully.");
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Documents"
        subtitle="Manage project drawings, specifications, and reports"
      />

      {/* Demo mode banner */}
      {isMockMode && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
          Demo mode — showing sample documents. Connect Supabase + complete Clerk setup for real DB
          access.
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Search documents…"
            className="pl-9"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as DocumentStatus | "all");
            setPage(0);
          }}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          {canUpload && (
            <Button size="sm" onClick={() => setUploadOpen(true)}>
              <Upload className="h-4 w-4 mr-1" />
              Upload
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <DocumentsTableSkeleton />
      ) : isError ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16 text-center">
          <AlertCircle className="h-8 w-8 text-destructive mb-3" />
          <p className="font-medium text-foreground">Failed to load documents</p>
          <p className="text-sm text-muted-foreground mt-1">
            {(error as Error | null)?.message ?? "An unexpected error occurred."}
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>
            Try Again
          </Button>
        </div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16 text-center">
          <FileText className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="font-medium text-foreground">No documents found</p>
          <p className="text-sm text-muted-foreground mt-1">
            {search || statusFilter !== "all"
              ? "Try adjusting your search or filter."
              : canUpload
                ? "Upload your first document to get started."
                : "No documents have been uploaded yet."}
          </p>
          {canUpload && !search && statusFilter === "all" && (
            <Button size="sm" className="mt-4" onClick={() => setUploadOpen(true)}>
              <Upload className="h-4 w-4 mr-1" />
              Upload Document
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[35%]">Document</TableHead>
                  <TableHead>Discipline</TableHead>
                  <TableHead>Revision</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Uploader</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageDocs.map((doc: DocumentView) => (
                  <TableRow key={doc.id} className="group">
                    <TableCell>
                      <Link
                        to="/documents/$id"
                        params={{ id: doc.id }}
                        className="flex items-center gap-2 hover:text-primary transition-colors"
                      >
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                        <span className="font-medium text-foreground line-clamp-1">
                          {doc.title}
                        </span>
                        {doc.document_number && (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            #{doc.document_number}
                          </span>
                        )}
                      </Link>
                      {doc.project_name && (
                        <p className="ml-6 text-xs text-muted-foreground mt-0.5">
                          {doc.project_name}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {doc.discipline ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm font-mono">{doc.revision}</TableCell>
                    <TableCell>{statusBadge(doc.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {doc.uploader_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(doc.updated_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, docs.length)} of{" "}
                {docs.length}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Upload modal */}
      <DocumentUploadModal
        open={uploadOpen}
        onClose={handleUploadClose}
        mode="new"
        isMockMode={isMockMode}
      />
    </div>
  );
}
