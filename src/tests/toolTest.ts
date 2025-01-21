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
  // Create an agent that does NOT auto-execute tools
  const manualMathAgent = new FeatherAgent({
    agentId: "math-tutor-manual",
    systemPrompt: "You are a math tutor who can do calculations using the calculator tool. Provide answers politely.",
    tools: [calculatorTool],
    model: "openai/gpt-4o",
    forceTool: true,
    autoExecuteTools: false, // <--- do NOT auto-execute function calls
    debug: true
  });

  try {
    const res = await manualMathAgent.run("What is 1294 multiplied by 9966?");
    if (!res.success) {
      logger.error(`Agent error: ${res.error || 'unknown'}`);
      return;
    }

    logger.debug({ res }, "Agent response (manual execution)");

    logger.info({ output: res.output, tools: res.functionCalls }, "Agent response (manual execution)");
    /*
      Here, if res.functionCalls is non-empty, you can manually call calculatorTool.execute()
      or handle them as desired in your application logic.
    */

    // For demo purposes, let's auto-execute them ourselves:
    if (res.functionCalls && res.functionCalls.length > 0) {
      for (const call of res.functionCalls) {
        logger.info(`Manually executing tool: ${call.functionName}`);
        const toolDefinition = [calculatorTool].find(t => t.function.name === call.functionName);
        if (toolDefinition) {
          const result = await toolDefinition.execute(call.functionArgs);
          logger.info({ result }, "Manual tool execution result");
        }
      }
    }

  } catch (error) {
    logger.error({ error }, "Fatal error running manualMathAgent");
  }

  // Create a mathAgent that DOES auto-execute tools
  const autoMathAgent = new FeatherAgent({
    agentId: "math-tutor-auto",
    systemPrompt: "You are a math tutor who can do calculations using the calculator tool. Provide answers politely.",
    tools: [calculatorTool],
    model: "deepseek/deepseek-chat",
    cognition: true,
    debug: true,
  });

  try {
    const res = await autoMathAgent.run("What is 1294 multiplied by 9966 + 223.5322 * 2.113");
    if (!res.success) {
      logger.error(`Agent error: ${res.error || 'unknown'}`);
      return;
    }

    logger.info({ output: res.output }, "Agent response (auto execution)");
  } catch (error) {
    logger.error({ error }, "Fatal error running autoMathAgent");
  }
}

// Run if called directly
if (require.main === module) {
  logger.debug('Starting tool test (manual vs auto-execution)');
  main().catch(err => logger.error({ err }, "Error running toolTest"));
}