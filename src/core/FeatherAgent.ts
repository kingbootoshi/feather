import OpenAI from "openpipe/openai";
import { logger } from '../logger/logger';
import {
  Message,
  ToolDefinition,
  FunctionCall,
  AgentRunResult
} from '../types/types';
import { ChatCompletionMessageParam } from 'openai/resources';
import { agentEventBus } from '../gui/agentEventBus';
import { debugGuiServer } from '../gui/debugGuiServer';

/**
 * Configuration interface for setting up a FeatherAgent.
 */
interface FeatherAgentConfig {
  agentId?: string;
  systemPrompt: string;
  model?: string;
  cognition?: boolean;
  tools?: ToolDefinition[];
  structuredOutputSchema?: Record<string, any>;
  additionalParams?: Record<string, any>;
  debug?: boolean; // if true, start debug GUI
}

let agentCounter = 0;

/**
 * FeatherAgent is responsible for orchestrating conversation flows with an LLM,
 * optionally using tools, and optionally supporting a debug GUI.
 */
export class FeatherAgent {
  private messages: Message[] = [];
  private tools: ToolDefinition[] = [];
  private config: FeatherAgentConfig;
  private openai: OpenAI;
  private agentRegistered: boolean = false;
  private agentLog: string[] = []; // store raw logs for debugging
  private llmCallIteration: number = 0; // track the iteration count
  private agentId: string; // New field to store the ID

  constructor(config: FeatherAgentConfig) {
    this.config = config;
    this.tools = config.tools || [];

    // Generate unique ID for agent if not provided
    this.agentId = config.agentId || `agent-${++agentCounter}`;
    
    // Check for necessary API keys
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("No OpenRouter API key provided in config or environment!");
    }
    if (!process.env.OPENPIPE_API_KEY) {
      logger.warn("No OpenPipe API key provided in config or environment! The agent will run but no data will be captured.");
    }
    
    logger.info("Initializing FeatherAgent...");

    // Create an OpenAI instance with optional OpenPipe integration if key is present
    this.openai = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
      ...(process.env.OPENPIPE_API_KEY && {
        openpipe: {
          apiKey: process.env.OPENPIPE_API_KEY
        }
      })
    });

    // Add initial system prompt to messages.
    // If cognition is enabled, we instruct the LLM to produce <think>,<plan>,<speak> tags.
    if (config.cognition) {
      const instructions = `\n\n#OUTPUT FORMAT\n\nYou are capable of cognition. To think, plan, and speak before executing tools, YOU MUST output the following schema:\n<think>\n*your internal thoughts*\n</think>\n<plan>\n*your plan*\n</plan>\n<speak>\n*what you say to the user*\n</speak>`;
      this.messages.push({
        role: 'system',
        content: config.systemPrompt + instructions
      });
    } else {
      this.messages.push({ role: 'system', content: config.systemPrompt });
    }

    // If debug mode is true, start the debug GUI server and register the agent with the event bus
    if (config.debug) {
      debugGuiServer.startServer(); 
      agentEventBus.registerAgent(this.agentId, this);
      this.agentRegistered = true;
    }
  }

  /**
   * Adds a user (human) message to the conversation.
   * @param content The text of the user message.
   */
  public addUserMessage(content: string) {
    logger.debug({ content }, "FeatherAgent.addUserMessage");
    this.messages.push({ role: 'user', content });
    this.logEntry(`USER: ${content}`);
    if (this.agentRegistered) {
      agentEventBus.updateChatHistory(this.getAgentId(), this.messages);
    }
  }

  /**
   * Adds an assistant message to the conversation (LLM response).
   * @param content The text of the assistant message.
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
   * Returns a copy of the conversation messages.
   */
  public getMessages() {
    return [...this.messages];
  }

  /**
   * The main run method that interacts with the LLM.
   * Optionally takes userInput to append to conversation before proceeding.
   * Loops up to a maximum iteration to handle possible tool usage calls.
   */
  public async run(userInput?: string): Promise<AgentRunResult> {
    if (userInput) {
      this.addUserMessage(userInput);
    }

    // Update system prompt in debug GUI if registered
    if (this.agentRegistered) {
      agentEventBus.updateSystemPrompt(this.getAgentId(), this.config.systemPrompt);
    }

    let iterationCount = 0;
    const maxIterations = 5; // prevent infinite loops

    // Each iteration, call the LLM and see if a tool call is required
    while (iterationCount < maxIterations) {
      iterationCount++;
      this.llmCallIteration++;
      logger.info({ iterationCount }, "FeatherAgent.run - LLM call iteration");
      this.logEntry(`--- LLM call iteration #${iterationCount} ---`);

      // Build the tool definitions for the LLM call
      const toolDefs = this.tools.map(t => ({
        type: 'function' as const,
        function: {
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters
        }
      }));

      // Construct parameters for the chat completion request
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
        ...this.config.additionalParams
      };

      // Log the request for debugging
      logger.debug({ 
        event: 'llm_request',
        model: callParams.model,
        messages: callParams.messages,
        tools: callParams.tools,
        params: this.config.additionalParams
      }, "LLM API Request Data");
      this.logEntry(`LLM REQUEST:\n${JSON.stringify(callParams, null, 2)}`);

      // Store the LLM request in the event bus if agent is registered
      if (this.agentRegistered) {
        agentEventBus.storeLlmRequest(this.getAgentId(), {
          iteration: this.llmCallIteration,
          requestData: callParams
        });
      }

      let response;
      try {
        // Make the chat completion call using our openAI instance
        response = await this.openai.chat.completions.create(callParams);
        
        // Log the raw LLM response data
        logger.debug({ 
          event: 'llm_response',
          response_id: response.id,
          model: response.model,
          usage: response.usage,
          choices: response.choices,
          created: response.created
        }, "LLM API Response Data");
        this.logEntry(`LLM RESPONSE:\n${JSON.stringify(response, null, 2)}`);

        // Store the response in the agent event bus for debugging
        if (this.agentRegistered) {
          agentEventBus.storeLlmResponse(this.getAgentId(), this.llmCallIteration, {
            responseData: response
          });
        }

      } catch (err: any) {
        // Log the error and return a failed result
        logger.error(err, "Error from OpenRouter call");
        const errorMsg = err.message || "Unknown LLM error";
        this.logEntry(`ERROR: ${errorMsg}`);
        if (this.agentRegistered) {
          agentEventBus.updateAgentError(this.getAgentId(), errorMsg);
        }
        return { success: false, output: "", error: errorMsg };
      }

      // Check if the model gave us any valid choices
      if (!response.choices || response.choices.length === 0) {
        const noRespErr = "No response from model";
        this.logEntry(`ERROR: ${noRespErr}`);
        if (this.agentRegistered) {
          agentEventBus.updateAgentError(this.getAgentId(), noRespErr);
        }
        return { success: false, output: "", error: noRespErr };
      }

      // Take the first choice from the model
      const choice = response.choices[0];
      if (!choice.message) {
        const noMsgErr = "No message in model choice";
        this.logEntry(`ERROR: ${noMsgErr}`);
        if (this.agentRegistered) {
          agentEventBus.updateAgentError(this.getAgentId(), noMsgErr);
        }
        return { success: false, output: "", error: noMsgErr };
      }

      const content = choice.message.content || "";
      logger.debug({ content }, "LLM assistant message content");
      this.logEntry(`RAW LLM content:\n${content}\n`);

      // Add the content as an assistant message
      this.addAssistantMessage(content);

      let functionCalls: FunctionCall[] = [];
      let toolUsed = false;

      // If the model provided tool calls, store them for execution
      if (choice.message.tool_calls && Array.isArray(choice.message.tool_calls)) {
        functionCalls = choice.message.tool_calls.map(tc => ({
          functionName: tc.function.name,
          functionArgs: tc.function.arguments || {}
        }));
      }

      // If we have function calls from the model, attempt to execute them
      if (functionCalls.length > 0) {
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
              // Execute the tool and log the result
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

        // Add tool results as user messages so the LLM can see them
        for (const r of results) {
          this.messages.push({
            role: 'user',
            content: r
          });
          this.logEntry(`USER (Tool Output): ${r}`);
        }
        toolUsed = true;
        if (this.agentRegistered) {
          agentEventBus.updateChatHistory(this.getAgentId(), this.messages);
        }
      } else {
        // If no tool was used, this is our final output to the user
        let finalOutput = content.trim();

        // If cognition is enabled, we parse out the <speak> tags
        if (this.config.cognition) {
          const speakMatch = content.match(/<speak>([\s\S]*?)<\/speak>/);
          finalOutput = speakMatch ? speakMatch[1].trim() : finalOutput;
        }

        // If a structured output schema is provided, attempt to parse JSON
        if (this.config.structuredOutputSchema) {
          try {
            const parsed = JSON.parse(finalOutput);
            this.logEntry(`FINAL OUTPUT (parsed JSON): ${JSON.stringify(parsed, null, 2)}`);
            return { success: true, output: parsed };
          } catch {
            // fallback to plain text
          }
        }

        // Return the final string output
        this.logEntry(`FINAL OUTPUT: ${finalOutput}`);
        return { success: true, output: finalOutput };
      }

      // If we used a tool, the loop continues with the updated messages
      if (!toolUsed) {
        break;
      }
    }

    // If we reach maximum iterations without final output, return an error
    const maxIterErr = "Max iterations reached";
    logger.error(maxIterErr);
    this.logEntry(`ERROR: ${maxIterErr}`);
    if (this.agentRegistered) {
      agentEventBus.updateAgentError(this.getAgentId(), maxIterErr);
      agentEventBus.updateAgentLog(this.getAgentId(), this.agentLog);
    }
    return { success: false, output: "", error: maxIterErr };
  }

  /**
   * Returns the agent's unique ID.
   */
  private getAgentId(): string {
    return this.agentId;
  }

  /**
   * Appends an entry to the agent's internal log array for debugging.
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