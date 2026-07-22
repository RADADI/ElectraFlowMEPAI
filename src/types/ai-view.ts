/**
 * AI Copilot view types — Phase 15C
 */

import type {
  ChatMessageRole,
  ChatSessionContextType,
  EmbeddingJobStatus,
  EmbeddingJobSourceType,
  EmbeddingChunkStatus,
  AISuggestionType,
  AISuggestionStatus,
  AIUsageEventType,
} from "@/types/database";

export type {
  ChatMessageRole,
  ChatSessionContextType,
  EmbeddingJobStatus,
  EmbeddingJobSourceType,
  EmbeddingChunkStatus,
  AISuggestionType,
  AISuggestionStatus,
  AIUsageEventType,
};

// ─── Citations ────────────────────────────────────────────────────────────────

export interface ChatCitation {
  chunk_id: string;
  document_id: string;
  document_version_id: string;
  document_title?: string | null;
  chunk_index: number;
  excerpt: string;
  page?: number | null;
  is_stale?: boolean;
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export interface ChatSessionListItemView {
  id: string;
  title: string;
  context_type: ChatSessionContextType | null;
  context_id: string | null;
  attachment_document_id: string | null;
  message_count: number;
  updated_at: string;
  created_at: string;
}

export interface ChatSessionView {
  id: string;
  organization_id: string;
  profile_id: string;
  title: string;
  context_type: ChatSessionContextType | null;
  context_id: string | null;
  attachment_document_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  can_send: boolean;
  can_rename: boolean;
  can_delete: boolean;
  is_read_only: boolean;
  ai_configured: boolean;
  contexts: ConversationContextView[];
}

export interface ConversationContextView {
  id: string;
  chat_session_id: string;
  context_type: ChatSessionContextType;
  context_id: string;
  label: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ChatMessageView {
  id: string;
  chat_session_id: string;
  role: ChatMessageRole;
  content: string;
  citations: ChatCitation[];
  metadata: Record<string, unknown>;
  created_at: string;
}

// ─── Chunks & search ──────────────────────────────────────────────────────────

export interface DocumentChunkView {
  id: string;
  organization_id: string;
  document_id: string;
  document_version_id: string;
  chunk_index: number;
  content: string;
  metadata: Record<string, unknown>;
  embedding_status: EmbeddingChunkStatus;
  document_title?: string | null;
  created_at: string;
  deleted_at: string | null;
}

export interface ChunkSearchResult {
  chunks: DocumentChunkView[];
  strategy: string;
  semanticSearchAvailable: boolean;
}

// ─── Embedding jobs ───────────────────────────────────────────────────────────

export interface EmbeddingJobView {
  id: string;
  organization_id: string;
  source_type: EmbeddingJobSourceType;
  source_id: string;
  status: EmbeddingJobStatus;
  error_message: string | null;
  queue_metadata: Record<string, unknown>;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  source_label?: string | null;
  can_retry: boolean;
}

// ─── Suggestions ──────────────────────────────────────────────────────────────

export interface AISuggestionView {
  id: string;
  organization_id: string;
  suggestion_type: AISuggestionType;
  entity_type: string;
  entity_id: string;
  title: string;
  content: string;
  confidence: number | null;
  status: AISuggestionStatus;
  created_by_ai: boolean;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
  entity_label?: string | null;
  can_review: boolean;
}

// ─── Usage metrics ────────────────────────────────────────────────────────────

export interface AIUsageMetricView {
  id: string;
  organization_id: string;
  profile_id: string | null;
  event_type: AIUsageEventType;
  provider_id: string | null;
  model: string | null;
  tokens_in: number;
  tokens_out: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AIOverviewStats {
  session_count: number;
  pending_suggestions: number;
  failed_jobs: number;
  indexed_chunks: number;
  ai_configured: boolean;
}

// ─── Inputs ───────────────────────────────────────────────────────────────────

export interface ChatSessionCreateInput {
  title?: string;
  context_type?: ChatSessionContextType | null;
  context_id?: string | null;
  attachment_document_id?: string | null;
  contexts?: { context_type: ChatSessionContextType; context_id: string; label?: string }[];
}

export interface ChatSessionFilterInput {
  cursor?: string;
  limit?: number;
}

export interface MessageFilterInput {
  cursor?: string;
  limit?: number;
}

export interface ChunkSearchInput {
  query: string;
  document_id?: string;
  document_version_id?: string;
  project_id?: string;
  limit?: number;
  include_stale?: boolean;
}

export interface EmbeddingJobCreateInput {
  source_type: EmbeddingJobSourceType;
  source_id: string;
  queue_metadata?: Record<string, unknown>;
}

export interface EmbeddingJobFilterInput {
  status?: EmbeddingJobStatus | "all";
  cursor?: string;
  limit?: number;
}

export interface AISuggestionFilterInput {
  status?: AISuggestionStatus | "all";
  suggestion_type?: AISuggestionType | "all";
  cursor?: string;
  limit?: number;
}

export interface AISuggestionCreateInput {
  suggestion_type: AISuggestionType;
  entity_type: string;
  entity_id: string;
  title: string;
  content: string;
  confidence?: number | null;
  created_by_ai?: boolean;
}

export const SUGGESTION_TYPE_LABEL: Record<AISuggestionType, string> = {
  document_summary: "Document Summary",
  submittal_review: "Submittal Review",
  rfi_summary: "RFI Summary",
  ncr_summary: "NCR Summary",
  meeting_summary: "Meeting Summary",
  load_calculation_summary: "Load Calculation Summary",
  timesheet_summary: "Timesheet Summary",
  financial_summary: "Financial Summary",
};

export const SUGGESTION_STATUS_LABEL: Record<AISuggestionStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
  dismissed: "Dismissed",
};

export const JOB_STATUS_LABEL: Record<EmbeddingJobStatus, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
};

// ─── Citation integrity ─────────────────────────────────────────────────────────

export function validateCitationIntegrity(
  citation: ChatCitation,
  chunk: Pick<
    DocumentChunkView,
    "id" | "content" | "document_id" | "document_version_id" | "chunk_index" | "embedding_status"
  >,
): string | null {
  if (citation.chunk_id !== chunk.id) return "Citation chunk ID mismatch.";
  if (citation.document_id !== chunk.document_id) return "Citation document ID mismatch.";
  if (citation.document_version_id !== chunk.document_version_id) {
    return "Citation document version mismatch.";
  }
  if (citation.chunk_index !== chunk.chunk_index) return "Citation chunk index mismatch.";
  if (!citation.excerpt || !chunk.content.includes(citation.excerpt)) {
    return "Citation excerpt is not a substring of chunk content.";
  }
  return null;
}

export function buildCitationFromChunk(
  chunk: DocumentChunkView,
  excerpt?: string,
): ChatCitation | null {
  const text = excerpt ?? chunk.content.slice(0, 240);
  if (!chunk.content.includes(text)) return null;
  return {
    chunk_id: chunk.id,
    document_id: chunk.document_id,
    document_version_id: chunk.document_version_id,
    document_title: chunk.document_title ?? null,
    chunk_index: chunk.chunk_index,
    excerpt: text,
    page: typeof chunk.metadata.page === "number" ? chunk.metadata.page : null,
    is_stale: chunk.embedding_status === "stale",
  };
}

export function canManageAI(role: string | null): boolean {
  if (!role) return false;
  return [
    "Admin",
    "Project Manager",
    "Senior Electrical Engineer",
    "Electrical Engineer",
    "QA/QC Engineer",
  ].includes(role);
}

export function isAIReadOnly(role: string | null): boolean {
  return role === "Executive";
}

export function canAccessAI(role: string | null): boolean {
  if (!role) return false;
  if (["HR", "Client"].includes(role)) return false;
  return [
    "Admin",
    "Project Manager",
    "Senior Electrical Engineer",
    "Electrical Engineer",
    "QA/QC Engineer",
    "Executive",
  ].includes(role);
}
