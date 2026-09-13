import { reactive } from 'vue';
import { getConfig, getSellers } from './api';
import type { Config, Listing } from './types';

/** Shared, reactive view of the buyer dashboard: config, session spend, sellers. */
export const session = reactive({
  config: null as Config | null,
  listings: [] as Listing[],
  loadingSellers: false,
  sellersError: '' as string,
  spent: '0',
  remaining: null as string | null,
});

export async function loadConfig(): Promise<void> {
  session.config = await getConfig();
  session.spent = session.config.spent;
  session.remaining = session.config.remaining;
}

export async function loadSellers(): Promise<void> {
  session.loadingSellers = true;
  session.sellersError = '';
  try {
    session.listings = (await getSellers()).listings;
  } catch (err) {
    session.sellersError = err instanceof Error ? err.message : String(err);
  } finally {
    session.loadingSellers = false;
  }
}

export function setSpend(spent?: unknown, remaining?: unknown): void {
  if (spent !== undefined && spent !== null) session.spent = String(spent);
  if (remaining !== undefined && remaining !== null) session.remaining = String(remaining);
}
