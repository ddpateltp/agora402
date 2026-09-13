<script setup lang="ts">
/** The section label used everywhere: mono, uppercase, with a short black rule under it. */
withDefaults(defineProps<{ align?: 'left' | 'center' | 'right' }>(), { align: 'left' });
</script>

<template>
  <div class="block" :class="align">
    <p class="eyebrow"><slot /></p>
    <div class="rule"></div>
  </div>
</template>

<style scoped>
.center { text-align: center; }
.center .rule { margin-left: auto; margin-right: auto; }
.right { text-align: right; }
.right .rule { margin-left: auto; }
</style>
