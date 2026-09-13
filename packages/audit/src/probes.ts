import { decodePaymentRequiredHeader } from '@x402/core/http';
import { signerControlsAccount, verifyQuoteSignature } from '@agora402/registry';
import { Quote, ServiceListing, estimateChatInput, listingContentHash, priceFor, type EndpointSpec, type PaymentOptionSpec, type QuoteRequest } from '@agora402/shared';
import { join, probe } from './http.js';
import { finding, type StageResult } from './types.js';

export interface ProbeContext {
  fetchImpl: typeof fetch;
  mirrorUrl: string;
  /** listing as the registry (or the caller) holds it; the audit vouches for exactly this content */
  listing: ServiceListing;
}

/**
 * Stage 1, manifest: is the seller alive, and does what it serves match what
 * it published? A listing that drifts from the live manifest means buyers
 * are pricing against stale terms.
 */
export async function probeManifest(ctx: ProbeContext): Promise<StageResult> {
  const { listing, fetchImpl } = ctx;
  const findings = [];
  const manifest = await probe<unknown>(fetchImpl, join(listing.baseUrl, '/.well-known/agora402.json'));
  const card = await probe<{ name?: string; description?: string; skills?: unknown[] }>(fetchImpl, join(listing.baseUrl, '/.well-known/agent.json'));
  const health = await probe<Record<string, unknown>>(fetchImpl, join(listing.baseUrl, '/health'));

  let live: ServiceListing | null = null;
  if (!manifest.ok) {
    findings.push(finding('high', 'manifest unreachable', `GET /.well-known/agora402.json answered ${manifest.status ?? manifest.error}. A seller that cannot be reached cannot be vouched for.`));
  } else {
    const parsed = ServiceListing.safeParse(manifest.body);
    if (!parsed.success) findings.push(finding('high', 'manifest is not a valid listing', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')));
    else {
      live = parsed.data;
      if (live.uaid !== listing.uaid) findings.push(finding('critical', 'identity mismatch', `live manifest is ${live.uaid}, registry listing is ${listing.uaid}`));
      if (live.payTo !== listing.payTo) findings.push(finding('critical', 'payment account differs from the registry listing', `live manifest pays ${live.payTo}, registry says ${listing.payTo}`));
      else if (listingContentHash(live) !== listingContentHash(listing)) {
        findings.push(finding('high', 'live terms differ from the published listing', 'endpoints, prices or URLs served by the seller do not match what buyers read from the registry; the seller should republish'));
      }
    }
  }
  if (!card.ok) findings.push(finding('low', 'no A2A agent card', 'GET /.well-known/agent.json failed; generic A2A tooling cannot discover this seller'));
  if (!health.ok) findings.push(finding('low', 'no health endpoint', 'GET /health failed'));
  if (/^http:\/\//.test(listing.baseUrl) && !/localhost|127\.0\.0\.1/.test(listing.baseUrl)) findings.push(finding('medium', 'plain HTTP base URL', 'quotes and payment headers travel unencrypted'));

  const summary = live
    ? `Seller reachable in ${manifest.elapsedMs} ms; live manifest ${findings.some((f) => f.severity === 'high' || f.severity === 'critical') ? 'does NOT match' : 'matches'} the registry listing (${listing.endpoints.length} endpoint(s)).`
    : `Seller manifest could not be read (${manifest.status ?? manifest.error}).`;
  return {
    summary,
    findings,
    evidence: {
      manifestStatus: manifest.status,
      manifestMs: manifest.elapsedMs,
      liveContentHash: live ? listingContentHash(live) : null,
      listingContentHash: listingContentHash(listing),
      agentCard: card.ok ? { name: card.body?.name, skills: Array.isArray(card.body?.skills) ? card.body!.skills.length : 0 } : null,
      health: health.ok ? health.body : null,
    },
    model: 'deterministic',
  };
}

/** A small, cheap request for the endpoint so the 402 can be compared with the published pricing model. */
export function sampleRequest(endpoint: EndpointSpec): { body: unknown; estimate: QuoteRequest['estimate'] } {
  if (endpoint.id === 'infer') {
    const body = { messages: [{ role: 'user', content: 'Reply with the single word pong.' }], max_tokens: 16 };
    return { body, estimate: estimateChatInput(body) };
  }
  if (endpoint.id === 'audit') return { body: { subject: 'uaid:aid:probe' }, estimate: { units: 1 } };
  return { body: endpoint.method === 'POST' ? {} : undefined, estimate: { units: 1 } };
}

/**
 * Stage 2, payment integrity: ask for a quote and make an unpaid request to
 * every endpoint. The seller must sign quotes with the key of the account it
 * asks buyers to pay, the 402 must name that same account, and the amount
 * must be what the published pricing model (or the signed quote) says.
 */
export async function probePayment(ctx: ProbeContext, now: () => number = () => Math.floor(Date.now() / 1000)): Promise<StageResult> {
  const { listing, fetchImpl } = ctx;
  const findings = [];
  const evidence: Record<string, unknown>[] = [];
  let signerChecked: boolean | null = null;

  for (const endpoint of listing.endpoints) {
    const option: PaymentOptionSpec = endpoint.accepts.find((a) => a.asset === '0.0.0') ?? endpoint.accepts[0];
    const { body, estimate } = sampleRequest(endpoint);
    const listPrice = priceFor(option.pricing, estimate);
    const e: Record<string, unknown> = { endpoint: endpoint.id, asset: option.asset, listPrice: listPrice.toString() };

    // Quote
    const quoteReq: QuoteRequest = { endpointId: endpoint.id, estimate, asset: option.asset };
    const q = await probe<{ quote?: unknown; countered?: boolean }>(fetchImpl, join(listing.baseUrl, listing.quotePath), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(quoteReq) });
    let quote: Quote | null = null;
    if (!q.ok) findings.push(finding('medium', `no quote for ${endpoint.id}`, `POST ${listing.quotePath} answered ${q.status ?? q.error}; buyers cannot negotiate this endpoint`));
    else {
      const parsed = Quote.safeParse(q.body?.quote);
      if (!parsed.success) findings.push(finding('high', `malformed quote for ${endpoint.id}`, 'quote does not match the Agora402 schema'));
      else {
        quote = parsed.data;
        e.quoteAmount = quote.amount;
        if (!verifyQuoteSignature(quote)) findings.push(finding('high', `quote signature invalid for ${endpoint.id}`, 'the quote does not verify against the key it names'));
        if (quote.seller !== listing.uaid) findings.push(finding('high', `quote signed for another seller (${endpoint.id})`, `quote.seller ${quote.seller}`));
        if (quote.asset !== option.asset) findings.push(finding('medium', `quote asset differs (${endpoint.id})`, `${quote.asset} instead of ${option.asset}`));
        if (BigInt(quote.amount) > listPrice) findings.push(finding('high', `quote above published list price (${endpoint.id})`, `quoted ${quote.amount}, list ${listPrice} for the same work`));
        const ttl = quote.expiresAt - now();
        if (ttl <= 0) findings.push(finding('medium', `quote already expired (${endpoint.id})`, `expiresAt ${quote.expiresAt}`));
        else if (ttl > 3600) findings.push(finding('low', `very long quote validity (${endpoint.id})`, `${ttl}s; stale prices can be replayed`));
        if (signerChecked === null) {
          signerChecked = await signerControlsAccount(ctx.mirrorUrl, listing.payTo, quote.signerPublicKey, fetchImpl);
          if (!signerChecked) findings.push(finding('critical', 'quotes are signed by a key that does not control the paid account', `signer is not the key of ${listing.payTo} on the mirror node`));
        }
      }
    }

    // Unpaid request with the quote attached
    const url = new URL(join(listing.baseUrl, endpoint.path));
    if (quote && endpoint.method === 'GET') url.searchParams.set('quoteId', quote.quoteId);
    const reqBody = endpoint.method === 'POST' ? JSON.stringify({ ...(body as Record<string, unknown>), ...(quote ? { quoteId: quote.quoteId } : {}) }) : undefined;
    const r = await probe<unknown>(fetchImpl, url.toString(), { method: endpoint.method, headers: reqBody ? { 'content-type': 'application/json' } : undefined, body: reqBody });
    e.unpaidStatus = r.status;
    if (r.status === 200) findings.push(finding('medium', `${endpoint.id} served without payment`, 'the endpoint answered 200 to an unpaid request, so its receipts prove nothing'));
    else if (r.status !== 402) findings.push(finding('medium', `${endpoint.id} did not answer 402`, `unpaid request answered ${r.status ?? r.error}`));
    else {
      const header = r.headers['payment-required'];
      if (!header) findings.push(finding('high', `402 without PAYMENT-REQUIRED header (${endpoint.id})`, 'not an x402 v2 response; buyers cannot pay it'));
      else {
        try {
          const pr = decodePaymentRequiredHeader(header);
          const accepts = pr.accepts ?? [];
          e.accepts = accepts.map((a) => ({ network: a.network, asset: a.asset, amount: a.amount, payTo: a.payTo }));
          const match = accepts.find((a) => a.asset === option.asset && a.network === option.network);
          if (!match) findings.push(finding('medium', `402 offers no option in ${option.symbol} on ${option.network} (${endpoint.id})`, JSON.stringify(e.accepts)));
          else {
            if (match.payTo !== listing.payTo) findings.push(finding('critical', `payment diverted (${endpoint.id})`, `the 402 asks buyers to pay ${match.payTo}, the listing says ${listing.payTo}`));
            const expected = quote ? BigInt(quote.amount) : listPrice;
            if (BigInt(match.amount) > expected) findings.push(finding('high', `402 charges more than ${quote ? 'the signed quote' : 'the published price'} (${endpoint.id})`, `asked ${match.amount}, expected ${expected}`));
            if (match.scheme !== 'exact') findings.push(finding('low', `unexpected scheme ${match.scheme} (${endpoint.id})`));
          }
          for (const a of accepts) if (a.payTo !== listing.payTo) findings.push(finding('critical', `an accepted payment option pays a different account (${endpoint.id})`, `${a.asset} -> ${a.payTo}`));
        } catch (err) {
          findings.push(finding('high', `unreadable PAYMENT-REQUIRED header (${endpoint.id})`, err instanceof Error ? err.message : String(err)));
        }
      }
    }
    evidence.push(e);
  }

  const dedup = dedupe(findings);
  const worst = dedup.some((f) => f.severity === 'critical' || f.severity === 'high');
  return {
    summary: `${listing.endpoints.length} endpoint(s) probed: quotes ${signerChecked ? 'signed by the key of ' + listing.payTo : signerChecked === false ? 'NOT signed by the paid account' : 'not verifiable'}; 402s ${worst ? 'show integrity problems' : 'name the listed account and honour the published prices'}.`,
    findings: dedup,
    evidence: { endpoints: evidence, signerControlsPayTo: signerChecked },
    model: 'deterministic',
  };
}

export function dedupe<T extends { title: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((f) => (seen.has(f.title) ? false : (seen.add(f.title), true)));
}
