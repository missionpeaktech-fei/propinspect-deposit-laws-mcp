#!/usr/bin/env bash
# Package the HTTP server for AgentCore Runtime direct code deployment (ADR 0007).
# Output: dist/agentcore.zip with
#   build/http/index.js   esbuild bundle of src/http.ts (ESM, Node 22, all deps inlined)
#   data/                 the snapshot; load.ts finds it at ../../data from the bundle
#   package.json          only "type": "module" and the Node engine
set -euo pipefail
cd "$(dirname "$0")/.."
stage=dist/agentcore
rm -rf "$stage" dist/agentcore.zip
mkdir -p "$stage/build/http" "$stage/data"

npx esbuild src/http.ts --bundle --platform=node --target=node22 --format=esm \
  --outfile="$stage/build/http/index.js" --log-level=warning \
  --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"

cp data/deposit-laws.json data/LICENSE.md "$stage/data/"
printf '{\n  "type": "module",\n  "engines": { "node": ">=20" }\n}\n' > "$stage/package.json"

# AgentCore needs 644 files and 755 directories.
find "$stage" -type d -exec chmod 755 {} + && find "$stage" -type f -exec chmod 644 {} +
(cd "$stage" && zip -qrX ../agentcore.zip .)
ls -l dist/agentcore.zip
