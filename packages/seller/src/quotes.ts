import type { PrivateKey } from '@hiero-ledger/sdk';
import { signQuote } from '@agora402/registry';
import { newQuoteId, priceFor, type EndpointSpec, type PaymentOptionSpec, type Quote, type QuoteRequest } from '@agora402/shared';

export interface QuoteDecision {
  ok: true;
  quote: Quote;
  /** true when the seller accepted the buyer's lower ceiling */
  countered: boolean;
}
export interface QuoteRejection {
  ok: false;
  status: number;
  reason: string;
  /** the least the seller will take, so the buyer can decide */
  minimumAmount?: string;
  listPrice?: string;
}

export interface QuoteBookOptions {
  sellerUaid: string;
  network: 'hedera:testnet' | 'hedera:mainnet';
  signingKey: PrivateKey;
  endpoints: EndpointSpec[];
  /** seconds a quote stays valid */
  ttlSeconds?: number;
  /** lowest accepted fraction of list price when the buyer counters, in basis points (8500 = 85%) */
  floorBps?: number;
  now?: () => number;
}

/**
 * A2A-style negotiation, kept deliberately small:
 *   buyer: "endpoint X, about this much work, I will pay at most M in asset A"
 *   seller: list price P from the pricing model.
 *     M >= P            -> quote at P
 *     floor <= M < P    -> quote at M (seller accepts the counter)
 *     M < floor         -> reject with the floor, buyer can walk or retry
 * The quote is signed, so the buyer can prove what was offered, and the paid
 * request references quoteId so the 402 carries exactly the agreed amount.
 */
export class QuoteBook {
  private readonly quotes = new Map<string, { quote: Quote; consumed: boolean }>();
  private readonly ttl: number;
  private readonly floorBps: number;
  private readonly now: () => number;

  constructor(private readonly opts: QuoteBookOptions) {
    this.ttl = opts.ttlSeconds ?? 120;
    this.floorBps = opts.floorBps ?? 8500;
    this.now = opts.now ?? (() => Math.floor(Date.now() / 1000));
  }

  listPrice(endpoint: EndpointSpec, option: PaymentOptionSpec, req: QuoteRequest): bigint {
    return priceFor(option.pricing, {
      inputTokens: req.estimate.inputTokens,
      maxOutputTokens: req.estimate.maxOutputTokens,
      units: req.estimate.units,
    });
  }

  request(req: QuoteRequest): QuoteDecision | QuoteRejection {
    const endpoint = this.opts.endpoints.find((e) => e.id === req.endpointId);
    if (!endpoint) return { ok: false, status: 404, reason: `unknown endpoint ${req.endpointId}` };
    const option = endpoint.accepts.find((a) => a.asset === req.asset && a.network === this.opts.network);
    if (!option) return { ok: false, status: 400, reason: `endpoint ${req.endpointId} does not accept asset ${req.asset}` };

    const list = this.listPrice(endpoint, option, req);
    const floor = (list * BigInt(this.floorBps) + 9999n) / 10000n;
    let amount = list;
    let countered = false;
    if (req.maxAmount !== undefined) {
      const max = BigInt(req.maxAmount);
      if (max >= list) amount = list;
      else if (max >= floor) {
        amount = max;
        countered = true;
      } else {
        return { ok: false, status: 409, reason: 'offer below floor', minimumAmount: floor.toString(), listPrice: list.toString() };
      }
    }
    if (amount <= 0n) amount = 1n;

    const body = {
      quoteId: newQuoteId(),
      seller: this.opts.sellerUaid,
      endpointId: endpoint.id,
      network: this.opts.network,
      asset: option.asset,
      amount: amount.toString(),
      expiresAt: this.now() + this.ttl,
      basis: {
        pricing: option.pricing,
        estimate: req.estimate,
        listPrice: list.toString(),
        countered,
        buyer: req.buyer,
      },
    };
    const quote = signQuote(body, this.opts.signingKey);
    this.quotes.set(quote.quoteId, { quote, consumed: false });
    this.sweep();
    return { ok: true, quote, countered };
  }

  /** Valid, unexpired, unconsumed quote for this endpoint and asset, or undefined. */
  lookup(quoteId: string, endpointId: string, asset: string): Quote | undefined {
    const entry = this.quotes.get(quoteId);
    if (!entry || entry.consumed) return undefined;
    const q = entry.quote;
    if (q.endpointId !== endpointId || q.asset !== asset) return undefined;
    if (q.expiresAt <= this.now()) return undefined;
    return q;
  }

  /** Mark a quote as used once its payment settled, so it cannot be replayed for a second call. */
  consume(quoteId: string): void {
    const entry = this.quotes.get(quoteId);
    if (entry) entry.consumed = true;
  }

  private sweep(): void {
    const now = this.now();
    for (const [id, e] of this.quotes) if (e.quote.expiresAt + 600 < now) this.quotes.delete(id);
  }
}
