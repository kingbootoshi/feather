/**
 * Core imports for OpenAI integration, logging, and type definitions
 */
import OpenAI from "openpipe/openai";
import { logger } from '../logger/logger';
import {
  Message,
  ToolDefinition,
  FunctionCall,
  AgentRunResult,
  ContentPart
} from '../types/types';
import { ChatCompletionMessageParam, ResponseFormatJSONSchema } from 'openai/resources';
import { agentEventBus } from '../gui/agentEventBus';
import { debugGuiServer } from '../gui/debugGuiServer';

/**
 * Configuration interface for setting up a FeatherAgent.
 * @template TOutput - Type parameter for structured output format
 */
interface FeatherAgentConfig<TOutput = string | Record<string, any>> {
  agentId?: string;                                     // Unique identifier for the agent instance
  systemPrompt: string;                                 // Initial system prompt that defines agent behavior
  model?: string;                                       // LLM model to use (defaults to GPT-4)
  cognition?: boolean;                                  // Enable think/plan/speak XML tags
  tools?: ToolDefinition[];                             // Array of tools the agent can use
  structuredOutputSchema?: Record<string, any>;         // JSON schema for structured output
  additionalParams?: Record<string, any>;               // Additional parameters for LLM API calls
  debug?: boolean;                                      // Enable debug GUI for monitoring

  /**
   * If true, automatically execute tool calls when the LLM requests them.
   * If false, return the function calls in the output without executing.
   */
  autoExecuteTools?: boolean;

  /**
   * Optional dynamic variables that are functions returning strings.
   * They will be placed into the system prompt under "## DYNAMIC VARIABLES"
   * each time run() is called.
   */
  dynamicVariables?: {
    [variableName: string]: () => string;
  };
}

/**
 * FeatherAgent is responsible for orchestrating conversation flows with an LLM,
 * optionally using tools, and optionally supporting a debug GUI.
 * @template TOutput - Type parameter for structured output if structuredOutputSchema is used
 */
let agentCounter = 0;  // Global counter to generate unique agent IDs
export class FeatherAgent<TOutput = string | Record<string, any>> {
  // Core message handling
  private messages: Message[] = [];                     // Conversation history
  private tools: ToolDefinition[] = [];                 // Available tools
  private config: FeatherAgentConfig<TOutput>;          // Agent configuration
  private openai: OpenAI;                               // OpenAI client instance
  
  // Debug and logging
  private agentRegistered: boolean = false;             // Debug GUI registration status
  private agentLog: string[] = [];                      // Debug log entries
  private llmCallIteration: number = 0;                 // Counter for LLM API calls
  private agentId: string;                              // Unique agent identifier
  
  // System prompt management
  private baseSystemPrompt: string;                     // Original system prompt without dynamic content

  /**
   * Initializes a new FeatherAgent instance with the provided configuration.
   * Sets up OpenAI client, validates API keys, and initializes debug GUI if enabled.
   * @param config - Configuration object for the agent
   * @throws Error if OpenRouter API key is missing or if incompatible options are provided
   */
  constructor(config: FeatherAgentConfig<TOutput>) {
    this.config = config;
    this.tools = config.tools || [];
    this.agentId = config.agentId || `agent-${++agentCounter}`;

    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("No OpenRouter API key provided in config or environment!");
    }
    if (!process.env.OPENPIPE_API_KEY) {
      logger.warn("No OpenPipe API key provided in config or environment! The agent will run but no data will be captured.");
    }

    if (config.cognition && config.structuredOutputSchema) {
      throw new Error("Cannot use both cognition and structuredOutputSchema - they are mutually exclusive.");
    }

    logger.info("Initializing FeatherAgent...");

    this.openai = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
      ...(process.env.OPENPIPE_API_KEY && {
        openpipe: {
          apiKey: process.env.OPENPIPE_API_KEY
        }
      })
    });

    // Store the base system prompt
    this.baseSystemPrompt = config.systemPrompt;

    // We initially push a placeholder system message; will be updated before each run()
    this.messages.push({ role: 'system', content: "" });

    if (config.debug) {
      debugGuiServer.startServer();
      agentEventBus.registerAgent(this.agentId, this);
      this.agentRegistered = true;
    }
  }

  /**
   * Builds the complete system prompt by combining:
   * 1. Base system prompt
   * 2. Dynamic variables (if any)
   * 3. Output format instructions (for cognition or structured output)
   * @returns The complete system prompt string
   */
  private buildSystemPrompt(): string {
    let finalSystemPrompt = this.baseSystemPrompt;

    // If dynamicVariables exist, generate them
    if (this.config.dynamicVariables) {
      finalSystemPrompt += "\n\n## DYNAMIC VARIABLES - Variables updated in your system prompt every single time you are executed.\n";
      const keys = Object.keys(this.config.dynamicVariables);
      for (const key of keys) {
        const fn = this.config.dynamicVariables[key];
        try {
          const val = fn();
          finalSystemPrompt += `${key}: ${val}\n`;
        } catch (err: any) {
          logger.error(err, `Error executing dynamic variable: ${key}`);
          finalSystemPrompt += `${key}: [Error retrieving dynamic variable]\n`;
        }
      }
    }

    // If cognition is enabled, instruct the LLM to produce <think>,<plan>,<speak> tags.
    if (this.config.cognition) {
      const instructions = `\n\n# OUTPUT FORMAT\n\nYou are capable of cognition. To think, plan, and speak before executing tools, YOU MUST output the following schema:\n<think>\n*your internal thoughts*\n</think>\n<plan>\n*your plan*\n</plan>\n<speak>\n*what you say to the user*\n</speak>`;
      finalSystemPrompt += instructions;
    }
    // If structured output is enabled, format and append the schema instructions
    else if (this.config.structuredOutputSchema) {
      const schema = this.config.structuredOutputSchema.schema || this.config.structuredOutputSchema;
      const schemaStr = JSON.stringify(schema.properties || {}, null, 2);
      const requiredStr = JSON.stringify(schema.required || []);
      const exampleOutput = Object.keys(schema.properties || {}).reduce((acc, key) => {
        acc[key] = "...";
        return acc;
      }, {} as Record<string, string>);
      const exampleStr = JSON.stringify(exampleOutput);
      const instructions = `\n\n# OUTPUT FORMAT\nYou MUST follow this schema:\n\n${schemaStr}\n\nRequired fields: ${requiredStr}\n\nYour output MUST look exactly like this:\n${exampleStr}`;
      finalSystemPrompt += instructions;
    }

    return finalSystemPrompt;
  }

  /**
   * Adds a user message to the conversation history.
   * Supports both text and image content following OpenRouter's schema.
   * Updates debug GUI if enabled.
   * @param content - The text content of the message
   * @param options - Optional parameters including image URLs
   */
  public addUserMessage(content: string, options?: { images?: string[] }) {
    logger.debug({ content, images: options?.images }, "FeatherAgent.addUserMessage");

    // Format the content according to OpenRouter's schema
    const formattedContent: ContentPart[] = [
      {
        type: 'text',
        text: content
      }
    ];

    // Add images if provided
    if (options?.images) {
      formattedContent.push(
        ...options.images.map(url => ({
          type: 'image_url' as const,
          image_url: {
            url
          }
        }))
      );
    }

    this.messages.push({
      role: 'user',
      content: formattedContent
    });

    this.logEntry(`USER: ${content}${options?.images ? ` (with ${options.images.length} image${options.images.length > 1 ? 's' : ''})` : ''}`);
    if (this.agentRegistered) {
      agentEventBus.updateChatHistory(this.getAgentId(), this.messages);
    }
  }

  /**
   * Adds an assistant (LLM) message to the conversation history.
   * Updates debug GUI if enabled.
   * @param content - The text content of the assistant's message
   */
  public addAssistantMessage(content: string) {
    logger.debug({ content }, "FeatherAgent.addAssistantMessage");
    this.messages.push({ role: 'assistant', content });
    this.logEntry(`ASSISTANT: ${content}`);
    if (this.agentRegistered) {
      agentEventBus.updateChatHistory(this.getAgentId(), this.messages);
    }
  }

  /**
   * Returns a defensive copy of the conversation history.
   * @returns Array of Message objects representing the conversation
   */
  public getMessages() {
    return [...this.messages];
  }

  /**
   * Main execution method that:
   * 1. Processes user input
   * 2. Updates system prompt with dynamic variables
   * 3. Makes LLM API calls
   * 4. (Optionally) handles tool execution
   * 5. Processes structured output
   * 
   * Supports multiple iterations for tool usage, up to maxIterations, if auto-execution is enabled.
   * 
   * @param userInput - Optional new user input to process
   * @returns Promise resolving to AgentRunResult containing success status, output, and functionCalls (if any)
   */
  public async run(userInput?: string): Promise<AgentRunResult<TOutput>> {
    // If user provided new input at run time, add it
    if (userInput) {
      this.addUserMessage(userInput);
    }

    // Before calling the LLM, update the system message with any dynamic variables
    const newSystemPrompt = this.buildSystemPrompt();
    // Ensure the first message is always the system message
    this.messages[0].content = newSystemPrompt;

    if (this.agentRegistered) {
      agentEventBus.updateSystemPrompt(this.getAgentId(), newSystemPrompt);
    }

    let iterationCount = 0;
    const maxIterations = 5;
    const autoExec = this.config.autoExecuteTools !== false;

    while (iterationCount < maxIterations) {
      iterationCount++;
      this.llmCallIteration++;
      logger.info({ iterationCount }, "FeatherAgent.run - LLM call iteration");
      this.logEntry(`--- LLM call iteration #${iterationCount} ---`);

      const toolDefs = this.tools.map(t => ({
        type: 'function' as const,
        function: {
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters
        }
      }));

      const callParams = {
        model: this.config.model || "openai/gpt-4o",
        messages: this.messages.map(m => ({
          role: m.role,
          content: m.content || '',
          metadata: {
            agent_id: this.config.agentId || 'default',
          }
        })) as ChatCompletionMessageParam[],
        tools: toolDefs,
        tool_choice: 'auto' as const,
        ...(this.config.structuredOutputSchema && {
          response_format: {
            type: "json_schema",
            json_schema: this.config.structuredOutputSchema
          } as ResponseFormatJSONSchema
        }),
        ...this.config.additionalParams
      };

      logger.debug({ callParams }, "FeatherAgent.run - callParams");

      logger.debug({
        event: 'llm_request',
        model: callParams.model,
        messages: callParams.messages,
        tools: callParams.tools,
        params: this.config.additionalParams
      }, "LLM API Request Data");
      this.logEntry(`LLM REQUEST:\n${JSON.stringify(callParams, null, 2)}`);

      if (this.agentRegistered) {
        agentEventBus.storeLlmRequest(this.getAgentId(), {
          iteration: this.llmCallIteration,
          requestData: callParams
        });
      }

      let response;
      try {
        response = await this.openai.chat.completions.create(callParams);
        logger.debug({
          event: 'llm_response',
          response_id: response.id,
          model: response.model,
          usage: response.usage,
          choices: response.choices,
          created: response.created
        }, "LLM API Response Data");
        this.logEntry(`LLM RESPONSE:\n${JSON.stringify(response, null, 2)}`);

        if (this.agentRegistered) {
          agentEventBus.storeLlmResponse(this.getAgentId(), this.llmCallIteration, {
            responseData: response
          });
        }
      } catch (err: any) {
        logger.error(err, "Error from OpenRouter call");
        const errorMsg = err.message || "Unknown LLM error";
        this.logEntry(`ERROR: ${errorMsg}`);
        if (this.agentRegistered) {
          agentEventBus.updateAgentError(this.getAgentId(), errorMsg);
        }
        return { success: false, output: "" as any, error: errorMsg };
      }

      if (!response.choices || response.choices.length === 0) {
        const noRespErr = "No response from model";
        this.logEntry(`ERROR: ${noRespErr}`);
        if (this.agentRegistered) {
          agentEventBus.updateAgentError(this.getAgentId(), noRespErr);
        }
        return { success: false, output: "" as any, error: noRespErr };
      }

      const choice = response.choices[0];
      if (!choice.message) {
        const noMsgErr = "No message in model choice";
        this.logEntry(`ERROR: ${noMsgErr}`);
        if (this.agentRegistered) {
          agentEventBus.updateAgentError(this.getAgentId(), noMsgErr);
        }
        return { success: false, output: "" as any, error: noMsgErr };
      }

      const content = choice.message.content || "";
      logger.debug({ content }, "LLM assistant message content");
      this.logEntry(`RAW LLM content:\n${content}\n`);
      this.addAssistantMessage(content);

      let functionCalls: FunctionCall[] = [];
      if (choice.message.tool_calls && Array.isArray(choice.message.tool_calls)) {
        functionCalls = choice.message.tool_calls.map(tc => ({
          functionName: tc.function.name,
          functionArgs: tc.function.arguments || {}
        }));
      }

      // If no function calls, this might be final
      if (functionCalls.length === 0) {
        let finalOutput = content.trim();

        if (this.config.cognition) {
          const speakMatch = content.match(/<speak>([\s\S]*?)<\/speak>/);
          finalOutput = speakMatch ? speakMatch[1].trim() : finalOutput;
        }

        if (this.config.structuredOutputSchema) {
          try {
            const parsed = JSON.parse(finalOutput);
            this.logEntry(`FINAL OUTPUT (parsed JSON): ${JSON.stringify(parsed, null, 2)}`);
            return { success: true, output: parsed as TOutput };
          } catch {
            // fallback to plain text
          }
        }

        this.logEntry(`FINAL OUTPUT: ${finalOutput}`);
        return { success: true, output: finalOutput as TOutput };
      }

      // If function calls exist and auto-execution is disabled, return them immediately
      if (!autoExec) {
        // Return calls for manual handling
        this.logEntry("Tool calls detected but autoExecuteTools = false. Returning calls without execution.");
        let finalOutput = content.trim();
        if (this.config.cognition) {
          const speakMatch = content.match(/<speak>([\s\S]*?)<\/speak>/);
          if (speakMatch) {
            finalOutput = speakMatch[1].trim();
          }
        }
        return {
          success: true,
          output: finalOutput as TOutput,
          functionCalls
        };
      }

      // Otherwise, auto-execute each tool call
      logger.info("Detected function calls, executing tools...");
      this.logEntry(`Detected function calls: ${JSON.stringify(functionCalls)}`);

      const results = await Promise.all(
        functionCalls.map(async fc => {
          const toolDef = this.tools.find(t => t.function.name === fc.functionName);
          if (!toolDef) {
            logger.error(`No tool found with name: ${fc.functionName}`);
            const toolErr = `Tool ${fc.functionName} not found`;
            this.logEntry(toolErr);
            return toolErr;
          }
          try {
            const toolResult = await toolDef.execute(fc.functionArgs);
            const msg = `TOOL ${fc.functionName} ARGS=${JSON.stringify(fc.functionArgs)} RESULT=${JSON.stringify(toolResult)}`;
            this.logEntry(msg);
            return JSON.stringify({ tool: fc.functionName, result: toolResult });
          } catch (err: any) {
            logger.error(err, `Error executing tool: ${fc.functionName}`);
            const errorRes = `Error in tool ${fc.functionName}: ${err.message}`;
            this.logEntry(errorRes);
            return errorRes;
          }
        })
      );

      // Add tool results to conversation as user messages
      for (const r of results) {
        this.messages.push({
          role: 'user',
          content: r
        });
        this.logEntry(`USER (Tool Output): ${r}`);
      }

      if (this.agentRegistered) {
        agentEventBus.updateChatHistory(this.getAgentId(), this.messages);
      }
      // Continue the loop to let the LLM respond to these new user messages
    }

    // If we exceed max iterations:
    const maxIterErr = "Max iterations reached";
    logger.error(maxIterErr);
    this.logEntry(`ERROR: ${maxIterErr}`);
    if (this.agentRegistered) {
      agentEventBus.updateAgentError(this.getAgentId(), maxIterErr);
      agentEventBus.updateAgentLog(this.getAgentId(), this.agentLog);
    }
    return { success: false, output: "" as any, error: maxIterErr };
  }

  /**
   * Returns the unique identifier for this agent instance.
   * Used primarily for debug GUI and logging purposes.
   */
  private getAgentId(): string {
    return this.agentId;
  }

  /**
   * Adds a timestamped entry to the agent's debug log.
   * Updates the debug GUI if enabled.
   * @param entry - The log entry text to add
   */
  private logEntry(entry: string) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${entry}`;
    this.agentLog.push(line);
    if (this.agentRegistered) {
      agentEventBus.updateAgentLog(this.getAgentId(), this.agentLog);
    }
  }
}