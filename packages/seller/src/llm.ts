import type { SellerConfig } from './config.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  model?: string;
}

export interface ChatResult {
  model: string;
  content: string;
  usage: { inputTokens: number; outputTokens: number };
  provider: 'groq' | 'anthropic' | 'mock';
}

export interface LlmProvider {
  readonly name: ChatResult['provider'];
  chat(req: ChatRequest): Promise<ChatResult>;
}

/**
 * Provider abstraction so the paid endpoint is independent of the model
 * vendor. Groq (OpenAI-compatible) for development, Anthropic for the final
 * demo, mock for tests and offline runs.
 */
export function createLlmProvider(cfg: SellerConfig, fetchImpl: typeof fetch = fetch): LlmProvider {
  switch (cfg.LLM_PROVIDER) {
    case 'groq':
      return openAiCompatible('groq', 'https://api.groq.com/openai/v1/chat/completions', cfg.GROQ_API_KEY!, cfg.GROQ_MODEL, fetchImpl);
    case 'anthropic':
      return anthropic(cfg.ANTHROPIC_API_KEY!, cfg.ANTHROPIC_MODEL, fetchImpl);
    default:
      return mockProvider();
  }
}

function openAiCompatible(name: 'groq', url: string, apiKey: string, model: string, fetchImpl: typeof fetch): LlmProvider {
  return {
    name,
    async chat(req) {
      const chosen = req.model ?? model;
      // gpt-oss models reason before answering and the reasoning counts against
      // max_tokens. Keep reasoning short so the paid budget goes to the answer.
      const reasoning = /gpt-oss|qwen3|deepseek-r1/i.test(chosen) ? { reasoning_effort: 'low' } : {};
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: chosen,
          messages: req.messages,
          max_tokens: req.max_tokens ?? 256,
          temperature: req.temperature ?? 0.2,
          ...reasoning,
        }),
      });
      if (!res.ok) throw new Error(`${name} upstream ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const body = (await res.json()) as {
        model: string;
        choices: Array<{ message: { content: string | null }; finish_reason?: string }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const content = body.choices?.[0]?.message?.content ?? '';
      if (!content.trim()) {
        // Do not charge for an empty answer: the handler turns this into a 502, which cancels settlement.
        throw new Error(`${name} returned no answer (finish_reason ${body.choices?.[0]?.finish_reason ?? 'unknown'}, ${body.usage?.completion_tokens ?? 0} completion tokens used). Raise max_tokens.`);
      }
      return {
        provider: name,
        model: body.model,
        content,
        usage: { inputTokens: body.usage?.prompt_tokens ?? 0, outputTokens: body.usage?.completion_tokens ?? 0 },
      };
    },
  };
}

function anthropic(apiKey: string, model: string, fetchImpl: typeof fetch): LlmProvider {
  return {
    name: 'anthropic',
    async chat(req) {
      const system = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n') || undefined;
      const messages = req.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }));
      const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: req.model ?? model, max_tokens: req.max_tokens ?? 256, temperature: req.temperature ?? 0.2, system, messages }),
      });
      if (!res.ok) throw new Error(`anthropic upstream ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const body = (await res.json()) as { model: string; content: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
      const text = body.content.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
      if (!text.trim()) throw new Error('anthropic returned no text content');
      return {
        provider: 'anthropic',
        model: body.model,
        content: text,
        usage: { inputTokens: body.usage?.input_tokens ?? 0, outputTokens: body.usage?.output_tokens ?? 0 },
      };
    },
  };
}

/** Deterministic stand-in: echoes the last user message reversed. Usage is estimated. */
export function mockProvider(): LlmProvider {
  return {
    name: 'mock',
    async chat(req) {
      const last = [...req.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
      const content = `mock reply: ${last.split('').reverse().join('')}`.slice(0, (req.max_tokens ?? 256) * 4);
      return {
        provider: 'mock',
        model: 'mock-1',
        content,
        usage: { inputTokens: Math.ceil(req.messages.map((m) => m.content).join('\n').length / 4), outputTokens: Math.ceil(content.length / 4) },
      };
    },
  };
}
