import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createServer } from 'node:http';
import { PrivateKey } from '@hiero-ledger/sdk';
import { x402ResourceServer, type FacilitatorClient } from '@x402/core/server';
import { ExactHederaScheme as ExactHederaServer } from '@x402/hedera/exact/server';
import { ExactHederaScheme as ExactHederaClient } from '@x402/hedera/exact/client';
import { createClientHederaSigner, inspectHederaTransaction } from '@x402/hedera';
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import type { Attestation } from '@agora402/shared';
import { createSellerApp, loadConfig, mockProvider, ReceiptWriter } from '../src/index.js';

const SERVICES = '0.0.1001';
const AUDITOR = '0.0.3003';
const BUYER = '0.0.2002';
const FEE_PAYER = '0.0.7162784';
const servicesKey = PrivateKey.generateECDSA();
const auditorKey = PrivateKey.generateECDSA();
const buyerKey = PrivateKey.generateECDSA();

function fakeFacilitator() {
  const settled: Array<{ payer: string; amount: string; payTo: string }> = [];
  const f: FacilitatorClient = {
    async getSupported() {
      return { kinds: [{ x402Version: 2, scheme: 'exact', network: 'hedera:testnet', extra: { feePayer: FEE_PAYER } }], extensions: [], signers: { 'hedera:*': [FEE_PAYER] } };
    },
    async verify(payload, requirements) {
      const tx = inspectHederaTransaction((payload.payload as { transaction: string }).transaction);
      const credit = tx.hbarTransfers.filter((t) => t.accountId === requirements.payTo).reduce((s, t) => s + BigInt(t.amount), 0n);
      return credit === BigInt(requirements.amount) ? { isValid: true, payer: tx.hbarTransfers.find((t) => BigInt(t.amount) < 0n)!.accountId } : { isValid: false, invalidReason: 'amount_mismatch' };
    },
    async settle(payload, requirements) {
      const tx = inspectHederaTransaction((payload.payload as { transaction: string }).transaction);
      const payer = tx.hbarTransfers.find((t) => BigInt(t.amount) < 0n)!.accountId;
      settled.push({ payer, amount: requirements.amount, payTo: requirements.payTo });
      return { success: true, transaction: tx.transactionId, network: requirements.network, payer };
    },
  };
  return { facilitator: f, settled };
}

/** Mirror node stub: account keys for the quote-signer check. Everything else goes to the real network stack (local servers). */
function fetchWithFakeMirror(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('https://testnet.mirrornode.hedera.com')) {
      const m = /\/api\/v1\/accounts\/([\d.]+)/.exec(url);
      if (m) {
        const key = m[1] === SERVICES ? servicesKey : m[1] === AUDITOR ? auditorKey : null;
        return key ? new Response(JSON.stringify({ key: { _type: 'ECDSA_SECP256K1', key: key.publicKey.toStringRaw() } })) : new Response('{}', { status: 404 });
      }
      return new Response('{}', { status: 404 });
    }
    return fetch(input, init);
  }) as typeof fetch;
}

async function freePort(): Promise<number> {
  const probe = createServer();
  const port = await new Promise<number>((resolve) => probe.listen(0, () => resolve((probe.address() as AddressInfo).port)));
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

describe('paid audit: a buyer pays an auditor agent to attest a services seller', () => {
  const servers: Server[] = [];
  let servicesUrl: string;
  let auditorUrl: string;
  const { facilitator, settled } = fakeFacilitator();
  const fetchImpl = fetchWithFakeMirror();

  beforeAll(async () => {
    const start = async (env: Record<string, string>) => {
      const port = await freePort();
      const base = `http://127.0.0.1:${port}`;
      const cfg = loadConfig({ HEDERA_NETWORK: 'testnet', FACILITATOR_URL: 'http://fake.facilitator.invalid', LLM_PROVIDER: 'mock', ...env, SELLER_PUBLIC_URL: base });
      const resourceServer = new x402ResourceServer(facilitator).register('hedera:*', new ExactHederaServer({}));
      const { app } = createSellerApp({ cfg, resourceServer, llm: mockProvider(), receipts: new ReceiptWriter({ network: 'testnet' }), fetchImpl, log: () => {} });
      await new Promise<void>((resolve) => servers.push(app.listen(port, () => resolve())));
      return base;
    };
    servicesUrl = await start({ SELLER_ACCOUNT_ID: SERVICES, SELLER_PRIVATE_KEY: servicesKey.toStringDer(), SELLER_NAME: 'services-1' });
    auditorUrl = await start({ SELLER_ACCOUNT_ID: AUDITOR, SELLER_PRIVATE_KEY: auditorKey.toStringDer(), SELLER_NAME: 'auditor-1', SELLER_ROLE: 'auditor', AUDIT_PRICE_TINYBARS: '1000000' });
  });
  afterAll(async () => {
    for (const s of servers) await new Promise<void>((resolve) => s.close(() => resolve()));
  });

  function paidFetch(): typeof fetch {
    const signer = createClientHederaSigner(BUYER, buyerKey, { network: 'hedera:testnet' });
    const client = new x402Client()
      .register('hedera:*', new ExactHederaClient(signer))
      .setSpendControls({ allowedAssets: [{ network: 'hedera:testnet', asset: '0.0.0', maxAmountPerPayment: '100000000' }] });
    return wrapFetchWithPayment(fetch, client);
  }

  it('advertises only the audit endpoint in the auditor role', async () => {
    const manifest = (await (await fetch(`${auditorUrl}/.well-known/agora402.json`)).json()) as { endpoints: Array<{ id: string; accepts: Array<{ pricing: { amount?: string } }> }> };
    expect(manifest.endpoints.map((e) => e.id)).toEqual(['audit']);
    expect(manifest.endpoints[0].accepts[0].pricing.amount).toBe('1000000');
    const health = (await (await fetch(`${auditorUrl}/health`)).json()) as { role: string; auditsToHcs: boolean };
    expect(health.role).toBe('auditor');
    expect(health.auditsToHcs).toBe(false);
  });

  it('runs the audit behind x402, streams progress for free, and the buyer is charged the flat price', async () => {
    const auditId = 'a_00000000000000aa';
    const before = settled.length;
    // Attach to the progress stream before paying: it waits for the run to appear.
    const streamed = (async () => {
      const res = await fetch(`${auditorUrl}/v1/audits/${auditId}/events`);
      const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l) as { type: string; stage?: string; status?: string });
      return lines;
    })();
    const res = await paidFetch()(`${auditorUrl}/v1/audit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sellerUrl: servicesUrl, auditId }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { auditId: string; attestation: Attestation; stages: Array<{ stage: string }>; recorded: boolean; subject: { payTo: string } };
    expect(body.auditId).toBe(auditId);
    expect(body.subject.payTo).toBe(SERVICES);
    expect(body.attestation.verdict).toBe('safe');
    expect(body.attestation.trustScore).toBe(100);
    expect(body.attestation.auditorAccount).toBe(AUDITOR);
    expect(body.stages.map((s) => s.stage)).toEqual(['manifest', 'payment', 'content', 'synthesis']);
    expect(body.recorded).toBe(false);
    expect(settled.length).toBe(before + 1);
    expect(settled.at(-1)).toMatchObject({ payer: BUYER, payTo: AUDITOR, amount: '1000000' });
    const lines = await streamed;
    expect(lines.filter((l) => l.type === 'stage' && l.status === 'done').map((l) => l.stage)).toEqual(['manifest', 'payment', 'content', 'synthesis']);
    expect(lines.at(-1)?.type).toBe('end');
    expect(lines.some((l) => l.type === 'attestation')).toBe(true);
    // Probing the services seller left it unpaid: nothing settled for it.
    expect(settled.filter((s) => s.payTo === SERVICES)).toHaveLength(0);
  });

  it('refuses to attest itself and does not charge for the refusal', async () => {
    const before = settled.length;
    const res = await paidFetch()(`${auditorUrl}/v1/audit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sellerUrl: auditorUrl }) });
    expect(res.status).toBe(400);
    expect(settled.length).toBe(before);
  });
});
