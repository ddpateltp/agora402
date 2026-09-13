<script setup lang="ts">
import { computed } from 'vue';
import { hashscan, shortId } from '../lib/api';
import { session } from '../lib/session';

const props = withDefaults(defineProps<{ kind: 'account' | 'topic' | 'transaction' | 'token'; id: string; label?: string; short?: boolean }>(), { short: false });
const href = computed(() => hashscan(session.config?.network ?? 'testnet', props.kind, props.id));
const text = computed(() => props.label ?? (props.short ? shortId(props.id) : props.id));
</script>

<template>
  <a class="hash mono" :href="href" target="_blank" rel="noopener" :title="`${kind} ${id} on HashScan`">{{ text }}<span class="arr" aria-hidden="true">↗</span></a>
</template>

<style scoped>
.hash { display: inline-flex; align-items: center; gap: 3px; color: var(--color-black); border-bottom: 1px solid var(--color-light-gray); text-transform: none; letter-spacing: -0.01em; white-space: nowrap; }
.hash:hover { color: var(--color-orange); border-color: var(--color-orange); }
.arr { font-size: 0.85em; color: var(--color-gray); }
.hash:hover .arr { color: var(--color-orange); }
</style>
