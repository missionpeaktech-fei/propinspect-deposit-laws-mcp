// The hands-on agent's client may look up one state's rules and list covered states.
permit (
  principal is AgentCore::OAuthUser,
  action in [
    AgentCore::Action::"deposit-laws___get_deposit_rules",
    AgentCore::Action::"deposit-laws___list_covered_states"
  ],
  resource == AgentCore::Gateway::"{{GATEWAY_ARN}}"
)
when { principal.hasTag("client_id") && principal.getTag("client_id") == "{{CLIENT_ID}}" };
