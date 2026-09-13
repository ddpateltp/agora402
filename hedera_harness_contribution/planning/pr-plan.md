# PR plan and decisions

## Why these four

The two problems hit first (paywall blind spot, invisible spend) became #67
and #68. The stream race was found while reading spend off the agent stream
and is split out so it can land on its own. Issue #8 was the one open,
unclaimed proposal that fitted the maintainer's stated bar (ASSERT opt-in,
offline tests, infrastructure through the abort path) and had not been
picked up by any of the 29 competing PRs.

## Decisions recorded

- **Stack #68 on the fix.** The usage parser needs the final `result` line to
  be read before the run result is built, so the fix is a hard dependency;
  stacking is more honest than duplicating the change in two PRs.
- **`[security]` is a new finding category** (as PR #40 proposed for Slither).
  It classifies as structural, so the broad repair prompt handles it; the
  prompt gained one line saying what such a finding is.
- **ASSERT infrastructure failures carry no finding.** EVALUATE re-labels
  findings `eval-infra`; for ASSERT there is nothing for the agent to act on,
  so the result carries `infrastructureFailure` and a reason, SMOKE is
  skipped, and the loop leaves through `abortOnInfrastructureFailure`, which
  now records the stage.
- **The scanner command is a prefix.** `validators.holGuard.command` is how to
  invoke the scanner; the harness appends `scan . --format json` (and
  `--profile` when set). That keeps one place that knows the scanner's
  arguments and lets tests point the command at a node stub.
- **Fixture reports are built to the scanner's payload code, not captured.**
  Running `uvx --from hol-guard plugin-scanner` downloads from PyPI, which the
  offline test bar forbids at test time; the shape was taken from hol-guard
  3.0.1 `reporting.build_json_payload` and is documented in the fixture README.
- **Quoted harness output keeps its em dashes.** The harness prints them;
  misquoting output to satisfy a prose rule would be worse than the dash.

## Fifth PR, chosen after the first four were open

The 29 competing PRs cluster on CHAIN and mirror-node verification, doctor
operator checks, x402, telemetry and local nodes. None of them address what
happens when a gate is right and a person has still decided to live with the
finding for now: every attempt pays an agent to repair it. #79 adds waivers
with a required reason and end date, applied across ASSERT, SMOKE and
EVALUATE, never to secrets, and visible everywhere the harness reports.

## Later decisions

- **Commits carry only the author.** The six commits of #79 were made without a
  co-author trailer, and the earlier commits on #69 and #70 were rewritten the
  same way with a message filter, trees unchanged. AI assistance is disclosed
  in the project README and the submission instead.
- **No regular expression from file input.** Wiz SAST flagged the waiver
  matcher, which built a `RegExp` from a pattern read out of
  `.harness/waivers.yaml`. It became a two-cursor wildcard walk with identical
  semantics and a test against a wildcard-between-every-character pattern.
- **The harness fork shows PR branches only.** Demos, prompts and planning
  live here, in the project repository, not on the fork.

## Test counts per branch

| Branch | Suite | New |
|---|---|---|
| `feat/x402-smoke-gate` | 212 | 16 |
| `fix/await-agent-stream-lines` | 197 | 2 |
| `feat/attempt-cost-budget` (stacked) | 209 | 12 (+2 inherited) |
| `feat/assert-hol-guard` | 206 | 11 |
| `feat/finding-waivers` | 208 | 13 |
