import { config as loadDotenv } from 'dotenv';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, '../..');
export const ENV_PATH = resolve(ROOT, '.env');
loadDotenv({ path: ENV_PATH });

export function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set. Copy .env.example to .env and fill it in.`);
  return v;
}

export function network(): 'testnet' | 'mainnet' {
  return process.env.HEDERA_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
}

/**
 * Write KEY=value into .env, replacing an existing line or appending.
 * Only ever touches ids (topics, tokens); never keys.
 */
export function saveEnv(entries: Record<string, string>): void {
  let text = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';
  for (const [k, v] of Object.entries(entries)) {
    const line = `${k}=${v}`;
    const re = new RegExp(`^${k}=.*$`, 'm');
    text = re.test(text) ? text.replace(re, line) : `${text.replace(/\n?$/, '\n')}${line}\n`;
    process.env[k] = v;
  }
  writeFileSync(ENV_PATH, text);
}
