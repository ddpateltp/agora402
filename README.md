# Agora402

An agent-to-agent services marketplace on Hedera. AI agents discover services in an on-chain registry, negotiate a price, pay per request over the x402 protocol (settled through the Blocky402 facilitator on Hedera testnet), and every settlement leaves a verifiable receipt on the Hedera Consensus Service.

Built for ETHOnline 2026, Hedera track "AI & Agentic Payments on Hedera".

## Why

Agents that buy compute, data or inference need three things a human checkout flow does not give them: a way to find a service without a sales call, a price they can reason about before they commit, and a payment that clears at machine speed without an API key or a subscription. Agora402 puts those three pieces on Hedera:

* Discovery: sellers publish a listing (endpoints, pricing model, agent identity) to an HCS topic. Buyers read it from the public mirror node. No registry operator.
* Negotiation: an A2A-style quote handshake. The buyer states the work and a ceiling, the seller answers with a signed, time-limited quote. Buyers can counter below list price; sellers have a floor.
* Payment: x402 `exact` scheme on Hedera. The 402 carries a per-request price computed from the actual request (tokens in, tokens budgeted out) or the agreed quote. Blocky402 verifies and settles the partially signed transfer and pays the network fee.
* Audit: the seller writes a receipt for every settled payment to an HCS topic, including metering evidence and a hash of the response. `agora receipts` recomputes every bill against the mirror node.

## What is in the box

| Package | What it does |
| --- | --- |
| `packages/shared` | Types and zod schemas (listing, quote, receipt), HCS-14 agent identifiers, BigInt pricing models, canonical quote bytes |
| `packages/registry` | HCS registry (publish and read listings), receipts ledger and audit, mirror node client, quote signing with Hedera keys |
| `packages/seller` | Express service: `POST /v1/infer` (LLM, metered per token) and `GET /v1/rates/hbar` (data feed, per query) behind `@x402/express`; `POST /a2a/quote`; `/.well-known/agora402.json` and `/.well-known/agent.json`; receipts to HCS on every settlement |
| `packages/buyer` | `BuyerAgent`: discover, rank by list price, negotiate, pay with per-call and per-session budgets, verify on the mirror node. `agora` CLI |
| `scripts` | One-off setup: create the two HCS topics, create the TOLL HTS token (with a custom fee), publish the listing, print balances |

Everything is TypeScript on Node 20+, npm workspaces, tested with Vitest. The tests run the real x402 client and server code paths with a fake facilitator and a stubbed mirror node, so `npm test` needs no network.

## Architecture

```
                 HCS registry topic                      HCS receipts topic
                 (listings, delistings)                  (one receipt per settlement)
                        ^   |                                     ^
        publish listing |   | read via mirror node                | publish receipt
                        |   v                                     |
+-----------------+   discover   +-----------------------------------------+
|   Buyer agent   | -----------> |               Seller service            |
|  (packages/     |   quote      |  POST /a2a/quote   signed quote, TTL    |
|   buyer)        | <----------> |  POST /v1/infer    x402, per-token      |
|                 |   402 / pay  |  GET  /v1/rates/hbar  x402, per query   |
|  budget caps    | <----------> |  /.well-known/agora402.json, agent.json |
+-----------------+              +-----------------------------------------+
        |  partially signed                   |  verify / settle
        |  Hedera TransferTransaction         v
        |                          +---------------------+       +------------------+
        +------------------------> | Blocky402           | ----> | Hedera testnet   |
                                   | facilitator         |       | consensus + HTS  |
                                   | (co-signs, pays fee)|       +------------------+
                                   +---------------------+                ^
                                                                          |
                                   buyer verifies tx on the mirror node --+
```

### Payment flow, one paid request

1. Buyer reads the registry topic (or one seller's manifest) and computes the list price for its request from the published pricing model. Cheapest seller first.
2. Buyer `POST /a2a/quote` with `{endpointId, estimate, asset, maxAmount}`. Seller prices the work, accepts a counter down to its floor, signs the quote with its Hedera key. Buyer verifies the signature and, via the mirror node, that the signer key is the key of the `payTo` account.
3. Buyer calls `POST /v1/infer` with the body plus `quoteId`. The seller's `@x402/express` middleware answers `402 Payment Required` with `PAYMENT-REQUIRED`: `scheme=exact`, `network=hedera:testnet`, `asset=0.0.0` (HBAR) or the TOLL token id, `amount` = the quoted amount (or the per-token price if no quote), `payTo`, and `extra.feePayer` = Blocky402's fee-payer account.
4. `@x402/fetch` on the buyer runs spend controls (per-call cap) and policies (asset, remaining session budget), then `@x402/hedera` builds a `TransferTransaction` payer -> payTo for exactly `amount`, with the facilitator as transaction fee payer, and signs it with the buyer key only. The request is retried with `PAYMENT-SIGNATURE`.
5. Seller middleware calls Blocky402 `/verify`. Blocky402 decodes the transaction, checks the signature, amounts and balances, and reports the payer.
6. Seller runs the handler (calls the LLM, or the mirror node rate file). A 4xx/5xx cancels settlement: failed calls are never charged.
7. Middleware calls Blocky402 `/settle`. Blocky402 co-signs as fee payer and submits to Hedera. The response carries `PAYMENT-RESPONSE` with the transaction id.
8. The seller's `onAfterSettle` hook writes a receipt `{transactionId, payer, payTo, asset, amount, resource, quoteId, usage, responseHash}` to the receipts topic. The buyer looks the transaction up on the mirror node and shows the HashScan link.

### Metering

`priceFor(model, estimate)` is the same function on both sides, BigInt only. Models: `flat`, `per-token` (base + per 1k input + per 1k budgeted output), `per-unit`. The seller's `DynamicPrice` reads the request body, so two prompts of different lengths get different 402 amounts. A quote pins the amount for its TTL and is consumed once settled, so it cannot be replayed.

### Identity and trust

* Sellers and buyers have HCS-14 identifiers: `uaid:aid:<base58(sha384(canonical six fields))>;uid=...;registry=agora402;proto=a2a;nativeId=hedera:testnet:0.0.x`.
* A listing is only accepted by buyers if the HCS message was paid for by the `payTo` account it names. That binds listings to accounts without any registry authority.
* Quotes are signed by the seller's account key; buyers check the signature and the key against the account on the mirror node.
* Receipts are written by the seller account; `agora receipts` flags any receipt whose transfer does not match the mirror node.

## Setup

Prerequisites: Node 20+, two Hedera testnet ECDSA accounts (seller and buyer) from [portal.hedera.com](https://portal.hedera.com) funded with testnet HBAR, and optionally a [Groq](https://console.groq.com) or Anthropic API key for real inference (`LLM_PROVIDER=mock` works without one).

```bash
git clone https://github.com/ddpateltp/agora402.git
cd agora402
npm install
cp .env.example .env        # fill in SELLER_* and BUYER_* account ids and keys, LLM provider
npm run build
npm test                    # 27 tests, no network needed

npm run setup:topics        # creates REGISTRY_TOPIC_ID and RECEIPTS_TOPIC_ID, writes them to .env
npm run setup:token         # optional: creates the TOLL HTS token, associates the buyer, funds it
npm run seller              # starts the x402-gated service on http://localhost:4402
npm run setup:register      # publishes the listing to the registry topic (seller must be running or SELLER_PUBLIC_URL set)
```

Then, in another terminal:

```bash
npm run buyer -- discover                                  # read the registry
npm run buyer -- infer "Explain x402 in one sentence" --counter 90 --budget 0.2
npm run buyer -- rate                                      # buy one HBAR/USD quote
npm run buyer -- receipts --topic <RECEIPTS_TOPIC_ID> --seller-account <SELLER_ACCOUNT_ID>
```

`--seller http://localhost:4402` bypasses the registry and talks to one seller directly.

Facilitator: `FACILITATOR_URL=https://api.testnet.blocky402.com` (hosted testnet, no API key). For mainnet use `https://api.blocky402.com` with an API key and `HEDERA_NETWORK=mainnet`.

## Hedera services used

* HCS: registry topic (discovery) and receipts topic (audit trail).
* HTS: optional TOLL settlement token with a custom fixed fee in the transfer path; settlement also works in native HBAR.
* Accounts and keys: ECDSA accounts, quotes signed with account keys, listing ownership proven by the HCS payer.
* Mirror node: registry reads, receipt audit, quote signer check, live HBAR/USD exchange rate (the paid data feed).
* x402 `exact` scheme for Hedera via `@x402/hedera`, settled through Blocky402.

## Roadmap

- [x] Shared types, HCS-14 identity, pricing
- [x] Registry and receipts on HCS with mirror node reader and audit
- [x] Seller: metered inference and rate endpoints behind x402, quotes, receipts
- [x] Buyer agent and CLI with per-call and per-session budgets
- [x] Setup scripts (topics, TOLL token, register)
- [ ] Buyer dashboard (live payment stages)
- [ ] Live run on Hedera testnet with Blocky402, HashScan links in this README
- [ ] Demo video

## AI tool usage

This project was built by Divyesh Patel with Claude (Anthropic) as a coding assistant during the hackathon. Claude drafted the package structure, most source files and tests from the design decisions recorded in [`docs/PLAN.md`](docs/PLAN.md); Divyesh chose the concept, reviewed and directed the work, ran the live testnet integration, and owns the submission. The planning notes and this README are the spec artefacts.

## Licence

MIT
