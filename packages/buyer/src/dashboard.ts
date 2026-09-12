/**
 * Buyer dashboard: a single page that drives the BuyerAgent and streams every
 * stage (discover, quote, 402, sign, settle, verify) as newline-delimited JSON
 * over a plain fetch response. Same agent code and budgets as the CLI.
 */
import express, { type Request, type Response } from 'express';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Registry, ReceiptLedger } from '@agora402/registry';
import { formatAmount, hashscanAccount, hashscanTopic, parseAmount } from '@agora402/shared';
import { BuyerAgent, type AgentEvent } from './agent.js';
import { loadBuyerConfig } from './config.js';

const cfg = loadBuyerConfig();
const here = dirname(fileURLToPath(import.meta.url));
const htmlPath = resolve(here, '../public/index.html');
const registry = cfg.REGISTRY_TOPIC_ID ? new Registry({ network: cfg.HEDERA_NETWORK, topicId: cfg.REGISTRY_TOPIC_ID }) : undefined;
const receiptsTopic = process.env.RECEIPTS_TOPIC_ID || undefined;

// One agent per dashboard process so the session budget is visible across calls.
let agent: BuyerAgent | null = null;
const listeners = new Set<(e: AgentEvent) => void>();
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
const hbar = (v: bigint | string | number) => formatAmount(BigInt(v), 8, 'HBAR');

const app = express();
app.use(express.json());
app.get('/', (_req, res) => res.type('html').send(readFileSync(htmlPath, 'utf8')));

app.get('/api/config', (_req, res) => {
  res.json({
    network: cfg.HEDERA_NETWORK,
    buyer: cfg.BUYER_ACCOUNT_ID,
    buyerUrl: hashscanAccount(cfg.HEDERA_NETWORK, cfg.BUYER_ACCOUNT_ID),
    buyerUaid: agent?.uaid ?? null,
    registryTopic: cfg.REGISTRY_TOPIC_ID || null,
    registryUrl: cfg.REGISTRY_TOPIC_ID ? hashscanTopic(cfg.HEDERA_NETWORK, cfg.REGISTRY_TOPIC_ID) : null,
    receiptsTopic: receiptsTopic ?? null,
    receiptsUrl: receiptsTopic ? hashscanTopic(cfg.HEDERA_NETWORK, receiptsTopic) : null,
    sellerUrl: cfg.SELLER_PUBLIC_URL ?? null,
    spent: agent ? agent.totalSpent.toString() : '0',
    remaining: agent ? agent.remaining.toString() : null,
  });
});

app.get('/api/sellers', async (req, res) => {
  try {
    const sellerUrl = typeof req.query.seller === 'string' && req.query.seller ? req.query.seller : cfg.SELLER_PUBLIC_URL;
    const a = getAgent(String(req.query.budget ?? ''), String(req.query.maxCall ?? ''));
    const listings = registry ? await registry.listServices() : sellerUrl ? [await a.listingFrom(sellerUrl)] : [];
    // Health of each seller, best effort, so the UI can show facilitator and model.
    const health = await Promise.all(
      listings.map(async (l) => {
        try {
          const r = await fetch(`${l.baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
          return r.ok ? await r.json() : null;
        } catch {
          return null;
        }
      }),
    );
    res.json({ listings: listings.map((l, i) => ({ ...l, health: health[i] })) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** Streams NDJSON lines: {type:'stage', ...event} then {type:'result', ...} or {type:'error', message}. */
app.post('/api/run', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const send = (obj: Record<string, unknown>) => res.write(JSON.stringify(obj) + '\n');
  const listener = (e: AgentEvent) => send({ type: 'stage', ...e });
  listeners.add(listener);
  const body = (req.body ?? {}) as Record<string, string | undefined>;
  try {
    const a = getAgent(body.budget ?? '', body.maxCall ?? '');
    const sellerUrl = body.seller ? body.seller : registry ? undefined : cfg.SELLER_PUBLIC_URL;
    const counter = body.counter ? Math.round(Number(body.counter) * 100) : undefined;
    const started = Date.now();
    const r =
      body.task === 'rate'
        ? await a.hbarRate({ sellerUrl })
        : await a.infer(body.prompt || 'Explain x402 in one sentence.', { sellerUrl, maxTokens: Number(body.maxTokens ?? 200), counterBps: counter });
    const chat = r.body as { choices?: Array<{ message?: { content?: string } }>; usage?: Record<string, number>; model?: string } | Record<string, unknown>;
    const answer = 'choices' in chat && Array.isArray(chat.choices) ? chat.choices[0]?.message?.content ?? '' : null;
    send({
      type: 'result',
      ok: r.status < 400,
      status: r.status,
      task: body.task ?? 'infer',
      answer,
      raw: r.body,
      model: 'model' in chat ? chat.model : null,
      usage: 'usage' in chat ? chat.usage : null,
      seller: r.offer.listing.name,
      sellerUaid: r.offer.listing.uaid,
      payTo: r.offer.listing.payTo,
      listPrice: r.offer.listPrice.toString(),
      quote: r.quote ? { quoteId: r.quote.quoteId, amount: r.quote.amount, expiresAt: r.quote.expiresAt, countered: Boolean((r.quote.basis as { countered?: boolean })?.countered) } : null,
      paid: r.amount !== null ? r.amount.toString() : null,
      transaction: r.settlement?.transaction ?? null,
      hashscanUrl: r.hashscanUrl,
      onChain: r.onChain ? { result: r.onChain.result, consensus: r.onChain.consensus_timestamp, fee: r.onChain.charged_tx_fee, transfers: r.onChain.transfers } : null,
      spent: a.totalSpent.toString(),
      remaining: a.remaining.toString(),
      elapsedMs: Date.now() - started,
    });
  } catch (err) {
    send({ type: 'error', message: err instanceof Error ? err.message : String(err), spent: agent?.totalSpent.toString() ?? '0', remaining: agent?.remaining.toString() ?? null });
  } finally {
    listeners.delete(listener);
    res.end();
  }
});

app.get('/api/receipts', async (req, res) => {
  const topic = typeof req.query.topic === 'string' && req.query.topic ? req.query.topic : receiptsTopic;
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
  console.log(`[buyer] registry ${cfg.REGISTRY_TOPIC_ID || '(none, using SELLER_PUBLIC_URL)'}  receipts ${receiptsTopic ?? '(none)'}  session budget shown as ${hbar(0)} until the first run`);
});
