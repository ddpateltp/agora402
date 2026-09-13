<script setup lang="ts">
import PixelIcon from '../components/PixelIcon.vue';

const HUB = ['....BBB....', '....B.B....', '....BBB....', '.....B.....', 'BBB..B..BBB', 'B.BBBOBBB.B', 'BBB..B..BBB', '.....B.....', '....BBB....', '....B.B....', '....BBB....'];
const STACK = ['..BBBBBBB..', '.B.......B.', 'B....O....B', 'B.........B', '.BBBBBBBBB.', 'B.........B', 'B.........B', '.BBBBBBBBB.', 'B.........B', 'B.........B', '.BBBBBBBBB.'];
const BOLT = ['.....OOOO..', '....OOOO...', '...OOOO....', '..OOOOOOO..', '...OOOOOO..', '.....OOO...', '....OOO....', '...OOO.....', '..OOO......', '.OO........', '...........'];
const LENS = ['..BBBBB....', '.B.....B...', 'B..OOO..B..', 'B..OOO..B..', 'B..OOO..B..', '.B.....B...', '..BBBBB.B..', '.......BBB.', '........BBB', '.........BB', '...........'];

const CARDS = [
  { num: '01', title: 'HCS', sub: 'Consensus Service', icon: HUB, text: 'Registry, audit trail, receipts and reputation: four public topics anyone can replay from the mirror node without a key.' },
  { num: '02', title: 'HTS', sub: 'Token Service', icon: STACK, text: 'An optional settlement token, TOLL, with a custom fee in the transfer path. Sellers can price in it instead of HBAR.' },
  { num: '03', title: 'x402 + Blocky402', sub: 'Payments', icon: BOLT, text: 'Agents pay each other in HBAR inside the HTTP request. The facilitator co-signs, settles and pays the network fee.' },
  { num: '04', title: 'Mirror Node', sub: 'The public verifier', icon: LENS, text: 'Signer keys, settlements, receipts and ratings are all checked against it. No trust in Agora402 required.' },
];
</script>

<template>
  <section class="border-t border-black">
    <div class="grid md:grid-cols-[55%_45%]">
      <div class="grid-bg relative order-2 border-t border-black px-6 py-12 md:order-1 md:border-t-0 md:border-r md:px-12 md:py-16">
        <span class="absolute top-[8%] left-[6%] max-md:hidden h-[10px] w-[10px] bg-black" aria-hidden="true"></span>
        <span class="absolute top-[14%] right-[8%] max-md:hidden h-[10px] w-[10px] bg-orange" aria-hidden="true"></span>
        <span class="absolute bottom-[10%] left-[9%] max-md:hidden h-[10px] w-[10px] bg-orange" aria-hidden="true"></span>
        <span class="absolute right-[5%] bottom-[16%] max-md:hidden h-[10px] w-[10px] bg-black" aria-hidden="true"></span>

        <div class="relative mx-auto grid max-w-3xl grid-cols-1 gap-5 sm:grid-cols-2">
          <article v-for="c in CARDS" :key="c.num" class="relative flex flex-col gap-4 border border-black bg-bg p-6 pt-12">
            <span class="absolute top-0 left-0 flex h-9 w-12 items-center justify-center bg-black font-mono text-xs text-white">{{ c.num }}</span>
            <PixelIcon :rows="c.icon" :cell="5" />
            <div>
              <h3 class="font-sans text-xl font-bold tracking-tight text-black normal-case">{{ c.title }}</h3>
              <p class="mt-0.5 font-mono text-xs uppercase tracking-[0.06em] text-gray">{{ c.sub }}</p>
            </div>
            <p class="font-sans text-sm leading-relaxed text-gray">{{ c.text }}</p>
          </article>
        </div>
      </div>

      <div class="order-1 flex flex-col justify-center gap-8 px-6 py-14 md:order-2 md:px-10 md:py-20">
        <div>
          <p class="font-mono text-xs uppercase tracking-[0.08em] text-black">05. Built on Hedera</p>
          <div class="mt-3 h-px w-8 bg-black"></div>
        </div>

        <h2 class="font-sans text-[40px] leading-[0.95] font-bold tracking-[-0.03em] sm:text-[52px] lg:text-[60px] lg:tracking-[-0.04em]">
          Real
          <br />
          infrastructure,
          <br />
          not a simulation.
          <span class="ml-2 inline-block h-3 w-3 bg-orange align-middle lg:h-4 lg:w-4"></span>
        </h2>

        <p class="max-w-lg font-sans text-[17px] leading-relaxed text-black md:text-lg">
          Every listing, audit stage, quote, payment and receipt runs on Hedera testnet, settled through the Blocky402 facilitator. Every id on this site opens on HashScan.
        </p>

        <div class="mt-8 text-right font-mono text-xs uppercase leading-relaxed tracking-[0.08em] md:mt-16">
          <div class="mr-0 mb-2 ml-auto h-px w-8 bg-black"></div>
          <p>Trust</p>
          <p>Scales</p>
          <p>Agents.</p>
        </div>
      </div>
    </div>
  </section>
</template>
