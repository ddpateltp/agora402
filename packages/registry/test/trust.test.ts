import { describe, expect, it } from 'vitest';
import { listingContentHash, type Attestation, type Rating, type ServiceListing } from '@agora402/shared';
import { Marketplace, Registry, ReputationLedger, TrustLedger, effectiveTrust, paidFor, trustFor, type MirrorTopicMessage } from '../src/index.js';

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
let seq = 0;
function msg(json: unknown, payer: string): MirrorTopicMessage {
  seq += 1;
  return { consensus_timestamp: `1700000000.${String(seq).padStart(9, '0')}`, message: b64(JSON.stringify(json)), sequence_number: seq, payer_account_id: payer, running_hash: '', chunk_info: null };
}

const SELLER = '0.0.1001';
const AUDITOR = '0.0.3003';
const BUYER = '0.0.2002';
const listing: ServiceListing = {
  uaid: 'uaid:aid:seller;uid=0;registry=agora402;proto=a2a;nativeId=hedera:testnet:0.0.1001',
  name: 'seller',
  version: '1.0.0',
  payTo: SELLER,
  baseUrl: 'http://localhost:4402',
  quotePath: '/a2a/quote',
  facilitator: 'https://api.testnet.blocky402.com',
  endpoints: [{ id: 'infer', method: 'POST', path: '/v1/infer', description: 'llm', skills: [], accepts: [{ network: 'hedera:testnet', asset: '0.0.0', symbol: 'HBAR', decimals: 8, pricing: { kind: 'flat', amount: '100000' } }] }],
  publishedAt: '2026-09-10T00:00:00.000Z',
};
const attestation = (over: Partial<Attestation> = {}): Attestation => ({
  v: 1,
  type: 'attestation',
  auditId: 'a_0123456789abcdef',
  subject: listing.uaid,
  contentHash: listingContentHash(listing),
  auditor: 'uaid:aid:auditor;uid=0;registry=agora402;proto=a2a;nativeId=hedera:testnet:0.0.3003',
  auditorAccount: AUDITOR,
  verdict: 'safe',
  trustScore: 92,
  risk: 'low',
  summary: 'fine',
  capabilities: ['calls an LLM'],
  findings: [{ severity: 'low', title: 'verbose errors', detail: '' }],
  model: 'deterministic',
  issuedAt: '2026-09-13T00:00:00.000Z',
  ...over,
});

function topicFetch(topics: Record<string, MirrorTopicMessage[]>, txs: Record<string, unknown> = {}): typeof fetch {
  return (async (url: string | URL | Request) => {
    const u = String(url);
    const t = /\/topics\/([\d.]+)\/messages/.exec(u);
    if (t) return new Response(JSON.stringify({ messages: topics[t[1]] ?? [], links: { next: null } }), { status: topics[t[1]] ? 200 : 404 });
    const x = /\/transactions\/([^?]+)/.exec(u);
    if (x && txs[decodeURIComponent(x[1])]) return new Response(JSON.stringify({ transactions: [txs[decodeURIComponent(x[1])]] }));
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
}

describe('TrustLedger', () => {
  it('keeps the latest authentic attestation per subject and drops spoofed ones', async () => {
    const fetchImpl = topicFetch({
      '0.0.7': [
        msg({ ...attestation(), type: 'audit_started', target: { name: 'seller', baseUrl: listing.baseUrl, endpoints: ['infer'] }, stages: ['scan'], startedAt: 'x' }, AUDITOR),
        msg(attestation({ trustScore: 60 }), AUDITOR),
        // spoofed: someone else claims to be the auditor
        msg(attestation({ trustScore: 100, auditId: 'a_spoofed00000000' }), '0.0.9999'),
        msg(attestation({ trustScore: 92, auditId: 'a_second000000000' }), AUDITOR),
        msg({ garbage: true }, AUDITOR),
      ],
    });
    const ledger = new TrustLedger({ network: 'testnet', topicId: '0.0.7', fetchImpl });
    const map = await ledger.attestations();
    expect(map.size).toBe(1);
    const trust = trustFor(listing, map);
    expect(trust?.trustScore).toBe(92);
    expect(trust?.auditId).toBe('a_second000000000');
    expect(trust?.current).toBe(true);
    expect(effectiveTrust(trust)).toBe(92);
    expect((await ledger.trail('a_0123456789abcdef')).map((e) => e.message.type)).toEqual(['audit_started', 'attestation']);
  });

  it('marks an attestation stale once the listing content changes, and scores dangerous as 0', () => {
    const map = new Map([[listing.uaid, { attestation: attestation(), consensusTimestamp: '1', sequenceNumber: 1, payerAccountId: AUDITOR, authentic: true }]]);
    const repriced = { ...listing, endpoints: [{ ...listing.endpoints[0], accepts: [{ ...listing.endpoints[0].accepts[0], pricing: { kind: 'flat' as const, amount: '999999' } }] }] };
    const stale = trustFor(repriced, map);
    expect(stale?.current).toBe(false);
    expect(effectiveTrust(stale)).toBeNull();
    const bad = new Map([[listing.uaid, { attestation: attestation({ verdict: 'dangerous', trustScore: 40, risk: 'critical' }), consensusTimestamp: '1', sequenceNumber: 1, payerAccountId: AUDITOR, authentic: true }]]);
    expect(effectiveTrust(trustFor(listing, bad))).toBe(0);
    expect(trustFor(listing, new Map())).toBeNull();
  });
});

const settlement = {
  transaction_id: '0.0.7162784-1700000000-000000001',
  consensus_timestamp: '1700000000.5',
  result: 'SUCCESS',
  name: 'CRYPTOTRANSFER',
  charged_tx_fee: 100,
  transfers: [
    { account: BUYER, amount: -100000, is_approval: false },
    { account: SELLER, amount: 100000, is_approval: false },
  ],
};
const rating = (over: Partial<Rating> = {}): Rating => ({
  v: 1,
  type: 'rating',
  subject: listing.uaid,
  subjectAccount: SELLER,
  rater: 'uaid:aid:buyer;uid=0;registry=agora402;proto=a2a;nativeId=hedera:testnet:0.0.2002',
  raterAccount: BUYER,
  transactionId: '0.0.7162784@1700000000.000000001',
  score: 5,
  issuedAt: '2026-09-13T00:00:00.000Z',
  ...over,
});

describe('ReputationLedger', () => {
  it('counts one rating per proven settlement and rejects the rest', async () => {
    const fetchImpl = topicFetch(
      {
        '0.0.8': [
          msg(rating(), BUYER),
          msg(rating({ score: 1 }), BUYER), // same settlement used twice
          msg(rating({ score: 5, transactionId: '0.0.7162784@1700000000.000000002' }), BUYER), // settlement unknown to the mirror node
          msg(rating({ score: 5 }), '0.0.4444'), // written by someone other than the rater
          msg(rating({ score: 3, transactionId: '0.0.7162784@1700000000.000000003', raterAccount: '0.0.5555' }), '0.0.5555'), // pays another seller
        ],
      },
      {
        '0.0.7162784-1700000000-000000001': settlement,
        '0.0.7162784-1700000000-000000003': { ...settlement, transfers: [{ account: '0.0.5555', amount: -1, is_approval: false }, { account: '0.0.6666', amount: 1, is_approval: false }] },
      },
    );
    const ledger = new ReputationLedger({ network: 'testnet', topicId: '0.0.8', fetchImpl });
    const s = (await ledger.summaries()).get(listing.uaid)!;
    expect(s.count).toBe(1);
    expect(s.average).toBe(5);
    expect(s.rejected).toBe(4);
  });
  it('paidFor accepts token settlements too', () => {
    expect(paidFor(settlement, BUYER, SELLER)).toBe(true);
    expect(paidFor(settlement, SELLER, BUYER)).toBe(false);
    expect(paidFor({ ...settlement, transfers: [], token_transfers: [{ token_id: '0.0.5', account: BUYER, amount: -3 }, { token_id: '0.0.5', account: SELLER, amount: 3 }] }, BUYER, SELLER)).toBe(true);
    expect(paidFor({ ...settlement, result: 'INSUFFICIENT_PAYER_BALANCE' }, BUYER, SELLER)).toBe(false);
  });
});

describe('Marketplace', () => {
  it('merges registry, trust and reputation, and works with the topics absent', async () => {
    const fetchImpl = topicFetch(
      { '0.0.5': [msg({ v: 1, type: 'listing', listing }, SELLER)], '0.0.7': [msg(attestation(), AUDITOR)], '0.0.8': [msg(rating(), BUYER)] },
      { '0.0.7162784-1700000000-000000001': settlement },
    );
    const registry = new Registry({ network: 'testnet', topicId: '0.0.5', fetchImpl });
    const full = await new Marketplace({
      registry,
      trust: new TrustLedger({ network: 'testnet', topicId: '0.0.7', fetchImpl }),
      reputation: new ReputationLedger({ network: 'testnet', topicId: '0.0.8', fetchImpl }),
    }).list();
    expect(full).toHaveLength(1);
    expect(full[0].trust?.verdict).toBe('safe');
    expect(full[0].reputation?.average).toBe(5);
    const bare = await new Marketplace({ registry }).list();
    expect(bare[0].trust).toBeNull();
    expect(bare[0].reputation).toBeNull();
  });
});
