/**
 * Publish (or refresh) this seller's listing on the registry topic. The
 * message is paid for by the seller account, which is how buyers know the
 * listing really belongs to `payTo`. Pass --delist to withdraw.
 */
import { Registry, createOperatorClient } from '@agora402/registry';
import { buildListing, loadConfig } from '@agora402/seller';
import { hashscanTopic } from '@agora402/shared';
import { need, network } from './env.js';

const net = network();
const topicId = need('REGISTRY_TOPIC_ID');
const cfg = loadConfig();
const listing = buildListing(cfg);
const registry = new Registry({ network: net, topicId });
const client = createOperatorClient({ network: net, accountId: cfg.SELLER_ACCOUNT_ID, privateKey: cfg.SELLER_PRIVATE_KEY });
try {
  if (process.argv.includes('--delist')) {
    const r = await registry.delist(client, listing.uaid, 'manual');
    console.log(`delisted ${listing.uaid} (seq ${r.sequenceNumber})`);
  } else {
    const r = await registry.publishListing(client, listing);
    console.log(`published ${listing.name} as ${listing.uaid}`);
    console.log(`  topic ${topicId} seq ${r.sequenceNumber}  ${hashscanTopic(net, topicId)}`);
    console.log(`  baseUrl ${listing.baseUrl}, endpoints: ${listing.endpoints.map((e) => e.id).join(', ')}`);
  }
} finally {
  client.close();
}
