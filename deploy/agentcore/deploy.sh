#!/usr/bin/env bash
# Create or update the deposit-law MCP server on AgentCore Runtime (ADR 0007).
# Usage:  AWS_PROFILE=agentcore AWS_REGION=us-east-2 deploy/agentcore/deploy.sh
# Idempotent: creates the bucket and role if missing, always rebuilds and uploads
# the zip, then creates the Runtime or updates it to the new code.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${AWS_REGION:?set AWS_REGION (the project region)}"

NAME=deposit_laws_mcp
ROLE=agentcore-deposit-laws-mcp-runtime
TAG=project=agentcore-handson
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET=bedrock-agentcore-code-$ACCOUNT-$AWS_REGION
KEY=deposit-laws-mcp/agentcore.zip
HERE=deploy/agentcore
render() { sed -e "s/{{ACCOUNT}}/$ACCOUNT/g" -e "s/{{REGION}}/$AWS_REGION/g" -e "s/{{NAME}}/$NAME/g" "$HERE/$1"; }

echo "== code bucket $BUCKET"
if ! aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  if [ "$AWS_REGION" = us-east-1 ]; then aws s3api create-bucket --bucket "$BUCKET" >/dev/null
  else aws s3api create-bucket --bucket "$BUCKET" --create-bucket-configuration LocationConstraint="$AWS_REGION" >/dev/null; fi
  aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
  aws s3api put-bucket-tagging --bucket "$BUCKET" --tagging "TagSet=[{Key=project,Value=agentcore-handson}]"
fi

echo "== execution role $ROLE"
if ! aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE" --assume-role-policy-document "$(render trust-policy.json)" --tags Key=project,Value=agentcore-handson >/dev/null
fi
aws iam put-role-policy --role-name "$ROLE" --policy-name runtime-execution --policy-document "$(render runtime-permissions.json)"

echo "== build and upload"
scripts/build-agentcore.sh
aws s3api put-object --bucket "$BUCKET" --key "$KEY" --body dist/agentcore.zip --expected-bucket-owner "$ACCOUNT" >/dev/null

ARTIFACT="{\"codeConfiguration\":{\"code\":{\"s3\":{\"bucket\":\"$BUCKET\",\"prefix\":\"$KEY\"}},\"runtime\":\"NODE_22\",\"entryPoint\":[\"build/http/index.js\"]}}"
COMMON=(--agent-runtime-artifact "$ARTIFACT"
  --role-arn "arn:aws:iam::$ACCOUNT:role/$ROLE"
  --network-configuration '{"networkMode":"PUBLIC"}'
  --protocol-configuration '{"serverProtocol":"MCP"}'
  --environment-variables HOST=0.0.0.0,PORT=8000
  --lifecycle-configuration idleRuntimeSessionTimeout=300,maxLifetime=3600)
# No --authorizer-configuration: callers must sign with SigV4 (IAM). People sign in at the Gateway.

ID=$(aws bedrock-agentcore-control list-agent-runtimes --query "agentRuntimes[?agentRuntimeName=='$NAME'].agentRuntimeId" --output text)
if [ -z "$ID" ] || [ "$ID" = None ]; then
  echo "== create Runtime $NAME"
  ID=$(aws bedrock-agentcore-control create-agent-runtime --agent-runtime-name "$NAME" "${COMMON[@]}" --tags "$TAG" --query agentRuntimeId --output text)
else
  echo "== update Runtime $ID"
  aws bedrock-agentcore-control update-agent-runtime --agent-runtime-id "$ID" "${COMMON[@]}" >/dev/null
fi

for _ in $(seq 1 30); do
  STATUS=$(aws bedrock-agentcore-control get-agent-runtime --agent-runtime-id "$ID" --query status --output text)
  case "$STATUS" in READY) break ;; *FAILED) aws bedrock-agentcore-control get-agent-runtime --agent-runtime-id "$ID" --query failureReason --output text; exit 1 ;; esac
  sleep 10
done
aws bedrock-agentcore-control get-agent-runtime --agent-runtime-id "$ID" --query '{id:agentRuntimeId,version:agentRuntimeVersion,status:status,arn:agentRuntimeArn}' --output table
