import type { Client } from '@hiero-ledger/sdk';
import { AuditMessage, Attestation, listingContentHash, mirrorNodeUrl, type ServiceListing, type Severity, type Verdict } from '@agora402/shared';
import { submitJson } from './hedera.js';
import { readTopicMessages, type DecodedTopicMessage } from './mirror.js';
import type { ShortNetwork } from './hedera.js';

export interface TrustOptions {
  network: ShortNetwork;
  topicId: string;
  mirrorUrl?: string;
  fetchImpl?: typeof fetch;
}

/** An attestation as read from the topic, with the checks a buyer relies on. */
export interface VerifiedAttestation {
  attestation: Attestation;
  consensusTimestamp: string;
  sequenceNumber: number;
  payerAccountId: string;
  /** false when the HCS payer is not the auditor account the message names */
  authentic: boolean;
}

/** What a listing carries once its attestation has been matched against it. */
export interface TrustSummary {
  verdict: Verdict;
  trustScore: number;
  risk: Severity;
  auditId: string;
  auditor: string;
  auditorAccount: string;
  contentHash: string;
  /** true when the attestation covers exactly the listing content the buyer holds */
  current: boolean;
  summary: string;
  capabilities: string[];
  issuedAt: string;
  consensusTimestamp: string;
  sequenceNumber: number;
}

export interface AuditTrailEntry {
  message: AuditMessage;
  consensusTimestamp: string;
  sequenceNumber: number;
  payerAccountId: string;
}

/**
 * The audit topic: auditors write one message per stage and an attestation
 * at the end. Reading needs no keys. An attestation only counts when the
 * account that paid for the HCS message is the auditor account it names, so
 * nobody can publish a verdict in another auditor's name.
 */
export class TrustLedger {
  readonly network: ShortNetwork;
  readonly topicId: string;
  private readonly mirrorUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: TrustOptions) {
    this.network = opts.network;
    this.topicId = opts.topicId;
    this.mirrorUrl = opts.mirrorUrl ?? mirrorNodeUrl(opts.network);
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async publish(client: Client, message: AuditMessage) {
    return submitJson(client, this.topicId, AuditMessage.parse(message));
  }

  async list(opts: { timestamp?: string } = {}): Promise<AuditTrailEntry[]> {
    const messages = await readTopicMessages<unknown>(this.mirrorUrl, this.topicId, { fetchImpl: this.fetchImpl, timestamp: opts.timestamp });
    return decodeTrail(messages);
  }

  /** Every message of one audit, in consensus order. */
  async trail(auditId: string): Promise<AuditTrailEntry[]> {
    return (await this.list()).filter((e) => e.message.auditId === auditId);
  }

  /** Latest authentic attestation per subject uaid. Spoofed attestations are dropped. */
  async attestations(): Promise<Map<string, VerifiedAttestation>> {
    return indexAttestations(await this.list());
  }
}

export function decodeTrail(messages: DecodedTopicMessage<unknown>[]): AuditTrailEntry[] {
  const out: AuditTrailEntry[] = [];
  for (const m of messages) {
    const parsed = AuditMessage.safeParse(m.json);
    if (parsed.success) out.push({ message: parsed.data, consensusTimestamp: m.consensusTimestamp, sequenceNumber: m.sequenceNumber, payerAccountId: m.payerAccountId });
  }
  return out;
}

/** Pure: latest authentic attestation per subject. Exposed for tests and for callers that already hold the trail. */
export function indexAttestations(trail: AuditTrailEntry[]): Map<string, VerifiedAttestation> {
  const bySubject = new Map<string, VerifiedAttestation>();
  for (const e of trail) {
    if (e.message.type !== 'attestation') continue;
    const authentic = e.payerAccountId === e.message.auditorAccount;
    if (!authentic) continue;
    bySubject.set(e.message.subject, { attestation: e.message, consensusTimestamp: e.consensusTimestamp, sequenceNumber: e.sequenceNumber, payerAccountId: e.payerAccountId, authentic });
  }
  return bySubject;
}

/** Match an attestation against the listing the buyer holds. Null when the subject was never attested. */
export function trustFor(listing: ServiceListing, attestations: Map<string, VerifiedAttestation>): TrustSummary | null {
  const hit = attestations.get(listing.uaid);
  if (!hit) return null;
  const a = hit.attestation;
  return {
    verdict: a.verdict,
    trustScore: a.trustScore,
    risk: a.risk,
    auditId: a.auditId,
    auditor: a.auditor,
    auditorAccount: a.auditorAccount,
    contentHash: a.contentHash,
    current: a.contentHash === listingContentHash(listing),
    summary: a.summary,
    capabilities: a.capabilities,
    issuedAt: a.issuedAt,
    consensusTimestamp: hit.consensusTimestamp,
    sequenceNumber: hit.sequenceNumber,
  };
}

/**
 * The number a buyer policy compares against. A stale attestation (the seller
 * changed its endpoints or prices since the audit) counts as unverified; a
 * dangerous verdict is 0 whatever the score says.
 */
export function effectiveTrust(trust: TrustSummary | null): number | null {
  if (!trust || !trust.current) return null;
  return trust.verdict === 'safe' ? trust.trustScore : 0;
}
