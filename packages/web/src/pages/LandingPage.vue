<script setup lang="ts">
import HeroSection from '../landing/HeroSection.vue';
import ProblemSection from '../landing/ProblemSection.vue';
import HowSection from '../landing/HowSection.vue';
import LiveFlowSection from '../landing/LiveFlowSection.vue';
import BuildSection from '../landing/BuildSection.vue';
import ArchitectureSection from '../landing/ArchitectureSection.vue';
import WhySection from '../landing/WhySection.vue';
import CTASection from '../landing/CTASection.vue';
</script>

<template>
  <div class="landing">
    <HeroSection />
    <ProblemSection />
    <HowSection />
    <LiveFlowSection />
    <BuildSection />
    <ArchitectureSection />
    <WhySection />
    <CTASection />
  </div>
</template>

<style scoped>
/* The landing reads at 16px like a document; the app pages stay at 14px. */
.landing { font-size: 16px; }
</style>
