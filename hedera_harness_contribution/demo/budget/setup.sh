#!/usr/bin/env bash
# Create the budget demo project: a mock agent that reports USD 0.60 per attempt
# and never fixes the finding, so the loop runs to its ceiling.
source "$(dirname "${BASH_SOURCE[0]}")/../common.sh"
DEMO="${HH_DEMO_BUDGET_DIR:-$HOME/hackathon/hh-demo-budget}"
rm -rf "$DEMO"; mkdir -p "$DEMO/project/.harness/validators" "$DEMO/skills"

cat > "$DEMO/project/agent.mjs" <<'AGENT'
// Mock coding agent: leaves the failing file in place and reports what it "spent",
// in the same stream-json shape Claude Code prints.
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
const ws = process.env.MOCK_WS ?? process.cwd();
mkdirSync(path.join(ws, "built"), { recursive: true });
writeFileSync(path.join(ws, "built", "FAIL.txt"), "still broken\n");
const line = value => process.stdout.write(JSON.stringify(value) + "\n");
line({ type: "system", subtype: "init", model: "mock-opus", session_id: "demo" });
line({ type: "assistant", message: { content: [{ type: "text", text: "Looking at the failing assertion..." }] } });
line({
  type: "result", subtype: "success", is_error: false, duration_ms: 1200, num_turns: 3,
  total_cost_usd: Number(process.env.MOCK_PRICE ?? "0.6"),
  usage: { input_tokens: 18000, output_tokens: 2200, cache_read_input_tokens: 9000, cache_creation_input_tokens: 0 },
});
AGENT
cat > "$DEMO/project/package.json" <<'JSON'
{ "name": "budget-demo", "version": "1.0.0", "private": true }
JSON
printf '# Remove the leftover build marker\n\nThe build must not leave built/FAIL.txt behind.\n' > "$DEMO/project/.harness/prd.md"
printf '{ "fileAssertions": { "forbidden": ["built/FAIL.txt"] } }\n' > "$DEMO/project/.harness/validators/static.json"
printf '{ "commands": [ { "name": "install", "command": "true" } ] }\n' > "$DEMO/project/.harness/validators/yarn.json"
cat > "$DEMO/project/.harness/spec.yaml" <<SPEC
schemaVersion: 3
name: budget-demo
maxAttempts: 3
budget:
  maxCostUsd: 1        # read by feat/attempt-cost-budget; upstream/dev warns "unknown key" and ignores it
generator:
  provider: command
  command: node
  args:
    - $DEMO/project/agent.mjs
  timeoutMs: 60000
baseline:
  commands:
    - name: install
      command: "true"
SPEC
printf '.harness/runs/\n' > "$DEMO/project/.gitignore"
(cd "$DEMO/project" && git init -q -b main . && git config user.email demo@local && git config user.name Demo && git add -A && git commit -q --no-gpg-sign -m "budget demo project")

# Offline hedera-skills stand-in (the same fixture the test suite uses), so a run
# does not clone GitHub on camera. Unset HH_DEMO_OFFLINE_SKILLS to use the real repo.
node --input-type=module -e "
import { writeProductSkillsRepo } from '$REPO/test/skillFixture.mjs';
await writeProductSkillsRepo(process.argv[1]);
" "$DEMO/skills"
echo "budget demo project ready at $DEMO/project"
