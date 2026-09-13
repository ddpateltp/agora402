<script setup lang="ts">
import { ref } from 'vue';
import type { Attestation } from '../lib/types';
import HashLink from './HashLink.vue';
import TrustSeal from './TrustSeal.vue';
import FindingList from './FindingList.vue';

const props = defineProps<{ attestation: Attestation; topicId?: string | null; consensusTimestamp?: string }>();
const raw = ref(false);
const trust = () => ({ ...props.attestation, current: true, consensusTimestamp: props.consensusTimestamp ?? '', sequenceNumber: 0 });
</script>

<template>
  <div class="att" :class="attestation.verdict">
    <div class="head">
      <TrustSeal :trust="trust()" :size="72" />
      <div class="text">
        <div class="verdict">{{ attestation.verdict === 'safe' ? 'Safe to buy from' : 'Do not buy from this seller' }}<span class="sq" aria-hidden="true"></span></div>
        <p class="summary">{{ attestation.summary }}</p>
        <div class="facts">
          <span class="dim">audit <span class="mono">{{ attestation.auditId }}</span></span>
          <span class="dim">by auditor <HashLink kind="account" :id="attestation.auditorAccount" /></span>
          <span class="dim" v-if="topicId">on topic <HashLink kind="topic" :id="topicId" /></span>
          <span class="dim">model {{ attestation.model }}</span>
        </div>
      </div>
    </div>
    <div class="cols">
      <div>
        <h3>What the service does</h3>
        <ul class="caps"><li v-for="(c, i) in attestation.capabilities" :key="i">{{ c }}</li></ul>
      </div>
      <div>
        <h3>Findings</h3>
        <FindingList :findings="attestation.findings" empty-text="Nothing found: the live manifest matches the listing, quotes are signed by the paid account, and every 402 honours the published price." />
      </div>
    </div>
    <button class="toggle self" @click="raw = !raw">{{ raw ? 'hide' : 'show' }} the attestation as written to HCS</button>
    <pre class="raw" v-if="raw">{{ JSON.stringify(attestation, null, 2) }}</pre>
  </div>
</template>

<style scoped>
.att { display: flex; flex-direction: column; gap: 18px; }
.head { display: flex; gap: 20px; align-items: flex-start; }
.verdict { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
.dangerous .verdict { color: var(--color-orange); }
.dangerous .verdict .sq { background: var(--color-black); }
.summary { margin-top: 6px; color: var(--color-gray); max-width: 70ch; line-height: 1.5; }
.facts { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 10px; font-size: 12.5px; }
.cols { display: grid; grid-template-columns: 1fr 1.4fr; gap: 24px; padding-top: 16px; border-top: 1px solid var(--color-light-gray); }
.caps { margin: 8px 0 0; padding-left: 16px; list-style: square; color: var(--color-gray); font-size: 13px; }
.caps li { margin-bottom: 4px; }
.caps li::marker { color: var(--color-orange); }
h3 + * { margin-top: 8px; }
.self { align-self: flex-start; }
@media (max-width: 760px) { .cols { grid-template-columns: 1fr; } .head { flex-direction: column; } }
</style>
