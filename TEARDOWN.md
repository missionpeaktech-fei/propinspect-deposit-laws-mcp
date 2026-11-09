# Tear down the AgentCore hands-on

Everything this project creates is tagged `project=agentcore-handson` and lives in one AWS project, region `us-east-2` (ADR 0007). Run these in order, signed in with `aws login --profile agentcore`. Resources are added here as each step creates them.

```bash
export AWS_PROFILE=agentcore AWS_REGION=us-east-2
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET=bedrock-agentcore-code-$ACCOUNT-us-east-2
RUNTIME_ID=$(aws bedrock-agentcore-control list-agent-runtimes --query "agentRuntimes[?agentRuntimeName=='deposit_laws_mcp'].agentRuntimeId" --output text)
GATEWAY_ID=$(aws bedrock-agentcore-control list-gateways --query "items[?name=='deposit-laws-gateway'].gatewayId" --output text)
POOL_ID=$(aws cognito-idp list-user-pools --max-results 20 --query "UserPools[?Name=='agentcore-handson-gateway'].Id" --output text)
```

## Step 9: evaluations (delete before everything else)

Only the secret costs money while idle (about $0.40 a month); delete it all. The derived (Bedrock) judges
were refused at creation, so none exist.

```bash
# 1. The code-based evaluator, then its Lambda, the Lambda's log group and role
EVAL_ID=$(aws bedrock-agentcore-control list-evaluators --query "evaluators[?evaluatorName=='deposit_law_hard_rules'].evaluatorId" --output text)
aws bedrock-agentcore-control delete-evaluator --evaluator-id "$EVAL_ID"
aws lambda delete-function --function-name handson-deposit-eval-checks
aws logs delete-log-group --log-group-name /aws/lambda/handson-deposit-eval-checks
aws iam delete-role-policy --role-name agentcore-handson-eval-lambda --policy-name write-own-logs
aws iam delete-role --role-name agentcore-handson-eval-lambda
# 2. The two Claude judges (option C): evaluators, Lambdas, log groups, role
for name in claude_judge_opus55 claude_judge_haiku55; do
  aws bedrock-agentcore-control delete-evaluator --evaluator-id "$(aws bedrock-agentcore-control list-evaluators --query "evaluators[?evaluatorName=='$name'].evaluatorId" --output text)"; done
for f in handson-claude-judge handson-claude-judge-haiku; do
  aws lambda delete-function --function-name $f; aws logs delete-log-group --log-group-name /aws/lambda/$f; done
aws iam delete-role-policy --role-name agentcore-handson-eval-judge --policy-name logs-and-anthropic-key
aws iam delete-role --role-name agentcore-handson-eval-judge
# 3. The Anthropic key secret (the owner created it; 7-day recovery window, then gone). Also revoke the key in the Anthropic Console.
aws secretsmanager delete-secret --secret-id agentcore-handson/anthropic-api-key --recovery-window-in-days 7
```

## Step 8: policy (delete after the gateway in step 4 if you delete both; an attached engine is in use)

```bash
ENGINE_ID=$(aws bedrock-agentcore-control list-policy-engines --query "policyEngines[?name=='deposit_laws_policy'].policyEngineId" --output text)
# 1. Detach the engine: deleting the gateway (step 4) also works, but detach first if you keep the gateway.
# 2. Its policies, then the engine
for p in $(aws bedrock-agentcore-control list-policies --policy-engine-id "$ENGINE_ID" --query 'policies[].policyId' --output text); do
  aws bedrock-agentcore-control delete-policy --policy-engine-id "$ENGINE_ID" --policy-id "$p"; done
sleep 15
aws bedrock-agentcore-control delete-policy-engine --policy-engine-id "$ENGINE_ID"
# 3. The gateway role's policy-engine permissions
aws iam delete-role-policy --role-name agentcore-deposit-laws-gateway --policy-name use-policy-engine
```

## Step 7: observability (delete first)

```bash
# 1. Log and trace deliveries (gateway and runtime), then their sources and destinations
for d in $(aws logs describe-deliveries --query "deliveries[?starts_with(deliverySourceName,'handson-')].id" --output text); do aws logs delete-delivery --id "$d"; done
for n in handson-gateway handson-runtime; do
  for t in logs traces; do aws logs delete-delivery-source --name "$n-$t"; aws logs delete-delivery-destination --name "$n-$t-dest"; done; done

# 2. Their log groups
for g in $(aws logs describe-log-groups --log-group-name-prefix /aws/vendedlogs/bedrock-agentcore/ --query 'logGroups[].logGroupName' --output text); do aws logs delete-log-group --log-group-name "$g"; done

# 3. Transaction Search: set indexing back to the free 1%. It's an account-level setting; leave it on,
#    or switch traces back to X-Ray only and remove the resource policy:
aws xray update-indexing-rule --name Default --rule '{"Probabilistic":{"DesiredSamplingPercentage":1}}'
# aws xray update-trace-segment-destination --destination XRay
# aws logs delete-resource-policy --policy-name TransactionSearchXRayAccess
```

`aws/spans` keeps spans for 7 days (retention set in step 7), so it can stay.

## Step 4: Gateway and Cognito (delete these before step 3's)

```bash
# 1. Gateway targets, then the gateway
for t in $(aws bedrock-agentcore-control list-gateway-targets --gateway-identifier "$GATEWAY_ID" --query 'items[].targetId' --output text); do
  aws bedrock-agentcore-control delete-gateway-target --gateway-identifier "$GATEWAY_ID" --target-id "$t"; done
sleep 20
aws bedrock-agentcore-control delete-gateway --gateway-identifier "$GATEWAY_ID"

# 2. The gateway's role
aws iam delete-role-policy --role-name agentcore-deposit-laws-gateway --policy-name invoke-runtime
aws iam delete-role --role-name agentcore-deposit-laws-gateway

# 3. Cognito: the domain first, then the pool (deletes its client and scope)
DOMAIN=$(aws cognito-idp describe-user-pool --user-pool-id "$POOL_ID" --query UserPool.Domain --output text)
aws cognito-idp delete-user-pool-domain --user-pool-id "$POOL_ID" --domain "$DOMAIN"
aws cognito-idp delete-user-pool --user-pool-id "$POOL_ID"

# 4. The local client secret
rm -f ~/.config/agentcore-handson/cognito.env
```

The Runtime's resource policy (only the gateway may invoke it) is deleted with the Runtime.

## Step 3: Runtime

```bash
# 1. The AgentCore Runtime (its DEFAULT endpoint goes with it)
aws bedrock-agentcore-control delete-agent-runtime --agent-runtime-id "$RUNTIME_ID"

# 2. The code bucket
aws s3 rm "s3://$BUCKET" --recursive
aws s3api delete-bucket --bucket "$BUCKET"

# 3. The Runtime's execution role
aws iam delete-role-policy --role-name agentcore-deposit-laws-mcp-runtime --policy-name runtime-execution
aws iam delete-role --role-name agentcore-deposit-laws-mcp-runtime

# 4. Runtime log groups, if any were created
for g in $(aws logs describe-log-groups --log-group-name-prefix /aws/bedrock-agentcore/runtimes/deposit_laws_mcp --query 'logGroups[].logGroupName' --output text); do aws logs delete-log-group --log-group-name "$g"; done
```

## Last: the budget

Kept after the 2026-11-09 teardown (free; alerts if anything starts costing). Delete it when the project is closed:

```bash
aws budgets delete-budget --region us-east-1 --account-id "$ACCOUNT" --budget-name agentcore-handson-monthly
```

## Check nothing is left

```bash
aws resourcegroupstaggingapi get-resources --tag-filters Key=project,Values=agentcore-handson --query 'ResourceTagMappingList[].ResourceARN'
aws budgets describe-budgets --account-id <account> --region us-east-1 --query 'Budgets[].BudgetName'   # us-east-1: only the budget; the tagging API there is denied by the project's SCP
```

Both should print `[]`. IAM roles and the Cognito domain don't appear in that API: `aws iam list-roles --query "Roles[?starts_with(RoleName,'agentcore-')].RoleName"` should be empty, and `aws cognito-idp list-user-pools --max-results 20` should not list `agentcore-handson-gateway`.
