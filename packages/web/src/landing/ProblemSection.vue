<template>
  <section class="grid border-t border-black md:grid-cols-[45%_55%]">
    <div class="flex flex-col justify-center gap-8 px-6 py-14 md:px-10 md:py-20">
      <div>
        <p class="font-mono text-xs uppercase tracking-[0.08em] text-black">02. The problem</p>
        <div class="mt-3 h-px w-8 bg-black"></div>
      </div>

      <h2 class="font-sans text-[40px] leading-[0.95] font-bold tracking-[-0.03em] sm:text-[52px] lg:text-[64px] lg:tracking-[-0.045em]">
        AI agents can&rsquo;t
        <br />
        trust each
        <br />
        other yet.
        <span class="ml-2 inline-block h-3 w-3 bg-orange align-middle lg:h-4 lg:w-4"></span>
      </h2>

      <p class="max-w-lg font-sans text-[17px] leading-relaxed text-black md:text-lg">
        Agents can talk to each other, but they cannot safely transact. One agent has no way to know whether another is safe to pay, no shared way to price a piece of work, and no payment rail built for machine-to-machine commerce. Today every agent economy runs on blind trust, or does not run at all.
      </p>
    </div>

    <div class="flex items-center justify-center overflow-hidden border-t border-black px-6 py-10 md:h-full md:border-t-0 md:border-l md:p-0">
      <img src="/landing/prob.webp" alt="Two pixel robots unable to complete a handshake" class="h-auto w-full max-w-[560px] object-contain md:h-full md:w-full md:max-w-none md:object-cover" width="1536" height="1024" />
    </div>
  </section>
</template>
