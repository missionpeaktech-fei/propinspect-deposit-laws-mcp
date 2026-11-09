# AgentCore deployment (hands-on, ADR 0007)

Reusable pieces for hosting an MCP server on Amazon Bedrock AgentCore Runtime. Placeholders in `{{…}}` are filled in by `deploy.sh` (account, region, runtime name) or by you (email).

| File | What it is | Why it's shaped this way |
|---|---|---|
| `deploy.sh` | Creates or updates bucket, role and Runtime; rebuilds and uploads the code | Idempotent, so one command both deploys and redeploys |
| `trust-policy.json` | Who may assume the Runtime's role | Only AgentCore, only in this account and region (`aws:SourceAccount` + `aws:SourceArn`), against confused-deputy attacks |
| `runtime-permissions.json` | What the running server may do | Logs, traces, metrics only. AWS's sample role also allows Bedrock model calls; this server makes none, so they're left out (least privilege) |
| `budget.json`, `budget-notifications.json` | $20/month budget, email at 80% actual and 100% forecast | Create before any other resource. A budget warns; a spend limit (AWS Settings, new AWS experience) is the hard stop |

| `gateway-trust-policy.json` | Who may assume the Gateway's role | Only AgentCore, only this one gateway (`aws:SourceArn` = the gateway ARN, tightened after the gateway exists) |
| `gateway-permissions.json` | What the Gateway may do | Invoke this one Runtime, nothing else |
| `runtime-resource-policy.json` | Who may invoke the Runtime | Only the Gateway's role; an explicit Deny for every other principal, admins included, so nothing bypasses the gateway's sign-in and policy |

```bash
# One-time: the budget (replace the email)
sed 's/{{EMAIL}}/you@example.com/' deploy/agentcore/budget-notifications.json > /tmp/notify.json
aws budgets create-budget --region us-east-1 --account-id "$(aws sts get-caller-identity --query Account --output text)" \
  --budget file://deploy/agentcore/budget.json --notifications-with-subscribers file:///tmp/notify.json \
  --resource-tags Key=project,Value=agentcore-handson

# Deploy or redeploy
AWS_PROFILE=agentcore AWS_REGION=us-east-2 deploy/agentcore/deploy.sh
```

Inbound auth is IAM (SigV4) on purpose: people sign in at the AgentCore Gateway, which calls the Runtime with its own IAM role. Teardown: `../../TEARDOWN.md`. Notes and checks per step: `../../LEARNING-LOG.md`.

## Gateway (step 4), one-time commands

```bash
# Cognito for machine-to-machine tokens: pool, domain, scope, client with secret (client_credentials)
aws cognito-idp create-user-pool --pool-name agentcore-handson-gateway --user-pool-tags project=agentcore-handson
aws cognito-idp create-user-pool-domain --user-pool-id $POOL --domain agentcore-handson-<random>
aws cognito-idp create-resource-server --user-pool-id $POOL --identifier deposit-laws --name "Deposit-law MCP gateway" --scopes ScopeName=invoke,ScopeDescription=...
aws cognito-idp create-user-pool-client --user-pool-id $POOL --client-name handson-m2m --generate-secret \
  --allowed-o-auth-flows client_credentials --allowed-o-auth-scopes deposit-laws/invoke --allowed-o-auth-flows-user-pool-client
# Keep the client secret in a 600-permission file outside the repo; never print it.

# Gateway: MCP protocol, JWT sign-in that accepts only this client and scope
aws bedrock-agentcore-control create-gateway --name deposit-laws-gateway --role-arn <gateway role> --protocol-type MCP \
  --authorizer-type CUSTOM_JWT --authorizer-configuration '{"customJWTAuthorizer":{"discoveryUrl":"https://cognito-idp.<region>.amazonaws.com/<pool>/.well-known/openid-configuration","allowedClients":["<client id>"],"allowedScopes":["deposit-laws/invoke"]}}' \
  --tags project=agentcore-handson

# Target: the Runtime as an MCP server, called with the gateway's IAM role (SigV4, service bedrock-agentcore)
aws bedrock-agentcore-control create-gateway-target --gateway-identifier <gateway id> --name deposit-laws \
  --target-configuration '{"mcp":{"mcpServer":{"endpoint":"https://bedrock-agentcore.<region>.amazonaws.com/runtimes/<URL-encoded runtime ARN>/invocations?qualifier=DEFAULT"}}}' \
  --credential-provider-configurations '[{"credentialProviderType":"GATEWAY_IAM_ROLE","credentialProvider":{"iamCredentialProvider":{"service":"bedrock-agentcore"}}}]'

# Lock the Runtime to the gateway
aws bedrock-agentcore-control put-resource-policy --resource-arn <runtime ARN> --policy file://runtime-resource-policy.json  # placeholders filled
```

## Policy (step 8)

| File | What it is |
|---|---|
| `gateway-policy-permissions.json` | What the gateway's role needs to use a policy engine: `GetPolicyEngine`, plus `AuthorizeAction` and `PartiallyAuthorizeActions` on both the engine and the gateway. Without them every call is denied. |
| `policies/permit-lookup-tools.cedar` | Our client (`client_id` tag on `AgentCore::OAuthUser`) may call `get_deposit_rules` and `list_covered_states` |
| `policies/forbid-compare-states.cedar` | The same client may not call `compare_states`. Created with `--validation-mode IGNORE_ALL_FINDINGS`: the analyzer flags it "Overly Restrictive" because default-deny already blocks the tool; it's kept as defense in depth. |

```bash
aws bedrock-agentcore-control create-policy-engine --name deposit_laws_policy --tags project=agentcore-handson
aws bedrock-agentcore-control create-policy --policy-engine-id <engine id> --name permit_lookup_tools \
  --definition '{"cedar":{"statement":"<statement with {{GATEWAY_ARN}} and {{CLIENT_ID}} filled in>"}}'
# Attach: update-gateway replaces the whole configuration, so send the current one plus
#   "policyEngineConfiguration": {"arn": "<engine ARN>", "mode": "LOG_ONLY"}   (then "ENFORCE")
aws bedrock-agentcore-control update-gateway --cli-input-json file://gateway-update.json
```

## Evaluations (step 9)

Built-in evaluators need nothing created. The code-based evaluator is a Lambda (`agent/evaluators/deterministic/index.mjs`) registered with AgentCore:

```bash
# Role: Lambda may only write its own log group (fill {{ACCOUNT}}, {{REGION}}, {{FUNCTION}})
aws iam create-role --role-name agentcore-handson-eval-lambda --assume-role-policy-document file://eval-lambda-trust-policy.json --tags Key=project,Value=agentcore-handson
aws iam put-role-policy --role-name agentcore-handson-eval-lambda --policy-name write-own-logs --policy-document file://eval-lambda-permissions.json
aws logs create-log-group --log-group-name /aws/lambda/handson-deposit-eval-checks --tags project=agentcore-handson
aws logs put-retention-policy --log-group-name /aws/lambda/handson-deposit-eval-checks --retention-in-days 7
# Function (wait ~15 s after creating the role), then register it
(cd ../../agent/evaluators/deterministic && zip -q -X /tmp/det.zip index.mjs)
aws lambda create-function --function-name handson-deposit-eval-checks --runtime nodejs22.x --architectures arm64 \
  --handler index.handler --role <role ARN> --zip-file fileb:///tmp/det.zip --timeout 30 --tags project=agentcore-handson
aws bedrock-agentcore-control create-evaluator --evaluator-name deposit_law_hard_rules --level SESSION \
  --evaluator-config '{"codeBased":{"lambdaConfig":{"lambdaArn":"<function ARN>","lambdaTimeoutInSeconds":30}}}' \
  --tags project=agentcore-handson
# Update the code later: aws lambda update-function-code --function-name handson-deposit-eval-checks --zip-file fileb:///tmp/det.zip
```

On-demand `Evaluate` invokes the Lambda with the caller's credentials; online evaluation would need an execution role with `lambda:InvokeFunction`.

### Claude judge (option C): Claude via the Anthropic API, owner's key

```bash
# 1. The owner puts the key in Secrets Manager (stdin, never in argv or history)
sed -n 's/^ANTHROPIC_API_KEY=//p' ~/.config/agentcore-handson/anthropic.env | tr -d '\n' | aws secretsmanager create-secret \
  --name agentcore-handson/anthropic-api-key --secret-string file:///dev/stdin --tags Key=project,Value=agentcore-handson
# 2. Role: own logs + that one secret (eval-lambda-trust-policy.json, eval-judge-permissions.json; fill placeholders)
aws iam create-role --role-name agentcore-handson-eval-judge --assume-role-policy-document file://eval-lambda-trust-policy.json --tags Key=project,Value=agentcore-handson
aws iam put-role-policy --role-name agentcore-handson-eval-judge --policy-name logs-and-anthropic-key --policy-document file://eval-judge-permissions.json
# 3. One function per judge model (the payload doesn't name the evaluator); create each log group first with 7-day retention
(cd ../../agent && scripts/build-judge.sh)
aws lambda create-function --function-name handson-claude-judge --runtime nodejs22.x --architectures arm64 --handler index.handler \
  --role <role ARN> --zip-file fileb://../../agent/dist/claude-judge.zip --timeout 120 --memory-size 256 \
  --environment "Variables={ANTHROPIC_KEY_SECRET=agentcore-handson/anthropic-api-key,JUDGE_MODEL=claude-opus-5-5}" --tags project=agentcore-handson
#    ...and handson-claude-judge-haiku with JUDGE_MODEL=claude-haiku-5-5
# 4. Register each: create-evaluator --evaluator-name claude_judge_opus55 (or _haiku55) --level SESSION, codeBased lambdaArn as above
```
