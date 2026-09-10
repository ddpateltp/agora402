import type { Client } from '@hiero-ledger/sdk';
import { ReceiptLedger } from '@agora402/registry';
import { hashscanTx, hashscanTopic, type Receipt } from '@agora402/shared';

export interface StoredReceipt {
  receipt: Receipt;
  hashscanTxUrl: string;
  /** HCS publication result, filled in asynchronously */
  hcs?: { transactionId: string; sequenceNumber: number; topicUrl: string } | { error: string };
}

/**
 * Receipt writer. Publishing to HCS is fire-and-forget from the request path
 * so a slow consensus round never delays the paid response. The in-memory ring
 * feeds the local /receipts endpoint and the dashboard.
 */
export class ReceiptWriter {
  private readonly recent: StoredReceipt[] = [];
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly opts: {
      network: 'testnet' | 'mainnet';
      client?: Client;
      ledger?: ReceiptLedger;
      keep?: number;
      log?: (msg: string) => void;
    },
  ) {}

  get enabled(): boolean {
    return Boolean(this.opts.client && this.opts.ledger);
  }

  record(receipt: Receipt): StoredReceipt {
    const stored: StoredReceipt = { receipt, hashscanTxUrl: hashscanTx(this.opts.network, receipt.transactionId) };
    this.recent.unshift(stored);
    if (this.recent.length > (this.opts.keep ?? 200)) this.recent.pop();
    if (this.enabled) {
      const { client, ledger } = this.opts;
      this.queue = this.queue
        .then(async () => {
          const res = await ledger!.publish(client!, receipt);
          stored.hcs = { ...res, topicUrl: hashscanTopic(this.opts.network, ledger!.topicId) };
          this.opts.log?.(`receipt ${receipt.transactionId} -> HCS ${ledger!.topicId} seq ${res.sequenceNumber}`);
        })
        .catch((err: unknown) => {
          stored.hcs = { error: err instanceof Error ? err.message : String(err) };
          this.opts.log?.(`receipt publish failed: ${stored.hcs.error}`);
        });
    }
    return stored;
  }

  list(limit = 50): StoredReceipt[] {
    return this.recent.slice(0, limit);
  }

  /** Wait for pending HCS publications (tests and graceful shutdown). */
  flush(): Promise<void> {
    return this.queue;
  }
}
