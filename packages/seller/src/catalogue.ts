import { generateUaid, hederaNativeId, type EndpointSpec, type PaymentOptionSpec, type ServiceListing } from '@agora402/shared';
import type { SellerConfig } from './config.js';

/**
 * Prices are in atomic units. HBAR has 8 decimals, so 100000 tinybars = 0.001 HBAR.
 * The TOLL token is created with 6 decimals by scripts/create-token.ts.
 */
export const HBAR_OPTION = (network: SellerConfig['caip2']): PaymentOptionSpec => ({
  network,
  asset: '0.0.0',
  symbol: 'HBAR',
  decimals: 8,
  pricing: { kind: 'flat', amount: '0' }, // overridden per endpoint below
});

export const TOLL_DECIMALS = 6;

/** Skills follow the HCS-14 / OASF numbering loosely: 0 text generation, 20 data retrieval. */
export const SKILL_TEXT_GENERATION = 0;
export const SKILL_DATA_RETRIEVAL = 20;

export function buildEndpoints(cfg: SellerConfig): EndpointSpec[] {
  const hbar = (pricing: PaymentOptionSpec['pricing']): PaymentOptionSpec => ({ ...HBAR_OPTION(cfg.caip2), pricing });
  const toll = (pricing: PaymentOptionSpec['pricing']): PaymentOptionSpec[] =>
    cfg.TOLL_TOKEN_ID ? [{ network: cfg.caip2, asset: cfg.TOLL_TOKEN_ID, symbol: 'TOLL', decimals: TOLL_DECIMALS, pricing }] : [];

  return [
    {
      id: 'infer',
      method: 'POST',
      path: '/v1/infer',
      description: 'LLM chat completion (OpenAI-compatible body). Metered: base fee + per 1k input tokens + per 1k budgeted output tokens.',
      skills: [SKILL_TEXT_GENERATION],
      accepts: [
        // 0.0005 HBAR base, 0.0002 HBAR per 1k input tokens, 0.0006 HBAR per 1k output tokens
        hbar({ kind: 'per-token', base: '50000', inputPer1k: '20000', outputPer1k: '60000' }),
        // TOLL: 0.005 base, 0.002 / 1k in, 0.006 / 1k out
        ...toll({ kind: 'per-token', base: '5000', inputPer1k: '2000', outputPer1k: '6000' }),
      ],
    },
    {
      id: 'hbar-rate',
      method: 'GET',
      path: '/v1/rates/hbar',
      description: 'Live HBAR/USD exchange rate from the Hedera network rate file, with consensus expiry. Priced per query.',
      skills: [SKILL_DATA_RETRIEVAL],
      accepts: [
        hbar({ kind: 'per-unit', unit: 'query', amountPerUnit: '10000' }), // 0.0001 HBAR
        ...toll({ kind: 'per-unit', unit: 'query', amountPerUnit: '1000' }),
      ],
    },
  ];
}

export function buildIdentity(cfg: SellerConfig) {
  const nativeId = hederaNativeId(cfg.HEDERA_NETWORK, cfg.SELLER_ACCOUNT_ID);
  const uaid = generateUaid({
    registry: 'agora402',
    name: cfg.SELLER_NAME,
    version: '1.0.0',
    protocol: 'a2a',
    nativeId,
    skills: [SKILL_TEXT_GENERATION, SKILL_DATA_RETRIEVAL],
    uid: cfg.SELLER_NAME,
    domain: safeHost(cfg.SELLER_PUBLIC_URL),
  });
  return { uaid, nativeId };
}

export function buildListing(cfg: SellerConfig): ServiceListing {
  const { uaid } = buildIdentity(cfg);
  return {
    uaid,
    name: cfg.SELLER_NAME,
    version: '1.0.0',
    payTo: cfg.SELLER_ACCOUNT_ID,
    baseUrl: cfg.SELLER_PUBLIC_URL.replace(/\/$/, ''),
    quotePath: '/a2a/quote',
    facilitator: cfg.FACILITATOR_URL,
    endpoints: buildEndpoints(cfg),
    receiptsTopicId: cfg.RECEIPTS_TOPIC_ID || undefined,
    publishedAt: new Date().toISOString(),
  };
}

function safeHost(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}
