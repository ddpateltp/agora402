import express, { type Express, type Request, type Response } from 'express';
import { paymentMiddleware } from '@x402/express';
import type { x402ResourceServer, SettleResultContext, HTTPTransportContext } from '@x402/core/server';
import { getExchangeRate, parsePrivateKey } from '@agora402/registry';
import { QuoteRequest, Receipt, mirrorNodeUrl, sha256Hex, shortNetwork, type Quote, type ServiceListing } from '@agora402/shared';
import type { SellerConfig } from './config.js';
import { buildIdentity, buildListing } from './catalogue.js';
import { createLlmProvider, type LlmProvider } from './llm.js';
import { QuoteBook } from './quotes.js';
import { ReceiptWriter } from './receipts.js';
import { buildRoutes, quoteIdFrom, type PricingContext } from './x402.js';

export const USAGE_HEADER = 'x-agora-usage';

export interface SellerAppOptions {
  cfg: SellerConfig;
  resourceServer: x402ResourceServer;
  llm?: LlmProvider;
  receipts?: ReceiptWriter;
  quotes?: QuoteBook;
  fetchImpl?: typeof fetch;
  /** skip the facilitator /supported sync at startup (tests) */
  syncFacilitatorOnStart?: boolean;
  log?: (msg: string) => void;
}

export interface SellerApp {
  app: Express;
  listing: ServiceListing;
  quotes: QuoteBook;
  receipts: ReceiptWriter;
}

export function createSellerApp(opts: SellerAppOptions): SellerApp {
  const { cfg } = opts;
  const log = opts.log ?? ((m: string) => console.log(`[seller] ${m}`));
  const fetchImpl = opts.fetchImpl ?? fetch;
  const listing = buildListing(cfg);
  const { uaid } = buildIdentity(cfg);
  const llm = opts.llm ?? createLlmProvider(cfg, fetchImpl);
  const receipts = opts.receipts ?? new ReceiptWriter({ network: cfg.HEDERA_NETWORK, log });
  const quotes =
    opts.quotes ??
    new QuoteBook({
      sellerUaid: uaid,
      network: cfg.caip2,
      signingKey: parsePrivateKey(cfg.SELLER_PRIVATE_KEY),
      endpoints: listing.endpoints,
    });
  const pricing: PricingContext = { payTo: cfg.SELLER_ACCOUNT_ID, quotes };

  // Receipt on every settled payment. The hook sees the request, the settled
  // transaction and the buffered response, so the receipt can carry the
  // metering evidence (usage header) and a hash of what was delivered.
  opts.resourceServer.onAfterSettle(async (ctx: SettleResultContext) => {
    if (!ctx.result.success) return;
    const transport = ctx.transportContext as HTTPTransportContext | undefined;
    const path = transport?.request.path ?? 'unknown';
    const quoteId = transport ? quoteIdFrom(transport.request) : undefined;
    let usage: Record<string, unknown> = {};
    const usageHeader = transport?.responseHeaders?.[USAGE_HEADER];
    if (usageHeader) {
      try {
        usage = JSON.parse(usageHeader) as Record<string, unknown>;
      } catch {
        usage = { raw: usageHeader };
      }
    }
    const receipt: Receipt = {
      v: 1,
      type: 'receipt',
      seller: uaid,
      transactionId: ctx.result.transaction,
      network: ctx.requirements.network as Receipt['network'],
      payer: ctx.result.payer ?? 'unknown',
      payTo: ctx.requirements.payTo,
      asset: ctx.requirements.asset,
      amount: ctx.result.amount ?? ctx.requirements.amount,
      resource: path,
      quoteId,
      usage,
      responseHash: transport?.responseBody ? sha256Hex(new Uint8Array(transport.responseBody)) : undefined,
      issuedAt: new Date().toISOString(),
    };
    if (quoteId) quotes.consume(quoteId);
    receipts.record(receipt);
    log(`settled ${receipt.amount} of ${receipt.asset} from ${receipt.payer} for ${path} tx ${receipt.transactionId}`);
  });

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  // Discovery documents: our own manifest and an A2A-style agent card.
  app.get('/.well-known/agora402.json', (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json(listing);
  });
  app.get('/.well-known/agent.json', (_req, res) => {
    res.json(agentCard(listing, cfg));
  });
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uaid, network: cfg.caip2, facilitator: cfg.FACILITATOR_URL, llm: llm.name, receiptsToHcs: receipts.enabled });
  });
  app.get('/receipts', (req, res) => {
    const limit = Math.min(200, Number(req.query.limit ?? 50) || 50);
    res.json({ receipts: receipts.list(limit) });
  });

  // A2A-style negotiation. Free to call: the seller wants buyers to ask.
  app.post('/a2a/quote', (req, res) => {
    const parsed = QuoteRequest.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid quote request', issues: parsed.error.issues });
      return;
    }
    const decision = quotes.request(parsed.data);
    if (!decision.ok) {
      res.status(decision.status).json({ error: decision.reason, minimumAmount: decision.minimumAmount, listPrice: decision.listPrice });
      return;
    }
    res.json({ quote: decision.quote, countered: decision.countered } satisfies { quote: Quote; countered: boolean });
  });

  // Everything below is paid. The middleware answers 402 with per-request
  // pricing, verifies PAYMENT-SIGNATURE with Blocky402, runs the handler,
  // then settles and attaches PAYMENT-RESPONSE.
  app.use(paymentMiddleware(buildRoutes(listing.endpoints, pricing, cfg.SELLER_NAME), opts.resourceServer, undefined, undefined, opts.syncFacilitatorOnStart ?? true));

  app.post('/v1/infer', async (req: Request, res: Response) => {
    const { quoteId: _quoteId, ...body } = (req.body ?? {}) as Record<string, unknown>;
    const messages = Array.isArray(body.messages) ? (body.messages as Array<{ role: string; content: unknown }>) : [];
    if (messages.length === 0 || !messages.every((m) => typeof m.content === 'string' && ['system', 'user', 'assistant'].includes(m.role))) {
      res.status(400).json({ error: 'messages[] of {role, content:string} required' });
      return;
    }
    try {
      const result = await llm.chat({
        messages: messages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
        max_tokens: typeof body.max_tokens === 'number' ? body.max_tokens : 256,
        temperature: typeof body.temperature === 'number' ? body.temperature : undefined,
      });
      const usage = { provider: result.provider, model: result.model, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens };
      res.setHeader(USAGE_HEADER, JSON.stringify(usage));
      res.json({
        id: `agora-${Date.now().toString(36)}`,
        object: 'chat.completion',
        model: result.model,
        choices: [{ index: 0, message: { role: 'assistant', content: result.content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: usage.inputTokens, completion_tokens: usage.outputTokens, total_tokens: usage.inputTokens + usage.outputTokens },
        agora: { seller: uaid, quoteId: typeof _quoteId === 'string' ? _quoteId : null },
      });
    } catch (err) {
      // 5xx makes the middleware cancel settlement: the buyer is not charged for a failed call.
      log(`inference failed: ${err instanceof Error ? err.message : String(err)}`);
      res.status(502).json({ error: 'inference upstream failed' });
    }
  });

  app.get('/v1/rates/hbar', async (_req, res) => {
    try {
      const rate = await getExchangeRate(mirrorNodeUrl(shortNetwork(cfg.caip2)), fetchImpl);
      res.setHeader(USAGE_HEADER, JSON.stringify({ units: 1, unit: 'query' }));
      res.json({
        pair: 'HBAR/USD',
        usdPerHbar: rate.centsPerHbar / 100,
        centsPerHbar: rate.centsPerHbar,
        source: 'hedera network exchange rate file via mirror node',
        expirationTime: rate.expirationTime,
        fetchedAt: new Date().toISOString(),
        agora: { seller: uaid },
      });
    } catch (err) {
      log(`rate lookup failed: ${err instanceof Error ? err.message : String(err)}`);
      res.status(502).json({ error: 'rate source unavailable' });
    }
  });

  return { app, listing, quotes, receipts };
}

/** A2A agent card with the x402 payment extension, so generic A2A tooling can find us. */
export function agentCard(listing: ServiceListing, cfg: SellerConfig) {
  return {
    name: listing.name,
    description: 'Agora402 seller: pay-per-request AI and data services on Hedera over x402.',
    url: listing.baseUrl,
    version: listing.version,
    provider: { organization: 'Agora402', url: 'https://github.com/ddpateltp/agora402' },
    uaid: listing.uaid,
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extensions: [
        {
          uri: 'https://github.com/a2aproject/A2A/blob/main/docs/extensions/x402.md',
          description: 'x402 micropayments settled on Hedera via Blocky402',
          required: true,
          params: { payment_network: cfg.caip2, facilitator: cfg.FACILITATOR_URL, assets: [...new Set(listing.endpoints.flatMap((e) => e.accepts.map((a) => a.symbol)))] },
        },
        { uri: `${listing.baseUrl}/.well-known/agora402.json`, description: 'Agora402 listing with pricing models and quote endpoint', required: false },
      ],
    },
    skills: listing.endpoints.map((e) => ({ id: e.id, name: e.id, description: e.description, tags: ['x402', 'hedera'] })),
  };
}
