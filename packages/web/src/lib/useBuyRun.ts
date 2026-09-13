import { reactive, ref } from 'vue';
import type { RailState } from '../components/StageRail.vue';
import { stream } from './api';
import { applyBuyStage, resetRail } from './rails';
import { setSpend } from './session';
import type { RunResult, StageEvent } from './types';

export interface BuyRequest {
  task: 'infer' | 'rate';
  prompt?: string;
  maxTokens?: number;
  counter?: number;
  budget?: string;
  maxCall?: string;
  minTrust?: number | '';
  seller?: string;
}

/** One paid request through the dashboard, with the live rail state the pages and the demo both render. */
export function useBuyRun() {
  const running = ref(false);
  const rail = reactive<RailState>({});
  const log = ref<StageEvent[]>([]);
  const result = ref<RunResult | null>(null);
  const error = ref('');

  function reset() {
    result.value = null;
    error.value = '';
    log.value = [];
    resetRail(rail);
  }

  async function run(req: BuyRequest): Promise<RunResult | null> {
    running.value = true;
    reset();
    try {
      await stream('/api/run', { ...req, minTrust: req.minTrust === '' ? undefined : req.minTrust }, (line) => {
        if (line.type === 'stage') {
          const e = line as unknown as StageEvent;
          log.value.push(e);
          applyBuyStage(rail, e);
        } else if (line.type === 'result') {
          result.value = line as unknown as RunResult;
          setSpend(result.value.spent, result.value.remaining);
        } else if (line.type === 'error') {
          error.value = String(line.message);
          setSpend(line.spent, line.remaining);
        }
      });
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      running.value = false;
    }
    return result.value;
  }

  return { running, rail, log, result, error, run, reset };
}
