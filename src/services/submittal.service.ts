/**
 * Submittal service — Phase 7
 *
 * Full Supabase CRUD with review workflow, revision control, document
 * attachment, and audit logging.  Falls back to mock/sessionStorage when
 * Supabase is not configured or the JWT is not ready (demo mode).
 *
 * Behaviour matrix:
 *   Supabase NOT configured  → mock always
 *   Supabase configured, JWT NOT ready → mock (dev warning logged)
 *   Supabase configured, JWT ready     → real DB
 *
 * Self-review rule: reviewer cannot be the same profile as submitted_by.
 * Revision conflict: checked by comparing expected_revision_number.
 * Unique submittal number: enforced by DB + friendly error on 23505.
 * Document attach validation: document must belong to same org and not be archived.
 */

import { supabase, IS_SUPABASE_CONFIGURED, isJwtReady } from "@/lib/supabase";
import { getSessionContext } from "@/lib/auth-bridge";
import { submittals as DUMMY_SUBMITTALS } from "@/lib/dummy-data";
import { logAction } from "@/services/audit.service";
import { ok, mockOk, fail, type ServiceResult } from "./_base.service";
import type {
  SubmittalView,
  SubmittalItemView,
  SubmittalReviewView,
  ItemDocumentView,
  SubmittalCreateInput,
  SubmittalUpdateInput,
  SubmittalItemInput,
  ReviseInput,
  ReviewActionInput,
  SubmittalFilterInput,
} from "@/types/submittal-view";
import type { ReviewAction } from "@/types/database";

// ─── Routing guard ────────────────────────────────────────────────────────────

function shouldUseSupabase(): boolean {
  if (!IS_SUPABASE_CONFIGURED || !supabase) return false;
  if (!isJwtReady()) {
    console.warn("[ElectraFlow] Supabase configured but JWT is not ready — using mock submittals.");
    return false;
  }
  return true;
}

// ─── Role helpers ─────────────────────────────────────────────────────────────

function normalizeRole(role: string | null | undefined): string {
  return (role ?? "").toLowerCase().replace(/ /g, "_");
}

function canReview(role: string | null | undefined): boolean {
  const r = normalizeRole(role);
  return ["admin", "project_manager", "senior_electrical_engineer", "qa_qc_engineer"].includes(r);
}

function canCreate(role: string | null | undefined): boolean {
  const r = normalizeRole(role);
  return ["admin", "project_manager", "senior_electrical_engineer", "electrical_engineer"].includes(
    r,
  );
}

function canArchiveRestore(role: string | null | undefined): boolean {
  const r = normalizeRole(role);
  return ["admin", "project_manager"].includes(r);
}

// ─── Mock data helpers ────────────────────────────────────────────────────────

const MOCK_KEY = "mep-submittals-mock";
const MOCK_ITEMS_KEY = "mep-submittal-items-mock";
const MOCK_REVIEWS_KEY = "mep-submittal-reviews-mock";
const MOCK_ITEM_DOCS_KEY = "mep-submittal-item-docs-mock";

const STATUS_MAP: Record<string, SubmittalView["status"]> = {
  "no exception": "approved",
  "need corrections": "approved_as_noted",
  "resubmittal required": "revise_and_resubmit",
  rejected: "rejected",
  "for record only": "approved",
};

type DummyRaw = (typeof DUMMY_SUBMITTALS)[number];

function toSubmittalView(raw: DummyRaw): SubmittalView {
  return {
    id: String(raw.id),
    organization_id: "mock-org",
    project_id: "p1",
    submittal_number: raw.mark,
    title: raw.product,
    discipline: null,
    spec_section: raw.section,
    status: STATUS_MAP[raw.status.toLowerCase()] ?? "draft",
    revision_number: 1,
    submitted_date: raw.due
      ? new Date(new Date(raw.due).getTime() - 7 * 86_400_000).toISOString().split("T")[0]
      : null,
    required_date: raw.due ?? null,
    review_due_date: raw.due ?? null,
    returned_date: null,
    approved_at: null,
    submitted_by: null,
    reviewer_id: null,
    description: raw.notes ?? null,
    client_visible: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: null,
    updated_by: null,
    deleted_at: null,
    submitter_name: raw.assignedTo ?? null,
    reviewer_name: null,
    project_name: "Riyadh Metro Phase 3 - Substation",
    item_count: 0,
  };
}

function getMockSubmittals(): SubmittalView[] {
  const base = DUMMY_SUBMITTALS.map(toSubmittalView);
  try {
    const raw = sessionStorage.getItem(MOCK_KEY);
    const overrides: SubmittalView[] = raw ? (JSON.parse(raw) as SubmittalView[]) : [];
    const overrideIds = new Set(overrides.map((s) => s.id));
    return [...overrides, ...base.filter((s) => !overrideIds.has(s.id))];
  } catch {
    return base;
  }
}

function saveMockSubmittals(items: SubmittalView[]): void {
  try {
    const base = DUMMY_SUBMITTALS.map(toSubmittalView);
    const baseIds = new Set(base.map((s) => s.id));
    const custom = items.filter((s) => !baseIds.has(s.id));
    const mutated = items.filter((s) => {
      if (baseIds.has(s.id)) {
        const b = base.find((b) => b.id === s.id);
        return JSON.stringify(s) !== JSON.stringify(b);
      }
      return false;
    });
    sessionStorage.setItem(MOCK_KEY, JSON.stringify([...custom, ...mutated]));
    // eslint-disable-next-line no-empty
  } catch {} // intentional: sessionStorage unavailable
}

function getMockItems(submittalId?: string): SubmittalItemView[] {
  try {
    const raw = sessionStorage.getItem(MOCK_ITEMS_KEY);
    const all: SubmittalItemView[] = raw ? (JSON.parse(raw) as SubmittalItemView[]) : [];
    return submittalId ? all.filter((i) => i.submittal_id === submittalId && !i.deleted_at) : all;
  } catch {
    return [];
  }
}

function saveMockItems(items: SubmittalItemView[]): void {
  try {
    sessionStorage.setItem(MOCK_ITEMS_KEY, JSON.stringify(items));
    // eslint-disable-next-line no-empty
  } catch {} // intentional: sessionStorage unavailable
}

function getMockReviews(submittalId: string): SubmittalReviewView[] {
  try {
    const raw = sessionStorage.getItem(MOCK_REVIEWS_KEY);
    const all: SubmittalReviewView[] = raw ? (JSON.parse(raw) as SubmittalReviewView[]) : [];
    return all.filter((r) => r.submittal_id === submittalId);
  } catch {
    return [];
  }
}

function saveMockReview(review: SubmittalReviewView): void {
  try {
    const raw = sessionStorage.getItem(MOCK_REVIEWS_KEY);
    const all: SubmittalReviewView[] = raw ? (JSON.parse(raw) as SubmittalReviewView[]) : [];
    sessionStorage.setItem(MOCK_REVIEWS_KEY, JSON.stringify([review, ...all]));
    // eslint-disable-next-line no-empty
  } catch {} // intentional: sessionStorage unavailable
}

function getMockItemDocs(itemId: string): ItemDocumentView[] {
  try {
    const raw = sessionStorage.getItem(MOCK_ITEM_DOCS_KEY);
    const all: ItemDocumentView[] = raw ? (JSON.parse(raw) as ItemDocumentView[]) : [];
    return all.filter((d) => d.submittal_item_id === itemId && !d.deleted_at);
  } catch {
    return [];
  }
}

function saveMockItemDoc(doc: ItemDocumentView): void {
  try {
    const raw = sessionStorage.getItem(MOCK_ITEM_DOCS_KEY);
    const all: ItemDocumentView[] = raw ? (JSON.parse(raw) as ItemDocumentView[]) : [];
    sessionStorage.setItem(MOCK_ITEM_DOCS_KEY, JSON.stringify([...all, doc]));
    // eslint-disable-next-line no-empty
  } catch {} // intentional: sessionStorage unavailable
}

function removeMockItemDoc(submittalItemId: string, documentId: string): void {
  try {
    const raw = sessionStorage.getItem(MOCK_ITEM_DOCS_KEY);
    const all: ItemDocumentView[] = raw ? (JSON.parse(raw) as ItemDocumentView[]) : [];
    const updated = all.map((d) =>
      d.submittal_item_id === submittalItemId && d.document_id === documentId
        ? { ...d, deleted_at: new Date().toISOString() }
        : d,
    );
    sessionStorage.setItem(MOCK_ITEM_DOCS_KEY, JSON.stringify(updated));
    // eslint-disable-next-line no-empty
  } catch {} // intentional: sessionStorage unavailable
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function listSubmittals(
  filters?: SubmittalFilterInput,
): Promise<ServiceResult<SubmittalView[]>> {
  if (!shouldUseSupabase()) {
    let items = getMockSubmittals();

    if (!filters?.includeArchived) {
      items = items.filter((s) => !s.deleted_at);
    }
    if (filters?.projectId) {
      items = items.filter((s) => s.project_id === filters.projectId);
    }
    if (filters?.status && filters.status !== "all") {
      items = items.filter((s) => s.status === filters.status);
    }
    if (filters?.discipline) {
      items = items.filter(
        (s) => s.discipline?.toLowerCase() === filters.discipline!.toLowerCase(),
      );
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      items = items.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.submittal_number.toLowerCase().includes(q) ||
          s.spec_section?.toLowerCase().includes(q),
      );
    }
    return mockOk(items);
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return mockOk(DUMMY_SUBMITTALS.map(toSubmittalView));

  try {
    let query = supabase!
      .from("submittals")
      .select(
        `
        *,
        submitter:profiles!submitted_by(full_name),
        reviewer:profiles!reviewer_id(full_name),
        project:projects!project_id(name)
      `,
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (!filters?.includeArchived) query = query.is("deleted_at", null);
    if (filters?.projectId) query = query.eq("project_id", filters.projectId);
    if (filters?.status && filters.status !== "all") query = query.eq("status", filters.status);
    if (filters?.discipline) query = query.eq("discipline", filters.discipline);
    if (filters?.search) {
      query = query.or(
        `title.ilike.%${filters.search}%,submittal_number.ilike.%${filters.search}%`,
      );
    }

    const { data, error } = await query;
    if (error) return fail<SubmittalView[]>(error);

    const rows = (data ?? []).map((row: unknown): SubmittalView => {
      const r = row as Record<string, unknown>;
      return {
        ...(r as unknown as SubmittalView),
        submitter_name: (r.submitter as { full_name?: string } | null)?.full_name ?? null,
        reviewer_name: (r.reviewer as { full_name?: string } | null)?.full_name ?? null,
        project_name: (r.project as { name?: string } | null)?.name ?? null,
        item_count: 0,
      };
    });

    return ok(rows);
  } catch (err) {
    return fail<SubmittalView[]>(err);
  }
}

export async function getSubmittal(id: string): Promise<ServiceResult<SubmittalView>> {
  if (!shouldUseSupabase()) {
    const all = getMockSubmittals();
    const found = all.find((s) => s.id === id);
    if (!found) return fail<SubmittalView>(`Submittal ${id} not found.`);
    return mockOk(found);
  }

  try {
    const { data, error } = await supabase!
      .from("submittals")
      .select(
        `
        *,
        submitter:profiles!submitted_by(full_name),
        reviewer:profiles!reviewer_id(full_name),
        project:projects!project_id(name)
      `,
      )
      .eq("id", id)
      .maybeSingle();

    if (error) return fail<SubmittalView>(error);
    if (!data) return fail<SubmittalView>("Submittal not found.");

    const row = data as unknown as Record<string, unknown>;
    return ok({
      ...(row as unknown as SubmittalView),
      submitter_name: (row.submitter as { full_name?: string } | null)?.full_name ?? null,
      reviewer_name: (row.reviewer as { full_name?: string } | null)?.full_name ?? null,
      project_name: (row.project as { name?: string } | null)?.name ?? null,
      item_count: 0,
    });
  } catch (err) {
    return fail<SubmittalView>(err);
  }
}

export async function createSubmittal(
  input: SubmittalCreateInput,
): Promise<ServiceResult<SubmittalView>> {
  const { userId, organizationId, role } = getSessionContext();

  if (!canCreate(role)) {
    return fail<SubmittalView>("You do not have permission to create submittals.");
  }

  if (!shouldUseSupabase()) {
    const all = getMockSubmittals();
    const duplicate = all.find(
      (s) =>
        s.project_id === input.project_id &&
        s.submittal_number === input.submittal_number &&
        !s.deleted_at,
    );
    if (duplicate) {
      return fail<SubmittalView>(
        "Submittal number already exists for this project. Please use a different number.",
      );
    }

    const newItem: SubmittalView = {
      id: crypto.randomUUID(),
      organization_id: "mock-org",
      project_id: input.project_id,
      submittal_number: input.submittal_number,
      title: input.title,
      discipline: input.discipline ?? null,
      spec_section: input.spec_section ?? null,
      status: "draft",
      revision_number: 1,
      submitted_date: null,
      required_date: input.required_date ?? null,
      review_due_date: input.review_due_date ?? null,
      returned_date: null,
      approved_at: null,
      submitted_by: null,
      reviewer_id: null,
      description: input.description ?? null,
      client_visible: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: userId ?? null,
      updated_by: null,
      deleted_at: null,
      submitter_name: null,
      reviewer_name: null,
      project_name: null,
      item_count: 0,
    };
    saveMockSubmittals([newItem, ...all]);
    return mockOk(newItem);
  }

  if (!organizationId) {
    return fail<SubmittalView>("Organisation is not configured for this user.");
  }

  try {
    const { data, error } = await supabase!
      .from("submittals")
      .insert({
        ...input,
        organization_id: organizationId,
        status: "draft",
        revision_number: 1,
        created_by: userId,
        updated_by: userId,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return fail<SubmittalView>(
          "Submittal number already exists for this project. Please use a different number.",
        );
      }
      return fail<SubmittalView>(error);
    }

    void logAction({
      action: "submittal.created",
      resource_type: "submittal",
      resource_id: data.id,
      new_data: { submittal_number: input.submittal_number, title: input.title },
    });

    return ok({
      ...(data as SubmittalView),
      submitter_name: null,
      reviewer_name: null,
      project_name: null,
      item_count: 0,
    });
  } catch (err) {
    return fail<SubmittalView>(err);
  }
}

export async function updateSubmittal(
  id: string,
  input: SubmittalUpdateInput,
): Promise<ServiceResult<SubmittalView>> {
  const { userId, role } = getSessionContext();

  if (!shouldUseSupabase()) {
    const all = getMockSubmittals();
    const idx = all.findIndex((s) => s.id === id);
    if (idx === -1) return fail<SubmittalView>("Submittal not found.");

    const updated: SubmittalView = {
      ...all[idx],
      ...input,
      updated_at: new Date().toISOString(),
      updated_by: userId ?? null,
    };
    const next = [...all];
    next[idx] = updated;
    saveMockSubmittals(next);
    return mockOk(updated);
  }

  try {
    const { data, error } = await supabase!
      .from("submittals")
      .update({ ...input, updated_at: new Date().toISOString(), updated_by: userId })
      .eq("id", id)
      .select()
      .single();

    if (error) return fail<SubmittalView>(error);

    void logAction({
      action: "submittal.updated",
      resource_type: "submittal",
      resource_id: id,
      new_data: input as Record<string, unknown>,
    });

    return ok({
      ...(data as SubmittalView),
      submitter_name: null,
      reviewer_name: null,
      project_name: null,
      item_count: 0,
    });
  } catch (err) {
    return fail<SubmittalView>(err);
  }
}

export async function submitSubmittal(id: string): Promise<ServiceResult<SubmittalView>> {
  const { userId, role } = getSessionContext();

  if (!shouldUseSupabase()) {
    const all = getMockSubmittals();
    const idx = all.findIndex((s) => s.id === id);
    if (idx === -1) return fail<SubmittalView>("Submittal not found.");
    if (all[idx].deleted_at) return fail<SubmittalView>("Cannot submit an archived submittal.");
    if (!["draft", "revise_and_resubmit"].includes(all[idx].status)) {
      return fail<SubmittalView>("Only draft or revise-and-resubmit submittals can be submitted.");
    }

    const updated: SubmittalView = {
      ...all[idx],
      status: "submitted",
      submitted_date: new Date().toISOString().split("T")[0],
      submitted_by: userId ?? null,
      updated_at: new Date().toISOString(),
    };
    const next = [...all];
    next[idx] = updated;
    saveMockSubmittals(next);
    return mockOk(updated);
  }

  try {
    const { data, error } = await supabase!
      .from("submittals")
      .update({
        status: "submitted",
        submitted_date: new Date().toISOString().split("T")[0],
        submitted_by: userId,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) return fail<SubmittalView>(error);

    void logAction({
      action: "submittal.submitted",
      resource_type: "submittal",
      resource_id: id,
    });

    return ok({
      ...(data as SubmittalView),
      submitter_name: null,
      reviewer_name: null,
      project_name: null,
      item_count: 0,
    });
  } catch (err) {
    return fail<SubmittalView>(err);
  }
}

export async function reviewSubmittal(
  id: string,
  input: ReviewActionInput,
): Promise<ServiceResult<SubmittalView>> {
  const { userId, organizationId, role } = getSessionContext();

  if (!canReview(role)) {
    return fail<SubmittalView>("You do not have permission to review submittals.");
  }

  if (
    (input.action === "rejected" || input.action === "revise_and_resubmit") &&
    !input.comments?.trim()
  ) {
    return fail<SubmittalView>("Comments are required when rejecting or requesting revision.");
  }

  if (!shouldUseSupabase()) {
    const all = getMockSubmittals();
    const idx = all.findIndex((s) => s.id === id);
    if (idx === -1) return fail<SubmittalView>("Submittal not found.");

    const current = all[idx];
    if (current.submitted_by === userId) {
      return fail<SubmittalView>("You cannot review your own submittal.");
    }

    const statusMap: Record<string, SubmittalView["status"]> = {
      approved: "approved",
      approved_as_noted: "approved_as_noted",
      rejected: "rejected",
      revise_and_resubmit: "revise_and_resubmit",
    };

    const newStatus = statusMap[input.action];
    const updated: SubmittalView = {
      ...current,
      status: newStatus,
      approved_at:
        newStatus === "approved" || newStatus === "approved_as_noted"
          ? new Date().toISOString()
          : current.approved_at,
      reviewer_id: userId ?? null,
      returned_date: new Date().toISOString().split("T")[0],
      updated_at: new Date().toISOString(),
    };
    const next = [...all];
    next[idx] = updated;
    saveMockSubmittals(next);

    saveMockReview({
      id: crypto.randomUUID(),
      organization_id: "mock-org",
      submittal_id: id,
      reviewer_id: userId ?? "mock-reviewer",
      action: input.action as ReviewAction,
      comments: input.comments ?? null,
      reviewed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      reviewer_name: "Demo Reviewer",
    });

    return mockOk(updated);
  }

  try {
    const submittal = await supabase!
      .from("submittals")
      .select("submitted_by, status, revision_number")
      .eq("id", id)
      .single();

    if (submittal.error) return fail<SubmittalView>(submittal.error);
    if (submittal.data.submitted_by === userId) {
      return fail<SubmittalView>("You cannot review your own submittal.");
    }

    const statusMap: Record<string, string> = {
      approved: "approved",
      approved_as_noted: "approved_as_noted",
      rejected: "rejected",
      revise_and_resubmit: "revise_and_resubmit",
    };
    const newStatus = statusMap[input.action];
    const now = new Date().toISOString();

    const [updateResult, reviewResult] = await Promise.all([
      supabase!
        .from("submittals")
        .update({
          status: newStatus,
          reviewer_id: userId,
          returned_date: now.split("T")[0],
          approved_at:
            newStatus === "approved" || newStatus === "approved_as_noted" ? now : undefined,
          updated_at: now,
          updated_by: userId,
        })
        .eq("id", id)
        .select()
        .single(),
      supabase!.from("submittal_reviews").insert({
        organization_id: organizationId!,
        submittal_id: id,
        reviewer_id: userId!,
        action: input.action as ReviewAction,
        comments: input.comments ?? null,
        reviewed_at: now,
      }),
    ]);

    if (updateResult.error) return fail<SubmittalView>(updateResult.error);

    void logAction({
      action: `submittal.${input.action}`,
      resource_type: "submittal",
      resource_id: id,
      new_data: { action: input.action, comments: input.comments },
    });

    return ok({
      ...(updateResult.data as SubmittalView),
      submitter_name: null,
      reviewer_name: null,
      project_name: null,
      item_count: 0,
    });
  } catch (err) {
    return fail<SubmittalView>(err);
  }
}

export async function reviseAndResubmit(
  id: string,
  input: ReviseInput,
): Promise<ServiceResult<SubmittalView>> {
  const { userId } = getSessionContext();

  if (!input.change_summary?.trim()) {
    return fail<SubmittalView>("Change summary is required when revising a submittal.");
  }
  if (!input.revision_notes?.trim()) {
    return fail<SubmittalView>("Revision notes are required when revising a submittal.");
  }

  if (!shouldUseSupabase()) {
    const all = getMockSubmittals();
    const idx = all.findIndex((s) => s.id === id);
    if (idx === -1) return fail<SubmittalView>("Submittal not found.");

    const current = all[idx];
    if (current.revision_number !== input.expected_revision_number) {
      return fail<SubmittalView>(
        "REVISION_CONFLICT: This submittal was updated by another user. Please refresh and try again.",
      );
    }

    const updated: SubmittalView = {
      ...current,
      status: "submitted",
      revision_number: current.revision_number + 1,
      submitted_date: new Date().toISOString().split("T")[0],
      submitted_by: userId ?? null,
      returned_date: null,
      approved_at: null,
      description: `[Rev ${current.revision_number + 1}] ${input.change_summary}\n\n${input.revision_notes}${current.description ? "\n\n---\n" + current.description : ""}`,
      updated_at: new Date().toISOString(),
    };
    const next = [...all];
    next[idx] = updated;
    saveMockSubmittals(next);
    return mockOk(updated);
  }

  try {
    const { data: current, error: fetchErr } = await supabase!
      .from("submittals")
      .select("revision_number, status, submitted_by")
      .eq("id", id)
      .single();

    if (fetchErr) return fail<SubmittalView>(fetchErr);

    if (current.revision_number !== input.expected_revision_number) {
      return fail<SubmittalView>(
        "REVISION_CONFLICT: This submittal was updated by another user. Please refresh and try again.",
      );
    }

    const newRevision = current.revision_number + 1;
    const now = new Date().toISOString();

    const { data, error } = await supabase!
      .from("submittals")
      .update({
        status: "submitted",
        revision_number: newRevision,
        submitted_date: now.split("T")[0],
        submitted_by: userId,
        returned_date: null,
        approved_at: null,
        updated_at: now,
        updated_by: userId,
      })
      .eq("id", id)
      .eq("revision_number", input.expected_revision_number)
      .select()
      .single();

    if (error || !data) {
      return fail<SubmittalView>(
        "REVISION_CONFLICT: This submittal was updated by another user. Please refresh and try again.",
      );
    }

    void logAction({
      action: "submittal.revised",
      resource_type: "submittal",
      resource_id: id,
      new_data: {
        revision_number: newRevision,
        change_summary: input.change_summary,
        revision_notes: input.revision_notes,
      },
    });

    return ok({
      ...(data as SubmittalView),
      submitter_name: null,
      reviewer_name: null,
      project_name: null,
      item_count: 0,
    });
  } catch (err) {
    return fail<SubmittalView>(err);
  }
}

export async function archiveSubmittal(id: string): Promise<ServiceResult<SubmittalView>> {
  const { userId, role } = getSessionContext();

  if (!canArchiveRestore(role)) {
    return fail<SubmittalView>("Only Admin and Project Manager can archive submittals.");
  }

  if (!shouldUseSupabase()) {
    const all = getMockSubmittals();
    const idx = all.findIndex((s) => s.id === id);
    if (idx === -1) return fail<SubmittalView>("Submittal not found.");

    const updated: SubmittalView = {
      ...all[idx],
      status: "archived",
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const next = [...all];
    next[idx] = updated;
    saveMockSubmittals(next);
    return mockOk(updated);
  }

  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase!
      .from("submittals")
      .update({ status: "archived", deleted_at: now, updated_at: now, updated_by: userId })
      .eq("id", id)
      .select()
      .single();

    if (error) return fail<SubmittalView>(error);

    void logAction({
      action: "submittal.archived",
      resource_type: "submittal",
      resource_id: id,
    });

    return ok({
      ...(data as SubmittalView),
      submitter_name: null,
      reviewer_name: null,
      project_name: null,
      item_count: 0,
    });
  } catch (err) {
    return fail<SubmittalView>(err);
  }
}

export async function restoreSubmittal(id: string): Promise<ServiceResult<SubmittalView>> {
  const { userId, role } = getSessionContext();

  if (!canArchiveRestore(role)) {
    return fail<SubmittalView>("Only Admin and Project Manager can restore submittals.");
  }

  if (!shouldUseSupabase()) {
    const all = getMockSubmittals();
    const idx = all.findIndex((s) => s.id === id);
    if (idx === -1) return fail<SubmittalView>("Submittal not found.");

    const updated: SubmittalView = {
      ...all[idx],
      status: "draft",
      deleted_at: null,
      updated_at: new Date().toISOString(),
    };
    const next = [...all];
    next[idx] = updated;
    saveMockSubmittals(next);
    return mockOk(updated);
  }

  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase!
      .from("submittals")
      .update({ status: "draft", deleted_at: null, updated_at: now, updated_by: userId })
      .eq("id", id)
      .select()
      .single();

    if (error) return fail<SubmittalView>(error);

    void logAction({
      action: "submittal.restored",
      resource_type: "submittal",
      resource_id: id,
    });

    return ok({
      ...(data as SubmittalView),
      submitter_name: null,
      reviewer_name: null,
      project_name: null,
      item_count: 0,
    });
  } catch (err) {
    return fail<SubmittalView>(err);
  }
}

// ─── Submittal Items ──────────────────────────────────────────────────────────

export async function listSubmittalItems(
  submittalId: string,
): Promise<ServiceResult<SubmittalItemView[]>> {
  if (!shouldUseSupabase()) {
    const items = getMockItems(submittalId);
    const itemsWithDocs = items.map((item) => ({
      ...item,
      attached_document_ids: getMockItemDocs(item.id).map((d) => d.document_id),
    }));
    return mockOk(itemsWithDocs);
  }

  try {
    const { data, error } = await supabase!
      .from("submittal_items")
      .select("*")
      .eq("submittal_id", submittalId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (error) return fail<SubmittalItemView[]>(error);

    const docsResult = await supabase!
      .from("submittal_item_documents")
      .select("submittal_item_id, document_id")
      .eq("submittal_id", submittalId)
      .is("deleted_at", null);

    const docMap: Record<string, string[]> = {};
    if (!docsResult.error) {
      for (const row of docsResult.data ?? []) {
        const r = row as { submittal_item_id: string; document_id: string };
        if (!docMap[r.submittal_item_id]) docMap[r.submittal_item_id] = [];
        docMap[r.submittal_item_id].push(r.document_id);
      }
    }

    const rows = (data ?? []).map((row: unknown): SubmittalItemView => {
      const r = row as Record<string, unknown>;
      return {
        ...(r as unknown as SubmittalItemView),
        attached_document_ids: docMap[r.id as string] ?? [],
      };
    });

    return ok(rows);
  } catch (err) {
    return fail<SubmittalItemView[]>(err);
  }
}

export async function addSubmittalItem(
  submittalId: string,
  input: SubmittalItemInput,
): Promise<ServiceResult<SubmittalItemView>> {
  const { userId, organizationId } = getSessionContext();

  if (!shouldUseSupabase()) {
    const item: SubmittalItemView = {
      id: crypto.randomUUID(),
      organization_id: "mock-org",
      submittal_id: submittalId,
      description: input.equipment_name,
      spec_section: input.spec_section ?? null,
      equipment_name: input.equipment_name,
      quantity: input.quantity ?? null,
      unit: input.unit ?? null,
      manufacturer: input.manufacturer ?? null,
      model_number: input.model_number ?? null,
      notes: input.notes ?? null,
      status: "draft",
      revision_number: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: userId ?? null,
      updated_by: null,
      deleted_at: null,
      attached_document_ids: [],
    };
    const all = getMockItems();
    saveMockItems([...all, item]);
    return mockOk(item);
  }

  try {
    const { data, error } = await supabase!
      .from("submittal_items")
      .insert({
        organization_id: organizationId!,
        submittal_id: submittalId,
        description: input.equipment_name,
        spec_section: input.spec_section ?? null,
        equipment_name: input.equipment_name,
        quantity: input.quantity ?? null,
        unit: input.unit ?? null,
        manufacturer: input.manufacturer ?? null,
        model_number: input.model_number ?? null,
        notes: input.notes ?? null,
        status: "draft",
        revision_number: 1,
        created_by: userId,
        updated_by: userId,
      })
      .select()
      .single();

    if (error) return fail<SubmittalItemView>(error);

    void logAction({
      action: "submittal.item_added",
      resource_type: "submittal_item",
      resource_id: data.id,
      new_data: { submittal_id: submittalId, equipment_name: input.equipment_name },
    });

    return ok({ ...(data as SubmittalItemView), attached_document_ids: [] });
  } catch (err) {
    return fail<SubmittalItemView>(err);
  }
}

export async function removeSubmittalItem(itemId: string): Promise<ServiceResult<boolean>> {
  const { userId } = getSessionContext();

  if (!shouldUseSupabase()) {
    const all = getMockItems();
    const updated = all.map((i) =>
      i.id === itemId ? { ...i, deleted_at: new Date().toISOString() } : i,
    );
    saveMockItems(updated);
    return mockOk(true);
  }

  try {
    const { error } = await supabase!
      .from("submittal_items")
      .update({ deleted_at: new Date().toISOString(), updated_by: userId })
      .eq("id", itemId);

    if (error) return fail<boolean>(error);
    return ok(true);
  } catch (err) {
    return fail<boolean>(err);
  }
}

// ─── Reviews ─────────────────────────────────────────────────────────────────

export async function listSubmittalReviews(
  submittalId: string,
): Promise<ServiceResult<SubmittalReviewView[]>> {
  if (!shouldUseSupabase()) {
    return mockOk(getMockReviews(submittalId));
  }

  try {
    const { data, error } = await supabase!
      .from("submittal_reviews")
      .select(
        `
        *,
        reviewer:profiles!reviewer_id(full_name)
      `,
      )
      .eq("submittal_id", submittalId)
      .order("reviewed_at", { ascending: false });

    if (error) return fail<SubmittalReviewView[]>(error);

    const rows = (data ?? []).map((row: unknown): SubmittalReviewView => {
      const r = row as Record<string, unknown>;
      return {
        ...(r as unknown as SubmittalReviewView),
        reviewer_name: (r.reviewer as { full_name?: string } | null)?.full_name ?? null,
      };
    });

    return ok(rows);
  } catch (err) {
    return fail<SubmittalReviewView[]>(err);
  }
}

// ─── Document attachment ──────────────────────────────────────────────────────

export async function attachDocumentToItem(
  submittalId: string,
  itemId: string,
  documentId: string,
): Promise<ServiceResult<ItemDocumentView>> {
  const { userId, organizationId } = getSessionContext();

  if (!shouldUseSupabase()) {
    const exists = getMockItemDocs(itemId).some((d) => d.document_id === documentId);
    if (exists) {
      return fail<ItemDocumentView>("Document is already attached to this item.");
    }

    const doc: ItemDocumentView = {
      id: crypto.randomUUID(),
      submittal_item_id: itemId,
      document_id: documentId,
      document_title: "Attached Document",
      document_status: "approved",
      attached_by: userId ?? null,
      created_at: new Date().toISOString(),
      deleted_at: null,
      is_archived: false,
    };
    saveMockItemDoc(doc);
    return mockOk(doc);
  }

  try {
    // Validate document belongs to same org and is not archived
    const { data: docCheck, error: docErr } = await supabase!
      .from("documents")
      .select("id, organization_id, deleted_at, title, status")
      .eq("id", documentId)
      .eq("organization_id", organizationId!)
      .maybeSingle();

    if (docErr) return fail<ItemDocumentView>(docErr);
    if (!docCheck) {
      return fail<ItemDocumentView>(
        "Document not found in this organisation or has been permanently removed.",
      );
    }
    if (docCheck.deleted_at) {
      return fail<ItemDocumentView>(
        "Cannot attach an archived document. Please restore the document first.",
      );
    }

    const { data, error } = await supabase!
      .from("submittal_item_documents")
      .insert({
        organization_id: organizationId!,
        submittal_id: submittalId,
        submittal_item_id: itemId,
        document_id: documentId,
        attached_by: userId,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return fail<ItemDocumentView>("Document is already attached to this item.");
      }
      return fail<ItemDocumentView>(error);
    }

    void logAction({
      action: "submittal.document_attached",
      resource_type: "submittal_item_document",
      resource_id: data.id,
      new_data: { submittal_id: submittalId, item_id: itemId, document_id: documentId },
    });

    return ok({
      id: data.id as string,
      submittal_item_id: itemId,
      document_id: documentId,
      document_title: (docCheck.title as string) ?? "Document",
      document_status: (docCheck.status as string) ?? "unknown",
      attached_by: userId ?? null,
      created_at: data.created_at as string,
      deleted_at: null,
      is_archived: false,
    });
  } catch (err) {
    return fail<ItemDocumentView>(err);
  }
}

export async function removeDocumentFromItem(
  itemId: string,
  documentId: string,
): Promise<ServiceResult<boolean>> {
  if (!shouldUseSupabase()) {
    removeMockItemDoc(itemId, documentId);
    return mockOk(true);
  }

  try {
    const { error } = await supabase!
      .from("submittal_item_documents")
      .update({ deleted_at: new Date().toISOString() })
      .eq("submittal_item_id", itemId)
      .eq("document_id", documentId);

    if (error) return fail<boolean>(error);
    return ok(true);
  } catch (err) {
    return fail<boolean>(err);
  }
}

export async function listItemDocuments(
  itemId: string,
): Promise<ServiceResult<ItemDocumentView[]>> {
  if (!shouldUseSupabase()) {
    return mockOk(getMockItemDocs(itemId));
  }

  try {
    const { data, error } = await supabase!
      .from("submittal_item_documents")
      .select(
        `
        *,
        doc:documents!document_id(title, status, deleted_at)
      `,
      )
      .eq("submittal_item_id", itemId)
      .is("deleted_at", null);

    if (error) return fail<ItemDocumentView[]>(error);

    const rows = (data ?? []).map((row: Record<string, unknown>): ItemDocumentView => {
      const doc = row.doc as { title?: string; status?: string; deleted_at?: string | null } | null;
      return {
        id: row.id as string,
        submittal_item_id: itemId,
        document_id: row.document_id as string,
        document_title: doc?.title ?? "Document",
        document_status: doc?.status ?? "unknown",
        attached_by: row.attached_by as string | null,
        created_at: row.created_at as string,
        deleted_at: row.deleted_at as string | null,
        is_archived: !!doc?.deleted_at,
      };
    });

    return ok(rows);
  } catch (err) {
    return fail<ItemDocumentView[]>(err);
  }
}
