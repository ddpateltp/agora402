<script setup lang="ts">
import type { ReputationSummary } from '../lib/types';
defineProps<{ reputation: ReputationSummary | null }>();
</script>

<template>
  <span class="rating" v-if="reputation && reputation.count > 0" :title="`${reputation.count} rating(s) backed by a settlement${reputation.rejected ? `, ${reputation.rejected} rejected` : ''}`">
    <span class="stars" aria-hidden="true"><i v-for="n in 5" :key="n" :class="{ on: n <= Math.round(reputation.average ?? 0) }">★</i></span>
    <b>{{ reputation.average }}</b><span class="dim">from {{ reputation.count }} paid buyer{{ reputation.count === 1 ? '' : 's' }}</span>
  </span>
  <span v-else class="rating dim">No ratings yet</span>
</template>

<style scoped>
.rating { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; }
.stars i { font-style: normal; color: var(--hair); font-size: 12px; }
.stars i.on { color: var(--warn); }
</style>
