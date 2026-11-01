No server instructions in the system prompt: only the tool descriptions guide the model.

Question: does the baseline's perfect routing (8/8 plain questions used our tool) depend on the server instructions? In the owner's Claude Desktop chat, the plain Nevada question went to web search. Some apps don't pass a server's instructions to the model.

Change: `EVAL_SERVER_INSTRUCTIONS=off` → no `system` parameter. Everything else is identical: same 22 cases, model, tools behind tool search, web search, grader.
