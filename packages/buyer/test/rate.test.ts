import { describe, expect, it } from 'vitest';
import { PrivateKey } from '@hiero-ledger/sdk';
import type { Rating } from '@agora402/shared';
import { BuyerAgent, type AgentEvent } from '../src/index.js';

describe('buyer ratings', () => {
  const published: Rating[] = [];
  const ledger = {
    topicId: '0.0.8',
    network: 'testnet' as const,
    async publish(_client: unknown, rating: Rating) {
      published.push(rating);
      return { transactionId: '0.0.2002@1700000000.000000001', sequenceNumber: published.length };
    },
  };
  const events: AgentEvent[] = [];
  const agent = new BuyerAgent({
    network: 'testnet',
    accountId: '0.0.2002',
    privateKey: PrivateKey.generateECDSA().toStringDer(),
    maxPerCall: 1n,
    sessionBudget: 1n,
    reputation: ledger,
    onEvent: (e) => events.push(e),
  });

  it('publishes a rating that names the rater account and the settlement', async () => {
    const r = await agent.rate({ subject: 'uaid:aid:seller', subjectAccount: '0.0.1001', transactionId: '0.0.7162784@1700000000.000000001', score: 4, comment: '  fast  ' });
    expect(r.sequenceNumber).toBe(1);
    expect(published[0]).toMatchObject({ v: 1, type: 'rating', subject: 'uaid:aid:seller', subjectAccount: '0.0.1001', raterAccount: '0.0.2002', score: 4, comment: 'fast' });
    expect(published[0].rater).toBe(agent.uaid);
    expect(events.map((e) => e.stage)).toEqual(['rating', 'rated']);
  });
  it('rejects scores outside 1 to 5 and runs without a topic', async () => {
    await expect(agent.rate({ subject: 'uaid:aid:seller', subjectAccount: '0.0.1001', transactionId: 'x', score: 7 })).rejects.toThrow();
    const bare = new BuyerAgent({ network: 'testnet', accountId: '0.0.2002', privateKey: PrivateKey.generateECDSA().toStringDer(), maxPerCall: 1n, sessionBudget: 1n });
    await expect(bare.rate({ subject: 'uaid:aid:seller', subjectAccount: '0.0.1001', transactionId: 'x', score: 5 })).rejects.toThrow(/REPUTATION_TOPIC_ID/);
    expect(published).toHaveLength(1);
  });
});
