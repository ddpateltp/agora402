/**
 * Create the buyer account from the seller (portal) account so only one
 * portal account is needed. Generates a fresh ECDSA key, creates the account
 * with an initial HBAR balance, and writes BUYER_ACCOUNT_ID and
 * BUYER_PRIVATE_KEY to .env. Re-running creates another account.
 *
 *   npm run setup:buyer            # 100 HBAR starting balance
 *   npm run setup:buyer -- 250     # custom starting balance in HBAR
 */
import { AccountCreateTransaction, Hbar, PrivateKey } from '@hiero-ledger/sdk';
import { createOperatorClient } from '@agora402/registry';
import { hashscanAccount } from '@agora402/shared';
import { need, network, saveEnv } from './env.js';

const net = network();
const initial = Number(process.argv[2] ?? '100');
if (!Number.isFinite(initial) || initial <= 0) throw new Error('starting balance must be a positive number of HBAR');

const client = createOperatorClient({ network: net, accountId: need('SELLER_ACCOUNT_ID'), privateKey: need('SELLER_PRIVATE_KEY') });
try {
  const key = PrivateKey.generateECDSA();
  const tx = await new AccountCreateTransaction()
    .setECDSAKeyWithAlias(key)
    .setInitialBalance(new Hbar(initial))
    .setMaxAutomaticTokenAssociations(10)
    .setAccountMemo('agora402 buyer agent')
    .execute(client);
  const receipt = await tx.getReceipt(client);
  const accountId = receipt.accountId!.toString();
  console.log(`buyer account ${accountId} created with ${initial} HBAR  ${hashscanAccount(net, accountId)}`);
  saveEnv({ BUYER_ACCOUNT_ID: accountId, BUYER_PRIVATE_KEY: key.toStringRaw().startsWith('0x') ? key.toStringRaw() : `0x${key.toStringRaw()}` });
  console.log('saved BUYER_ACCOUNT_ID and BUYER_PRIVATE_KEY to .env (the key is only stored there, never printed)');
} finally {
  client.close();
}
