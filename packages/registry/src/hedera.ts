import {
  Client,
  PrivateKey,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  type TopicId,
} from '@hiero-ledger/sdk';

export type ShortNetwork = 'testnet' | 'mainnet';

export interface OperatorConfig {
  network: ShortNetwork;
  accountId: string;
  /** ECDSA hex (0x...) or DER encoded private key */
  privateKey: string;
}

/** Parse a private key string in either 0x-hex ECDSA or DER form. */
export function parsePrivateKey(key: string): PrivateKey {
  const k = key.trim();
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(k)) return PrivateKey.fromStringECDSA(k);
  return PrivateKey.fromString(k);
}

/** Hedera SDK client with the operator set. Caller must `close()` when done. */
export function createOperatorClient(cfg: OperatorConfig): Client {
  const client = cfg.network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(cfg.accountId, parsePrivateKey(cfg.privateKey));
  return client;
}

/** Create a public HCS topic. Returns the topic id as a string. */
export async function createTopic(client: Client, memo: string): Promise<string> {
  const tx = await new TopicCreateTransaction().setTopicMemo(memo.slice(0, 100)).execute(client);
  const receipt = await tx.getReceipt(client);
  const topicId = receipt.topicId as TopicId | null;
  if (!topicId) throw new Error('topic creation returned no topic id');
  return topicId.toString();
}

/**
 * Submit a JSON message to a topic. The SDK chunks messages above 1024 bytes
 * automatically; the mirror node reader reassembles them.
 */
export async function submitJson(client: Client, topicId: string, payload: unknown): Promise<{ transactionId: string; sequenceNumber: number }> {
  const message = JSON.stringify(payload);
  const tx = await new TopicMessageSubmitTransaction().setTopicId(topicId).setMessage(message).execute(client);
  const receipt = await tx.getReceipt(client);
  return {
    transactionId: tx.transactionId.toString(),
    sequenceNumber: Number(receipt.topicSequenceNumber?.toString() ?? '0'),
  };
}
