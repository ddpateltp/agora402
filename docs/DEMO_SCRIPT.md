# Demo video script (target 3 minutes, hard limit 4)

ETHGlobal rules: 2 to 4 minutes, 720p or better, your own voice, no music-only, no AI voiceover, not recorded on a phone, no speed-up. Show the paid request executing.

## Before recording

* Seller running with `LLM_PROVIDER=anthropic` (or groq), `RECEIPTS_TOPIC_ID` set, listing registered.
* Buyer dashboard running on http://localhost:4403 with the registry topic configured.
* HashScan open in a second tab on the receipts topic.
* Terminal ready with `npm run buyer -- receipts --topic <RECEIPTS_TOPIC_ID> --seller-account <SELLER_ACCOUNT_ID>` typed but not run.
* Reset the dashboard so the session shows 0 HBAR spent.

## 0:00 to 0:20  Problem (one slide, 3 bullets)

"Agents that buy inference or data from other agents have no way to find a service, agree a price and pay without an API key and a human. Agora402 is a marketplace where agents do all three on Hedera, per request, over x402."

## 0:20 to 0:50  Discovery

Dashboard, Sellers panel. Point at the registry topic link, open it on HashScan: the listing is an HCS message paid by the seller account. Show the manifest and the pricing model (base plus per 1k input plus per 1k output tokens). Mention the HCS-14 identifier.

## 0:50 to 1:50  The paid request

Type a prompt, set "offer 90% of list price", click Discover, negotiate, pay. Narrate the stages as they stream:

* discovering, discovered: read from the mirror node
* quoting, quoted: seller signed a quote, accepted our counter, 120 s TTL
* requesting, payment_required: the 402 carries exactly the quoted amount in tinybars
* paying, paid: buyer signs a Hedera TransferTransaction, facilitator is fee payer
* settled: Blocky402 verified and settled, transaction id
* verifying, verified: mirror node shows the seller credited

Click the HashScan link. Show the transfer: buyer debited, seller credited, Blocky402 paid the network fee.

## 1:50 to 2:30  Metering and receipts

Run a second request with a much longer prompt and no counter. The 402 amount is higher. Point at the token usage in the receipt. Scroll to the receipts table: match / MISMATCH column. Switch to the terminal and run the audit command: every receipt recomputed against the mirror node.

## 2:30 to 2:55  What Hedera gave us (one slide, 4 bullets)

HCS registry and receipts, HTS TOLL token with custom fee in the settlement path, ECDSA keys signing quotes, mirror node as the free public verifier. Blocky402 for gasless settlement.

## 2:55 to 3:10  Close

Repo link, tests run the real x402 client and server paths offline, next steps: scheduled transactions for retainers, ERC-8004 registration, more sellers.
