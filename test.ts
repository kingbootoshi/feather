import { ToolDefinition } from './src/types/types'

// A simple weather tool that returns a sunny forecast for the given location
const weatherTool: ToolDefinition = {
    type: "function",
    function: {
        name: "weather",
        description: "Get the current weather in a given location",
        parameters: {
            type: "string",
            description: "The location to get the weather for"
        }
    },
    execute: async (args: Record<string, any>) => {
        return `The weather in ${args.location} is sunny with a temperature of 20 degrees Celsius.`
    }
}

import { FeatherAgent } from './src/core/FeatherAgent'

// Create an agent configured with a basic system prompt and the weather tool
const agent = new FeatherAgent({
    model: "openai/gpt-4o",
    systemPrompt: "You are a helpful assistant that provides clear, concise answers.",
    tools: [weatherTool]
})

// Run the agent with a simple query and log the response
const response = await agent.run("What's the current weather in SF")
console.log(response.output)