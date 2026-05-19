#!/usr/bin/env bash
set -euo pipefail

echo "== runai smoke test =="

echo "[1/4] recommend"
pnpm run recommend -- --top 3 >/dev/null

echo "[2/4] browse"
pnpm run browse -- qwen --limit 5 >/dev/null

echo "[3/4] openai payload contract via tests"
pnpm exec vitest run tests/openai-contract.test.ts >/dev/null

echo "[4/4] recommendation tests"
pnpm exec vitest run tests/recommend.test.ts >/dev/null

echo "Smoke test passed."
