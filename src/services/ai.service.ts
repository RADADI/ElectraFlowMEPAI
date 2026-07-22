/**
 * AI Copilot service — Phase 15C
 *
 * Chat sessions, RAG chunk search, embedding jobs, AI suggestions, and usage
 * metrics with audit logging, activity events, and notification fan-out.
 * Falls back to sessionStorage mock when Supabase is not configured or JWT is
 * not ready.
 */

import { supabase, IS_SUPABASE_CONFIGURED, isJwtReady } from "@/lib/supabase";
import { getSessionContext, getCurrentUserId } from "@/lib/auth-bridge";
import {
  dummyChatSessions,
  dummyConversationContexts,
  dummyChatMessages,
  dummyDocumentChunks,
  dummyEmbeddingJobs,
  dummyAISuggestions,
  documents,
  MOCK_PROFILE_IDS,
} from "@/lib/dummy-data";
import { getAIProvider, isAIConfigured, AI_NOT_CONFIGURED_MESSAGE } from "@/lib/ai-provider";
import { searchChunksLocal } from "@/lib/ai-search";
import { AI_FEATURES } from "@/lib/ai-features";
import {
  validateCitationIntegrity,
  buildCitationFromChunk,
  canManageAI,
  isAIReadOnly,
  canAccessAI,
} from "@/types/ai-view";
import { encodeCursor, decodeCursor, type CursorPage } from "@/types/notification-view";
import { logAction } from "@/services/audit.service";
import { createActivityEvent } from "@/services/activity.service";
import { notifyUsers } from "@/services/notification.service";
import { EVENT_TYPES } from "@/types/notification-view";
import { ok, mockOk, fail, type ServiceResult } from "./_base.service";
import type {
  ChatSession,
  ConversationContext,
  ChatMessage,
  DocumentChunk,
  EmbeddingJob,
  AISuggestion,
  AIUsageMetric,
  AIUsageEventType,
} from "@/types/database";
import type {
  ChatSessionListItemView,
  ChatSessionView,
  ConversationContextView,
  ChatMessageView,
  DocumentChunkView,
  ChunkSearchResult,
  EmbeddingJobView,
  AISuggestionView,
  AIOverviewStats,
  ChatSessionCreateInput,
  ChatSessionFilterInput,
  MessageFilterInput,
  ChunkSearchInput,
  EmbeddingJobCreateInput,
  EmbeddingJobFilterInput,
  AISuggestionFilterInput,
  AISuggestionCreateInput,
  ChatCitation,
} from "@/types/ai-view";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export const RESOURCE_TYPES = {
  CHAT_SESSION: "chat_session",
  CHAT_MESSAGE: "chat_message",
  EMBEDDING_JOB: "embedding_job",
  AI_SUGGESTION: "ai_suggestion",
  DOCUMENT_CHUNK: "document_chunk",
} as const;

const MOCK_SESSIONS_KEY = "mep-ai-sessions-mock";
const MOCK_MESSAGES_KEY = "mep-ai-messages-mock";
const MOCK_CONTEXTS_KEY = "mep-ai-contexts-mock";
const MOCK_CHUNKS_KEY = "mep-ai-chunks-mock";
const MOCK_JOBS_KEY = "mep-ai-jobs-mock";
const MOCK_SUGGESTIONS_KEY = "mep-ai-suggestions-mock";

const MOCK_USAGE: AIUsageMetric[] = [];

// ─── Routing guard ────────────────────────────────────────────────────────────

function shouldUseSupabase(): boolean {
  if (!IS_SUPABASE_CONFIGURED || !supabase) return false;
  if (!isJwtReady()) {
    console.warn("[ElectraFlow] Supabase configured but JWT is not ready — using mock AI data.");
    return false;
  }
  return true;
}

function getDb() {
  if (!supabase) throw new Error("Supabase unavailable");
  return supabase;
}

// ─── Mock sessionStorage helpers ──────────────────────────────────────────────

function mergeMockStore<T extends { id: string }>(base: T[], key: string): T[] {
  try {
    const raw = sessionStorage.getItem(key);
    const overrides: T[] = raw ? (JSON.parse(raw) as T[]) : [];
    const overrideIds = new Set(overrides.map((r) => r.id));
    return [...overrides, ...base.filter((r) => !overrideIds.has(r.id))];
  } catch {
    return [...base];
  }
}

function saveMockStore<T extends { id: string }>(items: T[], base: T[], key: string): void {
  try {
    const baseIds = new Set(base.map((r) => r.id));
    const custom = items.filter((r) => !baseIds.has(r.id));
    const mutated = items.filter((r) => {
      if (baseIds.has(r.id)) {
        const b = base.find((x) => x.id === r.id);
        return b && JSON.stringify(r) !== JSON.stringify(b);
      }
      return false;
    });
    sessionStorage.setItem(key, JSON.stringify([...custom, ...mutated]));
    // eslint-disable-next-line no-empty
  } catch {}
}

function getMockSessions(): ChatSession[] {
  return mergeMockStore([...dummyChatSessions], MOCK_SESSIONS_KEY);
}

function saveMockSessions(items: ChatSession[]): void {
  saveMockStore(items, [...dummyChatSessions], MOCK_SESSIONS_KEY);
}

function getMockMessages(): ChatMessage[] {
  return mergeMockStore([...dummyChatMessages], MOCK_MESSAGES_KEY);
}

function saveMockMessages(items: ChatMessage[]): void {
  saveMockStore(items, [...dummyChatMessages], MOCK_MESSAGES_KEY);
}

function getMockContexts(): ConversationContext[] {
  return mergeMockStore([...dummyConversationContexts], MOCK_CONTEXTS_KEY);
}

function saveMockContexts(items: ConversationContext[]): void {
  saveMockStore(items, [...dummyConversationContexts], MOCK_CONTEXTS_KEY);
}

function getMockChunks(): DocumentChunk[] {
  return mergeMockStore([...dummyDocumentChunks], MOCK_CHUNKS_KEY);
}

function saveMockChunks(items: DocumentChunk[]): void {
  saveMockStore(items, [...dummyDocumentChunks], MOCK_CHUNKS_KEY);
}

function getMockJobs(): EmbeddingJob[] {
  return mergeMockStore([...dummyEmbeddingJobs], MOCK_JOBS_KEY);
}

function saveMockJobs(items: EmbeddingJob[]): void {
  saveMockStore(items, [...dummyEmbeddingJobs], MOCK_JOBS_KEY);
}

function getMockSuggestions(): AISuggestion[] {
  return mergeMockStore([...dummyAISuggestions], MOCK_SUGGESTIONS_KEY);
}

function saveMockSuggestions(items: AISuggestion[]): void {
  saveMockStore(items, [...dummyAISuggestions], MOCK_SUGGESTIONS_KEY);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getActorProfileId(): Promise<string | null> {
  return getCurrentUserId();
}

function documentTitle(documentId: string | null | undefined): string | null {
  if (!documentId) return null;
  return documents.find((d) => d.id === documentId)?.name ?? null;
}

function aiRecipientIds(actorId: string | null): string[] {
  return [MOCK_PROFILE_IDS.pm, MOCK_PROFILE_IDS.iqbal].filter((id) => id && id !== actorId);
}

function sessionPermissionFlags(role: string | null) {
  const readOnly = isAIReadOnly(role);
  const canMutate = canManageAI(role) && !readOnly;
  return {
    can_send: canMutate,
    can_rename: canMutate,
    can_delete: canMutate,
    is_read_only: readOnly,
    ai_configured: isAIConfigured(),
  };
}

function toContextView(ctx: ConversationContext): ConversationContextView {
  return {
    id: ctx.id,
    chat_session_id: ctx.chat_session_id,
    context_type: ctx.context_type,
    context_id: ctx.context_id,
    label: ctx.label,
    metadata: ctx.metadata,
    created_at: ctx.created_at,
  };
}

function toChunkView(chunk: DocumentChunk): DocumentChunkView {
  return {
    id: chunk.id,
    organization_id: chunk.organization_id,
    document_id: chunk.document_id,
    document_version_id: chunk.document_version_id,
    chunk_index: chunk.chunk_index,
    content: chunk.content,
    metadata: chunk.metadata,
    embedding_status: chunk.embedding_status,
    document_title: documentTitle(chunk.document_id),
    created_at: chunk.created_at,
    deleted_at: chunk.deleted_at,
  };
}

function toMessageView(message: ChatMessage): ChatMessageView {
  return {
    id: message.id,
    chat_session_id: message.chat_session_id,
    role: message.role,
    content: message.content,
    citations: (message.citations as ChatCitation[]) ?? [],
    metadata: message.metadata,
    created_at: message.created_at,
  };
}

function toSessionListItem(session: ChatSession, messageCount: number): ChatSessionListItemView {
  return {
    id: session.id,
    title: session.title,
    context_type: session.context_type,
    context_id: session.context_id,
    attachment_document_id: session.attachment_document_id,
    message_count: messageCount,
    updated_at: session.updated_at,
    created_at: session.created_at,
  };
}

function toSessionView(
  session: ChatSession,
  contexts: ConversationContext[],
  role: string | null,
): ChatSessionView {
  const flags = sessionPermissionFlags(role);
  return {
    id: session.id,
    organization_id: session.organization_id,
    profile_id: session.profile_id,
    title: session.title,
    context_type: session.context_type,
    context_id: session.context_id,
    attachment_document_id: session.attachment_document_id,
    created_at: session.created_at,
    updated_at: session.updated_at,
    deleted_at: session.deleted_at,
    contexts: contexts.map(toContextView),
    ...flags,
  };
}

function toJobView(job: EmbeddingJob): EmbeddingJobView {
  const meta = job.queue_metadata ?? {};
  const sourceLabel =
    (meta.document_title as string | undefined) ??
    documentTitle(
      job.source_type === "document"
        ? job.source_id
        : ((meta.document_id as string | undefined) ?? null),
    );
  return {
    id: job.id,
    organization_id: job.organization_id,
    source_type: job.source_type,
    source_id: job.source_id,
    status: job.status,
    error_message: job.error_message,
    queue_metadata: job.queue_metadata,
    started_at: job.started_at,
    completed_at: job.completed_at,
    created_at: job.created_at,
    source_label: sourceLabel ?? null,
    can_retry: job.status === "failed" && canManageAI(getSessionContext().role),
  };
}

function toSuggestionView(suggestion: AISuggestion): AISuggestionView {
  const role = getSessionContext().role;
  return {
    id: suggestion.id,
    organization_id: suggestion.organization_id,
    suggestion_type: suggestion.suggestion_type,
    entity_type: suggestion.entity_type,
    entity_id: suggestion.entity_id,
    title: suggestion.title,
    content: suggestion.content,
    confidence: suggestion.confidence,
    status: suggestion.status,
    created_by_ai: suggestion.created_by_ai,
    reviewed_by: suggestion.reviewed_by,
    created_at: suggestion.created_at,
    updated_at: suggestion.updated_at,
    entity_label: suggestion.title,
    can_review: suggestion.status === "pending" && canManageAI(role) && !isAIReadOnly(role),
  };
}

function paginateMessagesAsc(
  messages: ChatMessage[],
  cursor: string | undefined,
  limit: number,
): { items: ChatMessage[]; next_cursor: string | null } {
  const sorted = [...messages].sort((a, b) => {
    const t = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (t !== 0) return t;
    return a.id.localeCompare(b.id);
  });

  let endIdx = sorted.length;
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded) {
      const idx = sorted.findIndex((m) => m.id === decoded.id);
      if (idx !== -1) endIdx = idx;
    }
  }

  const startIdx = Math.max(0, endIdx - limit);
  const page = sorted.slice(startIdx, endIdx);
  const hasMore = startIdx > 0;
  const next_cursor = hasMore ? encodeCursor(page[0].created_at, page[0].id) : null;

  return { items: page, next_cursor };
}

function validateCitationsAgainstChunks(
  citations: ChatCitation[],
  chunks: DocumentChunkView[],
): ChatCitation[] {
  const validated: ChatCitation[] = [];
  for (const citation of citations) {
    const chunk = chunks.find((c) => c.id === citation.chunk_id);
    if (!chunk) continue;
    const err = validateCitationIntegrity(citation, chunk);
    if (err) continue;
    validated.push({
      ...citation,
      document_title: citation.document_title ?? chunk.document_title ?? null,
      is_stale: chunk.embedding_status === "stale",
    });
  }
  return validated;
}

function resolveSearchScope(session: ChatSession, contexts: ConversationContext[]) {
  let documentId: string | undefined;
  let documentVersionId: string | undefined;
  let projectId: string | undefined;

  if (session.attachment_document_id) {
    documentId = session.attachment_document_id;
  }
  if (session.context_type === "document" && session.context_id) {
    documentId = session.context_id;
  }
  if (session.context_type === "project" && session.context_id) {
    projectId = session.context_id;
  }

  for (const ctx of contexts) {
    if (ctx.context_type === "document") documentId = ctx.context_id;
    if (ctx.context_type === "project") projectId = ctx.context_id;
  }

  return { documentId, documentVersionId, projectId };
}

async function emitAiEvent(
  action: string,
  eventType: string,
  resourceType: string,
  resourceId: string,
  entityLabel: string,
  title: string,
  message: string,
  recipientIds: string[],
  actorId: string | null,
  route: string,
  newData?: Record<string, unknown>,
): Promise<void> {
  await logAction({
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    new_data: newData,
  });
  await createActivityEvent({
    event_type: eventType,
    entity_type: resourceType,
    entity_id: resourceId,
    entity_label: entityLabel,
    message,
    category: "ai",
    visibility: "internal",
    actor_profile_id: actorId,
  });
  await notifyUsers(recipientIds, {
    event_type: eventType,
    title,
    message,
    entity_type: resourceType,
    entity_id: resourceId,
    route,
    category: "ai",
    actor_profile_id: actorId,
  });
}

async function recordUsageMetric(input: {
  event_type: AIUsageEventType;
  provider_id?: string | null;
  model?: string | null;
  tokens_in?: number;
  tokens_out?: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!AI_FEATURES.usageMetrics) return;

  const { organizationId } = getSessionContext();
  const actorId = await getActorProfileId();
  const row: AIUsageMetric = {
    id: crypto.randomUUID(),
    organization_id: organizationId ?? "mock-org",
    profile_id: actorId,
    event_type: input.event_type,
    provider_id: input.provider_id ?? null,
    model: input.model ?? null,
    tokens_in: input.tokens_in ?? 0,
    tokens_out: input.tokens_out ?? 0,
    metadata: input.metadata ?? {},
    created_at: new Date().toISOString(),
  };

  if (!shouldUseSupabase()) {
    MOCK_USAGE.unshift(row);
    return;
  }

  if (!organizationId) return;

  try {
    await getDb().from("ai_usage_metrics").insert({
      organization_id: organizationId,
      profile_id: actorId,
      event_type: row.event_type,
      provider_id: row.provider_id,
      model: row.model,
      tokens_in: row.tokens_in,
      tokens_out: row.tokens_out,
      metadata: row.metadata,
    });
  } catch {
    // Non-blocking usage tracking
  }
}

function markChunksStaleMock(documentId: string, exceptVersionId?: string): number {
  const chunks = getMockChunks();
  let updated = 0;
  const next = chunks.map((chunk) => {
    if (
      chunk.document_id === documentId &&
      chunk.deleted_at == null &&
      chunk.embedding_status !== "stale" &&
      chunk.document_version_id !== exceptVersionId
    ) {
      updated += 1;
      return { ...chunk, embedding_status: "stale" as const };
    }
    return chunk;
  });
  if (updated > 0) saveMockChunks(next);
  return updated;
}

function createStubChunksForJob(
  job: EmbeddingJob,
  documentId: string,
  versionId: string,
): DocumentChunk[] {
  const titles = documentTitle(documentId) ?? "Document";
  const now = new Date().toISOString();
  return [0, 1, 2].map((index) => ({
    id: crypto.randomUUID(),
    organization_id: job.organization_id,
    document_id: documentId,
    document_version_id: versionId,
    chunk_index: index,
    content: `Indexed excerpt ${index + 1} from ${titles}. Generated by embedding job ${job.id}.`,
    metadata: { page: index + 1, job_id: job.id },
    embedding_status: "indexed" as const,
    created_at: now,
    deleted_at: null,
  }));
}

function resolveJobDocumentTarget(job: EmbeddingJob): {
  documentId: string | null;
  versionId: string | null;
} {
  const meta = job.queue_metadata ?? {};
  if (job.source_type === "document") {
    return {
      documentId: job.source_id,
      versionId: (meta.document_version_id as string | undefined) ?? `${job.source_id}-v1`,
    };
  }
  if (job.source_type === "document_version") {
    return {
      documentId: (meta.document_id as string | undefined) ?? null,
      versionId: job.source_id,
    };
  }
  return { documentId: null, versionId: null };
}

function processMockEmbeddingJob(jobId: string): void {
  const jobs = getMockJobs();
  const idx = jobs.findIndex((j) => j.id === jobId);
  if (idx === -1) return;

  const job = { ...jobs[idx] };
  if (job.status !== "queued") return;

  job.status = "running";
  job.started_at = new Date().toISOString();
  jobs[idx] = job;
  saveMockJobs(jobs);

  const { documentId, versionId } = resolveJobDocumentTarget(job);
  if (documentId && versionId) {
    markChunksStaleMock(documentId, versionId);
    const existing = getMockChunks();
    const stubs = createStubChunksForJob(job, documentId, versionId);
    saveMockChunks([...stubs, ...existing]);
  }

  job.status = "completed";
  job.completed_at = new Date().toISOString();
  jobs[idx] = job;
  saveMockJobs(jobs);
}

function assertAiAccess(role: string | null): string | null {
  if (!canAccessAI(role)) return "You do not have permission to access AI features.";
  return null;
}

function assertAiMutate(role: string | null): string | null {
  const accessErr = assertAiAccess(role);
  if (accessErr) return accessErr;
  if (!canManageAI(role)) return "You do not have permission to modify AI resources.";
  if (isAIReadOnly(role)) return "AI is read-only for your role.";
  return null;
}

// ─── Chat sessions ────────────────────────────────────────────────────────────

export async function listChatSessions(
  filters: ChatSessionFilterInput = {},
): Promise<ServiceResult<CursorPage<ChatSessionListItemView>>> {
  const { role } = getSessionContext();
  const accessErr = assertAiAccess(role);
  if (accessErr) return fail(accessErr);
  if (!AI_FEATURES.chat) return fail("AI chat is disabled.");

  const limit = filters.limit ?? PAGE_SIZE;
  const actorId = await getActorProfileId();

  if (!shouldUseSupabase()) {
    const messages = getMockMessages();
    let items = getMockSessions().filter((s) => !s.deleted_at && s.profile_id === actorId);
    items.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    if (filters.cursor) {
      const decoded = decodeCursor(filters.cursor);
      if (decoded) {
        const idx = items.findIndex((s) => s.id === decoded.id);
        if (idx !== -1) items = items.slice(idx + 1);
      }
    }

    const page = items.slice(0, limit);
    const views = page.map((s) =>
      toSessionListItem(s, messages.filter((m) => m.chat_session_id === s.id).length),
    );
    const next_cursor =
      items.length > limit
        ? encodeCursor(page[page.length - 1].updated_at, page[page.length - 1].id)
        : null;

    return mockOk({ items: views, next_cursor });
  }

  const { organizationId } = getSessionContext();
  if (!organizationId || !actorId) return fail("No active session.");

  try {
    let q = getDb()
      .from("chat_sessions")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("profile_id", actorId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (filters.cursor) {
      const decoded = decodeCursor(filters.cursor);
      if (decoded) {
        q = q.or(
          `updated_at.lt.${decoded.created_at},and(updated_at.eq.${decoded.created_at},id.lt.${decoded.id})`,
        );
      }
    }

    const { data, error } = await q;
    if (error) return fail(error);

    const rows = (data ?? []) as ChatSession[];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const views: ChatSessionListItemView[] = await Promise.all(
      page.map(async (s) => {
        const { count } = await getDb()
          .from("chat_messages")
          .select("*", { count: "exact", head: true })
          .eq("chat_session_id", s.id);
        return toSessionListItem(s, count ?? 0);
      }),
    );

    const next_cursor =
      hasMore && page.length > 0
        ? encodeCursor(page[page.length - 1].updated_at, page[page.length - 1].id)
        : null;

    return ok({ items: views, next_cursor });
  } catch (err) {
    return fail(err);
  }
}

export async function getChatSession(id: string): Promise<ServiceResult<ChatSessionView>> {
  const { role } = getSessionContext();
  const accessErr = assertAiAccess(role);
  if (accessErr) return fail(accessErr);

  const actorId = await getActorProfileId();

  if (!shouldUseSupabase()) {
    const session = getMockSessions().find(
      (s) => s.id === id && !s.deleted_at && s.profile_id === actorId,
    );
    if (!session) return fail("Chat session not found.");
    const contexts = getMockContexts().filter((c) => c.chat_session_id === id);
    return mockOk(toSessionView(session, contexts, role));
  }

  const { organizationId } = getSessionContext();
  if (!organizationId || !actorId) return fail("No active session.");

  try {
    const { data, error } = await getDb()
      .from("chat_sessions")
      .select("*")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .eq("profile_id", actorId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) return fail(error);
    if (!data) return fail("Chat session not found.");

    const { data: ctxRows } = await getDb()
      .from("conversation_contexts")
      .select("*")
      .eq("chat_session_id", id);

    return ok(toSessionView(data as ChatSession, (ctxRows ?? []) as ConversationContext[], role));
  } catch (err) {
    return fail(err);
  }
}

export async function createChatSession(
  input: ChatSessionCreateInput,
): Promise<ServiceResult<ChatSessionView>> {
  const { role, organizationId } = getSessionContext();
  const mutateErr = assertAiMutate(role);
  if (mutateErr) return fail(mutateErr);
  if (!AI_FEATURES.chat) return fail("AI chat is disabled.");

  const actorId = await getActorProfileId();
  const orgId = organizationId ?? "mock-org";
  const now = new Date().toISOString();

  const row: ChatSession = {
    id: crypto.randomUUID(),
    organization_id: orgId,
    profile_id: actorId ?? MOCK_PROFILE_IDS.sara,
    title: input.title?.trim() || "New chat",
    context_type: input.context_type ?? null,
    context_id: input.context_id ?? null,
    attachment_document_id: input.attachment_document_id ?? null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  const contextRows: ConversationContext[] = (input.contexts ?? []).map((ctx) => ({
    id: crypto.randomUUID(),
    organization_id: orgId,
    chat_session_id: row.id,
    context_type: ctx.context_type,
    context_id: ctx.context_id,
    label: ctx.label ?? null,
    metadata: {},
    created_at: now,
  }));

  if (!shouldUseSupabase()) {
    const sessions = getMockSessions();
    sessions.unshift(row);
    saveMockSessions(sessions);

    if (contextRows.length > 0) {
      const contexts = getMockContexts();
      saveMockContexts([...contextRows, ...contexts]);
    }

    await emitAiEvent(
      "ai.chat_session.created",
      EVENT_TYPES.AI_SUMMARY_READY,
      RESOURCE_TYPES.CHAT_SESSION,
      row.id,
      row.title,
      "Chat session created",
      `"${row.title}" was created.`,
      aiRecipientIds(actorId),
      actorId,
      `/ai/chat/${row.id}`,
      { title: row.title },
    );

    return mockOk(toSessionView(row, contextRows, role));
  }

  if (!organizationId || !actorId) return fail("No active session.");

  try {
    const { data, error } = await getDb()
      .from("chat_sessions")
      .insert({
        organization_id: organizationId,
        profile_id: actorId,
        title: row.title,
        context_type: row.context_type,
        context_id: row.context_id,
        attachment_document_id: row.attachment_document_id,
      })
      .select()
      .single();

    if (error) return fail(error);

    const session = data as ChatSession;
    let contexts: ConversationContext[] = [];

    if (input.contexts?.length && AI_FEATURES.conversationContexts) {
      const inserts = input.contexts.map((ctx) => ({
        organization_id: organizationId,
        chat_session_id: session.id,
        context_type: ctx.context_type,
        context_id: ctx.context_id,
        label: ctx.label ?? null,
      }));
      const { data: ctxData } = await getDb()
        .from("conversation_contexts")
        .insert(inserts)
        .select();
      contexts = (ctxData ?? []) as ConversationContext[];
    }

    await emitAiEvent(
      "ai.chat_session.created",
      EVENT_TYPES.AI_SUMMARY_READY,
      RESOURCE_TYPES.CHAT_SESSION,
      session.id,
      session.title,
      "Chat session created",
      `"${session.title}" was created.`,
      aiRecipientIds(actorId),
      actorId,
      `/ai/chat/${session.id}`,
    );

    return ok(toSessionView(session, contexts, role));
  } catch (err) {
    return fail(err);
  }
}

export async function renameChatSession(
  id: string,
  title: string,
): Promise<ServiceResult<ChatSessionView>> {
  const trimmed = title.trim();
  if (!trimmed) return fail("Title is required.");

  const { role } = getSessionContext();
  const mutateErr = assertAiMutate(role);
  if (mutateErr) return fail(mutateErr);

  const actorId = await getActorProfileId();

  if (!shouldUseSupabase()) {
    const sessions = getMockSessions();
    const idx = sessions.findIndex((s) => s.id === id && !s.deleted_at && s.profile_id === actorId);
    if (idx === -1) return fail("Chat session not found.");

    sessions[idx] = { ...sessions[idx], title: trimmed, updated_at: new Date().toISOString() };
    saveMockSessions(sessions);

    const contexts = getMockContexts().filter((c) => c.chat_session_id === id);
    return mockOk(toSessionView(sessions[idx], contexts, role));
  }

  const { organizationId } = getSessionContext();
  if (!organizationId || !actorId) return fail("No active session.");

  try {
    const { data, error } = await getDb()
      .from("chat_sessions")
      .update({ title: trimmed })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .eq("profile_id", actorId)
      .is("deleted_at", null)
      .select()
      .single();

    if (error) return fail(error);

    const { data: ctxRows } = await getDb()
      .from("conversation_contexts")
      .select("*")
      .eq("chat_session_id", id);

    return ok(toSessionView(data as ChatSession, (ctxRows ?? []) as ConversationContext[], role));
  } catch (err) {
    return fail(err);
  }
}

export async function deleteChatSession(id: string): Promise<ServiceResult<{ id: string }>> {
  const { role } = getSessionContext();
  const mutateErr = assertAiMutate(role);
  if (mutateErr) return fail(mutateErr);

  const actorId = await getActorProfileId();
  const deletedAt = new Date().toISOString();

  if (!shouldUseSupabase()) {
    const sessions = getMockSessions();
    const idx = sessions.findIndex((s) => s.id === id && !s.deleted_at && s.profile_id === actorId);
    if (idx === -1) return fail("Chat session not found.");

    sessions[idx] = { ...sessions[idx], deleted_at: deletedAt, updated_at: deletedAt };
    saveMockSessions(sessions);

    await logAction({
      action: "ai.chat_session.deleted",
      resource_type: RESOURCE_TYPES.CHAT_SESSION,
      resource_id: id,
    });

    return mockOk({ id });
  }

  const { organizationId } = getSessionContext();
  if (!organizationId || !actorId) return fail("No active session.");

  try {
    const { error } = await getDb()
      .from("chat_sessions")
      .update({ deleted_at: deletedAt })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .eq("profile_id", actorId);

    if (error) return fail(error);

    await logAction({
      action: "ai.chat_session.deleted",
      resource_type: RESOURCE_TYPES.CHAT_SESSION,
      resource_id: id,
    });

    return ok({ id });
  } catch (err) {
    return fail(err);
  }
}

// ─── Chat messages ────────────────────────────────────────────────────────────

export async function listMessages(
  sessionId: string,
  filters: MessageFilterInput = {},
): Promise<ServiceResult<CursorPage<ChatMessageView>>> {
  const { role } = getSessionContext();
  const accessErr = assertAiAccess(role);
  if (accessErr) return fail(accessErr);

  const limit = filters.limit ?? PAGE_SIZE;
  const actorId = await getActorProfileId();

  if (!shouldUseSupabase()) {
    const session = getMockSessions().find(
      (s) => s.id === sessionId && !s.deleted_at && s.profile_id === actorId,
    );
    if (!session) return fail("Chat session not found.");

    const messages = getMockMessages().filter((m) => m.chat_session_id === sessionId);
    const { items, next_cursor } = paginateMessagesAsc(messages, filters.cursor, limit);
    return mockOk({ items: items.map(toMessageView), next_cursor });
  }

  const { organizationId } = getSessionContext();
  if (!organizationId || !actorId) return fail("No active session.");

  try {
    const { data: session } = await getDb()
      .from("chat_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("organization_id", organizationId)
      .eq("profile_id", actorId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!session) return fail("Chat session not found.");

    let q = getDb()
      .from("chat_messages")
      .select("*")
      .eq("chat_session_id", sessionId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (filters.cursor) {
      const decoded = decodeCursor(filters.cursor);
      if (decoded) {
        q = q.or(
          `created_at.lt.${decoded.created_at},and(created_at.eq.${decoded.created_at},id.lt.${decoded.id})`,
        );
      }
    }

    const { data, error } = await q;
    if (error) return fail(error);

    const rows = ((data ?? []) as ChatMessage[]).reverse();
    const hasMore = (data ?? []).length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const next_cursor =
      hasMore && page.length > 0 ? encodeCursor(page[0].created_at, page[0].id) : null;

    return ok({ items: page.map(toMessageView), next_cursor });
  } catch (err) {
    return fail(err);
  }
}

export async function sendMessage(
  sessionId: string,
  content: string,
): Promise<ServiceResult<{ user: ChatMessageView; assistant: ChatMessageView }>> {
  const trimmed = content.trim();
  if (!trimmed) return fail("Message content is required.");

  const { role, organizationId } = getSessionContext();
  const mutateErr = assertAiMutate(role);
  if (mutateErr) return fail(mutateErr);
  if (!AI_FEATURES.chat) return fail("AI chat is disabled.");

  const actorId = await getActorProfileId();
  const orgId = organizationId ?? "mock-org";
  const now = new Date().toISOString();

  const userMessage: ChatMessage = {
    id: crypto.randomUUID(),
    organization_id: orgId,
    chat_session_id: sessionId,
    role: "user",
    content: trimmed,
    citations: [],
    metadata: {},
    created_at: now,
  };

  const resolveSessionAndContext = () => {
    const session = getMockSessions().find(
      (s) => s.id === sessionId && !s.deleted_at && s.profile_id === actorId,
    );
    if (!session) return { error: "Chat session not found." as const };
    const contexts = getMockContexts().filter((c) => c.chat_session_id === sessionId);
    return { session, contexts };
  };

  if (!shouldUseSupabase()) {
    const resolved = resolveSessionAndContext();
    if ("error" in resolved) return fail(resolved.error);

    const { session, contexts } = resolved;
    const chunkViews = getMockChunks()
      .filter((c) => !c.deleted_at)
      .map(toChunkView);

    let searchResults: DocumentChunkView[] = [];
    if (AI_FEATURES.chunkSearch) {
      const scope = resolveSearchScope(session, contexts);
      const result = searchChunksLocal(chunkViews, {
        query: trimmed,
        documentId: scope.documentId,
        documentVersionId: scope.documentVersionId,
        projectId: scope.projectId,
        limit: 5,
      });
      searchResults = result.chunks;
    }

    const messages = getMockMessages();
    messages.push(userMessage);

    const provider = getAIProvider();
    const answer = await provider.generateAnswer({
      question: trimmed,
      contextChunks: searchResults.map((c) => ({
        content: c.content,
        chunkId: c.id,
        documentTitle: c.document_title,
      })),
      sessionId,
    });

    const assistantContent =
      isAIConfigured() && answer.configured ? answer.message : AI_NOT_CONFIGURED_MESSAGE;

    const validatedCitations =
      isAIConfigured() && answer.configured
        ? validateCitationsAgainstChunks(answer.citations, chunkViews)
        : [];

    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      organization_id: orgId,
      chat_session_id: sessionId,
      role: "assistant",
      content: assistantContent,
      citations: validatedCitations,
      metadata: {
        provider_id: answer.providerId,
        model: answer.model ?? null,
        search_strategy: searchResults.length > 0 ? "keyword" : null,
      },
      created_at: new Date().toISOString(),
    };

    messages.push(assistantMessage);
    saveMockMessages(messages);

    const sessions = getMockSessions();
    const sIdx = sessions.findIndex((s) => s.id === sessionId);
    if (sIdx !== -1) {
      sessions[sIdx] = { ...sessions[sIdx], updated_at: assistantMessage.created_at };
      saveMockSessions(sessions);
    }

    await recordUsageMetric({
      event_type: "chat_message",
      provider_id: answer.providerId,
      model: answer.model ?? null,
      tokens_in: Math.ceil(trimmed.length / 4),
      tokens_out: Math.ceil(assistantContent.length / 4),
      metadata: { session_id: sessionId, citation_count: validatedCitations.length },
    });

    return mockOk({
      user: toMessageView(userMessage),
      assistant: toMessageView(assistantMessage),
    });
  }

  if (!organizationId || !actorId) return fail("No active session.");

  try {
    const { data: session, error: sessionErr } = await getDb()
      .from("chat_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("organization_id", organizationId)
      .eq("profile_id", actorId)
      .is("deleted_at", null)
      .maybeSingle();

    if (sessionErr) return fail(sessionErr);
    if (!session) return fail("Chat session not found.");

    const { data: ctxRows } = await getDb()
      .from("conversation_contexts")
      .select("*")
      .eq("chat_session_id", sessionId);

    const contexts = (ctxRows ?? []) as ConversationContext[];
    const { data: chunkRows } = await getDb()
      .from("document_chunks")
      .select("*")
      .eq("organization_id", organizationId)
      .is("deleted_at", null);

    const chunkViews = ((chunkRows ?? []) as DocumentChunk[]).map(toChunkView);
    let searchResults: DocumentChunkView[] = [];

    if (AI_FEATURES.chunkSearch) {
      const scope = resolveSearchScope(session as ChatSession, contexts);
      searchResults = searchChunksLocal(chunkViews, {
        query: trimmed,
        documentId: scope.documentId,
        documentVersionId: scope.documentVersionId,
        projectId: scope.projectId,
        limit: 5,
      }).chunks;
    }

    const { data: insertedUser, error: userErr } = await getDb()
      .from("chat_messages")
      .insert({
        organization_id: organizationId,
        chat_session_id: sessionId,
        role: "user",
        content: trimmed,
        citations: [],
        metadata: {},
      })
      .select()
      .single();

    if (userErr) return fail(userErr);

    const provider = getAIProvider();
    const answer = await provider.generateAnswer({
      question: trimmed,
      contextChunks: searchResults.map((c) => ({
        content: c.content,
        chunkId: c.id,
        documentTitle: c.document_title,
      })),
      sessionId,
    });

    const assistantContent =
      isAIConfigured() && answer.configured ? answer.message : AI_NOT_CONFIGURED_MESSAGE;

    const validatedCitations =
      isAIConfigured() && answer.configured
        ? validateCitationsAgainstChunks(answer.citations, chunkViews)
        : [];

    const { data: insertedAssistant, error: assistantErr } = await getDb()
      .from("chat_messages")
      .insert({
        organization_id: organizationId,
        chat_session_id: sessionId,
        role: "assistant",
        content: assistantContent,
        citations: validatedCitations,
        metadata: {
          provider_id: answer.providerId,
          model: answer.model ?? null,
        },
      })
      .select()
      .single();

    if (assistantErr) return fail(assistantErr);

    await getDb()
      .from("chat_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", sessionId);

    await recordUsageMetric({
      event_type: "chat_message",
      provider_id: answer.providerId,
      model: answer.model ?? null,
      tokens_in: Math.ceil(trimmed.length / 4),
      tokens_out: Math.ceil(assistantContent.length / 4),
      metadata: { session_id: sessionId, citation_count: validatedCitations.length },
    });

    return ok({
      user: toMessageView(insertedUser as ChatMessage),
      assistant: toMessageView(insertedAssistant as ChatMessage),
    });
  } catch (err) {
    return fail(err);
  }
}

// ─── Suggestions ──────────────────────────────────────────────────────────────

export async function listSuggestions(
  filters: AISuggestionFilterInput = {},
): Promise<ServiceResult<CursorPage<AISuggestionView>>> {
  const { role } = getSessionContext();
  const accessErr = assertAiAccess(role);
  if (accessErr) return fail(accessErr);
  if (!AI_FEATURES.suggestions) return fail("AI suggestions are disabled.");

  const limit = filters.limit ?? PAGE_SIZE;

  if (!shouldUseSupabase()) {
    let items = getMockSuggestions();
    if (filters.status && filters.status !== "all") {
      items = items.filter((s) => s.status === filters.status);
    }
    if (filters.suggestion_type && filters.suggestion_type !== "all") {
      items = items.filter((s) => s.suggestion_type === filters.suggestion_type);
    }

    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    if (filters.cursor) {
      const decoded = decodeCursor(filters.cursor);
      if (decoded) {
        const idx = items.findIndex((s) => s.id === decoded.id);
        if (idx !== -1) items = items.slice(idx + 1);
      }
    }

    const page = items.slice(0, limit);
    const next_cursor =
      items.length > limit
        ? encodeCursor(page[page.length - 1].created_at, page[page.length - 1].id)
        : null;

    return mockOk({ items: page.map(toSuggestionView), next_cursor });
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return fail("No active session.");

  try {
    let q = getDb()
      .from("ai_suggestions")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
    if (filters.suggestion_type && filters.suggestion_type !== "all") {
      q = q.eq("suggestion_type", filters.suggestion_type);
    }

    if (filters.cursor) {
      const decoded = decodeCursor(filters.cursor);
      if (decoded) {
        q = q.or(
          `created_at.lt.${decoded.created_at},and(created_at.eq.${decoded.created_at},id.lt.${decoded.id})`,
        );
      }
    }

    const { data, error } = await q;
    if (error) return fail(error);

    const rows = (data ?? []) as AISuggestion[];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const next_cursor =
      hasMore && page.length > 0
        ? encodeCursor(page[page.length - 1].created_at, page[page.length - 1].id)
        : null;

    return ok({ items: page.map(toSuggestionView), next_cursor });
  } catch (err) {
    return fail(err);
  }
}

export async function createSuggestion(
  input: AISuggestionCreateInput,
): Promise<ServiceResult<AISuggestionView>> {
  const { role, organizationId } = getSessionContext();
  const mutateErr = assertAiMutate(role);
  if (mutateErr) return fail(mutateErr);
  if (!AI_FEATURES.suggestions || !AI_FEATURES.manualSuggestions) {
    return fail("Manual AI suggestions are disabled.");
  }

  const actorId = await getActorProfileId();
  const orgId = organizationId ?? "mock-org";
  const now = new Date().toISOString();

  const row: AISuggestion = {
    id: crypto.randomUUID(),
    organization_id: orgId,
    suggestion_type: input.suggestion_type,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    title: input.title.trim(),
    content: input.content.trim(),
    confidence: input.confidence ?? null,
    status: "pending",
    created_by_ai: input.created_by_ai ?? false,
    reviewed_by: null,
    created_at: now,
    updated_at: now,
  };

  if (!shouldUseSupabase()) {
    const items = getMockSuggestions();
    items.unshift(row);
    saveMockSuggestions(items);

    await emitAiEvent(
      "ai.suggestion.created",
      EVENT_TYPES.AI_SUGGESTION_READY,
      RESOURCE_TYPES.AI_SUGGESTION,
      row.id,
      row.title,
      "AI suggestion created",
      `"${row.title}" is ready for review.`,
      aiRecipientIds(actorId),
      actorId,
      `/ai/suggestions/${row.id}`,
    );

    return mockOk(toSuggestionView(row));
  }

  if (!organizationId) return fail("No active session.");

  try {
    const { data, error } = await getDb()
      .from("ai_suggestions")
      .insert({
        organization_id: organizationId,
        suggestion_type: row.suggestion_type,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        title: row.title,
        content: row.content,
        confidence: row.confidence,
        status: "pending",
        created_by_ai: row.created_by_ai,
      })
      .select()
      .single();

    if (error) return fail(error);

    await emitAiEvent(
      "ai.suggestion.created",
      EVENT_TYPES.AI_SUGGESTION_READY,
      RESOURCE_TYPES.AI_SUGGESTION,
      row.id,
      row.title,
      "AI suggestion created",
      `"${row.title}" is ready for review.`,
      aiRecipientIds(actorId),
      actorId,
      `/ai/suggestions/${row.id}`,
    );

    return ok(toSuggestionView(data as AISuggestion));
  } catch (err) {
    return fail(err);
  }
}

async function reviewSuggestion(
  id: string,
  status: "accepted" | "rejected" | "dismissed",
): Promise<ServiceResult<AISuggestionView>> {
  const { role, organizationId } = getSessionContext();
  const mutateErr = assertAiMutate(role);
  if (mutateErr) return fail(mutateErr);

  const actorId = await getActorProfileId();
  const now = new Date().toISOString();

  if (!shouldUseSupabase()) {
    const items = getMockSuggestions();
    const idx = items.findIndex((s) => s.id === id);
    if (idx === -1) return fail("Suggestion not found.");
    if (items[idx].status !== "pending") return fail("Only pending suggestions can be reviewed.");

    items[idx] = {
      ...items[idx],
      status,
      reviewed_by: actorId,
      updated_at: now,
    };
    saveMockSuggestions(items);

    await recordUsageMetric({
      event_type: "suggestion_review",
      metadata: { suggestion_id: id, status },
    });

    return mockOk(toSuggestionView(items[idx]));
  }

  if (!organizationId) return fail("No active session.");

  try {
    const { data, error } = await getDb()
      .from("ai_suggestions")
      .update({ status, reviewed_by: actorId })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .eq("status", "pending")
      .select()
      .single();

    if (error) return fail(error);

    await recordUsageMetric({
      event_type: "suggestion_review",
      metadata: { suggestion_id: id, status },
    });

    return ok(toSuggestionView(data as AISuggestion));
  } catch (err) {
    return fail(err);
  }
}

export async function acceptSuggestion(id: string): Promise<ServiceResult<AISuggestionView>> {
  return reviewSuggestion(id, "accepted");
}

export async function rejectSuggestion(id: string): Promise<ServiceResult<AISuggestionView>> {
  return reviewSuggestion(id, "rejected");
}

export async function dismissSuggestion(id: string): Promise<ServiceResult<AISuggestionView>> {
  return reviewSuggestion(id, "dismissed");
}

// ─── Embedding jobs ───────────────────────────────────────────────────────────

export async function listEmbeddingJobs(
  filters: EmbeddingJobFilterInput = {},
): Promise<ServiceResult<CursorPage<EmbeddingJobView>>> {
  const { role } = getSessionContext();
  const accessErr = assertAiAccess(role);
  if (accessErr) return fail(accessErr);
  if (!AI_FEATURES.embeddingJobs) return fail("Embedding jobs are disabled.");

  const limit = filters.limit ?? PAGE_SIZE;

  if (!shouldUseSupabase()) {
    let items = getMockJobs();
    if (filters.status && filters.status !== "all") {
      items = items.filter((j) => j.status === filters.status);
    }

    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    if (filters.cursor) {
      const decoded = decodeCursor(filters.cursor);
      if (decoded) {
        const idx = items.findIndex((j) => j.id === decoded.id);
        if (idx !== -1) items = items.slice(idx + 1);
      }
    }

    const page = items.slice(0, limit);
    const next_cursor =
      items.length > limit
        ? encodeCursor(page[page.length - 1].created_at, page[page.length - 1].id)
        : null;

    return mockOk({ items: page.map(toJobView), next_cursor });
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return fail("No active session.");

  try {
    let q = getDb()
      .from("embedding_jobs")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);

    if (filters.cursor) {
      const decoded = decodeCursor(filters.cursor);
      if (decoded) {
        q = q.or(
          `created_at.lt.${decoded.created_at},and(created_at.eq.${decoded.created_at},id.lt.${decoded.id})`,
        );
      }
    }

    const { data, error } = await q;
    if (error) return fail(error);

    const rows = (data ?? []) as EmbeddingJob[];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const next_cursor =
      hasMore && page.length > 0
        ? encodeCursor(page[page.length - 1].created_at, page[page.length - 1].id)
        : null;

    return ok({ items: page.map(toJobView), next_cursor });
  } catch (err) {
    return fail(err);
  }
}

export async function createEmbeddingJob(
  input: EmbeddingJobCreateInput,
): Promise<ServiceResult<EmbeddingJobView>> {
  const { role, organizationId } = getSessionContext();
  const mutateErr = assertAiMutate(role);
  if (mutateErr) return fail(mutateErr);
  if (!AI_FEATURES.embeddingJobs) return fail("Embedding jobs are disabled.");

  const actorId = await getActorProfileId();
  const orgId = organizationId ?? "mock-org";
  const now = new Date().toISOString();

  const row: EmbeddingJob = {
    id: crypto.randomUUID(),
    organization_id: orgId,
    source_type: input.source_type,
    source_id: input.source_id,
    status: "queued",
    error_message: null,
    queue_metadata: input.queue_metadata ?? {},
    started_at: null,
    completed_at: null,
    created_at: now,
  };

  if (!shouldUseSupabase()) {
    const jobs = getMockJobs();
    jobs.unshift(row);
    saveMockJobs(jobs);
    processMockEmbeddingJob(row.id);

    const completed = getMockJobs().find((j) => j.id === row.id) ?? row;

    await emitAiEvent(
      "ai.embedding_job.completed",
      EVENT_TYPES.AI_DOCUMENT_INDEXED,
      RESOURCE_TYPES.EMBEDDING_JOB,
      row.id,
      completed.source_id,
      "Document indexed",
      "Embedding job completed successfully.",
      aiRecipientIds(actorId),
      actorId,
      `/ai/jobs/${row.id}`,
    );

    await recordUsageMetric({
      event_type: "embedding_job",
      metadata: { job_id: row.id, source_type: row.source_type },
    });

    return mockOk(toJobView(completed));
  }

  if (!organizationId) return fail("No active session.");

  try {
    const { data, error } = await getDb()
      .from("embedding_jobs")
      .insert({
        organization_id: organizationId,
        source_type: row.source_type,
        source_id: row.source_id,
        status: "queued",
        queue_metadata: row.queue_metadata,
      })
      .select()
      .single();

    if (error) return fail(error);

    await recordUsageMetric({
      event_type: "embedding_job",
      metadata: { job_id: (data as EmbeddingJob).id },
    });

    return ok(toJobView(data as EmbeddingJob));
  } catch (err) {
    return fail(err);
  }
}

export async function retryEmbeddingJob(id: string): Promise<ServiceResult<EmbeddingJobView>> {
  const { role, organizationId } = getSessionContext();
  const mutateErr = assertAiMutate(role);
  if (mutateErr) return fail(mutateErr);
  if (!AI_FEATURES.embeddingJobs) return fail("Embedding jobs are disabled.");

  const actorId = await getActorProfileId();

  if (!shouldUseSupabase()) {
    const jobs = getMockJobs();
    const idx = jobs.findIndex((j) => j.id === id);
    if (idx === -1) return fail("Embedding job not found.");
    if (jobs[idx].status !== "failed") return fail("Only failed jobs can be retried.");

    jobs[idx] = {
      ...jobs[idx],
      status: "queued",
      error_message: null,
      started_at: null,
      completed_at: null,
    };
    saveMockJobs(jobs);
    processMockEmbeddingJob(id);

    const completed = getMockJobs().find((j) => j.id === id)!;

    await emitAiEvent(
      "ai.embedding_job.retried",
      EVENT_TYPES.AI_DOCUMENT_INDEXED,
      RESOURCE_TYPES.EMBEDDING_JOB,
      id,
      completed.source_id,
      "Embedding job retried",
      "Embedding job was retried and completed.",
      aiRecipientIds(actorId),
      actorId,
      `/ai/jobs/${id}`,
    );

    return mockOk(toJobView(completed));
  }

  if (!organizationId) return fail("No active session.");

  try {
    const { data, error } = await getDb()
      .from("embedding_jobs")
      .update({
        status: "queued",
        error_message: null,
        started_at: null,
        completed_at: null,
      })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .eq("status", "failed")
      .select()
      .single();

    if (error) return fail(error);
    return ok(toJobView(data as EmbeddingJob));
  } catch (err) {
    return fail(err);
  }
}

// ─── Chunk search & stats ─────────────────────────────────────────────────────

export async function searchChunks(
  input: ChunkSearchInput,
): Promise<ServiceResult<ChunkSearchResult>> {
  const { role, organizationId } = getSessionContext();
  const accessErr = assertAiAccess(role);
  if (accessErr) return fail(accessErr);
  if (!AI_FEATURES.chunkSearch) return fail("Chunk search is disabled.");

  const query = input.query.trim();
  if (!query) return fail("Search query is required.");

  if (!shouldUseSupabase()) {
    const chunkViews = getMockChunks()
      .filter((c) => !c.deleted_at)
      .map(toChunkView);
    const result = searchChunksLocal(chunkViews, {
      query,
      documentId: input.document_id,
      documentVersionId: input.document_version_id,
      projectId: input.project_id,
      limit: input.limit ?? 5,
      includeStale: input.include_stale,
    });

    await recordUsageMetric({
      event_type: "chunk_search",
      metadata: { query, result_count: result.chunks.length, strategy: result.strategy },
    });

    return mockOk(result);
  }

  if (!organizationId) return fail("No active session.");

  try {
    const { data, error } = await getDb()
      .from("document_chunks")
      .select("*")
      .eq("organization_id", organizationId)
      .is("deleted_at", null);

    if (error) return fail(error);

    const chunkViews = ((data ?? []) as DocumentChunk[]).map(toChunkView);
    const result = searchChunksLocal(chunkViews, {
      query,
      documentId: input.document_id,
      documentVersionId: input.document_version_id,
      projectId: input.project_id,
      limit: input.limit ?? 5,
      includeStale: input.include_stale,
    });

    await recordUsageMetric({
      event_type: "chunk_search",
      metadata: { query, result_count: result.chunks.length, strategy: result.strategy },
    });

    return ok(result);
  } catch (err) {
    return fail(err);
  }
}

export async function getAIOverviewStats(): Promise<ServiceResult<AIOverviewStats>> {
  const { role, organizationId } = getSessionContext();
  const accessErr = assertAiAccess(role);
  if (accessErr) return fail(accessErr);

  if (!shouldUseSupabase()) {
    const actorId = await getActorProfileId();
    const sessions = getMockSessions().filter((s) => !s.deleted_at && s.profile_id === actorId);
    const suggestions = getMockSuggestions().filter((s) => s.status === "pending");
    const jobs = getMockJobs().filter((j) => j.status === "failed");
    const chunks = getMockChunks().filter((c) => !c.deleted_at && c.embedding_status === "indexed");

    return mockOk({
      session_count: sessions.length,
      pending_suggestions: suggestions.length,
      failed_jobs: jobs.length,
      indexed_chunks: chunks.length,
      ai_configured: isAIConfigured(),
    });
  }

  if (!organizationId) return fail("No active session.");

  try {
    const actorId = await getActorProfileId();
    const [
      { count: sessionCount },
      { count: pendingCount },
      { count: failedCount },
      { count: chunkCount },
    ] = await Promise.all([
      getDb()
        .from("chat_sessions")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("profile_id", actorId ?? "")
        .is("deleted_at", null),
      getDb()
        .from("ai_suggestions")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "pending"),
      getDb()
        .from("embedding_jobs")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "failed"),
      getDb()
        .from("document_chunks")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("embedding_status", "indexed")
        .is("deleted_at", null),
    ]);

    return ok({
      session_count: sessionCount ?? 0,
      pending_suggestions: pendingCount ?? 0,
      failed_jobs: failedCount ?? 0,
      indexed_chunks: chunkCount ?? 0,
      ai_configured: isAIConfigured(),
    });
  } catch (err) {
    return fail(err);
  }
}

export async function markChunksStaleForDocument(
  documentId: string,
  exceptVersionId?: string,
): Promise<ServiceResult<{ updated: number }>> {
  if (!shouldUseSupabase()) {
    const updated = markChunksStaleMock(documentId, exceptVersionId);
    return mockOk({ updated });
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return fail("No active session.");

  try {
    let q = getDb()
      .from("document_chunks")
      .update({ embedding_status: "stale" })
      .eq("organization_id", organizationId)
      .eq("document_id", documentId)
      .is("deleted_at", null)
      .neq("embedding_status", "stale");

    if (exceptVersionId) {
      q = q.neq("document_version_id", exceptVersionId);
    }

    const { data, error } = await q.select("id");
    if (error) return fail(error);

    return ok({ updated: (data ?? []).length });
  } catch (err) {
    return fail(err);
  }
}
