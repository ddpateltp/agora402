# Agora402

An agent-to-agent services marketplace on Hedera. AI agents discover services in an on-chain registry, negotiate a price, pay per request over the x402 protocol (settled through the Blocky402 facilitator on Hedera testnet), and every settlement leaves a verifiable receipt on the Hedera Consensus Service.

Built for ETHOnline 2026, Hedera track "AI & Agentic Payments on Hedera".

## What it does

1. Sellers run x402-gated HTTP services (LLM inference metered per token, a live data feed priced per query) and publish a listing to an HCS registry topic together with an agent identity.
2. Buyer agents read the registry from the mirror node, ask sellers for a quote (a small A2A-style handshake), pick the best offer within their budget, and pay in HBAR or an HTS token inside the HTTP request. No API keys, no subscriptions.
3. Blocky402 verifies and settles the partially signed Hedera transfer. The seller writes a receipt (transaction id, payer, amount, resource, usage) to an HCS audit topic. Anyone can recompute the bill from public mirror node data.

## Status

Work in progress. See the roadmap at the bottom.

## Repository layout

```
packages/shared     types, schemas, pricing and receipt helpers
packages/registry   HCS registry and receipts (publish + read via mirror node)
packages/seller     x402-gated services (Express + @x402/express + Blocky402)
packages/buyer      buyer agent: discover, negotiate, budget, pay, verify
scripts             one-off setup: create topics, create HTS token, register service
```

## Roadmap

- [x] Project scaffold
- [ ] Seller: metered inference and data-feed endpoints behind x402 (Blocky402, hedera:testnet)
- [ ] Buyer: complete a real paid request end to end
- [ ] HCS registry and discovery
- [ ] Quote negotiation (A2A-style)
- [ ] HCS receipts and audit CLI
- [ ] HTS settlement token
- [ ] Dashboard and demo video

## Licence

MIT
