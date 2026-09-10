import { PrivateKey, PublicKey } from '@hiero-ledger/sdk';
import { canonicalQuoteBytes, type Quote, type QuoteBody } from '@agora402/shared';

/** Sign a quote with the seller's Hedera key. The signer public key travels with the quote. */
export function signQuote(body: QuoteBody, key: PrivateKey): Quote {
  const sig = key.sign(canonicalQuoteBytes(body));
  return {
    ...body,
    signature: Buffer.from(sig).toString('hex'),
    signerPublicKey: key.publicKey.toStringDer(),
  };
}

/** Verify the quote signature. Returns false on any malformed input rather than throwing. */
export function verifyQuoteSignature(quote: Quote): boolean {
  try {
    const { signature, signerPublicKey, ...body } = quote;
    const pub = PublicKey.fromString(signerPublicKey);
    return pub.verify(canonicalQuoteBytes(body), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Check that the quote's signer key is a key of the seller account by reading
 * the account from the mirror node. This closes the loop: listing payTo ->
 * account key -> quote signature.
 */
export async function signerControlsAccount(mirrorUrl: string, accountId: string, signerPublicKeyDer: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const res = await fetchImpl(`${mirrorUrl}/api/v1/accounts/${accountId}`);
  if (!res.ok) return false;
  const body = (await res.json()) as { key?: { _type: string; key: string } | null };
  if (!body.key?.key) return false;
  try {
    const accountKey = PublicKey.fromString(body.key.key);
    const signer = PublicKey.fromString(signerPublicKeyDer);
    return accountKey.toStringRaw() === signer.toStringRaw();
  } catch {
    return false;
  }
}
