<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute } from 'vue-router';
import TopBar from './components/TopBar.vue';
import { loadConfig } from './lib/session';

const route = useRoute();
onMounted(() => {
  loadConfig().catch(() => undefined);
});
</script>

<template>
  <div class="shell" :class="{ bare: route.meta.bare }">
    <TopBar v-if="!route.meta.bare" />
    <main class="page" :class="{ wide: route.meta.bare }">
      <router-view />
    </main>
  </div>
</template>

<style>
.shell { min-height: 100vh; display: flex; flex-direction: column; }
.page { width: 100%; max-width: 1360px; margin: 0 auto; padding: 20px 24px 40px; flex: 1; }
.page.wide { max-width: none; padding: 0; }
@media (max-width: 720px) { .page { padding: 14px 14px 32px; } }
</style>
