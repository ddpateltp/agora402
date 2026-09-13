#!/usr/bin/env node
/**
 * Audit a seller from the command line, as the auditor account in .env:
 *
 *   npm run audit -- <seller uaid | seller url> [--dry] [--json]
 *
 * With AUDIT_TOPIC_ID set the trail and the attestation are written to HCS
 * (unless --dry). The auditor identity is AUDITOR_ACCOUNT_ID when set,
 * otherwise SELLER_ACCOUNT_ID. Buying an audit from another agent instead of
 * running one is `agora audit <uaid>` in the buyer CLI.
 */
import { config as loadDotenv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Registry, TrustLedger, createOperatorClient } from '@agora402/registry';
import { ServiceListing, createLlmProvider, generateUaid, hashscanTopic, hederaNativeId, type LlmProviderName } from '@agora402/shared';
import { recordAudit } from './recorder.js';
import { runAudit } from './pipeline.js';
import type { AuditEvent } from './types.js';

loadDotenv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--'));
const dry = args.includes('--dry');
const json = args.includes('--json');
if (!target) {
  console.log('usage: npm run audit -- <seller uaid | seller url> [--dry] [--json]');
  process.exit(1);
}

const network = process.env.HEDERA_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
const accountId = process.env.AUDITOR_ACCOUNT_ID || process.env.SELLER_ACCOUNT_ID;
const privateKey = process.env.AUDITOR_PRIVATE_KEY || process.env.SELLER_PRIVATE_KEY;
if (!accountId || !privateKey) throw new Error('AUDITOR_ACCOUNT_ID/AUDITOR_PRIVATE_KEY or SELLER_ACCOUNT_ID/SELLER_PRIVATE_KEY required');
const name = process.env.AUDITOR_NAME || 'agora-auditor';
const auditor = { uaid: generateUaid({ registry: 'agora402', name, version: '1.0.0', protocol: 'a2a', nativeId: hederaNativeId(network, accountId), skills: [40], uid: name }), accountId };

const listing = /^https?:\/\//.test(target)
  ? ServiceListing.parse(await (await fetch(`${target.replace(/\/$/, '')}/.well-known/agora402.json`)).json())
  : await (async () => {
      const topicId = process.env.REGISTRY_TOPIC_ID;
      if (!topicId) throw new Error('REGISTRY_TOPIC_ID required to audit by uaid');
      const l = (await new Registry({ network, topicId }).listServices()).find((s) => s.uaid === target || s.name === target);
      if (!l) throw new Error(`no listing ${target} in registry ${topicId}`);
      return l;
    })();

const provider = (process.env.LLM_PROVIDER as LlmProviderName | undefined) ?? 'mock';
const llm = createLlmProvider({ provider, groqApiKey: process.env.GROQ_API_KEY, groqModel: process.env.GROQ_MODEL, anthropicApiKey: process.env.ANTHROPIC_API_KEY, anthropicModel: process.env.ANTHROPIC_MODEL });

const onEvent = json
  ? undefined
  : (e: AuditEvent) => {
      if (e.type === 'stage' && e.status === 'running') console.error(`  ${e.index}/${e.total} ${e.stage} …`);
      if (e.type === 'stage' && e.status === 'done') console.error(`  ${e.index}/${e.total} ${e.stage}: ${e.message.summary}${e.message.findings.length ? `\n${e.message.findings.map((f) => `        [${f.severity}] ${f.title}`).join('\n')}` : ''}`);
      if (e.type === 'recorded') console.error(`      -> HCS seq ${e.sequenceNumber} (${e.what}${e.stage ? ' ' + e.stage : ''})`);
      if (e.type === 'record_failed') console.error(`      !! HCS publish failed (${e.what}): ${e.error}`);
    };

if (!json) console.error(`auditing ${listing.name} (${listing.uaid}) at ${listing.baseUrl} as ${accountId}, llm ${llm.name}${dry || !process.env.AUDIT_TOPIC_ID ? ', dry run (not written to HCS)' : ''}`);

if (dry || !process.env.AUDIT_TOPIC_ID) {
  const run = await runAudit({ network, listing, auditor, llm, onEvent });
  console.log(json ? JSON.stringify(run, null, 2) : `\nverdict ${run.attestation.verdict}, trust ${run.attestation.trustScore}/100, risk ${run.attestation.risk}\n${run.attestation.summary}`);
} else {
  const client = createOperatorClient({ network, accountId, privateKey });
  try {
    const ledger = new TrustLedger({ network, topicId: process.env.AUDIT_TOPIC_ID });
    const rec = await recordAudit({ network, listing, auditor, llm, onEvent, ledger, client });
    console.log(json ? JSON.stringify(rec, null, 2) : `\nverdict ${rec.run.attestation.verdict}, trust ${rec.run.attestation.trustScore}/100, risk ${rec.run.attestation.risk}\n${rec.run.attestation.summary}\naudit ${rec.run.auditId} on topic ${rec.topicId}  ${hashscanTopic(network, rec.topicId)}`);
  } finally {
    client.close();
  }
}
