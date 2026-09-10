import { config as loadDotenv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const here = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(here, '../../../.env') });

const Env = z.object({
  HEDERA_NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),
  BUYER_ACCOUNT_ID: z.string().regex(/^\d+\.\d+\.\d+$/),
  BUYER_PRIVATE_KEY: z.string().min(32),
  REGISTRY_TOPIC_ID: z.string().regex(/^\d+\.\d+\.\d+$/).optional().or(z.literal('')),
  SELLER_PUBLIC_URL: z.string().url().optional(),
  BUYER_PORT: z.coerce.number().int().default(4403),
  BUYER_NAME: z.string().default('agora-buyer-1'),
});

export type BuyerConfig = z.infer<typeof Env> & { caip2: 'hedera:testnet' | 'hedera:mainnet' };

export function loadBuyerConfig(env: NodeJS.ProcessEnv = process.env): BuyerConfig {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Buyer configuration invalid. Check your .env (see .env.example):\n${issues}`);
  }
  const c = parsed.data;
  return { ...c, caip2: c.HEDERA_NETWORK === 'mainnet' ? 'hedera:mainnet' : 'hedera:testnet' };
}
