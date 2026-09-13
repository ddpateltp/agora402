import { createLlmProvider as createShared, mockProvider, type LlmProvider } from '@agora402/shared';
import type { SellerConfig } from './config.js';

export { mockProvider };
export type { ChatMessage, ChatRequest, ChatResult, LlmProvider } from '@agora402/shared';

/** The seller's LLM, from its config. The provider itself lives in @agora402/shared so the audit pipeline can use the same one. */
export function createLlmProvider(cfg: SellerConfig, fetchImpl: typeof fetch = fetch): LlmProvider {
  return createShared(
    { provider: cfg.LLM_PROVIDER, groqApiKey: cfg.GROQ_API_KEY, groqModel: cfg.GROQ_MODEL, anthropicApiKey: cfg.ANTHROPIC_API_KEY, anthropicModel: cfg.ANTHROPIC_MODEL },
    fetchImpl,
  );
}
