import { wrapFetchWithPayment, x402Client, x402HTTPClient } from '@x402/fetch';
import type { PaymentRequirements, SettleResponse } from '@x402/core/types';
import { ExactHederaScheme } from '@x402/hedera/exact/client';
import { createClientHederaSigner } from '@x402/hedera';
import { Registry, createOperatorClient, effectiveTrust, getTransaction, parsePrivateKey, signerControlsAccount, trustFor, verifyQuoteSignature, type MirrorTransaction, type ReputationLedger, type TrustLedger, type TrustSummary, type VerifiedAttestation } from '@agora402/registry';
import {
  ServiceListing,
  Quote,
  estimateChatInput,
  formatAmount,
  generateUaid,
  hashscanTx,
  hederaNativeId,
  mirrorNodeUrl,
  newAuditId,
  priceFor,
  Rating,
  type Attestation,
  type AuditStage,
  type EndpointSpec,
  type PaymentOptionSpec,
  type QuoteRequest,
} from '@agora402/shared';

export type Stage =
  | 'discovering'
  | 'discovered'
  | 'trust'
  | 'quoting'
  | 'quoted'
  | 'quote_rejected'
  | 'requesting'
  | 'payment_required'
  | 'paying'
  | 'paid'
  | 'settled'
  | 'verifying'
  | 'verified'
  | 'rating'
  | 'rated'
  | 'failed';

export interface AgentEvent {
  stage: Stage;
  message: string;
  at: string;
  data?: Record<string, unknown>;
}

export interface Offer {
  listing: ServiceListing;
  endpoint: EndpointSpec;
  option: PaymentOptionSpec;
  /** list price in atomic units for the given estimate, computed locally from the published pricing model */
  listPrice: bigint;
  /** attestation matched against this listing, null when never audited */
  trust: TrustSummary | null;
}

export interface PaidResult<T = unknown> {
  status: number;
  body: T;
  settlement: SettleResponse | null;
  amount: bigint | null;
  asset: string | null;
  hashscanUrl: string | null;
  quote: Quote | null;
  onChain: MirrorTransaction | null;
}

export interface BuyerAgentOptions {
  network: 'testnet' | 'mainnet';
  accountId: string;
  privateKey: string;
  name?: string;
  /** hard cap per single payment, atomic units of the preferred asset */
  maxPerCall: bigint;
  /** total the agent may spend in this session, atomic units */
  sessionBudget: bigint;
  /** '0.0.0' for HBAR or an HTS token id */
  asset?: string;
  registry?: Registry;
  /** audit topic reader; without it every seller is treated as unverified */
  trust?: TrustLedger;
  /** reputation topic writer, for rate(); the buyer account pays for the message */
  reputation?: Pick<ReputationLedger, 'publish' | 'topicId' | 'network'>;
  /**
   * Trust policy. Unset: buy from anyone except sellers attested dangerous,
   * verified sellers ranked first. A number: only sellers holding a current
   * safe attestation with at least this score.
   */
  minTrust?: number;
  fetchImpl?: typeof fetch;
  onEvent?: (e: AgentEvent) => void;
  /** check that the quote signer key belongs to the payTo account (one mirror node call) */
  verifyQuoteSigner?: boolean;
}

/**
 * The buyer side of Agora402. It never holds an API key for any seller: it
 * finds a service, agrees a price, and pays inside the HTTP request. Spend is
 * bounded twice: per call (x402 spend controls) and per session (a policy
 * that filters out any 402 the remaining budget cannot cover).
 */
export class BuyerAgent {
  readonly uaid: string;
  readonly asset: string;
  /** current trust policy, see BuyerAgentOptions.minTrust; adjustable between runs */
  minTrust: number | undefined;
  private spent = 0n;
  private readonly fetchImpl: typeof fetch;
  private readonly client: x402Client;
  private readonly http: x402HTTPClient;
  private readonly paidFetch: typeof fetch;
  private readonly mirror: string;
  private lastSelected: PaymentRequirements | null = null;

  constructor(private readonly opts: BuyerAgentOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.asset = opts.asset ?? '0.0.0';
    this.minTrust = opts.minTrust;
    this.mirror = mirrorNodeUrl(opts.network);
    this.uaid = generateUaid({
      registry: 'agora402',
      name: opts.name ?? 'agora-buyer',
      version: '1.0.0',
      protocol: 'a2a',
      nativeId: hederaNativeId(opts.network, opts.accountId),
      skills: [],
      uid: opts.name ?? 'agora-buyer',
    });

    const caip2 = `hedera:${opts.network}` as const;
    const signer = createClientHederaSigner(opts.accountId, parsePrivateKey(opts.privateKey), { network: caip2 });
    this.client = new x402Client((_v, reqs) => this.cheapest(reqs))
      .register('hedera:*', new ExactHederaScheme(signer))
      .setSpendControls({ allowedAssets: [{ network: caip2, asset: this.asset, maxAmountPerPayment: opts.maxPerCall.toString() }] })
      .registerPolicy((_v, reqs) => reqs.filter((r) => r.asset === this.asset && r.network === caip2))
      .registerPolicy((_v, reqs) => {
        const remaining = this.remaining;
        const affordable = reqs.filter((r) => BigInt(r.amount) <= remaining);
        if (reqs.length > 0 && affordable.length === 0) {
          this.emit('failed', `every option exceeds remaining session budget ${this.fmt(remaining)}`, { asked: reqs.map((r) => r.amount) });
        }
        return affordable;
      })
      .onBeforePaymentCreation(async ({ selectedRequirements }) => {
        this.lastSelected = selectedRequirements;
        this.emit('paying', `signing transfer of ${this.fmt(BigInt(selectedRequirements.amount))} to ${selectedRequirements.payTo}`, {
          amount: selectedRequirements.amount,
          payTo: selectedRequirements.payTo,
          feePayer: (selectedRequirements.extra as { feePayer?: string })?.feePayer,
        });
      })
      .onAfterPaymentCreation(async () => {
        this.emit('paid', 'partially signed transaction attached, retrying request');
      });
    this.http = new x402HTTPClient(this.client);
    this.paidFetch = wrapFetchWithPayment(this.stageFetch(), this.client);
  }

  get remaining(): bigint {
    return this.opts.sessionBudget - this.spent;
  }
  get totalSpent(): bigint {
    return this.spent;
  }

  // ---- discovery -------------------------------------------------------

  /** Listings from the HCS registry, or a single seller by URL when given. */
  async discover(endpointId: string, sellerUrl?: string): Promise<Offer[]> {
    this.emit('discovering', sellerUrl ? `reading manifest at ${sellerUrl}` : `reading registry topic ${this.opts.registry?.topicId ?? '(none)'}`);
    const [listings, attestations] = await Promise.all([
      sellerUrl ? this.listingFrom(sellerUrl).then((l) => [l]) : this.opts.registry ? this.opts.registry.listServices() : Promise.resolve([] as ServiceListing[]),
      this.opts.trust ? this.opts.trust.attestations() : Promise.resolve(new Map<string, VerifiedAttestation>()),
    ]);
    const offers: Offer[] = [];
    for (const listing of listings) {
      const endpoint = listing.endpoints.find((e) => e.id === endpointId);
      const option = endpoint?.accepts.find((a) => a.asset === this.asset && a.network === `hedera:${this.opts.network}`);
      if (endpoint && option) offers.push({ listing, endpoint, option, listPrice: 0n, trust: trustFor(listing, attestations) });
    }
    this.emit('discovered', `${offers.length} seller(s) offer "${endpointId}" in ${this.symbol()}`, { sellers: offers.map((o) => o.listing.name) });
    return offers;
  }

  async listingFrom(baseUrl: string): Promise<ServiceListing> {
    const res = await this.fetchImpl(`${baseUrl.replace(/\/$/, '')}/.well-known/agora402.json`);
    if (!res.ok) throw new Error(`seller manifest ${res.status} at ${baseUrl}`);
    return ServiceListing.parse(await res.json());
  }

  /**
   * Apply the trust policy, price every remaining offer for this work using
   * the published model, then sort: verified sellers first, cheapest within
   * each group. A dangerous verdict is never bought from.
   */
  rank(offers: Offer[], estimate: QuoteRequest['estimate']): Offer[] {
    const kept: Offer[] = [];
    const dropped: Array<{ seller: string; reason: string }> = [];
    for (const o of offers) {
      const score = effectiveTrust(o.trust);
      if (o.trust?.current && o.trust.verdict === 'dangerous') dropped.push({ seller: o.listing.name, reason: `attested dangerous (${o.trust.risk})` });
      else if (this.minTrust !== undefined && (score === null || score < this.minTrust)) {
        dropped.push({ seller: o.listing.name, reason: score === null ? (o.trust ? 'attestation is for an earlier version of the listing' : 'no attestation') : `trust ${score} below ${this.minTrust}` });
      } else kept.push(o);
    }
    if (offers.length > 0) {
      const verified = kept.filter((o) => effectiveTrust(o.trust) !== null);
      this.emit(
        'trust',
        `${verified.length} verified, ${kept.length - verified.length} unverified, ${dropped.length} excluded${this.minTrust !== undefined ? ` (policy: trust >= ${this.minTrust})` : ''}`,
        { minTrust: this.minTrust ?? null, kept: kept.map((o) => ({ seller: o.listing.name, trust: effectiveTrust(o.trust), verdict: o.trust?.verdict ?? null, auditor: o.trust?.auditorAccount ?? null })), dropped },
      );
    }
    return kept
      .map((o) => ({ ...o, listPrice: priceFor(o.option.pricing, estimate) }))
      .sort((a, b) => {
        const ta = effectiveTrust(a.trust) !== null ? 1 : 0;
        const tb = effectiveTrust(b.trust) !== null ? 1 : 0;
        if (ta !== tb) return tb - ta;
        return a.listPrice < b.listPrice ? -1 : a.listPrice > b.listPrice ? 1 : 0;
      });
  }

  // ---- negotiation -----------------------------------------------------

  /** Ask the seller for a signed quote. `maxAmount` lets the buyer counter below list price. */
  async quote(offer: Offer, estimate: QuoteRequest['estimate'], maxAmount?: bigint): Promise<Quote | null> {
    const url = `${offer.listing.baseUrl}${offer.listing.quotePath}`;
    const body: QuoteRequest = { buyer: this.uaid, endpointId: offer.endpoint.id, estimate, asset: this.asset, maxAmount: maxAmount?.toString() };
    this.emit('quoting', `asking ${offer.listing.name} for a quote${maxAmount !== undefined ? `, offering at most ${this.fmt(maxAmount)}` : ''}`, { url });
    const res = await this.fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (res.status === 409) {
      const j = (await res.json()) as { minimumAmount?: string; listPrice?: string };
      this.emit('quote_rejected', `seller floor is ${j.minimumAmount ? this.fmt(BigInt(j.minimumAmount)) : 'unknown'} (list ${j.listPrice ? this.fmt(BigInt(j.listPrice)) : '?'})`, j);
      return null;
    }
    if (!res.ok) throw new Error(`quote failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const { quote, countered } = (await res.json()) as { quote: Quote; countered: boolean };
    const parsed = Quote.parse(quote);
    if (!verifyQuoteSignature(parsed)) throw new Error('quote signature invalid');
    if (parsed.seller !== offer.listing.uaid) throw new Error('quote signed for a different seller uaid');
    if (this.opts.verifyQuoteSigner) {
      const ok = await signerControlsAccount(this.mirror, offer.listing.payTo, parsed.signerPublicKey, this.fetchImpl);
      if (!ok) throw new Error(`quote signer key is not the key of ${offer.listing.payTo}`);
    }
    this.emit('quoted', `${offer.listing.name} quoted ${this.fmt(BigInt(parsed.amount))}${countered ? ' (accepted our counter)' : ''}, valid ${parsed.expiresAt - Math.floor(Date.now() / 1000)}s`, {
      quoteId: parsed.quoteId,
      amount: parsed.amount,
      countered,
    });
    return parsed;
  }

  // ---- payment ---------------------------------------------------------

  /** Call a paid endpoint. Handles the 402 automatically, then verifies the settlement on the mirror node. */
  async call<T = unknown>(offer: Offer, init: { method?: 'GET' | 'POST'; body?: unknown; query?: Record<string, string> } = {}, quote: Quote | null = null): Promise<PaidResult<T>> {
    const url = new URL(offer.listing.baseUrl.replace(/\/$/, '') + offer.endpoint.path);
    for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
    if (quote && offer.endpoint.method === 'GET') url.searchParams.set('quoteId', quote.quoteId);
    const body = offer.endpoint.method === 'POST' ? JSON.stringify({ ...(init.body as Record<string, unknown>), ...(quote ? { quoteId: quote.quoteId } : {}) }) : undefined;

    this.lastSelected = null;
    this.emit('requesting', `${offer.endpoint.method} ${url.pathname} at ${offer.listing.name}`, { url: url.toString(), baseUrl: offer.listing.baseUrl, endpointId: offer.endpoint.id });
    const res = await this.paidFetch(url, { method: offer.endpoint.method, headers: body ? { 'content-type': 'application/json' } : undefined, body });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* keep text */
    }

    let settlement: SettleResponse | null = null;
    try {
      settlement = this.http.getPaymentSettleResponse((n) => res.headers.get(n));
    } catch {
      settlement = null;
    }

    if (!res.ok) {
      this.emit('failed', `seller answered ${res.status}`, { body: parsed });
      return { status: res.status, body: parsed as T, settlement, amount: null, asset: null, hashscanUrl: null, quote, onChain: null };
    }

    let amount: bigint | null = null;
    let hashscanUrl: string | null = null;
    let onChain: MirrorTransaction | null = null;
    if (settlement?.success) {
      const selected = this.selectedRequirements();
      amount = BigInt(settlement.amount ?? selected?.amount ?? '0');
      this.spent += amount;
      hashscanUrl = hashscanTx(this.opts.network, settlement.transaction);
      this.emit('settled', `facilitator settled ${this.fmt(amount)} in tx ${settlement.transaction}`, { transaction: settlement.transaction, hashscanUrl, spent: this.spent.toString(), remaining: this.remaining.toString() });
      onChain = await this.verifyOnChain(settlement.transaction, selected?.payTo ?? offer.listing.payTo);
    }
    return { status: res.status, body: parsed as T, settlement, amount, asset: this.asset, hashscanUrl, quote, onChain };
  }

  /** Poll the mirror node until the settlement transaction is visible (consensus is sub-second, indexing a few seconds). */
  async verifyOnChain(transactionId: string, payTo: string, attempts = 10, delayMs = 1500): Promise<MirrorTransaction | null> {
    this.emit('verifying', `looking up ${transactionId} on the mirror node`);
    for (let i = 0; i < attempts; i++) {
      try {
        const tx = await getTransaction(this.mirror, transactionId, this.fetchImpl);
        if (tx) {
          const credit = tx.transfers.filter((t) => t.account === payTo).reduce((s, t) => s + t.amount, 0);
          this.emit('verified', `mirror node confirms ${tx.result}: seller credited ${this.fmt(BigInt(credit))} at ${tx.consensus_timestamp}`, { transaction: tx });
          return tx;
        }
      } catch {
        /* retry */
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
    this.emit('failed', 'transaction not visible on the mirror node yet (it may still appear; check HashScan)');
    return null;
  }

  // ---- high level tasks -------------------------------------------------

  /**
   * Buy one chat completion: discover, rank by list price, negotiate with the
   * cheapest seller, pay, verify. `counterBps` below 10000 makes the agent
   * offer less than list price (e.g. 9000 = offer 90%).
   */
  async infer(prompt: string, o: { sellerUrl?: string; maxTokens?: number; counterBps?: number; system?: string } = {}): Promise<PaidResult<ChatCompletion> & { offer: Offer }> {
    const messages = [...(o.system ? [{ role: 'system', content: o.system }] : []), { role: 'user', content: prompt }];
    const body = { messages, max_tokens: o.maxTokens ?? 256 };
    const estimate = estimateChatInput(body);
    const offers = this.rank(await this.discover('infer', o.sellerUrl), estimate);
    if (offers.length === 0) throw new Error('no seller offers "infer" for this asset that passes the trust policy');
    const offer = offers[0];
    const counter = o.counterBps && o.counterBps < 10000 ? (offer.listPrice * BigInt(o.counterBps)) / 10000n : undefined;
    const quote = await this.quote(offer, estimate, counter);
    const result = await this.call<ChatCompletion>(offer, { body }, quote);
    return { ...result, offer };
  }

  /**
   * Buy an audit of another seller from an auditor agent. The auditor is
   * found in the registry like any seller (endpoint "audit"); the buyer
   * generates the auditId so it can follow the auditor's progress stream
   * while the paid request is open.
   */
  async audit(subject: { uaid?: string; sellerUrl?: string }, o: { auditorUrl?: string; auditId?: string; counterBps?: number } = {}): Promise<PaidResult<AuditPurchase> & { offer: Offer; auditId: string }> {
    const offers = this.rank(await this.discover('audit', o.auditorUrl), { units: 1 });
    if (offers.length === 0) throw new Error('no auditor offers "audit" for this asset that passes the trust policy');
    const offer = offers[0];
    const auditId = o.auditId ?? newAuditId();
    const counter = o.counterBps && o.counterBps < 10000 ? (offer.listPrice * BigInt(o.counterBps)) / 10000n : undefined;
    const quote = await this.quote(offer, { units: 1 }, counter);
    const result = await this.call<AuditPurchase>(offer, { body: { subject: subject.uaid, sellerUrl: subject.sellerUrl, auditId } }, quote);
    return { ...result, offer, auditId };
  }

  /**
   * Rate a seller after paying it. The rating names the settlement so readers
   * can check on the mirror node that this account really paid that seller;
   * one settlement backs one rating.
   */
  async rate(input: { subject: string; subjectAccount: string; transactionId: string; score: number; comment?: string }): Promise<{ rating: Rating; transactionId: string; sequenceNumber: number }> {
    if (!this.opts.reputation) throw new Error('no reputation topic configured (REPUTATION_TOPIC_ID)');
    const rating = Rating.parse({
      v: 1,
      type: 'rating',
      subject: input.subject,
      subjectAccount: input.subjectAccount,
      rater: this.uaid,
      raterAccount: this.opts.accountId,
      transactionId: input.transactionId,
      score: input.score,
      comment: input.comment?.trim() || undefined,
      issuedAt: new Date().toISOString(),
    } satisfies Rating);
    this.emit('rating', `rating ${input.subjectAccount} ${input.score}/5, citing settlement ${input.transactionId}`, { subject: input.subject });
    const client = createOperatorClient({ network: this.opts.network, accountId: this.opts.accountId, privateKey: this.opts.privateKey });
    try {
      const r = await this.opts.reputation.publish(client, rating);
      this.emit('rated', `rating recorded on topic ${this.opts.reputation.topicId} seq ${r.sequenceNumber}`, { ...r, topicId: this.opts.reputation.topicId });
      return { rating, ...r };
    } finally {
      client.close();
    }
  }

  async hbarRate(o: { sellerUrl?: string } = {}): Promise<PaidResult<Record<string, unknown>> & { offer: Offer }> {
    const offers = this.rank(await this.discover('hbar-rate', o.sellerUrl), { units: 1 });
    if (offers.length === 0) throw new Error('no seller offers "hbar-rate" for this asset that passes the trust policy');
    const offer = offers[0];
    const quote = await this.quote(offer, { units: 1 });
    const result = await this.call<Record<string, unknown>>(offer, {}, quote);
    return { ...result, offer };
  }

  // ---- helpers ---------------------------------------------------------

  /** Read through a method so TypeScript does not narrow the field mutated inside the payment hook. */
  private selectedRequirements(): PaymentRequirements | null {
    return this.lastSelected;
  }

  private cheapest(reqs: PaymentRequirements[]): PaymentRequirements {
    if (reqs.length === 0) throw new Error('no acceptable payment option');
    return [...reqs].sort((a, b) => (BigInt(a.amount) < BigInt(b.amount) ? -1 : 1))[0];
  }

  private stageFetch(): typeof fetch {
    return async (input, init) => {
      const req = input instanceof Request ? input : new Request(String(input), init);
      const isRetry = req.headers.has('PAYMENT-SIGNATURE') || req.headers.has('X-PAYMENT');
      const res = await this.fetchImpl(input, init);
      if (!isRetry && res.status === 402) {
        try {
          const pr = this.http.getPaymentRequiredResponse((n) => res.headers.get(n));
          this.emit('payment_required', `seller asks ${pr.accepts.map((a) => this.fmt(BigInt(a.amount), a.asset)).join(' or ')}`, { accepts: pr.accepts });
        } catch {
          this.emit('payment_required', 'seller answered 402');
        }
      }
      return res;
    };
  }

  private symbol(asset = this.asset): string {
    return asset === '0.0.0' ? 'HBAR' : asset;
  }
  private fmt(amount: bigint, asset = this.asset): string {
    return asset === '0.0.0' ? formatAmount(amount, 8, 'HBAR') : `${amount} units of ${asset}`;
  }
  private emit(stage: Stage, message: string, data?: Record<string, unknown>) {
    this.opts.onEvent?.({ stage, message, at: new Date().toISOString(), data });
  }
}

/** Body of a paid POST /v1/audit response. */
export interface AuditPurchase {
  auditId: string;
  subject: { uaid: string; name: string; payTo: string };
  attestation: Attestation;
  stages: Array<AuditStage & { evidence: Record<string, unknown> }>;
  topicId: string | null;
  topicUrl: string | null;
  recorded: boolean;
}

export interface ChatCompletion {
  id: string;
  model: string;
  choices: Array<{ message: { role: string; content: string } }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  agora?: { seller: string; quoteId: string | null };
}
