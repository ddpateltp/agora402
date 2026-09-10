import { createHash, randomBytes } from 'node:crypto';
import type { Quote } from './types.js';

/** Fields covered by the seller signature. Everything except the signature itself. */
export type QuoteBody = Omit<Quote, 'signature' | 'signerPublicKey'>;

/** Stable byte representation of a quote for signing and verification. */
export function canonicalQuoteBytes(q: QuoteBody): Uint8Array {
  const canonical = {
    amount: q.amount,
    asset: q.asset,
    basis: sortKeysDeep(q.basis ?? {}),
    endpointId: q.endpointId,
    expiresAt: q.expiresAt,
    network: q.network,
    quoteId: q.quoteId,
    seller: q.seller,
  };
  return new TextEncoder().encode(JSON.stringify(canonical));
}

export function newQuoteId(): string {
  return 'q_' + randomBytes(12).toString('hex');
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export function sortKeysDeep<T>(value: T): T {
  if (Array.isArray(value)) return value.map(sortKeysDeep) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeysDeep((value as Record<string, unknown>)[k]);
    }
    return out as T;
  }
  return value;
}

export function isExpired(q: { expiresAt: number }, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  return q.expiresAt <= nowSeconds;
}
