# Tear down the AgentCore hands-on

Everything this project creates is tagged `project=agentcore-handson` and lives in one AWS project, region `us-east-2` (ADR 0007). Run these in order, signed in with `aws login --profile agentcore`. Resources are added here as each step creates them.

```bash
export AWS_PROFILE=agentcore AWS_REGION=us-east-2
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET=bedrock-agentcore-code-$ACCOUNT-us-east-2
RUNTIME_ID=$(aws bedrock-agentcore-control list-agent-runtimes --query "agentRuntimes[?agentRuntimeName=='deposit_laws_mcp'].agentRuntimeId" --output text)
```

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

Both should print `[]`. IAM roles don't appear in that API: `aws iam list-roles --query "Roles[?starts_with(RoleName,'agentcore-')].RoleName"` should be empty.
