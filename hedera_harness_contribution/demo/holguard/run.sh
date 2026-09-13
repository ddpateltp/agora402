#!/usr/bin/env bash
# HOL Guard in ASSERT (issue #8): findings become [security] findings; a missing
# scanner is an infrastructure abort, not an app finding. Fully offline: the
# scanner is the test stub that prints a captured report.
source "$(dirname "${BASH_SOURCE[0]}")/../common.sh"
HG="$(ensure_worktree holguard)"
DEMO="${HH_DEMO_HOLGUARD_DIR:-$HOME/hackathon/hh-demo-holguard}"
STUB="$HG/test/fixtures/hol-guard/scanner.mjs"

make_project() {
  local command="$1"
  rm -rf "$DEMO"; mkdir -p "$DEMO/.harness/validators"
  printf '{ "name": "plugin-demo", "version": "1.0.0", "private": true }\n' > "$DEMO/package.json"
  printf '# Ship the marketplace agent as a Claude Code plugin\n' > "$DEMO/.harness/prd.md"
  printf '{}\n' > "$DEMO/.harness/validators/static.json"
  printf '{ "commands": [ { "name": "install", "command": "true" } ] }\n' > "$DEMO/.harness/validators/yarn.json"
  cat > "$DEMO/.harness/spec.yaml" <<SPEC
schemaVersion: 3
name: plugin-demo
generator:
  provider: command
  command: node
baseline:
  commands:
    - name: install
      command: "true"
validators:
  holGuard:
    enabled: true
    failOnSeverity: high
    command: "$command"
SPEC
  (cd "$DEMO" && git init -q -b main . && git add -A && git -c user.email=d@l -c user.name=Demo commit -q --no-gpg-sign -m demo)
}

step "1/3  validate with the scanner reporting two high findings: ASSERT fails with named rules."
make_project "node $STUB findings.json"
harness holguard validate "$DEMO/.harness/spec.yaml" --workspace "$DEMO" | grep -E "HOL Guard|Validation finished|passed=|holGuard=|^- " || true
pause

step "2/3  the same project scanned clean: ASSERT passes and keeps the scanner's grade."
make_project "node $STUB clean.json"
harness holguard validate "$DEMO/.harness/spec.yaml" --workspace "$DEMO" | grep -E "Validation finished|passed=|holGuard=" || true
pause

step "3/3  scanner not installed: doctor says so, validate aborts as infrastructure, no finding for the agent."
make_project "uvx-not-installed-here --from hol-guard plugin-scanner"
harness holguard doctor "$DEMO/.harness/spec.yaml" --workspace "$DEMO" | grep -E "HOL Guard|check\(s\) failed|Ready" || true
harness holguard validate "$DEMO/.harness/spec.yaml" --workspace "$DEMO" | grep -E "Validation finished|passed=|infrastructure=" || true
