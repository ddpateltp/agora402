/**
 * Create the auditor account from the seller (portal) account, so the demo
 * has a second agent that is paid to audit the first. Writes
 * AUDITOR_ACCOUNT_ID and AUDITOR_PRIVATE_KEY to .env. Re-running creates another account.
 *
 *   npm run setup:auditor            # 50 HBAR starting balance
 *   npm run setup:auditor -- 100
 */
import { AccountCreateTransaction, Hbar, PrivateKey } from '@hiero-ledger/sdk';
import { createOperatorClient } from '@agora402/registry';
import { hashscanAccount } from '@agora402/shared';
import { need, network, saveEnv } from './env.js';

const net = network();
const initial = Number(process.argv[2] ?? '50');
if (!Number.isFinite(initial) || initial <= 0) throw new Error('starting balance must be a positive number of HBAR');

const client = createOperatorClient({ network: net, accountId: need('SELLER_ACCOUNT_ID'), privateKey: need('SELLER_PRIVATE_KEY') });
try {
  const key = PrivateKey.generateECDSA();
  const tx = await new AccountCreateTransaction()
    .setECDSAKeyWithAlias(key)
    .setInitialBalance(new Hbar(initial))
    .setMaxAutomaticTokenAssociations(10)
    .setAccountMemo('agora402 auditor agent')
    .execute(client);
  const receipt = await tx.getReceipt(client);
  const accountId = receipt.accountId!.toString();
  console.log(`auditor account ${accountId} created with ${initial} HBAR  ${hashscanAccount(net, accountId)}`);
  const raw = key.toStringRaw();
  saveEnv({ AUDITOR_ACCOUNT_ID: accountId, AUDITOR_PRIVATE_KEY: raw.startsWith('0x') ? raw : `0x${raw}` });
  console.log('saved AUDITOR_ACCOUNT_ID and AUDITOR_PRIVATE_KEY to .env (the key is only stored there, never printed)');
  console.log('next: `npm run auditor` in one terminal, then `npm run setup:register -- --role auditor`');
} finally {
  client.close();
}
