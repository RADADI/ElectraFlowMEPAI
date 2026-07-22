/**
 * AI feature flags — Phase 15C
 *
 * Central configuration for which AI capabilities are enabled in the UI.
 * Does not imply backend availability — check AIProvider.isConfigured() separately.
 */

export const AI_FEATURES = {
  chat: true,
  suggestions: true,
  embeddingJobs: true,
  chunkSearch: true,
  manualSuggestions: true,
  usageMetrics: true,
  attachmentDocuments: true,
  conversationContexts: true,
  /** When false, retrieval UI is hidden even if chunks exist. */
  showRetrievalPreview: false,
} as const;

export type AIFeatureKey = keyof typeof AI_FEATURES;

export function isAIFeatureEnabled(key: AIFeatureKey): boolean {
  return AI_FEATURES[key];
}
