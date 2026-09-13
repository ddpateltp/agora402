<script setup lang="ts">
import { computed } from 'vue';
import type { TrustSummary } from '../lib/types';

/** The seal: a ring filled to the trust score. Grey when never audited, red when dangerous, amber when stale. */
const props = withDefaults(defineProps<{ trust: TrustSummary | null; size?: number; label?: boolean }>(), { size: 56, label: true });
const state = computed(() => {
  const t = props.trust;
  if (!t) return { kind: 'none', score: null as number | null, word: 'Unverified', sub: 'no audit yet' };
  if (!t.current) return { kind: 'stale', score: t.trustScore, word: 'Stale', sub: 'listing changed since audit' };
  if (t.verdict === 'dangerous') return { kind: 'bad', score: t.trustScore, word: 'Dangerous', sub: `risk ${t.risk}` };
  return { kind: 'ok', score: t.trustScore, word: 'Verified', sub: `trust ${t.trustScore}` };
});
const r = computed(() => (props.size - 6) / 2);
const c = computed(() => 2 * Math.PI * r.value);
const dash = computed(() => (state.value.score === null ? 0 : (state.value.score / 100) * c.value));
</script>

<template>
  <div class="seal" :class="state.kind" :title="`${state.word}: ${state.sub}`">
    <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`" aria-hidden="true">
      <circle :cx="size / 2" :cy="size / 2" :r="r" class="track" />
      <circle :cx="size / 2" :cy="size / 2" :r="r" class="fill" :stroke-dasharray="`${dash} ${c}`" :transform="`rotate(-90 ${size / 2} ${size / 2})`" />
    </svg>
    <div class="num" :style="{ fontSize: size / 3.3 + 'px' }">{{ state.score === null ? '–' : state.score }}</div>
    <div v-if="label" class="word">{{ state.word }}</div>
  </div>
</template>

<style scoped>
.seal { position: relative; display: inline-grid; place-items: center; }
svg { display: block; grid-area: 1 / 1; }
.track { fill: none; stroke: var(--hair); stroke-width: 4; }
.fill { fill: none; stroke-width: 4; stroke-linecap: round; transition: stroke-dasharray 700ms ease-out; }
.num { grid-area: 1 / 1; font-family: var(--mono); font-weight: 500; color: var(--ink); line-height: 1; }
.word { font-size: 11.5px; font-weight: 500; margin-top: 4px; }
.ok .fill { stroke: var(--ok); } .ok .word { color: var(--ok); }
.bad .fill { stroke: var(--bad); } .bad .word { color: var(--bad); } .bad .num { color: var(--bad); }
.stale .fill { stroke: var(--warn); } .stale .word { color: var(--warn); }
.none .word { color: var(--ink-3); } .none .num { color: var(--ink-3); }
</style>
