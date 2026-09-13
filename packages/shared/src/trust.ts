import { createHash, randomBytes } from 'node:crypto';
import { sortKeysDeep } from './quote.js';
import type { AuditFinding, ServiceListing, Severity, Verdict } from './types.js';

/**
 * What an audit vouches for: the part of a listing that decides what a buyer
 * talks to and pays. Name, timestamps and the receipts topic are excluded so
 * a seller can republish metadata without invalidating its attestation, but
 * any change to endpoints, prices, URLs or the paid account does invalidate it.
 */
export function listingContentHash(listing: ServiceListing): string {
  const covered = sortKeysDeep({
    uaid: listing.uaid,
    payTo: listing.payTo,
    baseUrl: listing.baseUrl.replace(/\/$/, ''),
    quotePath: listing.quotePath,
    facilitator: listing.facilitator,
    endpoints: listing.endpoints,
  });
  return createHash('sha256').update(JSON.stringify(covered), 'utf8').digest('hex');
}

export function newAuditId(): string {
  return 'a_' + randomBytes(8).toString('hex');
}

const SEVERITY_ORDER: Severity[] = ['none', 'low', 'medium', 'high', 'critical'];

/** Points taken off a perfect 100 per finding. Two highs alone are enough to fail. */
export const SEVERITY_PENALTY: Record<Severity, number> = { none: 0, low: 4, medium: 12, high: 30, critical: 60 };

export function maxSeverity(findings: AuditFinding[]): Severity {
  let max = 0;
  for (const f of findings) max = Math.max(max, SEVERITY_ORDER.indexOf(f.severity));
  return SEVERITY_ORDER[max];
}

/**
 * Trust score from findings, deterministic so two auditors that saw the same
 * evidence publish the same number. The LLM describes what it found; it does
 * not pick the score.
 */
export function trustScoreFrom(findings: AuditFinding[]): number {
  const penalty = findings.reduce((s, f) => s + SEVERITY_PENALTY[f.severity], 0);
  return Math.max(0, 100 - penalty);
}

/** Verdict rule: any high or critical finding is dangerous. */
export function verdictFrom(findings: AuditFinding[]): Verdict {
  const worst = maxSeverity(findings);
  return worst === 'high' || worst === 'critical' ? 'dangerous' : 'safe';
}

/** Default buyer policy threshold: below this a listing is treated as unverified. */
export const DEFAULT_MIN_TRUST = 70;
