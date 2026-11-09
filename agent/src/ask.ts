/** Ask one question: npm run ask -- "What's the deposit return deadline in Washington?" */
import { createAgent, MODEL_ID, toolsCalled } from "./agent";

const question = process.argv.slice(2).join(" ").trim();
if (!question) {
  console.error('Usage: npm run ask -- "your question"');
  process.exit(1);
}
const agent = createAgent();
const result = await agent.invoke(question);
console.log(String(result));
console.error(`\n[model ${MODEL_ID} | tools: ${toolsCalled(agent).join(", ") || "none"}]`);
process.exit(0);
