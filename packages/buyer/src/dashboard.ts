/**
 * Buyer dashboard: a single page that drives the BuyerAgent and streams every
 * stage (discover, quote, 402, sign, settle, verify) over Server-Sent Events.
 * Runs next to the CLI; same agent code, same budgets.
 */
import express from 'express';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Registry, ReceiptLedger } from '@agora402/registry';
import { formatAmount, hashscanTopic, parseAmount } from '@agora402/shared';
import { BuyerAgent, type AgentEvent } from './agent.js';
import { loadBuyerConfig } from './config.js';

const cfg = loadBuyerConfig();
const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, '../public/index.html'), 'utf8');
const registry = cfg.REGISTRY_TOPIC_ID ? new Registry({ network: cfg.HEDERA_NETWORK, topicId: cfg.REGISTRY_TOPIC_ID }) : undefined;

// One agent per dashboard process so the session budget is visible across calls.
let agent: BuyerAgent | null = null;
let listeners = new Set<(e: AgentEvent) => void>();
function getAgent(budgetHbar: string, maxCallHbar: string): BuyerAgent {
  if (!agent) {
    agent = new BuyerAgent({
      network: cfg.HEDERA_NETWORK,
      accountId: cfg.BUYER_ACCOUNT_ID,
      privateKey: cfg.BUYER_PRIVATE_KEY,
      name: cfg.BUYER_NAME,
      maxPerCall: parseAmount(maxCallHbar || '0.05', 8),
      sessionBudget: parseAmount(budgetHbar || '0.5', 8),
      registry,
      verifyQuoteSigner: true,
      onEvent: (e) => listeners.forEach((l) => l(e)),
    });
  }
  return agent;
}

const app = express();
app.use(express.json());
app.get('/', (_req, res) => res.type('html').send(html));

app.get('/api/config', (_req, res) => {
  res.json({
    network: cfg.HEDERA_NETWORK,
    buyer: cfg.BUYER_ACCOUNT_ID,
    registryTopic: cfg.REGISTRY_TOPIC_ID || null,
    registryUrl: cfg.REGISTRY_TOPIC_ID ? hashscanTopic(cfg.HEDERA_NETWORK, cfg.REGISTRY_TOPIC_ID) : null,
    sellerUrl: cfg.SELLER_PUBLIC_URL ?? null,
    spent: agent ? formatAmount(agent.totalSpent, 8, 'HBAR') : '0 HBAR',
    remaining: agent ? formatAmount(agent.remaining, 8, 'HBAR') : null,
  });
});

app.get('/api/sellers', async (req, res) => {
  try {
    const sellerUrl = typeof req.query.seller === 'string' ? req.query.seller : cfg.SELLER_PUBLIC_URL;
    const a = getAgent(String(req.query.budget ?? ''), String(req.query.maxCall ?? ''));
    const listings = registry ? await registry.listServices() : sellerUrl ? [await a.listingFrom(sellerUrl)] : [];
    res.json({ listings });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** SSE: runs one task and streams events, then a final `result` event. */
app.get('/api/run', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const listener = (e: AgentEvent) => send('stage', e);
  listeners.add(listener);
  try {
    const a = getAgent(String(req.query.budget ?? ''), String(req.query.maxCall ?? ''));
    const sellerUrl = typeof req.query.seller === 'string' && req.query.seller ? req.query.seller : registry ? undefined : cfg.SELLER_PUBLIC_URL;
    const task = String(req.query.task ?? 'infer');
    const counter = req.query.counter ? Math.round(Number(req.query.counter) * 100) : undefined;
    const r =
      task === 'rate'
        ? await a.hbarRate({ sellerUrl })
        : await a.infer(String(req.query.prompt ?? 'Explain x402 in one sentence.'), { sellerUrl, maxTokens: Number(req.query.maxTokens ?? 200), counterBps: counter });
    send('result', {
      status: r.status,
      body: r.body,
      amount: r.amount !== null ? formatAmount(r.amount, 8, 'HBAR') : null,
      listPrice: formatAmount(r.offer.listPrice, 8, 'HBAR'),
      quote: r.quote ? { quoteId: r.quote.quoteId, amount: formatAmount(BigInt(r.quote.amount), 8, 'HBAR'), expiresAt: r.quote.expiresAt } : null,
      transaction: r.settlement?.transaction ?? null,
      hashscanUrl: r.hashscanUrl,
      onChain: r.onChain ? { result: r.onChain.result, consensus: r.onChain.consensus_timestamp, fee: r.onChain.charged_tx_fee } : null,
      seller: r.offer.listing.name,
      spent: formatAmount(a.totalSpent, 8, 'HBAR'),
      remaining: formatAmount(a.remaining, 8, 'HBAR'),
    });
  } catch (err) {
    send('error', { message: err instanceof Error ? err.message : String(err) });
  } finally {
    listeners.delete(listener);
    res.end();
  }
});

app.get('/api/receipts', async (req, res) => {
  const topic = typeof req.query.topic === 'string' ? req.query.topic : process.env.RECEIPTS_TOPIC_ID;
  if (!topic) {
    res.json({ receipts: [], topic: null });
    return;
  }
  try {
    const ledger = new ReceiptLedger({ network: cfg.HEDERA_NETWORK, topicId: topic });
    const audit = await ledger.audit({ expectedSellerAccount: typeof req.query.seller === 'string' ? req.query.seller : undefined });
    res.json({ topic, topicUrl: hashscanTopic(cfg.HEDERA_NETWORK, topic), receipts: audit.slice(-25).reverse() });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.listen(cfg.BUYER_PORT, () => {
  console.log(`[buyer] dashboard on http://localhost:${cfg.BUYER_PORT}  account ${cfg.BUYER_ACCOUNT_ID} on ${cfg.caip2}`);
});
