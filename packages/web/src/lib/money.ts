/** Money in the browser: BigInt only, same rules as @agora402/shared. */
export const big = (v: unknown): bigint => {
  try {
    return BigInt(String(v ?? 0));
  } catch {
    return 0n;
  }
};

export function fmt(v: unknown, decimals = 8, symbol = 'HBAR', maxFrac = 8): string {
  const a = big(v);
  const neg = a < 0n;
  const abs = neg ? -a : a;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  let frac = (abs % base).toString().padStart(decimals, '0').slice(0, maxFrac).replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole}${frac ? '.' + frac : ''} ${symbol}`;
}

export function tinybars(v: unknown): string {
  return big(v).toLocaleString('en-US');
}

export type PricingModel =
  | { kind: 'flat'; amount: string }
  | { kind: 'per-token'; base: string; inputPer1k: string; outputPer1k: string }
  | { kind: 'per-unit'; unit: string; amountPerUnit: string };

export interface Estimate {
  inputTokens?: number;
  maxOutputTokens?: number;
  units?: number;
}

const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

export function priceFor(model: PricingModel, est: Estimate = {}): bigint {
  if (model.kind === 'flat') return big(model.amount);
  if (model.kind === 'per-unit') return BigInt(Math.max(1, est.units ?? 1)) * big(model.amountPerUnit);
  const input = BigInt(Math.max(0, est.inputTokens ?? 0));
  const output = BigInt(Math.max(0, est.maxOutputTokens ?? 0));
  return big(model.base) + ceilDiv(input * big(model.inputPer1k), 1000n) + ceilDiv(output * big(model.outputPer1k), 1000n);
}

export function estimateTokens(text: string): number {
  return text ? Math.ceil(text.length / 4) : 0;
}

/** Human label of a pricing model, e.g. "0.0005 HBAR + 0.0002 per 1k in + 0.0006 per 1k out". */
export function priceLabel(model: PricingModel, decimals: number, symbol: string): string {
  if (model.kind === 'flat') return `${fmt(model.amount, decimals, symbol)} per call`;
  if (model.kind === 'per-unit') return `${fmt(model.amountPerUnit, decimals, symbol)} per ${model.unit}`;
  return `${fmt(model.base, decimals, symbol)} + ${fmt(model.inputPer1k, decimals, '')}per 1k in + ${fmt(model.outputPer1k, decimals, '')}per 1k out`;
}
