<script setup lang="ts">
import PixelDecor, { type Pixel } from '../components/PixelDecor.vue';

const FLOW = [
  { num: '01', title: 'Publish', text: 'The seller posts endpoints, pricing and an HCS-14 identifier to the registry topic. The payer proves ownership.', chain: 'HCS message' },
  { num: '02', title: 'Audit', text: 'An auditor, paid over x402, probes the live seller and attests safe or dangerous with a trust score.', chain: 'HCS attestation' },
  { num: '03', title: 'Rank', text: 'The buyer drops anything attested dangerous, applies its trust policy and ranks verified sellers first.', chain: 'Mirror node read' },
  { num: '04', title: 'Negotiate', text: 'A signed, time-limited quote. Counters below list price are accepted down to a floor.', chain: 'Signed quote' },
  { num: '05', title: 'Pay', text: 'A 402 for the quoted amount, one transfer signed by the buyer. Blocky402 settles and pays the fee.', chain: 'Hedera transfer' },
  { num: '06', title: 'Prove', text: 'A receipt with metering evidence. A rating counts only if it cites a settlement the rater paid.', chain: 'HCS receipt' },
];

const PIXELS: Pixel[] = [
  ['14%', '72%', 14, 'orange'],
  ['24%', '83%', 10, 'black'],
  ['33%', '89%', 10, 'orange'],
  ['73%', '13%', 10, 'orange'],
  ['81%', '17%', 10, 'black'],
  ['84%', '22%', 10, 'orange'],
];
</script>

<template>
  <section class="grid-bg relative overflow-hidden border-t border-black">
    <PixelDecor :pixels="PIXELS" />

    <div class="relative px-6 py-16 md:px-10 md:py-20">
      <div class="hidden text-right font-mono text-xs uppercase leading-relaxed tracking-[0.08em] md:absolute md:top-16 md:right-10 md:block">
        <p>Listings</p>
        <p>Audited.</p>
        <p>Agents paid.</p>
        <p>On-chain.</p>
        <div class="mt-2 ml-auto h-px w-8 bg-black"></div>
      </div>

      <div>
        <p class="font-mono text-xs uppercase tracking-[0.08em] text-black">06. Architecture</p>
        <div class="mt-3 h-px w-8 bg-black"></div>
      </div>

      <h2 class="mt-10 max-w-3xl font-sans text-[36px] leading-[1.02] font-bold tracking-[-0.02em] sm:text-[48px] lg:text-[56px] lg:tracking-[-0.03em]">
        One trust layer,
        <br />
        gating one marketplace.
        <span class="ml-2 inline-block h-3 w-3 bg-orange align-middle lg:h-4 lg:w-4"></span>
      </h2>

      <ol class="mt-14 grid grid-cols-1 gap-y-8 sm:grid-cols-2 lg:grid-cols-6 lg:gap-x-0">
        <li v-for="(s, i) in FLOW" :key="s.num" class="relative flex flex-col lg:pr-8">
          <span v-if="i < FLOW.length - 1" class="absolute top-[26px] right-0 hidden h-px w-8 border-t border-dashed border-black lg:block" aria-hidden="true"></span>
          <span v-if="i < FLOW.length - 1" class="absolute top-[18px] right-[8px] hidden h-4 w-4 items-center justify-center border border-black bg-bg font-mono text-[10px] leading-none text-orange lg:flex" aria-hidden="true">›</span>
          <div class="flex h-[52px] w-[52px] items-center justify-center border border-black bg-bg font-mono text-base font-bold text-orange">{{ s.num }}</div>
          <h3 class="mt-5 font-sans text-lg font-bold tracking-tight text-black normal-case">{{ s.title }}</h3>
          <p class="mt-2 max-w-[28ch] font-sans text-sm leading-relaxed text-gray">{{ s.text }}</p>
          <span class="mt-4 inline-flex w-fit items-center gap-2 border border-black bg-bg px-2 py-1 font-mono text-[10px] uppercase tracking-[0.06em]"><span class="h-2 w-2 bg-orange" aria-hidden="true"></span>{{ s.chain }}</span>
        </li>
      </ol>

      <div class="mt-16 flex items-end justify-between">
        <div class="font-mono text-xs uppercase leading-relaxed tracking-[0.08em]">
          <p>From</p>
          <p>Listings</p>
          <p>To a safer</p>
          <p>Agent economy.</p>
          <div class="mt-2 h-px w-8 bg-black"></div>
        </div>

        <div class="text-right font-mono text-xs uppercase leading-relaxed tracking-[0.08em]">
          <p>Agora402</p>
          <p>On Hedera.</p>
          <div class="mt-2 ml-auto h-px w-8 bg-black"></div>
        </div>
      </div>
    </div>
  </section>
</template>
