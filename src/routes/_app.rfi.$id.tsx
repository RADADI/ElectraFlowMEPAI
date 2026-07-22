/**
 * RFI Detail Page — Phase 8
 *
 * Fetches RFI, responses, and documents from React Query hooks.
 * Role + status gated action buttons disabled with spinner during mutation.
 * Archived / Voided banners with Restore (Admin / PM only) / Void (Admin only).
 * Internal notes hidden from Client role.
 * "Former User" fallback if responder profile is deleted/deactivated.
 * Concurrent-update conflict detection on void.
 */

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { DocumentView } from "@/types/document-view";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/EmptyState";
import { RFIFormModal } from "@/components/rfi/RFIFormModal";
import {
  Loader2,
  ArrowLeft,
  AlertTriangle,
  MessageSquare,
  Paperclip,
  FileQuestion,
  Lock,
  Archive,
  RotateCcw,
  Send,
  UserCheck,
  XCircle,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import {
  useRFI,
  useRFIResponses,
  useRFIDocuments,
  useSubmitRFI,
  useAssignRFI,
  useRespondToRFI,
  useRequestMoreInfo,
  useCloseRFI,
  useReopenRFI,
  useArchiveRFI,
  useRestoreRFI,
  useVoidRFI,
  useAttachRFIDocument,
  useRemoveRFIDocument,
} from "@/hooks/api/useRFI";
import { useDocuments } from "@/hooks/api/useDocuments";
import { getRFIDueBadge } from "@/types/rfi-view";
import type { RFIView, RFIResponseView, RFIDocumentView } from "@/types/rfi-view";
import type { RFIStatus, RFIResponseType } from "@/types/database";
import { formatDate, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_app/rfi/$id")({
  component: RFIDetailPage,
});

// ─── Status / priority maps ───────────────────────────────────────────────────

const STATUS_LABEL: Record<RFIStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  open: "Open",
  under_review: "Under Review",
  answered: "Answered",
  closed: "Closed",
  reopened: "Reopened",
  voided: "Void",
  archived: "Archived",
  cancelled: "Cancelled",
};

const STATUS_CLASS: Record<RFIStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  submitted: "bg-blue-100 text-blue-700",
  open: "bg-yellow-100 text-yellow-700",
  under_review: "bg-purple-100 text-purple-700",
  answered: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-600",
  reopened: "bg-orange-100 text-orange-700",
  voided: "bg-red-100 text-red-700",
  archived: "bg-slate-100 text-slate-500",
  cancelled: "bg-red-50 text-red-500",
};

const PRIORITY_CLASS: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-800 font-semibold",
};

const RESPONSE_TYPE_LABEL: Record<RFIResponseType, string> = {
  clarification: "Clarification",
  answer: "Answer",
  request_more_info: "Request More Info",
  internal_note: "Internal Note",
};

// ─── Role helpers ─────────────────────────────────────────────────────────────

const norm = (r?: string | null) => (r ?? "").toLowerCase().replace(/ /g, "_");

function isAdminOrPM(role?: string | null) {
  const r = norm(role);
  return r === "admin" || r === "project_manager";
}

function isAdmin(role?: string | null) {
  return norm(role) === "admin";
}

function canEdit(rfi: RFIView, role?: string | null) {
  if (rfi.status === "archived" || rfi.status === "voided") return false;
  if (isAdminOrPM(role)) return true;
  const r = norm(role);
  return (
    rfi.status === "draft" && ["senior_electrical_engineer", "electrical_engineer"].includes(r)
  );
}

function canSubmit(rfi: RFIView, role?: string | null) {
  if (rfi.status !== "draft") return false;
  const r = norm(role);
  return ["admin", "project_manager", "senior_electrical_engineer", "electrical_engineer"].includes(
    r,
  );
}

function canAssign(rfi: RFIView, role?: string | null) {
  if (["archived", "voided", "closed"].includes(rfi.status)) return false;
  return isAdminOrPM(role);
}

function canRespond(rfi: RFIView, role?: string | null) {
  if (["draft", "archived", "voided", "closed"].includes(rfi.status)) return false;
  const r = norm(role);
  return [
    "admin",
    "project_manager",
    "senior_electrical_engineer",
    "electrical_engineer",
    "qa_qc_engineer",
    "client",
  ].includes(r);
}

function canClose(rfi: RFIView, role?: string | null) {
  if (!["answered", "open", "reopened"].includes(rfi.status)) return false;
  return isAdminOrPM(role);
}

function canReopen(rfi: RFIView, role?: string | null) {
  if (!["closed", "answered"].includes(rfi.status)) return false;
  return isAdminOrPM(role);
}

function canArchive(rfi: RFIView, role?: string | null) {
  if (rfi.status === "archived" || rfi.status === "voided") return false;
  return isAdminOrPM(role);
}

function canRestore(rfi: RFIView, role?: string | null) {
  return rfi.status === "archived" && isAdminOrPM(role);
}

function canVoid(rfi: RFIView, role?: string | null) {
  return rfi.status !== "voided" && rfi.status !== "archived" && isAdmin(role);
}

// ─── Due badge pill ───────────────────────────────────────────────────────────

function DueBadgePill({ rfi }: { rfi: RFIView }) {
  const badge = getRFIDueBadge(rfi);
  if (!badge) return null;

  const map: Record<typeof badge, { label: string; cls: string }> = {
    overdue: { label: "Overdue", cls: "bg-red-100 text-red-700" },
    due_soon: { label: "Due Soon", cls: "bg-yellow-100 text-yellow-700" },
    answered_late: { label: "Answered Late", cls: "bg-orange-100 text-orange-700" },
    closed_late: { label: "Closed Late", cls: "bg-orange-100 text-orange-700" },
  };
  const { label, cls } = map[badge];
  return <Badge className={`text-xs ${cls}`}>{label}</Badge>;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-4 w-1/2" />
      <div className="grid grid-cols-3 gap-4 mt-6">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function RFIDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { role: userRole } = useAuth();

  // Query hooks
  const rfiQuery = useRFI(id);
  const responsesQuery = useRFIResponses(id);
  const docsQuery = useRFIDocuments(id);
  const allDocsQuery = useDocuments();
  const allDocs: DocumentView[] = allDocsQuery.data ?? [];

  // Mutation hooks
  const submitMut = useSubmitRFI(id);
  const assignMut = useAssignRFI(id);
  const respondMut = useRespondToRFI(id);
  const moreInfoMut = useRequestMoreInfo(id);
  const closeMut = useCloseRFI(id);
  const reopenMut = useReopenRFI(id);
  const archiveMut = useArchiveRFI(id);
  const restoreMut = useRestoreRFI(id);
  const voidMut = useVoidRFI(id);
  const attachMut = useAttachRFIDocument(id);
  const removeMut = useRemoveRFIDocument(id);

  // Dialog state
  const [showEdit, setShowEdit] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [showRespond, setShowRespond] = useState(false);
  const [showMoreInfo, setShowMoreInfo] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showVoid, setShowVoid] = useState(false);

  // Form state
  const [assigneeId, setAssigneeId] = useState("");
  const [responseText, setResponseText] = useState("");
  const [responseType, setResponseType] = useState<RFIResponseType>("answer");
  const [moreInfoText, setMoreInfoText] = useState("");
  const [attachDocId, setAttachDocId] = useState("");
  const [voidReason, setVoidReason] = useState("");

  const [actionError, setActionError] = useState<string | null>(null);

  // ── Loading & error states ────────────────────────────────────────────────

  if (rfiQuery.isLoading) return <DetailSkeleton />;

  if (rfiQuery.isError || rfiQuery.data?.error) {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <h2 className="text-lg font-semibold">Failed to load RFI</h2>
        <p className="text-muted-foreground text-sm">
          {rfiQuery.data?.error?.message ?? "An unexpected error occurred."}
        </p>
        <Button variant="outline" onClick={() => void rfiQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const rfi = rfiQuery.data?.data;

  if (!rfi) {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <FileQuestion className="h-10 w-10 text-muted-foreground" />
        <h2 className="text-lg font-semibold">RFI Not Found</h2>
        <p className="text-muted-foreground text-sm">
          This RFI may have been deleted or the link is invalid.
        </p>
        <Link to="/rfi">
          <Button variant="outline">Back to RFIs</Button>
        </Link>
      </div>
    );
  }

  const responses: RFIResponseView[] = responsesQuery.data ?? [];
  const rfiDocs: RFIDocumentView[] = docsQuery.data ?? [];
  const isMock = rfiQuery.data?.isMockData === true;
  const isClient = norm(userRole) === "client";

  // Docs available to attach (not already attached, not archived)
  const attachableIds = new Set(rfiDocs.map((d) => d.document_id));
  const availableDocs = allDocs.filter((d) => !attachableIds.has(d.id) && !d.deleted_at);

  // ── Action handlers ───────────────────────────────────────────────────────

  async function handleSubmit() {
    setActionError(null);
    const r = await submitMut.mutateAsync();
    if (r.error) setActionError(r.error?.message ?? "An error occurred.");
  }

  async function handleAssign() {
    if (!assigneeId) return;
    setActionError(null);
    const r = await assignMut.mutateAsync({ profile_id: assigneeId });
    if (r.error) {
      setActionError(r.error?.message ?? "An error occurred.");
    } else {
      setShowAssign(false);
      setAssigneeId("");
    }
  }

  async function handleRespond() {
    if (!responseText.trim()) return;
    setActionError(null);
    const r = await respondMut.mutateAsync({
      response_text: responseText.trim(),
      response_type: responseType,
    });
    if (r.error) {
      setActionError(r.error?.message ?? "An error occurred.");
    } else {
      setShowRespond(false);
      setResponseText("");
      setResponseType("answer");
    }
  }

  async function handleMoreInfo() {
    if (!moreInfoText.trim()) return;
    setActionError(null);
    const r = await moreInfoMut.mutateAsync(moreInfoText.trim());
    if (r.error) {
      setActionError(r.error?.message ?? "An error occurred.");
    } else {
      setShowMoreInfo(false);
      setMoreInfoText("");
    }
  }

  async function handleClose() {
    setActionError(null);
    const r = await closeMut.mutateAsync();
    if (r.error) setActionError(r.error?.message ?? "An error occurred.");
  }

  async function handleReopen() {
    setActionError(null);
    const r = await reopenMut.mutateAsync();
    if (r.error) setActionError(r.error?.message ?? "An error occurred.");
  }

  async function handleArchive() {
    setActionError(null);
    const r = await archiveMut.mutateAsync();
    if (r.error) {
      setActionError(r.error?.message ?? "An error occurred.");
    } else {
      void navigate({ to: "/rfi", replace: true });
    }
  }

  async function handleRestore() {
    setActionError(null);
    const r = await restoreMut.mutateAsync();
    if (r.error) setActionError(r.error?.message ?? "An error occurred.");
  }

  async function handleVoid() {
    if (!voidReason.trim()) {
      setActionError("Void reason is required.");
      return;
    }
    setActionError(null);
    const r = await voidMut.mutateAsync({
      void_reason: voidReason.trim(),
      expected_revision_number: rfi!.revision_number,
    });
    if (r.error) {
      setActionError(r.error?.message ?? "An error occurred.");
    } else {
      setShowVoid(false);
      setVoidReason("");
    }
  }

  async function handleAttach() {
    if (!attachDocId) return;
    setActionError(null);
    const r = await attachMut.mutateAsync(attachDocId);
    if (r.error) {
      setActionError(r.error?.message ?? "An error occurred.");
    } else {
      setShowAttach(false);
      setAttachDocId("");
    }
  }

  async function handleRemoveDoc(documentId: string) {
    setActionError(null);
    const r = await removeMut.mutateAsync(documentId);
    if (r.error) setActionError(r.error?.message ?? "An error occurred.");
  }

  const anyBusy =
    submitMut.isPending ||
    assignMut.isPending ||
    respondMut.isPending ||
    moreInfoMut.isPending ||
    closeMut.isPending ||
    reopenMut.isPending ||
    archiveMut.isPending ||
    restoreMut.isPending ||
    voidMut.isPending ||
    attachMut.isPending ||
    removeMut.isPending;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6">
      {/* Breadcrumb */}
      <Link
        to="/rfi"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to RFIs
      </Link>

      {/* Mock banner */}
      {isMock && (
        <Alert className="border-yellow-300 bg-yellow-50 text-yellow-800">
          <AlertDescription>
            Demo mode — changes are temporary and disappear after refresh.
          </AlertDescription>
        </Alert>
      )}

      {/* Archived banner */}
      {rfi.status === "archived" && (
        <Alert className="border-slate-300 bg-slate-50">
          <Archive className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>This RFI is archived.</span>
            {canRestore(rfi, userRole) && (
              <Button
                size="sm"
                variant="outline"
                disabled={restoreMut.isPending}
                onClick={handleRestore}
              >
                {restoreMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <RotateCcw className="h-3 w-3 mr-1" />
                Restore
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Voided banner */}
      {rfi.status === "voided" && (
        <Alert variant="destructive" className="border-red-300 bg-red-50">
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            <span className="font-medium">This RFI is voided.</span>
            {rfi.void_reason && <span className="ml-2 text-sm">Reason: {rfi.void_reason}</span>}
          </AlertDescription>
        </Alert>
      )}

      {/* Action error */}
      {actionError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {/* Header */}
      <PageHeader
        title={`${rfi.rfi_number}: ${rfi.title}`}
        subtitle={rfi.project_name ?? ""}
        actions={
          <div className="flex flex-wrap gap-2">
            {/* Edit */}
            {canEdit(rfi, userRole) && (
              <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}>
                Edit
              </Button>
            )}

            {/* Submit */}
            {canSubmit(rfi, userRole) && (
              <Button size="sm" disabled={anyBusy} onClick={handleSubmit}>
                {submitMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Send className="h-3 w-3 mr-1" />
                Submit RFI
              </Button>
            )}

            {/* Assign */}
            {canAssign(rfi, userRole) && (
              <Button
                variant="outline"
                size="sm"
                disabled={anyBusy}
                onClick={() => setShowAssign(true)}
              >
                <UserCheck className="h-3 w-3 mr-1" />
                Assign
              </Button>
            )}

            {/* Respond */}
            {canRespond(rfi, userRole) && (
              <Button size="sm" disabled={anyBusy} onClick={() => setShowRespond(true)}>
                <MessageSquare className="h-3 w-3 mr-1" />
                Respond
              </Button>
            )}

            {/* Request More Info */}
            {isAdminOrPM(userRole) && canRespond(rfi, userRole) && (
              <Button
                variant="outline"
                size="sm"
                disabled={anyBusy}
                onClick={() => setShowMoreInfo(true)}
              >
                Request More Info
              </Button>
            )}

            {/* Close */}
            {canClose(rfi, userRole) && (
              <Button variant="outline" size="sm" disabled={anyBusy} onClick={handleClose}>
                {closeMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Lock className="h-3 w-3 mr-1" />
                Close
              </Button>
            )}

            {/* Reopen */}
            {canReopen(rfi, userRole) && (
              <Button variant="outline" size="sm" disabled={anyBusy} onClick={handleReopen}>
                {reopenMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <RefreshCw className="h-3 w-3 mr-1" />
                Reopen
              </Button>
            )}

            {/* Archive */}
            {canArchive(rfi, userRole) && (
              <Button
                variant="outline"
                size="sm"
                disabled={anyBusy}
                onClick={() => setShowArchiveConfirm(true)}
              >
                <Archive className="h-3 w-3 mr-1" />
                Archive
              </Button>
            )}

            {/* Void (Admin only) */}
            {canVoid(rfi, userRole) && (
              <Button
                variant="destructive"
                size="sm"
                disabled={anyBusy}
                onClick={() => setShowVoid(true)}
              >
                <XCircle className="h-3 w-3 mr-1" />
                Void
              </Button>
            )}
          </div>
        }
      />

      {/* Meta grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetaCard label="Status">
          <Badge className={`text-xs ${STATUS_CLASS[rfi.status] ?? "bg-gray-100 text-gray-600"}`}>
            {STATUS_LABEL[rfi.status] ?? rfi.status}
          </Badge>
          <DueBadgePill rfi={rfi} />
        </MetaCard>
        <MetaCard label="Priority">
          <Badge
            className={`text-xs capitalize ${PRIORITY_CLASS[rfi.priority] ?? "bg-gray-100 text-gray-600"}`}
          >
            {rfi.priority}
          </Badge>
          {rfi.priority === "critical" && (
            <Badge className="text-xs bg-red-100 text-red-800 font-semibold">Critical</Badge>
          )}
        </MetaCard>
        <MetaCard label="Discipline">{rfi.discipline ?? "—"}</MetaCard>
        <MetaCard label="Revision">Rev. {rfi.revision_number}</MetaCard>
        <MetaCard label="Submitted By">{rfi.submitter_name ?? "—"}</MetaCard>
        <MetaCard label="Assigned To">{rfi.assignee_name ?? "Unassigned"}</MetaCard>
        <MetaCard label="Required By">
          {rfi.required_date ? formatDate(rfi.required_date) : "—"}
        </MetaCard>
        <MetaCard label="Impact">
          <span className="flex gap-1 flex-wrap">
            {rfi.cost_impact && <Badge className="text-xs bg-amber-100 text-amber-700">Cost</Badge>}
            {rfi.schedule_impact && (
              <Badge className="text-xs bg-purple-100 text-purple-700">Schedule</Badge>
            )}
            {!rfi.cost_impact && !rfi.schedule_impact && (
              <span className="text-muted-foreground text-sm">None</span>
            )}
          </span>
        </MetaCard>
      </div>

      {/* Question */}
      <div className="rounded-lg border bg-muted/30 p-4 space-y-1">
        <p className="text-xs font-medium uppercase text-muted-foreground tracking-wide">
          Question
        </p>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {rfi.question ?? rfi.description ?? "No question text provided."}
        </p>
      </div>

      {/* Tabs: Responses + Documents */}
      <Tabs defaultValue="responses">
        <TabsList>
          <TabsTrigger value="responses">Responses ({responses.length})</TabsTrigger>
          <TabsTrigger value="documents">Documents ({rfiDocs.length})</TabsTrigger>
        </TabsList>

        {/* Responses tab */}
        <TabsContent value="responses" className="space-y-4">
          {responses.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="No responses yet"
              description={
                canRespond(rfi, userRole)
                  ? "Be the first to respond to this RFI."
                  : "No responses have been submitted yet."
              }
            />
          ) : (
            <div className="space-y-3">
              {responses.map((resp) => (
                <ResponseCard key={resp.id} resp={resp} isClient={isClient} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Documents tab */}
        <TabsContent value="documents" className="space-y-4">
          <div className="flex justify-end">
            {!isClient && !["archived", "voided", "closed"].includes(rfi.status) && (
              <Button
                size="sm"
                variant="outline"
                disabled={anyBusy}
                onClick={() => setShowAttach(true)}
              >
                <Paperclip className="h-3 w-3 mr-1" />
                Attach Document
              </Button>
            )}
          </div>

          {rfiDocs.length === 0 ? (
            <EmptyState
              icon={Paperclip}
              title="No documents attached"
              description="Attach existing project documents to this RFI."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attached By</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rfiDocs.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">
                      {doc.document_title}
                      {doc.is_archived && (
                        <Badge className="ml-2 text-xs bg-slate-100 text-slate-500">Archived</Badge>
                      )}
                    </TableCell>
                    <TableCell className="capitalize text-sm text-muted-foreground">
                      {doc.document_status}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {doc.attached_by_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(doc.created_at)}
                    </TableCell>
                    <TableCell>
                      {!isClient && !["archived", "voided", "closed"].includes(rfi.status) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={removeMut.isPending}
                          onClick={() => void handleRemoveDoc(doc.document_id)}
                        >
                          {removeMut.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Remove"
                          )}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Dialogs ─────────────────────────────────────────────────────────── */}

      {/* Edit */}
      <RFIFormModal open={showEdit} onOpenChange={setShowEdit} initialRFI={rfi} />

      {/* Assign responder */}
      <Dialog open={showAssign} onOpenChange={setShowAssign}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Assign Responder</DialogTitle>
            <DialogDescription>
              Enter the profile ID of the team member to assign.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Profile ID</Label>
            <Input
              placeholder="Profile UUID"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssign(false)}>
              Cancel
            </Button>
            <Button disabled={assignMut.isPending || !assigneeId} onClick={handleAssign}>
              {assignMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Respond */}
      <Dialog open={showRespond} onOpenChange={setShowRespond}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Add Response</DialogTitle>
            <DialogDescription>
              Submit your response. Internal notes are not visible to the client.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Response Type</Label>
              <Select
                value={responseType}
                onValueChange={(v) => setResponseType(v as RFIResponseType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="answer">Answer</SelectItem>
                  <SelectItem value="clarification">Clarification</SelectItem>
                  <SelectItem value="request_more_info">Request More Info</SelectItem>
                  {!isClient && <SelectItem value="internal_note">Internal Note</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Response *</Label>
              <Textarea
                rows={5}
                placeholder="Enter your response..."
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRespond(false)}>
              Cancel
            </Button>
            <Button disabled={respondMut.isPending || !responseText.trim()} onClick={handleRespond}>
              {respondMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Response
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request More Info */}
      <Dialog open={showMoreInfo} onOpenChange={setShowMoreInfo}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Request More Information</DialogTitle>
            <DialogDescription>
              Ask the submitter for additional information before closing the RFI.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label>Message *</Label>
            <Textarea
              rows={4}
              placeholder="Describe what additional information is needed..."
              value={moreInfoText}
              onChange={(e) => setMoreInfoText(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMoreInfo(false)}>
              Cancel
            </Button>
            <Button
              disabled={moreInfoMut.isPending || !moreInfoText.trim()}
              onClick={handleMoreInfo}
            >
              {moreInfoMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Attach document */}
      <Dialog open={showAttach} onOpenChange={setShowAttach}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Attach Document</DialogTitle>
            <DialogDescription>
              Select an existing project document to attach to this RFI.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label>Document</Label>
            <Select value={attachDocId} onValueChange={setAttachDocId}>
              <SelectTrigger>
                <SelectValue placeholder="Select document" />
              </SelectTrigger>
              <SelectContent>
                {availableDocs.length === 0 ? (
                  <SelectItem value="__none" disabled>
                    No available documents
                  </SelectItem>
                ) : (
                  availableDocs.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.title}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAttach(false)}>
              Cancel
            </Button>
            <Button disabled={attachMut.isPending || !attachDocId} onClick={handleAttach}>
              {attachMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Attach
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive confirm */}
      <AlertDialog open={showArchiveConfirm} onOpenChange={setShowArchiveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this RFI?</AlertDialogTitle>
            <AlertDialogDescription>
              This RFI will be archived and hidden from the default list. You can restore it later
              if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void handleArchive();
                setShowArchiveConfirm(false);
              }}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Void (Admin only) */}
      <Dialog open={showVoid} onOpenChange={setShowVoid}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Void RFI</DialogTitle>
            <DialogDescription>
              Voiding is a permanent terminal state. A reason is required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label>Void Reason *</Label>
            <Textarea
              rows={3}
              placeholder="Explain why this RFI is being voided..."
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
            />
          </div>
          {actionError && actionError.includes("REVISION_CONFLICT") && (
            <Alert variant="destructive">
              <AlertDescription>
                This RFI was updated by another user. Please refresh and try again.
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVoid(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={voidMut.isPending || !voidReason.trim()}
              onClick={handleVoid}
            >
              {voidMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Void RFI
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetaCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-3 space-y-1">
      <p className="text-xs font-medium uppercase text-muted-foreground tracking-wide">{label}</p>
      <div className="text-sm flex flex-wrap gap-1 items-center">{children}</div>
    </div>
  );
}

function ResponseCard({ resp, isClient }: { resp: RFIResponseView; isClient: boolean }) {
  const isInternal = resp.response_type === "internal_note";
  if (isClient && isInternal) return null;

  const typeClass: Record<RFIResponseType, string> = {
    clarification: "border-blue-200 bg-blue-50",
    answer: "border-green-200 bg-green-50",
    request_more_info: "border-yellow-200 bg-yellow-50",
    internal_note: "border-purple-200 bg-purple-50",
  };

  const typeLabel: Record<RFIResponseType, string> = {
    clarification: "Clarification",
    answer: "Answer",
    request_more_info: "Request More Info",
    internal_note: "Internal Note",
  };

  return (
    <div
      className={`rounded-lg border p-4 space-y-2 ${typeClass[resp.response_type] ?? "border-gray-200 bg-gray-50"}`}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">{resp.responder_name ?? "Former User"}</span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="text-xs">
            {typeLabel[resp.response_type]}
          </Badge>
          <span>{formatDateTime(resp.responded_at)}</span>
        </div>
      </div>
      <p className="text-sm whitespace-pre-wrap leading-relaxed">{resp.response_text}</p>
    </div>
  );
}
