# ETHOnline 2026 submission checklist

Deadline: Sunday 13 September 2026, 12:00 EDT (18:00 CEST). Live judging (if selected): Monday 14 September 2026, 12:00 EDT.

Project on ETHGlobal: Agora402, category Artificial Intelligence, emoji 🏛️. Repo linked: ddpateltp/agora402 (Primary, Monorepo).

## Already saved on the form

* Project details: name, category, emoji, demo link (repo URL for now; replace with the deployed dashboard URL if you host it), short description, description, how it's made.
* Tech stack: Ethereum dev tools None; networks Hedera; languages TypeScript, JavaScript; frameworks Express; databases None; design tools None; other: x402, Blocky402 facilitator, Hedera Consensus Service, Hedera Token Service, Hiero SDK, HCS-14, Vitest; AI tools paragraph.

## Still to do on the form (needs files only you can upload)

1. Images: logo `docs/media/logo.png` (512x512), cover `docs/media/cover.png` (1280x720), at least 3 screenshots of the real run (dashboard with the stage list, HashScan transaction, receipts table or `agora receipts` output).
2. Select prizes: track "Building from Scratch"; submission type "Top 10 Finalist & Partner Prizes"; partner: Hedera. Explanation text below.
3. Video: 2 to 4 minutes, 720p or better, your voice, screen recording (not a phone). Script in `docs/DEMO_SCRIPT.md`.
4. Future and Final pages.

## Hedera partner prize text (paste)

Agora402 targets "AI & Agentic Payments on Hedera". The x402-gated services (`POST /v1/infer`, `GET /v1/rates/hbar`) run on Hedera testnet with the exact scheme from `@x402/hedera`, settled through the Blocky402 hosted testnet facilitator (api.testnet.blocky402.com). The buyer agent completes real paid requests end to end: discovery from an HCS registry topic, a signed A2A-style quote, payment inside the HTTP request, settlement by Blocky402, verification on the mirror node, and a receipt on a second HCS topic. Extra-points items covered: pay-per-call metering (per-token pricing computed per request, not a flat fee), multi-agent negotiation (quote handshake with counter-offers and a seller floor), on-chain agent identity (HCS-14 uaid:aid for seller and buyer), a discovery directory (HCS registry plus A2A agent card), HTS token in the settlement path (TOLL with a custom fixed fee), and a verifiable audit trail on HCS (`agora receipts` recomputes every bill from the mirror node). Feedback for Hedera: the `@x402/hedera` package and Blocky402 docs made the server side quick; the friction was on the client, where HBAR is not a "default asset" so spend controls must be configured explicitly, and the transaction id in the exact scheme belongs to the facilitator's fee-payer account rather than the payer, which is worth calling out in the docs.

## Before recording

* Two testnet ECDSA accounts in `.env`, buyer funded (portal.hedera.com faucet).
* `npm run setup:topics`, `npm run setup:token` (optional), start `npm run seller`, then `npm run setup:register`.
* Run `npm run buyer -- infer "..."` once to confirm a real settlement; paste the HashScan link and topic ids into the README "Live run" section.
* Switch `LLM_PROVIDER=anthropic` for the recording if you want Claude answers in the demo.

## Rules to respect

* AI use is attributed in the README, the form and `docs/PLAN.md`. Keep making your own commits (fixes, config, README updates) so the history shows your involvement.
* Keep the repo public. Commit small and often.
