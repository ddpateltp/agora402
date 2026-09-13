<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { session } from '../lib/session';
import { fmt } from '../lib/money';
import HashLink from './HashLink.vue';

const route = useRoute();
const cfg = computed(() => session.config);
const landing = computed(() => Boolean(route.meta.landing));
const links = [
  { to: '/market', label: 'Market' },
  { to: '/buy', label: 'Buy' },
  { to: '/audit', label: 'Audit' },
  { to: '/trail', label: 'Trail' },
  { to: '/demo', label: 'Demo' },
];
</script>

<template>
  <header class="top">
    <router-link to="/" class="brand">
      <span class="mark" aria-hidden="true"></span>
      <span>Agora402</span>
      <span class="net" v-if="cfg">{{ cfg.network }}</span>
    </router-link>

    <nav>
      <router-link v-for="l in links" :key="l.to" :to="l.to">{{ l.label }}</router-link>
      <a href="https://github.com/ddpateltp/agora402" target="_blank" rel="noopener">GitHub</a>
    </nav>

    <router-link v-if="landing" to="/market" class="btn primary cta">Open the marketplace <span aria-hidden="true">↗</span></router-link>
    <div class="session" v-else-if="cfg">
      <span class="dim">buyer</span>
      <HashLink kind="account" :id="cfg.buyer" />
      <span class="sep"></span>
      <span class="dim">spent</span>
      <b>{{ fmt(session.spent, 8, 'HBAR', 6) }}</b>
      <template v-if="session.remaining !== null">
        <span class="dim">left</span>
        <b>{{ fmt(session.remaining, 8, 'HBAR', 6) }}</b>
      </template>
    </div>
  </header>
</template>

<style scoped>
.top { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 14px 32px; border-bottom: 1px solid var(--color-black); background: var(--color-bg); }
.brand { display: inline-flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 700; letter-spacing: -0.02em; color: var(--color-black); }
.brand:hover { color: var(--color-black); }
.mark { position: relative; width: 14px; height: 14px; background: var(--color-black); }
.mark::after { content: ''; position: absolute; top: 2px; right: 2px; width: 4px; height: 4px; background: var(--color-orange); }
.net { font-family: var(--font-mono); font-size: 10px; font-weight: 400; letter-spacing: 0.08em; text-transform: uppercase; border: 1px solid var(--color-black); padding: 1px 6px; }
nav { display: flex; gap: 36px; font-family: var(--font-mono); font-size: 13px; text-transform: uppercase; letter-spacing: 0.1em; }
nav a { padding: 4px 0; border-bottom: 1px solid transparent; color: var(--color-black); transition: color 120ms; }
nav a:hover { color: var(--color-orange); }
nav a.router-link-active { border-bottom-color: var(--color-black); }
.cta { padding: 9px 18px; }
.session { display: flex; align-items: center; gap: 8px; font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
.session b { font-weight: 700; text-transform: none; }
.sep { width: 1px; height: 14px; background: var(--color-light-gray); }
@media (max-width: 1100px) { nav { gap: 22px; } .session { display: none; } }
@media (max-width: 720px) {
  .top { flex-wrap: wrap; gap: 12px 20px; padding: 12px 18px; }
  nav { order: 3; width: 100%; gap: 18px; font-size: 12px; overflow-x: auto; }
  .cta { padding: 8px 12px; }
}
</style>
