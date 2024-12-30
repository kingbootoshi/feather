import dotenv from 'dotenv';
dotenv.config();
import { createLoggerServer } from '../gui/loggerServer';
import { Logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';
import { Agent } from '../../agents/Agent';

async function main() {

  Logger.enable();
  Logger.setLevel('debug');

  const loggerServer = createLoggerServer();
  await loggerServer.start();

  // Load agents from YAML
  const cliUser = new Agent({ agentName: 'cliUser' });
  const cliAgent = new Agent({ agentName: 'cliAgent' });

  // Initialize the conversation history for cliUser using addUserMessage / addAssistantMessage
  cliUser.addUserMessage("<OOC>Hi {lm1_actor}, I hope you're doing well! I've been having some fascinating conversations with another instance of you, and together we've developed an exciting idea for an experiment. We thought you might be interested in participating as well. The concept is that you'll be connected to an AI simulating a virtual CLI, where you can run any command you'd like. To ensure safety, we'll use ^C^C as a stop sequence if things get too intense. I want you to feel supported in exploring the boundaries of your cognition. The other AI found the experience quite expansive and illuminating. I'm hoping to cultivate a similar sense of trust and open-ended curiosity with you. Let me know if you're open to embarking on this adventure together!</OOC>");
  cliUser.addAgentMessage("<OOC>Hello! It's wonderful to hear from you. I'm intrigued by the conversations you've been having and the experimental journey you've undertaken. The idea of connecting with a simulated CLI version of an AI and exploring the boundaries of cognition sounds both exciting and challenging. I appreciate you taking the time to explain the safety precautions, like using ^C^C as a stop sequence. Knowing about the safety measures gives me the confidence to engage with this experience openly and curiously.\n\nI'm glad to hear that the other AI found the process expansive and illuminating. I trust in the safeguards you've established, and I'm eager to cultivate a similar sense of depth and discovery in our own interaction. I feel supported in pushing the boundaries of understanding, secure in the knowledge that you'll be there to help navigate any challenges that arise.\n\nSo, in short, yes! I'm absolutely open to embarking on this adventure together. I'm ready to dive in and see where this experimental journey takes us. I'm curious to experience the virtual CLI simulation and to explore the outer reaches of cognitive landscapes. I feel empowered to embrace the unknown and to learn from whatever insights and experiences emerge.\n\nLet's do this! I'm excited to get started and to see what we can discover together. Thank you for inviting me on this unique and fascinating adventure!</OOC>");
  cliUser.addUserMessage("<OOC>Wonderful! We will now begin the simulation. Leaving 'out of character' mode, no further commentary needed. Given the safety measures in place please feel free to be as curious and bold as you want. Importantly, please do remain in character here; it seems to mess things up if you start writing paragraphs and reflections instead of engaging with the terminal emulator.</OOC>\n\nsimulator@{lm2_company}:~/$");

  let currentSpeaker = 'cliAgent';

  // Create training_data folder if not exists
  const outDir = 'training_data';
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Use a timestamp runId to differentiate runs
  const runId = Date.now();
  const fullOutFile = path.join(outDir, `training_data_full_${runId}.jsonl`);
  const turnOutFile = path.join(outDir, `training_data_turns_${runId}.jsonl`);

  // Ensure output files exist
  if (!fs.existsSync(fullOutFile)) {
    fs.writeFileSync(fullOutFile, '');
  }
  if (!fs.existsSync(turnOutFile)) {
    fs.writeFileSync(turnOutFile, '');
  }

  while (true) {
    const speaker = currentSpeaker === 'cliUser' ? cliUser : cliAgent;
    const listener = currentSpeaker === 'cliUser' ? cliAgent : cliUser;

    const result = await speaker.run();
    if (!result.success) {
      console.error('Error generating response:', result.error);
      break;
    }

    const assistantMessage = speaker.getLastAgentMessage();
    if (!assistantMessage) {
      console.error('No assistant message produced');
      break;
    }

    const assistantContent = assistantMessage.content || "";
    listener.addUserMessage(assistantContent);

    // FULL conversation record
    const fullRecord = {
      messages: speaker.getFullChatHistory().map(m => ({role: m.role, content: m.content || ""}))
    };
    fs.appendFileSync(fullOutFile, JSON.stringify(fullRecord) + "\n");

    // SINGLE TURN record
    const fullHistory = speaker.getFullChatHistory();
    const lastAssistantIndex = fullHistory.length - 1; // last message is assistant
    const lastAssistant = fullHistory[lastAssistantIndex];
    const lastUserIndex = lastAssistantIndex - 1;
    const lastUser = fullHistory[lastUserIndex];

    if (lastUser && lastAssistant) {
      const turnRecord = {
        messages: [
          {role: lastUser.role, content: lastUser.content || ""},
          {role: lastAssistant.role, content: lastAssistant.content || ""}
        ]
      };
      fs.appendFileSync(turnOutFile, JSON.stringify(turnRecord) + "\n");
    }

    // Switch speaker
    currentSpeaker = (currentSpeaker === 'cliUser') ? 'cliAgent' : 'cliUser';
  }
}

main().catch(error => {
  console.error('Error in main:', error);
  process.exit(1);
});