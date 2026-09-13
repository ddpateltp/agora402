import { describe, expect, it } from 'vitest';
import { PrivateKey } from '@hiero-ledger/sdk';
import { Registry, TrustLedger, type MirrorTopicMessage } from '@agora402/registry';
import { listingContentHash, type Attestation, type ServiceListing } from '@agora402/shared';
import { BuyerAgent, type AgentEvent } from '../src/index.js';

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
let seq = 0;
function msg(json: unknown, payer: string): MirrorTopicMessage {
  seq += 1;
  return { consensus_timestamp: `1700000000.${String(seq).padStart(9, '0')}`, message: b64(JSON.stringify(json)), sequence_number: seq, payer_account_id: payer, running_hash: '', chunk_info: null };
}
function seller(name: string, account: string, amount: string): ServiceListing {
  return {
    uaid: `uaid:aid:${name};uid=0;registry=agora402;proto=a2a;nativeId=hedera:testnet:${account}`,
    name,
    version: '1.0.0',
    payTo: account,
    baseUrl: `http://${name}.invalid`,
    quotePath: '/a2a/quote',
    facilitator: 'https://api.testnet.blocky402.com',
    endpoints: [{ id: 'infer', method: 'POST', path: '/v1/infer', description: 'llm', skills: [], accepts: [{ network: 'hedera:testnet', asset: '0.0.0', symbol: 'HBAR', decimals: 8, pricing: { kind: 'flat', amount } }] }],
    publishedAt: '2026-09-10T00:00:00.000Z',
  };
}
const AUDITOR = '0.0.3003';
function attest(l: ServiceListing, verdict: 'safe' | 'dangerous', trustScore: number, contentHash = listingContentHash(l)): Attestation {
  return {
    v: 1, type: 'attestation', auditId: `a_${l.name.padEnd(14, '0')}`, subject: l.uaid, contentHash,
    auditor: `uaid:aid:auditor;uid=0;registry=agora402;proto=a2a;nativeId=hedera:testnet:${AUDITOR}`, auditorAccount: AUDITOR,
    verdict, trustScore, risk: verdict === 'safe' ? 'low' : 'critical', summary: '', capabilities: [], findings: [], model: 'deterministic', issuedAt: 'now',
  };
}

// Four sellers: cheap but unverified, verified and pricier, attested dangerous, and one whose attestation is stale.
const cheap = seller('cheap', '0.0.1001', '10000');
const verified = seller('verified', '0.0.1002', '30000');
const evil = seller('evil', '0.0.1003', '5000');
const stale = seller('stale', '0.0.1004', '20000');
const fetchImpl = (async (url: string | URL | Request) => {
  const u = String(url);
  if (u.includes('/topics/0.0.5/')) return new Response(JSON.stringify({ messages: [cheap, verified, evil, stale].map((l) => msg({ v: 1, type: 'listing', listing: l }, l.payTo)), links: { next: null } }));
  if (u.includes('/topics/0.0.7/')) {
    return new Response(JSON.stringify({ messages: [msg(attest(verified, 'safe', 90), AUDITOR), msg(attest(evil, 'dangerous', 20), AUDITOR), msg(attest(stale, 'safe', 95, 'ab'.repeat(32)), AUDITOR)], links: { next: null } }));
  }
  return new Response('{}', { status: 404 });
}) as typeof fetch;

function agent(minTrust: number | undefined, events: AgentEvent[]) {
  return new BuyerAgent({
    network: 'testnet',
    accountId: '0.0.2002',
    privateKey: PrivateKey.generateECDSA().toStringDer(),
    maxPerCall: 1_000_000n,
    sessionBudget: 1_000_000n,
    registry: new Registry({ network: 'testnet', topicId: '0.0.5', fetchImpl }),
    trust: new TrustLedger({ network: 'testnet', topicId: '0.0.7', fetchImpl }),
    minTrust,
    fetchImpl,
    onEvent: (e) => events.push(e),
  });
}

describe('buyer trust policy', () => {
  it('without a policy: drops dangerous sellers, ranks verified first, then cheapest', async () => {
    const events: AgentEvent[] = [];
    const a = agent(undefined, events);
    const offers = a.rank(await a.discover('infer'), {});
    expect(offers.map((o) => o.listing.name)).toEqual(['verified', 'cheap', 'stale']);
    expect(offers[0].trust?.current).toBe(true);
    expect(offers[2].trust?.current).toBe(false);
    const trust = events.find((e) => e.stage === 'trust')!;
    expect(trust.data?.dropped).toEqual([{ seller: 'evil', reason: 'attested dangerous (critical)' }]);
  });
  it('with --min-trust: only current safe attestations at or above the score', async () => {
    const events: AgentEvent[] = [];
    const a = agent(70, events);
    const offers = a.rank(await a.discover('infer'), {});
    expect(offers.map((o) => o.listing.name)).toEqual(['verified']);
    const dropped = (events.find((e) => e.stage === 'trust')!.data?.dropped as Array<{ seller: string; reason: string }>).map((d) => d.seller).sort();
    expect(dropped).toEqual(['cheap', 'evil', 'stale']);
    a.minTrust = 95;
    expect(a.rank(await a.discover('infer'), {})).toHaveLength(0);
    await expect(a.infer('hello')).rejects.toThrow(/trust policy/);
  });
});
