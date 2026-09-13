import { config as loadDotenv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const here = dirname(fileURLToPath(import.meta.url));
// packages/seller/src -> repo root .env (also works from dist/)
loadDotenv({ path: resolve(here, '../../../.env') });

const Env = z.object({
  HEDERA_NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),
  SELLER_ACCOUNT_ID: z.string().regex(/^\d+\.\d+\.\d+$/),
  SELLER_PRIVATE_KEY: z.string().min(32),
  FACILITATOR_URL: z.string().url().default('https://api.testnet.blocky402.com'),
  REGISTRY_TOPIC_ID: z.string().regex(/^\d+\.\d+\.\d+$/).optional().or(z.literal('')),
  RECEIPTS_TOPIC_ID: z.string().regex(/^\d+\.\d+\.\d+$/).optional().or(z.literal('')),
  AUDIT_TOPIC_ID: z.string().regex(/^\d+\.\d+\.\d+$/).optional().or(z.literal('')),
  REPUTATION_TOPIC_ID: z.string().regex(/^\d+\.\d+\.\d+$/).optional().or(z.literal('')),
  TOLL_TOKEN_ID: z.string().regex(/^\d+\.\d+\.\d+$/).optional().or(z.literal('')),
  SELLER_PORT: z.coerce.number().int().default(4402),
  SELLER_PUBLIC_URL: z.string().url().default('http://localhost:4402'),
  SELLER_NAME: z.string().min(1).default('agora-seller-1'),
  /** services: infer + hbar-rate. auditor: the paid audit endpoint only. both: everything (one process, demo convenience). */
  SELLER_ROLE: z.enum(['services', 'auditor', 'both']).default('services'),
  /** flat price of one audit in tinybars (default 0.01 HBAR) */
  AUDIT_PRICE_TINYBARS: z.string().regex(/^\d+$/).default('1000000'),
  // With SELLER_ROLE=auditor these replace the SELLER_* identity so one .env can run both processes.
  AUDITOR_ACCOUNT_ID: z.string().regex(/^\d+\.\d+\.\d+$/).optional().or(z.literal('')),
  AUDITOR_PRIVATE_KEY: z.string().optional(),
  AUDITOR_PORT: z.coerce.number().int().optional(),
  AUDITOR_PUBLIC_URL: z.string().url().optional().or(z.literal('')),
  AUDITOR_NAME: z.string().optional(),
  LLM_PROVIDER: z.enum(['groq', 'anthropic', 'mock']).default('mock'),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('openai/gpt-oss-20b'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-5'),
});

export type SellerConfig = z.infer<typeof Env> & {
  caip2: 'hedera:testnet' | 'hedera:mainnet';
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): SellerConfig {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Seller configuration invalid. Check your .env (see .env.example):\n${issues}`);
  }
  let c = parsed.data;
  if (c.SELLER_ROLE === 'auditor') {
    c = {
      ...c,
      SELLER_ACCOUNT_ID: c.AUDITOR_ACCOUNT_ID || c.SELLER_ACCOUNT_ID,
      SELLER_PRIVATE_KEY: c.AUDITOR_PRIVATE_KEY || c.SELLER_PRIVATE_KEY,
      SELLER_PORT: c.AUDITOR_PORT ?? 4404,
      SELLER_PUBLIC_URL: c.AUDITOR_PUBLIC_URL || `http://localhost:${c.AUDITOR_PORT ?? 4404}`,
      SELLER_NAME: c.AUDITOR_NAME || 'agora-auditor-1',
    };
  }
  if (c.LLM_PROVIDER === 'groq' && !c.GROQ_API_KEY) throw new Error('LLM_PROVIDER=groq requires GROQ_API_KEY');
  if (c.LLM_PROVIDER === 'anthropic' && !c.ANTHROPIC_API_KEY) throw new Error('LLM_PROVIDER=anthropic requires ANTHROPIC_API_KEY');
  return { ...c, caip2: c.HEDERA_NETWORK === 'mainnet' ? 'hedera:mainnet' : 'hedera:testnet' };
}
