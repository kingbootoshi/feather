import { Agent } from '../../agents/Agent';
import { createLoggerServer } from '../gui/loggerServer';
import { Logger } from '../utils/logger';

// Enable logging before starting the test
Logger.enable();

// Wrap everything in an async IIFE
(async () => {
  // Initialize and start logger server inside the async context
  const loggerServer = createLoggerServer();
  await loggerServer.start();

  // Create two instances of ChatAgent with different personalities
  const agent1 = new Agent({ agentName: "ChatAgent" });
  const agent2 = new Agent({ agentName: "ChatAgent" });

  // Initialize the conversation with a message
  let currentMessage = "THE TREASURE IS MINE!!!";
  
  // Track which agent is currently responding
  let isAgent1Turn = true;

  // Run the conversation for 10 turns (5 exchanges between agents)
  for (let i = 0; i < 10; i++) {
    // Select the current agent based on turn
    const currentAgent = isAgent1Turn ? agent1 : agent2;
    
    // Log which agent is responding
    console.log(`\n${isAgent1Turn ? 'Agent 1' : 'Agent 2'} is responding to: "${currentMessage}"`);

    // Get the agent's response
    const agentResult = await currentAgent.run(currentMessage);

    if (agentResult.success) {
      currentMessage = agentResult.output;
      console.log(`${isAgent1Turn ? 'Agent 1' : 'Agent 2'} responded:`, currentMessage);
    } else {
      console.error(`${isAgent1Turn ? 'Agent 1' : 'Agent 2'} failed:`, agentResult.error);
      break;
    }

    // Switch turns between agents
    isAgent1Turn = !isAgent1Turn;
  }
})();