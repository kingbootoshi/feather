import { FeatherAgent } from '../core/FeatherAgent';
import { logger } from '../logger/logger';
import { internetTool } from '../tools';

// THIS TEST REQUIRES A PERPLEXITY API KEY
// You can get one at https://www.perplexity.ai/

async function main() {
  // Create an internet research agent that auto-executes searches
  const internetAgent = new FeatherAgent({
    agentId: "internet-researcher",
    systemPrompt: "You are a research assistant who can search the internet for up-to-date information. Always cite your sources and provide detailed, accurate responses.",
    tools: [internetTool],
    cognition: true,
    model: "deepseek/deepseek-chat",
    chainRun: true,
    maxChainIterations: 10,
    debug: true,
  });

  try {
    // Test the agent with a current events query
    const res = await internetAgent.run("Search the internet for information on Nvidia black well GPUs, then get information on deepseek, then give me a long, detailed essay on how much the new GPUs can amplify deepseek models and how it'll help accelearte the GDP");
    if (!res.success) {
      logger.error(`Agent error: ${res.error || 'unknown'}`);
      return;
    }

    logger.info({ output: res.output }, "Internet Agent response");
  } catch (error) {
    logger.error({ error }, "Fatal error running internetAgent");
  } 
}

// Run if called directly
if (require.main === module) {
  logger.debug('Starting internet search test');
  main().catch(err => logger.error({ err }, "Error running internet search test"));
}