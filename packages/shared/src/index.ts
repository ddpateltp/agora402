export * from './types.js';
export * from './identity.js';
export * from './pricing.js';
export * from './quote.js';
export * from './trust.js';

/** HashScan explorer links. */
export function hashscanTx(network: 'testnet' | 'mainnet', transactionId: string): string {
  // HashScan accepts the SDK format 0.0.x@sec.nanos as well as 0.0.x-sec-nanos
  return `https://hashscan.io/${network}/transaction/${encodeURIComponent(transactionId)}`;
}
export function hashscanTopic(network: 'testnet' | 'mainnet', topicId: string): string {
  return `https://hashscan.io/${network}/topic/${topicId}`;
}
export function hashscanAccount(network: 'testnet' | 'mainnet', accountId: string): string {
  return `https://hashscan.io/${network}/account/${accountId}`;
}
export function mirrorNodeUrl(network: 'testnet' | 'mainnet'): string {
  return network === 'mainnet' ? 'https://mainnet-public.mirrornode.hedera.com' : 'https://testnet.mirrornode.hedera.com';
}
export function shortNetwork(caip2: string): 'testnet' | 'mainnet' {
  return caip2.endsWith('mainnet') ? 'mainnet' : 'testnet';
}
export * from './llm.js';
