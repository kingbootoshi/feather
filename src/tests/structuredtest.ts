import { FeatherAgent } from '../core/FeatherAgent';
import { logger } from '../logger/logger';

// Test demonstrating structured output with the Feather framework
(async () => {
  // Create a structured output agent with a specific schema
  // Note the generic type <{ answer: string; confidence: number }>
  const agent = new FeatherAgent<{ answer: string; confidence: number }>({
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
    debug: true
  });

  const userMessage = "What is the capital of France?";
  // The agent should produce a structured JSON answer
  const result = await agent.run(userMessage);

  if (result.success) {
    // Log full structured response
    logger.info("Full structured response:", result.output);
    
    // result.output is now typed as { answer: string; confidence: number }
    const answer = result.output.answer;
    const confidence = result.output.confidence;
    
    logger.info("Just the answer:", answer);
    logger.info("Just the confidence:", confidence);
  } else {
    logger.error("Agent error:", result.error);
  }
})();