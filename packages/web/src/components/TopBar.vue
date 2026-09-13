<script setup lang="ts">
import { computed } from 'vue';
import { session } from '../lib/session';
import { fmt } from '../lib/money';
import HashLink from './HashLink.vue';

const cfg = computed(() => session.config);
const links = [
  { to: '/', label: 'Marketplace' },
  { to: '/buy', label: 'Buy' },
  { to: '/audit', label: 'Audit' },
  { to: '/trail', label: 'Trail' },
  { to: '/demo', label: 'Demo' },
];
</script>

<template>
  <header class="top">
    <router-link to="/" class="brand">
      <img src="/logo.png" alt="" width="26" height="26" />
      <span>Agora402</span>
      <span class="net" v-if="cfg">{{ cfg.network }}</span>
    </router-link>
    <nav>
      <router-link v-for="l in links" :key="l.to" :to="l.to">{{ l.label }}</router-link>
    </nav>
    <div class="session" v-if="cfg">
      <span class="muted">buyer</span>
      <HashLink kind="account" :id="cfg.buyer" />
      <span class="sep"></span>
      <span class="muted">spent</span>
      <b class="mono">{{ fmt(session.spent, 8, 'HBAR', 6) }}</b>
      <template v-if="session.remaining !== null">
        <span class="muted">left</span>
        <b class="mono">{{ fmt(session.remaining, 8, 'HBAR', 6) }}</b>
      </template>
    </div>
  </header>
</template>

<style scoped>
.top { display: flex; align-items: center; gap: 28px; padding: 0 24px; height: 54px; border-bottom: 1px solid var(--hair); background: rgba(255, 255, 255, 0.72); backdrop-filter: blur(10px); position: sticky; top: 0; z-index: 10; }
.brand { display: flex; align-items: center; gap: 9px; color: var(--ink); font-weight: 600; font-size: 15px; letter-spacing: -0.01em; }
.brand:hover { text-decoration: none; }
.brand img { border-radius: 6px; }
.net { font-size: 11px; font-weight: 500; color: var(--ink-2); background: var(--inset); border-radius: 999px; padding: 1px 7px; }
nav { display: flex; gap: 4px; }
nav a { color: var(--ink-2); padding: 6px 10px; border-radius: 8px; font-weight: 500; }
nav a:hover { text-decoration: none; background: var(--inset); color: var(--ink); }
nav a.router-link-exact-active { color: var(--accent); background: var(--accent-soft); }
.session { margin-left: auto; display: flex; align-items: center; gap: 8px; font-size: 12.5px; }
.sep { width: 1px; height: 16px; background: var(--hair); }
@media (max-width: 860px) { .session { display: none; } .top { gap: 14px; } }
</style>
