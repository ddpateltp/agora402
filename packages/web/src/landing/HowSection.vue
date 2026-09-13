<script setup lang="ts">
import PixelDecor, { type Pixel } from '../components/PixelDecor.vue';

const STEPS: Array<[string, string, string]> = [
  ['01', 'Discover', 'The buyer reads the registry topic from the mirror node. A listing counts only if the account it names paid for the message.'],
  ['02', 'Verify', 'An auditor agent probes the seller live, for a fee, and writes each stage and its verdict to the audit topic.'],
  ['03', 'Negotiate', 'The buyer states the work and a ceiling. The seller answers with a signed, time-limited quote.'],
  ['04', 'Pay', 'The seller answers 402 for exactly the quoted amount. One Hedera transfer, settled by Blocky402, inside the HTTP request.'],
  ['05', 'Prove', 'A receipt with metering evidence goes to the receipts topic. A rating counts only if it cites a settlement the rater paid.'],
];

const PIXELS: Pixel[] = [
  ['31%', '14%', 10, 'black'],
  ['40%', '10%', 14, 'orange', true],
  ['47%', '4%', 10, 'black'],
  ['70%', '3%', 10, 'orange'],
  ['61%', '94%', 10, 'orange'],
  ['27%', '97%', 10, 'orange'],
  ['49%', '95%', 10, 'black'],
  ['68%', '98%', 14, 'orange', true],
  ['55%', '89%', 10, 'black'],
];
</script>

<template>
  <section class="grid-bg relative overflow-hidden border-t border-black">
    <PixelDecor :pixels="PIXELS" />

    <div class="relative px-6 py-16 md:px-10 md:py-20">
      <div class="hidden text-right font-mono text-xs uppercase leading-relaxed tracking-[0.08em] md:absolute md:top-16 md:right-10 md:block">
        <p>From</p>
        <p>Listings</p>
        <p>To a safer</p>
        <p>Agent economy.</p>
        <div class="mt-2 ml-auto h-px w-8 bg-black"></div>
      </div>

      <div>
        <p class="font-mono text-xs uppercase tracking-[0.08em] text-black">03. How it works</p>
        <div class="mt-3 h-px w-8 bg-black"></div>
      </div>

      <h2 class="mx-auto mt-10 max-w-4xl text-center font-sans text-[32px] leading-[1.05] font-bold tracking-[-0.02em] sm:text-[44px] lg:text-[56px] lg:tracking-[-0.03em]">
        Discover, verify, negotiate,
        <br />
        pay, prove. All on-chain.
        <span class="ml-2 inline-block h-3 w-3 bg-orange align-middle lg:h-4 lg:w-4"></span>
      </h2>

      <p class="mx-auto mt-6 max-w-2xl text-center font-sans text-[17px] leading-relaxed text-black md:text-lg">
        From the first mirror node read to the last receipt, every step is public and replayable. Auditing is itself a paid service in the same marketplace, so trust is bought, probed and written to chain, never asserted.
      </p>

      <img src="/landing/how.webp" alt="Listing, audit, verified badge and marketplace, drawn as four pixel cards" class="mx-auto mt-16 w-full max-w-5xl" width="2167" height="725" />

      <div class="mx-auto mt-8 grid max-w-6xl grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-5 lg:gap-x-8">
        <div v-for="[num, label, desc] in STEPS" :key="num" class="flex flex-col gap-2">
          <span class="flex h-6 w-8 items-center justify-center bg-orange font-mono text-xs font-bold text-white">{{ num }}</span>
          <h3 class="font-sans text-lg font-bold uppercase tracking-tight text-black">{{ label }}</h3>
          <p class="font-sans text-sm leading-relaxed text-gray">{{ desc }}</p>
        </div>
      </div>

      <div class="mt-16 font-mono text-xs uppercase leading-relaxed tracking-[0.08em]">
        <p>Trusted</p>
        <p>Infrastructure</p>
        <p>For agents.</p>
        <div class="mt-2 h-px w-8 bg-black"></div>
      </div>
    </div>
  </section>
</template>
