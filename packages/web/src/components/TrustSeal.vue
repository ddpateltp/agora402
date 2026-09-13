<script setup lang="ts">
import { computed } from 'vue';
import type { TrustSummary } from '../lib/types';

/** The seal: a square frame drawn along its edge to the trust score. Grey when never audited, dashed when stale, orange when dangerous. */
const props = withDefaults(defineProps<{ trust: TrustSummary | null; size?: number; label?: boolean }>(), { size: 56, label: true });
const state = computed(() => {
  const t = props.trust;
  if (!t) return { kind: 'none', score: null as number | null, word: 'Unverified', sub: 'no audit yet' };
  if (!t.current) return { kind: 'stale', score: t.trustScore, word: 'Stale', sub: 'listing changed since audit' };
  if (t.verdict === 'dangerous') return { kind: 'bad', score: t.trustScore, word: 'Dangerous', sub: `risk ${t.risk}` };
  return { kind: 'ok', score: t.trustScore, word: 'Verified', sub: `trust ${t.trustScore}` };
});
const side = computed(() => props.size - 3);
const perimeter = computed(() => 4 * side.value);
const dash = computed(() => (state.value.score === null ? 0 : (state.value.score / 100) * perimeter.value));
</script>

<template>
  <div class="seal" :class="state.kind" :title="`${state.word}: ${state.sub}`">
    <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`" aria-hidden="true">
      <rect x="1.5" y="1.5" :width="side" :height="side" class="track" />
      <rect x="1.5" y="1.5" :width="side" :height="side" class="fill" :stroke-dasharray="`${dash} ${perimeter}`" />
    </svg>
    <div class="num" :style="{ fontSize: size / 3.2 + 'px' }">{{ state.score === null ? '–' : state.score }}</div>
    <div v-if="label" class="word">{{ state.word }}</div>
  </div>
</template>

<style scoped>
.seal { position: relative; display: inline-grid; place-items: center; }
svg { display: block; grid-area: 1 / 1; }
.track { fill: var(--color-white); stroke: var(--color-light-gray); stroke-width: 3; }
.fill { fill: none; stroke: var(--color-black); stroke-width: 3; transition: stroke-dasharray 700ms ease-out; }
.num { grid-area: 1 / 1; font-family: var(--font-mono); font-weight: 700; line-height: 1; color: var(--color-black); }
.word { grid-row: 2; margin-top: 6px; font-family: var(--font-mono); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; }
.bad .fill { stroke: var(--color-orange); }
.bad .num, .bad .word { color: var(--color-orange); }
.stale .track { stroke-dasharray: 4 3; }
.stale .fill { stroke: var(--color-gray); }
.stale .word { color: var(--color-gray); }
.none .num, .none .word { color: var(--color-gray); }
</style>
