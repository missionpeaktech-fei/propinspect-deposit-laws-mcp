Server named, no instructions: the system prompt only says which MCP server is connected.

Question: does this reproduce the owner's Claude Desktop behavior (a plain question went to web search; "PropInspect" in the question found our tool)? v1 showed that with nothing in the system prompt the model never searches for tools. v2 is the middle ground: the model knows a "PropInspect Deposit Laws" connector exists, but gets no instruction to prefer it.

Change: `EVAL_SERVER_INSTRUCTIONS=name` → system prompt "The user has connected these MCP servers: propinspect-deposit-laws (PropInspect Deposit Laws)." Everything else is identical.
