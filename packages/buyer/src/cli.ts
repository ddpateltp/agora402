#!/usr/bin/env node
import { Marketplace, Registry, ReceiptLedger, ReputationLedger, TrustLedger, effectiveTrust, getTransaction } from '@agora402/registry';
import { formatAmount, hashscanTopic, mirrorNodeUrl, parseAmount } from '@agora402/shared';
import { BuyerAgent, type AgentEvent } from './agent.js';
import { loadBuyerConfig } from './config.js';

const HELP = `agora: Agora402 buyer agent

Usage:
  agora discover [--seller <url>]                       list sellers and endpoints (registry or one seller)
  agora infer "<prompt>" [--seller <url>] [--max-tokens N] [--counter 90] [--budget 0.05] [--max-call 0.01] [--min-trust 70]
  agora rate [--seller <url>] [--min-trust 70]          buy one HBAR/USD quote
  agora audit <seller uaid|name|url> [--auditor <url>]  pay an auditor agent to audit a seller; the attestation lands on the audit topic
  agora review <1-5> --tx <transactionId> [--subject <uaid>] [--comment "..."]   rate a seller you paid; the rating cites the settlement
  agora receipts --topic <topicId> [--seller-account <0.0.x>]   audit the receipts topic against the mirror node

Options:
  --seller <url>         talk to one seller directly instead of reading the registry
  --budget <HBAR>        session budget (default 0.5)
  --max-call <HBAR>      cap for a single payment (default 0.05)
  --counter <percent>    offer this percent of list price when negotiating (default 100)
  --min-trust <0-100>    only buy from sellers holding a current safe attestation of at least this score
                         (default: anyone except sellers attested dangerous, verified sellers ranked first)
  --json                 print machine-readable output only
`;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);
const VALUE_FLAGS = new Set(['seller', 'max-tokens', 'counter', 'budget', 'max-call', 'topic', 'seller-account', 'min-trust', 'auditor', 'tx', 'subject', 'comment']);

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
  const trust = cfg.AUDIT_TOPIC_ID ? new TrustLedger({ network: cfg.HEDERA_NETWORK, topicId: cfg.AUDIT_TOPIC_ID }) : undefined;
  const reputation = cfg.REPUTATION_TOPIC_ID ? new ReputationLedger({ network: cfg.HEDERA_NETWORK, topicId: cfg.REPUTATION_TOPIC_ID }) : undefined;
  const minTrust = arg('min-trust') !== undefined ? Number(arg('min-trust')) : undefined;
  if (minTrust !== undefined && !(Number.isInteger(minTrust) && minTrust >= 0 && minTrust <= 100)) throw new Error('--min-trust must be an integer from 0 to 100');

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
    trust,
    reputation,
    minTrust,
    verifyQuoteSigner: true,
    onEvent: json ? undefined : printEvent,
  });

  if (cmd === 'discover') {
    const listings = sellerUrl && !registry ? [{ ...(await agent.listingFrom(sellerUrl)), trust: null, reputation: null }] : registry ? await new Marketplace({ registry, trust, reputation }).list() : [];
    if (json) {
      console.log(JSON.stringify(listings, null, 2));
      return;
    }
    if (listings.length === 0) console.log('no sellers found (set REGISTRY_TOPIC_ID or pass --seller <url>)');
    for (const l of listings) {
      console.log(`\n${l.name}  v${l.version}\n  uaid   ${l.uaid}\n  payTo  ${l.payTo}\n  url    ${l.baseUrl}\n  quotes ${l.baseUrl}${l.quotePath}`);
      console.log(`  trust  ${describeTrust(l.trust)}${l.reputation && l.reputation.count > 0 ? `  rating ${l.reputation.average}/5 from ${l.reputation.count} paid buyer(s)` : ''}`);
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
    const r = await agent.infer(prompt, { sellerUrl, maxTokens: Number(arg('max-tokens') ?? 400), counterBps: counter });
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

  if (cmd === 'review') {
    const score = Number(positionals(rest)[0]);
    const tx = arg('tx');
    if (!Number.isInteger(score) || score < 1 || score > 5) throw new Error('score must be 1 to 5');
    if (!tx) throw new Error('--tx <transactionId> required: the settlement you paid');
    if (!registry) throw new Error('REGISTRY_TOPIC_ID required to resolve the seller');
    const listings = await registry.listServices();
    const subject = arg('subject')
      ? listings.find((l) => l.uaid === arg('subject') || l.name === arg('subject'))
      : await (async () => {
          const onChain = await getTransaction(mirrorNodeUrl(cfg.HEDERA_NETWORK), tx);
          if (!onChain) throw new Error(`settlement ${tx} not found on the mirror node`);
          const credited = new Set([...onChain.transfers.filter((t) => t.amount > 0).map((t) => t.account), ...(onChain.token_transfers ?? []).filter((t) => t.amount > 0).map((t) => t.account)]);
          return listings.find((l) => credited.has(l.payTo));
        })();
    if (!subject) throw new Error('could not match the settlement to a registry listing; pass --subject <uaid>');
    const r = await agent.rate({ subject: subject.uaid, subjectAccount: subject.payTo, transactionId: tx, score, comment: arg('comment') });
    if (json) console.log(JSON.stringify(r, null, 2));
    else console.log(`rated ${subject.name} ${score}/5  topic ${reputation!.topicId} seq ${r.sequenceNumber}  ${hashscanTopic(cfg.HEDERA_NETWORK, reputation!.topicId)}`);
    return;
  }

  if (cmd === 'audit') {
    const target = positionals(rest)[0];
    if (!target) throw new Error('subject required: agora audit <seller uaid|name|url>');
    const subject = /^https?:\/\//.test(target) ? { sellerUrl: target } : { uaid: target };
    const r = await agent.audit(subject, { auditorUrl: arg('auditor') });
    if (json) {
      console.log(JSON.stringify({ ...r, amount: r.amount?.toString() }, null, 2));
      return;
    }
    if (r.status >= 400) throw new Error(`auditor answered ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`);
    const a = r.body.attestation;
    console.log(`\n${r.body.subject.name} (${r.body.subject.uaid})\nverdict ${a.verdict.toUpperCase()}  trust ${a.trustScore}/100  risk ${a.risk}\n${a.summary}`);
    for (const f of a.findings) console.log(`  [${f.severity}] ${f.title}${f.detail ? ': ' + f.detail : ''}`);
    if (r.body.topicUrl) console.log(`audit ${r.body.auditId} on the audit topic  ${r.body.topicUrl}`);
    else console.log(`audit ${r.body.auditId} (auditor has no AUDIT_TOPIC_ID; not written to HCS)`);
    summary(agent, r.amount, r.hashscanUrl);
    return;
  }

  console.log(HELP);
  process.exitCode = 1;
}

function describeTrust(trust: Parameters<typeof effectiveTrust>[0]): string {
  if (!trust) return 'unverified (no attestation on the audit topic)';
  const who = `auditor ${trust.auditorAccount}, audit ${trust.auditId}`;
  if (!trust.current) return `stale: attested ${trust.verdict} ${trust.trustScore}/100 for an earlier version of this listing (${who})`;
  return trust.verdict === 'safe' ? `verified safe ${trust.trustScore}/100 (${who})` : `DANGEROUS, risk ${trust.risk} (${who})`;
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
