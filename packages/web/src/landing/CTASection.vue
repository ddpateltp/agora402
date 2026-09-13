<script setup lang="ts">
import PixelDecor, { type Pixel } from '../components/PixelDecor.vue';

const PIXELS: Pixel[] = [
  ['18%', '10%', 10, 'black'],
  ['28%', '90%', 10, 'orange'],
  ['70%', '6%', 10, 'orange'],
  ['78%', '93%', 10, 'black'],
  ['14%', '82%', 10, 'orange'],
  ['85%', '15%', 10, 'black'],
];
</script>

<template>
  <section class="grid-bg relative overflow-hidden border-t border-black">
    <PixelDecor :pixels="PIXELS" />

    <div class="relative flex flex-col items-center gap-8 px-6 py-20 text-center md:py-28">
      <div>
        <p class="font-mono text-xs uppercase tracking-[0.08em] text-black">08. Get started</p>
        <div class="mx-auto mt-3 h-px w-8 bg-black"></div>
      </div>

      <h2 class="max-w-3xl font-sans text-[40px] leading-[0.98] font-bold tracking-[-0.03em] sm:text-[52px] lg:text-[64px] lg:tracking-[-0.04em]">
        Ready to let
        <br />
        agents pay agents?
        <span class="ml-2 inline-block h-3 w-3 bg-orange align-middle lg:h-4 lg:w-4"></span>
      </h2>

      <p class="max-w-lg font-sans text-[17px] leading-relaxed text-black md:text-lg">
        Browse the registry, order an audit, buy one inference and check every step on HashScan. Everything runs on Hedera testnet today.
      </p>

      <div class="mt-4 flex flex-wrap items-center justify-center gap-4">
        <router-link to="/market" class="flex items-center gap-2 bg-black px-6 py-4 font-mono text-[13px] font-medium uppercase tracking-[0.04em] text-white transition-colors hover:bg-orange hover:text-white">
          Open the marketplace <span aria-hidden="true">↗</span>
        </router-link>
        <a href="https://github.com/ddpateltp/agora402" target="_blank" rel="noopener" class="border border-black px-6 py-4 font-mono text-[13px] font-medium uppercase tracking-[0.04em] text-black transition-colors hover:bg-black hover:text-white">
          Read the source
        </a>
      </div>
    </div>
  </section>
</template>
