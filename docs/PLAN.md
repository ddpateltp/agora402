# Agora402 plan (ETHOnline 2026)

Written 10 September 2026 at the start of the build. Kept as the planning artefact the ETHGlobal rules ask for when AI tools are used.

## Target

Hedera prize "AI & Agentic Payments on Hedera". Hard requirements:

1. Live x402-gated service on Hedera testnet settled through the Blocky402 facilitator.
2. A platform or agent that consumes it and completes at least one real paid request end to end.
3. Public repo with README covering setup, architecture, payment flow.
4. Demo video (ETHGlobal: 2 to 4 minutes, 720p, real voice).

Extra points listed by Hedera: metered pricing rather than flat, multi-agent negotiation (A2A/ACP), on-chain agent identity (HCS-14 / ERC-8004), discovery directory, HTS tokens or custom fees in settlement, HCS audit trail, scheduled or recurring payments.

## Concept

An agent-to-agent services marketplace. Sellers register x402-gated services on an HCS topic with an HCS-14 identity. Buyer agents discover them from the mirror node, negotiate a signed quote, pay per request in HBAR or an HTS token, and the seller writes a receipt for every settlement to a second HCS topic.

Decisions and why:

* Two small services instead of one: LLM inference (metered per token) and a live HBAR/USD data feed (per query). Enough to show the marketplace ranks by price and that metering is real.
* Quote negotiation as a plain HTTP handshake (`POST /a2a/quote`) with a signed quote rather than a full A2A runtime. Judges can read it in one file.
* Registry on HCS with the rule "listing valid only if paid for by its payTo account". No registry operator, no contract.
* Receipts on HCS with usage and response hash so a buyer can prove what it paid for and what it got.
* Per-request price computed by the seller's `DynamicPrice` from the request body, so the 402 amount reflects the work. Quotes pin that price for a TTL.
* Groq for development inference, provider abstraction so Anthropic can be switched in for the final demo, mock provider for tests.
* Tests run the real `@x402/*` client and server paths with a fake facilitator, so the payment flow is exercised offline.

Not doing (time): ERC-8004 registration, UCP, Scheduled Transactions for streaming payments (listed as future work), Vue dashboard (plain HTML dashboard if time allows).

## Build order

1. Scaffold, shared types, identity, pricing.
2. Registry package (HCS write, mirror read, receipts, signing).
3. Seller with x402 middleware, dynamic pricing, quotes, receipts hook.
4. Buyer agent with budgets, negotiation, on-chain verification, CLI.
5. Setup scripts: topics, TOLL token, register.
6. Live testnet run, README with HashScan links, dashboard, video.

## Prior art checked

Hedera x402 bounty winners (August 2026): Pinout (metered sessions), Tally (upto scheme), Xorv (subscription quota marketplace), Qisma (atomic multi-party split), Mystic (VPN). Agora402 differs by combining discovery, negotiation and audit into one marketplace loop rather than a single payment primitive.
