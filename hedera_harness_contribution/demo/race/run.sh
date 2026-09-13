#!/usr/bin/env bash
# Stream race: the new test fails on upstream/dev and passes on fix/await-agent-stream-lines.
source "$(dirname "${BASH_SOURCE[0]}")/../common.sh"
DEV="$(ensure_worktree dev)"
FIX="$(ensure_worktree fix)"
FILTER='^(✔|✖|ℹ (tests|pass|fail))|AssertionError|actual:|expected:'

step "1/2  upstream/dev with the new test copied in: the last stream line is lost to the close race."
cp "$FIX/test/agent-stream-close.test.mjs" "$DEV/test/"
(cd "$DEV" && node --test test/agent-stream-close.test.mjs 2>&1 | grep -vE '^\[hedera-harness' | grep -E "$FILTER") || true
rm -f "$DEV/test/agent-stream-close.test.mjs"
pause

step "2/2  fix/await-agent-stream-lines: chunks are chained, close waits for them."
(cd "$FIX" && node --test test/agent-stream-close.test.mjs 2>&1 | grep -vE '^\[hedera-harness' | grep -E "$FILTER") || true
