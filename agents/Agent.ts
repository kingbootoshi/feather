import { BaseAgent } from './baseAgent';
import { loadAgentDefinition, loadAgentFromFile } from './agentsRegistry';
import { OpenAIClient } from '../models/clients/OpenAiClient';
import { AnthropicClient } from '../models/clients/AnthropicClient';
import { FireworkClient } from '../models/clients/FireworkClient';
import { ModelClient, Message, Tool, FunctionCall } from '../types/agentSystem';
import * as z from 'zod';
import { Logger } from '../utils/logger';

interface AgentOptions {
  agentName?: string;        // Provide an agentName to load from registry
  agentConfigPath?: string;  // Provide a direct path to a YAML config file
}

interface AgentDefinition {
  name: string;
  description?: string;
  client: string;
  model: string;
  system_prompt: string;
  main_goal?: string;
  personality?: string;
  dynamic_variables?: Record<string, string>;
  output_schema?: any;
  tools?: Tool[];
}

function jsonSchemaToZod(schema: any): z.ZodTypeAny {
  if (!schema || !schema.type) return z.any();

  switch (schema.type) {
    case 'object':
      const shape: { [key: string]: z.ZodTypeAny } = {};
      if (schema.properties) {
        Object.entries(schema.properties).forEach(([key, value]) => {
          let fieldSchema = jsonSchemaToZod(value as any);
          if ((value as any).description) {
            fieldSchema = fieldSchema.describe((value as any).description);
          }
          shape[key] = fieldSchema;
        });
      }
      let zodObj = z.object(shape);
      if (schema.required && Array.isArray(schema.required)) {
        // Required fields are already handled by object schema in Zod
      }
      if (schema.description) {
        zodObj = zodObj.describe(schema.description);
      }
      return zodObj;
    case 'string':
      let strSchema = z.string();
      if (schema.description) {
        strSchema = strSchema.describe(schema.description);
      }
      return strSchema;
    case 'number':
      let numSchema = z.number();
      if (schema.description) {
        numSchema = numSchema.describe(schema.description);
      }
      return numSchema;
    case 'boolean':
      let boolSchema = z.boolean();
      if (schema.description) {
        boolSchema = boolSchema.describe(schema.description);
      }
      return boolSchema;
    case 'array':
      let arrSchema = z.array(schema.items ? jsonSchemaToZod(schema.items) : z.any());
      if (schema.description) {
        arrSchema = arrSchema.describe(schema.description);
      }
      return arrSchema;
    default:
      return z.any();
  }
}

export class Agent {
  private agent: BaseAgent<any>;

  constructor(options: AgentOptions) {
    let agentDef: AgentDefinition;
    if (options.agentConfigPath) {
      // Load directly from config path
      agentDef = loadAgentFromFile(options.agentConfigPath) as AgentDefinition;
    } else if (options.agentName) {
      // Load from agent name
      agentDef = loadAgentDefinition(options.agentName) as AgentDefinition;
    } else {
      throw new Error("You must provide either agentName or agentConfigPath");
    }

    let modelClient: ModelClient;
    if (agentDef.client === 'openai') {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY not set');
      }
      modelClient = new OpenAIClient(process.env.OPENAI_API_KEY, agentDef.model);
    } else if (agentDef.client === 'anthropic') {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY not set');
      }
      modelClient = new AnthropicClient(process.env.ANTHROPIC_API_KEY, agentDef.model);
    } else if (agentDef.client === 'fireworks') {
      if (!process.env.FIREWORKS_API_KEY) {
        throw new Error('FIREWORKS_API_KEY not set');
      }
      modelClient = new FireworkClient(process.env.FIREWORKS_API_KEY, agentDef.model);
    } else {
      throw new Error(`Unsupported model client: ${agentDef.client}`);
    }

    let outputSchema: z.ZodTypeAny | null = null;
    if (agentDef.output_schema) {
      try {
        outputSchema = jsonSchemaToZod(agentDef.output_schema);
      } catch (error) {
        console.error('Error converting output schema:', error);
        throw new Error('Failed to convert output schema to Zod schema');
      }
    }

    this.agent = new BaseAgent(
      {
        name: agentDef.name,
        description: agentDef.description,
        systemPromptTemplate: agentDef.system_prompt,
        dynamicVariables: agentDef.dynamic_variables || {},
      },
      modelClient,
      outputSchema
    );

    if (agentDef.tools && agentDef.tools.length > 0) {
      Logger.debug('[Agent] Setting tools on BaseAgent:', agentDef.tools);
      this.agent.setTools(agentDef.tools);
    } else {
      Logger.debug('[Agent] No tools defined for this agent.');
    }
  }

  public async run(userMessage?: string, dynamicVars?: { [key: string]: string }): Promise<{success: boolean; output: any; error?: string; functionCalls?: FunctionCall[]}> {
    return this.agent.run(userMessage, dynamicVars);
  }

  public loadChatHistory(messages: Message[]): void {
    this.agent.loadChatHistory(messages);
  }

  public getLastAgentMessage(): Message | null {
    return this.agent.getLastAgentMessage();
  }

  public getChatHistory(limit?: number): Message[] {
    return this.agent.getChatHistory(limit);
  }

  public getFullChatHistory(): Message[] {
    return this.agent.getFullChatHistory();
  }

  public addUserMessage(content: string) {
    this.agent.addUserMessage(content);
  }

  public addAgentMessage(content: string) {
    this.agent.addAgentMessage(content);
  }
}
