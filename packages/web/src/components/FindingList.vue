<script setup lang="ts">
import type { Finding } from '../lib/types';
defineProps<{ findings: Finding[]; emptyText?: string }>();
const cls = (s: Finding['severity']) => (s === 'critical' || s === 'high' ? 'bad' : s === 'medium' ? 'warn' : 'neutral');
</script>

<template>
  <ul class="findings" v-if="findings.length">
    <li v-for="(f, i) in findings" :key="i">
      <span class="pill" :class="cls(f.severity)">{{ f.severity }}</span>
      <div><b>{{ f.title }}</b><p class="muted" v-if="f.detail">{{ f.detail }}</p></div>
    </li>
  </ul>
  <p class="empty" v-else>{{ emptyText ?? 'No findings.' }}</p>
</template>

<style scoped>
.findings { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
li { display: grid; grid-template-columns: 92px 1fr; gap: 10px; align-items: start; font-size: 13px; }
li p { margin-top: 2px; font-size: 12.5px; overflow-wrap: anywhere; }
</style>
