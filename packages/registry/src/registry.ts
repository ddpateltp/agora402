import type { Client } from '@hiero-ledger/sdk';
import { RegistryMessage, ServiceListing, mirrorNodeUrl } from '@agora402/shared';
import { submitJson } from './hedera.js';
import { readTopicMessages } from './mirror.js';
import type { ShortNetwork } from './hedera.js';

export interface RegistryOptions {
  network: ShortNetwork;
  topicId: string;
  mirrorUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * The Agora402 service registry: an HCS topic where sellers publish listings.
 * Reading needs no keys (mirror node). Writing needs an operator client.
 *
 * Trust model: the listing's `payTo` must equal the account that paid for the
 * HCS message. That binds a listing to a Hedera account without any registry
 * operator; the buyer checks it in `listServices`.
 */
export class Registry {
  readonly network: ShortNetwork;
  readonly topicId: string;
  private readonly mirrorUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: RegistryOptions) {
    this.network = opts.network;
    this.topicId = opts.topicId;
    this.mirrorUrl = opts.mirrorUrl ?? mirrorNodeUrl(opts.network);
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async publishListing(client: Client, listing: ServiceListing) {
    const msg: RegistryMessage = { v: 1, type: 'listing', listing: ServiceListing.parse(listing) };
    return submitJson(client, this.topicId, msg);
  }

  async delist(client: Client, uaid: string, reason?: string) {
    const msg: RegistryMessage = { v: 1, type: 'delist', uaid, reason };
    return submitJson(client, this.topicId, msg);
  }

  /**
   * Current view of the registry: last listing per uaid, minus delisted ones.
   * Listings whose payer does not match `payTo` are dropped as spoofed.
   */
  async listServices(): Promise<ServiceListing[]> {
    const messages = await readTopicMessages<unknown>(this.mirrorUrl, this.topicId, { fetchImpl: this.fetchImpl });
    const byUaid = new Map<string, ServiceListing>();
    for (const m of messages) {
      const parsed = RegistryMessage.safeParse(m.json);
      if (!parsed.success) continue;
      const msg = parsed.data;
      if (msg.type === 'listing') {
        if (msg.listing.payTo !== m.payerAccountId) continue; // not signed by the receiving account
        byUaid.set(msg.listing.uaid, msg.listing);
      } else if (msg.type === 'delist') {
        const existing = byUaid.get(msg.uaid);
        if (existing && existing.payTo === m.payerAccountId) byUaid.delete(msg.uaid);
      }
    }
    return [...byUaid.values()];
  }

  /** Find listings offering an endpoint with the given id, cheapest first for the given asset. */
  async findEndpoint(endpointId: string, asset = '0.0.0'): Promise<Array<{ listing: ServiceListing; endpoint: ServiceListing['endpoints'][number] }>> {
    const services = await this.listServices();
    const hits: Array<{ listing: ServiceListing; endpoint: ServiceListing['endpoints'][number] }> = [];
    for (const listing of services) {
      const endpoint = listing.endpoints.find((e) => e.id === endpointId && e.accepts.some((a) => a.asset === asset));
      if (endpoint) hits.push({ listing, endpoint });
    }
    return hits;
  }
}
