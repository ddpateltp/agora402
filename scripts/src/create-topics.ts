/**
 * Create the two HCS topics Agora402 uses and record their ids in .env:
 *   REGISTRY_TOPIC_ID  service listings (discovery)
 *   RECEIPTS_TOPIC_ID  one message per settled payment (audit trail)
 * Run once per network. Re-running creates fresh topics.
 */
import { createOperatorClient, createTopic } from '@agora402/registry';
import { hashscanTopic } from '@agora402/shared';
import { need, network, saveEnv } from './env.js';

const net = network();
const client = createOperatorClient({ network: net, accountId: need('SELLER_ACCOUNT_ID'), privateKey: need('SELLER_PRIVATE_KEY') });
try {
  const registry = await createTopic(client, 'agora402:registry:v1 service listings');
  console.log(`registry topic  ${registry}  ${hashscanTopic(net, registry)}`);
  const receipts = await createTopic(client, 'agora402:receipts:v1 x402 settlement receipts');
  console.log(`receipts topic  ${receipts}  ${hashscanTopic(net, receipts)}`);
  saveEnv({ REGISTRY_TOPIC_ID: registry, RECEIPTS_TOPIC_ID: receipts });
  console.log('saved REGISTRY_TOPIC_ID and RECEIPTS_TOPIC_ID to .env');
} finally {
  client.close();
}
