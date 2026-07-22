/**
 * Chunk search abstraction — Phase 15C
 *
 * Keyword search only in this phase. Semantic strategy reserved for future providers.
 */

import type { DocumentChunkView, ChunkSearchResult } from "@/types/ai-view";

export interface ChunkSearchOptions {
  query: string;
  documentId?: string;
  documentVersionId?: string;
  projectId?: string;
  limit?: number;
  includeStale?: boolean;
}

export interface ChunkSearchStrategy {
  readonly id: string;
  readonly semanticSearchAvailable: boolean;
  search(chunks: DocumentChunkView[], options: ChunkSearchOptions): ChunkSearchResult;
}

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase();
}

function scoreChunk(content: string, query: string): number {
  const lower = content.toLowerCase();
  const terms = query.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 0;
  let score = 0;
  for (const term of terms) {
    if (lower.includes(term)) score += 1;
  }
  return score;
}

export class KeywordSearchStrategy implements ChunkSearchStrategy {
  readonly id = "keyword";
  readonly semanticSearchAvailable = false;

  search(chunks: DocumentChunkView[], options: ChunkSearchOptions): ChunkSearchResult {
    const query = normalizeQuery(options.query);
    const limit = options.limit ?? 5;
    if (!query) {
      return { chunks: [], strategy: this.id, semanticSearchAvailable: false };
    }

    const pool = chunks.filter((c) => {
      if (c.deleted_at) return false;
      if (!options.includeStale && c.embedding_status === "stale") return false;
      if (options.documentId && c.document_id !== options.documentId) return false;
      if (options.documentVersionId && c.document_version_id !== options.documentVersionId)
        return false;
      return true;
    });

    const ranked = pool
      .map((chunk) => ({ chunk, score: scoreChunk(chunk.content, query) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.chunk.chunk_index - b.chunk.chunk_index)
      .slice(0, limit)
      .map((r) => r.chunk);

    return {
      chunks: ranked,
      strategy: this.id,
      semanticSearchAvailable: false,
    };
  }
}

export class SemanticSearchStrategy implements ChunkSearchStrategy {
  readonly id = "semantic";
  readonly semanticSearchAvailable = false;

  search(_chunks: DocumentChunkView[], _options: ChunkSearchOptions): ChunkSearchResult {
    return { chunks: [], strategy: this.id, semanticSearchAvailable: false };
  }
}

const keywordStrategy = new KeywordSearchStrategy();
const semanticStrategy = new SemanticSearchStrategy();

export function getActiveSearchStrategy(): ChunkSearchStrategy {
  if (semanticStrategy.semanticSearchAvailable) return semanticStrategy;
  return keywordStrategy;
}

export function searchChunksLocal(
  chunks: DocumentChunkView[],
  options: ChunkSearchOptions,
): ChunkSearchResult {
  return getActiveSearchStrategy().search(chunks, options);
}
