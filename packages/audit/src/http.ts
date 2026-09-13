/** Small fetch helpers with timeouts. A slow or dead seller is a finding, not a hang. */

export interface Probe<T> {
  ok: boolean;
  status: number | null;
  body: T | null;
  headers: Record<string, string>;
  error?: string;
  elapsedMs: number;
}

export async function probe<T = unknown>(fetchImpl: typeof fetch, url: string, init: RequestInit = {}, timeoutMs = 6000): Promise<Probe<T>> {
  const started = Date.now();
  try {
    const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    let body: T | null = null;
    try {
      body = text ? (JSON.parse(text) as T) : null;
    } catch {
      body = null;
    }
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    return { ok: res.ok, status: res.status, body, headers, elapsedMs: Date.now() - started };
  } catch (err) {
    return { ok: false, status: null, body: null, headers: {}, error: err instanceof Error ? err.message : String(err), elapsedMs: Date.now() - started };
  }
}

export function join(baseUrl: string, path: string): string {
  return baseUrl.replace(/\/$/, '') + path;
}
