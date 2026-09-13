<script setup lang="ts">
import { computed } from 'vue';
import type { Listing } from '../lib/types';
import { priceLabel } from '../lib/money';
import { hostOf } from '../lib/api';
import HashLink from './HashLink.vue';
import TrustSeal from './TrustSeal.vue';
import RatingLine from './RatingLine.vue';

const props = defineProps<{ listing: Listing; compact?: boolean }>();
const emit = defineEmits<{ buy: [listing: Listing]; audit: [listing: Listing] }>();
const isAuditor = computed(() => props.listing.endpoints.some((e) => e.id === 'audit') && props.listing.endpoints.length === 1);
const hbar = (e: Listing['endpoints'][number]) => e.accepts.find((a) => a.asset === '0.0.0') ?? e.accepts[0];
const online = computed(() => Boolean(props.listing.health));
</script>

<template>
  <article class="card listing" :class="{ dangerous: listing.trust?.current && listing.trust.verdict === 'dangerous' }">
    <header>
      <div class="who">
        <h2>{{ listing.name }}</h2>
        <div class="facts">
          <span class="pill" :class="online ? 'ok' : 'neutral'">{{ online ? 'online' : 'unreachable' }}</span>
          <span class="pill neutral" v-if="isAuditor">auditor</span>
          <span class="dim mono">{{ hostOf(listing.baseUrl) }}</span>
        </div>
      </div>
      <TrustSeal :trust="listing.trust" :size="compact ? 48 : 60" />
    </header>

    <ul class="endpoints">
      <li v-for="e in listing.endpoints" :key="e.id">
        <div class="ep"><span class="mono method">{{ e.method }}</span><span class="mono">{{ e.path }}</span></div>
        <div class="price">{{ priceLabel(hbar(e).pricing, hbar(e).decimals, hbar(e).symbol) }}</div>
        <p class="desc" v-if="!compact">{{ e.description }}</p>
      </li>
    </ul>

    <footer>
      <div class="meta">
        <RatingLine :reputation="listing.reputation" />
        <span class="dim">paid to <HashLink kind="account" :id="listing.payTo" /></span>
      </div>
      <div class="actions" v-if="!compact">
        <button class="btn small" @click="emit('audit', listing)" v-if="!isAuditor">Audit</button>
        <button class="btn small primary" @click="emit('buy', listing)" v-if="!isAuditor">Buy from this seller</button>
        <button class="btn small primary" @click="emit('buy', listing)" v-else>Hire for an audit</button>
      </div>
    </footer>
    <p class="warn-line" v-if="listing.trust?.current && listing.trust.verdict === 'dangerous'">An auditor attested this seller dangerous. The buyer agent will not pay it.</p>
    <p class="warn-line stale" v-else-if="listing.trust && !listing.trust.current">The listing changed since its audit. The attestation no longer applies until it is audited again.</p>
  </article>
</template>

<style scoped>
.listing { display: flex; flex-direction: column; gap: 14px; }
.listing.dangerous { border-color: var(--color-orange); }
header { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.who { min-width: 0; }
.who h2 { font-size: 18px; font-weight: 700; letter-spacing: -0.02em; }
.facts { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 12px; flex-wrap: wrap; }
.endpoints { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.endpoints li { padding: 10px 0; border-top: 1px solid var(--color-light-gray); }
.endpoints li:last-child { border-bottom: 1px solid var(--color-light-gray); }
.ep { display: flex; gap: 8px; align-items: center; }
.method { color: var(--color-orange); font-weight: 700; }
.price { margin-top: 3px; font-weight: 600; }
.desc { margin-top: 4px; color: var(--color-gray); font-size: 12.5px; }
footer { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
.meta { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; }
.actions { display: flex; gap: 8px; }
.warn-line { padding: 8px 10px; border: 1px solid var(--color-orange); border-left-width: 4px; font-size: 12.5px; }
.warn-line.stale { border-color: var(--color-black); border-style: dashed; border-left-style: solid; }
</style>
