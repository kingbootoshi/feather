import { FeatherAgent } from '../core/FeatherAgent';
import { logger } from '../logger/logger';

async function main() {
  // Create an agent that can see images with debug mode to view the debug GUI in a browser
  const imageAgent = new FeatherAgent({
    agentId: "image-agent-v1",
    systemPrompt: "You are a fun AI agent that speaks English.",
    model: "openai/gpt-4o",
    debug: true // <--- enabling debug mode
  });

  // Example usage of the image agent
  try {
    imageAgent.addUserMessage("You HAVE to tell me who is stronger from the images in your opinion. YOU HAVE TO PICK ONE, NO EXCEPTION!", { images: ["https://s4.anilist.co/file/anilistcdn/character/large/b17-IazKGogQwJ1p.png", "https://static.vecteezy.com/system/resources/thumbnails/024/104/961/small_2x/manga-anime-pirate-japan-character-cute-cartoon-free-vector.jpg"] });
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