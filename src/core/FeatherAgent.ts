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
 */
interface FeatherAgentConfig<TOutput = string | Record<string, any>> {
  agentId?: string;
  systemPrompt: string;
  model?: string;
  cognition?: boolean;
  tools?: ToolDefinition[];
  structuredOutputSchema?: Record<string, any>;
  additionalParams?: Record<string, any>;
  debug?: boolean; // if true, start debug GUI
}

/**
 * FeatherAgent is responsible for orchestrating conversation flows with an LLM,
 * optionally using tools, and optionally supporting a debug GUI.
 * TOutput is the type of the structured output if structuredOutputSchema is used.
 */
let agentCounter = 0;
export class FeatherAgent<TOutput = string | Record<string, any>> {
  private messages: Message[] = [];
  private tools: ToolDefinition[] = [];
  private config: FeatherAgentConfig<TOutput>;
  private openai: OpenAI;
  private agentRegistered: boolean = false;
  private agentLog: string[] = [];
  private llmCallIteration: number = 0;
  private agentId: string;

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

    let finalSystemPrompt = config.systemPrompt;

    // If cognition is enabled, instruct the LLM to produce <think>,<plan>,<speak> tags.
    if (config.cognition) {
      const instructions = `\n\n# OUTPUT FORMAT\n\nYou are capable of cognition. To think, plan, and speak before executing tools, YOU MUST output the following schema:\n<think>\n*your internal thoughts*\n</think>\n<plan>\n*your plan*\n</plan>\n<speak>\n*what you say to the user*\n</speak>`;
      finalSystemPrompt += instructions;
    } 
    // If structured output is enabled, format and append the schema instructions
    else if (config.structuredOutputSchema) {
      const schema = config.structuredOutputSchema.schema || config.structuredOutputSchema;
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

    this.messages.push({ role: 'system', content: finalSystemPrompt });

    if (config.debug) {
      debugGuiServer.startServer();
      agentEventBus.registerAgent(this.agentId, this);
      this.agentRegistered = true;
    }
  }

  /**
   * Adds a user (human) message to the conversation.
   * Optionally, an array of images can be included.
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
   * Adds an assistant message to the conversation (LLM response).
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
   * Returns an AgentRunResult with a TOutput-typed output if structured schema is used.
   */
  public async run(userInput?: string): Promise<AgentRunResult<TOutput>> {
    if (userInput) {
      this.addUserMessage(userInput);
    }

    if (this.agentRegistered) {
      agentEventBus.updateSystemPrompt(this.getAgentId(), this.config.systemPrompt);
    }

    let iterationCount = 0;
    const maxIterations = 5;

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
      let toolUsed = false;

      if (choice.message.tool_calls && Array.isArray(choice.message.tool_calls)) {
        functionCalls = choice.message.tool_calls.map(tc => ({
          functionName: tc.function.name,
          functionArgs: tc.function.arguments || {}
        }));
      }

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

      if (!toolUsed) {
        break;
      }
    }

    const maxIterErr = "Max iterations reached";
    logger.error(maxIterErr);
    this.logEntry(`ERROR: ${maxIterErr}`);
    if (this.agentRegistered) {
      agentEventBus.updateAgentError(this.getAgentId(), maxIterErr);
      agentEventBus.updateAgentLog(this.getAgentId(), this.agentLog);
    }
    return { success: false, output: "" as any, error: maxIterErr };
  }

  private getAgentId(): string {
    return this.agentId;
  }

  private logEntry(entry: string) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${entry}`;
    this.agentLog.push(line);
    if (this.agentRegistered) {
      agentEventBus.updateAgentLog(this.getAgentId(), this.agentLog);
    }
  }
}