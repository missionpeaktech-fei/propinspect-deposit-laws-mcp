#!/usr/bin/env bash
# Bundle the Claude judge Lambda (option C): Anthropic SDK + zod inside, @aws-sdk from the Lambda runtime.
# Uses the server repo's esbuild (devDependency there) rather than adding one here.
set -euo pipefail
cd "$(dirname "$0")/.."
out=dist/claude-judge
rm -rf "$out" && mkdir -p "$out"
../node_modules/.bin/esbuild evaluators/claude-judge/index.mjs --bundle --platform=node --target=node22 --format=esm \
  --external:@aws-sdk/* --outfile="$out/index.mjs" --log-level=warning
(cd "$out" && zip -q -X ../claude-judge.zip index.mjs)
ls -l dist/claude-judge.zip | awk '{print $5, $NF}'
