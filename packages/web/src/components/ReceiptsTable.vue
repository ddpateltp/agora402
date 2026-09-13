<script setup lang="ts">
import type { VerifiedReceipt } from '../lib/types';
import { fmt } from '../lib/money';
import { consensusToDate } from '../lib/api';
import HashLink from './HashLink.vue';
defineProps<{ receipts: VerifiedReceipt[]; highlight?: string | null }>();
const usageText = (u: Record<string, unknown>) => {
  if (typeof u.inputTokens === 'number') return `${u.inputTokens} in / ${u.outputTokens} out tokens`;
  if (u.verdict) return `audit ${u.verdict} ${u.trustScore}`;
  if (u.units) return `${u.units} ${u.unit ?? 'unit'}`;
  return '';
};
</script>

<template>
  <div class="scroll-x" v-if="receipts.length">
    <table>
      <thead><tr><th>Consensus</th><th>Settlement</th><th>Payer</th><th>Paid to</th><th>Amount</th><th>Resource</th><th>Metering</th><th>Chain</th></tr></thead>
      <tbody>
        <tr v-for="r in receipts" :key="r.sequenceNumber" :class="{ hi: highlight && r.receipt.transactionId === highlight }">
          <td class="mono dim">{{ consensusToDate(r.consensusTimestamp) }}</td>
          <td><HashLink kind="transaction" :id="r.receipt.transactionId" short /></td>
          <td><HashLink kind="account" :id="r.receipt.payer" /></td>
          <td><HashLink kind="account" :id="r.receipt.payTo" /></td>
          <td class="mono">{{ fmt(r.receipt.amount, 8, r.receipt.asset === '0.0.0' ? 'HBAR' : r.receipt.asset) }}</td>
          <td class="mono">{{ r.receipt.resource }}</td>
          <td class="dim">{{ usageText(r.receipt.usage) }}</td>
          <td><span class="pill" :class="r.matchesChain ? 'ok' : 'bad'" :title="r.problems.join('; ')">{{ r.matchesChain ? 'match' : 'mismatch' }}</span></td>
        </tr>
      </tbody>
    </table>
  </div>
  <p class="empty" v-else>No receipts on this topic yet. Every settled payment adds one.</p>
</template>

<style scoped>
tr.hi td { background: var(--accent-soft); }
</style>
