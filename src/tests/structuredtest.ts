import { FeatherAgent } from '../core/FeatherAgent';
import { logger } from '../logger/logger';

// Test demonstrating structured output with the Feather framework
// The agent will return a JSON response conforming to our schema
(async () => {
  // Create a structured output agent with a specific schema
  const agent = new FeatherAgent({
    agentId: "structured-test",
    model: "openai/gpt-4o",
    systemPrompt: "You are a helpful assistant that provides accurate, structured responses.",
    structuredOutputSchema: {
      name: "weather",
      strict: true,
      schema: {
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
        required: ["answer", "confidence"],
        additionalProperties: false
      }
    },
    debug: true // Enable debug GUI for testing
  });

  const userMessage = "What is the capital of France?";
  // The agent should produce a structured JSON answer
  const result = await agent.run(userMessage);

  if (result.success) {
    // Log full structured response
    console.log("Full structured response:", result.output);
    
    // Access specific fields
    const answer = result.output.answer;
    const confidence = result.output.confidence;
    
    console.log("Just the answer:", answer);
    console.log("Just the confidence:", confidence);
  } else {
    console.error("Agent error:", result.error);
  }
})();