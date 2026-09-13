/** Shapes returned by the dashboard API (packages/buyer/src/dashboard.ts). Kept in sync by hand; the API is ours. */
import type { PricingModel } from './money';

export interface PaymentOption {
  network: string;
  asset: string;
  symbol: string;
  decimals: number;
  pricing: PricingModel;
}
export interface Endpoint {
  id: string;
  method: 'GET' | 'POST';
  path: string;
  description: string;
  skills: number[];
  accepts: PaymentOption[];
}
export interface Finding {
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  title: string;
  detail: string;
}
export interface TrustSummary {
  verdict: 'safe' | 'dangerous';
  trustScore: number;
  risk: Finding['severity'];
  auditId: string;
  auditor: string;
  auditorAccount: string;
  contentHash: string;
  current: boolean;
  summary: string;
  capabilities: string[];
  issuedAt: string;
  consensusTimestamp: string;
  sequenceNumber: number;
}
export interface Rating {
  subject: string;
  subjectAccount: string;
  rater: string;
  raterAccount: string;
  transactionId: string;
  score: number;
  comment?: string;
  issuedAt: string;
}
export interface ReputationSummary {
  count: number;
  average: number | null;
  rejected: number;
  latest: Array<{ rating: Rating; consensusTimestamp: string; verified: boolean }>;
}
export interface Listing {
  uaid: string;
  name: string;
  version: string;
  payTo: string;
  baseUrl: string;
  quotePath: string;
  facilitator: string;
  endpoints: Endpoint[];
  receiptsTopicId?: string;
  publishedAt: string;
  trust: TrustSummary | null;
  reputation: ReputationSummary | null;
  health?: { status: string; llm?: string; role?: string; receiptsToHcs?: boolean; auditsToHcs?: boolean } | null;
}
export interface Config {
  network: 'testnet' | 'mainnet';
  buyer: string;
  buyerUrl: string;
  buyerUaid: string | null;
  registryTopic: string | null;
  registryUrl: string | null;
  receiptsTopic: string | null;
  receiptsUrl: string | null;
  auditTopic: string | null;
  auditUrl: string | null;
  reputationTopic: string | null;
  reputationUrl: string | null;
  minTrust: number | null;
  sellerUrl: string | null;
  spent: string;
  remaining: string | null;
}
export interface StageEvent {
  type: 'stage';
  stage: string;
  message: string;
  at: string;
  data?: Record<string, unknown>;
}
export interface RunResult {
  type: 'result';
  ok: boolean;
  status: number;
  task: string;
  answer: string | null;
  raw: unknown;
  model: string | null;
  usage: Record<string, number> | null;
  seller: string;
  sellerUaid: string;
  payTo: string;
  facilitator: string;
  resource: string;
  endpointId: string;
  asset: string;
  symbol: string;
  decimals: number;
  listPrice: string;
  quote: { quoteId: string; amount: string; expiresAt: number; countered: boolean } | null;
  paid: string | null;
  transaction: string | null;
  hashscanUrl: string | null;
  onChain: { result: string; consensus: string; fee: number; transfers: Array<{ account: string; amount: number }> } | null;
  trust: TrustSummary | null;
  spent: string;
  remaining: string;
  elapsedMs: number;
}
export interface Attestation {
  auditId: string;
  subject: string;
  contentHash: string;
  auditor: string;
  auditorAccount: string;
  verdict: 'safe' | 'dangerous';
  trustScore: number;
  risk: Finding['severity'];
  summary: string;
  capabilities: string[];
  findings: Finding[];
  model: string;
  issuedAt: string;
}
export interface AuditStageMsg {
  type: 'audit_stage';
  auditId: string;
  stage: string;
  index: number;
  total: number;
  summary: string;
  findings: Finding[];
  model: string;
  completedAt: string;
  evidence?: Record<string, unknown>;
}
export interface AuditPurchase {
  auditId: string;
  subject: { uaid: string; name: string; payTo: string };
  attestation: Attestation;
  stages: AuditStageMsg[];
  topicId: string | null;
  topicUrl: string | null;
  records: Array<{ what: string; stage?: string; transactionId: string; sequenceNumber: number }>;
  recorded: boolean;
}
export interface AuditResult {
  type: 'result';
  ok: boolean;
  status: number;
  auditId: string;
  auditor: { name: string; uaid: string; payTo: string; baseUrl: string };
  paid: string | null;
  asset: string;
  symbol: string;
  decimals: number;
  transaction: string | null;
  hashscanUrl: string | null;
  audit: AuditPurchase | null;
  error: unknown;
  spent: string;
  remaining: string;
  elapsedMs: number;
}
export interface VerifiedReceipt {
  receipt: { transactionId: string; payer: string; payTo: string; asset: string; amount: string; resource: string; quoteId?: string; usage: Record<string, unknown>; issuedAt: string };
  consensusTimestamp: string;
  sequenceNumber: number;
  matchesChain: boolean;
  problems: string[];
}
export interface TrailEntry {
  message: Record<string, unknown> & { type: string; auditId?: string; stage?: string };
  consensusTimestamp: string;
  sequenceNumber: number;
  payerAccountId: string;
}
