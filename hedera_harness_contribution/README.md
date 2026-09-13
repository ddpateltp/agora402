# Contributions to the Hedera Harness

Agora402 was generated and validated with the [Hedera Harness](https://github.com/hedera-dev/hedera-harness), the coding-agent loop Hedera ships for building dapps: GENERATE, then ASSERT, SMOKE, EVALUATE and CHAIN, repaired until the gates are green. Building an x402 marketplace with it showed two blind spots in the first hours, and fixing them, plus what fell out of the work, became five open PRs against `hedera-dev/hedera-harness` `dev`. Every one of them ships tests that run fully offline.

| PR | What it adds | Why it mattered for Agora402 |
| --- | --- | --- |
| [#67](https://github.com/hedera-dev/hedera-harness/pull/67) SMOKE x402 gate | `validators.x402` probes each paywalled route: 402 with a payable Hedera `PAYMENT-REQUIRED`, every `accepts[]` entry checked against the Hedera `exact` scheme, forged `PAYMENT-SIGNATURE` rejected, and with CHAIN a real paid request settled on the mirror node | The seller's `/v1/infer` and `/v1/rates/hbar` are x402 routes; a broken paywall now fails SMOKE in under a second with the rule named |
| [#68](https://github.com/hedera-dev/hedera-harness/pull/68) agent spend and `budget.maxCostUsd` | Spend on every attempt line, in `report.json` and the outro, read from what the agent CLI reports; the loop stops when the budget is reached | The budget discipline the buyer agent applies to sellers, applied to the coding agent that builds it |
| [#69](https://github.com/hedera-dev/hedera-harness/pull/69) stream close race | The last line an agent prints is parsed before the process is reported closed | Found while reading spend off the agent stream; a `void` let the final `result` event be lost |
| [#70](https://github.com/hedera-dev/hedera-harness/pull/70) HOL Guard in ASSERT | Opt-in `validators.holGuard` runs HOL Guard's plugin-scanner and turns plugin-safety findings into repairable ASSERT findings; a missing scanner is an infrastructure abort, never an app finding. Implements upstream issue #8 | Agents that publish skills and MCP entries into a marketplace should be scanned before they are listed |
| [#79](https://github.com/hedera-dev/hedera-harness/pull/79) accepted-finding waivers | `waivers:` records a finding a person has accepted, with a reason and an end date; it is reported as waived, fails nothing, never reaches the agent, and secret findings can never be waived | Stopped paid repair attempts on findings we had already decided to live with during the build |

| Branch | Tests in suite | New |
| --- | --- | --- |
| `feat/x402-smoke-gate` | 212 | 16 |
| `fix/await-agent-stream-lines` | 197 | 2 |
| `feat/attempt-cost-budget` (stacked on #69) | 209 | 12 |
| `feat/assert-hol-guard` | 206 | 11 |
| `feat/finding-waivers` | 208 | 13 |

## What is here

| Path | What |
| --- | --- |
| `demo/` | Reproducible before-and-after demos, one directory per PR. Each runs the harness CLI from `upstream/dev` and from the PR branch against the same project. |
| `planning/` | The timeline and the plan the PRs were built against, including the decisions taken along the way. |

## Running the demos

The demos need a local checkout of the harness fork with the upstream remote and one `npm ci`:

```bash
git clone https://github.com/ddpateltp/hedera-harness ~/hackathon/hedera-harness
cd ~/hackathon/hedera-harness
git remote add upstream https://github.com/hedera-dev/hedera-harness
git fetch --all
npm ci
```

Then, from this repository:

```bash
export HARNESS_REPO=~/hackathon/hedera-harness
bash hedera_harness_contribution/demo/x402/run.sh        # #67: broken paywall passes on dev, fails with the rule on the branch, correct server passes
bash hedera_harness_contribution/demo/budget/run.sh      # #68: three attempts with no cost on dev; spend per attempt and Run STOPPED (budget) on the branch
bash hedera_harness_contribution/demo/race/run.sh        # #69: the new test fails on dev, passes on the branch
bash hedera_harness_contribution/demo/holguard/run.sh    # #70: findings become [security] findings; a missing scanner aborts as infrastructure
bash hedera_harness_contribution/demo/waivers/run.sh     # #79: the same forbidden file, open, then waived with a reason, then enforced again when the waiver expires
```

Each branch is checked out once as a git worktree under `~/hackathon/hh-demo-worktrees` and built there; the demo projects are written under `~/hackathon/hh-demo-*`. Nothing is written inside this repository. `HH_DEMO_PAUSE=0` runs a script without waiting for Enter between steps; `HH_DEMO_WORKTREES`, `HH_DEMO_BUDGET_DIR`, `HH_DEMO_HOLGUARD_DIR` and `HH_DEMO_WAIVERS_DIR` move the scratch directories. The x402 demo needs a browser for the Playwright gate (system Chrome is enough).

The x402 gate's paid probe performs the same partially signed `TransferTransaction` the Agora402 buyer agent does, so a green gate is the "real paid request end to end" produced by the harness rather than read off a transcript.
