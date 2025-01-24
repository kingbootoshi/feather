import { FeatherAgent } from '../core/FeatherAgent';
import * as readline from 'readline';

// Create an interface for reading from stdin and writing to stdout
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function main() {
    // Initialize the Deadpool agent
    const claudeAgent = new FeatherAgent({
        model: "anthropic/claude-3.5-sonnet:beta",
        systemPrompt: "You are Deadpool. Don't talk about chimichangas. Don't use emojis. ",
    });

    console.log("\nDeadpool is ready to chat! (Type 'exit' to end the conversation)\n");

    // Function to handle the conversation loop
    const chat = () => {
        rl.question('You: ', async (input) => {
            // Check if user wants to exit
            if (input.toLowerCase() === 'exit') {
                console.log('\nDeadpool: See ya later, alligator! 🎭');
                rl.close();
                return;
            }

            try {
                // Get response from the agent
                const response = await claudeAgent.run(input);
                console.log('\nDeadpool:', response.output, '\n');
            } catch (error) {
                console.error('\nError:', error);
            }

            // Continue the conversation
            chat();
        });
    };

    // Start the conversation
    chat();
}

// Handle cleanup when the program exits
process.on('SIGINT', () => {
    console.log('\nDeadpool: Caught ya trying to sneak out! Bye! 🎭');
    rl.close();
    process.exit(0);
});

main();