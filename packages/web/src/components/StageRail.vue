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
        <div class="title">{{ s.title }}<span class="at" v-if="state[s.id]?.at">{{ state[s.id]!.at }}</span></div>
        <div class="msg">{{ state[s.id]?.message ?? s.hint }}</div>
      </div>
    </li>
  </ol>
</template>

<style scoped>
.rail { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
li { display: grid; grid-template-columns: 24px 1fr; gap: 12px; position: relative; padding-bottom: 16px; }
li:last-child { padding-bottom: 0; }
li:not(:last-child)::before { content: ''; position: absolute; left: 11.5px; top: 24px; bottom: 2px; width: 1px; background: var(--color-light-gray); }
li.done:not(:last-child)::before { background: var(--color-black); }
.dot { width: 24px; height: 24px; display: grid; place-items: center; font-family: var(--font-mono); font-size: 11px; background: var(--color-white); color: var(--color-gray); border: 1px solid var(--color-light-gray); }
li.active .dot { border-color: var(--color-black); color: var(--color-black); animation: blink 1.1s steps(1, end) infinite; }
li.done .dot { background: var(--color-black); color: var(--color-white); border-color: var(--color-black); }
li.failed .dot { background: var(--color-orange); color: var(--color-white); border-color: var(--color-orange); }
.body { min-width: 0; padding-top: 3px; }
.title { display: flex; justify-content: space-between; gap: 8px; font-weight: 600; }
.at { font-family: var(--font-mono); font-size: 11px; font-weight: 400; color: var(--color-gray); }
.msg { margin-top: 2px; font-size: 12.5px; color: var(--color-gray); overflow-wrap: anywhere; }
li.failed .msg { color: var(--color-orange); }
.compact li { padding-bottom: 10px; }
.compact .msg { display: none; }
.compact li.active .msg, .compact li.failed .msg { display: block; }
@keyframes blink { 50% { background: var(--color-orange); border-color: var(--color-orange); color: var(--color-white); } }
</style>
