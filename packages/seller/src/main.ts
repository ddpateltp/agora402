import { ReceiptLedger, createOperatorClient } from '@agora402/registry';
import { loadConfig } from './config.js';
import { ReceiptWriter } from './receipts.js';
import { createSellerApp } from './server.js';
import { createResourceServer } from './x402.js';

const cfg = loadConfig();
const log = (m: string) => console.log(`[seller] ${m}`);

// HCS receipts need an operator client (the seller pays the tiny topic fee).
let receipts: ReceiptWriter;
if (cfg.RECEIPTS_TOPIC_ID) {
  const client = createOperatorClient({ network: cfg.HEDERA_NETWORK, accountId: cfg.SELLER_ACCOUNT_ID, privateKey: cfg.SELLER_PRIVATE_KEY });
  const ledger = new ReceiptLedger({ network: cfg.HEDERA_NETWORK, topicId: cfg.RECEIPTS_TOPIC_ID });
  receipts = new ReceiptWriter({ network: cfg.HEDERA_NETWORK, client, ledger, log });
} else {
  receipts = new ReceiptWriter({ network: cfg.HEDERA_NETWORK, log });
  log('RECEIPTS_TOPIC_ID not set: receipts are kept in memory only. Run `npm run setup:topics` to create the topics.');
}

const resourceServer = createResourceServer(cfg.FACILITATOR_URL);
const { app, listing } = createSellerApp({ cfg, resourceServer, receipts, log });

app.listen(cfg.SELLER_PORT, () => {
  log(`listening on ${cfg.SELLER_PUBLIC_URL} (port ${cfg.SELLER_PORT})`);
  log(`uaid ${listing.uaid}`);
  log(`payTo ${cfg.SELLER_ACCOUNT_ID} on ${cfg.caip2}, facilitator ${cfg.FACILITATOR_URL}, llm ${cfg.LLM_PROVIDER}`);
  for (const ep of listing.endpoints) log(`  ${ep.method} ${ep.path}  [${ep.accepts.map((a) => a.symbol).join(', ')}]  ${ep.description}`);
});
