#!/usr/bin/env bash
# x402 SMOKE gate: before (dev) and after (feat/x402-smoke-gate), same project.
source "$(dirname "${BASH_SOURCE[0]}")/../common.sh"
PROJECT="$(cd "$(dirname "${BASH_SOURCE[0]}")/project" && pwd)"
SPEC="$PROJECT/.harness/spec.yaml"
ensure_worktree dev >/dev/null
ensure_worktree x402 >/dev/null

step "1/3  upstream/dev + broken server: /api/quote answers 200 to everyone. SMOKE passes."
X402_DEMO_MODE=broken harness dev validate "$SPEC" --workspace "$PROJECT" | grep -E "Validation finished|passed=|playwrightGate=|^- " || true
pause

step "2/3  feat/x402-smoke-gate + the same broken server: the gate names the rule."
START=$(node -e 'console.log(Date.now())')
X402_DEMO_MODE=broken harness x402 validate "$SPEC" --workspace "$PROJECT" | grep -E "Running x402|Validation finished|passed=|playwrightGate=|^- " || true
echo "   (dev server boot + SMOKE + x402 gate: $(( $(node -e 'console.log(Date.now())') - START )) ms end to end)"
pause

step "3/3  feat/x402-smoke-gate + correct server: 402 with a payable PAYMENT-REQUIRED, forged signature rejected."
X402_DEMO_MODE=correct harness x402 validate "$SPEC" --workspace "$PROJECT" | grep -E "Running x402|Validation finished|passed=|playwrightGate=|^- " || true
