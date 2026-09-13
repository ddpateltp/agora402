/**
 * Create the two HCS topics of the trust layer and record their ids in .env:
 *   AUDIT_TOPIC_ID       one message per audit stage, then the attestation
 *   REPUTATION_TOPIC_ID  one message per buyer rating, backed by a settlement
 * Run once per network after `npm run setup:topics`. Re-running creates fresh topics.
 */
import { createOperatorClient, createTopic } from '@agora402/registry';
import { hashscanTopic } from '@agora402/shared';
import { need, network, saveEnv } from './env.js';

const net = network();
const client = createOperatorClient({ network: net, accountId: need('SELLER_ACCOUNT_ID'), privateKey: need('SELLER_PRIVATE_KEY') });
try {
  const audit = await createTopic(client, 'agora402:audit:v1 audit trail and attestations');
  console.log(`audit topic       ${audit}  ${hashscanTopic(net, audit)}`);
  const reputation = await createTopic(client, 'agora402:reputation:v1 buyer ratings with proof of use');
  console.log(`reputation topic  ${reputation}  ${hashscanTopic(net, reputation)}`);
  saveEnv({ AUDIT_TOPIC_ID: audit, REPUTATION_TOPIC_ID: reputation });
  console.log('saved AUDIT_TOPIC_ID and REPUTATION_TOPIC_ID to .env. Restart the seller and the dashboard so they read them.');
} finally {
  client.close();
}
