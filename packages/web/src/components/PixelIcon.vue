<script setup lang="ts">
/** A pixel glyph drawn from a character matrix: '.' transparent, 'B' black, 'O' orange, 'W' white. No image files. */
withDefaults(defineProps<{ rows: string[]; cell?: number }>(), { cell: 6 });
const COLOURS: Record<string, string> = { '.': 'transparent', B: 'var(--color-black)', O: 'var(--color-orange)', W: 'var(--color-white)' };
</script>

<template>
  <div class="glyph" :style="{ gridTemplateColumns: `repeat(${rows[0]?.length ?? 0}, ${cell}px)` }" aria-hidden="true">
    <template v-for="(row, r) in rows" :key="r">
      <span v-for="(ch, c) in row.split('')" :key="`${r}-${c}`" :style="{ width: cell + 'px', height: cell + 'px', background: COLOURS[ch] ?? 'transparent' }"></span>
    </template>
  </div>
</template>

<style scoped>
.glyph { display: grid; }
.glyph span { display: block; }
</style>
