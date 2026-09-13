# Agora402 v2 plan: trust layer, new website, scripted demo page

Written 13 September 2026, executed the same day. `docs/PLAN.md` stays the record of v1 design decisions. Differences between plan and build are noted inline.

## 1. Positioning

Agora402 is the trusted agent-to-agent marketplace on Hedera: discover, verify, negotiate, pay, prove. Nothing in the v1 core changes. The trust layer is added on top and uses the same rails.

Auditing is itself a paid service in the marketplace. An auditor is a seller with a `POST /v1/audit` endpoint behind x402. A seller pays an auditor, the verdict is written to HCS, and the seller's listing carries the badge.

## 2. Core to keep, untouched

* Registry listings on HCS, read from the mirror node, bound to the paying account.
* Signed quotes with counter offers and a seller floor.
* x402 `exact` on Hedera settled through Blocky402, per-token metering, TOLL token option.
* Receipts on HCS and the `agora receipts` audit.
* Buyer per-call and per-session budgets.

## 3. Features taken from Mars, rebuilt in our code

1. **Attestation next to the listing.** Built as one shared audit topic rather than a field on the listing: the attestation carries `subject` (seller uaid), `verdict`, `trustScore`, `contentHash`, `auditor` and `auditorAccount`, and the registry reader matches it to the listing. A seller cannot claim its own badge because the attestation counts only when the HCS payer is the auditor account it names. Buyers rank by price and trust and get a `--min-trust` policy next to the budget caps. An unverified listing is still buyable, but the buyer shows a warning and the demo does not use it.
2. **Audit pipeline.** New `packages/audit`. Four LLM stages (scanner, sandbox reasoning, wallet abuse, synthesiser) over a seller's manifest and endpoint descriptions, using the existing LLM provider. Each stage writes one HCS message to the audit topic under the run's `auditId`. The synthesiser writes the verdict, trust score and severity histogram. Deterministic fallback when no LLM key is set.
3. **Reputation with proof of use.** New reputation topic. After a settled payment the buyer can post a rating that cites the receipt transaction id. The reader only counts ratings whose transaction exists on the mirror node and whose payer is the rater. No World ID needed.

Left out on purpose: Arc, USDC escrow contract, Hardhat, wagmi, RainbowKit, World ID, Next.js. Listed as roadmap in the README.

## 4. Backend changes

| Package | Change |
| --- | --- |
| shared | `Attestation` and `Rating` types and zod schemas, `trustScore` in ranking helpers |
| registry | Audit topic and reputation topic readers, `listServices()` merges attestation and rating summary into each listing |
| audit (new) | Pipeline, HCS writer, `npm run audit -- <uaid|url>` for a local run; `agora audit <uaid>` buys one |
| seller | Auditor mode: `POST /v1/audit` flat priced behind x402, runs the pipeline, writes the audit topic, returns the verdict |
| buyer | Trust policy, `audit` and `review` commands, dashboard API: `GET /api/audits[?auditId]`, `POST /api/audit` (NDJSON), `POST /api/rate`, `GET /api/reputation`, `POST /api/reset` |
| scripts | `setup:trust` (both topics), `setup:auditor` (account), `setup:register -- --role auditor` (listing) |

## 5. Website

### Stack

New `packages/web`: Vue 3 and Vite, served by the existing buyer dashboard Express server, which already streams runs over SSE. Vue is the company stack and gives shared components between the functional pages and the demo page. The 901-line vanilla dashboard is retired once the new pages cover it.

### Design direction

The Mars look comes from a few decisions, not from its code: a soft light canvas with a faint radial gradient, white cards with hairline borders in a bento grid, one accent colour, three status colours, a humanist sans for text and a monospace for ids and amounts, and live streaming panels. We do the same with our own tokens.

* Canvas `#eef1f5`, cards white at 80 percent, hairline `rgba(0,0,0,.10)`.
* Accent: one Hedera-adjacent colour, for example deep violet, used for primary buttons and active stages only.
* Status: green verified and settled, amber pending and warnings, red dangerous and mismatch.
* Type: Inter for text, JetBrains Mono for account ids, topic ids, tinybars and hashes.
* Every on-chain object is a HashScan link with an external-link glyph. No raw JSON on screen unless the user opens a "raw" toggle.
* Motion: stages animate in as they stream, badges pop once when they appear, nothing else moves.

### Pages

| Route | Purpose | Main components |
| --- | --- | --- |
| `/` | Marketplace. Cards for every listing: name, price from the pricing model, trust badge and score, rating line, HashScan links. Filters: verified only, min trust, max price. | `ListingCard`, `TrustBadge`, `RatingLine` |
| `/buy` | The v1 dashboard rebuilt. Prompt, counter, budget, seller pick, live stage list, response, receipt, session spend. | `RunForm`, `StageList`, `ReceiptCard` |
| `/audit` | Pick a listing, run the audit, watch the four stages stream, see the verdict and the HCS messages land. | `AuditRunner`, `StageList`, `VerdictCard` |
| `/trail` | Replay any HCS topic we write: audit trail per audit, receipts with match or mismatch, ratings. | `TrailPage`, `ReceiptsTable` |
| `/demo` | Scripted walkthrough for the video. Section 6. | all of the above |

Bento layout on `/` and `/buy`: 12-column grid, cards sized to their content, fits a 1440 by 900 screen without scrolling so recording is clean.

## 6. The `/demo` page

One page, one "Next" button, real network calls, no mocks. Each step fills its own inputs so nothing is typed on camera. A caption under each step is the sentence to say. Steps follow the video order exactly.

| Step | On screen | Caption to say | Real action |
| --- | --- | --- | --- |
| 0 Problem | Three short bullets, large type | Agents that buy inference or data from other agents cannot find a service, trust it, agree a price or pay without a human. Agora402 does all four on Hedera. | none |
| 1 Discover | Marketplace with two sellers: one verified, one unverified. Registry topic link. | Sellers publish a listing to an HCS topic. Buyers read the mirror node. No registry operator. | `GET /api/sellers` |
| 2 Verify | Audit runner on the unverified seller. Four stages stream, verdict and trust score appear, badge flips on the card. | An auditor agent, itself a paid service, inspects the seller and writes every step to HCS. The badge is a fact on chain, not a claim. | `POST /api/audit` (auditor paid over x402) |
| 3 Negotiate and pay | Buy panel prefilled: short prompt, offer 90 percent, budget 0.5 HBAR. Stages stream from discover to verified. | Signed quote with a counter offer, a 402 for exactly that amount, one Hedera transfer signed by the buyer, Blocky402 pays the fee. | `POST /api/run` |
| 4 Prove the payment | HashScan transfer panel inline: buyer debited, seller credited, fee payer. | This is the settlement. Anyone can check it. | mirror node lookup |
| 5 Metering | Second run with a long prompt, no counter. The 402 amount is higher. Receipt shows token usage. | Price comes from the actual request. Failed calls are never charged. | `POST /api/run` |
| 6 Receipts and rating | Receipts table with match column. Buyer rates the seller, rating cites the receipt, reputation line updates on the card. | Every settlement leaves a receipt on HCS. Only payers can rate, and the rating names the payment that proves it. | `GET /api/receipts`, `POST /api/rate` |
| 7 Hedera | Four bullets: HCS registry, audit, receipts and reputation; HTS TOLL token with custom fee; ECDSA keys sign quotes; mirror node as free verifier; Blocky402 for gasless settlement. | none | none |
| 8 Close | Repo link, tests run offline, roadmap: escrow with auditor bonds, scheduled re-audit, World ID. | none | none |

Controls: Next and Back, a step counter, a Reset button that clears the session spend and removes the demo attestation and rating so the take can be repeated, and a "replay" switch for step 2 that plays back the existing audit topic from the mirror node if the LLM is slow. The replay is still real on-chain data.

Design of the page: same tokens as the site, larger type, one card per step centred, the live component from the functional page embedded inside. No navigation bar, no filters, no settings.

## 7. Order of work

| Phase | Work | Effort |
| --- | --- | --- |
| 1 | Shared types, registry readers, buyer trust policy, setup scripts | half a day |
| 2 | Audit package and auditor seller mode, audit topic | one day |
| 3 | Reputation topic, rate command | half a day |
| 4 | Web package: tokens, components, `/` and `/buy` | one day |
| 5 | `/audit` and `/trail` | half a day |
| 6 | `/demo` page, dry run, rewrite `docs/DEMO_SCRIPT.md` to match | half a day |
| 7 | README, tests for the new packages, live run, HashScan links | half a day |

Phases 1 to 3 are backend only and can run before any UI work. Phase 6 depends on 4 and 5.

## 8. Git and licensing

Mars is a reference only. It sits in `external/` and is gitignored. Nothing is copied from it, including UI code, and no commits are merged from it. Its `lib/agora` folder is a modified copy of our packages, so code flows one way. All commits in agora402 stay under Divyesh Patel.
