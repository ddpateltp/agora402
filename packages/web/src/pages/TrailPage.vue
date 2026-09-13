<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import HashLink from '../components/HashLink.vue';
import ReceiptsTable from '../components/ReceiptsTable.vue';
import TrustSeal from '../components/TrustSeal.vue';
import FindingList from '../components/FindingList.vue';
import { consensusToDate, getAudits, getReceipts, getReputation, getTrail } from '../lib/api';
import { session } from '../lib/session';
import type { Attestation, Finding, ReputationSummary, TrailEntry, VerifiedReceipt } from '../lib/types';

const route = useRoute();
const router = useRouter();
const tab = ref<'audits' | 'receipts' | 'ratings'>('audits');
const attestations = ref<Array<{ attestation: Attestation; consensusTimestamp: string; sequenceNumber: number }>>([]);
const auditTopic = ref<string | null>(null);
const selected = ref('');
const trail = ref<TrailEntry[]>([]);
const receipts = ref<VerifiedReceipt[]>([]);
const receiptsTopic = ref<string | null>(null);
const reputation = ref<Record<string, ReputationSummary>>({});
const reputationTopic = ref<string | null>(null);
const loading = ref(false);
const error = ref('');
const rawOpen = ref<Record<number, boolean>>({});

const nameOf = (uaid: string) => session.listings.find((l) => l.uaid === uaid)?.name ?? uaid.split(';')[0].replace('uaid:aid:', '').slice(0, 14) + '…';
const stageOf = (e: TrailEntry) => (e.message.type === 'audit_started' ? 'started' : e.message.type === 'attestation' ? 'attestation' : String(e.message.stage));

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [a, r, p] = await Promise.all([getAudits(), getReceipts().catch(() => ({ topic: null, receipts: [] as VerifiedReceipt[] })), getReputation().catch(() => ({ topic: null, sellers: {} }))]);
    attestations.value = a.attestations;
    auditTopic.value = a.topic;
    receipts.value = r.receipts;
    receiptsTopic.value = r.topic;
    reputation.value = p.sellers;
    reputationTopic.value = p.topic;
    if (typeof route.query.audit === 'string') selected.value = route.query.audit;
    else if (!selected.value && attestations.value[0]) selected.value = attestations.value[0].attestation.auditId;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}
watch(selected, async (id) => {
  trail.value = [];
  if (!id) return;
  try {
    trail.value = (await getTrail(id)).trail;
    if (route.query.audit !== id) void router.replace({ query: { ...route.query, audit: id } });
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
});
onMounted(load);
const selectedAtt = computed(() => attestations.value.find((a) => a.attestation.auditId === selected.value) ?? null);
const ratingRows = computed(() => Object.entries(reputation.value).flatMap(([uaid, s]) => s.latest.map((l) => ({ uaid, ...l }))).sort((a, b) => (a.consensusTimestamp < b.consensusTimestamp ? 1 : -1)));
</script>

<template>
  <section class="head">
    <div>
      <h1>Everything we wrote to Hedera</h1>
      <p class="muted">Three topics, all public, all replayable from the mirror node without a key. Anyone can recompute what this page shows.</p>
    </div>
    <div class="tabs">
      <button :class="{ on: tab === 'audits' }" @click="tab = 'audits'">Audits<span class="cnt">{{ attestations.length }}</span></button>
      <button :class="{ on: tab === 'receipts' }" @click="tab = 'receipts'">Receipts<span class="cnt">{{ receipts.length }}</span></button>
      <button :class="{ on: tab === 'ratings' }" @click="tab = 'ratings'">Ratings<span class="cnt">{{ ratingRows.length }}</span></button>
      <button class="btn small" @click="load" :disabled="loading">{{ loading ? 'Reading…' : 'Refresh' }}</button>
    </div>
  </section>
  <p class="error" v-if="error">{{ error }}</p>

  <div class="audits" v-if="tab === 'audits'">
    <section class="card list">
      <h2>Attestations <span class="right" v-if="auditTopic">topic <HashLink kind="topic" :id="auditTopic" /></span></h2>
      <p class="empty" v-if="!auditTopic">No audit topic configured. Run <span class="mono">npm run setup:trust</span>.</p>
      <p class="empty" v-else-if="!attestations.length && !loading">No attestations yet. Order one on the Audit page.</p>
      <ul v-else>
        <li v-for="a in attestations" :key="a.attestation.auditId" :class="{ on: a.attestation.auditId === selected }" @click="selected = a.attestation.auditId">
          <TrustSeal :trust="{ ...a.attestation, current: true, consensusTimestamp: a.consensusTimestamp, sequenceNumber: a.sequenceNumber }" :size="36" :label="false" />
          <div class="li-body">
            <b>{{ nameOf(a.attestation.subject) }}</b>
            <div class="dim">{{ a.attestation.verdict }} {{ a.attestation.trustScore }}, {{ consensusToDate(a.consensusTimestamp) }}</div>
          </div>
        </li>
      </ul>
    </section>
    <section class="card trail">
      <h2>Audit trail <span class="right mono" v-if="selected">{{ selected }}</span></h2>
      <p class="empty" v-if="!selected">Pick an attestation.</p>
      <template v-else>
        <div class="who" v-if="selectedAtt">
          <span class="muted">subject</span><b>{{ nameOf(selectedAtt.attestation.subject) }}</b>
          <span class="muted">auditor</span><HashLink kind="account" :id="selectedAtt.attestation.auditorAccount" />
          <span class="muted">content hash</span><span class="mono dim">{{ selectedAtt.attestation.contentHash.slice(0, 16) }}…</span>
        </div>
        <ol class="entries">
          <li v-for="e in trail" :key="e.sequenceNumber">
            <div class="seq mono">#{{ e.sequenceNumber }}</div>
            <div class="entry">
              <div class="entry-head"><b>{{ stageOf(e) }}</b><span class="dim mono">{{ consensusToDate(e.consensusTimestamp) }}</span><span class="dim">paid by <HashLink kind="account" :id="e.payerAccountId" /></span></div>
              <p class="muted" v-if="typeof e.message.summary === 'string'">{{ e.message.summary }}</p>
              <FindingList v-if="Array.isArray(e.message.findings) && (e.message.findings as Finding[]).length" :findings="e.message.findings as Finding[]" />
              <button class="toggle" @click="rawOpen[e.sequenceNumber] = !rawOpen[e.sequenceNumber]">{{ rawOpen[e.sequenceNumber] ? 'hide' : 'show' }} message</button>
              <pre class="raw" v-if="rawOpen[e.sequenceNumber]">{{ JSON.stringify(e.message, null, 2) }}</pre>
            </div>
          </li>
        </ol>
        <p class="empty" v-if="selected && !trail.length">Reading the topic…</p>
      </template>
    </section>
  </div>

  <section class="card" v-if="tab === 'receipts'">
    <h2>Settlement receipts <span class="right" v-if="receiptsTopic">topic <HashLink kind="topic" :id="receiptsTopic" /></span></h2>
    <p class="muted intro">One message per settled payment, written by the seller. The chain column recomputes each bill against the transaction on the mirror node.</p>
    <ReceiptsTable :receipts="receipts" />
  </section>

  <section class="card" v-if="tab === 'ratings'">
    <h2>Ratings with proof of use <span class="right" v-if="reputationTopic">topic <HashLink kind="topic" :id="reputationTopic" /></span></h2>
    <p class="muted intro">A rating counts only when the account that wrote it is the account that paid the settlement it cites, and that settlement paid the rated seller.</p>
    <div class="scroll-x" v-if="ratingRows.length">
      <table>
        <thead><tr><th>Consensus</th><th>Seller</th><th>Score</th><th>Comment</th><th>Rater</th><th>Settlement</th><th>Proof</th></tr></thead>
        <tbody>
          <tr v-for="r in ratingRows" :key="r.rating.transactionId + r.rating.raterAccount">
            <td class="mono dim">{{ consensusToDate(r.consensusTimestamp) }}</td>
            <td>{{ nameOf(r.uaid) }}</td>
            <td><span class="stars"><i v-for="n in 5" :key="n" :class="{ on: n <= r.rating.score }">★</i></span></td>
            <td class="muted">{{ r.rating.comment ?? '' }}</td>
            <td><HashLink kind="account" :id="r.rating.raterAccount" /></td>
            <td><HashLink kind="transaction" :id="r.rating.transactionId" short /></td>
            <td><span class="pill" :class="r.verified ? 'ok' : 'bad'">{{ r.verified ? 'paid' : 'rejected' }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="empty" v-else>No ratings yet. Rate a seller after a payment on the Buy page.</p>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
.head p { margin-top: 4px; max-width: 70ch; }
.tabs { display: flex; align-items: center; gap: 6px; }
.tabs button:not(.btn) { border: 1px solid var(--hair); background: var(--card); border-radius: 999px; padding: 6px 12px; color: var(--ink-2); font-weight: 500; display: inline-flex; gap: 6px; align-items: center; }
.tabs button.on { background: var(--accent-soft); color: var(--accent); border-color: var(--accent-line); }
.cnt { font-family: var(--mono); font-size: 11px; background: rgba(0, 0, 0, 0.05); border-radius: 999px; padding: 0 6px; }
.audits { display: grid; grid-template-columns: minmax(280px, 360px) 1fr; gap: 16px; align-items: start; }
.list ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.list li { display: flex; gap: 10px; align-items: center; padding: 8px 10px; border-radius: 10px; cursor: pointer; border: 1px solid transparent; }
.list li:hover { background: var(--inset); }
.list li.on { background: var(--accent-soft); border-color: var(--accent-line); }
.li-body { font-size: 13px; min-width: 0; }
.who { display: flex; gap: 6px 10px; flex-wrap: wrap; align-items: center; font-size: 12.5px; margin-bottom: 14px; padding: 8px 12px; background: var(--inset); border-radius: 10px; }
.entries { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.entries li { display: grid; grid-template-columns: 44px 1fr; gap: 10px; }
.seq { color: var(--ink-3); font-size: 12px; padding-top: 2px; }
.entry-head { display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; font-size: 13px; }
.entry p { margin: 4px 0 6px; font-size: 13px; }
.intro { font-size: 13px; margin-bottom: 12px; max-width: 72ch; }
.stars i { font-style: normal; color: var(--hair); } .stars i.on { color: var(--warn); }
@media (max-width: 900px) { .audits { grid-template-columns: 1fr; } }
</style>
