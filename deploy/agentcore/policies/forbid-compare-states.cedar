// Step 8 demo: the same client may not compare states. Forbid wins over any permit.
forbid (
  principal is AgentCore::OAuthUser,
  action == AgentCore::Action::"deposit-laws___compare_states",
  resource == AgentCore::Gateway::"{{GATEWAY_ARN}}"
)
when { principal.hasTag("client_id") && principal.getTag("client_id") == "{{CLIENT_ID}}" };
