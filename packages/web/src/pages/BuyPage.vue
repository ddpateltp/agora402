<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import StageRail from '../components/StageRail.vue';
import HashLink from '../components/HashLink.vue';
import ReceiptsTable from '../components/ReceiptsTable.vue';
import TrustSeal from '../components/TrustSeal.vue';
import { session, loadSellers } from '../lib/session';
import { getReceipts, postRate, timeOf } from '../lib/api';
import { estimateTokens, fmt, priceFor } from '../lib/money';
import { BUY_STEPS } from '../lib/rails';
import { useBuyRun } from '../lib/useBuyRun';
import type { VerifiedReceipt } from '../lib/types';

const route = useRoute();
const form = reactive({
  task: 'infer' as 'infer' | 'rate',
  prompt: 'Explain in two sentences why an AI agent would pay for an API call with x402 on Hedera instead of using an API key.',
  maxTokens: 400,
  counter: 90,
  budget: '0.5',
  maxCall: '0.05',
  minTrust: '' as string | number,
  seller: '' as string,
});
const { running, rail, log, result, error, run: runBuy } = useBuyRun();
const showLog = ref(false);
const receipts = ref<VerifiedReceipt[]>([]);
const receiptsTopic = ref<string | null>(null);
const rating = reactive({ score: 0, comment: '', busy: false, done: '' as string, error: '' });

const wantedEndpoint = computed(() => (form.task === 'infer' ? 'infer' : 'hbar-rate'));
const sellers = computed(() => session.listings.filter((l) => l.endpoints.some((e) => e.id === wantedEndpoint.value)));
const chosen = computed(() => session.listings.find((l) => l.uaid === form.seller) ?? null);
const estimate = computed(() => (form.task === 'infer' ? { inputTokens: estimateTokens(form.prompt), maxOutputTokens: form.maxTokens } : { units: 1 }));
const listPrice = computed(() => {
  const l = chosen.value ?? sellers.value[0];
  const ep = l?.endpoints.find((e) => e.id === wantedEndpoint.value);
  const opt = ep?.accepts.find((a) => a.asset === '0.0.0');
  return opt ? priceFor(opt.pricing, estimate.value) : null;
});
const offerAmount = computed(() => (listPrice.value !== null ? (listPrice.value * BigInt(form.counter)) / 100n : null));

onMounted(async () => {
  if (session.listings.length === 0) await loadSellers();
  if (typeof route.query.seller === 'string') form.seller = route.query.seller;
  void loadReceipts();
});
watch(() => route.query.seller, (v) => { if (typeof v === 'string') form.seller = v; });

async function loadReceipts() {
  try {
    const r = await getReceipts();
    receipts.value = r.receipts;
    receiptsTopic.value = r.topic;
  } catch {
    /* dashboard without receipts topic */
  }
}

async function run() {
  rating.done = '';
  rating.error = '';
  rating.score = 0;
  await runBuy({ task: form.task, prompt: form.prompt, maxTokens: form.maxTokens, counter: form.task === 'infer' ? form.counter : undefined, budget: form.budget, maxCall: form.maxCall, minTrust: form.minTrust === '' ? '' : Number(form.minTrust), seller: chosen.value?.baseUrl });
  // Receipts land on HCS a few seconds after settlement.
  setTimeout(loadReceipts, 4000);
  setTimeout(loadReceipts, 12000);
}

async function sendRating() {
  if (!result.value?.transaction || rating.score < 1) return;
  rating.busy = true;
  rating.error = '';
  try {
    const r = await postRate({ subject: result.value.sellerUaid, subjectAccount: result.value.payTo, transactionId: result.value.transaction, score: rating.score, comment: rating.comment });
    rating.done = `Recorded on the reputation topic, sequence ${r.sequenceNumber}.`;
    void loadSellers();
  } catch (err) {
    rating.error = err instanceof Error ? err.message : String(err);
  } finally {
    rating.busy = false;
  }
}
</script>

<template>
  <div class="layout">
    <section class="card form">
      <h2>Buy a service</h2>
      <div class="tabs">
        <button :class="{ on: form.task === 'infer' }" @click="form.task = 'infer'">Inference</button>
        <button :class="{ on: form.task === 'rate' }" @click="form.task = 'rate'">HBAR/USD rate</button>
      </div>
      <div class="field" v-if="form.task === 'infer'">
        <label for="prompt">Prompt</label>
        <textarea id="prompt" v-model="form.prompt" />
        <div class="hint">About {{ estimateTokens(form.prompt) }} input tokens, up to {{ form.maxTokens }} output tokens.</div>
      </div>
      <div class="two" v-if="form.task === 'infer'">
        <div class="field"><label for="counter">Offer, % of list price</label><input id="counter" type="number" min="50" max="100" v-model.number="form.counter" /><div class="hint">Below the seller's floor (85%) the quote is refused.</div></div>
        <div class="field"><label for="maxTokens">Max output tokens</label><input id="maxTokens" type="number" min="16" max="4000" v-model.number="form.maxTokens" /></div>
      </div>
      <div class="two">
        <div class="field"><label for="budget">Session budget (HBAR)</label><input id="budget" type="text" v-model="form.budget" /></div>
        <div class="field"><label for="maxCall">Max per call (HBAR)</label><input id="maxCall" type="text" v-model="form.maxCall" /></div>
      </div>
      <div class="two">
        <div class="field">
          <label for="minTrust">Trust policy</label>
          <select id="minTrust" v-model="form.minTrust">
            <option value="">Anyone except attested dangerous, verified first</option>
            <option :value="50">Verified, trust 50 or more</option>
            <option :value="70">Verified, trust 70 or more</option>
            <option :value="90">Verified, trust 90 or more</option>
          </select>
        </div>
        <div class="field">
          <label for="seller">Seller</label>
          <select id="seller" v-model="form.seller">
            <option value="">Cheapest that passes the policy</option>
            <option v-for="l in sellers" :key="l.uaid" :value="l.uaid">{{ l.name }}{{ l.trust?.current && l.trust.verdict === 'safe' ? ` (verified ${l.trust.trustScore})` : l.trust?.current ? ' (dangerous)' : '' }}</option>
          </select>
        </div>
      </div>
      <div class="price-line" v-if="listPrice !== null">
        <span class="muted">List price for this request</span><b class="mono">{{ fmt(listPrice) }}</b>
        <template v-if="form.task === 'infer' && form.counter < 100"><span class="muted">your offer</span><b class="mono">{{ fmt(offerAmount) }}</b></template>
      </div>
      <button class="btn primary go" @click="run" :disabled="running">{{ running ? 'Running…' : 'Discover, negotiate, pay' }}</button>
      <p class="error" v-if="error">{{ error }}</p>
    </section>

    <section class="card rail-card">
      <h2>Payment flow <button class="toggle right" @click="showLog = !showLog">{{ showLog ? 'hide' : 'show' }} raw events</button></h2>
      <StageRail :steps="BUY_STEPS" :state="rail" />
      <div class="log mono" v-if="showLog">
        <div v-for="(e, i) in log" :key="i"><span class="dim">{{ timeOf(e.at) }}</span> <span class="stage">{{ e.stage }}</span> {{ e.message }}</div>
        <div class="dim" v-if="!log.length">No events yet.</div>
      </div>
    </section>

    <section class="card response" v-if="result">
      <h2>{{ result.task === 'rate' ? 'HBAR/USD rate' : 'Response' }} <span class="right">{{ result.seller }}{{ result.model ? `, ${result.model}` : '' }}, {{ (result.elapsedMs / 1000).toFixed(1) }} s</span></h2>
      <p class="answer" v-if="result.answer">{{ result.answer }}</p>
      <div v-else-if="result.task === 'rate' && result.raw" class="rate-big">
        <b class="mono">{{ (result.raw as { usdPerHbar?: number }).usdPerHbar }}</b><span class="muted"> USD per HBAR, from the network exchange rate file</span>
      </div>
      <p class="error" v-else>{{ JSON.stringify(result.raw).slice(0, 400) }}</p>
      <div class="usage muted" v-if="result.usage">{{ result.usage.prompt_tokens }} input tokens, {{ result.usage.completion_tokens }} output tokens</div>
    </section>

    <section class="card receipt" v-if="result && result.paid">
      <h2>Receipt <span class="right" v-if="result.trust">seller <TrustSeal :trust="result.trust" :size="26" :label="false" /> {{ result.trust.current && result.trust.verdict === 'safe' ? `verified ${result.trust.trustScore}` : result.trust.current ? 'dangerous' : 'stale attestation' }}</span></h2>
      <dl>
        <dt>List price</dt><dd class="mono">{{ fmt(result.listPrice, result.decimals, result.symbol) }}</dd>
        <dt>Quoted</dt><dd class="mono">{{ result.quote ? fmt(result.quote.amount, result.decimals, result.symbol) : 'no quote' }}<span class="dim" v-if="result.quote?.countered"> (seller accepted the counter)</span></dd>
        <dt>Paid</dt><dd class="mono paid">{{ fmt(result.paid, result.decimals, result.symbol) }}</dd>
        <dt>Settlement</dt><dd><HashLink kind="transaction" :id="result.transaction!" /></dd>
        <dt>Paid to</dt><dd><HashLink kind="account" :id="result.payTo" /></dd>
        <dt>Facilitator</dt><dd class="mono dim">{{ result.facilitator }}</dd>
        <template v-if="result.onChain">
          <dt>Mirror node</dt>
          <dd>{{ result.onChain.result }} at <span class="mono">{{ result.onChain.consensus }}</span>, network fee {{ fmt(result.onChain.fee, 8, 'HBAR') }} paid by the facilitator</dd>
          <dt>Transfers</dt>
          <dd class="transfers"><div v-for="t in result.onChain.transfers.filter((x) => x.amount !== 0)" :key="t.account + t.amount"><HashLink kind="account" :id="t.account" /><span class="mono" :class="t.amount < 0 ? 'neg' : 'pos'">{{ t.amount > 0 ? '+' : '' }}{{ fmt(t.amount) }}</span></div></dd>
        </template>
      </dl>
      <div class="rate-box">
        <span class="muted">Rate this seller, citing this payment</span>
        <div class="stars" role="radiogroup" aria-label="score">
          <button v-for="n in 5" :key="n" :class="{ on: n <= rating.score }" @click="rating.score = n" :aria-pressed="n <= rating.score" :disabled="!!rating.done">★</button>
        </div>
        <input type="text" v-model="rating.comment" placeholder="optional comment" maxlength="280" :disabled="!!rating.done" />
        <button class="btn small" @click="sendRating" :disabled="rating.busy || rating.score < 1 || !!rating.done || !session.config?.reputationTopic">{{ rating.busy ? 'Recording…' : 'Record rating' }}</button>
        <span class="ok-text" v-if="rating.done">{{ rating.done }}</span>
        <span class="error" v-if="rating.error">{{ rating.error }}</span>
        <span class="dim" v-if="!session.config?.reputationTopic">No reputation topic configured.</span>
      </div>
    </section>

    <section class="card receipts">
      <h2>Receipts on HCS <span class="right" v-if="receiptsTopic">topic <HashLink kind="topic" :id="receiptsTopic" /> <button class="toggle" @click="loadReceipts">refresh</button></span></h2>
      <ReceiptsTable :receipts="receipts" :highlight="result?.transaction" />
    </section>
  </div>
</template>

<style scoped>
.layout { display: grid; grid-template-columns: minmax(340px, 420px) 1fr; grid-template-areas: 'form rail' 'response response' 'receipt receipt' 'receipts receipts'; gap: 16px; align-items: start; }
.form { grid-area: form; display: flex; flex-direction: column; gap: 14px; }
.rail-card { grid-area: rail; }
.response { grid-area: response; }
.receipt { grid-area: receipt; }
.receipts { grid-area: receipts; }
.tabs { display: inline-flex; background: var(--inset); border-radius: 9px; padding: 3px; gap: 2px; }
.tabs button { border: 0; background: none; padding: 6px 12px; border-radius: 7px; color: var(--ink-2); font-weight: 500; }
.tabs button.on { background: var(--card); color: var(--ink); box-shadow: var(--shadow); }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.price-line { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; padding: 10px 12px; background: var(--inset); border-radius: 10px; font-size: 13px; }
.go { justify-content: center; padding: 11px; font-size: 14px; }
.log { margin-top: 14px; border-top: 1px solid var(--hair); padding-top: 10px; font-size: 11.5px; max-height: 260px; overflow: auto; display: flex; flex-direction: column; gap: 3px; }
.stage { color: var(--accent); }
.answer { font-size: 15px; line-height: 1.55; max-width: 78ch; white-space: pre-wrap; }
.rate-big b { font-size: 28px; }
.usage { margin-top: 10px; font-size: 12.5px; }
dl { display: grid; grid-template-columns: 120px 1fr; gap: 6px 14px; margin: 0; font-size: 13px; }
dt { color: var(--ink-2); }
dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.paid { font-weight: 600; color: var(--accent); }
.transfers { display: flex; flex-direction: column; gap: 3px; }
.transfers div { display: flex; justify-content: space-between; gap: 12px; max-width: 420px; }
.neg { color: var(--bad); } .pos { color: var(--ok); }
.rate-box { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--hair); font-size: 13px; }
.rate-box input { width: 240px; }
.stars { display: inline-flex; gap: 2px; }
.stars button { border: 0; background: none; font-size: 20px; color: var(--hair); padding: 0 2px; line-height: 1; }
.stars button.on { color: var(--warn); }
.ok-text { color: var(--ok); }
@media (max-width: 980px) { .layout { grid-template-columns: 1fr; grid-template-areas: 'form' 'rail' 'response' 'receipt' 'receipts'; } }
@media (max-width: 560px) { .two { grid-template-columns: 1fr; } dl { grid-template-columns: 1fr; } }
</style>
