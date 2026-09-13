<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import TopBar from './components/TopBar.vue';
import SiteFooter from './components/SiteFooter.vue';
import { loadConfig } from './lib/session';

const route = useRoute();
const bare = computed(() => Boolean(route.meta.bare));
const landing = computed(() => Boolean(route.meta.landing));
onMounted(() => {
  loadConfig().catch(() => undefined);
});
</script>

<template>
  <div class="frame" :class="{ bare }">
    <TopBar v-if="!bare" />
    <main class="page" :class="{ app: !bare && !landing }">
      <router-view />
    </main>
    <SiteFooter v-if="!bare" :slim="!landing" />
  </div>
</template>

<style>
.frame { position: relative; display: flex; flex-direction: column; min-height: 100vh; max-width: 1680px; margin: 0 auto; border: 1px solid var(--color-black); border-top: 0; background: var(--color-bg); }
.frame.bare { border: 0; max-width: none; }
.page { flex: 1; width: 100%; min-width: 0; }
.page.app { padding: 0 40px 64px; }
@media (max-width: 720px) { .page.app { padding: 0 18px 48px; } }
</style>
