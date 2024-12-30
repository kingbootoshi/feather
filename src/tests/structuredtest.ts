import { Agent } from '../../agents/Agent';
import { Logger } from '../utils/logger';

// This test will run the structuredAgent and ask a question
// The agent must return structured JSON conforming to the schema.

Logger.enable();
Logger.setLevel('debug');

(async () => {
  const agent = new Agent({ agentName: "structuredAgent" });
  const userMessage = "What is the capital of France?";
  const result = await agent.run(userMessage);

  if (result.success) {
    console.log("Agent structured response:", result.output);
  } else {
    console.error("Agent error:", result.error);
  }
})();