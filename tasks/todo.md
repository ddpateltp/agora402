# Agora402 v2 build (see docs/INTEGRATION_PLAN.md)

Rules: nothing copied from external/Mars; all code written fresh; git author ddpateltp only.

## Phase 1: trust layer types and readers
- [x] shared: Attestation, AuditStage, Rating schemas; listingContentHash; trustScoreFrom(findings)
- [x] registry: TrustLedger (audit topic reader/writer, spoof and staleness checks)
- [x] registry: ReputationLedger reader (ratings with proof of use)
- [x] registry: attachTrust(listings) helper
- [x] buyer: trust in Offer, minTrust / verifiedOnly policy, rank verified first, CLI flags, discover output
- [x] buyer dashboard API: trust on /api/sellers
- [x] scripts: setup:trust creates AUDIT_TOPIC_ID and REPUTATION_TOPIC_ID
- [x] .env.example, config schemas
- [x] tests for all of the above, typecheck green

## Phase 2: audit package and auditor seller mode
- [x] packages/audit: 4-stage pipeline over a listing (LLM provider agnostic, deterministic fallback)
- [x] HCS writer: one message per stage, attestation at the end
- [x] seller: AUDITOR mode, POST /v1/audit behind x402, flat price
- [x] CLI: agora audit <uaid|url>
- [x] tests

## Phase 3: reputation
- [x] buyer: rate command and API, cites receipt tx
- [x] reputation summary on listings
- [x] tests

## Phase 4: web package (Vue 3 + Vite): tokens, components, / and /buy
- [x] packages/web scaffold, tokens, components, Marketplace, Buy (live buy verified on testnet)
- [x] served by the dashboard from packages/web/dist
## Phase 5: /audit and /trail
- [x] pages built
- [x] verified live against an auditor process (audit a_ac27440fb360c58e on topic 0.0.10520539)
## Phase 6: /demo page, dry run, rewrite docs/DEMO_SCRIPT.md
- [x] demo page with 9 steps, replay switch, reset, keyboard
- [x] DEMO_SCRIPT.md rewritten
## Phase 7: README, live run, HashScan links
- [x] README rewritten, CI builds the site, vue-tsc in typecheck
- [x] live run: buy, audit, rating on testnet

## Review
All seven phases done on 13 September 2026. 47 tests, typecheck green, live run verified. Not committed: the user commits.
