import type { Config, Listing, ReputationSummary, TrailEntry, VerifiedReceipt } from './types';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep text */
  }
  if (!res.ok) throw new Error((body as { error?: string })?.error ?? `${res.status} ${path}`);
  return body as T;
}

export const getConfig = () => api<Config>('/api/config');
export const getSellers = () => api<{ listings: Listing[] }>('/api/sellers');
export const getReceipts = (topic?: string) => api<{ topic: string | null; topicUrl?: string; receipts: VerifiedReceipt[] }>(`/api/receipts${topic ? `?topic=${encodeURIComponent(topic)}` : ''}`);
export const getAudits = () => api<{ topic: string | null; topicUrl?: string; attestations: Array<{ attestation: import('./types').Attestation; consensusTimestamp: string; sequenceNumber: number; payerAccountId: string }> }>('/api/audits');
export const getTrail = (auditId: string) => api<{ topic: string | null; topicUrl?: string; trail: TrailEntry[] }>(`/api/audits?auditId=${encodeURIComponent(auditId)}`);
export const getReputation = () => api<{ topic: string | null; topicUrl?: string; sellers: Record<string, ReputationSummary> }>('/api/reputation');
export const postRate = (body: { subject: string; subjectAccount: string; transactionId: string; score: number; comment?: string }) =>
  api<{ rating: unknown; transactionId: string; sequenceNumber: number; topicId: string | null; topicUrl: string | null }>('/api/rate', { method: 'POST', body: JSON.stringify(body) });

/** POST and read newline-delimited JSON as it arrives. */
export async function stream(path: string, body: unknown, onLine: (obj: Record<string, unknown>) => void): Promise<void> {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) throw new Error(`${res.status} ${path}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        onLine(JSON.parse(line) as Record<string, unknown>);
      } catch {
        /* skip */
      }
    }
  }
}

export const hashscan = (network: string, kind: 'account' | 'topic' | 'transaction' | 'token', id: string) => `https://hashscan.io/${network}/${kind}/${encodeURIComponent(id)}`;
export const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};
export const shortId = (s: string, n = 10) => (s.length > n * 2 + 1 ? `${s.slice(0, n)}…${s.slice(-6)}` : s);
export const timeOf = (iso: string) => (iso ? iso.slice(11, 19) : '');
export const consensusToDate = (ts: string) => {
  const secs = Number(String(ts).split('.')[0]);
  return Number.isFinite(secs) && secs > 0 ? new Date(secs * 1000).toISOString().replace('T', ' ').slice(0, 19) : ts;
};
