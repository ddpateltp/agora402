/**
 * Read HCS topic messages from the public mirror node REST API and reassemble
 * chunked messages. No keys required: anyone can audit the registry and the
 * receipts topic with nothing but this file.
 */

export interface MirrorTopicMessage {
  consensus_timestamp: string;
  message: string; // base64
  sequence_number: number;
  payer_account_id: string;
  running_hash: string;
  chunk_info?: {
    initial_transaction_id: { account_id: string; transaction_valid_start: string; nonce: number; scheduled: boolean };
    number: number;
    total: number;
  } | null;
}

export interface DecodedTopicMessage<T = unknown> {
  consensusTimestamp: string;
  sequenceNumber: number;
  payerAccountId: string;
  raw: string;
  json: T | undefined;
}

export interface ReadTopicOptions {
  /** consensus timestamp filter, e.g. "gt:1700000000.000000000" */
  timestamp?: string;
  /** max messages per page, mirror node caps at 100 */
  pageSize?: number;
  /** stop after this many pages */
  maxPages?: number;
  fetchImpl?: typeof fetch;
}

export async function readTopicMessages<T = unknown>(
  mirrorUrl: string,
  topicId: string,
  opts: ReadTopicOptions = {},
): Promise<DecodedTopicMessage<T>[]> {
  const f = opts.fetchImpl ?? fetch;
  const pageSize = Math.min(100, opts.pageSize ?? 100);
  const maxPages = opts.maxPages ?? 20;
  let url: string | null = `${mirrorUrl}/api/v1/topics/${topicId}/messages?limit=${pageSize}&order=asc` + (opts.timestamp ? `&timestamp=${encodeURIComponent(opts.timestamp)}` : '');
  const all: MirrorTopicMessage[] = [];
  for (let page = 0; url && page < maxPages; page++) {
    const res = await f(url);
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`mirror node ${res.status} for ${url}`);
    const body = (await res.json()) as { messages: MirrorTopicMessage[]; links?: { next?: string | null } };
    all.push(...body.messages);
    url = body.links?.next ? `${mirrorUrl}${body.links.next}` : null;
  }
  return reassemble<T>(all);
}

/** Join chunked messages (by initial transaction id) and decode base64 + JSON. */
export function reassemble<T>(messages: MirrorTopicMessage[]): DecodedTopicMessage<T>[] {
  const out: DecodedTopicMessage<T>[] = [];
  const pending = new Map<string, { parts: Map<number, string>; total: number; first: MirrorTopicMessage }>();

  for (const m of messages) {
    const decoded = Buffer.from(m.message, 'base64').toString('utf8');
    if (!m.chunk_info || m.chunk_info.total <= 1) {
      out.push(toDecoded<T>(m, decoded));
      continue;
    }
    const key = `${m.chunk_info.initial_transaction_id.account_id}@${m.chunk_info.initial_transaction_id.transaction_valid_start}`;
    const entry = pending.get(key) ?? { parts: new Map(), total: m.chunk_info.total, first: m };
    entry.parts.set(m.chunk_info.number, decoded);
    pending.set(key, entry);
    if (entry.parts.size === entry.total) {
      const joined = Array.from({ length: entry.total }, (_, i) => entry.parts.get(i + 1) ?? '').join('');
      out.push(toDecoded<T>(m, joined));
      pending.delete(key);
    }
  }
  return out.sort((a, b) => (a.consensusTimestamp < b.consensusTimestamp ? -1 : 1));
}

function toDecoded<T>(m: MirrorTopicMessage, raw: string): DecodedTopicMessage<T> {
  let json: T | undefined;
  try {
    json = JSON.parse(raw) as T;
  } catch {
    json = undefined;
  }
  return {
    consensusTimestamp: m.consensus_timestamp,
    sequenceNumber: m.sequence_number,
    payerAccountId: m.payer_account_id,
    raw,
    json,
  };
}

/** Look up a transaction on the mirror node. Accepts SDK format 0.0.x@sec.nanos. */
export async function getTransaction(mirrorUrl: string, transactionId: string, fetchImpl: typeof fetch = fetch): Promise<MirrorTransaction | null> {
  const id = toMirrorTxId(transactionId);
  const res = await fetchImpl(`${mirrorUrl}/api/v1/transactions/${id}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`mirror node ${res.status} for transaction ${id}`);
  const body = (await res.json()) as { transactions: MirrorTransaction[] };
  return body.transactions?.[0] ?? null;
}

export interface MirrorTransaction {
  transaction_id: string;
  consensus_timestamp: string;
  result: string;
  name: string;
  charged_tx_fee: number;
  transfers: Array<{ account: string; amount: number; is_approval: boolean }>;
  token_transfers?: Array<{ token_id: string; account: string; amount: number }>;
}

/** 0.0.123@1700000000.123456789 -> 0.0.123-1700000000-123456789 */
export function toMirrorTxId(id: string): string {
  const m = /^(\d+\.\d+\.\d+)@(\d+)\.(\d+)$/.exec(id.trim());
  if (!m) return id.trim();
  return `${m[1]}-${m[2]}-${m[3].padStart(9, '0')}`;
}

/** Live HBAR/USD rate from the network exchange rate file, via mirror node. */
export async function getExchangeRate(mirrorUrl: string, fetchImpl: typeof fetch = fetch): Promise<{ centsPerHbar: number; expirationTime: number; hbarEquivalent: number; centEquivalent: number }> {
  const res = await fetchImpl(`${mirrorUrl}/api/v1/network/exchangerate`);
  if (!res.ok) throw new Error(`mirror node ${res.status} for exchange rate`);
  const body = (await res.json()) as { current_rate: { cent_equivalent: number; hbar_equivalent: number; expiration_time: number } };
  const r = body.current_rate;
  return {
    centEquivalent: r.cent_equivalent,
    hbarEquivalent: r.hbar_equivalent,
    expirationTime: r.expiration_time,
    centsPerHbar: r.cent_equivalent / r.hbar_equivalent,
  };
}
