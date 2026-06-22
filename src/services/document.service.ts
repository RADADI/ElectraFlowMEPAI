/**
 * Document service — Phase 3
 */

import { supabase, IS_SUPABASE_CONFIGURED } from "@/lib/supabase";
import { getSessionContext } from "@/lib/auth-bridge";
import { documents as MOCK_DOCS } from "@/lib/dummy-data";
import type { Document, DocumentInsert, DocumentUpdate } from "@/types/database";
import { ok, mockOk, fail, type ServiceResult } from "./_base.service";

type MockDoc = (typeof MOCK_DOCS)[number];

// Maps dummy-data field "status" to Document["status"]
function mapDocStatus(s: string): Document["status"] {
  const m: Record<string, Document["status"]> = {
    approved: "approved",
    "in review": "under_review",
    pending: "draft",
    rejected: "rejected",
  };
  return m[s.toLowerCase()] ?? "draft";
}

function toDocument(raw: MockDoc): Document {
  return {
    id: String(raw.id),
    organization_id: "mock-org",
    project_id: null,
    title: raw.name, // dummy-data uses "name"
    document_number: null,
    discipline: raw.discipline ?? null,
    document_type: raw.type, // dummy-data: "PDF", "DWG", etc.
    revision: raw.version, // dummy-data uses "version" e.g. "v3.2"
    status: mapDocStatus(raw.status),
    file_url: null,
    file_size_bytes: null,
    mime_type: null,
    description: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: null,
    updated_by: null,
    deleted_at: null,
  };
}

export async function listDocuments(projectId?: string): Promise<ServiceResult<Document[]>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return mockOk(MOCK_DOCS.map(toDocument));
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return mockOk(MOCK_DOCS.map(toDocument));

  try {
    let query = supabase
      .from("documents")
      .select("*")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (projectId) query = query.eq("project_id", projectId);

    const { data, error } = await query;
    if (error) return fail<Document[]>(error);
    return ok(data as Document[]);
  } catch (err) {
    return fail<Document[]>(err);
  }
}

export async function getDocument(id: string): Promise<ServiceResult<Document>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const raw = MOCK_DOCS.find((d) => String(d.id) === id);
    if (!raw) return fail<Document>(`Document ${id} not found.`);
    return mockOk(toDocument(raw));
  }

  try {
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (error) return fail<Document>(error);
    return ok(data as Document);
  } catch (err) {
    return fail<Document>(err);
  }
}

export async function createDocument(payload: DocumentInsert): Promise<ServiceResult<Document>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return fail<Document>("Supabase is not configured.");
  }

  try {
    const { data, error } = await supabase.from("documents").insert(payload).select().single();

    if (error) return fail<Document>(error);
    return ok(data as Document);
  } catch (err) {
    return fail<Document>(err);
  }
}

export async function updateDocument(
  id: string,
  payload: DocumentUpdate,
): Promise<ServiceResult<Document>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return fail<Document>("Supabase is not configured.");
  }

  try {
    const { data, error } = await supabase
      .from("documents")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) return fail<Document>(error);
    return ok(data as Document);
  } catch (err) {
    return fail<Document>(err);
  }
}
