import type { Client } from '@hiero-ledger/sdk';
import type { TrustLedger } from '@agora402/registry';
import { runAudit, type AuditOptions } from './pipeline.js';
import type { AuditEvent, AuditRun } from './types.js';

export interface RecordOptions extends AuditOptions {
  ledger: TrustLedger;
  client: Client;
}

export interface RecordedAudit {
  run: AuditRun;
  topicId: string;
  /** HCS results in publish order: audit_started, one per stage, attestation */
  records: Array<{ what: 'audit_started' | 'audit_stage' | 'attestation'; stage?: string; transactionId: string; sequenceNumber: number }>;
  /** publications that failed; the run still completed */
  failures: Array<{ what: string; stage?: string; error: string }>;
}

/**
 * Run the audit and write it to the audit topic as it happens: the start
 * message, one message per stage, then the attestation. Stage publications
 * are queued so consensus latency never delays the next stage; the
 * attestation is awaited so the caller knows the verdict is on chain.
 */
export async function recordAudit(opts: RecordOptions): Promise<RecordedAudit> {
  const records: RecordedAudit['records'] = [];
  const failures: RecordedAudit['failures'] = [];
  let queue: Promise<void> = Promise.resolve();
  const emit = (e: AuditEvent) => opts.onEvent?.(e);

  const publish = (what: 'audit_started' | 'audit_stage' | 'attestation', message: Parameters<TrustLedger['publish']>[1], stage?: string) => {
    queue = queue
      .then(async () => {
        const r = await opts.ledger.publish(opts.client, message);
        records.push({ what, stage, ...r });
        emit({ type: 'recorded', what, stage, ...r });
      })
      .catch((err: unknown) => {
        const error = err instanceof Error ? err.message : String(err);
        failures.push({ what, stage, error });
        emit({ type: 'record_failed', what, stage, error });
      });
    return queue;
  };

  const run = await runAudit({
    ...opts,
    onEvent: (e) => {
      emit(e);
      if (e.type === 'started') void publish('audit_started', e.message);
      if (e.type === 'stage' && e.status === 'done') void publish('audit_stage', e.message, e.stage);
    },
  });
  await publish('attestation', run.attestation);
  return { run, topicId: opts.ledger.topicId, records, failures };
}
