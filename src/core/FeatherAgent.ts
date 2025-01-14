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
  ContentPart,
  OpenRouterParameters
} from '../types/types';
import { ChatCompletionMessageParam, ResponseFormatJSONSchema } from 'openai/resources';
import { ChatCompletionToolChoiceOption } from 'openai/resources/chat/completions';
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
  additionalParams?: OpenRouterParameters;              // OpenRouter parameters for controlling model behavior
  debug?: boolean;                                      // Enable debug GUI for monitoring

  /**
   * If true, automatically execute tool calls when the LLM requests them.
   * If false, return the function calls in the output without executing.
   */
  autoExecuteTools?: boolean;

  /**
   * Optional dynamic variables that are functions returning strings.
   * Each time run() is called, these placeholders can be injected via the
   * {{variableName}} syntax anywhere in the systemPrompt template.
   */
  dynamicVariables?: {
    [variableName: string]: () => string;
  };

  /**
   * If true, the agent must keep calling tools until it calls the finish_run tool,
   * or until maxChainIterations is reached.
   */
  chainRun?: boolean;

  /**
   * The maximum number of LLM call iterations to allow when chainRun is true.
   * Defaults to 5 if not set.
   */
  maxChainIterations?: number;

  /**
   * If true, the LLM is forced to call exactly one tool.
   * - Must only use exactly one tool in the tools array
   * - chainRun cannot be enabled
   */
  forceTool?: boolean;
}

/**
 * Tool used to end a chain-run. The final_response is returned to the user as the run() output.
 */
const finishRunTool: ToolDefinition = {
  type: "function",
  function: {
    name: "finish_run",
    description: "Call this tool to complete your chain-run and give a FINAL response to the user",
    parameters: {
      type: "object",
      properties: {
        final_response: {
          type: "string",
          description: "The final answer that the user is given"
        }
      },
      required: ["final_response"],
      additionalProperties: false
    }
  },
  async execute(args: Record<string, any>): Promise<{ result: string }> {
    // The agent won't actually "execute" anything here, but we return the final response in "result".
    const params = typeof args === 'string' ? JSON.parse(args) : args;
    const final = params.final_response || "";
    return { result: final };
  }
};

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

    // If forceTool is true, ensure chainRun is false and exactly one tool is present
    if (config.forceTool) {
      if (config.chainRun) {
        throw new Error("Cannot enable chainRun when forceTool is true.");
      }
      if (this.tools.length !== 1) {
        throw new Error("forceTool requires exactly ONE tool in the tools array.");
      }
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

    // If chainRun is enabled, add the finish_run tool automatically
    if (this.config.chainRun) {
      const alreadyHasFinishRun = this.tools.some(
        t => t.function && t.function.name === "finish_run"
      );
      if (!alreadyHasFinishRun) {
        this.tools.push(finishRunTool);
      }
    }

    if (config.debug) {
      debugGuiServer.startServer();
      agentEventBus.registerAgent(this.agentId, this);
      this.agentRegistered = true;
    }
  }

  /**
   * Inserts dynamic variables into the system prompt string using
   * the {{variableName}} syntax. If no placeholder is found for a
   * variable, no additional text is appended.
   * @param basePrompt - The base system prompt template
   * @returns The system prompt with placeholders replaced
   */
  private applySystemPromptTemplate(basePrompt: string): string {
    let finalPrompt = basePrompt;

    if (this.config.dynamicVariables) {
      const keys = Object.keys(this.config.dynamicVariables);
      for (const key of keys) {
        const fn = this.config.dynamicVariables[key];
        try {
          const val = fn();
          // Replace all occurrences of {{key}} with the dynamic value
          const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
          finalPrompt = finalPrompt.replace(regex, val);
        } catch (err: any) {
          logger.error(err, `Error executing dynamic variable: ${key}`);
          // If there's an error retrieving the variable, we replace it with a placeholder
          const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
          finalPrompt = finalPrompt.replace(regex, `[Error retrieving dynamic variable: ${key}]`);
        }
      }
    }

    return finalPrompt;
  }

  /**
   * Builds the complete system prompt by combining:
   * 1. Base system prompt (with placeholders replaced by dynamic variables)
   * 2. Additional instructions for chain running if enabled
   * 3. Additional instructions for cognition or structured output
   * @param iteration - The current chain run iteration (if chainRun is enabled)
   * @returns The complete system prompt string
   */
  private buildSystemPrompt(iteration?: number): string {
    // First, apply our template placeholders
    let finalSystemPrompt = this.applySystemPromptTemplate(this.baseSystemPrompt);

    // If chainRun is enabled, add instructions
    if (this.config.chainRun) {
      const maxIters = this.config.maxChainIterations ?? 5;
      finalSystemPrompt += `\n\n## CHAIN RUNNING ENABLED\n`;
      finalSystemPrompt += `Chain run is enabled. This means you can run again and again for ${maxIters} iterations until completion. This allows you to execute a tool, wait for the result, and decide if you need to execute a different tool.\n`;
      finalSystemPrompt += `If you are content with your run, then you can end the chain-run by calling the finish_run tool. The information you put in the 'final_response' parameter is the output given to the user.\n`;

      // If we are about to hit the max iteration, add a big warning
      if (iteration && iteration === maxIters) {
        finalSystemPrompt += `\n# WARNING\n\n## YOU ARE ON YOUR LAST ITERATION. NO MATTER WHAT, THE SYSTEM WILL NOT ALLOW YOU TO CONTINUE. FINISH YOUR FINAL RESPONSE THIS TURN.\n`;
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
   * 2. Updates system prompt with dynamic variables (via template)
   * 3. Makes LLM API calls
   * 4. (Optionally) handles tool execution
   * 5. Processes structured output
   * 
   * Supports multiple iterations for tool usage, up to maxIterations, if auto-execution is enabled or if chainRun is true.
   * 
   * @param userInput - Optional new user input to process
   * @param options - Optional parameters including image URLs
   * @returns Promise resolving to AgentRunResult containing success status, output, and functionCalls (if any)
   */
  public async run(userInput?: string, options?: { images?: string[] }): Promise<AgentRunResult<TOutput>> {
    // If user provided new input at run time, add it
    if (userInput) {
      this.addUserMessage(userInput, options);
    }

    // If chainRun is enabled, we use maxChainIterations from config or fallback to 5
    const chainRunEnabled = this.config.chainRun === true;
    let maxIterations = chainRunEnabled ? (this.config.maxChainIterations ?? 5) : 5;
    const autoExec = this.config.autoExecuteTools !== false;

    // If forceTool is on, we override so there's only 1 iteration
    if (this.config.forceTool) {
      maxIterations = 1;
    }

    let iterationCount = 0;

    while (iterationCount < maxIterations) {
      iterationCount++;
      this.llmCallIteration++;
      logger.info({ iterationCount }, "FeatherAgent.run - LLM call iteration");
      this.logEntry(`--- LLM call iteration #${iterationCount} ---`);

      // Build system prompt with possible chain-run or cognition instructions
      const newSystemPrompt = this.buildSystemPrompt(iterationCount);
      // Ensure the first message is always the system message
      this.messages[0].content = newSystemPrompt;

      if (this.agentRegistered) {
        agentEventBus.updateSystemPrompt(this.getAgentId(), newSystemPrompt);
      }

      const toolDefs = this.tools.map(t => ({
        type: 'function' as const,
        function: {
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters
        }
      }));

      // If chainRun is on and we're on the last iteration, force the model to call finish_run
      let forcedToolChoice: ChatCompletionToolChoiceOption = (chainRunEnabled && iterationCount === maxIterations)
        ? { type: 'function', function: { name: 'finish_run' } }
        : 'auto';

      // If forceTool is on, forcibly choose the single tool
      if (this.config.forceTool && this.tools.length === 1) {
        forcedToolChoice = {
          type: 'function',
          function: { name: this.tools[0].function.name }
        };
      }

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
        tool_choice: forcedToolChoice,
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

      // If no function calls, handle chainRun or finalize
      if (functionCalls.length === 0) {
        if (!chainRunEnabled) {
          // Normal flow, just finalize
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
        } else {
          // chainRun is enabled, but no function calls:
          if (iterationCount === maxIterations) {
            // End forcibly
            const forcedOutput = content.trim();
            this.logEntry(`CHAIN RUN: Reached max iterations without finish_run. Force final output.\nFINAL OUTPUT: ${forcedOutput}`);
            return { success: true, output: forcedOutput as TOutput };
          }
          continue;
        }
      }

      // If function calls exist and auto-execution is disabled, return them immediately
      if (!autoExec) {
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

            // If it's the finish_run tool, we finalize with the final_response
            if (fc.functionName === 'finish_run') {
              const finalRes = (toolResult?.result || "").trim();

              this.logEntry(`CHAIN RUN: finish_run called, returning final response.\nFINAL OUTPUT: ${finalRes}`);
              return { _finishRunInvoked: true, result: finalRes };
            }

            // Format tool execution results for the agent
            return [
              '[ SYSTEM ]\n',
              `AGENT (YOU) EXECUTED THE TOOL ${fc.functionName}\n`,
              'PARAMETERS:\n',
              JSON.stringify(fc.functionArgs, null, 2),
              '\nRESULT:\n', 
              JSON.stringify(toolResult, null, 2)
            ].join('\n');
          } catch (err: any) {
            logger.error(err, `Error executing tool: ${fc.functionName}`);
            const errorRes = `Error in tool ${fc.functionName}: ${err.message}`;
            this.logEntry(errorRes);
            return errorRes;
          }
        })
      );

      // Check if finish_run was called
      const finishRunCall = results.find(r => (r as any)?._finishRunInvoked === true);
      if (finishRunCall && typeof finishRunCall === 'object') {
        const finalText = (finishRunCall as any).result || "";
        
        // Add the finish_run tool execution to message history
        const finishRunMessage = [
          '[ SYSTEM ]\n',
          'AGENT (YOU) EXECUTED THE TOOL finish_run\n',
          'PARAMETERS:\n',
          JSON.stringify({ final_response: finalText }, null, 2),
          '\nRESULT:\n',
          JSON.stringify({ result: finalText }, null, 2)
        ].join('\n');
        
        this.messages.push({
          role: 'user',
          content: finishRunMessage
        });
        
        // Update GUI with final message history
        if (this.agentRegistered) {
          agentEventBus.updateChatHistory(this.getAgentId(), this.messages);
        }
        
        this.logEntry(`USER (Tool Output - finish_run): ${finishRunMessage}`);
        this.logEntry(`FINAL OUTPUT (via finish_run): ${finalText}`);
        return { success: true, output: finalText as TOutput };
      }

      // For all other tool calls, add them to the conversation as user messages
      for (const r of results) {
        if (typeof r === 'string') {
          this.messages.push({
            role: 'user',
            content: r
          });
          this.logEntry(`USER (Tool Output): ${r}`);
        }
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