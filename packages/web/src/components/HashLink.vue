<script setup lang="ts">
import { computed } from 'vue';
import { hashscan, shortId } from '../lib/api';
import { session } from '../lib/session';

const props = withDefaults(defineProps<{ kind: 'account' | 'topic' | 'transaction' | 'token'; id: string; label?: string; short?: boolean }>(), { short: false });
const href = computed(() => hashscan(session.config?.network ?? 'testnet', props.kind, props.id));
const text = computed(() => props.label ?? (props.short ? shortId(props.id) : props.id));
</script>

<template>
  <a class="hash mono" :href="href" target="_blank" rel="noopener" :title="`${kind} ${id} on HashScan`">
    {{ text }}<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3 1h6v6M9 1L1 9" fill="none" stroke="currentColor" stroke-width="1.3" /></svg>
  </a>
</template>

<style scoped>
.hash { display: inline-flex; align-items: center; gap: 4px; color: var(--ink); border-bottom: 1px solid var(--hair); }
.hash:hover { text-decoration: none; color: var(--accent); border-color: var(--accent-line); }
svg { color: var(--ink-3); flex: none; }
</style>
