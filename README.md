# Feather - A lightweight agent framework

![Feather Logo](https://github.com/user-attachments/assets/be78639b-6c4b-4143-bff1-b246ec0f70f6)

<div align="center">

[![Made with Bun](https://img.shields.io/badge/Made%20with-Bun-orange.svg)](https://bun.sh)
[![Discord](https://img.shields.io/badge/Discord-Join%20AI%20University-7289da.svg)](https://discord.gg/amR4AEjqh4)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

I don't need layers of abstraction. Base LLMs are very capable. Feather lightly defines agents with tools that auto-execute.

Chaining agents together with Feather looks like this:

```typescript
const timelineData = twitterAgent.run("Get 50 tweets from my AI list and summarize it for me")
const videoScript = videoScriptAgent.run('Create me a video script based on todays AI news:' + timelineData.output)
```

## DEBUG GUI 
Feather comes with an optional GUI that displays detailed log of the agent's system prompt, message history, and LLM requests/responses that went into each assistant message.

<img width="1727" alt="image" src="https://github.com/user-attachments/assets/079a3a13-3d58-4882-abe1-5d28aa818334" />

## OPENROUTER
We use OpenRouter for LLM calls, which uses the OpenAI SDK 1:1. This allows us to use ANY model with ease! While it is a centralized service, it is the easiest, most cost effective way to get access to the latest models instantly and switch models with ease. Also, they accept crypto. If OpenRouter ever goes down, we can switch without trouble as the base SDK is OpenAI.

https://openrouter.ai/

## OPENPIPE
We use OpenPipe for collecting training data of agents. This is optional, but HIGHLY recommended for any agent that is used in production. Your data is GOLD, make sure to mine it!

https://openpipe.ai/

## CREATING AN AGENT

Creating an agent is easy:

```typescript
const internetAgent = new FeatherAgent({
    model: "deepseek/deepseek-chat",
    systemPrompt: "You are a helpful assistant that can browse the internet", 
    tools: [internetTool],
})
```

Running an agent is easier:

```typescript
const result = internetAgent.run("What's the latest quantum chip that dropped? How does it advance AI?")
logger.info("Internet Agent said:", result.output)
```

### FeatherAgent Parameters

Required:
- `systemPrompt` (string) - Core instructions that define the agent's behavior

Optional:
- `model` (string) - LLM model to use (defaults to "openai/gpt-4o")
- `agentId` (string) - Unique ID for the agent (auto-generates if not provided) 
- `tools` (ToolDefinition[]) - Tools the agent can use (cannot use with structuredOutputSchema)
- `structuredOutputSchema` (object) - Schema for structured output (cannot use with tools)
- `cognition` (boolean) - Enables `<think>, <plan>, <speak>` XML tags
- `additionalParams` (object) - Extra LLM API parameters (temperature etc.)
- `debug` (boolean) - Enables debug GUI monitoring
- `dynamicVariables` (object) - Functions that return strings, executed on each .run() call

### MODIFYING AN AGENT'S MESSAGE HISTORY
You can modify an agent's message history with the following methods:

```typescript
// Adding messages
agent.addUserMessage("Hello, how are you? Do you like my hat?", {images: ["https://example.com/blueHat.jpg"]}) // image optional
agent.addAssistantMessage("I am fine, thank you! Nice blue hat! Looks good on you!")

// Loading in custom message history
const history = [{role: "user", content: "Hello, how are you? Do you like my hat?", images: [{url: "https://example.com/blueHat.jpg"}]}, {role: "assistant", content: "I am fine, thank you! Nice blue hat! Looks good on you!"}] // array of messages
agent.loadHistory(history) // loads the chat history from an array of messages

// Extracting current message history
agent.extractHistory() // returns the chat history as an array of messages
```

### COGNITION
Cognition is the process of the agent thinking, planning, and speaking. It is enabled by the cognition property in the agent config. What is does is add forced instructions at the end of the agent's system prompt to use XML tags to think, plan, and speak. These XML tags are parsed and executed by the agent. `<think>...</think>`, `<plan>...</plan>`, `<speak>...</speak>` are the tags used. `<speak>` tags are parsed and returned as the agent's response.

I find that cognition is a great way to get increased accuracy and consistency with tool usage.

### TOOL USE
Tool calls (also known as function calling) allow you to give an LLM access to external tools.

Feather expects your tool to be defined WITH the function execution and output ready to go. By default, tools auto-execute - when giving an agent a tool, the agent will execute the tool, get the results saved in its chat history, then re-run itself to provide the user a detailed response with the information from the tool result.

However, you can disable auto-execution by setting `autoExecuteTools: false` in the agent config. In this case, tool calls will be available in the `functionCalls` property of the response, allowing for manual handling:

```typescript
const manualAgent = new FeatherAgent({
  systemPrompt: "You are a math tutor who can do calculations",
  tools: [calculatorTool],
  autoExecuteTools: false // Disable auto-execution
});

const res = await manualAgent.run("What is 42 * 73?");
console.log("Agent response:", res.output);
console.log("Tool calls to handle:", res.functionCalls);
// functionCalls contains array of: { functionName: string, functionArgs: any }
```

Parallel tool calls are supported in both auto and manual execution modes.

Setting up a tool function call following OpenAI structure + Execution
```typescript
const internetTool: ToolDefinition = {
  type: "function",
  function: {
    name: "search_internet",
    description: "Search the internet for up-to-date information using Perplexity AI",
    parameters: {
      type: "object", 
      properties: {
        query: {
          type: "string",
          description: "The search query to look up information about"
        }
      },
      required: ["query"]
    }
  },
  // Execute function to search using Perplexity AI
  async execute(args: Record<string, any>): Promise<{ result: string }> {
    logger.info({ args }, "Executing internet search tool");
    
    try {
      const params = typeof args === 'string' ? JSON.parse(args) : args;
      if (typeof params.query !== 'string') {
        throw new Error("Query must be a valid string");
      }

      // Call Perplexity API to get search results
      const searchResult = await queryPerplexity(params.query);
      
      return { result: searchResult };

    } catch (error) {
      logger.error({ error, args }, "Internet search tool error");
      throw error;
    }
  }
};
```

### STRUCTURED OUTPUT
If you are using structured output instead of tools, the .run() function will return the structured output as a JSON object.

```typescript
  // Create a structured output agent with a specific schema
  // Note the generic type <{ answer: string; confidence: number }>
  const agent = new FeatherAgent<{ answer: string; confidence: number }>({
    agentId: "structured-test",
    model: "openai/gpt-4o",
    systemPrompt: "You are a helpful assistant that provides accurate, structured responses.",
    structuredOutputSchema: {
      name: "weather",
      strict: true,
      schema: {
        type: "object",
        properties: {
          answer: {
            type: "string", 
            description: "A concise answer to the user's question"
          },
          confidence: {
            type: "number",
            description: "A confidence score between 0 and 1"
          }
        },
        required: ["answer", "confidence"],
        additionalProperties: false
      }
    },
    debug: true
  });

  const userMessage = "What is the capital of France?";
  // The agent should produce a structured JSON answer
  const result = await agent.run(userMessage);

  if (result.success) {
    // Log full structured response
    console.log("Full structured response:", result.output);
    
    // result.output is now typed as { answer: string; confidence: number }
    const answer = result.output.answer;
    const confidence = result.output.confidence;
    
    console.log("Just the answer:", answer);
    console.log("Just the confidence:", confidence);
  } else {
    console.error("Agent error:", result.error);
  }
```

### DYNAMIC VARIABLES
Dynamic variables allow you to inject real-time data into your agent's system prompt. These variables are functions that return strings and are executed every time the agent's `.run()` method is called. This ensures your agent always has access to the most up-to-date information.

```typescript
// Create an agent with dynamic variables
const agent = new FeatherAgent({
  systemPrompt: "You are a helpful assistant that knows the current time.",
  model: "openai/gpt-4o",
  dynamicVariables: {
    currentTime: () => new Date().toLocaleString(), // Updates every .run() call
    activeUsers: () => getActiveUserCount(), // Custom function example
  }
});

// The dynamic variables will be injected into the system prompt under "## DYNAMIC VARIABLES"
// currentTime: 12/25/2023, 3:45:00 PM
// activeUsers: 1,234
```

Dynamic variables are perfect for:
- Injecting real-time data (time, date, metrics)
- System status information
- User context that changes frequently
- Any data that needs to be fresh each time the agent runs