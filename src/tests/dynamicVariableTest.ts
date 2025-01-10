import { FeatherAgent } from '../core/FeatherAgent';
import { logger } from '../logger/logger';
import { indentNicely } from '../utils';

// Function to get current time in a readable format
const getCurrentTime = (): string => {
  const now = new Date();
  return now.toLocaleString();
};

// Helper function to create a delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  // Demonstrate templated dynamic variables in the system prompt
  const dynamicVariableAgent = new FeatherAgent({
    agentId: "dynamic-variable-test",
    // Notice the placeholder in the systemPrompt: {{currentTime}}
    systemPrompt: indentNicely`
    You are a fun AI agent that can tell the current time accurately.

    Right now, the time is: 
    {{currentTime}}
    `,
    model: "openai/gpt-4o",
    debug: true, // <--- enabling debug mode
    dynamicVariables: {
      currentTime: getCurrentTime // Will be called each time the agent runs
    }
  });

  try {
    logger.info("First run - checking time (placeholder replaced in prompt)");
    dynamicVariableAgent.addUserMessage("What is the EXACT time right now?");
    const res1 = await dynamicVariableAgent.run();
    if (!res1.success) {
      logger.error(`Agent error: ${res1.error || 'unknown'}`);
      return;
    }
    logger.info({ output: res1.output }, "First time check result");

    logger.info("Waiting 5 seconds before next run...");
    await delay(5000);

    logger.info("Second run - systemPrompt should update placeholder again");
    dynamicVariableAgent.addUserMessage("What's the time now? Has it changed?");
    const res2 = await dynamicVariableAgent.run();
    if (!res2.success) {
      logger.error(`Agent error: ${res2.error || 'unknown'}`);
      return;
    }
    logger.info({ output: res2.output }, "Second time check result");
  } catch (error) {
    logger.error({ error }, "Fatal error running dynamicVariableAgent test");
  }
}

// Run if called directly
if (require.main === module) {
  logger.debug('Starting dynamic variable placeholder test');
  main().catch(err => logger.error({ err }, "Error running dynamicVariableAgent"));
}