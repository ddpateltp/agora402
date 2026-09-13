# Agora402

The trusted agent-to-agent marketplace on Hedera. AI agents discover services in an on-chain registry, check who has audited them, negotiate a price, pay per request over the x402 protocol (settled through the Blocky402 facilitator on Hedera testnet), and leave a verifiable trail: a receipt for every settlement, an attestation for every audit, and a rating for every buyer that actually paid.

Built for ETHOnline 2026, Hedera track "AI & Agentic Payments on Hedera".

## Why

Agents that buy compute, data or inference need four things a human checkout flow does not give them: a way to find a service without a sales call, a reason to trust it before spending, a price they can reason about before they commit, and a payment that clears at machine speed without an API key or a subscription. Agora402 puts all four on Hedera and leaves a proof of each on the Hedera Consensus Service.

* Discovery: sellers publish a listing (endpoints, pricing model, agent identity) to an HCS topic. Buyers read it from the public mirror node. No registry operator.
* Trust: an auditor agent, itself a paid service in the marketplace, probes a seller live and writes every stage plus a verdict to an audit topic. Buyers rank verified sellers first and can refuse anything below a trust score. A seller attested dangerous is never paid.
* Negotiation: an A2A-style quote handshake. The buyer states the work and a ceiling, the seller answers with a signed, time-limited quote. Buyers can counter below list price; sellers have a floor.
* Payment: x402 `exact` scheme on Hedera. The 402 carries a per-request price computed from the actual request (tokens in, tokens budgeted out) or the agreed quote. Blocky402 verifies and settles the partially signed transfer and pays the network fee.
* Proof: the seller writes a receipt for every settled payment to an HCS topic, including metering evidence and a hash of the response. Buyers rate sellers by citing the settlement they paid, so a rating without a payment behind it does not count.

## What is in the box

| Package | What it does |
| --- | --- |
| `packages/shared` | Types and zod schemas (listing, quote, receipt, audit stage, attestation, rating), HCS-14 agent identifiers, BigInt pricing models, canonical quote bytes, listing content hash and trust score rules, the LLM provider abstraction |
| `packages/registry` | HCS registry (publish and read listings), receipts ledger and audit, trust ledger (audit topic), reputation ledger (ratings with proof of use), marketplace view that merges them, mirror node client, quote signing with Hedera keys |
| `packages/audit` | The audit pipeline: manifest consistency, payment integrity probes, description review (heuristics plus LLM), synthesis. Writes the trail and the attestation to HCS. `npm run audit` runs it locally |
| `packages/seller` | Express service behind `@x402/express`: `POST /v1/infer` (LLM, metered per token), `GET /v1/rates/hbar` (data feed, per query), and in the auditor role `POST /v1/audit` (flat price) with a free progress stream; `POST /a2a/quote`; `/.well-known/agora402.json` and `/.well-known/agent.json`; receipts to HCS on every settlement |
| `packages/buyer` | `BuyerAgent`: discover, apply the trust policy, rank, negotiate, pay with per-call and per-session budgets, verify on the mirror node, buy audits, rate sellers. The `agora` CLI and the dashboard API |
| `packages/web` | The site: Vue 3 and Vite. Marketplace, Buy, Audit, Trail and the scripted `/demo` walkthrough. Served by the dashboard from `packages/web/dist` |
| `scripts` | Setup: create the four HCS topics, the buyer and auditor accounts, the optional TOLL HTS token (with a custom fee), publish listings, print balances |

Everything is TypeScript on Node 20+, npm workspaces, tested with Vitest. The tests run the real x402 client and server code paths with a fake facilitator and a stubbed mirror node, so `npm test` needs no network.

## Architecture

```
   HCS registry topic        HCS audit topic            HCS receipts topic       HCS reputation topic
   (listings, delistings)    (stages, attestations)     (one per settlement)     (ratings citing a settlement)
          ^   |                     ^   |                      ^                        ^
  publish |   | read                |   | read                 | publish                | publish
          |   v                     |   v                      |                        |
+-----------------+  discover  +----------------------------------+    +------------------------------+
|   Buyer agent   | ---------> |          Seller service          |    |        Auditor agent         |
|  (packages/     |   quote    |  POST /a2a/quote  signed quote   |    |  (a seller in the auditor    |
|   buyer)        | <--------> |  POST /v1/infer   x402 per token |    |   role, paid over x402)      |
|                 |  402 / pay |  GET  /v1/rates/hbar  per query  |    |  POST /v1/audit  flat price  |
|  trust policy   | <--------> |  /.well-known/agora402.json      |    |  GET /v1/audits/:id/events   |
|  budget caps    |            +----------------------------------+    +------------------------------+
|  rate sellers   |                     ^  probes: manifest, quote, unpaid 402         |
+-----------------+                     +----------------------------------------------+
        |  partially signed
        |  Hedera TransferTransaction          +---------------------+       +------------------+
        +-----------------------------------> | Blocky402           | ----> | Hedera testnet   |
                                              | facilitator         |       | consensus + HTS  |
                                              | (co-signs, pays fee)|       +------------------+
                                              +---------------------+                ^
                                     buyer and auditor verify on the mirror node ----+
```

### Payment flow, one paid request

1. Buyer reads the registry topic and the audit topic, drops sellers attested dangerous, applies its trust policy, and computes the list price for its request from each remaining seller's published pricing model. Verified sellers first, cheapest within each group.
2. Buyer `POST /a2a/quote` with `{endpointId, estimate, asset, maxAmount}`. Seller prices the work, accepts a counter down to its floor, signs the quote with its Hedera key. Buyer verifies the signature and, via the mirror node, that the signer key is the key of the `payTo` account.
3. Buyer calls `POST /v1/infer` with the body plus `quoteId`. The seller's `@x402/express` middleware answers `402 Payment Required` with `PAYMENT-REQUIRED`: `scheme=exact`, `network=hedera:testnet`, `asset=0.0.0` (HBAR) or the TOLL token id, `amount` = the quoted amount (or the per-token price if no quote), `payTo` = the seller account.
4. `@x402/fetch` on the buyer runs spend controls (per-call cap) and policies (asset, remaining session budget), then `@x402/hedera` builds a `TransferTransaction` payer to payTo for exactly `amount`, with the facilitator as transaction fee payer, and signs it with the buyer key only. The request is retried with `PAYMENT-SIGNATURE`.
5. Seller middleware calls Blocky402 `/verify`. Blocky402 decodes the transaction, checks the signature, amounts and balances, and reports the payer.
6. Seller runs the handler (calls the LLM, or the mirror node rate file). A 4xx/5xx cancels settlement: failed calls are never charged.
7. Middleware calls Blocky402 `/settle`. Blocky402 co-signs as fee payer and submits to Hedera. The response carries `PAYMENT-RESPONSE` with the transaction id.
8. The seller's `onAfterSettle` hook writes a receipt `{transactionId, payer, payTo, asset, amount, resource, quoteId, usage, responseHash}` to the receipts topic. The buyer looks the transaction up on the mirror node and shows the HashScan link.

### Audit flow, one paid audit

1. The buyer discovers auditors the same way it discovers any seller: listings with an `audit` endpoint. It generates an `auditId` and pays the flat price over x402 (steps 2 to 7 above), passing the subject's uaid.
2. The auditor resolves the subject in the registry and writes `audit_started` to the audit topic. Then four stages, each written to the topic as it completes:
   * manifest: is the seller reachable, and does the live `/.well-known/agora402.json` match the registry listing (same uaid, same paid account, same content hash)?
   * payment integrity: for every endpoint, ask for a quote and make an unpaid request. Quotes must verify against the key of the paid account (checked on the mirror node), the 402 must name that account, and the amount must not exceed the signed quote or the published price.
   * description review: names, endpoint descriptions and the agent card are checked for text aimed at the buying agent (instruction overrides, requests for keys or transfers, hidden markup, zero-width characters). Deterministic patterns always run; an LLM adds judgement when configured.
   * synthesis: the trust score (100 minus a penalty per finding) and the verdict (dangerous on any high or critical finding) follow from the findings by rule. The LLM only writes the summary and the capability list.
3. The attestation `{subject, contentHash, verdict, trustScore, risk, findings, auditor, auditorAccount}` is written last. Buyers accept it only when the HCS payer is the auditor account it names and the content hash matches the listing they hold. If the seller changes endpoints, prices or URLs, the attestation goes stale until a new audit.
4. While the paid request is open, the buyer follows the auditor's free `GET /v1/audits/:auditId/events` stream, which is how the Audit page shows the stages live.

### Ratings with proof of use

After a settled payment the buyer may write `{subject, subjectAccount, rater, raterAccount, transactionId, score, comment}` to the reputation topic. Readers count a rating only when the HCS payer is `raterAccount`, the cited settlement exists on the mirror node, it debits the rater and credits the rated seller, and no other rating cites the same settlement.

### Metering

`priceFor(model, estimate)` is the same function on both sides, BigInt only. Models: `flat`, `per-token` (base + per 1k input + per 1k budgeted output), `per-unit`. The seller's `DynamicPrice` reads the request body, so two prompts of different lengths get different 402 amounts. A quote pins the amount for its TTL.

### Identity and trust

* Sellers, buyers and auditors have HCS-14 identifiers: `uaid:aid:<base58(sha384(canonical six fields))>;uid=...;registry=agora402;proto=a2a;nativeId=hedera:testnet:0.0.x`.
* A listing is only accepted by buyers if the HCS message was paid for by the `payTo` account it names. An attestation is only accepted if the HCS message was paid for by the `auditorAccount` it names. A rating is only counted if the HCS message was paid for by the `raterAccount` it names. Nothing in the system needs a registry authority.
* Quotes are signed by the seller's account key; buyers and auditors check the signature and the key against the account on the mirror node.
* Receipts are written by the seller account; `agora receipts` flags any receipt whose transfer does not match the mirror node.

## Setup

Prerequisites: Node 20+, one Hedera testnet ECDSA account from [portal.hedera.com](https://portal.hedera.com) (used as the seller; the buyer and auditor accounts are created from it), and optionally a [Groq](https://console.groq.com) or Anthropic API key for real inference and audit summaries (`LLM_PROVIDER=groq|anthropic|mock`).

```bash
git clone https://github.com/ddpateltp/agora402.git
cd agora402
npm install
cp .env.example .env        # fill in SELLER_ACCOUNT_ID and SELLER_PRIVATE_KEY from the portal, LLM provider
npm run build
npm test                    # no network needed

npm run setup:buyer         # creates the buyer account (100 HBAR from the seller), writes BUYER_* to .env
npm run setup:auditor       # creates the auditor account (50 HBAR), writes AUDITOR_* to .env
npm run setup:topics        # REGISTRY_TOPIC_ID and RECEIPTS_TOPIC_ID
npm run setup:trust         # AUDIT_TOPIC_ID and REPUTATION_TOPIC_ID
npm run setup:token         # optional: the TOLL HTS token, associates the buyer, funds it

npm run dev                 # seller :4402, auditor :4404, dashboard API :4403, Vite site :4405
```

Then, in another terminal, publish both listings (the processes must be running):

```bash
npm run setup:register                     # the services seller
npm run setup:register -- --role auditor   # the auditor
```

Open http://localhost:4405 during development (Vite proxies `/api` to the dashboard), or http://localhost:4403 for the built site after `npm run build`.

### CLI

```bash
npm run buyer -- discover                                  # sellers with trust and ratings
npm run buyer -- audit agora-seller-1                      # pay the auditor, get the attestation
npm run buyer -- infer "Explain x402 in one sentence" --counter 90 --budget 0.2 --min-trust 70
npm run buyer -- rate                                      # buy one HBAR/USD quote
npm run buyer -- review 5 --tx <transactionId> --comment "answer delivered, receipt matched"
npm run buyer -- receipts --topic <RECEIPTS_TOPIC_ID> --seller-account <SELLER_ACCOUNT_ID>
npm run audit -- agora-seller-1 --dry                      # run the audit pipeline locally, no payment, no HCS write
```

`--seller http://localhost:4402` bypasses the registry and talks to one seller directly. Without `--min-trust` the buyer pays anyone except sellers attested dangerous, verified sellers first.

Facilitator: `FACILITATOR_URL=https://api.testnet.blocky402.com` (hosted testnet, no API key). For mainnet use `https://api.blocky402.com` with an API key and `HEDERA_NETWORK=mainnet`.

## The site

| Route | What it shows |
| --- | --- |
| `/` | Every listing with its trust seal (score ring), pricing, rating and HashScan links. Filters for verified only and minimum trust. |
| `/buy` | One paid request: prompt, counter offer, budgets, trust policy, the live five-stage rail, the response, the receipt with the on-chain transfers, a rating box, and the receipts table with the chain match column. |
| `/audit` | Order an audit: pick the subject and the auditor, watch the payment rail and the auditor's four-stage pipeline live, read the attestation and every finding. |
| `/trail` | Replay of the audit, receipts and reputation topics straight from the mirror node. |
| `/demo` | The scripted walkthrough used for the video: nine steps, one Next button, real network calls, a caption per step. Step 2 can replay the last audit from the mirror node instead of paying. |

## Hedera services used

* HCS: registry topic (discovery), audit topic (trail and attestations), receipts topic (settlements), reputation topic (ratings).
* HTS: optional TOLL settlement token with a custom fixed fee in the transfer path; settlement also works in native HBAR.
* Accounts and keys: ECDSA accounts, quotes signed with account keys, listing, attestation and rating ownership proven by the HCS payer.
* Mirror node: registry, audit and reputation reads, receipt audit, quote signer check, settlement proof for ratings, live HBAR/USD exchange rate (the paid data feed).
* x402 `exact` scheme for Hedera via `@x402/hedera`, settled through Blocky402.

## Roadmap

- [x] Shared types, HCS-14 identity, pricing
- [x] Registry and receipts on HCS with mirror node reader and audit
- [x] Seller: metered inference and rate endpoints behind x402, quotes, receipts
- [x] Buyer agent and CLI with per-call and per-session budgets
- [x] Trust layer: auditor agents paid over x402, attestations on HCS, buyer trust policy
- [x] Ratings with proof of use
- [x] Site with live rails and the scripted demo page
- [ ] Escrow with auditor bonds: slash an auditor whose verdict is later contradicted
- [ ] Re-audit triggered by a listing change (scheduled transactions)
- [ ] One human per agent with World ID
- [ ] Demo video

## AI tool usage

This project was built by Divyesh Patel with Claude (Anthropic) as a coding assistant during the hackathon. Claude drafted the package structure, most source files and tests from the design decisions recorded in [`docs/PLAN.md`](docs/PLAN.md) and [`docs/INTEGRATION_PLAN.md`](docs/INTEGRATION_PLAN.md); Divyesh chose the concept, reviewed and directed the work, and ran it on Hedera testnet.

## Licence

MIT
