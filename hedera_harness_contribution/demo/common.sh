#!/usr/bin/env bash
# Shared helpers for the Hedera Harness demos. Source this file.
#
# The demos run against a local checkout of the harness fork
# (https://github.com/ddpateltp/hedera-harness) with `upstream` pointing at
# hedera-dev/hedera-harness. Point HARNESS_REPO at it; `npm ci` must have run
# there once. Each branch is checked out as a git worktree under
# $HH_DEMO_WORKTREES (default ~/hackathon/hh-demo-worktrees) and built there;
# node_modules is symlinked from the checkout because the dependency set is
# identical. Nothing is written inside this repository.
set -euo pipefail

REPO="${HARNESS_REPO:-$HOME/hackathon/hedera-harness}"
WT="${HH_DEMO_WORKTREES:-$HOME/hackathon/hh-demo-worktrees}"

if [ ! -d "$REPO/.git" ] && [ ! -f "$REPO/.git" ]; then
  echo "HARNESS_REPO=$REPO is not a git checkout of the hedera-harness fork." >&2
  echo "  git clone https://github.com/ddpateltp/hedera-harness \"$REPO\" && cd \"$REPO\" && git remote add upstream https://github.com/hedera-dev/hedera-harness && git fetch --all && npm ci" >&2
  exit 1
fi

branch_ref() {
  case "$1" in
    dev)      echo "upstream/dev" ;;
    x402)     echo "origin/feat/x402-smoke-gate" ;;
    cost)     echo "origin/feat/attempt-cost-budget" ;;
    fix)      echo "origin/fix/await-agent-stream-lines" ;;
    holguard) echo "origin/feat/assert-hol-guard" ;;
    waivers)  echo "origin/feat/finding-waivers" ;;
    *) echo "unknown worktree name: $1" >&2; return 1 ;;
  esac
}

# ensure_worktree <name>  -> prints the worktree path, builds it if needed
ensure_worktree() {
  local name="$1" ref dir
  ref="$(branch_ref "$name")"
  dir="$WT/$name"
  mkdir -p "$WT"
  if [ ! -d "$dir" ]; then
    git -C "$REPO" worktree add --detach "$dir" "$ref" >/dev/null
  else
    git -C "$dir" checkout -q --detach "$ref"
  fi
  [ -e "$dir/node_modules" ] || ln -s "$REPO/node_modules" "$dir/node_modules"
  # Worktrees sit at fixed refs, so build once; HH_DEMO_REBUILD=1 forces it.
  if [ ! -f "$dir/dist/index.js" ] || [ "${HH_DEMO_REBUILD:-0}" = "1" ]; then
    (cd "$dir" && npm run build --silent)
  fi
  echo "$dir"
}

# harness <name> <args...>  -> run the hedera-harness CLI built from that worktree
harness() {
  local name="$1"; shift
  node "$WT/$name/dist/index.js" "$@"
}

step() {
  printf '\n\033[1;36m==> %s\033[0m\n' "$*"
}

pause() {
  if [ "${HH_DEMO_PAUSE:-1}" = "1" ]; then
    read -r -p "   [enter to continue] " _
  fi
}
