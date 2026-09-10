import type { PricingModel } from './types.js';

/** Work estimate used to price a request before it runs. */
export interface WorkEstimate {
  inputTokens?: number;
  maxOutputTokens?: number;
  units?: number;
}

/**
 * Compute the price of a request in atomic units. All arithmetic is BigInt so
 * tinybars never pass through a float. Rounds up per 1k tokens.
 */
export function priceFor(model: PricingModel, estimate: WorkEstimate = {}): bigint {
  switch (model.kind) {
    case 'flat':
      return BigInt(model.amount);
    case 'per-token': {
      const input = BigInt(Math.max(0, estimate.inputTokens ?? 0));
      const output = BigInt(Math.max(0, estimate.maxOutputTokens ?? 0));
      const base = BigInt(model.base);
      const inCost = ceilDiv(input * BigInt(model.inputPer1k), 1000n);
      const outCost = ceilDiv(output * BigInt(model.outputPer1k), 1000n);
      return base + inCost + outCost;
    }
    case 'per-unit': {
      const units = BigInt(Math.max(1, estimate.units ?? 1));
      return units * BigInt(model.amountPerUnit);
    }
  }
}

export function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

/**
 * Cheap, deterministic token estimate (about 4 characters per token for
 * English). Sellers use the same function as buyers so quotes are reproducible.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/** Estimate the input side of an OpenAI-style chat completion body. */
export function estimateChatInput(body: unknown): { inputTokens: number; maxOutputTokens: number } {
  const b = (body ?? {}) as { messages?: Array<{ content?: unknown }>; prompt?: string; max_tokens?: number };
  let text = '';
  if (Array.isArray(b.messages)) {
    for (const m of b.messages) {
      if (typeof m?.content === 'string') text += m.content + '\n';
      else if (m?.content != null) text += JSON.stringify(m.content) + '\n';
    }
  } else if (typeof b.prompt === 'string') {
    text = b.prompt;
  }
  const maxOutputTokens = Number.isFinite(b.max_tokens) && (b.max_tokens as number) > 0 ? Math.floor(b.max_tokens as number) : 256;
  return { inputTokens: estimateTokens(text), maxOutputTokens };
}

/** Format atomic units as a human string, e.g. 12345678 tinybars -> "0.12345678 HBAR". */
export function formatAmount(amount: bigint | string, decimals: number, symbol: string): string {
  const a = BigInt(amount);
  const neg = a < 0n;
  const abs = neg ? -a : a;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole}${frac ? '.' + frac : ''} ${symbol}`;
}

/** Parse "0.05" with `decimals` into atomic units, without floats. */
export function parseAmount(human: string, decimals: number): bigint {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(human.trim());
  if (!m) throw new Error(`invalid amount: ${human}`);
  const whole = BigInt(m[1]);
  const fracStr = (m[2] ?? '').slice(0, decimals).padEnd(decimals, '0');
  return whole * 10n ** BigInt(decimals) + BigInt(fracStr || '0');
}

export const HBAR_DECIMALS = 8;
export const HBAR_ASSET = '0.0.0';
