import { z } from 'zod';

/** Hedera CAIP-2 network identifiers used by x402. */
export const HederaNetwork = z.enum(['hedera:testnet', 'hedera:mainnet']);
export type HederaNetwork = z.infer<typeof HederaNetwork>;

/** Hedera entity id (account, token, topic): shard.realm.num */
export const HederaEntityId = z.string().regex(/^\d+\.\d+\.\d+$/, 'expected shard.realm.num');

/** x402 asset id. "0.0.0" is native HBAR, otherwise an HTS token id. */
export const AssetId = HederaEntityId;

/**
 * Pricing model of a service. Amounts are atomic units of `asset`
 * (tinybars for HBAR, token decimals for HTS tokens) encoded as decimal strings
 * so that no floating point ever touches money.
 */
export const PricingModel = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('flat'),
    amount: z.string().regex(/^\d+$/),
  }),
  z.object({
    kind: z.literal('per-token'),
    /** charged once per request */
    base: z.string().regex(/^\d+$/),
    /** per 1,000 input tokens */
    inputPer1k: z.string().regex(/^\d+$/),
    /** per 1,000 output tokens (budgeted from max_tokens) */
    outputPer1k: z.string().regex(/^\d+$/),
  }),
  z.object({
    kind: z.literal('per-unit'),
    /** e.g. "query", "second", "kb" */
    unit: z.string().min(1),
    amountPerUnit: z.string().regex(/^\d+$/),
  }),
]);
export type PricingModel = z.infer<typeof PricingModel>;

/** One way to pay for an endpoint. */
export const PaymentOptionSpec = z.object({
  network: HederaNetwork,
  asset: AssetId,
  /** human label, e.g. HBAR, TOLL */
  symbol: z.string().min(1),
  decimals: z.number().int().min(0).max(18),
  pricing: PricingModel,
});
export type PaymentOptionSpec = z.infer<typeof PaymentOptionSpec>;

/** A single sellable endpoint. */
export const EndpointSpec = z.object({
  /** stable identifier inside the service, e.g. "infer" */
  id: z.string().min(1),
  method: z.enum(['GET', 'POST']),
  /** path relative to the service baseUrl */
  path: z.string().startsWith('/'),
  description: z.string().min(1),
  /** HCS-14 / OASF-style skill codes, kept small on purpose */
  skills: z.array(z.number().int().min(0)).default([]),
  accepts: z.array(PaymentOptionSpec).min(1),
});
export type EndpointSpec = z.infer<typeof EndpointSpec>;

/** What a seller publishes to the registry topic. */
export const ServiceListing = z.object({
  /** HCS-14 universal agent id, see identity.ts */
  uaid: z.string().startsWith('uaid:'),
  name: z.string().min(1),
  version: z.string().min(1),
  /** account that receives payments */
  payTo: HederaEntityId,
  baseUrl: z.string().url(),
  /** A2A-style quote endpoint, relative to baseUrl */
  quotePath: z.string().startsWith('/').default('/a2a/quote'),
  facilitator: z.string().url(),
  endpoints: z.array(EndpointSpec).min(1),
  /** HCS topic where the seller writes receipts */
  receiptsTopicId: HederaEntityId.optional(),
  /** ISO timestamp */
  publishedAt: z.string(),
});
export type ServiceListing = z.infer<typeof ServiceListing>;

/** Buyer -> seller: request for quote. */
export const QuoteRequest = z.object({
  /** buyer's uaid, informational */
  buyer: z.string().optional(),
  endpointId: z.string().min(1),
  /** estimate of the work, used by the seller's pricing model */
  estimate: z
    .object({
      inputTokens: z.number().int().min(0).optional(),
      maxOutputTokens: z.number().int().min(0).optional(),
      units: z.number().int().min(0).optional(),
    })
    .default({}),
  /** buyer's ceiling in atomic units of `asset`; seller may counter below it */
  maxAmount: z.string().regex(/^\d+$/).optional(),
  asset: AssetId.default('0.0.0'),
});
export type QuoteRequest = z.infer<typeof QuoteRequest>;

/** Seller -> buyer: a priced, time-limited offer. Signed by the seller. */
export const Quote = z.object({
  quoteId: z.string().min(8),
  seller: z.string().startsWith('uaid:'),
  endpointId: z.string().min(1),
  network: HederaNetwork,
  asset: AssetId,
  /** atomic units */
  amount: z.string().regex(/^\d+$/),
  /** unix seconds */
  expiresAt: z.number().int(),
  /** what the price covers, echoed back for auditability */
  basis: z.record(z.unknown()).default({}),
  /** hex ECDSA/ED25519 signature over the canonical quote body, by the seller account key */
  signature: z.string().min(1),
  /** hex DER public key that signed */
  signerPublicKey: z.string().min(1),
});
export type Quote = z.infer<typeof Quote>;

/** Written to the receipts topic after a settled payment. */
export const Receipt = z.object({
  v: z.literal(1),
  type: z.literal('receipt'),
  seller: z.string().startsWith('uaid:'),
  /** Hedera transaction id of the settlement, e.g. 0.0.123@1700000000.123456789 */
  transactionId: z.string().min(1),
  network: HederaNetwork,
  payer: HederaEntityId,
  payTo: HederaEntityId,
  asset: AssetId,
  amount: z.string().regex(/^\d+$/),
  /** endpoint path that was paid for */
  resource: z.string().min(1),
  quoteId: z.string().optional(),
  /** metering evidence, e.g. tokens used */
  usage: z.record(z.unknown()).default({}),
  /** sha256 hex of the response body so a buyer can prove what was delivered */
  responseHash: z.string().optional(),
  issuedAt: z.string(),
});
export type Receipt = z.infer<typeof Receipt>;

/** Envelope for every message on the registry topic. */
export const RegistryMessage = z.discriminatedUnion('type', [
  z.object({ v: z.literal(1), type: z.literal('listing'), listing: ServiceListing }),
  z.object({ v: z.literal(1), type: z.literal('delist'), uaid: z.string(), reason: z.string().optional() }),
]);
export type RegistryMessage = z.infer<typeof RegistryMessage>;

// ---- trust layer: audits, attestations, ratings -----------------------------

/** Outcome of an audit. */
export const Verdict = z.enum(['safe', 'dangerous']);
export type Verdict = z.infer<typeof Verdict>;

export const Severity = z.enum(['none', 'low', 'medium', 'high', 'critical']);
export type Severity = z.infer<typeof Severity>;

/** One observation made by an audit stage. */
export const AuditFinding = z.object({
  severity: Severity,
  title: z.string().min(1),
  detail: z.string().default(''),
});
export type AuditFinding = z.infer<typeof AuditFinding>;

/** Identity of an audit run. `subject` is the audited seller's uaid. */
const AuditRef = {
  auditId: z.string().min(8),
  subject: z.string().startsWith('uaid:'),
  /** sha256 of the audited listing content, see listingContentHash() */
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  /** the auditor agent */
  auditor: z.string().startsWith('uaid:'),
  /** account that pays for the audit topic messages; must equal the HCS payer */
  auditorAccount: HederaEntityId,
};

/** Written to the audit topic when an audit begins. */
export const AuditStarted = z.object({
  v: z.literal(1),
  type: z.literal('audit_started'),
  ...AuditRef,
  /** what is being inspected, for the replay view */
  target: z.object({ name: z.string(), baseUrl: z.string().url(), endpoints: z.array(z.string()) }),
  stages: z.array(z.string()).min(1),
  startedAt: z.string(),
});
export type AuditStarted = z.infer<typeof AuditStarted>;

/** Written to the audit topic once per completed stage. */
export const AuditStage = z.object({
  v: z.literal(1),
  type: z.literal('audit_stage'),
  ...AuditRef,
  stage: z.string().min(1),
  /** 1-based position and total, so a replay can show progress */
  index: z.number().int().min(1),
  total: z.number().int().min(1),
  summary: z.string(),
  findings: z.array(AuditFinding).default([]),
  /** LLM that produced the stage, or "deterministic" */
  model: z.string(),
  completedAt: z.string(),
});
export type AuditStage = z.infer<typeof AuditStage>;

/**
 * The verdict. Written last to the audit topic by the auditor account.
 * A buyer accepts it only when the HCS payer equals `auditorAccount`, the
 * subject matches the listing and `contentHash` matches the listing it holds.
 */
export const Attestation = z.object({
  v: z.literal(1),
  type: z.literal('attestation'),
  ...AuditRef,
  verdict: Verdict,
  /** 0 (do not use) to 100 (nothing found), derived from findings, see trustScoreFrom() */
  trustScore: z.number().int().min(0).max(100),
  /** highest severity across all stages */
  risk: Severity,
  summary: z.string(),
  /** what the service actually does, as observed */
  capabilities: z.array(z.string()).default([]),
  findings: z.array(AuditFinding).default([]),
  model: z.string(),
  issuedAt: z.string(),
});
export type Attestation = z.infer<typeof Attestation>;

/** Envelope for every message on the audit topic. */
export const AuditMessage = z.discriminatedUnion('type', [AuditStarted, AuditStage, Attestation]);
export type AuditMessage = z.infer<typeof AuditMessage>;

/**
 * A buyer's rating of a seller, written to the reputation topic. Proof of use
 * is the settlement transaction: readers only count a rating when the HCS
 * payer equals `raterAccount` and that account was debited in `transactionId`
 * in favour of the rated seller.
 */
export const Rating = z.object({
  v: z.literal(1),
  type: z.literal('rating'),
  subject: z.string().startsWith('uaid:'),
  /** seller account credited by the payment, so the check needs no registry read */
  subjectAccount: HederaEntityId,
  rater: z.string().startsWith('uaid:'),
  raterAccount: HederaEntityId,
  /** settlement the rater paid, SDK format 0.0.x@sec.nanos */
  transactionId: z.string().min(1),
  score: z.number().int().min(1).max(5),
  comment: z.string().max(280).optional(),
  issuedAt: z.string(),
});
export type Rating = z.infer<typeof Rating>;

export const ReputationMessage = z.discriminatedUnion('type', [Rating]);
export type ReputationMessage = z.infer<typeof ReputationMessage>;
