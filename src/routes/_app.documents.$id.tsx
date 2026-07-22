import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import {
  useDocument,
  useDocumentVersions,
  useDocumentApprovals,
  useSubmitForReview,
  useApproveDocument,
  useRejectDocument,
  useArchiveDocument,
  useRestoreDocument,
  useDownloadDocument,
} from "@/hooks/api/useDocuments";
import { DocumentUploadModal } from "@/components/documents/DocumentUploadModal";
import type { DocumentStatus } from "@/types/database";
import type { DocumentVersionView, DocumentApprovalView } from "@/types/document-view";
import {
  ArrowLeft,
  Download,
  Upload,
  CheckCircle,
  XCircle,
  Archive,
  RotateCcw,
  Clock,
  FileText,
  AlertCircle,
  SendHorizontal,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/documents/$id")({
  head: () => ({ meta: [{ title: "Document — ElectraFlow AI" }] }),
  component: DocumentDetailPage,
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
  draft: "bg-gray-100 text-gray-700",
  under_review: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  superseded: "bg-orange-100 text-orange-700",
  archived: "bg-gray-200 text-gray-500",
};

// ─── Role permissions ─────────────────────────────────────────────────────────

const CAN_SUBMIT = [
  "Admin",
  "Project Manager",
  "Senior Electrical Engineer",
  "Electrical Engineer",
];
const CAN_APPROVE = ["Admin", "Project Manager", "QA/QC Engineer", "Senior Electrical Engineer"];
const CAN_ARCHIVE = ["Admin", "Project Manager"];
const CAN_RESTORE = ["Admin", "Project Manager"];
const CAN_UPLOAD_VERSION = [
  "Admin",
  "Project Manager",
  "Senior Electrical Engineer",
  "Electrical Engineer",
];

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = "overview" | "versions" | "approvals";

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function DocumentDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-8 w-64 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-2 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
            <div className="h-5 w-40 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Version history panel ────────────────────────────────────────────────────

function VersionHistoryPanel({
  versions,
  isLoading,
}: {
  versions: DocumentVersionView[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  if (versions.length === 0) {
    return <p className="text-sm text-muted-foreground">No version history available.</p>;
  }

  return (
    <div className="space-y-2">
      {versions.map((v) => (
        <div
          key={v.id}
          className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              v{v.version_number}
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">
                Rev {v.revision} — {v.file_name ?? "Unknown file"}
              </p>
              <p className="text-xs text-muted-foreground">
                {v.uploader_name ?? "Unknown"} · {new Date(v.created_at).toLocaleDateString()}
                {v.file_size_bytes ? ` · ${(v.file_size_bytes / (1024 * 1024)).toFixed(1)} MB` : ""}
              </p>
              {v.change_summary && (
                <p className="text-xs text-muted-foreground mt-0.5 italic">{v.change_summary}</p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Approval timeline ────────────────────────────────────────────────────────

function ApprovalTimeline({
  approvals,
  isLoading,
}: {
  approvals: DocumentApprovalView[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  if (approvals.length === 0) {
    return <p className="text-sm text-muted-foreground">No approval history yet.</p>;
  }

  return (
    <div className="relative pl-6 space-y-4">
      {approvals.map((a, i) => (
        <div key={a.id} className="relative">
          {i < approvals.length - 1 && (
            <span className="absolute -left-[21px] top-5 h-full w-px bg-border" />
          )}
          <span
            className={`absolute -left-7 top-0.5 flex h-5 w-5 items-center justify-center rounded-full text-white text-[10px] ${
              a.action === "approved"
                ? "bg-green-500"
                : a.action === "rejected"
                  ? "bg-red-500"
                  : "bg-orange-500"
            }`}
          >
            {a.action === "approved" ? "✓" : a.action === "rejected" ? "✗" : "~"}
          </span>
          <div>
            <p className="text-sm font-medium text-foreground capitalize">
              {a.action.replace("_", " ")}
            </p>
            <p className="text-xs text-muted-foreground">
              {a.approver_name ?? "Unknown"} · {new Date(a.approved_at).toLocaleString()}
            </p>
            {a.comments && (
              <p className="mt-1 text-xs text-foreground bg-muted rounded px-2 py-1">
                {a.comments}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Reject dialog ────────────────────────────────────────────────────────────

function RejectDialog({
  open,
  onConfirm,
  onCancel,
  isLoading,
}: {
  open: boolean;
  onConfirm: (comments: string) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [comments, setComments] = useState("");
  const [err, setErr] = useState("");

  function handleSubmit() {
    if (!comments.trim()) {
      setErr("A comment is required when rejecting a document.");
      return;
    }
    setErr("");
    onConfirm(comments.trim());
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xl space-y-4">
        <h3 className="text-base font-semibold text-foreground">Reject Document</h3>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Comment <span className="text-destructive">*</span>
          </label>
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={3}
            placeholder="Explain why this document is being rejected…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {err && <p className="text-xs text-destructive mt-1">{err}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? "Rejecting…" : "Reject"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function DocumentDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { role, isJwtReady } = useAuth();

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [uploadVersionOpen, setUploadVersionOpen] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(false);

  const { data: doc, isLoading, isError, refetch } = useDocument(id);
  const { data: versions = [], isLoading: versionsLoading } = useDocumentVersions(id);
  const { data: approvals = [], isLoading: approvalsLoading } = useDocumentApprovals(id);

  const submitForReview = useSubmitForReview();
  const approveDoc = useApproveDocument();
  const rejectDoc = useRejectDocument();
  const archiveDoc = useArchiveDocument();
  const restoreDoc = useRestoreDocument();
  const downloadDoc = useDownloadDocument();

  const isMockMode = !isJwtReady;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Link
          to="/documents"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-fit"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Documents
        </Link>
        <DocumentDetailSkeleton />
      </div>
    );
  }

  if (isError || !doc) {
    return (
      <div className="flex flex-col gap-6">
        <Link
          to="/documents"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-fit"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Documents
        </Link>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertCircle className="h-10 w-10 text-destructive mb-3" />
          <p className="text-lg font-semibold text-foreground">Document Not Found</p>
          <p className="text-sm text-muted-foreground mt-1">
            This document does not exist or you do not have permission to view it.
          </p>
          <Button variant="outline" className="mt-4" onClick={() => navigate({ to: "/documents" })}>
            Back to Documents
          </Button>
        </div>
      </div>
    );
  }

  const isArchived = !!doc.deleted_at;
  const canSubmit = role && CAN_SUBMIT.includes(role) && doc.status === "draft" && !isArchived;
  const canApprove =
    role && CAN_APPROVE.includes(role) && doc.status === "under_review" && !isArchived;
  const canArchive = role && CAN_ARCHIVE.includes(role) && !isArchived;
  const canRestore = role && CAN_RESTORE.includes(role) && isArchived;
  const canUploadVersion = role && CAN_UPLOAD_VERSION.includes(role) && !isArchived;

  async function handleSubmitForReview() {
    const result = await submitForReview.mutateAsync(id);
    if (result.data) toast.success("Document submitted for review.");
    else toast.error(result.error?.message ?? "Failed to submit.");
  }

  async function handleApprove() {
    const result = await approveDoc.mutateAsync({ docId: id });
    if (result.data) toast.success("Document approved.");
    else toast.error(result.error?.message ?? "Failed to approve.");
  }

  async function handleReject(comments: string) {
    const result = await rejectDoc.mutateAsync({ docId: id, comments });
    if (result.data) {
      toast.success("Document rejected.");
      setRejectOpen(false);
    } else {
      toast.error(result.error?.message ?? "Failed to reject.");
    }
  }

  async function handleArchive() {
    setArchiveConfirm(false);
    const result = await archiveDoc.mutateAsync(id);
    if (result.data) {
      toast.success("Document archived.");
      await refetch();
    } else {
      toast.error(result.error?.message ?? "Failed to archive.");
    }
  }

  async function handleRestore() {
    const result = await restoreDoc.mutateAsync(id);
    if (result.data) {
      toast.success("Document restored.");
      await refetch();
    } else {
      toast.error(result.error?.message ?? "Failed to restore.");
    }
  }

  async function handleDownload() {
    const result = await downloadDoc.mutateAsync(id);
    if (result.data) {
      window.open(result.data, "_blank");
    } else {
      toast.error(result.error?.message ?? "Download not available in demo mode.");
    }
  }

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "versions", label: `Versions (${versions.length})` },
    { id: "approvals", label: `Approval History (${approvals.length})` },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/documents"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-fit transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Documents
      </Link>

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <FileText className="h-8 w-8 text-primary mt-0.5 shrink-0" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">{doc.title}</h1>
              {isArchived && (
                <span className="rounded-full bg-gray-200 text-gray-600 px-2 py-0.5 text-xs font-medium">
                  Archived
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              {doc.document_number && (
                <span className="text-xs text-muted-foreground font-mono">
                  #{doc.document_number}
                </span>
              )}
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[doc.status] ?? ""}`}
              >
                {STATUS_LABELS[doc.status] ?? doc.status}
              </span>
              {doc.discipline && (
                <span className="text-xs text-muted-foreground">{doc.discipline}</span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {isMockMode && (
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded">
              Demo mode
            </span>
          )}

          {canUploadVersion && (
            <Button variant="outline" size="sm" onClick={() => setUploadVersionOpen(true)}>
              <Upload className="h-4 w-4 mr-1" /> New Version
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            disabled={downloadDoc.isPending}
          >
            <Download className="h-4 w-4 mr-1" />
            {downloadDoc.isPending ? "…" : "Download"}
          </Button>

          {canSubmit && (
            <Button size="sm" onClick={handleSubmitForReview} disabled={submitForReview.isPending}>
              <SendHorizontal className="h-4 w-4 mr-1" />
              {submitForReview.isPending ? "Submitting…" : "Submit for Review"}
            </Button>
          )}

          {canApprove && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="text-green-600 border-green-300 hover:bg-green-50"
                onClick={handleApprove}
                disabled={approveDoc.isPending}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                {approveDoc.isPending ? "Approving…" : "Approve"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-red-600 border-red-300 hover:bg-red-50"
                onClick={() => setRejectOpen(true)}
              >
                <XCircle className="h-4 w-4 mr-1" /> Reject
              </Button>
            </>
          )}

          {canRestore && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleRestore}
              disabled={restoreDoc.isPending}
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              {restoreDoc.isPending ? "Restoring…" : "Restore"}
            </Button>
          )}

          {canArchive && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => setArchiveConfirm(true)}
            >
              <Archive className="h-4 w-4 mr-1" /> Archive
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Document Details</h2>
            <dl className="space-y-3">
              {[
                { label: "Title", value: doc.title },
                { label: "Document Number", value: doc.document_number ?? "—" },
                { label: "Discipline", value: doc.discipline ?? "—" },
                { label: "Type", value: doc.document_type ?? "—" },
                { label: "Revision", value: doc.revision },
                { label: "Version", value: `v${doc.current_version_number}` },
                { label: "Project", value: doc.project_name ?? "—" },
                { label: "Uploader", value: doc.uploader_name ?? "—" },
              ].map(({ label, value }) => (
                <div key={label} className="flex gap-4">
                  <dt className="w-32 shrink-0 text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-sm text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h2 className="text-sm font-semibold text-foreground">File Information</h2>
            <dl className="space-y-3">
              {[
                { label: "File Name", value: doc.file_name ?? "—" },
                {
                  label: "File Size",
                  value: doc.file_size_bytes
                    ? `${(doc.file_size_bytes / (1024 * 1024)).toFixed(1)} MB`
                    : "—",
                },
                { label: "MIME Type", value: doc.mime_type ?? "—" },
                { label: "Created", value: new Date(doc.created_at).toLocaleString() },
                { label: "Last Updated", value: new Date(doc.updated_at).toLocaleString() },
              ].map(({ label, value }) => (
                <div key={label} className="flex gap-4">
                  <dt className="w-32 shrink-0 text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-sm text-foreground break-all">{value}</dd>
                </div>
              ))}
            </dl>

            {doc.description && (
              <>
                <div className="border-t border-border pt-4">
                  <p className="text-xs text-muted-foreground mb-1">Description</p>
                  <p className="text-sm text-foreground">{doc.description}</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === "versions" && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4" /> Version History
          </h2>
          <VersionHistoryPanel versions={versions} isLoading={versionsLoading} />
        </div>
      )}

      {activeTab === "approvals" && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-sm font-semibold text-foreground mb-4">Approval History</h2>
          <ApprovalTimeline approvals={approvals} isLoading={approvalsLoading} />
        </div>
      )}

      {/* Upload new version modal */}
      <DocumentUploadModal
        open={uploadVersionOpen}
        onClose={(success) => {
          setUploadVersionOpen(false);
          if (success) {
            toast.success("New version uploaded successfully.");
            refetch();
          }
        }}
        mode="version"
        documentId={id}
        expectedVersion={doc.current_version_number}
        documentTitle={doc.title}
        isMockMode={isMockMode}
      />

      {/* Reject dialog */}
      <RejectDialog
        open={rejectOpen}
        onConfirm={handleReject}
        onCancel={() => setRejectOpen(false)}
        isLoading={rejectDoc.isPending}
      />

      {/* Archive confirmation */}
      {archiveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xl space-y-4">
            <h3 className="text-base font-semibold text-foreground">Archive Document</h3>
            <p className="text-sm text-muted-foreground">
              This will archive the document. Admins and Project Managers can restore it later.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setArchiveConfirm(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleArchive}
                disabled={archiveDoc.isPending}
              >
                {archiveDoc.isPending ? "Archiving…" : "Archive"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
