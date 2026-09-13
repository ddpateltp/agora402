/**
 * Buyer dashboard: a single page that drives the BuyerAgent and streams every
 * stage (discover, quote, 402, sign, settle, verify) as newline-delimited JSON
 * over a plain fetch response. Same agent code and budgets as the CLI.
 */
import express, { type Request, type Response } from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marketplace, Registry, ReceiptLedger, ReputationLedger, TrustLedger } from '@agora402/registry';
import { formatAmount, hashscanAccount, hashscanTopic, newAuditId, parseAmount } from '@agora402/shared';
import { BuyerAgent, type AgentEvent } from './agent.js';
import { loadBuyerConfig } from './config.js';

const cfg = loadBuyerConfig();
const here = dirname(fileURLToPath(import.meta.url));
// The site is packages/web, built by `npm run build` into packages/web/dist and served from here.
const webDist = resolve(here, '../../web/dist');
const registry = cfg.REGISTRY_TOPIC_ID ? new Registry({ network: cfg.HEDERA_NETWORK, topicId: cfg.REGISTRY_TOPIC_ID }) : undefined;
const receiptsTopic = cfg.RECEIPTS_TOPIC_ID || undefined;
const trust = cfg.AUDIT_TOPIC_ID ? new TrustLedger({ network: cfg.HEDERA_NETWORK, topicId: cfg.AUDIT_TOPIC_ID }) : undefined;
const reputation = cfg.REPUTATION_TOPIC_ID ? new ReputationLedger({ network: cfg.HEDERA_NETWORK, topicId: cfg.REPUTATION_TOPIC_ID }) : undefined;
const marketplace = registry ? new Marketplace({ registry, trust, reputation }) : undefined;

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
      trust,
      reputation,
      verifyQuoteSigner: true,
      onEvent: (e) => listeners.forEach((l) => l(e)),
    });
  }
  return agent;
}
const hbar = (v: bigint | string | number) => formatAmount(BigInt(v), 8, 'HBAR');

const app = express();
app.use(express.json());
const webIndex = resolve(webDist, 'index.html');
if (existsSync(webIndex)) app.use(express.static(webDist, { index: false }));
const sendIndex = (_req: Request, res: Response) => {
  if (existsSync(webIndex)) res.type('html').send(readFileSync(webIndex, 'utf8'));
  else res.type('text').status(503).send('The site is not built. Run `npm run build` (or `npm run web` for the Vite dev server on http://localhost:4405).');
};
app.get(['/', '/buy', '/audit', '/trail', '/demo'], sendIndex);

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
    auditTopic: cfg.AUDIT_TOPIC_ID || null,
    auditUrl: cfg.AUDIT_TOPIC_ID ? hashscanTopic(cfg.HEDERA_NETWORK, cfg.AUDIT_TOPIC_ID) : null,
    reputationTopic: cfg.REPUTATION_TOPIC_ID || null,
    reputationUrl: cfg.REPUTATION_TOPIC_ID ? hashscanTopic(cfg.HEDERA_NETWORK, cfg.REPUTATION_TOPIC_ID) : null,
    minTrust: agent?.minTrust ?? null,
    sellerUrl: cfg.SELLER_PUBLIC_URL ?? null,
    spent: agent ? agent.totalSpent.toString() : '0',
    remaining: agent ? agent.remaining.toString() : null,
  });
});

/** Drop the session agent so spend starts from zero (used by the demo page's reset). */
app.post('/api/reset', (_req, res) => {
  agent = null;
  res.json({ ok: true });
});

app.get('/api/sellers', async (req, res) => {
  try {
    const sellerUrl = typeof req.query.seller === 'string' && req.query.seller ? req.query.seller : cfg.SELLER_PUBLIC_URL;
    const a = getAgent(String(req.query.budget ?? ''), String(req.query.maxCall ?? ''));
    const listings = marketplace ? await marketplace.list() : sellerUrl ? [{ ...(await a.listingFrom(sellerUrl)), trust: null, reputation: null }] : [];
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
    a.minTrust = body.minTrust !== undefined && body.minTrust !== '' ? Number(body.minTrust) : undefined;
    const sellerUrl = body.seller ? body.seller : registry ? undefined : cfg.SELLER_PUBLIC_URL;
    const counter = body.counter ? Math.round(Number(body.counter) * 100) : undefined;
    const started = Date.now();
    const r =
      body.task === 'rate'
        ? await a.hbarRate({ sellerUrl })
        : await a.infer(body.prompt || 'Explain x402 in one sentence.', { sellerUrl, maxTokens: Number(body.maxTokens ?? 400), counterBps: counter });
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
      facilitator: r.offer.listing.facilitator,
      resource: r.offer.endpoint.path,
      endpointId: r.offer.endpoint.id,
      // The UI formats every amount with BigInt, so it needs the asset's decimals and label.
      asset: r.asset ?? r.offer.option.asset,
      symbol: r.offer.option.symbol,
      decimals: r.offer.option.decimals,
      listPrice: r.offer.listPrice.toString(),
      quote: r.quote ? { quoteId: r.quote.quoteId, amount: r.quote.amount, expiresAt: r.quote.expiresAt, countered: Boolean((r.quote.basis as { countered?: boolean })?.countered) } : null,
      paid: r.amount !== null ? r.amount.toString() : null,
      transaction: r.settlement?.transaction ?? null,
      hashscanUrl: r.hashscanUrl,
      onChain: r.onChain ? { result: r.onChain.result, consensus: r.onChain.consensus_timestamp, fee: r.onChain.charged_tx_fee, transfers: r.onChain.transfers } : null,
      trust: r.offer.trust,
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

/**
 * Buy an audit of a seller from an auditor agent. Streams NDJSON: the buyer's
 * payment stages ({type:'stage'}), the auditor's own progress relayed from its
 * free events endpoint ({type:'audit'}), then {type:'result'} or {type:'error'}.
 */
app.post('/api/audit', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const send = (obj: Record<string, unknown>) => res.write(JSON.stringify(obj) + '\n');
  const body = (req.body ?? {}) as { subject?: string; sellerUrl?: string; auditor?: string; budget?: string; maxCall?: string };
  const auditId = newAuditId();
  let progress: Promise<void> | null = null;
  const listener = (e: AgentEvent) => {
    send({ type: 'stage', ...e });
    if (e.stage === 'requesting' && e.data?.endpointId === 'audit' && typeof e.data.baseUrl === 'string' && !progress) progress = relayAuditorEvents(e.data.baseUrl, auditId, send);
  };
  listeners.add(listener);
  try {
    const a = getAgent(body.budget ?? '', body.maxCall ?? '');
    if (!body.subject && !body.sellerUrl) throw new Error('subject (uaid) or sellerUrl required');
    const started = Date.now();
    const r = await a.audit({ uaid: body.subject, sellerUrl: body.sellerUrl }, { auditorUrl: body.auditor, auditId });
    if (progress) await progress;
    send({
      type: 'result',
      ok: r.status < 400,
      status: r.status,
      auditId,
      auditor: { name: r.offer.listing.name, uaid: r.offer.listing.uaid, payTo: r.offer.listing.payTo, baseUrl: r.offer.listing.baseUrl },
      paid: r.amount !== null ? r.amount.toString() : null,
      asset: r.asset ?? r.offer.option.asset,
      symbol: r.offer.option.symbol,
      decimals: r.offer.option.decimals,
      transaction: r.settlement?.transaction ?? null,
      hashscanUrl: r.hashscanUrl,
      audit: r.status < 400 ? r.body : null,
      error: r.status >= 400 ? r.body : null,
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

/** Follow the auditor's free progress stream and forward each line to the dashboard client. */
async function relayAuditorEvents(auditorBaseUrl: string, auditId: string, send: (obj: Record<string, unknown>) => void): Promise<void> {
  try {
    const res = await fetch(`${auditorBaseUrl.replace(/\/$/, '')}/v1/audits/${auditId}/events`, { signal: AbortSignal.timeout(10 * 60 * 1000) });
    if (!res.ok || !res.body) return;
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          send({ type: 'audit', ...(JSON.parse(line) as Record<string, unknown>) });
        } catch {
          /* skip malformed line */
        }
      }
    }
  } catch (err) {
    send({ type: 'audit', event: 'relay_error', message: err instanceof Error ? err.message : String(err) });
  }
}

/** Attestations on the audit topic, or the full trail of one audit (?auditId=). */
app.get('/api/audits', async (req, res) => {
  if (!trust) {
    res.json({ topic: null, attestations: [], trail: [] });
    return;
  }
  try {
    const auditId = typeof req.query.auditId === 'string' ? req.query.auditId : undefined;
    if (auditId) {
      res.json({ topic: trust.topicId, topicUrl: hashscanTopic(cfg.HEDERA_NETWORK, trust.topicId), trail: await trust.trail(auditId) });
      return;
    }
    const all = await trust.list();
    const attestations = [...(await trust.attestations()).values()].sort((a, b) => (a.consensusTimestamp < b.consensusTimestamp ? 1 : -1));
    res.json({ topic: trust.topicId, topicUrl: hashscanTopic(cfg.HEDERA_NETWORK, trust.topicId), attestations, messages: all.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** Rate a seller after paying it. Body: {subject, subjectAccount, transactionId, score, comment?}. */
app.post('/api/rate', async (req, res) => {
  const body = (req.body ?? {}) as { subject?: string; subjectAccount?: string; transactionId?: string; score?: number | string; comment?: string };
  try {
    const a = getAgent('', '');
    const r = await a.rate({ subject: String(body.subject ?? ''), subjectAccount: String(body.subjectAccount ?? ''), transactionId: String(body.transactionId ?? ''), score: Number(body.score), comment: body.comment });
    res.json({ ...r, topicId: reputation?.topicId ?? null, topicUrl: reputation ? hashscanTopic(cfg.HEDERA_NETWORK, reputation.topicId) : null });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** Verified reputation per seller uaid. */
app.get('/api/reputation', async (_req, res) => {
  if (!reputation) {
    res.json({ topic: null, sellers: {} });
    return;
  }
  try {
    res.json({ topic: reputation.topicId, topicUrl: hashscanTopic(cfg.HEDERA_NETWORK, reputation.topicId), sellers: Object.fromEntries(await reputation.summaries()) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
