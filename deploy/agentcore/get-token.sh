#!/usr/bin/env bash
# Print a fresh Cognito access token for the gateway (client_credentials, 60 min).
# Reads ~/.config/agentcore-handson/cognito.env (mode 600, outside the repo).
#   get-token.sh            -> the raw token
#   get-token.sh --headers  -> {"Authorization": "Bearer …"} (for MCP clients that run a headers helper)
set -euo pipefail
ENV_FILE="${AGENTCORE_HANDSON_ENV:-$HOME/.config/agentcore-handson/cognito.env}"
set -a; . "$ENV_FILE"; set +a
REGION="${COGNITO_REGION:-us-east-2}"
TOKEN=$(curl -sf -X POST "https://$COGNITO_DOMAIN.auth.$REGION.amazoncognito.com/oauth2/token" \
  -u "$COGNITO_CLIENT_ID:$COGNITO_CLIENT_SECRET" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d "grant_type=client_credentials&scope=$COGNITO_SCOPE" |
  python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')
if [ "${1:-}" = "--headers" ]; then printf '{"Authorization": "Bearer %s"}\n' "$TOKEN"; else printf '%s\n' "$TOKEN"; fi
