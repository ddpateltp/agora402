import type { Client } from '@hiero-ledger/sdk';
import { Rating, ReputationMessage, mirrorNodeUrl } from '@agora402/shared';
import { submitJson } from './hedera.js';
import { getTransaction, readTopicMessages, type MirrorTransaction } from './mirror.js';
import type { ShortNetwork } from './hedera.js';

export interface ReputationOptions {
  network: ShortNetwork;
  topicId: string;
  mirrorUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface VerifiedRating {
  rating: Rating;
  consensusTimestamp: string;
  sequenceNumber: number;
  payerAccountId: string;
  /** HCS payer is the rater and the cited settlement paid the rated seller */
  verified: boolean;
  problems: string[];
}

export interface ReputationSummary {
  /** ratings that passed proof of use */
  count: number;
  /** 1 to 5, null when there are none */
  average: number | null;
  /** ratings dropped for a failed check, for transparency */
  rejected: number;
  latest: VerifiedRating[];
}

/**
 * Reputation topic: buyers rate sellers they have paid. Proof of use is the
 * settlement transaction on the mirror node; one settlement can back one
 * rating, so a buyer cannot repeat itself on a single payment.
 */
export class ReputationLedger {
  readonly network: ShortNetwork;
  readonly topicId: string;
  private readonly mirrorUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ReputationOptions) {
    this.network = opts.network;
    this.topicId = opts.topicId;
    this.mirrorUrl = opts.mirrorUrl ?? mirrorNodeUrl(opts.network);
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async publish(client: Client, rating: Rating) {
    return submitJson(client, this.topicId, Rating.parse(rating));
  }

  async list(): Promise<Array<{ rating: Rating; consensusTimestamp: string; sequenceNumber: number; payerAccountId: string }>> {
    const messages = await readTopicMessages<unknown>(this.mirrorUrl, this.topicId, { fetchImpl: this.fetchImpl });
    const out: Array<{ rating: Rating; consensusTimestamp: string; sequenceNumber: number; payerAccountId: string }> = [];
    for (const m of messages) {
      const parsed = ReputationMessage.safeParse(m.json);
      if (parsed.success) out.push({ rating: parsed.data, consensusTimestamp: m.consensusTimestamp, sequenceNumber: m.sequenceNumber, payerAccountId: m.payerAccountId });
    }
    return out;
  }

  /** Verify every rating and group by subject uaid. */
  async summaries(): Promise<Map<string, ReputationSummary>> {
    const entries = await this.list();
    const txCache = new Map<string, Promise<MirrorTransaction | null>>();
    const lookup = (id: string) => {
      let p = txCache.get(id);
      if (!p) {
        p = getTransaction(this.mirrorUrl, id, this.fetchImpl).catch(() => null);
        txCache.set(id, p);
      }
      return p;
    };
    const verified: VerifiedRating[] = [];
    const used = new Set<string>();
    for (const e of entries) {
      const problems: string[] = [];
      if (e.payerAccountId !== e.rating.raterAccount) problems.push(`written by ${e.payerAccountId}, rater is ${e.rating.raterAccount}`);
      const key = `${e.rating.raterAccount}:${e.rating.transactionId}`;
      if (used.has(key)) problems.push('settlement already used for a rating');
      const tx = await lookup(e.rating.transactionId);
      if (!tx) problems.push('settlement not found on mirror node');
      else if (!paidFor(tx, e.rating.raterAccount, e.rating.subjectAccount)) problems.push('settlement does not pay the rated seller from the rater account');
      if (problems.length === 0) used.add(key);
      verified.push({ rating: e.rating, consensusTimestamp: e.consensusTimestamp, sequenceNumber: e.sequenceNumber, payerAccountId: e.payerAccountId, verified: problems.length === 0, problems });
    }
    return summarise(verified);
  }
}

/** Pure: did `payer` pay `payTo` in this transaction, in HBAR or any token? */
export function paidFor(tx: MirrorTransaction, payer: string, payTo: string): boolean {
  if (tx.result !== 'SUCCESS') return false;
  const hbarDebit = tx.transfers.some((t) => t.account === payer && t.amount < 0);
  const hbarCredit = tx.transfers.some((t) => t.account === payTo && t.amount > 0);
  if (hbarDebit && hbarCredit) return true;
  const tt = tx.token_transfers ?? [];
  return tt.some((t) => t.account === payer && t.amount < 0) && tt.some((t) => t.account === payTo && t.amount > 0);
}

/** Pure: group verified ratings by subject. */
export function summarise(ratings: VerifiedRating[]): Map<string, ReputationSummary> {
  const out = new Map<string, ReputationSummary>();
  for (const r of ratings) {
    const s = out.get(r.rating.subject) ?? { count: 0, average: null, rejected: 0, latest: [] };
    if (r.verified) {
      s.count += 1;
      s.average = ((s.average ?? 0) * (s.count - 1) + r.rating.score) / s.count;
      s.latest.unshift(r);
      if (s.latest.length > 5) s.latest.pop();
    } else {
      s.rejected += 1;
    }
    out.set(r.rating.subject, s);
  }
  for (const s of out.values()) if (s.average !== null) s.average = Math.round(s.average * 10) / 10;
  return out;
}
