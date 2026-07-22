/**
 * Submittal Detail Page — Phase 7
 *
 * Fetches submittal, items, and reviews from React Query hooks.
 * Role + status gated action buttons with disabled + spinner during mutation.
 * Archived banner with Restore button (Admin / PM only).
 * Revision conflict detection on revise-and-resubmit.
 * Inline review, revise, add-item, and attach-document dialogs.
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
import { EmptyState } from "@/components/shared/EmptyState";
import { SubmittalFormModal } from "@/components/submittals/SubmittalFormModal";
import {
  useSubmittal,
  useSubmittalItems,
  useSubmittalReviews,
  useUpdateSubmittal,
  useSubmitSubmittal,
  useReviewSubmittal,
  useReviseAndResubmit,
  useArchiveSubmittal,
  useRestoreSubmittal,
  useAddSubmittalItem,
  useRemoveSubmittalItem,
  useAttachDocument,
  useDetachDocument,
  useItemDocuments,
} from "@/hooks/api/useSubmittals";
import { useDocuments } from "@/hooks/api/useDocuments";
import { useAuth } from "@/contexts/auth-context";
import { IS_SUPABASE_CONFIGURED } from "@/lib/supabase";
import { getDueBadge } from "@/types/submittal-view";
import type { SubmittalStatus } from "@/types/database";
import type {
  SubmittalView,
  SubmittalItemView,
  ReviewActionInput,
  ReviseInput,
  SubmittalItemInput,
} from "@/types/submittal-view";
import {
  ArrowLeft,
  Send,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Archive,
  RotateCcw,
  Pencil,
  Plus,
  Paperclip,
  Trash2,
  AlertTriangle,
  Clock,
  Loader2,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { formatDate, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_app/submittals/$id")({
  head: () => ({ meta: [{ title: "Submittal Detail — ElectraFlow AI" }] }),
  component: SubmittalDetailPage,
});

// ─── Status helpers ────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<SubmittalStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "In Review",
  approved: "Approved",
  approved_as_noted: "Approved as Noted",
  revise_and_resubmit: "Revise & Resubmit",
  rejected: "Rejected",
  archived: "Archived",
};

const STATUS_CLASS: Record<SubmittalStatus, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  submitted: "bg-info/15 text-info border-info/30",
  under_review: "bg-info/15 text-info border-info/30",
  approved: "bg-success/15 text-success border-success/30",
  approved_as_noted: "bg-success/15 text-success border-success/30",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
  revise_and_resubmit: "bg-warning/15 text-warning border-warning/30",
  archived: "bg-muted text-muted-foreground border-border",
};

const REVIEW_ACTION_LABELS: Record<string, string> = {
  approved: "Approve",
  approved_as_noted: "Approve as Noted",
  rejected: "Reject",
  revise_and_resubmit: "Request Revision",
};

// ─── Role helpers ─────────────────────────────────────────────────────────────

function norm(role: string | null | undefined): string {
  return (role ?? "").toLowerCase().replace(/ /g, "_");
}

function canReview(role: string | null | undefined): boolean {
  const r = norm(role);
  return ["admin", "project_manager", "senior_electrical_engineer", "qa_qc_engineer"].includes(r);
}

function canCreate(role: string | null | undefined): boolean {
  const r = norm(role);
  return ["admin", "project_manager", "senior_electrical_engineer", "electrical_engineer"].includes(
    r,
  );
}

function canArchiveRestore(role: string | null | undefined): boolean {
  const r = norm(role);
  return ["admin", "project_manager"].includes(r);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DueBadgeChip({ type }: { type: ReturnType<typeof getDueBadge> }) {
  if (!type) return null;
  if (type === "overdue")
    return (
      <Badge
        variant="outline"
        className="bg-destructive/15 text-destructive border-destructive/30 text-xs"
      >
        <AlertTriangle className="h-3 w-3 mr-1" /> Overdue
      </Badge>
    );
  if (type === "due_soon")
    return (
      <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30 text-xs">
        <Clock className="h-3 w-3 mr-1" /> Due Soon
      </Badge>
    );
  if (type === "approved_late")
    return (
      <Badge
        variant="outline"
        className="bg-orange-500/15 text-orange-600 border-orange-500/30 text-xs"
      >
        <CheckCircle2 className="h-3 w-3 mr-1" /> Approved Late
      </Badge>
    );
  return null;
}

// ─── Review action dialog ─────────────────────────────────────────────────────

interface ReviewDialogProps {
  open: boolean;
  action: ReviewActionInput["action"] | null;
  onClose: () => void;
  onConfirm: (input: ReviewActionInput) => void;
  isPending: boolean;
}

function ReviewActionDialog({ open, action, onClose, onConfirm, isPending }: ReviewDialogProps) {
  const [comments, setComments] = useState("");

  const requiresComments = action === "rejected" || action === "revise_and_resubmit";

  function handleSubmit() {
    if (requiresComments && !comments.trim()) {
      toast.error("Comments are required for this action.");
      return;
    }
    onConfirm({ action: action!, comments: comments.trim() || undefined });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !isPending) {
          setComments("");
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{action ? REVIEW_ACTION_LABELS[action] : ""}</DialogTitle>
          <DialogDescription>
            {requiresComments
              ? "Comments are required before confirming this action."
              : "Confirm your review decision. You may optionally add comments."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Label htmlFor="review-comments">
            Comments {requiresComments && <span className="text-destructive">*</span>}
          </Label>
          <Textarea
            id="review-comments"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder={requiresComments ? "Explain the reason…" : "Optional comment…"}
            rows={4}
            disabled={isPending}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setComments("");
              onClose();
            }}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || (requiresComments && !comments.trim())}
            variant={action === "rejected" ? "destructive" : "default"}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {action ? REVIEW_ACTION_LABELS[action] : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Revise dialog ────────────────────────────────────────────────────────────

interface ReviseDialogProps {
  open: boolean;
  currentRevision: number;
  onClose: () => void;
  onConfirm: (input: ReviseInput) => void;
  isPending: boolean;
}

function ReviseDialog({ open, currentRevision, onClose, onConfirm, isPending }: ReviseDialogProps) {
  const [changeSummary, setChangeSummary] = useState("");
  const [revisionNotes, setRevisionNotes] = useState("");

  function handleSubmit() {
    if (!changeSummary.trim()) {
      toast.error("Change summary is required.");
      return;
    }
    if (!revisionNotes.trim()) {
      toast.error("Revision notes are required.");
      return;
    }
    onConfirm({
      change_summary: changeSummary.trim(),
      revision_notes: revisionNotes.trim(),
      expected_revision_number: currentRevision,
    });
  }

  function handleClose() {
    if (isPending) return;
    setChangeSummary("");
    setRevisionNotes("");
    onClose();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Revise &amp; Resubmit</DialogTitle>
          <DialogDescription>
            Creating revision {currentRevision + 1}. Both fields are required.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="change-summary">
              Change Summary <span className="text-destructive">*</span>
            </Label>
            <Input
              id="change-summary"
              value={changeSummary}
              onChange={(e) => setChangeSummary(e.target.value)}
              placeholder="Brief description of what changed…"
              disabled={isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="revision-notes">
              Revision Notes <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="revision-notes"
              value={revisionNotes}
              onChange={(e) => setRevisionNotes(e.target.value)}
              placeholder="Detailed notes explaining the revision…"
              rows={4}
              disabled={isPending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !changeSummary.trim() || !revisionNotes.trim()}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Revise &amp; Resubmit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add item dialog ──────────────────────────────────────────────────────────

interface AddItemDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (input: SubmittalItemInput) => void;
  isPending: boolean;
}

function AddItemDialog({ open, onClose, onAdd, isPending }: AddItemDialogProps) {
  const [form, setForm] = useState<SubmittalItemInput>({ equipment_name: "" });

  function handleAdd() {
    if (!form.equipment_name.trim()) {
      toast.error("Equipment name is required.");
      return;
    }
    onAdd({ ...form, equipment_name: form.equipment_name.trim() });
  }

  function handleClose() {
    if (isPending) return;
    setForm({ equipment_name: "" });
    onClose();
  }

  const set = (field: keyof SubmittalItemInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Item</DialogTitle>
          <DialogDescription>Add a product or equipment item to this submittal.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>
              Equipment / Product Name <span className="text-destructive">*</span>
            </Label>
            <Input
              value={form.equipment_name}
              onChange={set("equipment_name")}
              placeholder="e.g. XLPE Power Cable 4C×95mm²"
              disabled={isPending}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Manufacturer</Label>
              <Input
                value={form.manufacturer ?? ""}
                onChange={set("manufacturer")}
                placeholder="e.g. ABB"
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Model Number</Label>
              <Input
                value={form.model_number ?? ""}
                onChange={set("model_number")}
                placeholder="e.g. XLP-95"
                disabled={isPending}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Spec Section</Label>
              <Input
                value={form.spec_section ?? ""}
                onChange={set("spec_section")}
                placeholder="e.g. 26 05 19"
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Quantity</Label>
              <Input
                type="number"
                value={form.quantity ?? ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    quantity: e.target.value ? Number(e.target.value) : undefined,
                  }))
                }
                placeholder="e.g. 100"
                disabled={isPending}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={isPending || !form.equipment_name.trim()}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add Item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Attach document dialog ────────────────────────────────────────────────────

interface AttachDocDialogProps {
  open: boolean;
  itemId: string;
  submittalId: string;
  onClose: () => void;
}

function AttachDocDialog({ open, itemId, submittalId, onClose }: AttachDocDialogProps) {
  const [search, setSearch] = useState("");
  const docsQuery = useDocuments({ includeArchived: false });
  const attachMutation = useAttachDocument(submittalId);
  const itemDocsQuery = useItemDocuments(itemId);

  const alreadyAttached = new Set((itemDocsQuery.data ?? []).map((d) => d.document_id));

  const docs = (docsQuery.data ?? ([] as DocumentView[])).filter(
    (d: DocumentView) =>
      !alreadyAttached.has(d.id) &&
      (!search ||
        d.title.toLowerCase().includes(search.toLowerCase()) ||
        d.document_number?.toLowerCase().includes(search.toLowerCase())),
  );

  async function attach(documentId: string) {
    const result = await attachMutation.mutateAsync({ itemId, documentId });
    if (result.error) {
      toast.error(result.error.message);
    } else {
      toast.success("Document attached.");
      onClose();
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !attachMutation.isPending) {
          setSearch("");
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Attach Document</DialogTitle>
          <DialogDescription>
            Select an existing project document to attach to this item.
          </DialogDescription>
        </DialogHeader>

        <Input
          placeholder="Search documents…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mt-2"
        />

        <div className="flex-1 overflow-y-auto mt-3 space-y-1 min-h-0">
          {docsQuery.isLoading ? (
            <div className="space-y-2 p-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : docs.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              {search
                ? "No documents match your search."
                : "All available documents are already attached."}
            </p>
          ) : (
            docs.map((d: DocumentView) => (
              <div
                key={d.id}
                className="flex items-center justify-between p-2.5 rounded-lg border hover:bg-muted/30 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{d.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {d.document_number ?? d.document_type ?? "—"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-3 shrink-0"
                  disabled={attachMutation.isPending}
                  onClick={() => void attach(d.id)}
                >
                  {attachMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    "Attach"
                  )}
                </Button>
              </div>
            ))
          )}
        </div>

        <DialogFooter className="mt-3">
          <Button
            variant="outline"
            onClick={() => {
              setSearch("");
              onClose();
            }}
            disabled={attachMutation.isPending}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Items tab content ────────────────────────────────────────────────────────

interface ItemsTabProps {
  submittal: SubmittalView;
  role: string | null | undefined;
  isMockMode: boolean;
}

function ItemsTab({ submittal, role, isMockMode }: ItemsTabProps) {
  const itemsQuery = useSubmittalItems(submittal.id);
  const addItem = useAddSubmittalItem(submittal.id);
  const removeItem = useRemoveSubmittalItem(submittal.id);
  const detachDoc = useDetachDocument(submittal.id);

  const [addOpen, setAddOpen] = useState(false);
  const [attachItem, setAttachItem] = useState<string | null>(null);
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null);

  const items = itemsQuery.data?.data ?? [];
  const canEdit =
    canCreate(role) &&
    !submittal.deleted_at &&
    (["draft", "revise_and_resubmit"].includes(submittal.status) || canArchiveRestore(role));

  async function handleAdd(input: SubmittalItemInput) {
    const result = await addItem.mutateAsync(input);
    if (result.error) {
      toast.error(result.error.message);
    } else {
      toast.success("Item added.");
      setAddOpen(false);
    }
  }

  async function handleRemove(itemId: string) {
    const result = await removeItem.mutateAsync(itemId);
    if (result.error) {
      toast.error(result.error.message);
    } else {
      toast.success("Item removed.");
    }
    setRemoveConfirmId(null);
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add Item
          </Button>
        </div>
      )}

      {itemsQuery.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No items yet"
          description={
            canEdit ? "Add the first item to this submittal." : "No items have been added."
          }
          action={
            canEdit ? (
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Add Item
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="px-4 py-3 font-semibold">Equipment / Product</TableHead>
                <TableHead className="px-3 py-3 font-semibold hidden sm:table-cell">
                  Manufacturer
                </TableHead>
                <TableHead className="px-3 py-3 font-semibold hidden md:table-cell">Spec</TableHead>
                <TableHead className="px-3 py-3 font-semibold">Docs</TableHead>
                {canEdit && <TableHead className="px-3 py-3" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="px-4 py-3">
                    <p className="font-medium text-sm">{item.equipment_name ?? item.description}</p>
                    {item.model_number && (
                      <p className="text-xs text-muted-foreground">Model: {item.model_number}</p>
                    )}
                  </TableCell>
                  <TableCell className="px-3 py-3 hidden sm:table-cell text-sm text-muted-foreground">
                    {item.manufacturer ?? "—"}
                  </TableCell>
                  <TableCell className="px-3 py-3 hidden md:table-cell text-sm font-mono text-muted-foreground">
                    {item.spec_section ?? "—"}
                  </TableCell>
                  <TableCell className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {item.attached_document_ids.length} doc
                        {item.attached_document_ids.length !== 1 ? "s" : ""}
                      </span>
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs"
                          onClick={() => setAttachItem(item.id)}
                        >
                          <Paperclip className="h-3 w-3 mr-1" /> Attach
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  {canEdit && (
                    <TableCell className="px-3 py-3 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setRemoveConfirmId(item.id)}
                        disabled={removeItem.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AddItemDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={handleAdd}
        isPending={addItem.isPending}
      />

      {attachItem && (
        <AttachDocDialog
          open={true}
          itemId={attachItem}
          submittalId={submittal.id}
          onClose={() => setAttachItem(null)}
        />
      )}

      <AlertDialog
        open={!!removeConfirmId}
        onOpenChange={(o) => {
          if (!o) setRemoveConfirmId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Item?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the item from the submittal. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => removeConfirmId && void handleRemove(removeConfirmId)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Review history tab ───────────────────────────────────────────────────────

function ReviewHistoryTab({ submittalId }: { submittalId: string }) {
  const reviewsQuery = useSubmittalReviews(submittalId);
  const reviews = reviewsQuery.data?.data ?? [];

  const ACTION_LABELS: Record<string, string> = {
    approved: "Approved",
    approved_as_noted: "Approved as Noted",
    rejected: "Rejected",
    revise_and_resubmit: "Revision Requested",
    for_record_only: "For Record Only",
  };

  const ACTION_CLASS: Record<string, string> = {
    approved: "bg-success/15 text-success border-success/30",
    approved_as_noted: "bg-success/15 text-success border-success/30",
    rejected: "bg-destructive/15 text-destructive border-destructive/30",
    revise_and_resubmit: "bg-warning/15 text-warning border-warning/30",
    for_record_only: "bg-muted text-muted-foreground border-border",
  };

  if (reviewsQuery.isLoading)
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );

  if (reviews.length === 0)
    return (
      <EmptyState
        icon={CheckCircle2}
        title="No reviews yet"
        description="This submittal has not been reviewed yet."
      />
    );

  return (
    <div className="space-y-3">
      {reviews.map((r) => (
        <div key={r.id} className="rounded-lg border p-4 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{r.reviewer_name ?? "Unknown Reviewer"}</p>
              <p className="text-xs text-muted-foreground">{formatDateTime(r.reviewed_at)}</p>
            </div>
            <Badge variant="outline" className={`text-xs ${ACTION_CLASS[r.action] ?? ""}`}>
              {ACTION_LABELS[r.action] ?? r.action}
            </Badge>
          </div>
          {r.comments && (
            <p className="text-sm text-muted-foreground bg-muted/30 rounded p-3 leading-relaxed">
              {r.comments}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function SubmittalDetailPage() {
  const { id } = Route.useParams();
  const { role } = useAuth();
  const navigate = useNavigate();

  const { data: result, isLoading, isError } = useSubmittal(id);
  const submittal = result?.data ?? null;
  const isMockMode = result?.isMockData ?? !IS_SUPABASE_CONFIGURED;

  const updateMutation = useUpdateSubmittal(id);
  const submitMutation = useSubmitSubmittal(id);
  const reviewMutation = useReviewSubmittal(id);
  const reviseMutation = useReviseAndResubmit(id);
  const archiveMutation = useArchiveSubmittal(id);
  const restoreMutation = useRestoreSubmittal(id);

  const [editOpen, setEditOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<ReviewActionInput["action"] | null>(null);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(false);

  // ─── Loading / error / not found ───────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-96" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (isError || !submittal) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/submittals">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Submittals
          </Link>
        </Button>
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-8 text-center space-y-3">
          <XCircle className="h-10 w-10 text-destructive mx-auto" />
          <h2 className="text-lg font-semibold">Submittal Not Found</h2>
          <p className="text-sm text-muted-foreground">
            This submittal does not exist or you do not have access.
          </p>
          <Button variant="outline" asChild>
            <Link to="/submittals">Back to Submittals</Link>
          </Button>
        </div>
      </div>
    );
  }

  const isArchived = !!submittal.deleted_at;
  const dueBadge = getDueBadge(submittal);
  const anyPending =
    submitMutation.isPending ||
    reviewMutation.isPending ||
    reviseMutation.isPending ||
    archiveMutation.isPending ||
    restoreMutation.isPending;

  // ─── Action handlers ────────────────────────────────────────────────────────

  async function handleSubmit() {
    const result = await submitMutation.mutateAsync();
    if (result.error) {
      toast.error(result.error.message);
    } else {
      toast.success("Submittal submitted for review.");
    }
  }

  async function handleReview(input: ReviewActionInput) {
    const result = await reviewMutation.mutateAsync(input);
    if (result.error) {
      toast.error(result.error.message);
    } else {
      toast.success(`Submittal ${REVIEW_ACTION_LABELS[input.action].toLowerCase()}d.`);
      setReviewAction(null);
    }
  }

  async function handleRevise(input: ReviseInput) {
    const result = await reviseMutation.mutateAsync(input);
    if (result.error) {
      if (result.error.message.includes("REVISION_CONFLICT")) {
        toast.error("Revision conflict — another user updated this submittal. Refreshing…");
        setTimeout(() => window.location.reload(), 1500);
      } else {
        toast.error(result.error.message);
      }
    } else {
      toast.success("Submittal revised and resubmitted.");
      setReviseOpen(false);
    }
  }

  async function handleArchive() {
    const result = await archiveMutation.mutateAsync();
    if (result.error) {
      toast.error(result.error.message);
    } else {
      toast.success("Submittal archived.");
      setArchiveConfirm(false);
    }
  }

  async function handleRestore() {
    const result = await restoreMutation.mutateAsync();
    if (result.error) {
      toast.error(result.error.message);
    } else {
      toast.success("Submittal restored.");
    }
  }

  // ─── Derived permission flags ────────────────────────────────────────────────

  const canSubmit =
    canCreate(role) &&
    !isArchived &&
    (submittal.status === "draft" || submittal.status === "revise_and_resubmit");

  const canDoRevise = canCreate(role) && !isArchived && submittal.status === "revise_and_resubmit";

  const canDoReview =
    canReview(role) && !isArchived && ["submitted", "under_review"].includes(submittal.status);

  const canEdit =
    canCreate(role) && !isArchived && ["draft", "revise_and_resubmit"].includes(submittal.status);

  const canArchive = canArchiveRestore(role) && !isArchived;
  const canRestore = canArchiveRestore(role) && isArchived;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* Back link */}
      <Button variant="ghost" size="sm" asChild>
        <Link to="/submittals">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Submittals
        </Link>
      </Button>

      {/* Demo banner */}
      {isMockMode && (
        <Alert className="border-warning/40 bg-warning/10 text-warning text-sm">
          <AlertDescription>
            Demo mode — changes are temporary and will disappear after refresh.
          </AlertDescription>
        </Alert>
      )}

      {/* Archived banner */}
      {isArchived && (
        <Alert className="border-border bg-muted/40">
          <Archive className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>This submittal has been archived.</span>
            {canRestore && (
              <Button
                size="sm"
                variant="outline"
                className="ml-4"
                onClick={() => void handleRestore()}
                disabled={restoreMutation.isPending}
              >
                {restoreMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4 mr-2" />
                )}
                Restore
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">
              {submittal.submittal_number}
            </span>
            <Badge variant="outline" className={`text-xs ${STATUS_CLASS[submittal.status]}`}>
              {STATUS_LABELS[submittal.status]}
            </Badge>
            <Badge
              variant="outline"
              className="text-xs bg-muted/50 border-border text-muted-foreground"
            >
              v{submittal.revision_number}
            </Badge>
            <DueBadgeChip type={dueBadge} />
          </div>
          <h1 className="text-xl font-semibold leading-tight">{submittal.title}</h1>
          {submittal.project_name && (
            <p className="text-sm text-muted-foreground">{submittal.project_name}</p>
          )}
        </div>

        {/* Action buttons */}
        {!isArchived && (
          <div className="flex flex-wrap gap-2 shrink-0">
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditOpen(true)}
                disabled={anyPending}
              >
                <Pencil className="h-4 w-4 mr-2" /> Edit
              </Button>
            )}
            {canSubmit && submittal.status === "draft" && (
              <Button size="sm" onClick={() => void handleSubmit()} disabled={anyPending}>
                {submitMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Submit for Review
              </Button>
            )}
            {canDoRevise && (
              <Button size="sm" onClick={() => setReviseOpen(true)} disabled={anyPending}>
                {reviseMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Revise &amp; Resubmit
              </Button>
            )}
            {canDoReview && (
              <>
                <Button
                  size="sm"
                  className="bg-success hover:bg-success/90 text-success-foreground"
                  onClick={() => setReviewAction("approved")}
                  disabled={anyPending}
                >
                  {reviewMutation.isPending && reviewMutation.variables?.action === "approved" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setReviewAction("approved_as_noted")}
                  disabled={anyPending}
                >
                  {reviewMutation.isPending &&
                  reviewMutation.variables?.action === "approved_as_noted" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Approve as Noted
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setReviewAction("revise_and_resubmit")}
                  disabled={anyPending}
                >
                  {reviewMutation.isPending &&
                  reviewMutation.variables?.action === "revise_and_resubmit" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Request Revision
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setReviewAction("rejected")}
                  disabled={anyPending}
                >
                  {reviewMutation.isPending && reviewMutation.variables?.action === "rejected" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4 mr-2" />
                  )}
                  Reject
                </Button>
              </>
            )}
            {canArchive && (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => setArchiveConfirm(true)}
                disabled={anyPending}
              >
                {archiveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Archive className="h-4 w-4 mr-2" />
                )}
                Archive
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Metadata cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Discipline", value: submittal.discipline ?? "—" },
          { label: "Spec Section", value: submittal.spec_section ?? "—" },
          {
            label: "Submitted Date",
            value: submittal.submitted_date ? formatDate(submittal.submitted_date) : "—",
          },
          {
            label: "Required Date",
            value: submittal.required_date ? formatDate(submittal.required_date) : "—",
          },
          {
            label: "Review Due",
            value: submittal.review_due_date ? formatDate(submittal.review_due_date) : "—",
          },
          {
            label: "Returned Date",
            value: submittal.returned_date ? formatDate(submittal.returned_date) : "—",
          },
          { label: "Submitted By", value: submittal.submitter_name ?? "—" },
          { label: "Reviewer", value: submittal.reviewer_name ?? "—" },
        ].map((m) => (
          <div key={m.label} className="rounded-lg border p-4 space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {m.label}
            </p>
            <p className="text-sm font-semibold">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Description */}
      {submittal.description && (
        <div className="rounded-lg border p-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Description / Notes
          </p>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{submittal.description}</p>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="items" className="space-y-4">
        <TabsList>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="reviews">Review History</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="mt-4">
          <ItemsTab submittal={submittal} role={role} isMockMode={isMockMode} />
        </TabsContent>

        <TabsContent value="reviews" className="mt-4">
          <ReviewHistoryTab submittalId={id} />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <SubmittalFormModal
        open={editOpen}
        onClose={(success) => {
          setEditOpen(false);
          if (success) toast.success("Submittal updated.");
        }}
        initialSubmittal={submittal}
        isMockMode={isMockMode}
        onEdit={async (input) => {
          const result = await updateMutation.mutateAsync(input);
          return { error: result.error };
        }}
      />

      <ReviewActionDialog
        open={!!reviewAction}
        action={reviewAction}
        onClose={() => setReviewAction(null)}
        onConfirm={(input) => void handleReview(input)}
        isPending={reviewMutation.isPending}
      />

      <ReviseDialog
        open={reviseOpen}
        currentRevision={submittal.revision_number}
        onClose={() => setReviseOpen(false)}
        onConfirm={(input) => void handleRevise(input)}
        isPending={reviseMutation.isPending}
      />

      <AlertDialog open={archiveConfirm} onOpenChange={setArchiveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Submittal?</AlertDialogTitle>
            <AlertDialogDescription>
              This submittal will be archived (soft delete). Admin and Project Manager can restore
              it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => void handleArchive()}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
