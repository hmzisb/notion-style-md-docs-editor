#!/usr/bin/env bash
# Runs the standing checks and fails loudly. Use instead of piping pnpm output to tail.
set -uo pipefail
fail=0
for step in "pnpm typecheck" "pnpm lint" "pnpm test"; do
  if out=$($step 2>&1); then
    echo "PASS  $step"
  else
    echo "FAIL  $step"; echo "$out" | tail -30; fail=1
  fi
done
exit $fail
