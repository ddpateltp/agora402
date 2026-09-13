# Timeline

All times CEST. Submission deadline: Sunday 13 September 2026, 18:00 CEST (12:00 EDT).

| When | What |
|---|---|
| 10 to 12 September | Build Agora402 with the Hedera Harness. Two gaps show up in the first hours: a paywall that answers 200 to everyone passes SMOKE, and the repair loop never says what its attempts cost. Draft #67 (x402 SMOKE gate) and #68 (agent spend and budget). |
| 12 September, evening | Both branches confirmed current with `upstream/dev`; 212 and 207 tests green. PR descriptions rewritten with the offline-tests statement and related-PR notes. |
| 12 September, evening | The stream close race is split out of #68 into its own branch with a reproducing test (fails on `dev`, passes on the branch); #68 is rebased on top of it. |
| 12 September, night | Issue #8 implemented as `validators.holGuard` on `feat/assert-hol-guard`: 5 commits, 11 offline tests against a stubbed scanner. |
| 12 September, night | Before-and-after runs written and rehearsed for every PR. |
| 13 September, morning | #69 (stream fix) and #70 (HOL Guard, closes #8) opened against `dev`; #68 force-pushed as a stack on #69; #67 body and title updated. |
| 13 September, afternoon | Survey of the 29 competing PRs; #79 (accepted-finding waivers) designed, built with 13 offline tests and opened. |
| 13 September, afternoon | Commits on #69 and #70 rewritten to carry only the author, trees unchanged; #68 re-stacked. |
| 13 September, afternoon | Wiz SAST reports two medium findings on #79. Cause: a `RegExp` built from file input. Replaced with a wildcard walk; rescan clean. |
| 13 September, afternoon | Working documents removed from the public harness fork; the demos and the planning record moved to this folder. |
| by 17:30 | ETHGlobal form submitted with Hedera selected as the partner prize. |
