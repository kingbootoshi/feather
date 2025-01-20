# FEATHER DOCS - A lightweight agent framework

I don't need layers of abstraction. Base LLMs are very capable. Feather lightly defines agents with tools that auto-execute.

Chaining agents together with Feather looks like this:

```typescript
const timelineData = twitterAgent.run("Get 50 tweets from my AI list and summarize it for me")
const videoScript = videoScriptAgent.run('Create me a video script based on todays AI news:' + timelineData.output)
```

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

The output comes from the .output property of the agent run.
Agent run has the following properties:

```typescript
interface AgentRunResult<TOutput> {
  // Whether the agent run completed successfully
  success: boolean;

  // The main output from the agent run
  // Type depends on agent configuration:
  // - string for normal text output
  // - TOutput for structured output (if structuredOutputSchema is used)
  // - Record<string, any> for JSON responses
  output: TOutput;

  // Only present if there was an error during the run
  error?: string;

  // Only present if autoExecuteTools is false and the agent wants to use tools
  functionCalls?: Array<{
    functionName: string;    // Name of the tool/function to call
    functionArgs: any;       // Arguments for the tool/function
  }>;
}
```

### FeatherAgent Parameters

Required:
- `systemPrompt` (string) - Core instructions that define the agent's behavior

Optional:
- `model` (string) - LLM model to use (defaults to "openai/gpt-4o")
- `agentId` (string) - Unique ID for the agent (auto-generates if not provided) 
- `dynamicVariables` (object) - Functions that return strings, executed on each .run() call
- `tools` (ToolDefinition[]) - Tools the agent can use (cannot use with structuredOutputSchema)
- `autoExecuteTools` (boolean) - Whether to auto-execute tool calls (default: true)
- `cognition` (boolean) - Enables `<think>, <plan>, <speak>` XML tags
- `chainRun` (boolean) - Enables chain running mode with finish_run tool
- `maxChainIterations` (number) - Maximum iterations for chain running (default: 5)
- `structuredOutputSchema` (object) - Schema for structured output (cannot use with tools or cognition)
- `additionalParams` (object) - Extra LLM API parameters (temperature etc.)
- `debug` (boolean) - Enables debug GUI monitoring
- `forceTool` (boolean) - Forces the agent to use exactly one tool (requires exactly one tool in tools array, cannot be used with chainRun)

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
  forceTool: true, // forces the agent to use this tool instantly and return the result
  autoExecuteTools: false // Disable auto-execution
});

const res = await manualAgent.run("What is 42 * 73?");
console.log("Agent response:", res.output);
console.log("Tool calls to handle:", res.functionCalls);
// functionCalls contains array of: { functionName: string, functionArgs: any }
```

example log of res:
```typescript
DEBUG: Agent response (manual execution)
    res: {
      "success": true,
      "output": "", // sometimes output is empty because the AI agent just decides to use a tool, which is completely fine.
      "functionCalls": [
        {
          "functionName": "calculator",
          "functionArgs": "{\"num1\":1294,\"num2\":9966,\"operation\":\"multiply\"}"
        }
      ]
    }
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

### FORCED TOOL USAGE
You can force an agent to use exactly one tool by enabling the `forceTool` parameter. This is useful when you want to ensure the agent uses a specific tool for a task.

```typescript
const searchAgent = new FeatherAgent({
  systemPrompt: "You are a search assistant that always searches for information.",
  tools: [searchTool], // Must provide exactly ONE tool
  forceTool: true     // Forces the agent to use searchTool
});

// The agent will ALWAYS use searchTool, no matter what the user asks
const result = await searchAgent.run("Tell me about quantum computers");
```

Requirements for forced tool usage:
- Must provide exactly ONE tool in the tools array
- Cannot be used with chainRun (as it returns after one tool use)
- The agent will be forced to use the tool regardless of the query

### CHAIN RUNNING
Chain running allows an agent to execute multiple tools in sequence until it decides to finish. This is useful for complex tasks that require multiple steps or tool calls.

The agent is given a `finish_run` tool that it must call to finish, with a 'final_response' string property that the agent fills out to output it's final response to the .run() command.

```typescript
const researchAgent = new FeatherAgent({
  systemPrompt: "You are a research assistant that can search and summarize information.",
  tools: [searchTool, summarizeTool],
  cognition: true, // <--- cognition + chain running is bread and butter
  chainRun: true, // Enable chain running
  maxChainIterations: 10 // Optional: Set max iterations (default: 5)
});

// The agent will automatically:
// 1. Execute tools in sequence
// 2. Process each tool's results
// 3. Decide if more tool calls are needed
// 4. Call finish_run when complete
const research = await researchAgent.run("Research the latest developments in quantum computing");
console.log(research.output); // Final summarized research
```

When chainRun is enabled:
- The agent gains access to a `finish_run` tool
- The agent MUST call `finish_run` to complete its execution
- The agent can execute up to maxChainIterations tools (default: 5)
- The final response from `finish_run` becomes the .output of run()

This ensures consistent and reliable multi-step tool execution flows.

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

You can use the `{{variableName}}` syntax to specify exactly where in your system prompt the dynamic variable should be injected:

```typescript
// Create an agent with dynamic variables and custom placement
const agent = new FeatherAgent({
  systemPrompt: indentNicely`
    You are a helpful assistant that knows the current time.
    Right now, the time is: {{currentTime}}
    
    There are currently {{activeUsers}} users online.
  `,
  model: "openai/gpt-4o",
  dynamicVariables: {
    currentTime: () => new Date().toLocaleString(), // Updates every .run() call
    activeUsers: () => getActiveUserCount(), // Custom function example
  }
});

// The dynamic variables will be injected exactly where specified in the system prompt
// You are a helpful assistant that knows the current time.
// Right now, the time is: 12/25/2023, 3:45:00 PM
// 
// There are currently 1,234 users online.
```

Dynamic variables are perfect for:
- Injecting real-time data (time, date, metrics)
- System status information
- User context that changes frequently
- Any data that needs to be fresh each time the agent runs

### STRING UTILITIES
Feather comes with utility functions to help with common string operations:

#### indentNicely
A template literal tag that normalizes indentation in multi-line strings. It removes leading/trailing empty lines and normalizes indentation based on the first non-empty line:

```typescript
import { indentNicely } from './utils';

const myText = indentNicely`
    This text will have
    consistent indentation
        even with nested levels
    regardless of how it's
    formatted in the source code
`;

// Output:
// This text will have
// consistent indentation
//     even with nested levels
// regardless of how it's
// formatted in the source code
```

This is particularly useful for:
- Writing system prompts with clean formatting
- Generating code with proper indentation
- Creating multi-line text templates
- Maintaining readable source code while producing clean output

# LOGGING

We use the PINO logger for logging with the pino-pretty plugin. Please log everything with depth

- Use info to log the flow of the program
- Use debug to log more detailed and full outputs
- Use error to log errors

# COMMENTING
We must leave DETAILED comments in the code explaining the flow of the program and how we move step by step.

# DEBUG TERMINAL GUI
Feather comes with an optional GUI that displays the agent's current system prompt, the messages in it's chat history, the user input and the agent's output, and any detailed information about the run.