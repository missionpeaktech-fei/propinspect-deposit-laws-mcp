# AgentCore deployment (hands-on, ADR 0007)

Reusable pieces for hosting an MCP server on Amazon Bedrock AgentCore Runtime. Placeholders in `{{…}}` are filled in by `deploy.sh` (account, region, runtime name) or by you (email).

| File | What it is | Why it's shaped this way |
|---|---|---|
| `deploy.sh` | Creates or updates bucket, role and Runtime; rebuilds and uploads the code | Idempotent, so one command both deploys and redeploys |
| `trust-policy.json` | Who may assume the Runtime's role | Only AgentCore, only in this account and region (`aws:SourceAccount` + `aws:SourceArn`), against confused-deputy attacks |
| `runtime-permissions.json` | What the running server may do | Logs, traces, metrics only. AWS's sample role also allows Bedrock model calls; this server makes none, so they're left out (least privilege) |
| `budget.json`, `budget-notifications.json` | $20/month budget, email at 80% actual and 100% forecast | Create before any other resource. A budget warns; a spend limit (AWS Settings, new AWS experience) is the hard stop |

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
