<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import StageRail from '../components/StageRail.vue';
import AttestationCard from '../components/AttestationCard.vue';
import HashLink from '../components/HashLink.vue';
import TrustSeal from '../components/TrustSeal.vue';
import FindingList from '../components/FindingList.vue';
import { session, loadSellers } from '../lib/session';
import { fmt } from '../lib/money';
import { AUDIT_STEPS, BUY_STEPS } from '../lib/rails';
import { useAuditRun } from '../lib/useAuditRun';

const route = useRoute();
const subject = ref('');
const auditor = ref('');
const { running, payRail, auditRail, stageDetails, result, error, log, run: runAudit } = useAuditRun();
const showLog = ref(false);

const subjects = computed(() => session.listings.filter((l) => !(l.endpoints.length === 1 && l.endpoints[0].id === 'audit')));
const auditors = computed(() => session.listings.filter((l) => l.endpoints.some((e) => e.id === 'audit')));
const chosenSubject = computed(() => session.listings.find((l) => l.uaid === subject.value) ?? null);
const chosenAuditor = computed(() => session.listings.find((l) => l.uaid === auditor.value) ?? auditors.value[0] ?? null);
const auditPrice = computed(() => chosenAuditor.value?.endpoints.find((e) => e.id === 'audit')?.accepts[0]);

onMounted(async () => {
  if (session.listings.length === 0) await loadSellers();
  pickFromRoute();
});
watch(() => route.query, pickFromRoute);
function pickFromRoute() {
  if (typeof route.query.subject === 'string') subject.value = route.query.subject;
  if (typeof route.query.seller === 'string' && auditors.value.some((a) => a.uaid === route.query.seller)) auditor.value = route.query.seller;
  if (!subject.value && subjects.value[0]) subject.value = subjects.value[0].uaid;
}

async function run() {
  if (!chosenSubject.value) return;
  await runAudit(chosenSubject.value.uaid, chosenAuditor.value?.baseUrl);
}
</script>

<template>
  <div class="layout">
    <section class="card form">
      <h2>Order an audit</h2>
      <p class="muted intro">An auditor agent is a seller like any other. You pay it over x402; it probes the subject live, writes each stage to the audit topic, and ends with an attestation the whole marketplace can read.</p>
      <div class="field">
        <label for="subject">Seller to audit</label>
        <select id="subject" v-model="subject">
          <option v-for="l in subjects" :key="l.uaid" :value="l.uaid">{{ l.name }}</option>
        </select>
      </div>
      <div class="current" v-if="chosenSubject">
        <TrustSeal :trust="chosenSubject.trust" :size="44" />
        <div class="muted">
          <template v-if="!chosenSubject.trust">Never audited. Buyers see it as unverified.</template>
          <template v-else-if="!chosenSubject.trust.current">Its attestation is stale: the listing changed since audit {{ chosenSubject.trust.auditId }}.</template>
          <template v-else>Attested {{ chosenSubject.trust.verdict }} with trust {{ chosenSubject.trust.trustScore }} by <HashLink kind="account" :id="chosenSubject.trust.auditorAccount" />. A new audit replaces it.</template>
        </div>
      </div>
      <div class="field">
        <label for="auditor">Auditor</label>
        <select id="auditor" v-model="auditor">
          <option value="">Cheapest auditor in the registry</option>
          <option v-for="l in auditors" :key="l.uaid" :value="l.uaid">{{ l.name }}</option>
        </select>
        <div class="hint" v-if="auditPrice">Flat price {{ fmt(auditPrice.pricing.kind === 'flat' ? auditPrice.pricing.amount : 0, auditPrice.decimals, auditPrice.symbol) }} per audit.</div>
        <div class="hint error" v-else-if="!session.loadingSellers">No auditor in the registry. Start one with <span class="mono">npm run auditor</span> and register it with <span class="mono">--role auditor</span>.</div>
      </div>
      <button class="btn primary go" @click="run" :disabled="running || !chosenSubject || !chosenAuditor">{{ running ? 'Auditing…' : 'Pay the auditor and run the audit' }}</button>
      <p class="error" v-if="error">{{ error }}</p>
    </section>

    <section class="card rails">
      <h2>Live <button class="toggle right" @click="showLog = !showLog">{{ showLog ? 'hide' : 'show' }} raw events</button></h2>
      <div class="two-rails">
        <div>
          <h3>Paying the auditor</h3>
          <StageRail :steps="BUY_STEPS" :state="payRail" compact />
        </div>
        <div>
          <h3>The auditor's pipeline</h3>
          <StageRail :steps="AUDIT_STEPS" :state="auditRail" />
        </div>
      </div>
      <div class="log mono" v-if="showLog"><div v-for="(l, i) in log" :key="i"><span class="dim">{{ l.at }}</span> {{ l.text }}</div></div>
    </section>

    <section class="card verdict" v-if="result?.audit">
      <h2>Attestation <span class="right">paid {{ fmt(result.paid, result.decimals, result.symbol) }} to {{ result.auditor.name }}<template v-if="result.transaction">, <HashLink kind="transaction" :id="result.transaction" short /></template></span></h2>
      <AttestationCard :attestation="result.audit.attestation" :topic-id="result.audit.topicId" />
      <p class="dim not-recorded" v-if="!result.audit.recorded">The auditor has no audit topic configured, so this attestation was returned to you but not written to HCS.</p>
    </section>

    <section class="card stages" v-if="stageDetails.length">
      <h2>Stage by stage</h2>
      <div class="stage" v-for="s in stageDetails" :key="s.stage">
        <div class="stage-head"><b>{{ s.index }}. {{ AUDIT_STEPS.find((x) => x.id === s.stage)?.title ?? s.stage }}</b><span class="dim">{{ s.model }}</span></div>
        <p class="muted">{{ s.summary }}</p>
        <FindingList :findings="s.findings" empty-text="No findings in this stage." />
      </div>
    </section>
  </div>
</template>

<style scoped>
.layout { display: grid; grid-template-columns: minmax(340px, 420px) 1fr; grid-template-areas: 'form rails' 'verdict verdict' 'stages stages'; gap: 16px; align-items: start; }
.form { grid-area: form; display: flex; flex-direction: column; gap: 14px; }
.rails { grid-area: rails; }
.verdict { grid-area: verdict; }
.stages { grid-area: stages; display: flex; flex-direction: column; gap: 14px; }
.intro { font-size: 13px; max-width: 60ch; }
.current { display: flex; gap: 12px; align-items: center; padding: 10px 12px; background: var(--inset); border-radius: 10px; font-size: 12.5px; }
.go { justify-content: center; padding: 11px; }
.two-rails { display: grid; grid-template-columns: 1fr 1.4fr; gap: 24px; }
.two-rails h3 { margin-bottom: 10px; }
.log { margin-top: 14px; border-top: 1px solid var(--hair); padding-top: 10px; font-size: 11.5px; max-height: 220px; overflow: auto; }
.stage { padding: 12px 14px; background: var(--inset); border-radius: 10px; }
.stage-head { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 4px; }
.stage p { margin-bottom: 8px; font-size: 13px; }
.not-recorded { margin-top: 12px; font-size: 12.5px; }
@media (max-width: 980px) { .layout { grid-template-columns: 1fr; grid-template-areas: 'form' 'rails' 'verdict' 'stages'; } .two-rails { grid-template-columns: 1fr; } }
</style>
