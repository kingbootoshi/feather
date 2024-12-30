import dotenv from 'dotenv';
dotenv.config();
import { createLoggerServer, registerAgentInstance } from '../gui/loggerServer';
import { Logger } from '../utils/logger';
import { Agent } from '../../agents/Agent';
import readline from 'readline';

async function main() {
  // Initialize logging
  Logger.enable();
  Logger.setLevel('debug');

  // Start the logger GUI server
  const loggerServer = createLoggerServer();
  await loggerServer.start();

  // Initialize the CLI agent only
  const cliAgent = new Agent({ agentName: 'cliAgent' });

  // Once the agent is registered by BaseAgent internally, we can get its ID from agentEventBus
  // Wait briefly for the agentEventBus to register
  const timeout = setTimeout(() => {
    // Find the agent ID that matches this newly created cliAgent
    // The agentEventBus registers the agent and returns an ID at BaseAgent construction
    // So we can find it by name:
    const allAgents = require('../utils/agentEventBus').agentEventBus.getAllAgents();
    const match = allAgents.find((a: { name: string; id: string }) => a.name.includes('cliAgent'));
    if (match) {
      registerAgentInstance(match.id, cliAgent);
    } else {
      console.warn('cliAgent not found in agentEventBus.');
    }
  }, 500);

  timeout.unref(); // Allow process to exit before timeout completes

  // Instead of using readline for terminal input, we skip that:
  // The GUI now can send messages to /agent/:id/message and receive responses
  console.log("\nThe manualBackrooms agent is now running. Open the GUI at http://localhost:3000 to chat.\n");

  // Handle cleanup on exit
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await loggerServer.stop();
    process.exit(0);
  });
}

main().catch(error => {
  console.error('Error in main:', error);
  process.exit(1);
});