<script setup lang="ts">
/** Sparse accent pixels for a section with position: relative. [top, left, size, colour, cross]. Never on top of text. */
export type Pixel = [top: string, left: string, size: number, colour: 'black' | 'orange' | 'gray', cross?: boolean];
defineProps<{ pixels: Pixel[] }>();
const COLOURS = { black: 'var(--color-black)', orange: 'var(--color-orange)', gray: 'var(--color-light-gray)' } as const;
</script>

<template>
  <span
    v-for="(p, i) in pixels"
    :key="i"
    class="px max-md:hidden"
    :class="{ cross: p[4] }"
    :style="{ top: p[0], left: p[1], width: p[2] + 'px', height: p[2] + 'px', '--c': COLOURS[p[3]] }"
    aria-hidden="true"
  ></span>
</template>

<style scoped>
.px { position: absolute; background: var(--c); pointer-events: none; }
.px.cross { background: none; }
.px.cross::before, .px.cross::after { content: ''; position: absolute; background: var(--c); }
.px.cross::before { left: 0; right: 0; top: 50%; height: 2px; transform: translateY(-50%); }
.px.cross::after { top: 0; bottom: 0; left: 50%; width: 2px; transform: translateX(-50%); }
</style>
