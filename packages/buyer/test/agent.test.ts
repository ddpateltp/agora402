import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { PrivateKey } from '@hiero-ledger/sdk';
import { x402ResourceServer, type FacilitatorClient } from '@x402/core/server';
import { ExactHederaScheme as ExactHederaServer } from '@x402/hedera/exact/server';
import { inspectHederaTransaction } from '@x402/hedera';
import { createSellerApp, loadConfig, mockProvider, ReceiptWriter } from '@agora402/seller';
import { BuyerAgent, type AgentEvent } from '../src/index.js';

const SELLER = '0.0.1001';
const BUYER = '0.0.2002';
const FEE_PAYER = '0.0.7162784';
const sellerKey = PrivateKey.generateECDSA();
const buyerKey = PrivateKey.generateECDSA();

const settledTxs: Array<{ id: string; payer: string; amount: string }> = [];

const facilitator: FacilitatorClient = {
  async getSupported() {
    return { kinds: [{ x402Version: 2, scheme: 'exact', network: 'hedera:testnet', extra: { feePayer: FEE_PAYER } }], extensions: [], signers: { 'hedera:*': [FEE_PAYER] } };
  },
  async verify(payload, requirements) {
    const tx = inspectHederaTransaction((payload.payload as { transaction: string }).transaction);
    const payer = tx.hbarTransfers.find((t) => BigInt(t.amount) < 0n)!.accountId;
    const credit = tx.hbarTransfers.filter((t) => t.accountId === requirements.payTo).reduce((s, t) => s + BigInt(t.amount), 0n);
    return credit === BigInt(requirements.amount) ? { isValid: true, payer } : { isValid: false, invalidReason: 'amount_mismatch' };
  },
  async settle(payload, requirements) {
    const tx = inspectHederaTransaction((payload.payload as { transaction: string }).transaction);
    const payer = tx.hbarTransfers.find((t) => BigInt(t.amount) < 0n)!.accountId;
    settledTxs.push({ id: tx.transactionId, payer, amount: requirements.amount });
    return { success: true, transaction: tx.transactionId, network: requirements.network, payer };
  },
};

/** Route mirror node calls to a stub built from what the fake facilitator settled; pass everything else through. */
function fetchWithFakeMirror(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('https://testnet.mirrornode.hedera.com')) {
      if (url.includes('/api/v1/accounts/')) {
        return new Response(JSON.stringify({ key: { _type: 'ECDSA_SECP256K1', key: sellerKey.publicKey.toStringRaw() } }));
      }
      const m = /\/api\/v1\/transactions\/([^?]+)/.exec(url);
      if (m) {
        const wanted = decodeURIComponent(m[1]);
        const hit = settledTxs.find((t) => t.id.replace('@', '-').replace(/\.(\d+)$/, (_s, n) => '-' + n.padStart(9, '0')) === wanted);
        if (!hit) return new Response('{}', { status: 404 });
        return new Response(
          JSON.stringify({
            transactions: [
              {
                transaction_id: wanted,
                consensus_timestamp: '1700000000.000000001',
                result: 'SUCCESS',
                name: 'CRYPTOTRANSFER',
                charged_tx_fee: 1,
                transfers: [
                  { account: hit.payer, amount: -Number(hit.amount), is_approval: false },
                  { account: SELLER, amount: Number(hit.amount), is_approval: false },
                ],
              },
            ],
          }),
        );
      }
      return new Response('{}', { status: 404 });
    }
    return fetch(input, init);
  }) as typeof fetch;
}

describe('buyer agent against a live seller', () => {
  let server: Server;
  let base: string;
  const events: AgentEvent[] = [];

  beforeAll(async () => {
    const cfg = loadConfig({
      HEDERA_NETWORK: 'testnet',
      SELLER_ACCOUNT_ID: SELLER,
      SELLER_PRIVATE_KEY: sellerKey.toStringDer(),
      FACILITATOR_URL: 'http://fake.facilitator.invalid',
      LLM_PROVIDER: 'mock',
      SELLER_PUBLIC_URL: 'http://127.0.0.1:1',
    });
    // The listing advertises SELLER_PUBLIC_URL, so find a free port first, then start the seller on it.
    const { createServer } = await import('node:http');
    const probe = createServer();
    const port = await new Promise<number>((resolve) => probe.listen(0, () => resolve((probe.address() as AddressInfo).port)));
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    base = `http://127.0.0.1:${port}`;
    const resourceServer = new x402ResourceServer(facilitator).register('hedera:*', new ExactHederaServer({}));
    const { app } = createSellerApp({ cfg: { ...cfg, SELLER_PUBLIC_URL: base }, resourceServer, llm: mockProvider(), receipts: new ReceiptWriter({ network: 'testnet' }), log: () => {} });
    await new Promise<void>((resolve) => {
      server = app.listen(port, () => resolve());
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function agent(budgetTinybars: bigint, maxPerCall = 10_000_000n) {
    return new BuyerAgent({
      network: 'testnet',
      accountId: BUYER,
      privateKey: buyerKey.toStringDer(),
      maxPerCall,
      sessionBudget: budgetTinybars,
      fetchImpl: fetchWithFakeMirror(),
      verifyQuoteSigner: true,
      onEvent: (e) => events.push(e),
    });
  }

  it('discovers, negotiates, pays and verifies an inference call', async () => {
    const a = agent(1_000_000n);
    const r = await a.infer('what is x402?', { sellerUrl: base, maxTokens: 30, counterBps: 9000 });
    expect(r.status).toBe(200);
    expect(r.body.choices[0].message.content).toContain('mock reply');
    expect(r.quote).not.toBeNull();
    // list price: base 50000 + ceil(4 tokens*20) + 30*60 = 50000 + 80 + 1800 = 51880; countered at 90% = 46692
    expect(r.offer.listPrice).toBe(51880n);
    expect(r.quote!.amount).toBe('46692');
    expect(r.amount).toBe(46692n);
    expect(a.totalSpent).toBe(46692n);
    expect(r.hashscanUrl).toContain('hashscan.io/testnet/transaction/');
    expect(r.onChain?.result).toBe('SUCCESS');
    const stages = events.map((e) => e.stage);
    for (const s of ['discovering', 'discovered', 'quoting', 'quoted', 'requesting', 'payment_required', 'paying', 'paid', 'settled', 'verifying', 'verified']) {
      expect(stages).toContain(s);
    }
    expect(stages).not.toContain('failed');
  });

  it('refuses to pay beyond the session budget', async () => {
    const a = agent(1000n);
    await expect(a.infer('too expensive', { sellerUrl: base, maxTokens: 30 })).rejects.toThrow();
    expect(a.totalSpent).toBe(0n);
    expect(events.some((e) => e.stage === 'failed' && e.message.includes('session budget'))).toBe(true);
  });

  it('per-call cap is enforced by x402 spend controls', async () => {
    const a = agent(1_000_000n, 1000n);
    await expect(a.infer('capped', { sellerUrl: base, maxTokens: 30 })).rejects.toThrow();
    expect(a.totalSpent).toBe(0n);
  });
});
