import { FeatherAgent } from '../core/FeatherAgent';
import { logger } from '../logger/logger';

// Function to get current time in a readable format
const getCurrentTime = (): string => {
  const now = new Date();
  return now.toLocaleString();
};

// Helper function to create a delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  // Create an agent that can see images with debug mode to view the debug GUI in a browser
  const dynamicVariableAgent = new FeatherAgent({
    agentId: "dynamic-variable-test",
    systemPrompt: "You are a fun AI agent that speaks English and can tell the current time.",
    model: "openai/gpt-4o",
    debug: true, // <--- enabling debug mode
    dynamicVariables: {
      currentTime: getCurrentTime // Will be called each time the agent runs
    }
  });

  // First run
  try {
    logger.info("First run - checking time");
    dynamicVariableAgent.addUserMessage("What is the EXACT time right now?");
    const res1 = await dynamicVariableAgent.run();
    if (!res1.success) {
      logger.error(`Agent error: ${res1.error || 'unknown'}`);
      return;
    }
    logger.info({ output: res1.output }, "First time check");

    // Wait for 10 seconds
    logger.info("Waiting 10 seconds...");
    await delay(10000);

    // Second run
    logger.info("Second run - checking time again");
    dynamicVariableAgent.addUserMessage("What's the time now? Has it changed from your last check?");
    const res2 = await dynamicVariableAgent.run();
    if (!res2.success) {
      logger.error(`Agent error: ${res2.error || 'unknown'}`);
      return;
    }
    logger.info({ output: res2.output }, "Second time check");
  } catch (error) {
    logger.error({ error }, "Fatal error running dynamicVariableAgent");
  }
}

// Run if called directly
if (require.main === module) {
  logger.debug('Starting dynamic variable test');
  main().catch(err => logger.error({ err }, "Error running dynamicVariableAgent"));
}