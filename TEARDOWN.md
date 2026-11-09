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

Keep it until the bill for the month is final, then:

```bash
aws budgets delete-budget --region us-east-1 --account-id "$ACCOUNT" --budget-name agentcore-handson-monthly
```

## Check nothing is left

```bash
aws resourcegroupstaggingapi get-resources --tag-filters Key=project,Values=agentcore-handson --query 'ResourceTagMappingList[].ResourceARN'
aws resourcegroupstaggingapi get-resources --region us-east-1 --tag-filters Key=project,Values=agentcore-handson --query 'ResourceTagMappingList[].ResourceARN'
```

Both should print `[]`. IAM roles and the Cognito domain don't appear in that API: `aws iam list-roles --query "Roles[?starts_with(RoleName,'agentcore-')].RoleName"` should be empty, and `aws cognito-idp list-user-pools --max-results 20` should not list `agentcore-handson-gateway`.
