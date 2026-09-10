/**
 * Create the TOLL settlement token (HTS fungible, 6 decimals), mint the supply
 * to the seller, associate the buyer and send it a starting balance so the
 * buyer agent can pay in TOLL as well as HBAR. Records TOLL_TOKEN_ID in .env.
 *
 * Also configures a custom fixed fee of 1 tinybar per TOLL transfer, paid to
 * the seller account, to show HTS fee schedules in the settlement path.
 */
import {
  AccountId,
  CustomFixedFee,
  Hbar,
  TokenAssociateTransaction,
  TokenCreateTransaction,
  TokenSupplyType,
  TokenType,
  TransferTransaction,
} from '@hiero-ledger/sdk';
import { createOperatorClient, parsePrivateKey } from '@agora402/registry';
import { need, network, saveEnv } from './env.js';

const net = network();
const sellerId = need('SELLER_ACCOUNT_ID');
const sellerKey = parsePrivateKey(need('SELLER_PRIVATE_KEY'));
const buyerId = need('BUYER_ACCOUNT_ID');
const buyerKey = parsePrivateKey(need('BUYER_PRIVATE_KEY'));
const DECIMALS = 6;
const SUPPLY = 1_000_000n * 10n ** BigInt(DECIMALS); // 1,000,000 TOLL
const BUYER_GRANT = 1_000n * 10n ** BigInt(DECIMALS); // 1,000 TOLL

const seller = createOperatorClient({ network: net, accountId: sellerId, privateKey: need('SELLER_PRIVATE_KEY') });
try {
  const create = await new TokenCreateTransaction()
    .setTokenName('Agora402 Toll')
    .setTokenSymbol('TOLL')
    .setTokenType(TokenType.FungibleCommon)
    .setDecimals(DECIMALS)
    .setInitialSupply(Number(SUPPLY))
    .setSupplyType(TokenSupplyType.Finite)
    .setMaxSupply(Number(SUPPLY))
    .setTreasuryAccountId(sellerId)
    .setAdminKey(sellerKey.publicKey)
    .setFeeScheduleKey(sellerKey.publicKey)
    .setCustomFees([new CustomFixedFee().setHbarAmount(Hbar.fromTinybars(1)).setFeeCollectorAccountId(sellerId)])
    .setTokenMemo('Agora402 settlement credits for x402 services on Hedera')
    .freezeWith(seller)
    .sign(sellerKey);
  const createRes = await create.execute(seller);
  const tokenId = (await createRes.getReceipt(seller)).tokenId!.toString();
  console.log(`TOLL token ${tokenId}  https://hashscan.io/${net}/token/${tokenId}`);

  // Buyer must associate before it can hold TOLL. Signed by the buyer key.
  const assoc = await new TokenAssociateTransaction()
    .setAccountId(AccountId.fromString(buyerId))
    .setTokenIds([tokenId])
    .freezeWith(seller)
    .sign(buyerKey);
  await (await assoc.execute(seller)).getReceipt(seller);
  console.log(`buyer ${buyerId} associated with ${tokenId}`);

  const grant = await new TransferTransaction()
    .addTokenTransfer(tokenId, sellerId, -Number(BUYER_GRANT))
    .addTokenTransfer(tokenId, buyerId, Number(BUYER_GRANT))
    .execute(seller);
  await grant.getReceipt(seller);
  console.log(`sent ${BUYER_GRANT / 10n ** BigInt(DECIMALS)} TOLL to buyer`);

  saveEnv({ TOLL_TOKEN_ID: tokenId });
  console.log('saved TOLL_TOKEN_ID to .env. Restart the seller so it advertises TOLL prices.');
} finally {
  seller.close();
}
