import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { PrivateKey } from '@hiero-ledger/sdk';
import { x402ResourceServer, type FacilitatorClient } from '@x402/core/server';
import { ExactHederaScheme as ExactHederaServer } from '@x402/hedera/exact/server';
import { ExactHederaScheme as ExactHederaClient } from '@x402/hedera/exact/client';
import { createClientHederaSigner } from '@x402/hedera';
import { wrapFetchWithPayment, x402Client, x402HTTPClient } from '@x402/fetch';
import { inspectHederaTransaction } from '@x402/hedera';
import { verifyQuoteSignature } from '@agora402/registry';
import type { Quote } from '@agora402/shared';
import { createSellerApp, loadConfig, mockProvider, ReceiptWriter } from '../src/index.js';

const SELLER = '0.0.1001';
const BUYER = '0.0.2002';
const FEE_PAYER = '0.0.7162784';
const sellerKey = PrivateKey.generateECDSA();
const buyerKey = PrivateKey.generateECDSA();

function debitedAccount(transfers: Array<{ accountId: string; amount: string }>): string {
  return transfers.find((t) => BigInt(t.amount) < 0n)?.accountId ?? 'unknown';
}

/** Stand-in for Blocky402: decodes the partially signed transfer and checks it pays the seller. */
function fakeFacilitator(): FacilitatorClient & { settled: Array<{ payer: string; amount: string; asset: string }> } {
  const settled: Array<{ payer: string; amount: string; asset: string }> = [];
  return {
    settled,
    async getSupported() {
      return { kinds: [{ x402Version: 2, scheme: 'exact', network: 'hedera:testnet', extra: { feePayer: FEE_PAYER } }], extensions: [], signers: { 'hedera:*': [FEE_PAYER] } };
    },
    async verify(payload, requirements) {
      const tx = inspectHederaTransaction((payload.payload as { transaction: string }).transaction);
      const credit = tx.hbarTransfers.filter((t) => t.accountId === requirements.payTo).reduce((s, t) => s + BigInt(t.amount), 0n);
      if (credit !== BigInt(requirements.amount)) return { isValid: false, invalidReason: 'amount_mismatch', invalidMessage: `credit ${credit} != ${requirements.amount}` };
      // In the Hedera exact scheme the transaction id is the facilitator's (fee payer). The payer is the debited account.
      expect(tx.transactionIdAccountId).toBe(FEE_PAYER);
      return { isValid: true, payer: debitedAccount(tx.hbarTransfers) };
    },
    async settle(payload, requirements) {
      const tx = inspectHederaTransaction((payload.payload as { transaction: string }).transaction);
      const payer = debitedAccount(tx.hbarTransfers);
      settled.push({ payer, amount: requirements.amount, asset: requirements.asset });
      return { success: true, transaction: tx.transactionId, network: requirements.network, payer };
    },
  };
}

describe('seller x402 flow', () => {
  let server: Server;
  let base: string;
  const facilitator = fakeFacilitator();
  const receipts = new ReceiptWriter({ network: 'testnet' });
  let paidFetch: typeof fetch;
  let httpClient: x402HTTPClient;

  beforeAll(async () => {
    const cfg = loadConfig({
      HEDERA_NETWORK: 'testnet',
      SELLER_ACCOUNT_ID: SELLER,
      SELLER_PRIVATE_KEY: sellerKey.toStringDer(),
      FACILITATOR_URL: 'http://fake.facilitator.invalid',
      SELLER_PUBLIC_URL: 'http://localhost:0',
      LLM_PROVIDER: 'mock',
    });
    const resourceServer = new x402ResourceServer(facilitator).register('hedera:*', new ExactHederaServer({}));
    const { app } = createSellerApp({ cfg, resourceServer, llm: mockProvider(), receipts, syncFacilitatorOnStart: true, log: () => {} });
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const signer = createClientHederaSigner(BUYER, buyerKey, { network: 'hedera:testnet' });
    const client = new x402Client().register('hedera:*', new ExactHederaClient(signer)).setSpendControls({
      allowedAssets: [{ network: 'hedera:testnet', asset: '0.0.0', maxAmountPerPayment: '10000000' }],
    });
    httpClient = new x402HTTPClient(client);
    paidFetch = wrapFetchWithPayment(fetch, client);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('serves discovery documents', async () => {
    const listing = await (await fetch(`${base}/.well-known/agora402.json`)).json();
    expect(listing.payTo).toBe(SELLER);
    expect(listing.endpoints.map((e: { id: string }) => e.id)).toEqual(['infer', 'hbar-rate']);
    const card = await (await fetch(`${base}/.well-known/agent.json`)).json();
    expect(card.capabilities.extensions[0].params.payment_network).toBe('hedera:testnet');
  });

  it('answers 402 with a per-request price derived from the body', async () => {
    const short = await fetch(`${base}/v1/infer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], max_tokens: 10 }),
    });
    expect(short.status).toBe(402);
    const long = await fetch(`${base}/v1/infer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'x'.repeat(8000) }], max_tokens: 1000 }),
    });
    expect(long.status).toBe(402);
    const priceOf = (r: Response) => {
      const hdr = r.headers.get('PAYMENT-REQUIRED');
      const decoded = JSON.parse(Buffer.from(hdr!, 'base64').toString('utf8')) as { accepts: Array<{ amount: string; asset: string; extra: { feePayer?: string } }> };
      return decoded.accepts[0];
    };
    const a = priceOf(short);
    const b = priceOf(long);
    // base 50000 + ceil(1*20000/1000)=20 + ceil(10*60000/1000)=600
    expect(a.amount).toBe('50620');
    // base 50000 + ceil((8000 chars + newline)/4)=2001 tokens * 20 = 40020 + 1000 * 60 = 60000
    expect(b.amount).toBe('150020');
    expect(a.extra.feePayer).toBe(FEE_PAYER);
    const body = await short.json();
    expect(body.hint).toContain('/a2a/quote');
  });

  it('negotiates a signed quote and honours it in the 402', async () => {
    const res = await fetch(`${base}/a2a/quote`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpointId: 'infer', estimate: { inputTokens: 100, maxOutputTokens: 100 }, maxAmount: '55000', asset: '0.0.0' }),
    });
    expect(res.status).toBe(200);
    const { quote, countered } = (await res.json()) as { quote: Quote; countered: boolean };
    // list = 50000 + 2000 + 6000 = 58000, buyer offered 55000 (>= 85% floor) -> countered
    expect(countered).toBe(true);
    expect(quote.amount).toBe('55000');
    expect(verifyQuoteSignature(quote)).toBe(true);
    expect(quote.signerPublicKey).toBe(sellerKey.publicKey.toStringDer());

    const gated = await fetch(`${base}/v1/infer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quoteId: quote.quoteId, messages: [{ role: 'user', content: 'x'.repeat(4000) }], max_tokens: 100 }),
    });
    expect(gated.status).toBe(402);
    const decoded = JSON.parse(Buffer.from(gated.headers.get('PAYMENT-REQUIRED')!, 'base64').toString('utf8'));
    expect(decoded.accepts[0].amount).toBe('55000');
  });

  it('rejects lowball offers with the floor', async () => {
    const res = await fetch(`${base}/a2a/quote`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpointId: 'infer', estimate: { inputTokens: 100, maxOutputTokens: 100 }, maxAmount: '1000' }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.minimumAmount).toBe('49300');
    expect(body.listPrice).toBe('58000');
  });

  it('completes a paid request end to end and records a receipt', async () => {
    const res = await paidFetch(`${base}/v1/infer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hello agora' }], max_tokens: 20 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.choices[0].message.content).toContain('mock reply');
    const settlement = httpClient.getPaymentSettleResponse((n) => res.headers.get(n));
    expect(settlement?.success).toBe(true);
    expect(settlement?.transaction).toMatch(/^0\.0\.7162784@/);
    expect(settlement?.payer).toBe(BUYER);
    expect(facilitator.settled).toHaveLength(1);
    expect(facilitator.settled[0]).toMatchObject({ payer: BUYER, asset: '0.0.0', amount: '51260' });

    const stored = receipts.list();
    expect(stored).toHaveLength(1);
    expect(stored[0].receipt).toMatchObject({ payer: BUYER, payTo: SELLER, amount: '51260', resource: '/v1/infer' });
    expect(stored[0].receipt.usage).toMatchObject({ provider: 'mock' });
    expect(stored[0].receipt.responseHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not charge when the handler fails', async () => {
    const before = facilitator.settled.length;
    const res = await paidFetch(`${base}/v1/infer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    });
    expect(res.status).toBe(400);
    expect(facilitator.settled.length).toBe(before);
  });
});
