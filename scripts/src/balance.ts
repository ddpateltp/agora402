/** Print HBAR and TOLL balances of the seller and buyer accounts via the mirror node. */
import { formatAmount, mirrorNodeUrl } from '@agora402/shared';
import { need, network } from './env.js';

const net = network();
const mirror = mirrorNodeUrl(net);
const toll = process.env.TOLL_TOKEN_ID;

for (const [label, id] of [
  ['seller', need('SELLER_ACCOUNT_ID')],
  ['buyer', need('BUYER_ACCOUNT_ID')],
] as const) {
  const res = await fetch(`${mirror}/api/v1/accounts/${id}`);
  if (!res.ok) {
    console.log(`${label} ${id}: mirror node ${res.status}`);
    continue;
  }
  const body = (await res.json()) as { balance: { balance: number; tokens: Array<{ token_id: string; balance: number }> }; key?: { _type: string } };
  const tollBal = toll ? body.balance.tokens.find((t) => t.token_id === toll)?.balance : undefined;
  console.log(`${label} ${id}  ${formatAmount(BigInt(body.balance.balance), 8, 'HBAR')}${tollBal !== undefined ? `  ${formatAmount(BigInt(tollBal), 6, 'TOLL')}` : ''}  key ${body.key?._type ?? 'unknown'}`);
}
