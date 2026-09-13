import type { ServiceListing } from '@agora402/shared';
import type { Registry } from './registry.js';
import { trustFor, type TrustLedger, type TrustSummary } from './trust.js';
import type { ReputationLedger, ReputationSummary } from './reputation.js';

/** A listing with the trust facts a buyer needs next to it. */
export type TrustedListing = ServiceListing & {
  trust: TrustSummary | null;
  reputation: ReputationSummary | null;
};

/**
 * Registry plus trust layer in one read. The audit and reputation topics are
 * optional: without them every listing comes back unverified and unrated,
 * which is exactly how v1 buyers see the world.
 */
export class Marketplace {
  constructor(private readonly deps: { registry: Registry; trust?: TrustLedger; reputation?: ReputationLedger }) {}

  async list(): Promise<TrustedListing[]> {
    const [listings, attestations, reputations] = await Promise.all([
      this.deps.registry.listServices(),
      this.deps.trust ? this.deps.trust.attestations() : Promise.resolve(new Map()),
      this.deps.reputation ? this.deps.reputation.summaries() : Promise.resolve(new Map<string, ReputationSummary>()),
    ]);
    return listings.map((l) => ({ ...l, trust: trustFor(l, attestations), reputation: reputations.get(l.uaid) ?? null }));
  }
}
