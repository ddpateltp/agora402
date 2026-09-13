<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import ListingCard from '../components/ListingCard.vue';
import HashLink from '../components/HashLink.vue';
import { session, loadSellers } from '../lib/session';
import type { Listing } from '../lib/types';

const router = useRouter();
const verifiedOnly = ref(false);
const minTrust = ref(0);
const filtered = computed(() =>
  session.listings.filter((l) => {
    const score = l.trust && l.trust.current && l.trust.verdict === 'safe' ? l.trust.trustScore : null;
    if (verifiedOnly.value && score === null) return false;
    if (minTrust.value > 0 && (score === null || score < minTrust.value)) return false;
    return true;
  }),
);
const counts = computed(() => ({
  verified: session.listings.filter((l) => l.trust?.current && l.trust.verdict === 'safe').length,
  dangerous: session.listings.filter((l) => l.trust?.current && l.trust.verdict === 'dangerous').length,
  unverified: session.listings.filter((l) => !l.trust || !l.trust.current).length,
}));
onMounted(() => {
  if (session.listings.length === 0) void loadSellers();
});
const buy = (l: Listing) => router.push({ path: l.endpoints.some((e) => e.id === 'audit') && l.endpoints.length === 1 ? '/audit' : '/buy', query: { seller: l.uaid } });
const audit = (l: Listing) => router.push({ path: '/audit', query: { subject: l.uaid } });
</script>

<template>
  <section class="head">
    <div>
      <h1>Sellers on the registry</h1>
      <p class="muted">
        Every listing is an HCS message paid for by the account it names.
        <template v-if="session.config?.registryTopic">Topic <HashLink kind="topic" :id="session.config.registryTopic" />.</template>
        <template v-if="session.config?.auditTopic"> Attestations come from topic <HashLink kind="topic" :id="session.config.auditTopic" />.</template>
      </p>
    </div>
    <div class="filters">
      <span class="pill ok">{{ counts.verified }} verified</span>
      <span class="pill neutral">{{ counts.unverified }} unverified</span>
      <span class="pill bad" v-if="counts.dangerous">{{ counts.dangerous }} dangerous</span>
      <label class="chk"><input type="checkbox" v-model="verifiedOnly" /> verified only</label>
      <label class="chk">min trust <input type="number" min="0" max="100" v-model.number="minTrust" class="num" /></label>
      <button class="btn small" @click="loadSellers()" :disabled="session.loadingSellers">{{ session.loadingSellers ? 'Reading…' : 'Refresh' }}</button>
    </div>
  </section>

  <p class="error" v-if="session.sellersError">{{ session.sellersError }}</p>
  <p class="empty" v-else-if="!session.loadingSellers && session.listings.length === 0">No sellers found. Start a seller and run <span class="mono">npm run setup:register</span>, or set SELLER_PUBLIC_URL.</p>
  <p class="empty" v-else-if="filtered.length === 0 && session.listings.length">No seller passes these filters.</p>

  <section class="cards">
    <ListingCard v-for="l in filtered" :key="l.uaid" :listing="l" @buy="buy" @audit="audit" />
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
.head p { margin-top: 4px; max-width: 72ch; }
.filters { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12.5px; }
.chk { display: inline-flex; align-items: center; gap: 6px; color: var(--ink-2); }
.num { width: 64px; padding: 4px 8px; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; }
</style>
