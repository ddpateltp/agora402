import type { Attestation, AuditFinding, AuditStage, AuditStarted } from '@agora402/shared';

/** What one stage produced before it is wrapped into an HCS message. */
export interface StageResult {
  summary: string;
  findings: AuditFinding[];
  /** raw observations, kept off-chain but returned to the caller and shown in the UI */
  evidence: Record<string, unknown>;
  /** LLM that produced the stage, or "deterministic" */
  model: string;
}

export type AuditEvent =
  | { type: 'started'; message: AuditStarted }
  | { type: 'stage'; stage: string; index: number; total: number; status: 'running' }
  | { type: 'stage'; stage: string; index: number; total: number; status: 'done'; message: AuditStage; evidence: Record<string, unknown> }
  | { type: 'attestation'; message: Attestation }
  | { type: 'recorded'; what: 'audit_started' | 'audit_stage' | 'attestation'; stage?: string; transactionId: string; sequenceNumber: number }
  | { type: 'record_failed'; what: 'audit_started' | 'audit_stage' | 'attestation'; stage?: string; error: string };

export interface AuditRun {
  auditId: string;
  started: AuditStarted;
  stages: Array<{ message: AuditStage; evidence: Record<string, unknown> }>;
  attestation: Attestation;
}

/** A finding with a stable shape, built inline by the probes. */
export function finding(severity: AuditFinding['severity'], title: string, detail = ''): AuditFinding {
  return { severity, title, detail };
}
