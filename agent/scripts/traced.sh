#!/usr/bin/env bash
# Run an agent script with OpenTelemetry traces sent to CloudWatch (Transaction Search).
#   scripts/traced.sh src/ask.ts "What's the deposit return deadline in Washington?"
# ADOT signs the OTLP requests with SigV4, using short-lived credentials from the
# `agentcore` profile (aws login), exported into this process only.
set -euo pipefail
cd "$(dirname "$0")/.."
REGION="${AWS_REGION:-us-east-2}"
eval "$(aws configure export-credentials --profile "${AWS_PROFILE:-agentcore}" --format env)"
export AWS_REGION="$REGION" AWS_DEFAULT_REGION="$REGION"
export OTEL_SERVICE_NAME=deposit-laws-agent
export OTEL_RESOURCE_ATTRIBUTES="deployment.environment=local-hands-on"
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
export OTEL_TRACES_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT="https://xray.$REGION.amazonaws.com/v1/traces"
export OTEL_TRACES_SAMPLER=always_on
export OTEL_LOGS_EXPORTER=none OTEL_METRICS_EXPORTER=none OTEL_AWS_APPLICATION_SIGNALS_ENABLED=false
# Only outbound HTTP spans (Cognito, the gateway, the Anthropic API); no database or other auto-instrumentation.
export OTEL_NODE_ENABLED_INSTRUMENTATIONS=http,undici
exec node --require @aws/aws-distro-opentelemetry-node-autoinstrumentation/register --import tsx "$@"
