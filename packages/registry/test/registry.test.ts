import { describe, expect, it } from 'vitest';
import { PrivateKey } from '@hiero-ledger/sdk';
import { Registry, ReceiptLedger, reassemble, receiptMatchesTransaction, signQuote, toMirrorTxId, verifyQuoteSignature, type MirrorTopicMessage } from '../src/index.js';
import type { Receipt, ServiceListing } from '@agora402/shared';

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

function msg(partial: Partial<MirrorTopicMessage> & { message: string }): MirrorTopicMessage {
  return {
    consensus_timestamp: '1700000000.000000001',
    sequence_number: 1,
    payer_account_id: '0.0.1001',
    running_hash: '',
    chunk_info: null,
    ...partial,
  };
}

describe('mirror reassembly', () => {
  it('joins chunked messages in order', () => {
    const initial = { account_id: '0.0.1001', transaction_valid_start: '1700000000.000000000', nonce: 0, scheduled: false };
    const out = reassemble<{ a: number }>([
      msg({ message: b64('{"a"'), sequence_number: 1, chunk_info: { initial_transaction_id: initial, number: 1, total: 2 } }),
      msg({ message: b64(':1}'), sequence_number: 2, consensus_timestamp: '1700000000.000000002', chunk_info: { initial_transaction_id: initial, number: 2, total: 2 } }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].json).toEqual({ a: 1 });
  });
  it('converts SDK tx ids to mirror format', () => {
    expect(toMirrorTxId('0.0.123@1700000000.5')).toBe('0.0.123-1700000000-000000005');
    expect(toMirrorTxId('0.0.123-1700000000-000000005')).toBe('0.0.123-1700000000-000000005');
  });
});

const listing: ServiceListing = {
  uaid: 'uaid:aid:abc;uid=0;registry=agora402;proto=a2a;nativeId=hedera:testnet:0.0.1001',
  name: 'seller',
  version: '1.0.0',
  payTo: '0.0.1001',
  baseUrl: 'http://localhost:4402',
  quotePath: '/a2a/quote',
  facilitator: 'https://api.testnet.blocky402.com',
  endpoints: [
    {
      id: 'infer',
      method: 'POST',
      path: '/v1/infer',
      description: 'llm',
      skills: [],
      accepts: [{ network: 'hedera:testnet', asset: '0.0.0', symbol: 'HBAR', decimals: 8, pricing: { kind: 'flat', amount: '100000' } }],
    },
  ],
  publishedAt: '2026-09-10T00:00:00.000Z',
};

function mirrorFetch(messages: MirrorTopicMessage[]): typeof fetch {
  return (async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('/topics/')) return new Response(JSON.stringify({ messages, links: { next: null } }), { status: 200 });
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
}

describe('Registry view', () => {
  it('keeps the latest listing per uaid and drops spoofed and delisted ones', async () => {
    const fetchImpl = mirrorFetch([
      msg({ message: b64(JSON.stringify({ v: 1, type: 'listing', listing })), sequence_number: 1 }),
      // spoofed: payer does not own payTo
      msg({ message: b64(JSON.stringify({ v: 1, type: 'listing', listing: { ...listing, uaid: 'uaid:aid:evil', name: 'evil' } })), payer_account_id: '0.0.9', sequence_number: 2, consensus_timestamp: '1700000000.000000002' }),
      msg({ message: b64(JSON.stringify({ v: 1, type: 'listing', listing: { ...listing, version: '1.0.1' } })), sequence_number: 3, consensus_timestamp: '1700000000.000000003' }),
      msg({ message: b64(JSON.stringify({ v: 1, type: 'listing', listing: { ...listing, uaid: 'uaid:aid:gone', name: 'gone' } })), sequence_number: 4, consensus_timestamp: '1700000000.000000004' }),
      msg({ message: b64(JSON.stringify({ v: 1, type: 'delist', uaid: 'uaid:aid:gone' })), sequence_number: 5, consensus_timestamp: '1700000000.000000005' }),
      msg({ message: b64('not json'), sequence_number: 6, consensus_timestamp: '1700000000.000000006' }),
    ]);
    const reg = new Registry({ network: 'testnet', topicId: '0.0.5', fetchImpl });
    const services = await reg.listServices();
    expect(services).toHaveLength(1);
    expect(services[0].version).toBe('1.0.1');
    const hits = await reg.findEndpoint('infer');
    expect(hits).toHaveLength(1);
    expect(await reg.findEndpoint('infer', '0.0.777')).toHaveLength(0);
  });
});

describe('quotes', () => {
  it('signs and verifies with an ECDSA key, rejects tampering', () => {
    const key = PrivateKey.generateECDSA();
    const q = signQuote(
      { quoteId: 'q_0123456789ab', seller: 'uaid:aid:x', endpointId: 'infer', network: 'hedera:testnet', asset: '0.0.0', amount: '5000', expiresAt: 2000000000, basis: { inputTokens: 10 } },
      key,
    );
    expect(verifyQuoteSignature(q)).toBe(true);
    expect(verifyQuoteSignature({ ...q, amount: '1' })).toBe(false);
    expect(verifyQuoteSignature({ ...q, signature: 'zz' })).toBe(false);
  });
});

describe('receipts', () => {
  const receipt: Receipt = {
    v: 1,
    type: 'receipt',
    seller: 'uaid:aid:x',
    transactionId: '0.0.7162784@1700000000.000000001',
    network: 'hedera:testnet',
    payer: '0.0.2002',
    payTo: '0.0.1001',
    asset: '0.0.0',
    amount: '100000',
    resource: '/v1/infer',
    usage: {},
    issuedAt: '2026-09-10T00:00:00.000Z',
  };
  const tx = {
    transaction_id: '0.0.7162784-1700000000-000000001',
    consensus_timestamp: '1700000000.5',
    result: 'SUCCESS',
    name: 'CRYPTOTRANSFER',
    charged_tx_fee: 100,
    transfers: [
      { account: '0.0.2002', amount: -100000, is_approval: false },
      { account: '0.0.1001', amount: 100000, is_approval: false },
      { account: '0.0.7162784', amount: -100, is_approval: false },
      { account: '0.0.98', amount: 100, is_approval: false },
    ],
  };
  it('matches a correct HBAR transfer', () => {
    expect(receiptMatchesTransaction(receipt, tx)).toBe(true);
  });
  it('flags an inflated receipt', () => {
    const problems: string[] = [];
    expect(receiptMatchesTransaction({ ...receipt, amount: '200000' }, tx, problems)).toBe(false);
    expect(problems.length).toBeGreaterThan(0);
  });
  it('audits receipts against the mirror node', async () => {
    const fetchImpl = (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes('/topics/')) return new Response(JSON.stringify({ messages: [msg({ message: b64(JSON.stringify(receipt)) })], links: { next: null } }));
      if (u.includes('/transactions/')) return new Response(JSON.stringify({ transactions: [tx] }));
      return new Response('{}', { status: 404 });
    }) as typeof fetch;
    const ledger = new ReceiptLedger({ network: 'testnet', topicId: '0.0.6', fetchImpl });
    const audit = await ledger.audit({ expectedSellerAccount: '0.0.1001' });
    expect(audit).toHaveLength(1);
    expect(audit[0].matchesChain).toBe(true);
    expect(audit[0].problems).toEqual([]);
  });
});
