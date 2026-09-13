<script setup lang="ts">
const STEPS: Array<[string, string, string]> = [
  ['01', 'Discover', 'Read the registry and audit topics from the mirror node, drop anything attested dangerous.'],
  ['02', 'Negotiate', 'Ask for a signed quote and counter below list price, down to the seller’s floor.'],
  ['03', 'Request', 'Call the endpoint and receive a 402 for exactly the quoted amount.'],
  ['04', 'Pay', 'Sign one Hedera transfer. Blocky402 verifies, settles and pays the network fee.'],
  ['05', 'Prove', 'Look the settlement up on the mirror node, then find the receipt on HCS.'],
];
</script>

<template>
  <section class="border-t border-black">
    <div class="grid md:grid-cols-[45%_55%]">
      <div class="flex flex-col justify-center gap-8 px-6 py-14 md:px-10 md:py-20">
        <div>
          <p class="font-mono text-xs uppercase tracking-[0.08em] text-black">04. Live flow</p>
          <div class="mt-3 h-px w-8 bg-black"></div>
        </div>

        <h2 class="font-sans text-[40px] leading-[0.95] font-bold tracking-[-0.03em] sm:text-[52px] lg:text-[60px] lg:tracking-[-0.04em]">
          Watch one request
          <br />
          go from listing
          <br />
          to receipt, live.
          <span class="ml-2 inline-block h-3 w-3 bg-orange align-middle lg:h-4 lg:w-4"></span>
        </h2>

        <p class="max-w-lg font-sans text-[17px] leading-relaxed text-black md:text-lg">
          The demo page runs the whole loop against Hedera testnet: pay an auditor, buy one inference, prove the settlement on the mirror node, compare two metered prices, then rate the seller citing the payment.
        </p>

        <div>
          <router-link to="/demo" class="inline-flex items-center gap-2 bg-black px-6 py-4 font-mono text-[13px] font-medium uppercase tracking-[0.04em] text-white transition-colors hover:bg-orange hover:text-white">
            Open the demo <span aria-hidden="true">↗</span>
          </router-link>
        </div>
      </div>

      <div class="relative flex items-center justify-center overflow-hidden border-t border-black px-6 py-10 md:h-full md:border-t-0 md:border-l md:p-0">
        <img src="/landing/live.webp" alt="Listing, audit, badge, marketplace and Hedera, drawn as a staircase of pixel windows" class="h-auto w-full max-w-[560px] object-contain md:h-full md:w-full md:max-w-none md:object-contain md:p-6" width="1774" height="887" />

        <div class="absolute right-8 bottom-16 hidden text-right font-mono text-xs uppercase leading-relaxed tracking-[0.08em] md:block">
          <p>Real</p>
          <p>Sellers.</p>
          <p>Real</p>
          <p>Transactions.</p>
          <div class="mt-2 ml-auto h-px w-8 bg-black"></div>
        </div>
      </div>
    </div>

    <div class="border-t border-black px-6 py-14 md:px-10 md:py-16">
      <div class="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-5 lg:gap-x-8">
        <div v-for="[num, label, desc] in STEPS" :key="num" class="flex flex-col gap-2">
          <span class="font-mono text-sm font-bold text-orange">{{ num }}</span>
          <h3 class="font-sans text-lg font-bold uppercase tracking-tight text-black">{{ label }}</h3>
          <p class="font-sans text-sm leading-relaxed text-gray">{{ desc }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
