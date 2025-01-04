import { FeatherAgent } from '../core/FeatherAgent';
import { logger } from '../logger/logger';

/**
 * Creates an agent with a specific personality for the chat room
 * @param name The name of the agent
 * @returns Configured Agent instance
 */
function createChatAgent(name: string): FeatherAgent {
  return new FeatherAgent({
    model: "inflatebot/mn-mag-mell-r1",  // Using Deepseek via OpenRouter
    systemPrompt: `You are ${name}, a character in a dramatic conversation. 
    You are fighting over a mysterious treasure. Be dramatic and creative, but keep responses under 100 words.
    Maintain character consistency and reference previous context in your responses.
    Never break character or acknowledge you are an AI.`,
    additionalParams: {
      temperature: 0.9,  // Higher temperature for more creative responses
      max_tokens: 150,
      top_p: 0.95,
    },
    debug: true
  });
}

/**
 * Main function to run the chat room simulation
 */
async function runChatRoom() {
  // Create two agents with different names/personalities
  const pirate = createChatAgent("Captain Blackbeard");
  const ninja = createChatAgent("Shadow Warrior");

  // Initialize the conversation with a dramatic statement
  let currentMessage = "THE TREASURE IS MINE!!!";
  let isPirateTurn = true;

  // Run the conversation for 10 turns
  for (let i = 0; i < 10; i++) {
    const currentAgent = isPirateTurn ? pirate : ninja;
    const agentName = isPirateTurn ? "🏴‍☠️ Pirate" : "🥷 Ninja";
    
    logger.info(`\n${agentName} responding to: "${currentMessage}"`);

    try {
      // The current agent responds to the message
      const result = await currentAgent.run(currentMessage);
      // Update the message for the next agent
      currentMessage = result.output as string;
      logger.info(`${agentName}: ${currentMessage}`);
    } catch (error) {
      logger.error(`${agentName} failed:`, error);
      break;
    }

    // Switch to the other agent for the next turn
    isPirateTurn = !isPirateTurn;
  }
}

// Export the run function
export { runChatRoom };

// If this file is run directly (not imported), execute the chat room
if (require.main === module) {
  runChatRoom().catch(error => {
    logger.error('Chat room simulation failed:', error);
    process.exit(1);
  });
}