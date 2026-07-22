/**
 * Document service — Phase 6
 *
 * Full Supabase CRUD with Storage integration, version history, approval workflow,
 * and audit logging.  Falls back to mock/sessionStorage when Supabase is not
 * configured or the JWT is not ready (demo mode).
 *
 * Behaviour matrix:
 *   Supabase NOT configured  → mock always
 *   Supabase configured, JWT NOT ready → mock (dev warning logged)
 *   Supabase configured, JWT ready     → real DB + Storage
 *
 * Self-approval rule: an approver cannot approve a document they uploaded.
 * This is enforced in this service layer AND in the RLS policy.
 */

import { supabase, IS_SUPABASE_CONFIGURED, isJwtReady } from "@/lib/supabase";
import { getSessionContext, getCurrentOrganizationId } from "@/lib/auth-bridge";
import { documents as DUMMY_DOCS } from "@/lib/dummy-data";
import {
  uploadFile,
  getSignedUrl,
  deleteFile,
  buildDocumentPath,
  sanitizeFileName,
  DOCUMENT_BUCKET,
  type UploadProgress,
} from "@/services/storage.service";
import { logAction } from "@/services/audit.service";
import { ok, mockOk, fail, type ServiceResult } from "./_base.service";
import type {
  DocumentView,
  DocumentVersionView,
  DocumentApprovalView,
  DocumentUploadInput,
  DocumentVersionInput,
  DocumentFilterInput,
} from "@/types/document-view";

// ─── Routing guard ────────────────────────────────────────────────────────────

function shouldUseSupabase(): boolean {
  if (!IS_SUPABASE_CONFIGURED || !supabase) return false;
  if (!isJwtReady()) {
    console.warn("[ElectraFlow] Supabase configured but JWT is not ready — using mock documents.");
    return false;
  }
  return true;
}

// ─── Mock data helpers ────────────────────────────────────────────────────────

const MOCK_KEY = "mep-docs-mock";

const STATUS_MAP: Record<string, string> = {
  Approved: "approved",
  "In Review": "under_review",
  Pending: "draft",
  Rejected: "rejected",
};

function toDocumentView(d: (typeof DUMMY_DOCS)[number]): DocumentView {
  return {
    id: d.id,
    organization_id: "mock-org",
    project_id: null,
    title: d.name,
    document_number: null,
    discipline: d.discipline ?? null,
    document_type: d.type ?? null,
    revision: d.version ?? "A",
    status: (STATUS_MAP[d.status] ?? "draft") as DocumentView["status"],
    storage_path: null,
    file_name: d.name,
    file_size_bytes: null,
    mime_type: null,
    description: null,
    current_version_number: 1,
    created_at: `${d.date}T00:00:00Z`,
    updated_at: `${d.date}T00:00:00Z`,
    created_by: null,
    updated_by: null,
    deleted_at: null,
    uploader_name: d.uploader ?? null,
    project_name: d.project ?? null,
    version_count: 1,
  };
}

function getMockDocs(): DocumentView[] {
  const base = DUMMY_DOCS.map(toDocumentView);
  try {
    const raw = sessionStorage.getItem(MOCK_KEY);
    const added: DocumentView[] = raw ? (JSON.parse(raw) as DocumentView[]) : [];
    const ids = new Set(added.map((d) => d.id));
    return [...added, ...base.filter((d) => !ids.has(d.id))];
  } catch {
    return base;
  }
}

function saveMockDocs(docs: DocumentView[]): void {
  try {
    const base = DUMMY_DOCS.map(toDocumentView);
    const baseIds = new Set(base.map((d) => d.id));
    const customOnly = docs.filter((d) => !baseIds.has(d.id));
    // Persist only mutated base docs + added docs
    const mutated = docs.filter(
      (d) =>
        baseIds.has(d.id) && JSON.stringify(d) !== JSON.stringify(base.find((b) => b.id === d.id)),
    );
    sessionStorage.setItem(MOCK_KEY, JSON.stringify([...customOnly, ...mutated]));
  } catch {
    // ignore quota errors
  }
}

// ─── List documents ───────────────────────────────────────────────────────────

export async function listDocuments(
  filters: DocumentFilterInput = {},
): Promise<ServiceResult<DocumentView[]>> {
  if (!shouldUseSupabase()) {
    let docs = getMockDocs();
    if (!filters.includeArchived) {
      docs = docs.filter((d) => !d.deleted_at);
    }
    if (filters.projectId) {
      docs = docs.filter((d) => d.project_id === filters.projectId);
    }
    if (filters.status && filters.status !== "all") {
      docs = docs.filter((d) => d.status === filters.status);
    }
    if (filters.discipline) {
      docs = docs.filter((d) => d.discipline === filters.discipline);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      docs = docs.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          (d.document_number ?? "").toLowerCase().includes(q) ||
          (d.uploader_name ?? "").toLowerCase().includes(q),
      );
    }
    return mockOk(docs);
  }

  const orgId = getCurrentOrganizationId();
  if (!orgId) return fail<DocumentView[]>("No active organisation.");

  try {
    let query = supabase!
      .from("documents")
      .select(
        `*, uploader:profiles!created_by(full_name), project:projects(name),
         version_count:document_versions(count)`,
      )
      .eq("organization_id", orgId);

    if (!filters.includeArchived) {
      query = query.is("deleted_at", null);
    }
    if (filters.projectId) {
      query = query.eq("project_id", filters.projectId);
    }
    if (filters.status && filters.status !== "all") {
      query = query.eq("status", filters.status);
    }
    if (filters.discipline) {
      query = query.eq("discipline", filters.discipline);
    }
    if (filters.search) {
      query = query.or(`title.ilike.%${filters.search}%,document_number.ilike.%${filters.search}%`);
    }

    query = query.order("updated_at", { ascending: false });

    const { data, error } = await query;
    if (error) return fail<DocumentView[]>(error);

    const docs: DocumentView[] = (data ?? []).map((row: Record<string, unknown>) => ({
      ...(row as Omit<DocumentView, "uploader_name" | "project_name" | "version_count">),
      uploader_name: (row.uploader as { full_name: string } | null)?.full_name ?? null,
      project_name: (row.project as { name: string } | null)?.name ?? null,
      version_count: (row.version_count as { count: number }[] | null)?.[0]?.count ?? 1,
    }));

    return ok(docs);
  } catch (err) {
    return fail<DocumentView[]>(err);
  }
}

// ─── Get single document ──────────────────────────────────────────────────────

export async function getDocument(id: string): Promise<ServiceResult<DocumentView | null>> {
  if (!shouldUseSupabase()) {
    const doc = getMockDocs().find((d) => d.id === id) ?? null;
    return mockOk(doc);
  }

  const orgId = getCurrentOrganizationId();
  if (!orgId) return fail<DocumentView | null>("No active organisation.");

  try {
    const { data, error } = await supabase!
      .from("documents")
      .select(
        `*, uploader:profiles!created_by(full_name), project:projects(name),
         version_count:document_versions(count)`,
      )
      .eq("id", id)
      .eq("organization_id", orgId)
      .maybeSingle();

    if (error) return fail<DocumentView | null>(error);
    if (!data) return ok(null);

    const row = data as Record<string, unknown>;
    const doc: DocumentView = {
      ...(row as Omit<DocumentView, "uploader_name" | "project_name" | "version_count">),
      uploader_name: (row.uploader as { full_name: string } | null)?.full_name ?? null,
      project_name: (row.project as { name: string } | null)?.name ?? null,
      version_count: (row.version_count as { count: number }[] | null)?.[0]?.count ?? 1,
    };

    return ok(doc);
  } catch (err) {
    return fail<DocumentView | null>(err);
  }
}

// ─── Upload document (initial version) ───────────────────────────────────────

export async function uploadDocument(
  input: DocumentUploadInput,
  file: File,
  onProgress?: (p: UploadProgress) => void,
): Promise<ServiceResult<DocumentView>> {
  if (!shouldUseSupabase()) {
    // Mock: add to sessionStorage immediately (no real upload)
    const { userId } = getSessionContext();
    const docId = crypto.randomUUID();
    const now = new Date().toISOString();
    const mock: DocumentView = {
      id: docId,
      organization_id: "mock-org",
      project_id: input.project_id ?? null,
      title: input.title,
      document_number: input.document_number ?? null,
      discipline: input.discipline ?? null,
      document_type: input.document_type ?? null,
      revision: input.revision ?? "A",
      status: "draft",
      storage_path: null,
      file_name: file.name,
      file_size_bytes: file.size,
      mime_type: file.type,
      description: input.description ?? null,
      current_version_number: 1,
      created_at: now,
      updated_at: now,
      created_by: userId,
      updated_by: userId,
      deleted_at: null,
      uploader_name: "You",
      project_name: null,
      version_count: 1,
    };
    const all = getMockDocs();
    saveMockDocs([mock, ...all]);
    onProgress?.({ percent: 100, phase: "done" });
    return mockOk(mock);
  }

  const { userId, organizationId } = getSessionContext();
  if (!organizationId) return fail<DocumentView>("No active organisation.");
  if (!userId) return fail<DocumentView>("No active session.");

  // Client-side UUID so storage path can be built before the DB INSERT
  const docId = crypto.randomUUID();
  const versionNumber = 1;
  const safeName = sanitizeFileName(file.name);
  const storagePath = buildDocumentPath(
    organizationId,
    input.project_id,
    docId,
    versionNumber,
    safeName,
  );

  // ── 1. Upload to Storage ──────────────────────────────────────────────────
  const uploadResult = await uploadFile(DOCUMENT_BUCKET, storagePath, file, onProgress);
  if (uploadResult.error) return fail<DocumentView>(uploadResult.error);

  // ── 2. Insert documents row ───────────────────────────────────────────────
  const { data: docRow, error: docError } = await supabase!
    .from("documents")
    .insert({
      id: docId,
      organization_id: organizationId,
      project_id: input.project_id ?? null,
      title: input.title,
      document_number: input.document_number ?? null,
      discipline: input.discipline ?? null,
      document_type: input.document_type ?? null,
      revision: input.revision ?? "A",
      status: "draft",
      storage_path: storagePath,
      file_name: safeName,
      file_size_bytes: file.size,
      mime_type: file.type,
      description: input.description ?? null,
      current_version_number: versionNumber,
      created_by: userId,
      updated_by: userId,
    })
    .select("*")
    .single();

  if (docError) {
    // Roll back orphaned storage file (best-effort)
    await deleteFile(DOCUMENT_BUCKET, storagePath);
    return fail<DocumentView>(docError);
  }

  // ── 3. Insert document_versions row ──────────────────────────────────────
  await supabase!.from("document_versions").insert({
    organization_id: organizationId,
    document_id: docId,
    version_number: versionNumber,
    revision: input.revision ?? "A",
    storage_path: storagePath,
    file_name: safeName,
    file_size_bytes: file.size,
    mime_type: file.type,
    change_summary: "Initial version",
    created_by: userId,
  });

  // ── 4. Audit log ──────────────────────────────────────────────────────────
  await logAction({
    action: "document.uploaded",
    resource_type: "document",
    resource_id: docId,
    new_data: { title: input.title, version: versionNumber },
  });

  return ok(docRow as DocumentView);
}

// ─── Upload new version ───────────────────────────────────────────────────────

export async function uploadNewVersion(
  docId: string,
  file: File,
  input: DocumentVersionInput,
  onProgress?: (p: UploadProgress) => void,
): Promise<ServiceResult<DocumentView>> {
  if (!shouldUseSupabase()) {
    const all = getMockDocs();
    const idx = all.findIndex((d) => d.id === docId);
    if (idx === -1) return fail<DocumentView>("Document not found.");

    const cur = all[idx];
    if (cur.current_version_number !== input.expected_version_number) {
      return fail<DocumentView>(
        "REVISION_CONFLICT: This document was updated by another user. Please refresh and try again.",
      );
    }

    const updated: DocumentView = {
      ...cur,
      current_version_number: cur.current_version_number + 1,
      revision: input.revision ?? String.fromCharCode(64 + cur.current_version_number + 1),
      status: "draft",
      file_name: file.name,
      file_size_bytes: file.size,
      updated_at: new Date().toISOString(),
      version_count: (cur.version_count ?? 1) + 1,
    };
    all[idx] = updated;
    saveMockDocs(all);
    onProgress?.({ percent: 100, phase: "done" });
    return mockOk(updated);
  }

  const { userId, organizationId } = getSessionContext();
  if (!organizationId || !userId) return fail<DocumentView>("No active session.");

  // ── 1. Fetch current version for optimistic lock check ───────────────────
  const { data: currentDoc } = await supabase!
    .from("documents")
    .select("current_version_number, project_id")
    .eq("id", docId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!currentDoc) return fail<DocumentView>("Document not found.");

  if (currentDoc.current_version_number !== input.expected_version_number) {
    return fail<DocumentView>(
      "REVISION_CONFLICT: This document was updated by another user. Please refresh and try again.",
    );
  }

  const newVersionNumber = input.expected_version_number + 1;
  const safeName = sanitizeFileName(file.name);
  const storagePath = buildDocumentPath(
    organizationId,
    currentDoc.project_id as string | null,
    docId,
    newVersionNumber,
    safeName,
  );

  // ── 2. Upload to Storage ──────────────────────────────────────────────────
  const uploadResult = await uploadFile(DOCUMENT_BUCKET, storagePath, file, onProgress);
  if (uploadResult.error) return fail<DocumentView>(uploadResult.error);

  // ── 3. Atomic optimistic-lock update ─────────────────────────────────────
  const { data: updated } = await supabase!
    .from("documents")
    .update({
      current_version_number: newVersionNumber,
      revision: input.revision ?? String.fromCharCode(64 + newVersionNumber),
      status: "draft",
      storage_path: storagePath,
      file_name: safeName,
      file_size_bytes: file.size,
      mime_type: file.type,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", docId)
    .eq("organization_id", organizationId)
    .eq("current_version_number", input.expected_version_number) // optimistic lock
    .select("*");

  if (!updated || (updated as unknown[]).length === 0) {
    // Another update landed between our SELECT and this UPDATE
    await deleteFile(DOCUMENT_BUCKET, storagePath);
    return fail<DocumentView>(
      "REVISION_CONFLICT: This document was updated by another user. Please refresh and try again.",
    );
  }

  // ── 4. Insert version row ─────────────────────────────────────────────────
  await supabase!.from("document_versions").insert({
    organization_id: organizationId,
    document_id: docId,
    version_number: newVersionNumber,
    revision: input.revision ?? String.fromCharCode(64 + newVersionNumber),
    storage_path: storagePath,
    file_name: safeName,
    file_size_bytes: file.size,
    mime_type: file.type,
    change_summary: input.change_summary ?? null,
    created_by: userId,
  });

  // ── 5. Audit ──────────────────────────────────────────────────────────────
  await logAction({
    action: "document.version_uploaded",
    resource_type: "document",
    resource_id: docId,
    new_data: { version: newVersionNumber, change_summary: input.change_summary },
  });

  return ok((updated as unknown[])[0] as DocumentView);
}

// ─── List document versions ───────────────────────────────────────────────────

export async function listDocumentVersions(
  docId: string,
): Promise<ServiceResult<DocumentVersionView[]>> {
  if (!shouldUseSupabase()) {
    const mock: DocumentVersionView[] = [
      {
        id: `v-${docId}-1`,
        organization_id: "mock-org",
        document_id: docId,
        version_number: 1,
        revision: "A",
        storage_path: null,
        file_name: "mock-document.pdf",
        file_size_bytes: 102400,
        mime_type: "application/pdf",
        change_summary: "Initial version",
        created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
        created_by: null,
        uploader_name: "Demo User",
      },
    ];
    return mockOk(mock);
  }

  const orgId = getCurrentOrganizationId();
  if (!orgId) return fail<DocumentVersionView[]>("No active organisation.");

  try {
    const { data, error } = await supabase!
      .from("document_versions")
      .select(`*, uploader:profiles!created_by(full_name)`)
      .eq("document_id", docId)
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .order("version_number", { ascending: false });

    if (error) return fail<DocumentVersionView[]>(error);

    const versions: DocumentVersionView[] = (data ?? []).map((row: Record<string, unknown>) => ({
      ...(row as Omit<DocumentVersionView, "uploader_name">),
      uploader_name: (row.uploader as { full_name: string } | null)?.full_name ?? null,
    }));

    return ok(versions);
  } catch (err) {
    return fail<DocumentVersionView[]>(err);
  }
}

// ─── Download (signed URL) ────────────────────────────────────────────────────

export async function downloadDocument(docId: string): Promise<ServiceResult<string>> {
  if (!shouldUseSupabase()) {
    return fail<string>("File download is not available in demo mode.");
  }

  const docResult = await getDocument(docId);
  if (docResult.error || !docResult.data) {
    return fail<string>(docResult.error?.message ?? "Document not found.");
  }

  const doc = docResult.data;
  if (!doc.storage_path) {
    return fail<string>("This document has no file attached.");
  }

  return getSignedUrl(DOCUMENT_BUCKET, doc.storage_path, 3600);
}

// ─── Submit for review ────────────────────────────────────────────────────────

export async function submitForReview(docId: string): Promise<ServiceResult<DocumentView>> {
  if (!shouldUseSupabase()) {
    const all = getMockDocs();
    const idx = all.findIndex((d) => d.id === docId);
    if (idx === -1) return fail<DocumentView>("Document not found.");
    all[idx] = { ...all[idx], status: "under_review", updated_at: new Date().toISOString() };
    saveMockDocs(all);
    return mockOk(all[idx]);
  }

  const { userId, organizationId } = getSessionContext();
  if (!organizationId || !userId) return fail<DocumentView>("No active session.");

  try {
    const { data, error } = await supabase!
      .from("documents")
      .update({
        status: "under_review",
        updated_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", docId)
      .eq("organization_id", organizationId)
      .eq("status", "draft") // only drafts can be submitted
      .select("*")
      .single();

    if (error) return fail<DocumentView>(error);

    await logAction({
      action: "document.submitted_for_review",
      resource_type: "document",
      resource_id: docId,
    });

    return ok(data as DocumentView);
  } catch (err) {
    return fail<DocumentView>(err);
  }
}

// ─── Approve ──────────────────────────────────────────────────────────────────

export async function approveDocument(
  docId: string,
  comments?: string,
): Promise<ServiceResult<DocumentView>> {
  if (!shouldUseSupabase()) {
    const all = getMockDocs();
    const idx = all.findIndex((d) => d.id === docId);
    if (idx === -1) return fail<DocumentView>("Document not found.");
    all[idx] = { ...all[idx], status: "approved", updated_at: new Date().toISOString() };
    saveMockDocs(all);
    return mockOk(all[idx]);
  }

  const { userId, organizationId } = getSessionContext();
  if (!organizationId || !userId) return fail<DocumentView>("No active session.");

  try {
    // Self-approval check (enforced again by RLS — belt-and-suspenders)
    const { data: docCheck } = await supabase!
      .from("documents")
      .select("created_by")
      .eq("id", docId)
      .single();

    if (docCheck?.created_by === userId) {
      return fail<DocumentView>("You cannot approve your own document.");
    }

    // Insert approval record
    const { error: approvalErr } = await supabase!.from("document_approvals").insert({
      organization_id: organizationId,
      document_id: docId,
      approver_id: userId,
      action: "approved",
      comments: comments?.trim() || null,
      approved_at: new Date().toISOString(),
    });

    if (approvalErr) return fail<DocumentView>(approvalErr);

    const { data, error } = await supabase!
      .from("documents")
      .update({
        status: "approved",
        updated_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", docId)
      .eq("organization_id", organizationId)
      .select("*")
      .single();

    if (error) return fail<DocumentView>(error);

    await logAction({
      action: "document.approved",
      resource_type: "document",
      resource_id: docId,
      new_data: { comments },
    });

    return ok(data as DocumentView);
  } catch (err) {
    return fail<DocumentView>(err);
  }
}

// ─── Reject ───────────────────────────────────────────────────────────────────

export async function rejectDocument(
  docId: string,
  comments: string,
): Promise<ServiceResult<DocumentView>> {
  // Validation: reject always requires comments
  if (!comments?.trim()) {
    return fail<DocumentView>("A comment is required when rejecting a document.");
  }

  if (!shouldUseSupabase()) {
    const all = getMockDocs();
    const idx = all.findIndex((d) => d.id === docId);
    if (idx === -1) return fail<DocumentView>("Document not found.");
    all[idx] = { ...all[idx], status: "rejected", updated_at: new Date().toISOString() };
    saveMockDocs(all);
    return mockOk(all[idx]);
  }

  const { userId, organizationId } = getSessionContext();
  if (!organizationId || !userId) return fail<DocumentView>("No active session.");

  try {
    const { error: approvalErr } = await supabase!.from("document_approvals").insert({
      organization_id: organizationId,
      document_id: docId,
      approver_id: userId,
      action: "rejected",
      comments: comments.trim(),
      approved_at: new Date().toISOString(),
    });

    if (approvalErr) return fail<DocumentView>(approvalErr);

    const { data, error } = await supabase!
      .from("documents")
      .update({
        status: "rejected",
        updated_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", docId)
      .eq("organization_id", organizationId)
      .select("*")
      .single();

    if (error) return fail<DocumentView>(error);

    await logAction({
      action: "document.rejected",
      resource_type: "document",
      resource_id: docId,
      new_data: { comments: comments.trim() },
    });

    return ok(data as DocumentView);
  } catch (err) {
    return fail<DocumentView>(err);
  }
}

// ─── Archive (soft delete) ────────────────────────────────────────────────────

export async function archiveDocument(docId: string): Promise<ServiceResult<DocumentView>> {
  if (!shouldUseSupabase()) {
    const all = getMockDocs();
    const idx = all.findIndex((d) => d.id === docId);
    if (idx === -1) return fail<DocumentView>("Document not found.");
    all[idx] = {
      ...all[idx],
      deleted_at: new Date().toISOString(),
      status: "archived",
      updated_at: new Date().toISOString(),
    };
    saveMockDocs(all);
    return mockOk(all[idx]);
  }

  const { userId, organizationId } = getSessionContext();
  if (!organizationId || !userId) return fail<DocumentView>("No active session.");

  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase!
      .from("documents")
      .update({ deleted_at: now, status: "archived", updated_by: userId, updated_at: now })
      .eq("id", docId)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (error) return fail<DocumentView>(error);

    await logAction({
      action: "document.archived",
      resource_type: "document",
      resource_id: docId,
    });

    return ok(data as DocumentView);
  } catch (err) {
    return fail<DocumentView>(err);
  }
}

// ─── Restore (Admin / PM only) ────────────────────────────────────────────────

export async function restoreDocument(docId: string): Promise<ServiceResult<DocumentView>> {
  const { role } = getSessionContext();
  if (!role || !["Admin", "Project Manager", "admin", "project_manager"].includes(role)) {
    return fail<DocumentView>("Only Admin and Project Manager can restore archived documents.");
  }

  if (!shouldUseSupabase()) {
    const all = getMockDocs();
    const idx = all.findIndex((d) => d.id === docId);
    if (idx === -1) return fail<DocumentView>("Document not found.");
    all[idx] = {
      ...all[idx],
      deleted_at: null,
      status: "draft",
      updated_at: new Date().toISOString(),
    };
    saveMockDocs(all);
    return mockOk(all[idx]);
  }

  const { userId, organizationId } = getSessionContext();
  if (!organizationId || !userId) return fail<DocumentView>("No active session.");

  try {
    const { data, error } = await supabase!
      .from("documents")
      .update({
        deleted_at: null,
        status: "draft",
        updated_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", docId)
      .eq("organization_id", organizationId)
      .not("deleted_at", "is", null)
      .select("*")
      .single();

    if (error) return fail<DocumentView>(error);
    if (!data) return fail<DocumentView>("Document not found or not archived.");

    await logAction({
      action: "document.restored",
      resource_type: "document",
      resource_id: docId,
    });

    return ok(data as DocumentView);
  } catch (err) {
    return fail<DocumentView>(err);
  }
}

// ─── Approval history ─────────────────────────────────────────────────────────

export async function listDocumentApprovals(
  docId: string,
): Promise<ServiceResult<DocumentApprovalView[]>> {
  if (!shouldUseSupabase()) {
    return mockOk([]);
  }

  const orgId = getCurrentOrganizationId();
  if (!orgId) return fail<DocumentApprovalView[]>("No active organisation.");

  try {
    const { data, error } = await supabase!
      .from("document_approvals")
      .select(`*, approver:profiles!approver_id(full_name, role)`)
      .eq("document_id", docId)
      .eq("organization_id", orgId)
      .order("approved_at", { ascending: false });

    if (error) return fail<DocumentApprovalView[]>(error);

    const approvals: DocumentApprovalView[] = (data ?? []).map((row: Record<string, unknown>) => ({
      ...(row as Omit<DocumentApprovalView, "approver_name" | "approver_role">),
      approver_name: (row.approver as { full_name: string } | null)?.full_name ?? null,
      approver_role:
        (row.approver as { role: DocumentApprovalView["approver_role"] } | null)?.role ?? null,
    }));

    return ok(approvals);
  } catch (err) {
    return fail<DocumentApprovalView[]>(err);
  }
}
