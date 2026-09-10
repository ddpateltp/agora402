import type { Client } from '@hiero-ledger/sdk';
import { Receipt, mirrorNodeUrl } from '@agora402/shared';
import { submitJson } from './hedera.js';
import { getTransaction, readTopicMessages, toMirrorTxId, type MirrorTransaction } from './mirror.js';
import type { ShortNetwork } from './hedera.js';

export interface ReceiptsOptions {
  network: ShortNetwork;
  topicId: string;
  mirrorUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface VerifiedReceipt {
  receipt: Receipt;
  consensusTimestamp: string;
  sequenceNumber: number;
  /** the settlement transaction as seen by the mirror node, null if not (yet) found */
  transaction: MirrorTransaction | null;
  /** true when the on-chain transfer matches payer, payTo, asset and amount in the receipt */
  matchesChain: boolean;
  problems: string[];
}

/**
 * Receipts topic: the seller writes one message per settled payment. Anyone
 * can recompute the bill from the receipt and the transaction on the mirror node.
 */
export class ReceiptLedger {
  readonly network: ShortNetwork;
  readonly topicId: string;
  private readonly mirrorUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ReceiptsOptions) {
    this.network = opts.network;
    this.topicId = opts.topicId;
    this.mirrorUrl = opts.mirrorUrl ?? mirrorNodeUrl(opts.network);
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async publish(client: Client, receipt: Receipt) {
    return submitJson(client, this.topicId, Receipt.parse(receipt));
  }

  async list(opts: { timestamp?: string } = {}): Promise<Array<{ receipt: Receipt; consensusTimestamp: string; sequenceNumber: number; payerAccountId: string }>> {
    const messages = await readTopicMessages<unknown>(this.mirrorUrl, this.topicId, { fetchImpl: this.fetchImpl, timestamp: opts.timestamp });
    const out: Array<{ receipt: Receipt; consensusTimestamp: string; sequenceNumber: number; payerAccountId: string }> = [];
    for (const m of messages) {
      const parsed = Receipt.safeParse(m.json);
      if (parsed.success) out.push({ receipt: parsed.data, consensusTimestamp: m.consensusTimestamp, sequenceNumber: m.sequenceNumber, payerAccountId: m.payerAccountId });
    }
    return out;
  }

  /** Cross-check every receipt against the settlement transaction on the mirror node. */
  async audit(opts: { timestamp?: string; expectedSellerAccount?: string } = {}): Promise<VerifiedReceipt[]> {
    const entries = await this.list(opts);
    const results: VerifiedReceipt[] = [];
    for (const e of entries) {
      const problems: string[] = [];
      if (opts.expectedSellerAccount && e.payerAccountId !== opts.expectedSellerAccount) {
        problems.push(`receipt written by ${e.payerAccountId}, expected ${opts.expectedSellerAccount}`);
      }
      const tx = await getTransaction(this.mirrorUrl, e.receipt.transactionId, this.fetchImpl);
      const matchesChain = tx ? receiptMatchesTransaction(e.receipt, tx, problems) : false;
      if (!tx) problems.push(`transaction ${toMirrorTxId(e.receipt.transactionId)} not found on mirror node`);
      results.push({ receipt: e.receipt, consensusTimestamp: e.consensusTimestamp, sequenceNumber: e.sequenceNumber, transaction: tx, matchesChain, problems });
    }
    return results;
  }
}

/** Pure check: does the mirror node transaction carry the transfer the receipt claims? */
export function receiptMatchesTransaction(receipt: Receipt, tx: MirrorTransaction, problems: string[] = []): boolean {
  if (tx.result !== 'SUCCESS') problems.push(`transaction result ${tx.result}`);
  const amount = BigInt(receipt.amount);
  if (receipt.asset === '0.0.0') {
    const credit = tx.transfers.filter((t) => t.account === receipt.payTo).reduce((s, t) => s + BigInt(t.amount), 0n);
    const debit = tx.transfers.filter((t) => t.account === receipt.payer).reduce((s, t) => s + BigInt(t.amount), 0n);
    if (credit < amount) problems.push(`payTo credited ${credit} tinybars, receipt says ${amount}`);
    if (-debit < amount) problems.push(`payer debited ${-debit} tinybars, receipt says ${amount}`);
  } else {
    const tt = tx.token_transfers ?? [];
    const credit = tt.filter((t) => t.token_id === receipt.asset && t.account === receipt.payTo).reduce((s, t) => s + BigInt(t.amount), 0n);
    const debit = tt.filter((t) => t.token_id === receipt.asset && t.account === receipt.payer).reduce((s, t) => s + BigInt(t.amount), 0n);
    if (credit < amount) problems.push(`payTo credited ${credit} of ${receipt.asset}, receipt says ${amount}`);
    if (-debit < amount) problems.push(`payer debited ${-debit} of ${receipt.asset}, receipt says ${amount}`);
  }
  return problems.length === 0;
}
