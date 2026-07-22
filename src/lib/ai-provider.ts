/**
 * Plugin-based AI provider architecture — Phase 15C
 *
 * No API keys in the browser. Default provider is always honest about configuration.
 */

import type { ChatCitation } from "@/types/ai-view";

export interface GenerateAnswerInput {
  question: string;
  contextChunks?: { content: string; chunkId: string; documentTitle?: string | null }[];
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface GenerateAnswerResult {
  configured: boolean;
  message: string;
  citations: ChatCitation[];
  providerId: string;
  model?: string | null;
}

export interface EmbedResult {
  configured: boolean;
  vectors: number[][] | null;
  providerId: string;
  message?: string;
}

export interface SummarizeResult {
  configured: boolean;
  summary: string;
  providerId: string;
}

export interface AIProvider {
  readonly id: string;
  readonly displayName: string;
  isConfigured(): boolean;
  generateAnswer(input: GenerateAnswerInput): Promise<GenerateAnswerResult>;
  embed(texts: string[]): Promise<EmbedResult>;
  summarize(text: string): Promise<SummarizeResult>;
}

export const AI_NOT_CONFIGURED_MESSAGE = "AI backend is not configured.";

class NotConfiguredProvider implements AIProvider {
  readonly id = "not_configured";
  readonly displayName = "Not Configured";

  isConfigured(): boolean {
    return false;
  }

  async generateAnswer(_input: GenerateAnswerInput): Promise<GenerateAnswerResult> {
    return {
      configured: false,
      message: AI_NOT_CONFIGURED_MESSAGE,
      citations: [],
      providerId: this.id,
      model: null,
    };
  }

  async embed(_texts: string[]): Promise<EmbedResult> {
    return {
      configured: false,
      vectors: null,
      providerId: this.id,
      message: AI_NOT_CONFIGURED_MESSAGE,
    };
  }

  async summarize(_text: string): Promise<SummarizeResult> {
    return {
      configured: false,
      summary: AI_NOT_CONFIGURED_MESSAGE,
      providerId: this.id,
    };
  }
}

/** Future server-side providers register here — never with browser-exposed keys. */
class AIProviderRegistry {
  private providers = new Map<string, AIProvider>();
  private activeId = "not_configured";

  constructor() {
    const fallback = new NotConfiguredProvider();
    this.providers.set(fallback.id, fallback);
  }

  register(provider: AIProvider, options?: { makeActive?: boolean }) {
    this.providers.set(provider.id, provider);
    if (options?.makeActive && provider.isConfigured()) {
      this.activeId = provider.id;
    }
  }

  get(id: string): AIProvider | undefined {
    return this.providers.get(id);
  }

  getActive(): AIProvider {
    const active = this.providers.get(this.activeId);
    if (active?.isConfigured()) return active;
    return this.providers.get("not_configured") ?? new NotConfiguredProvider();
  }

  setActive(id: string): void {
    if (this.providers.has(id)) this.activeId = id;
  }

  list(): AIProvider[] {
    return [...this.providers.values()];
  }

  isAnyConfigured(): boolean {
    return this.list().some((p) => p.id !== "not_configured" && p.isConfigured());
  }
}

export const aiProviderRegistry = new AIProviderRegistry();

export function getAIProvider(): AIProvider {
  return aiProviderRegistry.getActive();
}

export function isAIConfigured(): boolean {
  return aiProviderRegistry.isAnyConfigured();
}
