import { reactive, ref } from 'vue';
import type { RailState } from '../components/StageRail.vue';
import { getAudits, getTrail, stream, timeOf } from './api';
import { AUDIT_STEPS, applyAuditEvent, applyBuyStage, resetRail } from './rails';
import { loadSellers, setSpend } from './session';
import type { Attestation, AuditResult, AuditStageMsg, StageEvent } from './types';

/**
 * Buying an audit: the buyer's payment rail plus the auditor's pipeline rail,
 * relayed live. `replay()` plays an existing audit back from the mirror node
 * with the same rail, for when the model is slow on camera.
 */
export function useAuditRun() {
  const running = ref(false);
  const payRail = reactive<RailState>({});
  const auditRail = reactive<RailState>({});
  const stageDetails = ref<AuditStageMsg[]>([]);
  const result = ref<AuditResult | null>(null);
  const attestation = ref<Attestation | null>(null);
  const topicId = ref<string | null>(null);
  const error = ref('');
  const log = ref<Array<{ at: string; text: string }>>([]);
  const replayed = ref(false);

  function reset() {
    result.value = null;
    attestation.value = null;
    error.value = '';
    log.value = [];
    stageDetails.value = [];
    replayed.value = false;
    resetRail(payRail);
    resetRail(auditRail);
  }

  async function run(subject: string, auditorUrl?: string): Promise<AuditResult | null> {
    running.value = true;
    reset();
    try {
      await stream('/api/audit', { subject, auditor: auditorUrl }, (line) => {
        if (line.type === 'stage') {
          const e = line as unknown as StageEvent;
          log.value.push({ at: timeOf(e.at), text: `${e.stage}  ${e.message}` });
          applyBuyStage(payRail, e);
        } else if (line.type === 'audit') {
          applyAuditEvent(auditRail, line);
          const l = line as { status?: string; message?: unknown; evidence?: unknown; stage?: string; what?: string; sequenceNumber?: number };
          if (l.status === 'done' && l.message) stageDetails.value.push({ ...(l.message as AuditStageMsg), evidence: l.evidence as Record<string, unknown> });
          if (typeof l.stage === 'string') log.value.push({ at: '', text: `auditor ${l.stage} ${l.status ?? ''}` });
          if (l.what) log.value.push({ at: '', text: `HCS ${l.what} seq ${l.sequenceNumber ?? ''}` });
        } else if (line.type === 'result') {
          result.value = line as unknown as AuditResult;
          setSpend(result.value.spent, result.value.remaining);
          if (result.value.audit) {
            attestation.value = result.value.audit.attestation;
            topicId.value = result.value.audit.topicId;
          }
          if (!result.value.ok) error.value = typeof result.value.error === 'object' && result.value.error ? String((result.value.error as { error?: string }).error ?? JSON.stringify(result.value.error)) : `auditor answered ${result.value.status}`;
        } else if (line.type === 'error') {
          error.value = String(line.message);
          setSpend(line.spent, line.remaining);
        }
      });
      setTimeout(() => void loadSellers(), 5000);
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      running.value = false;
    }
    return result.value;
  }

  /** Play the latest on-chain audit of `subject` back through the rail, one stage per beat. */
  async function replay(subject: string, beatMs = 1400): Promise<boolean> {
    running.value = true;
    reset();
    replayed.value = true;
    try {
      const audits = await getAudits();
      const hit = audits.attestations.find((a) => a.attestation.subject === subject);
      if (!hit) {
        error.value = 'No attestation for this seller on the audit topic yet. Run a live audit first.';
        return false;
      }
      topicId.value = audits.topic;
      const trail = (await getTrail(hit.attestation.auditId)).trail;
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      for (const step of AUDIT_STEPS) {
        auditRail[step.id] = { status: 'active', message: 'reading from the mirror node' };
        await sleep(beatMs);
        const entry = trail.find((e) => e.message.type === 'audit_stage' && e.message.stage === step.id);
        if (entry) {
          const m = entry.message as unknown as AuditStageMsg;
          auditRail[step.id] = { status: 'done', message: m.summary, at: `seq ${entry.sequenceNumber}` };
          stageDetails.value.push(m);
        } else auditRail[step.id] = { status: 'done', message: 'not on the topic' };
      }
      await sleep(beatMs / 2);
      attestation.value = hit.attestation;
      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      return false;
    } finally {
      running.value = false;
    }
  }

  return { running, payRail, auditRail, stageDetails, result, attestation, topicId, error, log, replayed, run, replay, reset };
}
