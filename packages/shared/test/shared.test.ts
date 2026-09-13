import { describe, expect, it } from 'vitest';
import { listingContentHash, maxSeverity, trustScoreFrom, verdictFrom } from '../src/index.js';
import {
  base58Encode,
  canonicalIdentityJson,
  canonicalQuoteBytes,
  estimateChatInput,
  formatAmount,
  generateUaid,
  parseAmount,
  parseUaid,
  priceFor,
  Quote,
  ServiceListing,
} from '../src/index.js';

describe('HCS-14 identity', () => {
  const input = {
    registry: 'Agora402',
    name: 'agora-seller-1',
    version: '1.0.0',
    protocol: 'A2A',
    nativeId: 'hedera:testnet:0.0.12345',
    skills: [3, 1, 2],
  };

  it('canonical json normalises and sorts', () => {
    expect(canonicalIdentityJson(input)).toBe(
      '{"name":"agora-seller-1","nativeId":"hedera:testnet:0.0.12345","protocol":"a2a","registry":"agora402","skills":[1,2,3],"version":"1.0.0"}',
    );
  });

  it('is deterministic and independent of endpoint details', () => {
    const a = generateUaid(input);
    const b = generateUaid({ ...input, skills: [1, 2, 3], registry: 'agora402 ' });
    expect(a).toBe(b);
    expect(a.startsWith('uaid:aid:')).toBe(true);
    const parsed = parseUaid(a);
    expect(parsed.params).toMatchObject({ uid: '0', registry: 'agora402', proto: 'a2a', nativeId: 'hedera:testnet:0.0.12345' });
  });

  it('changes when an identity field changes', () => {
    expect(generateUaid(input)).not.toBe(generateUaid({ ...input, version: '1.0.1' }));
  });

  it('base58 encodes known vectors', () => {
    expect(base58Encode(new Uint8Array([0, 0, 1]))).toBe('112');
    expect(base58Encode(new TextEncoder().encode('hello'))).toBe('Cn8eVZg');
  });
});

describe('pricing', () => {
  it('flat', () => {
    expect(priceFor({ kind: 'flat', amount: '100000' })).toBe(100000n);
  });
  it('per-token rounds up per 1k and adds base', () => {
    const p = priceFor(
      { kind: 'per-token', base: '10000', inputPer1k: '5000', outputPer1k: '15000' },
      { inputTokens: 1500, maxOutputTokens: 100 },
    );
    // 10000 + ceil(1500*5000/1000)=7500 + ceil(100*15000/1000)=1500
    expect(p).toBe(19000n);
  });
  it('per-unit charges at least one unit', () => {
    expect(priceFor({ kind: 'per-unit', unit: 'query', amountPerUnit: '2500' })).toBe(2500n);
    expect(priceFor({ kind: 'per-unit', unit: 'query', amountPerUnit: '2500' }, { units: 4 })).toBe(10000n);
  });
  it('estimates chat input', () => {
    const e = estimateChatInput({ messages: [{ role: 'user', content: 'x'.repeat(400) }], max_tokens: 50 });
    expect(e.inputTokens).toBe(101);
    expect(e.maxOutputTokens).toBe(50);
  });
  it('formats and parses amounts without floats', () => {
    expect(formatAmount(12345678n, 8, 'HBAR')).toBe('0.12345678 HBAR');
    expect(formatAmount('100000000', 8, 'HBAR')).toBe('1 HBAR');
    expect(parseAmount('0.05', 8)).toBe(5000000n);
    expect(parseAmount('2', 6)).toBe(2000000n);
  });
});

describe('schemas', () => {
  it('validates a listing', () => {
    const listing = ServiceListing.parse({
      uaid: 'uaid:aid:abc;uid=0;registry=agora402;proto=a2a;nativeId=hedera:testnet:0.0.1',
      name: 'x',
      version: '1.0.0',
      payTo: '0.0.1',
      baseUrl: 'http://localhost:4402',
      facilitator: 'https://api.testnet.blocky402.com',
      endpoints: [
        {
          id: 'infer',
          method: 'POST',
          path: '/v1/infer',
          description: 'LLM',
          accepts: [
            { network: 'hedera:testnet', asset: '0.0.0', symbol: 'HBAR', decimals: 8, pricing: { kind: 'flat', amount: '1' } },
          ],
        },
      ],
      publishedAt: new Date().toISOString(),
    });
    expect(listing.quotePath).toBe('/a2a/quote');
  });

  it('quote bytes are stable regardless of key order', () => {
    const base = {
      quoteId: 'q_0123456789',
      seller: 'uaid:aid:x',
      endpointId: 'infer',
      network: 'hedera:testnet' as const,
      asset: '0.0.0',
      amount: '1000',
      expiresAt: 1,
      basis: { b: 1, a: { d: 2, c: 3 } },
    };
    const a = canonicalQuoteBytes(base);
    const b = canonicalQuoteBytes({ ...base, basis: { a: { c: 3, d: 2 }, b: 1 } });
    expect(Buffer.from(a).toString()).toBe(Buffer.from(b).toString());
    expect(() => Quote.parse({ ...base, signature: 'ab', signerPublicKey: 'cd' })).not.toThrow();
  });
});

describe('trust helpers', () => {
  const listing = {
    uaid: 'uaid:aid:abc;uid=0;registry=agora402;proto=a2a;nativeId=hedera:testnet:0.0.1001',
    name: 'seller',
    version: '1.0.0',
    payTo: '0.0.1001',
    baseUrl: 'http://localhost:4402',
    quotePath: '/a2a/quote',
    facilitator: 'https://api.testnet.blocky402.com',
    endpoints: [{ id: 'infer', method: 'POST' as const, path: '/v1/infer', description: 'llm', skills: [], accepts: [{ network: 'hedera:testnet' as const, asset: '0.0.0', symbol: 'HBAR', decimals: 8, pricing: { kind: 'flat' as const, amount: '100000' } }] }],
    publishedAt: '2026-09-10T00:00:00.000Z',
  };
  it('content hash ignores metadata but not prices or endpoints', () => {
    const h = listingContentHash(listing);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(listingContentHash({ ...listing, name: 'renamed', version: '2.0.0', publishedAt: 'later', receiptsTopicId: '0.0.9' })).toBe(h);
    expect(listingContentHash({ ...listing, baseUrl: 'http://localhost:4402/' })).toBe(h);
    const pricier = { ...listing, endpoints: [{ ...listing.endpoints[0], accepts: [{ ...listing.endpoints[0].accepts[0], pricing: { kind: 'flat' as const, amount: '200000' } }] }] };
    expect(listingContentHash(pricier)).not.toBe(h);
    expect(listingContentHash({ ...listing, payTo: '0.0.1002' })).not.toBe(h);
  });
  it('scores and verdicts are derived from findings deterministically', () => {
    expect(trustScoreFrom([])).toBe(100);
    expect(verdictFrom([])).toBe('safe');
    const findings = [
      { severity: 'low' as const, title: 'a', detail: '' },
      { severity: 'medium' as const, title: 'b', detail: '' },
    ];
    expect(trustScoreFrom(findings)).toBe(84);
    expect(verdictFrom(findings)).toBe('safe');
    expect(maxSeverity(findings)).toBe('medium');
    const bad = [...findings, { severity: 'critical' as const, title: 'c', detail: '' }];
    expect(trustScoreFrom(bad)).toBe(24);
    expect(verdictFrom(bad)).toBe('dangerous');
    expect(trustScoreFrom(Array(3).fill({ severity: 'critical', title: 'x', detail: '' }))).toBe(0);
  });
});
