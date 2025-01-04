import { FeatherAgent } from '../core/FeatherAgent';
import { ToolDefinition } from '../types/types';
import { logger } from '../logger/logger';

// Example tool: Calculator with proper OpenAI function calling setup
// This tool definition will be used by the agent to perform arithmetic.
const calculatorTool: ToolDefinition = {
  type: "function",
  function: {
    name: "calculator",
    description: "Performs basic arithmetic operations between two numbers",
    parameters: {
      type: "object",
      properties: {
        num1: {
          type: "number",
          description: "The first number in the calculation"
        },
        num2: {
          type: "number",
          description: "The second number in the calculation"
        },
        operation: {
          type: "string",
          enum: ["add", "subtract", "multiply", "divide"],
          description: "The arithmetic operation to perform"
        }
      },
      required: ["num1", "num2", "operation"]
    }
  },
  // Execute function with proper error handling and validation
  async execute(args: Record<string, any>): Promise<{ result: number }> {
    logger.info({ args }, "Executing calculator tool");
    
    try {
      const params = typeof args === 'string' ? JSON.parse(args) : args;
      if (typeof params.num1 !== 'number' || typeof params.num2 !== 'number') {
        throw new Error("Both numbers must be valid numeric values");
      }
      if (params.operation === "divide" && params.num2 === 0) {
        throw new Error("Division by zero is not allowed");
      }
      switch (params.operation) {
        case "add":
          return { result: params.num1 + params.num2 };
        case "subtract":
          return { result: params.num1 - params.num2 };
        case "multiply":
          return { result: params.num1 * params.num2 };
        case "divide":
          return { result: params.num1 / params.num2 };
        default:
          throw new Error(`Unsupported operation: ${params.operation}`);
      }
    } catch (error) {
      logger.error({ error, args }, "Calculator tool error");
      throw error;
    }
  }
};

async function main() {
  // Create a mathAgent with debug mode to view the debug GUI in a browser
  // The agent uses the calculatorTool to handle arithmetic.
  const mathAgent = new FeatherAgent({
    agentId: "math-tutor-v1",
    systemPrompt: "You are a math tutor who can do calculations using the calculator tool. Provide answers politely.",
    cognition: true,
    tools: [calculatorTool],
    model: "deepseek/deepseek-chat",
    debug: true // <--- enabling debug mode
  });

  // Example usage of the agent with a math question
  try {
    const res = await mathAgent.run("What is 3 multiplied by 7?");
    if (!res.success) {
      logger.error(`Agent error: ${res.error || 'unknown'}`);
      return;
    }
    const finalOutput = typeof res.output === 'string'
      ? res.output
      : JSON.stringify(res.output, null, 2);
    logger.info({ output: finalOutput }, "Agent response");
  } catch (error) {
    logger.error({ error }, "Fatal error running math agent");
  }
}

// Run if called directly
if (require.main === module) {
  logger.debug('Starting tool test');
  main().catch(err => logger.error({ err }, "Error running exampleAgent"));
}