import { mirrorNodeUrl, newAuditId, type Attestation, type AuditStage, type AuditStarted, type LlmProvider, type ServiceListing } from '@agora402/shared';
import { listingContentHash } from '@agora402/shared';
import { reviewContent } from './content.js';
import { join, probe } from './http.js';
import { probeManifest, probePayment } from './probes.js';
import { synthesise } from './synthesis.js';
import type { AuditEvent, AuditRun, StageResult } from './types.js';

export const STAGES = ['manifest', 'payment', 'content', 'synthesis'] as const;
export type StageName = (typeof STAGES)[number];

export interface AuditOptions {
  network: 'testnet' | 'mainnet';
  /** the listing to vouch for, as read from the registry (or a live manifest) */
  listing: ServiceListing;
  auditor: { uaid: string; accountId: string };
  llm?: LlmProvider | null;
  fetchImpl?: typeof fetch;
  mirrorUrl?: string;
  auditId?: string;
  onEvent?: (e: AuditEvent) => void;
  now?: () => Date;
}

/**
 * Run the four stages against a live seller and produce the attestation.
 * Nothing is written anywhere: see recordAudit() for the HCS side.
 */
export async function runAudit(opts: AuditOptions): Promise<AuditRun> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const mirrorUrl = opts.mirrorUrl ?? mirrorNodeUrl(opts.network);
  const now = opts.now ?? (() => new Date());
  const emit = (e: AuditEvent) => opts.onEvent?.(e);
  const auditId = opts.auditId ?? newAuditId();
  const listing = opts.listing;
  const ref = { auditId, subject: listing.uaid, contentHash: listingContentHash(listing), auditor: opts.auditor.uaid, auditorAccount: opts.auditor.accountId };

  const started: AuditStarted = {
    v: 1,
    type: 'audit_started',
    ...ref,
    target: { name: listing.name, baseUrl: listing.baseUrl, endpoints: listing.endpoints.map((e) => e.id) },
    stages: [...STAGES],
    startedAt: now().toISOString(),
  };
  emit({ type: 'started', message: started });

  const ctx = { fetchImpl, mirrorUrl, listing };
  const results: Array<{ stage: StageName; result: StageResult }> = [];
  const stages: AuditRun['stages'] = [];
  const total = STAGES.length;

  const run = async (index: number, stage: StageName, fn: () => Promise<StageResult>) => {
    emit({ type: 'stage', stage, index, total, status: 'running' });
    const result = await fn();
    results.push({ stage, result });
    const message: AuditStage = { v: 1, type: 'audit_stage', ...ref, stage, index, total, summary: result.summary, findings: result.findings, model: result.model, completedAt: now().toISOString() };
    stages.push({ message, evidence: result.evidence });
    emit({ type: 'stage', stage, index, total, status: 'done', message, evidence: result.evidence });
    return result;
  };

  await run(1, 'manifest', () => probeManifest(ctx));
  await run(2, 'payment', () => probePayment(ctx));
  const card = await probe<unknown>(fetchImpl, join(listing.baseUrl, '/.well-known/agent.json'));
  await run(3, 'content', () => reviewContent(listing, card.ok ? card.body : null, opts.llm ?? null));
  const synth = await synthesise(
    listing,
    results.map((r) => ({ stage: r.stage, summary: r.result.summary, findings: r.result.findings })),
    opts.llm ?? null,
  );
  await run(4, 'synthesis', async () => ({ summary: synth.summary, findings: [], evidence: synth.evidence, model: synth.model }));

  const attestation: Attestation = {
    v: 1,
    type: 'attestation',
    ...ref,
    verdict: synth.verdict,
    trustScore: synth.trustScore,
    risk: synth.risk,
    summary: synth.summary,
    capabilities: synth.capabilities,
    findings: results.flatMap((r) => r.result.findings),
    model: synth.model,
    issuedAt: now().toISOString(),
  };
  emit({ type: 'attestation', message: attestation });
  return { auditId, started, stages, attestation };
}
