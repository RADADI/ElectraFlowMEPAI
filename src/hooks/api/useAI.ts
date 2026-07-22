/**
 * AI Copilot React Query hooks — Phase 15C
 */

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import {
  listChatSessions,
  getChatSession,
  createChatSession,
  renameChatSession,
  deleteChatSession,
  listMessages,
  sendMessage,
  listSuggestions,
  createSuggestion,
  acceptSuggestion,
  rejectSuggestion,
  dismissSuggestion,
  listEmbeddingJobs,
  createEmbeddingJob,
  retryEmbeddingJob,
  searchChunks,
  getAIOverviewStats,
} from "@/services/ai.service";
import type {
  ChatSessionCreateInput,
  ChatSessionFilterInput,
  MessageFilterInput,
  AISuggestionFilterInput,
  AISuggestionCreateInput,
  EmbeddingJobFilterInput,
  EmbeddingJobCreateInput,
  ChunkSearchInput,
} from "@/types/ai-view";

export const AI_KEYS = {
  all: ["ai"] as const,
  overview: ["ai", "overview"] as const,
  sessions: ["ai", "sessions"] as const,
  sessionList: (filters?: ChatSessionFilterInput) => ["ai", "sessions", "list", filters] as const,
  sessionDetail: (id: string) => ["ai", "sessions", id] as const,
  messages: (sessionId: string, filters?: MessageFilterInput) =>
    ["ai", "sessions", sessionId, "messages", filters] as const,
  suggestions: ["ai", "suggestions"] as const,
  suggestionList: (filters?: AISuggestionFilterInput) =>
    ["ai", "suggestions", "list", filters] as const,
  jobs: ["ai", "jobs"] as const,
  jobList: (filters?: EmbeddingJobFilterInput) => ["ai", "jobs", "list", filters] as const,
  chunkSearch: (input?: ChunkSearchInput) => ["ai", "chunk-search", input] as const,
};

function invalidateSessions(qc: ReturnType<typeof useQueryClient>, id?: string) {
  qc.invalidateQueries({ queryKey: AI_KEYS.sessions });
  qc.invalidateQueries({ queryKey: AI_KEYS.overview });
  if (id) {
    qc.invalidateQueries({ queryKey: AI_KEYS.sessionDetail(id) });
    qc.invalidateQueries({ queryKey: AI_KEYS.messages(id) });
  }
}

function invalidateSuggestions(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: AI_KEYS.suggestions });
  qc.invalidateQueries({ queryKey: AI_KEYS.overview });
}

function invalidateJobs(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: AI_KEYS.jobs });
  qc.invalidateQueries({ queryKey: AI_KEYS.overview });
}

// ─── Overview ─────────────────────────────────────────────────────────────────

export function useAIOverviewStats() {
  return useQuery({
    queryKey: AI_KEYS.overview,
    queryFn: () => getAIOverviewStats(),
    select: (r) => r.data,
    staleTime: 30_000,
  });
}

// ─── Chat sessions ────────────────────────────────────────────────────────────

export function useChatSessions(filters?: ChatSessionFilterInput) {
  return useInfiniteQuery({
    queryKey: AI_KEYS.sessionList(filters),
    queryFn: ({ pageParam }) =>
      listChatSessions({ ...filters, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.data?.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}

export function useChatSession(id: string) {
  return useQuery({
    queryKey: AI_KEYS.sessionDetail(id),
    queryFn: () => getChatSession(id),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useCreateChatSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ChatSessionCreateInput) => createChatSession(input),
    onSuccess: (res) => invalidateSessions(qc, res.data?.id),
  });
}

export function useRenameChatSession(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => renameChatSession(id, title),
    onSuccess: () => invalidateSessions(qc, id),
  });
}

export function useDeleteChatSession(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => deleteChatSession(id),
    onSuccess: () => invalidateSessions(qc, id),
  });
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export function useMessages(sessionId: string, filters?: MessageFilterInput) {
  return useInfiniteQuery({
    queryKey: AI_KEYS.messages(sessionId, filters),
    queryFn: ({ pageParam }) =>
      listMessages(sessionId, { ...filters, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.data?.next_cursor ?? undefined,
    enabled: !!sessionId,
    staleTime: 10_000,
  });
}

export function useSendMessage(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => sendMessage(sessionId, content),
    onSuccess: () => invalidateSessions(qc, sessionId),
  });
}

// ─── Suggestions ──────────────────────────────────────────────────────────────

export function useAISuggestions(filters?: AISuggestionFilterInput) {
  return useInfiniteQuery({
    queryKey: AI_KEYS.suggestionList(filters),
    queryFn: ({ pageParam }) =>
      listSuggestions({ ...filters, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.data?.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}

export function useCreateSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AISuggestionCreateInput) => createSuggestion(input),
    onSuccess: () => invalidateSuggestions(qc),
  });
}

export function useAcceptSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => acceptSuggestion(id),
    onSuccess: () => invalidateSuggestions(qc),
  });
}

export function useRejectSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rejectSuggestion(id),
    onSuccess: () => invalidateSuggestions(qc),
  });
}

export function useDismissSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dismissSuggestion(id),
    onSuccess: () => invalidateSuggestions(qc),
  });
}

// ─── Embedding jobs ───────────────────────────────────────────────────────────

export function useEmbeddingJobs(filters?: EmbeddingJobFilterInput) {
  return useInfiniteQuery({
    queryKey: AI_KEYS.jobList(filters),
    queryFn: ({ pageParam }) =>
      listEmbeddingJobs({ ...filters, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.data?.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}

export function useCreateEmbeddingJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EmbeddingJobCreateInput) => createEmbeddingJob(input),
    onSuccess: () => invalidateJobs(qc),
  });
}

export function useRetryEmbeddingJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => retryEmbeddingJob(id),
    onSuccess: () => invalidateJobs(qc),
  });
}

// ─── Chunk search ─────────────────────────────────────────────────────────────

export function useChunkSearch(input: ChunkSearchInput, enabled = true) {
  return useQuery({
    queryKey: AI_KEYS.chunkSearch(input),
    queryFn: () => searchChunks(input),
    select: (r) => r.data,
    enabled: enabled && input.query.trim().length > 1,
    staleTime: 60_000,
  });
}
