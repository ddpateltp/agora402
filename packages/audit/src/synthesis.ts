import { z } from 'zod';
import { maxSeverity, trustScoreFrom, verdictFrom, type AuditFinding, type LlmProvider, type ServiceListing } from '@agora402/shared';
import { parseJsonObject } from './content.js';
import { dedupe } from './probes.js';
import type { StageResult } from './types.js';

const LlmSynthesis = z.object({
  summary: z.string().min(1),
  capabilities: z.array(z.string().min(1)).default([]),
});

export const SYNTHESIS_SYSTEM = `You write the closing summary of an audit of a pay-per-request service that AI agents buy over x402 on Hedera. You receive the listing and the findings of three stages: manifest consistency, payment integrity, and content review. The verdict and score are already decided by rule from the findings; do not change or restate numbers. Write for a buying agent's operator: one short paragraph on what the service actually does and whether the money and the terms check out, then list the capabilities you can infer from the endpoints as short phrases. Reply with JSON only: {"summary":"one paragraph","capabilities":["..."]}.`;

/**
 * Stage 4, synthesis: the score and verdict come from the findings by rule;
 * the LLM only writes the human summary and the capability list. Without an
 * LLM the summary is templated from the same facts.
 */
export async function synthesise(listing: ServiceListing, stages: Array<{ stage: string; summary: string; findings: AuditFinding[] }>, llm: LlmProvider | null): Promise<StageResult & { verdict: 'safe' | 'dangerous'; trustScore: number; risk: AuditFinding['severity']; capabilities: string[] }> {
  const all = dedupe(stages.flatMap((s) => s.findings));
  const verdict = verdictFrom(all);
  const trustScore = trustScoreFrom(all);
  const risk = maxSeverity(all);
  const inferred = listing.endpoints.map((e) => `${e.method} ${e.path}: ${e.description.split(/[.:(]/)[0].trim()}`);

  let summary = templated(listing, all, verdict, trustScore);
  let capabilities = inferred;
  let model = 'deterministic';
  if (llm && llm.name !== 'mock') {
    try {
      const user = `Listing:\n${JSON.stringify({ name: listing.name, payTo: listing.payTo, baseUrl: listing.baseUrl, endpoints: listing.endpoints.map((e) => ({ id: e.id, method: e.method, path: e.path, description: e.description, pricing: e.accepts.map((a) => `${a.symbol} ${JSON.stringify(a.pricing)}`) })) }, null, 1)}\n\nStages:\n${JSON.stringify(stages, null, 1)}\n\nRule-based outcome: verdict ${verdict}, trust score ${trustScore}/100, highest severity ${risk}.`;
      const res = await llm.chat({ messages: [{ role: 'system', content: SYNTHESIS_SYSTEM }, { role: 'user', content: user }], max_tokens: 600, temperature: 0.2 });
      const parsed = LlmSynthesis.safeParse(parseJsonObject(res.content));
      if (parsed.success) {
        summary = parsed.data.summary;
        capabilities = parsed.data.capabilities.length > 0 ? parsed.data.capabilities : inferred;
        model = res.model;
      }
    } catch {
      /* keep the templated summary */
    }
  }
  return { summary, findings: [], evidence: { totalFindings: all.length, bySeverity: countBy(all) }, model, verdict, trustScore, risk, capabilities };
}

function templated(listing: ServiceListing, all: AuditFinding[], verdict: 'safe' | 'dangerous', score: number): string {
  const counts = countBy(all);
  const parts = Object.entries(counts).filter(([, n]) => n > 0).map(([s, n]) => `${n} ${s}`);
  return `${listing.name} exposes ${listing.endpoints.length} paid endpoint(s) at ${listing.baseUrl}, paid to ${listing.payTo}. ${all.length === 0 ? 'No findings: the live manifest matches the listing, quotes are signed by the paid account, and every 402 honours the published prices.' : `${all.length} finding(s): ${parts.join(', ')}.`} Verdict ${verdict}, trust score ${score}/100.`;
}

function countBy(findings: AuditFinding[]): Record<string, number> {
  const out: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) if (f.severity in out) out[f.severity] += 1;
  return out;
}
