import { createHash } from 'node:crypto';

/**
 * HCS-14 Universal Agent Identifier (UAID), deterministic "aid" target.
 * Spec: https://hol.org/docs/standards/hcs-14/
 *
 * The id is Base58(SHA-384(canonical JSON of six fields)). Endpoints, topics
 * and payment details are deliberately excluded so the id survives redeploys.
 */
export interface AgentIdentityInput {
  /** registry namespace, lowercase; "self" when none applies */
  registry: string;
  name: string;
  version: string;
  /** protocol identifier, lowercase, e.g. "a2a", "hcs-10", "mcp" */
  protocol: string;
  /** CAIP-10 style native id, e.g. hedera:testnet:0.0.12345 */
  nativeId: string;
  /** OASF / HCS-14 skill codes */
  skills?: number[];
  /** registry-scoped unique id; "0" when not applicable */
  uid?: string;
  /** optional A2A domain */
  domain?: string;
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Minimal Base58 (Bitcoin alphabet) encoder; avoids a dependency for 20 lines. */
export function base58Encode(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits: number[] = [0];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = '';
  for (let i = 0; i < zeros; i++) out += '1';
  for (let i = digits.length - 1; i >= 0; i--) out += B58[digits[i]];
  return out;
}

/** Canonical JSON used for the hash: only the six identity fields, sorted keys. */
export function canonicalIdentityJson(input: AgentIdentityInput): string {
  const canonical = {
    name: input.name.trim(),
    nativeId: input.nativeId.trim(),
    protocol: input.protocol.toLowerCase().trim(),
    registry: input.registry.toLowerCase().trim(),
    skills: [...(input.skills ?? [])].sort((a, b) => a - b),
    version: input.version.trim(),
  };
  return JSON.stringify(canonical, Object.keys(canonical).sort());
}

/** Build a `uaid:aid:` identifier. Parameter order follows the spec: uid, registry, proto, nativeId, domain. */
export function generateUaid(input: AgentIdentityInput): string {
  for (const k of ['registry', 'name', 'version', 'protocol', 'nativeId'] as const) {
    if (!input[k] || !String(input[k]).trim()) throw new Error(`HCS-14: missing required field ${k}`);
  }
  const hash = createHash('sha384').update(canonicalIdentityJson(input), 'utf8').digest();
  const id = base58Encode(new Uint8Array(hash));
  const params = [
    `uid=${input.uid ?? '0'}`,
    `registry=${input.registry.toLowerCase().trim()}`,
    `proto=${input.protocol.toLowerCase().trim()}`,
    `nativeId=${input.nativeId.trim()}`,
  ];
  if (input.domain) params.push(`domain=${input.domain.trim()}`);
  return `uaid:aid:${id};${params.join(';')}`;
}

/** Parse the parameters of a UAID back into a record. */
export function parseUaid(uaid: string): { target: string; id: string; params: Record<string, string> } {
  const m = /^uaid:(aid|did):([^;]+)(?:;(.*))?$/.exec(uaid);
  if (!m) throw new Error('not a UAID');
  const params: Record<string, string> = {};
  for (const part of (m[3] ?? '').split(';').filter(Boolean)) {
    const idx = part.indexOf('=');
    if (idx > 0) params[part.slice(0, idx)] = part.slice(idx + 1);
  }
  return { target: m[1], id: m[2], params };
}

/** CAIP-10 style native id for a Hedera account. */
export function hederaNativeId(network: 'testnet' | 'mainnet', accountId: string): string {
  return `hedera:${network}:${accountId}`;
}
