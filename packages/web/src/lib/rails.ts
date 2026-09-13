import type { RailState, RailStep } from '../components/StageRail.vue';
import type { StageEvent } from './types';
import { timeOf } from './api';

/** The buyer's payment loop as five steps, fed by BuyerAgent stage events. */
export const BUY_STEPS: RailStep[] = [
  { id: 'discover', title: 'Discover', hint: 'Read the registry topic from the mirror node', events: ['discovering'], done: ['discovered', 'trust'] },
  { id: 'quote', title: 'Negotiate', hint: 'Ask for a signed quote, counter below list price', events: ['quoting'], done: ['quoted'] },
  { id: 'request', title: 'Request', hint: 'Call the endpoint, receive a 402 for exactly the quoted amount', events: ['requesting'], done: ['payment_required'] },
  { id: 'pay', title: 'Pay', hint: 'Sign one Hedera transfer, Blocky402 verifies and settles', events: ['paying', 'paid'], done: ['settled'] },
  { id: 'verify', title: 'Prove', hint: 'Look the settlement up on the mirror node', events: ['verifying'], done: ['verified'] },
];

/** The auditor's pipeline as four steps, fed by the relayed auditor events. */
export const AUDIT_STEPS: RailStep[] = [
  { id: 'manifest', title: 'Manifest', hint: 'Does the live seller match what it published?', events: ['manifest'], done: [] },
  { id: 'payment', title: 'Payment integrity', hint: 'Signed quotes, 402 amounts and the paid account', events: ['payment'], done: [] },
  { id: 'content', title: 'Description review', hint: 'Text aimed at the buying agent', events: ['content'], done: [] },
  { id: 'synthesis', title: 'Verdict', hint: 'Score and verdict from the findings, summary from the model', events: ['synthesis'], done: [] },
];

/** Fold one buyer stage event into the rail state. Returns false when the event is not part of the rail. */
export function applyBuyStage(state: RailState, e: StageEvent): boolean {
  if (e.stage === 'failed' || e.stage === 'quote_rejected') {
    const active = BUY_STEPS.find((s) => state[s.id]?.status === 'active') ?? (e.stage === 'quote_rejected' ? BUY_STEPS[1] : BUY_STEPS[3]);
    state[active.id] = { status: 'failed', message: e.message, at: timeOf(e.at) };
    return true;
  }
  const step = BUY_STEPS.find((s) => s.events.includes(e.stage) || s.done.includes(e.stage));
  if (!step) return false;
  const wasDone = state[step.id]?.status === 'done';
  state[step.id] = { status: step.done.includes(e.stage) || wasDone ? 'done' : 'active', message: e.message, at: timeOf(e.at) };
  return true;
}

/** Fold one relayed auditor event ({type:'audit', ...AuditEvent}) into the audit rail. */
export function applyAuditEvent(state: RailState, e: Record<string, unknown>): void {
  if (e.type !== 'stage' || typeof e.stage !== 'string') return;
  const msg = e.message as { summary?: string; findings?: unknown[]; completedAt?: string } | undefined;
  if (e.status === 'running') state[e.stage] = { status: 'active', message: 'running' };
  else if (e.status === 'done') state[e.stage] = { status: 'done', message: msg?.summary ?? 'done', at: msg?.completedAt ? timeOf(msg.completedAt) : undefined };
}

export function resetRail(state: RailState): void {
  for (const k of Object.keys(state)) delete state[k];
}
