#!/usr/bin/env bash
# Cost budget: before (dev runs to maxAttempts, no spend visible) and after
# (feat/attempt-cost-budget shows spend per attempt and stops at budget.maxCostUsd).
source "$(dirname "${BASH_SOURCE[0]}")/../common.sh"
DEMO="${HH_DEMO_BUDGET_DIR:-$HOME/hackathon/hh-demo-budget}"
[ -d "$DEMO/project" ] || bash "$(dirname "${BASH_SOURCE[0]}")/setup.sh"
ensure_worktree dev >/dev/null
ensure_worktree cost >/dev/null

export MOCK_WS="$DEMO/project" MOCK_PRICE="0.6" HUSKY=0
if [ "${HH_DEMO_OFFLINE_SKILLS:-1}" = "1" ]; then
  export HARNESS_SKILLS_REPO="$DEMO/skills" HARNESS_SKILLS_REF=master
fi
FILTER='Attempt [0-9]+ (PASSED|FAILED)|Budget exhausted|Run (PASSED|FAILED|STOPPED)|^cost=|^attempts=|unknown key'

reset_project() {
  git -C "$DEMO/project" checkout -q main
  git -C "$DEMO/project" branch --list 'harness/*' | xargs -r git -C "$DEMO/project" branch -q -D
  rm -rf "$DEMO/project/built" "$DEMO/project/.harness/runs"
}

step "1/2  upstream/dev: three attempts, no idea what they cost."
reset_project
(cd "$DEMO/project" && harness dev run .harness/spec.yaml --new) 2>&1 | grep -E "$FILTER" || true
pause

step "2/2  feat/attempt-cost-budget: spend on every attempt line, stop when the budget is reached."
reset_project
(cd "$DEMO/project" && harness cost run .harness/spec.yaml --new) 2>&1 | grep -E "$FILTER" || true

step "report.json cost block"
REPORT="$(ls -t "$DEMO"/project/.harness/runs/*/reports/report.json | head -1)"
node -e "const r=require(process.argv[1]); console.log(JSON.stringify(r.cost, null, 2))" "$REPORT"
