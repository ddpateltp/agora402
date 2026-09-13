import type { Client } from '@hiero-ledger/sdk';
import type { Request, Response } from 'express';
import { recordAudit, runAudit, type AuditEvent, type AuditRun } from '@agora402/audit';
import type { Registry, TrustLedger } from '@agora402/registry';
import { ServiceListing, hashscanTopic, type LlmProvider } from '@agora402/shared';

export interface AuditorDeps {
  network: 'testnet' | 'mainnet';
  auditor: { uaid: string; accountId: string };
  llm: LlmProvider;
  fetchImpl: typeof fetch;
  /** registry to resolve a subject uaid; without it callers must pass sellerUrl */
  registry?: Registry;
  /** with both set, trail and attestation are written to HCS; otherwise the audit is a dry run */
  ledger?: TrustLedger;
  client?: Client;
  log?: (msg: string) => void;
}

interface Tracked {
  events: AuditEvent[];
  done: boolean;
  listeners: Set<(e: AuditEvent | { type: 'end' }) => void>;
  startedAt: number;
}

const AUDIT_ID = /^a_[0-9a-f]{16}$/;

/**
 * The auditor side of the marketplace: a paid audit run and a free progress
 * stream. Buyers pre-generate the auditId so they can follow the stream while
 * the paid request is still open.
 */
export class Auditor {
  private readonly runs = new Map<string, Tracked>();

  constructor(private readonly deps: AuditorDeps) {}

  get recordsToHcs(): boolean {
    return Boolean(this.deps.ledger && this.deps.client);
  }

  /** Paid handler for POST /v1/audit. A 4xx or 5xx here cancels the x402 settlement, so a failed audit is never charged. */
  async handleAudit(req: Request, res: Response): Promise<void> {
    const body = (req.body ?? {}) as { subject?: unknown; sellerUrl?: unknown; auditId?: unknown };
    const auditId = typeof body.auditId === 'string' ? body.auditId : undefined;
    if (auditId && (!AUDIT_ID.test(auditId) || this.runs.has(auditId))) {
      res.status(400).json({ error: 'auditId must be fresh and match a_<16 hex>' });
      return;
    }
    let listing: ServiceListing;
    try {
      listing = await this.resolve(body);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      return;
    }
    if (listing.uaid === this.deps.auditor.uaid || listing.payTo === this.deps.auditor.accountId) {
      res.status(400).json({ error: 'an auditor cannot attest itself' });
      return;
    }
    const tracked: Tracked = { events: [], done: false, listeners: new Set(), startedAt: Date.now() };
    if (auditId) this.runs.set(auditId, tracked);
    const onEvent = (e: AuditEvent) => {
      tracked.events.push(e);
      tracked.listeners.forEach((l) => l(e));
    };
    const finish = () => {
      tracked.done = true;
      tracked.listeners.forEach((l) => l({ type: 'end' }));
      this.sweep();
    };
    try {
      const common = { network: this.deps.network, listing, auditor: this.deps.auditor, llm: this.deps.llm, fetchImpl: this.deps.fetchImpl, auditId, onEvent };
      let run: AuditRun;
      let records: unknown[] = [];
      if (this.deps.ledger && this.deps.client) {
        const rec = await recordAudit({ ...common, ledger: this.deps.ledger, client: this.deps.client });
        run = rec.run;
        records = rec.records;
        if (rec.failures.length) this.deps.log?.(`audit ${run.auditId}: ${rec.failures.length} HCS publication(s) failed`);
      } else {
        run = await runAudit(common);
      }
      if (!auditId) this.runs.set(run.auditId, tracked);
      finish();
      const usage = { auditId: run.auditId, subject: listing.uaid, verdict: run.attestation.verdict, trustScore: run.attestation.trustScore, stages: run.stages.length };
      res.setHeader('x-agora-usage', JSON.stringify(usage));
      res.json({
        auditId: run.auditId,
        subject: { uaid: listing.uaid, name: listing.name, payTo: listing.payTo },
        attestation: run.attestation,
        stages: run.stages.map((s) => ({ ...s.message, evidence: s.evidence })),
        topicId: this.deps.ledger?.topicId ?? null,
        topicUrl: this.deps.ledger ? hashscanTopic(this.deps.network, this.deps.ledger.topicId) : null,
        records,
        recorded: this.recordsToHcs,
      });
      this.deps.log?.(`audit ${run.auditId} of ${listing.name}: ${run.attestation.verdict} ${run.attestation.trustScore}/100`);
    } catch (err) {
      finish();
      this.deps.log?.(`audit failed: ${err instanceof Error ? err.message : String(err)}`);
      res.status(502).json({ error: 'audit could not be completed', detail: err instanceof Error ? err.message : String(err) });
    }
  }

  /** Free NDJSON stream of one audit's events: everything so far, then live until the run ends. */
  handleEvents(req: Request, res: Response): void {
    const auditId = String(req.params.auditId ?? '');
    if (!AUDIT_ID.test(auditId)) {
      res.status(400).json({ error: 'bad auditId' });
      return;
    }
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const write = (e: unknown) => res.write(JSON.stringify(e) + '\n');
    const started = Date.now();
    // The paid request may still be in flight when the buyer connects: wait for the run to appear.
    const attach = () => {
      const tracked = this.runs.get(auditId);
      if (!tracked) {
        if (Date.now() - started > 60_000) {
          write({ type: 'end', reason: 'unknown audit' });
          res.end();
          return;
        }
        setTimeout(attach, 200);
        return;
      }
      tracked.events.forEach(write);
      if (tracked.done) {
        write({ type: 'end' });
        res.end();
        return;
      }
      const listener = (e: AuditEvent | { type: 'end' }) => {
        write(e);
        if (e.type === 'end') res.end();
      };
      tracked.listeners.add(listener);
      req.on('close', () => tracked.listeners.delete(listener));
    };
    attach();
  }

  private async resolve(body: { subject?: unknown; sellerUrl?: unknown }): Promise<ServiceListing> {
    if (typeof body.sellerUrl === 'string' && body.sellerUrl) {
      const res = await this.deps.fetchImpl(`${body.sellerUrl.replace(/\/$/, '')}/.well-known/agora402.json`, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error(`seller manifest ${res.status} at ${body.sellerUrl}`);
      return ServiceListing.parse(await res.json());
    }
    if (typeof body.subject === 'string' && body.subject) {
      if (!this.deps.registry) throw new Error('subject lookup needs REGISTRY_TOPIC_ID on the auditor; pass sellerUrl instead');
      const hit = (await this.deps.registry.listServices()).find((l) => l.uaid === body.subject || l.name === body.subject);
      if (!hit) throw new Error(`no registry listing for ${body.subject}`);
      return hit;
    }
    throw new Error('subject (uaid) or sellerUrl required');
  }

  private sweep(): void {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [id, t] of this.runs) if (t.done && t.startedAt < cutoff) this.runs.delete(id);
  }
}
