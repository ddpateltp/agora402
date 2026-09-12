#!/usr/bin/env node
import { Registry, ReceiptLedger } from '@agora402/registry';
import { formatAmount, hashscanTopic, parseAmount } from '@agora402/shared';
import { BuyerAgent, type AgentEvent } from './agent.js';
import { loadBuyerConfig } from './config.js';

const HELP = `agora: Agora402 buyer agent

Usage:
  agora discover [--seller <url>]                       list sellers and endpoints (registry or one seller)
  agora infer "<prompt>" [--seller <url>] [--max-tokens N] [--counter 90] [--budget 0.05] [--max-call 0.01]
  agora rate [--seller <url>]                           buy one HBAR/USD quote
  agora receipts --topic <topicId> [--seller-account <0.0.x>]   audit the receipts topic against the mirror node

Options:
  --seller <url>         talk to one seller directly instead of reading the registry
  --budget <HBAR>        session budget (default 0.5)
  --max-call <HBAR>      cap for a single payment (default 0.05)
  --counter <percent>    offer this percent of list price when negotiating (default 100)
  --json                 print machine-readable output only
`;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);
const VALUE_FLAGS = new Set(['seller', 'max-tokens', 'counter', 'budget', 'max-call', 'topic', 'seller-account']);

/** Positional words: everything that is not a flag or the value of a flag that takes one. */
function positionals(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      if (VALUE_FLAGS.has(a.slice(2))) i++;
      continue;
    }
    out.push(a);
  }
  return out;
}

function printEvent(e: AgentEvent) {
  const t = e.at.slice(11, 23);
  console.error(`${t}  ${e.stage.padEnd(17)} ${e.message}`);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === '--help' || cmd === '-h') {
    console.log(HELP);
    return;
  }
  const cfg = loadBuyerConfig();
  const json = flag('json');
  const sellerUrl = arg('seller') ?? cfg.SELLER_PUBLIC_URL;
  const registry = cfg.REGISTRY_TOPIC_ID ? new Registry({ network: cfg.HEDERA_NETWORK, topicId: cfg.REGISTRY_TOPIC_ID }) : undefined;

  if (cmd === 'receipts') {
    const topic = arg('topic');
    if (!topic) throw new Error('--topic <topicId> required');
    const ledger = new ReceiptLedger({ network: cfg.HEDERA_NETWORK, topicId: topic });
    const audit = await ledger.audit({ expectedSellerAccount: arg('seller-account') });
    if (json) {
      console.log(JSON.stringify(audit, null, 2));
      return;
    }
    console.log(`Receipts topic ${topic}  ${hashscanTopic(cfg.HEDERA_NETWORK, topic)}`);
    let total = 0n;
    for (const r of audit) {
      const ok = r.matchesChain ? 'OK  ' : 'FAIL';
      total += BigInt(r.receipt.amount);
      console.log(`${ok} #${r.sequenceNumber} ${r.receipt.transactionId}  ${formatAmount(r.receipt.amount, 8, r.receipt.asset === '0.0.0' ? 'HBAR' : r.receipt.asset)}  ${r.receipt.payer} -> ${r.receipt.payTo}  ${r.receipt.resource}${r.problems.length ? '  ' + r.problems.join('; ') : ''}`);
    }
    console.log(`${audit.length} receipt(s), ${audit.filter((r) => r.matchesChain).length} match the chain, total ${formatAmount(total, 8, 'HBAR')}`);
    return;
  }

  const agent = new BuyerAgent({
    network: cfg.HEDERA_NETWORK,
    accountId: cfg.BUYER_ACCOUNT_ID,
    privateKey: cfg.BUYER_PRIVATE_KEY,
    name: cfg.BUYER_NAME,
    maxPerCall: parseAmount(arg('max-call') ?? '0.05', 8),
    sessionBudget: parseAmount(arg('budget') ?? '0.5', 8),
    registry,
    verifyQuoteSigner: true,
    onEvent: json ? undefined : printEvent,
  });

  if (cmd === 'discover') {
    const listings = sellerUrl && !registry ? [await agent.listingFrom(sellerUrl)] : registry ? await registry.listServices() : [];
    if (json) {
      console.log(JSON.stringify(listings, null, 2));
      return;
    }
    if (listings.length === 0) console.log('no sellers found (set REGISTRY_TOPIC_ID or pass --seller <url>)');
    for (const l of listings) {
      console.log(`\n${l.name}  v${l.version}\n  uaid   ${l.uaid}\n  payTo  ${l.payTo}\n  url    ${l.baseUrl}\n  quotes ${l.baseUrl}${l.quotePath}`);
      for (const e of l.endpoints) {
        console.log(`  ${e.method} ${e.path}  ${e.description}`);
        for (const a of e.accepts) console.log(`      ${a.symbol.padEnd(5)} ${JSON.stringify(a.pricing)}`);
      }
    }
    return;
  }

  if (cmd === 'infer') {
    // npm strips the quotes around the prompt, so join every positional word.
    const prompt = positionals(rest).join(' ').trim();
    if (!prompt) throw new Error('prompt required: agora infer "your question"');
    const counter = arg('counter') ? Math.round(Number(arg('counter')) * 100) : undefined;
    const r = await agent.infer(prompt, { sellerUrl, maxTokens: Number(arg('max-tokens') ?? 200), counterBps: counter });
    if (json) {
      console.log(JSON.stringify({ ...r, amount: r.amount?.toString(), offer: { seller: r.offer.listing.name, listPrice: r.offer.listPrice.toString() } }, null, 2));
      return;
    }
    console.log(`\n${r.body.choices?.[0]?.message?.content ?? JSON.stringify(r.body)}\n`);
    summary(agent, r.amount, r.hashscanUrl, r.body.usage);
    return;
  }

  if (cmd === 'rate') {
    const r = await agent.hbarRate({ sellerUrl });
    if (json) {
      console.log(JSON.stringify({ ...r, amount: r.amount?.toString() }, null, 2));
      return;
    }
    console.log(`\nHBAR/USD ${r.body.usdPerHbar}  (rate file expires ${r.body.expirationTime})\n`);
    summary(agent, r.amount, r.hashscanUrl);
    return;
  }

  console.log(HELP);
  process.exitCode = 1;
}

function summary(agent: BuyerAgent, amount: bigint | null, hashscanUrl: string | null, usage?: { prompt_tokens: number; completion_tokens: number }) {
  if (amount !== null) console.log(`paid      ${formatAmount(amount, 8, 'HBAR')}${usage ? `  for ${usage.prompt_tokens} in / ${usage.completion_tokens} out tokens` : ''}`);
  if (hashscanUrl) console.log(`hashscan  ${hashscanUrl}`);
  console.log(`session   spent ${formatAmount(agent.totalSpent, 8, 'HBAR')}, remaining ${formatAmount(agent.remaining, 8, 'HBAR')}`);
}

main().catch((err) => {
  console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
