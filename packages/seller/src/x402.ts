import { HTTPFacilitatorClient, x402ResourceServer, type RouteConfig, type RoutesConfig, type HTTPRequestContext } from '@x402/core/server';
import type { Price } from '@x402/core/types';
import { ExactHederaScheme } from '@x402/hedera/exact/server';
import { estimateChatInput, priceFor, type EndpointSpec, type PaymentOptionSpec } from '@agora402/shared';
import type { QuoteBook } from './quotes.js';

/** Resource server bound to the Blocky402 facilitator, Hedera exact scheme. */
export function createResourceServer(facilitatorUrl: string): x402ResourceServer {
  const facilitator = new HTTPFacilitatorClient({ url: facilitatorUrl });
  return new x402ResourceServer(facilitator).register('hedera:*', new ExactHederaScheme({}));
}

export interface PricingContext {
  payTo: string;
  quotes: QuoteBook;
  /** for tests: override the work estimate derived from the request */
  estimateOverride?: (endpoint: EndpointSpec, ctx: HTTPRequestContext) => { inputTokens?: number; maxOutputTokens?: number; units?: number };
}

/** Pull a quoteId out of the body (POST) or query string (GET). */
export function quoteIdFrom(ctx: HTTPRequestContext): string | undefined {
  const body = ctx.adapter.getBody?.() as { quoteId?: unknown } | undefined;
  if (body && typeof body.quoteId === 'string') return body.quoteId;
  const q = ctx.adapter.getQueryParam?.('quoteId');
  return typeof q === 'string' ? q : undefined;
}

/** Work estimate for pricing, from the request itself. Same functions the buyer uses to ask for a quote. */
export function estimateFor(endpoint: EndpointSpec, ctx: HTTPRequestContext) {
  if (endpoint.id === 'infer') return estimateChatInput(ctx.adapter.getBody?.());
  return { units: 1 };
}

/**
 * Dynamic price for one payment option. If the request references a valid
 * quote for this endpoint and asset, the 402 carries the agreed amount;
 * otherwise the list price is computed from the request. This is what makes
 * the charge per call rather than a flat fee.
 */
export function dynamicPrice(endpoint: EndpointSpec, option: PaymentOptionSpec, pc: PricingContext): (ctx: HTTPRequestContext) => Price {
  return (ctx: HTTPRequestContext): Price => {
    const quoteId = quoteIdFrom(ctx);
    if (quoteId) {
      const quote = pc.quotes.lookup(quoteId, endpoint.id, option.asset);
      if (quote) return { asset: option.asset, amount: quote.amount };
    }
    const estimate = pc.estimateOverride ? pc.estimateOverride(endpoint, ctx) : estimateFor(endpoint, ctx);
    const amount = priceFor(option.pricing, estimate);
    return { asset: option.asset, amount: (amount > 0n ? amount : 1n).toString() };
  };
}

/** x402 route table for the catalogue. Keys are "METHOD /path" as @x402/express expects. */
export function buildRoutes(endpoints: EndpointSpec[], pc: PricingContext, serviceName: string): RoutesConfig {
  const routes: Record<string, RouteConfig> = {};
  for (const ep of endpoints) {
    routes[`${ep.method} ${ep.path}`] = {
      accepts: ep.accepts.map((opt) => ({
        scheme: 'exact',
        network: opt.network,
        payTo: pc.payTo,
        price: dynamicPrice(ep, opt, pc),
        maxTimeoutSeconds: 300,
      })),
      description: ep.description,
      mimeType: 'application/json',
      serviceName,
      tags: ['agora402', ep.id],
      unpaidResponseBody: async (ctx: HTTPRequestContext) => ({
        contentType: 'application/json',
        body: {
          error: 'payment required',
          endpoint: ep.id,
          hint: `POST /a2a/quote with {"endpointId":"${ep.id}"} to negotiate, then retry with the quoteId`,
          quoteId: quoteIdFrom(ctx) ?? null,
        },
      }),
    };
  }
  return routes;
}
