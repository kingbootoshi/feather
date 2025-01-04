import { FeatherAgent } from '../core/FeatherAgent';
import { ToolDefinition } from '../types/types';
import { logger } from '../logger/logger';

async function main() {
  // Create an agent that can see images with debug mode to view the debug GUI in a browser
  const imageAgent = new FeatherAgent({
    agentId: "image-agent-v1",
    systemPrompt: "You are a fun AI agent that speaks English.",
    model: "qwen/qvq-72b-preview",
    debug: true // <--- enabling debug mode
  });

  // Example usage of the image agent
  try {
    imageAgent.addUserMessage("Who is stronger?", { images: ["https://static.wikia.nocookie.net/onepiece/images/6/6d/Monkey_D._Luffy_Anime_Post_Timeskip_Infobox.png/revision/latest?cb=20240306200817", "https://static.wikia.nocookie.net/naruto-ultimate-ninja-storm/images/e/ea/Naruto.png/revision/latest?cb=20210319180515"] });
    const res = await imageAgent.run();
    if (!res.success) {
      logger.error(`Agent error: ${res.error || 'unknown'}`);
      return;
    }
    const finalOutput = typeof res.output === 'string'
      ? res.output
      : JSON.stringify(res.output, null, 2);
    logger.info({ output: finalOutput }, "Agent response");
  } catch (error) {
    logger.error({ error }, "Fatal error running image agent");
  }
}

// Run if called directly
if (require.main === module) {
  logger.debug('Starting image test');
  main().catch(err => logger.error({ err }, "Error running imageAgent"));
}