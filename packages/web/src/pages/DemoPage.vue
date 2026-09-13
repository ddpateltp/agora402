<script setup lang="ts">
/**
 * The scripted walkthrough for the video. One card per step, one Next button,
 * real network calls through the same API and components as the site.
 * Captions are what to say; inputs are prefilled so nothing is typed on camera.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import ListingCard from '../components/ListingCard.vue';
import StageRail from '../components/StageRail.vue';
import AttestationCard from '../components/AttestationCard.vue';
import HashLink from '../components/HashLink.vue';
import ReceiptsTable from '../components/ReceiptsTable.vue';
import TrustSeal from '../components/TrustSeal.vue';
import { getReceipts, postRate } from '../lib/api';
import { fmt } from '../lib/money';
import { AUDIT_STEPS, BUY_STEPS } from '../lib/rails';
import { session, loadSellers, setSpend } from '../lib/session';
import { useAuditRun } from '../lib/useAuditRun';
import { useBuyRun } from '../lib/useBuyRun';
import type { Listing, VerifiedReceipt } from '../lib/types';

const STEPS = [
  { id: 'problem', title: 'The problem', say: 'Agents that buy inference or data from other agents cannot find a service, trust it, agree a price or pay without a human. Agora402 does all four on Hedera.' },
  { id: 'discover', title: 'Discover', say: 'Sellers publish a listing to an HCS topic. Buyers read the mirror node. There is no registry operator, and a listing only counts if the account it names paid for the message.' },
  { id: 'verify', title: 'Verify', say: 'An auditor agent, itself a paid service, probes the seller live and writes every stage to HCS. The badge is a fact on chain, not a claim.' },
  { id: 'pay', title: 'Negotiate and pay', say: 'A signed quote with a counter offer, a 402 for exactly that amount, one Hedera transfer signed by the buyer. Blocky402 pays the network fee.' },
  { id: 'prove', title: 'Prove the payment', say: 'This is the settlement on the mirror node: buyer debited, seller credited, fee payer separate. Anyone can check it.' },
  { id: 'meter', title: 'Metering', say: 'The price comes from the actual request. A longer prompt, a higher 402. Failed calls are never charged.' },
  { id: 'receipts', title: 'Receipts and rating', say: 'Every settlement leaves a receipt on HCS that anyone can recompute. Only payers can rate, and the rating names the payment that proves it.' },
  { id: 'hedera', title: 'What Hedera gave us', say: 'HCS for the registry, the audit trail, receipts and reputation. HTS for the TOLL token. ECDSA keys sign quotes. The mirror node is the free public verifier. Blocky402 settles gasless.' },
  { id: 'close', title: 'Close', say: 'The repo is public, the tests run the real x402 client and server paths offline, and the roadmap is escrow with auditor bonds, scheduled re-audits and World ID.' },
] as const;

const idx = ref(0);
const step = computed(() => STEPS[idx.value]);
const replayMode = ref(false);
const receipts = ref<VerifiedReceipt[]>([]);
const rating = reactive({ score: 0, busy: false, done: '', error: '' });

const buy = useBuyRun();
const meter = useBuyRun();
const audit = useAuditRun();

const isAuditor = (l: Listing) => l.endpoints.length === 1 && l.endpoints[0].id === 'audit';
const subject = computed(() => session.listings.find((l) => !isAuditor(l) && l.endpoints.some((e) => e.id === 'infer')) ?? null);
const auditor = computed(() => session.listings.find(isAuditor) ?? null);
const auditPrice = computed(() => auditor.value?.endpoints[0].accepts[0]);

const SHORT_PROMPT = 'In one sentence, why would an agent pay per request with x402 instead of holding an API key?';
const LONG_PROMPT = `You are advising an autonomous purchasing agent. Compare three ways it could pay another agent for inference: a monthly subscription negotiated by a human, a prepaid API key shared between agents, and per-request settlement over x402 on Hedera with a signed quote and a receipt on HCS. For each, cover who holds the credential, what happens when the counterparty misbehaves, how spend is bounded, and what evidence survives for an audit. Finish with a recommendation in two sentences.`;

async function next() {
  if (idx.value < STEPS.length - 1) idx.value += 1;
  if (step.value.id === 'receipts') void loadReceipts();
}
function back() {
  if (idx.value > 0) idx.value -= 1;
}
function onKey(e: KeyboardEvent) {
  if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
  if (e.key === 'ArrowRight' || e.key === ' ') {
    e.preventDefault();
    void next();
  }
  if (e.key === 'ArrowLeft') back();
}
onMounted(() => {
  window.addEventListener('keydown', onKey);
  void loadSellers();
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

async function loadReceipts() {
  try {
    receipts.value = (await getReceipts()).receipts;
  } catch {
    /* no receipts topic */
  }
}

async function runVerify() {
  if (!subject.value) return;
  if (replayMode.value) await audit.replay(subject.value.uaid);
  else await audit.run(subject.value.uaid, auditor.value?.baseUrl);
}
const runPay = () => buy.run({ task: 'infer', prompt: SHORT_PROMPT, maxTokens: 120, counter: 90, budget: '0.5', maxCall: '0.05' });
const runMeter = () => meter.run({ task: 'infer', prompt: LONG_PROMPT, maxTokens: 400, budget: '0.5', maxCall: '0.05' });

async function sendRating() {
  const r = buy.result.value;
  if (!r?.transaction || rating.score < 1) return;
  rating.busy = true;
  rating.error = '';
  try {
    const out = await postRate({ subject: r.sellerUaid, subjectAccount: r.payTo, transactionId: r.transaction, score: rating.score, comment: 'demo: answer delivered, receipt matched the chain' });
    rating.done = `Recorded, sequence ${out.sequenceNumber}`;
    setTimeout(() => void loadSellers(), 4000);
  } catch (err) {
    rating.error = err instanceof Error ? err.message : String(err);
  } finally {
    rating.busy = false;
  }
}

async function resetAll() {
  idx.value = 0;
  buy.reset();
  meter.reset();
  audit.reset();
  rating.score = 0;
  rating.done = '';
  rating.error = '';
  try {
    await fetch('/api/reset', { method: 'POST' });
  } catch {
    /* ignore */
  }
  setSpend('0', null);
  void loadSellers();
}
const transfers = computed(() => buy.result.value?.onChain?.transfers.filter((t) => t.amount !== 0) ?? []);
const roleOf = (account: string) => (account === buy.result.value?.payTo ? 'seller' : account === session.config?.buyer ? 'buyer' : account === '0.0.802' || account === '0.0.98' ? 'network' : 'facilitator, fee payer');
</script>

<template>
  <div class="demo">
    <aside class="steps">
      <router-link to="/" class="brand"><img src="/logo.png" alt="" width="22" height="22" /> Agora402</router-link>
      <ol>
        <li v-for="(s, i) in STEPS" :key="s.id" :class="{ on: i === idx, done: i < idx }" @click="idx = i">
          <span class="n mono">{{ i }}</span>{{ s.title }}
        </li>
      </ol>
      <div class="session mono" v-if="session.config">
        <div><span class="dim">buyer</span> {{ session.config.buyer }}</div>
        <div><span class="dim">spent</span> {{ fmt(session.spent, 8, 'HBAR', 6) }}</div>
      </div>
      <button class="btn small reset" @click="resetAll">Reset the take</button>
    </aside>

    <section class="stage">
      <header>
        <span class="counter mono">{{ idx }} / {{ STEPS.length - 1 }}</span>
        <h1>{{ step.title }}</h1>
      </header>

      <div class="body">
        <!-- 0 problem -->
        <div v-if="step.id === 'problem'" class="slide">
          <p class="big">Agents that buy from other agents have no way to</p>
          <ul class="bullets">
            <li>find a service without a sales call,</li>
            <li>know whether it is safe to pay,</li>
            <li>agree a price they can reason about,</li>
            <li>or pay at machine speed without an API key.</li>
          </ul>
          <p class="big accent">Agora402: discover, verify, negotiate, pay, prove. On Hedera, per request.</p>
        </div>

        <!-- 1 discover -->
        <div v-else-if="step.id === 'discover'" class="slide">
          <p class="lead" v-if="session.config?.registryTopic">Registry topic <HashLink kind="topic" :id="session.config.registryTopic" />. Each card is one HCS message paid for by the account it names.</p>
          <div class="cards"><ListingCard v-for="l in session.listings" :key="l.uaid" :listing="l" compact /></div>
          <p class="empty" v-if="!session.listings.length">Reading the registry…</p>
        </div>

        <!-- 2 verify -->
        <div v-else-if="step.id === 'verify'" class="slide">
          <div class="controls">
            <div class="who" v-if="subject">
              <TrustSeal :trust="subject.trust" :size="44" />
              <div><b>{{ subject.name }}</b><div class="dim">{{ subject.trust ? (subject.trust.current ? `attested ${subject.trust.verdict} ${subject.trust.trustScore}` : 'attestation stale') : 'never audited' }}</div></div>
            </div>
            <div class="who" v-if="auditor"><span class="pill neutral">auditor</span><div><b>{{ auditor.name }}</b><div class="dim" v-if="auditPrice">{{ fmt(auditPrice.pricing.kind === 'flat' ? auditPrice.pricing.amount : 0, auditPrice.decimals, auditPrice.symbol) }} per audit, paid over x402</div></div></div>
            <label class="chk"><input type="checkbox" v-model="replayMode" /> replay the last audit from the mirror node instead of paying</label>
            <button class="btn primary" @click="runVerify" :disabled="audit.running.value || !subject || (!auditor && !replayMode)">{{ audit.running.value ? (replayMode ? 'Replaying…' : 'Auditing…') : replayMode ? 'Replay the audit' : 'Pay the auditor and run the audit' }}</button>
          </div>
          <div class="rails">
            <div v-if="!replayMode"><h3>Paying the auditor</h3><StageRail :steps="BUY_STEPS" :state="audit.payRail" compact /></div>
            <div><h3>{{ replayMode ? 'The audit as written to HCS' : "The auditor's pipeline, live" }}</h3><StageRail :steps="AUDIT_STEPS" :state="audit.auditRail" /></div>
          </div>
          <p class="error" v-if="audit.error.value">{{ audit.error.value }}</p>
          <div class="card" v-if="audit.attestation.value"><AttestationCard :attestation="audit.attestation.value" :topic-id="audit.topicId.value" /></div>
        </div>

        <!-- 3 pay -->
        <div v-else-if="step.id === 'pay'" class="slide">
          <div class="controls">
            <div class="prefilled"><span class="dim">prompt</span><p>{{ SHORT_PROMPT }}</p></div>
            <div class="facts mono"><span>offer 90% of list</span><span>budget 0.5 HBAR</span><span>max per call 0.05 HBAR</span><span>policy: verified sellers first</span></div>
            <button class="btn primary" @click="runPay" :disabled="buy.running.value">{{ buy.running.value ? 'Running…' : 'Discover, negotiate, pay' }}</button>
          </div>
          <div class="rails one"><StageRail :steps="BUY_STEPS" :state="buy.rail" /></div>
          <p class="error" v-if="buy.error.value">{{ buy.error.value }}</p>
          <div class="card answer" v-if="buy.result.value?.answer">
            <div class="row spread"><b>{{ buy.result.value.seller }}</b><span class="dim">{{ buy.result.value.model }}, paid <span class="mono">{{ fmt(buy.result.value.paid, buy.result.value.decimals, buy.result.value.symbol) }}</span></span></div>
            <p>{{ buy.result.value.answer }}</p>
          </div>
        </div>

        <!-- 4 prove -->
        <div v-else-if="step.id === 'prove'" class="slide">
          <div v-if="buy.result.value?.transaction" class="proof">
            <div class="card">
              <h2>Settlement <span class="right"><HashLink kind="transaction" :id="buy.result.value.transaction" /></span></h2>
              <div class="ledger">
                <div v-for="t in transfers" :key="t.account + t.amount" class="ledger-row">
                  <HashLink kind="account" :id="t.account" /><span class="dim">{{ roleOf(t.account) }}</span><span class="mono amt" :class="t.amount < 0 ? 'neg' : 'pos'">{{ t.amount > 0 ? '+' : '' }}{{ fmt(t.amount) }}</span>
                </div>
              </div>
              <p class="dim foot" v-if="buy.result.value.onChain">{{ buy.result.value.onChain.result }} at consensus {{ buy.result.value.onChain.consensus }}. The network fee was paid by the facilitator, not by the buyer.</p>
            </div>
            <div class="card">
              <h2>The deal</h2>
              <dl>
                <dt>List price</dt><dd class="mono">{{ fmt(buy.result.value.listPrice) }}</dd>
                <dt>Signed quote</dt><dd class="mono">{{ buy.result.value.quote ? fmt(buy.result.value.quote.amount) : 'none' }}<span class="dim" v-if="buy.result.value.quote?.countered"> (counter accepted)</span></dd>
                <dt>402 asked</dt><dd class="mono">{{ fmt(buy.result.value.paid) }}</dd>
                <dt>Seller trust</dt><dd><TrustSeal :trust="buy.result.value.trust" :size="30" :label="false" /> {{ buy.result.value.trust?.current && buy.result.value.trust.verdict === 'safe' ? `verified ${buy.result.value.trust.trustScore}` : 'unverified' }}</dd>
              </dl>
            </div>
          </div>
          <p class="empty" v-else>Run the payment in the previous step first.</p>
        </div>

        <!-- 5 meter -->
        <div v-else-if="step.id === 'meter'" class="slide">
          <div class="controls">
            <div class="prefilled"><span class="dim">a much longer prompt, no counter offer</span><p class="clamp">{{ LONG_PROMPT }}</p></div>
            <button class="btn primary" @click="runMeter" :disabled="meter.running.value">{{ meter.running.value ? 'Running…' : 'Pay for the longer request' }}</button>
          </div>
          <div class="rails one"><StageRail :steps="BUY_STEPS" :state="meter.rail" compact /></div>
          <p class="error" v-if="meter.error.value">{{ meter.error.value }}</p>
          <div class="compare" v-if="meter.result.value?.paid || buy.result.value?.paid">
            <div class="card cmp">
              <h3>Short prompt</h3>
              <b class="mono big-num">{{ buy.result.value?.paid ? fmt(buy.result.value.paid) : '–' }}</b>
              <div class="dim" v-if="buy.result.value?.usage">{{ buy.result.value.usage.prompt_tokens }} in, {{ buy.result.value.usage.completion_tokens }} out</div>
            </div>
            <div class="card cmp">
              <h3>Long prompt</h3>
              <b class="mono big-num">{{ meter.result.value?.paid ? fmt(meter.result.value.paid) : '–' }}</b>
              <div class="dim" v-if="meter.result.value?.usage">{{ meter.result.value.usage.prompt_tokens }} in, {{ meter.result.value.usage.completion_tokens }} out</div>
            </div>
          </div>
        </div>

        <!-- 6 receipts -->
        <div v-else-if="step.id === 'receipts'" class="slide">
          <div class="card">
            <h2>Receipts on HCS <span class="right" v-if="session.config?.receiptsTopic">topic <HashLink kind="topic" :id="session.config.receiptsTopic" /> <button class="toggle" @click="loadReceipts">refresh</button></span></h2>
            <ReceiptsTable :receipts="receipts.slice(0, 6)" :highlight="buy.result.value?.transaction" />
          </div>
          <div class="card rate" v-if="buy.result.value?.transaction">
            <div><b>Rate {{ buy.result.value.seller }}</b><div class="dim">citing settlement <span class="mono">{{ buy.result.value.transaction }}</span></div></div>
            <div class="stars"><button v-for="n in 5" :key="n" :class="{ on: n <= rating.score }" @click="rating.score = n" :disabled="!!rating.done">★</button></div>
            <button class="btn primary small" @click="sendRating" :disabled="rating.busy || rating.score < 1 || !!rating.done">{{ rating.busy ? 'Recording…' : 'Record the rating' }}</button>
            <span class="ok-text" v-if="rating.done">{{ rating.done }}</span>
            <span class="error" v-if="rating.error">{{ rating.error }}</span>
            <div class="after" v-if="subject"><span class="dim">the card now reads</span><ListingCard :listing="subject" compact /></div>
          </div>
        </div>

        <!-- 7 hedera -->
        <div v-else-if="step.id === 'hedera'" class="slide">
          <ul class="bullets four">
            <li><b>HCS</b> holds the registry, every audit stage, every receipt and every rating. Four topics, all public.</li>
            <li><b>HTS</b> gives sellers an optional settlement token with a custom fee in the transfer path.</li>
            <li><b>ECDSA account keys</b> sign quotes, and the mirror node proves the signer owns the paid account.</li>
            <li><b>Blocky402</b> co-signs and pays the network fee, so the buyer's transfer is exactly the price.</li>
          </ul>
        </div>

        <!-- 8 close -->
        <div v-else class="slide">
          <p class="big">github.com/ddpateltp/agora402</p>
          <ul class="bullets">
            <li>Tests run the real x402 client and server paths offline, with a fake facilitator and a stubbed mirror node.</li>
            <li>Next: escrow with auditor bonds, re-audit on every listing change, World ID for one human per agent.</li>
          </ul>
          <p class="big accent">When agents pay agents, the proof should be public.</p>
        </div>
      </div>

      <footer>
        <p class="say"><span class="dim">Say</span> {{ step.say }}</p>
        <div class="nav">
          <button class="btn" @click="back" :disabled="idx === 0">Back</button>
          <button class="btn primary" @click="next" :disabled="idx === STEPS.length - 1">Next</button>
        </div>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.demo { display: grid; grid-template-columns: 220px 1fr; min-height: 100vh; }
.steps { border-right: 1px solid var(--hair); padding: 18px 16px; display: flex; flex-direction: column; gap: 18px; background: rgba(255, 255, 255, 0.5); }
.brand { display: flex; align-items: center; gap: 8px; color: var(--ink); font-weight: 600; }
.steps ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.steps li { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 8px; color: var(--ink-2); cursor: pointer; font-size: 13px; }
.steps li.on { background: var(--accent-soft); color: var(--accent); font-weight: 500; }
.steps li.done { color: var(--ink-3); }
.n { width: 18px; text-align: right; font-size: 11.5px; }
.session { margin-top: auto; font-size: 11.5px; display: flex; flex-direction: column; gap: 4px; }
.reset { align-self: flex-start; }
.stage { display: grid; grid-template-rows: auto 1fr auto; min-height: 100vh; padding: 26px 40px 20px; max-width: 1180px; }
header { display: flex; align-items: baseline; gap: 16px; margin-bottom: 18px; }
header h1 { font-size: 28px; letter-spacing: -0.02em; }
.counter { color: var(--ink-3); }
.body { min-height: 0; }
.slide { display: flex; flex-direction: column; gap: 16px; }
.big { font-size: 26px; line-height: 1.3; letter-spacing: -0.015em; max-width: 30ch; }
.big.accent { color: var(--accent); }
.lead { font-size: 15px; color: var(--ink-2); max-width: 70ch; }
.bullets { margin: 0; padding-left: 22px; font-size: 20px; line-height: 1.5; display: flex; flex-direction: column; gap: 8px; max-width: 46ch; }
.bullets.four { font-size: 17px; max-width: 60ch; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
.controls { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; padding: 14px 16px; background: var(--card); border: 1px solid var(--hair); border-radius: var(--r-card); box-shadow: var(--shadow); }
.who { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.chk { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--ink-2); }
.controls .btn.primary { margin-left: auto; }
.prefilled { flex: 1 1 340px; font-size: 13px; }
.prefilled p { margin-top: 2px; }
.clamp { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; color: var(--ink-2); }
.facts { display: flex; gap: 14px; flex-wrap: wrap; font-size: 11.5px; color: var(--ink-2); }
.rails { display: grid; grid-template-columns: 1fr 1.5fr; gap: 28px; padding: 16px 20px; background: var(--card); border: 1px solid var(--hair); border-radius: var(--r-card); box-shadow: var(--shadow); }
.rails.one { grid-template-columns: 1fr; }
.rails h3 { margin-bottom: 10px; }
.answer p { font-size: 15px; line-height: 1.55; margin-top: 8px; max-width: 80ch; }
.proof { display: grid; grid-template-columns: 1.3fr 1fr; gap: 16px; }
.ledger { display: flex; flex-direction: column; gap: 6px; }
.ledger-row { display: grid; grid-template-columns: 1fr 1fr auto; gap: 12px; align-items: center; padding: 8px 10px; background: var(--inset); border-radius: 8px; font-size: 13px; }
.amt { font-weight: 500; } .neg { color: var(--bad); } .pos { color: var(--ok); }
.foot { margin-top: 10px; font-size: 12.5px; }
dl { display: grid; grid-template-columns: 110px 1fr; gap: 8px 12px; margin: 0; font-size: 13px; }
dt { color: var(--ink-2); } dd { margin: 0; display: flex; align-items: center; gap: 8px; }
.compare { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; max-width: 640px; }
.cmp { display: flex; flex-direction: column; gap: 6px; }
.big-num { font-size: 26px; }
.rate { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; font-size: 13px; }
.stars { display: inline-flex; gap: 2px; }
.stars button { border: 0; background: none; font-size: 24px; color: var(--hair); padding: 0 2px; line-height: 1; }
.stars button.on { color: var(--warn); }
.ok-text { color: var(--ok); }
.after { flex-basis: 100%; display: grid; grid-template-columns: auto minmax(280px, 380px); gap: 12px; align-items: start; margin-top: 6px; }
footer { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding-top: 18px; margin-top: 18px; border-top: 1px solid var(--hair); }
.say { font-size: 14px; color: var(--ink-2); max-width: 90ch; }
.say .dim { margin-right: 8px; }
.nav { display: flex; gap: 8px; flex: none; }
@media (max-width: 900px) { .demo { grid-template-columns: 1fr; } .steps { flex-direction: row; flex-wrap: wrap; border-right: 0; border-bottom: 1px solid var(--hair); } .steps ol { flex-direction: row; flex-wrap: wrap; } .session { display: none; } .rails, .proof, .compare { grid-template-columns: 1fr; } .stage { padding: 18px; min-height: auto; } }
</style>
