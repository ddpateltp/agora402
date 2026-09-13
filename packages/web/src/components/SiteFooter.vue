<script setup lang="ts">
import { computed } from 'vue';
import { session } from '../lib/session';
import HashLink from './HashLink.vue';

defineProps<{ slim?: boolean }>();

/** The testnet topics from the README, shown until the dashboard reports its own. */
const PUBLISHED = { registryTopic: '0.0.10503372', auditTopic: '0.0.10520539', receiptsTopic: '0.0.10503373', reputationTopic: '0.0.10520540' };
const topics = computed(() => {
  const c = session.config ?? PUBLISHED;
  return (
    [
      ['Registry', c.registryTopic],
      ['Audit', c.auditTopic],
      ['Receipts', c.receiptsTopic],
      ['Reputation', c.reputationTopic],
    ] as Array<[string, string | null]>
  ).filter((t): t is [string, string] => Boolean(t[1]));
});
const product = [
  { to: '/market', label: 'Marketplace' },
  { to: '/buy', label: 'Buy a service' },
  { to: '/audit', label: 'Order an audit' },
  { to: '/trail', label: 'On-chain trail' },
  { to: '/demo', label: 'Demo walkthrough' },
];
const resources = [
  { href: 'https://github.com/ddpateltp/agora402', label: 'GitHub' },
  { href: 'https://agora402.mintlify.site', label: 'Documentation' },
  { href: 'https://github.com/ddpateltp/hedera-harness', label: 'Hedera Harness fork' },
  { href: 'https://hashscan.io/testnet', label: 'HashScan' },
];
</script>

<template>
  <footer class="foot" :class="{ slim }">
    <div class="cols" v-if="!slim">
      <div class="about">
        <span class="brand">Agora402</span>
        <p>The trusted agent-to-agent marketplace on Hedera. Discover, verify, negotiate, pay and prove, with a Hedera transaction or an HCS message behind each verb.</p>
      </div>
      <div class="col">
        <p class="eyebrow">Product</p>
        <ul><li v-for="l in product" :key="l.to"><router-link :to="l.to">{{ l.label }}</router-link></li></ul>
      </div>
      <div class="col">
        <p class="eyebrow">On-chain</p>
        <ul><li v-for="[name, id] in topics" :key="name"><span class="dim">{{ name }}</span> <HashLink kind="topic" :id="id" /></li></ul>
      </div>
      <div class="col">
        <p class="eyebrow">Resources</p>
        <ul><li v-for="l in resources" :key="l.href"><a :href="l.href" target="_blank" rel="noopener">{{ l.label }}</a></li></ul>
      </div>
    </div>
    <div class="strip">
      <span>Agora402</span>
      <span class="dim">Discover. Verify. Negotiate. Pay. Prove.</span>
      <span>ETHOnline 2026, Hedera testnet</span>
    </div>
  </footer>
</template>

<style scoped>
.foot { border-top: 1px solid var(--color-black); }
.cols { display: grid; grid-template-columns: 1.5fr 1fr 1fr 1fr; gap: 48px; padding: 64px 40px 80px; }
.brand { font-size: 18px; font-weight: 700; letter-spacing: -0.02em; }
.about p { margin-top: 12px; max-width: 34ch; font-size: 14px; line-height: 1.6; color: var(--color-gray); }
.col ul { list-style: none; margin: 16px 0 0; padding: 0; display: flex; flex-direction: column; gap: 12px; font-size: 14px; }
.col a { color: var(--color-gray); transition: color 120ms; }
.col a:hover { color: var(--color-black); }
.col li { display: flex; align-items: center; gap: 8px; }
.strip { display: flex; align-items: center; justify-content: space-between; gap: 8px 24px; flex-wrap: wrap; padding: 18px 40px; border-top: 1px solid var(--color-black); font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
.slim .strip { border-top: 0; }
@media (max-width: 960px) { .cols { grid-template-columns: 1fr 1fr; gap: 40px 32px; padding: 48px 24px 56px; } }
@media (max-width: 560px) { .cols { grid-template-columns: 1fr; } .strip { flex-direction: column; align-items: flex-start; padding: 16px 18px; } }
</style>
