#!/usr/bin/env bash
# Accepted findings (#79): the same forbidden file, first as an open finding on
# every attempt, then waived with a reason and an end date.
source "$(dirname "${BASH_SOURCE[0]}")/../common.sh"
WV="$(ensure_worktree waivers)"
DEMO="${HH_DEMO_WAIVERS_DIR:-$HOME/hackathon/hh-demo-waivers}"

rm -rf "$DEMO"; mkdir -p "$DEMO/.harness/validators" "$DEMO/built"
printf '{ "name": "waivers-demo", "version": "1.0.0", "private": true }\n' > "$DEMO/package.json"
printf '# Remove the leftover build marker\n' > "$DEMO/.harness/prd.md"
printf '{ "fileAssertions": { "forbidden": ["built/FAIL.txt"] } }\n' > "$DEMO/.harness/validators/static.json"
printf '{ "commands": [ { "name": "install", "command": "true" } ] }\n' > "$DEMO/.harness/validators/yarn.json"
printf 'left behind by the deploy step\n' > "$DEMO/built/FAIL.txt"
cat > "$DEMO/.harness/spec.yaml" <<'SPEC'
schemaVersion: 3
name: waivers-demo
generator:
  provider: command
  command: node
baseline:
  commands:
    - name: install
      command: "true"
SPEC
(cd "$DEMO" && git init -q -b main . && git add -A && git -c user.email=d@l -c user.name=Demo commit -q --no-gpg-sign -m demo)

step "1/3  validate: the forbidden file is an open finding."
harness waivers validate "$DEMO/.harness/spec.yaml" --workspace "$DEMO" | grep -E "Validation finished|passed=|findings=|^- |^~ " || true
pause

step "2/3  a person accepts it: three lines in .harness/waivers.yaml, one key in the recipe."
cat > "$DEMO/.harness/waivers.yaml" <<'WAIVERS'
waivers:
  - finding: static-forbidden:built/FAIL.txt
    reason: The build marker is removed by the deploy step, not by the app.
    expires: 2026-12-31
    by: divyesh
WAIVERS
printf 'waivers: .harness/waivers.yaml\n' >> "$DEMO/.harness/spec.yaml"
cat "$DEMO/.harness/waivers.yaml"
harness waivers validate "$DEMO/.harness/spec.yaml" --workspace "$DEMO" | grep -E "Validation finished|passed=|findings=|waived=|^- |^~ " || true
pause

step "3/3  the waiver expires: the finding is enforced again, and doctor warned first."
sed -i '' 's/expires: 2026-12-31/expires: 2026-01-01/' "$DEMO/.harness/waivers.yaml"
harness waivers doctor "$DEMO/.harness/spec.yaml" --workspace "$DEMO" | grep -E "accepted findings|waivers" || true
harness waivers validate "$DEMO/.harness/spec.yaml" --workspace "$DEMO" | grep -E "Validation finished|passed=|^- |^~ " || true
