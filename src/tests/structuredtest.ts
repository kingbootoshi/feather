import { FeatherAgent } from '../core/FeatherAgent';
import { logger } from '../logger/logger';

// Test demonstrating structured output with the Feather framework
// The agent will return a JSON response conforming to our schema
(async () => {
  // Create a structured output agent with a specific schema
  const agent = new FeatherAgent({
    agentId: "structured-test",
    model: "deepseek/deepseek-chat",
    systemPrompt: "You are a helpful assistant that provides accurate, structured responses.",
    structuredOutputSchema: {
      type: "object",
      properties: {
        answer: {
          type: "string",
          description: "A concise answer to the user's question"
        },
        confidence: {
          type: "number",
          description: "A confidence score between 0 and 1"
        }
      },
      required: ["answer", "confidence"]
    },
    debug: true // Enable debug GUI for testing
  });

  const userMessage = "What is the capital of France?";
  // The agent should produce a structured JSON answer
  const result = await agent.run(userMessage);

  if (result.success) {
    console.log("Structured response:", result.output);
  } else {
    console.error("Agent error:", result.error);
  }
})();