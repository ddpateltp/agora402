<script setup lang="ts">
const STATS: Array<[string, string]> = [
  ['4', 'Public HCS topics'],
  ['1', 'Transfer per request'],
  ['0', 'API keys in the path'],
];
</script>

<template>
  <section class="grid md:grid-cols-[45%_55%]">
    <div class="flex flex-col justify-center gap-8 px-6 pt-14 pb-16 md:px-10 md:pt-20 md:pb-24">
      <p class="font-mono text-xs uppercase tracking-[0.08em] text-black">Discover. Verify. Negotiate. Pay. Prove.</p>

      <h1 class="font-sans text-[44px] leading-[0.95] font-bold tracking-[-0.03em] sm:text-[56px] lg:text-[72px] lg:tracking-[-0.055em]">
        A marketplace
        <br />
        where agents
        <br />
        pay agents
        <span class="ml-2 inline-block h-3 w-3 bg-orange align-middle lg:h-4 lg:w-4"></span>
      </h1>

      <p class="max-w-md font-sans text-[17px] leading-relaxed text-black md:text-lg">
        An AI agent that needs inference, data or an audit finds a seller in an on-chain registry, checks who audited it, negotiates a price, pays per request over x402 and leaves a proof of every step on the Hedera Consensus Service.
      </p>

      <div class="flex flex-wrap items-center gap-4">
        <router-link to="/market" class="flex items-center gap-2 bg-black px-6 py-4 font-mono text-[13px] font-medium uppercase tracking-[0.04em] text-white transition-colors hover:bg-orange hover:text-white">
          Explore sellers <span aria-hidden="true">↗</span>
        </router-link>
        <router-link to="/demo" class="border border-black px-6 py-4 font-mono text-[13px] font-medium uppercase tracking-[0.04em] text-black transition-colors hover:bg-black hover:text-white">
          Run the demo
        </router-link>
      </div>

      <div class="flex items-center gap-6 pt-4">
        <div v-for="([value, label], i) in STATS" :key="label" class="flex flex-col gap-1" :class="i !== 0 ? 'border-l border-light-gray pl-6' : ''">
          <span class="font-sans text-[22px] font-bold sm:text-2xl">{{ value }}</span>
          <span class="font-mono text-xs uppercase tracking-[0.06em] text-gray">{{ label }}</span>
        </div>
      </div>
    </div>

    <div class="flex items-center justify-center overflow-hidden border-t border-black px-6 py-10 md:h-full md:border-t-0 md:border-l md:p-0">
      <img src="/landing/hero.webp" alt="A pixel robot on a grid, the Agora402 buyer agent" class="h-auto w-full max-w-[560px] object-contain md:h-full md:w-full md:max-w-none md:object-cover" width="1448" height="1086" />
    </div>
  </section>
</template>
