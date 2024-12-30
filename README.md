# Feather - A lightweight agent framework

![MqjPz_tbYXE7gXHwFcIfu_2767cccdff114ba2a448309a43b00ed5](https://github.com/user-attachments/assets/8d4bcc5a-61af-44f1-9b9e-8e0524201524)

Create an agent and run it with agent.run("input text"). The result returns the agent's response.

- **Base**: OpenRouter + OpenPipe, use any model & save training data.
- **Simple Config**: Choose model & system prompt. System prompt can manage dynamic variables, which are updated every .run() execution
- **Cognition**: Option to enable XML tags which allow the agent to generate thinking/planning tags before executing that are automaticallyparsed.
- **Structured Output**: Option over tools.
- **Tools**: Can equip with tools, automatically handle executing tools, adding results to agent chat history, then re-running the agent to provide the user the result, or even continue with another tool until it's done
- **Control message history** - add messages (with images), load chat history, or extract chat history for chat manipulation & management

Chaining agents together looks like:

```typescript
const timelineData = twitterAgent.run("Get 50 tweets from my AI list and summarize it for me")
const videoScript = videoScriptAgent.run('Create me a video script based on todays AI news:' + timelineData)
```

## OPENROUTER
We use OpenRouter for LLM calls, which uses the Openai SDK 1:1. While it is a centralized service, it is the easiest, most cost effective way to get access to the latest models instantly and switch models with ease. Also, they accept crypto. If OpenRouter ever goes down, we can easily switch as the base SDK is OpenAI.

https://openrouter.ai/

## OPENPIPE
We use OpenPipe for collecting training data of agents. This is optional, but HIGHLY recommended for any agent that is used in production. Your data is GOLD, make sure to mine it!

https://openpipe.ai/

## CREATING AN AGENT

```typescript
const agent = new Agent({
model: "openai/gpt-4o-mini", // REQUIRED
parameters: {
    temperature: 0.5,
    max_tokens: 1000,
    top_p: 0.95,
    frequency_penalty: 0,
    presence_penalty: 0,
}, // OPTIONAL
systemPrompt: "You are a helpful assistant", // REQUIRED
tools: [internetTool], // OPTIONAL, TAKES DOMINANCE OVER STRUCTURED OUTPUT
structuredOutput: {
    type: "json_object",
    properties: {
        summary: { type: "string" },
        news: { type: "string" },
    }
}, // OPTIONAL, ONLY IF TOOLS ARE NOT USED !! 
cognition: true, // OPTIONAL, ENABLES THINK/PLAN/SPEAK XML TAG PROCESS
debug: true, // OPTIONAL, ENABLES DEBUG GUI
})
```

Running an agent is simpler:

```typescript
const result = agent.run("What is the mitochondria of the cell?")
console.log(result.content)

// result is an object with the following properties:
// content: string - the agent's response, parse if structured output is used
// tool_calls: any[] - the function calls used by the agent for that call
```

## MODIFYING AN AGENT'S MESSAGE HISTORY
You can modify an agent's message history with the following methods:

```typescript
// Adding messages
agent.addUserMessage("Hello, how are you? Do you like my hat?", {image: "https://example.com/blueHat.jpg"}) //image optional
agent.addAssistantMessage("I am fine, thank you! Nice blue hat! Looks good on you!")

// Extracting current message history
agent.extractHistory() //returns the chat history as an array of messages

// Loading in custom message history
const history = [{role: "user", content: "Hello, how are you? Do you like my hat?", image: "https://example.com/blueHat.jpg"}, {role: "assistant", content: "I am fine, thank you! Nice blue hat! Looks good on you!"}] //array of messages
agent.loadHistory(history) //loads the chat history from an array of messages
```

## COGNITION
Cognition is the process of the agent thinking, planning, and speaking. It is enabled by the cognition property in the agent config. What is does is add forced instructions at the end of the agent's system prompt to use XML tags to think, plan, and speak. These XML tags are parsed and executed by the agent. <think>...</think>, <plan>...</plan>, <speak>...</speak> are the tags used. <speak> tags are parsed and returned as the agent's response.

## TOOL USE
Tool calls (also known as function calling) allow you to give an LLM access to external tools. The LLM does not call the tools directly. Instead, it suggests the tool to call. Usually, it's up to the user to call the tool separately and provide the results back to the LLM. Finally, the LLM formats the response into an answer to the user's original question.

Using Feather, we expect your tool to be defined WITH the function execution and output ready to go. This way, when giving an agent a tool, the agent can execute the tool, get the results saved back in it's chat history, then re-run itself to provide the user a detailed response with the information from the tool result.

Parallel tool calls are supported.

Setting up a tool function call following OpenAI structure + Excecution
```typescript
const calculatorTool: ToolDefinition = {
  type: "function",
  function: {
    name: "calculator",
    description: "Performs basic arithmetic operations between two numbers",
    parameters: {
      type: "object",
      properties: {
        num1: {
          type: "number",
          description: "The first number in the calculation"
        },
        num2: {
          type: "number",
          description: "The second number in the calculation"
        },
        operation: {
          type: "string",
          enum: ["add", "subtract", "multiply", "divide"],
          description: "The arithmetic operation to perform"
        }
      },
      required: ["num1", "num2", "operation"]
    }
  },
  // Execute function with proper error handling and validation
  async execute(args: Record<string, any>): Promise<{ result: number }> {
    logger.info({ args }, "Executing calculator tool");
    
    try {
      const params = typeof args === 'string' ? JSON.parse(args) : args;
      if (typeof params.num1 !== 'number' || typeof params.num2 !== 'number') {
        throw new Error("Both numbers must be valid numeric values");
      }
      if (params.operation === "divide" && params.num2 === 0) {
        throw new Error("Division by zero is not allowed");
      }
      switch (params.operation) {
        case "add":
          return { result: params.num1 + params.num2 };
        case "subtract":
          return { result: params.num1 - params.num2 };
        case "multiply":
          return { result: params.num1 * params.num2 };
        case "divide":
          return { result: params.num1 / params.num2 };
        default:
          throw new Error(`Unsupported operation: ${params.operation}`);
      }
    } catch (error) {
      logger.error({ error, args }, "Calculator tool error");
      throw error;
    }
  }
};
```

## STRUCTURED OUTPUT
If you are using structured output instead of tools, the .run() function will return the structured output as a JSON object.

## DEBUG TERMINAL GUI
Feather comes with an optional GUI that displays the agent's current system prompt, the messages in it's chat history, the user input and the agent's output, and any detailed information about the run. This is enabled by the debug property in the agent config. Connect to it via localhost:3000.

<img width="1728" alt="image" src="https://github.com/user-attachments/assets/0bc53f8d-0654-47b7-866a-33c59b642e4f" />