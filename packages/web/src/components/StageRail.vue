<script setup lang="ts">
/**
 * The live rail: a vertical sequence of steps, each fed by one or more
 * event names. Steps light up as events stream in; the last message of each
 * step stays visible so the rail reads as a story when it is done.
 */
import { computed } from 'vue';

export interface RailStep {
  id: string;
  title: string;
  hint: string;
  /** event names that mark this step active */
  events: string[];
  /** event names that mark it done */
  done: string[];
}
export interface RailState {
  [id: string]: { status: 'active' | 'done' | 'failed'; message: string; at?: string };
}

const props = defineProps<{ steps: RailStep[]; state: RailState; compact?: boolean }>();
const finished = computed(() => props.steps.every((s) => props.state[s.id]?.status === 'done'));
const failed = computed(() => props.steps.some((s) => props.state[s.id]?.status === 'failed'));
</script>

<template>
  <ol class="rail" :class="{ compact, finished, failed }">
    <li v-for="(s, i) in steps" :key="s.id" :class="state[s.id]?.status ?? 'idle'">
      <div class="dot"><span v-if="state[s.id]?.status === 'done'">✓</span><span v-else-if="state[s.id]?.status === 'failed'">!</span><span v-else>{{ i + 1 }}</span></div>
      <div class="body">
        <div class="title">{{ s.title }}<span class="at mono" v-if="state[s.id]?.at">{{ state[s.id]!.at }}</span></div>
        <div class="msg">{{ state[s.id]?.message ?? s.hint }}</div>
      </div>
    </li>
  </ol>
</template>

<style scoped>
.rail { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
li { display: grid; grid-template-columns: 26px 1fr; gap: 12px; position: relative; padding-bottom: 16px; }
li:last-child { padding-bottom: 0; }
li:not(:last-child)::before { content: ''; position: absolute; left: 12.5px; top: 26px; bottom: 2px; width: 1px; background: var(--hair); }
li.done:not(:last-child)::before { background: var(--accent-line); }
.dot { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-family: var(--mono); font-size: 11.5px; background: var(--inset); color: var(--ink-3); border: 1px solid var(--hair); }
li.active .dot { background: var(--accent-soft); color: var(--accent); border-color: var(--accent-line); animation: pulse 1.4s ease-in-out infinite; }
li.done .dot { background: var(--accent); color: #fff; border-color: var(--accent); }
li.failed .dot { background: var(--bad-soft); color: var(--bad); border-color: var(--bad); }
.body { min-width: 0; padding-top: 3px; }
.title { font-weight: 500; display: flex; justify-content: space-between; gap: 8px; }
.at { font-weight: 400; color: var(--ink-3); font-size: 11.5px; }
.msg { color: var(--ink-2); font-size: 12.5px; margin-top: 2px; overflow-wrap: anywhere; }
li.idle .msg { color: var(--ink-3); }
li.failed .msg { color: var(--bad); }
.compact li { padding-bottom: 10px; }
.compact .msg { display: none; }
.compact li.active .msg, .compact li.failed .msg { display: block; }
@keyframes pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(67, 56, 202, 0.35); } 50% { box-shadow: 0 0 0 6px rgba(67, 56, 202, 0); } }
</style>
